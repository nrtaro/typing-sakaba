// 段階6：ふくびき・交換・所持
import { describe, expect, it } from 'vitest';
import { Rng } from '../src/core/rng';
import {
  ITEMS, STAR_RATE, DUP_TICKETS, PULL_PRICE, canPull, emptyCollection, equippedTitle, exchange, itemById, owns, pull,
  readCollection, seriesComplete, setEquip, type CollectionState, type Star,
} from '../src/core/collection';

const rich = (over: Partial<CollectionState> = {}): CollectionState => ({ ...emptyCollection(), freeUsed: true, coins: 1e12, ...over });
const gachaOf = (kind: string, star: Star) => ITEMS.filter((i) => i.kind === kind && i.star === star && i.source === 'gacha');

describe('ふくびき', () => {
  it('☆の割合が確率どおり（10万回）', () => {
    const rng = new Rng(12345);
    let s = rich();
    const n: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (let i = 0; i < 100000; i++) {
      const r = pull(s, rng)!;
      s = { ...r.state, coins: 1e12 };
      n[r.star]++;
    }
    for (const star of [1, 2, 3, 4, 5] as Star[]) expect(Math.abs(n[star] / 100000 - STAR_RATE[star])).toBeLessThan(0.006);
  });

  it('☆の中では枠が同じ確率で選ばれる（二つ名は前の言葉1つが1枠）', () => {
    const rng = new Rng(7);
    const slots = ITEMS.filter((i) => i.source === 'gacha' && i.star === 1 && i.kind !== 'back');
    const count = new Map<string, number>();
    let s = rich();
    let total = 0;
    for (let i = 0; i < 200000; i++) {
      const r = pull(s, rng)!;
      s = { ...r.state, coins: 1e12, owned: {} };
      if (r.star !== 1) continue;
      total++;
      const first = r.items[0].id;
      count.set(first, (count.get(first) ?? 0) + 1);
    }
    const mean = total / slots.length;
    for (const it of slots) expect(Math.abs((count.get(it.id) ?? 0) - mean) / mean).toBeLessThan(0.15);
  });

  it('二つ名は前と後ろが同じ☆で一緒に出る', () => {
    const rng = new Rng(99);
    let s = rich();
    let seen = 0;
    for (let i = 0; i < 2000; i++) {
      const r = pull(s, rng)!;
      s = { ...r.state, coins: 1e12 };
      const first = itemById(r.items[0].id)!;
      if (first.kind === 'front') {
        seen++;
        expect(r.items).toHaveLength(2);
        const back = itemById(r.items[1].id)!;
        expect(back.kind).toBe('back');
        expect(back.star).toBe(first.star);
      } else expect(r.items).toHaveLength(1);
      for (const x of r.items) expect(itemById(x.id)!.source).toBe('gacha');
    }
    expect(seen).toBeGreaterThan(200);
  });

  it('最初の1回は無料、そのあとは8,000円ずつ', () => {
    const rng = new Rng(1);
    let s = emptyCollection();
    expect(canPull(s)).toBe(true);
    const first = pull(s, rng)!;
    s = first.state;
    expect(s.freeUsed).toBe(true);
    expect(s.coins).toBe(0);
    expect(pull({ ...s, coins: PULL_PRICE - 1 }, rng)).toBeNull();
    const paid = pull({ ...s, coins: PULL_PRICE }, rng)!;
    expect(paid.state.coins).toBe(0);
  });

  it('かぶったらおまけ札になり、所持は変わらない', () => {
    // 全部持っている状態なら必ずかぶる
    const owned = Object.fromEntries(ITEMS.filter((i) => i.source === 'gacha').map((i) => [i.id, 'x']));
    const r = pull(rich({ owned }), new Rng(3))!;
    for (const x of r.items) {
      expect(x.isNew).toBe(false);
      expect(x.tickets).toBe(DUP_TICKETS[itemById(x.id)!.star]);
    }
    expect(r.state.tickets).toBe(r.items.reduce((a, x) => a + x.tickets, 0));
    expect(Object.keys(r.state.owned)).toHaveLength(Object.keys(owned).length);
  });

  it('新しいものは NEW で所持に入る', () => {
    const r = pull(rich(), new Rng(5))!;
    for (const x of r.items) { expect(x.isNew).toBe(true); expect(x.tickets).toBe(0); expect(r.state.owned[x.id]).toBeDefined(); }
  });
});

