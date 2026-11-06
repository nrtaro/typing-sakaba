// ひがわりのお題の絵と札（お題の画面・結果・遊び方・営業を選ぶ画面で使う）
import { C } from '../palette';
import type { Screen } from '../screen';
import type { Art } from '../amber/art';
import type { Condition, ConditionId } from '../../core/daily';
import type { DifficultyId } from '../../core/shopConfig';

/** お題の絵：調達は2回まで＝かごに数字、ノーミス営業＝丸の付いたキー */
export function drawCondIcon(sc: Screen, art: Art | null, id: ConditionId, x: number, y: number, size: number, n = 2, a = 1) {
  const u = size / 16;
  sc.panel(x, y, size, size, '#2a1b14', '#c79a52', a);
  if (id === 'tripLimit') {
    // かご（取っ手と編み目）
    sc.PR(x + 4 * u, y + 3 * u, 1 * u, 4 * u, '#d8a458', a);
    sc.PR(x + 11 * u, y + 3 * u, 1 * u, 4 * u, '#d8a458', a);
    sc.PR(x + 4 * u, y + 3 * u, 8 * u, 1 * u, '#d8a458', a);
    sc.PR(x + 2 * u, y + 7 * u, 12 * u, 6 * u, '#b07a3a', a);
    for (let k = 0; k < 3; k++) sc.PR(x + 2 * u, y + (8 + k * 2) * u, 12 * u, 0.6 * u, '#7a4e22', a);
    if (art) art.drawIcon(sc, 'icons-dishes', 2, x + 4 * u, y + 3.5 * u, 5 * u, a);
    // 回数の札
    sc.panel(x + 9 * u, y + 8.5 * u, 7 * u, 7 * u, C.red2, C.ink, a);
    sc.T(String(n), x + 12.5 * u, y + 9 * u, 6 * u, C.w, 'center', a);
  } else {
    // キーと、正しく打てた印の丸
    sc.PR(x + 3 * u, y + 5 * u, 10 * u, 9 * u, '#3a2414', a);
    sc.panel(x + 3 * u, y + 4 * u, 10 * u, 9 * u, '#f6e2b8', '#8a6232', a);
    sc.T('A', x + 8 * u, y + 5 * u, 6 * u, '#3a2414', 'center', a);
    for (let k = 0; k < 12; k++) {
      const ang = (k / 12) * Math.PI * 2;
      sc.PR(x + 8 * u + Math.cos(ang) * 6.5 * u - 0.6 * u, y + 8.5 * u + Math.sin(ang) * 6.5 * u - 0.6 * u, 1.3 * u, 1.3 * u, '#e04a3a', a);
    }
  }
}

/** 小さな札：絵と名前を1行で */
export function drawCondChip(sc: Screen, art: Art | null, c: Condition, d: DifficultyId, x: number, y: number, a = 1) {
  const w = chipWidth(sc, c, d);
  sc.panel(x, y, w, 14, 'rgba(42,27,20,0.94)', '#a8743f', a);
  drawCondIcon(sc, art, c.id, x + 1.5, y + 1.5, 11, c.count(d), a);
  sc.T(c.title(d), x + 15, y + 2.5, 8, C.cream, 'left', a);
  return w;
}

export function chipWidth(sc: Screen, c: Condition, d: DifficultyId) {
  return sc.W(c.title(d), 8) + 19;
}
