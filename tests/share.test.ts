import { describe, expect, it } from 'vitest';
import { CONDITIONS, dailyConditions } from '../src/core/daily';
import { HASHTAG, postLength, shareText, shareUrl, type ShareResult } from '../src/ui/share';

const daily: ShareResult = { score: 12345, difficulty: 'ふつう', difficultyId: 'normal', rank: 'A', title: '街道で評判の酒場',
  daily: { date: '2026-11-08', conds: [CONDITIONS.banquet, CONDITIONS.noMiss] } };

describe('X へのポスト', () => {
  it('ひがわり：日付・難易度・お題・売上・順位・家族のひとこと・ハッシュタグ', () => {
    const text = shareText(daily, { rank: 3, total: 41 });
    expect(text).toBe([
      '🏮タイピング酒場 ひがわり営業🏮', '11月8日（日）・ふつう', 'お題：予約の宴会＋ノーミス営業',
      '💰売上 12,345円（ランクA）', '🥇 今日3位！（41人中）', '女将「今夜はいい売れ行きね」🍶', `${HASHTAG} #ひがわり営業`,
    ].join('\n'));
  });
  it('1位は王冠、4位以下はトロフィー、送る前は順位の行を出さない', () => {
    expect(shareText(daily, { rank: 1, total: 9 })).toContain('👑 今日の1位！（9人中）');
    expect(shareText(daily, { rank: 7, total: 9 })).toContain('🏆 今日7位（9人中）');
    expect(shareText(daily, null)).not.toContain('今日');
  });
  it('通常営業：難易度・売上・ランク・家族のひとこと', () => {
    expect(shareText({ ...daily, daily: null, rank: 'S', title: '荒野いちばんの名店' }, null)).toBe([
      '🏮タイピング酒場 通常営業・ふつう🏮', '💰売上 12,345円（ランクS「荒野いちばんの名店」）', '看板娘「満席ありがとう！」🍻✨', HASHTAG,
    ].join('\n'));
  });
  it('どのお題・順位でも、X の文字数の上限（280）に収まる', () => {
    let longest = 0;
    for (let i = 0; i < 400; i++) {
      const date = new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);
      for (const difficultyId of ['easy', 'normal', 'hard'] as const) {
        const r: ShareResult = { ...daily, difficultyId, difficulty: 'むずかしい', score: 123456, daily: { date, conds: dailyConditions(date) } };
        longest = Math.max(longest, postLength(shareText(r, { rank: 999, total: 9999 })));
      }
    }
    expect(longest).toBeLessThanOrEqual(280);
  });
  it('ポストの画面のURLに、本文とゲームのURLを入れる', () => {
    const url = new URL(shareUrl(daily, null, 'https://typing-sakaba.nr-lab.workers.dev/'));
    expect(url.origin + url.pathname).toBe('https://x.com/intent/post');
    expect(url.searchParams.get('text')).toBe(shareText(daily, null));
    expect(url.searchParams.get('url')).toBe('https://typing-sakaba.nr-lab.workers.dev/');
  });
});
