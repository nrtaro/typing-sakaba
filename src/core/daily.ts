// ひがわり営業：日本時間の日付から、その日のお題（条件）を決める。
// お題は日付だけで決まり、どの難易度でも同じ。難易度によって条件の強さが変わる。
// お客の来かたは通常と同じく毎回ちがう（同じ日でも遊ぶたびに別の営業になる）。

import { INGREDIENT_ORDER, SHOP, TRIPS, type DifficultyId, type IngredientId, type TripId } from './shopConfig';

/** お題が営業に与える変更。Shop はこれを見てふるまいを変える */
export interface DayRules {
  /** ミスしてもコンボが続く回数（難易度の値を上書き） */
  comboMissAllowance: number | null;
  /** 客が怒って帰ったときの減点の倍率 */
  angryPenaltyMult: number;
  /** 狭い倉庫：1種類の素材を置ける数（null は無制限） */
  storageCap: number | null;
  /** 調達中もお客は待たない：調達中に待ち時間が減る速さ（0 は止まる＝通常） */
  awayWaitRate: number;
  /** 時間帯で当たりが変わる調達先：朝・昼・夜の当たり（null はなし） */
  luckyTrips: TripId[] | null;
  /** 当たりの調達で持ち帰る量の倍率 */
  luckyMult: number;
  /** 当たり以外の調達で持ち帰る量の倍率 */
  unluckyMult: number;
  /** ミスで素材をこぼす：何回のミスごとに1つこぼすか（null はこぼさない） */
  spillEvery: number | null;
  /** おかわり注文：もう1品たのむお客が来る割合 */
  refillChance: number;
  /** 品切れ札：「しなぎれ」で作れない注文を断れる回数（0 は使えない） */
  shinagire: number;
  /** ひでんの：「ひでんの」で次の1皿を売上2倍にできる回数（0 は使えない） */
  hiden: number;
  /** 届くまで時間がかかる：調達から帰って素材が届くまでの秒数（0 はすぐ） */
  deliveryDelay: number;
  /** 素材が傷む：手に入れてから傷むまでの秒数（null は傷まない） */
  spoilAfter: number | null;
  /** 予約の宴会：来店する時刻（営業開始からの秒）と料理 */
  banquets: { at: number; dish: string }[];
  /** 開店前の仕込み：開店前に自分で振り分ける素材の数（0 は仕込みなし） */
  prepBudget: number;
}

export const NORMAL_RULES: DayRules = {
  comboMissAllowance: null, angryPenaltyMult: 1, storageCap: null, awayWaitRate: 0,
  luckyTrips: null, luckyMult: 1, unluckyMult: 1, spillEvery: null, refillChance: 0,
  shinagire: 0, hiden: 0, deliveryDelay: 0, spoilAfter: null, banquets: [], prepBudget: 0,
};

/** ひでんの・予約の宴会の売上の倍率 */
export const HIDEN_MULT = 2;
export const BANQUET_MULT = 2;
/** 宴会のお客は、ふつうの何倍まで待ってくれるか／怒って帰ったときの減点は何倍か */
export const BANQUET_WAIT_MULT = 2;
export const BANQUET_PENALTY_MULT = 3;

export type ConditionId = 'noMiss' | 'smallStore' | 'busyAway' | 'luckyTrip' | 'spill' | 'refill' | 'shinagire' | 'hiden' | 'delivery' | 'spoil' | 'banquet' | 'prep';

export interface Condition {
  id: ConditionId;
  /** 大＝営業の組み立てが変わる条件、小＝打ち方や注文への気の配り方が変わる条件 */
  kind: 'major' | 'minor';
  name: string;
  /** 難易度に合わせた名前 */
  title: (d: DifficultyId) => string;
  /** お題の画面に出す2行の説明（難易度で数字が変わる） */
  lines: (d: DifficultyId) => [string, string];
  apply: (r: DayRules, d: DifficultyId, date: string) => void;
}

