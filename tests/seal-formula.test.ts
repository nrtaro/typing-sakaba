// 繁盛記：皿の上の判子の並びと、×10以上の皿の式の帯
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { CAP_COL, ShopView, formulaText, sealOrder } from '../src/ui/shopView';
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
    const capped = formulaText(serve({ factors: [{ id: 'mie', mult: 3.5 }, { id: 'oomori', mult: 3.3 }, { id: 'combo', mult: 3 }], gain: 6900, raw: 34.65, paid: 30, capped: true }));
    // 上限で止まった皿は、止まる前の倍率も見せる
    expect(capped).toContain('= ×34.65 → 上限×30 6,900円');
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

describe('結果の画面の素材の助け', () => {
  it('0のものは出さず、どれもなければ null', async () => {
    const { helpLine } = await import('../src/ui/runMode');
    expect(helpLine({ keiki: 24, prep: 15, makanai: 9 })).toBe('素材：景気づけ+24個・仕込み+15個・まかない9皿');
    expect(helpLine({ keiki: 0, prep: 30, makanai: 0 })).toBe('素材：仕込み+30個');
    expect(helpLine({ keiki: 0, prep: 0, makanai: 0 })).toBeNull();
    expect(helpLine(undefined)).toBeNull();
  });
});

it('素材の助けのいちばん長い形も、結果の画面の幅（196px、7.5px）に入る', async () => {
  const { helpLine } = await import('../src/ui/runMode');
  const w = (t: string) => [...t].reduce((s, ch) => s + (/[\x20-\x7e]/.test(ch) ? 3.75 : 7.5), 0);
  expect(w(helpLine({ keiki: 999, prep: 999, makanai: 99 })!)).toBeLessThanOrEqual(196);
});

it('倍率がたくさん重なっても、式は帯の幅（396px、6.5px）に収まる', () => {
  const ids = ['yoyaku', 'tsuyoki', 'mie', 'oomori', 'tema', 'ippatsu', 'yoippari', 'hiden', 'banquet', 'combo'] as const;
  const ev = serve({ factors: ids.map((id, i) => ({ id, mult: id === 'yoippari' ? 0.9 : 1.2 + i * 0.1 })), gain: 69000, paid: 30, capped: true });
  const text = formulaText(ev);
  const w = [...text].reduce((s, ch) => s + (/[ -~]/.test(ch) ? 3.25 : 6.5), 0);
  expect(w).toBeLessThanOrEqual(396);
  expect(text).toContain('…');
  expect(text).toContain('コンボ×');
  expect(text.endsWith('上限×30 69,000円')).toBe(true);
});

describe('第5段：見える細かい点', () => {
  it('同じ席で続けて出すと、前の皿の判子は消える', () => {
    const v = new ShopView();
    v.run = { day: 0, loop: 1, goal: 9000, owned: [], fired: {}, count: {}, passedAt: -1 } as never;
    const s = new Shop(new Rng(1), DIFFICULTIES[1], NORMAL_RULES, modsFor([]));
    const pops = () => (v as unknown as { pops: { slot?: string }[] }).pops.filter((p) => p.slot?.startsWith('tags0-'));
    v.handle(serve({ tags: ['mie', 'oomori', 'ippatsu'], factors: [{ id: 'mie', mult: 3 }, { id: 'oomori', mult: 2 }, { id: 'ippatsu', mult: 1.5 }] }), s);
    expect(pops()).toHaveLength(3);
    v.handle(serve({ tags: ['mie'], factors: [{ id: 'mie', mult: 3 }] }), s);
    expect(pops()).toHaveLength(1);
  });
});

describe('大きな倍率の皿の演出', () => {
  it('札の予告と同じ3段で、出した皿の段を決める（×3 銀・×10 金・上限）', async () => {
    const { serveTier } = await import('../src/ui/shopView');
    expect(serveTier(serve({ paid: 2.9 }))).toBe(0);
    expect(serveTier(serve({ paid: 3 }))).toBe(1);
    expect(serveTier(serve({ paid: 10 }))).toBe(2);
    expect(serveTier(serve({ paid: 30, capped: true }))).toBe(3);
    expect(serveTier(serve({ paid: 12, chain: 1 }))).toBe(0);
  });

  it('金の皿は金額が大きく金色に、上限の皿は判子「上限」が目立つ色になる', () => {
    const v = new ShopView();
    v.run = { day: 0, loop: 1, goal: 9000, owned: [], fired: {}, count: {}, passedAt: -1 } as never;
    const s = new Shop(new Rng(1), DIFFICULTIES[1], NORMAL_RULES, modsFor([]));
    const pops = () => (v as unknown as { pops: { slot?: string; text: string; col: string; scale?: number }[] }).pops;
    v.handle(serve({ paid: 1.2, gain: 280, tags: [], factors: [] }), s);
    expect(pops().find((p) => p.slot === 'income0')?.scale ?? 1).toBe(1);
    v.handle(serve({ paid: 12, gain: 2760, tags: ['mie'], factors: [{ id: 'mie', mult: 3 }] }), s);
    const gold = pops().find((p) => p.slot === 'income0')!;
    expect(gold.scale).toBeGreaterThan(1.3);
    expect(gold.col).toBe('#ffe27a');
    v.handle(serve({ paid: 30, raw: 40, capped: true, gain: 6900, tags: ['mie', 'oomori'], factors: [{ id: 'mie', mult: 3.5 }, { id: 'oomori', mult: 3.3 }] }), s);
    const cap = pops().find((p) => p.slot?.startsWith('tags0-') && p.text === '上限')!;
    expect(cap.col).toBe(CAP_COL);
  });
});

describe('遅く打つ人の救いを見せる', () => {
  it('負けた日で、予約のみもまとめ出しも持っていなければ、助言を出す', async () => {
    const { lossHint } = await import('../src/ui/runMode');
    expect(lossHint(true, [])).toBeNull();
    expect(lossHint(false, [{ id: 'yoyaku', lv: 1 }])).toBeNull();
    expect(lossHint(false, [{ id: 'ippatsu', lv: 1 }])).toContain('予約のみ');
    expect(lossHint(false, [])).toContain('まとめ出し');
  });

  it('予約のみの文は、倍率が先に来る（損に読めないように）', async () => {
    const { descOf } = await import('../src/core/build');
    expect(descOf('yoyaku', 3).startsWith('全部の皿は ×1.8')).toBe(true);
  });
});
