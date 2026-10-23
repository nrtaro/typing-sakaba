import { C, TRIP_COLOR, mix, type Color } from './palette';
import { Screen, LW, LH } from './screen';
import { CRATE, DEER, FAM, ICON, MERCHANT, PORTRAIT, RABBIT } from './sprites';
import { pen, SKY } from './room';
import {
  FishingGame, GatheringGame, HuntingGame, TradingGame, GATHER_SLOTS, type Minigame, type MinigameEvent, type Prey, type Sprout,
} from '../core/minigames';
import { RomajiMatcher } from '../core/romaji';
import { FAMILY_NAME, INGREDIENT_NAME, TRIPS, type IngredientId } from '../core/shopConfig';
import type { Shop } from '../core/shop';

type G = CanvasRenderingContext2D;
interface Pop { x: number; y: number; t: number; text: string; col: Color }

const SLOT_POS = Array.from({ length: GATHER_SLOTS }, (_, i) => ({ x: 170 + (i % 3) * 110, y: i < 3 ? 128 : 196 }));

function preyPos(p: Prey) {
  return { x: 70 + p.x * 400, y: 128 + p.lane * 92 };
}

/** 調達ミニゲームの画面 */
export class MinigameView {
  pops: Pop[] = [];
  missFlash = 0;
  splash = 0;

  handle(ev: MinigameEvent, game: Minigame<unknown>) {
    if (ev.type === 'key' && !ev.ok) this.missFlash = 0.25;
    if (ev.type === 'bite') this.splash = 0.6;
    if (ev.type === 'gain' || ev.type === 'loss') {
      const p = this.anchor(game, ev);
      const text = ev.type === 'gain' ? `+${ev.amount} ${INGREDIENT_NAME[ev.ingredient]}` : `-1 ${INGREDIENT_NAME[ev.ingredient]}`;
      this.pops.push({ ...p, t: 0, text, col: ev.type === 'gain' ? C.gold3 : C.red3 });
    }
  }

  private anchor(game: Minigame<unknown>, ev: { x: number; y: number }) {
    if (game instanceof HuntingGame) return { x: 70 + ev.x * 400, y: 110 + ev.y * 92 };
    if (game instanceof GatheringGame) return { x: SLOT_POS[ev.x]?.x ?? 240, y: (SLOT_POS[ev.x]?.y ?? 150) - 30 };
    if (game instanceof TradingGame) return { x: 100 + ev.y * 50, y: 140 };
    return { x: 290, y: 130 };
  }

  update(dt: number) {
    this.missFlash = Math.max(0, this.missFlash - dt);
    this.splash = Math.max(0, this.splash - dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.2);
  }

  draw(sc: Screen, game: Minigame<unknown>, shop: Shop, t: number) {
    const g = sc.g;
    g.clearRect(0, 0, LW, LH);
    if (game instanceof FishingGame) this.drawFishingBg(g, game, shop.phaseIndex, t);
    else if (game instanceof HuntingGame) this.drawHuntingBg(g, game, t);
    else if (game instanceof GatheringGame) this.drawGatheringBg(g, game, t);
    else if (game instanceof TradingGame) this.drawTradingBg(g, game, t);
    sc.present();
    if (game instanceof FishingGame) this.drawFishingUi(sc, game);
    else if (game instanceof HuntingGame) this.drawHuntingUi(sc, game);
    else if (game instanceof GatheringGame) this.drawGatheringUi(sc, game);
    else if (game instanceof TradingGame) this.drawTradingUi(sc, game);
    this.drawHud(sc, game, shop);
    for (const p of this.pops) sc.TB(p.text, p.x, p.y - p.t * 18, 9, p.col, 'center', C.ink, Math.min(1, (1.2 - p.t) * 3));
    if (game.input.typed) sc.TB(game.input.typed, LW / 2, 252, 9, C.w, 'center', C.ink, 0.5);
    if (this.missFlash > 0) {
      sc.PR(0, 0, LW, 2, C.red, this.missFlash * 3);
      sc.PR(0, LH - 2, LW, 2, C.red, this.missFlash * 3);
    }
  }

