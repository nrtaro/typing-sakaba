import { describe, expect, it } from 'vitest';
import { comboFx } from '../src/ui/comboFx';

describe('５コンボごとの継続演出', () => {
  it('10・15・20・25で上がり、その間の毎回も同じ豪華さを保つ', () => {
    expect(comboFx(9).level).toBe(0);
    for (const start of [10, 15, 20, 25, 30]) {
      const fx = comboFx(start);
      for (let count = start + 1; count < start + 5; count++) expect(comboFx(count)).toEqual(fx);
      const previous = comboFx(start - 1);
      expect(fx.level).toBeGreaterThan(previous.level);
      expect(fx.particles).toBeGreaterThan(previous.particles);
      expect(fx.notes.length).toBeGreaterThan(previous.notes.length);
    }
  });
  it('非常に長く続いても描画・音の負荷を上限内に収める', () => {
    const fx = comboFx(10000);
    expect(fx.particles).toBeLessThanOrEqual(160);
    expect(fx.rays).toBeLessThanOrEqual(12);
    expect(fx.notes).toHaveLength(9);
  });
});
