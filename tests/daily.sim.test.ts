// ひがわりのバランス確認：お題の組み合わせごとに、ボットの売上と怒った客を通常営業と比べる
import { describe, expect, it } from 'vitest';
import { CONDITIONS, isBanned, rulesFor, type Condition } from '../src/core/daily';
import { DIFFICULTIES, type DifficultyId } from '../src/core/shopConfig';
import { playDay } from './day.sim.test';

const SEEDS = [1, 2, 3, 4, 5, 6];
const DATES = ['2026-11-08', '2026-11-09', '2026-11-10'];

function avg(diff: DifficultyId, kps: number, conds: Condition[]) {
  let score = 0;
  let angry = 0;
  let n = 0;
  for (const date of DATES) {
    const rules = rulesFor(conds, diff, date);
    for (const seed of SEEDS) {
      const r = playDay(seed, kps, 0.05, diff, rules);
      score += r.score;
      angry += r.angry;
      n++;
    }
  }
  return { score: score / n, angry: angry / n };
}

const majors = Object.values(CONDITIONS).filter((c) => c.kind === 'major');
const minors = Object.values(CONDITIONS).filter((c) => c.kind === 'minor');

describe('ひがわりのバランス', () => {
  it.each(DIFFICULTIES.map((d) => [d.name, d.id] as const))('%s：組み合わせごとの売上（通常営業を100とする）', (_n, diff) => {
    const rows: Record<string, Record<string, string>> = {};
    const ratios: number[] = [];
    for (const kps of [3, 5]) {
      const base = avg(diff, kps, []);
      for (const ma of majors) for (const mi of minors) {
        const r = avg(diff, kps, [ma, mi]);
        const ratio = Math.round((r.score / base.score) * 100);
        const key = `${ma.title(diff)}＋${mi.title(diff)}${isBanned(ma.id, mi.id) ? '（除外）' : ''}`;
        rows[key] ??= {};
        rows[key][`${kps}打/秒`] = `${ratio}（怒${r.angry.toFixed(1)}）`;
        if (!isBanned(ma.id, mi.id)) ratios.push(ratio);
      }
      rows['通常営業'] ??= {};
      rows['通常営業'][`${kps}打/秒`] = `${Math.round(base.score)}円（怒${base.angry.toFixed(1)}）`;
    }
    console.log(_n);
    console.table(rows);
    // どの組み合わせも、通常営業から極端に外れない（売上が4割を切る・1.7倍を超える日は作らない）。
    // 予約の宴会＋おかわり注文の やさしい は、お客の少なさを埋める「ごほうびの日」になる
    for (const r of ratios) {
      expect(r).toBeGreaterThan(40);
      expect(r).toBeLessThan(170);
    }
  }, 400000);
});
