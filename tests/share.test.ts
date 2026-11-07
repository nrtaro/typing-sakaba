import { describe, expect, it } from 'vitest';
import { CONDITIONS } from '../src/core/daily';
import { HASHTAG, shareText, shareUrl, type ShareResult } from '../src/ui/share';

const daily: ShareResult = { score: 12345, difficulty: 'ふつう', difficultyId: 'normal', rank: 'A', title: '評判の店',
  daily: { date: '2026-11-08', conds: [CONDITIONS.banquet, CONDITIONS.noMiss] } };

describe('X へのポスト', () => {
  it('ひがわり：日付・難易度・売上・順位・お題・ハッシュタグ', () => {
    const text = shareText(daily, { rank: 3, total: 41 });
    expect(text).toBe('タイピング酒場 ひがわり営業 11月8日（日）・ふつう\n売上 12,345円（今日3位／41人中）\nお題：予約の宴会＋ノーミス営業\n' + HASHTAG);
  });
  it('送る前は順位を書かない', () => {
    expect(shareText(daily, null)).toContain('売上 12,345円\n');
  });
  it('通常営業：難易度・売上・ランク', () => {
    expect(shareText({ ...daily, daily: null }, null)).toBe('タイピング酒場 通常営業・ふつう\n売上 12,345円　ランクA「評判の店」\n' + HASHTAG);
  });
  it('ポストの画面のURLに、本文とゲームのURLを入れる', () => {
    const url = new URL(shareUrl(daily, null, 'https://typing-sakaba.nr-lab.workers.dev/'));
    expect(url.origin + url.pathname).toBe('https://x.com/intent/post');
    expect(url.searchParams.get('text')).toBe(shareText(daily, null));
    expect(url.searchParams.get('url')).toBe('https://typing-sakaba.nr-lab.workers.dev/');
  });
});
