// 「きろく」のシール帳タブ（段階6）：台紙の9つの枠にシールを貼る。そろうと台紙の絵が完成する
import { C } from '../palette';
import type { Game } from '../game';
import { ITEMS, SERIES, owns, seriesComplete } from '../../core/collection';
import { ACHIEVEMENTS } from '../../core/achievements';
import { drawSticker, sheetUrl } from '../stickerArt';

export function drawStickerBook(g: Game) {
  const sc = g.sc;
  const v = g.recordsView!;
  const c = g.collection;
  const u = g.records?.unlocked ?? {};
  if (!c) return;
  const series = SERIES[v.series];
  const items = ITEMS.filter((i) => i.sticker?.series === series.id).sort((a, b) => a.sticker!.slot - b.sticker!.slot);
  const done = seriesComplete(c, u, series.id);
  const have = items.filter((i) => owns(c, u, i.id)).length;
  // 左：台紙（3×3）
  const x = 14;
  const y = 40;
  const size = 162;
  const sheet = g.stickerArt.get(sheetUrl(series.id, done));
  if (sheet) sc.blit(sheet, 0, 0, sheet.naturalWidth || sheet.width, sheet.naturalHeight || sheet.height, x, y, size, size);
  else sc.panel(x, y, size, size, done ? '#faecc8' : '#eee0c4', done ? C.gold2 : '#8a6232');
  const cell = size / 3;
  for (const it of items) {
    const s = it.sticker!.slot;
    drawSticker(sc, g.stickerArt, it, x + (s % 3) * cell + 4, y + Math.floor(s / 3) * cell + 4, cell - 8, g.t, owns(c, u, it.id));
  }
  if (done) sc.radialGlow(x + size / 2, y + size / 2, 90, '#ffe08a', 0.18 + 0.08 * Math.sin(g.t * 2));
  // 右：シリーズと、9枚の名前・入手先
  const rx = 184;
  const rw = 286;
  sc.panel(rx, y, rw, size, 'rgba(36,23,14,0.95)', done ? C.gold2 : '#8a6232');
  sc.TB(`◀ ${series.name} ▶`, rx + 10, y + 5, 11, C.gold3, 'left', C.ink);
  sc.T(`${have} / 9${done ? '　完成！' : ''}`, rx + rw - 10, y + 8, 9, done ? '#ffd98a' : C.cream, 'right');
  items.forEach((it, k) => {
    const ry = y + 24 + k * 15;
    const got = owns(c, u, it.id);
    sc.T(`${k + 1}`, rx + 12, ry + 1, 7.5, C.cream2, 'center');
    if (got) sc.T(it.name, rx + 22, ry, sc.fitSize(it.name, 8.5, 170, 6), '#f2efe2');
    else sc.T('？？？', rx + 22, ry, 8.5, '#a89a90');
    const from = typeof it.source === 'object'
      ? `実績：${ACHIEVEMENTS.find((a) => typeof it.source === 'object' && a.id === it.source.achievement)?.title ?? ''}`
      : `ふくびき ☆${it.star}`;
    sc.T(from, rx + rw - 8, ry + 1, sc.fitSize(from, 7, 96, 5), typeof it.source === 'object' ? '#ffb8d0' : C.cream2, 'right');
  });
}
