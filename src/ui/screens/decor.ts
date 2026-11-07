// 「きろく」の飾りタブ（段階6）：二つ名（前・つなぎ・後ろ）・プレート・打鍵音を選んで付ける
import { C } from '../palette';
import type { Game } from '../game';
import { DECOR_KEYS } from '../game';
import { LINKS, itemById } from '../../core/collection';
import { drawNameplate } from '../nameplate';
import { STAR_COLOR } from './fukubiki';

const LABEL = ['前の言葉', 'つなぎ', '後ろの言葉', 'プレート', '打鍵音'];

export function drawDecor(g: Game) {
  const sc = g.sc;
  const v = g.recordsView!;
  const c = g.collection;
  if (!c) return;
  const e = c.equip;
  // 上：見本（ランキングでの見え方）
  sc.panel(14, 40, 456, 44, 'rgba(34,50,42,0.96)', '#6b4422');
  sc.T('ランキングでの見え方', 22, 44, 7.5, C.cream2);
  const deco = g.currentDecoration();
  drawNameplate(sc, 60, 58, 360, 18, g.settings.rankingName || '店主', deco, 11);
  if ((e.front && !e.back) || (!e.front && e.back)) sc.T('前と後ろの言葉がそろうと二つ名になります', 240, 77, 6.5, '#ffb6a4', 'center');
  // 下：欄
  sc.panel(14, 90, 456, 116, 'rgba(36,23,14,0.95)', '#8a6232');
  DECOR_KEYS.forEach((key, row) => {
    const y = 96 + row * 21;
    const sel = row === v.decorRow;
    if (sel) sc.PR(18, y - 2, 448, 19, '#4a2c1c');
    if (sel) sc.T('▶', 22, y + 3, 8, C.gold3);
    sc.T(LABEL[row], 34, y + 2, 9, sel ? C.gold3 : C.cream);
    const id = e[key];
    let text = 'なし';
    let col: string = '#a89a90';
    if (key === 'link') { const l = LINKS.find((x) => x.id === id); text = l ? (l.text || '（なし）') : 'な'; col = '#f2efe2'; }
    else if (id) { const it = itemById(id); if (it) { text = `${it.name}`; col = STAR_COLOR[it.star]; } }
    sc.T(sel ? `◀ ${text} ▶` : text, 270, y + 1, sc.fitSize(text, 10, 220, 7), col, 'center');
    const count = g.decorOptions(row).length - (key === 'link' ? 0 : 1);
    sc.T(key === 'link' ? `${count}種類` : `${count}個持っている`, 460, y + 3, 7, C.cream2, 'right');
  });
  sc.T('↑↓で欄をえらぶ　←→で付け替える', 240, 210, 7, C.cream2, 'center');
}
