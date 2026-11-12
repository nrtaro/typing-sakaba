import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { Game } from '../src/ui/game';
import { PlaySession, TICK } from '../src/core/session';
import { NORMAL_RULES } from '../src/core/daily';
import { Rng } from '../src/core/rng';
import { createMinigame, FishingGame } from '../src/core/minigames';
import { DIFFICULTIES, SHOP, TRIPS } from '../src/core/shopConfig';
import { defaultRomaji } from '../src/core/romaji';

function setup(trip = TRIPS[0]) {
  const session = new PlaySession(1, DIFFICULTIES[1], NORMAL_RULES);
  for (const key of defaultRomaji(trip.kana)) session.input(key);
  session.drain();
  const mini = createMinigame(trip.id, new Rng(2));
  session.trip = { game: mini, phase: 'game', t: 0 };
  // 描画・RAFを起動せず、実際のキー処理と帰還処理を実行する。
  const game = Object.assign(Object.create(Game.prototype) as Game, {
    mode: 'play', paused: false, artState: 'ready', session, menu: { reset: vi.fn() },
    sound: new Proxy({}, { get: () => vi.fn() }),
    settings: { muted: false, volume: 3 },
    view: { update: vi.fn(), handle: vi.fn() }, tripView: { art: null, update: vi.fn(), handle: vi.fn() },
  });
  return { game: game as Game, session, shop: session.shop, mini };
}
function enter(game: Game, repeat = false) {
  const preventDefault = vi.fn();
  game['onKey']({ key: 'Enter', repeat, preventDefault } as unknown as KeyboardEvent);
  return preventDefault;
}
/** 決まった秒数だけ、1/60秒刻みで進める */
function advance(session: PlaySession, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / TICK); i++) { session.tick(); session.drain(); }
}

describe('Enterで調達を切り上げる', () => {
  it('出発演出の最後の刻みでも、画像が届くまで調達画面へ移らない', () => {
    const { game, session, shop } = setup();
    game.settings.guided = true;
    game.countdown = 0;
    session.trip!.phase = 'intro';
    session.trip!.t = TICK / 2;
    const hasTrip = vi.fn(() => false);
    game.tripView = { art: { hasTrip }, update: vi.fn(), handle: vi.fn() } as unknown as Game['tripView'];
    game.step(TICK);
    expect(game.trip!.phase).toBe('intro');
    expect(session.ticks).toBe(0);
    expect(shop.clock).toBe(0);
    hasTrip.mockReturnValue(true);
    game.step(TICK);
    expect(game.trip!.phase).toBe('game');
    expect(session.ticks).toBe(1);
  });

  it('背景が届いても専用画像が揃うまでは営業時計を止め、出発演出から先へ進めない', () => {
    const { game, shop, session } = setup();
    game.settings.guided = true;
    game.countdown = 0;
    session.trip!.phase = 'intro'; session.trip!.t = 0;
    const hasTrip = vi.fn(() => false);
    game.tripView = { art: { hasTrip }, update: vi.fn(), handle: vi.fn() } as unknown as Game['tripView'];
    game.step(TICK);
    game.step(TICK);
    expect(shop.clock).toBe(0);
    expect(session.ticks).toBe(0);
    expect(game.view.update).not.toHaveBeenCalled();
    expect(game.trip!.phase).toBe('intro');
    hasTrip.mockReturnValue(true);
    game.step(TICK);
    expect(game.trip!.phase).toBe('game');
    expect(session.ticks).toBe(1);
  });

  it.each(TRIPS.map(trip => [trip.id, trip] as const))('%s：獲得素材・打鍵記録を一度だけ持ち帰る', (_id, trip) => {
    const { game, shop, mini, session } = setup(trip);
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
    advance(session, SHOP.tripIntro + .01);
    expect(game.trip).toBeNull(); expect(shop.away).toBeNull();
    for (const id of trip.gives) expect(shop.stock[id]).toBe(before[id] + 2);
    expect(shop.stats.correctKeys).toBe(keys + 7);
    expect(shop.stats.missKeys).toBe(1);
    enter(game);
    expect(shop.stats.correctKeys).toBe(keys + 7);
    // 帰還の記録は1回だけ（Enter を何度押しても増えない）
    expect(session.record.match(/E/g)).toHaveLength(1);
  });

  it.each(TRIPS)('$id：何も獲得せず即帰還しても素材を増やさない', trip => {
    const { game, shop, session } = setup(trip), before = { ...shop.stock };
    enter(game); advance(session, SHOP.tripIntro + .01);
    expect(shop.stock).toEqual(before);
  });

  it.each(TRIPS)('$id：時間満了では従来の最低持ち帰り保証を維持する', trip => {
    const { game, shop, mini, session } = setup(trip), before = { ...shop.stock };
    mini.timeLeft = 0;
    session.tick();
    expect(game.trip?.earlyReturn).toBe(false);
    advance(session, SHOP.tripIntro + .01);
    for (const id of trip.gives) expect(shop.stock[id]).toBe(before[id] + trip.minimum[id]!);
  });

  it('釣りの大物との勝負中でも帰還でき、未獲得の大物は加算しない', () => {
    const { game, shop, mini, session } = setup(), before = { ...shop.stock };
    const fish = mini as FishingGame;
    fish.big = true; fish.phase = 'reel'; fish.wordsLeft = 2; fish.timeLeft = 0;
    expect(fish.finished).toBe(false);
    enter(game); advance(session, SHOP.tripIntro + .01);
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
