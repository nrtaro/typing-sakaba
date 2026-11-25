// 繁盛記：知らせの順番待ち（同じ瞬間に来た知らせが消えずに順に出る）
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { ShopView, BANNER_QUEUE } from '../src/ui/shopView';
import { Shop, type ShopEvent } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DIFFICULTIES } from '../src/core/shopConfig';
import { NORMAL_RULES } from '../src/core/daily';
import { modsFor } from '../src/core/build';

const runView = () => {
  const view = new ShopView();
  view.run = { day: 0, loop: 1, goal: 9000, owned: [], fired: {}, count: {}, passedAt: -1 } as never;
  return view;
};
const shop = () => new Shop(new Rng(1), DIFFICULTIES[1], NORMAL_RULES, modsFor([]));
const fever: ShopEvent = { type: 'fever', on: true, secs: 8 };
const keiki: ShopEvent = { type: 'keiki', items: [{ id: 'fish', n: 4 }, { id: 'spice', n: 4 }] };

describe('知らせの順番待ち', () => {
  it('同じ瞬間の知らせは消えずに順に出る', () => {
    const v = runView();
    const s = shop();
    v.handle(fever, s);
    v.handle(keiki, s);
    v.handle({ type: 'extend', secs: 15 }, s);
    expect(v.banner?.text).toContain('大入り');
    expect(v.bannerQueue.map((b) => b.text)).toEqual([expect.stringContaining('景気づけ'), expect.stringContaining('延長')]);
    for (let i = 0; i < 120 && v.banner?.text.includes('大入り'); i++) v.update(1 / 60, s);
    expect(v.banner?.text).toContain('景気づけ！ 魚+4 香辛料+4');
  });

  it('待っている知らせが多すぎたら、古いものから捨てる', () => {
    const v = runView();
    const s = shop();
    v.handle(fever, s);
    for (let i = 1; i <= 5; i++) v.handle({ type: 'extend', secs: i }, s);
    expect(v.bannerQueue).toHaveLength(BANNER_QUEUE);
    expect(v.bannerQueue.map((b) => b.text)).toEqual([3, 4, 5].map((n) => expect.stringContaining(`+${n}秒`)));
  });

  it('時間帯の知らせは、すぐ先頭に出る', () => {
    const v = runView();
    const s = shop();
    v.handle(fever, s);
    v.handle({ type: 'phase', index: 1 }, s);
    expect(v.banner?.text).toContain('昼');
  });

  it('通常営業は今どおり上書きする', () => {
    const v = new ShopView();
    const s = shop();
    v.handle({ type: 'extend', secs: 15 }, s);
    v.handle({ type: 'phase', index: 1 }, s);
    expect(v.banner?.text).toContain('昼');
    expect(v.bannerQueue).toHaveLength(0);
  });
});

describe('次の10皿までの残り', () => {
  it('大入り袋は10皿、景気づけは5皿までの残りを、それぞれの判子の横に出す', async () => {
    const { tenLeft } = await import('../src/ui/shopView');
    expect(tenLeft([{ id: 'ippatsu', lv: 1 }], { fever: 3, keiki: 1 })).toEqual([]);
    expect(tenLeft([{ id: 'ippatsu', lv: 1 }, { id: 'keiki', lv: 2 }, { id: 'ooiri', lv: 1 }], { fever: 3, keiki: 1 })).toEqual([{ index: 1, text: 'あと4' }, { index: 2, text: 'あと7' }]);
    expect(tenLeft([{ id: 'ooiri', lv: 1 }], { fever: 0, keiki: 0 })).toEqual([{ index: 0, text: 'あと10' }]);
  });
});

describe('急ぎの知らせ', () => {
  it('急ぎの知らせは先に出し、出していた知らせは待ち行列の先頭に戻す', () => {
    const v = runView();
    const s = shop();
    v.handle(fever, s);
    v.say({ text: 'ラストスパート！ 閉店まで10秒', t: 1.8, col: '#fff' }, true);
    expect(v.banner?.text).toContain('ラストスパート');
    expect(v.bannerQueue[0].text).toContain('大入り');
  });
});

it('景気づけの倍率が付いているあいだは、「あと○」に倍率も出す', async () => {
  const { tenLeft } = await import('../src/ui/shopView');
  expect(tenLeft([{ id: 'keiki', lv: 3 }], { fever: 0, keiki: 2, keikiMult: 1.8 })).toEqual([{ index: 0, text: '×1.8 あと3' }]);
  expect(tenLeft([{ id: 'keiki', lv: 3 }], { fever: 0, keiki: 2 })).toEqual([{ index: 0, text: 'あと3' }]);
});

it('繁盛記の知らせは、上の帯の行に出す（左の判子の列にかからない）', async () => {
  const { RUN_BANNER_Y } = await import('../src/ui/shopView');
  // 上の帯の行（目標の帯と同じ y=28〜41）。判子の列は y=45 から下
  expect(RUN_BANNER_Y).toBe(28);
});
