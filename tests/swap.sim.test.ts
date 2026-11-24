// 方針の見直し 第5段：1枠の差し替えで、方針の値打ちを比べる（npm run sim:swap）
// 組み方の中の1つだけを別の方針に替え、同じ種・同じ条件で、クリア数と4日目の達成率を比べる（設計書 8.）
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import type { PolicyId } from '../src/core/build';
import { allMeta, botRun, prefer } from './runBot';
/** policy.sim と同じ種（policy.sim を読み込むと、その測定まで走るので写す） */
const SIM_SEEDS = [11, 23, 37, 41, 59, 67, 83, 97];

interface SwapCase { base: string; order: PolicyId[]; from: PolicyId; to: PolicyId }
const CASES: SwapCase[] = [
  { base: '連鎖の店', order: ['matome', 'mouippai', 'betsubara', 'yobikomi', 'tairyo', 'makanai', 'nushi'], from: 'matome', to: 'makanai' },
  { base: '強気の店', order: ['tsuyoki', 'yobikomi', 'aiso', 'sekkachi', 'ooiri', 'matome'], from: 'tsuyoki', to: 'sekkachi' },
  { base: '強気の店', order: ['tsuyoki', 'yobikomi', 'aiso', 'sekkachi', 'ooiri', 'matome'], from: 'yobikomi', to: 'ooiri' },
  { base: '少人数の店', order: ['yoyaku', 'omotenashi', 'aiso', 'ryoshusho', 'ooiri', 'betsubara'], from: 'yoyaku', to: 'ippatsu' },
  { base: '夜の店', order: ['yoippari', 'tema', 'hayakuchi', 'tsuyoki', 'aiso', 'ryoshusho'], from: 'yoippari', to: 'ippatsu' },
  { base: '夜の店', order: ['yoippari', 'tema', 'hayakuchi', 'tsuyoki', 'aiso', 'ryoshusho'], from: 'tema', to: 'ooiri' },
  { base: '夜の店', order: ['yoippari', 'tema', 'hayakuchi', 'tsuyoki', 'aiso', 'ryoshusho'], from: 'hayakuchi', to: 'makanai' },
  { base: '景気＋多い素材', order: ['keiki', 'tairyo', 'oomori', 'matome', 'ooiri', 'shikomi'], from: 'keiki', to: 'makanai' },
];
const SPEEDS = [[4.5, 0.06, 0.5], [6.5, 0.04, 0.35], [9, 0.03, 0.25]] as const;
const LOOPS = [1, 3, 5];

/** 1つの組み方を、速さごとに測る */
function measure(name: string, order: PolicyId[], watch: PolicyId) {
  const strat = prefer(name, order);
  return SPEEDS.map(([kps, miss, think]) => {
    let clear = 0, n = 0, served = 0, boosted = 0;
    const d4: number[] = [];
    const trips: number[] = [];
    for (const loop of LOOPS) for (const s of SIM_SEEDS) {
      clear += botRun(s, strat, kps, miss, loop, allMeta(), false, think, 'urgent').cleared ? 1 : 0;
      n++;
      const full = botRun(s, strat, kps, miss, loop, allMeta(), true, think, 'urgent');
      if (full.days[3]) d4.push((full.days[3].sales / full.days[3].goal) * 100);
      for (const d of full.days) { trips.push(d.trips); served += d.served; boosted += d.boosted[watch] ?? 0; }
    }
    const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
    return { kps, clear, n, day4: Math.round(avg(d4)), trips: Math.round(avg(trips) * 100) / 100, boostShare: Math.round((boosted / Math.max(1, served)) * 100) / 100 };
  });
}

describe('1枠の差し替え', () => {
  it('組み方ごとに、1つだけ替えて比べる', () => {
    const rows = CASES.map((c) => {
      const before = measure(`${c.base}`, c.order, c.from);
      const after = measure(`${c.base}（${c.from}→${c.to}）`, c.order.map((id) => (id === c.from ? c.to : id)), c.to);
      for (const [i, b] of before.entries()) {
        const a = after[i];
        console.log(`${c.base}\t${c.from}→${c.to}\t${b.kps}打/秒\tクリア ${b.clear}→${a.clear}/${b.n}\t4日目 ${b.day4}→${a.day4}%\t調達 ${b.trips}→${a.trips}\t${c.from}の倍率の皿 ${b.boostShare}`);
      }
      return { ...c, before, after };
    });
    mkdirSync('docs/balance', { recursive: true });
    writeFileSync('docs/balance/2026-11-24-policy-multiply-swap.json', JSON.stringify({ seeds: SIM_SEEDS, loops: LOOPS, rows }, null, 2));
    expect(rows.length).toBe(CASES.length);
  }, 3600000 * 2);
});
