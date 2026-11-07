// 段階6：ネームプレートと二つ名の描画
import { describe, expect, it } from 'vitest';
import { Screen } from '../src/ui/screen';
import { drawNameplate, titleOf } from '../src/ui/nameplate';
import { ITEMS, LINKS } from '../src/core/collection';
import type { Decoration } from '../src/core/ranking';

/** 1文字を size 幅として数え、描いた文字の範囲を残す偽の画面 */
function fake() {
  const texts: { text: string; x: number; size: number; align: string }[] = [];
  const sc = {
    W: (t: string, s: number) => [...t].length * s,
    fitSize: Screen.prototype.fitSize,
    T(text: string, x: number, _y: number, size: number, _c: string, align = 'left') { texts.push({ text, x, size, align }); },
    TB(text: string, x: number, _y: number, size: number, _c: string, align = 'center') { texts.push({ text, x, size, align }); },
    PR() {}, panel() {},
  };
  const right = (t: (typeof texts)[number]) => (t.align === 'right' ? t.x : t.align === 'center' ? t.x + sc.W(t.text, t.size) / 2 : t.x + sc.W(t.text, t.size));
  return { sc: sc as unknown as Screen, texts, right };
}
const longest = (kind: string) => ITEMS.filter((i) => i.kind === kind).sort((a, b) => [...b.name].length - [...a.name].length)[0];

describe('ネームプレート', () => {
  it('いちばん長い二つ名でも幅からはみ出さない', () => {
    const d: Decoration = { titleFront: longest('front').id, titleLink: 'noyouna', titleBack: longest('back').id, plate: 'p-kinpaku' };
    const { sc, texts, right } = fake();
    drawNameplate(sc, 10, 0, 120, 14, 'とても長い名前です', d, 9);
    expect(texts.length).toBe(2);
    for (const t of texts) { expect(t.x).toBeGreaterThanOrEqual(10); expect(right(t)).toBeLessThanOrEqual(130 + 0.01); }
  });

  it('飾りがなければ名前だけ', () => {
    const { sc, texts } = fake();
    drawNameplate(sc, 0, 0, 100, 14, '店主', undefined, 9);
    expect(texts.map((t) => t.text)).toEqual(['店主']);
  });

  it('二つ名の文字列：（なし）のつなぎは前と後ろをそのままつなぐ', () => {
    const f = longest('front');
    const b = longest('back');
    expect(titleOf({ titleFront: f.id, titleLink: 'none', titleBack: b.id, plate: null })).toBe(`${f.name}${b.name}`);
    expect(titleOf({ titleFront: f.id, titleLink: 'no', titleBack: b.id, plate: null })).toBe(`${f.name}の${b.name}`);
    expect(titleOf(undefined)).toBeNull();
    expect(LINKS.find((l) => l.id === 'none')!.text).toBe('');
  });
});
