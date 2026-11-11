// 段階6：ランキングや飾りの見本で使う、ネームプレートと二つ名の描き方
import type { Screen } from './screen';
import type { Decoration } from '../core/ranking';
import { itemById, titleText } from '../core/collection';
import { StickerArt, phaseOf } from './stickerArt';
import { shined } from './shine';

/** 飾りの二つ名の文字列（そろっていなければ null） */
export function titleOf(d: Decoration | undefined): string | null {
  return d ? titleText(d.titleFront, d.titleLink, d.titleBack) : null;
}

export const plateUrl = (id: string) => `/collection/plates/${id}.webp`;
/** プレートの絵（初めて描くときに読む。読めるまでは色だけの仮の札） */
const plateArt = new StickerArt();

/**
 * プレートの絵を、両端の飾りの形を保ったまま横に伸ばして敷く（真ん中だけ伸ばす）。
 * 光り方（☆3以上）は、表示する縦横の比率に組み立てた絵の上に重ねる。
 * 元の長い絵に光を付けてから縮めると、光の帯が真ん中だけ縮んで不自然になるため。
 */
const plateScratch = new Map<string, HTMLCanvasElement>();
function drawPlateImage(sc: Screen, img: HTMLImageElement, x: number, y: number, w: number, h: number, star: number, phase: number) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const cap = Math.min(sh * 2, sw / 3);
  // 絵の高さのまま、表示の比率の横幅に組み立てる
  const H = sh;
  const W = Math.max(2, Math.round(H * (w / h)));
  const key = `${W}x${H}`;
  let c = plateScratch.get(key) ?? null;
  if (!c && typeof document !== 'undefined') {
    c = document.createElement('canvas');
    c.width = W;
    c.height = H;
    plateScratch.set(key, c);
  }
  const g = c?.getContext('2d');
  if (!c || !g) {
    const dcap = Math.min(cap * (h / sh), w / 2);
    sc.blit(img, 0, 0, cap, sh, x, y, dcap, h);
    sc.blit(img, cap, 0, sw - cap * 2, sh, x + dcap, y, w - dcap * 2, h);
    sc.blit(img, sw - cap, 0, cap, sh, x + w - dcap, y, dcap, h);
    return;
  }
  const dcap = Math.min(cap, W / 2);
  g.clearRect(0, 0, W, H);
  g.imageSmoothingEnabled = false;
  g.drawImage(img, 0, 0, cap, sh, 0, 0, dcap, H);
  g.drawImage(img, cap, 0, sw - cap * 2, sh, dcap, 0, W - dcap * 2, H);
  g.drawImage(img, sw - cap, 0, cap, sh, W - dcap, 0, dcap, H);
  sc.blit(shined(c, star, Date.now() / 1000, phase), 0, 0, W, H, x, y, w, h);
}

/**
 * 繁盛記の限定プレートの仮の札（のれん・千両箱・秘伝の書）。絵（docs/hanjoki-plate-prompts.md）が届くまで使う。
 */
