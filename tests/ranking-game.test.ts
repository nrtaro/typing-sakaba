// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CandidateInput } from '../src/core/candidates';
import { dailyConditions } from '../src/core/daily';
import { SaveStore } from '../src/core/save';
import { Game } from '../src/ui/game';
import { RankingClient } from '../src/ui/rankingClient';

// モジュール読み込み時に作る仮の絵だけを除く。入力・保存・通信処理は実物を使う。
vi.mock('../src/ui/sprites', () => ({ FAM: {}, PORTRAIT: {}, CRATE: {}, DEER: [], ICON: {}, MERCHANT: {}, RABBIT: [], WALKERS: [], guestSprite() {} }));

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });

// 入力・通信の司令塔を、描画ループや画像読み込みを起動せずに使う。
function result() {
  return { score: 1000, served: 10, maxCombo: 5, angry: 0, kps: 3, accuracy: 1,
    finishedAt: '2026-11-07T03:00:00Z', best: true, rank: 'A', title: '店主', trips: 1,
    difficulty: 'ふつう', difficultyId: 'normal' as const,
    daily: { date: '2026-11-07', conds: dailyConditions('2026-11-07') },
    play: { seed: 1, record: '0a', prep: null }, unlocked: [] };
}
function game(client: RankingClient): Game {
  const store = new SaveStore(localStorage, 'test');
  return Object.assign(Object.create(Game.prototype) as Game, {
    result: result(), mode: 'result', store, settings: store.loadSettings(), ranking: client,
    submission: { state: 'idle', receipt: null, message: '' }, nameEntry: null,
    menu: new CandidateInput(() => []), board: null,
  });
}
function deferred() {
  let resolve!: (value: Response) => void;
  const response = new Promise<Response>(r => { resolve = r; });
  return { response, resolve };
}

describe('ゲームとランキングの連携', () => {
  it('結果の日付・難易度を送り、送信中の二重操作を止める', async () => {
    const reply = deferred();
    let calls = 0;
    const g = game(new RankingClient(async (_url, init) => {
      calls++;
      const sent = JSON.parse(String(init?.body));
      expect(sent).toMatchObject({ date: '2026-11-07', difficulty: 'normal', name: '店主', score: 1000 });
      return reply.response;
    }));
    g.settings.difficulty = 'hard'; // 送る難易度は結果に結び付いている。
    const sending = g.submitRanking('店主');
    await g.submitRanking('別の名前');
    expect(calls).toBe(1);
    reply.resolve(new Response('{"rank":2,"total":10}'));
    await sending;
    expect(g.submission.receipt).toEqual({ rank: 2, total: 10 });
    expect(g.store.loadSettings().rankingName).toBe('店主');
  });
  it('次の営業に進んでから届いた前の返答を使わない', async () => {
    const reply = deferred();
    const g = game(new RankingClient(async () => reply.response));
    const sending = g.submitRanking('店主');
    g.result = result(); // 次の営業の結果
    g.submission = { state: 'idle', receipt: null, message: '' };
    reply.resolve(new Response('{"rank":2,"total":10}'));
    await sending;
    expect(g.submission).toEqual({ state: 'idle', receipt: null, message: '' });
  });
  it('失敗時も端末の記録を残し、再送できる', async () => {
    let calls = 0;
    const g = game(new RankingClient(async () => {
      if (++calls === 1) throw new TypeError('offline');
      return new Response('{"rank":1,"total":1}');
    }));
    g.store.recordDaily(g.result!, '2026-11-07', 'normal');
    await g.submitRanking('店主');
    expect(g.submission.state).toBe('error');
    expect(g.store.loadDailyBest('2026-11-07', 'normal')?.score).toBe(1000);
    await g.submitRanking('店主');
    expect(g.submission.state).toBe('sent');
  });
  it('あとに選んだ難易度のランキングを、古い返答で置き換えない', async () => {
    const first = deferred();
    const g = game(new RankingClient(async url => String(url).includes('difficulty=easy') ? first.response : new Response('{"top":[],"me":null,"total":0}')));
    const old = g.loadBoard('2026-11-07', 'easy');
    await g.loadBoard('2026-11-07', 'hard');
    first.resolve(new Response('{"top":[{"rank":1,"name":"前の記録","score":1000}],"me":null,"total":1}'));
    await old;
    expect(g.board?.key).toBe('2026-11-07:hard');
    expect(g.board?.value?.total).toBe(0);
  });
  it('名前入力中はEnter・Esc・文字をゲームへ渡さない', () => {
    const g = game(new RankingClient());
    g.nameEntry = { close() { throw new Error('ゲーム側から閉じない'); } };
    for (const key of ['Enter', 'Escape', 'a', 'Process']) g.onKey(new KeyboardEvent('keydown', { key }));
    expect(g.mode).toBe('result');
    expect(g.menu.typed).toBe('');
  });
  it.each(['札', 'Esc'])('仕込みから%sでお題に戻ると最新の順位を読み直す', async method => {
    const reply = deferred();
    const g = game(new RankingClient(async () => reply.response));
    g.mode = 'prep';
    g.daily = result().daily;
    g.board = { key: '2026-11-07:normal', state: 'ready', value: { top: [], me: null, total: 0 } };
    if (method === '札') g.menuItems().find(item => item.kana === 'もどる')!.act();
    else {
      Object.assign(g, { sound: { unlock() {}, select() {} }, artState: 'ready', t: 10 });
      g.onKey(new KeyboardEvent('keydown', { key: 'Escape' }));
    }
    expect(g.mode).toBe('daily');
    expect(g.board?.state).toBe('loading');
    reply.resolve(new Response('{"top":[{"rank":1,"name":"店主","score":1000}],"me":{"rank":1,"score":1000},"total":1}'));
    await vi.waitFor(() => expect(g.board?.value?.total).toBe(1));
    expect(g.daily?.date).toBe('2026-11-07');
  });
});
