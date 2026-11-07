// 段階6：ランキングや飾りの見本で使う、ネームプレートと二つ名の描き方
import type { Screen } from './screen';
import type { Decoration } from '../core/ranking';
import { itemById, titleText } from '../core/collection';

/** 飾りの二つ名の文字列（そろっていなければ null） */
export function titleOf(d: Decoration | undefined): string | null {
  return d ? titleText(d.titleFront, d.titleLink, d.titleBack) : null;
}

const RAINBOW = ['#ff6b6b', '#ffb84a', '#ffe66b', '#7ce08a', '#6bc8ff', '#b48aff'];

/**
 * 名前の後ろにプレート、名前の横に二つ名を小さく描く。どちらも幅 w に収める。
 * t は光り方の動き（秒）。飾りがなければ名前だけを今までどおり描く。
 */
export function drawNameplate(sc: Screen, x: number, y: number, w: number, h: number, name: string, d: Decoration | undefined, size: number, t = 0) {
  const plate = d?.plate ? itemById(d.plate) : undefined;
  const p = plate?.plate;
  let textCol = '#f2efe2';
  if (plate && p) {
    sc.PR(x, y, w, h, p.bg);
    if (p.pattern === 'stripe') for (let i = 0; i < w; i += 6) sc.PR(x + i, y, 2, h, p.border, 0.25);
    else if (p.pattern === 'dots') for (let i = 3; i < w; i += 7) sc.PR(x + i, y + h / 2 - 0.5, 1.5, 1.5, p.border, 0.5);
    else if (p.pattern === 'wood') for (let i = 3; i < h; i += 4) sc.PR(x, y + i, w, 0.6, p.border, 0.3);
    else if (p.pattern === 'gold') sc.PR(x, y, w, h / 2, '#ffffff', 0.12);
    const edge = plate.star === 5 ? RAINBOW[Math.floor(t * 6) % RAINBOW.length] : p.border;
    sc.PR(x, y, w, 1, edge);
    sc.PR(x, y + h - 1, w, 1, edge);
    sc.PR(x, y, 1, h, edge);
    sc.PR(x + w - 1, y, 1, h, edge);
    // ☆3〜4はゆっくり光の筋が流れる
    if (plate.star >= 3 && plate.star <= 4) sc.PR(x + ((t * 30) % (w + 10)) - 10, y + 1, 4, h - 2, '#ffffff', 0.25);
    textCol = p.text;
  }
  const pad = 3;
  const inner = w - pad * 2;
  const title = titleOf(d);
  const ty = y + (h - size) / 2;
  if (!title) {
    sc.T(name, x + pad, ty, sc.fitSize(name, size, inner, 5), textCol);
    return;
  }
  // 名前は幅の半分まで、残りに二つ名を小さく
  const nameSize = sc.fitSize(name, size, inner * 0.5, 5);
  const nameW = Math.min(sc.W(name, nameSize), inner * 0.5);
  sc.T(name, x + pad, ty, nameSize, textCol);
  const rest = inner - nameW - 3;
  const small = Math.max(4, size * 0.72);
  const titleSize = sc.fitSize(title, small, rest, 4);
  sc.T(title, x + w - pad, y + (h - titleSize) / 2, titleSize, p ? textCol : '#d9c2a0', 'right');
}
