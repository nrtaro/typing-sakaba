// 狩りの画面の配置（描画に依存しない計算だけ。テストから直接使う）

/**
 * 大物の札の位置。頭の左横が基本で、左端で収まらなくなる分だけ頭の上へなめらかに移る。
 * 獲物の位置に対して連続に動く（途中で反対側へ飛ばない）。
 */
export function deerLabelBox(pos: { x: number; y: number }, w: number, h: number, spriteH: number) {
  const sideX = pos.x - 34 - w;
  const lift = Math.max(0, Math.min(1, (4 - sideX) / (w * 0.6)));
  const besideY = pos.y - spriteH + 8;
  const aboveY = pos.y - spriteH - h - 8;
  const aboveX = Math.max(4, pos.x - w / 2);
  return {
    x: Math.max(4, sideX) * (1 - lift) + aboveX * lift,
    y: besideY + (aboveY - besideY) * lift,
    w,
    h,
  };
}

export interface LabelBox { x: number; y: number; w: number; h: number }

const GAP = 3;
function hits(a: LabelBox, b: LabelBox) {
  return a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;
}

/**
 * 獲物の札が重ならないように並べ直す。渡した順（大物→小物を左から）に置き、
 * 先に置いた札と重なる札は、置いた札の右・左・上のうち、元の位置からいちばん近い空いた場所へずらす
 * （横へのずれを優先する）。札と獲物は線でつないでいるので、ずれてもどの獲物の言葉かは分かる。
 */
export function spreadLabels(boxes: LabelBox[], minX = 4, maxX = 476, minY = 32): LabelBox[] {
  const placed: LabelBox[] = [];
  for (const b of boxes) {
    const free = (c: LabelBox) => !placed.some((p) => hits(c, p));
    if (free(b)) { placed.push({ ...b }); continue; }
    const xs = [b.x, ...placed.flatMap((p) => [p.x + p.w + GAP, p.x - b.w - GAP])].filter((x) => x >= minX && x + b.w <= maxX);
    const ys = [b.y, ...placed.map((p) => p.y - b.h - GAP)].filter((y) => y >= minY);
    let best: LabelBox | null = null;
    let cost = Infinity;
    for (const x of xs) for (const y of ys) {
      const c = { x, y, w: b.w, h: b.h };
      const k = Math.abs(x - b.x) + Math.abs(y - b.y) * 3;
      if (k < cost && free(c)) { best = c; cost = k; }
    }
    placed.push(best ?? { ...b });
  }
  return placed;
}
