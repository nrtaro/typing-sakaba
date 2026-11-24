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
  it('大入り袋か景気づけを持っていれば、上にある方の判子に「あと○」を出す', async () => {
    const { tenLeft } = await import('../src/ui/shopView');
    expect(tenLeft([{ id: 'ippatsu', lv: 1 }], 3)).toBeNull();
    expect(tenLeft([{ id: 'ippatsu', lv: 1 }, { id: 'keiki', lv: 2 }, { id: 'ooiri', lv: 1 }], 3)).toEqual({ index: 1, text: 'あと7' });
    expect(tenLeft([{ id: 'ooiri', lv: 1 }], 0)).toEqual({ index: 0, text: 'あと10' });
  });
});
