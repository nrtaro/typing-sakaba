// 画面：ふくびき（段階6）。ガラガラが回って玉が出て、飾りのカードを見せる。交換の一覧もここ
import { C } from '../palette';
import { LW } from '../screen';
import type { Game } from '../game';
import { button, drawSignboard } from './common';
import { EXCHANGE_COST, PULL_PRICE, itemById, type Item, type Star } from '../../core/collection';
import { drawSticker } from '../stickerArt';
import { drawNameplate } from '../nameplate';

/** ガラガラから飾りのカードまでの演出の長さ（秒） */
export const FUKUBIKI_ANIM = 1.2;
const SPIN = 0.75;

export const KIND_NAME: Record<Item['kind'], string> = { front: '二つ名（前）', back: '二つ名（後ろ）', plate: 'プレート', sound: '打鍵音', sticker: 'シール' };
/** 玉と☆の色（白・緑・青・金・虹） */
export const STAR_COLOR: Record<Star, string> = { 1: '#f2efe2', 2: '#7cd88a', 3: '#6eb4ff', 4: '#ffd04a', 5: '#ff8ad8' };
const RAINBOW = ['#ff6b6b', '#ffb84a', '#ffe66b', '#7ce08a', '#6bc8ff', '#b48aff'];
const stars = (n: number) => '★'.repeat(n) + '☆'.repeat(5 - n);

export function drawFukubiki(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const f = g.fukubiki;
  const c = g.collection;
  if (!f || !c) return;
  sc.shifted(0, e.y0 / 2, () => {
    drawSignboard(g, 160, 4, 160, 30);
    sc.TB('ふくびき', LW / 2, 10, 15, '#ffd98a', 'center', '#3a1408');
    // 左：ガラガラ
    sc.panel(10, 40, 196, 166, 'rgba(48,30,18,0.96)', '#8a6232');
    drawDrum(g, 108, 104, f.anim, f.last?.star ?? 1, !!f.last);
    // 右：お金と結果
    const x = 214;
    const w = 256;
    sc.panel(x, 40, w, 166, 'rgba(36,23,14,0.95)', '#8a6232');
    sc.T('貯金箱', x + 10, 47, 8, C.cream2);
    sc.TB(`${c.coins.toLocaleString()}円`, x + 10, 57, 13, C.gold3, 'left', C.ink);
    sc.T('おまけ札', x + 118, 47, 8, C.cream2);
    sc.TB(`${c.tickets}枚`, x + 118, 57, 13, '#a9f0e4', 'left', C.ink);
    const price = c.freeUsed ? `1回 ${PULL_PRICE.toLocaleString()}円` : '最初の1回は無料！';
    sc.T(price, x + w - 10, 60, 8, c.freeUsed ? C.cream : '#ffb8d0', 'right');
    sc.PR(x + 8, 75, w - 16, 0.8, '#6b4422');
    if (f.exchange) drawExchange(g, x, w);
    else if (f.last && f.anim >= FUKUBIKI_ANIM) drawCards(g, x, w);
    else if (!f.last) {
      sc.T('売上を貯めて、ふくびきを引こう', x + w / 2, 110, 9, C.cream, 'center');
      sc.T('かぶった飾りは「おまけ札」になり、', x + w / 2, 132, 8, C.cream2, 'center');
      sc.T('好きな飾りと交換できます', x + w / 2, 144, 8, C.cream2, 'center');
    }
    if (f.message) sc.T(f.message, LW / 2, 210, sc.fitSize(f.message, 8, LW - 20), '#ffb6a4', 'center');
    else if (f.exchange) sc.T('↑↓でえらぶ　←→で8つ送る　Enterで交換', LW / 2, 210, 7, C.cream2, 'center');
  });
  // 下：木の台と札
  sc.PR(e.x0, 224, e.w, e.y1 - 224, '#2a1a10');
  sc.PR(e.x0, 224, e.w, 2, '#a8743f');
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    const items = g.menuItems();
    if (f.exchange) { button(g, items[0], 26, 232, 130, 30, 'plain', 'Esc', '◀'); return; }
    button(g, items[0], 150, 226, 150, 38, 'primary', 'Enter');
    button(g, items[1], 312, 230, 100, 30, 'plain');
    button(g, items[2], 26, 230, 110, 30, 'plain', 'Esc', '◀');
  });
}

