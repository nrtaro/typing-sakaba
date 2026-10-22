import { CUSTOMER_LOOKS, drawMaster, drawPerson, type Look } from './actors';
import { H, P, W, bands, dither, glow, hash, line, makeLayer, px, rect, tinyText, tinyTextWidth, type Ctx } from './px';

export type TimeOfDay = 'day' | 'dusk' | 'night';

export const WORLD_W = 760;
export const FLOOR_Y = 178;

export interface TavernLevels {
  seats: number;
  kitchen: number;
  sign: number;
}

export interface Seat {
  x: number;
  flip: boolean;
  kind: 'stool' | 'table';
}

const X0 = 330;
const X1 = 450;
const ANNEX_X1 = 510;
const TERRACE_X0 = 268;

export function tavernCenter() {
  return (X0 + X1) / 2 + 10;
}

/** 席の位置。席数は設定の EFFECTS.seats と一致させる */
export function seatSlots(level: number): Seat[] {
  const s: Seat[] = [];
  const stools = [X0 + 47, X0 + 58, X0 + 69, X0 + 80].slice(0, level === 0 ? 2 : level === 1 ? 3 : 4);
  for (const x of stools) s.push({ x, flip: true, kind: 'stool' });
  const tables = [X0 + 101];
  if (level >= 1) tables.push(X1 + 18);
  if (level >= 2) tables.push(X1 + 44);
  if (level >= 3) tables.push(TERRACE_X0 + 16, TERRACE_X0 + 42);
  for (const tx of tables) {
    s.push({ x: tx - 7, flip: false, kind: 'table' });
    s.push({ x: tx + 7, flip: true, kind: 'table' });
  }
  return s;
}

function tables(level: number): number[] {
  return [...new Set(seatSlots(level).filter((s) => s.kind === 'table').map((s) => (s.flip ? s.x - 7 : s.x + 7)))];
}

// ---------- 背景（時間帯ごとに一度だけ描く） ----------

const layerCache = new Map<string, HTMLCanvasElement>();

function cached(key: string, w: number, h: number, draw: (ctx: Ctx) => void) {
  let c = layerCache.get(key);
  if (!c) {
    c = makeLayer(w, h, draw);
    layerCache.set(key, c);
  }
  return c;
}

const SKY: Record<TimeOfDay, string[]> = {
  day: [P.day0, P.day1, P.day2, P.day3, P.day4],
  dusk: [P.dusk0, P.dusk1, P.dusk2, P.dusk3, P.dusk4],
  night: [P.night0, P.night1, P.night2, P.night3, P.night4],
};

export function skyLayer(tod: TimeOfDay) {
  return cached(`sky-${tod}`, W, H, (ctx) => {
    bands(ctx, 0, 0, W, 150, SKY[tod]);
    rect(ctx, 0, 150, W, H - 150, SKY[tod][4]);
    // 軌道リング（崩壊前の遺物）
    ctx.save();
    ctx.globalAlpha = tod === 'night' ? 0.45 : 0.25;
    for (let x = 0; x < W; x++) {
      const y = Math.round(40 + Math.pow((x - 220) / 260, 2) * 60);
      if (hash(x * 3) > 0.15) px(ctx, x, y, tod === 'night' ? P.teal3 : P.white);
      if (x % 3 === 0) px(ctx, x, y + 2, tod === 'night' ? P.teal2 : P.cream);
    }
    ctx.restore();
    // 欠けた月
    const mx = 300, my = tod === 'night' ? 30 : 46;
    const moon = tod === 'night' ? P.cream : tod === 'dusk' ? P.dusk4 : P.white;
    ctx.save();
    ctx.globalAlpha = tod === 'day' ? 0.5 : 0.95;
    rect(ctx, mx - 6, my - 4, 12, 8, moon);
    rect(ctx, mx - 4, my - 6, 8, 12, moon);
    rect(ctx, mx + 1, my - 5, 5, 4, SKY[tod][0]);
    px(ctx, mx - 2, my + 1, P.metal3);
    px(ctx, mx - 3, my - 2, P.metal3);
    ctx.restore();
    if (tod !== 'day') {
      for (let i = 0; i < 90; i++) {
        const sx = Math.floor(hash(i * 7 + 1) * W);
        const sy = Math.floor(hash(i * 13 + 5) * 110);
        px(ctx, sx, sy, hash(i) > 0.8 ? P.teal4 : P.white);
      }
    }
  });
}

