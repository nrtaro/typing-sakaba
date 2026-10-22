import type { ActivityKind, IngredientId, Quality } from './config';

export interface CatchItem {
  ingredient: IngredientId;
  quality: Quality;
  count: number;
  /** 表示用: 何を獲ったか（例: 大ナマズ） */
  label: string;
  misses: number;
}

export interface ActivityResult {
  kind: ActivityKind;
  catches: CatchItem[];
  correctKeys: number;
  missKeys: number;
  /** 実際に入力できた時間（待ち時間を除く）秒 */
  activeSeconds: number;
  wordsCompleted: number;
  /** 釣り: 逃した魚、狩り: 逃げられた獲物 */
  escapes: number;
}

export type ActivityEvent =
  | { type: 'key'; ok: boolean }
  | { type: 'word' }
  | { type: 'bite'; big: boolean }
  | { type: 'catch'; item: CatchItem }
  | { type: 'escape'; label: string }
  | { type: 'hit'; targetId: number }
  | { type: 'lock'; targetId: number }
  | { type: 'spawn'; targetId: number };

export interface ActivityModel {
  readonly kind: ActivityKind;
  readonly duration: number;
  timeLeft: number;
  readonly finished: boolean;
  update(dt: number): void;
  key(ch: string): void;
  /** 補助キー（Backspace など） */
  control?(name: 'release'): void;
  drainEvents(): ActivityEvent[];
  result(): ActivityResult;
}

export function speedKps(r: { correctKeys: number; activeSeconds: number }): number {
  return r.activeSeconds > 0 ? r.correctKeys / r.activeSeconds : 0;
}

export function accuracy(r: { correctKeys: number; missKeys: number }): number {
  const total = r.correctKeys + r.missKeys;
  return total > 0 ? r.correctKeys / total : 1;
}
