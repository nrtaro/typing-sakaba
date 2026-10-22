import { P, rect, px, type Ctx } from './px';

// ---------- 人物 ----------

export interface Look {
  skin: string;
  hair: string;
  body: string;
  bodyDark: string;
  legs: string;
  /** 頭の種類 */
  head: 'hair' | 'hood' | 'helmet' | 'robot' | 'cap';
  accent: string;
  /** 背中の装備 */
  gear: 'none' | 'sword' | 'pack' | 'rifle';
}

export const CUSTOMER_LOOKS: Look[] = [
  { skin: P.skin2, hair: P.wood1, body: P.teal1, bodyDark: P.teal0, legs: P.metal0, head: 'hair', accent: P.metal3, gear: 'sword' },
  { skin: P.skin1, hair: P.ink2, body: P.rust2, bodyDark: P.rust1, legs: P.wood0, head: 'hood', accent: P.sand3, gear: 'pack' },
  { skin: P.metal3, hair: P.metal1, body: P.metal2, bodyDark: P.metal1, legs: P.metal0, head: 'robot', accent: P.teal3, gear: 'none' },
  { skin: P.skin2, hair: P.warm1, body: P.green1, bodyDark: P.green0, legs: P.wood1, head: 'cap', accent: P.warm2, gear: 'rifle' },
  { skin: P.skin0, hair: P.metal2, body: P.neon0, bodyDark: P.ink2, legs: P.metal0, head: 'helmet', accent: P.teal3, gear: 'sword' },
  { skin: P.skin1, hair: P.cream, body: P.sand1, bodyDark: P.sand0, legs: P.rust0, head: 'hair', accent: P.neon2, gear: 'pack' },
];

/**
 * 立ち・歩き・座りの人物。(x, y) は足元の中央。
 * pose: stand / walk / sit, frame: 歩きのコマ
 */
export function drawPerson(ctx: Ctx, x: number, y: number, look: Look, pose: 'stand' | 'walk' | 'sit', frame = 0, flip = false) {
  x = Math.round(x);
  y = Math.round(y);
  const d = flip ? -1 : 1;
  const legH = pose === 'sit' ? 2 : 4;
  const torsoTop = y - legH - 6;
  const headTop = torsoTop - 5;

  // 輪郭（背面に一回り大きく）
  rect(ctx, x - 4, headTop - 1, 8, 6 + 1, P.ink);
  rect(ctx, x - 4, torsoTop - 1, 8, 7, P.ink);
  rect(ctx, x - 3, y - legH - 1, 6, legH + 1, P.ink);

  // 背中の装備
  if (look.gear === 'sword') {
    rect(ctx, x - 4 * d - (d < 0 ? 0 : 0), torsoTop - 4, 1, 9, P.metal3);
    px(ctx, x - 4 * d, torsoTop - 5, P.warm2);
  } else if (look.gear === 'pack') {
    rect(ctx, d > 0 ? x - 6 : x + 3, torsoTop, 3, 5, P.ink);
    rect(ctx, d > 0 ? x - 5 : x + 3, torsoTop + 1, 2, 3, P.sand1);
  } else if (look.gear === 'rifle') {
    for (let i = 0; i < 8; i++) px(ctx, x - 4 * d + (i >> 2) * -d, torsoTop - 3 + i, P.metal1);
  }

  // 脚
  if (pose === 'sit') {
    rect(ctx, x - 2, y - 2, 5 * d > 0 ? 6 : 6, 2, look.legs);
  } else {
    const off = pose === 'walk' ? (frame % 2 === 0 ? 1 : -1) : 0;
    rect(ctx, x - 2 + (off > 0 ? 0 : 0), y - 4, 2, 4 - (off > 0 ? 1 : 0), look.legs);
    rect(ctx, x + 1, y - 4, 2, 4 - (off < 0 ? 1 : 0), look.legs);
    px(ctx, x - 2, y - 1, P.ink2);
    px(ctx, x + 2, y - 1, P.ink2);
  }

  // 胴
  rect(ctx, x - 3, torsoTop, 6, 6, look.body);
  rect(ctx, d > 0 ? x + 2 : x - 3, torsoTop, 1, 6, look.bodyDark);
  rect(ctx, x - 3, torsoTop + 4, 6, 1, look.bodyDark);
  px(ctx, x, torsoTop + 4, look.accent);
  // 腕
  const swing = pose === 'walk' ? (frame % 2 === 0 ? 1 : 0) : 0;
  rect(ctx, x - 4, torsoTop + 1 + swing, 1, 4, look.bodyDark);
  rect(ctx, x + 3, torsoTop + 1 + (1 - swing), 1, 4, look.bodyDark);
  px(ctx, x - 4, torsoTop + 5 + swing, look.skin);
  px(ctx, x + 3, torsoTop + 5 + (1 - swing), look.skin);

  // 頭
  rect(ctx, x - 3, headTop, 6, 5, look.skin);
  const eyeX = d > 0 ? x + 1 : x - 2;
  switch (look.head) {
    case 'hair':
      rect(ctx, x - 3, headTop, 6, 2, look.hair);
      px(ctx, d > 0 ? x - 3 : x + 2, headTop + 2, look.hair);
      break;
    case 'hood':
      rect(ctx, x - 3, headTop, 6, 2, look.body);
      rect(ctx, d > 0 ? x - 3 : x + 2, headTop, 1, 5, look.body);
      break;
    case 'helmet':
      rect(ctx, x - 3, headTop, 6, 3, look.hair);
      rect(ctx, x - 2 * -d - 1, headTop + 2, 4, 1, look.accent);
      break;
    case 'robot':
      rect(ctx, x - 3, headTop, 6, 5, look.skin);
      rect(ctx, x - 3, headTop + 4, 6, 1, look.hair);
      px(ctx, x, headTop - 1, look.hair);
      px(ctx, x, headTop - 2, look.accent);
      break;
    case 'cap':
      rect(ctx, x - 3, headTop, 6, 2, look.hair);
      rect(ctx, d > 0 ? x + 1 : x - 4, headTop + 1, 3, 1, look.hair);
      break;
  }
  if (look.head === 'robot') {
    rect(ctx, eyeX - (d > 0 ? 1 : 0), headTop + 2, 2, 1, look.accent);
  } else if (look.head !== 'helmet') {
    px(ctx, eyeX, headTop + 2, P.ink);
  }
}

