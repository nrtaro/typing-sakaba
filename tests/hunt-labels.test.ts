// 狩りの札が重ならないこと（模擬プレイで、札の位置を描画と同じ計算で求めて確かめる）
import { describe, expect, it } from 'vitest';
import { HuntingGame } from '../src/core/minigames';
import { Rng } from '../src/core/rng';
import { difficultyOf } from '../src/core/shopConfig';
import { RomajiMatcher } from '../src/core/romaji';
import { deerLabelBox, spreadLabels, type LabelBox } from '../src/ui/huntLayout';

const LW = 480;
const preyPos = (p: { x: number; lane: number }) => ({ x: 74 + p.x * 396, y: 118 + p.lane * 106 });
/** 文字幅のおおよそ：英数字は半分、かなと漢字は1文字分 */
const W = (s: string, size: number) => [...s].reduce((a, c) => a + (/[ -~]/.test(c) ? size * 0.55 : size), 0);

function boxes(g: HuntingGame): LabelBox[] {
  const preys = [...g.prey].sort((a, b) => (a.kind === 'deer' ? 0 : 1) - (b.kind === 'deer' ? 0 : 1) || a.x - b.x);
  return preys.map((p) => {
    const pos = preyPos(p);
    const m = new RomajiMatcher(p.word.kana);
    const label = p.word.text + (p.kind === 'rabbit' ? ' ×3' : '');
    const h = 32, w = Math.max(60, W(m.remaining, 10) + 14, W(label, 12) + 14), spriteH = p.kind === 'deer' ? 48 : 24;
    return p.kind === 'deer' ? deerLabelBox(pos, w, h, spriteH) : { x: Math.max(4, Math.min(LW - w - 4, pos.x - w / 2)), y: pos.y - spriteH - h - 8, w, h };
  });
}
const overlap = (bs: LabelBox[]) => bs.some((a, i) => bs.some((b, j) => j > i && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h));

describe('狩りの札', () => {
  it.each(['easy', 'normal', 'hard'] as const)('%s：ずらす前はよく重なり、ずらした後はほぼ重ならない', (d) => {
    let frames = 0, before = 0, after = 0;
    for (let seed = 1; seed <= 20; seed++) {
      const g = new HuntingGame(new Rng(seed), difficultyOf(d));
      for (let i = 0; i < 60 * 10; i++) {
        g.update(1 / 60);
        const bs = boxes(g);
        frames++;
        if (overlap(bs)) before++;
        if (overlap(spreadLabels(bs))) after++;
      }
    }
    console.log(`${d}：重なる時間 ${(100 * before / frames).toFixed(1)}% → ${(100 * after / frames).toFixed(1)}%`);
    expect(after / frames).toBeLessThan(0.01);
  });

  it('重なる札は横へずらし、場所がなければ上へ積む。画面の外へは出さない', () => {
    const b = { x: 200, y: 100, w: 80, h: 32 };
    const out = spreadLabels([b, { ...b }, { ...b }]);
    expect(out[0]).toEqual(b);
    expect(out[1].x).toBeGreaterThanOrEqual(283);
    expect(out[2].x + out[2].w).toBeLessThanOrEqual(200);
    const crowded = spreadLabels(Array.from({ length: 8 }, () => ({ ...b })));
    expect(crowded.every((c) => c.x >= 4 && c.x + c.w <= 476 && c.y >= 32)).toBe(true);
  });
});
