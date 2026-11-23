// 繁盛記：1皿の倍率の掛け算と上限
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { descOf } from '../src/core/build';
import { MULT_CAP, PREVIEW_GOLD, PREVIEW_SILVER, previewTier, priceOf } from '../src/core/dishPrice';

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

describe('札の予告', () => {
  it('予告の段階：×3未満はなし、×3から銀、×10から金', () => {
    expect(PREVIEW_SILVER).toBe(3);
    expect(PREVIEW_GOLD).toBe(10);
    expect([2.99, 3, 9.99, 10, 30].map(previewTier)).toEqual(['none', 'silver', 'silver', 'gold', 'gold']);
  });
});

describe('説明文は新しい決まり（掛け算・かけ合わせは発見だけ）と合う', () => {
  it('かけ合わせ・型で売上が増える・足される、と言う文が残っていない', () => {
    const src = ['src/ui/hover.ts', 'src/ui/screens/help.ts', 'src/ui/runMode.ts'].map((p) => readFileSync(p, 'utf8')).join('\n');
    for (const old of ['そのぶん足される', '「型」で売上が大きく増える', 'かけ合わせの2つを最大まで育てると伸びる']) expect(src).not.toContain(old);
  });
  it('まとめ出しの効果の文は、入れ替えの画面に収まる長さ（前と同じ50字以内）', () => {
    for (const lv of [1, 2, 3]) expect([...descOf('matome', lv)].length).toBeLessThanOrEqual(50);
  });
});

describe('第2段の片付け', () => {
  it('上限の判定は小数の誤差で止まった扱いにしない', () => {
    expect(priceOf(100, [{ id: 'combo', mult: 3 }, { id: 'ippatsu', mult: 10.000000000000002 }]).capped).toBe(false);
  });
  it('説明文の上限の数字は MULT_CAP から作る', () => {
    const src = readFileSync('src/ui/runMode.ts', 'utf8');
    expect(src).not.toContain('×30まで');
    expect(src).toContain('MULT_CAP');
  });
});
