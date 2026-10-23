import { C, TRIP_COLOR, type Color } from './palette';
import { Screen, LW } from './screen';
import { FAM, guestSprite, ICON, PORTRAIT, WALKERS } from './sprites';
import { drawChair, drawLights, drawRoomLive, drawTable, pen, roomLayer, shadow } from './room';
import { Shop, type Guest, type ShopEvent } from '../core/shop';
import type { Art } from './amber/art';
import { animLength, walkFrame } from './amber/manifest';
import { entryPose, WALK_SPEED, SERVER_WALK_SPEED } from '../core/tavernNavigation';
import { AMBER, ICON_INDEX, ORDER_CARD, TAVERN_SEATS, dishIcon } from './amber/layout';
import { RomajiMatcher } from '../core/romaji';
import {
  DAY_LENGTH, FAMILY_NAME, INGREDIENT_NAME, PHASES, SHOP, SOURCE, TRIPS, type FamilyId, type IngredientId, type TripId,
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
interface Pop { x: number; y: number; t: number; text: string; col: Color; big?: boolean; slot?: string }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; col: Color }

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
        if (ev.combo >= 3) {
          this.comboBurst = ev.combo % 10 === 0 ? 1.2 : 0.7;
          const milestone = ev.combo % 10 === 0;
          this.sparkAt({ x: 76, y: 166 }, C.gold3, milestone ? 55 : Math.min(24, ev.combo), milestone ? 135 : 70);
          this.pop('combo', { x: 76, y: 145, t: 0, text: milestone ? `${ev.combo} COMBO!!` : `${ev.combo} COMBO`, col: milestone ? C.pink : C.gold3 });
        }
        this.stirUntil = this.time + 2.4;
        this.fxs.push({ anim: 'きらめき', x: seat.x, y: seat.ty - 8, h: 22, start: this.time });
        this.pop('income', { x: 78, y: 180, t: 0, text: `+${ev.gain}円`, col: C.gold });
        this.sparkAt({ x: seat.x, y: seat.ty - 20 }, C.gold, 10, 80);
        break;
      }
      case 'lack': {
        this.pop('warning', { x: 78, y: 115, t: 0, text: '素材が足りない！', col: C.red3 });
        this.lackTrip = { id: SOURCE[ev.missing[0]], t: 1.4 };
        break;
      }
      case 'angry': {
        this.pop('warning', { x: 78, y: 115, t: 0, text: 'プンプン！', col: C.red3 });
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
    if (away !== pref) return pref;
    return away !== other ? other : null;
  }

  targetPos(id: string): { x: number; y: number } {
    if (id.startsWith('seat:')) {
      const s = SEATS[Number(id.slice(5))];
      return { x: s.x, y: s.ty - 52 };
    }
    const i = TRIPS.findIndex((t) => `trip:${t.id}` === id);
    return { x: 60 + i * 118, y: 222 };
  }

  private sparkAt(p: { x: number; y: number }, col: Color, n: number, spread = 30) {
    for (let i = 0; i < n; i++) {
      this.sparks.push({ x: p.x + (Math.random() - 0.5) * 20, y: p.y, vx: (Math.random() - 0.5) * spread, vy: -20 - Math.random() * spread / 2, t: 0, col });
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
    this.missFlash = Math.max(0, this.missFlash - dt);
    this.comboBurst = shop && shop.combo < 3 ? 0 : Math.max(0, this.comboBurst - dt);
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
        const sp = Math.min(d, SERVER_WALK_SPEED * dt);
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
    if (this.art) {
      this.drawAmber(sc, shop, this.art);
      this.drawHud(sc, shop);
      this.drawOrders(sc, shop);
      this.drawSupply(sc, shop, t);
      this.drawFx(sc, shop);
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
    this.drawHud(sc, shop);
    this.drawOrders(sc, shop);
    this.drawSupply(sc, shop, t);
    this.drawFx(sc, shop);
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
      if (this.comboBurst > 0) sc.panel(374, 3, 102, 21, 'rgba(85,45,31,0.4)', C.gold3, Math.min(1, this.comboBurst));
      sc.TB(label, 476, 5, sc.fitSize(label, 13, 100), this.comboBurst > 0 ? C.gold3 : mult > 1 ? C.pink : C.w, 'right');
    }
  }

  private drawOrders(sc: Screen, shop: Shop) {
    const typing = shop.input.typed.length > 0;
    const active = shop.input.active;
    shop.seats.forEach((gst, i) => {
      if (!gst || gst.state !== 'wait') return;
      const seat = SEATS[i];
      const id = `seat:${i}`;
      const live = active.find((l) => l.target.id === id);
      const dim = typing && !live;
      // 同じ料理の候補のうち、先に出す客だけを金色に
      const twins = active
        .filter((l) => l.target.data.kind === 'order' && l.target.kana === gst.dish.kana)
        .sort((a, b) => shop.urgency(a.target.data) - shop.urgency(b.target.data));
      const first = !!live && twins.length > 1 && twins[0] === live;
      const second = !!live && twins.length > 1 && !first;
      const bw = 62;
      const bh = this.art ? ORDER_CARD.height : 42;
      const x = seat.x - bw / 2;
      const y = seat.ty - (this.art ? ORDER_CARD.offset : 70);
      const edge = second ? C.cream2 : live ? C.gold : gst.lack > 0 ? C.red : C.wood4;
      const a = dim ? 0.5 : 1;
      sc.panel(x, y, bw, bh, live ? '#4a2c3c' : 'rgba(42,27,38,0.93)', edge, a);
      sc.PR(seat.x - 2, y + bh, 4, 2, edge, a);
      sc.PR(seat.x - 1, y + bh + 2, 2, 1, edge, a);
      const nameSize = sc.fitSize(gst.dish.text, this.art ? 9 : 10, bw - 6);
      sc.T(gst.dish.text, seat.x, y + 2, nameSize, dim ? C.gray : C.w, 'center');
      const m = live?.matcher ?? new RomajiMatcher(gst.dish.kana);
      const romaSize = sc.fitSize(m.typed + m.remaining, 8, bw - 6, 5.5);
      sc.roma(m.typed, m.remaining, seat.x, y + (this.art ? 12 : 14), romaSize, live ? 'active' : dim ? 'dim' : 'idle');
      const ids = Object.keys(gst.dish.need) as IngredientId[];
      let ix = seat.x - ids.length * 7 + 1;
      for (const ing of ids) {
        const ok = shop.stock[ing] >= gst.dish.need[ing]!;
        this.icon(sc, ing, ix, y + (this.art ? 21 : 24), this.art ? 9 : 12, dim ? 0.35 : ok ? 1 : 0.4);
        if (!this.art) sc.PR(ix, y + 36, 12, 1.5, TRIP_COLOR[SOURCE[ing]].main, dim ? 0.4 : 1);
        if (!ok) sc.TB('×', ix + 6, y + 21, 9, C.red3, 'center');
        ix += 14;
      }
      const p = gst.wait / gst.maxWait;
      sc.PR(x + 4, y + bh - 3, bw - 8, 2, C.ink, a);
      sc.PR(x + 4, y + bh - 3, (bw - 8) * p, 2, p > 0.5 ? C.green : p > 0.25 ? C.gold : C.red, a);
      if (first) sc.TB('▼先に出す', seat.x, y - 10, 8, C.gold3, 'center');
      if (shop.away) sc.TB('待ってるよ', seat.x, y - 10, 8, C.pink3, 'center');
    });
  }

  /** 調達パネル：調達の言葉・担当・取れる素材と残り数を1つの枠にまとめ、色で結ぶ */
  private drawSupply(sc: Screen, shop: Shop, t: number) {
    const e = sc.ext;
    sc.PR(e.x0, 210, e.w, e.y1 - 210, C.ink);
    sc.PR(e.x0, 210, e.w, 1, C.wood3);
    const typing = shop.input.typed.length > 0;
    TRIPS.forEach((tr, i) => {
      const x = 4 + i * 118;
      const y = 214;
      const w = 114;
      const h = 52;
      const col = TRIP_COLOR[tr.id];
      const live = shop.input.active.find((l) => l.target.id === `trip:${tr.id}`);
      const isAway = shop.away?.id === tr.id;
      const blocked = !!shop.away && !isAway;
      const dim = blocked || (typing && !live);
      const lackHere = this.lackTrip?.id === tr.id && Math.floor(t * 6) % 2 === 0;
      const a = dim ? 0.55 : 1;
      sc.panel(x, y, w, h, col.dark, live ? C.gold : lackHere ? C.red3 : col.main, a);
      sc.PR(x + 1, y + 1, w - 2, 18, col.main, dim ? 0.35 : 0.55);
      if (this.art) this.art.drawHead(sc, `family-${tr.who}`, 0, x + 3, y + 3, 14, 0.42, a);
      else sc.spr(PORTRAIT[tr.who], x + 3, y + 4, 1, a);
      sc.TB(tr.text, x + 20, y + 2, 13, live ? C.gold3 : C.w, 'left', C.ink, dim ? 0.5 : 1);
      const m = live?.matcher ?? new RomajiMatcher(tr.kana);
      const rx = x + 23 + sc.W(tr.text, 13);
      sc.T(m.typed, rx, y + 6, 9, C.teal3, 'left', dim ? 0.4 : 1);
      sc.T(m.remaining, rx + sc.W(m.typed, 9), y + 6, 9, C.cream, 'left', dim ? 0.3 : 0.8);
      tr.gives.forEach((ing, k) => {
        const ex = x + 6 + k * 54;
        const ey = y + 21;
        const n = shop.stock[ing];
        if (n <= 1 && Math.floor(t * 3) % 2 === 0) sc.PR(ex - 2, ey - 1, 50, 22, C.red2, 0.7);
        this.icon(sc, ing, ex - 1, ey - 1, 24, dim ? 0.5 : 1);
        sc.T(INGREDIENT_NAME[ing], ex + 24, ey - 1, 8, C.cream, 'left', dim ? 0.4 : 0.85);
        sc.TB(`×${n}`, ex + 24, ey + 8, 13, n <= 1 ? C.red3 : C.w, 'left', C.ink, dim ? 0.5 : 1);
        const got = this.gotTrip?.id === tr.id ? this.gotTrip : null;
        if (got && got.gains[ing]) sc.TB(`+${got.gains[ing]}`, ex + 44, ey - 2 - (1.4 - got.t) * 5, 8, C.gold3, 'center');
      });
      sc.T(FAMILY_NAME[tr.who], x + w - 4, y + h - 10, 8, C.cream, 'right', dim ? 0.35 : 0.7);
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
    for (const p of this.sparks) sc.PR(p.x, p.y, 1.5, 1.5, p.col, 1 - p.t / 0.7);
    if (this.comboBurst > 0) {
      const a = Math.min(1, this.comboBurst);
      for (let i = 0; i < 3; i++) {
        const r = (1.2 - this.comboBurst) * 20 + i * 5;
        sc.PR(76 - r, 141 - r, r * 2, 1, C.gold3, a * (1 - i / 3));
        sc.PR(76 - r, 185 + r, r * 2, 1, C.gold3, a * (1 - i / 3));
      }

    }
    for (const p of this.pops) sc.TB(p.text, p.x, p.y - p.t * 16, p.slot === 'combo' ? sc.fitSize(p.text, 15, 134) : p.big ? 12 : 11, p.col, 'center', C.ink, Math.min(1, (1.3 - p.t) * 3));
    if (this.banner) {
      const tw = sc.W(this.banner.text, 11) + 24;
      sc.panel(LW / 2 - tw / 2, 30, tw, 20, 'rgba(42,27,38,0.95)', C.gold, Math.min(1, this.banner.t * 3));
      sc.TB(this.banner.text, LW / 2, 34, 11, this.banner.col, 'center', C.ink, Math.min(1, this.banner.t * 3));
    }
    // 絞り込み中だけ、打った途中のローマ字を薄く出す
    if (shop.input.typed) sc.TB(shop.input.typed, LW / 2, 194, 12, C.w, 'center', C.ink, 0.55);
    if (this.missFlash > 0) {
      const e = sc.ext;
      sc.PR(e.x0, e.y0, e.w, 2, C.red, this.missFlash * 3);
      sc.PR(e.x0, e.y1 - 2, e.w, 2, C.red, this.missFlash * 3);
    }
  }
}
