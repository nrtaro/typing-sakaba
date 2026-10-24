import { comboFx } from './comboFx';

/** 紙吹雪と最大コンボの色（順に巡らせる） */
const CONFETTI = ['#ffd25c', '#ff7fb0', '#7fc8ff', '#7ff0d8', '#e07cff', '#fff7ea', '#ffa35c'];
import { C, TRIP_COLOR, type Color } from './palette';
import { Screen, LW } from './screen';
import { FAM, guestSprite, ICON, PORTRAIT, WALKERS } from './sprites';
import { drawChair, drawLights, drawRoomLive, drawTable, pen, roomLayer, shadow } from './room';
import { Shop, type Guest, type ShopEvent } from '../core/shop';
import type { Art } from './amber/art';
import { animLength, walkFrame } from './amber/manifest';
import { entryPose, WALK_SPEED, SERVER_WALK_SPEED, serverWalkSpeed } from '../core/tavernNavigation';
import { AMBER, ICON_INDEX, ORDER_CARD, TAVERN_SEATS, dishIcon } from './amber/layout';
import { RomajiMatcher } from '../core/romaji';
import {
  DAY_LENGTH, FAMILY_NAME, PHASES, SHOP, SOURCE, TRIPS, type FamilyId, type IngredientId, type TripId,
} from '../core/shopConfig';

/** 席の位置（斜め上視点：2列×4席）。ty はテーブルの高さ */
export const SEATS = TAVERN_SEATS;
const DOOR = { x: 452, y: 202 };
const HOME: Record<'wife' | 'daughter', { x: number; y: number }> = { wife: { x: 158, y: 152 }, daughter: { x: 158, y: 182 } };

interface Server {
  x: number; y: number; tx: number; ty: number; carry: number; moving: boolean;
  /** 向き：絵は右向きなので、左へ進むときに反転する */
  flip: boolean;
  /** 動きが始まった時刻（この画面の時計）。一回再生の動きは開始からの経過で再生する */
  walkStart: number;
  distance: number;
  /** 配膳に向かっている／配膳中 */
  serving: boolean;
  serveStart: number | null;
  /** 通り道（席の列を横切らないよう、列の間の通路を通る） */
  path: { x: number; y: number }[];
  jobs: { seat: number; guest: Guest }[];
}
interface Exit { look: number; x: number; y: number; start: number; distance: number; path: { x: number; y: number }[] }
interface Fx { anim: string; x: number; y: number; h: number; start: number }
interface Pop { x: number; y: number; t: number; text: string; col: Color; big?: boolean; slot?: string; count?: number }
interface FxBounds { x: number; y: number; w: number; h: number }
interface Spark { bounds?: FxBounds; x: number; y: number; vx: number; vy: number; t: number; col: Color }

/** 営業画面の見た目の状態（演出用。ゲームの計算には影響しない） */
export class ShopView {
  servers: Record<'wife' | 'daughter', Server> = {
    wife: { ...HOME.wife, tx: HOME.wife.x, ty: HOME.wife.y, carry: 0, moving: false, flip: false, walkStart: 0, distance: 0, serving: false, serveStart: null, path: [], jobs: [] },
    daughter: { ...HOME.daughter, tx: HOME.daughter.x, ty: HOME.daughter.y, carry: 0, moving: false, flip: false, walkStart: 0, distance: 0, serving: false, serveStart: null, path: [], jobs: [] },
  };
  /** 画像素材（読み込めなかったときは null で、コードで描く絵を使う） */
  art: Art | null = null;
  /** この画面の時計。一時停止中は進まない（update が呼ばれない）ので、アニメーションも止まる */
  time = 0;
  /** 急な増減で歩きが跳ねないよう、客数に応じた目標歩速へ滑らかに近づける。 */
  serverSpeed = SERVER_WALK_SPEED;
  /** おやじが鍋を混ぜ続ける時刻 */
  stirUntil = 0;
  /** 店を出ていく客（演出のみ） */
  exits: Exit[] = [];
  /** 一回再生の演出（きらめきなど） */
  fxs: Fx[] = [];
  private prevSeats: (Guest | null)[] = [];
  pops: Pop[] = [];
  sparks: Spark[] = [];
  missFlash = 0;
  comboBurst = 0;
  /** はじめての営業の案内（注文を打つ／調達する）。null なら出さない */
  guide: 'order' | 'supply' | null = null;
  comboAnchor = { x: 0, y: 0 };
  comboCount = 0;
  /** コンボの全体演出：画面の一瞬の光・揺れ・紙吹雪・中央の掛け声 */
  private comboFlash = 0;
  private flashPeak = 0;
  private shakeT = 0;
  private shakeAmp = 0;
  private confetti: { x: number; y: number; vx: number; vy: number; t: number; life: number; col: string; spin: number }[] = [];
  private callout: { text: string; t: number; col: string; level: number } | null = null;
  lackTrip: { id: TripId; t: number } | null = null;
  gotTrip: { id: TripId; t: number; gains: Partial<Record<IngredientId, number>> } | null = null;
  /** 出かけている／帰ってきた家族のひとこと */
  banner: { text: string; t: number; col: Color } | null = null;

  private pop(slot: string, p: Pop) {
    this.pops = this.pops.filter(old => old.slot !== slot);
    this.pops.push({ ...p, slot });
  }