const NO_MISS_ALLOWANCE: Record<DifficultyId, number> = { easy: 1, normal: 0, hard: 0 };
const STORAGE_CAP: Record<DifficultyId, number> = { easy: 10, normal: 8, hard: 6 };
const AWAY_WAIT_RATE: Record<DifficultyId, number> = { easy: 0.5, normal: 0.75, hard: 1 };
const UNLUCKY_MULT: Record<DifficultyId, number> = { easy: 1, normal: 0.85, hard: 0.7 };
const SPILL_EVERY: Record<DifficultyId, number> = { easy: 3, normal: 2, hard: 1 };
const REFILL_CHANCE: Record<DifficultyId, number> = { easy: 0.15, normal: 0.2, hard: 0.25 };
export const LUCKY_MULT = 1.5;
const SHINAGIRE: Record<DifficultyId, number> = { easy: 5, normal: 3, hard: 2 };
const HIDEN: Record<DifficultyId, number> = { easy: 4, normal: 3, hard: 2 };
const DELIVERY_DELAY: Record<DifficultyId, number> = { easy: 10, normal: 20, hard: 30 };
const PREP_BUDGET: Record<DifficultyId, number> = { easy: 36, normal: 30, hard: 26 };
const SPOIL_AFTER: Record<DifficultyId, number> = { easy: 90, normal: 75, hard: 60 };
/** 宴会の時刻（営業開始からの秒）。朝0〜50・昼50〜110・夜110〜180 */
const BANQUET_TIMES: Record<DifficultyId, number[]> = { easy: [120], normal: [90, 150], hard: [60, 110, 160] };
/** 宴会の料理：素材をたくさん使う大皿と大鍋 */
const BANQUET_DISHES = ['feast', 'banquet', 'everything', 'hunterStew', 'spicyPot', 'paella'];

