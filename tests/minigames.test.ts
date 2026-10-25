import { procurementReward, rewardKeys } from '../src/core/procurementRewards';
import { describe, expect, it } from 'vitest';
import {
  ALE_GOODS, FISHING, FishingGame, GATHER, GATHER_BAD, GATHER_GOOD, GatheringGame, HOOK_WORDS, HUNTING, HUNTING_WORDS, HuntingGame,
  REEL_WORDS, SPICE_GOODS, TradingGame, type Minigame,
} from '../src/core/minigames';
import { Rng } from '../src/core/rng';
import { defaultRomaji, RomajiMatcher } from '../src/core/romaji';
import { DIFFICULTIES, DISHES, TRIPS } from '../src/core/shopConfig';

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
    for (let t = 0; t < g.hookWindow + 0.1; t += 1 / 60) g.update(1 / 60);
    expect(g.phase).toBe('lost');
    while (g.phase !== 'hook') g.update(1 / 60);
    for (const c of defaultRomaji(g.word!.kana)) g.key(c);
    expect(g.phase).toBe('reel');
  });

  it('釣り：2匹目は必ず大物で、語句3つで釣り上げる', () => {
    const g = new FishingGame(new Rng(3));
    const land = () => {
      while (g.phase !== 'hook') g.update(1 / 60);
      let keys = 0;
      while (g.phase === 'hook' || g.phase === 'reel') {
        keys += rewardKeys(g.word!.kana);
        for (const c of defaultRomaji(g.word!.kana)) g.key(c);
      }
      return procurementReward('fishing', keys, g.big, g.difficulty.id);
    };
    const small = land();
    expect(g.gains.fish).toBe(small);
    while (g.phase !== 'hook') g.update(1 / 60);
    expect(g.big).toBe(true);
    const big = land();
    expect(g.gains.fish).toBe(small + big);
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

  it('釣り：釣り上げ後、更新や演出待ちなしで次の魚を入力できる', () => {
    const g = new FishingGame(new Rng(3));
    while (g.phase !== 'hook') g.update(1 / 60);
    const word = () => { for (const c of defaultRomaji(g.word!.kana)) g.key(c); };
    word(); word();
    expect(g.phase).toBe('land');
    expect(g.targets()).toHaveLength(1);
    word();
    expect(g.phase).toBe('reel');
    expect(g.big).toBe(true);
    for (let i = 0; i < FISHING.bigWords; i++) word();
    expect(g.fishIndex).toBe(2);
    const before = g.gains.fish!;
    word(); word();
    expect(g.fishIndex).toBe(3);
    expect(g.gains.fish).toBeGreaterThan(before);
  });

  it('釣り：次の合図を入力途中でも、釣り上げ演出の終了で入力が消えない', () => {
    const g = new FishingGame(new Rng(12));
    while (g.phase !== 'hook') g.update(1 / 60);
    for (let i = 0; i < 2; i++) for (const c of defaultRomaji(g.word!.kana)) g.key(c);
    const next = defaultRomaji(g.word!.kana);
    g.key(next[0]);
    expect(g.input.typed).toBe(next[0]);
    g.update(0.1);
    expect(g.phase).toBe('hook');
    expect(g.input.typed).toBe(next[0]);
    for (const c of next.slice(1)) g.key(c);
    expect(g.phase).toBe('reel');
    expect(g.missKeys).toBe(0);
  });

  it('釣り：複数の出題と難易度で、速い人は２匹の上限を超えて調達できる', () => {
    for (const diff of DIFFICULTIES) for (const seed of [1, 2, 3, 4, 5]) {
      const slow = play(new FishingGame(new Rng(seed), diff), 3);
      const g = new FishingGame(new Rng(seed), diff);
      const fast = play(g, 12);
      expect(g.fishIndex).toBeGreaterThan(2);
      expect(fast.gains.fish).toBeGreaterThan(slow.gains.fish ?? 0);
    }
  });

  it('狩り：速く打つほど多く仕留め、大物は3語', () => {
    const slow = play(new HuntingGame(new Rng(7)), 2.5);
    const fast = play(new HuntingGame(new Rng(7)), 7);
    expect(fast.gains.meat ?? 0).toBeGreaterThan(slow.gains.meat ?? 0);
    expect(HUNTING.deer.hp).toBe(3);
  });

  it('狩り：同じ通り道で獲物が詰まらない（文字が重ならない）', () => {
    const g = new HuntingGame(new Rng(8));
    for (let i = 0; i < 60 * 10; i++) {
      g.update(1 / 60);
      for (const a of g.prey) for (const b of g.prey) {
        if (a !== b && a.band === b.band) expect(Math.abs(a.x - b.x)).toBeGreaterThan(0.2);
      }
    }
  });

  it('採取：文字数に応じて摘め、毒きのこを打つとかごから2つこぼれる', () => {
    const g = new GatheringGame(new Rng(9));
    g.sprouts = [
      { id: 'a', word: GATHER_GOOD[0], ing: 'veg', slot: 0, life: 5, maxLife: 5 },
      { id: 'b', word: GATHER_BAD[0], ing: null, slot: 1, life: 5, maxLife: 5 },
    ];
    for (const c of defaultRomaji(GATHER_GOOD[0].kana)) g.key(c);
    expect(g.gains.veg).toBe(procurementReward('gathering', rewardKeys(GATHER_GOOD[0].kana), false, g.difficulty.id));
    for (const c of defaultRomaji(GATHER_BAD[0].kana)) g.key(c);
    expect(g.gains.veg).toBe(procurementReward('gathering', rewardKeys(GATHER_GOOD[0].kana), false, g.difficulty.id) - GATHER.poisonLoss);
  });

  it('採取：畑に片方しかないとき、次の安全な出題で不足側を補う', () => {
    const g = new GatheringGame(new Rng(9), { ...DIFFICULTIES[1], poisonRate: 0 });
    g.update(.2);
    expect(g.sprouts.some(s => s.ing === 'veg')).toBe(true);
    g.update(.9);
    expect(g.sprouts.some(s => s.ing === 'mush')).toBe(true);
    g.sprouts = g.sprouts.filter(s => s.ing === 'mush');
    g.update(.9);
    expect(g.sprouts.some(s => s.ing === 'veg')).toBe(true);
  });

  it('仕入れ：文字数で決まる箱数に、ノーミスのときだけ1個を追加する', () => {
    for (const miss of [false, true]) {
      const g = new TradingGame(new Rng(10));
      const ing = g.lot.item;
      const base = procurementReward('trading', rewardKeys(g.lot.word.kana), false, g.difficulty.id);
      if (miss) g.key('q');
      for (const c of defaultRomaji(g.lot.word.kana)) g.key(c);
      expect(g.gains[ing]).toBe(base + (miss ? 0 : 1));
    }
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

describe('調整（デプロイ前の見直し）', () => {
  it('仕入れ：落札したらすぐ次の品物を打てる', () => {
    const g = new TradingGame(new Rng(11));
    const first = g.lot;
    for (const c of defaultRomaji(first.word.kana)) g.key(c);
    expect(g.wins).toBe(1);
    expect(g.lot).not.toBe(first);
    expect(g.lot.outcome).toBe('open');
    expect(g.targets().length).toBe(1);
  });

  it('採取：毒きのこはふつうで2割未満', () => {
    let bad = 0;
    let all = 0;
    for (let s = 0; s < 30; s++) {
      const g = new GatheringGame(new Rng(s));
      const seen = new Set<string>();
      for (let i = 0; i < 600; i++) {
        g.update(1 / 60);
        for (const x of g.sprouts) if (!seen.has(x.id)) { seen.add(x.id); all++; if (!x.ing) bad++; }
      }
    }
    expect(bad / all).toBeLessThan(0.2);
  });

  it('釣り：ふつうの速さでも狩りと同じくらい取れる', () => {
    let fish = 0;
    let meat = 0;
    for (let s = 1; s <= 20; s++) {
      fish += play(new FishingGame(new Rng(s)), 5).gains.fish ?? 0;
      meat += play(new HuntingGame(new Rng(s)), 5).gains.meat ?? 0;
    }
    expect(fish / meat).toBeGreaterThan(0.75);
  });
});

describe('狩りの出現位置', () => {
  it('大物の出る時刻と通り道、小物の高さが毎回変わる', () => {
    const deerTimes = new Set<string>();
    const deerBands = new Set<number>();
    const lanes = new Set<string>();
    for (let seed = 1; seed <= 30; seed++) {
      const g = new HuntingGame(new Rng(seed));
      deerTimes.add(g.deerAt.toFixed(1));
      deerBands.add(g.deerBand);
      for (let i = 0; i < 60 * 6; i++) {
        g.update(1 / 60);
        for (const p of g.prey) if (p.kind === 'rabbit') lanes.add(p.lane.toFixed(2));
      }
    }
    expect(deerTimes.size).toBeGreaterThan(5);
    expect(deerBands.size).toBe(HUNTING.bands.length);
    expect(lanes.size).toBeGreaterThan(10);
  });

  it('大物は毎回出てくる', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const g = new HuntingGame(new Rng(seed));
      let saw = false;
      for (let i = 0; i < 60 * 8 && !saw; i++) { g.update(1 / 60); saw = g.prey.some((p) => p.kind === 'deer'); }
      expect(saw).toBe(true);
    }
  });
});

describe('大物の札', () => {
  it('大物が左端へ走っても、札は反対側へ飛ばずになめらかに動く', async () => {
    const { deerLabelBox } = await import('../src/ui/huntLayout');
    let prev = deerLabelBox({ x: 470, y: 200 }, 80, 32, 48);
    for (let x = 469; x >= 50; x -= 1) {
      const b = deerLabelBox({ x, y: 200 }, 80, 32, 48);
      expect(Math.abs(b.x - prev.x)).toBeLessThan(3);
      expect(Math.abs(b.y - prev.y)).toBeLessThan(3);
      expect(b.x + b.w).toBeLessThanOrEqual(x + 40);
      prev = b;
    }
  });
});
