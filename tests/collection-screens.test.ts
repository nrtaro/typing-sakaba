// 段階6：ふくびき・きろくのタブ・飾り・結果の貯金
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { Game } from '../src/ui/game';
import { SaveStore } from '../src/core/save';
import { PlaySession } from '../src/core/session';
import { NORMAL_RULES } from '../src/core/daily';
import { difficultyOf } from '../src/core/shopConfig';
import { PULL_PRICE } from '../src/core/collection';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
function game(kv = memory()) {
  const store = new SaveStore(kv);
  const setKeyVoice = vi.fn();
  const sound = new Proxy({ setKeyVoice } as Record<string, unknown>, { get: (o, k) => (k in o ? o[k as string] : vi.fn()) });
  const g = Object.assign(Object.create(Game.prototype) as Game, {
    store, settings: store.loadSettings(), sound, menu: { reset: vi.fn(), typed: '', active: [] },
    view: { update: vi.fn(), handle: vi.fn() }, tripView: { art: null, update: vi.fn(), handle: vi.fn() },
    mode: 'title', t: 0, daily: null, prep: null, paused: false, countdown: 0, goShown: 0, seed: 7, art: null,
    submission: { state: 'idle', receipt: null, message: '' }, recordsView: null, records: null, stickerArt: { load: vi.fn(), get: () => null },
  }) as unknown as Game;
  return { g, store, setKeyVoice, kv };
}
const ownedCount = (s: SaveStore) => Object.keys(s.loadCollection().owned).length;

describe('ふくびき', () => {
  it('タイトルの「ふくびき」で開く', () => {
    const { g } = game();
    const it = g.menuItems().find((i) => i.kana === 'ふくびき')!;
    it.act();
    expect(g.mode).toBe('fukubiki');
    expect(g.menuItems().map((i) => i.kana)).toEqual(['ひく', 'こうかん', 'もどる']);
  });

  it('最初の1回は無料、次は貯金箱が足りなければ引けず理由を出す', () => {
    const { g, store } = game();
    g.openFukubiki();
    g.pullOnce();
    expect(ownedCount(store)).toBeGreaterThan(0);
    const before = store.loadCollection();
    g.fukubiki!.anim = 99;
    g.pullOnce();
    expect(store.loadCollection()).toEqual(before);
    expect(g.fukubiki!.message).toContain('足りません');
  });

  it('演出中のキーは演出を飛ばすだけで、二度引かない', () => {
    const { g, store } = game();
    store.updateCollection((c) => ({ ...c, freeUsed: true, coins: PULL_PRICE * 2 }));
    g.openFukubiki();
    g.pullOnce();
    expect(store.loadCollection().coins).toBe(PULL_PRICE);
    g.pullOnce(); // 演出中は引かない
    g.fukubikiKey('Enter');
    g.fukubikiKey('Enter');
    expect(store.loadCollection().coins).toBe(PULL_PRICE);
    expect(g.fukubiki!.anim).toBeGreaterThanOrEqual(1.2);
  });

  it('おまけ札が足りない交換では、何も減らない', () => {
    const { g, store } = game();
    store.updateCollection((c) => ({ ...c, tickets: 3 }));
    g.openFukubiki();
    const before = store.loadCollection();
    g.exchangeItem('p-kinpaku');
    expect(store.loadCollection()).toEqual(before);
    expect(g.fukubiki!.message).toContain('足りません');
    store.updateCollection((c) => ({ ...c, tickets: 300 }));
    g.exchangeItem('p-kinpaku');
    expect(store.loadCollection().owned['p-kinpaku']).toBeTruthy();
    expect(store.loadCollection().tickets).toBe(100);
  });
});

describe('きろくのタブと飾り', () => {
  it('Tab でタブが順に変わり、実績タブの操作はそのまま', () => {
    const { g } = game();
    g.openRecords();
    expect(g.recordsView!.tab).toBe('achievements');
    g.recordsKey('ArrowDown');
    expect(g.recordsView!.sel).toBe(1);
    g.recordsKey('Tab');
    expect(g.recordsView!.tab).toBe('stickers');
    g.recordsKey('ArrowRight');
    expect(g.recordsView!.series).toBe(1);
    g.recordsKey('Tab');
    expect(g.recordsView!.tab).toBe('decor');
    g.recordsKey('Tab');
    expect(g.recordsView!.tab).toBe('achievements');
    expect(g.menuItems().map((i) => i.kana)).toEqual(['もどる', 'じっせき', 'しーる', 'かざり']);
  });

  it('付けた飾りは保存され、読み直しても戻る。打鍵音を変えると音に伝える', () => {
    const kv = memory();
    const { g, store, setKeyVoice } = game(kv);
    store.updateCollection((c) => ({ ...c, owned: { 'p-kinari': 'x', 'k-suzu': 'x' } }));
    g.openRecords();
    g.setDecor({ plate: 'p-kinari', sound: 'k-suzu' });
    expect(new SaveStore(kv).loadCollection().equip).toMatchObject({ plate: 'p-kinari', sound: 'k-suzu' });
    expect(setKeyVoice).toHaveBeenLastCalledWith(expect.objectContaining({ base: 1320 }));
  });

  it('飾りタブの←→で、持っているものだけを順に選ぶ', () => {
    const { g, store } = game();
    store.updateCollection((c) => ({ ...c, owned: { 'p-kinari': 'x', 'p-sorairo': 'x' } }));
    g.openRecords();
    g.recordsKey('Tab'); g.recordsKey('Tab');
    g.recordsView!.decorRow = 3; // プレート
    g.recordsKey('ArrowRight');
    const first = store.loadCollection().equip.plate;
    g.recordsKey('ArrowRight');
    const second = store.loadCollection().equip.plate;
    g.recordsKey('ArrowRight');
    expect(new Set([first, second])).toEqual(new Set(['p-kinari', 'p-sorairo']));
    expect(store.loadCollection().equip.plate).toBeNull();
  });
});

describe('結果の貯金', () => {
  it('閉店で売上を貯金箱に足し、結果に出す', () => {
    const { g, store } = game();
    g.session = new PlaySession(1, difficultyOf('normal'), NORMAL_RULES);
    g.playId = 'play-x';
    g.openDate = '2026-11-08';
    g.session.shop.score = 4321;
    g.finish();
    expect(g.result!.credited).toBe(4321);
    expect(store.loadCollection().coins).toBe(4321);
  });
});
