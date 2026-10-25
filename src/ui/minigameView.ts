import { procurementReward, rewardKeys } from '../core/procurementRewards';
import { C, TRIP_COLOR, mix, type Color } from './palette';
import { Screen, LW } from './screen';
import { CRATE, DEER, FAM, ICON, MERCHANT, PORTRAIT, RABBIT } from './sprites';
import { pen, SKY } from './room';
import {
  FISHING, FishingGame, GatheringGame, HuntingGame, TradingGame, GATHER_SLOTS,
  type Minigame, type MinigameEvent, type Prey, type Sprout,
} from '../core/minigames';
import { RomajiMatcher } from '../core/romaji';
import { INGREDIENT_NAME, TRIPS } from '../core/shopConfig';
import type { Shop } from '../core/shop';
import type { Art } from './amber/art';
import { deerLabelBox } from './huntLayout';
import { animLength, frameAt } from './amber/manifest';
import { AMBER, ICON_INDEX } from './amber/layout';

type G = CanvasRenderingContext2D;
type Ext = Screen['ext'];
interface Pop { x: number; y: number; t: number; text: string; col: Color }

const OLD_SLOT_POS = Array.from({ length: GATHER_SLOTS }, (_, i) => ({ x: 160 + (i % 3) * 112, y: i < 3 ? 130 : 206 }));
interface Fx { anim: string; x: number; y: number; h: number; start: number }

/** 狩り：獲物の画面上の位置（足元） */
function preyPos(p: Prey) {
  return { x: 74 + p.x * 396, y: 118 + p.lane * 106 };
}

/** 釣り上げた魚が手元へ飛ぶ時間（秒） */
const CATCH_TIME = 0.75;

/** 調達ミニゲームの画面 */
export class MinigameView {
  /** 画像素材（なければコードで描く絵） */
  art: Art | null = null;
  pops: Pop[] = [];
  missFlash = 0;
  splash = 0;
  /** 直前の出来事を大きく見せる（釣れた・逃げた・落札など） */
  shout: { text: string; col: Color; t: number } | null = null;
  /** この画面の時計。一時停止中は update が呼ばれないので、アニメーションも止まる */
  time = 0;
  /** 一回再生の演出（水しぶき・きらめき） */
  fxs: Fx[] = [];
  /** 一回再生の動きを始めた時刻（この画面の時計） */
  private shotStart: number | null = null;
  private pickStart: number | null = null;
  private dealStart = 0;
  /** 釣り上げた魚が飛んでくる演出 */
  private catchFx: { start: number; x: number; y: number; big: boolean } | null = null;
  /** 水面に広がる波紋 */
  private ripples: { x: number; y: number; start: number; big: boolean }[] = [];
  private lastLot: unknown = null;
  private seen = new Set<string>();

  /** 採取の畑の位置（絵があるときは背景の畑に合わせる） */
  private get slots() {
    return this.art ? AMBER.gathering.slots : OLD_SLOT_POS;
  }

  handle(ev: MinigameEvent, game: Minigame<unknown>) {
    if (ev.type === 'key' && !ev.ok) this.missFlash = 0.25;
    if (ev.type === 'bite') this.splash = 0.6;
    if (game instanceof FishingGame && (ev.type === 'bite' || ev.type === 'gain')) {
      const b = this.bobberPos(game);
      this.fxs.push({ anim: '水しぶき', x: b.x, y: b.y + 2, h: AMBER.fishing.splash.h, start: this.time });
      this.ripples.push({ x: b.x, y: b.y + 1, start: this.time, big: ev.type === 'gain' });
      // 釣り上げ：魚が水面から跳ね上がり、弧を描いて女将の手元へ
      if (ev.type === 'gain') this.catchFx = { start: this.time, x: b.x, y: b.y, big: game.big };
    }
    if (ev.type === 'word' && game instanceof HuntingGame) this.shotStart = this.time;
    if (ev.type === 'word' && game instanceof GatheringGame) this.pickStart = this.time;
    if (ev.type === 'gain' && game instanceof HuntingGame) {
      const p = this.anchor(game, ev);
      this.fxs.push({ anim: 'きらめき', x: p.x, y: p.y + 24, h: 30, start: this.time });
    }
    // 釣りは札の上の一言に釣果をまとめ、別の場所に数字を出さない
    if ((ev.type === 'gain' || ev.type === 'loss') && !(game instanceof FishingGame)) {
      const p = this.anchor(game, ev);
      const text = ev.type === 'gain' ? `+${ev.amount} ${INGREDIENT_NAME[ev.ingredient]}` : `-1 ${INGREDIENT_NAME[ev.ingredient]}`;
      this.pops.push({ ...p, t: 0, text, col: ev.type === 'gain' ? C.gold3 : C.red3 });
    }
    if (game instanceof FishingGame) {
      if (ev.type === 'gain') this.shout = { text: `${game.big ? '大物！' : '釣れた！'} 魚+${ev.amount}`, col: C.gold3, t: 1 };
      if (ev.type === 'escape') this.shout = { text: ev.id === 'line' ? '糸が切れた…' : '逃げられた…', col: C.red3, t: 1 };
    }
    if (game instanceof TradingGame) {
      if (ev.type === 'gain' && ev.y === 0) this.shout = { text: '落札！', col: C.gold3, t: 0.8 };
      if (ev.type === 'escape') this.shout = { text: 'ライバルに取られた…', col: C.red3, t: 0.8 };
    }
  }