/** 遠景の廃墟（視差 0.25） */
export function farLayer(tod: TimeOfDay) {
  const w = Math.ceil(WORLD_W * 0.25 + W);
  return cached(`far-${tod}`, w, H, (ctx) => {
    const base = tod === 'night' ? P.ruinFar : tod === 'dusk' ? P.dusk0 : '#7d8a98';
    const base2 = tod === 'night' ? P.ruinFar2 : tod === 'dusk' ? P.dusk1 : '#97a2aa';
    let x = -4;
    let i = 0;
    while (x < w) {
      const bw = 14 + Math.floor(hash(i * 3) * 22);
      const bh = 40 + Math.floor(hash(i * 5 + 1) * 70);
      const top = 150 - bh;
      rect(ctx, x, top, bw, bh, i % 2 ? base : base2);
      // 崩れた屋上
      for (let k = 0; k < bw; k++) {
        const cut = Math.floor(hash(i * 31 + k) * 6 * (hash(i * 9) > 0.5 ? 1 : 0.2));
        if (cut > 0) rect(ctx, x + k, top, 1, cut, SKY[tod][Math.min(4, Math.floor(top / 30))]);
      }
      // 骨組み
      if (hash(i * 17) > 0.6) {
        for (let k = 0; k < 10; k++) px(ctx, x + 3 + (k % 2) * 3, top - k, base);
      }
      // 窓
      for (let wy = top + 6; wy < 146; wy += 5) {
        for (let wx = x + 2; wx < x + bw - 2; wx += 4) {
          const h2 = hash(wx * 7 + wy * 13);
          if (tod === 'night' && h2 > 0.93) rect(ctx, wx, wy, 2, 2, P.warm2);
          else if (h2 > 0.55) rect(ctx, wx, wy, 2, 2, tod === 'night' ? P.night1 : base2);
        }
      }
      x += bw + Math.floor(hash(i * 11) * 10);
      i++;
    }
    // 水平線のもや
    dither(ctx, 0, 140, w, 12, tod === 'night' ? P.night2 : SKY[tod][3], SKY[tod][4], 0.4);
  });
}

/** 中景（視差 0.55）: 鉄塔・墜落した船体・砂丘 */
export function midLayer(tod: TimeOfDay) {
  const w = Math.ceil(WORLD_W * 0.55 + W);
  return cached(`mid-${tod}`, w, H, (ctx) => {
    const dark = tod === 'night' ? P.ruinMid : tod === 'dusk' ? '#4a2c44' : '#6a6470';
    const dark2 = tod === 'night' ? P.ruinMid2 : tod === 'dusk' ? '#5e3850' : '#7e7682';
    // 砂丘
    for (let x = 0; x < w; x++) {
      const y = Math.round(160 + Math.sin(x / 37) * 5 + Math.sin(x / 11) * 2);
      rect(ctx, x, y, 1, H - y, dark2);
    }
    // 送電鉄塔
    for (const tx of [60, 250, 470, 640]) {
      if (tx > w) continue;
      for (let y = 80; y < 162; y++) {
        const spread = Math.round((y - 80) / 6);
        px(ctx, tx - spread, y, dark);
        px(ctx, tx + spread, y, dark);
        if (y % 8 === 0) line(ctx, tx - spread, y, tx + spread, y, dark);
        if (y % 8 === 0) line(ctx, tx - spread, y, tx + spread + 1, y + 8, dark);
      }
      rect(ctx, tx - 10, 86, 21, 2, dark);
      if (tod === 'night') px(ctx, tx, 78, P.red);
    }
    // 墜落した船体
    const sx = 360;
    for (let k = 0; k < 90; k++) {
      const hh = Math.round(Math.sin((k / 90) * Math.PI) * 26);
      rect(ctx, sx + k, 160 - hh + Math.floor(k / 12), 1, hh, dark);
    }
    for (let k = 10; k < 80; k += 9) rect(ctx, sx + k, 140 + Math.floor(k / 12), 2, 3, dark2);
    rect(ctx, sx + 70, 132, 3, 26, dark);
  });
}

// ---------- 前景（世界座標） ----------

