// 画面：今日のお題（ひがわり営業で、開店の前に見せる）
import { C } from '../palette';
import { LW } from '../screen';
import { dateLabel } from '../../core/daily';
import { difficultyOf } from '../../core/shopConfig';
import type { Game } from '../game';
import { button, drawSignboard } from './common';
import { drawCondIcon } from './conditions';

/**
 * 看板に日付、その下にお題の札を2枚。札には絵・名前・2行の説明。
 * その下に今日の自分のベスト。「ひらく」で開店、Esc で難易度へ戻る。
 */
export function drawDaily(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const daily = g.daily;
  if (!daily) return;
  const diff = difficultyOf(g.settings.difficulty);
  sc.shifted(0, e.y0 / 2, () => {
    drawSignboard(g, 130, 6, 220, 34);
    sc.TB(`${dateLabel(daily.date)}のお題`, LW / 2, 14, 15, '#ffd98a', 'center', '#3a1408');
    const tag = `ひがわり営業・${diff.name}`;
    const tw = sc.W(tag, 8) + 12;
    sc.panel(LW / 2 - tw / 2, 44, tw, 13, '#3a2414', '#a8743f');
    sc.T(tag, LW / 2, 46, 8, C.cream, 'center');
    daily.conds.forEach((c, i) => {
      const w = 204;
      const h = 96;
      const x = i === 0 ? 30 : LW - 30 - w;
      const y = 64 + Math.sin(g.t * 1.6 + i * 1.3) * 0.8;
      sc.PR(x + 3, y + 4, w, h, '#0c0604', 0.6);
      sc.panel(x, y, w, h, 'rgba(48,30,18,0.96)', '#c79a52');
      sc.PR(x + 2, y + 2, w - 4, 1.5, '#a8743f', 0.8);
      const label = c.kind === 'major' ? '大きなお題' : '小さなお題';
      const lw = sc.W(label, 7) + 8;
      sc.panel(x + 8, y + 8, lw, 11, c.kind === 'major' ? '#7a2a3a' : '#2f4a3a', C.ink);
      sc.T(label, x + 8 + lw / 2, y + 9.5, 7, C.cream, 'center');
      drawCondIcon(sc, g.art, c.id, x + 12, y + 26, 36, c.count(diff.id));
      sc.TB(c.title(diff.id), x + 58, y + 30, sc.fitSize(c.title(diff.id), 15, w - 66), C.gold3, 'left', C.ink);
      c.lines(diff.id).forEach((line, k) => sc.T(line, x + 12, y + 68 + k * 12, sc.fitSize(line, 9, w - 20), C.cream2));
    });
    // 今日の自分のベスト
    const best = g.store.loadDailyBest(daily.date, diff.id);
    const text = best ? `今日のベスト ${best.score.toLocaleString()}円` : '今日のベスト まだなし';
    const bw = sc.W(text, 10) + 24;
    sc.panel(LW / 2 - bw / 2, 172, bw, 20, '#22322a', '#6b4422');
    sc.T(text, LW / 2, 176, 10, '#f2efe2', 'center');
    const note = 'お題は毎日0時（日本時間）に変わります';
    const nw = sc.W(note, 7) + 12;
    sc.PR(LW / 2 - nw / 2, 195, nw, 11, '#120a06', 0.75);
    sc.T(note, LW / 2, 197, 7, C.cream2, 'center');
  });
  // 下：木のカウンター
  sc.PR(e.x0, 212, e.w, e.y1 - 212, '#2a1a10');
  sc.PR(e.x0, 212, e.w, 2, '#a8743f');
  sc.PR(e.x0, 214, e.w, 1, '#5a3a1c');
  for (let yy = 232; yy < e.y1; yy += 18) sc.PR(e.x0, yy, e.w, 0.6, '#3a2414', 0.8);
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    const items = g.menuItems();
    button(g, items[items.length - 1], 26, 228, 120, 30, 'plain', 'Esc', '◀');
    button(g, items[0], 300, 222, 158, 38, 'primary', 'Enter');
  });
}
