// 方針の見直しの測定：変える前と後を同じ種・同じ条件で比べる（npm run sim:policy、POLICY_SIM_LABEL で出力の名前を変える）
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { emptyMeta, type RunMeta } from '../src/core/run';
import { allMeta, botRun, BUILDS, RANDOM, type BotDay, type Strategy } from './runBot';

export const SIM_SEEDS = [11, 23, 37, 41, 59, 67, 83, 97];

export interface SimRow {
  strategy: string; kps: number; miss: number; think: number; loop: number; state: '初回' | '解放後'; aim: 'urgent' | 'quote';
  /** 4日をクリアした数（目標に届かなければ終わる、ふつうの遊び方） */
  clear: number;
  /** 日ごとの到達数と、達成率（%）の平均（4日目まで続けて遊んだ結果） */
  reached: number[]; ratio: number[];
  /** 皿の倍率の中央値・上位5%・上限に届いた割合（新しい会計でだけ出る） */
  medianPaid: number | null; p95Paid: number | null; cappedRate: number | null;
  /** 1皿・1回の入力の最高額が、その日の売上に占める割合の最大と中央値（目標の3割以上を売った日だけで数える） */
  bestServeShare: number; bestInputShare: number; bestServeShareMid: number; bestInputShareMid: number;
  /** 大入りだった時間の割合の平均／手が止まった秒数の平均／調達の回数の平均 */
  feverShare: number; blockedSecs: number; trips: number;
}

const avg = (a: number[]) => (a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0);
const r2 = (x: number) => Math.round(x * 100) / 100;
function quantile(a: number[], q: number) {
  const s = [...a].sort((x, y) => x - y);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))];
}

function row(strat: Strategy, [kps, miss, think]: readonly [number, number, number], loop: number, state: SimRow['state'], meta: () => RunMeta, aim: SimRow['aim']): SimRow {
  const real = SIM_SEEDS.map((s) => botRun(s, strat, kps, miss, loop, meta(), false, think, aim));
  const full = SIM_SEEDS.map((s) => botRun(s, strat, kps, miss, loop, meta(), true, think, aim));
  const days: BotDay[] = full.flatMap((r) => r.days);
  const paid = days.flatMap((d) => d.paid);
  const served = days.reduce((n, d) => n + d.served, 0);
  // 1皿の割合は、目標の3割以上を売った日だけで数える（売上の小さい日で割合がふくらまないように）
  const counted = days.filter((d) => d.sales >= d.goal * 0.3 && d.sales > 0);
  return {
    strategy: strat.name, kps, miss, think, loop, state, aim,
    clear: real.filter((r) => r.cleared).length,
    reached: [0, 1, 2, 3].map((d) => real.filter((r) => r.days[d]).length),
    ratio: [0, 1, 2, 3].map((d) => Math.round(avg(full.flatMap((r) => (r.days[d] ? [r.days[d].sales / r.days[d].goal * 100] : []))))),
    medianPaid: paid.length ? r2(quantile(paid, 0.5)) : null,
    p95Paid: paid.length ? r2(quantile(paid, 0.95)) : null,
    cappedRate: paid.length ? r2(days.reduce((n, d) => n + d.capped, 0) / Math.max(1, served)) : null,
    bestServeShare: r2(Math.max(0, ...counted.map((d) => d.bestServe / d.sales))),
    bestInputShare: r2(Math.max(0, ...counted.map((d) => d.bestInput / d.sales))),
    bestServeShareMid: counted.length ? r2(quantile(counted.map((d) => d.bestServe / d.sales), 0.5)) : 0,
    bestInputShareMid: counted.length ? r2(quantile(counted.map((d) => d.bestInput / d.sales), 0.5)) : 0,
    feverShare: r2(avg(days.map((d) => d.feverSecs / Math.max(1, d.seconds)))),
    blockedSecs: Math.round(avg(days.map((d) => d.blockedSecs))),
    trips: r2(avg(days.map((d) => d.trips))),
  };
}

const SLOW = [4.5, 0.06, 0.5] as const;
const MID = [6.5, 0.04, 0.35] as const;
const FAST = [9, 0.03, 0.25] as const;
const HIGH = [[7, 0.04, 0.35], [9, 0.03, 0.25], [12, 0.02, 0.2]] as const;

/** 測る条件をすべて回して、表と JSON を出す */
export function runSim(label: string, aims: SimRow['aim'][]) {
  const rows: SimRow[] = [];
  const add = (r: SimRow) => {
    rows.push(r);
    console.log(`${r.state} のれん${r.loop} ${r.kps}打/秒 ${r.aim} ${r.strategy} クリア${r.clear}/${SIM_SEEDS.length} 到達${r.reached.join('/')} 達成率${r.ratio.join('/')}% 倍率 中央${r.medianPaid ?? '-'} 上位5%${r.p95Paid ?? '-'} 上限${r.cappedRate ?? '-'} 最高皿${r.bestServeShare}(中${r.bestServeShareMid}) 最高入力${r.bestInputShare}(中${r.bestInputShareMid}) 大入り${r.feverShare} 停止${r.blockedSecs}秒 調達${r.trips}`);
  };
  const strats = [RANDOM, ...BUILDS];
  for (const aim of aims) {
    for (const speed of [SLOW, [7, 0.04, 0.35] as const]) for (const s of strats) add(row(s, speed, 1, '初回', emptyMeta, aim));
    for (const loop of [1, 3, 5, 6]) for (const speed of [SLOW, MID, FAST]) for (const s of strats) add(row(s, speed, loop, '解放後', allMeta, aim));
    for (const loop of [10, 15, 20]) for (const speed of HIGH) for (const s of strats) add(row(s, speed, loop, '解放後', allMeta, aim));
  }
  const output = `docs/balance/2026-11-23-policy-multiply-${label}.json`;
  mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify({ seeds: SIM_SEEDS, rows }, null, 2));
  return rows;
}

describe('方針の見直しの測定', () => {
  it('変える前と後の表', () => {
    const label = process.env.POLICY_SIM_LABEL ?? 'before';
    const aims = (process.env.POLICY_SIM_AIMS ?? 'urgent').split(',') as SimRow['aim'][];
    expect(runSim(label, aims).length).toBeGreaterThan(0);
  }, 3600000 * 3);
});
