import { describe, expect, it } from 'vitest';
import { FishingModel } from '../src/core/fishing';
import { HuntingModel } from '../src/core/hunting';
import { Rng } from '../src/core/rng';
import { runActivityBot } from './bot';
import { FISHING } from '../src/core/config';

const total = (r: { catches: { count: number; ingredient: string }[] }, id?: string) =>
  r.catches.filter((c) => !id || c.ingredient === id).reduce((a, c) => a + c.count, 0);

const avgQuality = (r: { catches: { count: number; quality: number }[] }) => {
  const n = r.catches.reduce((a, c) => a + c.count, 0);
  return n ? r.catches.reduce((a, c) => a + c.quality * c.count, 0) / n : 0;
};

describe('釣り', () => {
  it('速く打つほど多く釣れる', () => {
    const slow = runActivityBot(new FishingModel(new Rng(1)), { kps: 2, missRate: 0.03 }, new Rng(9));
    const fast = runActivityBot(new FishingModel(new Rng(1)), { kps: 6, missRate: 0.03 }, new Rng(9));
    expect(total(fast)).toBeGreaterThan(total(slow));
  });

  it('正確に打つと品質が上がり、大物が掛かる', () => {
    const sloppy = runActivityBot(new FishingModel(new Rng(2)), { kps: 4, missRate: 0.15 }, new Rng(9));
    const clean = runActivityBot(new FishingModel(new Rng(2)), { kps: 4, missRate: 0 }, new Rng(9));
    expect(avgQuality(clean)).toBeGreaterThan(avgQuality(sloppy));
    expect(total(clean, 'bigFish')).toBeGreaterThan(0);
  });

  it('ミスなしで規定数の語句を打つと大物が掛かる', () => {
    const m = new FishingModel(new Rng(3));
    for (let i = 0; i < FISHING.calmToBig; i++) {
      while (m.phase !== 'hooked') m.update(0.05);
      expect(m.fish!.big).toBe(false);
      while (m.phase === 'hooked') m.key(m.matcher!.remaining[0]);
    }
    while (m.phase !== 'hooked') m.update(0.05);
    expect(m.fish!.big).toBe(true);
  });

  it('時間切れで終了し、それ以降は入力を受け付けない', () => {
    const m = new FishingModel(new Rng(4));
    for (let t = 0; t < FISHING.duration + 1; t += 0.1) m.update(0.1);
    expect(m.finished).toBe(true);
    m.key('a');
    expect(m.result().correctKeys + m.result().missKeys).toBe(0);
  });

  it('誤入力は進行させない', () => {
    const m = new FishingModel(new Rng(5));
    while (m.phase !== 'hooked') m.update(0.05);
    const pos = m.matcher!.kanaPos;
    m.key('q');
    m.key('q');
    expect(m.matcher!.kanaPos).toBe(pos);
    expect(m.result().missKeys).toBe(2);
  });
});

describe('狩り', () => {
  it('速く打つほど多く仕留め、逃げられる数が減る', () => {
    const slow = runActivityBot(new HuntingModel(new Rng(1)), { kps: 2, missRate: 0.03 }, new Rng(9));
    const fast = runActivityBot(new HuntingModel(new Rng(1)), { kps: 6, missRate: 0.03 }, new Rng(9));
    expect(total(fast)).toBeGreaterThan(total(slow));
    expect(fast.escapes).toBeLessThan(slow.escapes);
  });

  it('最初の1文字で狙いが決まり、画面上の獲物どうしは最初の文字がかぶらない', () => {
    const m = new HuntingModel(new Rng(7));
    for (let t = 0; t < 6; t += 0.05) m.update(0.05);
    expect(m.prey.length).toBeGreaterThan(1);
    const firsts = m.prey.map((p) => p.matcher.remaining[0]);
    expect(new Set(firsts).size).toBe(firsts.length);
    const target = m.prey[m.prey.length - 1];
    m.key(target.matcher.remaining[0]);
    expect(m.lockId).toBe(target.id);
  });

  it('ミスすると獲物の足が速くなる', () => {
    const m = new HuntingModel(new Rng(8));
    while (m.prey.length === 0) m.update(0.05);
    const p = m.prey[0];
    m.key(p.matcher.remaining[0]);
    m.key('q');
    expect(p.speedMult).toBeGreaterThan(1);
  });

  it('Backspace で狙いを外せる', () => {
    const m = new HuntingModel(new Rng(8));
    while (m.prey.length === 0) m.update(0.05);
    m.key(m.prey[0].matcher.remaining[0]);
    expect(m.lockId).not.toBeNull();
    m.control('release');
    expect(m.lockId).toBeNull();
    expect(m.prey[0].matcher.kanaPos).toBe(0);
  });

  it('釣りと狩りで得られる食材が違う', () => {
    const f = runActivityBot(new FishingModel(new Rng(1)), { kps: 4, missRate: 0.03 }, new Rng(9));
    const h = runActivityBot(new HuntingModel(new Rng(1)), { kps: 4, missRate: 0.03 }, new Rng(9));
    expect(f.catches.every((c) => c.ingredient.endsWith('Fish'))).toBe(true);
    expect(h.catches.every((c) => c.ingredient.endsWith('Meat'))).toBe(true);
  });
});
