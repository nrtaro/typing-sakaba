// 画面：開店前の仕込み（ひがわり営業の「開店前の仕込み」の日に、開店の前に出す）
import { C } from '../palette';
import { LW } from '../screen';
import { RomajiMatcher } from '../../core/romaji';
import { dateLabel, prepCap } from '../../core/daily';
import { DAY_LENGTH, DISHES, INGREDIENT_NAME, INGREDIENT_ORDER, PHASES, TRIPS, difficultyOf, type IngredientId } from '../../core/shopConfig';
import { ICON_INDEX } from '../amber/layout';
import type { Game } from '../game';
import { button, drawSignboard } from './common';
import { drawCondChip } from './conditions';

/** 仕込みで打つ言葉（素材の名前） */
export const PREP_WORDS: Record<IngredientId, string> = {
  fish: 'さかな', meat: 'にく', veg: 'やさい', mush: 'きのこ', ale: 'さけ', spice: 'すぱいす',
};

const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;

/**
 * 左：6つの素材の段。名前を打つと＋1、←→で増減、↑↓でえらぶ、Backspace で−1。
 * 右：残りの数と、今日のお題（宴会の時刻と料理、時間帯の当たり）を確かめる欄。
 */
export function drawPrep(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const prep = g.prep;
  const daily = g.daily;
  if (!prep || !daily) return;
  const diff = difficultyOf(g.settings.difficulty);
  const rules = g.prepRules();
  const cap = prepCap(rules);
  const left = g.prepLeft();
  const typing = g.menu.typed.length > 0;
  sc.shifted(0, e.y0 / 2, () => {
    drawSignboard(g, 150, 4, 180, 30);
    sc.TB('開店前の仕込み', LW / 2, 10, 15, '#ffd98a', 'center', '#3a1408');

    // ---- 左：素材の段 ----
    const px = 14;
    const pw = 262;
    sc.panel(px, 40, pw, 166, 'rgba(36,23,14,0.95)', '#8a6232');
    INGREDIENT_ORDER.forEach((id, k) => {
      const y = 46 + k * 26;
      const sel = prep.sel === k;
      const word = PREP_WORDS[id];
      const live = g.menu.active.find((l) => l.target.id === word);
      const dim = typing && !live;
      if (sel) {
        sc.PR(px + 3, y - 2, pw - 6, 24, '#4a2c1c');
        sc.T('▶', px + 5, y + 5, 8, C.gold3);
      }
      if (g.art) g.art.drawIcon(sc, 'icons-dishes', ICON_INDEX[id], px + 15, y, 20, dim ? 0.4 : 1);
      sc.T(INGREDIENT_NAME[id], px + 38, y + 5, 10, dim ? C.gray : C.cream);
      // 打つ言葉の札
      const m = live?.matcher ?? new RomajiMatcher(word);
      const rw = sc.W(m.typed + m.remaining, 8) + 10;
      sc.panel(px + 80, y + 2, rw, 15, '#211712', live ? C.gold : C.gold2, dim ? 0.5 : 1);
      sc.roma(m.typed, m.remaining, px + 80 + rw / 2, y + 5, 8, live ? 'active' : dim ? 'dim' : 'idle');
      // 入れた数：升目（上限まで）と数字
      const n = prep.alloc[id];
      const bx = px + 146;
      const cell = Math.min(7, 78 / cap);
      for (let c = 0; c < cap; c++) sc.PR(bx + c * cell, y + 6, cell - 1.5, 8, c < n ? '#e8b85a' : '#3a2a1c', dim ? 0.5 : 1);
      const flash = prep.changed === id && g.t - prep.changedAt < 0.25;
      sc.TB(`${n}`, px + pw - 12, y + 3, flash ? 14 : 12, flash ? C.w : C.gold3, 'right', C.ink);
      if (sel) {
        sc.T('◀', bx - 9, y + 6, 7, n > 0 ? C.gold3 : C.gray);
        sc.T('▶', px + pw - 36, y + 6, 7, n < cap && left > 0 ? C.gold3 : C.gray);
      }
    });

    // ---- 右：残りと、今日のお題 ----
    const rx = 284;
    const rw = 182;
    sc.panel(rx, 40, rw, 166, 'rgba(36,23,14,0.95)', '#8a6232');
    const lc = left > 0 ? C.gold3 : left === 0 ? '#a9f0e4' : C.red3;
    sc.T('残り', rx + 10, 50, 9, C.cream);
    sc.TB(`${left}`, rx + 36, 44, 20, lc, 'left', C.ink);
    sc.T(`/ ${rules.prepBudget}個`, rx + 38 + sc.W(`${left}`, 20), 52, 9, C.cream2);
    sc.T(left > 0 ? 'まだ振り分けられる' : '振り分け終わり', rx + rw - 8, 52, 7, lc, 'right');
    sc.PR(rx + 8, 70, rw - 16, 0.8, '#6b4422');
    sc.T(`${dateLabel(daily.date)}のお題・${diff.name}`, rx + 8, 74, 8, C.gold3);
    let y = 86;
    daily.conds.forEach((c) => {
      drawCondChip(sc, g.art, c, diff.id, rx + 8, y);
      y += 16;
    });
    // 予約の宴会：来る時刻と、使う素材
    for (const b of rules.banquets) {
      const dish = DISHES.find((d) => d.id === b.dish)!;
      const ids = Object.keys(dish.need) as IngredientId[];
      sc.T(`宴会 残り${fmt(DAY_LENGTH - b.at)}「${dish.text}」`, rx + 8, y + 1, sc.fitSize(`宴会 残り${fmt(DAY_LENGTH - b.at)}「${dish.text}」`, 7, rw - 16), C.cream);
      ids.forEach((id, k) => {
        if (g.art) g.art.drawIcon(sc, 'icons-dishes', ICON_INDEX[id], rx + 12 + k * 22, y + 10, 10);
        sc.T(`×${dish.need[id]}`, rx + 23 + k * 22, y + 11, 6, C.cream2);
      });
      y += 22;
    }
    // 時間帯の当たり
    if (rules.luckyTrips) {
      const text = rules.luckyTrips.map((id, k) => `${PHASES[k].name} ${TRIPS.find((t) => t.id === id)!.text}`).join(' → ');
      sc.T('当たりの調達先', rx + 8, y + 1, 7, C.cream);
      sc.T(text, rx + 8, y + 10, sc.fitSize(text, 8, rw - 16), '#ffe7a0');
      y += 22;
    }
    if (rules.spoilAfter !== null) { sc.T(`仕込んだ素材も${rules.spoilAfter}秒で傷む`, rx + 8, y + 1, 7, '#c8e08a'); y += 11; }
    if (rules.storageCap !== null) { sc.T(`1種類${rules.storageCap}個まで（狭い倉庫）`, rx + 8, y + 1, 7, C.cream2); y += 11; }

    // 操作の説明
    const hint = '名前を打つと＋1　←→で増減　↑↓でえらぶ　Backspaceで−1';
    const hw = sc.W(hint, 7) + 12;
    sc.PR(LW / 2 - hw / 2, 208, hw, 11, '#120a06', 0.8);
    sc.T(hint, LW / 2, 210, 7, C.cream2, 'center');
  });
  // 下：木のカウンター
  sc.PR(e.x0, 222, e.w, e.y1 - 222, '#2a1a10');
  sc.PR(e.x0, 222, e.w, 2, '#a8743f');
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    const items = g.menuItems();
    const find = (kana: string) => items.find((it) => it.kana === kana)!;
    button(g, find('もどる'), 20, 230, 110, 30, 'plain', 'Esc', '◀');
    button(g, find('おまかせ'), 140, 230, 136, 30, 'plain');
    button(g, find('はじめる'), 300, 226, 160, 36, 'primary', 'Enter');
  });
}
