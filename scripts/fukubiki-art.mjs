// ふくびきの絵（art-src/stage6/fukubiki-*.webp）を切り分けて、public/collection/fukubiki/ に書き出す。
//
//   node scripts/fukubiki-art.mjs
//
// ・背景：そのまま縮める
// ・ガラガラ（4コマ）・看板娘（2コマ）：コマどうしの位置がずれないよう、全コマ共通の四角で切る
// ・玉（5色）・カード（5枚）：1つずつ切って、余白をそろえる
// ・玉の画像は背景が白く塗られているので、縁からつながる白っぽい部分を透明にする
import sharp from 'sharp';
import { mkdirSync, rmSync } from 'node:fs';

const SRC = 'art-src/stage6';
const OUT = 'public/collection/fukubiki';
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

async function load(name) {
  const { data, info } = await sharp(`${SRC}/${name}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** 縁からつながる「白っぽい・灰色っぽい」部分を透明にする（玉の画像の塗られた背景用） */
function clearLight(img) {
  const { data, w, h } = img;
  const seen = new Uint8Array(w * h);
  const light = (i) => {
    const r = data[i * 4], g = data[i * 4 + 1], b = data[i * 4 + 2];
    return Math.min(r, g, b) > 225 && Math.max(r, g, b) - Math.min(r, g, b) < 18;
  };
  const stack = [];
  const push = (i) => { if (!seen[i] && light(i)) { seen[i] = 1; stack.push(i); } };
  for (let x = 0; x < w; x++) { push(x); push((h - 1) * w + x); }
  for (let y = 0; y < h; y++) { push(y * w); push(y * w + w - 1); }
  while (stack.length) {
    const i = stack.pop();
    data[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) push(i - 1);
    if (x < w - 1) push(i + 1);
    if (i >= w) push(i - w);
    if (i < w * (h - 1)) push(i + w);
  }
}

/** 区切り（横に n 等分）の中の、不透明な部分の外接の四角 */
function cellBoxes(img, n) {
  const cw = img.w / n;
  return Array.from({ length: n }, (_, c) => {
    const b = { x0: img.w, y0: img.h, x1: 0, y1: 0 };
    for (let y = 0; y < img.h; y++) for (let x = Math.floor(c * cw); x < Math.floor((c + 1) * cw); x++) {
      if (img.data[(y * img.w + x) * 4 + 3] < 40) continue;
      if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
      if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    }
    return { ...b, cx0: Math.floor(c * cw) };
  });
}

const raw = (img) => sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } });

/** 全コマ共通の四角（区切りの左端からの位置）で切り出す */
async function frames(name, n, height, prefix) {
  const img = await load(name);
  const boxes = cellBoxes(img, n);
  const left = Math.min(...boxes.map((b) => b.x0 - b.cx0));
  const right = Math.max(...boxes.map((b) => b.x1 - b.cx0));
  const top = Math.min(...boxes.map((b) => b.y0));
  const bottom = Math.max(...boxes.map((b) => b.y1));
  for (let k = 0; k < n; k++) {
    await raw(img).extract({ left: boxes[k].cx0 + left, top, width: right - left + 1, height: bottom - top + 1 })
      .resize({ height }).webp({ quality: 90, alphaQuality: 100 }).toFile(`${OUT}/${prefix}-${k}.webp`);
  }
  return `${prefix} ×${n}（${right - left + 1}×${bottom - top + 1} → 高さ${height}）`;
}

/** 1つずつ切り出す */
async function singles(name, n, height, prefix, light = false) {
  const img = await load(name);
  if (light) clearLight(img);
  const boxes = cellBoxes(img, n);
  for (let k = 0; k < n; k++) {
    const b = boxes[k];
    await raw(img).extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1 })
      .resize({ height }).webp({ quality: 90, alphaQuality: 100 }).toFile(`${OUT}/${prefix}-${k + 1}.webp`);
  }
  return `${prefix} ×${n}（高さ${height}）`;
}

const report = [];
await sharp(`${SRC}/fukubiki-bg.webp`).resize(1280, 720).webp({ quality: 85 }).toFile(`${OUT}/bg.webp`);
report.push('bg 1280×720');
report.push(await frames('fukubiki-drum', 4, 360, 'drum'));
report.push(await frames('fukubiki-girl', 2, 400, 'girl'));
report.push(await singles('fukubiki-balls', 5, 96, 'ball', true));
report.push(await singles('fukubiki-cards', 5, 480, 'card'));
console.log(`public/collection/fukubiki：\n${report.join('\n')}`);
