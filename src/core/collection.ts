// 段階6：コレクション（二つ名・ネームプレート・打鍵音・シール）。
// 一覧のデータは collectionItems.ts。飾りは永続ID（id）で保存し、使い回さない。
import { ITEM_LIST, LINK_LIST, SERIES_LIST } from './collectionItems';

export type Kind = 'front' | 'back' | 'plate' | 'sound' | 'sticker';
export type Star = 1 | 2 | 3 | 4 | 5;
/** 入手先：実績（段階5の永続ID）か、ふくびき */
export type Source = { achievement: string } | 'gacha';
export interface Item {
  id: string;
  kind: Kind;
  star: Star;
  source: Source;
  name: string;
  plate?: { bg: string; border: string; text: string; pattern?: 'plain' | 'stripe' | 'dots' | 'wood' | 'gold' };
  sound?: { wave: OscillatorType; base: number; decay: number; partial?: number; noise?: number };
  /** シール：シリーズと台紙の枠（0〜8） */
  sticker?: { series: string; slot: number };
}
export interface Series { id: string; name: string }
/** 二つ名のつなぎ。text が '' のものは（なし） */
export interface Link { id: string; text: string }

export const ITEMS: Item[] = ITEM_LIST;
export const SERIES: Series[] = SERIES_LIST;
export const LINKS: Link[] = LINK_LIST;

const BY_ID = new Map(ITEMS.map((i) => [i.id, i]));
export function itemById(id: string): Item | undefined {
  return BY_ID.get(id);
}

export function achievementItem(achievementId: string): Item | undefined {
  return ITEMS.find((i) => typeof i.source === 'object' && i.source.achievement === achievementId);
}
