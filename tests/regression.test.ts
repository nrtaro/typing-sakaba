// 方針の見直し（繁盛記の売上の計算の作り替え）で、通常営業・ひがわり・保存データが変わらないことを固定する
import { describe, expect, it } from 'vitest';
import { botPlay } from './bot';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { RomajiMatcher } from '../src/core/romaji';
import { DISHES, DIFFICULTIES, type DifficultyId } from '../src/core/shopConfig';
import { BANQUET_MULT, CONDITIONS, HIDEN_MULT, NORMAL_RULES, rulesFor, type DayRules } from '../src/core/daily';
import { PAIRS, emptyBuildStats, pairKey } from '../src/core/build';
import { applyOffer, closeDay, earnedAchievements, emptyMeta, newRun, offersFor, readMeta } from '../src/core/run';

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
