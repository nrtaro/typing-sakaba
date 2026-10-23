import { describe, expect, it } from 'vitest';
import {
  FISHING_PHRASES, FishingGame, GATHER_BAD, GATHER_GOOD, GatheringGame, HUNTING_WORDS, HuntingGame, TRADE_PHRASES, TradingGame,
  type Minigame,
} from '../src/core/minigames';
import { Rng } from '../src/core/rng';
import { defaultRomaji, RomajiMatcher } from '../src/core/romaji';
import { DISHES, TRIPS } from '../src/core/shopConfig';

/** 候補のうち最初のものを打ち続けるボット（filter でどれを打つか選べる） */
function play(g: Minigame<unknown>, kps: number, missEvery = 0, pick?: (ids: string[]) => string | undefined) {
  let acc = 0;
  let n = 0;
  while (!g.finished) {
    g.update(1 / 60);
    acc += kps / 60;
    while (acc >= 1 && !g.finished) {
      acc -= 1;
      const live = g.input.active;
      let rest: string | undefined;
      if (live.length) rest = live[0].matcher.remaining;
      else {
        const ts = g.targets();
        const id = pick ? pick(ts.map((t) => t.id)) : ts[0]?.id;
        const t = ts.find((x) => x.id === id);
        rest = t ? new RomajiMatcher(t.kana).remaining : undefined;
      }
      if (!rest) break;
      n++;
      g.key(missEvery && n % missEvery === 0 ? 'q' : rest[0]);
    }
  }
  return g.result();
}

describe('調達ミニゲーム', () => {
  it('どれも約10秒で終わる', () => {
    for (const G of [FishingGame, HuntingGame, GatheringGame, TradingGame]) {
      const g = new G(new Rng(1));
      for (let i = 0; i < 60 * 11; i++) g.update(1 / 60);
      expect(g.finished).toBe(true);
    }
  });

  it('釣り：速く正確に打つほど多く釣れ、ミスなしが続くと大物が掛かる', () => {
    const slow = play(new FishingGame(new Rng(2)), 2.5);
    const fast = play(new FishingGame(new Rng(2)), 7);
    expect(fast.gains.fish ?? 0).toBeGreaterThan(slow.gains.fish ?? 0);
    const g = new FishingGame(new Rng(3));
    let sawBig = false;
    while (!g.finished) {
      g.update(1 / 60);
      if (g.big) sawBig = true;
      const first = g.targets()[0];
      const l = g.input.active[0]?.matcher.remaining ?? (first ? new RomajiMatcher(first.kana).remaining : undefined);
      if (l) g.key(l[0]);
    }
    expect(sawBig).toBe(true);
  });

  it('狩り：速く打つほど多く仕留める', () => {
    const slow = play(new HuntingGame(new Rng(4)), 2.5);
    const fast = play(new HuntingGame(new Rng(4)), 7);
    expect(fast.gains.meat ?? 0).toBeGreaterThan(slow.gains.meat ?? 0);
  });

  it('採取：1回で2つ摘め、毒きのこを打つとかごから2つこぼれる', () => {
    const g = new GatheringGame(new Rng(5));
    g.sprouts = [
      { id: 'a', word: GATHER_GOOD[0], ing: 'veg', slot: 0, life: 5, maxLife: 5 },
      { id: 'b', word: GATHER_BAD[0], ing: null, slot: 1, life: 5, maxLife: 5 },
    ];
    for (const c of defaultRomaji(GATHER_GOOD[0].kana)) g.key(c);
    expect(g.gains.veg).toBe(2);
    for (const c of defaultRomaji(GATHER_BAD[0].kana)) g.key(c);
    expect(g.gains.veg).toBe(0);
  });

  it('採取：食べられるものだけ打つ方が毒も打つより多く集まる', () => {
    const goodIds = (g: GatheringGame) => (ids: string[]) => ids.find((id) => g.sprouts.find((s) => s.id === id)?.ing);
    const careful = new GatheringGame(new Rng(6));
    const r1 = play(careful, 5, 0, goodIds(careful));
    const careless = new GatheringGame(new Rng(6));
    const r2 = play(careless, 5);
    const total = (r: typeof r1) => (r.gains.veg ?? 0) + (r.gains.mush ?? 0);
    expect(total(r1)).toBeGreaterThanOrEqual(total(r2));
    expect(total(r1)).toBeGreaterThan(0);
  });

  it('仕入れ：ミスなしで打つとおまけが付く', () => {
    const clean = play(new TradingGame(new Rng(7)), 5);
    const sloppy = play(new TradingGame(new Rng(7)), 5, 4);
    const total = (r: typeof clean) => (r.gains.ale ?? 0) + (r.gains.spice ?? 0);
    expect(total(clean)).toBeGreaterThan(total(sloppy));
  });
});

describe('出題データ', () => {
  const all = [
    ...FISHING_PHRASES, ...HUNTING_WORDS, ...GATHER_GOOD, ...GATHER_BAD, ...TRADE_PHRASES,
    ...DISHES.map((d) => ({ text: d.text, kana: d.kana })), ...TRIPS.map((t) => ({ text: t.text, kana: t.kana })),
    { text: 'はじめる', kana: 'はじめる' }, { text: 'あそびかた', kana: 'あそびかた' }, { text: 'もどる', kana: 'もどる' },
    { text: 'もういちど', kana: 'もういちど' }, { text: 'たいとる', kana: 'たいとる' }, { text: 'おと', kana: 'おと' },
  ];
  it.each(all.map((w) => [w.text, w.kana]))('%s（%s）はおすすめ綴りで打ち切れる', (_t, kana) => {
    const m = new RomajiMatcher(kana);
    for (const c of defaultRomaji(kana)) expect(m.input(c)).not.toBe('miss');
    expect(m.done).toBe(true);
  });

  it('料理と調達の言葉は、ある言葉が別の言葉の先頭部分になっていない', () => {
    const words = [...DISHES.map((d) => defaultRomaji(d.kana)), ...TRIPS.map((t) => defaultRomaji(t.kana))];
    for (const a of words) for (const b of words) if (a !== b) expect(b.startsWith(a)).toBe(false);
  });
});
