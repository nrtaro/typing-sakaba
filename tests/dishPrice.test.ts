// 繁盛記：1皿の倍率の掛け算と上限
import { describe, expect, it } from 'vitest';
import { MULT_CAP, priceOf } from '../src/core/dishPrice';

describe('1皿の倍率', () => {
  it('倍率はぜんぶ掛け算で、×30 で止まる。ちょうど×30 は止まった扱いにしない', () => {
    expect(MULT_CAP).toBe(30);
    expect(priceOf(100, [{ id: 'combo', mult: 2 }, { id: 'ippatsu', mult: 1.5 }])).toMatchObject({ raw: 3, paid: 3, capped: false, gain: 300 });
    expect(priceOf(100, [{ id: 'combo', mult: 3 }, { id: 'ippatsu', mult: 10 }])).toMatchObject({ raw: 30, paid: 30, capped: false, gain: 3000 });
    expect(priceOf(100, [{ id: 'combo', mult: 3.5 }, { id: 'ippatsu', mult: 10 }])).toMatchObject({ raw: 35, paid: 30, capped: true, gain: 3000 });
    expect(priceOf(80, [{ id: 'combo', mult: 1 }]).factors).toEqual([]);
  });

  it('1より小さい倍率（一発勝負のミスなど）も掛かる。金額は最後に1回だけ丸める', () => {
    const p = priceOf(101, [{ id: 'ippatsu', mult: 0.8 }, { id: 'combo', mult: 1.5 }]);
    expect(p.raw).toBeCloseTo(1.2);
    expect(p.gain).toBe(121);
  });
});
