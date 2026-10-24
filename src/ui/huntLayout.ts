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
