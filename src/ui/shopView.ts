import { C, TRIP_COLOR, type Color } from './palette';
import { Screen, LW } from './screen';
import { FAM, guestSprite, ICON, PORTRAIT, WALKERS } from './sprites';
import { drawChair, drawLights, drawRoomLive, drawTable, pen, roomLayer, shadow } from './room';
import { Shop, type ShopEvent } from '../core/shop';
import { RomajiMatcher } from '../core/romaji';
import {
  DAY_LENGTH, FAMILY_NAME, INGREDIENT_NAME, PHASES, SHOP, SOURCE, TRIPS, type FamilyId, type IngredientId, type TripId,
} from '../core/shopConfig';

/** 席の位置（斜め上視点：2列×4席）。ty はテーブルの高さ */
export const SEATS = [118, 190].flatMap((ty) => [196, 260, 324, 388].map((x) => ({ x, ty })));
const DOOR = { x: 452, y: 150 };
const HOME: Record<'wife' | 'daughter', { x: number; y: number }> = { wife: { x: 158, y: 152 }, daughter: { x: 158, y: 182 } };

interface Server { x: number; y: number; tx: number; ty: number; carry: number; moving: boolean }
interface Pop { x: number; y: number; t: number; text: string; col: Color; big?: boolean }
interface Spark { x: number; y: number; vx: number; vy: number; t: number; col: Color }

