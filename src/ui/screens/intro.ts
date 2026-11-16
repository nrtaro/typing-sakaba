// 画面：はじめて開いた人だけに出す、タイトルの前の短い案内（「あそびかた」からも見直せる）。
// 看板娘が「この店はタイピングで切り盛りする」ことを伝え、3つの言葉を実際に打ってもらう。
// 説明を読ませるより先に、打つと店が動くことを体験してもらう（30秒ほど。Esc でいつでも飛ばせる）。
// 最後の言葉は「はじめる」。打つとそのまま営業えらびへ進み、はじめての人には「れんしゅう」を勧める。
import { C } from '../palette';
import { LW, type Screen } from '../screen';
import { RomajiMatcher } from '../../core/romaji';
import { ICON_INDEX } from '../amber/layout';
import { ICON, PORTRAIT, guestSprite } from '../sprites';
import type { Game, Mode } from '../game';
import type { MenuItem } from './shared';

export interface IntroState {
  step: number;
  /** 今の段に入った時刻 */
  at: number;
  /** 言葉を打ち切った時刻（喜ぶ演出のあと、次の段へ進む） */
  doneAt: number | null;
  /** 違うキーを押した時刻／Enter を押した時刻（どちらも、次に押すキーを強く見せる） */
  missAt: number;
  nudgeAt: number;
  /** 今の段で Enter を押した回数（何度も押す人には「Esc で飛ばせる」を光らせる） */
  enters: number;
  /** 飛ばしたときに戻る画面（タイトルか、あそびかた） */
  from: Mode;
}

interface IntroStep {
  /** 看板娘のひとこと（1行目は大きく） */
  head: string;
  lines: string[];
  /** 打ってもらう言葉 */
  text: string;
  kana: string;
  /** 打つ札の上に出す小さな見出し */
  label: string;
}

export const INTRO_STEPS: IntroStep[] = [
  {
    head: 'いらっしゃいませ！',
    lines: ['ここは、タイピングで切り盛りする酒場です。', 'マウスは使いません。画面の言葉を、', 'キーボードで打って選びます。まずはお返事を！'],
    text: 'はい', kana: 'はい', label: '打ってみよう',
  },
  {
    head: 'お客さんが来ました！',
    lines: ['お客さんの頭の上に、注文の札が出ます。', '料理の名前を最後まで打つと、料理を出せます。'],
    text: 'エール', kana: 'えーる', label: '注文',
  },
  {
    head: 'その調子！',
    lines: ['メニューも、同じように打って選びます。', 'さあ、お店を始めましょう。'],
    text: 'はじめる', kana: 'はじめる', label: 'メニュー',
  },
];

/** 言葉を打ち切ってから、次の段へ進むまでの秒数 */
export const INTRO_CHEER = 0.9;
/** 違うキー・クリック・Enter のあと、案内を強く見せる秒数 */
const NUDGE = 1.6;
/** この回数 Enter を押されたら、「Esc で飛ばせる」を光らせる */
export const ENTERS_TO_SKIP_HINT = 3;
/** 2段目のお客さん（座った姿の絵の番号） */
const GUEST_LOOK = 2;

export function startIntro(g: Game, from: Mode = 'title') {
  g.intro = { step: 0, at: g.t, doneAt: null, missAt: -10, nudgeAt: -10, enters: 0, from };
  g.mode = 'intro';
  g.menu.reset();
}

/** 今打てる言葉（喜んでいる間は打てない） */
export function introItems(g: Game): MenuItem[] {
  const s = g.intro;
  if (!s || s.doneAt !== null) return [];
  const step = INTRO_STEPS[s.step];
  return [{ text: step.text, kana: step.kana, act: () => onIntroWord(g) }];
}

/** Enter を押した：最後の段（メニュー）では選べる。ほかの段では、打つキーを強く見せる */
export function introEnter(g: Game) {
  const s = g.intro;
  if (!s || s.doneAt !== null) return;
  if (s.step === INTRO_STEPS.length - 1) {
    g.sound.select();
    onIntroWord(g);
    g.menu.reset();
    return;
  }
  s.nudgeAt = g.t;
  s.enters++;
  g.sound.key(1);
}

