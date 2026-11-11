// 繁盛記のバランス確認：作戦と打つ速さごとに、日ごとの売上と目標の比を出す（npm run sim:run）
import { describe, expect, it } from 'vitest';
import { GOAL_BASE, emptyMeta, loopGoalMult } from '../src/core/run';
import { botRun, prefer, NONE, RANDOM, type Strategy } from './runBot';

export const BUILDS: Strategy[] = [
  prefer('連鎖の店', ['matome', 'mouippai', 'betsubara', 'yobikomi', 'tairyo', 'makanai', 'nushi']),
  prefer('勢いの店', ['ryoshusho', 'ooiri', 'sekkachi', 'yobikomi', 'shikomi', 'matome']),
  prefer('調達の店', ['nushi', 'tairyo', 'oomori', 'makanai', 'shikomi', 'mie']),
  prefer('少人数の店', ['yoyaku', 'omotenashi', 'aiso', 'ryoshusho', 'ooiri', 'betsubara']),
  prefer('台所の店', ['mie', 'makanai', 'shikomi', 'mouippai', 'oomori', 'tairyo']),
  prefer('おかわりの店', ['betsubara', 'mouippai', 'aiso', 'matome', 'tairyo', 'yobikomi']),
];
const allMeta = () => { const m = emptyMeta(); m.policies = ['oomori', 'ooiri', 'makanai']; return m; };
const SEEDS = [11, 23, 37, 41, 59, 67];
const avg = (a: number[]) => Math.round(a.reduce((x, y) => x + y, 0) / a.length);

function table(strat: Strategy, kps: number, miss: number, loop: number, think = 0.4) {
  const runs = SEEDS.map((s) => botRun(s, strat, kps, miss, loop, allMeta(), true, think));
  const per = [0, 1, 2, 3].map((d) => avg(runs.map((r) => r.days[d].sales)));
  const goals = [0, 1, 2, 3].map((d) => Math.round(GOAL_BASE[d] * loopGoalMult(loop)));
  // 目標を割った最初の日で止まる、ほんとうの挑戦でのクリア率
  const real = SEEDS.map((s) => botRun(s, strat, kps, miss, loop, allMeta(), false, think));
  const clear = real.filter((r) => r.cleared).length;
  const reach = avg(real.map((r) => r.days.length * 10)) / 10;
  return { per, goals, clear, reach, angry: avg(runs.map((r) => r.days.reduce((a, d) => a + d.angry, 0))), chain: Math.max(...runs.flatMap((r) => r.days.map((d) => d.maxChain))), combo: Math.max(...runs.flatMap((r) => r.days.map((d) => d.maxCombo))) };
}

describe('繁盛記のバランス', () => {
  it('作戦×速さの表', () => {
    const rows: string[] = [];
    for (const [kps, miss, think] of [[4.5, 0.06, 0.5], [6.5, 0.04, 0.35], [9, 0.03, 0.25]] as const) {
      for (const strat of [NONE, RANDOM, ...BUILDS]) {
        const t = table(strat, kps, miss, 1, think);
        rows.push(`${String(kps).padEnd(4)}打/秒 ${strat.name.padEnd(8, '　')} 日別 ${t.per.map((v, i) => `${v}(${Math.round((v / t.goals[i]) * 100)}%)`).join(' ')}  クリア ${t.clear}/${SEEDS.length} 到達${t.reach}日 怒${t.angry} 連鎖${t.chain} コンボ${t.combo}`);
      }
    }
    for (const [kps, miss, think, loops] of [[4.5, 0.06, 0.5, [2]], [6.5, 0.04, 0.35, [3, 5]], [9, 0.03, 0.25, [5, 8]]] as const) {
      for (const loop of loops) for (const strat of [RANDOM, ...BUILDS]) {
        const t = table(strat, kps, miss, loop, think);
        rows.push(`のれん${loop} ${kps}打/秒 ${strat.name.padEnd(8, '　')} 日別 ${t.per.map((v, i) => `${v}(${Math.round((v / t.goals[i]) * 100)}%)`).join(' ')} クリア ${t.clear}/${SEEDS.length} 到達${t.reach}日`);
      }
    }
    console.log(`\n${rows.join('\n')}\n`);
    expect(rows.length).toBeGreaterThan(0);
  }, 3600000);
});
