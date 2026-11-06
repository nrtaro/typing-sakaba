// 画面：difficulty
import { C } from '../palette';
import { LW } from '../screen';
import { RomajiMatcher } from '../../core/romaji';
import { DIFFICULTIES } from '../../core/shopConfig';
import type { Game } from '../game';
import { button, drawSignboard } from './common';

/**
 * 難易度：タイトルと同じ店を背景に、吊り看板と同じ木の札を3枚下げる。
 * 下はタイトルと同じ木のカウンター。打てる札は次のキーが光り、キーが押される絵が動く。
 */
export function drawDifficulty(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const typing = g.menu.typed.length > 0;
  const crowds = ['のんびり', 'ほどよく忙しい', '次々に注文'];
  sc.shifted(0, e.y0 / 2, () => {
    drawSignboard(g, 160, 6, 160, 34);
    sc.TB('難易度をえらぶ', LW / 2, 13, 16, '#ffd98a', 'center', '#3a1408');
    DIFFICULTIES.forEach((d, i) => {
      const live = g.menu.active.find((l) => l.target.id === d.kana);
      const last = d.id === g.settings.difficulty;
      const dim = typing && !live;
      const x = 26 + i * 146;
      const y = (live ? 50 : 52) + Math.sin(g.t * 1.6 + i * 1.3) * (typing ? 0 : 0.8);
      const w = 136;
      const h = 150;
      if (live) sc.glow(x, y, w, h, C.gold3);
      else if (last && !typing) sc.glow(x, y, w, h, C.gold3, 0.35 + 0.25 * Math.sin(g.t * 3));
      // 真ん中の札は「難易度をえらぶ」の看板から吊るし、鎖が看板の文字にかからないようにする
      drawSignboard(g, x, y, w, h, i === 1 ? 40 : undefined);
      if (!i) {
        sc.panel(x + 10, y + 10, 66, 13, '#a7c99d', '#4c6b43');
        sc.T('はじめての人に', x + 14, y + 13, 7, '#203321');
      }
      sc.TB(d.name, x + w / 2, y + 28, 20, '#ffe7b0', 'center', '#3a1408');
      sc.T(crowds[i], x + w / 2, y + 55, 9, '#f3dcb0', 'center');
      // ローマ字の札：遊び方と同じく、次に打つ文字が光り、キーが押される絵が動く
      const m = live?.matcher ?? new RomajiMatcher(d.kana);
      const rw = sc.W(m.typed + m.remaining, 11) + 14;
      sc.panel(x + w / 2 - rw / 2, y + 70, rw, 18, '#211712', live ? C.gold : C.gold2);
      sc.roma(m.typed, m.remaining, x + w / 2, y + 73, 11, dim ? 'dim' : 'active');
      if (!dim) {
        const down = Math.floor(g.t * 2.5 + i) % 2 === 0;
        const kx = x + w / 2 + rw / 2 - 5;
        const ky = y + 64 + (down ? 1.5 : 0);
        sc.panel(kx, ky, 12, 12, down ? '#e3c890' : '#f6e2b8', '#8a6232');
        sc.T((m.remaining[0] ?? '').toUpperCase(), kx + 6, ky + 2, 8, '#3a2414', 'center');
      }
      // お客の多さ：並ぶ客の数で見せる
      if (g.art) for (let j = 0; j <= i; j++) {
        g.art.drawFrame(sc, 'guests-seated', j * 4, x + w / 2 - i * 17 + j * 34, y + 122, g.art.scaleFor('guests-seated', j * 4, 24));
      }
      // ベスト：黒板の帯
      const best = g.store.loadBest(d.id);
      sc.panel(x + 12, y + 127, w - 24, 15, '#22322a', '#6b4422');
      sc.T(best ? `ベスト ${best.score.toLocaleString()}` : 'ベスト ―', x + w / 2, y + 130, 8, '#f2efe2', 'center');
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
  });
}
