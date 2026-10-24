import { defaultRomaji } from './romaji';
import type { TripId } from './shopConfig';

/** 推奨綴りを基準にする。別綴り・ミス・打ち直しでは報酬を増やさない。 */
export function rewardKeys(kana: string): number {
  return defaultRomaji(kana).length;
}

/** 端数は獲得単位に丸める。大物は複数語の合計に対して一度だけ計算する。 */
export function procurementReward(kind: TripId, keys: number, big = false): number {
  if (keys <= 0) return 0;
  const rate = kind === 'fishing' ? (big ? .5 : .45)
    : kind === 'hunting' ? (big ? .55 : .45)
    : kind === 'gathering' ? .5 : .36;
  return Math.max(1, Math.round(keys * rate));
}
