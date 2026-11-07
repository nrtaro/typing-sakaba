// 段階6：ChatGPT で描いたプレート・シール・台紙（art-src/stage6/）を切り分けて、public/collection/ に書き出す。
//
//   node scripts/stage6-art.mjs
//
// まとめて描いた画像から、透明でない部分のかたまりを見つけて1枚ずつ切り出す（上から下、左から右の順）。
// 背景が半透明の白になっている画像は、縁からつながる半透明の部分を透明にする。
import sharp from 'sharp';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';

const SRC = 'art-src/stage6';
const OUT = 'public/collection';
const items = readFileSync('src/core/collectionItems.ts', 'utf8');
const stickerIds = (series) => [...items.matchAll(/sticker\('(\w+)', (\d), '([\w-]+)'/g)]
  .filter((m) => m[1] === series).sort((a, b) => a[2] - b[2]).map((m) => `st-${m[3]}`);

const PLATES = {
  'plates-1': ['kinari', 'wakakusa', 'sorairo', 'sakurairo', 'kuriiro', 'sumiiro'],
  'plates-2': ['itabari', 'mizutama', 'shima', 'yuyake', 'aizome', 'kondatecho'],
  'plates-3': ['akagane', 'hoshizora', 'chochin', 'namishibuki', 'furunajimi', 'tairyobata'],
  'plates-4': ['ginzaiku', 'momijinishiki', 'yoiyami', 'yonkyaku', 'kinpaku', 'niji'],
};
/** 家族の毎日の 7〜9 枚目は、描き直した別の画像を使う */
/** [画像, 書き出すID, 列数, 段数]。シールは並びのマス目ごとに、そのマスに中心があるかけらをまとめて1枚にする */
const STICKERS = [
  ['stickers-food', stickerIds('food'), 3, 3],
  ['stickers-trip', stickerIds('trip'), 3, 3],
  ['stickers-guest', stickerIds('guest'), 3, 3],
  ['stickers-family', stickerIds('family').slice(0, 6), 3, 3],
  ['stickers-family-789', stickerIds('family').slice(6), 3, 1],
];
const SHEETS = ['food', 'trip', 'guest', 'family'];

async function load(name) {
  const { data, info } = await sharp(`${SRC}/${name}.webp`).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, w: info.width, h: info.height };
}

/** 縁からつながる半透明（不透明度 200 未満）の部分を、完全に透明にする */
function clearBackground(img) {
  const { data, w, h } = img;
  const seen = new Uint8Array(w * h);
  const stack = [];
  const push = (i) => { if (!seen[i] && data[i * 4 + 3] < 200) { seen[i] = 1; stack.push(i); } };
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

/** 不透明な部分のかたまり（8方向につながる）を探し、外接の四角を返す。小さなかけらは捨てる */
function blobs(img, minArea) {
  const { data, w, h } = img;
  const label = new Int32Array(w * h);
  const out = [];
  for (let start = 0; start < w * h; start++) {
    if (label[start] || data[start * 4 + 3] < 40) continue;
    const box = { x0: w, y0: h, x1: 0, y1: 0, n: 0 };
    const stack = [start];
    label[start] = out.length + 1;
    while (stack.length) {
      const i = stack.pop();
      const x = i % w;
      const y = (i / w) | 0;
      box.n++;
      if (x < box.x0) box.x0 = x; if (x > box.x1) box.x1 = x;
      if (y < box.y0) box.y0 = y; if (y > box.y1) box.y1 = y;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
        const j = ny * w + nx;
        if (!label[j] && data[j * 4 + 3] >= 40) { label[j] = out.length + 1; stack.push(j); }
      }
    }
    out.push(box);
  }
  return out.filter((b) => b.n >= minArea);
}

/** 近いかたまりをまとめる（キラキラの粒などが本体から離れていても同じシールにする） */
function merge(boxes, gap) {
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 0; i < boxes.length && !changed; i++) for (let j = i + 1; j < boxes.length && !changed; j++) {
      const a = boxes[i], b = boxes[j];
      if (a.x0 - gap <= b.x1 && b.x0 - gap <= a.x1 && a.y0 - gap <= b.y1 && b.y0 - gap <= a.y1) {
        boxes[i] = { x0: Math.min(a.x0, b.x0), y0: Math.min(a.y0, b.y0), x1: Math.max(a.x1, b.x1), y1: Math.max(a.y1, b.y1), n: a.n + b.n };
        boxes.splice(j, 1);
        changed = true;
      }
    }
  }
  return boxes;
}

/** 読む順（上の段から、段の中は左から）に並べる */
function readingOrder(boxes) {
  const rows = [];
  for (const b of [...boxes].sort((p, q) => p.y0 - q.y0)) {
    const cy = (b.y0 + b.y1) / 2;
    const row = rows.find((r) => Math.abs(r.cy - cy) < (b.y1 - b.y0) * 0.5);
    if (row) row.list.push(b); else rows.push({ cy, list: [b] });
  }
  return rows.sort((a, b) => a.cy - b.cy).flatMap((r) => r.list.sort((a, b) => a.x0 - b.x0));
}

