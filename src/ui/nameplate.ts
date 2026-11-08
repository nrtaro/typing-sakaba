// 段階6：ランキングや飾りの見本で使う、ネームプレートと二つ名の描き方
import type { Screen } from './screen';
import type { Decoration } from '../core/ranking';
import { itemById, titleText } from '../core/collection';
import { StickerArt } from './stickerArt';

/** 飾りの二つ名の文字列（そろっていなければ null） */
export function titleOf(d: Decoration | undefined): string | null {
  return d ? titleText(d.titleFront, d.titleLink, d.titleBack) : null;
}

export const plateUrl = (id: string) => `/collection/plates/${id}.webp`;
/** プレートの絵（初めて描くときに読む。読めるまでは色だけの仮の札） */
const plateArt = new StickerArt();

/**
 * プレートの絵を、両端の飾りの形を保ったまま横に伸ばして敷く（真ん中だけ伸ばす）。
 */
function drawPlateImage(sc: Screen, img: HTMLImageElement, x: number, y: number, w: number, h: number) {
  const sw = img.naturalWidth || img.width;
  const sh = img.naturalHeight || img.height;
  const cap = Math.min(sh * 2, sw / 3);
  const dcap = Math.min(cap * (h / sh), w / 2);
  sc.blit(img, 0, 0, cap, sh, x, y, dcap, h);
  sc.blit(img, cap, 0, sw - cap * 2, sh, x + dcap, y, w - dcap * 2, h);
  sc.blit(img, sw - cap, 0, cap, sh, x + w - dcap, y, dcap, h);
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
    const url = plateUrl(plate.id);
    plateArt.load([url]);
    const img = plateArt.get(url);
    if (img) drawPlateImage(sc, img, x, y, w, h);
    else sc.panel(x, y, w, h, p.bg, p.border);
    textCol = p.text;
    // 角の飾りにかからないよう、文字を内側から（☆4〜5は飾りが大きいので、さらに内側）
    pad = Math.max(3, h * (plate.star >= 4 ? 1.1 : 0.5));
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