describe('交換', () => {
  const star3 = gachaOf('plate', 3)[0];
  it('おまけ札が足りないと何も変わらない', () => {
    const s = rich({ tickets: 24 });
    const r = exchange(s, star3.id);
    expect('error' in r).toBe(true);
  });
  it('☆3は25枚で交換できる', () => {
    const r = exchange(rich({ tickets: 30 }), star3.id);
    expect('state' in r && r.state.tickets).toBe(5);
    expect('state' in r && r.state.owned[star3.id]).toBeTruthy();
  });
  it('持っているもの・実績限定・知らないIDは交換できない', () => {
    expect('error' in exchange(rich({ tickets: 999, owned: { [star3.id]: 'x' } }), star3.id)).toBe(true);
    const achItem = ITEMS.find((i) => i.source !== 'gacha')!;
    expect('error' in exchange(rich({ tickets: 999 }), achItem.id)).toBe(true);
    expect('error' in exchange(rich({ tickets: 999 }), 'nope')).toBe(true);
  });
});

describe('所持と付け替え', () => {
  const achItem = ITEMS.find((i) => i.source !== 'gacha' && i.kind === 'front')!;
  const achId = typeof achItem.source === 'object' ? achItem.source.achievement : '';
  it('実績限定は実績から持っている扱いになる', () => {
    const s = emptyCollection();
    expect(owns(s, {}, achItem.id)).toBe(false);
    expect(owns(s, { [achId]: '2026-11-07' }, achItem.id)).toBe(true);
  });

  it('持っていないものは付けられず、二つ名は前と後ろがそろったときだけ', () => {
    const front = gachaOf('front', 1)[0];
    const back = gachaOf('back', 1)[0];
    let s = setEquip(emptyCollection(), {}, { front: front.id });
    expect(s.equip.front).toBeNull();
    s = rich({ owned: { [front.id]: 'x', [back.id]: 'x' } });
    s = setEquip(s, {}, { front: front.id, link: 'no' });
    expect(equippedTitle(s.equip)).toBeNull();
    s = setEquip(s, {}, { back: back.id });
    expect(equippedTitle(s.equip)).toBe(`${front.name}の${back.name}`);
    s = setEquip(s, {}, { link: 'none' });
    expect(equippedTitle(s.equip)).toBe(`${front.name}${back.name}`);
    s = setEquip(s, {}, { link: 'zzz' });
    expect(s.equip.link).toBe('none');
  });

  it('シリーズは9枚（実績限定を含む）でそろう', () => {
    const st = ITEMS.filter((i) => i.sticker?.series === 'food');
    const unlocked: Record<string, string> = {};
    const owned: Record<string, string> = {};
    for (const i of st) {
      if (typeof i.source === 'object') unlocked[i.source.achievement] = 'x';
      else owned[i.id] = 'x';
    }
    const s = rich({ owned });
    expect(seriesComplete(s, unlocked, 'food')).toBe(true);
    const missing = st.find((i) => i.source === 'gacha')!;
    const { [missing.id]: _, ...less } = owned;
    expect(seriesComplete(rich({ owned: less }), unlocked, 'food')).toBe(false);
  });
});

describe('保存の読み取り', () => {
  it('壊れた値でも読める分を使い、一覧にない飾りは捨てる', () => {
    expect(readCollection(null)).toEqual(emptyCollection());
    expect(readCollection([1])).toEqual(emptyCollection());
    const front = gachaOf('front', 1)[0];
    const r = readCollection({ coins: '500', tickets: 3, owned: { [front.id]: 'x', gone: 'x', [ITEMS[0].id]: 5 }, equip: { front: 'gone', link: 'no', plate: front.id }, freeUsed: true, credited: ['a', 3] });
    expect(r.coins).toBe(0);
    expect(r.tickets).toBe(3);
    expect(r.owned).toEqual({ [front.id]: 'x' });
    expect(r.equip.front).toBeNull();
    expect(r.equip.link).toBe('no');
    expect(r.equip.plate).toBeNull();
    expect(r.freeUsed).toBe(true);
    expect(r.credited).toEqual(['a']);
  });
});
