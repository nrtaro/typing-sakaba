import { describe, expect, it, vi } from 'vitest';
import { RankingClient } from '../src/ui/rankingClient';
import type { ScoreSubmission } from '../src/core/ranking';

describe('ランキング通信', () => {
  it('日付・難易度・自分のIDを付け、上位と自分の順位を受け取る', async () => {
    const board = { top: [{ rank: 1, name: 'おやじ', score: 1234 }], me: null, total: 1 };
    const client = new RankingClient(async input => {
      expect(String(input)).toBe('/api/daily/top?date=2026-11-07&difficulty=normal&player=my-player');
      return new Response(JSON.stringify(board));
    });
    expect(await client.top('2026-11-07', 'normal', 'my-player')).toEqual(board);
  });
  it('記録をJSONで送り、順位を受け取る', async () => {
    const payload = { name: 'おかみ', score: 5000 } as ScoreSubmission;
    const client = new RankingClient(async (input, init) => {
      expect(String(input)).toBe('/api/daily/score');
      expect(init?.method).toBe('POST');
      expect(init?.headers).toEqual({ 'Content-Type': 'application/json' });
      expect(JSON.parse(String(init?.body))).toEqual(payload);
      return new Response('{"rank":3,"total":12}');
    });
    expect(await client.submit(payload)).toEqual({ rank: 3, total: 12 });
  });
  it('送信回数などのエラーを表示できる', async () => {
    const client = new RankingClient(async () => new Response('{"error":"10分ほど待ってください"}', { status: 429 }));
    await expect(client.submit({} as ScoreSubmission)).rejects.toThrow('10分ほど待ってください');
  });
  it('通信エラーやHTMLが返っても短い案内にできる', async () => {
    const offline = new RankingClient(async () => { throw new TypeError('Failed to fetch'); });
    await expect(offline.top('2026-11-07', 'easy', 'player')).rejects.toThrow('つながりません');
    const html = new RankingClient(async () => new Response('<html>game</html>'));
    await expect(html.top('2026-11-07', 'easy', 'player')).rejects.toThrow('つながりません');
  });
  it('返答がないときは待ち続けずに中断する', async () => {
    vi.useFakeTimers();
    try {
      const client = new RankingClient((_input, init) => new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
      }));
      const result = expect(client.top('2026-11-07', 'hard', 'player')).rejects.toThrow('つながりません');
      await vi.advanceTimersByTimeAsync(8000);
      await result;
    } finally { vi.useRealTimers(); }
  });
  it('壊れた順位データを画面へ渡さない', async () => {
    const client = new RankingClient(async () => new Response('{"top":null,"total":4,"me":null}'));
    await expect(client.top('2026-11-07', 'normal', 'player')).rejects.toThrow('つながりません');
  });
});

describe('ランキング通信の飾り（段階6）', () => {
  it('上位の飾りを受け取り、知らない飾りは捨てる', async () => {
    const board = { top: [
      { rank: 1, name: 'A', score: 9, decoration: { titleFront: 'f-nonbiri', titleLink: 'na', titleBack: 'b-minarai', plate: 'p-zzz' } },
      { rank: 2, name: 'B', score: 8 },
    ], me: null, total: 2 };
    const client = new RankingClient(async () => new Response(JSON.stringify(board)));
    const got = await client.top('2026-11-07', 'normal', 'p');
    expect(got.top[0].decoration).toEqual({ titleFront: 'f-nonbiri', titleLink: 'na', titleBack: 'b-minarai', plate: null });
    expect(got.top[1].decoration).toBeUndefined();
  });
});

describe('飾りだけを更新する（段階C）', () => {
  it('日付・端末ID・飾りを送り、更新した件数を受け取る', async () => {
    const client = new RankingClient(async (url, init) => {
      expect(String(url)).toBe('/api/daily/decoration');
      expect(init?.method).toBe('POST');
      expect(JSON.parse(String(init?.body))).toEqual({ date: '2026-11-09', player: 'p', decoration: { titleFront: null, titleLink: null, titleBack: null, plate: 'p-kinari' } });
      return new Response('{"updated":1}');
    });
    expect(await client.decorate('2026-11-09', 'p', { titleFront: null, titleLink: null, titleBack: null, plate: 'p-kinari' })).toEqual({ updated: 1 });
  });
});
