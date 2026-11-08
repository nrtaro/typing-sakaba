// 画面：ふくびき（段階D）。酒場の一角の屋台で、看板娘がガラガラを回す。
// 玉が転がり出て、☆の色に光りながら浮かび、はじけて景品のカードが大きく出る。
// 絵は public/collection/fukubiki/（scripts/fukubiki-art.mjs で作る）。読めるまでは色だけの仮の絵で描く。
import { C } from '../palette';
import { LW } from '../screen';
import type { Game } from '../game';
import { button } from './common';
import { EXCHANGE_COST, PULL_PRICE, itemById, type Item, type Star } from '../../core/collection';
import { drawSticker, phaseOf } from '../stickerArt';
import { drawNameplate } from '../nameplate';
import { drawSparkles, shined } from '../shine';

/** 演出の区切り（秒）：回す → 玉が転がる → 浮かぶ → はじける → カード */
export const SPIN_END = 1.1;
export const ROLL_END = 1.55;
export const RISE_END = 1.95;
export const BURST_END = 2.2;
/** ここまで来たら演出はおしまい（キーで飛ばすとここまで進む） */
export const FUKUBIKI_ANIM = 2.45;

export const KIND_NAME: Record<Item['kind'], string> = { front: '二つ名（前の言葉）', back: '二つ名（後ろの言葉）', plate: 'ネームプレート', sound: '打鍵音', sticker: 'シール' };
/** 玉と☆の色（白・緑・青・金・虹） */
export const STAR_COLOR: Record<Star, string> = { 1: '#f2efe2', 2: '#7cd88a', 3: '#6eb4ff', 4: '#ffd04a', 5: '#ff8ad8' };
const RAINBOW = ['#ff6b6b', '#ffb84a', '#ffe66b', '#7ce08a', '#6bc8ff', '#b48aff'];
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);
/** カードの地の色が明るい☆（文字を濃くする） */
const LIGHT_CARD: Record<Star, boolean> = { 1: true, 2: false, 3: false, 4: false, 5: true };

export const fukubikiUrl = (name: string) => `/collection/fukubiki/${name}.webp`;
export const FUKUBIKI_ART = ['bg', 'drum-0', 'drum-1', 'drum-2', 'drum-3', 'girl-0', 'girl-1',
  ...[1, 2, 3, 4, 5].flatMap((s) => [`ball-${s}`, `card-${s}`])].map(fukubikiUrl);

/** 絵の置き場所（基準の 480×270 の座標）。背景の台・カウンターの位置に合わせる */
// ガラガラの台の底を、背景の木の台の上面（基準の y 172〜184）の中ほどに載せる
const DRUM = { x: 76, y: 85, w: 85, h: 95 };
const GIRL = { x: 150, y: 99, w: 82, h: 85 };
const COUNTER_Y = 184;
const CARD_CENTER = { x: 362, y: 108 };

const ease = (p: number) => 1 - (1 - Math.max(0, Math.min(1, p))) ** 3;

