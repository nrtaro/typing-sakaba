import { C, TRIP_COLOR, mix, type Color } from './palette';
import { Screen, LW } from './screen';
import { CRATE, DEER, FAM, ICON, MERCHANT, PORTRAIT, RABBIT } from './sprites';
import { pen, SKY } from './room';
import {
  FISHING, FishingGame, GatheringGame, HuntingGame, TradingGame, TRADING, GATHER, GATHER_SLOTS,
  type Minigame, type MinigameEvent, type Prey, type Sprout,
} from '../core/minigames';
import { RomajiMatcher } from '../core/romaji';
import { FAMILY_NAME, INGREDIENT_NAME, TRIPS } from '../core/shopConfig';
import type { Shop } from '../core/shop';
import type { Art } from './amber/art';
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
    }
    if (ev.type === 'word' && game instanceof HuntingGame) this.shotStart = this.time;
    if (ev.type === 'word' && game instanceof GatheringGame) this.pickStart = this.time;
    if (ev.type === 'gain' && game instanceof HuntingGame) {
      const p = this.anchor(game, ev);
      this.fxs.push({ anim: 'きらめき', x: p.x, y: p.y + 24, h: 30, start: this.time });
    }
    if (ev.type === 'gain' || ev.type === 'loss') {
      const p = this.anchor(game, ev);
      const text = ev.type === 'gain' ? `+${ev.amount} ${INGREDIENT_NAME[ev.ingredient]}` : `-1 ${INGREDIENT_NAME[ev.ingredient]}`;
      this.pops.push({ ...p, t: 0, text, col: ev.type === 'gain' ? C.gold3 : C.red3 });
    }
    if (game instanceof FishingGame) {
      if (ev.type === 'gain') this.shout = { text: game.big ? '大物を釣り上げた！' : '釣れた！', col: C.gold3, t: 1 };
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
    this.drawHud(sc, game, shop);
    for (const p of this.pops) sc.TB(p.text, p.x, p.y - p.t * 18, 12, p.col, 'center', C.ink, Math.min(1, (1.2 - p.t) * 3));
    if (this.shout) sc.TB(this.shout.text, LW / 2, 64, 18, this.shout.col, 'center', C.ink, Math.min(1, this.shout.t * 3));
    if (game.input.typed) sc.TB(game.input.typed, LW / 2, 252, 12, C.w, 'center', C.ink, 0.55);
    if (canReturn) {
      sc.panel(379, 249, 94, 16, C.ink, C.gold);
      sc.T('Enter：店へ戻る', 426, 253, 8, C.gold3, 'center');
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
    sc.TB(`${FAMILY_NAME[trip.who]}の${trip.act}`, 30, 6, 13, C.w, 'left');
    const tl = game.timeLeft;
    sc.PR(150, 11, 110, 8, C.ink);
    sc.PR(150, 11, 110 * (tl / game.duration), 8, tl < 3 ? C.red : col.main);
    sc.TB(tl > 0 ? `残り ${tl.toFixed(1)}秒` : game.finished ? '終了' : '延長戦！', 266, 7, 11, tl > 0 ? C.w : C.gold3, 'left');
    let x = 360;
    for (const id of trip.gives) {
      if (this.art) this.art.drawIcon(sc, 'icons-dishes', ICON_INDEX[id], x, 6, 16);
      else sc.spr(ICON[id], x, 8, 1.2);
      sc.TB(`×${game.gains[id] ?? 0}`, x + 17, 6, 13, C.w, 'left');
      x += 56;
    }
    const left = shop.timeLeft;
    sc.TB(`お店の残り ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}（お客の待ち時間は止まっています）`, LW / 2, 31, 9, C.cream, 'center');
  }

  /** 中央の大きな語句 */
  private bigWord(sc: Screen, text: string, kana: string, game: Minigame<unknown>, y: number, col: Color) {
    const live = game.input.active[0];
    const m = live?.matcher ?? new RomajiMatcher(kana);
    const w = Math.max(180, sc.W(text, 20) + 50, sc.W(m.typed + m.remaining, 13) + 40);
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

  private drawFishingUi(sc: Screen, game: FishingGame) {
    // 次の魚の大きさと、何匹目か
    sc.panel(10, 44, 150, 30, 'rgba(42,27,38,0.9)', C.blue);
    sc.T(`${game.fishIndex + 1}匹目`, 18, 48, 9, C.cream);
    const nextBig = game.phase === 'wait' || game.phase === 'land' ? game.isBigNext : game.big;
    sc.TB(nextBig ? '大物（ヌシ）！' : '小さい魚', 18, 59, 10, nextBig ? C.gold3 : C.w, 'left');
    if ((game.phase === 'hook' || game.phase === 'land') && game.word) {
      sc.TB('あわせろ！', LW / 2, 84, 16, C.gold3, 'center');
      this.bigWord(sc, game.word.text, game.word.kana, game, 112, C.gold);
      sc.PR(LW / 2 - 80, 178, 160, 5, C.ink);
      sc.PR(LW / 2 - 80, 178, 160 * Math.max(0, game.hookLeft / game.hookWindow), 5, C.gold);
    } else if (game.phase === 'reel' && game.word) {
      const total = game.big ? FISHING.bigWords : 1;
      sc.TB(`巻き上げ ${total - game.wordsLeft + 1}/${total}`, LW / 2, 84, 12, C.w, 'center');
      this.bigWord(sc, game.word.text, game.word.kana, game, 112, C.blue);
      // テンション：ミスでたまり、満タンで糸が切れる
      sc.panel(340, 44, 130, 30, 'rgba(42,27,38,0.9)', game.tension >= 2 ? C.red : C.blue);
      sc.T('糸のテンション', 348, 48, 9, C.cream);
      for (let i = 0; i < FISHING.breakAt; i++) sc.PR(348 + i * 38, 61, 34, 7, i < game.tension ? C.red : C.ink);
    } else if (game.phase === 'wait') {
      sc.TB('浮きを見つめている…', LW / 2, 196, 13, C.cream, 'center');
    }
    sc.TB('釣れたらすぐ次の言葉！ 速く打つほど大漁。巻き上げ中は３ミスで糸が切れる', LW / 2, 236, 9, C.cream, 'center');
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
      const h = 32;
      const w = Math.max(60, sc.W(m.typed + m.remaining, 10) + 14, sc.W(p.word.text, 12) + 14);
      const spriteH = p.kind === 'deer' ? 48 : 24;
      const deer = p.kind === 'deer';
      // 大物の頭上は中段の小物の走路。横に寄せて、その小物を枠で隠さない。
      const sideX = pos.x - 34 - w >= 4 ? pos.x - 34 - w : pos.x + 34;
      const box = { x: Math.max(4, Math.min(LW - w - 4, deer ? sideX : pos.x - w / 2)),
        y: deer ? pos.y - spriteH + 8 : pos.y - spriteH - h - 8, w, h };
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
      sc.T(p.word.text, cx, box.y + 2, 12, dim ? '#a89a90' : C.w, 'center');
      sc.roma(m.typed, m.remaining, cx, box.y + 18, 10, live ? 'active' : dim ? 'dim' : 'idle');
      for (let i = 0; i < p.maxHp; i++) sc.PR(cx - p.maxHp * 4 + i * 8, box.y - 5, 6, 3, i < p.hp ? C.pink : C.ink);
      if (p.kind === 'deer') sc.TB('大物 肉×12', cx, box.y - 16, 9, C.gold3, 'center');
    }
    sc.TB('最初の文字で狙いが決まる。左の柵を越えられると逃げられる', LW / 2, 236, 9, C.ink, 'center', C.sand3);
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
      const w = Math.max(92, sc.W(m.typed + m.remaining, 10) + 12);
      // 絵があるときは芽のすぐ上に置き、前の列の芽を隠さない
      const top = pos.y - (this.art ? AMBER.gathering.sprout.size + 31 : 70);
      if (live) sc.glow(pos.x - w / 2, top, w, 30);
      sc.panel(pos.x - w / 2, top, w, 30, live ? '#4a2c3c' : bad ? '#3a1e48' : '#241820', live ? C.gold : dim ? '#5a4a40' : bad ? C.purple : C.green);
      sc.T((bad ? '☠ ' : '') + s.word.text, pos.x, top + 2, 11, dim ? '#a89a90' : bad ? '#e0c8ff' : C.w, 'center');
      sc.roma(m.typed, m.remaining, pos.x, top + 17, 10, live ? 'active' : dim ? 'dim' : 'idle');
      sc.PR(pos.x - w / 2 + 4, top + 28, (w - 8) * (s.life / s.maxLife), 1.5, bad ? C.purple : C.green3);
    }
    sc.panel(100, 234, 370, 15, 'rgba(42,27,38,0.88)', C.green);
    sc.T(`食べられるものだけ打つ（1回で${GATHER.perPick}つ）。☠ は${GATHER.poisonLoss}つ失う`, 285, 238, 8, C.cream, 'center');
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
    // 競りに出た品物
    sc.panel(LW / 2 - 100, 42, 200, 32, 'rgba(42,27,38,0.92)', C.gold2);
    if (this.art) this.art.drawIcon(sc, 'icons-dishes', ICON_INDEX[lot.item], LW / 2 - 94, 44, 26);
    else sc.spr(ICON[lot.item], LW / 2 - 92, 46, 2);
    sc.TB(`${INGREDIENT_NAME[lot.item]} ${TRADING.win}箱を競り中`, LW / 2 + 10, 50, 13, C.w, 'center');
    if (lot.outcome === 'open') {
      this.bigWord(sc, lot.word.text, lot.word.kana, game, 80, C.gold2);
      // 自分とライバルの進み具合
      const live = game.input.active[0];
      const mine = live ? live.matcher.kanaPos / lot.word.kana.length : 0;
      const labelCol = this.art ? C.w : C.ink;
      if (this.art) sc.panel(104, 136, 264, 31, 'rgba(42,27,38,0.88)', C.gold2);
      sc.T('あなた', 112, 140, 10, labelCol);
      sc.PR(160, 141, 200, 8, C.ink);
      sc.PR(160, 141, 200 * mine, 8, C.teal);
      sc.T('ライバル', 112, 154, 10, labelCol);
      sc.PR(160, 155, 200, 8, C.ink);
      sc.PR(160, 155, 200 * lot.rival, 8, C.red);
    }
    sc.TB(`落札 ${game.wins}　取られた ${game.losses}`, 380, 82, 10, C.w, 'left');
    sc.TB('ライバルより先に品物の名前を打ち切れば落札。ミスなしならおまけ1箱', LW / 2, this.art ? 236 : 226, 9, C.w, 'center');
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
    // 魚影（あたり・巻き上げ中だけ）
    const b = this.bobberPos(game);
    if (game.phase === 'hook' || game.phase === 'reel') {
      const w = game.big ? 56 : 24;
      sc.PR(b.x - w / 2 + 8, b.y + 10, w, game.big ? 12 : 6, '#0e2236', 0.45);
      sc.PR(b.x + w / 2 + 8, b.y + 11, game.big ? 10 : 5, game.big ? 10 : 4, '#0e2236', 0.45);
    }
    // 板面への接地影。足元より下の桟橋側面や支柱には落とさない。
    sc.PR(L.wife.x - 8, L.wife.y - 1, 16, 2, '#332313', 0.28);
    // 女将（竿までが画像。糸と浮きは別描画）
    const anim = art.anim('wife-fishing', '釣り・待機');
    const idx = frameAt(anim, t) ?? anim.frames[0];
    const k = art.scaleFor('wife-fishing', anim.frames[0], L.wife.h);
    art.drawFrame(sc, 'wife-fishing', idx, L.wife.x, L.wife.y, k);
    // 仕掛けの下端から水面の浮きまで糸を張る（巻き上げ中はぴんと張る）
    const f = art.frame('wife-fishing', idx);
    const [lx, ly] = L.lure[idx] ?? L.lure[0];
    const sx = L.wife.x + (lx - f.registration[0]) * k;
    const sy = L.wife.y + (ly - f.registration[1]) * k;
    const sag = game.phase === 'reel' ? 2 : 9;
    const n = Math.ceil(Math.hypot(b.x - sx, b.y - sy) / 1.5);
    for (let i = 0; i <= n; i++) {
      const p = i / n;
      sc.PR(sx + (b.x - sx) * p, sy + (b.y - 4 - sy) * p + Math.sin(p * Math.PI) * sag, 0.6, 0.6, '#f4ead0', 0.85);
    }
    // 浮き
    art.drawFrame(sc, 'props-actions', 14, b.x, b.y, art.scaleFor('props-actions', 14, L.bobber.h));
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
