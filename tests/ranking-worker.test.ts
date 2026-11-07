import { afterEach, describe, expect, it } from 'vitest';
import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type { D1Database } from '@cloudflare/workers-types';
import { dailyConditions, jstDate } from '../src/core/daily';
import type { ScoreSubmission } from '../src/core/ranking';
import worker from '../worker/index';
import { readBoard, submitScore } from '../worker/repository';

// D1で使うSQLを実際のSQLiteで実行する（DB結果を決め打ちするモックではない）。
const opened: DatabaseSync[] = [];
function database() {
  const sqlite = new DatabaseSync(':memory:');
  opened.push(sqlite);
  sqlite.exec(readFileSync(new URL('../migrations/0001_daily_ranking.sql', import.meta.url), 'utf8'));
  class Statement {
    constructor(readonly sql: string, readonly args: (string | number | null)[] = []) {}
    bind(...args: (string | number | null)[]) { return new Statement(this.sql, args); }
    execute() {
      const statement = sqlite.prepare(this.sql);
      const results = statement.all(...this.args);
      return { results, success: true, meta: { changes: Number(sqlite.prepare('SELECT changes() AS n').get()!.n) } };
    }
  }
  const db = {
    prepare: (sql: string) => new Statement(sql),
    async batch(statements: Statement[]) {
      sqlite.exec('BEGIN');
      try { const result = statements.map(s => s.execute()); sqlite.exec('COMMIT'); return result; }
      catch (error) { sqlite.exec('ROLLBACK'); throw error; }
    },
  } as unknown as D1Database;
  return { db, sqlite };
}
afterEach(() => { for (const db of opened.splice(0)) db.close(); });
const player = (n: number) => `12345678-1234-4123-8123-${String(n).padStart(12, '0')}`;
function score(n = 1, points = 1000): ScoreSubmission {
  return { date: jstDate(), difficulty: 'normal', name: `店主${n}`, player: player(n), score: points,
    served: 30, maxCombo: 20, angry: 0, accuracy: 1, kps: 5, conds: dailyConditions(jstDate()).map(c => c.id) };
}

describe('D1ランキングの保存と順位', () => {
  it('自己ベストだけを保存し、低い記録や同点で名前も書き換えない', async () => {
    const { db } = database();
    await submitScore(db, score(), 'ip', 1000);
    await submitScore(db, { ...score(1, 500), name: '低い記録' }, 'ip', 1001);
    await submitScore(db, { ...score(), name: '同点' }, 'ip', 1002);
    expect(await readBoard(db, jstDate(), 'normal', player(1))).toEqual({ top: [{ rank: 1, name: '店主1', score: 1000 }], me: { rank: 1, score: 1000 }, total: 1 });
    await submitScore(db, { ...score(1, 2000), name: '更新' }, 'ip', 1003);
    expect((await readBoard(db, jstDate(), 'normal', player(1))).top[0]).toEqual({ rank: 1, name: '更新', score: 2000 });
  });
  it('同点は1位、1位、3位とし、上位5人と圏外の自分を返す', async () => {
    const { db } = database();
    for (const [i, points] of [9000, 9000, 8000, 7000, 6000, 5000].entries()) await submitScore(db, score(i + 1, points), 'ip', 1000 + i);
    const board = await readBoard(db, jstDate(), 'normal', player(6));
    expect(board.top.map(s => s.rank)).toEqual([1, 1, 3, 4, 5]);
    expect(board.top.map(s => s.name)).toEqual(['店主1', '店主2', '店主3', '店主4', '店主5']);
    expect(board.me).toEqual({ rank: 6, score: 5000 });
    expect(board.total).toBe(6);
    expect(JSON.stringify(board)).not.toContain(player(1));
  });
  it('日付と難易度を混ぜない', async () => {
    const { db } = database();
    await submitScore(db, score(), 'ip', 1000);
    await submitScore(db, { ...score(), date: '2026-01-01' }, 'ip', 1001);
    await submitScore(db, { ...score(), difficulty: 'hard' }, 'ip', 1002);
    expect((await readBoard(db, jstDate(), 'easy', player(1))).total).toBe(0);
    expect((await readBoard(db, jstDate(), 'normal', player(2))).me).toBeNull();
    expect((await readBoard(db, jstDate(), 'normal', player(1))).total).toBe(1);
  });
  it('同時送信でも同じIPの11回目を拒否する', async () => {
    const { db, sqlite } = database();
    const results = await Promise.allSettled(Array.from({ length: 11 }, (_, i) => submitScore(db, score(i + 1), 'ip', 1000)));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(10);
    expect(results.filter(r => r.status === 'rejected')).toHaveLength(1);
    expect(sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get()!.n).toBe(10);
  });
  it('IPを変えても端末IDで制限し、低い記録も送信回数に含める', async () => {
    const { db } = database();
    for (let i = 0; i < 10; i++) await submitScore(db, score(1, 1000 - i), `ip${i}`, 1000);
    await expect(submitScore(db, score(1, 2000), 'new-ip', 1599)).rejects.toThrow('送信');
    expect((await readBoard(db, jstDate(), 'normal', player(1))).me?.score).toBe(1000);
    await expect(submitScore(db, score(1, 2000), 'new-ip', 1600)).resolves.toEqual({ rank: 1, total: 1 });
  });
});

