// 段階6：シールの絵（あとから読む）
import { afterEach, describe, expect, it, vi } from 'vitest';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { StickerArt, sheetUrl, stickerUrl } from '../src/ui/stickerArt';
import { ITEMS, SERIES } from '../src/core/collection';
import { Art } from '../src/ui/amber/art';

const requests: string[] = [];
const fail = new Set<string>();
function images() {
  requests.length = 0; fail.clear();
  vi.stubGlobal('Image', class {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    set src(url: string) {
      requests.push(url);
      queueMicrotask(() => (fail.has(url) ? this.onerror?.() : this.onload?.()));
    }
  });
}
afterEach(() => vi.unstubAllGlobals());
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('シールの絵', () => {
  it('ファイル名は永続ID', () => {
    expect(stickerUrl('st-ale')).toBe('/collection/stickers/st-ale.webp');
    expect(sheetUrl('food', false)).toBe('/collection/sheets/sheet-food.webp');
    expect(sheetUrl('food', true)).toBe('/collection/sheets/sheet-food-done.webp');
  });

  it('同じ絵を二度読まず、読めなかった絵は null のまま', async () => {
    images();
    const art = new StickerArt();
    fail.add('/collection/stickers/st-yakizakana.webp');
    art.load(['/collection/stickers/st-ale.webp', '/collection/stickers/st-yakizakana.webp']);
    art.load(['/collection/stickers/st-ale.webp']);
    await tick();
    expect(requests.filter((u) => u === '/collection/stickers/st-ale.webp')).toHaveLength(1);
    expect(art.get('/collection/stickers/st-ale.webp')).not.toBeNull();
    expect(art.get('/collection/stickers/st-yakizakana.webp')).toBeNull();
    expect(art.get('/collection/stickers/never.webp')).toBeNull();
  });

  it('起動時の読み込みではシールの絵を取らない', async () => {
    images();
    await Art.load();
    expect(requests.some((u) => u.includes('/collection/'))).toBe(false);
  });

  it('すべてのプレート・シール・台紙に絵がある', () => {
    const dir = new URL('../public/collection/', import.meta.url);
    for (const it of ITEMS.filter((i) => i.kind === 'sticker')) expect(existsSync(new URL(`stickers/${it.id}.webp`, dir))).toBe(true);
    for (const it of ITEMS.filter((i) => i.kind === 'plate')) expect(existsSync(new URL(`plates/${it.id}.webp`, dir))).toBe(true);
    for (const s of SERIES) for (const done of [false, true]) expect(existsSync(new URL(sheetUrl(s.id, done).replace('/collection/', ''), dir))).toBe(true);
    expect(readdirSync(new URL('stickers/', dir))).toHaveLength(36);
    // 段階6の24枚と、繁盛記の限定3枚
    expect(readdirSync(new URL('plates/', dir))).toHaveLength(27);
    expect(readdirSync(new URL('sheets/', dir))).toHaveLength(8);
    expect(readFileSync(new URL('README.md', dir), 'utf8')).toContain('stage6-art.mjs');
  });
});