  handle(ev: ShopEvent, shop: Shop) {
    switch (ev.type) {
      case 'key':
        if (!ev.ok) this.missFlash = 0.25;
        else for (const l of shop.input.active) this.sparkAt(this.targetPos(l.target.id), shop.input.active.length === 1 ? C.gold : C.cream, 2);
        break;
      case 'serve': {
        const seat = SEATS[ev.seat];
        const who = this.pickServer(shop, ev.seat);
        if (who) {
          const s = this.servers[who];
          const guest = shop.seats[ev.seat]!;
          if (this.art) {
            guest.awaitingDelivery = true;
            s.jobs.push({ seat: ev.seat, guest });
          } else {
            this.go(s, seat.x - 18, seat.ty + 6);
            s.carry = 1.1;
            s.serving = true;
            s.serveStart = null;
          }
        }
        if (ev.combo >= 1) {
          const fx = comboFx(ev.combo);
          this.flashPeak = fx.flash;
          this.comboFlash = fx.flash ? 0.18 : 0;
          if (fx.shake) { this.shakeT = 0.3; this.shakeAmp = fx.shake; }
          for (let i = 0; i < fx.confetti; i++) {
            this.confetti.push({
              x: Math.random() * 480, y: -10 - Math.random() * 40, vx: (Math.random() - 0.5) * 30, vy: 40 + Math.random() * 50,
              t: 0, life: 1.6 + Math.random() * 0.8, col: CONFETTI[i % CONFETTI.length], spin: Math.random() * 6,
            });
          }
          if (this.confetti.length > 160) this.confetti.splice(0, this.confetti.length - 160);
          if (fx.callout) this.callout = { text: fx.callout, t: 0, col: fx.color, level: fx.level };
          const y = seat.ty - (this.art ? ORDER_CARD.offset : 70);
          this.comboCount = ev.combo;
          this.comboAnchor = { x: seat.x, y: y + 20 };
          this.comboBurst = fx.duration;
          const col = fx.color;
          const bounds = { x: seat.x - 30, y, w: 60, h: 58 };
          this.sparkAt({ x: seat.x, y: y + 28 }, col, Math.ceil(fx.particles / 2), fx.spread, bounds);
          this.sparkAt({ x: seat.x, y: y + 28 }, C.gold3, Math.floor(fx.particles / 2), fx.spread * 0.8, bounds);
          this.pop('combo', { x: seat.x, y, t: 0, text: `${ev.combo} COMBO`, col, count: ev.combo });
        }
        this.stirUntil = this.time + 2.4;
        this.fxs.push({ anim: 'きらめき', x: seat.x, y: seat.ty - 8, h: 22, start: this.time });
        this.pop('income', { x: seat.x, y: seat.ty - 18, t: 0, text: `+${ev.gain}円`, col: C.gold, big: true });
        this.sparkAt({ x: seat.x, y: seat.ty - 20 }, C.gold, 10, 80);
        break;
      }
      case 'lack': {
        const ls = SEATS[ev.seat];
        this.pop('warning', { x: ls.x, y: ls.ty - (this.art ? ORDER_CARD.offset : 70) - 6, t: 0, text: '素材が足りない！', col: '#ff6a5a', big: true });
        this.lackTrip = { id: SOURCE[ev.missing[0]], t: 1.4 };
        break;
      }
      case 'angry': {
        const as = SEATS[ev.seat];
        this.pop('angry', { x: as.x, y: as.ty - 22, t: 0, text: 'プンプン！', col: '#ff6a5a', big: true });
        break;
      }
      case 'tripStart':
        if (ev.trip.who === 'wife' || ev.trip.who === 'daughter') {
          const away = this.servers[ev.trip.who];
          const other = this.servers[ev.trip.who === 'wife' ? 'daughter' : 'wife'];
          other.jobs.push(...away.jobs.splice(0));
          away.serving = false;
          away.serveStart = null;
          this.go(away, HOME[ev.trip.who].x, HOME[ev.trip.who].y);
        }
        this.banner = { text: `${FAMILY_NAME[ev.trip.who]}「${ev.trip.act}に行ってくる！」`, t: 1.6, col: C.w };
        break;
      case 'tripEnd':
        this.banner = { text: `${FAMILY_NAME[ev.trip.who]}「ただいま！」`, t: 1.6, col: C.gold3 };
        this.gotTrip = { id: ev.trip.id, t: 1.4, gains: ev.gains };
        break;
      case 'phase':
        this.banner = { text: `― ${PHASES[ev.index].name}の部 ―`, t: 1.6, col: C.gold3 };
        break;
      default:
        break;
    }
  }

  private pickServer(shop: Shop, seat: number): 'wife' | 'daughter' | null {
    const away = shop.away?.who;
    const pref: 'wife' | 'daughter' = seat % 2 ? 'wife' : 'daughter';
    const other = pref === 'wife' ? 'daughter' : 'wife';
    if (away === pref) return away !== other ? other : null;
    if (away === other) return pref;
    // 担当席は同数のときの優先順。配膳待ちが偏るときは空いている家族へ。
    return this.servers[pref].jobs.length <= this.servers[other].jobs.length ? pref : other;
  }

  targetPos(id: string): { x: number; y: number } {
    if (id.startsWith('seat:')) {
      const s = SEATS[Number(id.slice(5))];
      return { x: s.x, y: s.ty - 52 };
    }
    const i = TRIPS.findIndex((t) => `trip:${t.id}` === id);
    return { x: 60 + i * 118, y: 222 };
  }

  private sparkAt(p: { x: number; y: number }, col: Color, n: number, spread = 30, bounds?: FxBounds) {
    for (let i = 0; i < n; i++) {
      this.sparks.push({ bounds, x: p.x + (Math.random() - 0.5) * 20, y: p.y, vx: (Math.random() - 0.5) * spread, vy: -20 - Math.random() * spread / 2, t: 0, col });
    }
  }

  /** 行き先を決める。客席の列を斜めに横切らず、列の間の通路を通って行く */
  private go(s: Server, x: number, y: number) {
    const AISLE = 156;
    s.tx = x;
    s.ty = y;
    s.path = [];
    if (Math.abs(s.y - AISLE) > 2 && Math.abs(x - s.x) > 1) s.path.push({ x: s.x, y: AISLE });
    if (Math.abs(x - s.x) > 1) s.path.push({ x, y: AISLE });
    s.path.push({ x, y });
  }