function drawGround(ctx: Ctx, camX: number, tod: TimeOfDay) {
  const g0 = tod === 'night' ? '#2a2030' : tod === 'dusk' ? P.sand0 : P.sand1;
  const g1 = tod === 'night' ? '#3a2c38' : tod === 'dusk' ? P.sand1 : P.sand2;
  const g2 = tod === 'night' ? '#4a3a42' : tod === 'dusk' ? P.sand2 : P.sand3;
  rect(ctx, 0, FLOOR_Y, W, H - FLOOR_Y, g1);
  dither(ctx, 0, FLOOR_Y + 14, W, H - FLOOR_Y - 14, g1, g0, 0.5);
  rect(ctx, 0, FLOOR_Y, W, 1, g2);
  // ひび割れた道路
  for (let i = 0; i < 40; i++) {
    const wx = i * 23 + Math.floor(hash(i) * 10);
    const x = wx - camX;
    if (x < -20 || x > W + 20) continue;
    rect(ctx, x, FLOOR_Y + 8 + (i % 3) * 4, 8 + (i % 4) * 2, 1, g0);
    px(ctx, x + 3, FLOOR_Y + 9 + (i % 3) * 4, g0);
    if (i % 5 === 0) rect(ctx, x + 10, FLOOR_Y + 22, 3, 2, g2);
  }
}

function drawProps(ctx: Ctx, camX: number, tod: TimeOfDay, t: number) {
  // 錆びた車
  const cx = 120 - camX;
  if (cx > -60 && cx < W + 10) {
    rect(ctx, cx, FLOOR_Y - 14, 44, 12, P.ink);
    rect(ctx, cx + 1, FLOOR_Y - 13, 42, 10, P.rust1);
    rect(ctx, cx + 8, FLOOR_Y - 21, 24, 8, P.ink);
    rect(ctx, cx + 9, FLOOR_Y - 20, 22, 7, P.rust2);
    rect(ctx, cx + 11, FLOOR_Y - 19, 8, 4, tod === 'night' ? P.night1 : P.metal1);
    rect(ctx, cx + 21, FLOOR_Y - 19, 8, 4, tod === 'night' ? P.night1 : P.metal1);
    dither(ctx, cx + 2, FLOOR_Y - 12, 18, 6, P.rust1, P.rust0, 0.4);
    rect(ctx, cx + 4, FLOOR_Y - 4, 7, 5, P.ink);
    rect(ctx, cx + 32, FLOOR_Y - 4, 7, 5, P.ink);
    // 草
    for (let k = 0; k < 6; k++) px(ctx, cx + 40 + k, FLOOR_Y - 1 - (k % 3), P.green2);
  }
  // 道しるべ
  const sx = 230 - camX;
  if (sx > -20 && sx < W + 20) {
    rect(ctx, sx, FLOOR_Y - 34, 2, 34, P.wood1);
    rect(ctx, sx - 12, FLOOR_Y - 32, 26, 7, P.ink);
    rect(ctx, sx - 11, FLOOR_Y - 31, 24, 5, P.wood3);
    tinyText(ctx, 'BAR', sx - 6, FLOOR_Y - 31, P.wood0);
    rect(ctx, sx + 13, FLOOR_Y - 31, 2, 5, P.wood3);
    px(ctx, sx + 15, FLOOR_Y - 29, P.wood3);
  }
  // 発電機と給水塔（右側）
  const gx = 560 - camX;
  if (gx > -60 && gx < W + 20) {
    rect(ctx, gx, FLOOR_Y - 16, 22, 16, P.ink);
    rect(ctx, gx + 1, FLOOR_Y - 15, 20, 15, P.metal1);
    for (let k = 0; k < 5; k++) rect(ctx, gx + 3 + k * 4, FLOOR_Y - 12, 2, 8, P.metal0);
    const on = Math.floor(t * 2) % 2 === 0;
    px(ctx, gx + 18, FLOOR_Y - 14, on ? P.teal3 : P.teal1);
    px(ctx, gx + 16, FLOOR_Y - 14, P.warm2);
    // ケーブル
    for (let k = 0; k < 40; k++) px(ctx, gx - k, FLOOR_Y - 2 + Math.round(Math.sin(k / 6)), P.ink2);
    const wx = 610 - camX;
    rect(ctx, wx, FLOOR_Y - 70, 2, 70, P.metal1);
    rect(ctx, wx + 24, FLOOR_Y - 70, 2, 70, P.metal1);
    line(ctx, wx, FLOOR_Y - 10, wx + 25, FLOOR_Y - 60, P.metal0);
    line(ctx, wx + 25, FLOOR_Y - 10, wx, FLOOR_Y - 60, P.metal0);
    rect(ctx, wx - 6, FLOOR_Y - 96, 38, 28, P.ink);
    rect(ctx, wx - 5, FLOOR_Y - 95, 36, 26, P.rust1);
    for (let k = 0; k < 36; k += 4) rect(ctx, wx - 5 + k, FLOOR_Y - 95, 1, 26, P.rust0);
    dither(ctx, wx - 5, FLOOR_Y - 80, 36, 10, P.rust1, P.rust2, 0.3);
    rect(ctx, wx - 8, FLOOR_Y - 99, 42, 4, P.metal1);
  }
  // 街灯
  const lx = 520 - camX;
  if (lx > -20 && lx < W + 20) {
    rect(ctx, lx, FLOOR_Y - 46, 2, 46, P.metal1);
    rect(ctx, lx - 6, FLOOR_Y - 48, 9, 3, P.metal2);
    if (tod !== 'day') {
      const flick = hash(Math.floor(t * 8)) > 0.08;
      if (flick) {
        rect(ctx, lx - 5, FLOOR_Y - 45, 6, 1, P.warm3);
        glow(ctx, lx - 2, FLOOR_Y - 40, 14, P.warm2, 0.18);
      }
    }
  }
}