export const CONDITIONS: Record<ConditionId, Condition> = {
  smallStore: {
    id: 'smallStore',
    kind: 'major',
    name: '狭い倉庫',
    title: () => '狭い倉庫',
    lines: (d) => [`素材は1種類につき${STORAGE_CAP[d]}個まで`, 'あふれた分は持ち帰れない'],
    apply: (r, d) => { r.storageCap = STORAGE_CAP[d]; },
  },
  busyAway: {
    id: 'busyAway',
    kind: 'major',
    name: '調達中もお客は待たない',
    title: () => '調達中もお客は待たない',
    lines: (d) => [
      '調達に出ている間も、待ち時間が減る',
      d === 'easy' ? '減る速さは、いつもの半分' : d === 'normal' ? '減る速さは、いつもの4分の3' : 'いつもと同じ速さで減る',
    ],
    apply: (r, d) => { r.awayWaitRate = AWAY_WAIT_RATE[d]; },
  },
  luckyTrip: {
    id: 'luckyTrip',
    kind: 'major',
    name: '時間帯で当たりが変わる調達先',
    title: () => '時間帯で当たりが変わる',
    lines: (d) => [
      `朝・昼・夜で、${LUCKY_MULT}倍取れる調達先が変わる`,
      d === 'easy' ? '出かけた時間帯の当たりで決まる' : `当たり以外は${Math.round((1 - UNLUCKY_MULT[d]) * 100)}%減る`,
    ],
    apply: (r, d, date) => {
      r.luckyTrips = luckySchedule(date);
      r.luckyMult = LUCKY_MULT;
      r.unluckyMult = UNLUCKY_MULT[d];
    },
  },
  noMiss: {
    id: 'noMiss',
    kind: 'minor',
    name: 'ノーミス営業',
    title: () => 'ノーミス営業',
    lines: (d) => [
      NO_MISS_ALLOWANCE[d] ? `ミスが${NO_MISS_ALLOWANCE[d] + 1}回でコンボが切れる` : 'ミスするとすぐコンボが切れる',
      d === 'hard' ? '怒って帰る客の減点も2倍' : '一打ずつ、ていねいに',
    ],
    apply: (r, d) => {
      r.comboMissAllowance = NO_MISS_ALLOWANCE[d];
      if (d === 'hard') r.angryPenaltyMult = 2;
    },
  },
  spill: {
    id: 'spill',
    kind: 'minor',
    name: 'ミスで素材をこぼす',
    title: () => 'ミスで素材をこぼす',
    lines: (d) => [
      SPILL_EVERY[d] === 1 ? 'ミスするたびに素材を1つこぼす' : `ミス${SPILL_EVERY[d]}回ごとに素材を1つこぼす`,
      '打っている料理の素材からこぼれる',
    ],
    apply: (r, d) => { r.spillEvery = SPILL_EVERY[d]; },
  },
  refill: {
    id: 'refill',
    kind: 'minor',
    name: 'おかわり注文',
    title: () => 'おかわり注文',
    lines: () => ['ときどき、もう1品たのむお客が来る', '2品目は待たせても怒らない'],
    apply: (r, d) => { r.refillChance = REFILL_CHANCE[d]; },
  },
  shinagire: {
    id: 'shinagire',
    kind: 'minor',
    name: '品切れ札',
    title: () => '品切れ札',
    lines: (d) => ['「しなぎれ」と打つと、作れない注文を断れる', `1日${SHINAGIRE[d]}回まで。断っても怒られない`],
    apply: (r, d) => { r.shinagire = SHINAGIRE[d]; },
  },
  hiden: {
    id: 'hiden',
    kind: 'minor',
    name: 'ひでんの',
    title: () => 'ひでんの',
    lines: (d) => [`「ひでんの」と打つと、次の1皿が売上${HIDEN_MULT}倍`, `1日${HIDEN[d]}回まで。ここぞで使おう`],
    apply: (r, d) => { r.hiden = HIDEN[d]; },
  },
  delivery: {
    id: 'delivery',
    kind: 'major',
    name: '届くまで時間がかかる',
    title: () => '届くまで時間がかかる',
    lines: (d) => [`調達した素材が届くまで${DELIVERY_DELAY[d]}秒かかる`, '足りなくなる前に、早めに取りに行こう'],
    apply: (r, d) => { r.deliveryDelay = DELIVERY_DELAY[d]; },
  },
  spoil: {
    id: 'spoil',
    kind: 'major',
    name: '素材が傷む',
    title: () => '素材が傷む',
    lines: (d) => [`手に入れた素材は${SPOIL_AFTER[d]}秒で傷む`, '古いものから使われる。ためこみすぎに注意'],
    apply: (r, d) => { r.spoilAfter = SPOIL_AFTER[d]; },
  },
  prep: {
    id: 'prep',
    // 宴会や時間帯の当たり（どちらも大）と同じ日に出せるよう、小にする
    kind: 'minor',
    name: '開店前の仕込み',
    title: () => '開店前の仕込み',
    lines: (d) => [`開店前に、素材${PREP_BUDGET[d]}個を自分で振り分ける`, 'その日のお題に合わせて仕込もう'],
    apply: (r, d) => { r.prepBudget = PREP_BUDGET[d]; },
  },
  banquet: {
    id: 'banquet',
    kind: 'major',
    name: '予約の宴会',
    title: () => '予約の宴会',
    lines: () => ['決まった時刻に、宴会の大口注文が入る', `時刻と料理は先に分かる。売上${BANQUET_MULT}倍`],
    apply: (r, d, date) => { r.banquets = banquetPlan(date, d); },
  },
};

/** 宴会の予定：時刻は難易度で決まり、料理は日付で決まる（同じ日に同じ料理は続けない） */
export function banquetPlan(date: string, d: DifficultyId): { at: number; dish: string }[] {
  let h = hash(`banquet:${date}`);
  const out: { at: number; dish: string }[] = [];
  for (const at of BANQUET_TIMES[d]) {
    const pool = BANQUET_DISHES.filter((id) => !out.some((b) => b.dish === id));
    out.push({ at, dish: pool[h % pool.length] });
    h = Math.floor(h / pool.length) + 13;
  }
  return out;
}

/**
 * 一緒に出さない組み合わせ。
 * ノーミス営業＋ミスで素材をこぼす：ミスへの罰が重なりすぎる（どちらも小なので今は同じ日に出ない）。
 * 大きいお題と小さいお題の組み合わせは、ボットで確かめてどれも遊べる範囲（tests/daily.sim.test.ts）。
 */