function onIntroWord(g: Game) {
  const s = g.intro!;
  s.doneAt = g.t;
  // 2段目は注文を出したので、料理を出す音。最後は開店の音（ほかはメニューの処理が選んだ音を鳴らす）
  if (s.step === 1) g.sound.serve();
  if (s.step === INTRO_STEPS.length - 1) g.sound.count(0);
}

/** 1コマごと：喜ぶ演出のあと、次の段へ。最後の段のあとは営業えらびへ */
export function introStep(g: Game) {
  const s = g.intro;
  if (!s || s.doneAt === null || g.t - s.doneAt < INTRO_CHEER) return;
  if (s.step >= INTRO_STEPS.length - 1) { finishIntro(g, true); return; }
  s.step++;
  s.at = g.t;
  s.doneAt = null;
  s.enters = 0;
  // 前の段の「ちがうキー」などの一言は持ち越さない
  s.missAt = -10;
  s.nudgeAt = -10;
  g.clickHintAt = -10;
  g.menu.reset();
}

/** 案内を終える。最後まで打ったら営業えらびへ、Esc で飛ばしたら元の画面へ。次からは出さない */
export function finishIntro(g: Game, completed = false) {
  const from = g.intro?.from ?? 'title';
  g.intro = null;
  g.mode = completed ? 'modeSelect' : from;
  g.menu.reset();
  if (!g.settings.introDone) {
    g.settings.introDone = true;
    g.store.saveSettings(g.settings);
  }
}

/** 次に押すキー（大文字） */
function nextKey(g: Game): string {
  const s = g.intro!;
  const live = g.menu.active[0];
  const m = live?.matcher ?? new RomajiMatcher(INTRO_STEPS[s.step].kana);
  return (m.remaining[0] ?? '').toUpperCase();
}

function keycap(sc: Screen, ch: string, x: number, y: number, size: number, hot: number) {
  const w = size * 1.5;
  sc.PR(x + 1, y + 2, w, w, '#0c0604', 0.5);
  if (hot > 0) sc.glow(x, y, w, w, C.gold3, hot);
  sc.panel(x, y, w, w, '#f6e2b8', '#8a6232');
  sc.PR(x + 2, y + w - 3, w - 4, 1.5, '#d9bb84');
  sc.TB(ch, x + w / 2, y + w * 0.16, size, '#3a2414', 'center', '#f6e2b8');
}

/** 2段目のお客さん：札の下に座っている。料理を出したら食べる姿になる */
function drawGuest(g: Game, cx: number, footY: number, eating: boolean, a: number) {
  const sc = g.sc;
  sc.PR(cx - 12, footY - 1.5, 24, 3, '#1a0c10', 0.3 * a);
  const art = g.art;
  if (art) {
    const states = art.sheet('guests-seated').asset.animations?.[GUEST_LOOK]?.states;
    if (states) {
      art.drawFrame(sc, 'guests-seated', states[eating ? 'eat' : 'smile'], cx, footY, art.scaleFor('guests-seated', states.smile, 40));
      return;
    }
  }
  sc.spr(guestSprite(GUEST_LOOK, 1), cx - 16, footY - 48, 2, a);
}