  private drawHud(sc: Screen, game: Minigame<unknown>, shop: Shop) {
    const trip = TRIPS.find((x) => x.id === game.kind)!;
    const col = TRIP_COLOR[trip.id];
    sc.panel(4, 3, 472, 20, col.dark, col.main);
    sc.spr(PORTRAIT[trip.who], 9, 6);
    sc.TB(`${FAMILY_NAME[trip.who]}の${trip.act}`, 26, 6, 10, C.w, 'left');
    const tl = game.timeLeft;
    sc.PR(150, 10, 120, 6, C.ink);
    sc.PR(150, 10, 120 * (tl / game.duration), 6, tl < 3 ? C.red : col.main);
    sc.T(`残り ${tl.toFixed(1)}秒`, 276, 8, 7, C.cream);
    let x = 340;
    for (const id of trip.gives) {
      sc.spr(ICON[id], x, 7, 1);
      sc.TB(`×${game.gains[id] ?? 0}`, x + 14, 6, 9, C.w, 'left');
      x += 46;
    }
    const left = shop.timeLeft;
    sc.TB(`お店の残り ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}（お客の待ち時間は止まっています）`, LW / 2, 26, 6, C.cream, 'center');
  }

  /** 中央下の大きな語句（1つだけ打つミニゲーム用） */
  private bigWord(sc: Screen, text: string, kana: string, game: Minigame<unknown>, y: number, col: Color) {
    const live = game.input.active[0];
    const m = live?.matcher ?? new RomajiMatcher(kana);
    const w = Math.max(160, sc.W(text, 16) + 40);
    sc.panel(LW / 2 - w / 2, y, w, 44, 'rgba(42,27,38,0.94)', live ? C.gold : col);
    sc.TB(text, LW / 2, y + 5, 16, C.w, 'center');
    sc.roma(m.typed, m.remaining, LW / 2, y + 28, 10, 'active');
  }

  // ---------- つり ----------

  private drawFishingBg(g: G, game: FishingGame, ph: number, t: number) {
    const R = pen(g);
    const sky = SKY[ph];
    for (let y = 0; y < 130; y++) R(0, y, LW, 1, mix(sky[0], sky[1], y / 130));
    const far = ph === 2 ? '#2b2650' : '#8e9ab4';
    for (let i = 0; i < 14; i++) R(i * 36 + ((i * 13) % 11), 130 - (20 + ((i * 29) % 40)), 22, 20 + ((i * 29) % 40), far);
    for (let y = 130; y < LH; y++) R(0, y, LW, 1, mix(ph === 2 ? '#24305a' : '#3c8296', '#173a52', (y - 130) / 140));
    // さざ波：静けさがたまるほど穏やか
    const n = Math.max(6, 28 - game.calm * 9);
    for (let i = 0; i < n; i++) {
      const y = 136 + ((i * 37) % 130);
      const x = (((i * 97) + t * (10 + (i % 5) * 4)) % (LW + 30)) - 15;
      R(x, y, 6 + (i % 4) * 3, 1, '#8cc8d4');
    }
    // 桟橋とおかみ
    R(0, 160, 120, 8, C.wood3); R(0, 160, 120, 1, C.wood5); R(0, 167, 120, 2, C.wood1);
    for (const px of [12, 54, 100]) R(px, 168, 6, 60, C.wood1);
    g.drawImage(FAM.wife[0], 78, 136, FAM.wife[0].width, FAM.wife[0].height);
    // 竿と糸と浮き
    const hooked = game.phase === 'hooked';
    const bend = hooked ? 6 + Math.sin(t * 12) * 2 : 0;
    const tipX = 150;
    const tipY = 108 + bend;
    for (let k = 0; k <= 20; k++) R(92 + (tipX - 92) * (k / 20), 146 + (tipY - 146) * (k / 20), 1, 1, C.wood1);
    const bx = 290;
    const by = 160 + (hooked ? 3 + Math.sin(t * 15) : Math.sin(t * 2.5));
    for (let k = 0; k <= 40; k++) R(tipX + (bx - tipX) * (k / 40), tipY + (by - tipY) * (k / 40) + Math.sin((k / 40) * Math.PI) * 8, 1, 1, C.cream);
    R(bx - 2, by - 5, 5, 4, C.red); R(bx - 2, by - 1, 5, 2, C.w);
    if (this.splash > 0) for (let i = 0; i < 6; i++) R(bx - 12 + i * 5, by - 4 - Math.sin(i + this.splash * 10) * 6 * this.splash, 2, 2, C.w);
    if (hooked) {
      g.save();
      g.globalAlpha = 0.5;
      const w = game.big ? 40 : 18;
      R(bx - w / 2 + 6, by + 12, w, game.big ? 10 : 5, '#0e2236');
      g.restore();
    }
  }

