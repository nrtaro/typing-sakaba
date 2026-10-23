// バランス確認：一定の速さで打つボットに3分の営業を通しで遊ばせる
import { describe, expect, it } from 'vitest';
import { Shop } from '../src/core/shop';
import { createMinigame, GatheringGame, type Minigame } from '../src/core/minigames';
import { Rng } from '../src/core/rng';
import { RomajiMatcher } from '../src/core/romaji';
import { SHOP, SOURCE, TRIPS, rankFor } from '../src/core/shopConfig';

function nextKey(input: { active: { target: { id: string }; matcher: RomajiMatcher }[] }, targets: { id: string; kana: string }[], pick: (id: string) => boolean) {
  const live = input.active.find((l) => pick(l.target.id)) ?? input.active[0];
  if (live) return live.matcher.remaining[0];
  const t = targets.find((x) => pick(x.id));
  return t ? new RomajiMatcher(t.kana).remaining[0] : null;
}

export function playDay(seed: number, kps: number, missRate = 0.04) {
  const shop = new Shop(new Rng(seed));
  const rng = new Rng(seed + 99);
  let trip: { game: Minigame<unknown>; phase: 'intro' | 'game' | 'outro'; t: number } | null = null;
  let acc = 0;
  const dt = 1 / 60;
  while (!shop.ended) {
    shop.update(dt);
    for (const ev of shop.drainEvents()) {
      if (ev.type === 'tripStart') trip = { game: createMinigame(ev.trip.id, new Rng(seed + shop.stats.trips)), phase: 'intro', t: SHOP.tripIntro };
    }
    if (trip) {
      trip.t -= dt;
      if (trip.phase === 'intro' && trip.t <= 0) trip.phase = 'game';
      else if (trip.phase === 'game') {
        trip.game.update(dt);
        if (trip.game.finished) { trip.phase = 'outro'; trip.t = SHOP.tripIntro; }
      } else if (trip.phase === 'outro' && trip.t <= 0) {
        shop.returnFromTrip(trip.game.result().gains);
        trip = null;
      }
    }
    acc += kps * dt;
    while (acc >= 1) {
      acc -= 1;
      let k: string | null = null;
      if (trip?.phase === 'game') {
        const g = trip.game;
        k = nextKey(g.input, g.targets(), (id) => !(g instanceof GatheringGame) || !!g.sprouts.find((s) => s.id === id)?.ing);
        if (k) {
          if (rng.next() < missRate) g.key('q');
          else g.key(k);
        }
      } else if (!trip) {
        // 作れない注文が待ちきれなくなりそうなら先に調達、そうでなければ作れる注文を急ぐ順に。
        // 手が空いたら残りの少ない素材を取りに行く
        const waiting = shop.seats.map((g, i) => ({ g, i })).filter((x) => x.g?.state === 'wait');
        const makeable = waiting.filter((x) => shop.canMake(x.g!.dish).length === 0).sort((a, b) => a.g!.wait - b.g!.wait);
        const blocked = waiting.filter((x) => shop.canMake(x.g!.dish).length > 0).sort((a, b) => a.g!.wait - b.g!.wait);
        let want: string | null = null;
        if (blocked.length && (blocked[0].g!.wait / blocked[0].g!.maxWait < 0.6 || makeable.length === 0)) want = `trip:${SOURCE[shop.canMake(blocked[0].g!.dish)[0]]}`;
        else if (makeable.length) want = `seat:${makeable[0].i}`;
        else {
          const low = (Object.keys(shop.stock) as (keyof typeof shop.stock)[]).sort((a, b) => shop.stock[a] - shop.stock[b])[0];
          if (shop.stock[low] <= 1) want = `trip:${SOURCE[low]}`;
        }
        if (want) {
          k = nextKey(shop.input, shop.targets(), (id) => id === want);
          if (k) {
            if (rng.next() < missRate) shop.key('q');
            else shop.key(k);
          }
        }
      }
      if (!k) { acc = 0; break; }
    }
  }
  return { score: shop.score, ...shop.stats };
}

describe('一日のバランス', () => {
  it('技能別のスコア（参考表示）と、速いほど高得点', () => {
    const rows: Record<string, unknown> = {};
    const avg: Record<number, number> = {};
    for (const kps of [2.5, 4, 5.5, 7]) {
      const runs = [1, 2, 3, 4, 5].map((s) => playDay(s, kps));
      const mean = (f: (r: (typeof runs)[number]) => number) => Math.round(runs.reduce((a, r) => a + f(r), 0) / runs.length);
      avg[kps] = mean((r) => r.score);
      rows[`${kps}打鍵/秒`] = { score: avg[kps], rank: rankFor(avg[kps]).name, served: mean((r) => r.served), angry: mean((r) => r.angry), trips: mean((r) => r.trips), maxCombo: mean((r) => r.maxCombo) };
    }
    console.table(rows);
    expect(avg[4]).toBeGreaterThan(avg[2.5]);
    expect(avg[5.5]).toBeGreaterThan(avg[4]);
    expect(avg[7]).toBeGreaterThan(avg[5.5]);
  });

  it('調達をしないと素材が尽きて売上が伸びない', () => {
    const lazy = new Shop(new Rng(1));
    while (!lazy.ended) lazy.update(1 / 60);
    expect(TRIPS.length).toBe(4);
    expect(playDay(1, 4).score).toBeGreaterThan(lazy.score);
  });
});
