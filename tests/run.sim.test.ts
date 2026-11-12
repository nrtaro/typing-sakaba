// 繁盛記のバランス確認：作戦と打つ速さごとに、日ごとの売上と目標の比を出す（npm run sim:run）
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyMeta, type RunMeta } from '../src/core/run';
import { botRun, prefer, NONE, RANDOM, type Strategy } from './runBot';

export const BUILDS: Strategy[] = [
  prefer('連鎖の店', ['matome', 'mouippai', 'betsubara', 'yobikomi', 'tairyo', 'makanai', 'nushi']),
  prefer('勢いの店', ['ryoshusho', 'ooiri', 'sekkachi', 'yobikomi', 'shikomi', 'matome']),
  prefer('調達の店', ['nushi', 'tairyo', 'oomori', 'makanai', 'shikomi', 'mie']),
  prefer('少人数の店', ['yoyaku', 'omotenashi', 'aiso', 'ryoshusho', 'ooiri', 'betsubara']),
  prefer('台所の店', ['mie', 'makanai', 'shikomi', 'mouippai', 'oomori', 'tairyo']),
  prefer('おかわりの店', ['betsubara', 'mouippai', 'aiso', 'matome', 'tairyo', 'yobikomi']),
];
const allMeta = () => { const m = emptyMeta(); m.policies = ['oomori', 'ooiri', 'makanai']; m.daysCleared = 24; return m; };
const SEEDS = [11, 23, 37, 41, 59, 67, 83, 97, 109, 127, 149, 163];
const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);

function table(strat: Strategy, kps: number, miss: number, loop: number, makeMeta: () => RunMeta, think = 0.4) {
  const real = SEEDS.map((s) => botRun(s, strat, kps, miss, loop, makeMeta(), false, think));
  const clear = real.filter((r) => r.cleared).length;
  const reach = avg(real.map((r) => r.days.length * 10)) / 10;
  const days = [0, 1, 2, 3].map((d) => {
    const reached = real.flatMap((r) => r.days[d] ? [r.days[d]] : []);
    return { reached: reached.length, sales: reached.length ? avg(reached.map((r) => r.sales)) : 0, ratio: reached.length ? avg(reached.map((r) => r.sales / r.goal * 100)) : 0 };
  });
  const completed = real.filter((r) => r.cleared);
  return {
    clear, reach, days,
    seconds: completed.length ? avg(completed.map((r) => r.days.reduce((sum, d) => sum + d.seconds, 0))) : null,
    rerolls: avg(real.map((r) => r.rerollsUsed)),
    angry: avg(real.map((r) => r.days.reduce((sum, d) => sum + d.angry, 0))),
    chain: Math.max(...real.flatMap((r) => r.days.map((d) => d.maxChain))),
    combo: Math.max(...real.flatMap((r) => r.days.map((d) => d.maxCombo))),
    runs: real.map((r, i) => ({ seed: SEEDS[i], cleared: r.cleared, owned: r.run.owned, days: r.days, roads: r.run.days.map((d) => d.road) })),
  };
}

describe('繁盛記のバランス', () => {
  it('作戦×速さの表', () => {
    const rows: string[] = [];
    const results: unknown[] = [];
    const record = (strat: Strategy, kps: number, miss: number, think: number, loop: number, state: string, meta: () => RunMeta) => {
      const t = table(strat, kps, miss, loop, meta, think);
      results.push({ state, strategy: strat.name, kps, miss, think, loop, ...t });
      rows.push(`${state} のれん${loop} ${kps}打/秒 ${strat.name} クリア${t.clear}/${SEEDS.length} 到達${t.reach}日 日別${t.days.map((d) => `${d.ratio}%(${d.reached}件)`).join(' ')} 営業${t.seconds ?? '-'}秒 引直${t.rerolls} 連鎖${t.chain}`);
    };
    for (const [kps, miss, think] of [[4.5, 0.06, 0.5], [6.5, 0.04, 0.35], [9, 0.03, 0.25]] as const) {
      for (const strat of [NONE, RANDOM, ...BUILDS]) for (const [state, meta] of [['初回', emptyMeta], ['解放後', allMeta]] as const) record(strat, kps, miss, think, 1, state, meta);
    }
    for (const [kps, miss, think, loops] of [[4.5, 0.06, 0.5, [2]], [6.5, 0.04, 0.35, [3, 5]], [9, 0.03, 0.25, [5, 8]]] as const) {
      for (const loop of loops) for (const strat of [RANDOM, ...BUILDS]) {
        record(strat, kps, miss, think, loop, '解放後', allMeta);
      }
    }
    console.log(`\n${rows.join('\n')}\n`);
    const output = process.env.RUN_SIM_OUTPUT ?? '.wrangler/tmp/hanjoki-balance.json';
    mkdirSync(dirname(output), { recursive: true });
    writeFileSync(output, JSON.stringify({ seeds: SEEDS, results }, null, 2));
    expect(rows.length).toBeGreaterThan(0);
  }, 3600000);
});
