// サーバーでの再現：遊んだ記録をやり直すと、まったく同じ成績になる
import { describe, expect, it } from 'vitest';
import { parseRecord, replay, validPrep } from '../src/core/session';
import { botPlay } from './bot';
import { CONDITIONS, NORMAL_RULES, defaultPrep, prepCap, rulesFor } from '../src/core/daily';
import { difficultyOf, type DifficultyId } from '../src/core/shopConfig';

const all = (d: DifficultyId, date: string) => Object.values(CONDITIONS).map((c) => ({ c, rules: rulesFor([c], d, date) }));

describe('記録どおりにやり直すと、同じ成績になる', () => {
  it.each(['easy', 'normal', 'hard'] as const)('%s：通常営業', (d) => {
    for (const seed of [11, 12]) {
      const live = botPlay(seed, d, NORMAL_RULES);
      const again = replay(seed, difficultyOf(d), NORMAL_RULES, null, live.record);
      expect(again).toEqual({ ok: true, summary: live.summary(), ticks: live.ticks });
      expect(live.summary().served).toBeGreaterThan(5);
    }
  }, 60000);

  it('ひがわり：どのお題でも同じ成績になる（仕込みの振り分けも含めて）', () => {
    for (const { c, rules } of all('normal', '2026-11-08')) {
      const prep = rules.prepBudget > 0 ? defaultPrep(rules) : null;
      const live = botPlay(5, 'normal', rules, 5, prep);
      const again = replay(5, difficultyOf('normal'), rules, prep, live.record);
      expect(again, c.id).toEqual({ ok: true, summary: live.summary(), ticks: live.ticks });
    }
  }, 120000);

  it('記録や条件を1つでも変えると、成績が合わなくなる', () => {
    // 宴会の日：お客の並びが変わるので、通常営業のルールでやり直すと合わない
    const rules = rulesFor([CONDITIONS.banquet], 'normal', '2026-11-08');
    const live = botPlay(3, 'normal', rules);
    const want = live.summary();
    const otherSeed = replay(4, difficultyOf('normal'), rules, null, live.record);
    expect(otherSeed.ok && otherSeed.summary).not.toEqual(want);
    // 後半の入力を捨てる（その分の料理を出していないことになる）
    const tokens = live.record.match(/\d+[a-z\-BSE]/g)!;
    const cut = tokens.slice(0, Math.floor(tokens.length / 2)).join('');
    const shorter = replay(3, difficultyOf('normal'), rules, null, cut);
    expect(shorter.ok && shorter.summary).not.toEqual(want);
    const otherRules = replay(3, difficultyOf('normal'), NORMAL_RULES, null, live.record);
    expect(otherRules.ok && otherRules.summary).not.toEqual(want);
  }, 60000);

  it('読めない記録・営業時間を超える記録は受け付けない', () => {
    expect(parseRecord('3a12b0E2S')).toEqual([{ gap: 3, key: 'a' }, { gap: 12, key: 'b' }, { gap: 0, key: 'Enter' }, { gap: 2, key: ' ' }]);
    expect(parseRecord('3a12')).toBeNull();
    expect(parseRecord('a3')).toBeNull();
    expect(parseRecord('3A')).toBeNull();
    expect(replay(1, difficultyOf('normal'), NORMAL_RULES, null, '999999a')).toMatchObject({ ok: false });
  });

  it('仕込みの振り分けは、数と上限の範囲だけ受け付ける', () => {
    const rules = rulesFor([CONDITIONS.prep, CONDITIONS.smallStore], 'hard');
    const ok = defaultPrep(rules);
    expect(validPrep(ok, rules.prepBudget, prepCap(rules))).toBe(true);
    expect(validPrep({ ...ok, fish: ok.fish + 20 }, rules.prepBudget, prepCap(rules))).toBe(false);
    expect(validPrep({ ...ok, fish: -1 }, rules.prepBudget, prepCap(rules))).toBe(false);
    expect(validPrep({ ...ok, fish: 1.5 }, rules.prepBudget, prepCap(rules))).toBe(false);
    expect(validPrep(null, rules.prepBudget, prepCap(rules))).toBe(false);
    expect(validPrep(null, 0, 12)).toBe(true);
  });

  it('やり直しにかかる時間（サーバーの処理時間の目安）', () => {
    const live = botPlay(7, 'hard', rulesFor([CONDITIONS.banquet, CONDITIONS.hiden], 'hard', '2026-11-08'), 7);
    const t0 = performance.now();
    const runs = 5;
    for (let i = 0; i < runs; i++) replay(7, difficultyOf('hard'), rulesFor([CONDITIONS.banquet, CONDITIONS.hiden], 'hard', '2026-11-08'), null, live.record);
    const ms = (performance.now() - t0) / runs;
    console.log(`やり直し1回：${ms.toFixed(1)}ms、刻み${live.ticks}、記録${live.record.length}文字`);
    expect(ms).toBeLessThan(1000);
  }, 60000);
});
