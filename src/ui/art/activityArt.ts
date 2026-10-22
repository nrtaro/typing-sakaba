import { drawDeer, drawFish, drawFishShadow, drawRabbit } from './actors';
import { H, P, W, bands, dither, glow, hash, line, makeLayer, px, rect, type Ctx } from './px';
import { skyLayer } from './world';
import type { FishingModel } from '../../core/fishing';
import type { HuntingModel, Prey } from '../../core/hunting';

// ================= 釣り =================

export const WATER_Y = 120;
const BOBBER_X = 236;
const PIER_END = 96;

const fishingBg = () =>
  makeLayer(W, H, (ctx) => {
    ctx.drawImage(skyLayer('dusk'), 0, 0);
    // 水没した街
    const towers: [number, number, number][] = [[150, 18, 70], [176, 12, 46], [196, 24, 88], [232, 14, 52], [262, 20, 64], [300, 10, 40], [330, 26, 76], [20, 0, 0]];
    for (const [x, w, h] of towers) {
      if (!w) continue;
      rect(ctx, x, WATER_Y - h, w, h, P.dusk0);
      for (let k = 0; k < w; k++) if (hash(x + k) > 0.6) rect(ctx, x + k, WATER_Y - h, 1, Math.floor(hash(k * x) * 5), P.dusk1);
      for (let wy = WATER_Y - h + 5; wy < WATER_Y - 3; wy += 6) {
        for (let wx = x + 2; wx < x + w - 2; wx += 4) if (hash(wx * 3 + wy) > 0.6) rect(ctx, wx, wy, 2, 2, P.dusk1);
      }
    }
    // 対岸の木々
    for (let x = 0; x < W; x++) {
      const h = 4 + Math.floor(Math.sin(x / 7) * 2 + hash(x) * 3);
      rect(ctx, x, WATER_Y - h, 1, h, '#2e2440');
    }
    // 水
    bands(ctx, 0, WATER_Y, W, H - WATER_Y, [P.dusk2, P.water2, P.water1, P.water0]);
    // 映り込み
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (const [x, w, h] of towers) {
      if (!w) continue;
      for (let y = 0; y < h * 0.7; y += 2) rect(ctx, x + ((y / 2) % 2), WATER_Y + y, w, 1, P.dusk0);
    }
    ctx.restore();
  });

let fishingBgCache: HTMLCanvasElement | null = null;

export interface FishingFx {
  splashes: { x: number; y: number; t: number }[];
  jump: { t: number; big: boolean } | null;
  basket: number;
  bigBasket: number;
}

export function newFishingFx(): FishingFx {
  return { splashes: [], jump: null, basket: 0, bigBasket: 0 };
}