function drawRunPlate(sc: Screen, art: 'noren' | 'senryo' | 'hiden', x: number, y: number, w: number, h: number) {
  const t = Date.now() / 1000;
  sc.clip(x, y, w, h, () => {
    if (art === 'noren') {
      // 深い赤の布に、金の竿と、裾の切れ目。布がゆっくり揺れる
      sc.PR(x, y, w, h, '#7a1f2a');
      sc.fade(x, y, w, h, '#b83a3a', 0.55, 0, 'y');
      const n = Math.max(3, Math.round(w / 26));
      for (let i = 1; i < n; i++) {
        const sx = x + (w * i) / n + Math.sin(t * 1.6 + i) * 0.5;
        sc.PR(sx - 0.4, y + h * 0.45, 0.9, h * 0.6, '#3a0c14', 0.9);
      }
      for (let i = 0; i < n; i++) {
        const cx = x + (w * (i + 0.5)) / n;
        sc.PR(cx - 1.2, y + h * 0.72, 2.4, 2.4, '#ffd98a', 0.55);
      }
      sc.PR(x, y, w, Math.max(1.5, h * 0.14), '#e0a43a');
      sc.PR(x, y, w, 0.8, '#fff0b0');
      sc.PR(x, y + h - 1, w, 1, '#4a1018');
    } else if (art === 'senryo') {
      // 黒漆の箱に金の帯と鋲。小判の光がまたたく
      sc.PR(x, y, w, h, '#22140c');
      sc.fade(x, y, w, h * 0.5, '#5a3a1c', 0.7, 0, 'y');
      for (const bx of [x + h * 0.9, x + w - h * 0.9 - 2]) {
        sc.PR(bx, y, 2.4, h, '#e8b830');
        sc.PR(bx + 0.6, y, 0.8, h, '#fff4b0', 0.8);
      }
      sc.PR(x, y, w, 1.2, '#ffd25c');
      sc.PR(x, y + h - 1.2, w, 1.2, '#b8862a');
      for (const [px, py] of [[x + 2, y + 2.4], [x + w - 4, y + 2.4], [x + 2, y + h - 4.4], [x + w - 4, y + h - 4.4]]) sc.PR(px, py, 2, 2, '#fff0a8');
      for (let i = 0; i < 5; i++) {
        const k = (Math.sin(t * 2.3 + i * 1.9) + 1) / 2;
        sc.PR(x + ((i * 0.193 + 0.11) % 1) * w, y + ((i * 0.37 + 0.2) % 1) * (h - 3), 1.5, 1.5, '#fff4b0', k * 0.9);
      }
    } else {
      // 生成りの帳面に、朱の綴じ糸と罫線、右に判子
      sc.PR(x, y, w, h, '#efe2c0');
      sc.fade(x, y, w, h, '#d8c090', 0, 0.6, 'y');
      for (let ly = y + h * 0.3; ly < y + h - 1; ly += Math.max(3, h * 0.24)) sc.PR(x + h * 0.7, ly, w - h * 1.6, 0.5, '#b8a070', 0.8);
      sc.PR(x, y, Math.max(3, h * 0.42), h, '#8a3a2a');
      for (let ky = y + 2; ky < y + h - 1; ky += 3.5) sc.PR(x + 1, ky, Math.max(1.5, h * 0.42 - 2), 1, '#f2d8a0', 0.9);
      const s = Math.min(h - 4, 9);
      sc.PR(x + w - s - 3, y + (h - s) / 2, s, s, '#c8402a', 0.9);
      sc.PR(x + w - s - 2, y + (h - s) / 2 + 1, s - 2, s - 2, '#efe2c0', 0.25);
    }
    // 斜めに流れる光
    const sweep = ((t * 0.45) % 1.6) - 0.3;
    const gx = x + sweep * w;
    sc.fade(gx - 8, y, 8, h, '#ffffff', 0, art === 'hiden' ? 0.3 : 0.38, 'x');
    sc.fade(gx, y, 8, h, '#ffffff', art === 'hiden' ? 0.3 : 0.38, 0, 'x');
  });
  const edge = art === 'noren' ? '#ffd98a' : art === 'senryo' ? '#ffd25c' : '#8a3a2a';
  sc.PR(x, y, 0.8, h, edge, 0.9);
  sc.PR(x + w - 0.8, y, 0.8, h, edge, 0.9);
}

/**
 * 名前の後ろにプレート、名前の上に二つ名を小さく描く。どちらも幅 w に収める。
 * 飾りがなければ名前だけを今までどおり描く。
 */
export function drawNameplate(sc: Screen, x: number, y: number, w: number, h: number, name: string, d: Decoration | undefined, size: number) {
  const plate = d?.plate ? itemById(d.plate) : undefined;
  const p = plate?.plate;
  let textCol = '#f2efe2';
  let pad = 3;
  if (plate && p) {
    // 絵があれば絵を使う。繁盛記の限定プレートは、絵が届くまでコードで描いた仮の札を出す
    const url = plateUrl(plate.id);
    plateArt.load([url]);
    const img = plateArt.get(url);
    if (img) drawPlateImage(sc, img, x, y, w, h, plate.star, phaseOf(plate.id));
    else if (p.art) drawRunPlate(sc, p.art, x, y, w, h);
    else sc.panel(x, y, w, h, p.bg, p.border);
    textCol = p.text;
    // 角の飾りにかからないよう、文字を内側から（☆4〜5は飾りが大きいので、さらに内側）
    pad = p.art && !img ? Math.max(4, h * (p.art === 'senryo' ? 1.15 : p.art === 'hiden' ? 0.6 : 0.3)) : Math.max(3, h * (plate.star >= 4 ? 1.1 : 0.5));
  }
  // 明るい文字は縁取りを付けて、絵の上でも読めるように
  const light = textCol !== '#2a1a10';
  const text = (s: string, tx: number, ty: number, ts: number, col: string) => {
    if (p && light) sc.TB(s, tx, ty, ts, col, 'left', '#1a0f08');
    else sc.T(s, tx, ty, ts, col);
  };
  const inner = w - pad * 2;
  const title = titleOf(d);
  if (!title) {
    const ns = sc.fitSize(name, size, inner, 5);
    text(name, x + pad, y + (h - ns) / 2, ns, textCol);
    return;
  }
  // 二つ名を上に小さく、名前をその下に（狭い欄でも重ならない）
  const titleSize = sc.fitSize(title, Math.max(4, size * 0.6), inner, 4);
  let shown = title;
  while ([...shown].length > 1 && sc.W(shown, titleSize) > inner) shown = `${[...shown].slice(0, -2).join('')}…`;
  const nameSize = sc.fitSize(name, size * 0.85, inner, 5);
  const top = y + Math.max(0.5, (h - titleSize - nameSize - 0.5) / 2);
  text(shown, x + pad, top, titleSize, p ? textCol : '#d9c2a0');
  text(name, x + pad, top + titleSize + 0.5, nameSize, textCol);
}
