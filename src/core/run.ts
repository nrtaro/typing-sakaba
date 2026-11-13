// 繁盛記：4日間の営業を通して方針（ビルド）を育てるモードの進行。
// 画面・音は扱わない。1日の営業そのものは Shop／PlaySession が進め、ここは日をまたぐものを持つ。
//   朝・昼・夜の方針えらび（1日3回×4日）→ 閉店で売上目標の判定 → 明日の営業えらび（道中）→ …
//   4日目の目標を越えるとクリアで、次は「のれん」が1枚増えて難しくなる（上限なし）。
import {
  MAX_LEVEL, MAX_SLOTS, PAIRS, POLICIES, SETS, isPolicy, modsFor, pairKey, pairOf, partnersOf, policyOf, setOf, stockGainOnPick,
  type BuildMods, type BuildStats, type Owned, type PolicyId,
} from './build';
import { NORMAL_RULES, type DayRules } from './daily';
import { subRng } from './rng';
import { difficultyOf, type Difficulty } from './shopConfig';

export const RUN_NAME = '繁盛記';
export const RUN_DAYS = 4;
/** 1日の方針えらびの回数（朝・昼・夜） */
export const PICKS_PER_DAY = 3;

// ---------- 難しさ（日ごと・のれんごと） ----------

/** 日ごとの売上目標（のれん1枚目・常連の日） */
export const GOAL_BASE = [9000, 21000, 42000, 76000];
/** 日ごとのお客の来る間隔・待ってくれる時間（通常営業の「ふつう」が 1.2／1.2、「むずかしい」が 0.9／0.9） */
const DAY_EVERY = [0.95, 0.8, 0.66, 0.56];
/** 繁盛記はお客が多いので、調達の持ち帰りも通常より多い */
export const BASE_TRIP_MULT = 1.3;
const DAY_WAIT = [1.15, 1.05, 0.95, 0.9];

/** のれん n 枚目の目標の倍率（上限なし。枚数が増えるほど、1枚ごとの伸びも少しずつ大きくなる） */
export function loopGoalMult(loop: number) {
  const k = Math.max(1, loop) - 1;
  return 1 + 0.12 * k + 0.008 * k * k;
}
/** のれんが増えるとお客も増え、せっかちになる（入力が追いつく範囲で止め、その先は目標だけが伸びる） */
export function loopEveryMult(loop: number) {
  return Math.max(0.72, 1 - 0.035 * (Math.max(1, loop) - 1));
}
export function loopWaitMult(loop: number) {
  return Math.max(0.78, 1 - 0.025 * (Math.max(1, loop) - 1));
}

/**
 * のれんの試練：枚数が増えると、売上の目標だけでなく営業そのものが難しくなる（重なっていく）。
 * お客の足は1枚ごとに速くなり、決まった枚数から新しい試練が加わる。数で伸びるものは上限なく伸び続ける。
 */
export interface Trial { from: number; name: string; text: (loop: number) => string }
export const TRIALS: Trial[] = [
  { from: 2, name: '早い足', text: (l) => `お客の歩く速さ×${walkMult(l).toFixed(2)}（1枚ごとに速くなる）` },
  { from: 2, name: '背伸びの献立', text: (l) => (l >= 4 ? '夜の料理まで、朝から注文される' : '手のかかる料理が、ひとつ早い時間帯から出る') },
  { from: 3, name: '目の肥えた客', text: () => 'コンボが切れるまでのミスが1回減る' },
  { from: 4, name: 'せっかちな客', text: (l) => `お客の${Math.round(impatient(l) * 100)}%は、待ち時間が6割しかない` },
  { from: 5, name: '評判の重み', text: (l) => `怒って帰ったときの減点が${angryMult(l)}倍（1枚ごとに増える）` },
  { from: 6, name: '品薄', text: (l) => `調達で持ち帰る素材が${Math.round((1 - tripTrial(l)) * 100)}%減る` },
];
export const walkMult = (loop: number) => Math.min(3, 1 + 0.12 * (Math.max(1, loop) - 1));
const impatient = (loop: number) => (loop >= 4 ? Math.min(0.6, 0.2 + 0.05 * (loop - 4)) : 0);
const angryMult = (loop: number) => (loop >= 5 ? loop - 3 : 1);
const tripTrial = (loop: number) => (loop >= 6 ? Math.max(0.6, 1 - 0.05 * (loop - 5)) : 1);
export const trialsFor = (loop: number) => TRIALS.filter((t) => loop >= t.from);
export function trialMods(loop: number): Partial<BuildMods> {
  return { walkMult: walkMult(loop), dishShift: loop >= 4 ? 2 : loop >= 2 ? 1 : 0, impatient: impatient(loop), angryMult: angryMult(loop), tripMult: tripTrial(loop) };
}