describe('WorkerのAPI', () => {
  const post = (body: unknown, headers: Record<string, string> = {}) => new Request('https://game.example/api/daily/score', {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': '192.0.2.1', ...headers }, body: JSON.stringify(body),
  });
  it('記録を受け付け、上位と自分の順位を返し、生のIPを保存しない', async () => {
    const { db, sqlite } = database();
    const env = { DB: db, RANKING_IP_SALT: 'test-only-secret' };
    const result = await worker.fetch(post(score()), env);
    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({ rank: 1, total: 1 });
    const board = await worker.fetch(new Request(`https://game.example/api/daily/top?date=${jstDate()}&difficulty=normal&player=${player(1)}`), env);
    expect(await board.json()).toEqual({ top: [{ name: '店主1', score: 1000, rank: 1 }], me: { rank: 1, score: 1000 }, total: 1 });
    const hash = sqlite.prepare('SELECT ip_hash FROM scores').get()!.ip_hash;
    expect(hash).toMatch(/^[a-f0-9]{64}$/);
    expect(hash).not.toContain('192.0.2.1');
    expect(result.headers.get('Cache-Control')).toContain('no-store');
  });
  it('無効な記録を保存しない', async () => {
    const { db } = database();
    const response = await worker.fetch(post({ ...score(), score: 999999 }), { DB: db, RANKING_IP_SALT: 'secret' });
    expect(response.status).toBe(400);
    expect((await readBoard(db, jstDate(), 'normal', null)).total).toBe(0);
  });
  it('回数を超えると429を返す', async () => {
    const { db } = database();
    const env = { DB: db, RANKING_IP_SALT: 'secret' };
    for (let i = 0; i < 10; i++) expect((await worker.fetch(post(score()), env)).status).toBe(200);
    expect((await worker.fetch(post(score()), env)).status).toBe(429);
  });
  it('他のサイトからの送信を拒否する', async () => {
    const { db } = database();
    expect((await worker.fetch(post(score(), { Origin: 'https://other.example' }), { DB: db, RANKING_IP_SALT: 'secret' })).status).toBe(403);
  });
  it('本文が大きすぎると拒否する', async () => {
    const { db } = database();
    expect((await worker.fetch(post({ extra: 'x'.repeat(9000) }), { DB: db, RANKING_IP_SALT: 'secret' })).status).toBe(413);
  });
  it('DBや秘密値の準備前は503でゲームに戻れる', async () => {
    expect((await worker.fetch(post(score()), {})).status).toBe(503);
    const { db } = database();
    expect((await worker.fetch(post(score()), { DB: db })).status).toBe(503);
  });
  it('壊れたJSONと不正な検索条件にJSONエラーを返す', async () => {
    const { db } = database();
    const env = { DB: db, RANKING_IP_SALT: 'secret' };
    const bad = new Request('https://game.example/api/daily/score', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{' });
    expect((await worker.fetch(bad, env)).status).toBe(400);
    expect((await worker.fetch(new Request('https://game.example/api/daily/top?date=2026-02-30&difficulty=normal'), env)).status).toBe(400);
  });
  it('API以外は静的アセットに渡す', async () => {
    const response = await worker.fetch(new Request('https://game.example/'), { ASSETS: { fetch: async () => new Response('static-game') } });
    expect(await response.text()).toBe('static-game');
  });
});
