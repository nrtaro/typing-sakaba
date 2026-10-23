import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { ShopView } from '../src/ui/shopView';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DISHES, SHOP } from '../src/core/shopConfig';
import { RomajiMatcher } from '../src/core/romaji';
import { HUNTING, HuntingGame } from '../src/core/minigames';
import { AMBER, ORDER_CARD, TAVERN_SEATS, entryPosition } from '../src/ui/amber/layout';
import type { Art } from '../src/ui/amber/art';
import { MinigameView } from '../src/ui/minigameView';
import type { Screen } from '../src/ui/screen';
import { entryDistance, entryPose, WALK_SPEED } from '../src/core/tavernNavigation';

describe('画像版の配膳と営業の同期', () => {
  it('同じ担当への連続注文も失わず、受渡しまで食事時間を消費しない', () => {
    const shop = new Shop(new Rng(1));
    const view = new ShopView();
    view.art = { anim: () => ({ frames: [8, 9, 10, 9, 8], fps: 5 }) } as unknown as Art;
    const dish = DISHES.find((d) => d.id === 'ale')!;
    const guests = [3, 5].map((seat, i) => {
      const g = { id: 100 + i, dish, look: 0, wait: 25, maxWait: 30, state: 'wait' as const, t: 0, lack: 0 };
      shop.seats[seat] = g;
      return g;
    });
    for (let i = 0; i < 2; i++) {
      for (const key of new RomajiMatcher(dish.kana).remaining) shop.key(key);
      for (const ev of shop.drainEvents()) view.handle(ev, shop);
    }
    expect(view.servers.wife.jobs).toHaveLength(2);
    expect(shop.seats[3]!.awaitingDelivery).toBe(true);
    const score = shop.score;
    for (let i = 0; i < 30; i++) { shop.update(1 / 60); view.update(1 / 60, shop); }
    expect(shop.seats[3]!.t).toBe(SHOP.eatTime);
    for (let i = 0; i < 900; i++) { shop.update(1 / 60); view.update(1 / 60, shop); }
    expect(guests.every((g) => !('awaitingDelivery' in g) || !g.awaitingDelivery)).toBe(true);
    expect(view.servers.wife.jobs).toHaveLength(0);
    expect(shop.stats.served).toBe(2);
    expect(shop.score).toBeLessThanOrEqual(score); // 入店後の放置客のペナルティはあり得る
  });
});

describe('席の重なりと入口', () => {
  it('遠い席ほど入店に時間がかかり、曲がる地点で向きを変える', () => {
    const near = TAVERN_SEATS[7], far = TAVERN_SEATS[0];
    expect(entryDistance(far)).toBeGreaterThan(entryDistance(near));
    expect(entryPose(far, 0.2).flip).toBe(false);
    expect(entryPose(far, 0.99).flip).toBe(true);
    const dt = 0.1, duration = entryDistance(far) / WALK_SPEED;
    const p0 = entryPose(far, 0.2), p1 = entryPose(far, 0.2 + dt / duration);
    expect(Math.hypot(p1.x - p0.x, p1.y - p0.y)).toBeCloseTo(WALK_SPEED * dt);
  });

  it('案内は間隔を空け、入店中は注文と待ち時間を開始しない', () => {
    const shop = new Shop(new Rng(1));
    const guest = { id: 100, dish: DISHES[0], look: 0, wait: 25, maxWait: 25, state: 'walk' as const, t: 0, lack: 0 };
    shop.queue.push({ ...guest }, { ...guest, id: 101 });
    shop.update(0.01);
    expect(shop.seats.filter(Boolean)).toHaveLength(1);
    const entering = shop.seats[0]!;
    expect(entering.walkDuration).toBeCloseTo(entryDistance(TAVERN_SEATS[0]) / WALK_SPEED);
    for (let i = 0; i < 20; i++) shop.update(0.01);
    expect(shop.seats.filter(Boolean)).toHaveLength(1);
    expect(entering.state).toBe('walk');
    expect(entering.wait).toBe(25);
    expect(shop.targets().some((t) => t.id === 'seat:0')).toBe(false);
  });

  it('下段の注文枠は上段テーブルの足元より下にある', () => {
    expect(TAVERN_SEATS[4].ty - ORDER_CARD.offset).toBeGreaterThan(TAVERN_SEATS[0].ty + AMBER.tavern.table.foot);
  });
  it('入店経路は入口の床から始まり、席の足元へ着く', () => {
    for (const seat of TAVERN_SEATS) {
      expect(entryPosition(seat, 0)).toEqual({ x: 452, y: 202 });
      expect(entryPosition(seat, 1).x).toBeCloseTo(seat.x);
      expect(entryPosition(seat, 1).y).toBeCloseTo(seat.ty - 2);
    }
  });
});