export function dayDifficulty(day: number, loop: number): Difficulty {
  const d = Math.max(0, Math.min(RUN_DAYS - 1, day));
  return { ...difficultyOf('normal'), comboMissAllowance: loop >= 3 ? 1 : 2, everyMult: DAY_EVERY[d] * loopEveryMult(loop), waitMult: DAY_WAIT[d] * loopWaitMult(loop) };
}

// ---------- 道中：明日の営業をえらぶ ----------

export type RoadId = 'joren' | 'enkai' | 'manin' | 'ichi' | 'sekkachi' | 'hashigo' | 'nonbiri' | 'oogui';
export type Gift = 'boost' | 'reroll';
export interface Road {
  id: RoadId;
  name: string;
  kana: string;
  /** どう変わるか／危険と見返り */
  lines: [string, string];
  goalMult: number;
  mods: Partial<BuildMods>;
  rules: (seed: number, day: number) => Partial<DayRules>;
  gift: Gift | null;
  /** 相性のよい方針（選ぶ画面で知らせる） */
  good: PolicyId[];
}

const BANQUET_AT = [62, 112, 158];
const BANQUET_DISH = ['feast', 'banquet', 'everything', 'hunterStew', 'spicyPot', 'paella'];

export const ROADS: Road[] = [
  // 1日目だけに使う、何も起きない日（明日の営業の候補には出さない）
  { id: 'joren', name: '常連の日', kana: 'じょうれん', lines: ['いつもの顔ぶれ。変わったことは起きない', '目標はそのまま'], goalMult: 1, mods: {}, rules: () => ({}), gift: null, good: [] },
  {
    id: 'enkai', name: '宴会の日', kana: 'えんかい', lines: ['予約の宴会が3組来る。宴会の注文だけ売上2倍', '怒らせると減点も3倍。目標+15%'], goalMult: 1.15, mods: {}, gift: null, good: ['oomori', 'shikomi', 'tairyo', 'aiso'],
    rules: (seed, day) => {
      const r = subRng(seed, 77, day);
      const pool = [...BANQUET_DISH];
      return { banquets: BANQUET_AT.map((at) => ({ at, dish: pool.splice(Math.floor(r.next() * pool.length), 1)[0] })) };
    },
  },
  { id: 'manin', name: '満員御礼', kana: 'まんいん', lines: ['お客が3割多く来る。目標+25%', 'ごほうび：明日の朝えらぶ方針は、Lvが1つおまけ'], goalMult: 1.25, mods: { everyMult: 1 / 1.3 }, rules: () => ({}), gift: 'boost', good: ['matome', 'yobikomi', 'sekkachi'] },
  { id: 'ichi', name: '市の立つ日', kana: 'いち', lines: ['調達で持ち帰る素材が1.5倍', '目標+10%'], goalMult: 1.1, mods: { tripMult: 1.5 }, rules: () => ({}), gift: null, good: ['nushi', 'tairyo', 'oomori', 'mouippai'] },
  { id: 'sekkachi', name: 'せっかち客の日', kana: 'せっかち', lines: ['お客の待ち時間が3/4。チップは3倍', '目標+10%。ごほうび：明日は引き直し+2回'], goalMult: 1.1, mods: { waitMult: 0.75, tipMult: 3 }, rules: () => ({}), gift: 'reroll', good: ['sekkachi', 'omotenashi', 'aiso'] },
  { id: 'hashigo', name: 'はしご酒の日', kana: 'はしご', lines: ['もう1品たのむお客が3割ふえる', '2品目は待たせても怒らない。目標+15%'], goalMult: 1.15, mods: { refillChance: 0.3 }, rules: () => ({}), gift: null, good: ['betsubara', 'mouippai', 'matome'] },
  { id: 'nonbiri', name: 'のんびりの日', kana: 'のんびり', lines: ['お客が2割少なく、3割長く待ってくれる', '目標-10%。ひと息つける日'], goalMult: 0.9, mods: { everyMult: 1.25, waitMult: 1.3 }, rules: () => ({}), gift: null, good: ['yoyaku', 'omotenashi', 'aiso'] },
  { id: 'oogui', name: '大食いの日', kana: 'おおぐい', lines: ['大盛り（素材2倍・売上2倍）のお客が3割ふえる', '素材の減りが早い。目標+15%'], goalMult: 1.15, mods: { bigChance: 0.3 }, rules: () => ({}), gift: null, good: ['oomori', 'tairyo', 'makanai', 'shikomi'] },
];
const ROAD_BY_ID = new Map(ROADS.map((r) => [r.id, r]));
export const roadOf = (id: RoadId) => ROAD_BY_ID.get(id) ?? ROADS[0];

