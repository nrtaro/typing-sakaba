// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import { Game } from '../src/ui/game';

vi.mock('../src/ui/sprites', () => ({ FAM: {}, PORTRAIT: {}, CRATE: {}, DEER: [], ICON: {}, MERCHANT: {}, RABBIT: [], WALKERS: [], guestSprite() {} }));

describe('繁盛記の遊び方への入口', () => {
  it('遊び方から繁盛記の説明を開き、もどるで共通の説明へ帰れる', () => {
    const game = Object.assign(Object.create(Game.prototype) as Game, { mode: 'help', helpPage: 0 });
    const entry = game.menuItems().find((item) => item.kana === 'はんじょうき');
    expect(entry).toBeDefined();
    entry!.act();
    expect(game.helpPage).toBe(3);
    const back = game.menuItems().find((item) => item.kana === 'もどる');
    expect(back).toBeDefined();
    back!.act();
    expect(game.mode).toBe('help');
    expect(game.helpPage).toBe(0);
  });
});