// ---------- 酒場 ----------

function corrugated(ctx: Ctx, x: number, y: number, w: number, h: number, a: string, b: string) {
  rect(ctx, x, y, w, h, a);
  for (let i = 0; i < w; i += 3) rect(ctx, x + i, y, 1, h, b);
}

function drawSign(ctx: Ctx, cx: number, y: number, level: number, tod: TimeOfDay, t: number, reduce: boolean) {
  const text = 'LAST ORDER';
  const tw = tinyTextWidth(text);
  const lit = tod !== 'day';
  if (level === 0) {
    const bw = tw + 8;
    line(ctx, cx - bw / 2 + 4, y - 6, cx - bw / 2 + 4, y, P.metal2);
    line(ctx, cx + bw / 2 - 4, y - 6, cx + bw / 2 - 4, y, P.metal2);
    rect(ctx, cx - bw / 2 - 1, y - 1, bw + 2, 10, P.ink);
    rect(ctx, cx - bw / 2, y, bw, 8, P.wood2);
    rect(ctx, cx - bw / 2, y + 7, bw, 1, P.wood1);
    tinyText(ctx, text, cx - tw / 2, y + 2, P.cream);
    return;
  }
  const bw = tw + (level >= 2 ? 16 : 10);
  const by = y - (level >= 2 ? 4 : 0);
  const bh = level >= 2 ? 14 : 10;
  rect(ctx, cx - bw / 2 - 1, by - 1, bw + 2, bh + 2, P.ink);
  rect(ctx, cx - bw / 2, by, bw, bh, P.metal0);
  rect(ctx, cx - 1, by + bh + 1, 2, y + 12 - by - bh, P.metal1);
  const flick = reduce ? true : hash(Math.floor(t * 7)) > 0.06;
  const neon = lit && flick ? P.neon3 : P.neon1;
  if (lit && flick) glow(ctx, cx, by + bh / 2, bw / 2 + 4, P.neon2, reduce ? 0.12 : 0.22);
  tinyText(ctx, text, cx - tw / 2, by + (bh - 5) / 2, neon);
  if (level >= 2) {
    // 電球の縁取り
    for (let i = 0; i < bw; i += 4) {
      const on = lit && (reduce || Math.floor(t * 4 + i / 4) % 3 !== 0);
      px(ctx, cx - bw / 2 + i, by - 1, on ? P.warm3 : P.warm0);
      px(ctx, cx - bw / 2 + i, by + bh, on ? P.warm3 : P.warm0);
    }
    // 矢印
    const ax = cx + bw / 2 + 3;
    rect(ctx, ax, by + 4, 6, 3, lit ? P.teal3 : P.teal1);
    px(ctx, ax + 6, by + 5, lit ? P.teal3 : P.teal1);
  }
  if (level >= 3) {
    // ホログラム看板とサーチライト
    const hx = cx - 26, hy = by - 26;
    ctx.save();
    ctx.globalAlpha = lit ? 0.55 : 0.3;
    rect(ctx, hx, hy, 52, 20, P.teal2);
    for (let k = 0; k < 20; k += 2) rect(ctx, hx, hy + k, 52, 1, P.teal3);
    ctx.restore();
    tinyText(ctx, 'OPEN', hx + 18, hy + 3, P.teal4);
    // カップの絵
    rect(ctx, hx + 22, hy + 10, 7, 6, P.teal4);
    rect(ctx, hx + 29, hy + 11, 2, 3, P.teal4);
    if (lit && !reduce) {
      ctx.save();
      ctx.globalAlpha = 0.09;
      const ang = Math.sin(t * 0.6) * 0.6;
      ctx.fillStyle = P.teal4;
      ctx.beginPath();
      ctx.moveTo(cx, by);
      ctx.lineTo(cx + Math.sin(ang - 0.08) * -300, by - 300);
      ctx.lineTo(cx + Math.sin(ang + 0.08) * -300, by - 300);
      ctx.fill();
      ctx.restore();
    }
  }
}

