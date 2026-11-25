// 繁盛記：方針のはたらき・進行・保存・限定の飾り
import { describe, expect, it } from 'vitest';
import { Shop, type Guest } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DAY_LENGTH, DISHES, DIFFICULTIES } from '../src/core/shopConfig';
import { NORMAL_RULES } from '../src/core/daily';
import { type PolicyId, KEIKI_EVERY, MAX_LEVEL, MAX_SLOTS, PAIRS, POLICY_SEAL, POLICIES, REFILL_EAT, SETS, setKey, descDiff, descOf, emptyMods, modsFor, pairKey, partnersOf, policyOf } from '../src/core/build';
import {
  AIDS, GOAL_BASE, availablePolicies, estimateFor, RUN_ACHIEVEMENTS, aidFor, RUN_DAYS, applyOffer, closeDay, coinsFor, dayDifficulty, dayPlan, earnedAchievements, emptyMeta, goalFor,
  DAY_LOOP_WEIGHT, DISH_SHIFT2_LOOP, GOAL_EASE_LOOP, GOAL_LATE_STEP, STRICT_MISS_LOOP, TRIAL_STOP_LOOP, dayGoalMult,
  GIFT_CAP_LOOP, GIFT_PER_LOOP, NOREN_RANKS, bestCleared, clampPick, firstClearGift, nextNorenRank, norenRank,
  loopEveryMult, loopGoalMult, loopWaitMult, newRun, offersFor, readMeta, roadOffers, takeRoad, trialMods, trialsFor, walkMult,
} from '../src/core/run';
import { emptyBuildStats, HEAT_GAP } from '../src/core/build';
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

  it('かけ合わせ：名前付きの2つが同じ皿に効くと発見になるが、売上は変わらない', () => {
    const one = shopWith([{ id: 'matome', lv: 1 }], ['grilledFish', 'driedFish']);
    const two = shopWith([{ id: 'matome', lv: 1 }, { id: 'mouippai', lv: 1 }], ['grilledFish', 'driedFish']);
    const g1 = type(one, 'やきざかな').filter((e) => e.type === 'serve')[0];
    const g2 = type(two, 'やきざかな').filter((e) => e.type === 'serve')[0];
    if (g1.type !== 'serve' || g2.type !== 'serve') throw new Error('serve');
    expect(g2.pairs).toBe(1);
    expect(g2.pair).toBe(pairKey('matome', 'mouippai'));
    // もう一杯（×1.3）だけが掛かる。かけ合わせの分は足されない
    expect(g2.paid).toBeCloseTo(g1.paid! * 1.3);
    expect(g2.gain).toBe(Math.round(g2.base! * g2.paid!));
    expect(two.stock.ale).toBe(28);
    expect(two.buildStats.pairs).toEqual([pairKey('matome', 'mouippai')]);
  });

  it('掛け算：一発勝負とコンボが掛かり、かけ合わせは売上を変えない', () => {
    const s = shopWith([{ id: 'ippatsu', lv: 3 }, { id: 'omotenashi', lv: 1 }], ['grilledFish']);
    s.combo = 9;
    s.clock = 5;
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.factors).toEqual([{ id: 'omotenashi', mult: 1.6 }, { id: 'ippatsu', mult: 2 }, { id: 'combo', mult: 1.5 }]);
    expect(ev.paid).toBeCloseTo(4.8);
    expect(ev.gain).toBe(Math.round(ev.base! * ev.paid!));
    expect(ev.pair).toBe(pairKey('ippatsu', 'omotenashi'));
  });

  it('上限：宴会の皿も含めて、倍率の積は×30 で止まる', () => {
    const s = shopWith([{ id: 'ippatsu', lv: 3 }, { id: 'nushi', lv: 3 }, { id: 'ryoshusho', lv: 3 }], []);
    s.combo = 69;
    s.freshUntil = s.clock + 10;
    s.seats[0] = { ...guest('hunterStew'), banquet: true };
    const ev = type(s, 'ぽとふのおおなべ').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.raw).toBeCloseTo(2 * 2.2 * 3.5 * 2);
    expect(ev.paid).toBe(30);
    expect(ev.capped).toBe(true);
    expect(ev.gain).toBe(Math.round(ev.base! * 30));
  });

  it('会計は調達中でも方針の倍率で数える（表示の見積もりだけが調達中に null）', () => {
    const s = shopWith([{ id: 'ippatsu', lv: 3 }], ['grilledFish']);
    s.away = { id: 'fishing', text: '', kana: 'つり', who: 'wife', act: '', place: '', gives: ['fish'], minimum: { fish: 4 } };
    expect(s.quote(0, { chain: 0, clean: true, saved: false })).toBeNull();
    const ev = (s as unknown as { serveOne: (seat: number, chain: number) => { factors?: { id: string; mult: number }[] } }).serveOne(0, 0);
    expect(ev.factors).toContainEqual({ id: 'ippatsu', mult: 2 });
  });

  it('見積もりと会計が1円まで一致する', () => {
    const s = shopWith([{ id: 'ippatsu', lv: 2 }, { id: 'mie', lv: 1 }, { id: 'mouippai', lv: 1 }], ['grilledFish']);
    s.stock.fish = 3;
    s.combo = 9;
    const q = s.quote(0, { chain: 0, clean: true, saved: false })!;
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.gain).toBe(q.gain);
    expect(ev.factors).toEqual(q.factors);
    expect(q.tags).toEqual(expect.arrayContaining(['mie', 'mouippai', 'ippatsu']));
  });

  it('領収書はいらない：コンボ倍率の上限が上がる／大入り袋：コンボを切らさずに10皿で大入り', () => {
    const s = shopWith([{ id: 'ryoshusho', lv: 3 }, { id: 'ooiri', lv: 1 }], []);
    s.combo = 69;
    s.feverCount = 9;
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
    expect(POLICIES).toHaveLength(25);
    for (const p of POLICIES) {
      expect(p.vals).toHaveLength(MAX_LEVEL);
      expect(descOf(p.id, 1)).not.toContain('{');
      expect(partnersOf(p.id).length).toBeGreaterThanOrEqual(2);
      for (const q of POLICIES) if (p !== q) expect(q.kana.startsWith(p.kana)).toBe(false);
      expect('ひきなおし'.startsWith(p.kana) || p.kana.startsWith('ひきなおし') || p.kana === 'やめる').toBe(false);
    }
    expect(new Set(PAIRS.map((p) => pairKey(p.a, p.b))).size).toBe(PAIRS.length);
    expect(emptyMods().comboCap).toBe(2);
  });
});

