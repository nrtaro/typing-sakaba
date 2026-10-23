import { describe, expect, it } from 'vitest';
import {
  ALE_GOODS, FISHING, FishingGame, GATHER, GATHER_BAD, GATHER_GOOD, GatheringGame, HOOK_WORDS, HUNTING, HUNTING_WORDS, HuntingGame,
  REEL_WORDS, SPICE_GOODS, TradingGame, type Minigame,
} from '../src/core/minigames';
import { Rng } from '../src/core/rng';
import { defaultRomaji, RomajiMatcher } from '../src/core/romaji';
import { DISHES, TRIPS } from '../src/core/shopConfig';

/** 候補を打ち続けるボット。pick で打つ候補を選べる。missEvery 打鍵ごとに1回ミス */
export function play(g: Minigame<unknown>, kps: number, missEvery = 0, pick?: (ids: string[]) => string | undefined) {
  let acc = 0;
  let n = 0;
  let guard = 0;
  while (!g.finished && guard++ < 60 * 30) {
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
  it('狩り・採取・仕入れは10秒で終わる', () => {
    for (const G of [HuntingGame, GatheringGame, TradingGame]) {
      const g = new G(new Rng(1));
      for (let i = 0; i < 60 * 11; i++) g.update(1 / 60);
      expect(g.finished).toBe(true);
    }
  });

  it('釣り：あわせを打てば掛かり、遅れると逃げる', () => {
    const g = new FishingGame(new Rng(2));
    while (g.phase !== 'hook') g.update(1 / 60);
    for (let t = 0; t < FISHING.hookWindow + 0.1; t += 1 / 60) g.update(1 / 60);
    expect(g.phase).toBe('lost');
    while (g.phase !== 'hook') g.update(1 / 60);
    for (const c of defaultRomaji(g.word!.kana)) g.key(c);
    expect(g.phase).toBe('reel');
  });

  it('釣り：2匹目は必ず大物で、語句3つで釣り上げる', () => {
    const g = new FishingGame(new Rng(3));
    const land = () => {
      while (g.phase !== 'hook') g.update(1 / 60);
      while (g.phase === 'hook' || g.phase === 'reel') g.key(g.input.active[0]?.matcher.remaining[0] ?? new RomajiMatcher(g.word!.kana).remaining[0]);
    };
    land();
    expect(g.gains.fish).toBe(FISHING.smallYield);
    while (g.phase !== 'hook') g.update(1 / 60);
    expect(g.big).toBe(true);
    land();
    expect(g.gains.fish).toBe(FISHING.smallYield + FISHING.bigYield);
  });

  it('釣り：巻き上げ中に3回ミスすると糸が切れる', () => {
    const g = new FishingGame(new Rng(4));
    while (g.phase !== 'hook') g.update(1 / 60);
    for (const c of defaultRomaji(g.word!.kana)) g.key(c);
    for (let i = 0; i < FISHING.breakAt; i++) g.key('q');
    expect(g.phase).toBe('lost');
    expect(g.gains.fish ?? 0).toBe(0);
  });

  it('釣り：大物と勝負中は時間切れでも延長され、最大5秒で終わる', () => {
    const g = new FishingGame(new Rng(5));
    g.fishIndex = 1;
    while (g.phase !== 'hook') g.update(1 / 60);
    for (const c of defaultRomaji(g.word!.kana)) g.key(c);
    g.timeLeft = 0.01;
    g.update(0.05);
    expect(g.finished).toBe(false);
    for (let t = 0; t < FISHING.overtimeMax + 0.5; t += 0.05) g.update(0.05);
    expect(g.finished).toBe(true);
  });

  it('釣り：遅めの人（2.5打鍵/秒）でも大物まで体験できる', () => {
    for (const seed of [1, 2, 3, 4, 5]) {
      const g = new FishingGame(new Rng(seed));
      let sawBig = false;
      let acc = 0;
      let guard = 0;
      while (!g.finished && guard++ < 60 * 30) {
        g.update(1 / 60);
        if (g.big && g.phase === 'reel') sawBig = true;
        acc += 2.5 / 60;
        while (acc >= 1) {
          acc -= 1;
          const t = g.targets()[0];
          if (!t) break;
          g.key(g.input.active[0]?.matcher.remaining[0] ?? new RomajiMatcher(t.kana).remaining[0]);
        }
      }
      expect(sawBig).toBe(true);
    }
  });

  it('釣り：速く打つほど多く釣れる', () => {
    const slow = play(new FishingGame(new Rng(6)), 2.5);
    const fast = play(new FishingGame(new Rng(6)), 7);
    expect(fast.gains.fish ?? 0).toBeGreaterThan(slow.gains.fish ?? 0);
  });

  it('狩り：速く打つほど多く仕留め、大物は12個', () => {
    const slow = play(new HuntingGame(new Rng(7)), 2.5);
    const fast = play(new HuntingGame(new Rng(7)), 7);
    expect(fast.gains.meat ?? 0).toBeGreaterThan(slow.gains.meat ?? 0);
    expect(HUNTING.deer.yield).toBe(12);
  });

  it('狩り：同じ通り道で獲物が詰まらない（文字が重ならない）', () => {
    const g = new HuntingGame(new Rng(8));
    for (let i = 0; i < 60 * 10; i++) {
      g.update(1 / 60);
      for (const a of g.prey) for (const b of g.prey) {
        if (a !== b && a.lane === b.lane) expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.2);
      }
    }
  });

  it('採取：1回で4つ摘め、毒きのこを打つとかごから2つこぼれる', () => {
    const g = new GatheringGame(new Rng(9));
    g.sprouts = [
      { id: 'a', word: GATHER_GOOD[0], ing: 'veg', slot: 0, life: 5, maxLife: 5 },
      { id: 'b', word: GATHER_BAD[0], ing: null, slot: 1, life: 5, maxLife: 5 },
    ];
    for (const c of defaultRomaji(GATHER_GOOD[0].kana)) g.key(c);
    expect(g.gains.veg).toBe(GATHER.perPick);
    for (const c of defaultRomaji(GATHER_BAD[0].kana)) g.key(c);
    expect(g.gains.veg).toBe(GATHER.perPick - GATHER.poisonLoss);
  });

  it('仕入れ：ライバルより先に打てば落札、遅いと取られる', () => {
    const fast = new TradingGame(new Rng(10));
    for (const c of defaultRomaji(fast.lot.word.kana)) fast.key(c);
    expect(fast.wins).toBe(1);
    const slow = new TradingGame(new Rng(10));
    for (let i = 0; i < 60 * 8; i++) slow.update(1 / 60);
    expect(slow.losses).toBeGreaterThan(0);
    expect(slow.wins).toBe(0);
  });

  it('仕入れ：速く正確なほど多く手に入る', () => {
    const total = (r: { gains: Record<string, number | undefined> }) => (r.gains.ale ?? 0) + (r.gains.spice ?? 0);
    const slow = play(new TradingGame(new Rng(11)), 2.5);
    const fast = play(new TradingGame(new Rng(11)), 6);
    const sloppy = play(new TradingGame(new Rng(11)), 6, 4);
    expect(total(fast)).toBeGreaterThan(total(slow));
    expect(total(fast)).toBeGreaterThan(total(sloppy));
  });
});