/** 明日の営業の候補：3つ（種から決まる。開き直しても同じ）。どれも何かが変わる日で、少なくとも1つは目標が軽め */
export function roadOffers(seed: number, day: number): Road[] {
  const r = subRng(seed, 31, day);
  const pool = ROADS.filter((x) => x.id !== 'joren');
  const out: Road[] = [];
  const easy = pool.filter((x) => x.goalMult <= 1.1);
  const first = easy[Math.floor(r.next() * easy.length)];
  out.push(first);
  pool.splice(pool.indexOf(first), 1);
  for (let i = 0; i < 2; i++) out.push(pool.splice(Math.floor(r.next() * pool.length), 1)[0]);
  // 並びは種で入れ替える（軽い日がいつも左に来ないように）
  const k = Math.floor(r.next() * 3);
  return [...out.slice(k), ...out.slice(0, k)];
}

export function goalFor(day: number, loop: number, road: RoadId) {
  const d = Math.max(0, Math.min(RUN_DAYS - 1, day));
  return Math.round((GOAL_BASE[d] * loopGoalMult(loop) * roadOf(road).goalMult) / 100) * 100;
}

// ---------- ランの状態 ----------

export interface DayResult {
  sales: number; goal: number; served: number; maxCombo: number; angry: number; maxChain: number; bestServe: number; road: RoadId;
}

export interface RunState {
  v: 1;
  id: string;
  seed: number;
  loop: number;
  /** 何日目か（0 から） */
  day: number;
  /** morning＝朝の方針えらび前／open＝営業中（中断したらこの日の開店からやり直す）／closed＝閉店して結果を見ている／road＝明日の営業えらび */
  stage: 'morning' | 'open' | 'closed' | 'road';
  owned: Owned[];
  /** 今日の残りの引き直し */
  rerolls: number;
  /** 今日の朝の方針が2段階ぶんか（満員御礼のごほうび） */
  boost: boolean;
  road: RoadId;
  days: DayResult[];
  /** このランで成立したかけ合わせ */
  pairs: string[];
  /** このランで方針ごとに増えた売上 */
  yen: Partial<Record<PolicyId, number>>;
}

export interface RunSummary {
  cleared: boolean; loop: number; day: number; total: number; sig: PolicyId | null; owned: Owned[]; days: DayResult[]; pairs: string[]; at: string;
}

/** 端末に残す繁盛記の記録（版付き） */
export interface RunMeta {
  v: 1;
  /** いま挑む「のれん」の枚数（クリアするたびに1枚増える。上限なし） */
  loop: number;
  clears: number;
  runs: number;
  /** 目標を越えた日の累計（心得の解放に使う） */
  daysCleared: number;
  best: { total: number; day: number; combo: number; chain: number; serve: number; ratio: number; stack: number };
  /** 見つけたかけ合わせ */
  discovered: string[];
  /** 見つけた型 */
  sets: string[];
  /** クリアしたときの主力（いちばん稼いだ方針） */
  sigs: PolicyId[];
  /** 解放した方針 */
  policies: PolicyId[];
  flags: { noAngry: boolean; max3: boolean };
  active: RunState | null;
  last: RunSummary | null;
  /** 貯金箱へ足し終えたランのID */
  paid: string[];
}

