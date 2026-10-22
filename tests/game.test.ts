import { describe, expect, it } from 'vitest';
import {
  buyUpgrade, completeActivity, computeScore, cook, cookableCount, kitchenCap, newGame, openTavern, startActivity,
  sum, toggleMenu, menuSlots, type GameState,
} from '../src/core/game';
import { EFFECTS, RECIPE_ORDER, RUN, SCORE, UPGRADES } from '../src/core/config';
import type { ActivityResult } from '../src/core/activity';
import { SaveStore } from '../src/core/save';
import { simulateRun } from './bot';

function fakeResult(kind: 'fishing' | 'hunting', items: [string, 0 | 1 | 2, number][]): ActivityResult {
  return {
    kind,
    catches: items.map(([ingredient, quality, count]) => ({ ingredient: ingredient as never, quality, count, label: '', misses: 0 })),
    correctKeys: 100,
    missKeys: 5,
    activeSeconds: 30,
    wordsCompleted: 10,
    escapes: 0,
  };
}

function allNonNegative(s: GameState) {
  expect(s.cash).toBeGreaterThanOrEqual(0);
  for (const q of Object.values(s.ingredients)) for (const n of q) expect(n).toBeGreaterThanOrEqual(0);
  for (const q of Object.values(s.dishes)) for (const n of q) expect(n).toBeGreaterThanOrEqual(0);
  expect(s.actionsLeft).toBeGreaterThanOrEqual(0);
}

describe('調達', () => {
  it('行動回数を消費し、結果は1回だけ反映される', () => {
    const s = newGame(1);
    const token = startActivity(s, 'fishing', s.rev)!;
    expect(s.actionsLeft).toBe(RUN.actionsPerDay - 1);
    const res = fakeResult('fishing', [['smallFish', 2, 3]]);
    expect(completeActivity(s, token, res)).toBe(true);
    expect(completeActivity(s, token, res)).toBe(false);
    expect(s.ingredients.smallFish[2]).toBe(3);
  });

  it('古い rev では行動を開始できない（二重クリック対策）', () => {
    const s = newGame(1);
    const rev = s.rev;
    expect(startActivity(s, 'fishing', rev)).not.toBeNull();
    expect(startActivity(s, 'hunting', rev)).toBeNull();
    expect(s.actionsLeft).toBe(RUN.actionsPerDay - 1);
  });

  it('調達中は別の調達や開店ができない', () => {
    const s = newGame(1);
    startActivity(s, 'fishing', s.rev);
    expect(startActivity(s, 'hunting', s.rev)).toBeNull();
    expect(openTavern(s, s.rev)).toBeNull();
  });
});

describe('料理', () => {
  it('材料を1回だけ消費し、厨房の上限を超えない', () => {
    const s = newGame(1);
    s.ingredients.smallFish = [0, 0, 50];
    const made = cook(s, 'grilledFish', 999);
    expect(made).toBe(kitchenCap(s));
    expect(sum(s.ingredients.smallFish)).toBe(50 - made);
    expect(sum(s.dishes.grilledFish)).toBe(made);
    expect(cook(s, 'grilledFish', 1)).toBe(0);
  });

  it('品質は材料の平均で決まり、良い材料から使う', () => {
    const s = newGame(1);
    s.ingredients.smallFish = [0, 0, 1];
    s.ingredients.smallMeat = [1, 0, 0];
    cook(s, 'hunterPlate', 1);
    expect(s.dishes.hunterPlate).toEqual([0, 1, 0]);
  });

  it('材料が足りなければ作れない', () => {
    const s = newGame(1);
    expect(cookableCount(s, 'feast')).toBe(0);
    expect(cook(s, 'feast', 1)).toBe(0);
  });

  it('メニューの品数は看板レベルの枠を超えない', () => {
    const s = newGame(1);
    for (const id of RECIPE_ORDER) toggleMenu(s, id);
    expect(s.menu.length).toBe(menuSlots(s));
  });
});