export function drawFishing(ctx: Ctx, m: FishingModel, fx: FishingFx, t: number, reduce: boolean) {
  fishingBgCache ??= fishingBg();
  ctx.drawImage(fishingBgCache, 0, 0);

  // さざ波: 静けさが増すほど穏やかになる
  const calm = m.calm / 3;
  const rippleCount = reduce ? 8 : Math.round(26 - calm * 18);
  for (let i = 0; i < rippleCount; i++) {
    const y = WATER_Y + 4 + Math.floor(hash(i * 7) * (H - WATER_Y - 8));
    const speed = 6 + hash(i) * 10;
    const x = ((hash(i * 3) * W + t * speed * (1 - calm * 0.7)) % (W + 30)) - 15;
    const len = 4 + Math.floor(hash(i * 11) * 10) * (1 - calm * 0.5);
    rect(ctx, x, y, len, 1, y < WATER_Y + 30 ? P.dusk3 : P.water3);
  }
  // 静けさが満ちると大物の影が回遊する
  if (m.calm >= 3 && m.phase !== 'hooked') {
    const sx = 250 + Math.sin(t * 0.7) * 50;
    drawFishShadow(ctx, sx, 175 + Math.cos(t * 0.7) * 10, true, t);
  }

  // 桟橋
  rect(ctx, 0, 132, PIER_END, 6, P.ink);
  rect(ctx, 0, 132, PIER_END - 1, 4, P.wood3);
  for (let x = 0; x < PIER_END; x += 8) rect(ctx, x, 132, 1, 4, P.wood1);
  for (const x of [10, 44, 82]) {
    rect(ctx, x, 136, 4, 40, P.wood0);
    ctx.save();
    ctx.globalAlpha = 0.3;
    rect(ctx, x, 176, 4, 14, P.wood0);
    ctx.restore();
  }
  // かご
  rect(ctx, 16, 122, 18, 10, P.ink);
  rect(ctx, 17, 123, 16, 9, P.wood2);
  for (let i = 0; i < 16; i += 3) rect(ctx, 17 + i, 123, 1, 9, P.wood1);
  for (let i = 0; i < Math.min(fx.basket, 6); i++) rect(ctx, 19 + (i % 3) * 4, 120 - Math.floor(i / 3) * 2, 3, 2, P.metal3);
  for (let i = 0; i < Math.min(fx.bigBasket, 3); i++) rect(ctx, 18 + i * 5, 116, 5, 3, P.green2);

  // マスター
  const mx = 66;
  const my = 132;
  rect(ctx, mx - 4, my - 22, 9, 22, P.ink);
  rect(ctx, mx - 3, my - 13, 7, 9, P.teal1);
  rect(ctx, mx - 3, my - 4, 3, 4, P.metal0);
  rect(ctx, mx + 1, my - 4, 3, 4, P.metal0);
  rect(ctx, mx - 3, my - 20, 7, 7, P.skin1);
  rect(ctx, mx - 3, my - 21, 7, 3, P.wood1);
  rect(ctx, mx - 5, my - 19, 11, 1, P.wood1);
  px(ctx, mx + 2, my - 17, P.ink);
  // 竿
  const hooked = m.phase === 'hooked';
  const bend = hooked ? 6 + Math.sin(t * 12) * (reduce ? 0 : 1.5) : 0;
  const tipX = 118, tipY = 88 + bend;
  rect(ctx, mx + 3, my - 12, 3, 2, P.skin1);
  line(ctx, mx + 5, my - 11, tipX, tipY, P.wood0);
  line(ctx, mx + 5, my - 12, tipX, tipY - 1, P.wood3);

  // 魚の位置（釣り上げ進捗に応じて手前へ）
  let progress = 0;
  if (hooked && m.fish && m.matcher) {
    const wordP = m.matcher.kanaPos / m.matcher.reading.length;
    progress = (m.fish.wordsDone + wordP) / m.fish.wordsNeeded;
  }
  const fishX = BOBBER_X - progress * (BOBBER_X - PIER_END - 20);
  const bob = reduce ? 0 : Math.sin(t * 2.5) * 1;
  const bobY = WATER_Y + 10 + (hooked ? 3 + (reduce ? 0 : Math.sin(t * 15)) : bob);
  const bobX = hooked ? fishX : BOBBER_X;
  // 糸
  line(ctx, tipX, tipY, bobX, bobY - 2, hooked ? P.white : P.cream);
  // 浮き
  if (m.phase !== 'over') {
    rect(ctx, bobX - 1, bobY - 4, 3, 3, P.red);
    rect(ctx, bobX - 1, bobY - 1, 3, 2, P.white);
    if (!hooked) rect(ctx, bobX - 3, bobY + 1, 7, 1, P.dusk3);
  }
  if (hooked && m.fish) {
    drawFishShadow(ctx, fishX + (m.fish.big ? 14 : 8), bobY + 10, m.fish.big, t);
  }

  // 水しぶき
  for (const s of fx.splashes) {
    const r = s.t * 30;
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - s.t * 1.6);
    rect(ctx, s.x - r, s.y, r * 2, 1, P.water4);
    rect(ctx, s.x - r * 0.6, s.y - 2, r * 1.2, 1, P.white);
    for (let i = 0; i < 5; i++) px(ctx, s.x - 6 + i * 3, s.y - 4 - Math.sin(s.t * 6 + i) * 6 * (1 - s.t), P.white);
    ctx.restore();
  }
  // 跳ね上がる魚
  if (fx.jump) {
    const p = Math.min(1, fx.jump.t / 0.6);
    const x = PIER_END + 20 - p * 70;
    const y = WATER_Y - Math.sin(p * Math.PI) * 50 + p * 4;
    drawFish(ctx, x, y, fx.jump.big, -0.8 + p * 1.6);
    if (!reduce) glow(ctx, x, y, 10, P.warm3, 0.15);
  }
}