export function emptyMeta(): RunMeta {
  return {
    v: 1, loop: 1, clears: 0, runs: 0, daysCleared: 0,
    best: { total: 0, day: 0, combo: 0, chain: 0, serve: 0, ratio: 0, stack: 0 },
    discovered: [], sets: [], sigs: [], policies: [], flags: { noAngry: false, max3: false }, active: null, last: null, paid: [],
  };
}

const num = (v: unknown, max = Number.MAX_SAFE_INTEGER) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.min(max, Math.floor(v)) : 0);
const obj = (v: unknown) => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const arr = (v: unknown) => (Array.isArray(v) ? v : []);
const readOwned = (v: unknown): Owned[] => {
  const out: Owned[] = [];
  for (const x of arr(v)) {
    const o = obj(x);
    if (isPolicy(o.id) && !out.some((p) => p.id === o.id) && out.length < MAX_SLOTS) out.push({ id: o.id, lv: Math.max(1, Math.min(MAX_LEVEL, num(o.lv))) });
  }
  return out;
};
const isRoad = (v: unknown): v is RoadId => typeof v === 'string' && ROAD_BY_ID.has(v as RoadId);
const readDay = (v: unknown): DayResult => {
  const o = obj(v);
  return { sales: num(o.sales), goal: num(o.goal), served: num(o.served), maxCombo: num(o.maxCombo), angry: num(o.angry), maxChain: num(o.maxChain), bestServe: num(o.bestServe), road: isRoad(o.road) ? o.road : 'joren' };
};
const readYen = (v: unknown) => {
  const out: Partial<Record<PolicyId, number>> = {};
  for (const [k, n] of Object.entries(obj(v))) if (isPolicy(k)) out[k] = num(n);
  return out;
};
const readPairs = (v: unknown) => [...new Set(arr(v).filter((x): x is string => typeof x === 'string' && !!pairOf(x)))];

function readRun(v: unknown): RunState | null {
  const o = obj(v);
  if (typeof o.id !== 'string' || !o.id) return null;
  const stage = o.stage === 'open' || o.stage === 'closed' || o.stage === 'road' ? o.stage : 'morning';
  const day = num(o.day, RUN_DAYS - 1);
  const days = arr(o.days).slice(0, RUN_DAYS).map(readDay);
  // 日数と結果の数が合わない保存は使わない（壊れた途中経過から再開しない）
  if (days.length !== (stage === 'closed' || stage === 'road' ? day + 1 : day)) return null;
  return {
    v: 1, id: o.id.slice(0, 64), seed: num(o.seed, 0xffffffff), loop: Math.max(1, num(o.loop)), day, stage, owned: readOwned(o.owned),
    rerolls: num(o.rerolls, 9), boost: o.boost === true, road: isRoad(o.road) ? o.road : 'joren', days, pairs: readPairs(o.pairs), yen: readYen(o.yen),
  };
}

/** 保存された値を読み取る。壊れた値・古い形でも、読める分だけ使う */
export function readMeta(raw: unknown): RunMeta {
  const m = emptyMeta();
  const o = obj(raw);
  m.loop = Math.max(1, num(o.loop));
  m.clears = num(o.clears);
  m.runs = num(o.runs);
  m.daysCleared = num(o.daysCleared);
  const b = obj(o.best);
  for (const k of Object.keys(m.best) as (keyof RunMeta['best'])[]) m.best[k] = num(b[k]);
  m.discovered = readPairs(o.discovered);
  m.sets = [...new Set(arr(o.sets).filter((x): x is string => typeof x === 'string' && !!setOf(x)))];
  m.sigs = [...new Set(arr(o.sigs).filter(isPolicy))];
  m.policies = [...new Set(arr(o.policies).filter(isPolicy))];
  const f = obj(o.flags);
  m.flags = { noAngry: f.noAngry === true, max3: f.max3 === true };
  m.active = readRun(o.active);
  const l = obj(o.last);
  if (typeof l.at === 'string') {
    m.last = {
      cleared: l.cleared === true, loop: Math.max(1, num(l.loop)), day: num(l.day, RUN_DAYS - 1), total: num(l.total), sig: isPolicy(l.sig) ? l.sig : null,
      owned: readOwned(l.owned), days: arr(l.days).slice(0, RUN_DAYS).map(readDay), pairs: readPairs(l.pairs), at: l.at,
    };
  }
  m.paid = arr(o.paid).filter((x): x is string => typeof x === 'string').slice(-50);
  return m;
}

