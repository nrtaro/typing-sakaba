import type { ConditionId } from './daily';
import type { DifficultyId } from './shopConfig';

export interface ScoreSubmission {
  date: string;
  difficulty: DifficultyId;
  name: string;
  player: string;
  score: number;
  served: number;
  maxCombo: number;
  angry: number;
  accuracy: number;
  kps: number;
  conds: ConditionId[];
}

export interface RankedScore { rank: number; name: string; score: number }
export interface RankReceipt { rank: number; total: number }
export interface DailyBoard {
  top: RankedScore[];
  me: { rank: number; score: number } | null;
  total: number;
}

export const PLAYER_ID = /^[\da-f]{8}-[\da-f]{4}-[1-8][\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

/** 前後の空白と文字幅を整える。表示に紛れ込む制御文字も受け付けない。 */
export function normalizeRankingName(value: unknown): string | null {
  if (typeof value !== 'string' || /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/u.test(value)) return null;
  const name = value.normalize('NFKC').trim();
  if ([...name].length < 1 || [...name].length > 10) return null;
  const folded = name.toLowerCase().replace(/\s/g, '');
  if (['死ね', 'しね', '殺す', 'ころす', 'fuck', 'shit'].some(word => folded.includes(word))) return null;
  return name;
}
