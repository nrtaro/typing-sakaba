// 繁盛記を通しで遊ぶボット（バランスの確認用）。一定の速さで打ち、方針は決めた作戦で選ぶ。
import { PlaySession } from '../src/core/session';
import { Rng } from '../src/core/rng';
import { RomajiMatcher } from '../src/core/romaji';
import { GatheringGame } from '../src/core/minigames';
import { SOURCE, TRIPS, type IngredientId } from '../src/core/shopConfig';
import { modsFor, type PolicyId } from '../src/core/build';
import { applyOffer, closeDay, dayPlan, emptyMeta, newRun, offersFor, roadOffers, roadOf, takeRoad, PICKS_PER_DAY, RUN_DAYS, type Offer, type RoadId, type RunMeta, type RunState } from '../src/core/run';

export type Strategy = { name: string; pick: (offers: Offer[], run: RunState, rng: Rng) => { offer: Offer; drop: PolicyId | null } | null; reroll?: (offers: Offer[], run: RunState) => boolean; road?: (ids: RoadId[], run: RunState, rng: Rng) => RoadId };

/** 好きな順に選ぶ作戦（上にあるものほど優先。持っていれば強化も取る） */
export function prefer(name: string, order: PolicyId[], road?: Strategy['road']): Strategy {
  return {
    name, road,
    reroll: (offers) => !offers.some((o) => order.slice(0, 3).includes(o.id) || o.kind === 'up' && order.includes(o.id)),
    pick: (offers, run) => {
      const score = (o: Offer) => { const i = order.indexOf(o.id); return i < 0 ? -1 : (order.length - i) * 10 + (o.kind === 'up' ? 3 : 0); };
      const best = [...offers].sort((a, b) => score(b) - score(a))[0];
      if (!best) return null;
      if (best.kind !== 'swap') return { offer: best, drop: null };
      if (score(best) < 0) return null;
      // 入れ替え：好みにない方針（なければいちばん下の好み）を外す
      const rank = (id: PolicyId) => order.includes(id) ? order.indexOf(id) : order.length;
      const worst = [...run.owned].sort((a, b) => rank(b.id) - rank(a.id))[0];
      const drop = worst && rank(best.id) < rank(worst.id) ? worst : null;
      return drop ? { offer: best, drop: drop.id } : (offers.find((o) => o.kind === 'up') ? { offer: offers.find((o) => o.kind === 'up')!, drop: null } : null);
    },
  };
}
export const RANDOM: Strategy = {
  name: 'でたらめ',
  road: (ids, _run, rng) => ids[Math.floor(rng.next() * ids.length)],
  pick: (offers, run, rng) => {
    const o = offers[Math.floor(rng.next() * offers.length)];
    return o ? { offer: o, drop: o.kind === 'swap' ? run.owned[Math.floor(rng.next() * run.owned.length)].id : null } : null;
  },
};
export const NONE: Strategy = { name: '方針なし', pick: () => null };

export interface BotRun { cleared: boolean; day: number; days: { sales: number; goal: number; served: number; angry: number; maxCombo: number; maxChain: number; trips: number; lack: number; seconds: number }[]; meta: RunMeta; run: RunState; keys: number; rerollsUsed: number; picks: number }

/** 所持方針との相性と目標の軽さで、実際に提示された営業から選ぶ。 */
function suitableRoad(ids: RoadId[], run: RunState): RoadId {
  const score = (id: RoadId) => {
    const road = roadOf(id);
    const levels = run.owned.filter((o) => road.good.includes(o.id)).reduce((sum, o) => sum + o.lv, 0);
    return (1 + levels * 0.12) / road.goalMult;
  };
  return [...ids].sort((a, b) => score(b) - score(a))[0];
}

