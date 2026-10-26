import { afterEach, describe, expect, it, vi } from 'vitest';
import { Art, TRIP_ASSETS } from '../src/ui/amber/art';

const requests: string[] = [];
const fail = new Set<string>();
const held = new Map<string, () => void>();
function images() {
  requests.length = 0; fail.clear(); held.clear();
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      const file = url.split('/').pop()!.split('?')[0];
      requests.push(file);
      queueMicrotask(() => {
        const complete = () => fail.has(file) ? this.onerror?.() : this.onload?.();
        if (held.has(file)) held.set(file, complete); else complete();
      });
    }
  });
}
afterEach(() => vi.unstubAllGlobals());

describe('初回ロードと調達画像の遅延取得', () => {
  it('初期画面では調達専用の背景・人物・獲物を取得しない', async () => {
    images(); const art = await Art.load();
    expect(art.has('bg-tavern-night')).toBe(true);
    expect(art.has('bg-tavern')).toBe(true);
    expect(art.has('family-master')).toBe(true);
    for (const ids of Object.values(TRIP_ASSETS)) for (const id of ids) {
      expect(art.has(id)).toBe(false);
      expect(requests).not.toContain(`${id}.webp`);
    }
  });

  it('背景だけが届いても開始せず、人物まで揃うと準備完了になる', async () => {
    images(); const art = await Art.load();
    held.set('wife-fishing.webp', () => {});
    const pending = art.ensureTrip('fishing');
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(art.has('bg-fishing')).toBe(true);
    expect(art.hasTrip('fishing')).toBe(false);
    held.get('wife-fishing.webp')!();
    await pending;
    expect(art.hasTrip('fishing')).toBe(true);
  });

  it('同時取得や再訪で同じ画像を再取得しない', async () => {
    images(); const art = await Art.load();
    await Promise.all([art.ensureTrip('hunting'), art.ensureTrip('hunting')]);
    await art.ensureTrip('hunting');
    expect(requests.filter(f => f === 'wildlife.webp')).toHaveLength(1);
    expect(requests.filter(f => f === 'bg-hunting.webp')).toHaveLength(1);
  });

  it('遅延画像の取得失敗を通知し、次の出発で再試行できる', async () => {
    images(); const art = await Art.load(); fail.add('wife-fishing.webp');
    await expect(art.ensureTrip('fishing')).rejects.toThrow();
    expect(art.hasTrip('fishing')).toBe(false);
    fail.clear(); await art.ensureTrip('fishing');
    expect(art.hasTrip('fishing')).toBe(true);
    expect(requests.filter(f => f === 'wife-fishing.webp')).toHaveLength(2);
  });
});
