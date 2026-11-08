// 「きろく」のプロフィールタブ：二つ名（前・つなぎ・後ろ）・プレート・打鍵音を選んで付け、名前を決める。
// 飾りの欄で Enter を押すと、持っている飾りの一覧から選べる。最後の欄でランキングに反映する
import { C } from '../palette';
import type { Game } from '../game';
import { APPLY_ROW, DECOR_KEYS, NAME_ROW, PICKER_COLS } from '../game';
import { LINKS, itemById } from '../../core/collection';
import { drawNameplate } from '../nameplate';
import { STAR_COLOR } from './fukubiki';

const LABEL = ['前の言葉', 'つなぎ', '後ろの言葉', 'プレート', '打鍵音'];

/** 飾り（またはつなぎ）の表示名と色 */
function nameOf(row: number, id: string | null): { text: string; col: string } {
  if (DECOR_KEYS[row] === 'link') {
    const l = LINKS.find((x) => x.id === id);
    return { text: l ? (l.text || '（なし）') : 'な', col: '#f2efe2' };
  }
  const it = id ? itemById(id) : undefined;
  return it ? { text: it.name, col: STAR_COLOR[it.star] } : { text: 'なし', col: '#a89a90' };
}

export function drawDecor(g: Game) {
  const sc = g.sc;
  const v = g.recordsView!;
  const c = g.collection;
  if (!c) return;
  const e = c.equip;
  // 上：見本（ランキングでの見え方）
  sc.panel(14, 40, 456, 44, 'rgba(34,50,42,0.96)', '#6b4422');
  sc.T('ランキングでの見え方', 22, 44, 7.5, C.cream2);
  drawNameplate(sc, 60, 58, 360, 18, g.settings.rankingName || '店主', g.currentDecoration(), 11);
  if ((e.front && !e.back) || (!e.front && e.back)) sc.T('前と後ろの言葉がそろうと二つ名になります', 240, 77, 6.5, '#ffb6a4', 'center');
  // 下：欄（飾りの5つ・名前・今日のランキングに反映）
  sc.panel(14, 88, 456, 120, 'rgba(36,23,14,0.95)', '#8a6232');
  const rowY = (row: number) => 91 + row * 16;
  DECOR_KEYS.forEach((key, row) => {
    const y = rowY(row);
    const sel = row === v.decorRow;
    if (sel) sc.PR(18, y - 2, 448, 15, '#4a2c1c');
    if (sel) sc.T('▶', 22, y + 2, 8, C.gold3);
    sc.T(LABEL[row], 34, y + 1, 9, sel ? C.gold3 : C.cream);
    const { text, col } = nameOf(row, e[key]);
    sc.T(sel ? `◀ ${text} ▶` : text, 270, y + 0.5, sc.fitSize(text, 10, 220, 7), col, 'center');
    const count = g.decorOptions(row).length - (key === 'link' ? 0 : 1);
    sc.T(key === 'link' ? `${count}種類` : `${count}個持っている`, 460, y + 2, 7, C.cream2, 'right');
  });
  // 名前（Enter で変える）
  const ny = rowY(NAME_ROW);
  const nameSel = v.decorRow === NAME_ROW;
  sc.PR(22, ny - 3, 440, 0.6, '#6b4422');
  if (nameSel) sc.PR(18, ny - 2, 448, 15, '#4a2c1c');
  if (nameSel) sc.T('▶', 22, ny + 2, 8, C.gold3);
  sc.T('名前', 34, ny + 1, 9, nameSel ? C.gold3 : C.cream);
  const nm = g.settings.rankingName;
  sc.T(nm || '（まだ決めていません）', 270, ny + 0.5, sc.fitSize(nm || '（まだ決めていません）', 10, 220, 7), nm ? '#f2efe2' : '#a89a90', 'center');
  sc.T('Enter で変える', 460, ny + 2, 7, C.cream2, 'right');
  // 最後の欄：ランキングに反映
  const ay = rowY(APPLY_ROW) + 2;
  const applySel = v.decorRow === APPLY_ROW;
  sc.panel(150, ay - 2, 180, 15, applySel ? '#ebc47e' : 'rgba(58,36,22,0.95)', applySel ? C.w : '#a8743f');
  sc.T('今日のランキングに反映', 240, ay + 0.5, 9, applySel ? '#3a2414' : C.gold3, 'center');
  const hint = g.decorMessage || (applySel ? 'Enter で、今日載っている自分の記録の名前と飾りを、今のものにします'
    : nameSel ? 'Enter で、ランキングに載せるときの名前を決めます'
    : '↑↓で欄をえらぶ　←→で付け替える　Enter で一覧から選ぶ');
  sc.T(hint, 240, 211, sc.fitSize(hint, 7, 450, 5.5), g.decorMessage ? '#ffd98a' : C.cream2, 'center');
  if (v.picker) drawPicker(g);
}