/** 営業画面の見た目の状態（演出用。ゲームの計算には影響しない） */
export class ShopView {
  servers: Record<'wife' | 'daughter', Server> = {
    wife: { ...HOME.wife, tx: HOME.wife.x, ty: HOME.wife.y, carry: 0, moving: false },
    daughter: { ...HOME.daughter, tx: HOME.daughter.x, ty: HOME.daughter.y, carry: 0, moving: false },
  };
  pops: Pop[] = [];
  sparks: Spark[] = [];
  missFlash = 0;
  lackTrip: { id: TripId; t: number } | null = null;
  gotTrip: { id: TripId; t: number; gains: Partial<Record<IngredientId, number>> } | null = null;
  /** 出かけている／帰ってきた家族のひとこと */
  banner: { text: string; t: number; col: Color } | null = null;

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
          s.tx = seat.x - 18;
          s.ty = seat.ty + 6;
          s.carry = 1.1;
        }
        this.pops.push({ x: seat.x, y: seat.ty - 60, t: 0, text: `+${ev.gain}`, col: C.gold });
        this.sparkAt({ x: seat.x, y: seat.ty - 20 }, C.gold, 10, 80);
        break;
      }
      case 'lack': {
        const seat = SEATS[ev.seat];
        this.pops.push({ x: seat.x, y: seat.ty - 56, t: 0, text: '素材が足りない！', col: C.red3 });
        this.lackTrip = { id: SOURCE[ev.missing[0]], t: 1.4 };
        break;
      }
      case 'angry': {
        const seat = SEATS[ev.seat];
        this.pops.push({ x: seat.x, y: seat.ty - 40, t: 0, text: 'プンプン！', col: C.red3 });
        break;
      }
      case 'tripStart':
        this.banner = { text: `${FAMILY_NAME[ev.trip.who]}「${ev.trip.act}に行ってくる！」`, t: 1.6, col: C.w };
        break;
      case 'tripEnd':
        this.banner = { text: `${FAMILY_NAME[ev.trip.who]}「ただいま！」`, t: 1.6, col: C.gold3 };
        this.gotTrip = { id: ev.trip.id, t: 1.4, gains: ev.gains };
        break;
      case 'phase':
        this.pops.push({ x: LW / 2, y: 70, t: 0, text: `― ${PHASES[ev.index].name}の部 ―`, col: C.gold3, big: true });
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

  update(dt: number) {
    this.missFlash = Math.max(0, this.missFlash - dt);
    for (const p of this.pops) p.t += dt;
    this.pops = this.pops.filter((p) => p.t < 1.3);
    for (const p of this.sparks) { p.t += dt; p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 140 * dt; }
    this.sparks = this.sparks.filter((p) => p.t < 0.7);
    if (this.lackTrip && (this.lackTrip.t -= dt) <= 0) this.lackTrip = null;
    if (this.gotTrip && (this.gotTrip.t -= dt) <= 0) this.gotTrip = null;
    if (this.banner && (this.banner.t -= dt) <= 0) this.banner = null;
    for (const k of ['wife', 'daughter'] as const) {
      const s = this.servers[k];
      const dx = s.tx - s.x;
      const dy = s.ty - s.y;
      const d = Math.hypot(dx, dy);
      s.moving = d > 1;
      if (s.moving) {
        const sp = Math.min(d, 160 * dt);
        s.x += (dx / d) * sp;
        s.y += (dy / d) * sp;
      }
      s.carry = Math.max(0, s.carry - dt);
      if (s.carry <= 0 && !s.moving) {
        s.tx = HOME[k].x;
        s.ty = HOME[k].y;
      }
    }
  }

  // ================= 描画 =================

  draw(sc: Screen, shop: Shop, t: number, reduce: boolean) {
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
      const img = s.moving ? FAM[k][Math.floor(t * 8) % 2] : FAM[k][0];
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
        const p = 1 - Math.max(0, gst.t) / SHOP.walkTime;
        const x = DOOR.x + (seat.x - DOOR.x) * p;
        const y = DOOR.y + (seat.ty - 2 - DOOR.y) * p;
        items.push({ y, d: () => { shadow(g, x - 1, y, 12); g.drawImage(WALKERS[gst.look % WALKERS.length][Math.floor(t * 8) % 2], Math.round(x - 7), Math.round(y - 20)); } });
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
    sc.TB(shop.score.toLocaleString(), 288, 4, 15, C.gold, 'left');
    if (shop.combo > 1) {
      const mult = shop.multiplier;
      sc.TB(`${shop.combo}コンボ` + (mult > 1 ? ` ×${mult.toFixed(1)}` : ''), 476, 5, 13, mult > 1 ? C.pink : C.w, 'right');
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
      const bh = 42;
      const x = seat.x - bw / 2;
      const y = seat.ty - 70;
      const edge = second ? C.cream2 : live ? C.gold : gst.lack > 0 ? C.red : C.wood4;
      const a = dim ? 0.5 : 1;
      sc.panel(x, y, bw, bh, live ? '#4a2c3c' : 'rgba(42,27,38,0.93)', edge, a);
      sc.PR(seat.x - 2, y + bh, 4, 2, edge, a);
      sc.PR(seat.x - 1, y + bh + 2, 2, 1, edge, a);
      const nameSize = sc.W(gst.dish.text, 10) > bw - 4 ? 9 : 10;
      sc.T(gst.dish.text, seat.x, y + 2, nameSize, dim ? C.gray : C.w, 'center');
      const m = live?.matcher ?? new RomajiMatcher(gst.dish.kana);
      const romaSize = sc.W(m.typed + m.remaining, 8) > bw - 2 ? 7 : 8;
      sc.roma(m.typed, m.remaining, seat.x, y + 14, romaSize, live ? 'active' : dim ? 'dim' : 'idle');
      const ids = Object.keys(gst.dish.need) as IngredientId[];
      let ix = seat.x - ids.length * 7 + 1;
      for (const ing of ids) {
        const ok = shop.stock[ing] >= gst.dish.need[ing]!;
        sc.spr(ICON[ing], ix, y + 24, 1, dim ? 0.35 : ok ? 1 : 0.4);
        sc.PR(ix, y + 36, 12, 1.5, TRIP_COLOR[SOURCE[ing]].main, dim ? 0.4 : 1);
        if (!ok) sc.TB('×', ix + 6, y + 23, 11, C.red3, 'center');
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
      sc.spr(PORTRAIT[tr.who], x + 3, y + 4, 1, a);
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
        sc.spr(ICON[ing], ex - 1, ey - 1, 2, dim ? 0.5 : 1);
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

  private drawFx(sc: Screen, shop: Shop) {
    for (const p of this.sparks) sc.PR(p.x, p.y, 1.5, 1.5, p.col, 1 - p.t / 0.7);
    for (const p of this.pops) sc.TB(p.text, p.x, p.y - p.t * 16, p.big ? 18 : 11, p.col, 'center', C.ink, Math.min(1, (1.3 - p.t) * 3));
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
