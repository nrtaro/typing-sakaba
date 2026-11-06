// ひがわり営業：日本時間の日付から、その日のお題（条件）を決める。
// お題は日付だけで決まり、どの難易度でも同じ。難易度によって条件の強さが変わる。
// お客の来かたは通常と同じく毎回ちがう（同じ日でも遊ぶたびに別の営業になる）。

import type { DifficultyId } from './shopConfig';

/** お題が営業に与える変更。Shop はこれを見てふるまいを変える */
export interface DayRules {
  /** 1日に調達へ出られる回数（null は無制限） */
  tripLimit: number | null;
  /** ミスしてもコンボが続く回数（難易度の値を上書き） */
  comboMissAllowance: number | null;
  /** 開店時の在庫の量（1 で通常） */
  startStockScale: number;
  /** 客が怒って帰ったときの減点の倍率 */
  angryPenaltyMult: number;
}

export const NORMAL_RULES: DayRules = { tripLimit: null, comboMissAllowance: null, startStockScale: 1, angryPenaltyMult: 1 };

export type ConditionId = 'tripLimit' | 'noMiss';

export interface Condition {
  id: ConditionId;
  /** 大＝営業の組み立てが変わる条件、小＝打ち方の気の付け方が変わる条件 */
  kind: 'major' | 'minor';
  name: string;
  /** 難易度に合わせた名前（「調達は3回まで」など） */
  title: (d: DifficultyId) => string;
  /** 絵に添える数字（調達の回数など。なければ 0） */
  count: (d: DifficultyId) => number;
  /** お題の画面に出す2行の説明（難易度で数字が変わる） */
  lines: (d: DifficultyId) => [string, string];
  apply: (r: DayRules, d: DifficultyId) => void;
}

const TRIP_LIMIT: Record<DifficultyId, number> = { easy: 3, normal: 2, hard: 2 };
const NO_MISS_ALLOWANCE: Record<DifficultyId, number> = { easy: 1, normal: 0, hard: 0 };

export const CONDITIONS: Record<ConditionId, Condition> = {
  tripLimit: {
    id: 'tripLimit',
    kind: 'major',
    name: '調達は2回まで',
    title: (d) => `調達は${TRIP_LIMIT[d]}回まで`,
    count: (d) => TRIP_LIMIT[d],
    lines: (d) => [
      '足りない素材を、まとめて取りに行こう',
      d === 'hard' ? '開店時の在庫も少なめ。行き先を見極めて' : 'どの素材を、いつ取りに行くかが勝負',
    ],
    apply: (r, d) => {
      r.tripLimit = TRIP_LIMIT[d];
      if (d === 'hard') r.startStockScale = 0.75;
    },
  },
  noMiss: {
    id: 'noMiss',
    kind: 'minor',
    name: 'ノーミス営業',
    title: () => 'ノーミス営業',
    count: () => 0,
    lines: (d) => [
      NO_MISS_ALLOWANCE[d] ? `ミスが${NO_MISS_ALLOWANCE[d] + 1}回でコンボが切れる` : 'ミスするとすぐコンボが切れる',
      d === 'hard' ? '怒って帰る客の減点も2倍' : '一打ずつ、ていねいに',
    ],
    apply: (r, d) => {
      r.comboMissAllowance = NO_MISS_ALLOWANCE[d];
      if (d === 'hard') r.angryPenaltyMult = 2;
    },
  },
};

/** 一緒に出すと厳しすぎる・かみ合わない組み合わせ（条件が増えたら足していく） */
export const DISALLOWED_PAIRS: [ConditionId, ConditionId][] = [];

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
  return h >>> 0;
}

/** その日のお題：大きい条件1つと小さい条件1つ */
export function dailyConditions(date: string): Condition[] {
  const all = Object.values(CONDITIONS);
  const majors = all.filter((c) => c.kind === 'major');
  const minors = all.filter((c) => c.kind === 'minor');
  const h = hash(`sakaba:${date}`);
  const major = majors[h % majors.length];
  const ok = minors.filter((m) => !DISALLOWED_PAIRS.some(([a, b]) => (a === major.id && b === m.id) || (b === major.id && a === m.id)));
  const pool = ok.length ? ok : minors;
  const minor = pool[Math.floor(h / majors.length) % pool.length];
  return [major, minor];
}

export function rulesFor(conds: Condition[], d: DifficultyId): DayRules {
  const r = { ...NORMAL_RULES };
  for (const c of conds) c.apply(r, d);
  return r;
}
