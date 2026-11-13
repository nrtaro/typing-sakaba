// 繁盛記：方針のはたらき・進行・保存・限定の飾り
import { describe, expect, it } from 'vitest';
import { Shop, type Guest } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DISHES, DIFFICULTIES } from '../src/core/shopConfig';
import { NORMAL_RULES } from '../src/core/daily';
import { MAX_LEVEL, MAX_SLOTS, PAIRS, POLICIES, REFILL_EAT, SETS, SET_BONUS, setKey, descDiff, descOf, emptyMods, modsFor, pairBonus, pairKey, partnersOf, policyOf } from '../src/core/build';
import {
  GOAL_BASE, RUN_ACHIEVEMENTS, RUN_DAYS, applyOffer, closeDay, coinsFor, dayDifficulty, dayPlan, earnedAchievements, emptyMeta, goalFor,
  loopEveryMult, loopGoalMult, loopWaitMult, newRun, offersFor, readMeta, roadOffers, takeRoad, trialMods, trialsFor, walkMult,
} from '../src/core/run';
import { emptyBuildStats } from '../src/core/build';
import { ITEMS, achievementItem, emptyCollection, itemById, owns, setEquip } from '../src/core/collection';
import { SaveStore, type KeyValueStore } from '../src/core/save';
import { readDecoration } from '../src/core/ranking';
import { PlaySession, replay } from '../src/core/session';
import { RomajiMatcher } from '../src/core/romaji';
import { botRun, prefer, NONE, RANDOM } from './runBot';

