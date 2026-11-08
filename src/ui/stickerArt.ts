// 段階6：シールと台紙の絵。起動時には読まず、シール帳やふくびきを開いたときに読む。
// 絵は public/collection/（scripts/stage6-art.mjs で作る。決まりは public/collection/README.md）。
// 光り方（キラキラ・ホログラム）と持っていないときの影は shine.ts。
import type { Screen } from './screen';
import type { Item } from '../core/collection';
import { drawSparkles, shined, silhouette } from './shine';

export const stickerUrl = (id: string) => `/collection/stickers/${id}.webp`;
export const sheetUrl = (seriesId: string, done: boolean) => `/collection/sheets/sheet-${seriesId}${done ? '-done' : ''}.webp`;

/** 絵を URL ごとに一度だけ読む。読めなかった絵は null のまま（仮の描き方で代わりに描く） */
export class StickerArt {
  private images = new Map<string, HTMLImageElement | null>();

  load(urls: string[]) {
    for (const url of urls) {
      if (this.images.has(url)) continue;
      this.images.set(url, null);
      try {
        const img = new Image();
        img.onload = () => this.images.set(url, img);
        img.onerror = () => {};
        img.src = url;
      } catch { /* 絵が読めない環境では仮の描き方を使う */ }
    }
  }

  get(url: string): HTMLImageElement | null {
    return this.images.get(url) ?? null;
  }
}

const STAR_COL = ['#c8bea8', '#7cc87c', '#6eaaf0', '#f0c850', '#e678dc'];

/** 飾りごとに光のタイミングをずらす（同じ画面で一斉に光らないように） */
export function phaseOf(id: string) {
  let h = 0;
  for (const ch of id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return (h % 1000) / 1000;
}

/** シールを1枚描く。持っていなければ絵の影。☆3以上は光り方を重ねる。t は秒 */
export function drawSticker(sc: Screen, art: StickerArt, item: Item, x: number, y: number, size: number, t: number, owned: boolean) {
  const img = art.get(stickerUrl(item.id));
  if (!owned) {
    const shadow = img ? silhouette(img) : null;
    if (shadow) {
      const { naturalWidth: w, naturalHeight: h } = img!;
      sc.blit(shadow, 0, 0, w, h, x, y, size, size, false, 0.8);
    } else {
      sc.panel(x + 2, y + 2, size - 4, size - 4, 'rgba(20,12,8,0.55)', '#5a4030');
      sc.T('？', x + size / 2, y + size / 2 - size * 0.18, size * 0.36, '#8a7060', 'center');
    }
    return;
  }
  const phase = phaseOf(item.id);
  if (img) {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    sc.blit(shined(img, item.star, t, phase), 0, 0, w, h, x, y, size, size);
  } else {
    sc.panel(x + 2, y + 2, size - 4, size - 4, STAR_COL[item.star - 1], '#ffffff');
    sc.T(item.name.slice(0, 2), x + size / 2, y + size / 2 - size * 0.14, size * 0.26, '#2a1a10', 'center');
  }
  drawSparkles(sc, x, y, size, size, item.star, t, phase);
}