export function stepFishingFx(fx: FishingFx, dt: number) {
  for (const s of fx.splashes) s.t += dt;
  fx.splashes = fx.splashes.filter((s) => s.t < 0.8);
  if (fx.jump) {
    fx.jump.t += dt;
    if (fx.jump.t > 0.6) fx.jump = null;
  }
}

export function fishingSplash(fx: FishingFx, m: FishingModel) {
  fx.splashes.push({ x: m.phase === 'hooked' ? BOBBER_X : PIER_END + 20, y: WATER_Y + 12, t: 0 });
}

// ================= 狩り =================

const FIELD_X0 = 46;
const FIELD_W = W - FIELD_X0 - 6;

export function preyScreen(p: Prey): { x: number; y: number } {
  return { x: FIELD_X0 + p.x * FIELD_W, y: 124 + p.lane * 52 };
}

const huntingBg = () =>
  makeLayer(W, H, (ctx) => {
    ctx.drawImage(skyLayer('dusk'), 0, 0);
    // 崩れた高架道路
    rect(ctx, 0, 92, W, 6, P.dusk0);
    rect(ctx, 0, 98, W, 2, P.ink2);
    for (const x of [40, 130, 220, 310]) rect(ctx, x, 100, 8, 30, P.dusk0);
    rect(ctx, 168, 90, 30, 10, P.dusk2); // 崩落部
    for (let k = 0; k < 14; k++) rect(ctx, 166 + k * 2, 98 + (k % 3) * 2, 2, 3, P.dusk0);
    // 砂丘
    for (let x = 0; x < W; x++) {
      const y = Math.round(120 + Math.sin(x / 40) * 6 + Math.sin(x / 13) * 2);
      rect(ctx, x, y, 1, H - y, P.sand2);
    }
    bands(ctx, 0, 124, W, H - 124, [P.sand3, P.sand2, P.sand1]);
    // 地面の筋
    for (let i = 0; i < 70; i++) {
      const x = Math.floor(hash(i * 3) * W);
      const y = 128 + Math.floor(hash(i * 7) * 84);
      rect(ctx, x, y, 3 + Math.floor(hash(i) * 8), 1, P.sand1);
    }
    // 廃車
    rect(ctx, 290, 118, 40, 10, P.rust0);
    rect(ctx, 298, 112, 22, 7, P.rust1);
    dither(ctx, 290, 120, 40, 8, P.rust0, P.rust1, 0.3);
    // 逃走ライン（崩れた柵）
    for (let y = 124; y < 212; y += 9) {
      rect(ctx, FIELD_X0 - 8, y, 2, 7, P.wood0);
      rect(ctx, FIELD_X0 - 9, y + 2, 4, 1, P.wood1);
    }
  });

let huntingBgCache: HTMLCanvasElement | null = null;

export interface HuntingFx {
  shots: { x: number; y: number; t: number }[];
  bursts: { x: number; y: number; t: number; big: boolean }[];
  missFlash: number;
}

export function newHuntingFx(): HuntingFx {
  return { shots: [], bursts: [], missFlash: 0 };
}

export function stepHuntingFx(fx: HuntingFx, dt: number) {
  for (const s of fx.shots) s.t += dt;
  for (const b of fx.bursts) b.t += dt;
  fx.shots = fx.shots.filter((s) => s.t < 0.18);
  fx.bursts = fx.bursts.filter((b) => b.t < 0.7);
  fx.missFlash = Math.max(0, fx.missFlash - dt);
}

const MUZZLE = { x: 34, y: 168 };