/** 1回の挑戦を最後まで（目標に届かなくても forceAll なら4日間続けて、日ごとの売上を見る） */
export function botRun(seed: number, strat: Strategy, kps: number, missRate: number, loop = 1, meta: RunMeta = emptyMeta(), forceAll = false, think = 0.4): BotRun {
  meta.loop = loop;
  const run = newRun(meta, seed, `bot-${seed}`);
  const rng = new Rng(seed * 13 + 5);
  const days: BotRun['days'] = [];
  let keys = 0;
  let rerollsUsed = 0;
  let picks = 0;
  let cleared = false;
  const doPick = (slot: number, session: PlaySession | null) => {
    let rerolled = 0;
    let offers = offersFor(run, meta, slot, rerolled);
    while (run.rerolls > 0 && strat.reroll?.(offers, run)) {
      run.rerolls--;
      rerollsUsed++;
      offers = offersFor(run, meta, slot, ++rerolled);
    }
    const c = strat.pick(offers, run, rng);
    if (!c) return;
    const r = applyOffer(run, c.offer, c.drop);
    if (r) picks++;
    if (r && session) {
      for (const id of Object.keys(session.shop.stock) as IngredientId[]) session.shop.stock[id] += r.stock;
      session.shop.build = modsFor(run.owned, dayPlan(run, meta).base);
    }
  };
  for (;;) {
    doPick(0, null);
    run.stage = 'open';
    const plan = dayPlan(run, meta);
    const s = new PlaySession(plan.seed, plan.difficulty, plan.rules, null, plan.mods);
    let acc = 0;
    let lack = 0;
    let slot = 1;
    let pendingSlot: number | null = null;
    let aim: string | null = null;
    let lastDone = 0;
    let pause = 0;
    while (!s.finished) {
      s.tick();
      for (const e of s.drain()) {
        if (e.src === 'shop' && e.ev.type === 'lack') lack++;
        if (e.src === 'shop' && e.ev.type === 'phase' && slot < PICKS_PER_DAY) pendingSlot = slot++;
      }
      if (pendingSlot !== null && !s.trip && !s.finished) {
        if (s.shop.timeLeft >= 8) doPick(pendingSlot, s);
        pendingSlot = null;
      }
      // 言葉を打ち終えたあと、次の言葉を読む間は手が止まる
      const served = s.shop.stats.served + s.shop.stats.trips;
      if (served !== lastDone) { lastDone = served; pause = think; }
      if (pause > 0) { pause -= 1 / 60; continue; }
      acc += kps / 60;
      while (acc >= 1 && !s.finished) {
        acc -= 1;
        keys++;
        const miss = rng.next() < missRate;
        const trip = s.trip;
        if (trip?.phase === 'game') {
          const g = trip.game;
          const live = g.input.active[0];
          const ts = g.targets() as { id: string; kana: string }[];
          const t = ts.find((x) => !(g instanceof GatheringGame) || !!g.sprouts.find((sp) => sp.id === x.id)?.ing);
          const k = live ? live.matcher.remaining[0] : t ? new RomajiMatcher(t.kana).remaining[0] : null;
          if (k) s.input(miss ? 'q' : k);
          continue;
        }
        if (trip) continue;
        const shop = s.shop;
        // 打ちかけの言葉は、狙った候補を最後まで打つ（ローマ字の頭が同じ別の候補に流れない）
        const live = shop.input.active.find((l) => l.target.id === aim) ?? shop.input.active[0];
        if (live) { s.input(miss ? 'q' : live.matcher.remaining[0]); continue; }
        const waiting = shop.seats.map((g, i) => ({ g, i })).filter((x) => x.g?.state === 'wait');
        const ok = waiting.filter((x) => !shop.canMake(x.g!.dish).length).sort((a, b) => a.g!.wait - b.g!.wait)[0];
        const blocked = waiting.find((x) => shop.canMake(x.g!.dish).length);
        // 手が空いていて素材が少なければ、先に取りに行く
        const low = !ok && !blocked ? TRIPS.map((t) => ({ t, n: Math.min(...t.gives.map((g) => shop.stock[g])) })).sort((a, b) => a.n - b.n)[0] : null;
        const want = ok ? `seat:${ok.i}` : blocked ? `trip:${SOURCE[shop.canMake(blocked.g!.dish)[0]]}` : low && low.n <= 3 ? `trip:${low.t.id}` : null;
        const target = shop.targets().find((t) => t.id === want);
        aim = want;
        if (target) s.input(miss ? 'q' : new RomajiMatcher(target.kana).remaining[0]);
      }
    }
    const st = s.shop.stats;
    const b = s.shop.buildStats;
    days.push({ sales: s.shop.score, goal: plan.goal, served: st.served, angry: st.angry, maxCombo: st.maxCombo, maxChain: b.maxChain, trips: st.trips, lack, seconds: s.elapsed });
    const day = run.day;
    const copy = forceAll ? { ...run, days: [...run.days], owned: run.owned.map((o) => ({ ...o })), yen: { ...run.yen }, pairs: [...run.pairs] } : run;
    const out = closeDay(copy, meta, { sales: s.shop.score, served: st.served, maxCombo: st.maxCombo, angry: st.angry, build: b });
    if (forceAll) { run.days = copy.days; run.yen = copy.yen; run.pairs = copy.pairs; }
    if (out.cleared) cleared = true;
    if (day >= RUN_DAYS - 1 || (!out.passed && !forceAll)) break;
    const roads = roadOffers(run.seed, run.day).map((r) => r.id);
    const road = strat.road ? strat.road(roads, run, rng) : suitableRoad(roads, run);
    if (!roads.includes(road)) throw new Error(`候補にない営業を選びました: ${road}`);
    takeRoad(run, meta, road);
  }
  return { cleared, day: run.day, days, meta, run, keys, rerollsUsed, picks };
}