  update(dt: number, shop?: Shop) {
    this.time += dt;
    const targetSpeed = serverWalkSpeed(shop?.seats.filter(g => g !== null).length ?? 0);
    this.serverSpeed += (targetSpeed - this.serverSpeed) * (1 - Math.exp(-dt / 0.18));
    this.missFlash = Math.max(0, this.missFlash - dt);
    this.comboBurst = shop && shop.combo < 1 ? 0 : Math.max(0, this.comboBurst - dt);
    this.comboFlash = Math.max(0, this.comboFlash - dt);
    this.shakeT = Math.max(0, this.shakeT - dt);
    for (const c of this.confetti) { c.t += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= 0.99; }
    this.confetti = this.confetti.filter((c) => c.t < c.life && c.y < 280);
    if (this.callout && (this.callout.t += dt) > 1.1) this.callout = null;
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.3);
    for (const p of this.sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; }
    this.sparks = this.sparks.filter((p) => p.t < 0.7);
    if (this.lackTrip && (this.lackTrip.t -= dt) <= 0) this.lackTrip = null;
    if (this.gotTrip && (this.gotTrip.t -= dt) <= 0) this.gotTrip = null;
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    const serveLen = this.art ? animLength(this.art.anim('family-wife', '配膳')) : 1.1;
    for (const k of ['wife', 'daughter'] as const) {
      const s = this.servers[k];
      if (shop?.away?.who === k) continue;
      if (this.art && !s.serving && !s.moving && s.jobs.length && Math.hypot(s.x - HOME[k].x, s.y - HOME[k].y) < 1) {
        const seat = SEATS[s.jobs[0].seat];
        this.go(s, seat.x - 24, seat.ty + 6);
        s.serving = true;
        s.serveStart = null;
      }
      while (s.path.length > 1 && Math.hypot(s.path[0].x - s.x, s.path[0].y - s.y) <= 1) s.path.shift();
      const to = s.path[0] ?? { x: s.tx, y: s.ty };
      const dx = to.x - s.x;
      const dy = to.y - s.y;
      const d = Math.hypot(dx, dy);
      const wasMoving = s.moving;
      s.moving = d > 1;
      if (s.moving) {
        if (!wasMoving) s.walkStart = this.time;
        if (Math.abs(dx) > 0.5) s.flip = dx < 0;
        const sp = Math.min(d, this.serverSpeed * dt);
        s.x += (dx / d) * sp;
        s.y += (dy / d) * sp;
        s.distance += sp;
      }
      s.carry = Math.max(0, s.carry - dt);
      if (s.serving) {
        // 席に着いたら配膳を一回再生し、最後のコマで止めてから戻る
        if (!s.moving && s.serveStart === null) {
          s.serveStart = this.time;
          s.flip = false;
        }
        if (s.serveStart !== null && this.time - s.serveStart >= 0.4 && s.jobs[0]) {
          s.jobs[0].guest.awaitingDelivery = false;
        }
        if (s.serveStart !== null && this.time - s.serveStart >= serveLen + 0.15) {
          s.serving = false;
          s.serveStart = null;
          s.jobs.shift();
          this.go(s, HOME[k].x, HOME[k].y);
        }
      } else if (s.carry <= 0 && !s.moving && (s.tx !== HOME[k].x || s.ty !== HOME[k].y)) {
        this.go(s, HOME[k].x, HOME[k].y);
      }
    }
    // 席が空いたら、その客が入り口へ歩いて出ていく
    if (shop) {
      shop.seats.forEach((g, i) => {
        const prev = this.prevSeats[i];
        if (prev && (!g || g.id !== prev.id) && prev.state !== 'walk') {
          const s = SEATS[i];
          this.exits.push({ look: prev.look, x: s.x, y: s.ty - 2, start: this.time, distance: 0,
            path: [{ x: s.x + 26, y: s.ty - 2 }, { x: s.x + 26, y: 156 }, { x: 430, y: 156 }, DOOR] });
        }
      });
      this.prevSeats = [...shop.seats];
    }
    for (const e of this.exits) {
      while (e.path.length > 1 && Math.hypot(e.path[0].x - e.x, e.path[0].y - e.y) <= 1) e.path.shift();
      const to = e.path[0];
      const dx = to.x - e.x;
      const dy = to.y - e.y;
      const d = Math.hypot(dx, dy);
      const sp = Math.min(d, WALK_SPEED * dt);
      if (d > 0) { e.x += (dx / d) * sp; e.y += (dy / d) * sp; }
      e.distance += sp;
    }
    this.exits = this.exits.filter((e) => Math.hypot(DOOR.x - e.x, DOOR.y - e.y) > 1);
    const art = this.art;
    this.fxs = art ? this.fxs.filter((f) => this.time - f.start < animLength(art.anim('fx', f.anim))) : [];
  }

  // ================= 描画 =================

  draw(sc: Screen, shop: Shop, t: number, reduce: boolean) {
    // コンボが高いときだけ、画面を一瞬だけ揺らす（減衰しながら）
    const k = this.shakeT / 0.3;
    const ox = sc.OX, oy = sc.OY;
    if (k > 0) {
      sc.OX = ox + (Math.random() - 0.5) * 2 * this.shakeAmp * k * sc.S;
      sc.OY = oy + (Math.random() - 0.5) * 2 * this.shakeAmp * k * sc.S;
    }
    try {
      this.drawScene(sc, shop, t, reduce);
    } finally {
      sc.OX = ox;
      sc.OY = oy;
    }
  }

  private drawScene(sc: Screen, shop: Shop, t: number, reduce: boolean) {
    if (this.art) {
      this.drawAmber(sc, shop, this.art);
      this.drawOrders(sc, shop);
      this.drawEdges(sc, shop, t);
      this.drawFx(sc, shop);
      this.drawGuide(sc, shop);
      return;
    }
    const ph = shop.phaseIndex;
    const g = sc.g;
    sc.begin();
    g.drawImage(roomLayer(ph, sc), 0, 0);
    sc.toBase();
    drawRoomLive(g, t, reduce);
    this.drawActors(sc, shop, t);
    drawLights(g, ph, sc);
    sc.present();
    this.drawOrders(sc, shop);
    this.drawEdges(sc, shop, t);
    this.drawFx(sc, shop);
  }

  /** 上の帯はウィンドウの上端に、調達欄は下端に付ける（縦に長いウィンドウでも画面の端に揃う） */
  private drawEdges(sc: Screen, shop: Shop, t: number) {
    const e = sc.ext;
    // 縦に長いウィンドウでは、店内の絵の上下（暗い部分）を帯の地の色で覆い、画面の枠として見せる
    if (e.y0 < 0) {
      sc.PR(e.x0, e.y0, e.w, 26 - e.y0, C.ink);
      sc.PR(e.x0, 26, e.w, 1, C.wood3);
      sc.PR(e.x0, 210, e.w, e.y1 - 210, C.ink);
    }
    sc.shifted(0, e.y0, () => this.drawHud(sc, shop));
    sc.shifted(0, e.y1 - 270, () => this.drawSupply(sc, shop, t));
  }

  private drawActors(sc: Screen, shop: Shop, t: number) {
    const g = sc.g;
    const R = pen(g);
    const away = shop.away?.who as FamilyId | undefined;
    const items: { y: number; d: () => void }[] = [];
    if (away !== 'master') items.push({ y: 104, d: () => g.drawImage(FAM.master[Math.floor(t * 3) % 2], 64, 80 + (Math.floor(t * 2) % 2)) });
    for (const k of ['wife', 'daughter'] as const) {
      if (away === k) continue;
      const s = this.servers[k];
      const img = s.moving ? FAM[k][Math.floor(s.distance / 8) % 2] : FAM[k][0];
      items.push({
        y: s.y,
        d: () => {
          shadow(g, s.x, s.y, 14);
          g.drawImage(img, Math.round(s.x - img.width / 2), Math.round(s.y - img.height + (s.moving ? 0 : Math.floor(t * 2) % 2)));
          if (s.carry > 0) {
            const px = Math.round(s.x + 3);
            const py = Math.round(s.y - img.height + 11);
            R(px - 1, py + 2, 12, 1, '#7a6a72'); R(px, py, 10, 2, C.w); R(px + 2, py - 2, 6, 2, C.gold2); R(px + 3, py - 3, 3, 1, C.gold3);
          }
        },
      });
    }
    SEATS.forEach((seat, i) => {
      const gst = shop.seats[i];
      items.push({
        y: seat.ty,
        d: () => {
          shadow(g, seat.x, seat.ty + 15, 22);
          drawChair(g, seat.x, seat.ty);
          if (gst && gst.state !== 'walk') {
            const mood = gst.state === 'eat' ? 1 : gst.wait / gst.maxWait;
            const bob = gst.state === 'eat' ? Math.floor(t * 4) % 2 : 0;
            g.drawImage(guestSprite(gst.look, mood), seat.x - 8, seat.ty - 24 + bob);
          }
          const plate = gst && gst.state === 'eat'
            ? (gst.dish.need.fish ? C.blue3 : gst.dish.need.meat ? C.red3 : gst.dish.need.ale ? C.gold : C.green3)
            : null;
          drawTable(g, seat.x, seat.ty, plate);
        },
      });
      // 入り口から席へ歩いてくる客
      if (gst && gst.state === 'walk') {
        const p = 1 - Math.max(0, gst.t) / (gst.walkDuration ?? SHOP.walkTime);
        const { x, y, distance } = entryPose(seat, p);
        items.push({ y, d: () => { shadow(g, x - 1, y, 12); g.drawImage(WALKERS[gst.look % WALKERS.length][Math.floor(distance / 8) % 2], Math.round(x - 7), Math.round(y - 20)); } });
      }
    });
    shop.queue.forEach((q, i) => items.push({ y: 205 - i * 10, d: () => g.drawImage(WALKERS[q.look % WALKERS.length][0], 446 + (i % 2) * 8, 182 - i * 11) }));
    items.sort((a, b) => a.y - b.y).forEach((it) => it.d());
    if (shop.away) {
      // 残った二人が客の機嫌を取っている（音符とハート）
      for (let i = 0; i < 6; i++) {
        const p = (t * 0.7 + i / 6) % 1;
        const sx = 200 + i * 40;
        const sy = 110 + (i % 2) * 60 - p * 18;
        g.save();
        g.globalAlpha = 1 - p;
        if (i % 2) { R(sx, sy, 2, 2, C.pink); R(sx + 3, sy, 2, 2, C.pink); R(sx, sy + 1, 5, 2, C.pink); R(sx + 1, sy + 3, 3, 1, C.pink); R(sx + 2, sy + 4, 1, 1, C.pink); }
        else { R(sx + 3, sy - 4, 1, 6, C.gold3); R(sx + 1, sy + 1, 3, 2, C.gold3); R(sx + 4, sy - 4, 2, 1, C.gold3); }
        g.restore();
      }
    }
  }

  private drawHud(sc: Screen, shop: Shop) {
    const ph = shop.phaseIndex;
    const e = sc.ext;
    sc.panel(e.x0 + 3, 2, e.w - 6, 24, 'rgba(42,27,38,0.94)', C.wood3);
    let acc = 0;
    const bx = 8;
    const bw = 168;
    PHASES.forEach((p, i) => {
      const w = (p.length / DAY_LENGTH) * bw;
      sc.PR(bx + acc, 19, w - 1, 4, i === 0 ? '#f6d29a' : i === 1 ? '#5fb4ea' : '#6a4a9a', i === ph ? 1 : 0.5);
      sc.T((i === 2 ? '☾ ' : '☀ ') + p.name, bx + acc + w / 2, 4, 10, i === ph ? C.gold3 : C.cream, 'center', i === ph ? 1 : 0.5);
      acc += w;
    });
    sc.PR(bx + (shop.clock / DAY_LENGTH) * bw - 0.5, 16, 1.5, 9, C.w);
    const left = shop.timeLeft;
    sc.TB(`残り ${Math.floor(left / 60)}:${String(Math.floor(left % 60)).padStart(2, '0')}`, 184, 6, 12, left < 20 ? C.red3 : C.w, 'left');
    sc.T('売上', 262, 9, 9, C.cream, 'left', 0.85);
    const sales = `${shop.score.toLocaleString()}円`;
    sc.TB(sales, 288, 5, sc.fitSize(sales, 14, 82), C.gold, 'left');
    if (shop.combo > 1) {
      const mult = shop.multiplier;
      const label = `${shop.combo}コンボ` + (mult > 1 ? ` ×${mult.toFixed(1)}` : '');
      const fx = comboFx(shop.combo);
      // 増えた瞬間：文字の後ろに丸い光が広がって消え、火花が散る（四角い背景は使わない）
      if (this.comboBurst > 0) {
        const age = fx.duration - this.comboBurst;
        const tw = sc.W(label, 13);
        const gx = 476 - tw / 2;
        sc.radialGlow(gx, 12, 16 + age * 40 + fx.level * 2, fx.color, Math.max(0, 0.7 - age * 0.9), 0.45);
        for (let n = 0; n < 6 + fx.level; n++) {
          const ang = n * 2.399 + age;
          const r = 6 + age * (50 + fx.level * 4);
          sc.PR(gx + Math.cos(ang) * r * 1.4, 12 + Math.sin(ang) * r * 0.5, 1.5, 1.5, n % 2 ? fx.color : C.gold3, Math.max(0, 1 - age * 1.4));
        }
      }
      // 7 からは色が巡り、増えた瞬間に少し大きく弾む
      const hot = fx.level >= 2;
      const col = fx.max ? CONFETTI[Math.floor(this.time * 10) % CONFETTI.length] : hot ? fx.color : this.comboBurst > 0 ? C.gold3 : mult > 1 ? C.pink : C.w;
      const punch = 1 + Math.max(0, this.comboBurst - (fx.duration - 0.15)) * (1 + fx.level * 0.15);
      sc.TB(label, 476, 5, sc.fitSize(label, 13 * punch, 100), col, 'right');
      if (shop.difficulty.comboMissAllowance > 0) {
        const budget = `ミス猶予 あと${shop.comboMissesLeft}回`;
        const width = sc.W(budget, 5.5);
        sc.PR(473 - width, 18, width + 4, 7, C.ink);
        sc.T(budget, 475, 19, 5.5, shop.comboMissesLeft ? C.cream : C.red3, 'right');
      }
    }
  }

  private drawOrders(sc: Screen, shop: Shop) {
    const typing = shop.input.typed.length > 0;
    const active = shop.input.active;
    // 1つに絞り込めた札には、コンボを付ける（大きさは変えず、隣の注文を隠さない）
    const focus = typing && active.length === 1 && active[0].target.data.kind === 'order' ? active[0].target.id : null;
    shop.seats.forEach((gst, i) => {
      if (!gst || gst.state !== 'wait') return;
      this.drawOrderCard(sc, shop, i, `seat:${i}` === focus);
    });
  }

  /** 注文の札。big は打っている札を大きく描く（コンボもこの札に付ける） */
  private drawOrderCard(sc: Screen, shop: Shop, i: number, big: boolean) {
    const gst = shop.seats[i]!;
    const typing = shop.input.typed.length > 0;
    const active = shop.input.active;
    const seat = SEATS[i];
    const live = active.find((l) => l.target.id === `seat:${i}`);
    const dim = typing && !live;
    // 同じ料理の候補のうち、先に出す客だけを金色に
    const twins = active
      .filter((l) => l.target.data.kind === 'order' && l.target.kana === gst.dish.kana)
      .sort((a, b) => shop.urgency(a.target.data) - shop.urgency(b.target.data));
    const first = !!live && twins.length > 1 && twins[0] === live;
    const second = !!live && twins.length > 1 && !first;
    const k = 1;
    const bw = 62 * k;
    const bh = (this.art ? ORDER_CARD.height : 42) * k;
    const bottom = seat.ty - (this.art ? ORDER_CARD.offset : 70) + (this.art ? ORDER_CARD.height : 42);
    const x = Math.max(2, Math.min(LW - bw - 2, seat.x - bw / 2));
    // 打っている札は少しだけ浮かせる
    const y = bottom - bh - (live ? 2 : 0);
    const cx = x + bw / 2;
    const short = Object.entries(gst.dish.need).some(([id, n]) => shop.stock[id as IngredientId] < n!);
    const edge = second ? C.cream2 : live ? C.gold : short ? (Math.sin(this.time * 8) > 0 ? '#ff5a4a' : C.red2) : C.wood4;
    const a = dim ? 0.5 : 1;
    if (live) sc.PR(x + 1, y + 3, bw, bh, '#0c0604', 0.45);
    if (live) sc.glow(x, y, bw, bh, second ? C.cream2 : C.gold);
    sc.panel(x, y, bw, bh, live ? '#4a2c3c' : 'rgba(42,27,38,0.93)', edge, a);
    sc.PR(seat.x - 2, bottom, 4, 2, edge, a);
    sc.PR(seat.x - 1, bottom + 2, 2, 1, edge, a);
    const nameSize = sc.fitSize(gst.dish.text, (this.art ? 10 : 10) * k, bw - 6);
    sc.T(gst.dish.text, cx, y + 2 * k, nameSize, dim ? C.gray : C.w, 'center');
    const m = live?.matcher ?? new RomajiMatcher(gst.dish.kana);
    const romaSize = sc.fitSize(m.typed + m.remaining, 9 * k, bw - 6, 6);
    sc.roma(m.typed, m.remaining, cx, y + 13 * k, romaSize, live ? 'active' : dim ? 'dim' : 'idle');
    const ids = Object.keys(gst.dish.need) as IngredientId[];
    const isz = (this.art ? 9 : 12) * k;
    const step = 14 * k;
    let ix = cx - ids.length * step / 2 + 1;
    const iy = y + (this.art ? 23 : 24) * k;
    for (const ing of ids) {
      const ok = shop.stock[ing] >= gst.dish.need[ing]!;
      if (!ok) {
        // 足りない素材：赤い丸が脈打ち、素材の絵は暗く沈む
        const pulse = 0.55 + 0.35 * Math.sin(this.time * 8);
        sc.radialGlow(ix + isz / 2, iy + isz / 2, isz * 0.95, '#ff4a3a', (dim ? 0.3 : 0.9) * pulse);
        sc.PR(ix - 1, iy - 1, isz + 2, isz + 2, '#5a1018', dim ? 0.3 : 0.75);
      }
      this.icon(sc, ing, ix, iy, isz, dim ? 0.35 : ok ? 1 : 0.55);
      if (!this.art) sc.PR(ix, y + 36, 12, 1.5, TRIP_COLOR[SOURCE[ing]].main, dim ? 0.4 : 1);
      // 数量や不足の印も、ほかの言葉を打っている間は札と同じだけ弱める
      if (gst.dish.need[ing]! > 1) {
        sc.PR(ix + 5 * k, iy + 3 * k, 9 * k, 6 * k, C.ink, dim ? 0.4 : 1);
        sc.T(`×${gst.dish.need[ing]}`, ix + 10 * k, iy + 3 * k, 5.5 * k, ok ? C.cream : C.red3, 'center', dim ? 0.35 : 1);
      }
      if (!ok) sc.TB('×', ix + isz / 2, iy - 1, 11 * k, '#ff6a5a', 'center', C.ink, dim ? 0.35 : 1);
      ix += step;
    }
    const p = gst.wait / gst.maxWait;
    sc.PR(x + 4, y + bh - 3, bw - 8, 2, C.ink, a);
    sc.PR(x + 4, y + bh - 3, (bw - 8) * p, 2, p > 0.5 ? C.green : p > 0.25 ? C.gold : C.red, a);
    if (first) sc.TB('▼先に出す', cx, y - 10, 8, C.gold3, 'center');
    // 打っている札の上にコンボを付ける（目線を動かさずに見えるように）
    if (big && shop.combo >= 2) {
      const fx = comboFx(shop.combo);
      const text = `${shop.combo}コンボ`;
      const tw = sc.W(text, 8) + 8;
      sc.panel(x - 2, y - 11, tw, 12, '#2a1b26', fx.color);
      sc.T(text, x - 2 + tw / 2, y - 9, 8, fx.color, 'center');
      const allow = shop.difficulty.comboMissAllowance;
      for (let n = 0; n < allow; n++) sc.PR(x + tw + 2 + n * 6, y - 7, 4, 4, n < shop.comboMissesLeft ? C.teal3 : C.ink);
    }
  }

  /** はじめての営業の案内：吹き出しと、指し示す矢印 */
  private drawGuide(sc: Screen, shop: Shop) {
    if (!this.guide) return;
    const bob = Math.sin(this.time * 5) * 2;
    let tx: number;
    let ty: number;
    let text = '';
    const below = false;
    if (this.guide === 'order') {
      const i = shop.seats.findIndex((g) => g && g.state === 'wait');
      if (i < 0) return;
      // 札の左横から、右向きの矢印で指す（上の帯や客にかぶらない）
      const cardX = SEATS[i].x - 31;
      const cardY = SEATS[i].ty - (this.art ? ORDER_CARD.offset : 70);
      const t2 = '料理名を打つと出せる';
      const w2 = sc.W(t2, 9) + 16;
      const bx2 = cardX - w2 - 10 + bob;
      const by2 = cardY + 9;
      sc.glow(bx2, by2, w2, 18, C.gold3);
      sc.panel(bx2, by2, w2, 18, '#fff3d6', C.gold2);
      sc.T(t2, bx2 + w2 / 2, by2 + 4, 9, '#3a2414', 'center');
      for (let r = 0; r < 6; r++) sc.PR(bx2 + w2 + r, by2 + 9 - (5 - r), 1, (5 - r) * 2 + 1, C.gold2);
      return;
    } else {
      // 一番少ない食材の調達欄を指す
      const e = sc.ext;
      const w = Math.min(150, (e.w - 8 - 12) / 4);
      const left = e.x0 + (e.w - (w * 4 + 12)) / 2;
      let best = 0;
      let low = Infinity;
      TRIPS.forEach((tr, k) => {
        const n = Math.min(...tr.gives.map((g) => shop.stock[g]));
        if (n < low) { low = n; best = k; }
      });
      tx = left + best * (w + 4) + w / 2;
      ty = 214 + (e.y1 - 270) - 3;
      text = '減ったら下の言葉で調達';
    }
    const w = sc.W(text, 9) + 16;
    const bx = Math.max(4, Math.min(LW - w - 4, tx - w / 2));
    const by = (below ? ty + 10 : ty - 32) + bob;
    sc.glow(bx, by, w, 18, C.gold3);
    sc.panel(bx, by, w, 18, '#fff3d6', C.gold2);
    sc.T(text, bx + w / 2, by + 4, 9, '#3a2414', 'center');
    // 矢印
    const ax = tx;
    const ay = by + 18;
    for (let r = 0; r < 6; r++) sc.PR(ax - (5 - r), ay + r, (5 - r) * 2 + 1, 1, C.gold2);
  }

  /** 調達パネル：調達の言葉・担当・取れる素材と残り数を1つの枠にまとめ、色で結ぶ */
  private drawSupply(sc: Screen, shop: Shop, t: number) {
    const e = sc.ext;
    sc.PR(e.x0, 210, e.w, e.y1 - 210, C.ink);
    sc.PR(e.x0, 210, e.w, 1, C.wood3);
    const typing = shop.input.typed.length > 0;
    // 4つの欄をウィンドウの幅いっぱいに広げる（広すぎるときは間をあけて中央に寄せる）
    const w = Math.min(150, (e.w - 8 - 12) / 4);
    const left = e.x0 + (e.w - (w * 4 + 12)) / 2;
    TRIPS.forEach((tr, i) => {
      const x = left + i * (w + 4);
      const y = 214;
      const h = 52;
      const col = TRIP_COLOR[tr.id];
      const live = shop.input.active.find((l) => l.target.id === `trip:${tr.id}`);
      const isAway = shop.away?.id === tr.id;
      const blocked = !!shop.away && !isAway;
      const dim = blocked || (typing && !live);
      const lackHere = this.lackTrip?.id === tr.id && Math.floor(t * 6) % 2 === 0;
      const a = dim ? 0.55 : 1;
      if (live) sc.glow(x, y, w, h);
      sc.panel(x, y, w, h, col.dark, live ? C.gold : lackHere ? C.red3 : col.main, a);
      sc.PR(x + 1, y + 1, w - 2, 18, col.main, dim ? 0.35 : 0.55);
      if (this.art) this.art.drawHead(sc, `family-${tr.who}`, 0, x + 3, y + 3, 14, 0.42, a);
      else sc.spr(PORTRAIT[tr.who], x + 3, y + 4, 1, a);
      sc.TB(tr.text, x + 20, y + 2, 13, live ? C.gold3 : C.w, 'left', C.ink, dim ? 0.5 : 1);
      const m = live?.matcher ?? new RomajiMatcher(tr.kana);
      const rx = x + 23 + sc.W(tr.text, 13);
      sc.roma(m.typed, m.remaining, rx + sc.W(m.typed + m.remaining, 9) / 2, y + 6, 9, live ? 'active' : dim ? 'dim' : 'idle');
      tr.gives.forEach((ing, k) => {
        const ex = x + 6 + k * Math.max(54, (w - 12) / 2);
        const ey = y + 21;
        const n = shop.stock[ing];
        const low = n <= 2;
        const shake = low && n <= 1 ? Math.sin(t * 30) * 1 : 0;
        if (low) {
          // 残りわずか：赤い光が脈打ち、0〜1個では素材の絵が小刻みに揺れる
          const pulse = 0.5 + 0.5 * Math.sin(t * (n === 0 ? 10 : 6));
          sc.radialGlow(ex + 11, ey + 11, 22, '#ff3a2a', (dim ? 0.35 : 0.85) * pulse);
          sc.panel(ex - 3, ey - 2, 50, 24, 'rgba(90,16,24,0.55)', n === 0 ? '#ff5a4a' : C.red2, dim ? 0.5 : 0.6 + 0.4 * pulse);
        }
        this.icon(sc, ing, ex - 1 + shake, ey - 1, 24, dim ? 0.5 : n === 0 ? 0.55 : 1);
        sc.TB(`×${n}`, ex + 24, ey + 4, 13, low ? '#ff7a6a' : C.w, 'left', C.ink, dim ? 0.5 : 1);
        if (low && !dim) {
          sc.panel(ex - 4, ey - 4, 9, 10, '#ff5a4a', C.ink);
          sc.T('!', ex + 0.5, ey - 3, 8, C.w, 'center');
        }
        const got = this.gotTrip?.id === tr.id ? this.gotTrip : null;
        if (got && got.gains[ing]) sc.TB(`+${got.gains[ing]}`, ex + 44, ey - 2 - (1.4 - got.t) * 5, 8, C.gold3, 'center');
      });
      if (isAway) {
        sc.PR(x + 1, y + 1, w - 2, h - 2, '#000000', 0.45);
        sc.TB(`${tr.act}中…`, x + w / 2, y + 20, 11, C.gold3, 'center');
      }
    });
  }

  /** 食材アイコン：素材があれば画像、なければコードで描いた絵 */
  icon(sc: Screen, ing: IngredientId | 'poison', x: number, y: number, size: number, alpha = 1) {
    if (this.art) this.art.drawIcon(sc, 'icons-dishes', ICON_INDEX[ing], x, y, size, alpha);
    else sc.spr(ICON[ing], x, y, size / 12, alpha);
  }

  // ================= 画像素材での描画 =================

  /** 店内の様子だけを描く（上の帯・注文・調達欄なし）。タイトル画面の背景に使う */
  drawTavern(sc: Screen, shop: Shop) {
    if (this.art) this.drawAmber(sc, shop, this.art);
  }

  private drawAmber(sc: Screen, shop: Shop, art: Art) {
    const L = AMBER.tavern;
    const ph = shop.phaseIndex;
    const bg = ph === 2 ? 'bg-tavern-night' : 'bg-tavern';
    const t = this.time;
    sc.clearScreen();
    art.drawBackground(sc, bg);
    // かまどの炎と鍋の湯気（背景のかまどには火が入っていないので重ならない）
    art.drawAnim(sc, 'fx', '炎', t, L.fire.x, L.fire.y, art.scaleFor('fx', 0, L.fire.h));
    art.drawAnim(sc, 'fx', '湯気', t, L.steam.x, L.steam.y, art.scaleFor('fx', 6, L.steam.h), false, 0.7);

    const away = shop.away?.who as FamilyId | undefined;
    // おやじ：カウンターの奥。調理中は鍋を混ぜる。下半身はカウンターの前板で隠す
    if (away !== 'master') {
      if (t < this.stirUntil) art.drawAnim(sc, 'master-stir', '調理・鍋を混ぜる', t - (this.stirUntil - 2.4), L.master.x, L.master.y, art.scaleFor('master-stir', 0, L.master.hStir));
      else art.drawAnim(sc, 'family-master', '待機', t, L.master.x, L.master.y, art.scaleFor('family-master', 0, L.master.h));
    }
    art.redrawRegion(sc, bg, L.counterFront);

    const items: { y: number; d: () => void }[] = [];
    for (const k of ['wife', 'daughter'] as const) {
      if (away === k) continue;
      const s = this.servers[k];
      const id = `family-${k}`;
      const kk = art.scaleFor(id, 0, L.family[k]);
      items.push({
        y: s.y,
        d: () => {
          this.shadow(sc, s.x, s.y, 14);
          if (s.serving && s.serveStart !== null) art.drawAnim(sc, id, '配膳', t - s.serveStart, s.x, s.y, kk, false);
          else if (s.moving) {
            art.drawFrame(sc, `${id}-walk`, walkFrame(art.anim(`${id}-walk`, '歩行'), s.distance, L.family[k]), s.x, s.y,
              art.scaleFor(`${id}-walk`, 0, L.family[k]), s.flip);
            if (s.serving && s.jobs[0]) art.drawIcon(sc, 'icons-dishes', dishIcon(s.jobs[0].guest.dish.id),
              s.x + (s.flip ? -17 : 3), s.y - 24, 14);
          }
          else art.drawAnim(sc, id, '待機', t, s.x, s.y, kk, false);
        },
      });
    }
    const kTable = art.scaleFor('props-actions', 8, L.table.h);
    const kChair = art.scaleFor('props-actions', 9, L.chair.h);
    // 椅子と机は、見えている部分の左右中央を席の中心にそろえる（足元の登録位置は左右に少しずれているため）
    const centerX = (index: number, k: number) => {
      const f = art.frame('props-actions', index);
      return ((f.visibleBounds[0] + f.visibleBounds[2]) / 2 - f.registration[0]) * k;
    };
    const chairDx = centerX(9, kChair);
    const tableDx = centerX(8, kTable);
    SEATS.forEach((seat, i) => {
      const gst = shop.seats[i];
      items.push({
        y: seat.ty,
        d: () => {
          this.shadow(sc, seat.x, seat.ty + L.table.foot, 24);
          art.drawFrame(sc, 'props-actions', 9, seat.x - chairDx, seat.ty + L.chair.foot, kChair);
          if (gst && gst.state !== 'walk') {
            // 表情はゲームの状態から選ぶ（自動で順に再生しない）
            const anim = art.sheet('guests-seated').asset.animations![gst.look % 7];
            const mood = gst.wait / gst.maxWait;
            const state = gst.state === 'eat' ? (gst.awaitingDelivery ? 'neutral' : 'eat') : mood > 0.55 ? 'smile' : mood > 0.28 ? 'neutral' : 'angry';
            const idx = anim.states![state];
            art.drawFrame(sc, 'guests-seated', idx, seat.x, seat.ty + L.guest.foot, art.scaleFor('guests-seated', anim.states!.smile, L.guest.h));
          }
          art.drawFrame(sc, 'props-actions', 8, seat.x - tableDx, seat.ty + L.table.foot, kTable);
          if (gst && gst.state === 'eat' && !gst.awaitingDelivery) art.drawIcon(sc, 'icons-dishes', dishIcon(gst.dish.id), seat.x - 7, seat.ty + L.dish.y, 14);
        },
      });
      // 入り口から席へ歩いてくる客（絵は左向き）
      if (gst && gst.state === 'walk') {
        const p = 1 - Math.max(0, gst.t) / (gst.walkDuration ?? SHOP.walkTime);
        const { x, y, flip, distance } = entryPose(seat, p);
        items.push({ y, d: () => this.drawWalker(sc, art, gst.look, x, y, distance, flip) });
      }
    });
    for (const e of this.exits) items.push({ y: e.y, d: () => this.drawWalker(sc, art, e.look, e.x, e.y, e.distance, true) });
    // 入り口で待つ客：歩行の最初のコマで立ち止まる
    shop.queue.forEach((q, i) => {
      const x = L.queue.x + (i % 2) * 9;
      const y = L.queue.y - i * 10;
      items.push({ y, d: () => this.drawWalker(sc, art, q.look, x, y, 0, false, true) });
    });
    items.sort((a, b) => a.y - b.y).forEach((it) => it.d());

    for (const f of this.fxs) art.drawAnim(sc, 'fx', f.anim, t - f.start, f.x, f.y, art.scaleFor('fx', 14, f.h));
    if (shop.away) {
      // 残った二人が客の機嫌を取っている（ハート）
      for (let i = 0; i < 6; i++) {
        const p = (t * 0.7 + i / 6) % 1;
        art.drawIcon(sc, 'icons-dishes', 15, 196 + i * 40, 104 + (i % 2) * 60 - p * 18, 9, 1 - p);
      }
    }
  }

  private drawWalker(sc: Screen, art: Art, look: number, x: number, y: number, distance: number, flip: boolean, still = false) {
    const anim = art.sheet('guests-walk').asset.animations![look % 7];
    const k = art.scaleFor('guests-walk', anim.frames[0], AMBER.tavern.walker.h);
    this.shadow(sc, x, y, 12);
    if (still) art.drawFrame(sc, 'guests-walk', anim.frames[0], x, y, k, flip);
    else art.drawFrame(sc, 'guests-walk', walkFrame(anim, distance, AMBER.tavern.walker.h), x, y, k, flip);
  }

  private shadow(sc: Screen, x: number, y: number, w: number) {
    sc.PR(x - w / 2 + 2, y - 1.5, w - 4, 3, '#1a0c10', 0.28);
    sc.PR(x - w / 2, y - 0.5, w, 1.5, '#1a0c10', 0.22);
  }

  private drawFx(sc: Screen, shop: Shop) {
    const e = sc.ext;
    // 画面の縁の光：コンボが続いている間、段階に応じて脈打つ（15 以上は色が巡る）
    const live = comboFx(shop.combo);
    if (shop.combo >= 1 && live.edge > 0) {
      const pulse = 0.78 + 0.22 * Math.sin(this.time * (4 + live.level));
      const col = live.max ? CONFETTI[Math.floor(this.time * 6) % CONFETTI.length] : live.color;
      const a = (0.12 + live.edge * 0.26) * pulse;
      const w = 6 + live.level * 1.2;
      sc.fade(e.x0, e.y0, w, e.h, col, a, 0, 'x');
      sc.fade(e.x1, e.y0, -w, e.h, col, a, 0, 'x');
      sc.fade(e.x0, e.y0, e.w, w, col, a, 0, 'y');
      sc.fade(e.x0, e.y1, e.w, -w, col, a * 0.6, 0, 'y');
    }
    // 一瞬の光
    if (this.comboFlash > 0) sc.cover('#fff4d6', this.flashPeak * (this.comboFlash / 0.18));
    for (const c of this.confetti) {
      const a = Math.min(1, (c.life - c.t) * 2);
      const flat = Math.abs(Math.sin(c.t * 8 + c.spin));
      sc.PR(c.x, c.y, 2, 0.6 + flat * 2.2, c.col, a);
    }
    for (const p of this.sparks) {
      const draw = () => sc.PR(p.x, p.y, 1.5, 1.5, p.col, 1 - p.t / 0.7);
      if (p.bounds) sc.clip(p.bounds.x, p.bounds.y, p.bounds.w, p.bounds.h, draw);
      else draw();
    }
    if (this.comboBurst > 0) {
      const fx = comboFx(this.comboCount);
      const age = fx.duration - this.comboBurst;
      const a = Math.min(1, this.comboBurst * 2);
      const { x, y } = this.comboAnchor;
      const col = fx.color;
      // 丸く柔らかい光を重ね、周りの空間に溶け込ませる（四角く切り取らない）
      const pulse = 0.75 + Math.sin(age * 12) * 0.25;
      const grow = Math.min(1, age / 0.12);
      sc.radialGlow(x, y + 4, (18 + fx.level * 2.2) * (0.6 + grow * 0.4), col, a * (0.28 + fx.level * 0.035) * pulse, 0.8);
      if (fx.level >= 4) sc.radialGlow(x, y + 4, 10 + fx.level, '#fff7ea', a * 0.25 * pulse, 0.8);
      for (let ring = 0; ring < fx.rings; ring++) {
        const r = 8 + ((age * 26 + ring * 9) % 22);
        const ra = a * 0.7 * (1 - r / 32);
        for (let k = 0; k < 24; k++) {
          const angle = k * Math.PI / 12 - age * 0.8;
          sc.PR(x + Math.cos(angle) * r, y + Math.sin(angle) * r * 0.75, 1.5, 1.5, ring % 2 ? C.gold3 : col, ra);
        }
      }
      for (let k = 0; k < fx.rays; k++) {
        const angle = k * Math.PI * 2 / fx.rays + age * 0.8;
        const r = 12 + ((age * 18 + k * 3) % 14);
        for (let jj = 0; jj < 2 + Math.ceil(fx.level / 2); jj++) {
          const radius = r + jj * 1.7;
          sc.PR(x + Math.cos(angle) * radius, y + Math.sin(angle) * radius * 0.75, 1.5, 1.5, col, a * (1 - jj * 0.14) * (1 - radius / 34));
        }
        if (fx.level >= 3 && k % 3 === 0) {
          const xx = x + Math.cos(angle) * r, yy = y + Math.sin(angle) * r * 0.75;
          sc.PR(xx - 3, yy, 7, 1, C.w, a * 0.8);
          sc.PR(xx, yy - 3, 1, 7, C.w, a * 0.8);
        }
      }
    }
    for (const p of this.pops) {
      const a = Math.min(1, (1.3 - p.t) * 3);
      if (p.slot === 'combo' && p.count !== undefined) {
        const fx = comboFx(p.count);
        // 完了して空いた注文枠内に収め、隣の未完了の注文を隠さない。
        // 数字は出た瞬間に大きく弾んで、すっと元の大きさへ戻る
        const punch = 1 + Math.max(0, 0.18 - p.t) * (3 + fx.level * 0.4);
        const col = fx.max ? CONFETTI[Math.floor((this.time + p.t) * 12) % CONFETTI.length] : p.col;
        sc.TB(String(p.count), p.x, p.y + 1 - (punch - 1) * 6, sc.fitSize(String(p.count), fx.numberSize * punch, 58), col, 'center', C.ink, a);
        sc.TB(fx.max ? 'FEVER' : 'COMBO' + (fx.level >= 6 ? '!!' : fx.level ? '!' : ''), p.x, p.y + 31, 8, col, 'center', C.ink, a);
      } else sc.TB(p.text, p.x, p.y - p.t * 16, p.big ? 12 : 11, p.col, 'center', C.ink, a);
    }
    if (this.callout) {
      // 節目の掛け声：客席の列の間（注文の札を隠さない位置）に大きく弾ませる
      const c = this.callout;
      const grow = c.t < 0.12 ? 0.6 + c.t / 0.12 * 0.6 : 1.2 - Math.min(0.2, (c.t - 0.12) * 0.8);
      const a = Math.min(1, (1.1 - c.t) * 3);
      const size = (14 + c.level * 1.2) * grow;
      const col = c.level >= 10 ? CONFETTI[Math.floor(this.time * 12) % CONFETTI.length] : c.col;
      sc.TB(c.text, LW / 2 + 41.5, 151.5 - size / 2, size, C.ink, 'center', col, a * 0.8);
      sc.TB(c.text, LW / 2 + 40, 150 - size / 2, size, col, 'center', C.ink, a);
    }
    if (this.banner) {
      // 家族のひとことは、注文の札がない厨房の上に出す
      const tw = sc.W(this.banner.text, 10) + 20;
      const bx = Math.max(4, 82 - tw / 2);
      sc.panel(bx, 64, tw, 18, 'rgba(42,27,38,0.95)', C.gold, Math.min(1, this.banner.t * 3));
      sc.TB(this.banner.text, bx + tw / 2, 68, 10, this.banner.col, 'center', C.ink, Math.min(1, this.banner.t * 3));
    }
    // 絞り込み中だけ、打った途中のローマ字を薄く出す
    if (this.missFlash > 0) {
      const e = sc.ext;
      sc.PR(e.x0, e.y0, e.w, 2, C.red, this.missFlash * 3);
      sc.PR(e.x0, e.y1 - 2, e.w, 2, C.red, this.missFlash * 3);
    }
  }
}
