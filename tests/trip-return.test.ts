import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { Game } from '../src/ui/game';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { createMinigame, FishingGame } from '../src/core/minigames';
import { SHOP, TRIPS } from '../src/core/shopConfig';
import { defaultRomaji } from '../src/core/romaji';

function setup(trip = TRIPS[0]) {
  const shop = new Shop(new Rng(1));
  for (const key of defaultRomaji(trip.kana)) shop.key(key);
  shop.drainEvents();
  const mini = createMinigame(trip.id, new Rng(2));
  // 描画・RAFを起動せず、実際のキー処理と帰還処理を実行する。
  const game = Object.assign(Object.create(Game.prototype) as Game, {
    mode: 'play', paused: false, artState: 'ready', shop, menu: { reset: vi.fn() },
    trip: { game: mini, phase: 'game', t: 0 },
    sound: new Proxy({}, { get: () => vi.fn() }),
    settings: { muted: false, volume: 3 },
  });
  return { game, shop, mini };
}
function enter(game: Game, repeat = false) {
  const preventDefault = vi.fn();
  game['onKey']({ key: 'Enter', repeat, preventDefault } as unknown as KeyboardEvent);
  return preventDefault;
}

describe('Enterで調達を切り上げる', () => {
  it.each(TRIPS.map(trip => [trip.id, trip] as const))('%s：獲得素材・打鍵記録を一度だけ持ち帰る', (_id, trip) => {
    const { game, shop, mini } = setup(trip);
    const before = { ...shop.stock }, keys = shop.stats.correctKeys;
    mini.gains = Object.fromEntries(trip.gives.map(id => [id, 2]));
    mini.correctKeys = 7; mini.missKeys = 1;
    expect(enter(game)).toHaveBeenCalledOnce();
    expect(game.trip?.phase).toBe('outro');
    expect(game.trip?.earlyReturn).toBe(true);
    expect(shop.away?.id).toBe(trip.id);
    const timer = game.trip!.t;
    enter(game); enter(game, true);
    expect(game.trip!.t).toBe(timer);
    game['stepTrip'](SHOP.tripIntro + .01);
    expect(game.trip).toBeNull(); expect(shop.away).toBeNull();
    for (const id of trip.gives) expect(shop.stock[id]).toBe(before[id] + 2);
    expect(shop.stats.correctKeys).toBe(keys + 7);
    expect(shop.stats.missKeys).toBe(1);
    enter(game);
    expect(shop.stats.correctKeys).toBe(keys + 7);
    expect(shop.drainEvents().filter(e => e.type === 'tripEnd')).toHaveLength(1);
  });

  it.each(TRIPS)('$id：何も獲得せず即帰還しても素材を増やさない', trip => {
    const { game, shop } = setup(trip), before = { ...shop.stock };
    enter(game); game['stepTrip'](SHOP.tripIntro + .01);
    expect(shop.stock).toEqual(before);
  });

  it.each(TRIPS)('$id：時間満了では従来の最低持ち帰り保証を維持する', trip => {
    const { game, shop, mini } = setup(trip), before = { ...shop.stock };
    mini.timeLeft = 0;
    game['stepTrip'](.01);
    expect(game.trip?.earlyReturn).toBe(false);
    game['stepTrip'](SHOP.tripIntro + .01);
    for (const id of trip.gives) expect(shop.stock[id]).toBe(before[id] + trip.minimum[id]!);
  });

  it('釣りの大物との勝負中でも帰還でき、未獲得の大物は加算しない', () => {
    const { game, shop, mini } = setup(), before = { ...shop.stock };
    const fish = mini as FishingGame;
    fish.big = true; fish.phase = 'reel'; fish.wordsLeft = 2; fish.timeLeft = 0;
    expect(fish.finished).toBe(false);
    enter(game); game['stepTrip'](SHOP.tripIntro + .01);
    expect(game.trip).toBeNull(); expect(shop.stock).toEqual(before);
  });

  it('一時停止中のEnterは再開になり、途中帰還にはならない', () => {
    const { game } = setup(); game.paused = true;
    enter(game);
    expect(game.paused).toBe(false);
    expect(game.trip?.phase).toBe('game');
  });

  it('Enter長押しや出発演出中のEnterは帰還を始めない', () => {
    const { game } = setup(); enter(game, true);
    expect(game.trip?.phase).toBe('game');
    game.trip!.phase = 'intro'; enter(game);
    expect(game.trip?.phase).toBe('intro');
  });
});
