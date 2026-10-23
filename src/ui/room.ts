// 店内（斜め上から見た酒場）。動かない部分は時間帯ごとに一度だけ描いて使い回す
import { C, mix, type Color } from './palette';
import { LH, LW } from './screen';

type G = CanvasRenderingContext2D;

export function pen(g: G) {
  return (x: number, y: number, w: number, h: number, c: Color) => {
    g.fillStyle = c;
    g.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h));
  };
}

/** 時間帯ごとの空の色（窓の外） */
export const SKY: [Color, Color][] = [['#a8d8ec', '#fbe1b4'], ['#5fb4ea', '#c8ecf6'], ['#151438', '#5a3a7a']];
export const WINDOWS = [214, 302, 390];
export const LAMPS = [70, 240, 330, 420];

const cache = new Map<number, HTMLCanvasElement>();

export function roomLayer(ph: number): HTMLCanvasElement {
  const hit = cache.get(ph);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = LW;
  c.height = LH;
  const g = c.getContext('2d')!;
  const R = pen(g);
  const night = ph === 2;
  const sky = SKY[ph];

  // 奥の壁：漆喰と梁
  R(0, 16, LW, 78, C.plaster);
  for (let i = 0; i < 260; i++) R((i * 97) % LW, 18 + ((i * 53) % 58), 1, 1, C.plaster2);
  R(0, 16, LW, 4, C.wood1); R(0, 20, LW, 1, C.wood0);
  for (let bx = 0; bx < LW; bx += 80) { R(bx, 16, 5, 78, C.wood2); R(bx + 1, 16, 1, 78, C.wood3); R(bx + 4, 16, 1, 78, C.wood1); }
  // 腰板
  R(0, 72, LW, 22, C.wood2);
  for (let bx = 0; bx < LW; bx += 10) { R(bx, 72, 1, 22, C.wood1); R(bx + 1, 72, 1, 22, C.wood3); }
  R(0, 72, LW, 2, C.wood4); R(0, 92, LW, 2, C.wood0);
  // 窓（外の景色が時間帯で変わる）
  for (const wx of WINDOWS) {
    R(wx - 3, 26, 46, 40, C.wood1); R(wx - 2, 27, 44, 38, C.wood3);
    for (let y = 0; y < 34; y++) R(wx, 29 + y, 40, 1, mix(sky[0], sky[1], y / 34));
    const far = night ? '#2b2650' : ph === 0 ? '#b6b4c8' : '#8e9ab4';
    R(wx + 2, 50, 7, 13, far); R(wx + 11, 44, 6, 19, far); R(wx + 19, 53, 9, 10, far); R(wx + 30, 47, 8, 16, far);
    if (night) { R(wx + 13, 47, 1, 1, C.gold); R(wx + 32, 51, 1, 1, C.gold); R(wx + 6, 33, 1, 1, C.w); R(wx + 26, 31, 2, 2, C.cream); }
    else if (ph === 0) R(wx + 28, 33, 5, 5, '#fff3c0');
    R(wx + 19, 29, 2, 34, C.wood3); R(wx, 45, 40, 2, C.wood3);
    R(wx - 4, 64, 48, 3, C.wood4); R(wx - 4, 67, 48, 1, C.wood1);
    R(wx + 3, 59, 6, 5, C.red2); R(wx + 2, 55, 8, 4, C.green2); R(wx + 3, 54, 3, 2, C.green);
    // カーテン
    R(wx - 6, 24, 7, 36, C.red2); R(wx - 5, 24, 2, 36, C.red); R(wx - 6, 58, 7, 3, C.red2);
    R(wx + 39, 24, 7, 36, C.red2); R(wx + 43, 24, 2, 36, C.red); R(wx + 39, 58, 7, 3, C.red2);
    R(wx - 7, 22, 54, 3, C.wood1); R(wx - 7, 22, 54, 1, C.wood3);
  }
  // 掲示板（手配書）
  R(152, 30, 40, 30, C.wood1); R(153, 31, 38, 28, C.wood3);
  for (const [px, py, col] of [[156, 34, C.cream], [170, 33, C.w], [158, 46, C.cream2], [174, 45, C.cream]] as [number, number, Color][]) {
    R(px, py, 12, 10, col); R(px + 2, py + 2, 8, 1, C.wood2); R(px + 2, py + 4, 6, 1, C.wood2); R(px + 5, py, 2, 1, C.red);
  }
  // 壁の剥製：角（狩り）と大魚（釣り）
  R(271, 40, 12, 10, C.wood1); R(272, 41, 10, 8, C.wood3);
  R(274, 36, 6, 6, '#a07050'); R(275, 37, 4, 4, '#c08a62'); R(275, 39, 1, 1, C.ink); R(278, 39, 1, 1, C.ink);
  R(268, 28, 2, 9, C.cream); R(266, 28, 2, 2, C.cream); R(264, 30, 2, 2, C.cream); R(284, 28, 2, 9, C.cream); R(286, 28, 2, 2, C.cream); R(288, 30, 2, 2, C.cream);
  R(352, 34, 30, 14, C.wood1); R(353, 35, 28, 12, C.wood3);
  R(356, 38, 18, 6, C.blue); R(357, 37, 14, 1, C.blue3); R(356, 41, 18, 3, C.blue2); R(374, 36, 5, 10, C.blue2); R(358, 39, 1, 1, C.ink); R(362, 38, 6, 1, C.blue3);
  // 旗飾り
  const flags = [C.red, C.gold, C.green, C.blue, C.pink];
  for (let k = 0; k < 28; k++) {
    const fx = 150 + k * 10;
    const fy = 21 + Math.round(Math.sin(k * 0.9));
    R(fx, fy, 10, 1, C.wood0);
    R(fx + 2, fy + 1, 6, 2, flags[k % 5]); R(fx + 3, fy + 3, 4, 1, flags[k % 5]); R(fx + 4, fy + 4, 2, 1, flags[k % 5]);
  }
  // 厨房：奥の棚とかまど
  R(4, 24, 140, 3, C.wood4); R(4, 27, 140, 1, C.wood1); R(4, 46, 140, 3, C.wood4); R(4, 49, 140, 1, C.wood1);
  const bottles = [C.green, C.gold2, C.teal2, C.red2, C.purple, C.cream2, C.blue2];
  for (let i = 0; i < 16; i++) {
    const bx = 8 + i * 8;
    const col = bottles[i % 7];
    const h = 9 + (i % 3) * 2;
    R(bx, 24 - h, 5, h, col); R(bx + 1, 24 - h, 1, h - 1, mix(col, '#ffffff', 0.4)); R(bx + 1, 22 - h, 3, 2, C.ink);
  }
  for (let i = 0; i < 9; i++) { const bx = 10 + i * 14; R(bx, 38, 10, 8, i % 2 ? C.cream : C.wood4); R(bx + 1, 39, 8, 1, C.w); }
  R(10, 56, 46, 38, '#7a6a72'); R(10, 56, 46, 3, '#9a8a92');
  for (let y = 60; y < 94; y += 6) R(10, y, 46, 1, '#5c4e58');
  R(18, 72, 30, 16, '#2a1e24'); R(20, 74, 26, 12, '#3a2228');
  for (const px of [74, 92, 110]) { R(px + 4, 52, 1, 6, C.ink); R(px, 58, 10, 7, C.gray2); R(px, 58, 10, 1, C.gray); R(px + 8, 59, 2, 5, '#4c485a'); }
  // 床（板張り）
  for (let y = 94; y < LH; y += 7) {
    const row = Math.floor((y - 94) / 7);
    R(0, y, LW, 7, row % 2 ? C.floor1 : C.floor2); R(0, y, LW, 1, C.floor0);
    for (let x = (row * 37) % 60; x < LW; x += 60) R(x, y, 1, 7, C.floor0);
    for (let i = 0; i < 18; i++) R((i * 71 + row * 29) % LW, y + 3, 3, 1, row % 2 ? C.floor2 : C.floor3);
  }
  // 客席の敷物
  R(170, 98, 252, 108, '#8a3a34'); R(172, 100, 248, 104, '#a8463c');
  for (let x = 176; x < 418; x += 8) { R(x, 100, 4, 2, C.gold2); R(x, 200, 4, 2, C.gold2); }
  R(176, 104, 240, 1, '#c2604c'); R(176, 197, 240, 1, '#c2604c');
  // カウンター
  R(8, 106, 132, 22, C.wood1); R(8, 104, 132, 6, C.wood4); R(8, 104, 132, 1, C.wood5); R(8, 110, 132, 1, C.wood2);
  for (let x = 14; x < 136; x += 18) { R(x, 113, 14, 12, C.wood2); R(x, 113, 14, 1, C.wood3); }
  R(8, 128, 132, 2, C.wood0);
  R(20, 99, 6, 5, C.gold); R(20, 98, 6, 2, C.w); R(118, 98, 10, 6, C.gray2); R(119, 98, 8, 2, C.gray);
  // 樽・木箱・植木
  for (const [bx, by] of [[14, 146], [32, 152], [16, 172]]) {
    R(bx, by, 16, 20, C.wood2); R(bx + 1, by, 14, 2, C.wood4); R(bx, by + 4, 16, 2, C.gray2); R(bx, by + 14, 16, 2, C.gray2);
    R(bx + 2, by + 2, 3, 18, C.wood3); R(bx + 12, by + 2, 2, 18, C.wood1);
  }
  R(96, 176, 22, 16, C.wood3); R(96, 176, 22, 2, C.wood5); R(96, 183, 22, 1, C.wood1); R(106, 176, 1, 16, C.wood1);
  for (const [px, py] of [[148, 196], [428, 196]]) {
    R(px - 5, py, 10, 8, C.red2); R(px - 6, py, 12, 2, C.red); R(px - 7, py - 10, 14, 10, C.green2);
    R(px - 5, py - 13, 10, 5, C.green); R(px - 3, py - 15, 4, 3, C.green3); R(px + 2, py - 8, 3, 3, C.green3);
  }
  // 床の奥行き（手前と奥を少し暗く）
  const vg = g.createLinearGradient(0, 94, 0, 210);
  vg.addColorStop(0, 'rgba(40,20,20,0.18)');
  vg.addColorStop(0.4, 'rgba(40,20,20,0)');
  vg.addColorStop(1, 'rgba(40,20,20,0.22)');
  g.fillStyle = vg;
  g.fillRect(0, 94, LW, 116);
  // 入り口
  R(436, 96, 40, 4, C.wood1); R(440, 100, 32, 104, '#5a3828'); R(442, 102, 28, 100, night ? '#1e1a3a' : '#cfe8f0');
  R(442, 150, 28, 1, C.wood2);
  cache.set(ph, c);
  return c;
}