const dish = (id: string) => DISHES.find((d) => d.id === id)!;
const guest = (id: string, wait = 20): Guest => ({ id: Math.random(), dish: dish(id), look: 0, wait, maxWait: 30, state: 'wait', t: 0, lack: 0 });
function shopWith(owned: Parameters<typeof modsFor>[0], seats: (string | null)[]) {
  const s = new Shop(new Rng(1), DIFFICULTIES[1], NORMAL_RULES, modsFor(owned));
  for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 30;
  seats.forEach((id, i) => { s.seats[i] = id ? guest(id) : null; });
  return s;
}
function type(s: Shop, kana: string) {
  for (const ch of new RomajiMatcher(kana).remaining) s.key(ch);
  return s.drainEvents();
}
function memory(): KeyValueStore {
  const m = new Map<string, string>();
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

describe('方針のはたらき', () => {
  it('方針なしの営業は、今までと同じ売上になる', () => {
    const a = new Shop(new Rng(7), DIFFICULTIES[1]);
    a.seats[0] = guest('grilledFish');
    a.stock.fish = 9;
    const ev = type(a, 'やきざかな').find((e) => e.type === 'serve')!;
    expect(ev.type === 'serve' && ev.gain).toBe(120 + Math.round((20 / 30) * 60));
    expect(ev.type === 'serve' && ev.tags).toBeUndefined();
  });

  it('まとめ出し：同じ主素材の注文が、段階の数だけいっしょに出る', () => {
    const s = shopWith([{ id: 'matome', lv: 2 }], ['grilledFish', 'fishFry', 'herbFish', 'sakeFish', 'vegSoup']);
    const evs = type(s, 'やきざかな');
    const serves = evs.filter((e) => e.type === 'serve');
    expect(serves).toHaveLength(3);
    expect(evs.find((e) => e.type === 'chain')).toMatchObject({ count: 3 });
    expect(s.combo).toBe(3);
    expect(s.seats[4]!.state).toBe('wait');
    expect(s.buildStats.maxChain).toBe(3);
  });

  it('まとめ出し：素材が足りない注文は連れていかない', () => {
    const s = shopWith([{ id: 'matome', lv: 3 }], ['grilledFish', 'fishFry', 'herbFish']);
    s.stock.spice = 0;
    const serves = type(s, 'やきざかな').filter((e) => e.type === 'serve');
    expect(serves).toHaveLength(2);
    expect(s.seats[1]!.state).toBe('wait');
  });

  it('かけ合わせ：名前付きの2つが同じ皿に効くと、1組につき売上が増える', () => {
    const one = shopWith([{ id: 'matome', lv: 1 }], ['grilledFish', 'driedFish']);
    const two = shopWith([{ id: 'matome', lv: 1 }, { id: 'mouippai', lv: 1 }], ['grilledFish', 'driedFish']);
    const g1 = type(one, 'やきざかな').filter((e) => e.type === 'serve')[0];
    const g2 = type(two, 'やきざかな').filter((e) => e.type === 'serve')[0];
    if (g1.type !== 'serve' || g2.type !== 'serve') throw new Error('serve');
    expect(g2.pairs).toBe(1);
    expect(g2.pair).toBe(pairKey('matome', 'mouippai'));
    expect(g2.gain).toBe(Math.round((g1.gain + 90) * (1 + pairBonus(1, 1))));
    expect(g2.pairMult).toBeCloseTo(1.2);
    expect(two.stock.ale).toBe(28);
    expect(two.buildStats.pairs).toEqual([pairKey('matome', 'mouippai')]);
  });

  it('領収書はいらない：コンボ倍率の上限が上がる／大入り袋：10コンボごとに大入り', () => {
    const s = shopWith([{ id: 'ryoshusho', lv: 3 }, { id: 'ooiri', lv: 1 }], []);
    s.combo = 69;
    expect(s.multiplier).toBe(3.5);
    s.seats[0] = guest('grilledFish');
    const evs = type(s, 'やきざかな');
    expect(evs.some((e) => e.type === 'fever' && e.on)).toBe(true);
    expect(s.fever).toBe(true);
    s.update(5.1);
    expect(s.fever).toBe(false);
    expect(s.drainEvents().some((e) => e.type === 'fever' && !e.on)).toBe(true);
  });

  it('さっきのヌシ：調達から帰ると、次の数皿がとれたて', () => {
    const s = shopWith([{ id: 'nushi', lv: 1 }], ['grilledFish']);
    s.away = { id: 'fishing', text: '', kana: 'つり', who: 'wife', act: '', place: '', gives: ['fish'], minimum: { fish: 4 } };
    s.returnFromTrip({ fish: 5 });
    expect(s.fresh).toBe(14);
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    expect(ev.type === 'serve' && ev.tags).toContain('nushi');
    s.update(15);
    expect(s.fresh).toBe(0);
  });

  it('看板娘の愛想：怒って帰っても、段階しだいで減点なし・コンボが続く', () => {
    const s = shopWith([{ id: 'aiso', lv: 3 }], ['grilledFish']);
    s.score = 500;
    s.combo = 5;
    s.seats[0]!.wait = 0.01;
    s.update(0.05);
    expect(s.stats.angry).toBe(1);
    expect(s.score).toBe(500);
    expect(s.combo).toBe(5);
  });

  it('方針は20種類。段階ごとの値があり、打つ言葉は互いの頭にならない。どの方針にも、かけ合わせの相手が2つ以上ある', () => {
    expect(POLICIES).toHaveLength(20);
    for (const p of POLICIES) {
      expect(p.vals).toHaveLength(MAX_LEVEL);
      expect(descOf(p.id, 1)).not.toContain('{');
      expect(partnersOf(p.id).length).toBeGreaterThanOrEqual(2);
      for (const q of POLICIES) if (p !== q) expect(q.kana.startsWith(p.kana)).toBe(false);
      expect('ひきなおし'.startsWith(p.kana) || p.kana.startsWith('ひきなおし') || p.kana === 'やめる').toBe(false);
    }
    // 店全体に効く方針どうしの組は作らない（どちらかは皿に効く）
    for (const p of PAIRS) expect(policyOf(p.a).fires || policyOf(p.b).fires).toBe(true);
    expect(new Set(PAIRS.map((p) => pairKey(p.a, p.b))).size).toBe(PAIRS.length);
    expect(emptyMods().comboCap).toBe(2);
  });
});

describe('作り直した方針', () => {
  it('まとめ出し：ついでの皿は割安（単体では稼ぎすぎない）', () => {
    const s = shopWith([{ id: 'matome', lv: 1 }], ['grilledFish', 'driedFish']);
    const [a, b] = type(s, 'やきざかな').filter((e) => e.type === 'serve');
    if (a.type !== 'serve' || b.type !== 'serve') throw new Error('serve');
    expect(b.gain).toBe(Math.round(a.gain * 0.6));
  });

  it('おやじの見栄：いま一番少ない素材を使う皿だけ、売上が上がる', () => {
    const s = shopWith([{ id: 'mie', lv: 1 }], ['grilledFish', 'vegSoup']);
    s.stock.fish = 5;
    expect(s.scarcest()).toEqual(['fish']);
    const fish = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    expect(fish.type === 'serve' && fish.tags).toContain('mie');
    s.stock.fish = 40;
    s.stock.meat = 1;
    const veg = type(s, 'おんやさいもり').find((e) => e.type === 'serve')!;
    expect(veg.type === 'serve' && veg.tags).not.toContain('mie');
  });

  it('大盛り上等：素材を2倍使い、売上が上がる。大漁旗を持っていると、かけ合わせになる', () => {
    const s = new Shop(new Rng(3), DIFFICULTIES[1], NORMAL_RULES, modsFor([{ id: 'oomori', lv: 3 }, { id: 'tairyo', lv: 3 }], { bigChance: 1 }));
    for (let i = 0; i < 400 && !s.seats.some((g) => g?.state === 'wait'); i++) s.update(0.1);
    const i = s.seats.findIndex((g) => g?.state === 'wait');
    const g = s.seats[i]!;
    expect(g.big).toBe(true);
    const base = DISHES.find((d) => d.id === g.dish.id)!;
    expect(g.dish.price).toBe(Math.round(base.price * 3.3));
    for (const [k, n] of Object.entries(base.need)) expect(g.dish.need[k as keyof typeof base.need]).toBe(n! * 2);
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 30;
    s.drainEvents();
    const ev = type(s, g.dish.kana).find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.tags).toContain('oomori');
    expect(ev.pair).toBe(pairKey('oomori', 'tairyo'));
    expect(ev.pairMult).toBeCloseTo(1 + pairBonus(3, 3));
  });

  it('予約のみ：1皿でコンボがよけいに進む／おもてなし：間があくほどチップが増える', () => {
    const s = shopWith([{ id: 'yoyaku', lv: 3 }, { id: 'omotenashi', lv: 1 }], ['grilledFish', 'vegSoup']);
    s.clock = 20;
    s.lastServeAt = 15;
    const a = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    expect(s.combo).toBe(4);
    expect(a.type === 'serve' && a.tags).toContain('omotenashi');
    expect(a.type === 'serve' && a.pair).toBe(pairKey('omotenashi', 'yoyaku'));
    // 続けてすぐ出した皿には、間のチップは付かない
    const b = type(s, 'おんやさいもり').find((e) => e.type === 'serve')!;
    expect(b.type === 'serve' && b.tags).not.toContain('omotenashi');
    expect(s.combo).toBe(8);
  });

  it('こまめな仕込み：時間帯が変わるたびに素材が増える／おかわりのお客は早く食べ終える', () => {
    const s = shopWith([{ id: 'shikomi', lv: 1 }, { id: 'betsubara', lv: 1 }], ['grilledFish']);
    s.seats[0]!.extra = dish('vegSoup');
    type(s, 'やきざかな');
    expect(s.seats[0]!.t).toBe(REFILL_EAT);
    const before = s.stock.meat;
    s.clock = 49.99;
    s.update(0.05);
    expect(s.stock.meat).toBe(before + 2);
    expect(s.drainEvents().some((e) => e.type === 'restock')).toBe(true);
  });

  it('強化の説明は、変わる数字を「前→後」で見せる', () => {
    const parts = descDiff('betsubara', 1, 2);
    expect(parts.filter((x) => x.hot).map((x) => x.t)).toEqual(['35%→50%', '2→2.8']);
    expect(descDiff('ryoshusho', 2, 3).filter((x) => x.hot).map((x) => x.t)).toEqual(['3→3.5']);
  });
});

