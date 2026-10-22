// バランス確認: いろいろな技能・方針でボットに一周させ、スコアの傾向を確かめる
import { describe, expect, it } from 'vitest';
import { runScore, runActivityBot, type Policy, type Skill } from './bot';
import { FishingModel } from '../src/core/fishing';
import { HuntingModel } from '../src/core/hunting';
import { Rng } from '../src/core/rng';

const SKILLS: Record<string, Skill> = {
  beginner: { kps: 2.0, missRate: 0.1, reaction: 0.5 },
  average: { kps: 3.5, missRate: 0.06, reaction: 0.35 },
  good: { kps: 5.0, missRate: 0.04, reaction: 0.25 },
  expert: { kps: 7.5, missRate: 0.02, reaction: 0.2 },
};
const SEEDS = [11, 22, 33, 44, 55, 66, 77, 88];

function avg(skill: Skill, policy: Policy) {
  const scores = SEEDS.map((seed) => runScore(seed, skill, policy).score.total);
  return Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
}

describe('バランス', () => {
  it('調達1回あたりの収穫（参考表示）', () => {
    const rows: string[] = [];
    for (const [name, skill] of Object.entries(SKILLS)) {
      const f = runActivityBot(new FishingModel(new Rng(1)), skill, new Rng(5));
      const h = runActivityBot(new HuntingModel(new Rng(1)), skill, new Rng(5));
      const sumC = (r: typeof f) => r.catches.map((c) => `${c.label}${'★'.repeat(c.quality + 1)}x${c.count}`).join(' ');
      rows.push(`${name.padEnd(9)} 釣り: ${sumC(f)} / 狩り: ${sumC(h)} (逃: ${h.escapes})`);
    }
    console.log(rows.join('\n'));
  });

  it('技能が高いほどスコアが高い', () => {
    const table: Record<string, number> = {};
    for (const [name, skill] of Object.entries(SKILLS)) table[name] = avg(skill, 'trend');
    console.log('技能別スコア（噂に合わせる方針）', table);
    expect(table.average).toBeGreaterThan(table.beginner);
    expect(table.good).toBeGreaterThan(table.average);
    expect(table.expert).toBeGreaterThan(table.good);
  });

  it('同じ技能でも方針で結果が変わり、片方だけの調達が常に最善ではない', () => {
    for (const name of ['average', 'good'] as const) {
      const skill = SKILLS[name];
      const row = {
        trend: avg(skill, 'trend'),
        mixed: avg(skill, 'mixed'),
        fishOnly: avg(skill, 'fishOnly'),
        huntOnly: avg(skill, 'huntOnly'),
        noUpgrade: avg(skill, 'noUpgrade'),
      };
      console.log(`方針別スコア（${name}）`, row);
      expect(row.trend).toBeGreaterThan(row.fishOnly);
      expect(row.trend).toBeGreaterThan(row.huntOnly);
      expect(row.mixed).toBeGreaterThan(row.noUpgrade);
    }
  });
});
