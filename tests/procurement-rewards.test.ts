import { describe, expect, it } from 'vitest';
import { FishingGame, GatheringGame, HuntingGame, TradingGame } from '../src/core/minigames';
import { procurementReward, rewardKeys } from '../src/core/procurementRewards';
import { defaultRomaji } from '../src/core/romaji';
import { Rng } from '../src/core/rng';
import { difficultyOf, TRIPS } from '../src/core/shopConfig';

describe('文字数に応じた調達報酬', () => {
  it.each(TRIPS.map(t => t.id))('%s：むずかしいは従来の報酬を維持し、ふつう・やさしいで段階的に増える', kind => {
    for (const big of [false, true]) {
      for (let keys = 0; keys <= 100; keys++) {
        const rate = kind === 'fishing' ? (big ? .5 : .45)
          : kind === 'hunting' ? (big ? .55 : .45) : kind === 'gathering' ? .5 : .36;
        const old = keys ? Math.max(1, Math.round(keys * rate)) : 0;
        const hard = procurementReward(kind, keys, big, 'hard');
        const normal = procurementReward(kind, keys, big, 'normal');
        const easy = procurementReward(kind, keys, big, 'easy');
        expect(hard).toBe(old);
        if (!keys) { expect(normal).toBe(0); expect(easy).toBe(0); continue; }
        expect(normal).toBeGreaterThan(hard);
        expect(easy).toBeGreaterThan(normal);
        // 2発で仕留める場合は入力した2語を3語相当に補正する。
        expect(normal).toBeLessThanOrEqual(hard * (kind === 'hunting' && big ? 1.875 : 1.25) + (kind === 'hunting' && big ? 3 : 1));
        expect(easy).toBeLessThanOrEqual(hard * (kind === 'hunting' && big ? 2.7 : 1.8) + (kind === 'hunting' && big ? 4 : 3));
      }
    }
  });

  it.each(['hard', 'normal', 'easy'] as const)('%s：4種の調達で難易度別の報酬を実際に獲得する', id => {
    const difficulty = difficultyOf(id);
    const small = { hard: 2, normal: 3, easy: 5 }[id];
    const fish = new FishingGame(new Rng(1), difficulty);
    fish.update(.5);
    let keys = 0;
    for (const kana of ['いま', 'ねばれ']) {
      fish.word = { text: kana, kana }; keys += rewardKeys(kana);
      for (const key of defaultRomaji(kana)) fish.key(key);
    }
    expect(fish.gains.fish).toBe(procurementReward('fishing', keys, false, id));

    const hunt = new HuntingGame(new Rng(1), difficulty);
    hunt.prey = [{ id: 'a', kind: 'rabbit', x: .7, lane: 0, band: 0, speed: 0,
      hp: 1, maxHp: 1, word: { text: '砂', kana: 'すな' }, flash: 0 }];
    for (const key of defaultRomaji('すな')) hunt.key(key);
    expect(hunt.gains.meat).toBe(small);

    const gather = new GatheringGame(new Rng(1), difficulty);
    gather.sprouts = [{ id: 'a', word: { text: 'かぶ', kana: 'かぶ' }, ing: 'veg', slot: 0, life: 5, maxLife: 5 }];
    for (const key of defaultRomaji('かぶ')) gather.key(key);
    expect(gather.gains.veg).toBe(small);
    expect(gather.basket).toHaveLength(small);

    for (const missed of [false, true]) {
      const trade = new TradingGame(new Rng(1), difficulty);
      trade.lot.word = { text: 'クミン', kana: 'くみん' };
      if (missed) trade.key('q');
      for (const key of defaultRomaji('くみん')) trade.key(key);
      expect(trade.gains.ale).toBe(small + (missed ? 0 : 1));
    }
  });

  it.each(['hard', 'normal', 'easy'] as const)('%s：大物は捕獲完了まで報酬なしで、合算報酬に一度だけ加算する', id => {
    const difficulty = difficultyOf(id);
    const fish = new FishingGame(new Rng(1), difficulty);
    fish.fishIndex = 1;
    fish.update(.5);
    let keys = 0;
    for (const [i, kana] of ['いま', 'まけ', 'ねばれ', 'ひけ'].entries()) {
      fish.word = { text: kana, kana }; keys += rewardKeys(kana);
      for (const key of defaultRomaji(kana)) fish.key(key);
      if (i < 3) expect(fish.gains.fish ?? 0).toBe(0);
    }
    expect(fish.gains.fish).toBe(procurementReward('fishing', keys, true, id));

    const hunt = new HuntingGame(new Rng(1), difficulty);
    const shots = id === 'hard' ? 3 : 2;
    const prey = { id: 'a', kind: 'deer' as const, x: .7, lane: 0, band: 0, speed: 0,
      hp: shots, maxHp: shots, word: { text: '砂', kana: 'すな' }, flash: 0 };
    hunt.prey = [prey];
    for (let i = 0; i < shots; i++) {
      prey.word = { text: '砂', kana: 'すな' };
      for (const key of defaultRomaji('すな')) hunt.key(key);
      if (i < shots - 1) expect(hunt.gains.meat ?? 0).toBe(0);
    }
    expect(hunt.gains.meat).toBe(procurementReward('hunting', rewardKeys('すな') * shots, true, id));
  });

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
    const g = new GatheringGame(new Rng(1), difficultyOf('hard'));
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
      const g = new GatheringGame(new Rng(1), difficultyOf('hard'));
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
    const g = new FishingGame(new Rng(2), difficultyOf('hard'));
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
    const g = new FishingGame(new Rng(2), difficultyOf('hard'));
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
    const g = new HuntingGame(new Rng(3), difficultyOf('hard'));
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

  it('仕入れ：短い品物2箱、長い品物4箱に、ノーミス1箱を追加', () => {
    for (const [kana, base] of [['くみん', 2], ['ろーずまりー', 4]] as const) {
      for (const miss of [false, true]) {
        const g = new TradingGame(new Rng(4), difficultyOf('hard'));
        g.lot.word = { text: kana, kana };
        if (miss) g.key('q');
        for (const key of defaultRomaji(kana)) g.key(key);
        expect(g.gains.ale).toBe(base + (miss ? 0 : 1));
      }
    }
  });
});
