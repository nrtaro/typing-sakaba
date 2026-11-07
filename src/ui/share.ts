// 結果を X（旧Twitter）にポストする文。ポストの画面を開くだけで、勝手には投稿しない。
import { dateLabel, type Condition } from '../core/daily';
import type { RankReceipt } from '../core/ranking';
import type { DifficultyId } from '../core/shopConfig';

export interface ShareResult {
  score: number;
  difficulty: string;
  difficultyId: DifficultyId;
  rank: string;
  title: string;
  daily: { date: string; conds: Condition[] } | null;
}

export const HASHTAG = '#タイピング酒場';

/** ポストの本文（URL は別に付ける） */
export function shareText(r: ShareResult, receipt: RankReceipt | null): string {
  const yen = `${r.score.toLocaleString('ja-JP')}円`;
  if (r.daily) {
    const conds = r.daily.conds.map((c) => c.title(r.difficultyId)).join('＋');
    return [
      `タイピング酒場 ひがわり営業 ${dateLabel(r.daily.date)}・${r.difficulty}`,
      `売上 ${yen}${receipt ? `（今日${receipt.rank}位／${receipt.total}人中）` : ''}`,
      `お題：${conds}`,
      HASHTAG,
    ].join('\n');
  }
  return [`タイピング酒場 通常営業・${r.difficulty}`, `売上 ${yen}　ランク${r.rank}「${r.title}」`, HASHTAG].join('\n');
}

/** ポストの画面の URL */
export function shareUrl(r: ShareResult, receipt: RankReceipt | null, page: string): string {
  const params = new URLSearchParams({ text: shareText(r, receipt), url: page });
  return `https://x.com/intent/post?${params}`;
}
