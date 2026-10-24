import { describe, expect, it } from 'vitest';
import { FishingGame, GatheringGame, HuntingGame, TradingGame } from '../src/core/minigames';
import { procurementReward, rewardKeys } from '../src/core/procurementRewards';
import { defaultRomaji } from '../src/core/romaji';
import { Rng } from '../src/core/rng';
import { TRIPS } from '../src/core/shopConfig';

describe('文字数に応じた調達報酬', () => {
  it.each(TRIPS.map(t => t.id))('%s：長い語ほど報酬が下がらず、短い語より多くなる', kind => {
    for (const big of [false, true]) {
      expect(procurementReward(kind, 0, big)).toBe(0);
      for (let keys = 1; keys < 40; keys++) {
        expect(procurementReward(kind, keys, big)).toBeGreaterThanOrEqual(procurementReward(kind, keys - 1, big));
      }
      expect(procurementReward(kind, 12, big)).toBeGreaterThan(procurementReward(kind, 4, big));
    }
  });

  it('採取：短い「かぶ」は2個、長い「ほうれんそう」は5個。かごと獲得通知も一致する', () => {
    const g = new GatheringGame(new Rng(1));
    for (const [kana, expected] of [['かぶ', 2], ['ほうれんそう', 5]] as const) {
      const before = g.gains.veg ?? 0;
      g.sprouts = [{ id: kana, word: { text: kana, kana }, ing: 'veg', slot: 0, life: 5, maxLife: 5 }];
      for (const key of defaultRomaji(kana)) g.key(key);
      expect(g.gains.veg! - before).toBe(expected);
      expect(g.basket.length).toBe(g.gains.veg);
      expect(g.drainEvents().filter(e => e.type === 'gain')).toEqual([
        { type: 'gain', ingredient: 'veg', amount: expected, x: 0, y: 0 },
      ]);
    }
  });

  it('別綴り・ミス・打ち直しで獲得量は変わらない', () => {
    const gains = ['shiitake', 'siitake', 'shiq\biitake'].map(spelling => {
      const g = new GatheringGame(new Rng(1));
      g.sprouts = [{ id: 'a', word: { text: 'しいたけ', kana: 'しいたけ' }, ing: 'mush', slot: 0, life: 5, maxLife: 5 }];
      for (const key of spelling) {
        if (key === '\b') g.input.backspace();
        else g.key(key);
      }
      return g.gains.mush;
    });
    expect(gains).toEqual([4, 4, 4]);
  });

  it.each([false, true])('釣り：合図＋巻き上げを合算し、釣り上げたときだけ獲得（大物=%s）', big => {
    const g = new FishingGame(new Rng(2));
    g.fishIndex = big ? 1 : 0;
    while (g.phase !== 'hook') g.update(.1);
    let keys = 0;
    const words = big ? ['いま', 'まけ', 'ねばれ', 'ひけ'] : ['いま', 'ねばれ'];
    for (const [i, kana] of words.entries()) {
      g.word = { text: kana, kana };
      keys += rewardKeys(kana);
      for (const key of defaultRomaji(kana)) g.key(key);
      if (i < words.length - 1) expect(g.gains.fish ?? 0).toBe(0);
    }
    expect(g.gains.fish).toBe(procurementReward('fishing', keys, big));
    expect(g.phase).toBe('land');
  });

  it('釣り：糸切れ前の入力分を、次の魚の報酬に持ち越さない', () => {
    const g = new FishingGame(new Rng(2));
    g.fishIndex = 1;
    while (g.phase !== 'hook') g.update(.1);
    for (const key of defaultRomaji(g.word!.kana)) g.key(key);
    for (const key of defaultRomaji(g.word!.kana)) g.key(key);
    for (let i = 0; i < 3; i++) g.key('q');
    expect(g.gains.fish ?? 0).toBe(0);
    while (g.phase !== 'hook') g.update(.1);
    let keys = 0;
    for (let i = 0; i < 2; i++) {
      keys += rewardKeys(g.word!.kana);
      for (const key of defaultRomaji(g.word!.kana)) g.key(key);
    }
    expect(g.gains.fish).toBe(procurementReward('fishing', keys));
  });

  it('狩り：大物の3語を合算し、未撃破の獲物と混ぜない', () => {
    const g = new HuntingGame(new Rng(3));
    g.prey = [
      { id: 'a', kind: 'deer', x: .7, lane: .95, band: 2, speed: 0, hp: 3, maxHp: 3, word: { text: '砂', kana: 'すな' }, flash: 0 },
      { id: 'b', kind: 'rabbit', x: .8, lane: 0, band: 0, speed: 0, hp: 1, maxHp: 1, word: { text: '双眼鏡', kana: 'そうがんきょう' }, flash: 0 },
    ];
    const deer = g.prey[0];
    for (const key of defaultRomaji('すな')) g.key(key);
    expect(g.gains.meat ?? 0).toBe(0);
    const rabbitKeys = rewardKeys(g.prey[1].word.kana);
    for (const key of defaultRomaji(g.prey[1].word.kana)) g.key(key);
    const rabbitReward = procurementReward('hunting', rabbitKeys);
    expect(g.gains.meat).toBe(rabbitReward);
    for (let i = 0; i < 2; i++) for (const key of defaultRomaji(deer.word.kana)) g.key(key);
    expect(g.gains.meat).toBe(rabbitReward + procurementReward('hunting', deer.rewardKeys!, true));
    expect(g.prey).toHaveLength(0);
  });

  it('仕入れ：短い品物2箱、長い品物3箱に、ノーミス1箱を追加', () => {
    for (const [kana, base] of [['くみん', 2], ['ろーずまりー', 3]] as const) {
      for (const miss of [false, true]) {
        const g = new TradingGame(new Rng(4));
        g.lot.word = { text: kana, kana };
        if (miss) g.key('q');
        for (const key of defaultRomaji(kana)) g.key(key);
        expect(g.gains.ale).toBe(base + (miss ? 0 : 1));
      }
    }
  });
});