  private drawFishingUi(sc: Screen, game: FishingGame) {
    // 静けさゲージ
    sc.panel(12, 40, 120, 30, 'rgba(42,27,38,0.9)', C.blue);
    sc.T('水面の静けさ', 18, 43, 7, C.cream);
    for (let i = 0; i < game.calmToBig; i++) sc.PR(18 + i * 26, 56, 22, 6, game.calm > i ? C.teal : C.ink);
    sc.T('ミスなしで満タン→大物', 72, 56, 5, C.cream, 'left', 0.8);
    if (game.phase === 'hooked' && game.word) {
      if (game.big) sc.TB(`大物！ あと${game.wordsLeft}つ`, LW / 2, 172, 10, C.gold3, 'center');
      this.bigWord(sc, game.word.text, game.word.kana, game, 192, C.blue);
    } else {
      sc.TB(game.phase === 'land' ? '釣れた！' : '浮きを見つめている…', LW / 2, 205, 10, C.cream, 'center');
    }
  }

  // ---------- かり ----------

  private drawHuntingBg(g: G, game: HuntingGame, t: number) {
    const R = pen(g);
    for (let y = 0; y < 110; y++) R(0, y, LW, 1, mix('#3a2a55', '#ea8f58', y / 110));
    R(0, 80, LW, 8, '#5a3a55'); R(0, 88, LW, 2, '#2a1b26');
    for (const x of [40, 160, 280, 400]) R(x, 90, 10, 30, '#5a3a55');
    for (let x = 0; x < LW; x++) {
      const y = Math.round(108 + Math.sin(x / 50) * 6);
      R(x, y, 1, LH - y, C.sand2);
    }
    for (let y = 116; y < LH; y += 6) R(0, y, LW, 1, mix(C.sand, C.sand2, (y - 116) / 160));
    for (let i = 0; i < 40; i++) R((i * 113) % LW, 120 + ((i * 47) % 140), 4, 1, C.sand3);
    // 逃げられるライン（柵）
    for (let y = 112; y < LH; y += 10) { R(56, y, 2, 8, C.wood1); R(54, y + 3, 6, 1, C.wood2); }
    // マスター（しゃがんで構える）
    g.drawImage(FAM.master[0], 14, 186);
    R(30, 196, 26, 2, C.gray2); R(52, 195, 4, 1, C.gray);
    for (const p of [...game.prey].sort((a, b) => a.lane - b.lane)) {
      const pos = preyPos(p);
      const frame = Math.floor(t * 8) % 2;
      const img = p.kind === 'deer' ? DEER[frame] : RABBIT[frame];
      if (p.flash > 0 && Math.floor(p.flash * 30) % 2 === 0) continue;
      g.save();
      g.globalAlpha = 0.25;
      g.fillStyle = '#2a1520';
      g.fillRect(Math.round(pos.x - img.width / 2 + 2), Math.round(pos.y), img.width - 4, 3);
      g.restore();
      g.drawImage(img, Math.round(pos.x - img.width / 2), Math.round(pos.y - img.height));
    }
  }

