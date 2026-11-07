// 時間切れが近い注文の強調と、閉店前10秒の秒読み
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { ShopView, URGENT } from '../src/ui/shopView';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DISHES } from '../src/core/shopConfig';
import { Game } from '../src/ui/game';
import type { Screen } from '../src/ui/screen';

function drawn(wait: number, extra: object = {}) {
  const shop = new Shop(new Rng(1)), view = new ShopView();
  shop.seats[0] = { id: 1, dish: DISHES[0], look: 0, wait, maxWait: 30, state: 'wait', t: 0, lack: 0, ...extra };
  const TB = vi.fn();
  const sc = { T: vi.fn(), TB, panel: vi.fn(), PR: vi.fn(), roma: vi.fn(), spr: vi.fn(), glow: vi.fn(), radialGlow: vi.fn(),
    fitSize: (_s: string, size: number) => size, W: (s: string, size: number) => s.length * size / 2 } as unknown as Screen;
  view['drawOrders'](sc, shop);
  return TB.mock.calls.some((c) => c[0] === 'いそいで！');
}

describe('時間切れが近い注文', () => {
  it('待ち時間が残りわずかになると「いそいで！」を出す', () => {
    expect(drawn(30 * URGENT - 1)).toBe(true);
    expect(drawn(30 * URGENT + 1)).toBe(false);
  });
  it('おかわりの2品目（待たせても怒らない）には出さない', () => {
    expect(drawn(1, { refill: true })).toBe(false);
  });
});

describe('閉店前10秒', () => {
  function game() {
    const final = vi.fn(), setRate = vi.fn();
    const g = Object.assign(Object.create(Game.prototype) as Game, { sound: { final, setRate }, view: { banner: null } }) as unknown as Game;
    return { g, final, setRate };
  }
  it('1秒に1回だけ秒読みの音を鳴らし、BGM を速め、10秒で知らせる', () => {
    const { g, final, setRate } = game();
    for (let left = 12; left > 0; left -= 1 / 60) g['finalCall'](left);
    expect(final.mock.calls.map((c) => c[0])).toEqual([10, 9, 8, 7, 6, 5, 4, 3, 2, 1]);
    expect(setRate).toHaveBeenCalledWith(1.25);
    expect(g.view.banner?.text).toContain('10秒');
  });
  it('残り10秒より前は何もしない', () => {
    const { g, final, setRate } = game();
    g['finalCall'](30);
    expect(final).not.toHaveBeenCalled();
    expect(setRate).not.toHaveBeenCalled();
  });
});