function drawKitchen(ctx: Ctx, x: number, level: number, t: number, lit: boolean, reduce: boolean, busy: boolean) {
  const fy = FLOOR_Y - 2;
  // かまど
  rect(ctx, x, fy - 16, 22, 16, P.ink);
  rect(ctx, x + 1, fy - 15, 20, 15, P.metal1);
  rect(ctx, x + 1, fy - 15, 20, 2, P.metal3);
  rect(ctx, x + 4, fy - 10, 14, 7, P.ink2);
  const fire = Math.floor(t * 8) % 2;
  rect(ctx, x + 6, fy - 6, 10, 2, fire ? P.warm1 : P.warm2);
  px(ctx, x + 8 + fire * 3, fy - 7, P.warm3);
  // 鍋
  rect(ctx, x + 4, fy - 21, 12, 6, P.ink);
  rect(ctx, x + 5, fy - 20, 10, 5, P.metal2);
  rect(ctx, x + 5, fy - 20, 10, 1, P.metal4);
  // 湯気
  const n = reduce ? 2 : busy ? 6 : 3;
  ctx.save();
  for (let i = 0; i < n; i++) {
    const p = ((t * 0.6 + i / n) % 1);
    ctx.globalAlpha = 0.5 * (1 - p);
    const sx = x + 8 + Math.sin(p * 6 + i) * 3 + i;
    rect(ctx, sx, fy - 23 - p * 18, 2, 2, P.white);
  }
  ctx.restore();
  // 吊るした調理器具
  for (let i = 0; i < 3; i++) {
    line(ctx, x + 3 + i * 6, fy - 46, x + 3 + i * 6, fy - 40, P.metal1);
    rect(ctx, x + 2 + i * 6, fy - 40, 3, 4, i === 1 ? P.rust2 : P.metal2);
  }
  if (level >= 1) {
    // 石窯
    rect(ctx, x + 22, fy - 20, 12, 20, P.ink);
    rect(ctx, x + 23, fy - 19, 10, 19, P.rust1);
    for (let k = 0; k < 19; k += 3) rect(ctx, x + 23, fy - 19 + k, 10, 1, P.rust0);
    rect(ctx, x + 25, fy - 10, 6, 5, P.ink2);
    rect(ctx, x + 26, fy - 7, 4, 2, fire ? P.warm2 : P.warm1);
  }
  if (level >= 2) {
    // フード
    rect(ctx, x - 1, fy - 34, 26, 6, P.ink);
    rect(ctx, x, fy - 33, 24, 4, P.metal2);
    rect(ctx, x + 9, fy - 62, 6, 29, P.metal1);
  }
  if (level >= 3) {
    // 旧文明のプラズマグリル
    rect(ctx, x + 1, fy - 30, 20, 8, P.ink);
    rect(ctx, x + 2, fy - 29, 18, 6, P.teal0);
    const pulse = reduce ? 0 : Math.floor(t * 3) % 2;
    rect(ctx, x + 3, fy - 27, 16, 2, pulse ? P.teal3 : P.teal2);
    if (lit) glow(ctx, x + 11, fy - 26, 10, P.teal3, 0.15);
  }
}

function drawShelf(ctx: Ctx, x: number, y: number, w: number) {
  rect(ctx, x, y, w, 2, P.wood3);
  rect(ctx, x, y + 2, w, 1, P.wood0);
  const colors = [P.green2, P.warm1, P.teal2, P.neon1, P.metal3, P.rust3];
  for (let i = 2; i < w - 2; i += 4) {
    const c = colors[Math.floor(hash(i + x) * colors.length)];
    const h = 4 + Math.floor(hash(i * 3 + x) * 3);
    rect(ctx, x + i, y - h, 2, h, c);
    px(ctx, x + i, y - h - 1, P.ink2);
    px(ctx, x + i, y - h + 1, P.white);
  }
}