  private drawHuntingUi(sc: Screen, game: HuntingGame) {
    const active = game.input.active;
    for (const p of game.prey) {
      const pos = preyPos(p);
      const live = active.find((l) => l.target.id === p.id);
      const dim = game.input.typed.length > 0 && !live;
      const m = live?.matcher ?? new RomajiMatcher(p.word.kana);
      const top = pos.y - (p.kind === 'deer' ? 50 : 38);
      const w = Math.max(44, sc.W(m.typed + m.remaining, 7) + 10);
      sc.panel(pos.x - w / 2, top, w, 22, live ? '#4a2c3c' : 'rgba(42,27,38,0.9)', live ? C.gold : p.kind === 'deer' ? C.gold2 : C.wood4, dim ? 0.5 : 1);
      sc.T(p.word.text, pos.x, top + 1, 8, dim ? C.gray : C.w, 'center');
      sc.roma(m.typed, m.remaining, pos.x, top + 12, 7, live ? 'active' : dim ? 'dim' : 'idle');
      for (let i = 0; i < p.maxHp; i++) sc.PR(pos.x - p.maxHp * 3 + i * 6, top - 4, 4, 2, i < p.hp ? C.pink : C.ink);
    }
    sc.T('最初の文字で狙いが決まる。左の柵を越えられると逃げられる', LW / 2, 236, 6, C.ink, 'center');
  }

  // ---------- さいしゅ ----------

  private drawGatheringBg(g: G, game: GatheringGame, t: number) {
    const R = pen(g);
    R(0, 0, LW, LH, '#cfe8d4');
    for (let x = 0; x < LW; x += 40) R(x, 0, 2, 100, '#9ac0a4');
    for (let y = 0; y < 100; y += 25) R(0, y, LW, 2, '#9ac0a4');
    for (let i = 0; i < 12; i++) R(i * 41 + 8, 6 + (i % 3) * 25, 10, 3, '#f4fff4');
    R(0, 96, LW, LH - 96, '#6a4a32');
    for (let y = 100; y < LH; y += 8) R(0, y, LW, 2, '#5a3c28');
    for (const s of SLOT_POS) { R(s.x - 34, s.y + 4, 68, 8, '#4a3020'); R(s.x - 32, s.y + 4, 64, 2, '#7a5a3a'); }
    // 看板娘とかご
    g.drawImage(FAM.daughter[Math.floor(t * 2) % 2 ? 0 : 0], 38, 180);
    R(56, 192, 20, 12, C.wood3); R(56, 192, 20, 2, C.wood5); R(58, 195, 16, 1, C.wood2);
    const veg = game.gains.veg ?? 0;
    const mush = game.gains.mush ?? 0;
    for (let i = 0; i < Math.min(veg + mush, 8); i++) R(58 + (i % 4) * 4, 189 - Math.floor(i / 4) * 3, 3, 3, i < veg ? C.gold2 : C.red);
    for (const s of game.sprouts) {
      const pos = SLOT_POS[s.slot];
      const grow = Math.min(1, (s.maxLife - s.life) * 4);
      const icon = s.ing ? ICON[s.ing] : ICON.poison;
      const sz = Math.round(24 * grow);
      if (sz > 0) g.drawImage(icon, pos.x - sz / 2, pos.y + 4 - sz, sz, sz);
    }
  }

