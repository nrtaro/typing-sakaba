// 段階6：飾りの一覧（156個）
import { describe, expect, it } from 'vitest';
import { ACHIEVEMENTS } from '../src/core/achievements';
import { ITEMS, LINKS, SERIES, achievementItem, itemById, type Kind, type Star } from '../src/core/collection';

const gachaStars = (kind: Kind) => {
  const n: Record<Star, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  for (const it of ITEMS) if (it.kind === kind && it.source === 'gacha') n[it.star]++;
  return [n[1], n[2], n[3], n[4], n[5]];
};
const achCount = (kind: Kind) => ITEMS.filter((it) => it.kind === kind && it.source !== 'gacha').length;

describe('飾りの一覧', () => {
  it('ID は重ならず、小文字英数とハイフンだけ', () => {
    expect(new Set(ITEMS.map((i) => i.id)).size).toBe(ITEMS.length);
    for (const it of ITEMS) expect(it.id).toMatch(/^[a-z0-9-]+$/);
    expect(itemById(ITEMS[0].id)).toBe(ITEMS[0]);
    expect(itemById('nope')).toBeUndefined();
  });

  it('つなぎは最初の6つを含む', () => {
    expect(LINKS.slice(0, 6).map((l) => l.text)).toEqual(['な', 'の', '', 'のような', 'みたいな', 'という']);
    expect(LINKS[0].id).toBe('na');
  });

  it('156個の内訳と☆の配分', () => {
    expect(ITEMS).toHaveLength(156);
    expect([achCount('front'), gachaStars('front')]).toEqual([6, [12, 10, 6, 4, 2]]);
    expect([achCount('back'), gachaStars('back')]).toEqual([6, [12, 10, 6, 4, 2]]);
    expect([achCount('plate'), gachaStars('plate')]).toEqual([4, [6, 5, 4, 3, 2]]);
    expect([achCount('sound'), gachaStars('sound')]).toEqual([2, [4, 4, 3, 2, 1]]);
    expect([achCount('sticker'), gachaStars('sticker')]).toEqual([8, [8, 7, 5, 4, 4]]);
  });

  it('実績26件にちょうど1つずつ', () => {
    const ach = ITEMS.filter((i) => i.source !== 'gacha');
    expect(ach).toHaveLength(26);
    for (const a of ACHIEVEMENTS) {
      expect(ach.filter((i) => typeof i.source === 'object' && i.source.achievement === a.id)).toHaveLength(1);
      expect(achievementItem(a.id)).toBeDefined();
    }
  });

  it('シールは4シリーズ×9枠、各シリーズに実績限定2枚と☆5が1枚', () => {
    expect(SERIES).toHaveLength(4);
    for (const s of SERIES) {
      const st = ITEMS.filter((i) => i.sticker?.series === s.id);
      expect(st.map((i) => i.sticker!.slot).sort()).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8]);
      expect(st.filter((i) => i.source !== 'gacha')).toHaveLength(2);
      expect(st.filter((i) => i.source === 'gacha' && i.star === 5)).toHaveLength(1);
    }
  });

  it('種類ごとに要る設定がある', () => {
    for (const it of ITEMS) {
      if (it.kind === 'plate') expect(it.plate).toBeDefined();
      if (it.kind === 'sound') expect(it.sound).toBeDefined();
      if (it.kind === 'sticker') expect(it.sticker).toBeDefined();
      expect(it.name.length).toBeGreaterThan(0);
    }
  });

  it('二つ名の言葉は6文字以内', () => {
    for (const it of ITEMS) if (it.kind === 'front' || it.kind === 'back') expect([...it.name].length).toBeLessThanOrEqual(6);
  });
});