  private anchor(game: Minigame<unknown>, ev: { x: number; y: number }) {
    if (game instanceof HuntingGame) return { x: 74 + ev.x * 396, y: 118 + ev.y * 106 - 24 };
    if (game instanceof GatheringGame) return { x: this.slots[ev.x]?.x ?? 240, y: (this.slots[ev.x]?.y ?? 150) - (this.art ? 68 : 40) };
    if (game instanceof TradingGame) return this.art ? { x: AMBER.trading.master.x - 54, y: AMBER.trading.master.y - 64 } : { x: 100, y: 150 };
    return { x: 120, y: 120 };
  }

  update(dt: number) {
    this.time += dt;
    this.fxs = this.fxs.filter((f) => this.time - f.start < 2);
    this.missFlash = Math.max(0, this.missFlash - dt);
    this.splash = Math.max(0, this.splash - dt);
    if (this.shout && (this.shout.t -= dt) <= 0) this.shout = null;
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.2);
  }

  draw(sc: Screen, game: Minigame<unknown>, shop: Shop, t: number, canReturn = true) {
    const g = sc.g;
    const e = sc.ext;
    const art = this.art;
    if (art) {
      sc.clearScreen();
      art.drawBackground(sc, `bg-${game.kind}`);
      // 外の背景は昼の絵しかないので、夜の部は少し暗くする
      if (shop.phaseIndex === 2) sc.PR(e.x0, e.y0, e.w, e.h, '#141032', 0.32);
      sc.clip(0, 0, 480, 270, () => {
        if (game instanceof FishingGame) this.drawFishingArt(sc, art, game);
        else if (game instanceof HuntingGame) this.drawHuntingArt(sc, art, game);
        else if (game instanceof GatheringGame) this.drawGatheringArt(sc, art, game);
        else if (game instanceof TradingGame) this.drawTradingArt(sc, art, game);
      });
      for (const f of this.fxs) art.drawAnim(sc, 'fx', f.anim, this.time - f.start, f.x, f.y, art.scaleFor('fx', f.anim === '水しぶき' ? 8 : 14, f.h));
    } else {
      sc.begin();
      sc.toBase();
      if (game instanceof FishingGame) this.drawFishingBg(g, e, game, shop.phaseIndex, t);
      else if (game instanceof HuntingGame) this.drawHuntingBg(g, e, game, t);
      else if (game instanceof GatheringGame) this.drawGatheringBg(g, e, game);
      else if (game instanceof TradingGame) this.drawTradingBg(g, e, game, t);
      sc.present();
    }
    if (game instanceof FishingGame) this.drawFishingUi(sc, game);
    else if (game instanceof HuntingGame) this.drawHuntingUi(sc, game);
    else if (game instanceof GatheringGame) this.drawGatheringUi(sc, game);
    else if (game instanceof TradingGame) this.drawTradingUi(sc, game);
    sc.shifted(0, e.y0, () => this.drawHud(sc, game, shop));
    for (const p of this.pops) sc.TB(p.text, p.x, p.y - p.t * 18, 12, p.col, 'center', C.ink, Math.min(1, (1.2 - p.t) * 3));
    // 結果の一言は、打つ札のすぐ上に出す（目線を動かさずに読めるように）
    if (this.shout) sc.TB(this.shout.text, LW / 2, game instanceof FishingGame ? 84 : 68, 16, this.shout.col, 'center', C.ink, Math.min(1, this.shout.t * 3));
    if (canReturn) {
      // 途中帰還：キーの絵と短い言葉だけを右下に小さく
      // ウィンドウの右下の角に付ける
      const kw = sc.W('Enter', 7) + 7.7;
      const rx = e.x1 - 12 - kw - 3 - sc.W('戻る', 8);
      sc.keycap('Enter', rx, e.y1 - 19, 7, 0.85);
      sc.T('戻る', rx + kw + 3, e.y1 - 18, 8, C.cream, 'left', 0.85);
    }
    if (this.missFlash > 0) {
      sc.PR(e.x0, e.y0, e.w, 2, C.red, this.missFlash * 3);
      sc.PR(e.x0, e.y1 - 2, e.w, 2, C.red, this.missFlash * 3);
    }
  }

  private drawHud(sc: Screen, game: Minigame<unknown>, shop: Shop) {
    const trip = TRIPS.find((x) => x.id === game.kind)!;
    const col = TRIP_COLOR[trip.id];
    const e = sc.ext;
    sc.panel(e.x0 + 3, 2, e.w - 6, 26, col.dark, col.main);
    if (this.art) this.art.drawHead(sc, `family-${trip.who}`, 0, 8, 6, 19);
    else sc.spr(PORTRAIT[trip.who], 8, 6, 1.4);
    sc.TB(trip.act, 30, 6, 13, C.w, 'left');
    const tl = game.timeLeft;
    sc.PR(100, 11, 170, 8, C.ink);
    sc.PR(100, 11, 170 * (tl / game.duration), 8, tl < 3 ? C.red : col.main);
    sc.TB(tl > 0 ? tl.toFixed(1) : game.finished ? '終了' : '延長！', 276, 7, 11, tl > 0 ? C.w : C.gold3, 'left');
    let x = 360;
    for (const id of trip.gives) {
      if (this.art) this.art.drawIcon(sc, 'icons-dishes', ICON_INDEX[id], x, 6, 16);
      else sc.spr(ICON[id], x, 8, 1.2);
      sc.TB(`×${game.gains[id] ?? 0}`, x + 17, 6, 13, C.w, 'left');
      x += 56;
    }
    // お店の残り時間は右端に小さく（お客の待ち時間は止まっているので、急がせる表示にしない）
    const left = shop.timeLeft;
    sc.T(`店 ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, 312, 9, 8, C.cream, 'left', 0.7);
  }

  /** 中央の大きな語句 */
  private bigWord(sc: Screen, text: string, kana: string, game: Minigame<unknown>, y: number, col: Color) {
    const live = game.input.active[0];
    const m = live?.matcher ?? new RomajiMatcher(kana);
    const w = Math.max(180, sc.W(text, 20) + 50, sc.W(m.typed + m.remaining, 13) + 40);
    this.drawBigWord(sc, text, m, !!live, y, w, col);
    return w;
  }

  private drawBigWord(sc: Screen, text: string, m: RomajiMatcher, live: boolean, y: number, w: number, col: Color) {
    if (live) sc.glow(LW / 2 - w / 2, y, w, 52);
    sc.panel(LW / 2 - w / 2, y, w, 52, 'rgba(42,27,38,0.95)', live ? C.gold : col);
    sc.TB(text, LW / 2, y + 5, 20, C.w, 'center');
    sc.roma(m.typed, m.remaining, LW / 2, y + 32, 13, 'active');
  }

  // ---------- つり：あわせて、巻き上げる ----------

  private drawFishingBg(g: G, e: Ext, game: FishingGame, ph: number, t: number) {
    const R = pen(g);
    const sky = SKY[ph];
    for (let y = e.y0; y < 130; y++) R(e.x0, y, e.w, 1, mix(sky[0], sky[1], Math.max(0, y) / 130));
    const far = ph === 2 ? '#2b2650' : '#8e9ab4';
    for (let i = Math.floor(e.x0 / 36) - 1; i < e.x1 / 36 + 1; i++) {
      const h = 20 + ((Math.abs(i) * 29) % 40);
      R(i * 36 + ((Math.abs(i) * 13) % 11), 130 - h, 22, h, far);
    }
    for (let y = 130; y < e.y1; y++) R(e.x0, y, e.w, 1, mix(ph === 2 ? '#24305a' : '#3c8296', '#173a52', Math.min(1, (y - 130) / 140)));
    const calm = game.phase === 'reel' ? 0.3 : 1;
    for (let i = 0; i < 30; i++) {
      const y = 136 + ((i * 37) % 130);
      const x = e.x0 + ((((i * 97) + t * (10 + (i % 5) * 4) * calm) % (e.w + 30)) - 15);
      R(x, y, 6 + (i % 4) * 3, 1, '#8cc8d4');
    }
    // 桟橋と女将（2倍）
    R(e.x0, 168, 130 - e.x0, 8, C.wood3); R(e.x0, 168, 130 - e.x0, 1, C.wood5); R(e.x0, 175, 130 - e.x0, 2, C.wood1);
    for (let px = Math.floor(e.x0 / 44) * 44 + 12; px < 130; px += 44) R(px, 176, 6, 60, C.wood1);
    const wife = FAM.wife[0];
    g.drawImage(wife, 70, 168 - wife.height * 2, wife.width * 2, wife.height * 2);
    // 竿・糸・浮き
    const fighting = game.phase === 'reel';
    const bend = fighting ? 8 + Math.sin(t * 14) * 3 : 0;
    const tipX = 160;
    const tipY = 96 + bend;
    for (let k = 0; k <= 24; k++) R(98 + (tipX - 98) * (k / 24), 138 + (tipY - 138) * (k / 24), 2, 1, C.wood1);
    let bx = 310;
    // 巻き上げるほど魚が手前に寄ってくる
    if (fighting) bx = 310 - (1 - game.wordsLeft / (game.big ? FISHING.bigWords : 1)) * 110 - 20;
    const dip = game.phase === 'hook' ? 4 + Math.sin(t * 20) * 2 : Math.sin(t * 2.5);
    const by = 168 + dip;
    for (let k = 0; k <= 40; k++) R(tipX + (bx - tipX) * (k / 40), tipY + (by - tipY) * (k / 40) + Math.sin((k / 40) * Math.PI) * (fighting ? 2 : 10), 1, 1, C.cream);
    R(bx - 3, by - 7, 7, 5, C.red); R(bx - 3, by - 2, 7, 3, C.w);
    if (this.splash > 0) for (let i = 0; i < 8; i++) R(bx - 16 + i * 5, by - 5 - Math.sin(i + this.splash * 10) * 8 * this.splash, 2, 2, C.w);
    if (game.phase === 'hook' || fighting) {
      g.save();
      g.globalAlpha = 0.55;
      const w = game.big ? 56 : 24;
      R(bx - w / 2 + 8, by + 14, w, game.big ? 14 : 7, '#0e2236');
      R(bx + w / 2 + 8, by + 14, game.big ? 10 : 5, game.big ? 14 : 7, '#0e2236');
      g.restore();
    }
  }

  /**
   * 釣り：必要な情報はすべて言葉の札の縁に付ける。
   * 上の縁に「あわせ」「巻き上げ」と大物の印、下の縁にあわせの残り時間か糸の傷み。
   */
  private drawFishingUi(sc: Screen, game: FishingGame) {
    if (!game.word || (game.phase !== 'hook' && game.phase !== 'land' && game.phase !== 'reel')) return;
    const y = 112;
    const reel = game.phase === 'reel';
    const w = this.bigWord(sc, game.word.text, game.word.kana, game, y, reel ? C.blue : C.gold);
    const x0 = LW / 2 - w / 2;
    // 上の縁：今やること（短く）と大物の印、巻き上げの残り
    this.tag(sc, reel ? '巻き上げ' : 'あわせ', x0 + 8, y - 7, reel ? C.blue : C.gold, reel ? C.w : C.ink);
    // 右上：大物の印。最後の巻き上げでは、釣り上げたときの数（長い言葉ほど多い）
    let tx = x0 + w - 8;
    if (reel && game.wordsLeft === 1) {
      const text = `魚×${procurementReward('fishing', game.catchKeys + rewardKeys(game.word.kana), game.big)}`;
      tx -= sc.W(text, 8) + 8;
      this.tag(sc, text, tx, y - 7, C.gold3, C.ink);
      tx -= 3;
    }
    if (game.big) this.tag(sc, '大物', tx - sc.W('大物', 8) - 8, y - 7, C.gold3, C.ink);
    if (reel && game.big) {
      const total = FISHING.bigWords;
      const done = total - game.wordsLeft;
      for (let i = 0; i < total; i++) sc.PR(LW / 2 - total * 5 + i * 10 + 2, y - 4, 6, 3, i < done ? C.gold3 : C.ink);
    }
    // 下の縁：あわせの残り時間、巻き上げ中は糸の傷み（ミスで減る）
    if (!reel) {
      sc.PR(x0 + 4, y + 49, w - 8, 3, C.ink);
      sc.PR(x0 + 4, y + 49, (w - 8) * Math.max(0, game.hookLeft / game.hookWindow), 3, C.gold);
    } else {
      for (let i = 0; i < FISHING.breakAt; i++) {
        const ok = i >= game.tension;
        sc.PR(LW / 2 - FISHING.breakAt * 9 + i * 18 + 2, y + 48, 14, 3, ok ? C.teal3 : C.red, ok ? 1 : 0.9);
      }
    }
  }

  /** 札の縁に付ける小さな見出し */
  private tag(sc: Screen, text: string, x: number, y: number, fill: Color, ink: Color) {
    const w = sc.W(text, 8) + 8;
    sc.panel(x, y, w, 12, fill, C.ink);
    sc.T(text, x + w / 2, y + 2, 8, ink, 'center');
    return w;
  }

  // ---------- かり ----------

  private drawHuntingBg(g: G, e: Ext, game: HuntingGame, t: number) {
    const R = pen(g);
    for (let y = e.y0; y < 110; y++) R(e.x0, y, e.w, 1, mix('#3a2a55', '#ea8f58', Math.max(0, y) / 110));
    R(e.x0, 80, e.w, 8, '#5a3a55'); R(e.x0, 88, e.w, 2, '#2a1b26');
    for (let x = Math.floor(e.x0 / 120) * 120 + 40; x < e.x1; x += 120) R(x, 90, 10, 30, '#5a3a55');
    for (let x = e.x0; x < e.x1; x++) {
      const y = Math.round(100 + Math.sin(x / 50) * 6);
      R(x, y, 1, e.y1 - y, C.sand2);
    }
    for (let y = 108; y < e.y1; y += 8) R(e.x0, y, e.w, 1, mix(C.sand, C.sand2, Math.min(1, (y - 108) / 160)));
    // 逃げられるライン（柵）
    for (let y = 100; y < e.y1; y += 10) { R(58, y, 2, 8, C.wood1); R(56, y + 3, 6, 1, C.wood2); }
    // おやじ（2倍、構える）
    const m = FAM.master[0];
    g.drawImage(m, 6, 150, m.width * 2, m.height * 2);
    R(36, 172, 30, 3, C.gray2); R(62, 171, 6, 2, C.gray);
    for (const p of [...game.prey].sort((a, b) => a.lane - b.lane)) {
      const pos = preyPos(p);
      const frame = Math.floor(t * 8) % 2;
      const img = p.kind === 'deer' ? DEER[frame] : RABBIT[frame];
      if (p.flash > 0 && Math.floor(p.flash * 30) % 2 === 0) continue;
      const w = img.width * 2;
      const h = img.height * 2;
      g.save();
      g.globalAlpha = 0.25;
      g.fillStyle = '#2a1520';
      g.fillRect(Math.round(pos.x - w / 2 + 4), Math.round(pos.y), w - 8, 4);
      g.restore();
      g.drawImage(img, Math.round(pos.x - w / 2), Math.round(pos.y - h), w, h);
    }
  }

  private drawHuntingUi(sc: Screen, game: HuntingGame) {
    const active = game.input.active;
    // 他の獲物との重なりで上へ積み上げない。小物は頭上、大物は頭の横へ追従する。
    const preys = [...game.prey].sort((a, b) => a.x - b.x);
    for (const p of preys) {
      const pos = preyPos(p);
      const live = active.find((l) => l.target.id === p.id);
      const dim = game.input.typed.length > 0 && !live;
      const m = live?.matcher ?? new RomajiMatcher(p.word.kana);
      const label = p.word.text + (p.kind === 'rabbit' ? ` ×${procurementReward('hunting', rewardKeys(p.word.kana))}` : '');
      const h = 32;
      const w = Math.max(60, sc.W(m.typed + m.remaining, 10) + 14, sc.W(label, 12) + 14);
      const spriteH = p.kind === 'deer' ? 48 : 24;
      const deer = p.kind === 'deer';
      // 大物の頭上は中段の小物の走路。ふだんは頭の左横に置き、画面の左端に近づいたら
      // 反対側へ飛ばさずに、少しずつ頭の上へ移していく（札が急に跳ねて大物が戻ったように見えないように）
      const box = deer ? deerLabelBox(pos, w, h, spriteH)
        : { x: Math.max(4, Math.min(LW - w - 4, pos.x - w / 2)), y: pos.y - spriteH - h - 8, w, h };
      const cx = box.x + w / 2;
      // 弱める札も透かさない（明るい砂地の上でも文字が読めるように）。枠と文字の色だけ落とす
      const edge = live ? C.gold : dim ? '#6a5040' : deer ? C.gold2 : C.cream2;
      const a = 1;
      // 札と獲物を細い線でつなぎ、位置が毎回変わってもどの獲物の言葉か分かるようにする
      const ax = deer ? (box.x > pos.x ? box.x : box.x + w) : cx;
      const ay = deer ? box.y + h / 2 : box.y + h;
      const tx = deer ? pos.x + (box.x > pos.x ? 14 : -14) : pos.x;
      const ty = deer ? pos.y - spriteH * 0.6 : pos.y - spriteH + 2;
      const n = Math.max(2, Math.ceil(Math.hypot(tx - ax, ty - ay) / 2));
      for (let k = 0; k <= n; k++) sc.PR(ax + (tx - ax) * (k / n) - 0.5, ay + (ty - ay) * (k / n) - 0.5, 1, 1, edge, a * 0.8);
      if (live) sc.glow(box.x, box.y, w, h);
      sc.panel(box.x, box.y, w, h, live ? '#4a2c3c' : dim ? '#241820' : '#1e131a', edge, a);
      sc.T(label, cx, box.y + 2, 12, dim ? '#a89a90' : C.w, 'center');
      sc.roma(m.typed, m.remaining, cx, box.y + 18, 10, live ? 'active' : dim ? 'dim' : 'idle');
      for (let i = 0; i < p.maxHp; i++) sc.PR(cx - p.maxHp * 4 + i * 8, box.y - 5, 6, 3, i < p.hp ? C.pink : C.ink);
      if (p.kind === 'deer') this.tag(sc, p.hp === 1 ? `大物 肉×${procurementReward('hunting', (p.rewardKeys ?? 0) + rewardKeys(p.word.kana), true)}` : '大物', box.x - 4, box.y - 8, C.gold3, C.ink);
    }
  }

  // ---------- さいしゅ ----------

  private drawGatheringBg(g: G, e: Ext, game: GatheringGame) {
    const R = pen(g);
    R(e.x0, e.y0, e.w, 96 - e.y0, '#cfe8d4');
    for (let x = Math.floor(e.x0 / 40) * 40; x < e.x1; x += 40) R(x, e.y0, 2, 96 - e.y0, '#9ac0a4');
    for (let y = 0; y < 96; y += 25) R(e.x0, y, e.w, 2, '#9ac0a4');
    R(e.x0, 96, e.w, e.y1 - 96, '#6a4a32');
    for (let y = 100; y < e.y1; y += 8) R(e.x0, y, e.w, 2, '#5a3c28');
    for (const s of OLD_SLOT_POS) { R(s.x - 40, s.y + 4, 80, 8, '#4a3020'); R(s.x - 38, s.y + 4, 76, 2, '#7a5a3a'); }
    const d = FAM.daughter[0];
    g.drawImage(d, 20, 170, d.width * 2, d.height * 2);
    R(52, 196, 26, 16, C.wood3); R(52, 196, 26, 3, C.wood5); R(54, 200, 22, 1, C.wood2);
    const veg = game.gains.veg ?? 0;
    const mush = game.gains.mush ?? 0;
    for (let i = 0; i < Math.min(Math.ceil((veg + mush) / 2), 10); i++) R(55 + (i % 5) * 4, 192 - Math.floor(i / 5) * 3, 3, 3, i < veg / 2 ? C.gold2 : C.red);
    for (const s of game.sprouts) {
      const pos = this.slots[s.slot];
      const grow = Math.min(1, (s.maxLife - s.life) * 4);
      const icon = s.ing ? ICON[s.ing] : ICON.poison;
      const sz = Math.round(36 * grow);
      if (sz > 0) g.drawImage(icon, Math.round(pos.x - sz / 2), Math.round(pos.y + 4 - sz), sz, sz);
    }
  }

  private drawGatheringUi(sc: Screen, game: GatheringGame) {
    const active = game.input.active;
    for (const s of game.sprouts as Sprout[]) {
      const pos = this.slots[s.slot];
      const live = active.find((l) => l.target.id === s.id);
      const dim = game.input.typed.length > 0 && !live;
      const m = live?.matcher ?? new RomajiMatcher(s.word.kana);
      const bad = !s.ing;
      const label = (bad ? '☠ ' : '') + s.word.text + (bad ? '' : ` ×${procurementReward('gathering', rewardKeys(s.word.kana))}`);
      const w = Math.max(92, sc.W(m.typed + m.remaining, 10) + 12, sc.W(label, 11) + 12);
      // 絵があるときは芽のすぐ上に置き、前の列の芽を隠さない
      const top = pos.y - (this.art ? AMBER.gathering.sprout.size + 31 : 70);
      if (live) sc.glow(pos.x - w / 2, top, w, 30);
      sc.panel(pos.x - w / 2, top, w, 30, live ? '#4a2c3c' : bad ? '#3a1e48' : '#241820', live ? C.gold : dim ? '#5a4a40' : bad ? C.purple : C.green);
      sc.T(label, pos.x, top + 2, 11, dim ? '#a89a90' : bad ? '#e0c8ff' : C.w, 'center');
      sc.roma(m.typed, m.remaining, pos.x, top + 17, 10, live ? 'active' : dim ? 'dim' : 'idle');
      sc.PR(pos.x - w / 2 + 4, top + 28, (w - 8) * (s.life / s.maxLife), 1.5, bad ? C.purple : C.green3);
    }

  }

  // ---------- しいれ：早い者勝ちの競り ----------

  private drawTradingBg(g: G, e: Ext, game: TradingGame, t: number) {
    const R = pen(g);
    for (let y = e.y0; y < 120; y++) R(e.x0, y, e.w, 1, mix('#f6c27a', '#fbe8c0', Math.max(0, y) / 120));
    R(420, 26, 18, 18, '#fff3c0');
    for (let x = e.x0; x < e.x1; x++) { const y = Math.round(118 + Math.sin(x / 70) * 5); R(x, y, 1, e.y1 - y, C.sand); }
    for (let y = 130; y < e.y1; y += 7) R(e.x0, y, e.w, 1, C.sand2);
    // 隊商の荷車
    R(270, 120, 180, 70, '#c8a878'); R(270, 120, 180, 6, '#e8d0a0');
    for (let x = 278; x < 450; x += 22) R(x, 120, 2, 70, '#a88858');
    R(264, 188, 192, 8, C.wood1);
    for (const wx of [296, 420]) { R(wx - 14, 190, 28, 28, C.wood0); R(wx - 10, 194, 20, 20, C.wood3); R(wx - 2, 202, 4, 4, C.wood0); }
    for (let i = 0; i < 6; i++) g.drawImage(CRATE, 320 + (i % 3) * 20, 172 - Math.floor(i / 3) * 16, 20, 16);
    g.drawImage(MERCHANT, 404, 168, MERCHANT.width * 2, MERCHANT.height * 2);
    const m = FAM.master[0];
    g.drawImage(m, 30, 172, m.width * 2, m.height * 2);
    // 落札した箱
    const ale = game.gains.ale ?? 0;
    const spice = game.gains.spice ?? 0;
    const boxes = Math.min(ale + spice, 16);
    for (let i = 0; i < boxes; i++) {
      const x = 76 + (i % 4) * 16;
      const y = 240 - Math.floor(i / 4) * 12;
      g.drawImage(CRATE, x, y, 15, 12);
      g.drawImage(i < ale ? ICON.ale : ICON.spice, x + 3, y + 2, 9, 9);
    }
    void t;
  }

  private drawTradingUi(sc: Screen, game: TradingGame) {
    const lot = game.lot;
    if (lot.outcome !== 'open') return;
    // 品物の札：左上に品物の絵と箱数、下の縁に自分（緑）とライバル（赤）の進み具合
    const y = 92;
    const w = this.bigWord(sc, lot.word.text, lot.word.kana, game, y, C.gold2);
    const x0 = LW / 2 - w / 2;
    if (this.art) this.art.drawIcon(sc, 'icons-dishes', ICON_INDEX[lot.item], x0 + 6, y + 6, 22);
    else sc.spr(ICON[lot.item], x0 + 8, y + 8, 1.5);
    sc.TB(`×${procurementReward('trading', rewardKeys(lot.word.kana))}`, x0 + 17, y + 30, 9, C.gold3, 'center');
    const live = game.input.active[0];
    const mine = live ? live.matcher.kanaPos / lot.word.kana.length : 0;
    // 札のすぐ下に、自分とライバルの進み具合を並べる
    sc.panel(x0 + 8, y + 50, w - 16, 18, '#1e131a', C.gold2);
    const bx = x0 + 34;
    const bw = w - 50;
    sc.T('自分', x0 + 14, y + 52, 7, C.teal3);
    sc.PR(bx, y + 54, bw, 3, C.ink);
    sc.PR(bx, y + 54, bw * mine, 3, C.teal3);
    sc.T('相手', x0 + 14, y + 60, 7, C.red3);
    sc.PR(bx, y + 62, bw, 3, C.ink);
    sc.PR(bx, y + 62, bw * lot.rival, 3, C.red);
  }

  // ---------- 画像素材（A案）で描く ----------

  /** つり：浮きの位置（水面）。巻き上げるほど手前へ寄る。動きはコマ単位で切り替える */
  private bobberPos(game: FishingGame) {
    const L = AMBER.fishing.bobber;
    let x = L.x;
    if (game.phase === 'reel') x = L.x - 12 - (1 - game.wordsLeft / (game.big ? FISHING.bigWords : 1)) * 60;
    const step = Math.floor(this.time * 8) % 2;
    const dip = game.phase === 'hook' ? 3 + step * 2 : Math.floor(this.time * 2) % 2;
    return { x, y: L.y + dip };
  }

  private drawFishingArt(sc: Screen, art: Art, game: FishingGame) {
    const L = AMBER.fishing;
    const t = this.time;
    const b = this.bobberPos(game);
    // 波紋：あたり・釣り上げのたびに、楕円の輪が広がって消える。巻き上げ中は小さな輪が続く
    this.ripples = this.ripples.filter((r) => t - r.start < 1.2);
    if (game.phase === 'reel' && Math.floor(t * 3) !== Math.floor((t - 1 / 60) * 3)) this.ripples.push({ x: b.x, y: b.y + 1, start: t, big: false });
    for (const r of this.ripples) {
      const age = t - r.start;
      const rad = 4 + age * (r.big ? 34 : 18);
      const a = Math.max(0, 0.7 - age * 0.6);
      for (let k = 0; k < 28; k++) {
        const ang = (k / 28) * Math.PI * 2;
        sc.PR(r.x + Math.cos(ang) * rad, r.y + Math.sin(ang) * rad * 0.28, 1.2, 0.8, '#d8f0ff', a);
      }
    }
    // 魚影：あたり・巻き上げ中だけ。魚の形（胴と尾びれ）で、巻き上げるほど岸へ寄りながら左右にくねる
    const flying = this.catchFx && t - this.catchFx.start < CATCH_TIME;
    if ((game.phase === 'hook' || game.phase === 'reel') && !flying) {
      const len = game.big ? 30 : 16;
      const wig = Math.sin(t * (game.phase === 'reel' ? 9 : 4)) * (game.phase === 'reel' ? 3 : 1.5);
      this.fishShadow(sc, b.x + 6 + wig, b.y + 10, len);
    }
    // 板面への接地影。足元より下の桟橋側面や支柱には落とさない。
    sc.PR(L.wife.x - 8, L.wife.y - 1, 16, 2, '#332313', 0.28);
    // 女将（竿までが画像。糸と浮きは別描画）
    const anim = art.anim('wife-fishing', '釣り・待機');
    const idx = frameAt(anim, t) ?? anim.frames[0];
    const k = art.scaleFor('wife-fishing', anim.frames[0], L.wife.h);
    art.drawFrame(sc, 'wife-fishing', idx, L.wife.x, L.wife.y, k);
    const f = art.frame('wife-fishing', idx);
    const [lx, ly] = L.lure[idx] ?? L.lure[0];
    const sx = L.wife.x + (lx - f.registration[0]) * k;
    const sy = L.wife.y + (ly - f.registration[1]) * k;
    if (flying) {
      // 釣り上げ：魚が弧を描いて手元へ飛ぶ。糸は魚につながったまま、ぴんと張る
      const c = this.catchFx!;
      const p = (t - c.start) / CATCH_TIME;
      const ease = 1 - Math.pow(1 - p, 2);
      const tx = L.wife.x + 14;
      const ty = L.wife.y - 30;
      const fx = c.x + (tx - c.x) * ease;
      const fy = c.y + (ty - c.y) * ease - Math.sin(p * Math.PI) * (c.big ? 105 : 95);
      this.line(sc, sx, sy, fx, fy, 1);
      // 水滴を散らしながら飛ぶ
      for (let d = 0; d < 6; d++) {
        const q = Math.max(0, p - d * 0.04);
        const dx = c.x + (tx - c.x) * (1 - Math.pow(1 - q, 2));
        const dy = c.y + (ty - c.y) * (1 - Math.pow(1 - q, 2)) - Math.sin(q * Math.PI) * (c.big ? 105 : 95) + d * 3;
        sc.PR(dx + (d % 2 ? 3 : -3), dy, 1.2, 1.2, '#d8f0ff', 0.8 - d * 0.12);
      }
      const size = (c.big ? 30 : 18) * (1 + 0.15 * Math.sin(p * Math.PI * 6));
      art.drawIcon(sc, 'icons-dishes', 0, fx - size / 2, fy - size / 2, size);
      // 手元に届いたら光る
      if (p > 0.85) sc.radialGlow(tx, ty, 18, '#ffe7a6', (p - 0.85) * 4);
      return;
    }
    // 糸：浮きまで張る（巻き上げ中はぴんと張り、あたりの間は細かく震える）
    const sag = game.phase === 'reel' ? 1.5 : game.phase === 'hook' ? 4 : 9;
    this.line(sc, sx, sy, b.x, b.y - 4, sag);
    // 浮き
    art.drawFrame(sc, 'props-actions', 14, b.x, b.y, art.scaleFor('props-actions', 14, L.bobber.h));
  }

  /** 釣り糸：細い点を連ねて描く。sag はたるみ */
  private line(sc: Screen, x0: number, y0: number, x1: number, y1: number, sag: number) {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 1.2);
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      sc.PR(x0 + (x1 - x0) * p, y0 + (y1 - y0) * p + Math.sin(p * Math.PI) * sag, 0.6, 0.6, '#f4ead0', 0.85);
    }
  }

  /** 水中の魚影：胴の楕円と尾びれ（左向き＝岸の方へ泳ぐ） */
  private fishShadow(sc: Screen, x: number, y: number, len: number) {
    const hgt = len * 0.32;
    for (let r = -hgt; r <= hgt; r += 0.8) {
      const w = len * Math.sqrt(Math.max(0, 1 - (r / hgt) ** 2));
      sc.PR(x - w / 2, y + r * 0.6, w, 0.9, '#0b1d2e', 0.32);
    }
    for (let r = -hgt * 0.8; r <= hgt * 0.8; r += 0.8) {
      const w = len * 0.28 * (Math.abs(r) / hgt + 0.2);
      sc.PR(x + len / 2 - 1, y + r * 0.6, w, 0.9, '#0b1d2e', 0.28);
    }
  }

  private drawHuntingArt(sc: Screen, art: Art, game: HuntingGame) {
    const L = AMBER.hunting;
    const t = this.time;
    const kMaster = art.scaleFor('props-actions', 4, L.master.h);
    sc.PR(L.master.x - 13, L.master.y - 1, 26, 3, '#2a1520', 0.28);
    // 撃つたびに一回再生して最後のコマ（構え）で止まる。撃っていない間は構えのコマ
    if (this.shotStart !== null) art.drawAnim(sc, 'props-actions', 'マスター・狩り', t - this.shotStart, L.master.x, L.master.y, kMaster);
    else art.drawFrame(sc, 'props-actions', 4, L.master.x, L.master.y, kMaster);
    // 獲物は左向きの絵で、右から左へ走る
    const kRabbit = art.scaleFor('wildlife', 0, L.rabbit.h);
    const kDeer = art.scaleFor('wildlife', 4, L.deer.h);
    for (const p of [...game.prey].sort((a, b) => a.lane - b.lane)) {
      const pos = preyPos(p);
      if (p.flash > 0 && Math.floor(p.flash * 30) % 2 === 0) continue;
      const deer = p.kind === 'deer';
      sc.PR(pos.x - (deer ? 16 : 8), pos.y - 1.5, deer ? 32 : 16, 3, '#2a1520', 0.25);
      art.drawAnim(sc, 'wildlife', deer ? 'シカ・走行' : 'ウサギ・走行', t, pos.x, pos.y, deer ? kDeer : kRabbit);
    }
  }

  private drawGatheringArt(sc: Screen, art: Art, game: GatheringGame) {
    const L = AMBER.gathering;
    const t = this.time;
    // 新しく生えた芽にきらめき
    for (const s of game.sprouts) {
      if (this.seen.has(s.id)) continue;
      this.seen.add(s.id);
      const pos = L.slots[s.slot];
      this.fxs.push({ anim: 'きらめき', x: pos.x, y: pos.y - 4, h: 26, start: t });
    }
    for (const s of game.sprouts) {
      const pos = L.slots[s.slot];
      const sz = L.sprout.size;
      sc.PR(pos.x - sz / 2 + 3, pos.y - 1, sz - 6, 2, '#2a1508', 0.3);
      art.drawIcon(sc, 'icons-dishes', ICON_INDEX[s.ing ?? 'poison'], pos.x - sz / 2, pos.y - sz + 1, sz);
    }
    // 看板娘：摘むたびに一回再生して最後のコマで止め、少し置いて待機に戻る
    const kD = art.scaleFor('family-daughter', 0, L.daughter.h);
    const pick = art.anim('family-daughter', '採取');
    if (this.pickStart !== null && t - this.pickStart < animLength(pick) + 0.25) art.drawAnim(sc, 'family-daughter', '採取', t - this.pickStart, L.daughter.x, L.daughter.y, kD);
    else art.drawAnim(sc, 'family-daughter', '待機', t, L.daughter.x, L.daughter.y, kD);
    // かごと、摘んだもの
    art.drawFrame(sc, 'props-actions', 11, L.basket.x, L.basket.y, art.scaleFor('props-actions', 11, L.basket.h));
    const items = game.basket.slice(-6);
    items.forEach((ing, i) => art.drawIcon(sc, 'icons-dishes', ICON_INDEX[ing], L.basket.x - 9 + (i % 3) * 6, L.basket.y - 13 - Math.floor(i / 3) * 4, 7));
  }

  private drawTradingArt(sc: Screen, art: Art, game: TradingGame) {
    const L = AMBER.trading;
    const t = this.time;
    // 新しい品物が出るたびに商人が口上を述べる（一回再生して最後のコマで止まる）
    if (game.lot !== this.lastLot) {
      this.lastLot = game.lot;
      this.dealStart = t;
    }
    art.drawAnim(sc, 'family-master', '待機', t, L.master.x, L.master.y, art.scaleFor('family-master', 0, L.master.h));
    art.drawAnim(sc, 'props-actions', '商人・交渉', t - this.dealStart, L.merchant.x, L.merchant.y, art.scaleFor('props-actions', 0, L.merchant.h), true);
    // 落札した箱をおやじの横に積む
    const ale = game.gains.ale ?? 0;
    const spice = game.gains.spice ?? 0;
    const boxes = Math.min(ale + spice, 16);
    const kc = art.scaleFor('props-actions', 10, L.crate.h);
    for (let i = 0; i < boxes; i++) {
      const x = L.master.x - 30 - (i % 4) * 16;
      const y = L.master.y - Math.floor(i / 4) * 13;
      art.drawFrame(sc, 'props-actions', 10, x, y, kc);
      art.drawIcon(sc, 'icons-dishes', ICON_INDEX[i < ale ? 'ale' : 'spice'], x - 3, y - 10, 6);
    }
  }
}
