import type { Rng } from './rng';
import { DISHES, INGREDIENT_ORDER, SHOP, TRIPS, type IngredientId } from './shopConfig';

/** 毎回同じ総量を、序盤に作れない料理が出ない範囲で配分する。 */
export function startingStock(rng: Rng): Record<IngredientId, number> {
  const route = rng.pick(TRIPS);
  // 酒は朝から必要。香辛料だけ不足させても、最初の調達選びにつながらない。
  const scarce = route.id === 'trading' ? 'ale' : rng.pick(route.gives);
  const stock = { ...SHOP.startStock };
  // 不足役以外には朝の料理２皿分を残し、複数の食材が同時に枯れないようにする。
  const floors = Object.fromEntries(INGREDIENT_ORDER.map(id => [id,
    id === scarce ? SHOP.startStockRange[id][0] : Math.max(SHOP.startStockRange[id][0],
      ...DISHES.filter(d => d.from === 0).map(d => (d.need[id] ?? 0) * 2)),
  ])) as Record<IngredientId, number>;
  for (const id of INGREDIENT_ORDER) {
    const [min, max] = SHOP.startStockRange[id];
    stock[id] = id === scarce ? rng.int(min, Math.min(min + 1, max))
      : Math.max(floors[id], Math.min(max, stock[id] + rng.int(-1, 1)));
  }
  const budget = Object.values(SHOP.startStock).reduce((sum, n) => sum + n, 0);
  let remaining = budget - Object.values(stock).reduce((sum, n) => sum + n, 0);
  while (remaining !== 0) {
    const step = Math.sign(remaining);
    const candidates = INGREDIENT_ORDER.filter(id => id !== scarce
      && (step > 0 ? stock[id] < SHOP.startStockRange[id][1] : stock[id] > floors[id]));
    if (!candidates.length) throw new Error('初期在庫の合計と上下限が一致しません');
    stock[rng.pick(candidates)] += step;
    remaining -= step;
  }
  return stock;
}