describe('出題データ', () => {
  const all = [
    ...HOOK_WORDS, ...REEL_WORDS, ...HUNTING_WORDS, ...GATHER_GOOD, ...GATHER_BAD, ...ALE_GOODS, ...SPICE_GOODS,
    ...DISHES.map((d) => ({ text: d.text, kana: d.kana })), ...TRIPS.map((t) => ({ text: t.text, kana: t.kana })),
    ...['はじめる', 'あそびかた', 'もどる', 'もういちど', 'たいとる', 'おと', 'さいかい', 'やめる', 'ぜんがめん'].map((k) => ({ text: k, kana: k })),
  ];

  it.each(all.map((w) => [w.text, w.kana]))('%s（%s）はおすすめ綴りで打ち切れる', (_t, kana) => {
    const m = new RomajiMatcher(kana);
    for (const c of defaultRomaji(kana)) expect(m.input(c)).not.toBe('miss');
    expect(m.done).toBe(true);
  });

  /** 表示がかなだけの語は、表示と読みが一致する（カタカナはひらがなに直して比べる） */
  it('かなだけで書いた表示は読みと一致する', () => {
    const toHira = (s: string) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60)).replace(/！/g, '');
    for (const w of all) {
      if (/^[ぁ-ゖァ-ヶー！]+$/.test(w.text)) expect(toHira(w.text)).toBe(w.kana);
    }
  });

  it('料理と調達の言葉は、ある言葉が別の言葉の先頭部分になっていない', () => {
    const words = [...DISHES.map((d) => defaultRomaji(d.kana)), ...TRIPS.map((t) => defaultRomaji(t.kana))];
    for (const a of words) for (const b of words) if (a !== b) expect(b.startsWith(a)).toBe(false);
  });

  it('単語数が十分にある', () => {
    expect(DISHES.length).toBeGreaterThanOrEqual(16);
    expect(REEL_WORDS.length).toBeGreaterThanOrEqual(30);
    expect(HUNTING_WORDS.length).toBeGreaterThanOrEqual(50);
    expect(GATHER_GOOD.length).toBeGreaterThanOrEqual(20);
    expect(ALE_GOODS.length + SPICE_GOODS.length).toBeGreaterThanOrEqual(30);
  });
});