// ---------- 心得（次の挑戦を少し有利にする成長） ----------

export interface Perk { at: number; name: string; text: string }
export const PERKS: Perk[] = [
  { at: 4, name: '常連の差し入れ', text: '開店のとき、全部の素材が+1' },
  { at: 12, name: '目利きの勘', text: '毎日の引き直しが+1' },
  { at: 24, name: '顔が広い', text: '1日目の朝の候補が4つになる' },
];
export const perkCount = (m: RunMeta) => PERKS.filter((p) => m.daysCleared >= p.at).length;

/** いま選べる方針（最初からのものと、解放したもの） */
export function availablePolicies(m: RunMeta): PolicyId[] {
  return POLICIES.filter((p) => p.starter || m.policies.includes(p.id)).map((p) => p.id);
}

export function newRun(meta: RunMeta, seed: number, id: string): RunState {
  return { v: 1, id, seed: seed >>> 0, loop: meta.loop, day: 0, stage: 'morning', owned: [], rerolls: 1 + (perkCount(meta) >= 2 ? 1 : 0), boost: false, road: 'joren', days: [], pairs: [], yen: {} };
}

/** その日の営業に渡すもの：難しさ・お題のルール・方針のはたらき・目標・乱数の種 */
export function dayPlan(run: RunState, meta: RunMeta) {
  const road = roadOf(run.road);
  const trial = trialMods(run.loop);
  const base: Partial<BuildMods> = { ...trial, ...road.mods, tripMult: BASE_TRIP_MULT * (trial.tripMult ?? 1) * (road.mods.tripMult ?? 1), startStock: perkCount(meta) >= 1 ? 1 : 0 };
  return {
    seed: (subRng(run.seed, 5, run.day).next() * 4294967296) >>> 0,
    difficulty: dayDifficulty(run.day, run.loop),
    rules: { ...NORMAL_RULES, ...road.rules(run.seed, run.day) } as DayRules,
    base,
    mods: modsFor(run.owned, base),
    goal: goalFor(run.day, run.loop, run.road),
  };
}

// ---------- 方針えらび ----------

export interface Offer {
  /** add＝空き枠に加える／up＝強化／swap＝どれかと入れ替える */
  kind: 'add' | 'up' | 'swap';
  id: PolicyId;
  /** 選んだあとの段階 */
  lv: number;
  /** 今の構成とのつながり（なければ null） */
  link: string | null;
  /** 名前付きのかけ合わせになる相手を持っているか */
  hot: boolean;
}

/** 支える側の方針：何を助けるか */
const SUPPORT: Partial<Record<PolicyId, { with: PolicyId[]; text: string }>> = {
  tairyo: { with: ['matome', 'mouippai', 'betsubara'], text: '素材切れを防ぐ' },
  shikomi: { with: ['matome', 'mouippai', 'nushi'], text: '調達の回数を減らせる' },
  yobikomi: { with: ['matome', 'betsubara', 'ooiri', 'ryoshusho'], text: '出す相手が増える' },
  aiso: { with: ['oomori', 'nushi', 'ryoshusho'], text: '調達やコンボの間を待ってもらえる' },
  makanai: { with: ['matome', 'oomori', 'mouippai'], text: '素材の減りを抑える' },
};