export function drawHunting(ctx: Ctx, m: HuntingModel, fx: HuntingFx, t: number, reduce: boolean) {
  huntingBgCache ??= huntingBg();
  ctx.drawImage(huntingBgCache, 0, 0);

  // 舞う砂
  if (!reduce) {
    ctx.save();
    ctx.globalAlpha = 0.35;
    for (let i = 0; i < 30; i++) {
      const x = ((hash(i) * W - t * (30 + hash(i * 2) * 40)) % W + W) % W;
      const y = 110 + hash(i * 5) * 100 + Math.sin(t * 2 + i) * 3;
      px(ctx, x, y, P.sand4);
    }
    ctx.restore();
  }

  // 獲物（奥のレーンから描く）
  const sorted = [...m.prey].sort((a, b) => a.lane - b.lane);
  for (const p of sorted) {
    const s = preyScreen(p);
    // 土煙
    if (!reduce) {
      ctx.save();
      ctx.globalAlpha = 0.3;
      for (let i = 0; i < 3; i++) rect(ctx, s.x + 8 + i * 5 + ((t * 20) % 5), s.y - 2 - i, 3, 2, P.sand4);
      ctx.restore();
    }
    const flash = p.flash > 0 && Math.floor(p.flash * 30) % 2 === 0;
    if (p.kind === 'rabbit') drawRabbit(ctx, s.x, s.y, t + p.id, flash);
    else drawDeer(ctx, s.x, s.y, t + p.id, flash);
    // 体力
    const top = s.y - (p.kind === 'deer' ? 36 : 20);
    for (let i = 0; i < p.maxHp; i++) {
      rect(ctx, s.x - p.maxHp * 2 + i * 4, top, 3, 2, i < p.hp ? P.neon2 : P.ink2);
    }
    // 狙い
    if (m.lockId === p.id) {
      const r = p.kind === 'deer' ? 18 : 10;
      const cy = s.y - (p.kind === 'deer' ? 16 : 7);
      const c = P.red;
      for (const [dx, dy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        rect(ctx, s.x + dx * r - (dx > 0 ? 3 : 0), cy + dy * r, 4, 1, c);
        rect(ctx, s.x + dx * r, cy + dy * r - (dy > 0 ? 3 : 0), 1, 4, c);
      }
      for (let k = 0; k < 40; k += 4) {
        const f = k / 40;
        px(ctx, MUZZLE.x + (s.x - MUZZLE.x) * f, MUZZLE.y + (cy - MUZZLE.y) * f, P.neon3);
      }
    }
  }

  // 弾道
  for (const sh of fx.shots) {
    line(ctx, MUZZLE.x, MUZZLE.y, sh.x, sh.y, P.warm4);
    if (!reduce) glow(ctx, MUZZLE.x + 3, MUZZLE.y, 6, P.warm3, 0.5);
  }
  for (const b of fx.bursts) {
    const n = b.big ? 12 : 7;
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const r = b.t * (b.big ? 40 : 26);
      ctx.save();
      ctx.globalAlpha = 1 - b.t / 0.7;
      rect(ctx, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r * 0.6, 2, 2, i % 2 ? P.warm3 : P.sand4);
      ctx.restore();
    }
  }

  // マスター（しゃがんで構える）
  const mx = 22, my = 176;
  rect(ctx, mx - 5, my - 16, 12, 16, P.ink);
  rect(ctx, mx - 4, my - 9, 9, 6, P.green1);
  rect(ctx, mx - 4, my - 3, 10, 3, P.metal0);
  rect(ctx, mx - 3, my - 15, 7, 6, P.skin1);
  rect(ctx, mx - 4, my - 16, 9, 3, P.green0);
  px(ctx, mx + 2, my - 12, P.ink);
  rect(ctx, mx + 1, my - 10, 14, 2, P.metal1);
  rect(ctx, mx + 4, my - 11, 4, 1, P.metal3);
  rect(ctx, mx - 2, my - 9, 4, 3, P.wood2);

  if (fx.missFlash > 0 && !reduce) {
    ctx.save();
    ctx.globalAlpha = fx.missFlash * 0.8;
    rect(ctx, 0, 0, W, 2, P.red);
    rect(ctx, 0, H - 2, W, 2, P.red);
    ctx.restore();
  }
}

export function huntingShot(fx: HuntingFx, p: Prey, killed: boolean) {
  const s = preyScreen(p);
  const cy = s.y - (p.kind === 'deer' ? 16 : 7);
  fx.shots.push({ x: s.x, y: cy, t: 0 });
  if (killed) fx.bursts.push({ x: s.x, y: cy, t: 0, big: p.kind === 'deer' });
}
