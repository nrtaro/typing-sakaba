// 段階5「やり込み」：遊んだ記録（端末内）と、実績・家族の会話。
// 正本は docs/stage5-achievements-and-family-dialogue.md。台詞は achievementText.ts（自動生成）。
// 実績は永続ID（id）で保存し、表示の番号（no）とは分ける。追加・並べ替え・改名で解放や既読を失わない。
import type { DifficultyId, TripId } from './shopConfig';
import { ACHIEVEMENT_TEXT, type AchievementText } from './achievementText';

/** 1回の営業で確定した事実（閉店結果の確定時に一度だけ作る） */
export interface PlayFacts {
  /** この営業の一意なID（二重反映を防ぐ） */
  id: string;
  mode: 'normal' | 'daily';
  difficulty: DifficultyId;
  /** 開店時に確定した JST の日付（ひがわりはお題の日付） */
  date: string;
  score: number;
  served: number;
  maxCombo: number;
  angry: number;
  /** 調達に出た回数（開店前の仕込みは含まない） */
  tripsStarted: number;
  /** 適用されたお題のID */
  conds: string[];
  bigFish: number;
  deer: number;
  /** 1回の交易中の競りの最長連勝 */
  streak: number;
  /** 残り20秒以内に出した皿 */
  late: number;
  /** 予約の宴会の注文を出した数 */
  banquet: number;
  /** 店に帰ってきた調達 */
  returns: { kind: TripId; gained: boolean; early: boolean }[];
}

/** 端末に残す記録（版付き）。全プレイの履歴は持たず、実績に要る累計・日付・組み合わせだけを残す */
export interface Records {
  v: 1;
  plays: number;
  served: number;
  bigFish: number;
  deer: number;
  /** 営業した日（JST、重複なし・昇順） */
  days: string[];
  /** 08：条件を満たしたお題の組み合わせ（IDを並べ替えて「+」でつなぐ） */
  combos: string[];
  /** 23〜26：採取で成果を持ち帰り、10皿以上出した営業の数 */
  cookingPlays: number;
  /** 1営業でのいちばん良い値（実績の進捗の表示と判定に使う） */
  best: { combo: number; hardScore: number; bigFish: number; streak: number; late: number; banquet: number };
  /** 解放した実績（永続ID → 解放した日時） */
  unlocked: Record<string, string>;
  /** 会話を開いた実績（永続ID） */
  read: string[];
  /** 反映済みの営業ID（直近の分） */
  seen: string[];
}

export const SEEN_KEEP = 200;

export function emptyRecords(): Records {
  return {
    v: 1, plays: 0, served: 0, bigFish: 0, deer: 0, days: [], combos: [], cookingPlays: 0,
    best: { combo: 0, hardScore: 0, bigFish: 0, streak: 0, late: 0, banquet: 0 },
    unlocked: {}, read: [], seen: [],
  };
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : 0);
const strs = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);

