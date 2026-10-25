import { procurementReward } from '../src/core/procurementRewards';
import { describe, expect, it } from 'vitest';
import { createMinigame, GatheringGame, HuntingGame } from '../src/core/minigames';
import { Rng } from '../src/core/rng';
import { RomajiMatcher, defaultRomaji } from '../src/core/romaji';
import { DIFFICULTIES, DISHES, TRIPS, type Difficulty, type TripId, type IngredientId } from '../src/core/shopConfig';

/** 標準WPM=5打鍵/語。新しい語を読む時間0.2秒、ミス4%、打鍵の持ち越しなし。 */
export function tripRun(id: TripId, seed: number, wpm: number, diff: Difficulty) {
  const game = createMinigame(id, new Rng(seed), diff), errors = new Rng(seed + 5000);
  let previous = '', reaction = 0, acc = 0, elapsed = 0;
  while (!game.finished && elapsed < 16) {
    const dt = 1 / 60; elapsed += dt; game.update(dt);
    let targets = game.targets();
    if (game instanceof GatheringGame) targets = targets.filter(t => game.sprouts.find(s => s.id === t.id)?.ing);
    if (game instanceof HuntingGame) targets.sort((a, b) => {
      const cost = (id: string) => {const p = game.prey.find(p => p.id === id)!;const remaining = p.hp * defaultRomaji(p.word.kana).length; return procurementReward('hunting', (p.rewardKeys ?? 0) + remaining, p.kind === 'deer', diff.id) / remaining;};
      return cost(b.id) - cost(a.id);
    });
    const live = game.input.active.find(a => targets.some(t => t.id === a.target.id));
    const target = live?.target ?? targets[0];
    if (!target) { acc = 0; previous = ''; continue; }
    const signature = target.id + ':' + target.kana;
    if (previous !== signature) { previous = signature; reaction = .2; acc = 0; }
    if (reaction > 0) { reaction -= dt; continue; }
    acc += wpm / 12 * dt;
    if (acc >= 1) {
      acc -= 1;
      const key = live?.matcher.remaining[0] ?? new RomajiMatcher(target.kana).remaining[0];
      if (key) game.key(errors.next() < .04 ? 'q' : key);
    }
  }
  const gains = Object.fromEntries(TRIPS.find(t => t.id === id)!.gives.map(ing => [ing, Math.max(game.gains[ing] ?? 0, TRIPS.find(t => t.id === id)!.minimum[ing] ?? 0)])) as Partial<Record<IngredientId, number>>;
  return { gains, elapsed };
}

export function procurementRows() {
  return DIFFICULTIES.flatMap(diff => [30, 45, 60, 90, 120].flatMap(wpm => TRIPS.map(trip => {
    const runs = Array.from({ length: 12 }, (_, i) => tripRun(trip.id, i + 1, wpm, diff));
    const average = (fn: (run: typeof runs[number]) => number) => Math.round(runs.reduce((sum, run) => sum + fn(run), 0) / runs.length * 10) / 10;
    const gains = Object.fromEntries(trip.gives.map(ing => [ing, average(run => run.gains[ing] ?? 0)]));
    const total = average(run => Object.values(run.gains).reduce((sum, n) => sum + (n ?? 0), 0));
    const portions = trip.gives.map(ing => {
      const dishes = DISHES.filter(d => d.need[ing]);
      const use = dishes.reduce((sum, d) => sum + d.need[ing]!, 0) / dishes.length;
      return (gains[ing] ?? 0) / use;
    }).reduce((a, b) => a + b, 0);
    return { difficulty: diff.id, wpm, trip: trip.id, gains, total, portions: Math.round(portions * 10) / 10, seconds: average(run => run.elapsed) };
  })));
}

describe('WPM別の調達バランス', () => {
  it('難易度とWPMごとの比較を再現できる', { timeout: 30000 }, () => {
    const rows = procurementRows();
    if (import.meta.env.VITE_PROCUREMENT_REPORT) console.log('PROCUREMENT_REPORT', JSON.stringify(rows));
    expect(rows).toHaveLength(60);
    for (const row of rows) expect(row.total).toBeGreaterThan(0);
    for (const diff of DIFFICULTIES) for (const trip of TRIPS) {
      const slow = rows.find(r => r.difficulty === diff.id && r.trip === trip.id && r.wpm === 30)!;
      const fast = rows.find(r => r.difficulty === diff.id && r.trip === trip.id && r.wpm === 90)!;
      expect(fast.total / fast.seconds).toBeGreaterThan(slow.total / slow.seconds * 1.25);
    }
    // 主材料の供給効率が特定の調達だけに偏らない（釣りの延長時間も含める）。
    for (const difficulty of ['easy', 'normal', 'hard']) for (const wpm of [45, 60, 90, 120]) {
      const fish = rows.find(r => r.difficulty === difficulty && r.trip === 'fishing' && r.wpm === wpm)!;
      const meat = rows.find(r => r.difficulty === difficulty && r.trip === 'hunting' && r.wpm === wpm)!;
      const ratio = (fish.total / fish.seconds) / (meat.total / meat.seconds);
      expect(ratio).toBeGreaterThan(.8);
      expect(ratio).toBeLessThan(1.25);
    }
  });
});