function linkFor(id: PolicyId, owned: Owned[]): { link: string | null; hot: boolean } {
  const has = (p: PolicyId) => owned.some((o) => o.id === p);
  // 型：残りの2つを持っていれば、これでそろう
  const set = SETS.find((x) => x.ids.includes(id) && x.ids.every((q) => q === id || has(q)));
  if (set) return { link: `これで『${set.name}』がそろう`, hot: true };
  const partner = partnersOf(id).find(has);
  if (partner) return { link: `「${policyOf(partner).name}」と重なる →『${pairOf(pairKey(id, partner))!.name}』`, hot: true };
  const sup = SUPPORT[id];
  const helped = sup?.with.find(has);
  if (sup && helped) return { link: `「${policyOf(helped).name}」の${sup.text}`, hot: false };
  const helper = owned.find((o) => SUPPORT[o.id]?.with.includes(id));
  if (helper) return { link: `「${policyOf(helper.id).name}」が支えてくれる`, hot: false };
  return { link: null, hot: false };
}

/**
 * 方針の候補。種・日・時間帯・引き直した回数から決まる（中断して開き直しても同じ候補が出る）。
 * 今の構成につながる候補と、別の方向の候補を混ぜる。選べない候補だけにはしない。
 */
export function offersFor(run: RunState, meta: RunMeta, slot: number, rerolled: number): Offer[] {
  const rng = subRng(run.seed, 11, run.day, slot, rerolled);
  const step = slot === 0 && run.boost ? 2 : 1;
  const full = run.owned.length >= MAX_SLOTS;
  const avail = availablePolicies(meta);
  const ups: Offer[] = run.owned.filter((o) => o.lv < MAX_LEVEL).map((o) => ({ kind: 'up', id: o.id, lv: Math.min(MAX_LEVEL, o.lv + step), link: '今の方針を伸ばす', hot: false }));
  const news: Offer[] = avail.filter((id) => !run.owned.some((o) => o.id === id)).map((id) => ({ kind: full ? 'swap' : 'add', id, lv: Math.min(MAX_LEVEL, step), ...linkFor(id, run.owned) }));
  const take = (list: Offer[], pred: (o: Offer) => boolean = () => true) => {
    const pool = list.filter(pred);
    if (!pool.length) return null;
    const pick = pool[Math.floor(rng.next() * pool.length)];
    list.splice(list.indexOf(pick), 1);
    return pick;
  };
  const want = slot === 0 && run.day === 0 && perkCount(meta) >= 3 ? 4 : 3;
  const out: Offer[] = [];
  const push = (o: Offer | null) => { if (o && out.length < want) out.push(o); };
  if (!run.owned.length) {
    // 最初の1つ：系統が重ならないように並べる
    while (out.length < want && news.length) push(take(news, (o) => !out.some((x) => policyOf(x.id).family === policyOf(o.id).family)) ?? take(news));
    return out;
  }
  // 1つ目はつながる候補（強化か、かけ合わせ・支えになる新しい方針）
  const linked = (o: Offer) => !!o.link;
  if (full) { push(take(ups)); push(take(ups)); push(take(news, linked) ?? take(news)); }
  else {
    push(rng.next() < 0.5 ? take(ups) ?? take(news, linked) : take(news, linked) ?? take(ups));
    push(take(news, (o) => !o.link) ?? take(news));
    push(rng.next() < 0.45 ? take(ups) ?? take(news) : take(news) ?? take(ups));
  }
  while (out.length < want) {
    const more = take(news) ?? take(ups);
    if (!more) break;
    out.push(more);
  }
  return out;
}

/** 候補を選ぶ。入れ替えは外す方針（drop）が要る。足す素材の数（朝の仕込み）を返す。できなければ null */
export function applyOffer(run: RunState, offer: Offer, drop: PolicyId | null = null): { stock: number } | null {
  const cur = run.owned.find((o) => o.id === offer.id);
  if (offer.kind === 'up') {
    if (!cur || cur.lv >= MAX_LEVEL) return null;
    const from = cur.lv;
    cur.lv = Math.min(MAX_LEVEL, offer.lv);
    return { stock: stockGainOnPick(offer.id, from, cur.lv) };
  }
  if (cur) return null;
  if (offer.kind === 'swap') {
    const i = run.owned.findIndex((o) => o.id === drop);
    if (i < 0) return null;
    run.owned.splice(i, 1, { id: offer.id, lv: offer.lv });
  } else {
    if (run.owned.length >= MAX_SLOTS) return null;
    run.owned.push({ id: offer.id, lv: offer.lv });
  }
  return { stock: stockGainOnPick(offer.id, 0, offer.lv) };
}