function drawTable(ctx: Ctx, cx: number, dishes: number, t: number, reduce: boolean) {
  const fy = FLOOR_Y - 2;
  rect(ctx, cx - 8, fy - 10, 16, 3, P.ink);
  rect(ctx, cx - 7, fy - 10, 14, 2, P.wood3);
  rect(ctx, cx - 1, fy - 7, 2, 7, P.wood1);
  rect(ctx, cx - 4, fy - 1, 8, 1, P.wood1);
  for (let i = 0; i < dishes; i++) {
    const dx = cx - 5 + i * 6;
    rect(ctx, dx, fy - 12, 4, 2, P.white);
    px(ctx, dx + 1, fy - 13, P.warm1);
    if (!reduce && i === 0) {
      const p = (t * 0.8) % 1;
      ctx.save();
      ctx.globalAlpha = 0.4 * (1 - p);
      rect(ctx, dx + 1, fy - 15 - p * 6, 1, 2, P.white);
      ctx.restore();
    }
  }
}

function drawStool(ctx: Ctx, x: number) {
  const fy = FLOOR_Y - 2;
  rect(ctx, x - 3, fy - 7, 6, 2, P.ink);
  rect(ctx, x - 2, fy - 7, 4, 1, P.neon1);
  rect(ctx, x, fy - 5, 1, 5, P.metal2);
  rect(ctx, x - 2, fy - 1, 5, 1, P.metal1);
}

export interface WorldCustomer {
  x: number;
  look: Look;
  state: 'walk' | 'sit' | 'stand';
  flip: boolean;
  frame: number;
  /** 座っている席の種類（高さの調整用） */
  seat?: Seat;
}

export interface WorldOptions {
  tod: TimeOfDay;
  levels: TavernLevels;
  t: number;
  reduce: boolean;
  customers: WorldCustomer[];
  busy: boolean;
  /** テーブルに出ている皿の数（席ごと） */
  dishesOnTables?: Map<number, number>;
}

/** 世界全体を描く。camX は世界座標の左端 */
export function drawWorld(ctx: Ctx, camX: number, o: WorldOptions) {
  const { tod, t, reduce } = o;
  ctx.drawImage(skyLayer(tod), 0, 0);
  // 流れるもや
  if (!reduce) {
    ctx.save();
    ctx.globalAlpha = tod === 'night' ? 0.08 : 0.15;
    for (let i = 0; i < 4; i++) {
      const x = ((i * 140 - t * (4 + i)) % (W + 120) + W + 120) % (W + 120) - 60;
      rect(ctx, x, 60 + i * 14, 60, 3, P.white);
      rect(ctx, x + 10, 63 + i * 14, 40, 2, P.white);
    }
    ctx.restore();
  }
  ctx.drawImage(farLayer(tod), -Math.round(camX * 0.25), 0);
  ctx.drawImage(midLayer(tod), -Math.round(camX * 0.55), 0);
  drawGround(ctx, camX, tod);
  drawProps(ctx, camX, tod, t);

  ctx.save();
  ctx.translate(-Math.round(camX), 0);
  drawTavern(ctx, o);
  ctx.restore();
}

