// ひがわりのお題の絵と札（お題の画面・結果・遊び方・営業を選ぶ画面で使う）
import { C } from '../palette';
import type { Screen } from '../screen';
import type { Art } from '../amber/art';
import type { Condition, ConditionId } from '../../core/daily';
import type { DifficultyId } from '../../core/shopConfig';

/**
 * お題の絵（16×16 の升目で描く）。
 * ノーミス＝丸の付いたキー、狭い倉庫＝ぎっしりの棚、調達中も待たない＝砂時計、
 * 時間帯の当たり＝太陽と月と星、こぼす＝傾いた器としずく、おかわり＝重ねた皿と「＋」
 */
export function drawCondIcon(sc: Screen, _art: Art | null, id: ConditionId, x: number, y: number, size: number, a = 1) {
  const u = size / 16;
  sc.panel(x, y, size, size, '#2a1b14', '#c79a52', a);
  const P = (px: number, py: number, w: number, h: number, col: string) => sc.PR(x + px * u, y + py * u, w * u, h * u, col, a);
  if (id === 'smallStore') {
    P(3, 2, 10, 12, '#5a3a1c');
    P(4, 3, 8, 10, '#2a1b14');
    for (const [bx, by, col] of [[4, 9, '#b07a3a'], [8, 9, '#c98f45'], [4, 5, '#c98f45'], [8, 5, '#b07a3a'], [6, 3, '#d8a458']] as const) {
      P(bx, by, 4, 4, col);
      P(bx, by + 1.5, 4, 0.6, '#7a4e22');
    }
    P(3, 8.5, 10, 0.8, '#8a6232');
    P(3, 12.8, 10, 1, '#8a6232');
  } else if (id === 'busyAway') {
    P(4, 2, 8, 1.2, '#c79a52');
    P(4, 12.8, 8, 1.2, '#c79a52');
    for (let k = 0; k < 5; k++) {
      P(5 + k * 0.6, 3.2 + k, 6 - k * 1.2, 1, '#cfe6f0');
      P(5 + k * 0.6, 11.8 - k, 6 - k * 1.2, 1, '#cfe6f0');
    }
    P(6, 4.2, 4, 1.5, '#e8c070');
    P(5.6, 10.3, 4.8, 1.5, '#e8c070');
    P(7.6, 7, 0.8, 3, '#e8c070');
    P(12.5, 3, 2, 6, '#ff5a4a');
    P(12.5, 10, 2, 2, '#ff5a4a');
  } else if (id === 'luckyTrip') {
    // 左に太陽、右に月、真ん中に星
    P(2, 3, 4, 4, '#ffb94a');
    P(1, 4.5, 6, 1, '#ffb94a');
    P(3.5, 2, 1, 6, '#ffb94a');
    // 三日月
    P(10, 2.5, 1.6, 4.5, '#e8e4c8');
    P(11, 1.6, 2.4, 1.2, '#e8e4c8');
    P(11, 6.7, 2.4, 1.2, '#e8e4c8');
    P(7, 7, 2, 7, '#ffe27a');
    P(4.5, 9.5, 7, 2, '#ffe27a');
    P(6, 8.5, 4, 4, '#ffe27a');
    P(7.5, 10, 1, 1, '#fff7d0');
  } else if (id === 'spill') {
    // 傾いた器と、こぼれるしずく
    P(2, 4, 8, 2, '#c98f45');
    P(3, 6, 7, 2, '#b07a3a');
    P(4, 8, 5, 1.5, '#8a5a2a');
    P(9.5, 3.5, 2, 2, '#9fd8f0');
    P(11, 6.5, 1.5, 2, '#9fd8f0');
    P(12.5, 9.5, 1.5, 2, '#9fd8f0');
    P(10.5, 12, 2, 1.5, '#9fd8f0');
    P(2, 12.5, 7, 1, '#5a3a1c');
  } else if (id === 'refill') {
    // 重ねた皿と「＋」
    P(1.5, 9, 9, 2, '#f2efe2');
    P(2.5, 11, 7, 1, '#b8b2a0');
    P(2.5, 5.5, 9, 2, '#f2efe2');
    P(3.5, 7.5, 7, 1, '#b8b2a0');
    P(4, 3.5, 4, 2, '#e07a3a');
    P(11.5, 9, 4, 1.4, C.gold3);
    P(12.8, 7.7, 1.4, 4, C.gold3);
  } else if (id === 'noMiss') {
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
  drawCondIcon(sc, art, c.id, x + 1.5, y + 1.5, 11, a);
  sc.T(c.title(d), x + 15, y + 2.5, 8, C.cream, 'left', a);
  return w;
}

export function chipWidth(sc: Screen, c: Condition, d: DifficultyId) {
  return sc.W(c.title(d), 8) + 19;
}
