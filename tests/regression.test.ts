// 方針の見直し（繁盛記の売上の計算の作り替え）で、通常営業・ひがわり・保存データが変わらないことを固定する
import { describe, expect, it } from 'vitest';
import { botPlay } from './bot';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { RomajiMatcher } from '../src/core/romaji';
import { DISHES, DIFFICULTIES, type DifficultyId } from '../src/core/shopConfig';
import { BANQUET_MULT, CONDITIONS, HIDEN_MULT, NORMAL_RULES, rulesFor, type DayRules } from '../src/core/daily';
import { PAIRS, emptyBuildStats, pairKey } from '../src/core/build';
import { applyOffer, closeDay, dayPlan, earnedAchievements, emptyMeta, newRun, offersFor, readMeta } from '../src/core/run';

function type(s: Shop, kana: string) {
  for (const ch of new RomajiMatcher(kana).remaining) s.key(ch);
  return s.drainEvents();
}

describe('通常営業・ひがわりは方針の見直しで変わらない', () => {
  const date = '2026-11-23';
  const cases: [string, DifficultyId, DayRules][] = [
    ['通常・やさしい', 'easy', NORMAL_RULES],
    ['通常・ふつう', 'normal', NORMAL_RULES],
    ['通常・むずかしい', 'hard', NORMAL_RULES],
    ['ひがわり・宴会', 'normal', rulesFor([CONDITIONS.banquet], 'normal', date)],
    ['ひがわり・おかわり', 'normal', rulesFor([CONDITIONS.refill], 'normal', date)],
    ['ひがわり・秘伝', 'normal', rulesFor([CONDITIONS.hiden], 'normal', date)],
  ];
  for (const [name, d, rules] of cases) {
    it(name, () => {
      const out = [3, 17, 42].map((seed) => {
        const s = botPlay(seed, d, rules, 5);
        const st = s.shop.stats;
        return [s.shop.score, st.served, st.sales, st.tips, st.angry, s.record.length];
      });
      expect(out.some(([score]) => score > 0)).toBe(true);
      expect(out).toMatchSnapshot();
    });
  }

  it('秘伝と宴会の皿の金額（方針なし）', () => {
    const s = new Shop(new Rng(1), DIFFICULTIES[1], { ...NORMAL_RULES, hiden: 1 });
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 30;
    const dish = DISHES.find((x) => x.id === 'hunterStew')!;
    s.seats[0] = { id: 1, dish, look: 0, wait: 20, maxWait: 40, state: 'wait', t: 0, lack: 0, banquet: true };
    type(s, 'ひでんの');
    const ev = type(s, dish.kana).find((e) => e.type === 'serve');
    const tip = Math.round((20 / 40) * 60);
    expect(ev?.type === 'serve' && ev.gain).toBe(Math.round((dish.price + tip) * 1 * HIDEN_MULT * BANQUET_MULT));
  });
});

describe('古い保存データ', () => {
  const roundTrip = (m: ReturnType<typeof emptyMeta>) => readMeta(JSON.parse(JSON.stringify(m)));

  it('朝・営業中・閉店後・道中の4つの状態を読み直しても同じ', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 321, 'save-check');
    applyOffer(run, offersFor(run, meta, 0, 0)[0]);
    meta.active = run;
    expect(run.stage).toBe('morning');
    expect(roundTrip(meta).active).toEqual(run);
    run.stage = 'open';
    expect(roundTrip(meta).active).toEqual(run);
    const out = closeDay(run, meta, { sales: 999999, served: 40, maxCombo: 20, angry: 0, build: emptyBuildStats() });
    expect(out.passed).toBe(true);
    expect(run.stage).toBe('closed');
    expect(roundTrip(meta).active).toEqual(run);
    run.stage = 'road';
    expect(roundTrip(meta).active).toEqual(run);
  });

  it('34組を全部見つけた記録は、読み直しても残り、「秘伝の書」が取れている', () => {
    const meta = emptyMeta();
    // 組が増える前（第3段より前）の34組だけを全部見つけた記録。組が増えても実績は消さない
    meta.discovered = PAIRS.slice(0, 34).map((p) => pairKey(p.a, p.b));
    // 更新前の保存データには allPairs の項目がない
    delete (meta.flags as Partial<typeof meta.flags>).allPairs;
    const back = roundTrip(meta);
    expect(back.discovered).toHaveLength(34);
    expect(earnedAchievements(back)).toContain('run-discover-all');
    const short = emptyMeta();
    short.discovered = PAIRS.slice(0, 33).map((p) => pairKey(p.a, p.b));
    expect(earnedAchievements(roundTrip(short))).not.toContain('run-discover-all');
  });

  it('更新のあとに34組目を見つけた記録（44組中34組）は、読み直しても秘伝の書にならない', () => {
    const meta = emptyMeta();
    meta.discovered = PAIRS.slice(0, 34).map((p) => pairKey(p.a, p.b));
    expect(meta.flags.allPairs).toBe(false);
    const back = roundTrip(meta);
    expect(earnedAchievements(back)).not.toContain('run-discover-all');
    expect(earnedAchievements(roundTrip(back))).not.toContain('run-discover-all');
  });
});

describe('公開版（f5b6cd4）の形の保存データ', () => {
  // 公開版の emptyMeta / newRun / closeDay がそのまま書いた形（lastSeen・allPairs・新しい方針はない）
  const OLD = {
    v: 1, loop: 2, pick: 2, clears: 1, runs: 3, daysCleared: 6,
    best: { total: 61200, day: 23000, combo: 41, chain: 3, serve: 2400, ratio: 151, stack: 2 },
    discovered: ['matome+mouippai', 'nushi+tairyo'], sets: [], sigs: ['tairyo'], policies: ['oomori'],
    flags: { noAngry: false, max3: false },
    active: {
      v: 1, id: 'r3', seed: 12345, loop: 2, day: 1, stage: 'open',
      owned: [{ id: 'nushi', lv: 2 }, { id: 'tairyo', lv: 1 }, { id: 'oomori', lv: 1 }],
      rerolls: 1, boost: false, road: 'ichi',
      days: [{ sales: 11800, goal: 10300, served: 41, maxCombo: 22, angry: 1, maxChain: 1, bestServe: 900, road: 'joren' }],
      pairs: ['nushi+tairyo'], yen: { nushi: 2100, tairyo: 800 }, aid: 0,
    },
    last: null, paid: [], losses: 0,
  };

  it('読み込めて、続きの営業の目標と候補が作れ、閉店まで進められる', () => {
    const meta = readMeta(JSON.parse(JSON.stringify(OLD)));
    const run = meta.active!;
    expect(run).not.toBeNull();
    expect(run.lastSeen).toBeNull();
    expect(meta.flags.allPairs).toBe(false);
    expect(meta.discovered).toEqual(['matome+mouippai', 'nushi+tairyo']);
    const plan = dayPlan(run, meta);
    expect(Number.isFinite(plan.goal) && plan.goal > 0).toBe(true);
    expect(offersFor(run, meta, 1, 0).length).toBeGreaterThan(0);
    const out = closeDay(run, meta, { sales: plan.goal, served: 40, maxCombo: 20, angry: 0, build: emptyBuildStats() });
    expect(out.passed).toBe(true);
    expect(run.lastSeen).not.toBeNull();
    expect(earnedAchievements(meta)).not.toContain('run-discover-all');
  });
});
