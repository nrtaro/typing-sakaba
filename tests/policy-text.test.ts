// 繁盛記：効果の文の形と、札に収まるか（選ぶ画面の札・入れ替えの画面の札）
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { readFileSync } from 'node:fs';
import { wrapText } from '../src/ui/screens/records';
import { MAX_LEVEL, POLICIES, descDiff, descOf } from '../src/core/build';

// 全角は1字＝文字の大きさ、半角はその半分として測る
const sc = { W: (t: string, size: number) => [...t].reduce((w, ch) => w + (/[\x20-\x7e]/.test(ch) ? size / 2 : size), 0) };
const rows = (text: string, width: number) => wrapText(sc, text, 7.5, width).length;
const diffText = (id: (typeof POLICIES)[number]['id']) => descDiff(id, 1, MAX_LEVEL).map((s) => s.t).join('');

describe('効果の文', () => {
  it('どの文も「〇〇の皿は ×いくつ」の言い方で、「売上×」を使わない', () => {
    for (const p of POLICIES) {
      const t = descOf(p.id, 1);
      expect(t, p.name).not.toContain('売上×');
    }
    for (const p of POLICIES.filter((q) => !['matome', 'keiki'].includes(q.id))) expect(descOf(p.id, 1), p.name).toContain(' ×');
  });

  it('数字を直書きしない（8個・7割・8席・半分・10コンボ）', () => {
    const src = readFileSync('src/core/build.ts', 'utf8');
    const texts = [...src.matchAll(/\n    text: (['`])(.*?)\1,/g)].map((m) => m[2]);
    expect(texts.length).toBe(POLICIES.length);
    for (const t of texts) for (const bad of ['8個', '7割', '8席', '半分', '10コンボ', '10皿']) expect(t, t).not.toContain(bad);
  });

  it('選ぶ画面の札（4枚のときの幅）に5行で収まる', () => {
    for (const p of POLICIES) for (let lv = 1; lv <= MAX_LEVEL; lv++) expect(rows(descOf(p.id, lv), 110 - 14), `${p.name} Lv${lv}`).toBeLessThanOrEqual(5);
    for (const p of POLICIES) expect(rows(diffText(p.id), 110 - 14), `${p.name} 強化`).toBeLessThanOrEqual(5);
  });

  it('入れ替えの画面の札に5行で収まる', () => {
    for (const p of POLICIES) for (let lv = 1; lv <= MAX_LEVEL; lv++) expect(rows(descOf(p.id, lv), 76), `${p.name} Lv${lv}`).toBeLessThanOrEqual(5);
  });
});