function drawTavern(ctx: Ctx, o: WorldOptions) {
  const { tod, levels, t, reduce, busy } = o;
  const lit = tod !== 'day';
  const fy = FLOOR_Y;
  const roofY = 104;
  const wallTop = 116;

  // 店前の明かり
  if (lit) {
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let k = 0; k < 14; k++) rect(ctx, X0 - k * 2, fy + k, X1 - X0 + k * 4 + (levels.seats >= 1 ? 60 : 0), 1, P.warm2);
    ctx.restore();
  }

  // テラス（客席Lv3）
  if (levels.seats >= 3) {
    rect(ctx, TERRACE_X0, fy - 2, X0 - TERRACE_X0, 3, P.wood2);
    rect(ctx, TERRACE_X0, fy + 1, X0 - TERRACE_X0, 1, P.wood0);
    for (const px0 of [TERRACE_X0 + 16, TERRACE_X0 + 42]) {
      rect(ctx, px0, fy - 34, 1, 32, P.metal2);
      rect(ctx, px0 - 12, fy - 38, 25, 3, P.ink);
      rect(ctx, px0 - 11, fy - 38, 23, 2, px0 % 2 ? P.neon1 : P.teal1);
      rect(ctx, px0 - 8, fy - 40, 17, 2, px0 % 2 ? P.neon2 : P.teal2);
    }
  }

  // 離れ（客席Lv1以上）: 天幕つきの増築
  if (levels.seats >= 1) {
    rect(ctx, X1, fy - 2, ANNEX_X1 - X1, 3, P.wood2);
    rect(ctx, X1, fy + 1, ANNEX_X1 - X1, 2, P.wood0);
    rect(ctx, ANNEX_X1 - 3, wallTop - 4, 3, fy - wallTop + 2, P.wood1);
    // 天幕
    for (let x = X1; x < ANNEX_X1 + 4; x++) {
      const y = wallTop - 8 + Math.floor((x - X1) / 10);
      const stripe = Math.floor((x - X1) / 6) % 2;
      rect(ctx, x, y, 1, 7, stripe ? P.cream : P.teal1);
      px(ctx, x, y + 7, P.ink);
    }
    // 奥の壁（張った布）
    const cloth = lit ? P.wood2 : P.sand2;
    const fold = lit ? P.wood1 : P.sand1;
    rect(ctx, X1, wallTop + 2, ANNEX_X1 - X1 - 3, fy - wallTop - 4, cloth);
    for (let x = X1 + 3; x < ANNEX_X1 - 3; x += 6) rect(ctx, x, wallTop + 2, 1, fy - wallTop - 4, fold);
    rect(ctx, X1, fy - 14, ANNEX_X1 - X1 - 3, 12, lit ? P.wood1 : P.sand1);
    // 吊りランタン
    line(ctx, X1 + 30, wallTop - 1, X1 + 30, wallTop + 8, P.ink);
    rect(ctx, X1 + 28, wallTop + 8, 5, 5, P.ink);
    rect(ctx, X1 + 29, wallTop + 9, 3, 3, lit ? P.warm3 : P.warm1);
    if (lit) glow(ctx, X1 + 30, wallTop + 14, 16, P.warm2, reduce ? 0.1 : 0.16);
    if (levels.seats >= 2) {
      // 電飾
      for (let x = X1 - 40; x < ANNEX_X1; x += 5) {
        const y = wallTop - 1 + Math.round(Math.sin((x - X1) / 9) * 2);
        const on = lit && (reduce || Math.floor(t * 3 + x / 5) % 4 !== 0);
        const colors = [P.warm3, P.neon2, P.teal3];
        px(ctx, x, y, on ? colors[(x / 5) % 3 | 0] : P.ink2);
      }
    }
  }

  // 本館の奥の壁
  const wallC = lit ? P.wood1 : P.wood2;
  rect(ctx, X0, wallTop, X1 - X0, fy - wallTop, wallC);
  for (let x = X0 + 2; x < X1; x += 7) rect(ctx, x, wallTop, 1, fy - wallTop, P.wood0);
  for (let i = 0; i < 12; i++) px(ctx, X0 + 5 + Math.floor(hash(i) * (X1 - X0 - 10)), wallTop + 4 + Math.floor(hash(i * 5) * 30), P.wood0);
  // 腰板（錆びた金属）
  rect(ctx, X0, fy - 18, X1 - X0, 16, P.rust1);
  for (let x = X0; x < X1; x += 3) rect(ctx, x, fy - 18, 1, 16, P.rust0);
  rect(ctx, X0, fy - 18, X1 - X0, 1, P.rust2);
  // 丸窓（宇宙船の舷窓）
  const wx = X0 + 104, wy = wallTop + 16;
  rect(ctx, wx - 8, wy - 6, 16, 12, P.ink);
  rect(ctx, wx - 6, wy - 8, 12, 16, P.ink);
  rect(ctx, wx - 7, wy - 5, 14, 10, P.metal2);
  rect(ctx, wx - 5, wy - 7, 10, 14, P.metal2);
  const view = tod === 'night' ? P.night2 : tod === 'dusk' ? P.dusk2 : P.day1;
  rect(ctx, wx - 5, wy - 4, 10, 8, view);
  rect(ctx, wx - 4, wy - 5, 8, 10, view);
  px(ctx, wx - 3, wy - 3, P.white);
  if (tod === 'night') px(ctx, wx + 2, wy - 1, P.white);
  // 棚
  drawShelf(ctx, X0 + 44, wallTop + 18, 34);
  drawShelf(ctx, X0 + 44, wallTop + 30, 34);

  // 厨房
  drawKitchen(ctx, X0 + 6, levels.kitchen, t, lit, reduce, busy);

  // ランプ
  const lamps = [X0 + 60, X0 + 100, X0 + 22, X1 + 30].slice(0, 2 + Math.min(2, levels.sign));
  for (const lx of lamps) {
    if (lx > X1 && levels.seats < 1) continue;
    line(ctx, lx, wallTop, lx, wallTop + 10, P.ink);
    rect(ctx, lx - 3, wallTop + 10, 7, 3, P.ink);
    rect(ctx, lx - 2, wallTop + 10, 5, 2, P.metal2);
    rect(ctx, lx - 1, wallTop + 13, 3, 1, lit ? P.warm4 : P.warm2);
    if (lit) glow(ctx, lx, wallTop + 22, 22, P.warm2, reduce ? 0.12 : 0.18 + Math.sin(t * 3 + lx) * 0.015);
  }

  // カウンター（マスターはその奥）
  const cx0 = X0 + 40, cx1 = X0 + 86;
  drawMaster(ctx, X0 + 60, fy - 20, t, busy);
  rect(ctx, cx0 - 1, fy - 22, cx1 - cx0 + 2, 22, P.ink);
  rect(ctx, cx0, fy - 21, cx1 - cx0, 3, P.wood4);
  rect(ctx, cx0, fy - 18, cx1 - cx0, 16, P.wood2);
  for (let x = cx0 + 3; x < cx1; x += 8) rect(ctx, x, fy - 16, 6, 12, P.wood1);
  rect(ctx, cx0, fy - 3, cx1 - cx0, 1, P.metal2);
  // カウンター上の物
  rect(ctx, cx0 + 4, fy - 25, 3, 4, P.teal3);
  rect(ctx, cx0 + 30, fy - 24, 6, 3, P.metal3);

  // 床
  rect(ctx, X0, fy - 2, X1 - X0, 2, P.wood3);
  rect(ctx, X0 - 2, fy, X1 - X0 + 4, 4, P.metal1);
  for (let x = X0; x < X1; x += 12) rect(ctx, x, fy, 10, 3, P.metal2);

  // 椅子とテーブル
  for (const s of seatSlots(levels.seats)) if (s.kind === 'stool') drawStool(ctx, s.x);
  for (const tx of tables(levels.seats)) drawTable(ctx, tx, o.dishesOnTables?.get(tx) ?? 0, t, reduce);

  // 客
  for (const c of o.customers) {
    const sitting = c.state === 'sit';
    const yy = sitting ? fy - 7 : fy - 1;
    drawPerson(ctx, c.x, yy, c.look, sitting ? 'sit' : c.state === 'walk' ? 'walk' : 'stand', c.frame, c.flip);
  }

  // 柱・左の壁（コンテナ）
  corrugated(ctx, X0 - 6, wallTop - 4, 6, fy - wallTop + 4, P.rust1, P.rust0);
  rect(ctx, X1 - 3, wallTop - 4, 4, fy - wallTop + 4, P.wood1);
  rect(ctx, X1 - 2, wallTop - 4, 1, fy - wallTop + 4, P.wood2);
  rect(ctx, X0 - 6, wallTop - 4, X1 - X0 + 10, 4, P.wood1);
  rect(ctx, X0 - 6, wallTop - 4, X1 - X0 + 10, 1, P.wood3);

  // 屋根（波板）
  for (let x = X0 - 12; x < X1 + 10; x++) {
    const y = roofY + Math.floor((x - X0 + 12) / 18);
    const c = Math.floor((x - X0) / 3) % 2 ? P.metal1 : P.metal2;
    rect(ctx, x, y, 1, wallTop - 4 - y, c);
    if (hash(x) > 0.82) rect(ctx, x, y + 2, 1, 3, P.rust2);
  }
  rect(ctx, X0 - 12, wallTop - 5, X1 - X0 + 22, 1, P.ink);

  // 煙突の煙（厨房Lv2以上）
  if (levels.kitchen >= 2) {
    const chx = X0 + 15;
    rect(ctx, chx, roofY - 16, 6, 20, P.ink);
    rect(ctx, chx + 1, roofY - 15, 4, 19, P.metal1);
    if (!reduce) {
      ctx.save();
      for (let i = 0; i < 5; i++) {
        const p = (t * 0.3 + i / 5) % 1;
        ctx.globalAlpha = 0.35 * (1 - p);
        rect(ctx, chx + Math.sin(p * 5 + i) * 4 + p * 14, roofY - 18 - p * 40, 3 + p * 4, 3, tod === 'night' ? P.metal2 : P.metal3);
      }
      ctx.restore();
    }
  }

  // 看板
  drawSign(ctx, (X0 + X1) / 2 + 4, roofY - 14, levels.sign, tod, t, reduce);
}

export { CUSTOMER_LOOKS };