export function drawFukubiki(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const f = g.fukubiki;
  const c = g.collection;
  if (!f || !c) return;
  const art = (name: string) => g.stickerArt.get(fukubikiUrl(name));
  // 背景（画面の外側は暗い木の色で埋める）
  sc.PR(e.x0, e.y0, e.w, e.y1 - e.y0, '#1a0f0a');
  const bg = art('bg');
  if (bg) sc.blit(bg, 0, 0, bg.naturalWidth, bg.naturalHeight, 0, 0, LW, 270);
  else { sc.PR(0, 0, LW, COUNTER_Y, '#3a2416'); sc.PR(0, COUNTER_Y, LW, 270 - COUNTER_Y, '#5a3a1c'); }
  const last = f.last;
  const a = f.anim;
  const pulling = !!last && a < FUKUBIKI_ANIM;
  const star = (last?.star ?? 1) as Star;
  // 看板娘とガラガラ（回している間はコマを切り替える）
  const spinning = pulling && a < SPIN_END;
  const girlFrame = spinning ? Math.floor(a * 7) % 2 : 0;
  const drumFrame = spinning ? Math.floor(a * 14) % 4 : 0;
  const girl = art(`girl-${girlFrame}`);
  if (girl) sc.blit(girl, 0, 0, girl.naturalWidth, girl.naturalHeight, GIRL.x, GIRL.y, GIRL.w, GIRL.h);
  const drum = art(`drum-${drumFrame}`);
  if (drum) sc.blit(drum, 0, 0, drum.naturalWidth, drum.naturalHeight, DRUM.x, DRUM.y, DRUM.w, DRUM.h);
  else sc.panel(DRUM.x + 10, DRUM.y, DRUM.w - 20, DRUM.h - 14, '#c0392b', '#e8b85a');
  if (spinning && drum) {
    // 回っている勢いの小さな線
    for (let i = 0; i < 3; i++) {
      const ang = a * 18 + i * 2.1;
      sc.PR(DRUM.x + DRUM.w / 2 + Math.cos(ang) * 30, DRUM.y + 32 + Math.sin(ang) * 30, 3, 1, '#fff3c4', 0.6);
    }
  }
  // 玉：転がって、浮かんで、はじける
  if (last && pulling && a >= SPIN_END * 0.9 && a < BURST_END) drawBall(g, star, a);
  if (last && pulling && a >= RISE_END - 0.1 && a < BURST_END + 0.15) drawBurst(g, star, a);
  // ☆4・☆5 は景品が出たあとも光を残す
  if (last && a >= BURST_END && !f.exchange) drawAura(g, star, a);
  // 右：お金の札
  drawPurse(g);
  if (f.exchange) drawExchange(g);
  else if (last && a >= BURST_END) drawCards(g, a);
  else if (!last) drawWelcome(g);
  // 案内の行
  const msg = f.message || (f.exchange ? '↑↓でえらぶ　←→で8つ送る　Enterで交換' : last && a < FUKUBIKI_ANIM ? 'キーを押すと演出を飛ばせます' : '');
  if (msg) {
    const w = Math.min(LW - 16, sc.W(msg, 8) + 20);
    sc.panel(LW / 2 - w / 2, 199, w, 14, 'rgba(26,15,10,0.9)', f.message ? '#d9534f' : '#8a6232');
    sc.T(msg, LW / 2, 201.5, sc.fitSize(msg, 8, w - 10, 6), f.message ? '#ffb6a4' : C.cream2, 'center');
  }
  // 下：札（カウンターの前板の上）
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    const items = g.menuItems();
    if (f.exchange) { button(g, items[0], 26, 230, 130, 30, 'plain', 'Esc', '◀'); return; }
    button(g, items[0], 165, 224, 150, 38, 'primary', 'Enter');
    button(g, items[1], 327, 228, 100, 30, 'plain');
    button(g, items[2], 40, 228, 110, 30, 'plain', 'Esc', '◀');
  });
}

/** 玉の位置：ガラガラの口から落ちてカウンターを転がり、カードの場所へ浮かぶ */
function drawBall(g: Game, star: Star, a: number) {
  const sc = g.sc;
  let x: number, y: number, size = 11;
  const startX = DRUM.x + DRUM.w * 0.5;
  const startY = DRUM.y + DRUM.h * 0.72;
  if (a < ROLL_END) {
    const p = Math.max(0, (a - SPIN_END * 0.9) / (ROLL_END - SPIN_END * 0.9));
    x = startX + p * 70;
    // 落ちて2回はずむ
    const bounce = Math.abs(Math.cos(p * Math.PI * 2.5)) * (1 - p) * 12;
    y = COUNTER_Y - 6 - bounce + (1 - Math.min(1, p * 3)) * (startY - COUNTER_Y + 6);
  } else {
    const p = ease((a - ROLL_END) / (RISE_END - ROLL_END));
    x = startX + 70 + (CARD_CENTER.x - startX - 70) * p;
    y = COUNTER_Y - 6 + (CARD_CENTER.y - COUNTER_Y + 6) * p - Math.sin(p * Math.PI) * 20;
    size = 11 + p * 17;
    // 浮かびながら☆の色に光る（☆が高いほど強く）
    sc.radialGlow(x, y, size * (1.2 + star * 0.25), STAR_COLOR[star], (0.2 + star * 0.08) * p);
  }
  if (a >= RISE_END) {
    // はじける直前はふるえる
    const k = (a - RISE_END) / (BURST_END - RISE_END);
    x += Math.sin(a * 80) * 1.5 * k;
    size *= 1 + k * 0.15;
  }
  const img = g.stickerArt.get(fukubikiUrl(`ball-${star}`));
  if (img) sc.blit(img, 0, 0, img.naturalWidth, img.naturalHeight, x - size / 2, y - size / 2, size, size);
  else sc.radialGlow(x, y, size * 0.6, STAR_COLOR[star], 1);
}

/** はじける光：白い閃光と、飛び散る光の粒。☆が高いほど大きく */
function drawBurst(g: Game, star: Star, a: number) {
  const sc = g.sc;
  const p = Math.max(0, Math.min(1, (a - (RISE_END - 0.1)) / (BURST_END + 0.15 - RISE_END + 0.1)));
  const peak = Math.sin(p * Math.PI);
  const { x, y } = CARD_CENTER;
  sc.radialGlow(x, y, 30 + p * (40 + star * 18), '#ffffff', 0.85 * peak);
  sc.radialGlow(x, y, 20 + p * (30 + star * 12), STAR_COLOR[star], 0.6 * peak);
  const n = 6 + star * 3;
  for (let i = 0; i < n; i++) {
    const ang = (i / n) * Math.PI * 2 + star;
    const r = p * (40 + star * 14);
    const col = star === 5 ? RAINBOW[i % RAINBOW.length] : STAR_COLOR[star];
    sc.PR(x + Math.cos(ang) * r - 1, y + Math.sin(ang) * r - 1, 2, 2, col, 1 - p);
  }
}