export const DISALLOWED_PAIRS: [ConditionId, ConditionId][] = [
  ['noMiss', 'spill'],
  // 素材が傷む＋届くまで時間がかかる：届いたころには傷みかけで、取りに行く意味が薄れる（どちらも大なので今は同じ日に出ない）
  ['spoil', 'delivery'],
];

/** 日本時間の日付（YYYY-MM-DD） */
export function jstDate(now: Date = new Date()): string {
  const j = new Date(now.getTime() + 9 * 3600 * 1000);
  return j.toISOString().slice(0, 10);
}

const WEEK = ['日', '月', '火', '水', '木', '金', '土'];

/** 「11月8日（日）」の形 */
export function dateLabel(date: string): string {
  const [y, m, d] = date.split('-').map(Number);
  const w = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${m}月${d}日（${WEEK[w]}）`;
}

/** 文字列から決まる数（同じ日付なら誰の環境でも同じになる） */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // 末尾の桁を混ぜて、似た日付でも散らばるようにする
  h ^= h >>> 13;
  h = Math.imul(h, 0x5bd1e995);
  h ^= h >>> 15;
  return h >>> 0;
}

/** 朝・昼・夜の当たりの調達先。続けて同じ所にはしない */
export function luckySchedule(date: string): TripId[] {
  const h = hash(`lucky:${date}`);
  const out: TripId[] = [];
  let seed = h;
  for (let i = 0; i < 3; i++) {
    const pool = TRIPS.map((t) => t.id).filter((id) => id !== out[i - 1]);
    out.push(pool[seed % pool.length]);
    seed = Math.floor(seed / pool.length) + 7 * i;
  }
  return out;
}

export function isBanned(a: ConditionId, b: ConditionId) {
  return DISALLOWED_PAIRS.some(([x, y]) => (x === a && y === b) || (x === b && y === a));
}

/** その日のお題：大きい条件と小さい条件を1つずつ（相性の悪い組み合わせは避ける） */
export function dailyConditions(date: string): Condition[] {
  const all = Object.values(CONDITIONS);
  const majors = all.filter((c) => c.kind === 'major');
  const minors = all.filter((c) => c.kind === 'minor');
  const h = hash(`sakaba:${date}`);
  const out: Condition[] = [];
  const major = majors.length ? majors[h % majors.length] : null;
  if (major) out.push(major);
  const ok = minors.filter((m) => !major || !isBanned(major.id, m.id));
  const pool = ok.length ? ok : minors;
  if (pool.length) out.push(pool[Math.floor(h / Math.max(1, majors.length)) % pool.length]);
  return out;
}

export function rulesFor(conds: Condition[], d: DifficultyId, date = ''): DayRules {
  const r = { ...NORMAL_RULES };
  for (const c of conds) c.apply(r, d, date);
  return r;
}

/** 仕込みで1種類の素材に入れられる数（狭い倉庫の日はその上限まで） */
export function prepCap(rules: DayRules) {
  return Math.min(rules.storageCap ?? PREP_MAX, PREP_MAX);
}
export const PREP_MAX = 12;

/** 仕込みの「おまかせ」：いつもの開店時の在庫の割合で振り分ける */
export function defaultPrep(rules: DayRules): Record<IngredientId, number> {
  const cap = prepCap(rules);
  const base = SHOP.startStock;
  const total = INGREDIENT_ORDER.reduce((a, id) => a + base[id], 0);
  const out = Object.fromEntries(INGREDIENT_ORDER.map((id) => [id, Math.min(cap, Math.floor((base[id] * rules.prepBudget) / total))])) as Record<IngredientId, number>;
  // 端数は、いつもの在庫が多い順に1つずつ足す
  let left = rules.prepBudget - INGREDIENT_ORDER.reduce((a, id) => a + out[id], 0);
  const order = [...INGREDIENT_ORDER].sort((a, b) => base[b] - base[a]);
  for (let k = 0; left > 0 && k < 100; k++) {
    const id = order[k % order.length];
    if (out[id] < cap) { out[id]++; left--; }
  }
  return out;
}