  private drawGatheringUi(sc: Screen, game: GatheringGame) {
    const active = game.input.active;
    for (const s of game.sprouts as Sprout[]) {
      const pos = SLOT_POS[s.slot];
      const live = active.find((l) => l.target.id === s.id);
      const dim = game.input.typed.length > 0 && !live;
      const m = live?.matcher ?? new RomajiMatcher(s.word.kana);
      const top = pos.y - 52;
      const bad = !s.ing;
      sc.panel(pos.x - 36, top, 72, 24, live ? '#4a2c3c' : bad ? '#3a1e48' : 'rgba(42,27,38,0.9)', live ? C.gold : bad ? C.purple : C.green, dim ? 0.5 : 1);
      sc.T((bad ? '☠ ' : '') + s.word.text, pos.x, top + 2, 8, bad ? '#e0c8ff' : dim ? C.gray : C.w, 'center');
      sc.roma(m.typed, m.remaining, pos.x, top + 13, 7, live ? 'active' : dim ? 'dim' : 'idle');
      sc.PR(pos.x - 30, top + 22, 60 * (s.life / s.maxLife), 1.5, bad ? C.purple : C.green3);
    }
    sc.panel(140, 236, 300, 14, 'rgba(42,27,38,0.85)', C.green);
    sc.T('食べられるものだけ打って摘む（1回で4つ）。☠ 毒きのこを打つとかごから2つこぼれる', 290, 239, 6, C.cream, 'center');
  }

  // ---------- しいれ ----------

  private drawTradingBg(g: G, game: TradingGame, t: number) {
    const R = pen(g);
    for (let y = 0; y < 120; y++) R(0, y, LW, 1, mix('#f6c27a', '#fbe8c0', y / 120));
    R(380, 30, 18, 18, '#fff3c0');
    for (let x = 0; x < LW; x++) { const y = Math.round(112 + Math.sin(x / 70) * 5); R(x, y, 1, LH - y, C.sand); }
    for (let y = 130; y < LH; y += 7) R(0, y, LW, 1, C.sand2);
    // 隊商の荷車
    R(250, 96, 170, 70, '#c8a878'); R(250, 96, 170, 6, '#e8d0a0');
    for (let x = 258; x < 420; x += 22) R(x, 96, 2, 70, '#a88858');
    R(244, 164, 182, 8, C.wood1);
    for (const wx of [276, 392]) { R(wx - 14, 166, 28, 28, C.wood0); R(wx - 10, 170, 20, 20, C.wood3); R(wx - 2, 178, 4, 4, C.wood0); }
    for (let i = 0; i < 6; i++) g.drawImage(CRATE, 300 + (i % 3) * 20, 148 - Math.floor(i / 3) * 16, 20, 16);
    g.drawImage(MERCHANT, 336, 158, MERCHANT.width * 2, MERCHANT.height * 2);
    g.drawImage(FAM.master[Math.floor(t * 2) % 2 ? 0 : 0], 80, 160, FAM.master[0].width * 2, FAM.master[0].height * 2);
    // 値切って手に入れた箱
    const ale = game.gains.ale ?? 0;
    const spice = game.gains.spice ?? 0;
    for (let i = 0; i < Math.min(ale + spice, 12); i++) {
      const x = 20 + (i % 4) * 14;
      const y = 238 - Math.floor(i / 4) * 12;
      g.drawImage(CRATE, x, y, 14, 11);
      g.drawImage(i < ale ? ICON.ale : ICON.spice, x + 3, y + 2, 8, 8);
    }
  }

  private drawTradingUi(sc: Screen, game: TradingGame) {
    sc.panel(300, 64, 150, 24, 'rgba(42,27,38,0.9)', C.gold2);
    sc.T('商人「さあ、いくらで買う？」', 375, 71, 7, C.cream, 'center');
    this.bigWord(sc, game.word.text, game.word.kana, game, 194, C.gold2);
    sc.TB('打ち切るたびに酒か香辛料が1箱。ミスなしならおまけでもう1箱', LW / 2, 242, 6, C.cream, 'center');
  }
}

export { type IngredientId };
