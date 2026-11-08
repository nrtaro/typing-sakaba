// 段階6のあとの手直し（段階A）
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { Game } from '../src/ui/game';
import { SaveStore } from '../src/core/save';
import { PlaySession } from '../src/core/session';
import { NORMAL_RULES } from '../src/core/daily';
import { difficultyOf } from '../src/core/shopConfig';
import { ACHIEVEMENTS, emptyRecords } from '../src/core/achievements';
import { LINKS, PULL_PRICE, achievementItem } from '../src/core/collection';
import { Screen } from '../src/ui/screen';
import { drawKeyboard } from '../src/ui/screens/common';
import { drawNameplate } from '../src/ui/nameplate';
import { rewardText } from '../src/ui/screens/records';

function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
function game() {
  const store = new SaveStore(memory());
  const calls: string[] = [];
  const setKeyVoice = vi.fn();
  const sound = new Proxy({ setKeyVoice } as Record<string, unknown>, { get: (o, k) => (k in o ? o[k as string] : () => calls.push(String(k))) });
  const g = Object.assign(Object.create(Game.prototype) as Game, {
    store, settings: store.loadSettings(), sound, menu: { reset: vi.fn(), typed: '', active: [], key: vi.fn(), backspace: vi.fn() },
    view: { update: vi.fn(), handle: vi.fn() }, tripView: { art: null, update: vi.fn(), handle: vi.fn() },
    mode: 'title', t: 0, daily: null, prep: null, paused: false, countdown: 0, goShown: 0, seed: 7, art: null, artState: 'ready',
    submission: { state: 'idle', receipt: null, message: '' }, recordsView: null, records: null, nameEntry: null,
    lastInput: 0, clickHintAt: 0, resultAt: -99, missFlash: 0, stickerArt: { load: vi.fn(), get: () => null },
  }) as unknown as Game;
  return { g, store, calls, setKeyVoice };
}
const key = (k: string) => ({ key: k, repeat: false, preventDefault() {}, ctrlKey: false, metaKey: false, altKey: false, isComposing: false }) as unknown as KeyboardEvent;

describe('段階A：不具合', () => {
  it('会話を読んでいる途中の Tab では、ほかの会話に移らない', () => {
    const { g, store } = game();
    const r = emptyRecords();
    for (const a of ACHIEVEMENTS) r.unlocked[a.id] = 'x';
    (store as unknown as { write(k: string, v: unknown): void }).write('lastorder2.records.v1', r);
    g.openRecords();
    g.recordsView!.sel = 5;
    g.recordsKey('Enter');
    expect(g.recordsView!.reading).toBe(5);
    g.recordsKey('Tab');
    expect(g.recordsView!.reading).toBe(5);
    expect(g.recordsView!.tab).toBe('achievements');
  });

  it('ふくびきの Enter で決定音は1回だけ', () => {
    const { g, calls } = game();
    g.openFukubiki();
    calls.length = 0;
    g.onKey(key('Enter'));
    expect(calls.filter((c) => c === 'select')).toHaveLength(1);
  });

  it('タイトルに戻るたびに、付けている打鍵音を読み直す（別のタブで変えた分も）', () => {
    const { g, store, setKeyVoice } = game();
    store.updateCollection((c) => ({ ...c, owned: { 'k-suzu': 'x' }, equip: { ...c.equip, sound: 'k-suzu' } }));
    g.toTitle();
    expect(setKeyVoice).toHaveBeenLastCalledWith(expect.objectContaining({ base: 1320 }));
  });

  it('キーボードの絵は、12個のキーを右下まで順に押してから最初に戻る', () => {
    const lit = new Set<number>();
    for (let t = 0; t < 5; t += 0.05) {
      let k = 0;
      const sc = { panel() {}, PR(_x: number, _y: number, w: number, _h: number, col: string) { if (w === 2) { if (col !== '#8a6232') lit.add(k); k++; } } };
      drawKeyboard({ sc, t } as unknown as Game, 0, 0);
    }
    expect([...lit].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]);
  });
});

describe('段階A：表示', () => {
  function result(freeUsed: boolean, score: number) {
    const { g, store } = game();
    store.updateCollection((c) => ({ ...c, freeUsed }));
    g.session = new PlaySession(1, difficultyOf('normal'), NORMAL_RULES);
    g.playId = 'p1';
    g.openDate = '2026-11-09';
    g.session.shop.score = score;
    g.finish();
    return g.result!;
  }
  it('無料の1回が残っていれば、売上が少なくても「引ける」', () => {
    expect(result(false, 100).canPull).toBe(true);
    expect(result(true, 100).canPull).toBe(false);
    expect(result(true, PULL_PRICE).canPull).toBe(true);
  });

  it('二つ名が長くて入らないときは、枠の中で「…」で切る', () => {
    const texts: { text: string; x: number; size: number }[] = [];
    const sc = { W: (t: string, s: number) => [...t].length * s, fitSize: Screen.prototype.fitSize, PR() {}, panel() {}, blit() {},
      T(text: string, x: number, _y: number, size: number) { texts.push({ text, x, size }); }, TB(text: string, x: number, _y: number, size: number) { texts.push({ text, x, size }); } };
    drawNameplate(sc as unknown as Screen, 0, 0, 60, 15, '名前', { titleFront: 'f-kuishinbo', titleLink: 'noyouna', titleBack: 'b-ryorinokami', plate: null }, 9);
    for (const t of texts) expect(t.x + sc.W(t.text, t.size)).toBeLessThanOrEqual(60);
    expect(texts[0].text.endsWith('…')).toBe(true);
  });
});

describe('段階A：中身', () => {
  it('ふくびきは1回5,000円', () => {
    expect(PULL_PRICE).toBe(5000);
  });
  it('つなぎの言葉が増え、最初の6つの ID は変わらない', () => {
    expect(LINKS.slice(0, 6).map((l) => l.id)).toEqual(['na', 'no', 'none', 'noyouna', 'mitaina', 'toiu']);
    expect(LINKS.length).toBeGreaterThanOrEqual(14);
    expect(new Set(LINKS.map((l) => l.id)).size).toBe(LINKS.length);
  });
  it('実績の報酬の説明：種類・名前・☆と、受け取ったか', () => {
    const a = ACHIEVEMENTS.find((x) => x.id === 'tenth-deer')!;
    const it = achievementItem(a.id)!;
    expect(rewardText(a.id, false)).toBe(`報酬：後ろの言葉「${it.name}」☆${it.star}`);
    expect(rewardText(a.id, true)).toContain('受け取り済み');
  });
});