function crop(img, b) {
  return sharp(img.data, { raw: { width: img.w, height: img.h, channels: 4 } })
    .extract({ left: b.x0, top: b.y0, width: b.x1 - b.x0 + 1, height: b.y1 - b.y0 + 1 });
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(`${OUT}/plates`, { recursive: true });
mkdirSync(`${OUT}/stickers`, { recursive: true });
mkdirSync(`${OUT}/sheets`, { recursive: true });

const report = [];
for (const [name, ids] of Object.entries(PLATES)) {
  const img = await load(name);
  clearBackground(img);
  const found = readingOrder(merge(blobs(img, 2000), 4));
  if (found.length !== ids.length) throw new Error(`${name}：プレートが ${found.length} 枚見つかりました（${ids.length} 枚のはず）`);
  for (const [k, b] of found.entries()) {
    // 高さ 96px にそろえる（ランキングの行の高さの約6倍。大きな画面でもにじまない）
    await crop(img, b).resize({ height: 96 }).webp({ quality: 90, alphaQuality: 100 }).toFile(`${OUT}/plates/p-${ids[k]}.webp`);
    report.push(`p-${ids[k]} ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`);
  }
}
for (const [name, ids, cols, rows] of STICKERS) {
  const img = await load(name);
  clearBackground(img);
  // シールは白い縁どうしが触れていることがあるので、白以外の「絵の部分」でかたまりを分け、
  // 絵の中心があるマスに割り当てる。そこから不透明な部分へ広げて、白い縁もそのシールのものにする
  const { w, h, data } = img;
  const n = w * h;
  const opaque = (i) => data[i * 4 + 3] >= 40;
  const core = (i) => opaque(i) && !(data[i * 4] > 232 && data[i * 4 + 1] > 232 && data[i * 4 + 2] > 232);
  const owner = new Int16Array(n).fill(-1);
  const tmp = new Int32Array(n).fill(-1);
  const queue = new Int32Array(n);
  let qh = 0, qt = 0;
  for (let i0 = 0, comp = 0; i0 < n; i0++) {
    if (tmp[i0] >= 0 || !core(i0)) continue;
    // 1つのかたまりを集める
    const list = [i0];
    tmp[i0] = comp;
    let sx = 0, sy = 0;
    for (let k = 0; k < list.length; k++) {
      const i = list[k];
      const x = i % w, y = (i / w) | 0;
      sx += x; sy += y;
      for (const j of [i - 1, i + 1, i - w, i + w]) {
        if (j < 0 || j >= n || tmp[j] >= 0 || !core(j)) continue;
        if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
        tmp[j] = comp;
        list.push(j);
      }
    }
    comp++;
    if (list.length < 60) continue;
    const cell = Math.min(rows - 1, Math.floor(sy / list.length / (h / rows))) * cols + Math.min(cols - 1, Math.floor(sx / list.length / (w / cols)));
    for (const i of list) { owner[i] = cell; queue[qt++] = i; }
  }
  // 白い縁などへ広げる（近いほうのシールのものになる）
  while (qh < qt) {
    const i = queue[qh++];
    const x = i % w;
    for (const j of [i - 1, i + 1, i - w, i + w]) {
      if (j < 0 || j >= n || owner[j] >= 0 || !opaque(j)) continue;
      if ((j === i - 1 && x === 0) || (j === i + 1 && x === w - 1)) continue;
      owner[j] = owner[i];
      queue[qt++] = j;
    }
  }
  const cells = new Map();
  for (let i = 0; i < n; i++) {
    const c = owner[i];
    if (c < 0) continue;
    const x = i % w, y = (i / w) | 0;
    const b = cells.get(c) ?? { x0: w, y0: h, x1: 0, y1: 0, n: 0 };
    b.n++;
    if (x < b.x0) b.x0 = x; if (x > b.x1) b.x1 = x;
    if (y < b.y0) b.y0 = y; if (y > b.y1) b.y1 = y;
    cells.set(c, b);
  }
  /** そのシールのものでない点を透明にした写し */
  const only = (c) => {
    const copy = { w, h, data: Buffer.from(data) };
    for (let i = 0; i < n; i++) if (owner[i] !== c) copy.data[i * 4 + 3] = 0;
    return copy;
  };
  for (const [k, id] of ids.entries()) {
    const b = cells.get(k);
    if (!b || b.n < 5000) throw new Error(`${name}：${k + 1} 枚目が見つかりません`);
    // 正方形の透明な台に、余白を少し付けて真ん中に置く（160px 四方）
    await crop(only(k), b).resize(148, 148, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .extend({ top: 6, bottom: 6, left: 6, right: 6, background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .webp({ quality: 90, alphaQuality: 100 }).toFile(`${OUT}/stickers/${id}.webp`);
    report.push(`${id} ${b.x1 - b.x0 + 1}x${b.y1 - b.y0 + 1}`);
  }
}
for (const id of SHEETS) {
  // 完成：描いてもらった台紙そのまま。未完成：うっすらの絵をさらに紙の色へ寄せて、9枚そろったときとの差を出す
  const base = sharp(`${SRC}/sheet-${id}.webp`).resize(512, 512);
  await base.clone().webp({ quality: 88 }).toFile(`${OUT}/sheets/sheet-${id}-done.webp`);
  const { data, info } = await base.clone().removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const paper = [250, 236, 214];
  for (let i = 0; i < data.length; i += 3) {
    const dark = (data[i] + data[i + 1] + data[i + 2]) / 3 < 140; // 枠の点線や四隅の飾りは残す
    const t = dark ? 0.15 : 0.7;
    for (let c = 0; c < 3; c++) data[i + c] = Math.round(data[i + c] * (1 - t) + paper[c] * t);
  }
  await sharp(data, { raw: { width: info.width, height: info.height, channels: 3 } }).webp({ quality: 88 }).toFile(`${OUT}/sheets/sheet-${id}.webp`);
}
console.log(`public/collection：プレート24・シール36・台紙8\n${report.join('\n')}`);
