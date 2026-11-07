// れんしゅうの案内：手順の説明の札と、打つ場所を光らせる枠
import { C } from '../palette';
import { ORDER_CARD } from '../amber/layout';
import { SEATS } from '../shopView';
import type { Game } from '../game';
import { FIRST_SEAT, SECOND_SEAT, tutorialText } from '../tutorial';

/** 光らせる枠（脈打つ金色の縁） */
function pulseFrame(g: Game, x: number, y: number, w: number, h: number) {
  const sc = g.sc;
  const a = 0.55 + 0.45 * Math.sin(g.t * 6);
  sc.glow(x - 2, y - 2, w + 4, h + 4, C.gold3, a);
  for (const [px, py, pw, ph] of [[x - 3, y - 3, w + 6, 1.5], [x - 3, y + h + 1.5, w + 6, 1.5], [x - 3, y - 3, 1.5, h + 6], [x + w + 1.5, y - 3, 1.5, h + 6]]) {
    sc.PR(px, py, pw, ph, C.gold3, a);
  }
}

/** 説明の札：見出しと数行 */
function hintPanel(g: Game, x: number, y: number, w: number, title: string, lines: string[], strong = false) {
  const sc = g.sc;
  const h = 22 + lines.length * 12;
  sc.PR(x + 3, y + 3, w, h, '#0c0604', 0.6);
  sc.panel(x, y, w, h, '#fff3d6', strong ? C.gold3 : C.gold2);
  sc.PR(x + 2, y + 2, w - 4, 15, strong ? '#ffd98a' : '#f1d9a4');
  sc.T(title, x + 7, y + 4, 9, '#3a2414');
  lines.forEach((line, k) => sc.T(line, x + 7, y + 20 + k * 12, sc.fitSize(line, 8, w - 14, 6), '#3a2414'));
}

/** 営業中・調達中の画面に、今の手順の案内を重ねる */
export function drawTutorial(g: Game) {
  const t = g.tutorial;
  const shop = g.shop;
  if (!t || !shop || t.step === 'done') return;
  const sc = g.sc;
  const e = sc.ext;
  const { title, lines } = tutorialText(t);
  const trip = g.trip;
  if (trip && trip.phase !== 'intro') {
    // 調達の画面：上の帯の下、右側に
    sc.shifted(0, e.y0, () => hintPanel(g, e.x1 - 196, 34, 190, title, lines, t.gained || t.t > 10));
    return;
  }
  if (trip) return;
  sc.shifted(0, e.y0, () => {
    // 時計が止まっていることを、時計の横で知らせる
    const tag = 'れんしゅう中・時計は止まっています';
    const tw = sc.W(tag, 7) + 10;
    sc.panel(e.x1 - tw - 6, 28, tw, 12, 'rgba(42,27,38,0.94)', C.gold2);
    sc.T(tag, e.x1 - tw / 2 - 6, 30, 7, C.gold3, 'center');
    // 説明の札は、席のない左側（台所の上）に
    hintPanel(g, e.x0 + 6, 34, 182, title, lines);
  });
  // 打つ場所を光らせる
  const card = (i: number) => {
    const s = SEATS[i];
    const y = s.ty - (g.art ? ORDER_CARD.offset : 70);
    pulseFrame(g, s.x - 31, y, 62, g.art ? ORDER_CARD.height : 42);
  };
  if (t.step === 'serve1') card(FIRST_SEAT);
  else if (t.step === 'serve2') card(SECOND_SEAT);
  else if (t.step === 'lack' && shop.seats[SECOND_SEAT]) {
    // 「つり」の調達欄（調達の欄と同じ並べ方）
    sc.shifted(0, e.y1 - 270, () => {
      const w = Math.min(150, (e.w - 8 - 12) / 4);
      const left = e.x0 + (e.w - (w * 4 + 12)) / 2;
      pulseFrame(g, left, 214, w, 52);
    });
  }
}
