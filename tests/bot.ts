// 1/60秒刻みの営業を遊ぶボット（記録のやり直しの確認と、処理時間の計測に使う）
import { PlaySession } from '../src/core/session';
import type { DayRules } from '../src/core/daily';
import { Rng } from '../src/core/rng';
import { RomajiMatcher } from '../src/core/romaji';
import { GatheringGame } from '../src/core/minigames';
import { SOURCE, difficultyOf, type DifficultyId, type IngredientId } from '../src/core/shopConfig';

/** 1秒に kps 回、それらしいキーを押すボット。ミス・打ち直し・途中帰還もときどき混ぜる */
export function botPlay(seed: number, diff: DifficultyId, rules: DayRules, kps = 5, prep: Record<IngredientId, number> | null = null) {
  const s = new PlaySession(seed, difficultyOf(diff), rules, prep);
  const rng = new Rng(seed * 31 + 7);
  let acc = 0;
  while (!s.finished) {
    s.tick();
    s.drain();
    acc += kps / 60;
    while (acc >= 1 && !s.finished) {
      acc -= 1;
      const r = rng.next();
      if (r < 0.03) { s.input('q'); continue; }
      if (r < 0.035) { s.input('Backspace'); continue; }
      if (r < 0.04) { s.input(' '); continue; }
      const trip = s.trip;
      if (trip?.phase === 'game') {
        if (r > 0.995) { s.input('Enter'); continue; }
        const g = trip.game;
        const live = g.input.active[0];
        const ts = g.targets() as { id: string; kana: string }[];
        const t = ts.find((x) => !(g instanceof GatheringGame) || !!g.sprouts.find((sp) => sp.id === x.id)?.ing);
        const k = live ? live.matcher.remaining[0] : t ? new RomajiMatcher(t.kana).remaining[0] : null;
        if (k) s.input(k);
        continue;
      }
      if (trip) continue;
      const shop = s.shop;
      const live = shop.input.active[0];
      if (live) { s.input(live.matcher.remaining[0]); continue; }
      const waiting = shop.seats.map((g, i) => ({ g, i })).filter((x) => x.g?.state === 'wait');
      const ok = waiting.filter((x) => !shop.canMake(x.g!.dish).length).sort((a, b) => a.g!.wait - b.g!.wait)[0];
      const blocked = waiting.find((x) => shop.canMake(x.g!.dish).length);
      const want = ok ? `seat:${ok.i}` : blocked ? `trip:${SOURCE[shop.canMake(blocked.g!.dish)[0]]}` : null;
      const target = shop.targets().find((t) => t.id === want);
      if (target) s.input(new RomajiMatcher(target.kana).remaining[0]);
    }
  }
  return s;
}