describe('営業', () => {
  it('販売数は在庫・席・来客数を超えず、在庫だけが減る', () => {
    const s = newGame(7);
    s.ingredients.smallFish = [0, 0, 30];
    cook(s, 'grilledFish', 30);
    s.menu = ['grilledFish'];
    const before = sum(s.dishes.grilledFish);
    const ingBefore = sum(s.ingredients.smallFish);
    const r = openTavern(s, s.rev)!;
    expect(r.served).toBeLessThanOrEqual(before);
    expect(r.served).toBeLessThanOrEqual(r.capacity);
    expect(r.served).toBeLessThanOrEqual(r.visitors);
    expect(sum(s.dishes.grilledFish)).toBe(before - r.served);
    expect(sum(s.ingredients.smallFish)).toBe(ingBefore);
    expect(s.cash).toBe(RUN.startCash + r.revenue);
    allNonNegative(s);
  });

  it('メニューが空なら客は来ない', () => {
    const s = newGame(7);
    const r = openTavern(s, s.rev)!;
    expect(r.visitors).toBe(0);
    expect(r.revenue).toBe(0);
  });

  it('高品質の料理ほど売上が高い', () => {
    const run = (q: 0 | 2) => {
      const s = newGame(3);
      s.dishes.grilledFish[q] = 5;
      s.menu = ['grilledFish'];
      return openTavern(s, s.rev)!;
    };
    const low = run(0);
    const high = run(2);
    expect(high.served).toBe(low.served);
    expect(high.revenue).toBeGreaterThan(low.revenue);
    expect(high.qualityBonus).toBeGreaterThan(0);
  });

  it('客席を増やすと受け入れ人数が増える', () => {
    const s = newGame(3);
    s.cash = 1000;
    const before = EFFECTS.seats[0];
    buyUpgrade(s, 'seats', s.rev);
    expect(EFFECTS.seats[s.levels.seats]).toBeGreaterThan(before);
  });

  it('開店を二重に押しても1晩しか進まない', () => {
    const s = newGame(3);
    const rev = s.rev;
    expect(openTavern(s, rev)).not.toBeNull();
    expect(openTavern(s, rev)).toBeNull();
    expect(s.day).toBe(2);
  });

  it('最終日の営業で一周が終わる', () => {
    const s = newGame(3);
    for (let d = 0; d < RUN.days; d++) openTavern(s, s.rev);
    expect(s.phase).toBe('ended');
    expect(s.nights.length).toBe(RUN.days);
    expect(openTavern(s, s.rev)).toBeNull();
  });
});

describe('設備', () => {
  it('所持金が足りなければ買えず、負にならない', () => {
    const s = newGame(1);
    s.cash = 10;
    expect(buyUpgrade(s, 'seats', s.rev)).toBe(false);
    expect(s.cash).toBe(10);
  });

  it('最大レベルを超えて買えない', () => {
    const s = newGame(1);
    s.cash = 100000;
    for (let i = 0; i < 10; i++) buyUpgrade(s, 'kitchen', s.rev);
    expect(s.levels.kitchen).toBe(UPGRADES.kitchen.costs.length);
  });
});

describe('スコア', () => {
  it('所持金＋設備評価額（購入額の一部）＋評判で計算し、売上累計は足さない', () => {
    const s = newGame(1);
    s.cash = 500;
    s.totalSales = 9999;
    s.spentOnUpgrades = 400;
    s.reputation = 20;
    const sc = computeScore(s);
    expect(sc.total).toBe(500 + 400 * SCORE.upgradeValueRate + 20 * SCORE.perReputation);
  });

  it('最終日に設備を買うとスコアは下がる（無条件に得にならない）', () => {
    const s = newGame(1);
    s.cash = 1000;
    const before = computeScore(s).total;
    buyUpgrade(s, 'seats', s.rev);
    expect(computeScore(s).total).toBeLessThan(before);
  });
});

describe('保存と再開', () => {
  it('保存した状態をそのまま復元できる', () => {
    const mem = new Map<string, string>();
    const store = new SaveStore({
      getItem: (k) => mem.get(k) ?? null,
      setItem: (k, v) => void mem.set(k, v),
      removeItem: (k) => void mem.delete(k),
    });
    const s = simulateRun(42, { kps: 4, missRate: 0.05 });
    store.saveRun(s, 123);
    const loaded = store.loadRun()!;
    expect(loaded.state).toEqual(s);
    expect(loaded.playSeconds).toBe(123);
  });

  it('壊れた保存データは無視する', () => {
    const store = new SaveStore({ getItem: () => '{broken', setItem: () => {}, removeItem: () => {} });
    expect(store.loadRun()).toBeNull();
  });

  it('保存領域が使えなくても落ちない', () => {
    const store = new SaveStore({
      getItem: () => { throw new Error('denied'); },
      setItem: () => { throw new Error('denied'); },
      removeItem: () => { throw new Error('denied'); },
    });
    expect(() => store.saveRun(newGame(1), 0)).not.toThrow();
    expect(store.loadRun()).toBeNull();
    expect(store.loadSettings().bgmVolume).toBeGreaterThan(0);
  });

  it('再挑戦（newGame）で状態が初期化される', () => {
    const played = simulateRun(5, { kps: 4, missRate: 0.05 });
    const fresh = newGame(5);
    expect(fresh.day).toBe(1);
    expect(fresh.cash).toBe(RUN.startCash);
    expect(fresh.hauls).toEqual([]);
    expect(fresh.levels).toEqual({ seats: 0, kitchen: 0, sign: 0 });
    expect(played.phase).toBe('ended');
  });
});

describe('一周を通した整合性', () => {
  it.each([1, 2, 3, 4, 5])('シード %i で所持金・在庫が負にならない', (seed) => {
    const s = simulateRun(seed, { kps: 4, missRate: 0.06 });
    allNonNegative(s);
    expect(s.phase).toBe('ended');
    const revenue = s.nights.reduce((a, n) => a + n.revenue, 0);
    expect(s.cash).toBe(RUN.startCash + revenue - s.spentOnUpgrades);
  });
});
