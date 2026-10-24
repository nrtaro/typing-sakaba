import { describe, expect, it } from 'vitest';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DISHES, INGREDIENT_ORDER, SHOP } from '../src/core/shopConfig';

describe('開店時の素材配分', () => {
  it('1000シードで総量・上下限・朝の全料理を作れる最低量を守る', () => {
    const budget = Object.values(SHOP.startStock).reduce((sum, n) => sum + n, 0);
    const reference = { ...SHOP.startStock };
    for (let seed = 0; seed < 1000; seed++) {
      const shop = new Shop(new Rng(seed));
      expect(Object.values(shop.stock).reduce((sum, n) => sum + n, 0)).toBe(budget);
      for (const id of INGREDIENT_ORDER) {
        expect(Number.isInteger(shop.stock[id])).toBe(true);
        expect(shop.stock[id]).toBeGreaterThanOrEqual(SHOP.startStockRange[id][0]);
        expect(shop.stock[id]).toBeLessThanOrEqual(SHOP.startStockRange[id][1]);
      }
      for (const dish of DISHES.filter(d => d.from === 0)) expect(shop.canMake(dish)).toEqual([]);
      const tight = (['fish', 'meat', 'veg', 'mush'] as const).filter(id => shop.stock[id] <= 3);
      expect(tight.length).toBeLessThanOrEqual(1);
      expect(tight.length > 0 || shop.stock.ale <= 3).toBe(true);
      const morningServings = DISHES.filter(d => d.from === 0).reduce((sum, dish) => {
        const [[id, amount]] = Object.entries(dish.need);
        return sum + Math.floor(shop.stock[id as keyof typeof shop.stock] / amount!);
      }, 0);
      expect(morningServings).toBeGreaterThanOrEqual(12);
      expect(morningServings).toBeLessThanOrEqual(18);
    }
    expect(SHOP.startStock).toEqual(reference);
  });
  it('同じシードで再現でき、異なるシードでは不足側と全素材の量が変わる', () => {
    const signatures = new Set<string>();
    const varieties = Object.fromEntries(INGREDIENT_ORDER.map(id => [id, new Set<number>()]));
    const routes = new Set<string>();
    for (let seed = 0; seed < 200; seed++) {
      const a = new Shop(new Rng(seed)), b = new Shop(new Rng(seed));
      expect(a.stock).toEqual(b.stock);
      signatures.add(JSON.stringify(a.stock));
      for (const id of INGREDIENT_ORDER) varieties[id].add(a.stock[id]);
      if (a.stock.fish <= 3) routes.add('fishing');
      if (a.stock.meat <= 3) routes.add('hunting');
      if (a.stock.veg <= 3 || a.stock.mush <= 3) routes.add('gathering');
      if (a.stock.ale <= 3) routes.add('trading');
    }
    expect(signatures.size).toBeGreaterThan(100);
    for (const id of INGREDIENT_ORDER) expect(varieties[id].size).toBeGreaterThan(1);
    expect(routes.size).toBe(4);
  });
});