describe('一発勝負・連打の熱・朝市・延長営業と、型', () => {
  it('一発勝負：ミスなしの皿は売上が上がり、ミスした言葉の皿は下がる（打った皿だけ）', () => {
    const plain = shopWith([], ['grilledFish', 'vegSoup']);
    const base = type(plain, 'やきざかな').find((e) => e.type === 'serve')!;
    const s = shopWith([{ id: 'ippatsu', lv: 1 }], ['grilledFish', 'vegSoup']);
    const a = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (a.type !== 'serve' || base.type !== 'serve') throw new Error('serve');
    expect(a.clean).toBe(true);
    expect(a.tags).toContain('ippatsu');
    expect(a.gain).toBe(Math.round(base.gain * 1.4));
    s.key('q');
    const b = type(s, 'おんやさいもり').find((e) => e.type === 'serve')!;
    if (b.type !== 'serve') throw new Error('serve');
    expect(b.clean).toBe(false);
    expect(b.tags).not.toContain('ippatsu');
    expect(s.wordMisses).toBe(0);
  });

  it('連打の熱：3秒以内に続けて打って出すと倍率が上がり、間があくと冷める', () => {
    const s = shopWith([{ id: 'netsu', lv: 1 }], []);
    const D = (id: string) => dish(id);
    const order = ['grilledFish', 'vegSoup', 'ale', 'mushSaute', 'jerky'];
    const heats: number[] = [];
    for (const id of order) {
      s.seats[0] = guest(id);
      const ev = type(s, D(id).kana).find((e) => e.type === 'serve')!;
      if (ev.type !== 'serve') throw new Error('serve');
      heats.push(ev.heat!);
      s.clock += 1;
    }
    expect(heats.map((h) => Math.round(h * 10) / 10)).toEqual([1, 1.1, 1.2, 1.3, 1.4]);
    s.clock += 5;
    s.seats[0] = guest('grilledFish');
    const cold = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    expect(cold.type === 'serve' && cold.heat).toBe(1);
  });

  it('連打の熱は、まとめ出しのついでの皿には付かない', () => {
    const s = shopWith([{ id: 'netsu', lv: 3 }, { id: 'matome', lv: 1 }], ['grilledFish', 'driedFish']);
    s.heat = 1;
    (s as unknown as { lastTypedAt: number }).lastTypedAt = s.clock;
    const [a, b] = type(s, 'やきざかな').filter((e) => e.type === 'serve');
    if (a.type !== 'serve' || b.type !== 'serve') throw new Error('serve');
    expect(a.tags).toContain('netsu');
    expect(b.tags).not.toContain('netsu');
  });

  it('朝市：朝の調達は多く、昼と夜の調達は少なく持ち帰る', () => {
    const trip = { id: 'fishing' as const, text: '', kana: 'つり', who: 'wife' as const, act: '', place: '', gives: ['fish' as const], minimum: { fish: 4 } };
    const go = (clock: number) => {
      const s = shopWith([{ id: 'asaichi', lv: 1 }], []);
      s.stock.fish = 0;
      s.clock = clock;
      (s as unknown as { awayPhase: number }).awayPhase = s.phaseIndex;
      s.away = trip;
      s.returnFromTrip({ fish: 10 });
      return s.stock.fish;
    };
    expect(go(10)).toBe(25);
    expect(go(70)).toBe(9);
  });

  it('延長営業：閉店の時点でコンボが30以上なら、1回だけ営業が延びる', () => {
    const s = shopWith([{ id: 'encho', lv: 2 }], []);
    s.clock = 179.99;
    s.combo = 30;
    s.update(0.05);
    expect(s.ended).toBe(false);
    expect(s.extra).toBe(15);
    expect(s.drainEvents().some((e) => e.type === 'extend')).toBe(true);
    s.update(15.1);
    expect(s.ended).toBe(true);
    const low = shopWith([{ id: 'encho', lv: 3 }], []);
    low.clock = 179.99;
    low.combo = 29;
    low.update(0.05);
    expect(low.ended).toBe(true);
  });

  it('型：3つがそろって打った皿に効くと、売上が大きく増え、初めてなら記録される', () => {
    const owned = [{ id: 'netsu' as const, lv: 1 }, { id: 'sekkachi' as const, lv: 1 }, { id: 'ooiri' as const, lv: 1 }];
    const s = shopWith(owned, []);
    s.heat = 0.5;
    (s as unknown as { lastTypedAt: number }).lastTypedAt = s.clock;
    s.feverUntil = s.clock + 5;
    s.seats[0] = guest('grilledFish', 30);
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.sets).toBe(1);
    expect(ev.set).toBe(setKey(SETS[0]));
    // 中のかけ合わせ（熱×即出・熱×大入り）に、型の分が足される
    expect(ev.pairMult).toBeCloseTo(1 + pairBonus(1, 1) * 2 + SET_BONUS);
    expect(s.buildStats.sets).toEqual([setKey(SETS[0])]);
  });

  it('型は7つ。どれも3つの方針で、まとめ出しは入らず、皿に効く方針を1つ以上含む。新しい4つにも相手が2つ以上ある', () => {
    expect(SETS).toHaveLength(7);
    for (const x of SETS) {
      expect(new Set(x.ids).size).toBe(3);
      expect(x.ids).not.toContain('matome');
      expect(x.ids.some((id) => policyOf(id).fires)).toBe(true);
    }
    for (const id of ['ippatsu', 'netsu', 'asaichi', 'encho'] as const) expect(partnersOf(id).length).toBeGreaterThanOrEqual(2);
  });

  it('残りの2つを持っていれば、候補に「これで型がそろう」と出る', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 1, 'set');
    run.owned = [{ id: 'netsu', lv: 1 }, { id: 'sekkachi', lv: 1 }];
    meta.policies = ['ooiri'];
    let seen = false;
    for (let r = 0; r < 60 && !seen; r++) {
      const o = offersFor(run, meta, 1, r).find((x) => x.id === 'ooiri');
      if (o) { expect(o.link).toContain('疾風の型'); expect(o.hot).toBe(true); seen = true; }
    }
    expect(seen).toBe(true);
  });

  it('見つけた型は保存され、壊れた値は捨てる', () => {
    const meta = emptyMeta();
    meta.sets = [setKey(SETS[1]), 'set:nope'];
    expect(readMeta(JSON.parse(JSON.stringify(meta))).sets).toEqual([setKey(SETS[1])]);
  });
});

