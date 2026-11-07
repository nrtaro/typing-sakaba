// 画面：今日のランキング（タイトルの「らんきんぐ」と、結果画面から開く）
import { drawNameplate } from '../nameplate';
import { C } from '../palette';
import { LW } from '../screen';
import { dailyConditions, dateLabel, jstDate } from '../../core/daily';
import { DIFFICULTIES } from '../../core/shopConfig';
import type { Game } from '../game';
import { button, drawSignboard } from './common';
import { chipWidth, drawCondChip } from './conditions';

const MEDAL = ['#ffd27a', '#d8dde0', '#e0a070'];

/**
 * ひがわり営業の、今日の3つの難易度の上位5人を横に並べる。
 * それぞれの欄の下に、自分の順位（送っていれば）と参加人数。
 */
export function drawRanking(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const date = g.boards?.date ?? jstDate();
  const state = g.boards?.state ?? 'loading';
  const value = g.boards?.value ?? null;
  sc.shifted(0, e.y0 / 2, () => {
    drawSignboard(g, 120, 4, 240, 30);
    sc.TB('今日のランキング', LW / 2, 10, 15, '#ffd98a', 'center', '#3a1408');
    // 日付と今日のお題
    const conds = dailyConditions(date);
    const label = `${dateLabel(date)}のお題`;
    const lw = sc.W(label, 8) + 8;
    const total = lw + conds.reduce((a, c) => a + chipWidth(sc, c, 'normal') + 4, 0);
    let x = LW / 2 - total / 2;
    sc.T(label, x, 42, 8, C.cream);
    x += lw;
    for (const c of conds) x += drawCondChip(sc, g.art, c, 'normal', x, 39) + 4;

    DIFFICULTIES.forEach((d, i) => {
      const px = 14 + i * 152;
      const pw = 144;
      const py = 58;
      const ph = 150;
      const last = d.id === g.settings.difficulty;
      sc.PR(px + 3, py + 4, pw, ph, '#0c0604', 0.55);
      sc.panel(px, py, pw, ph, 'rgba(34,50,42,0.96)', last ? C.gold2 : '#6b4422');
      sc.TB(d.name, px + 10, py + 6, 12, C.gold3, 'left', C.ink);
      const board = value?.[d.id];
      if (board) sc.T(`${board.total}人`, px + pw - 8, py + 9, 8, C.cream2, 'right');
      sc.PR(px + 8, py + 24, pw - 16, 0.8, '#6b4422');
      if (state !== 'ready' || !board) {
        const msg = state === 'error' ? '今はつながりません' : '読み込み中…';
        sc.T(msg, px + pw / 2, py + 64, 9, C.cream2, 'center');
        return;
      }
      if (!board.top.length) sc.T('まだ記録がありません', px + pw / 2, py + 64, 9, C.cream2, 'center');
      board.top.forEach((s, k) => {
        const y = py + 30 + k * 19;
        const col = MEDAL[s.rank - 1] ?? C.cream;
        if (s.rank <= 3) {
          sc.panel(px + 8, y, 16, 15, '#2a1b14', col);
          sc.T(String(s.rank), px + 16, y + 2.5, 9, col, 'center');
        } else sc.T(`${s.rank}`, px + 16, y + 2.5, 9, C.cream2, 'center');
        const score = `${s.score.toLocaleString()}円`;
        sc.T(score, px + pw - 8, y + 3, 8, C.gold3, 'right');
        const nameW = pw - 34 - sc.W(score, 8) - 6;
        drawNameplate(sc, px + 26, y, nameW + 2, 15, s.name, s.decoration, 9);
      });
      // 自分の順位
      sc.PR(px + 8, py + ph - 26, pw - 16, 0.8, '#6b4422');
      const me = board.me ? `あなた：${board.me.rank}位（${board.me.score.toLocaleString()}円）` : 'あなた：まだ送っていません';
      sc.T(me, px + pw / 2, py + ph - 20, sc.fitSize(me, 8, pw - 12), board.me ? C.gold3 : C.cream2, 'center');
    });
    const note = 'ひがわり営業の結果に名前を付けて送ると、ここに載ります';
    const nw = sc.W(note, 7) + 12;
    sc.PR(LW / 2 - nw / 2, 211, nw, 11, '#120a06', 0.75);
    sc.T(note, LW / 2, 213, 7, C.cream2, 'center');
  });
  // 下：木のカウンター
  sc.PR(e.x0, 226, e.w, e.y1 - 226, '#2a1a10');
  sc.PR(e.x0, 226, e.w, 2, '#a8743f');
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    const items = g.menuItems();
    button(g, items[0], 26, 232, 130, 30, 'plain', 'Esc', '◀');
  });
}
