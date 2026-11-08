// 段階C：飾りの一覧から選ぶ・ランキングに反映
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { Game } from '../src/ui/game';
import { SaveStore } from '../src/core/save';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
function game(decorate = vi.fn(async () => ({ updated: 1 }))) {
  const store = new SaveStore(memory());
  const setKeyVoice = vi.fn();
  const sound = new Proxy({ setKeyVoice } as Record<string, unknown>, { get: (o, k) => (k in o ? o[k as string] : vi.fn()) });
  const g = Object.assign(Object.create(Game.prototype) as Game, {
    store, settings: store.loadSettings(), sound, menu: { reset: vi.fn(), typed: '', active: [] }, mode: 'title', t: 0, missFlash: 0,
    recordsView: null, records: null, stickerArt: { load: vi.fn(), get: () => null }, ranking: { decorate },
  }) as unknown as Game;
  store.updateCollection((c) => ({ ...c, owned: { 'p-kinari': 'x', 'p-sorairo': 'x', 'f-nonbiri': 'x', 'b-minarai': 'x', 'k-suzu': 'x' } }));
  g.openRecords();
  g.setRecordsTab('decor');
  return { g, store, decorate, setKeyVoice };
}

describe('飾りの一覧から選ぶ', () => {
  it('欄で Enter を押すと、持っている飾りの一覧が開き、選んで Enter で付ける', () => {
    const { g, store } = game();
    g.recordsView!.decorRow = 3; // プレート
    g.recordsKey('Enter');
    expect(g.recordsView!.picker).toEqual({ row: 3, sel: 0 });
    expect(g.decorOptions(3)).toEqual([null, 'p-kinari', 'p-sorairo']);
    g.recordsKey('ArrowRight');
    g.recordsKey('ArrowRight');
    g.recordsKey('Enter');
    expect(g.recordsView!.picker).toBeNull();
    expect(store.loadCollection().equip.plate).toBe('p-sorairo');
  });

  it('Esc で閉じても、付けている飾りは変わらない', () => {
    const { g, store } = game();
    g.recordsView!.decorRow = 0;
    g.recordsKey('Enter');
    g.recordsKey('ArrowRight');
    g.recordsKey('Escape');
    expect(g.recordsView!.picker).toBeNull();
    expect(store.loadCollection().equip.front).toBeNull();
  });

  it('打鍵音の一覧では、選んでいる音をその場で鳴らす', () => {
    const { g, setKeyVoice } = game();
    g.recordsView!.decorRow = 4;
    g.recordsKey('Enter');
    g.recordsKey('ArrowRight');
    expect(setKeyVoice).toHaveBeenCalledWith(expect.objectContaining({ base: 1320 }));
  });

  it('上下は3列ずつ動き、端で止まる', () => {
    const { g } = game();
    g.recordsView!.decorRow = 3;
    g.recordsKey('Enter');
    g.recordsKey('ArrowDown');
    expect(g.recordsView!.picker!.sel).toBe(2);
    g.recordsKey('ArrowUp');
    expect(g.recordsView!.picker!.sel).toBe(0);
  });
});

describe('ランキングに反映', () => {
  it('「ランキングに反映」で Enter を押すと、今の飾りを今日の記録に送る', async () => {
    const { g, decorate } = game();
    g.setDecor({ front: 'f-nonbiri', link: 'no', back: 'b-minarai', plate: 'p-kinari' });
    g.recordsView!.decorRow = 5;
    g.recordsKey('Enter');
    await Promise.resolve(); await Promise.resolve();
    expect(decorate).toHaveBeenCalledWith(expect.any(String), g.store.playerId(), { titleFront: 'f-nonbiri', titleLink: 'no', titleBack: 'b-minarai', plate: 'p-kinari' });
    expect(g.decorMessage).toContain('更新しました');
  });

  it('まだ送っていない日は、その旨を伝える。通信できなければ理由を出す', async () => {
    const { g } = game(vi.fn(async () => ({ updated: 0 })));
    g.recordsView!.decorRow = 5;
    g.recordsKey('Enter');
    await Promise.resolve(); await Promise.resolve();
    expect(g.decorMessage).toContain('まだ');
    const bad = game(vi.fn(async () => { throw new Error('今はランキングにつながりません'); }));
    bad.g.recordsView!.decorRow = 5;
    bad.g.recordsKey('Enter');
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(bad.g.decorMessage).toContain('つながりません');
  });
});

describe('ふくびきで引いた打鍵音を試す', () => {
  it('打鍵音のカードが出ているときは、スペースでその音を鳴らし、付けている音に戻す', () => {
    const { g, setKeyVoice } = game();
    Object.assign(g, { artState: 'ready', nameEntry: null, lastInput: 0, clickHintAt: 0, resultAt: -99 });
    g.openFukubiki();
    g.fukubiki!.last = { state: g.store.loadCollection(), star: 2, items: [{ id: 'k-suzu', isNew: true, tickets: 0 }] };
    g.fukubiki!.anim = 99;
    setKeyVoice.mockClear();
    g.onKey({ key: ' ', repeat: false, preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false, isComposing: false } as unknown as KeyboardEvent);
    expect(setKeyVoice).toHaveBeenNthCalledWith(1, expect.objectContaining({ base: 1320 }));
    expect(setKeyVoice).toHaveBeenCalledTimes(2);
  });
});
