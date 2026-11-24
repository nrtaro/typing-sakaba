// 繁盛記：皿の上の判子の並びと、×10以上の皿の式の帯
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { ShopView, formulaText, sealOrder } from '../src/ui/shopView';
import { Shop, type ServeEvent } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DIFFICULTIES, DISHES } from '../src/core/shopConfig';
import { NORMAL_RULES } from '../src/core/daily';
import { modsFor } from '../src/core/build';

const dish = DISHES.find((d) => d.id === 'fishFry')!;
const serve = (over: Partial<ServeEvent>): ServeEvent => ({ type: 'serve', seat: 0, gain: 0, combo: 1, tags: [], chain: 0, dish, base: 230, raw: 1, paid: 1, capped: false, factors: [], ...over });

describe('判子の並び', () => {
  it('倍率の大きい順。全部の皿に効く方針と、倍率のないタグは後ろ', () => {
    const ev = serve({ tags: ['matome', 'nushi', 'yoyaku', 'ippatsu'], factors: [{ id: 'nushi', mult: 1.8 }, { id: 'yoyaku', mult: 1.6 }, { id: 'ippatsu', mult: 2.0 }, { id: 'combo', mult: 2 }] });
    expect(sealOrder(ev)).toEqual(['ippatsu', 'nushi', 'matome', 'yoyaku']);
    const all = serve({ tags: ['tsuyoki', 'mie'], factors: [{ id: 'tsuyoki', mult: 1.5 }, { id: 'mie', mult: 1.2 }] });
    expect(sealOrder(all)).toEqual(['mie', 'tsuyoki']);
  });
});

describe('式の帯', () => {
  it('設計書の例の形で、掛けた順に並べる', () => {
    const factors = [{ id: 'nushi', mult: 2.2 }, { id: 'tairyo', mult: 1.8 }, { id: 'ippatsu', mult: 2.0 }, { id: 'combo', mult: 3 }] as ServeEvent['factors'];
    expect(formulaText(serve({ factors, gain: 5465, paid: 23.76 }))).toBe('天ぷら盛り 230円 → ヌシ×2.2 → 大漁×1.8 → 一発×2 → コンボ×3 = 5,465円');
    const capped = formulaText(serve({ factors: [{ id: 'mie', mult: 3.5 }, { id: 'oomori', mult: 3.3 }, { id: 'combo', mult: 3 }], gain: 6900, paid: 30, capped: true }));
    expect(capped).toContain('= 上限×30 6,900円');
    expect(formulaText(serve({ factors: [{ id: 'yoippari', mult: 0.9 }, { id: 'hiden', mult: 2 }, { id: 'combo', mult: 1 }], gain: 414 }))).toBe('天ぷら盛り 230円 → 宵×0.9 → 秘伝×2 → コンボ×1 = 414円');
  });

  it('×10以上の打った皿だけ、式を帯に入れる', () => {
    const v = new ShopView();
    v.run = { day: 0, loop: 1, goal: 9000, owned: [], fired: {}, count: {}, passedAt: -1 } as never;
    const s = new Shop(new Rng(1), DIFFICULTIES[1], NORMAL_RULES, modsFor([]));
    v.handle(serve({ paid: 9.9, gain: 2277, factors: [{ id: 'combo', mult: 2 }] }), s);
    expect(v.formula).toBeNull();
    v.handle(serve({ paid: 10, gain: 2300, factors: [{ id: 'combo', mult: 2 }] }), s);
    expect(v.formula?.text).toContain('= 2,300円');
  });
});