describe('進行', () => {
  it('候補は種から決まり、開き直しても同じ。引き直すと変わる', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 12345, 'a');
    expect(offersFor(run, meta, 0, 0)).toEqual(offersFor(run, meta, 0, 0));
    expect(offersFor(run, meta, 0, 0)).toHaveLength(3);
    expect(offersFor(run, meta, 0, 1).map((o) => o.id)).not.toEqual(offersFor(run, meta, 0, 0).map((o) => o.id));
    // まだ解放していない方針は出ない
    for (let r = 0; r < 30; r++) for (const o of offersFor(run, meta, 0, r)) expect(policyOf(o.id).starter).toBe(true);
  });

  it('12回選んでも枠は5つまで。満枠では強化と入れ替えが出て、選べない候補は出ない', () => {
    const meta = emptyMeta();
    meta.policies = ['oomori', 'ooiri', 'makanai'];
    for (let seed = 1; seed <= 20; seed++) {
      const run = newRun(meta, seed, 'a');
      for (let day = 0; day < RUN_DAYS; day++) {
        run.day = day;
        for (let slot = 0; slot < 3; slot++) {
          const offers = offersFor(run, meta, slot, 0);
          expect(offers.length).toBeGreaterThan(0);
          expect(new Set(offers.map((o) => o.id)).size).toBe(offers.length);
          for (const o of offers) {
            const cur = run.owned.find((x) => x.id === o.id);
            if (o.kind === 'up') expect(cur && cur.lv < MAX_LEVEL).toBe(true);
            else expect(cur).toBeUndefined();
            expect(o.kind === 'swap').toBe(o.kind !== 'up' && run.owned.length >= MAX_SLOTS);
          }
          const o = offers[(seed + slot) % offers.length];
          expect(applyOffer(run, o, o.kind === 'swap' ? run.owned[0].id : null)).not.toBeNull();
          expect(run.owned.length).toBeLessThanOrEqual(MAX_SLOTS);
        }
      }
    }
  });

  it('目標に届かなければ、その日で終わる。届けば次の日へ、4日目でクリアして、のれんが1枚増える', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 5, 'r1');
    meta.active = run;
    const facts = (sales: number) => ({ sales, served: 30, maxCombo: 12, angry: 0, build: emptyBuildStats() });
    for (let d = 0; d < RUN_DAYS; d++) {
      const goal = goalFor(d, 1, run.road);
      expect(dayPlan(run, meta).goal).toBe(goal);
      const out = closeDay(run, meta, facts(goal));
      expect(out.passed).toBe(true);
      if (d < RUN_DAYS - 1) {
        expect(run.stage).toBe('closed');
        const roads = roadOffers(run.seed, run.day);
        expect(roads).toHaveLength(3);
        expect(roads.some((r) => r.id === 'joren')).toBe(false);
        expect(roads.some((r) => r.goalMult <= 1.1)).toBe(true);
        takeRoad(run, meta, roads[0].id);
        expect(run.day).toBe(d + 1);
      } else {
        expect(out.cleared).toBe(true);
        expect(meta.loop).toBe(2);
        expect(meta.active).toBeNull();
        expect(coinsFor(out.summary!)).toBe(4 * 3000 + 8000);
      }
    }
    const next = newRun(meta, 6, 'r2');
    expect(next.loop).toBe(2);
    const out = closeDay(next, meta, facts(goalFor(0, 2, 'joren') - 1));
    expect(out.passed).toBe(false);
    expect(out.summary?.cleared).toBe(false);
    expect(meta.loop).toBe(2);
    expect(meta.runs).toBe(2);
  });

  it('のれんは上限なく難しくなる：目標は増え続け、お客の多さと待ち時間は入力が追いつく範囲で止まる', () => {
    let prev = 0;
    for (const loop of [1, 2, 3, 10, 50, 500, 100000]) {
      const g = goalFor(RUN_DAYS - 1, loop, 'manin');
      expect(Number.isSafeInteger(g)).toBe(true);
      expect(g).toBeGreaterThan(prev);
      prev = g;
      expect(loopEveryMult(loop)).toBeGreaterThanOrEqual(0.72);
      expect(loopWaitMult(loop)).toBeGreaterThanOrEqual(0.78);
      expect(dayDifficulty(3, loop).everyMult).toBeGreaterThan(0.39);
    }
    expect(loopGoalMult(1)).toBe(1);
    // 売上の目標のほかにも、営業そのものが難しくなる：お客の足・献立・ミスの猶予・せっかちな客・減点・調達
    expect(trialsFor(1)).toHaveLength(0);
    expect(trialsFor(6).length).toBe(6);
    expect(walkMult(1)).toBe(1);
    expect(walkMult(3)).toBeGreaterThan(walkMult(2));
    expect(trialMods(2).dishShift).toBe(1);
    expect(dayDifficulty(0, 3).comboMissAllowance).toBe(1);
    expect(trialMods(4).impatient).toBeGreaterThan(0);
    expect(trialMods(50).angryMult).toBe(47);
    expect(trialMods(50).tripMult).toBeCloseTo(0.6);
    // 1日目はゆるく、4日目がいちばんきつい
    expect(GOAL_BASE[3] / GOAL_BASE[0]).toBeGreaterThanOrEqual(6);
    expect(GOAL_BASE).toHaveLength(RUN_DAYS);
    for (let d = 1; d < RUN_DAYS; d++) expect(dayDifficulty(d, 1).everyMult).toBeLessThan(dayDifficulty(d - 1, 1).everyMult);
  });

  it('保存を読み直しても同じ。壊れた値は捨てる', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 99, 'keep');
    applyOffer(run, offersFor(run, meta, 0, 0)[0]);
    run.stage = 'open';
    meta.active = run;
    meta.discovered = [pairKey('matome', 'mouippai'), 'nope+nope'];
    const back = readMeta(JSON.parse(JSON.stringify(meta)));
    expect(back.active).toEqual(run);
    expect(back.discovered).toEqual([pairKey('matome', 'mouippai')]);
    expect(readMeta(null)).toEqual(emptyMeta());
    expect(readMeta({ loop: -3, active: { id: 'x', day: 2, stage: 'open', days: [] } }).active).toBeNull();
    expect(readMeta({ loop: 'a' }).loop).toBe(1);
  });

  it('同じ種・同じ入力なら、方針つきの営業も同じ結果になる', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 777, 'd');
    run.owned = [{ id: 'matome', lv: 2 }, { id: 'betsubara', lv: 2 }, { id: 'makanai', lv: 2 }];
    const plan = dayPlan(run, meta);
    const play = () => {
      const s = new PlaySession(plan.seed, plan.difficulty, plan.rules, null, plan.mods);
      for (let i = 0; i < 60 * 40; i++) {
        s.tick();
        if (i % 9 === 0) { const t = s.shop.targets()[0]; const live = s.shop.input.active[0]; if (live || t) s.input((live?.matcher ?? new RomajiMatcher(t.kana)).remaining[0]); }
      }
      return [s.shop.score, s.shop.stats.served, s.record.length];
    };
    expect(play()).toEqual(play());
    // 通常営業の記録のやり直しには、方針が入りこまない
    expect(replay(1, DIFFICULTIES[1], NORMAL_RULES, null, '').ok).toBe(true);
  });

  it('ボット：翌日の営業は表示された候補から選ぶ', () => {
    const result = botRun(11, prefer('調達', ['nushi', 'tairyo', 'oomori']), 6.5, 0.04, 1, emptyMeta(), true);
    expect(result.run.days).toHaveLength(4);
    for (let day = 1; day < 4; day++) {
      const offered = roadOffers(result.run.seed, day - 1).map((road) => road.id);
      expect(offered).toContain(result.run.days[day].road);
    }
  });

  it('ボット：好みの方針が候補にないとき、残り回数の範囲で引き直す', () => {
    const result = botRun(11, prefer('連鎖', ['matome', 'mouippai', 'betsubara']), 6.5, 0.04, 1, emptyMeta(), true);
    expect(result.rerollsUsed).toBeGreaterThan(0);
    expect(result.rerollsUsed).toBeLessThanOrEqual(5);
  });

  it('ボット：方針なしは4日もたない。考えた構成は、でたらめより先まで進む', () => {
    const none = [11, 23, 37].map((s) => botRun(s, NONE, 4.5, 0.06, 1, undefined, false, 0.5));
    expect(none.every((r) => !r.cleared)).toBe(true);
    const built = [11, 23, 37].map((s) => botRun(s, prefer('調達', ['nushi', 'tairyo', 'mie', 'makanai', 'shikomi', 'mouippai']), 6.5, 0.04, 1, undefined, false, 0.35));
    expect(built.filter((r) => r.cleared).length).toBeGreaterThanOrEqual(2);
    const random = [11, 23, 37].map((s) => botRun(s, RANDOM, 6.5, 0.04, 1, undefined, false, 0.35));
    expect(built.filter((r) => r.cleared).length).toBeGreaterThan(random.filter((r) => r.cleared).length);
  }, 120000);
});

