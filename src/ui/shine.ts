// 段階D：飾りの光り方（キラキラ・ホログラム）と、持っていないシールの影。
// 光は絵の形（透明でない部分）の中だけに重ね、☆が高いほど豪華にする。
//   ☆3：斜めに流れる光の帯（ゆっくり、控えめ）
//   ☆4：光の帯を強く速く＋金色のつや＋十字のきらめき
//   ☆5：虹色のホログラム（色が流れて移り変わる）＋光の帯＋虹色のきらめき
import type { Screen } from './screen';

type Canvas = HTMLCanvasElement;

/** 作業用の画面外の絵（大きさごとに使い回す） */
const scratch = new Map<string, Canvas>();
function canvas(w: number, h: number, slot: string): { c: Canvas; g: CanvasRenderingContext2D } | null {
  if (typeof document === 'undefined') return null;
  const key = `${slot}:${w}x${h}`;
  let c = scratch.get(key);
  if (!c) {
    c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    scratch.set(key, c);
  }
  const g = c.getContext('2d');
  if (!g) return null;
  g.setTransform(1, 0, 0, 1, 0, 0);
  g.globalAlpha = 1;
  g.globalCompositeOperation = 'source-over';
  g.clearRect(0, 0, w, h);
  return { c, g };
}

const size = (img: CanvasImageSource) => {
  const i = img as HTMLImageElement;
  return { w: i.naturalWidth || i.width || 0, h: i.naturalHeight || i.height || 0 };
};

/**
 * 絵に☆に合った光を重ねた写しを返す（☆2以下や描けない環境では、もとの絵をそのまま返す）。
 * t は秒。phase で同じ画面の飾りどうしの光のタイミングをずらす。
 */
export function shined(img: CanvasImageSource, star: number, t: number, phase = 0): CanvasImageSource {
  if (star < 3) return img;
  const { w, h } = size(img);
  if (!w || !h) return img;
  const out = canvas(w, h, 'shine');
  if (!out) return img;
  const { c, g } = out;
  g.drawImage(img, 0, 0, w, h);
  // ここから下は、絵の透明でない部分の上にだけ重なる
  g.globalCompositeOperation = 'source-atop';
  const span = w + h;
  if (star === 5) {
    // 虹色のホログラム：斜めの虹の縞が、ゆっくり流れながら色を変える
    const shift = ((t * 0.25 + phase) % 1) * span;
    const holo = g.createLinearGradient(-span + shift, 0, shift, h);
    const colors = ['#ff5f9e', '#ffb347', '#fff36b', '#6bffb8', '#5fc8ff', '#a77bff', '#ff5f9e'];
    for (let k = 0; k < 2; k++) colors.forEach((col, i) => holo.addColorStop(Math.min(1, (k + i / (colors.length - 1)) / 2), col));
    g.globalAlpha = 0.28;
    g.fillStyle = holo;
    g.fillRect(0, 0, w, h);
  } else if (star === 4) {
    // 金色のつや：上から下へうっすら明るく
    const gold = g.createLinearGradient(0, 0, 0, h);
    gold.addColorStop(0, 'rgba(255,236,170,0.18)');
    gold.addColorStop(0.5, 'rgba(255,214,120,0.05)');
    gold.addColorStop(1, 'rgba(255,190,90,0.1)');
    g.globalAlpha = 1;
    g.fillStyle = gold;
    g.fillRect(0, 0, w, h);
  }
  // 光の帯：斜めに通り過ぎ、しばらく休む（☆が高いほど強く・頻繁に）
  const period = star === 3 ? 3.2 : star === 4 ? 2.4 : 2.0;
  const p = ((t + phase * period) % period) / period;
  if (p < 0.45) {
    const x = (p / 0.45) * (span * 1.4) - span * 0.4;
    const band = g.createLinearGradient(x - h * 0.35, 0, x, h);
    const peak = star === 3 ? 0.28 : star === 4 ? 0.38 : 0.42;
    band.addColorStop(0, 'rgba(255,255,255,0)');
    band.addColorStop(0.42, `rgba(255,255,255,${peak * 0.35})`);
    band.addColorStop(0.5, `rgba(255,255,255,${peak})`);
    band.addColorStop(0.58, `rgba(255,255,255,${peak * 0.35})`);
    band.addColorStop(1, 'rgba(255,255,255,0)');
    g.globalAlpha = 1;
    g.fillStyle = band;
    g.fillRect(0, 0, w, h);
  }
  return c;
}

/** 十字のきらめき（中心が明るく、四方に細い光が伸びる）。☆4は金・白、☆5は虹色 */
export function drawSparkles(sc: Screen, x: number, y: number, w: number, h: number, star: number, t: number, phase = 0) {
  if (star < 4) return;
  const n = star === 4 ? 3 : 5;
  const cols = star === 5 ? ['#ffffff', '#ffd6f5', '#d6f0ff', '#fff4c2', '#e2d6ff'] : ['#ffffff', '#fff1c4', '#ffe08a'];
  for (let i = 0; i < n; i++) {
    const cycle = 1.6 + i * 0.37;
    const q = ((t + phase + i * 0.53) % cycle) / cycle;
    if (q > 0.5) continue;
    const a = Math.sin((q / 0.5) * Math.PI);
    // 場所は、きらめくたびに少しずつ変える
    const k = Math.floor((t + phase + i * 0.53) / cycle) + i * 7;
    const fx = 0.15 + ((k * 0.618) % 1) * 0.7;
    const fy = 0.12 + ((k * 0.382 + 0.3) % 1) * 0.6;
    const cx = x + w * fx;
    const cy = y + h * fy;
    const len = Math.max(2, Math.min(w, h) * 0.09) * (0.6 + 0.4 * a);
    const col = cols[i % cols.length];
    sc.radialGlow(cx, cy, len * 1.6, col, 0.35 * a);
    sc.PR(cx - len, cy - 0.35, len * 2, 0.7, col, a);
    sc.PR(cx - 0.35, cy - len, 0.7, len * 2, col, a);
    sc.PR(cx - 0.8, cy - 0.8, 1.6, 1.6, '#ffffff', a);
  }
}

/** 持っていないシールの影：絵の形だけを暗い色で塗りつぶした写し（絵ごとに一度だけ作る） */
const shadows = new WeakMap<object, Canvas>();
export function silhouette(img: CanvasImageSource): CanvasImageSource | null {
  const cached = shadows.get(img as object);
  if (cached) return cached;
  const { w, h } = size(img);
  if (!w || !h || typeof document === 'undefined') return null;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d');
  if (!g) return null;
  g.drawImage(img, 0, 0, w, h);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = '#1c120c';
  g.fillRect(0, 0, w, h);
  shadows.set(img as object, c);
  return c;
}