// ---------- 閉店：目標の判定と記録 ----------

export interface DayFacts { sales: number; served: number; maxCombo: number; angry: number; build: BuildStats }

export interface DayOutcome {
  passed: boolean;
  /** 4日目を越えた */
  cleared: boolean;
  result: DayResult;
  /** 今回はじめて見つけたかけ合わせ */
  newPairs: string[];
  /** 今回はじめて見つけた型 */
  newSets: string[];
  /** 今回解放された方針 */
  newPolicies: PolicyId[];
  /** ランが終わったときのまとめ（続くなら null） */
  summary: RunSummary | null;
}

/** このランのいちばん稼いだ方針（主力） */
export function signature(run: RunState): PolicyId | null {
  let best: PolicyId | null = null;
  for (const o of run.owned) if ((run.yen[o.id] ?? 0) > (best ? run.yen[best] ?? 0 : 0)) best = o.id;
  return best;
}

export const runTotal = (run: RunState) => run.days.reduce((a, d) => a + d.sales, 0);

/** 1日の閉店を反映する（run と meta を書き換える）。目標に届かなければランは終わる */
export function closeDay(run: RunState, meta: RunMeta, f: DayFacts, now = new Date()): DayOutcome {
  const goal = goalFor(run.day, run.loop, run.road);
  const result: DayResult = { sales: Math.floor(f.sales), goal, served: f.served, maxCombo: f.maxCombo, angry: f.angry, maxChain: f.build.maxChain, bestServe: f.build.bestServe, road: run.road };
  run.days.push(result);
  for (const [k, n] of Object.entries(f.build.yen)) if (isPolicy(k)) run.yen[k] = Math.round((run.yen[k] ?? 0) + (n ?? 0));
  const newPairs = f.build.pairs.filter((p) => pairOf(p) && !meta.discovered.includes(p));
  for (const p of f.build.pairs) if (pairOf(p) && !run.pairs.includes(p)) run.pairs.push(p);
  meta.discovered.push(...newPairs);
  const newSets = f.build.sets.filter((k) => setOf(k) && !meta.sets.includes(k));
  meta.sets.push(...newSets);
  const passed = result.sales >= goal;
  const cleared = passed && run.day >= RUN_DAYS - 1;
  const b = meta.best;
  b.day = Math.max(b.day, result.sales);
  b.combo = Math.max(b.combo, f.maxCombo);
  b.chain = Math.max(b.chain, f.build.maxChain);
  b.serve = Math.max(b.serve, f.build.bestServe);
  b.stack = Math.max(b.stack, f.build.maxStack);
  if (passed) {
    meta.daysCleared++;
    b.ratio = Math.max(b.ratio, Math.floor((result.sales / Math.max(1, goal)) * 100));
    if (run.day >= 2 && f.angry === 0) meta.flags.noAngry = true;
  }
  // 方針の解放
  const before = new Set(meta.policies);
  if (passed && run.day >= 1) meta.policies.push('oomori');
  if (b.combo >= 30) meta.policies.push('ooiri');
  if (meta.discovered.length >= 3) meta.policies.push('makanai');
  meta.policies = [...new Set(meta.policies)];
  const newPolicies = meta.policies.filter((p) => !before.has(p));
  let summary: RunSummary | null = null;
  if (!passed || cleared) {
    const total = runTotal(run);
    summary = { cleared, loop: run.loop, day: run.day, total, sig: signature(run), owned: run.owned.map((o) => ({ ...o })), days: run.days.map((d) => ({ ...d })), pairs: [...run.pairs], at: now.toISOString() };
    meta.runs++;
    b.total = Math.max(b.total, total);
    if (cleared) {
      meta.clears++;
      meta.loop = Math.max(meta.loop, run.loop + 1);
      if (summary.sig && !meta.sigs.includes(summary.sig)) meta.sigs.push(summary.sig);
      if (run.owned.filter((o) => o.lv >= MAX_LEVEL).length >= 3) meta.flags.max3 = true;
    }
    meta.last = summary;
    meta.active = null;
  } else {
    run.stage = 'closed';
    meta.active = run;
  }
  return { passed, cleared, result, newPairs, newSets, newPolicies, summary };
}