describe('実績と限定の飾り', () => {
  it('繁盛記の実績14件に、限定の飾りがちょうど1つずつ（二つ名8・プレート3・打鍵音3）', () => {
    expect(RUN_ACHIEVEMENTS).toHaveLength(14);
    const kinds: Record<string, number> = {};
    for (const a of RUN_ACHIEVEMENTS) {
      const it = achievementItem(a.id);
      expect(ITEMS.filter((i) => typeof i.source === 'object' && i.source.achievement === a.id)).toHaveLength(1);
      kinds[it!.kind] = (kinds[it!.kind] ?? 0) + 1;
    }
    expect(kinds).toEqual({ front: 4, back: 4, plate: 3, sound: 3 });
  });

  it('条件を満たすと解放され、ふだんの飾りとして付けられる。ふくびきでは出ない', () => {
    const store = new SaveStore(memory());
    const meta = emptyMeta();
    expect(earnedAchievements(meta)).toEqual([]);
    meta.daysCleared = 4;
    meta.clears = 1;
    meta.best.chain = 4;
    const ids = earnedAchievements(meta);
    expect(ids.sort()).toEqual(['run-chain', 'run-clear', 'run-first-day']);
    expect(store.unlockAchievements(ids).sort()).toEqual(ids);
    expect(store.unlockAchievements(ids)).toEqual([]);
    const u = store.loadRecords().unlocked;
    const c = emptyCollection();
    expect(owns(c, u, 'p-hanjofuda')).toBe(true);
    expect(owns(c, u, 'k-hyoshigi')).toBe(true);
    expect(owns(c, u, 'p-senryobako')).toBe(false);
    const eq = setEquip(c, u, { plate: 'p-hanjofuda', sound: 'k-hyoshigi', back: 'b-norenmochi' }).equip;
    expect(eq).toMatchObject({ plate: 'p-hanjofuda', sound: 'k-hyoshigi', back: 'b-norenmochi' });
    expect(setEquip(c, u, { plate: 'p-senryobako' }).equip.plate).toBeNull();
    // ランキングに送る飾りとしても通る
    expect(readDecoration({ plate: 'p-hanjofuda' }).plate).toBe('p-hanjofuda');
    expect(itemById('k-ooiridaiko')?.sound).toBeDefined();
    for (const it of ITEMS) if (typeof it.source === 'object' && it.source.achievement.startsWith('run-')) expect(it.source).not.toBe('gacha');
  });

  it('繁盛記の記録は別の場所に残り、通常の自己ベストや実績の数え方に混ざらない', () => {
    const mem = memory();
    const store = new SaveStore(mem);
    const meta = emptyMeta();
    meta.best.total = 123456;
    store.saveRun(meta);
    expect(store.loadRun().best.total).toBe(123456);
    expect(store.loadBest('normal')).toBeNull();
    expect(store.loadLast()).toBeNull();
    expect(store.loadRecords().plays).toBe(0);
    expect(store.creditRun('run:x', 20000)).toBe(20000);
    expect(store.creditRun('run:x', 20000)).toBe(0);
    expect(store.loadCollection().coins).toBe(20000);
    expect(store.loadSettings().fxLevel).toBe(1);
  });
});
