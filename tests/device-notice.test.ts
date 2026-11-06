import { describe, expect, it } from 'vitest';
import { isTouchOnly } from '../src/ui/deviceNotice';

describe('スマホ・タブレットの案内', () => {
  const m = (coarse: boolean, fine: boolean) => (q: string) => (q.includes('coarse') ? coarse : fine);
  it('指で触るだけの端末では案内を出す', () => expect(isTouchOnly(m(true, false))).toBe(true));
  it('マウスやタッチパッドがあれば出さない（パソコン・キーボード付きタブレット）', () => {
    expect(isTouchOnly(m(false, true))).toBe(false);
    expect(isTouchOnly(m(true, true))).toBe(false);
  });
});