/** 明日の営業を選んで、次の日の朝へ */
export function takeRoad(run: RunState, meta: RunMeta, road: RoadId) {
  const gift = roadOf(road).gift;
  run.day++;
  run.road = road;
  run.stage = 'morning';
  run.boost = gift === 'boost';
  run.rerolls = 1 + (perkCount(meta) >= 2 ? 1 : 0) + (gift === 'reroll' ? 2 : 0);
  meta.active = run;
}

/** 貯金箱へ入れるお金：繁盛記の売上はそのまま入れず、越えた日数で決める（ふくびきの値段を崩さない） */
export function coinsFor(s: RunSummary) {
  const days = s.days.filter((d) => d.sales >= d.goal).length;
  return days * 3000 + (s.cleared ? 8000 : 0);
}

// ---------- 専用の実績（報酬は collectionItems.ts の限定の飾り） ----------

export interface RunAchievement {
  /** 永続ID（段階5の実績と同じ場所に解放を残す。使い回さない） */
  id: string;
  title: string;
  condition: string;
  progress: (m: RunMeta) => { now: number; goal: number };
}
const flag = (v: boolean) => ({ now: v ? 1 : 0, goal: 1 });

export const RUN_ACHIEVEMENTS: RunAchievement[] = [
  { id: 'run-first-day', title: 'のれんを上げる', condition: '1日目の目標を突破する', progress: (m) => ({ now: Math.min(1, m.daysCleared), goal: 1 }) },
  { id: 'run-clear', title: '四日目の灯り', condition: '4日間を走りきる', progress: (m) => ({ now: Math.min(1, m.clears), goal: 1 }) },
  { id: 'run-loop3', title: 'のれん三枚', condition: '繁盛記を3回クリアする', progress: (m) => ({ now: m.clears, goal: 3 }) },
  { id: 'run-loop5', title: '千両箱', condition: '繁盛記を5回クリアする', progress: (m) => ({ now: m.clears, goal: 5 }) },
  { id: 'run-chain', title: '四皿いっぺん', condition: '1回の入力で4皿を同時に出す', progress: (m) => ({ now: m.best.chain, goal: 4 }) },
  { id: 'run-combo50', title: '止まらない手', condition: '繁盛記で50コンボを出す', progress: (m) => ({ now: m.best.combo, goal: 50 }) },
  { id: 'run-bigserve', title: '一皿五千円', condition: '1皿で5,000円以上を売り上げる', progress: (m) => ({ now: m.best.serve, goal: 5000 }) },
  { id: 'run-double', title: '倍返し', condition: '目標の2倍の売上で1日を終える', progress: (m) => ({ now: m.best.ratio, goal: 200 }) },
  { id: 'run-discover5', title: '仕掛け人', condition: 'かけ合わせを8種類見つける', progress: (m) => ({ now: m.discovered.length, goal: 8 }) },
  { id: 'run-discover-all', title: '秘伝の書', condition: `かけ合わせを${PAIRS.length}種類すべて見つける`, progress: (m) => ({ now: m.discovered.length, goal: PAIRS.length }) },
  { id: 'run-two-builds', title: '変幻自在', condition: '主力の方針がちがう2つの構成でクリアする', progress: (m) => ({ now: m.sigs.length, goal: 2 }) },
  { id: 'run-no-angry', title: 'もてなし上手', condition: '3日目か4日目を、誰も怒らせずに突破する', progress: (m) => flag(m.flags.noAngry) },
  { id: 'run-max3', title: '三本柱', condition: '方針3つを最大まで育ててクリアする', progress: (m) => flag(m.flags.max3) },
  { id: 'run-100k', title: '大繁盛', condition: '1回の挑戦で合計10万円を売り上げる', progress: (m) => ({ now: m.best.total, goal: 100000 }) },
];

/** 条件を満たした実績のID */
export function earnedAchievements(m: RunMeta): string[] {
  return RUN_ACHIEVEMENTS.filter((a) => { const p = a.progress(m); return p.now >= p.goal; }).map((a) => a.id);
}
