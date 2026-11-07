// 画面：今日のお題（ひがわり営業で、開店の前に見せる）
import { C } from '../palette';
import { LW } from '../screen';
import { dateLabel, rulesFor } from '../../core/daily';
import { DAY_LENGTH, DISHES, PHASES, TRIPS, difficultyOf } from '../../core/shopConfig';
import type { Game } from '../game';
import { button, drawSignboard } from './common';
import { drawCondIcon } from './conditions';

/**
 * 看板に日付、その下にお題の札を2枚。札には絵・名前・2行の説明。
 * その下に今日の自分のベスト。「はじめる」で開店、Esc で難易度へ戻る。
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
      const h = 80;
      const x = daily.conds.length === 1 ? LW / 2 - w / 2 : i === 0 ? 30 : LW - 30 - w;
      const y = 62 + Math.sin(g.t * 1.6 + i * 1.3) * 0.8;
      sc.PR(x + 3, y + 4, w, h, '#0c0604', 0.6);
      sc.panel(x, y, w, h, 'rgba(48,30,18,0.96)', '#c79a52');
      sc.PR(x + 2, y + 2, w - 4, 1.5, '#a8743f', 0.8);
      drawCondIcon(sc, g.art, c.id, x + 10, y + 9, 32);
      sc.TB(c.title(diff.id), x + 52, y + 13, sc.fitSize(c.title(diff.id), 14, w - 58), C.gold3, 'left', C.ink);
      c.lines(diff.id).forEach((line, k) => sc.T(line, x + 10, y + 54 + k * 12, sc.fitSize(line, 9, w - 20), C.cream2));
      // 時間帯の当たり：朝・昼・夜の当たりを先に見せて、段取りを考えられるようにする
      if (c.id === 'luckyTrip') {
        const plan = rulesFor([c], diff.id, daily.date).luckyTrips ?? [];
        const text = plan.map((id, k) => `${PHASES[k].name} ${TRIPS.find((t) => t.id === id)!.text}`).join(' → ');
        sc.T(text, x + 52, y + 35, sc.fitSize(text, 8, w - 58), '#ffe7a0');
      }
      // 予約の宴会：来る時刻（残り時間で）と料理を先に見せる
      if (c.id === 'banquet') {
        const plan = rulesFor([c], diff.id, daily.date).banquets;
        const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
        plan.forEach((b, k) => {
          const text = `残り${fmt(DAY_LENGTH - b.at)}に「${DISHES.find((d) => d.id === b.dish)!.text}」`;
          sc.T(text, x + 52, y + 30 + k * 7, sc.fitSize(text, 7, w - 58), '#ffe7a0');
        });
      }
    });
    // 今日の自分のベスト
    const best = g.store.loadDailyBest(daily.date, diff.id);
    const text = best ? `今日のベスト ${best.score.toLocaleString()}円` : '今日のベスト まだなし';
    sc.T(text, LW / 2, 146, 8, '#f2efe2', 'center');
    sc.panel(30, 158, 420, 52, 'rgba(32,25,18,0.96)', '#a8743f');
    const board = g.board?.key === `${daily.date}:${diff.id}` ? g.board : null;
    const total = board?.value?.total;
    sc.TB(`今日のランキング${total ? `・${total}人` : ''}`, 40, 162, 8, C.gold3, 'left');
    if (board?.state === 'ready' && board.value?.top.length) {
      board.value.top.forEach((entry, i) => {
        const x = 72 + i * 84;
        const label = `${entry.rank}位 ${entry.name}`;
        sc.T(label, x, 177, sc.fitSize(label, 9, 76), C.cream, 'center');
        sc.TB(`${entry.score.toLocaleString()}円`, x, 193, 9, C.gold3, 'center');
      });
    } else {
      const message = board?.state === 'error' ? '今はランキングにつながりません。営業は遊べます'
        : board?.state === 'ready' ? 'まだ記録がありません。今日の一番乗りになろう' : 'ランキングを読み込み中…';
      sc.T(message, LW / 2, 185, 8, C.cream2, 'center');
    }
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
    sc.T('お題は毎日0時更新', 226, 232, 7, C.cream2, 'center');
    sc.T('（日本時間）', 226, 243, 7, C.cream2, 'center');
  });
}