/** ☆4 は金の光の柱、☆5 は虹の光（景品のカードの後ろ） */
function drawAura(g: Game, star: Star, a: number) {
  if (star < 4) return;
  const sc = g.sc;
  const { x, y } = CARD_CENTER;
  const intro = ease((a - BURST_END) / 0.4);
  if (star === 4) {
    const pulse = 0.75 + 0.25 * Math.sin(g.t * 3);
    for (let i = 0; i < 6; i++) {
      const w = 70 - i * 10;
      sc.PR(x - w / 2, 0, w, COUNTER_Y, '#ffd86b', 0.07 * intro * pulse);
    }
    sc.radialGlow(x, y, 110, '#ffd86b', 0.35 * intro * pulse);
    return;
  }
  // 虹：色の違う光が重なり、ゆっくり回る
  for (let i = 0; i < RAINBOW.length; i++) {
    const ang = g.t * 0.6 + (i / RAINBOW.length) * Math.PI * 2;
    sc.radialGlow(x + Math.cos(ang) * 34, y + Math.sin(ang) * 22, 105, RAINBOW[i], 0.32 * intro);
  }
  for (let i = 0; i < 7; i++) {
    const w = 80 - i * 10;
    sc.PR(x - w / 2, 0, w, COUNTER_Y, RAINBOW[(i + Math.floor(g.t * 4)) % RAINBOW.length], 0.08 * intro);
  }
}

/** 右上：貯金箱・おまけ札・値段 */
function drawPurse(g: Game) {
  const sc = g.sc;
  const c = g.collection!;
  const x = 330;
  const y = 6;
  const w = 144;
  sc.PR(x + 2, y + 2, w, 30, '#0c0604', 0.5);
  sc.panel(x, y, w, 30, 'rgba(36,23,14,0.94)', '#a8743f');
  sc.T('貯金箱', x + 8, y + 4, 7, C.cream2);
  sc.TB(`${c.coins.toLocaleString()}円`, x + 8, y + 13, 11, C.gold3, 'left', C.ink);
  sc.T('おまけ札', x + 92, y + 4, 7, C.cream2);
  sc.TB(`${c.tickets}枚`, x + 92, y + 13, 11, '#a9f0e4', 'left', C.ink);
  const price = c.freeUsed ? `1回 ${PULL_PRICE.toLocaleString()}円` : '最初の1回は無料！';
  sc.T(price, x + w - 6, y + 33, 7, c.freeUsed ? C.cream : '#ffb8d0', 'right');
}

function drawWelcome(g: Game) {
  const sc = g.sc;
  const x = 262;
  const y = 70;
  const w = 200;
  sc.panel(x, y, w, 64, 'rgba(26,15,10,0.82)', '#8a6232');
  sc.TB('いらっしゃい！ふくびきだよ', x + w / 2, y + 8, 11, C.gold3, 'center', C.ink);
  sc.T('売上を貯めて、ガラガラを回そう', x + w / 2, y + 26, 8, C.cream, 'center');
  sc.T('かぶった飾りは「おまけ札」になり、', x + w / 2, y + 39, 7, C.cream2, 'center');
  sc.T('好きな飾りと交換できます', x + w / 2, y + 49, 7, C.cream2, 'center');
}

/** 景品のカード（大きく）。二つ名は前と後ろの2枚を並べる */
function drawCards(g: Game, a: number) {
  const r = g.fukubiki!.last!;
  const n = r.items.length;
  const intro = ease((a - BURST_END) / 0.25);
  r.items.forEach((got, k) => {
    const it = itemById(got.id);
    if (!it) return;
    const w = (n === 2 ? 104 : 132) * (0.6 + 0.4 * intro);
    const h = w * (4 / 3);
    const cx = n === 2 ? CARD_CENTER.x + (k === 0 ? -57 : 57) : CARD_CENTER.x;
    drawCard(g, it, got, cx - w / 2, CARD_CENTER.y - h / 2 + 4, w, h, intro);
  });
}