describe('狩りのゲージと報酬', () => {
  it('同じ場所に獲物が重なってもラベルを画面上部へ積み上げない', () => {
    const game = new HuntingGame(new Rng(7));
    for (let i = 0; i < 200; i++) game.update(1 / 60);
    expect(game.prey.length).toBeGreaterThan(1);
    for (const p of game.prey) { p.x = 0.5; p.lane = 0; p.kind = 'rabbit'; }
    const panel = vi.fn();
    const sc = { panel, W: (s: string, size: number) => s.length * size / 2,
      T: vi.fn(), TB: vi.fn(), PR: vi.fn(), roma: vi.fn() } as unknown as Screen;
    new MinigameView()['drawHuntingUi'](sc, game);
    const ys = panel.mock.calls.map((call) => call[1]);
    expect(new Set(ys).size).toBe(1);
    expect(ys[0]).toBe(54); // 足元118、頭24、枠32、隙間8。個体数に依存しない。
  });

  it('大物の文字枠は中段の小物の走路を覆わず、頭の横に留まる', () => {
    const game = new HuntingGame(new Rng(7));
    for (let i = 0; i < 200; i++) game.update(1 / 60);
    const deer = game.prey.find((p) => p.kind === 'deer')!;
    deer.x = 0.5;
    game.prey = [deer];
    const panel = vi.fn();
    const sc = { panel, W: (s: string, size: number) => s.length * size / 2,
      T: vi.fn(), TB: vi.fn(), PR: vi.fn(), roma: vi.fn() } as unknown as Screen;
    new MinigameView()['drawHuntingUi'](sc, game);
    const [x, y, w] = panel.mock.calls[0];
    expect(x + w).toBeLessThan(74 + deer.x * 396 - 30);
    expect(y).toBeCloseTo(118 + deer.lane * 106 - 48 + 8);
  });

  it('小物は1語で肉2、大物は3語で肉12を得る', () => {
    const game = new HuntingGame(new Rng(7));
    for (let i = 0; i < 130; i++) game.update(1 / 60);
    for (const kind of ['rabbit', 'deer'] as const) {
      const prey = game.prey.find((p) => p.kind === kind)!;
      expect(prey.maxHp).toBe(kind === 'rabbit' ? 1 : 3);
      const before = game.gains.meat ?? 0;
      for (let hit = 0; hit < HUNTING[kind].hp; hit++) {
        for (const key of new RomajiMatcher(prey.word.kana).remaining) game.key(key);
      }
      expect((game.gains.meat ?? 0) - before).toBe(kind === 'rabbit' ? 2 : 12);
    }
  });
});


describe('連続操作中の文字表示', () => {
  it('連続提供の売上・コンボ通知を同じ場所に重ねず、最新値に更新する', () => {
    const shop = new Shop(new Rng(1));
    const view = new ShopView();
    for (let combo = 3; combo <= 20; combo++) view.handle({ type: 'serve', seat: 0, gain: 120, combo }, shop);
    expect(view.pops).toHaveLength(2);
    expect(view.pops.find(p => p.slot === 'combo')?.text).toBe('20 COMBO!!');
    expect(view.pops.find(p => p.slot === 'income')?.text).toBe('+120円');
    for (const p of view.pops) expect(p.x).toBeLessThan(140); // 客席の注文枠から離す
  });

  it('時間帯の通知はHUDへ浮き上がらず、固定の通知欄に表示する', () => {
    const shop = new Shop(new Rng(1));
    const view = new ShopView();
    view.handle({ type: 'phase', index: 1 }, shop);
    expect(view.pops).toHaveLength(0);
    expect(view.banner?.text).toContain('昼');
  });

  it('コンボが途切れた直後は強調を消し、ゼロコンボの演出を残さない', () => {
    const shop = new Shop(new Rng(1));
    const view = new ShopView();
    view.handle({ type: 'serve', seat: 0, gain: 120, combo: 10 }, shop);
    expect(view.comboBurst).toBeGreaterThan(0);
    shop.combo = 0;
    view.update(1 / 60, shop);
    expect(view.comboBurst).toBe(0);
  });
});
