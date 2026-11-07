import type { ConditionId } from './daily';
import type { DifficultyId, IngredientId } from './shopConfig';
import { LINKS, itemById } from './collection';

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
  /** 営業をやり直すのに要るもの：乱数の種・入力の記録（1/60秒刻み）・仕込みの振り分け */
  seed: number;
  record: string;
  prep: Record<IngredientId, number> | null;
  /** 段階6：付けている二つ名とプレート（古い版の送信にはない） */
  decoration?: Decoration;
}

/** 入力の記録の長さの上限（とても速い人が3分打ち続けても届かない長さ） */
export const RECORD_MAX = 30000;
export const RECORD_FORMAT = /^(?:\d{1,6}[a-z\-BSE])*$/;

export interface RankedScore { rank: number; name: string; score: number; decoration?: Decoration }

/** ランキングに出す飾り（永続IDだけ。言葉はゲーム側の一覧で引く） */
export interface Decoration { titleFront: string | null; titleLink: string | null; titleBack: string | null; plate: string | null }
const NO_DECORATION: Decoration = { titleFront: null, titleLink: null, titleBack: null, plate: null };
const kindId = (v: unknown, kind: string) => (typeof v === 'string' && itemById(v)?.kind === kind ? v : null);

/** 一覧にある飾りだけを残す。二つ名は3つとも正しいときだけ残す */
export function readDecoration(v: unknown): Decoration {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return { ...NO_DECORATION };
  const o = v as Record<string, unknown>;
  const front = kindId(o.titleFront, 'front');
  const back = kindId(o.titleBack, 'back');
  const link = typeof o.titleLink === 'string' && LINKS.some((l) => l.id === o.titleLink) ? o.titleLink : null;
  const title = front && back && link;
  return { titleFront: title ? front : null, titleLink: title ? link : null, titleBack: title ? back : null, plate: kindId(o.plate, 'plate') };
}

/** すべて空なら undefined（飾りなし） */
export function decorationOrNone(d: Decoration): Decoration | undefined {
  return d.titleFront || d.plate ? d : undefined;
}
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