describe('作り直した方針', () => {
  it('まとめ出し：ついでの皿は割り引かず、その皿の条件で計算する。打った腕前は打った皿だけ', () => {
    const s = shopWith([{ id: 'matome', lv: 2 }, { id: 'ippatsu', lv: 3 }], ['grilledFish', 'driedFish']);
    const [a, b] = type(s, 'やきざかな').filter((e) => e.type === 'serve');
    if (a.type !== 'serve' || b.type !== 'serve') throw new Error('serve');
    expect(a.chain).toBe(0);
    expect(a.factors).toContainEqual({ id: 'ippatsu', mult: 2 });
    expect(b.chain).toBe(1);
    expect(b.factors!.some((f) => f.id === 'ippatsu')).toBe(false);
    expect(b.tags).toContain('matome');
    expect(b.paid).toBe(1);
    expect(b.gain).toBe(Math.round(b.base!));
  });

  it('まとめ出し：打った皿で素材を使い切ったら、ついでの皿は出ず、判子も発見も付かない', () => {
    const s = shopWith([{ id: 'matome', lv: 3 }, { id: 'mouippai', lv: 1 }], ['grilledFish', 'driedFish']);
    s.stock.fish = 2;
    const evs = type(s, 'やきざかな');
    const serves = evs.filter((e) => e.type === 'serve');
    expect(serves).toHaveLength(1);
    const a = serves[0];
    if (a.type !== 'serve') throw new Error('serve');
    expect(a.tags).not.toContain('matome');
    expect(evs.some((e) => e.type === 'chain')).toBe(false);
    expect(s.buildStats.pairs.some((k) => k.includes('matome'))).toBe(false);
    expect(s.buildStats.fired.matome).toBeUndefined();
  });

  it('まとめ出し：ついでの皿が実際に出たときだけ、打った皿にまとめ出しの判子と発見が付く', () => {
    const s = shopWith([{ id: 'matome', lv: 1 }, { id: 'mouippai', lv: 1 }], ['grilledFish', 'driedFish']);
    const evs = type(s, 'やきざかな');
    const a = evs.find((e) => e.type === 'serve');
    if (a?.type !== 'serve') throw new Error('serve');
    expect(a.tags).toContain('matome');
    expect(evs.find((e) => e.type === 'chain')).toMatchObject({ count: 2 });
    expect(s.buildStats.pairs).toContain(pairKey('matome', 'mouippai'));
    expect(s.buildStats.fired.matome).toBe(2);
  });

  it('まとめ出し：1皿ずつ確定するので、ついでの皿のコンボは1皿ごとに進む', () => {
    const s = shopWith([{ id: 'matome', lv: 2 }], ['grilledFish', 'driedFish', 'searedFish']);
    s.combo = 9;
    const serves = type(s, 'やきざかな').filter((e) => e.type === 'serve');
    expect(serves).toHaveLength(3);
    expect(serves.map((e) => e.type === 'serve' && e.combo)).toEqual([10, 11, 12]);
    for (const e of serves) if (e.type === 'serve') expect(e.factors).toContainEqual({ id: 'combo', mult: 1.5 });
  });

  it('さっきのヌシ：とれたてのあいだ全部の皿が×1.8（Lv2）', () => {
    const s = shopWith([{ id: 'nushi', lv: 2 }], ['grilledFish']);
    s.freshUntil = s.clock + 10;
    expect(s.quote(0, { chain: 0, clean: true, saved: false })!.factors).toContainEqual({ id: 'nushi', mult: 1.8 });
  });

  it('大漁旗：主素材が8個以上ある皿が×1.5（Lv2）', () => {
    const s = shopWith([{ id: 'tairyo', lv: 2 }], ['grilledFish']);
    const ctx = { chain: 0, clean: true, saved: false };
    s.stock.fish = 8;
    expect(s.quote(0, ctx)!.factors).toContainEqual({ id: 'tairyo', mult: 1.5 });
    s.stock.fish = 7;
    expect(s.quote(0, ctx)!.factors.some((f) => f.id === 'tairyo')).toBe(false);
  });

  it('朝市：朝の時間帯の皿が×1.8（Lv2）。昼には付かない', () => {
    const s = shopWith([{ id: 'asaichi', lv: 2 }], ['grilledFish']);
    const ctx = { chain: 0, clean: true, saved: false };
    s.clock = 10;
    expect(s.quote(0, ctx)!.factors).toContainEqual({ id: 'asaichi', mult: 1.8 });
    s.clock = 60;
    expect(s.quote(0, ctx)!.factors.some((f) => f.id === 'asaichi')).toBe(false);
  });

  it('おやじの見栄：残っている素材のうち一番少ない素材の皿が×3.0（Lv2）。0個の素材は数えない', () => {
    const s = shopWith([{ id: 'mie', lv: 2 }], ['jerky']);
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 10;
    s.stock.fish = 0;
    s.stock.meat = 2;
    expect(s.scarcest()).toEqual(['meat']);
    expect(s.quote(0, { chain: 0, clean: true, saved: false })!.factors).toContainEqual({ id: 'mie', mult: 3 });
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 0;
    expect(s.scarcest()).toEqual([]);
  });

  it('まかない名人：素材が減らなかった皿が×1.8（Lv2）。予告には付かない', () => {
    const mods = modsFor([{ id: 'makanai', lv: 2 }]);
    mods.saveChance = 1;
    const s = new Shop(new Rng(1), DIFFICULTIES[1], NORMAL_RULES, mods);
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 30;
    s.seats[0] = guest('grilledFish');
    expect(s.quote(0, { chain: 0, clean: true, saved: false })!.factors.some((f) => f.id === 'makanai')).toBe(false);
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.factors).toContainEqual({ id: 'makanai', mult: 1.8 });
    // 倍率を付けたので、方針ごとの稼ぎ（主力の判定）にも数える
    expect(s.buildStats.yen.makanai ?? 0).toBeGreaterThan(0);
    expect(s.stock.fish).toBe(30);
  });

  it('こまめな仕込み：時間帯のはじめの15秒、全部の皿が×1.8（Lv2）。昼のはじめからも数える', () => {
    const s = shopWith([{ id: 'shikomi', lv: 2 }], ['grilledFish']);
    const ctx = { chain: 0, clean: true, saved: false };
    const has = () => s.quote(0, ctx)!.factors.some((f) => f.id === 'shikomi' && f.mult === 1.8);
    s.clock = 10;
    expect(has()).toBe(true);
    s.clock = 20;
    expect(has()).toBe(false);
    s.clock = 55;
    expect(has()).toBe(true);
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

  it('大盛り：値段は書き換えず、倍率として掛かる。おかわりの2品目は普通の量と値段', () => {
    const s = new Shop(new Rng(3), DIFFICULTIES[1], NORMAL_RULES, modsFor([{ id: 'oomori', lv: 3 }, { id: 'betsubara', lv: 3 }], { bigChance: 1, refillChance: 1 }));
    for (let i = 0; i < 400 && !s.seats.some((g) => g?.state === 'wait'); i++) s.update(0.1);
    const i = s.seats.findIndex((g) => g?.state === 'wait');
    const g = s.seats[i]!;
    const base = DISHES.find((d) => d.id === g.dish.id)!;
    expect(g.big).toBe(true);
    expect(g.bigMult).toBe(3.3);
    expect(g.bigFrom).toBe('policy');
    expect(g.dish.price).toBe(base.price);
    for (const [k, n] of Object.entries(base.need)) expect(g.dish.need[k as keyof typeof base.need]).toBe(n! * 2);
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 30;
    s.drainEvents();
    const ev = type(s, g.dish.kana).find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.factors).toContainEqual({ id: 'oomori', mult: 3.3 });
    expect(ev.tags).toContain('oomori');
    for (let k = 0; k < 100 && !(g.state === 'wait' && g.refill); k++) s.update(0.1);
    expect(g.refill).toBe(true);
    expect(g.big).toBeFalsy();
    expect(g.bigMult).toBeUndefined();
    const second = DISHES.find((d) => d.id === g.dish.id)!;
    expect(g.dish.need).toEqual(second.need);
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 30;
    s.drainEvents();
    const ev2 = type(s, g.dish.kana).find((e) => e.type === 'serve')!;
    if (ev2.type !== 'serve') throw new Error('serve');
    expect(ev2.factors!.some((f) => f.id === 'oomori')).toBe(false);
    expect(ev2.tags).not.toContain('oomori');
  });

  it('大食いの日の大盛りは会計に入るが、持っていない大盛り上等の判子は付かない', () => {
    const s = new Shop(new Rng(3), DIFFICULTIES[1], NORMAL_RULES, modsFor([], { bigChance: 1 }));
    for (let i = 0; i < 400 && !s.seats.some((g) => g?.state === 'wait'); i++) s.update(0.1);
    const g = s.seats.find((x) => x?.state === 'wait')!;
    expect(g.bigFrom).toBe('road');
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 30;
    s.drainEvents();
    const ev = type(s, g.dish.kana).find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.factors).toContainEqual({ id: 'big', mult: 2 });
    expect(ev.tags).not.toContain('oomori');
    expect(s.buildStats.fired.oomori).toBeUndefined();
  });

  it('方針を入れ替えても、すでに出ている大盛りの注文は約束した倍率のまま', () => {
    const s = new Shop(new Rng(3), DIFFICULTIES[1], NORMAL_RULES, modsFor([{ id: 'oomori', lv: 1 }], { bigChance: 1 }));
    for (let i = 0; i < 400 && !s.seats.some((g) => g?.state === 'wait'); i++) s.update(0.1);
    const i = s.seats.findIndex((g) => g?.state === 'wait');
    s.build = modsFor([{ id: 'oomori', lv: 3 }], { bigChance: 1 });
    expect(s.quote(i, { chain: 0, clean: true, saved: false })!.factors).toContainEqual({ id: 'oomori', mult: 2.4 });
  });

  it('もう一杯：酒以外の料理に酒を付けた皿が×1.5（Lv2）。酒が0個・酒の料理には付かない', () => {
    const s = shopWith([{ id: 'mouippai', lv: 2 }], ['grilledFish', 'ale']);
    const a = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (a.type !== 'serve') throw new Error('serve');
    expect(a.factors).toContainEqual({ id: 'mouippai', mult: 1.5 });
    expect(s.stock.ale).toBe(29);
    const b = type(s, 'えーる').find((e) => e.type === 'serve')!;
    if (b.type !== 'serve') throw new Error('serve');
    expect(b.factors!.some((f) => f.id === 'mouippai')).toBe(false);
    const dry = shopWith([{ id: 'mouippai', lv: 2 }], ['grilledFish']);
    dry.stock.ale = 0;
    const c = type(dry, 'やきざかな').find((e) => e.type === 'serve')!;
    if (c.type !== 'serve') throw new Error('serve');
    expect(c.factors!.some((f) => f.id === 'mouippai')).toBe(false);
  });

  it('もう一杯：まとめ出しのついでの皿でも、その皿で酒を1つ使って付く', () => {
    const s = shopWith([{ id: 'matome', lv: 1 }, { id: 'mouippai', lv: 1 }], ['grilledFish', 'driedFish']);
    const serves = type(s, 'やきざかな').filter((e) => e.type === 'serve');
    expect(serves).toHaveLength(2);
    for (const e of serves) if (e.type === 'serve') expect(e.factors).toContainEqual({ id: 'mouippai', mult: 1.3 });
    expect(s.stock.ale).toBe(28);
  });

  it('呼び込み：8席が埋まっているあいだ、全部の皿が×1.3（Lv2）', () => {
    const full = shopWith([{ id: 'yobikomi', lv: 2 }], ['grilledFish', 'vegSoup', 'jerky', 'mushSaute', 'stirFry', 'karaage', 'fishFry', 'herbFish']);
    for (let i = 1; i < 8; i++) full.seats[i]!.state = 'walk';
    expect(full.quote(0, { chain: 0, clean: true, saved: false })!.factors).toContainEqual({ id: 'yobikomi', mult: 1.3 });
    const open = shopWith([{ id: 'yobikomi', lv: 2 }], ['grilledFish', 'vegSoup']);
    expect(open.quote(0, { chain: 0, clean: true, saved: false })!.factors.some((f) => f.id === 'yobikomi')).toBe(false);
  });

  it('看板娘：待ち時間が半分を切ったお客の皿が×2.2（Lv2）', () => {
    const s = shopWith([{ id: 'aiso', lv: 2 }], ['grilledFish', 'vegSoup']);
    s.seats[0]!.wait = 14;
    s.seats[1]!.wait = 16;
    const ctx = { chain: 0, clean: true, saved: false };
    expect(s.quote(0, ctx)!.factors).toContainEqual({ id: 'aiso', mult: 2.2 });
    expect(s.quote(1, ctx)!.factors.some((f) => f.id === 'aiso')).toBe(false);
  });

  it('おもてなし：前の皿から2秒以上あけて打った皿が×2.0（Lv2）。ついでの皿には付かない', () => {
    const s = shopWith([{ id: 'omotenashi', lv: 2 }, { id: 'matome', lv: 1 }], ['grilledFish', 'driedFish']);
    s.clock = 5;
    const [a, b] = type(s, 'やきざかな').filter((e) => e.type === 'serve');
    if (a.type !== 'serve' || b.type !== 'serve') throw new Error('serve');
    expect(a.factors).toContainEqual({ id: 'omotenashi', mult: 2 });
    expect(b.factors!.some((f) => f.id === 'omotenashi')).toBe(false);
    const soon = shopWith([{ id: 'omotenashi', lv: 2 }], ['grilledFish']);
    soon.clock = 1.5;
    expect(soon.quote(0, { chain: 0, clean: true, saved: false })!.factors.some((f) => f.id === 'omotenashi')).toBe(false);
  });

  it('待たせない店：待ち時間が7割以上残っているお客の皿が×1.8（Lv2）。チップは倍にならない', () => {
    const s = shopWith([{ id: 'sekkachi', lv: 2 }], ['grilledFish', 'vegSoup']);
    s.seats[0]!.wait = 21;
    s.seats[1]!.wait = 20;
    const ctx = { chain: 0, clean: true, saved: false };
    const a = s.quote(0, ctx)!;
    expect(a.factors).toContainEqual({ id: 'sekkachi', mult: 1.8 });
    expect(a.base).toBe(dish('grilledFish').price + Math.round((21 / 30) * 60));
    expect(s.quote(1, ctx)!.factors.some((f) => f.id === 'sekkachi')).toBe(false);
  });

  it('予約のみ：全部の皿が×1.6（Lv2）。1皿でコンボが3進む', () => {
    const s = shopWith([{ id: 'yoyaku', lv: 2 }], ['grilledFish']);
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.factors).toContainEqual({ id: 'yoyaku', mult: 1.6 });
    expect(s.combo).toBe(3);
  });

  it('大入り袋：コンボを切らさずに10皿出すと大入り。予約のみでコンボが速く進んでも、皿の数で数える', () => {
    const s = shopWith([{ id: 'yoyaku', lv: 3 }, { id: 'ooiri', lv: 1 }], []);
    for (let n = 0; n < 9; n++) { s.seats[0] = guest('grilledFish'); type(s, 'やきざかな'); }
    expect(s.combo).toBe(36);
    expect(s.fever).toBe(false);
    s.seats[0] = guest('grilledFish');
    expect(type(s, 'やきざかな').some((e) => e.type === 'fever' && e.on)).toBe(true);
    s.seats[0] = guest('grilledFish');
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.factors).toContainEqual({ id: 'ooiri', mult: 1.3 });
  });

  it('大入り袋：ミスや怒って帰ってコンボが切れたら数え直す。看板娘Lv3でコンボが続くときは数え直さない', () => {
    const s = shopWith([{ id: 'ooiri', lv: 1 }], []);
    for (let n = 0; n < 5; n++) { s.seats[0] = guest('grilledFish'); type(s, 'やきざかな'); }
    expect(s.feverCount).toBe(5);
    for (let n = 0; n < 4; n++) s.key('q');
    expect(s.combo).toBe(0);
    expect(s.feverCount).toBe(0);
    for (let n = 0; n < 3; n++) { s.seats[0] = guest('grilledFish'); type(s, 'やきざかな'); }
    s.seats[1] = guest('vegSoup', 0.01);
    s.update(0.05);
    expect(s.feverCount).toBe(0);
    const keep = shopWith([{ id: 'ooiri', lv: 1 }, { id: 'aiso', lv: 3 }], []);
    for (let n = 0; n < 3; n++) { keep.seats[0] = guest('grilledFish'); type(keep, 'やきざかな'); }
    keep.seats[1] = guest('vegSoup', 0.01);
    keep.update(0.05);
    expect(keep.stats.angry).toBe(1);
    expect(keep.feverCount).toBe(3);
  });

  it('延長営業：延長のあいだだけ、全部の皿が×1.8（Lv2）', () => {
    const s = shopWith([{ id: 'encho', lv: 2 }], ['grilledFish']);
    const ctx = { chain: 0, clean: true, saved: false };
    s.clock = 179.9;
    s.combo = 30;
    expect(s.quote(0, ctx)!.factors.some((f) => f.id === 'encho')).toBe(false);
    s.update(0.2);
    expect(s.extra).toBe(15);
    s.seats[0]!.wait = 20;
    expect(s.quote(0, ctx)!.factors).toContainEqual({ id: 'encho', mult: 1.8 });
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

  it('連打の熱：ミスすると熱が半分になり、2.5秒あくと冷める', () => {
    expect(HEAT_GAP).toBe(2.5);
    const s = shopWith([{ id: 'netsu', lv: 3 }], []);
    s.heat = 0.8;
    s.key('q');
    expect(s.heat).toBeCloseTo(0.4);
    // 熱の方針がない店では、ミスしても何も変わらない
    const plain = shopWith([], []);
    plain.heat = 0.8;
    plain.key('q');
    expect(plain.heat).toBe(0.8);
    // 2.5秒を少し越えて出すと冷める
    (s as unknown as { lastTypedAt: number }).lastTypedAt = s.clock;
    s.clock += 2.6;
    s.clearInput();
    s.seats[0] = guest('grilledFish');
    const cold = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    expect(cold.type === 'serve' && cold.heat).toBe(1);
  });

  it('連打の熱：2.5秒以内に続けて打って出すと倍率が上がり、間があくと冷める', () => {
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

  it('型：3つがそろって打った皿に効くと、初めてなら記録される。売上は変わらない', () => {
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
    // 熱（×1.5）・大入り（×1.3）・待たせない店（×1.5）だけが掛かる。かけ合わせ・型の分は足されない
    expect(ev.paid).toBeCloseTo(1.5 * 1.3 * 1.5);
    expect(ev.gain).toBe(Math.round(ev.base! * ev.paid!));
    expect(s.buildStats.sets).toEqual([setKey(SETS[0])]);
  });

  it('型は7つ。どれも3つの方針で、まとめ出しは入らない。新しい4つにも相手が2つ以上ある', () => {
    expect(SETS).toHaveLength(7);
    for (const x of SETS) {
      expect(new Set(x.ids).size).toBe(3);
      expect(x.ids).not.toContain('matome');
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
        // のれん1枚目を初めてクリア：ふだんの額にご祝儀（3,000円×1枚）
        expect(out.summary!.first).toBe(true);
        expect(coinsFor(out.summary!)).toBe(4 * 3000 + 8000 + firstClearGift(1));
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

  it('同じのれんで続けて負けると、次の挑戦に常連の見舞い（素材と1日目の朝のLv）が付き、クリアで消える', () => {
    const meta = emptyMeta();
    const facts = (sales: number) => ({ sales, served: 30, maxCombo: 12, angry: 0, build: emptyBuildStats() });
    const lose = (seed: number) => {
      const run = newRun(meta, seed, `l${seed}`);
      closeDay(run, meta, facts(0));
      return run;
    };
    // 1回負けただけでは何も付かない
    expect(lose(1).aid).toBe(0);
    expect(meta.losses).toBe(1);
    expect(aidFor(meta.losses)).toBe(0);
    // 2回負けたあとの挑戦：開店の素材+1
    lose(2);
    const second = newRun(meta, 3, 'a2');
    expect(second.aid).toBe(1);
    expect(second.boost).toBe(false);
    expect(dayPlan(second, meta).base.startStock).toBe(AIDS[0].stock);
    // 3回負けたあとの挑戦：素材+2、1日目の朝の方針は Lv がおまけ
    closeDay(second, meta, facts(0));
    const third = newRun(meta, 4, 'a3');
    expect(third.aid).toBe(2);
    expect(third.boost).toBe(true);
    expect(dayPlan(third, meta).base.startStock).toBe(AIDS[1].stock);
    expect(offersFor(third, meta, 0, 0).every((o) => o.lv === 2)).toBe(true);
    // 中断して開き直しても、見舞いはそのまま
    expect(readMeta(JSON.parse(JSON.stringify({ ...meta, active: third }))).active?.aid).toBe(2);
    expect(readMeta(JSON.parse(JSON.stringify(meta))).losses).toBe(meta.losses);
    // 走りきったら、負けた回数は0に戻る
    for (let d = 0; d < RUN_DAYS; d++) {
      closeDay(third, meta, facts(goalFor(d, 1, third.road)));
      if (d < RUN_DAYS - 1) takeRoad(third, meta, 'joren');
    }
    expect(meta.losses).toBe(0);
    expect(newRun(meta, 5, 'a4').aid).toBe(0);
  });

  describe('選べるのれん', () => {
    const facts = (sales: number) => ({ sales, served: 30, maxCombo: 12, angry: 0, build: emptyBuildStats() });
    /** 選んだのれんで4日間を走りきる */
    const clearRun = (meta: ReturnType<typeof emptyMeta>, seed: number) => {
      const run = newRun(meta, seed, `c${seed}`);
      let out = null as ReturnType<typeof closeDay> | null;
      for (let d = 0; d < RUN_DAYS; d++) {
        out = closeDay(run, meta, facts(goalFor(d, run.loop, run.road)));
        if (d < RUN_DAYS - 1) takeRoad(run, meta, 'joren');
      }
      return { run, out: out! };
    };
    const reached = (loop: number) => { const m = emptyMeta(); m.loop = loop; m.pick = loop; return m; };

    it('古い保存（選んだ枚数がない）は、いちばん上から。範囲の外は収める', () => {
      expect(readMeta({ loop: 6 }).pick).toBe(6);
      expect(readMeta({ loop: 6, pick: 3 }).pick).toBe(3);
      expect(readMeta({ loop: 6, pick: 99 }).pick).toBe(6);
      expect(readMeta({ loop: 6, pick: 0 }).pick).toBe(1);
      expect(readMeta({}).pick).toBe(1);
      const m = reached(8);
      expect(clampPick(m, 0)).toBe(1);
      expect(clampPick(m, 12)).toBe(8);
      expect(readMeta(JSON.parse(JSON.stringify({ ...m, pick: 4 }))).pick).toBe(4);
    });

    it('下ののれんを選べる。クリアしても届いた枚数は下がらず、ご褒美はふだんと同じ（ご祝儀なし）', () => {
      const meta = reached(8);
      meta.pick = 3;
      const { run, out } = clearRun(meta, 1);
      expect(run.loop).toBe(3);
      expect(out.cleared).toBe(true);
      expect(out.summary!.first).toBe(false);
      expect(coinsFor(out.summary!)).toBe(4 * 3000 + 8000);
      expect(meta.loop).toBe(8);
      // 次は、クリアしたひとつ上
      expect(meta.pick).toBe(4);
    });

    it('いちばん上を初めてクリアすると、ご祝儀が付き、届いた枚数と選んだ枚数がひとつ上がる', () => {
      const meta = reached(8);
      const { out } = clearRun(meta, 2);
      expect(out.summary!.first).toBe(true);
      expect(coinsFor(out.summary!)).toBe(4 * 3000 + 8000 + 8 * GIFT_PER_LOOP);
      expect(meta.loop).toBe(9);
      expect(meta.pick).toBe(9);
      // 同じ枚数を2回目にクリアしても、ご祝儀は付かない
      meta.pick = 8;
      expect(clearRun(meta, 3).out.summary!.first).toBe(false);
    });

    it('ご祝儀は枚数に比例し、上限の枚数で止まる', () => {
      expect(firstClearGift(1)).toBe(GIFT_PER_LOOP);
      expect(firstClearGift(10)).toBe(10 * GIFT_PER_LOOP);
      expect(firstClearGift(GIFT_CAP_LOOP)).toBe(firstClearGift(GIFT_CAP_LOOP + 50));
    });

    it('常連の見舞いは、いちばん上ののれんだけ。下ののれんの勝ち負けでは数えも消えもしない', () => {
      const meta = reached(5);
      for (const seed of [1, 2, 3]) closeDay(newRun(meta, seed, `l${seed}`), meta, facts(0));
      expect(meta.losses).toBe(3);
      expect(newRun(meta, 9, 'top').aid).toBe(2);
      meta.pick = 2;
      expect(newRun(meta, 9, 'low').aid).toBe(0);
      closeDay(newRun(meta, 10, 'lowlose'), meta, facts(0));
      expect(meta.losses).toBe(3);
      meta.pick = 2;
      clearRun(meta, 11);
      expect(meta.losses).toBe(3);
      meta.pick = 5;
      clearRun(meta, 12);
      expect(meta.losses).toBe(0);
    });

    it('のれんの格と節目の実績は、クリアしたいちばん上の枚数で決まる（下を何度回しても取れない）', () => {
      expect(norenRank(0).name).toBe(NOREN_RANKS[0].name);
      expect(norenRank(2).at).toBe(0);
      expect(norenRank(3).name).toBe('藍のれん');
      expect(norenRank(9).name).toBe('紫のれん');
      expect(norenRank(100).at).toBe(20);
      expect(nextNorenRank(3)?.at).toBe(5);
      expect(nextNorenRank(20)).toBeNull();
      const meta = reached(3);
      expect(bestCleared(meta)).toBe(2);
      meta.pick = 1;
      for (let i = 0; i < 6; i++) { meta.pick = 1; clearRun(meta, 20 + i); }
      expect(meta.clears).toBe(6);
      expect(earnedAchievements(meta)).not.toContain('run-noren3');
      expect(earnedAchievements(meta)).toContain('run-loop5');
      meta.pick = 3;
      clearRun(meta, 40);
      expect(earnedAchievements(meta)).toContain('run-noren3');
      expect(earnedAchievements(meta)).not.toContain('run-noren5');
      for (const r of NOREN_RANKS.filter((x) => x.at > 0)) expect(achievementItem(`run-noren${r.at}`)).toBeDefined();
    });
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
    // 10枚目までは伸びが少しずつ大きくなり、その先は1枚ごとに一定（15枚目・20枚目の節目に、組み方と速さしだいで届くように）
    expect(loopGoalMult(GOAL_EASE_LOOP)).toBeCloseTo(2.728);
    expect(loopGoalMult(15)).toBeCloseTo(3.328);
    expect(loopGoalMult(20)).toBeCloseTo(3.928);
    expect(loopGoalMult(GOAL_EASE_LOOP) - loopGoalMult(GOAL_EASE_LOOP - 1)).toBeGreaterThanOrEqual(GOAL_LATE_STEP);
    for (const l of [11, 16, 40]) expect(loopGoalMult(l) - loopGoalMult(l - 1)).toBeCloseTo(GOAL_LATE_STEP);
    // 売上の目標のほかにも、営業そのものが難しくなる。新しい試練は1枚に1つずつ（段差を急にしない）
    expect(trialsFor(1)).toHaveLength(0);
    for (let l = 2; l <= 7; l++) expect(trialsFor(l)).toHaveLength(l - 1);
    expect(walkMult(1)).toBe(1);
    expect(walkMult(3)).toBeGreaterThan(walkMult(2));
    expect(trialMods(2).dishShift).toBe(0);
    expect(trialMods(3).dishShift).toBe(1);
    expect(trialMods(DISH_SHIFT2_LOOP).dishShift).toBe(2);
    expect(dayDifficulty(0, STRICT_MISS_LOOP - 1).comboMissAllowance).toBe(2);
    expect(dayDifficulty(0, STRICT_MISS_LOOP).comboMissAllowance).toBe(1);
    expect(trialMods(3).impatient).toBe(0);
    expect(trialMods(4).impatient).toBeCloseTo(0.1);
    // 試練の数字は TRIAL_STOP_LOOP 枚目で止まる（罰が重くなりすぎない）。目標だけは伸び続ける
    for (const l of [TRIAL_STOP_LOOP, 50, 100000]) {
      expect(trialMods(l)).toEqual(trialMods(TRIAL_STOP_LOOP));
    }
    expect(trialMods(TRIAL_STOP_LOOP).angryMult).toBe(6);
    expect(trialMods(TRIAL_STOP_LOOP).tripMult).toBeCloseTo(0.8);
    expect(trialMods(TRIAL_STOP_LOOP).walkMult).toBeCloseTo(2.08);
    expect(trialMods(TRIAL_STOP_LOOP).impatient).toBeCloseTo(0.4);
    // のれんの目標の伸びは、方針のそろっていない1日目・2日目には小さく効き、3・4日目にはそのまま効く
    for (const l of [1, 2, 8, 30]) {
      expect(dayGoalMult(3, l)).toBeCloseTo(loopGoalMult(l));
      expect(dayGoalMult(2, l)).toBeCloseTo(loopGoalMult(l));
      expect(dayGoalMult(0, l)).toBeCloseTo(1 + (loopGoalMult(l) - 1) * DAY_LOOP_WEIGHT[0]);
      expect(dayGoalMult(0, l)).toBeLessThanOrEqual(dayGoalMult(1, l));
    }
    expect(goalFor(0, 8, 'joren')).toBe(13400);
    expect(goalFor(3, 8, 'joren')).toBe(169600);
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

  it('見積もりは、何回呼んでも営業の結果を変えない', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 778, 'q');
    run.owned = [{ id: 'matome', lv: 2 }, { id: 'netsu', lv: 2 }, { id: 'makanai', lv: 2 }, { id: 'mie', lv: 1 }];
    const plan = dayPlan(run, meta);
    const play = (peek: boolean) => {
      const s = new PlaySession(plan.seed, plan.difficulty, plan.rules, null, plan.mods);
      for (let i = 0; i < 60 * 40; i++) {
        s.tick();
        if (peek) for (let k = 0; k < s.shop.seats.length; k++) s.shop.quote(k, { chain: 0, clean: true, saved: false });
        if (i % 9 === 0) { const t = s.shop.targets()[0]; const live = s.shop.input.active[0]; if (live || t) s.input((live?.matcher ?? new RomajiMatcher(t.kana)).remaining[0]); }
      }
      return [s.shop.score, s.shop.stats.served, s.record.length, JSON.stringify(s.shop.buildStats), s.shop.heat];
    };
    const plain = play(false);
    expect(plain[1]).toBeGreaterThan(0);
    expect(play(true)).toEqual(plain);
  });

  it('見積もりは、空いた席・歩いている客・食べている客・調達中・方針のない営業では null', () => {
    const s = shopWith([{ id: 'ippatsu', lv: 1 }], [null, 'grilledFish', 'vegSoup', 'jerky']);
    const ctx = { chain: 0, clean: true, saved: false };
    s.seats[2]!.state = 'walk';
    s.seats[3]!.state = 'eat';
    expect(s.quote(0, ctx)).toBeNull();
    expect(s.quote(1, ctx)).not.toBeNull();
    expect(s.quote(2, ctx)).toBeNull();
    expect(s.quote(3, ctx)).toBeNull();
    expect(s.quote(99, ctx)).toBeNull();
    s.away = { id: 'fishing', text: '', kana: 'つり', who: 'wife', act: '', place: '', gives: ['fish'], minimum: { fish: 4 } };
    expect(s.quote(1, ctx)).toBeNull();
    const plain = new Shop(new Rng(1), DIFFICULTIES[1]);
    plain.seats[0] = guest('grilledFish');
    expect(plain.quote(0, ctx)).toBeNull();
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

  it('ボット：日ごとに、1皿・1回の入力の最高額、大入りの秒数、手が止まった秒数を数える', () => {
    const r = botRun(11, prefer('連鎖', ['matome', 'mouippai', 'betsubara']), 6.5, 0.04, 1, emptyMeta(), true);
    const d = r.days[0];
    expect(d.bestServe).toBeGreaterThan(0);
    expect(d.bestInput).toBeGreaterThanOrEqual(d.bestServe);
    expect(d.feverSecs).toBe(0);
    expect(d.blockedSecs).toBeGreaterThanOrEqual(0);
    expect(d.fired.matome ?? 0).toBeGreaterThan(0);
  });

  it('ボット：予告で選ぶと、同じ種でも狙う皿が変わり、倍率の記録が入る', () => {
    const strat = prefer('一発', ['ippatsu', 'oomori', 'matome']);
    const a = botRun(11, strat, 6.5, 0.04, 1, emptyMeta(), true, 0.4, 'urgent');
    const b = botRun(11, strat, 6.5, 0.04, 1, emptyMeta(), true, 0.4, 'quote');
    expect(a.days[0].paid.length).toBe(a.days[0].served);
    expect(b.days[0].sales).not.toBe(a.days[0].sales);
    expect(Math.max(...b.days[0].paid)).toBeLessThanOrEqual(30);
    expect(b.days[0].capped).toBeGreaterThanOrEqual(0);
    // 予告で選ぶと、倍率の高い皿を先に打つので、皿の倍率の中央値は急ぐ順以上になる
    const mid = (x: number[]) => [...x].sort((p, q) => p - q)[Math.floor(x.length / 2)];
    expect(mid(b.days[0].paid)).toBeGreaterThanOrEqual(mid(a.days[0].paid));
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
  it('繁盛記の実績23件に、限定の飾りがちょうど1つずつ（二つ名14・プレート5・打鍵音4）', () => {
    expect(RUN_ACHIEVEMENTS).toHaveLength(23);
    const kinds: Record<string, number> = {};
    for (const a of RUN_ACHIEVEMENTS) {
      const it = achievementItem(a.id);
      expect(ITEMS.filter((i) => typeof i.source === 'object' && i.source.achievement === a.id)).toHaveLength(1);
      kinds[it!.kind] = (kinds[it!.kind] ?? 0) + 1;
    }
    expect(kinds).toEqual({ front: 7, back: 7, plate: 5, sound: 4 });
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

describe('第3段：かけ合わせは効いた皿だけ', () => {
  const bigGuest = (id: string): Guest => ({ ...guest(id), big: true, bigMult: 3.3, bigFrom: 'policy' });

  it('店全体の方針は持っているだけではかけ合わせにならない（倍率が乗った皿だけ）', () => {
    const owned = [{ id: 'oomori' as const, lv: 3 }, { id: 'tairyo' as const, lv: 3 }];
    const low = shopWith(owned, []);
    low.seats[0] = bigGuest('grilledFish');
    low.stock.fish = 3;
    const a = type(low, 'やきざかな').find((e) => e.type === 'serve')!;
    if (a.type !== 'serve') throw new Error('serve');
    expect(a.tags).not.toContain('tairyo');
    expect(low.buildStats.pairs).not.toContain(pairKey('oomori', 'tairyo'));
    const high = shopWith(owned, []);
    high.seats[0] = bigGuest('grilledFish');
    type(high, 'やきざかな');
    expect(high.buildStats.pairs).toContain(pairKey('oomori', 'tairyo'));
  });

  it('型も、3つがその皿に効いたときだけ成立する', () => {
    const owned = [{ id: 'asaichi' as const, lv: 1 }, { id: 'nushi' as const, lv: 1 }, { id: 'tairyo' as const, lv: 1 }];
    const key = setKey(SETS.find((x) => x.name === '朝駆けの型')!);
    const low = shopWith(owned, ['grilledFish']);
    low.freshUntil = 10;
    low.stock.fish = 3;
    type(low, 'やきざかな');
    expect(low.buildStats.sets).not.toContain(key);
    const high = shopWith(owned, ['grilledFish']);
    high.freshUntil = 10;
    type(high, 'やきざかな');
    expect(high.buildStats.sets).toContain(key);
  });

  it('倍率が乗った回数は、判子の回数と別に数える', () => {
    const s = shopWith([{ id: 'ippatsu', lv: 1 }], ['grilledFish', 'vegSoup']);
    s.key('q');
    type(s, 'やきざかな');
    expect(s.buildStats.fired.ippatsu ?? 0).toBe(0);
    expect(s.buildStats.boosted.ippatsu ?? 0).toBe(0);
    type(s, 'おんやさいもり');
    expect(s.buildStats.fired.ippatsu).toBe(1);
    expect(s.buildStats.boosted.ippatsu).toBe(1);
    const m = shopWith([{ id: 'makanai', lv: 1 }], ['grilledFish']);
    m.build!.saveChance = 1;
    type(m, 'やきざかな');
    expect(m.buildStats.fired.makanai).toBe(1);
    expect(m.buildStats.boosted.makanai).toBe(1);
  });
});

describe('第3段：皿に倍率が付く新しい方針', () => {
  const CTX = { chain: 0, clean: true, saved: false };
  const mult = (q: { factors: { id: string; mult: number }[] } | null, id: string) => q?.factors.find((f) => f.id === id)?.mult;

  it('早口自慢：読み7文字以上の料理を打って出した皿だけ ×2.0→2.5→3.0', () => {
    const s = shopWith([{ id: 'hayakuchi', lv: 3 }], ['vegSoup', 'grilledFish']);
    const long = type(s, 'おんやさいもり').find((e) => e.type === 'serve')!;
    if (long.type !== 'serve') throw new Error('serve');
    expect(long.factors!.find((f) => f.id === 'hayakuchi')?.mult).toBe(3.0);
    expect(long.tags).toContain('hayakuchi');
    expect(mult(s.quote(1, CTX), 'hayakuchi')).toBeUndefined();
    expect(mult(shopWith([{ id: 'hayakuchi', lv: 1 }], ['vegSoup']).quote(0, CTX), 'hayakuchi')).toBe(2.0);
    // まとめ出しのついでの皿（8字）には付かない
    const c = shopWith([{ id: 'hayakuchi', lv: 3 }, { id: 'matome', lv: 1 }], ['grilledFish', 'spicyPot']);
    const evs = type(c, 'やきざかな').filter((e) => e.type === 'serve');
    expect(evs).toHaveLength(2);
    const extra = evs[1];
    if (extra.type !== 'serve') throw new Error('serve');
    expect(extra.tags).not.toContain('hayakuchi');
  });

  it('手間ひま：2種類の皿 ×1.5→1.8→2.2、3種類以上の皿 ×2.0→2.5→3.0（ついでの皿にも効く）', () => {
    const s = shopWith([{ id: 'tema', lv: 2 }], ['grilledFish', 'stirFry', 'spicyPot']);
    expect(mult(s.quote(0, CTX), 'tema')).toBeUndefined();
    expect(mult(s.quote(1, CTX), 'tema')).toBe(1.8);
    expect(mult(s.quote(2, CTX), 'tema')).toBe(2.5);
    expect(mult(shopWith([{ id: 'tema', lv: 3 }], ['spicyPot']).quote(0, CTX), 'tema')).toBe(3.0);
    const c = shopWith([{ id: 'tema', lv: 3 }, { id: 'matome', lv: 1 }], ['grilledFish', 'spicyPot']);
    const evs = type(c, 'やきざかな').filter((e) => e.type === 'serve');
    const extra = evs[1];
    if (extra?.type !== 'serve') throw new Error('serve');
    expect(extra.factors!.find((f) => f.id === 'tema')?.mult).toBe(3.0);
    expect(extra.tags).toContain('tema');
  });

  it('強気の値付け：全部の皿 ×1.2→1.35→1.5、お客の待ち時間が 15→20→25% 短い', () => {
    const m = modsFor([{ id: 'tsuyoki', lv: 3 }]);
    expect(m.boldMult).toBe(1.5);
    expect(m.waitMult).toBeCloseTo(0.75);
    expect(modsFor([{ id: 'tsuyoki', lv: 1 }]).waitMult).toBeCloseTo(0.85);
    expect(modsFor([{ id: 'tsuyoki', lv: 3 }, { id: 'aiso', lv: 3 }]).waitMult).toBeCloseTo(1.7 * 0.75);
    const s = shopWith([{ id: 'tsuyoki', lv: 2 }], ['grilledFish']);
    expect(mult(s.quote(0, CTX), 'tsuyoki')).toBe(1.35);
    expect(s.quote(0, CTX)!.tags).toContain('tsuyoki');
  });

  it('宵っ張り：夜の皿 ×1.4→1.6→1.8、朝昼の皿は ×0.9（判子なし）、延長のあいだも夜', () => {
    const s = shopWith([{ id: 'yoippari', lv: 3 }], ['grilledFish']);
    for (const t of [0, 60]) {
      s.clock = t;
      const q = s.quote(0, CTX)!;
      expect(mult(q, 'yoippari')).toBe(0.9);
      expect(q.tags).not.toContain('yoippari');
    }
    s.clock = 120;
    expect(mult(s.quote(0, CTX), 'yoippari')).toBe(1.8);
    expect(s.quote(0, CTX)!.tags).toContain('yoippari');
    s.extra = 15;
    s.clock = DAY_LENGTH + 3;
    expect(mult(s.quote(0, CTX), 'yoippari')).toBe(1.8);
    expect(mult(shopWith([], ['grilledFish']).quote(0, CTX), 'yoippari')).toBeUndefined();
    expect(mult(shopWith([{ id: 'yoippari', lv: 1 }], ['grilledFish']).quote(0, CTX), 'yoippari')).toBe(0.9);
  });

  it('新しい方針にも判子と効果の文がある', () => {
    for (const id of ['hayakuchi', 'tema', 'tsuyoki', 'yoippari'] as const) {
      expect(POLICY_SEAL[id].length).toBeGreaterThanOrEqual(1);
      expect(POLICY_SEAL[id].length).toBeLessThanOrEqual(2);
      expect(descOf(id, 3)).toContain('×');
      expect(descOf(id, 3)).not.toContain('{');
    }
  });
});

describe('第3段：景気づけ', () => {
  const KANA: Record<string, string> = { grilledFish: 'やきざかな', vegSoup: 'おんやさいもり', mushSaute: 'きのこそてー', ale: 'えーる' };
  const serve = (s: Shop, id: string, g: Guest = guest(id)) => { s.seats[0] = g; return type(s, KANA[id]); };
  const used = (s: Shop) => (s as unknown as { keikiUsed: Record<string, number> }).keikiUsed;

  it('景気づけ：コンボを切らさずに5皿出すと、その5皿で一番多く使った素材2種類が +2→+3→+4（ユーザーの決定 2026-11-24）', () => {
    expect(KEIKI_EVERY).toBe(5);
    const s = shopWith([{ id: 'keiki', lv: 3 }], []);
    const evs = ['grilledFish', 'grilledFish', 'grilledFish', 'vegSoup', 'mushSaute'].flatMap((id) => serve(s, id));
    const k = evs.filter((e) => e.type === 'keiki');
    expect(k).toHaveLength(1);
    expect(k[0].type === 'keiki' && k[0].items).toEqual([{ id: 'fish', n: 4 }, { id: 'veg', n: 4 }]);
    expect(s.stock.fish).toBe(30 - 6 + 4);
    expect(s.stock.veg).toBe(30 - 2 + 4);
    expect(s.stock.mush).toBe(30 - 2);
    const last = evs.filter((e) => e.type === 'serve').at(-1)!;
    expect(last.type === 'serve' && last.tags).toContain('keiki');
    expect(s.buildStats.keiki).toBe(8);
    expect(s.buildStats.fired.keiki).toBe(1);
    expect(modsFor([{ id: 'keiki', lv: 1 }]).keikiGain).toBe(2);
    // 次の5皿で、もう一度
    const more = Array.from({ length: 5 }, () => 'vegSoup').flatMap((id) => serve(s, id));
    expect(more.filter((e) => e.type === 'keiki')).toHaveLength(1);
  });

  it('景気づけ：まかないで減らなかった分は数えず、大盛りの倍の分ともう一杯の酒は数える', () => {
    const m = shopWith([{ id: 'keiki', lv: 1 }, { id: 'makanai', lv: 1 }], []);
    m.build!.saveChance = 1;
    serve(m, 'grilledFish');
    expect(used(m)).toEqual({});
    const b = shopWith([{ id: 'keiki', lv: 1 }, { id: 'mouippai', lv: 1 }], []);
    serve(b, 'grilledFish', { ...guest('grilledFish'), dish: { ...dish('grilledFish'), need: { fish: 4 } }, big: true, bigMult: 2, bigFrom: 'road' });
    expect(used(b)).toEqual({ fish: 4, ale: 1 });
  });

  it('景気づけ：コンボが切れたら、数えた皿も素材も数え直す', () => {
    const s = shopWith([{ id: 'keiki', lv: 3 }], []);
    for (let i = 0; i < 4; i++) serve(s, 'grilledFish');
    expect(s.keikiCount).toBe(4);
    for (let i = 0; i <= s.comboMissAllowance; i++) s.key('q');
    expect(s.combo).toBe(0);
    expect(s.keikiCount).toBe(0);
    expect(used(s)).toEqual({});
    const evs = Array.from({ length: 4 }, () => 'vegSoup').flatMap((id) => serve(s, id));
    expect(evs.some((e) => e.type === 'keiki')).toBe(false);
    const five = serve(s, 'vegSoup').find((e) => e.type === 'keiki')!;
    expect(five.type === 'keiki' && five.items).toEqual([{ id: 'veg', n: 4 }]);
  });

  it('景気づけ：使った数が同じなら素材の並び順、1種類だけならその1種類', () => {
    const s = shopWith([{ id: 'keiki', lv: 2 }], []);
    const evs = ['mushSaute', 'vegSoup', 'grilledFish', 'ale', 'ale'].flatMap((id) => serve(s, id));
    const k = evs.find((e) => e.type === 'keiki')!;
    expect(k.type === 'keiki' && k.items).toEqual([{ id: 'fish', n: 3 }, { id: 'veg', n: 3 }]);
  });

  it('景気づけ：増えた素材を使う皿は、次の5皿のあいだ ×1.3→1.5→1.8。コンボが切れたら終わる', () => {
    const s = shopWith([{ id: 'keiki', lv: 3 }], []);
    ['grilledFish', 'grilledFish', 'grilledFish', 'vegSoup', 'mushSaute'].forEach((id) => serve(s, id));
    const fish = serve(s, 'grilledFish').find((e) => e.type === 'serve')!;
    if (fish.type !== 'serve') throw new Error('serve');
    expect(fish.factors!.find((f) => f.id === 'keiki')?.mult).toBe(1.8);
    expect(fish.tags).toContain('keiki');
    const mush = serve(s, 'mushSaute').find((e) => e.type === 'serve')!;
    if (mush.type !== 'serve') throw new Error('serve');
    expect(mush.factors!.find((f) => f.id === 'keiki')).toBeUndefined();
    for (let i = 0; i <= s.comboMissAllowance; i++) s.key('q');
    const after = serve(s, 'grilledFish').find((e) => e.type === 'serve')!;
    if (after.type !== 'serve') throw new Error('serve');
    expect(after.factors!.find((f) => f.id === 'keiki')).toBeUndefined();
    expect(modsFor([{ id: 'keiki', lv: 1 }]).keikiMult).toBe(1.3);
  });

  it('景気づけ：次の5皿目でまた増えたら、倍率の付く素材もその素材に入れ替わる', () => {
    const s = shopWith([{ id: 'keiki', lv: 1 }], []);
    ['grilledFish', 'grilledFish', 'grilledFish', 'grilledFish', 'grilledFish'].forEach((id) => serve(s, id));
    const first = serve(s, 'grilledFish').find((e) => e.type === 'serve')!;
    if (first.type !== 'serve') throw new Error('serve');
    expect(first.factors!.find((f) => f.id === 'keiki')?.mult).toBe(1.3);
    const evs = ['mushSaute', 'mushSaute', 'vegSoup', 'vegSoup'].flatMap((id) => serve(s, id));
    const k = evs.filter((e) => e.type === 'keiki').at(-1)!;
    expect(k.type === 'keiki' && k.items.map((x) => x.id)).toEqual(['veg', 'mush']);
    const fish = serve(s, 'grilledFish').find((e) => e.type === 'serve')!;
    if (fish.type !== 'serve') throw new Error('serve');
    expect(fish.factors!.find((f) => f.id === 'keiki')).toBeUndefined();
    const veg = serve(s, 'vegSoup').find((e) => e.type === 'serve')!;
    if (veg.type !== 'serve') throw new Error('serve');
    expect(veg.factors!.find((f) => f.id === 'keiki')?.mult).toBe(1.3);
  });

  it('大入り袋は今どおり10皿ごと。景気づけと両方持てば、10皿で景気づけ2回・大入り1回', () => {
    const s = shopWith([{ id: 'ooiri', lv: 1 }], []);
    const evs = Array.from({ length: 10 }, () => 'grilledFish').flatMap((id) => serve(s, id));
    expect(evs.filter((e) => e.type === 'fever' && e.on)).toHaveLength(1);
    expect(evs.some((e) => e.type === 'keiki')).toBe(false);
    const both = shopWith([{ id: 'ooiri', lv: 1 }, { id: 'keiki', lv: 1 }], []);
    const evs2 = Array.from({ length: 10 }, () => 'grilledFish').flatMap((id) => serve(both, id));
    expect(evs2.filter((e) => e.type === 'keiki')).toHaveLength(2);
    expect(evs2.filter((e) => e.type === 'fever' && e.on)).toHaveLength(1);
  });
});

describe('第3段：新しい方針の解放', () => {
  const facts = (sales: number, over: Partial<ReturnType<typeof emptyBuildStats>> = {}, maxCombo = 12) => ({ sales, served: 30, maxCombo, angry: 0, build: { ...emptyBuildStats(), ...over } });
  const day = (meta: ReturnType<typeof emptyMeta>, f: ReturnType<typeof facts>) => { const run = newRun(meta, 5, 'r1'); meta.active = run; closeDay(run, meta, f); return meta.policies; };

  it('新しい方針の解放：50コンボ・目標5回・延長・大入りで解放する（強気の値付けは最初から）', () => {
    const avail = availablePolicies(emptyMeta());
    expect(avail).toContain('tsuyoki');
    for (const id of ['hayakuchi', 'tema', 'yoippari', 'keiki'] as const) expect(avail).not.toContain(id);
    expect(day(emptyMeta(), facts(0, {}, 49))).not.toContain('hayakuchi');
    expect(day(emptyMeta(), facts(0, {}, 50))).toContain('hayakuchi');
    const four = emptyMeta(); four.daysCleared = 4;
    expect(day(four, facts(0))).not.toContain('tema');
    expect(day(four, facts(999999))).toContain('tema');
    expect(day(emptyMeta(), facts(0, { extended: 15 }))).toContain('yoippari');
    expect(day(emptyMeta(), facts(0, { fevers: 1 }))).toContain('keiki');
    expect(day(emptyMeta(), facts(0))).toEqual([]);
  });
});

describe('第3段：新しいかけ合わせ', () => {
  it('同時に起きない条件の2つは、かけ合わせ・型に入れない', () => {
    const EXCLUSIVE: [PolicyId, PolicyId][] = [['asaichi', 'yoippari'], ['sekkachi', 'aiso']];
    for (const [x, y] of EXCLUSIVE) {
      for (const p of PAIRS) expect([p.a, p.b].includes(x) && [p.a, p.b].includes(y)).toBe(false);
      for (const s of SETS) expect(s.ids.includes(x) && s.ids.includes(y)).toBe(false);
    }
  });

  it('組は44で、新しい10組は末尾にある（古い34組の並びは変えない）', () => {
    expect(PAIRS).toHaveLength(44);
    expect(PAIRS[33].name).toBe('伝票が終わらない');
  });

  type Setup = { owned: PolicyId[]; seats: (string | Guest)[]; kana: string; prep?: (s: Shop) => void };
  const at = (t: number) => (s: Shop) => { s.clock = t; };
  const CASES: Record<string, Setup> = {
    立て板に水: { owned: ['hayakuchi', 'ippatsu'], seats: ['vegSoup'], kana: 'おんやさいもり' },
    早口言葉: { owned: ['hayakuchi', 'netsu'], seats: ['vegSoup'], kana: 'おんやさいもり', prep: (s) => { s.heat = 0.3; (s as unknown as { lastTypedAt: number }).lastTypedAt = s.clock; } },
    特上の大皿: { owned: ['oomori', 'tema'], seats: [{ ...guest('stirFry'), big: true, bigMult: 3.3, bigFrom: 'policy' }], kana: 'にくやさいいため' },
    夜の御膳: { owned: ['tema', 'yoippari'], seats: ['stirFry'], kana: 'にくやさいいため', prep: at(125) },
    強気の看板: { owned: ['tsuyoki', 'aiso'], seats: [guest('grilledFish', 10)], kana: 'やきざかな' },
    格式の店: { owned: ['tsuyoki', 'yoyaku'], seats: ['grilledFish'], kana: 'やきざかな' },
    夜通し: { owned: ['yoippari', 'encho'], seats: ['grilledFish'], kana: 'やきざかな', prep: (s) => { s.extra = 15; s.clock = DAY_LENGTH + 3; } },
    夜の早口: { owned: ['hayakuchi', 'yoippari'], seats: ['vegSoup'], kana: 'おんやさいもり', prep: at(125) },
    大盤振る舞い: { owned: ['keiki', 'matome'], seats: ['grilledFish', 'driedFish'], kana: 'やきざかな', prep: (s) => { s.keikiCount = 4; } },
    蔵いっぱい: { owned: ['keiki', 'shikomi'], seats: ['grilledFish'], kana: 'やきざかな', prep: (s) => { s.keikiCount = 4; } },
  };

  it('新しいかけ合わせは、実際に同じ皿で発見できる', () => {
    for (const p of PAIRS.slice(34)) {
      const c = CASES[p.name];
      expect(c, p.name).toBeDefined();
      expect([...c.owned].sort(), p.name).toEqual([p.a, p.b].sort());
      const s = shopWith(c.owned.map((id) => ({ id, lv: 1 })), []);
      c.seats.forEach((x, i) => { s.seats[i] = typeof x === 'string' ? guest(x) : x; });
      c.prep?.(s);
      type(s, c.kana);
      expect(s.buildStats.pairs, p.name).toContain(pairKey(p.a, p.b));
    }
  });
});

describe('第4段：方針ごとの稼ぎの振り返り', () => {
  it('稼ぎは、効いた倍率の対数の比で配る（×4 は ×2 の2倍）', () => {
    const s = shopWith([{ id: 'ippatsu', lv: 1 }, { id: 'nushi', lv: 1 }], ['grilledFish']);
    s.build!.ippatsuMult = 2;
    s.build!.freshMult = 4;
    s.freshUntil = 10;
    type(s, 'やきざかな');
    const y = s.buildStats.yen;
    expect(y.nushi! / y.ippatsu!).toBeCloseTo(2, 2);
  });

  it('引き換えの倍率だけの皿では、どの方針にも配らない', () => {
    const s = shopWith([{ id: 'ippatsu', lv: 1 }, { id: 'yoippari', lv: 1 }], ['grilledFish']);
    for (let i = 0; i <= s.comboMissAllowance; i++) s.key('q');
    type(s, 'やきざかな');
    expect(Object.values(s.buildStats.yen).every((v) => !v)).toBe(true);
  });

  it('上限で止まった皿でも、配った額は有限で0以上、合計は売上以内', () => {
    const s = shopWith([{ id: 'mie', lv: 3 }, { id: 'ippatsu', lv: 3 }, { id: 'yoyaku', lv: 3 }, { id: 'tema', lv: 3 }, { id: 'tsuyoki', lv: 3 }], ['spicyPot']);
    s.combo = 60;
    const ev = type(s, 'ちげなべおおもり').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.capped).toBe(true);
    const vals = Object.values(s.buildStats.yen) as number[];
    expect(vals.every((v) => Number.isFinite(v) && v >= 0)).toBe(true);
    expect(vals.reduce((a, b) => a + b, 0)).toBeLessThanOrEqual(ev.gain + 1e-6);
  });

  it('こまめな仕込みで時間帯のはじめに足した素材を数える', () => {
    const s = shopWith([{ id: 'shikomi', lv: 3 }], []);
    s.clock = 49.99;
    s.update(0.05);
    expect(s.buildStats.prep).toBe(5 * 6);
  });
});

describe('第5段：上位の実績', () => {
  it('一皿一万円・本番の倍返し・大繁盛・極は、上位の条件で取れる（今の3つはそのまま）', () => {
    const m = emptyMeta();
    m.best.serve = 9999; m.best.late = 199; m.best.total = 299999;
    expect(earnedAchievements(m)).not.toEqual(expect.arrayContaining(['run-serve10k']));
    m.best.serve = 10000; m.best.late = 200; m.best.total = 300000;
    expect(earnedAchievements(m)).toEqual(expect.arrayContaining(['run-serve10k', 'run-double-late', 'run-300k', 'run-bigserve', 'run-100k']));
  });

  it('本番の倍返しは、3日目か4日目の達成率だけを数える', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 5, 'r1');
    meta.active = run;
    const build = emptyBuildStats();
    closeDay(run, meta, { sales: goalFor(0, run.loop, run.road) * 3, served: 30, maxCombo: 10, angry: 0, build });
    expect(meta.best.late).toBe(0);
    run.day = 2;
    run.days.push(run.days[0], run.days[0]);
    run.stage = 'open';
    const goal = goalFor(2, run.loop, run.road);
    closeDay(run, meta, { sales: goal * 2, served: 30, maxCombo: 10, angry: 0, build });
    expect(meta.best.late).toBe(200);
  });

  it('古い保存データ（best.late がない）は 0 として読む', () => {
    const raw = JSON.parse(JSON.stringify(emptyMeta()));
    delete raw.best.late;
    expect(readMeta(raw).best.late).toBe(0);
  });
});

describe('Codex の指摘：営業条件の増収は方針に配らない', () => {
  const fish = (over: Partial<Guest> = {}): Guest => ({ ...guest('grilledFish', 15), ...over });
  it('せっかち客の日（チップ3倍）でも、強気の値付けの稼ぎは強気が増やした分だけ', () => {
    const s = new Shop(new Rng(1), DIFFICULTIES[1], NORMAL_RULES, modsFor([{ id: 'tsuyoki', lv: 1 }], { tipMult: 3 }));
    for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 30;
    s.seats[0] = fish();
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.gain).toBe(252);
    expect(s.buildStats.yen.tsuyoki).toBeCloseTo(42, 5);
  });

  it('大食いの日の大盛り（営業条件）の分も、方針には配らない', () => {
    const s = shopWith([{ id: 'tsuyoki', lv: 1 }], []);
    s.seats[0] = fish({ dish: { ...dish('grilledFish'), need: { fish: 4 } }, big: true, bigMult: 2, bigFrom: 'road' });
    const ev = type(s, 'やきざかな').find((e) => e.type === 'serve')!;
    if (ev.type !== 'serve') throw new Error('serve');
    expect(ev.gain).toBe(360);
    expect(s.buildStats.yen.tsuyoki).toBeCloseTo(60, 5);
  });
});

describe('Codex の指摘：景気づけの数え方', () => {
  it('素材を増やした回数・増えた個数・倍率が乗った皿の数を別に数える', () => {
    const s = shopWith([{ id: 'keiki', lv: 1 }], []);
    for (let i = 0; i < 10; i++) { s.seats[0] = guest('grilledFish'); type(s, 'やきざかな'); }
    expect(s.buildStats.keikiBoosts).toBe(2);
    expect(s.buildStats.keiki).toBe(4);
    expect(s.buildStats.boosted.keiki).toBe(5);
  });
  it('翌日の見込みは「補充の機会」と「最大の個数」で言う（必ず2種類に配れるとは限らないため）', () => {
    const seen = { served: 40, long: 0, kinds2: 0, kinds3: 0, morning: 0, night: 0, tens: 1, fives: 2 };
    expect(estimateFor('keiki', 1, seen)).toBe('昨日なら補充の機会2回（最大+8個）');
  });
});
