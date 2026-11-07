// 結果を X（旧Twitter）にポストする文。ポストの画面を開くだけで、勝手には投稿しない。
// X は日本語1文字を2文字分と数え、上限は280（URL は23）。本文は長くても約110文字に収める。
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

/** ランクごとの家族のひとこと（店の雰囲気が伝わるように） */
const CHEER: Record<string, string> = {
  S: '看板娘「満席ありがとう！」🍻✨',
  A: '女将「今夜はいい売れ行きね」🍶',
  B: 'おやじ「まずまずだな、明日も頼むぞ」🍖',
  C: '家族で囲む、あたたかい夜でした🏮',
};

/** 順位に合わせた見出し */
function placeLine(receipt: RankReceipt | null) {
  if (!receipt) return '';
  if (receipt.rank === 1) return `👑 今日の1位！（${receipt.total}人中）`;
  if (receipt.rank <= 3) return `🥇 今日${receipt.rank}位！（${receipt.total}人中）`;
  return `🏆 今日${receipt.rank}位（${receipt.total}人中）`;
}

/** ポストの本文（URL は別に付ける） */
export function shareText(r: ShareResult, receipt: RankReceipt | null): string {
  const yen = `${r.score.toLocaleString('ja-JP')}円`;
  const cheer = CHEER[r.rank] ?? CHEER.C;
  if (r.daily) {
    const conds = r.daily.conds.map((c) => c.title(r.difficultyId)).join('＋');
    return [
      `🏮タイピング酒場 ひがわり営業🏮`,
      `${dateLabel(r.daily.date)}・${r.difficulty}`,
      `お題：${conds}`,
      `💰売上 ${yen}（ランク${r.rank}）`,
      placeLine(receipt),
      cheer,
      `${HASHTAG} #ひがわり営業`,
    ].filter(Boolean).join('\n');
  }
  return [
    `🏮タイピング酒場 通常営業・${r.difficulty}🏮`,
    `💰売上 ${yen}（ランク${r.rank}「${r.title}」）`,
    cheer,
    HASHTAG,
  ].join('\n');
}

/** X での長さ（日本語や絵文字は2文字分、URL は23文字分） */
export function postLength(text: string, url = true) {
  let n = 0;
  for (const ch of text) n += /[\u0000-ჿ -‍‐-‟′-‷]/.test(ch) ? 1 : 2;
  return n + (url ? 1 + 23 : 0);
}

/** ポストの画面の URL */
export function shareUrl(r: ShareResult, receipt: RankReceipt | null, page: string): string {
  const params = new URLSearchParams({ text: shareText(r, receipt), url: page });
  return `https://x.com/intent/post?${params}`;
}
