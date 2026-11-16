// @vitest-environment jsdom
// はじめて開いた人だけに出す、タイトルの前の案内
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/ui/game';
import { CandidateInput } from '../src/core/candidates';
import { SaveStore, type KeyValueStore } from '../src/core/save';
import { ENTERS_TO_SKIP_HINT, INTRO_CHEER, INTRO_STEPS, finishIntro, introStep, startIntro } from '../src/ui/screens/intro';
import { RomajiMatcher } from '../src/core/romaji';
import type { MenuItem } from '../src/ui/screens/shared';

vi.mock('../src/ui/sprites', () => ({ FAM: {}, PORTRAIT: {}, CRATE: {}, DEER: [], ICON: {}, MERCHANT: {}, RABBIT: [], WALKERS: [], guestSprite() {} }));

function memory(init: Record<string, string> = {}): KeyValueStore {
  const m = new Map(Object.entries(init));
  return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } };
}

/** 描画やブラウザに触れずに、案内の進み方だけを動かせる Game */
function fakeGame(store = new SaveStore(memory())) {
  const game = Object.create(Game.prototype) as Game;
  Object.assign(game, {
    t: 0, mode: 'title', intro: null, artState: 'ready', paused: false, missFlash: 0, clickHintAt: -10, imeHintAt: -10, lastInput: 0,
    store, settings: store.loadSettings(),
    sound: new Proxy({}, { get: () => vi.fn() }),
  });
  (game as unknown as { menu: CandidateInput<MenuItem> }).menu = new CandidateInput(() => game.menuItems().map((it) => ({ id: it.kana, kana: it.kana, data: it })));
  return game;
}

function key(game: Game, k: string) {
  const preventDefault = vi.fn();
  game.onKey({ key: k, preventDefault, isComposing: false, ctrlKey: false, metaKey: false, altKey: false, repeat: false } as unknown as KeyboardEvent);
}

function typeWord(game: Game, kana: string) {
  for (const ch of new RomajiMatcher(kana).remaining) key(game, ch);
}

describe('はじめての案内', () => {
  it('保存のない人には出し、今まで遊んでいた人（設定の保存がある人）には出さない', () => {
    expect(new SaveStore(memory()).loadSettings().introDone).toBe(false);
    const old = new SaveStore(memory({ 'lastorder2.settings': JSON.stringify({ volume: 2, tutorialDone: true }) }));
    expect(old.loadSettings().introDone).toBe(true);
    const seen = new SaveStore(memory({ 'lastorder2.settings': JSON.stringify({ introDone: false }) }));
    expect(seen.loadSettings().introDone).toBe(false);
  });

  it('3つの言葉を打つと段が進み、最後の「はじめる」で営業えらびへ。二度と出ない', () => {
    const store = new SaveStore(memory());
    const game = fakeGame(store);
    startIntro(game);
    expect(game.mode).toBe('intro');
    INTRO_STEPS.forEach((step, i) => {
      expect(game.intro!.step).toBe(i);
      typeWord(game, step.kana);
      expect(game.intro?.doneAt ?? 0).toBe(game.t);
      // 喜んでいる間は、打っても何も選ばれない
      expect(game.menuItems()).toEqual([]);
      game.t += INTRO_CHEER + 0.01;
      introStep(game);
    });
    expect(game.mode).toBe('modeSelect');
    expect(game.intro).toBeNull();
    expect(store.loadSettings().introDone).toBe(true);
    // はじめての人は、営業えらびの Enter で「れんしゅう」に入れる
    expect(game.enterItem()?.kana).toBe('れんしゅう');
    game.settings.tutorialDone = true;
    expect(game.enterItem()?.kana).toBe('つうじょう');
  });

  it('違うキーは「次に押すキー」を強く見せ、Enter も黙って無視しない。Esc で飛ばせる', () => {
    const store = new SaveStore(memory());
    const game = fakeGame(store);
    startIntro(game);
    game.t = 2;
    key(game, 'q');
    expect(game.intro!.missAt).toBe(2);
    expect(game.intro!.step).toBe(0);
    game.t = 3;
    for (let i = 0; i < ENTERS_TO_SKIP_HINT; i++) key(game, 'Enter');
    expect(game.intro!.nudgeAt).toBe(3);
    expect(game.intro!.enters).toBe(ENTERS_TO_SKIP_HINT);
    expect(game.intro!.step).toBe(0);
    expect(game.mode).toBe('intro');
    key(game, 'Escape');
    expect(game.mode).toBe('title');
    expect(store.loadSettings().introDone).toBe(true);
  });

  it('最後の段（メニュー）は Enter でも選べる', () => {
    const game = fakeGame();
    startIntro(game);
    for (const step of INTRO_STEPS.slice(0, -1)) {
      typeWord(game, step.kana);
      game.t += INTRO_CHEER + 0.01;
      introStep(game);
    }
    expect(game.intro!.step).toBe(INTRO_STEPS.length - 1);
    key(game, 'Enter');
    game.t += INTRO_CHEER + 0.01;
    introStep(game);
    expect(game.mode).toBe('modeSelect');
  });

  it('あそびかたから見直せて、Esc で飛ばすと、あそびかたへ戻る', () => {
    const game = fakeGame();
    game.mode = 'help';
    (game as unknown as { helpPage: number }).helpPage = 0;
    const entry = game.menuItems().find((it) => it.kana === 'あんない');
    expect(entry).toBeDefined();
    entry!.act();
    expect(game.mode).toBe('intro');
    key(game, 'Escape');
    expect(game.mode).toBe('help');
  });

  it('打つ言葉は互いに頭がかぶらず、ローマ字で打ち切れる', () => {
    for (const s of INTRO_STEPS) expect(new RomajiMatcher(s.kana).remaining.length).toBeGreaterThan(1);
    const game = fakeGame();
    startIntro(game);
    finishIntro(game);
    expect(game.settings.introDone).toBe(true);
  });
});
