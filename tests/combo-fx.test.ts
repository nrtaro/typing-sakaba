import { describe, expect, it } from 'vitest';
import { COMBO_MAX, comboFx } from '../src/ui/comboFx';

/** 掛け声は節目だけに出るので、強さの比較からは外す */
const strength = (count: number) => {
  const { callout: _c, ...rest } = comboFx(count);
  return rest;
};

describe('コンボ演出の段階', () => {
  it('1〜3 は同じ演出', () => {
    expect(strength(2)).toEqual(strength(1));
    expect(strength(3)).toEqual(strength(1));
  });

  it('4〜6 は同じで、1〜3 より少し豪華', () => {
    expect(strength(5)).toEqual(strength(4));
    expect(strength(6)).toEqual(strength(4));
    expect(comboFx(4).particles).toBeGreaterThan(comboFx(3).particles);
    expect(comboFx(4).rays).toBeGreaterThan(comboFx(3).rays);
  });

  it('7 から 15 までは毎回強くなる', () => {
    for (let n = 7; n <= COMBO_MAX; n++) {
      const a = comboFx(n - 1), b = comboFx(n);
      expect(b.level).toBeGreaterThan(a.level);
      expect(b.particles).toBeGreaterThan(a.particles);
      expect(b.numberSize).toBeGreaterThan(a.numberSize);
      expect(b.notes.length).toBeGreaterThanOrEqual(a.notes.length);
      expect(b.flash).toBeGreaterThan(a.flash);
      expect(b.color).not.toBe(a.color);
    }
    expect(comboFx(COMBO_MAX).max).toBe(true);
    expect(comboFx(COMBO_MAX - 1).max).toBe(false);
  });

  it('15 以降は最大を維持し、粒の数は増やし続けない', () => {
    expect(strength(16)).toEqual(strength(COMBO_MAX));
    expect(strength(1000)).toEqual(strength(COMBO_MAX));
    expect(comboFx(1000).particles).toBeLessThanOrEqual(160);
  });

  it('節目で掛け声が出る', () => {
    expect(comboFx(7).callout).toBe('GREAT!');
    expect(comboFx(COMBO_MAX).callout).toBe('FEVER!!');
    expect(comboFx(8).callout).toBeNull();
  });
});