/** ガラガラ：回っている間は胴が回り、止まると玉が転がり出る */
function drawDrum(g: Game, cx: number, cy: number, anim: number, star: Star, pulled: boolean) {
  const sc = g.sc;
  const spin = pulled && anim < SPIN;
  const rot = spin ? anim * 18 : 0.4;
  // 台
  sc.PR(cx - 44, cy + 44, 88, 8, '#6b4422');
  sc.PR(cx - 36, cy + 30, 6, 16, '#5a3a1c');
  sc.PR(cx + 30, cy + 30, 6, 16, '#5a3a1c');
  // 八角の胴（8つの板を回して描く）
  for (let i = 0; i < 8; i++) {
    const a = rot + (i * Math.PI) / 4;
    sc.PR(cx + Math.cos(a) * 26 - 9, cy + Math.sin(a) * 26 - 9, 18, 18, i % 2 ? '#c0392b' : '#e8b85a');
  }
  sc.PR(cx - 14, cy - 14, 28, 28, '#8a2a1e');
  sc.PR(cx - 3, cy - 3, 6, 6, '#ffd98a');
  // 取っ手
  const ha = rot * 1.3;
  sc.PR(cx + Math.cos(ha) * 20 - 2, cy + Math.sin(ha) * 20 - 2, 4, 4, '#3a2414');
  if (!pulled) {
    sc.T('「ひく」で回す', cx, cy + 58, 8, C.cream2, 'center');
    return;
  }
  // 玉：胴の口から受け皿へ
  if (anim >= SPIN * 0.8) {
    const p = Math.min(1, (anim - SPIN * 0.8) / 0.35);
    const bx = cx + 30 + p * 26;
    const by = cy + 26 + p * p * 24;
    const col = star === 5 ? RAINBOW[Math.floor(g.t * 8) % RAINBOW.length] : STAR_COLOR[star];
    if (star >= 4) sc.radialGlow(bx + 4, by + 4, 18, col, 0.5);
    sc.PR(bx, by, 9, 9, col);
    sc.PR(bx + 2, by + 1, 3, 2, '#ffffff', 0.7);
  }
}

/** 引いた結果のカード（二つ名は前と後ろの2枚） */
function drawCards(g: Game, x: number, w: number) {
  const sc = g.sc;
  const r = g.fukubiki!.last!;
  const n = r.items.length;
  const cw = n === 2 ? 116 : 180;
  r.items.forEach((got, k) => {
    const it = itemById(got.id);
    if (!it) return;
    const cx = n === 2 ? x + 8 + k * (cw + 8) : x + (w - cw) / 2;
    const cy = 82;
    const ch = 110;
    const col = STAR_COLOR[it.star];
    if (it.star >= 4) sc.radialGlow(cx + cw / 2, cy + ch / 2, 70, col, 0.25);
    sc.panel(cx, cy, cw, ch, 'rgba(58,36,22,0.98)', col);
    sc.T(stars(it.star), cx + cw / 2, cy + 5, 9, col, 'center');
    sc.T(KIND_NAME[it.kind], cx + cw / 2, cy + 18, 7, C.cream2, 'center');
    const mid = cy + 32;
    if (it.kind === 'sticker') drawSticker(sc, g.stickerArt, it, cx + cw / 2 - 20, mid, 40, g.t, true);
    else if (it.kind === 'plate') drawNameplate(sc, cx + 8, mid + 12, cw - 16, 16, g.settings.rankingName || '店主', { titleFront: null, titleLink: null, titleBack: null, plate: it.id }, 9, g.t);
    else sc.TB(it.name, cx + cw / 2, mid + 12, sc.fitSize(it.name, 14, cw - 12, 8), '#f2efe2', 'center', C.ink);
    if (it.kind === 'sticker' || it.kind === 'plate') sc.T(it.name, cx + cw / 2, cy + 76, sc.fitSize(it.name, 8, cw - 10, 6), '#f2efe2', 'center');
    const tag = got.isNew ? 'NEW!' : `かぶり → おまけ札 +${got.tickets}`;
    sc.TB(tag, cx + cw / 2, cy + 92, got.isNew ? 10 : 8, got.isNew ? '#ff8a7a' : '#a9f0e4', 'center', C.ink);
  });
}

/** 交換の一覧：まだ持っていないふくびきの飾り（☆の高い順） */
function drawExchange(g: Game, x: number, w: number) {
  const sc = g.sc;
  const ex = g.fukubiki!.exchange!;
  const list = g.exchangeList();
  const c = g.collection!;
  sc.T('おまけ札で交換（必要な枚数）', x + 10, 80, 8, C.gold3);
  sc.T(`☆1〜5：${[1, 2, 3, 4, 5].map((s) => EXCHANGE_COST[s as Star]).join('・')}枚`, x + w - 10, 80, 7, C.cream2, 'right');
  if (!list.length) { sc.T('ぜんぶそろっています！', x + w / 2, 130, 10, C.gold3, 'center'); return; }
  const rows = 8;
  const top = Math.max(0, Math.min(list.length - rows, ex.sel - Math.floor(rows / 2)));
  for (let k = 0; k < rows; k++) {
    const it = list[top + k];
    if (!it) break;
    const y = 92 + k * 13.5;
    const sel = top + k === ex.sel;
    const cost = EXCHANGE_COST[it.star];
    const enough = c.tickets >= cost;
    if (sel) sc.PR(x + 4, y - 1, w - 8, 13, '#4a2c1c');
    if (sel) sc.T('▶', x + 6, y + 1.5, 7, C.gold3);
    sc.T(stars(it.star), x + 14, y + 1.5, 7, STAR_COLOR[it.star]);
    sc.T(KIND_NAME[it.kind], x + 66, y + 1.5, 7, C.cream2);
    sc.T(it.name, x + 124, y + 0.5, sc.fitSize(it.name, 8.5, 92, 6), '#f2efe2');
    sc.T(`${cost}枚`, x + w - 8, y + 1.5, 7.5, enough ? '#a9f0e4' : '#a89a90', 'right');
  }
  if (top > 0) sc.T('▲', x + w - 10, 86, 6, C.cream2);
  if (top + rows < list.length) sc.T('▼', x + w - 10, 200, 6, C.cream2);
}
