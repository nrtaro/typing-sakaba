// 色（暖かい木と柔らかい色を中心にした親しみやすいパレット）
export type Color = string;

export const C = {
  bg: '#17101c', ink: '#2a1b26', w: '#fff7ea', cream: '#f5e3c4', cream2: '#dcc39c',
  skin: '#f7cba4', skin2: '#e3a47e', skin3: '#c27c5c', blush: '#f29a95',
  wood0: '#3d2420', wood1: '#5e3626', wood2: '#80492f', wood3: '#a5643c', wood4: '#c98a52', wood5: '#e6b277',
  floor0: '#6b4029', floor1: '#7d4c30', floor2: '#8f5a37', floor3: '#a66d44',
  plaster: '#e9d6b4', plaster2: '#d4bb94',
  red: '#d9534f', red2: '#a8363f', red3: '#ef8577', pink: '#ff9fbd', pink2: '#e2668f', pink3: '#ffd0de',
  green: '#6cbf6a', green2: '#3f8a52', green3: '#a6e08c', teal: '#5ccfc4', teal2: '#2f8e91', teal3: '#a9f0e4',
  blue: '#5a8fe0', blue2: '#3a5aa8', blue3: '#9cc4f6', gold: '#ffd25c', gold2: '#e89a32', gold3: '#fff0a8',
  gray: '#a39fae', gray2: '#6f6a7d', gray3: '#d6d2de', purple: '#8e6ad8', purple2: '#5d3f9a',
  brown: '#7b4a33', hairB: '#4a2a22', hairO: '#e07a3c', hairY: '#f5cf62',
  sand: '#d9b27a', sand2: '#b98e58', sand3: '#f0d29a',
};

function hex(c: Color) {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

/** 2色を混ぜる（t=0 で a、t=1 で b） */
export function mix(a: Color, b: Color, t: number): Color {
  const A = hex(a);
  const B = hex(b);
  return `rgb(${A.map((v, i) => Math.round(v * (1 - t) + B[i] * t)).join(',')})`;
}

/** 調達ごとの色。パネル・素材アイコンの下線で「どこで取れるか」を色で結ぶ */
export const TRIP_COLOR: Record<string, { main: Color; dark: Color }> = {
  fishing: { main: C.blue, dark: '#24406e' },
  hunting: { main: C.red, dark: '#6e2430' },
  gathering: { main: C.green, dark: '#25553a' },
  trading: { main: C.gold2, dark: '#6b4418' },
};
