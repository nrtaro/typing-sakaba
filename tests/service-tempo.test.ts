import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import manifest from '../assets/amber-v4/manifest.json';
import { ShopView } from '../src/ui/shopView';
import { Shop, type Guest } from '../src/core/shop';
import { DISHES } from '../src/core/shopConfig';
import { Rng } from '../src/core/rng';
import { SERVER_WALK_SPEED } from '../src/core/tavernNavigation';
import { defaultRomaji } from '../src/core/romaji';
import type { Art } from '../src/ui/amber/art';

function setup() {
  const shop = new Shop(new Rng(12)); shop.clock = 120; shop.stock.ale = 99;
  const view = new ShopView();
  view.art = { anim: (id: string, name: string) => manifest.assets.find(a => a.id === id)!.animations!.find(a => a.name === name)! } as unknown as Art;
  return { shop, view };
}
function guest(i: number): Guest {
  return { id: 100 + i, dish: DISHES.find(d => d.id === 'ale')!, look: i % 7, wait: 30, maxWait: 30, state: 'wait', t: 0, lack: 0 };
}
export function nightDeliveryTime() {
  const { shop, view } = setup();
  const guests = Array.from({ length: 8 }, (_, i) => guest(i));shop.seats = [...guests];
  for (let i = 0; i < 8; i++) {
    for (const key of defaultRomaji(guests[i].dish.kana)) shop.key(key);
    for (const ev of shop.drainEvents()) view.handle(ev, shop);
  }
  let seconds = 0;
  while (guests.some(g => g.awaitingDelivery) && seconds < 40) {
    shop.update(1 / 60); view.update(1 / 60, shop); seconds += 1 / 60;
  }
  return { seconds, delivered: guests.filter(g => !g.awaitingDelivery).length, score: shop.stats.served };
}

describe('混雑時の配膳テンポ', () => {
  it('同じ担当席が続いても、空いている家族に配膳を振り分ける', () => {
    const { shop, view } = setup();
    shop.seats[3] = guest(3); shop.seats[5] = guest(5);
    for (let i = 0; i < 2; i++) {
      for (const key of defaultRomaji('えーる')) shop.key(key);
      for (const ev of shop.drainEvents()) view.handle(ev, shop);
    }
    expect(shop.crew.members.wife.jobs).toHaveLength(1);
    expect(shop.crew.members.daughter.jobs).toHaveLength(1);
  });

  it('女将・娘とも、混雑時は移動距離が増え、落ち着くと滑らかに元の歩速へ戻る', () => {
    const move = (count: number) => {
      const { shop, view } = setup();
      for (let i = 0; i < count; i++) shop.seats[i] = guest(i);
      for (const k of ['wife', 'daughter'] as const) shop.crew['go'](shop.crew.members[k], 364, 196);
      for (let i = 0; i < 30; i++) shop.crew.update(1 / 60, shop.seats.filter(Boolean).length, undefined);
      return { shop, view };
    };
    const quiet = move(2), moderate = move(4), busy = move(8);
    for (const k of ['wife', 'daughter'] as const) {
      expect(quiet.shop.crew.members[k].distance).toBeCloseTo(SERVER_WALK_SPEED * .5, 0);
      expect(moderate.shop.crew.members[k].distance).toBeGreaterThan(quiet.shop.crew.members[k].distance);
      expect(busy.shop.crew.members[k].distance).toBeGreaterThan(moderate.shop.crew.members[k].distance);
      expect(busy.shop.crew.members[k].distance).toBeGreaterThan(quiet.shop.crew.members[k].distance * 1.7);
    }
    const before = busy.shop.crew.speed;
    busy.shop.seats.fill(null); busy.shop.crew.update(1 / 60, 0, undefined);
    expect(busy.shop.crew.speed).toBeLessThan(before);
    expect(busy.shop.crew.speed).toBeGreaterThan(SERVER_WALK_SPEED);
    for (let i = 0; i < 120; i++) busy.shop.crew.update(1 / 60, 0, undefined);
    expect(busy.shop.crew.speed).toBeCloseTo(SERVER_WALK_SPEED, 1);
  });

  it('入口の行列だけでは加速せず、入店した客を数える', () => {
    const { shop } = setup();
    shop.seats[0] = guest(0); shop.seats[1] = guest(1);
    shop.queue = Array.from({ length: 6 }, (_, i) => guest(i + 2));
    // 係の歩く速さは、席に着いた客（2人）だけで決まる
    shop.crew.update(.5, shop.seats.filter((g) => g !== null).length, undefined);
    expect(shop.crew.speed).toBe(SERVER_WALK_SPEED);
  });

  it('夜の８件同時完成を失わず配膳する', () => {
    const result = nightDeliveryTime();
    expect(result.delivered).toBe(8);
    expect(result.score).toBe(8);
    expect(result.seconds).toBeLessThan(9.5);
    console.log('夜８件の配膳秒数', result.seconds);
  });
});
