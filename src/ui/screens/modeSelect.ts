// 画面：営業をえらぶ（通常営業／ひがわり営業）
import { C } from '../palette';
import { LW } from '../screen';
import { RomajiMatcher } from '../../core/romaji';
import { dailyConditions, dateLabel, jstDate } from '../../core/daily';
import { difficultyOf } from '../../core/shopConfig';
import { goalFor } from '../../core/run';
import type { Game } from '../game';
import { button, drawSignboard } from './common';
import { drawCondChip } from './conditions';

const MODES = [
  { kana: 'つうじょう', name: '通常営業', line: '3分間で、売上の自己ベストに挑戦' },
  { kana: 'ひがわり', name: 'ひがわり営業', line: '毎日変わるお題で、みんなと腕比べ' },
  { kana: 'はんじょうき', name: '繁盛記', line: '方針を選んで店を育てる四日間' },
] as const;
const MODE_ID = ['normal', 'daily', 'run'] as const;

/** 鎖：上の端から札まで */
function chain(g: Game, cx: number, from: number, to: number) {
  const sc = g.sc;
  for (let cy = from; cy < to; cy += 4) {
    sc.PR(cx - 1.5, cy, 3, 2.5, '#8a6a44');
    sc.PR(cx - 0.5, cy + 2.5, 1, 1.5, '#5a4128');
  }
}

/**
 * 難易度の画面と同じ作り：店を背景に、看板から木の札を2枚下げる。
 * 札には一言の説明。ひがわりの札には今日の日付とお題を小さく出す。
 */
