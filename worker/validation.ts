import { BANQUET_MULT, HIDEN_MULT, dailyConditions, jstDate, rulesFor } from '../src/core/daily';
import { normalizeRankingName, PLAYER_ID, readDecoration, type Decoration, RECORD_FORMAT, RECORD_MAX, type ScoreSubmission } from '../src/core/ranking';
import { DISHES, INGREDIENT_ORDER, SHOP, type DifficultyId, type IngredientId } from '../src/core/shopConfig';

const SCORE_LIMIT: Record<DifficultyId, number> = { easy: 60000, normal: 100000, hard: 120000 };
const DIFFICULTIES = ['easy', 'normal', 'hard'] as const;
export function isDifficulty(value: unknown): value is DifficultyId {
  return typeof value === 'string' && DIFFICULTIES.some(id => id === value);
}

export function isBoardDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function submissionDate(date: string, now: Date) {
  const today = jstDate(now);
  if (date === today) return true;
  const midnight = new Date(`${today}T00:00:00+09:00`).getTime();
  return now.getTime() - midnight < 5 * 60_000 && date === jstDate(new Date(now.getTime() - 86400_000));
}

/** 仕込みの振り分け：null か、6種類すべてが0〜99の整数。それ以外は undefined */
function readPrep(v: unknown): Record<IngredientId, number> | null | undefined {
  if (v === null || v === undefined) return null;
  if (typeof v !== 'object' || Array.isArray(v)) return undefined;
  const o = v as Record<string, unknown>;
  if (Object.keys(o).length !== INGREDIENT_ORDER.length) return undefined;
  const out = {} as Record<IngredientId, number>;
  for (const id of INGREDIENT_ORDER) {
    const n = o[id];
    if (typeof n !== 'number' || !Number.isInteger(n) || n < 0 || n > 99) return undefined;
    out[id] = n;
  }
  return out;
}

type Validation = { ok: true; value: ScoreSubmission } | { ok: false; error: string };
const invalid = (error: string): Validation => ({ ok: false, error });
function numberIn(v: unknown, max: number, integer = true): v is number {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max && (!integer || Number.isInteger(v));
}

/** 段階C：飾りだけの更新の入力。日付は記録の送信と同じく今日（0時すぎの少しは前日も） */
export function validateDecorationUpdate(input: unknown, now = new Date()):
  { ok: true; value: { date: string; player: string; decoration: Decoration; name: string | null } } | { ok: false; error: string } {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: '飾りを読み取れませんでした' };
  const v = input as Record<string, unknown>;
  if (!isBoardDate(v.date) || !submissionDate(v.date, now)) return { ok: false, error: 'この日のランキングは終了しました' };
  if (typeof v.player !== 'string' || !PLAYER_ID.test(v.player)) return { ok: false, error: '端末の情報を読み取れませんでした' };
  // 名前は送られたときだけ替える（送られなければ、載っている名前のまま）
  let name: string | null = null;
  if (v.name !== undefined && v.name !== null) {
    name = normalizeRankingName(v.name);
    if (!name) return { ok: false, error: '名前は1〜10文字で入力してください（使えない文字や言葉があります）' };
  }
  return { ok: true, value: { date: v.date, player: v.player.toLowerCase(), decoration: readDecoration(v.decoration), name } };
}

/** Worker の外でも同じ入力を確かめられる、保存や通信を行わない関数。 */
export function validateSubmission(input: unknown, now = new Date()): Validation {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return invalid('記録を読み取れませんでした');
  const v = input as Record<string, unknown>;
  if (!isBoardDate(v.date) || !submissionDate(v.date, now)) return invalid('この日の送信は終了しました。今日のお題で遊んでください');
  if (!isDifficulty(v.difficulty)) return invalid('難易度を確かめてください');
  const name = normalizeRankingName(v.name);
  if (!name) return invalid('名前は1〜10文字で入力してください（使えない文字や言葉があります）');
  if (typeof v.player !== 'string' || !PLAYER_ID.test(v.player)) return invalid('端末の情報を読み取れませんでした');
  const expected = dailyConditions(v.date).map(c => c.id).sort();
  const conds = v.conds;
  if (!Array.isArray(conds) || conds.length !== expected.length || !expected.every(id => conds.includes(id))) {
    return invalid('お題が一致しません。今日のお題を開き直してください');
  }
  if (!numberIn(v.score, SCORE_LIMIT[v.difficulty]) || !numberIn(v.served, 150) ||
      !numberIn(v.maxCombo, v.served) || !numberIn(v.angry, 300) ||
      !numberIn(v.accuracy, 1, false) || !numberIn(v.kps, 15, false) ||
      (v.served === 0 && v.score !== 0) ||
      (v.served > 0 && (v.maxCombo === 0 || v.kps === 0 || v.accuracy === 0))) {
    return invalid('記録の数値を確かめられませんでした');
  }
  // すべて最高額の料理・チップとしても届かない売上をはじく。
  // お題による倍増は、使える回数・宴会の回数まで（重なる場合も上限に含める）。
  const rules = rulesFor(dailyConditions(v.date), v.difficulty, v.date);
  const mult = Math.min(SHOP.comboMaxMult, 1 + Math.floor(v.maxCombo / SHOP.comboStep) * SHOP.comboBonus);
  const perDish = Math.ceil((Math.max(...DISHES.map(d => d.price)) + SHOP.tipMax) * mult);
  const hiden = Math.min(v.served, rules.hiden);
  const banquets = Math.min(v.served, rules.banquets.length);
  const maxSales = perDish * (v.served + hiden * (HIDEN_MULT - 1) + banquets * (BANQUET_MULT - 1)
    + Math.min(hiden, banquets) * (HIDEN_MULT - 1) * (BANQUET_MULT - 1));
  if (v.score > maxSales) return invalid('売上と料理の数を確かめられませんでした');
  // やり直しに要るもの（中身が合っているかは、やり直して確かめる）
  if (!numberIn(v.seed, 0xffffffff)) return invalid('遊んだ記録を読み取れませんでした');
  if (typeof v.record !== 'string' || v.record.length > RECORD_MAX || !RECORD_FORMAT.test(v.record)) return invalid('遊んだ記録を読み取れませんでした');
  const prep = readPrep(v.prep);
  if (prep === undefined) return invalid('仕込みの振り分けを読み取れませんでした');
  return { ok: true, value: {
    date: v.date, difficulty: v.difficulty, name, player: v.player.toLowerCase(),
    score: v.score, served: v.served, maxCombo: v.maxCombo, angry: v.angry,
    accuracy: v.accuracy, kps: v.kps, conds: expected, seed: v.seed, record: v.record, prep,
    decoration: readDecoration(v.decoration),
  } };
}