/** かまどの火・湯気・ランプ（動く部分） */
export function drawRoomLive(g: G, t: number, reduce = false) {
  const R = pen(g);
  const fl = Math.floor(t * 10) % 3;
  R(22, 82 - fl, 22, 4 + fl, C.gold2); R(26, 80 - fl, 14, 3, C.gold); R(30, 79, 6, 2, C.gold3);
  if (!reduce) {
    g.save();
    for (let i = 0; i < 6; i++) {
      const p = (t * 0.5 + i / 6) % 1;
      g.globalAlpha = 0.55 * (1 - p);
      R(22 + i * 4 + Math.sin(p * 6 + i) * 3, 52 - p * 30, 3, 2, C.w);
    }
    g.restore();
  }
  for (const lx of LAMPS) { R(lx, 16, 1, 10, C.ink); R(lx - 4, 26, 9, 4, C.gold2); R(lx - 3, 26, 7, 1, C.gold3); R(lx - 2, 30, 5, 2, C.gold3); }
}

/** 時間帯の光：朝は窓からの光、夜は暗くしてランプとかまどの暖色 */
export function drawLights(g: G, ph: number) {
  if (ph === 0) {
    g.save();
    g.globalAlpha = 0.12;
    g.fillStyle = '#fff2c8';
    for (const wx of WINDOWS) {
      g.beginPath(); g.moveTo(wx, 66); g.lineTo(wx + 40, 66); g.lineTo(wx + 10, 200); g.lineTo(wx - 30, 200); g.fill();
    }
    g.restore();
  }
  if (ph === 2) {
    g.save();
    g.globalAlpha = 0.38;
    g.fillStyle = '#1c1238';
    g.fillRect(0, 16, LW, 194);
    g.restore();
    g.save();
    g.globalCompositeOperation = 'lighter';
    for (const lx of LAMPS) {
      const gr = g.createRadialGradient(lx, 34, 2, lx, 70, 90);
      gr.addColorStop(0, 'rgba(255,190,90,0.38)');
      gr.addColorStop(1, 'rgba(255,150,60,0)');
      g.fillStyle = gr;
      g.fillRect(lx - 100, 16, 200, 194);
    }
    const fire = g.createRadialGradient(34, 82, 2, 34, 82, 50);
    fire.addColorStop(0, 'rgba(255,140,50,0.4)');
    fire.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = fire;
    g.fillRect(0, 30, 100, 110);
    g.restore();
  }
}