/** 保存された値を読み取る。壊れた値・古い形でも、読める分だけ使い、残りは初期値にする */
export function readRecords(raw: unknown): Records {
  const r = emptyRecords();
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return r;
  const o = raw as Record<string, unknown>;
  r.plays = num(o.plays);
  r.served = num(o.served);
  r.bigFish = num(o.bigFish);
  r.deer = num(o.deer);
  r.days = [...new Set(strs(o.days).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
  r.combos = [...new Set(strs(o.combos))];
  r.cookingPlays = num(o.cookingPlays);
  const b = (o.best && typeof o.best === 'object' ? o.best : {}) as Record<string, unknown>;
  for (const k of Object.keys(r.best) as (keyof Records['best'])[]) r.best[k] = num(b[k]);
  if (o.unlocked && typeof o.unlocked === 'object' && !Array.isArray(o.unlocked)) {
    for (const [k, v] of Object.entries(o.unlocked as Record<string, unknown>)) if (typeof v === 'string') r.unlocked[k] = v;
  }
  r.read = [...new Set(strs(o.read))];
  r.seen = strs(o.seen).slice(-SEEN_KEEP);
  return r;
}

const NORMAL_UP: DifficultyId[] = ['normal', 'hard'];
/** 「ふつう」以上か（難易度を足すときは、ここに含めるかを見直す） */
export const normalOrAbove = (d: DifficultyId) => NORMAL_UP.includes(d);
const TRIP_KINDS: TripId[] = ['fishing', 'hunting', 'trading', 'gathering'];

/** 現在の連続日数（最後の営業日が今日か昨日なら、その連続。2日以上前なら0） */
export function currentStreak(days: string[], today: string): number {
  if (!days.length) return 0;
  const last = days[days.length - 1];
  if (dayDiff(last, today) > 1) return 0;
  let n = 1;
  for (let i = days.length - 1; i > 0 && dayDiff(days[i - 1], days[i]) === 1; i--) n++;
  return n;
}

/** 最長の連続日数 */
export function longestStreak(days: string[]): number {
  let best = 0;
  let run = 0;
  days.forEach((d, i) => {
    run = i > 0 && dayDiff(days[i - 1], d) === 1 ? run + 1 : 1;
    best = Math.max(best, run);
  });
  return best;
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
}

export type Group = 'daily' | 'past' | 'cooking';

export interface Achievement extends AchievementText {
  /** 永続ID（保存に使う。使い回さない） */
  id: string;
  group: Group;
  /** 累計や1営業の最高値で判定するもの：今の値と目標 */
  progress?: (r: Records) => { now: number; goal: number };
  /** 1営業の条件で判定するもの */
  play?: (f: PlayFacts) => boolean;
}

type Rule = Pick<Achievement, 'id' | 'group' | 'progress' | 'play'>;
const total = (goal: number, pick: (r: Records) => number) => (r: Records) => ({ now: pick(r), goal });

/** 表示順（no）ごとの永続IDと判定 */
const RULES: Record<number, Rule> = {
  1: { id: 'three-chopsticks', group: 'daily', progress: total(3, (r) => r.plays) },
  2: { id: 'plate-spot', group: 'daily', progress: total(150, (r) => r.served) },
  3: { id: 'usual-seat', group: 'daily', progress: total(500, (r) => r.served) },
  4: { id: 'long-friends', group: 'daily', progress: total(1500, (r) => r.served) },
  5: { id: 'hands-plates', group: 'daily', progress: total(20, (r) => r.best.combo) },
  6: { id: 'no-wait-close', group: 'daily', play: (f) => normalOrAbove(f.difficulty) && f.served >= 35 && f.angry === 0 },
  7: { id: 'warm-kitchen', group: 'daily', progress: total(12000, (r) => r.best.hardScore) },
  8: { id: 'five-menus', group: 'daily', progress: total(5, (r) => r.combos.length) },
  9: { id: 'extra-bucket', group: 'daily', progress: total(2, (r) => r.best.bigFish) },
  10: { id: 'tenth-deer', group: 'daily', progress: total(10, (r) => r.deer) },
  11: { id: 'auction-three', group: 'daily', progress: total(3, (r) => r.best.streak) },
  12: { id: 'four-ways', group: 'daily', play: (f) => f.served >= 20 && TRIP_KINDS.every((k) => f.returns.some((t) => t.kind === k && t.gained)) },
  13: { id: 'shelf-cooking', group: 'daily', play: (f) => f.mode === 'normal' && normalOrAbove(f.difficulty) && f.tripsStarted === 0 && f.served >= 12 },
  14: { id: 'back-early', group: 'daily', play: (f) => f.served >= 20 && f.returns.filter((t) => t.early && t.gained).length >= 2 },
  15: { id: 'last-three', group: 'daily', progress: total(3, (r) => r.best.late) },
  16: { id: 'two-parties', group: 'daily', progress: total(2, (r) => r.best.banquet) },
  17: { id: 'past-tomorrow', group: 'past', progress: total(1, (r) => r.days.length) },
  18: { id: 'past-fish-tag', group: 'past', progress: total(2, (r) => r.days.length) },
  19: { id: 'past-storeroom', group: 'past', progress: total(3, (r) => r.days.length) },
  20: { id: 'past-answer', group: 'past', progress: total(4, (r) => r.days.length) },
  21: { id: 'past-together', group: 'past', progress: total(5, (r) => r.days.length) },
  22: { id: 'past-four-chairs', group: 'past', progress: total(6, (r) => r.days.length) },
  23: { id: 'dish-one-more', group: 'cooking', progress: total(3, (r) => r.cookingPlays) },
  24: { id: 'dish-aroma', group: 'cooking', progress: total(6, (r) => r.cookingPlays) },
  25: { id: 'dish-one-bite', group: 'cooking', progress: total(10, (r) => r.cookingPlays) },
  26: { id: 'dish-own-hand', group: 'cooking', progress: total(15, (r) => r.cookingPlays) },
};

export const ACHIEVEMENTS: Achievement[] = ACHIEVEMENT_TEXT.map((t) => ({ ...t, ...RULES[t.no] }));

export const GROUP_NAME: Record<Group, string> = { daily: '店の毎日', past: '過去編', cooking: '料理編' };

/** 1回の営業を記録に反映する。同じ営業IDは二度と反映しない。新しく解放した実績のIDを返す */
export function applyPlay(prev: Records, f: PlayFacts, now = new Date()): { records: Records; unlocked: string[] } {
  if (prev.seen.includes(f.id)) return { records: prev, unlocked: [] };
  const r: Records = { ...prev, best: { ...prev.best }, unlocked: { ...prev.unlocked } };
  r.plays++;
  r.served += f.served;
  r.bigFish += f.bigFish;
  r.deer += f.deer;
  if (!r.days.includes(f.date)) r.days = [...r.days, f.date].sort();
  const key = [...f.conds].sort().join('+');
  if (f.mode === 'daily' && f.difficulty === 'normal' && f.score >= 8000 && key && !r.combos.includes(key)) r.combos = [...r.combos, key];
  if (f.served >= 10 && f.returns.some((t) => t.kind === 'gathering' && t.gained)) r.cookingPlays++;
  if (normalOrAbove(f.difficulty)) r.best.combo = Math.max(r.best.combo, f.maxCombo);
  if (f.mode === 'normal' && f.difficulty === 'hard') r.best.hardScore = Math.max(r.best.hardScore, f.score);
  r.best.bigFish = Math.max(r.best.bigFish, f.bigFish);
  if (normalOrAbove(f.difficulty)) r.best.streak = Math.max(r.best.streak, f.streak);
  r.best.late = Math.max(r.best.late, f.late);
  if (f.mode === 'daily' && f.conds.includes('banquet')) r.best.banquet = Math.max(r.best.banquet, f.banquet);
  r.seen = [...r.seen, f.id].slice(-SEEN_KEEP);
  const unlocked: string[] = [];
  for (const a of ACHIEVEMENTS) {
    if (r.unlocked[a.id]) continue;
    const ok = a.progress ? (() => { const p = a.progress!(r); return p.now >= p.goal; })() : a.play!(f);
    if (ok) {
      r.unlocked[a.id] = now.toISOString();
      unlocked.push(a.id);
    }
  }
  return { records: r, unlocked };
}

export function markRead(prev: Records, id: string): Records {
  return prev.read.includes(id) ? prev : { ...prev, read: [...prev.read, id] };
}
