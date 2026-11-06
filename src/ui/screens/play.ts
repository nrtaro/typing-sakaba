// 画面：play
import { C } from '../palette';
import { LW } from '../screen';
import { PORTRAIT } from '../sprites';
import { Shop } from '../../core/shop';
import { FAMILY_NAME, INGREDIENT_NAME } from '../../core/shopConfig';
import type { Game } from '../game';

/** はじめての営業だけ出す案内：まず料理を出す → 食材が減ったら調達 */
export function guideFor(g: Game, shop: Shop): 'order' | 'supply' | null {
  if (shop.away || g.trip) return null;
  if (shop.stats.served === 0) return shop.seats.some((g) => g && g.state === 'wait') ? 'order' : null;
  const low = Object.values(shop.stock).some((n) => n <= 3);
  return low || shop.stats.served >= 3 ? 'supply' : null;
}

/** 開店のカウントダウン：数字が大きく弾んで縮み、光の輪が広がる。最後に「開店！」 */
export function drawCountdown(g: Game) {
  const sc = g.sc;
  if (g.countdown > 0) {
    const n = Math.ceil(g.countdown);
    const p = 1 - (g.countdown - (n - 1)); // その数字が出てからの割合（0→1）
    const pop = p < 0.15 ? 1.6 - p / 0.15 * 0.6 : 1 - (p - 0.15) * 0.15;
    sc.cover(C.bg, 0.45);
    sc.radialGlow(LW / 2, 130, 40 + p * 110, '#ffd25c', 0.5 * (1 - p));
    for (let k = 0; k < 24; k++) {
      const ang = (k / 24) * Math.PI * 2 + n;
      const r = 30 + p * 90;
      sc.PR(LW / 2 + Math.cos(ang) * r, 130 + Math.sin(ang) * r * 0.6, 2, 2, k % 2 ? C.gold : C.gold3, 1 - p);
    }
    const size = 64 * pop;
    sc.TB(String(n), LW / 2, 130 - size / 2, size, '#ffe7a6', 'center', '#3a1408', Math.min(1, (1 - p) * 4));
    sc.TB('開店まで', LW / 2, 74, 11, C.cream, 'center', C.ink, 0.9);
    return;
  }
  if (g.goShown > 0) {
    const p = 1 - g.goShown / 0.9;
    const a = Math.min(1, g.goShown * 3);
    const size = 40 * (p < 0.12 ? 0.6 + p / 0.12 * 0.6 : 1.2 - Math.min(0.2, (p - 0.12) * 0.5));
    sc.radialGlow(LW / 2, 130, 60 + p * 160, '#ffb45a', 0.55 * a);
    for (let k = 0; k < 16; k++) {
      const ang = (k / 16) * Math.PI * 2;
      const r = 20 + p * 160;
      sc.PR(LW / 2 + Math.cos(ang) * r, 130 + Math.sin(ang) * r * 0.55, 3, 1.5, k % 2 ? C.gold : '#ff9fbd', a);
    }
    sc.TB('開店！', LW / 2, 130 - size / 2, size, '#ffd25c', 'center', '#3a1408', a);
  }
}

export function drawTripIntro(g: Game) {
  const sc = g.sc;
  const trip = g.shop?.away;
  if (!trip) return;
  sc.cover(C.bg, 0.35);
  sc.panel(110, 94, 260, 54, 'rgba(42,27,38,0.96)', C.gold);
  if (g.art) g.art.drawHead(sc, `family-${trip.who}`, 0, 120, 102, 34, 0.55);
  else sc.spr(PORTRAIT[trip.who], 120, 102, 2.5);
  sc.TB(`${FAMILY_NAME[trip.who]}が${trip.place}へ`, 162, 100, 13, C.gold3, 'left');
  sc.TB(`${trip.act}に出かけた！`, 162, 122, 13, C.w, 'left');
}

export function drawTripOutro(g: Game) {
  const sc = g.sc;
  const trip = g.shop?.away;
  if (!trip || !g.trip) return;
  const gains = g.trip.game.result().gains;
  sc.cover(C.bg, 0.45);
  sc.panel(100, 90, 280, 62, 'rgba(42,27,38,0.96)', C.gold);
  sc.TB(g.trip.earlyReturn ? `${FAMILY_NAME[trip.who]}が店に戻った！` : `${FAMILY_NAME[trip.who]}「ただいま！」`, LW / 2, 96, 14, C.gold3, 'center');
  const text = trip.gives.map((id) => `${INGREDIENT_NAME[id]} +${Math.max(g.trip!.earlyReturn ? 0 : trip.minimum[id] ?? 0, gains[id] ?? 0)}`).join('　');
  sc.TB(text, LW / 2, 122, 14, C.w, 'center');
}