/** カウンターの向こうのマスター（上半身）。(x, y) はカウンター天板の高さの中央 */
export function drawMaster(ctx: Ctx, x: number, y: number, t: number, busy: boolean) {
  x = Math.round(x);
  y = Math.round(y);
  const top = y - 16;
  rect(ctx, x - 5, top - 1, 10, 17, P.ink);
  // 体（シャツ＋エプロン）
  rect(ctx, x - 4, top + 7, 8, 9, P.cream);
  rect(ctx, x - 3, top + 9, 6, 7, P.wood2);
  rect(ctx, x - 3, top + 9, 6, 1, P.wood3);
  // 頭
  rect(ctx, x - 3, top + 1, 6, 6, P.skin1);
  rect(ctx, x - 3, top, 6, 2, P.ink2);
  // ゴーグル
  rect(ctx, x - 4, top + 2, 8, 1, P.metal1);
  px(ctx, x - 2, top + 2, P.teal3);
  px(ctx, x + 1, top + 2, P.teal3);
  // 目とひげ
  px(ctx, x - 2, top + 4, P.ink);
  px(ctx, x + 1, top + 4, P.ink);
  rect(ctx, x - 2, top + 5, 4, 2, P.metal2);
  // 腕（グラスを拭く）
  const phase = busy ? Math.floor(t * 6) % 2 : Math.floor(t * 1.5) % 4 === 0 ? 1 : 0;
  rect(ctx, x - 5, top + 9, 1, 5, P.cream);
  rect(ctx, x + 4, top + 8 + phase, 1, 4, P.cream);
  // グラス
  rect(ctx, x + 3 + phase, top + 11 - phase, 2, 3, P.teal4);
  px(ctx, x + 3 + phase, top + 11 - phase, P.white);
}

// ---------- 動物 ----------

/** 砂ウサギ（触角が光る変異種）。(x, y) は足元 */
export function drawRabbit(ctx: Ctx, x: number, y: number, t: number, flash: boolean) {
  x = Math.round(x);
  const hop = Math.abs(Math.sin(t * 10)) * 4;
  y = Math.round(y - hop);
  const body = flash ? P.white : P.sand3;
  const dark = flash ? P.cream : P.sand1;
  rect(ctx, x - 5, y - 7, 11, 6, P.ink);
  rect(ctx, x - 4, y - 6, 9, 4, body);
  rect(ctx, x - 4, y - 3, 9, 1, dark);
  // 頭（左向き）
  rect(ctx, x - 7, y - 9, 5, 5, P.ink);
  rect(ctx, x - 6, y - 8, 3, 3, body);
  px(ctx, x - 6, y - 7, P.ink);
  // 耳＋光る先端
  rect(ctx, x - 4, y - 14, 1, 5, dark);
  rect(ctx, x - 3, y - 13, 1, 4, body);
  px(ctx, x - 4, y - 15, P.teal3);
  px(ctx, x - 3, y - 14, P.teal3);
  // 尾
  px(ctx, x + 5, y - 6, P.white);
  // 脚
  const f = Math.floor(t * 10) % 2;
  rect(ctx, x - 3, y - 2, 2, 2 - f, dark);
  rect(ctx, x + 2, y - 2, 2, 1 + f, dark);
}

