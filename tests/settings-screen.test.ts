// 段階6の手直し（段階B）：設定画面と音量
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { Game } from '../src/ui/game';
import { SaveStore, DEFAULT_SETTINGS } from '../src/core/save';
import { FX_GAIN, FX_NAMES } from '../src/ui/audio';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
function game(kv = memory()) {
  const store = new SaveStore(kv);
  const calls: string[] = [];
  const apply = vi.fn();
  const sound = new Proxy({ apply } as Record<string, unknown>, { get: (o, k) => (k in o ? o[k as string] : () => calls.push(String(k))) });
  const g = Object.assign(Object.create(Game.prototype) as Game, {
    store, settings: store.loadSettings(), sound, menu: { reset: vi.fn(), typed: '', active: [] }, mode: 'title', t: 0, missFlash: 0,
  }) as unknown as Game;
  return { g, store, calls, apply, kv };
}

describe('設定画面', () => {
  it('タイトルの「せってい」で開き、もどるでタイトルへ', () => {
    const { g } = game();
    const items = g.menuItems();
    expect(items.map((i) => i.kana)).toContain('せってい');
    expect(items.map((i) => i.kana)).not.toContain('おと');
    items.find((i) => i.kana === 'せってい')!.act();
    expect(g.mode).toBe('settings');
    g.menuItems()[0].act();
    expect(g.mode).toBe('title');
  });

  it('↑↓で欄を、←→で音量を変え、保存して音に伝える', () => {
    const kv = memory();
    const { g, apply, calls } = game(kv);
    g.openSettings();
    g.settingsKey('ArrowDown'); // BGM
    g.settingsKey('ArrowLeft');
    g.settingsKey('ArrowLeft');
    expect(g.settings.bgmLevel).toBe(6);
    g.settingsKey('ArrowDown'); // 効果音
    g.settingsKey('ArrowRight');
    g.settingsKey('ArrowRight');
    g.settingsKey('ArrowRight');
    expect(g.settings.seLevel).toBe(10);
    g.settingsKey('ArrowDown'); // 打鍵音
    for (let i = 0; i < 12; i++) g.settingsKey('ArrowLeft');
    expect(g.settings.keyLevel).toBe(0);
    expect(apply).toHaveBeenCalled();
    expect(calls).toContain('key');
    const saved = new SaveStore(kv).loadSettings();
    expect([saved.bgmLevel, saved.seLevel, saved.keyLevel]).toEqual([6, 10, 0]);
  });

  it('全体の音量は なし・小・中・大 の4段階', () => {
    const { g } = game();
    g.openSettings();
    g.settingsKey('ArrowLeft');
    expect(g.settings.volume).toBe(2);
    for (let i = 0; i < 5; i++) g.settingsKey('ArrowLeft');
    expect(g.settings.volume).toBe(0);
    expect(g.settings.muted).toBe(true);
    g.settingsKey('ArrowRight');
    expect(g.settings.muted).toBe(false);
  });

  it('古い設定（音量の欄がない）は、これまでの大きさ（8）で始まる', () => {
    const kv = memory();
    kv.setItem('lastorder2.settings', JSON.stringify({ volume: 2 }));
    const s = new SaveStore(kv).loadSettings();
    expect([s.bgmLevel, s.seLevel, s.keyLevel, s.volume]).toEqual([8, 8, 8, 2]);
    expect(DEFAULT_SETTINGS.bgmLevel).toBe(8);
  });
});

describe('効果音の大きさをそろえる係数', () => {
  it('すべての効果音に係数があり、極端すぎない', () => {
    for (const n of FX_NAMES) {
      expect(FX_GAIN[n]).toBeGreaterThanOrEqual(0.4);
      expect(FX_GAIN[n]).toBeLessThanOrEqual(2.5);
    }
  });
});
