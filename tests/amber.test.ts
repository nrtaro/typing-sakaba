import { describe, expect, it } from 'vitest';
import manifestJson from '../assets/amber-v2/manifest.json';
import { animDone, destRect, frameAt, sourceRect, standingHeight, type Manifest, type ManifestAnimation, type ManifestFrame } from '../src/ui/amber/manifest';
import { LOOK_COUNT } from '../src/core/shop';

const manifest = manifestJson as unknown as Manifest;
const asset = (id: string) => manifest.assets.find((a) => a.id === id)!;

describe('A案素材の切り出し', () => {
  const f: ManifestFrame = { index: 1, rect: [229, 0, 253, 259], visibleBounds: [25, 9, 214, 231], registration: [119, 231] };

  it('描画元は rect の原点に visibleBounds の位置を足す（隣のセルにまたがっても正しい）', () => {
    expect(sourceRect(f)).toEqual({ x: 254, y: 9, w: 189, h: 222 });
  });

  it('足元の基準点が指定した位置に来る（反転しても同じ）', () => {
    const k = 0.1;
    const d = destRect(f, 100, 200, k);
    expect(d.x + (119 - 25) * k).toBeCloseTo(100);
    expect(d.y + d.h).toBeCloseTo(200);
    const r = destRect(f, 100, 200, k, true);
    expect(r.x + r.w - (119 - 25) * k).toBeCloseTo(100);
    expect(r.w).toBeCloseTo(d.w);
  });

  it('客の表情はどの種類も rect と visibleBounds で切り出す（7種類が揃っている）', () => {
    const seated = asset('guests-seated');
    expect(seated.animations!.length).toBe(LOOK_COUNT);
    for (const a of seated.animations!) {
      expect(Object.keys(a.states ?? {})).toEqual(['smile', 'neutral', 'angry', 'eat']);
    }
    expect(asset('guests-walk').animations!.length).toBe(LOOK_COUNT);
  });

  it('使う動きは不採用のコマを含まない', () => {
    for (const a of manifest.assets) {
      for (const an of a.animations ?? []) for (const i of an.frames) expect(a.deprecatedFrames ?? []).not.toContain(i);
    }
  });

  it('足元から頭までの高さが正になる', () => {
    for (const a of manifest.assets) for (const fr of a.frames ?? []) expect(standingHeight(fr)).toBeGreaterThan(0);
  });
});

describe('A案素材の再生', () => {
  const loop: ManifestAnimation = { name: '待機', frames: [0, 0, 0, 2, 0], fps: 4, loop: true, playback: 'loop' };
  const hold: ManifestAnimation = { name: '配膳', frames: [8, 9, 10, 9, 8], fps: 5, loop: false, playback: 'once-hold' };
  const hide: ManifestAnimation = { name: '水しぶき', frames: [8, 9, 10, 11], fps: 8, loop: false, playback: 'once-hide' };

  it('ループは配列順に繰り返し、同じコマが続く分だけ長く表示する', () => {
    expect([0, 0.25, 0.5, 0.75, 1.0, 1.25].map((t) => frameAt(loop, t))).toEqual([0, 0, 0, 2, 0, 0]);
  });

  it('一回再生して最後のコマで止まる', () => {
    expect(frameAt(hold, 0)).toBe(8);
    expect(frameAt(hold, 0.45)).toBe(10);
    expect(frameAt(hold, 5)).toBe(8);
    expect(animDone(hold, 0.9)).toBe(false);
    expect(animDone(hold, 1.0)).toBe(true);
  });

  it('一回再生して消える', () => {
    expect(frameAt(hide, 0)).toBe(8);
    expect(frameAt(hide, 0.49)).toBe(11);
    expect(frameAt(hide, 0.5)).toBeNull();
  });

  it('経過時間は始まりから数える（0 で必ず最初のコマ）', () => {
    for (const a of manifest.assets) for (const an of a.animations ?? []) {
      if (an.playback !== 'state') expect(frameAt(an, 0)).toBe(an.frames[0]);
    }
  });
});