/** 鉄角ジカ（金属の角と背板を持つ） */
export function drawDeer(ctx: Ctx, x: number, y: number, t: number, flash: boolean) {
  x = Math.round(x);
  y = Math.round(y);
  const f = Math.floor(t * 8) % 2;
  const body = flash ? P.white : P.rust2;
  const dark = flash ? P.cream : P.rust1;
  // 脚
  for (const [lx, ph] of [[-8, 0], [-5, 1], [5, 0], [8, 1]] as const) {
    const lift = (f + ph) % 2;
    rect(ctx, x + lx, y - 8, 1, 8 - lift, P.ink);
    rect(ctx, x + lx + 1, y - 8, 1, 7 - lift, dark);
  }
  // 胴
  rect(ctx, x - 11, y - 17, 23, 10, P.ink);
  rect(ctx, x - 10, y - 16, 21, 8, body);
  rect(ctx, x - 10, y - 10, 21, 2, dark);
  // 背中の金属板
  for (let i = 0; i < 4; i++) rect(ctx, x - 6 + i * 4, y - 18, 3, 2, i % 2 ? P.metal2 : P.metal3);
  // 首と頭（左向き）
  rect(ctx, x - 15, y - 23, 7, 8, P.ink);
  rect(ctx, x - 14, y - 22, 5, 7, body);
  rect(ctx, x - 19, y - 24, 8, 5, P.ink);
  rect(ctx, x - 18, y - 23, 6, 3, body);
  px(ctx, x - 16, y - 23, P.warm3);
  px(ctx, x - 18, y - 21, P.ink);
  // 鉄の角
  const horn = P.metal3;
  rect(ctx, x - 15, y - 30, 1, 7, horn);
  rect(ctx, x - 18, y - 29, 3, 1, horn);
  rect(ctx, x - 12, y - 31, 1, 8, P.metal4);
  rect(ctx, x - 12, y - 28, 3, 1, P.metal4);
  px(ctx, x - 15, y - 31, P.teal3);
  px(ctx, x - 12, y - 32, P.teal3);
  // 尾
  rect(ctx, x + 11, y - 16, 2, 2, body);
}

/** 水中の魚影 */
export function drawFishShadow(ctx: Ctx, x: number, y: number, big: boolean, t: number) {
  const len = big ? 26 : 12;
  const h = big ? 7 : 4;
  const wig = Math.round(Math.sin(t * 8) * (big ? 2 : 1));
  ctx.save();
  ctx.globalAlpha = 0.55;
  rect(ctx, x - len / 2, y - h / 2, len, h, P.water0);
  rect(ctx, x - len / 2 + 2, y - h / 2 - 1, len - 4, h + 2, P.water0);
  rect(ctx, x + len / 2, y - h / 2 + wig, big ? 6 : 3, h, P.water0);
  ctx.restore();
}

/** 跳ねる魚 */
export function drawFish(ctx: Ctx, x: number, y: number, big: boolean, angle: number) {
  const len = big ? 22 : 11;
  const h = big ? 8 : 5;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(Math.round(angle * 4) / 4);
  rect(ctx, -len / 2 - 1, -h / 2 - 1, len + 2, h + 2, P.ink);
  rect(ctx, -len / 2, -h / 2, len, h, big ? P.green2 : P.metal3);
  rect(ctx, -len / 2, 0, len, h / 2, big ? P.green1 : P.metal2);
  rect(ctx, -len / 2 + 2, -h / 2, len - 6, 1, big ? P.green3 : P.metal4);
  rect(ctx, len / 2, -h / 2 - 1, big ? 5 : 3, h + 2, big ? P.green1 : P.metal2);
  px(ctx, -len / 2 + 2, -1, P.ink);
  if (big) {
    rect(ctx, -2, -h / 2 - 3, 6, 3, P.green1);
    // ひげ
    rect(ctx, -len / 2 - 4, 1, 4, 1, P.green0);
  }
  ctx.restore();
}
