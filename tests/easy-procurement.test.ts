import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { createMinigame, FishingGame, GatheringGame, HuntingGame, TradingGame } from '../src/core/minigames';
import { procurementReward, rewardKeys } from '../src/core/procurementRewards';
import { defaultRomaji } from '../src/core/romaji';
import { Rng } from '../src/core/rng';
import { difficultyOf, TRIPS } from '../src/core/shopConfig';
import { PlaySession } from '../src/core/session';
import { NORMAL_RULES } from '../src/core/daily';

const easy = difficultyOf('easy');

describe('やさしいの調達', () => {
  it.each(TRIPS.map(t => t.id))('%s：15秒かけて調達でき、通常・難しいは10秒', id => {
    for (const [difficulty, seconds] of [['easy', 15], ['normal', 10], ['hard', 10]] as const) {
      const game = createMinigame(id, new Rng(1), difficultyOf(difficulty));
      expect(game.duration).toBe(seconds);
      expect(game.timeLeft).toBe(seconds);
    }
  });

  it.each(['easy', 'normal', 'hard'] as const)('%s：調達中の店の時計と調達時間が正しい速度で進む', id => {
    const session = new PlaySession(1, difficultyOf(id), NORMAL_RULES);
    const mini = createMinigame('gathering', new Rng(2), difficultyOf(id));
    session.shop.away = TRIPS.find(t => t.id === 'gathering')!;
    session.trip = { game: mini, phase: 'game', t: 0 };
    for (let i = 0; i < 60; i++) session.tick();
    expect(session.shop.clock).toBeCloseTo(id === 'easy' ? 2 / 3 : 1);
    expect(mini.timeLeft).toBeCloseTo((id === 'easy' ? 15 : 10) - 1);
    expect(session.elapsed).toBeCloseTo(1);
  });

  it('短いテキストでも以前より素材が多い', () => {
    expect(procurementReward('gathering', 4, false, 'easy')).toBeGreaterThan(4);
    expect(procurementReward('gathering', 4, false, 'normal')).toBe(3);
    expect(procurementReward('gathering', 4, false, 'hard')).toBe(2);
  });

  it.each(['easy', 'normal', 'hard'] as const)('%s：狩りの大物は指定された発数で捕獲し、途中では報酬が出ない', id => {
    const game = new HuntingGame(new Rng(3), difficultyOf(id));
    for (let i = 0; i < 100 && !game.prey.some(p => p.kind === 'deer'); i++) game.update(.1);
    const deer = game.prey.find(p => p.kind === 'deer')!;
    expect(deer).toBeDefined();
    const shots = id === 'hard' ? 3 : 2;
    expect(deer.hp).toBe(shots);
    expect(deer.maxHp).toBe(shots);
    game.prey = [deer];
    for (let i = 0; i < shots; i++) {
      deer.word = { text: '砂', kana: 'すな' };
      for (const key of defaultRomaji(deer.word.kana)) game.key(key);
      if (i < shots - 1) { expect(game.gains.meat ?? 0).toBe(0); expect(game.prey).toContain(deer); }
    }
    expect(game.prey).not.toContain(deer);
    expect(game.gains.meat).toBe(procurementReward('hunting', rewardKeys('すな') * shots, true, id));
    if (id !== 'hard') {
      const oldBase = Math.round(rewardKeys('すな') * 3 * .55);
      const oldReward = oldBase + (id === 'easy' ? Math.max(3, Math.round(oldBase * .8)) : Math.max(1, Math.round(oldBase * .25)));
      expect(game.gains.meat).toBeGreaterThanOrEqual(oldReward);
    }
  });

  it('店の時計が遅い分を含む実プレイ時間から、打鍵／秒を算出する', () => {
    const session = new PlaySession(1, easy, NORMAL_RULES);
    session.shop.stats.correctKeys = 420;
    session.ticks = 210 * 60;
    expect(session.summary().kps).toBeCloseTo(2);
  });

  it('狩り・採取・仕入れは、やさしいで長すぎる言葉を出さない', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const hunt = new HuntingGame(new Rng(seed), easy);
      const gather = new GatheringGame(new Rng(seed), easy);
      const trade = new TradingGame(new Rng(seed), easy);
      for (let i = 0; i < 30; i++) {
        hunt.update(.2); gather.update(.2); trade.update(.2);
        for (const p of hunt.prey) expect(defaultRomaji(p.word.kana).length).toBeLessThanOrEqual(7);
        for (const s of gather.sprouts.filter(s => s.ing)) expect(defaultRomaji(s.word.kana).length).toBeLessThanOrEqual(7);
        expect(defaultRomaji(trade.lot.word.kana).length).toBeLessThanOrEqual(7);
      }
    }
  });

  it('釣りのあわせは、やさしいでは5秒以上待ってくれる', () => {
    expect(new FishingGame(new Rng(1), easy).hookWindow).toBeGreaterThanOrEqual(5);
  });
});
