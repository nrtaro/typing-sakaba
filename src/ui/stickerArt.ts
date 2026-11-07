// 段階6：シールと台紙の絵。起動時には読まず、シール帳やふくびきを開いたときに読む。
// 絵は public/collection/（scripts/stage6-art.mjs で作る。決まりは public/collection/README.md）。
// 絵そのものに☆に合った豪華さがあるので、ここでは☆3以上に小さなきらめきを重ねるだけにする。
import type { Screen } from './screen';
import type { Item } from '../core/collection';

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

/** シールを1枚描く。持っていなければ影絵（？）。t は光り方の動き（秒） */
export function drawSticker(sc: Screen, art: StickerArt, item: Item, x: number, y: number, size: number, t: number, owned: boolean) {
  if (!owned) {
    sc.panel(x + 2, y + 2, size - 4, size - 4, 'rgba(20,12,8,0.55)', '#5a4030');
    sc.T('？', x + size / 2, y + size / 2 - size * 0.18, size * 0.36, '#8a7060', 'center');
    return;
  }
  const img = art.get(stickerUrl(item.id));
  if (img) sc.blit(img, 0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height, x, y, size, size);
  else {
    sc.panel(x + 2, y + 2, size - 4, size - 4, STAR_COL[item.star - 1], '#ffffff');
    sc.T(item.name.slice(0, 2), x + size / 2, y + size / 2 - size * 0.14, size * 0.26, '#2a1a10', 'center');
  }
  if (item.star >= 3) {
    // キラキラ：小さな光が順にまたたく（☆が高いほど多く）
    for (let i = 0; i < item.star - 1; i++) {
      const p = (t * 1.5 + i * 0.37) % 1;
      const a = Math.sin(p * Math.PI);
      sc.PR(x + size * ((i * 0.31 + 0.2) % 0.8 + 0.1), y + size * ((i * 0.47 + 0.15) % 0.8 + 0.1), 1.5, 1.5, '#ffffff', a);
    }
  }
}