export function drawIntro(g: Game) {
  const s = g.intro;
  if (!s) return;
  const sc = g.sc;
  const step = INTRO_STEPS[s.step];
  const age = g.t - s.at;
  const appear = Math.min(1, age / 0.25);
  const cheer = s.doneAt !== null ? (g.t - s.doneAt) / INTRO_CHEER : -1;
  const hotSince = Math.max(s.missAt, s.nudgeAt, g.clickHintAt);
  const hot = Math.max(0, 1 - (g.t - hotSince) / NUDGE);
  const key = nextKey(g);
  const last = s.step === INTRO_STEPS.length - 1;

  // 縦長・横長のどちらの画面でも、店の絵の範囲（基準の 480x270）に収めて描く
  // 上：何段目か と、飛ばし方（Enter を何度も押す人には強く光らせる）
  INTRO_STEPS.forEach((_, i) => sc.PR(LW / 2 - 22 + i * 16, 10, 12, 3, i < s.step || (i === s.step && cheer >= 0) ? C.gold3 : i === s.step ? C.gold2 : '#5a4030'));
  if (s.enters >= ENTERS_TO_SKIP_HINT) sc.glow(400, 4, 66, 15, C.gold3, 0.5 + 0.4 * Math.sin(g.t * 8));
  sc.keycap('Esc', 404, 6, 7);
  sc.T('とばす', 436, 7, 8, s.enters >= ENTERS_TO_SKIP_HINT ? C.gold3 : C.cream2, 'left');

  // 看板娘と吹き出し
  const px = 26;
  const py = 30;
  sc.PR(px + 2, py + 3, 62, 62, '#0c0604', 0.5);
  sc.panel(px, py, 62, 62, '#3a2414', '#c99a52');
  // 頭から肩までを枠いっぱいに（顔だけを切り抜く drawHead は小さな顔用で、大きく描くと髪やあごが切れる）
  if (g.art) sc.clip(px + 2, py + 2, 58, 58, () => g.art!.drawBust(sc, 'family-daughter', 0, px + 2, py + 3, 58, appear));
  else sc.spr(PORTRAIT.daughter, px + 15, py + 14, 3, appear);
  sc.T('看板娘', px + 31, py + 66, 8, C.cream2, 'center');
  const bx = 100;
  const bw = 354;
  const bh = 26 + step.lines.length * 13;
  sc.PR(bx + 2, py + 3, bw, bh, '#0c0604', 0.5);
  sc.panel(bx, py, bw, bh, '#fff3d6', C.gold2, appear);
  for (let r = 0; r < 6; r++) sc.PR(bx - 6 + r, py + 22 - (5 - r), 1, (5 - r) * 2 + 1, C.gold2, appear);
  sc.TB(step.head, bx + 12, py + 5, 13, '#a8363f', 'left', '#fff3d6', appear);
  step.lines.forEach((t, i) => sc.T(t, bx + 12, py + 24 + i * 13, 9.5, '#3a2414', 'left', appear));

  // 打つ札。2段目はお客さんの頭の上の注文の札、3段目はメニューの札の形
  const live = g.menu.active.find((l) => l.target.id === step.kana);
  const m = live?.matcher ?? new RomajiMatcher(step.kana);
  const cw = Math.max(170, sc.W(step.text, 22) + 70);
  const cx = LW / 2 - cw / 2 + 20;
  const ch = 58;
  const cy = (s.step === 1 ? 112 : 128) - (cheer >= 0 ? Math.sin(Math.min(1, cheer * 3) * Math.PI) * 5 : 0);
  const shake = g.t - s.missAt < 0.3 ? Math.sin((g.t - s.missAt) * 70) * 2.5 : 0;
  sc.T(step.label, cx + 6, cy - 12, 9, C.gold3, 'left', appear);
  if (s.step === 1) {
    // 札からお客さんの頭へ、吹き出しのしっぽ
    const tx0 = cx + cw / 2;
    for (let r = 0; r < 5; r++) sc.PR(tx0 - (5 - r), cy + ch + r, (5 - r) * 2 + 1, 1, C.wood4, appear);
    drawGuest(g, tx0, cy + ch + 46, cheer >= 0, appear);
  }
  sc.PR(cx + shake + 2, cy + 4, cw, ch, '#0c0604', 0.55);
  if (live || cheer >= 0) sc.glow(cx + shake, cy, cw, ch, cheer >= 0 ? C.w : C.gold3);
  const fill = s.step === 1 ? 'rgba(42,27,38,0.96)' : last ? (live ? '#ffe9b4' : '#ebc47e') : '#4a2c1c';
  sc.panel(cx + shake, cy, cw, ch, fill, cheer >= 0 ? C.gold3 : live ? C.gold : last ? '#b9883f' : C.wood4, appear);
  const iconW = s.step === 1 ? 28 : 0;
  if (s.step === 1) {
    if (g.art) g.art.drawIcon(sc, 'icons-dishes', ICON_INDEX.ale, cx + shake + 10, cy + 12, 26, appear);
    else sc.spr(ICON.ale, cx + shake + 12, cy + 14, 2, appear);
  }
  const tx = cx + shake + iconW + (cw - iconW) / 2;
  sc.TB(step.text, tx, cy + 6, 22, last ? '#3a2414' : C.w, 'center', last ? '#ebc47e' : C.ink, appear);
  sc.roma(m.typed, m.remaining, tx, cy + 36, 14, live ? 'active' : 'idle', appear, last);
  if (last && !live && cheer < 0) sc.keycap('Enter', cx + cw - 40, cy - 8, 7);
  // 打った分だけ伸びる帯
  const total = m.typed.length + m.remaining.length;
  if (total) sc.PR(cx + shake + 4, cy + ch - 4, (cw - 8) * (m.typed.length / total), 2, C.teal3);

  // 次に押すキー：札の右で、押すように弾む。違うキー・クリック・Enter のあとは強く光る
  if (cheer < 0 && key) {
    const bob = Math.abs(Math.sin(g.t * 5)) * 2;
    keycap(sc, key, cx + cw + 14, cy + 12 - bob, 16, 0.35 + hot * 0.65);
    sc.T('このキー', cx + cw + 26, cy + 46, 8, C.cream, 'center');
  }

  // 喜ぶ演出：2段目はお客さんが喜んで売上が入る、ほかは「OK！」「開店！」
  if (cheer >= 0) {
    const k = Math.min(1, cheer);
    const a = Math.min(1, (1 - k) * 4);
    const text = s.step === 1 ? '+80円  ごちそうさま！' : last ? '開店！' : 'OK！';
    sc.TB(text, cx + cw / 2, cy - 30 - k * 14, 16, s.step === 1 ? C.gold : C.gold3, 'center', C.ink, a);
    for (let n = 0; n < 12; n++) {
      const ang = n * 0.52 + 0.3;
      const r = 20 + k * 60;
      sc.PR(cx + cw / 2 + Math.cos(ang) * r * 1.6, cy + ch / 2 + Math.sin(ang) * r * 0.7, 2, 2, n % 2 ? C.gold3 : C.w, a);
    }
  }

  // 下：困ったときのひとこと（違うキー／クリック／Enter のとき、何を押せばよいかを言葉でも出す）
  const keyName = key === '-' ? '-（ー）' : key;
  let tip = '';
  let tipCol: string = C.cream2;
  if (g.t - g.clickHintAt < NUDGE) { tip = `クリックではなく、キーボードの「${keyName}」を押してね`; tipCol = '#ffd98a'; }
  else if (g.t - s.missAt < NUDGE) { tip = `ちがうキーです。次は「${keyName}」`; tipCol = '#ff9a8a'; }
  else if (g.t - s.nudgeAt < NUDGE) { tip = `ここでは文字を打ってね。次は「${keyName}」`; tipCol = '#ffd98a'; }
  else if (key === '-') tip = '「ー」（のばす音）は、「-」キーで打ちます（0 の右どなり）';
  else if (s.step === 0) tip = '文字が出ないときは、日本語入力をオフ（半角英数）にしてください';
  if (tip && cheer < 0) {
    const tw = sc.W(tip, 10) + 24;
    const ty = 238;
    sc.panel(LW / 2 - tw / 2, ty, tw, 20, 'rgba(36,23,14,0.95)', tipCol === C.cream2 ? '#6b4422' : tipCol);
    sc.T(tip, LW / 2, ty + 4, 10, tipCol, 'center');
  }
}