/** 持っている飾りの一覧（3列）。プレートは見本で、ほかは名前を☆の色で */
function drawPicker(g: Game) {
  const sc = g.sc;
  const v = g.recordsView!;
  const p = v.picker!;
  const opts = g.decorOptions(p.row);
  const cur = g.collection?.equip[DECOR_KEYS[p.row]] ?? null;
  sc.cover(C.bg, 0.55);
  const x = 26;
  const y = 30;
  const w = 428;
  const h = 186;
  sc.PR(x + 3, y + 4, w, h, '#0c0604', 0.6);
  sc.panel(x, y, w, h, '#2a1a10', '#c79a52');
  const count = opts.length - (DECOR_KEYS[p.row] === 'link' ? 0 : 1);
  sc.TB(`${LABEL[p.row]}をえらぶ`, x + 10, y + 6, 11, C.gold3, 'left', C.ink);
  sc.T(DECOR_KEYS[p.row] === 'link' ? `${count}種類` : `${count}個持っている`, x + w - 10, y + 9, 8, C.cream2, 'right');
  const rows = 7;
  const cw = (w - 20) / PICKER_COLS;
  const ch = 17;
  const selRow = Math.floor(p.sel / PICKER_COLS);
  const totalRows = Math.ceil(opts.length / PICKER_COLS);
  const top = Math.max(0, Math.min(totalRows - rows, selRow - Math.floor(rows / 2)));
  for (let r = 0; r < rows; r++) for (let c = 0; c < PICKER_COLS; c++) {
    const i = (top + r) * PICKER_COLS + c;
    if (i >= opts.length) break;
    const cx = x + 10 + c * cw;
    const cy = y + 26 + r * (ch + 2);
    const sel = i === p.sel;
    const id = opts[i];
    if (sel) sc.glow(cx, cy, cw - 4, ch, C.gold3);
    sc.panel(cx, cy, cw - 4, ch, sel ? '#4d3020' : 'rgba(20,12,8,0.6)', sel ? C.gold3 : '#5a4030');
    if (DECOR_KEYS[p.row] === 'plate' && id) {
      drawNameplate(sc, cx + 2, cy + 2, cw - 8, ch - 4, itemById(id)?.name ?? '', { titleFront: null, titleLink: null, titleBack: null, plate: id }, 7);
    } else {
      const { text, col } = nameOf(p.row, id);
      sc.T(text, cx + 6, cy + 4, sc.fitSize(text, 9, cw - 28, 6), col);
    }
    if (id === cur) sc.T('✓', cx + cw - 10, cy + 4, 8, '#a9f0e4', 'right');
  }
  if (top > 0) sc.T('▲', x + w - 12, y + 20, 7, C.gold3);
  if (top + rows < totalRows) sc.T('▼', x + w - 12, y + h - 22, 7, C.gold3);
  const hint = DECOR_KEYS[p.row] === 'sound' ? '←→↑↓でえらぶ（音が鳴ります）　Enter で付ける　Esc で閉じる' : '←→↑↓でえらぶ　Enter で付ける　Esc で閉じる';
  sc.T(hint, x + w / 2, y + h - 13, 7, C.cream2, 'center');
}
