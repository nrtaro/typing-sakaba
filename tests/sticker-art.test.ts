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
    expect(stickerUrl('st-ale')).toBe('/stickers/st-ale.png');
    expect(sheetUrl('food', false)).toBe('/stickers/sheet-food.png');
    expect(sheetUrl('food', true)).toBe('/stickers/sheet-food-done.png');
  });

  it('同じ絵を二度読まず、読めなかった絵は null のまま', async () => {
    images();
    const art = new StickerArt();
    fail.add('/stickers/st-yakizakana.png');
    art.load(['/stickers/st-ale.png', '/stickers/st-yakizakana.png']);
    art.load(['/stickers/st-ale.png']);
    await tick();
    expect(requests.filter((u) => u === '/stickers/st-ale.png')).toHaveLength(1);
    expect(art.get('/stickers/st-ale.png')).not.toBeNull();
    expect(art.get('/stickers/st-yakizakana.png')).toBeNull();
    expect(art.get('/stickers/never.png')).toBeNull();
  });

  it('起動時の読み込みではシールの絵を取らない', async () => {
    images();
    await Art.load();
    expect(requests.some((u) => u.includes('/stickers/'))).toBe(false);
  });

  it('すべてのシールと台紙に仮の絵がある', () => {
    const dir = new URL('../public/stickers/', import.meta.url);
    for (const it of ITEMS.filter((i) => i.kind === 'sticker')) expect(existsSync(new URL(`${it.id}.png`, dir))).toBe(true);
    for (const s of SERIES) for (const done of [false, true]) expect(existsSync(new URL(sheetUrl(s.id, done).replace('/stickers/', ''), dir))).toBe(true);
    expect(readdirSync(dir).filter((f) => f.endsWith('.png')).length).toBe(36 + 8);
    expect(readFileSync(new URL('README.md', dir), 'utf8')).toContain('64');
  });
});
