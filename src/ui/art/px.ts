// ピクセル描画の基本処理（仮素材: すべてコードで描いている）

export const W = 384;
export const H = 216;

export const P = {
  ink: '#120e18',
  ink2: '#221a2c',
  white: '#f4ecdc',
  cream: '#e8d8b0',
  // 空
  night0: '#0f0c1e', night1: '#1b1533', night2: '#2b2150', night3: '#46306a', night4: '#6a3f74',
  dusk0: '#3a2a55', dusk1: '#7a3f63', dusk2: '#c25e55', dusk3: '#ea8f58', dusk4: '#f6c27a',
  day0: '#4f7f9a', day1: '#7fa9b4', day2: '#b9c7ae', day3: '#e8c98e', day4: '#f3d9a4',
  // 廃墟
  ruinFar: '#3b3352', ruinFar2: '#4a3f63', ruinMid: '#2a2236', ruinMid2: '#3a2f48',
  // 金属・錆
  metal0: '#2e323c', metal1: '#4a505c', metal2: '#6e7582', metal3: '#9aa1ab', metal4: '#c6ccd2',
  rust0: '#4a2618', rust1: '#7a3c22', rust2: '#a8582e', rust3: '#cf7a3e',
  // 木
  wood0: '#3a2316', wood1: '#5a3820', wood2: '#7c4f2c', wood3: '#a06a3a', wood4: '#c8904e',
  // 地面
  sand0: '#5e4630', sand1: '#86643f', sand2: '#a98250', sand3: '#cba46a', sand4: '#e2c690',
  // 光
  warm0: '#a85a22', warm1: '#e08a30', warm2: '#ffb84a', warm3: '#ffd98a', warm4: '#fff3c8',
  teal0: '#16424a', teal1: '#22707a', teal2: '#36a8a8', teal3: '#6ee0d0', teal4: '#c0fff2',
  neon0: '#7a1840', neon1: '#d0306a', neon2: '#ff5a8a', neon3: '#ffa0c0',
  green0: '#2a3a24', green1: '#3e5a32', green2: '#5e7e44', green3: '#8aa858',
  water0: '#0e2236', water1: '#173a52', water2: '#24586e', water3: '#3c8296', water4: '#8cc8d4',
  skin0: '#8a5236', skin1: '#c07a52', skin2: '#e6a878',
  red: '#d04040', gold: '#ffd040',
};

export type Ctx = CanvasRenderingContext2D;

export function rect(ctx: Ctx, x: number, y: number, w: number, h: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
}

export function px(ctx: Ctx, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  ctx.fillRect(Math.round(x), Math.round(y), 1, 1);
}

/** 市松模様のディザで2色を混ぜる */
export function dither(ctx: Ctx, x: number, y: number, w: number, h: number, c1: string, c2: string, density = 0.5) {
  rect(ctx, x, y, w, h, c1);
  ctx.fillStyle = c2;
  x = Math.round(x); y = Math.round(y);
  for (let j = 0; j < h; j++) {
    for (let i = 0; i < w; i++) {
      const b = BAYER[(j & 3) * 4 + (i & 3)];
      if (b < density * 16) ctx.fillRect(x + i, y + j, 1, 1);
    }
  }
}

const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** 縦方向のグラデーションを帯＋ディザで描く */
export function bands(ctx: Ctx, x: number, y: number, w: number, h: number, colors: string[]) {
  const n = colors.length - 1;
  const seg = h / n;
  for (let i = 0; i < n; i++) {
    const y0 = Math.round(y + i * seg);
    const y1 = Math.round(y + (i + 1) * seg);
    const hh = y1 - y0;
    const half = Math.floor(hh / 2);
    rect(ctx, x, y0, w, half, colors[i]);
    dither(ctx, x, y0 + half, w, Math.ceil(hh / 4), colors[i], colors[i + 1], 0.3);
    dither(ctx, x, y0 + half + Math.ceil(hh / 4), w, hh - half - Math.ceil(hh / 4), colors[i + 1], colors[i], 0.3);
  }
}

export function line(ctx: Ctx, x0: number, y0: number, x1: number, y1: number, c: string) {
  x0 = Math.round(x0); y0 = Math.round(y0); x1 = Math.round(x1); y1 = Math.round(y1);
  const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  ctx.fillStyle = c;
  for (let guard = 0; guard < 2000; guard++) {
    ctx.fillRect(x0, y0, 1, 1);
    if (x0 === x1 && y0 === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) { err += dy; x0 += sx; }
    if (e2 <= dx) { err += dx; y0 += sy; }
  }
}

/** 半透明の光（加算風）。演出を減らす設定では弱める */
export function glow(ctx: Ctx, x: number, y: number, r: number, c: string, alpha: number) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = c;
  for (let i = 3; i >= 1; i--) {
    const rr = Math.round((r * i) / 3);
    ctx.globalAlpha = alpha * (0.35 + (3 - i) * 0.2);
    ctx.beginPath();
    // ピクセル感を保つため円ではなく角を落とした矩形
    ctx.fillRect(Math.round(x - rr), Math.round(y - rr * 0.6), rr * 2, Math.round(rr * 1.2));
    ctx.fillRect(Math.round(x - rr * 0.7), Math.round(y - rr * 0.85), Math.round(rr * 1.4), Math.round(rr * 1.7));
  }
  ctx.restore();
}

/** 決まった値を返す疑似乱数（描画の配置用） */
export function hash(n: number): number {
  let x = Math.imul(n ^ 0x27d4eb2d, 0x165667b1);
  x ^= x >>> 15;
  x = Math.imul(x, 0x85ebca77);
  x ^= x >>> 13;
  return (x >>> 0) / 4294967296;
}

// 3x5 の小さな英字フォント（看板用）
const GLYPHS: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', G: '011100101101011', H: '101101111101101', I: '111010010010111',
  K: '101101110101101', L: '100100100100111', M: '101111111101101', N: '110101101101101',
  O: '010101101101010', P: '110101110100100', R: '110101110101101', S: '011100010001110',
  T: '111010010010010', U: '101101101101111', V: '101101101101010', W: '101101111111101',
  Y: '101101010010010', ' ': '000000000000000', '0': '111101101101111', '1': '010110010010111',
  '2': '110001010100111', '3': '110001010001110', '4': '101101111001001', '5': '111100110001110',
  '6': '011100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001110',
  '!': '010010010000010', '-': '000000111000000', '+': '000010111010000', '.': '000000000000010',
};

export function tinyText(ctx: Ctx, text: string, x: number, y: number, c: string) {
  ctx.fillStyle = c;
  let cx = Math.round(x);
  for (const ch of text.toUpperCase()) {
    const g = GLYPHS[ch] ?? GLYPHS[' '];
    for (let i = 0; i < 15; i++) {
      if (g[i] === '1') ctx.fillRect(cx + (i % 3), Math.round(y) + Math.floor(i / 3), 1, 1);
    }
    cx += 4;
  }
}

export function tinyTextWidth(text: string) {
  return text.length * 4 - 1;
}

/** オフスクリーンに一度だけ描いて使い回す */
export function makeLayer(w: number, h: number, draw: (ctx: Ctx) => void): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  ctx.imageSmoothingEnabled = false;
  draw(ctx);
  return c;
}
