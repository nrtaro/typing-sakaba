// 保存された上位の記録を、手元でやり直して確かめる（Workers の無料プランでは送信のたびにできないため）。
// データベースの1行を受け取り、遊んだ記録どおりにやり直して、保存された成績と一致するかを返す。
import { dailyConditions } from '../src/core/daily';
import type { ScoreSubmission } from '../src/core/ranking';
import { INGREDIENT_ORDER, type DifficultyId, type IngredientId } from '../src/core/shopConfig';
import { verifyPlay } from './verify';

/** scores テーブルの1行（確かめるのに使う列だけ） */
export interface ScoreRow {
  id: number;
  date: string;
  difficulty: DifficultyId;
  name: string;
  score: number;
  served: number;
  max_combo: number;
  angry: number;
  accuracy: number;
  kps: number;
  seed: number | null;
  record: string | null;
  prep: string | null;
}

export type AuditResult = { id: number; name: string; score: number; status: 'ok' | 'mismatch' | 'noRecord'; reason?: string };

function readPrep(text: string | null): Record<IngredientId, number> | null | undefined {
  if (text === null) return null;
  try {
    const v = JSON.parse(text) as Record<string, unknown>;
    if (!v || typeof v !== 'object') return undefined;
    return Object.fromEntries(INGREDIENT_ORDER.map((id) => [id, Number(v[id])])) as Record<IngredientId, number>;
  } catch {
    return undefined;
  }
}

export function auditRow(row: ScoreRow): AuditResult {
  const base = { id: row.id, name: row.name, score: row.score };
  if (row.seed === null || row.record === null) return { ...base, status: 'noRecord' };
  const prep = readPrep(row.prep);
  if (prep === undefined) return { ...base, status: 'mismatch', reason: '仕込みの振り分けを読み取れない' };
  const s: ScoreSubmission = {
    date: row.date, difficulty: row.difficulty, name: row.name, player: '', score: row.score, served: row.served,
    maxCombo: row.max_combo, angry: row.angry, accuracy: row.accuracy, kps: row.kps,
    conds: dailyConditions(row.date).map((c) => c.id), seed: row.seed, record: row.record, prep,
  };
  const v = verifyPlay(s);
  return v.ok ? { ...base, status: 'ok' } : { ...base, status: 'mismatch', reason: v.error };
}
