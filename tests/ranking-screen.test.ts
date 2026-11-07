// 今日のランキングの画面：タイトルと結果画面から開き、もとの画面へ戻る
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { Game } from '../src/ui/game';
import { RankingClient } from '../src/ui/rankingClient';
import { SaveStore } from '../src/core/save';
import { dailyConditions } from '../src/core/daily';

const empty = { top: [], me: null, total: 0 };
function game(boards = vi.fn(async () => ({ easy: empty, normal: { top: [{ name: '店主', score: 900, rank: 1 }], me: null, total: 1 }, hard: empty }))) {
  const store = new SaveStore(null);
  const g = Object.assign(Object.create(Game.prototype) as Game, {
    mode: 'title', t: 0, menu: { reset: vi.fn() }, store, settings: store.loadSettings(),
    ranking: { boards } as unknown as RankingClient, boards: null, submission: { state: 'idle', receipt: null, message: '' },
  }) as unknown as Game;
  return { g, boards };
}

describe('今日のランキングの画面', () => {
  it('タイトルの「らんきんぐ」で開いて読み込み、もどるでタイトルへ', async () => {
    const { g, boards } = game();
    expect(g.menuItems().map((i) => i.kana)).toContain('らんきんぐ');
    g.menuItems().find((i) => i.kana === 'らんきんぐ')!.act();
    expect(g.mode).toBe('ranking');
    await Promise.resolve(); await Promise.resolve();
    expect(boards).toHaveBeenCalledOnce();
    expect(g.boards?.state).toBe('ready');
    expect(g.boards?.value?.normal.top[0].name).toBe('店主');
    g.menuItems()[0].act();
    expect(g.mode).toBe('title');
  });

  it('結果画面では、ランキングに送ったあとだけ「らんきんぐ」が出て、もどると結果画面へ', () => {
    const { g } = game();
    g.mode = 'result';
    g.result = { score: 1, served: 1, maxCombo: 1, angry: 0, kps: 1, accuracy: 1, finishedAt: '', best: false, rank: 'C', title: '', trips: 0,
      difficulty: 'ふつう', difficultyId: 'normal', daily: { date: '2026-11-08', conds: dailyConditions('2026-11-08') }, play: { seed: 1, record: '', prep: null } };
    expect(g.menuItems().map((i) => i.kana)).not.toContain('らんきんぐ');
    g.submission = { state: 'sent', receipt: { rank: 1, total: 1 }, message: '' };
    g.menuItems().find((i) => i.kana === 'らんきんぐ')!.act();
    expect(g.mode).toBe('ranking');
    g.menuItems()[0].act();
    expect(g.mode).toBe('result');
  });

  it('つながらないときは「つながらない」状態にする。1分以内は読み直さない', async () => {
    const boards = vi.fn(async () => { throw new Error('offline'); });
    const { g } = game(boards as never);
    await g.loadBoards('2026-11-08');
    expect(g.boards?.state).toBe('error');
    g.t = 30;
    await g.loadBoards('2026-11-08');
    expect(boards).toHaveBeenCalledOnce();
    g.t = 61;
    await g.loadBoards('2026-11-08');
    expect(boards).toHaveBeenCalledTimes(2);
  });
});
