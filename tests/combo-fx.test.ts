import { describe, expect, it } from 'vitest';
import { comboFx } from '../src/ui/comboFx';

describe('指定された６段階の継続演出', () => {
  it.each([[6, 8], [9, 11], [12, 14], [15, 17], [18, 19], [20, 24]])('%i〜%iは毎回同じ段階を維持する', (start, end) => {
    const fx = comboFx(start);
    for (let count = start + 1; count <= end; count++) expect(comboFx(count)).toEqual(fx);
    const previous = comboFx(start - 1);
    expect(fx.level).toBeGreaterThan(previous.level);
    expect(fx.particles).toBeGreaterThan(previous.particles);
    expect(fx.rays).toBeGreaterThan(previous.rays);
    expect(fx.notes.length).toBeGreaterThan(previous.notes.length);
    expect(fx.color).not.toBe(previous.color);
  });
  it('20以降は最上位を維持し、長いコンボでも負荷を増やし続けない', () => {
    expect(comboFx(10000)).toEqual(comboFx(20));
    expect(comboFx(20).particles).toBeLessThanOrEqual(160);
    expect(comboFx(20).notes).toHaveLength(9);
  });
});