function drawCard(g: Game, it: Item, got: { isNew: boolean; tickets: number }, x: number, y: number, w: number, h: number, alpha: number) {
  const sc = g.sc;
  const star = it.star;
  const frame = g.stickerArt.get(fukubikiUrl(`card-${star}`));
  if (frame) {
    const img = shined(frame, star, g.t, phaseOf(it.id));
    sc.blit(img, 0, 0, frame.naturalWidth, frame.naturalHeight, x, y, w, h, false, alpha);
  } else sc.panel(x, y, w, h, 'rgba(58,36,22,0.98)', STAR_COLOR[star], alpha);
  if (alpha < 0.95) return;
  const ink = LIGHT_CARD[star] ? '#3a2414' : '#f2efe2';
  const sub = LIGHT_CARD[star] ? '#6b4a2a' : '#d9c2a0';
  const mx = x + w / 2;
  sc.TB(stars(star), mx, y + h * 0.15, Math.max(7, w * 0.075), STAR_COLOR[star], 'center', C.ink);
  sc.T(KIND_NAME[it.kind], mx, y + h * 0.235, Math.max(6, w * 0.055), sub, 'center');
  const vy = y + h * 0.31;
  const vh = h * 0.36;
  if (it.kind === 'sticker') drawSticker(sc, g.stickerArt, it, mx - vh / 2, vy, vh, g.t, true);
  else if (it.kind === 'plate') drawNameplate(sc, x + w * 0.12, vy + vh * 0.32, w * 0.76, vh * 0.36, g.settings.rankingName || '店主', { titleFront: null, titleLink: null, titleBack: null, plate: it.id }, Math.max(7, w * 0.07));
  else sc.TB(it.name, mx, vy + vh * 0.32, sc.fitSize(it.name, w * 0.14, w * 0.8, 8), ink, 'center', LIGHT_CARD[star] ? '#fff6e0' : C.ink);
  if (it.kind === 'sticker' || it.kind === 'plate' || it.kind === 'sound') {
    sc.T(it.name, mx, y + h * 0.7, sc.fitSize(it.name, Math.max(7, w * 0.07), w * 0.78, 5.5), ink, 'center');
  }
  if (it.kind === 'sound') sc.T('スペースで音を試す', mx, y + h * 0.58, Math.max(6, w * 0.055), LIGHT_CARD[star] ? '#2a6a5a' : '#a9f0e4', 'center');
  const tag = got.isNew ? 'NEW!' : `かぶり → おまけ札 +${got.tickets}`;
  sc.TB(tag, mx, y + h * 0.765, got.isNew ? Math.max(9, w * 0.09) : Math.max(7, w * 0.06), got.isNew ? '#ff8a7a' : '#a9f0e4', 'center', C.ink);
  drawSparkles(sc, x, y, w, h, star, g.t, phaseOf(it.id));
}

/** 交換の一覧：まだ持っていないふくびきの飾り（☆の高い順） */
function drawExchange(g: Game) {
  const sc = g.sc;
  const ex = g.fukubiki!.exchange!;
  const list = g.exchangeList();
  const c = g.collection!;
  const x = 222;
  const w = 252;
  const y0 = 42;
  sc.panel(x, y0, w, 150, 'rgba(26,15,10,0.94)', '#a8743f');
  sc.T('おまけ札で交換（必要な枚数）', x + 10, y0 + 5, 8, C.gold3);
  sc.T(`☆1〜5：${[1, 2, 3, 4, 5].map((s) => EXCHANGE_COST[s as Star]).join('・')}枚`, x + w - 8, y0 + 5, 6.5, C.cream2, 'right');
  if (!list.length) { sc.T('ぜんぶそろっています！', x + w / 2, y0 + 70, 10, C.gold3, 'center'); return; }
  const rows = 9;
  const top = Math.max(0, Math.min(list.length - rows, ex.sel - Math.floor(rows / 2)));
  for (let k = 0; k < rows; k++) {
    const it = list[top + k];
    if (!it) break;
    const y = y0 + 18 + k * 14;
    const sel = top + k === ex.sel;
    const cost = EXCHANGE_COST[it.star];
    if (sel) sc.PR(x + 4, y - 1, w - 8, 13, '#4a2c1c');
    if (sel) sc.T('▶', x + 6, y + 1.5, 7, C.gold3);
    sc.T(stars(it.star), x + 14, y + 1.5, 7, STAR_COLOR[it.star]);
    sc.T(SHORT_KIND[it.kind], x + 64, y + 1.5, 7, C.cream2);
    sc.T(it.name, x + 104, y + 0.5, sc.fitSize(it.name, 8.5, 108, 6), '#f2efe2');
    sc.T(`${cost}枚`, x + w - 8, y + 1.5, 7.5, c.tickets >= cost ? '#a9f0e4' : '#a89a90', 'right');
  }
  if (top > 0) sc.T('▲', x + w - 10, y0 + 12, 6, C.cream2);
  if (top + rows < list.length) sc.T('▼', x + w - 10, y0 + 140, 6, C.cream2);
}

const SHORT_KIND: Record<Item['kind'], string> = { front: '前の言葉', back: '後ろの言葉', plate: 'プレート', sound: '打鍵音', sticker: 'シール' };