/** 丸テーブル（斜め上から見た楕円）。plate があれば料理を載せる */
export function drawTable(g: G, x: number, y: number, plate: Color | null) {
  const R = pen(g);
  const rows = [[-8, 1], [-11, 2], [-12, 3], [-12, 4], [-11, 5], [-9, 6]];
  R(x - 2, y + 6, 4, 8, C.wood1); R(x - 6, y + 13, 12, 2, C.wood0);
  R(x - 12, y + 3, 24, 4, C.wood2);
  rows.forEach(([dx, dy], i) => R(x + dx, y + dy - 3, -dx * 2, 1, i < 2 ? C.wood5 : C.wood4));
  R(x - 9, y + 6, 18, 1, C.wood1);
  if (plate) { R(x - 5, y - 1, 10, 3, C.w); R(x - 4, y - 2, 8, 1, C.w); R(x - 3, y - 2, 6, 2, plate); R(x - 2, y - 2, 2, 1, mix(plate, '#ffffff', 0.5)); }
}

export function drawChair(g: G, x: number, y: number) {
  const R = pen(g);
  R(x - 7, y - 20, 14, 3, C.wood3); R(x - 7, y - 20, 14, 1, C.wood5); R(x - 7, y - 17, 2, 14, C.wood2); R(x + 5, y - 17, 2, 14, C.wood2);
}

export function shadow(g: G, x: number, y: number, w: number) {
  g.save();
  g.globalAlpha = 0.28;
  g.fillStyle = '#2a1520';
  g.fillRect(Math.round(x - w / 2 + 2), Math.round(y - 1), w - 4, 3);
  g.fillRect(Math.round(x - w / 2), Math.round(y), w, 1);
  g.restore();
}