export function drawModeSelect(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const typing = g.menu.typed.length > 0;
  const diff = difficultyOf(g.settings.difficulty);
  sc.shifted(0, e.y0 / 2, () => {
    drawSignboard(g, 160, 6, 160, 34);
    sc.TB('営業をえらぶ', LW / 2, 13, 16, '#ffd98a', 'center', '#3a1408');
    // キーの絵に出す文字：ほかの札と同じ文字で始まるときは、見分けがつくところまで出す（ひがわり HI／繁盛記 HA）
    const rems = MODES.map((md) => {
      const live = g.menu.active.find((l) => l.target.id === md.kana);
      return typing && !live ? null : (live?.matcher ?? new RomajiMatcher(md.kana)).remaining;
    });
    const keyLabel = (i: number) => {
      const r = rems[i] ?? '';
      let n = 1;
      while (n < r.length && rems.some((o, j) => j !== i && o !== null && o.startsWith(r.slice(0, n)))) n++;
      return r.slice(0, n).toUpperCase();
    };
    MODES.forEach((md, i) => {
      const live = g.menu.active.find((l) => l.target.id === md.kana);
      const last = g.settings.playMode === MODE_ID[i];
      const dim = typing && !live;
      const w = 148;
      const h = 150;
      const x = 10 + i * 156;
      const y = (live ? 50 : 52) + Math.sin(g.t * 1.6 + i * 1.3) * (typing ? 0 : 0.8);
      // 外側の鎖は上の端から、内側の鎖は看板から下げる
      const fromTop = sc.ext.y0 - e.y0 / 2;
      chain(g, x + 28, i === 0 ? fromTop : i === 1 ? 40 : fromTop, y);
      chain(g, x + w - 28, i === 2 ? fromTop : i === 1 ? 40 : fromTop, y);
      if (live) sc.glow(x, y, w, h, C.gold3);
      else if (last && !typing) sc.glow(x, y, w, h, C.gold3, 0.35 + 0.25 * Math.sin(g.t * 3));
      drawSignboard(g, x, y, w, h, y);
      sc.TB(md.name, x + w / 2, y + 22, sc.fitSize(md.name, 20, w - 20), '#ffe7b0', 'center', '#3a1408');
      sc.T(md.line, x + w / 2, y + 50, sc.fitSize(md.line, 9, w - 18, 6), '#f3dcb0', 'center');
      // 右上は Enter の印の場所なので、左上に付ける
      if (i === 2) { sc.panel(x + 8, y + 6, 36, 11, '#7a1f2a', '#ffd98a'); sc.T('上級向け', x + 26, y + 7.5, 7, '#fff0b0', 'center'); }
      // ローマ字の札：次に打つ文字が光り、キーが押される絵が動く
      const m = live?.matcher ?? new RomajiMatcher(md.kana);
      const rw = sc.W(m.typed + m.remaining, 11) + 14;
      sc.panel(x + w / 2 - rw / 2, y + 66, rw, 18, '#211712', live ? C.gold : C.gold2);
      sc.roma(m.typed, m.remaining, x + w / 2, y + 69, 11, dim ? 'dim' : 'active');
      if (!dim) {
        const down = Math.floor(g.t * 2.5 + i) % 2 === 0;
        const kx = x + w / 2 + rw / 2 - 5;
        const ky = y + 60 + (down ? 1.5 : 0);
        const label = keyLabel(i);
        const kw = 12 + Math.max(0, label.length - 1) * 6;
        sc.panel(kx, ky, kw, 12, down ? '#e3c890' : '#f6e2b8', '#8a6232');
        sc.T(label, kx + kw / 2, ky + 2, 8, '#3a2414', 'center');
      }
      // 下の黒板：通常は自己ベスト、ひがわりは今日の日付とお題
      sc.panel(x + 12, y + 92, w - 24, 48, '#22322a', '#6b4422');
      if (i === 0) {
        sc.T('営業時間 3:00', x + w / 2, y + 98, 9, '#f2efe2', 'center');
        const best = g.store.loadBest(diff.id);
        const line = `${diff.name}のベスト ${best ? `${best.score.toLocaleString()}円` : '―'}`;
        sc.T(line, x + w / 2, y + 118, sc.fitSize(line, 8, w - 30, 6), '#d9e4cf', 'center');
      } else if (i === 2) {
        const m = g.runUI.meta;
        sc.T(`のれん${m.loop}枚目${m.active ? '（途中）' : ''}`, x + w / 2, y + 96, 9, '#f2efe2', 'center');
        sc.T(`3分×4日・目標 ${goalFor(0, m.loop, 'joren').toLocaleString()}円から`, x + w / 2, y + 111, sc.fitSize(`3分×4日・目標 ${goalFor(0, m.loop, 'joren').toLocaleString()}円から`, 7.5, w - 30, 5.5), '#d9e4cf', 'center');
        sc.T(`クリア ${m.clears}回`, x + w / 2, y + 124, 7.5, '#d9e4cf', 'center');
      } else {
        const date = jstDate();
        sc.T(`${dateLabel(date)}のお題`, x + w / 2, y + 96, 9, '#f2efe2', 'center');
        dailyConditions(date).forEach((c, k) => drawCondChip(sc, g.art, c, diff.id, x + 15, y + 108 + k * 15));
      }
      if (last && !typing) sc.keycap('Enter', x + w - 38, y + 10, 7);
      if (dim) sc.PR(x, y, w, h, '#0e0805', 0.6);
    });
  });
  // 下：タイトルと同じ木のカウンター
  sc.PR(e.x0, 212, e.w, e.y1 - 212, '#2a1a10');
  sc.PR(e.x0, 212, e.w, 2, '#a8743f');
  sc.PR(e.x0, 214, e.w, 1, '#5a3a1c');
  for (let yy = 232; yy < e.y1; yy += 18) sc.PR(e.x0, yy, e.w, 0.6, '#3a2414', 0.8);
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    const items = g.menuItems();
    button(g, items[items.length - 1], 26, 228, 120, 30, 'plain', 'Esc', '◀');
    const practice = items.find((it) => it.kana === 'れんしゅう');
    if (practice) {
      const first = !g.settings.tutorialDone;
      if (first && !g.menu.typed) g.sc.glow(300, 226, 158, 34, C.gold3, 0.4 + 0.3 * Math.sin(g.t * 3));
      button(g, practice, 300, 226, 158, 34, first ? 'primary' : 'plain', undefined, '▶');
      if (first) {
        g.sc.panel(306, 218, 92, 11, '#a7c99d', '#4c6b43');
        g.sc.T('はじめての人はここから', 310, 219.5, 7, '#203321');
      }
    }
  });
}
