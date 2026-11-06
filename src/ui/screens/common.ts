// 画面：common
import { C } from '../palette';
import { LW } from '../screen';
import { VOLUME_NAMES } from '../audio';
import { RomajiMatcher } from '../../core/romaji';
import type { Game } from '../game';

import { CLICK_HINT, IME_HINT, MenuItem } from './shared';

/** 音量を変えた直後だけ、右上に4段のメーターを出す */
export function drawVolume(g: Game) {
  if (g.volumeShown <= 0) return;
  const sc = g.sc;
  const a = Math.min(1, g.volumeShown * 3);
  const x = sc.ext.x1 - 92;
  const y = sc.ext.y0 + 30;
  sc.panel(x, y, 84, 20, 'rgba(42,27,38,0.95)', C.gold, a);
  sc.T(`音量 ${VOLUME_NAMES[g.volume]}`, x + 6, y + 5, 9, C.cream, 'left', a);
  for (let i = 0; i < 3; i++) sc.PR(x + 52 + i * 9, y + 13 - i * 3, 6, 4 + i * 3, i < g.volume ? C.gold : C.ink, a);
}

export function drawMenu(g: Game, y: number) {
  const sc = g.sc;
  const items = g.menuItems();
  if (g.mode === 'title') return;
  if (g.mode === 'difficulty') return;
  if (g.mode === 'help') {
    button(g, items[items.length - 1], 22, 226, 116, 30, 'plain', 'Esc', '◀');
    if (g.helpPage === 0) button(g, items[items.length - 2], 300, 222, 158, 38, 'primary');
    return;
  }
  const iw = items.length >= 4 ? 108 : 124;
  const gap = items.length >= 4 ? 8 : 12;
  const def = g.enterItem();
  const total = items.length * iw + (items.length - 1) * gap;
  const typing = g.menu.typed.length > 0;
  items.forEach((it, k) => {
    const x = LW / 2 - total / 2 + k * (iw + gap);
    const live = g.menu.active.find((l) => l.target.id === it.kana);
    const dim = typing && !live;
    const isDefault = !typing && def === it && g.mode === 'difficulty';
    const yy = live ? y - 2 : y;
    if (live) sc.glow(x, yy, iw, 40);
    sc.panel(x, yy, iw, 40, live ? '#4a2c3c' : 'rgba(42,27,38,0.95)', live || isDefault ? C.gold : C.wood4, dim ? 0.4 : 1);
    sc.T(it.text, x + iw / 2, yy + 3, 14, dim ? C.gray : C.w, 'center', dim ? 0.5 : 1);
    const m = live?.matcher ?? new RomajiMatcher(it.kana);
    sc.roma(m.typed, m.remaining, x + iw / 2, yy + 23, 11, live ? 'active' : dim ? 'dim' : 'idle');
    if (k === 0 && !typing) sc.keycap('Enter', x + iw - 30, yy - 7, 6);
    if (g.mode === 'result' && k === items.length - 1 && !typing) sc.keycap('Esc', x + iw - 22, yy - 7, 6);
  });
}

export function drawMenuScreen(g: Game, title: string, sub: string) {
  const sc = g.sc;
  sc.cover(C.bg, 0.6);
  sc.TB(title, LW / 2, 92, 20, C.gold3, 'center');
  if (sub) sc.TB(sub, LW / 2, 122, 10, C.cream, 'center');
  drawMenu(g, 146);
}

/**
 * 打って選ぶ札。打ち始めると合う札が浮き上がって光り、下の帯が打った分だけ伸びる。
 * 合わない札は暗く沈む。primary は明るい木札、plain は暗い札。
 */
export function button(g: Game, it: MenuItem, x: number, y: number, w: number, h: number, style: 'primary' | 'plain', key?: string, mark?: string) {
  const sc = g.sc;
  const live = g.menu.active.find((l) => l.target.id === it.kana);
  const typing = g.menu.typed.length > 0;
  const dim = typing && !live;
  const m = live?.matcher ?? new RomajiMatcher(it.kana);
  const a = 1;
  const yy = live ? y - 2 : y;
  const primary = style === 'primary';
  sc.PR(x + 1, y + 3, w, h, '#0c0604', 0.55 * a);
  if (live) sc.glow(x, yy, w, h, C.gold3);
  sc.panel(x, yy, w, h, primary ? (live ? '#ffe9b4' : '#ebc47e') : (live ? '#4d3020' : 'rgba(36,23,14,0.94)'),
    primary ? (live ? C.w : '#b9883f') : (live ? C.gold3 : '#8a6232'), a);
  if (primary) sc.PR(x + 2, yy + 2, w - 4, 1, '#fff3d4', 0.6 * a);
  const label = (mark ? `${mark} ` : '') + it.text;
  const size = primary ? 16 : 12;
  const romaSize = primary ? 10 : 8;
  const left = !!key;
  sc.T(label, left ? x + 12 : x + w / 2, yy + (primary ? 4 : 3), size, primary ? '#3a2414' : C.cream, left ? 'left' : 'center', a);
  const romaW = sc.W(m.typed + m.remaining, romaSize);
  const romaX = left ? x + 12 + (mark ? sc.W(`${mark} `, size) : 0) + romaW / 2 : x + w / 2;
  const romaY = yy + (primary ? 23 : 17);
  // クリックされた直後は、打つべきローマ字を光らせて「ここを打つ」と示す
  const clicked = g.t - g.clickHintAt < CLICK_HINT;
  if (clicked && !live) sc.glow(romaX - romaW / 2 - 2, romaY - 1, romaW + 4, romaSize + 3, C.gold, 0.6 + 0.4 * Math.sin(g.t * 12));
  // 何もしないで待っていると、一番上の札が自分で打たれていく見本を見せる
  const ghost = primary && !typing && g.mode === 'title' ? ghostCount(g, m.remaining.length) : 0;
  if (ghost > 0) {
    const full = m.remaining;
    sc.roma(full.slice(0, ghost), full.slice(ghost), romaX, romaY, romaSize, 'active', 1, primary);
    sc.PR(x + 3, yy + h - 3, (w - 6) * (ghost / full.length), 2, '#3f8a6c', 0.7);
  } else sc.roma(m.typed, m.remaining, romaX, romaY, romaSize, live ? 'active' : dim ? 'dim' : 'idle', 1, primary);
  // 打った分だけ伸びる帯（どの札に向かって打っているかを一目で見せる）
  const total = m.typed.length + m.remaining.length;
  if (live && total) sc.PR(x + 3, yy + h - 3, (w - 6) * (m.typed.length / total), 2, primary ? '#3f8a6c' : C.teal3);
  if (key && !typing) {
    const kw = sc.W(key, 7) + 7.7;
    sc.keycap(key, x + w - kw - 8, yy + h / 2 - 6, 7, a);
  }
  // 合わない札は、透かさずに暗い幕をかけて沈める
  if (dim) sc.PR(x, yy, w, h, '#0e0805', 0.62);
}

/**
 * 打ち方の見本：最後の操作から少し待つと、1文字ずつ打たれていき、打ち終わると少し止まって最初から。
 * 返すのは「打った」ことにする文字数（0 なら見本なし）。
 */
export function ghostCount(g: Game, len: number) {
  const idle = g.t - g.lastInput - 2.5;
  if (idle < 0 || len === 0) return 0;
  const cycle = len * 0.22 + 1.2;
  const p = idle % cycle;
  return Math.min(len, Math.floor(p / 0.22) + 1);
}

/** 小さなキーボードの絵 */
export function drawKeyboard(g: Game, x: number, y: number, a = 1) {
  const sc = g.sc;
  sc.panel(x, y, 22, 11, '#f1dcae', '#8a6232', a);
  const press = Math.floor(g.t * 4) % 7;
  for (let r = 0; r < 2; r++) for (let c = 0; c < 6; c++) {
    const on = r * 6 + c === press;
    sc.PR(x + 2.5 + c * 3, y + 2.5 + r * 3, 2, 2, on ? C.gold2 : '#8a6232', a);
  }
  sc.PR(x + 6, y + 8.5, 10, 1.5, '#8a6232', a);
}

/** メニューでクリックされたとき：画面の中央下に「キーボードで打ってね」 */
/** 日本語入力がオンのとき：画面の中央に、オフにする方法をはっきり出す（遊んでいる最中も出す） */
export function drawImeHint(g: Game) {
  const age = g.t - g.imeHintAt;
  if (age >= IME_HINT) return;
  const sc = g.sc;
  const a = Math.min(1, age * 8, (IME_HINT - age) * 2);
  const bob = Math.sin(age * 12) * Math.max(0, 1 - age * 2.5) * 3;
  const title = '日本語入力がオンになっています';
  const sub = 'キーボードの「半角/全角」キーで、半角英数にしてください';
  const w = Math.max(sc.W(title, 12), sc.W(sub, 9)) + 56;
  const x = LW / 2 - w / 2;
  const y = 110 + bob;
  sc.PR(x + 2, y + 3, w, 40, '#0c0604', 0.55 * a);
  sc.panel(x, y, w, 40, '#fff3d6', '#d9534f', a);
  // 「あ」→「A」の切り替えの絵
  sc.panel(x + 9, y + 9, 14, 14, '#f1dcae', '#8a6232', a);
  sc.T('あ', x + 16, y + 11, 9, '#a8363f', 'center', a);
  sc.T('▶', x + 26, y + 13, 6, '#8a6232', 'left', a);
  sc.panel(x + 33, y + 9, 14, 14, '#f1dcae', '#8a6232', a);
  sc.T('A', x + 40, y + 11, 9, '#215a4a', 'center', a);
  sc.T(title, x + 54, y + 6, 12, '#a8363f', 'left', a);
  sc.T(sub, x + 54, y + 24, 9, '#3a2414', 'left', a);
}

export function drawClickHint(g: Game) {
  const age = g.t - g.clickHintAt;
  if (age >= CLICK_HINT) return;
  const sc = g.sc;
  const a = Math.min(1, age * 6, (CLICK_HINT - age) * 2);
  const bob = Math.sin(age * 10) * Math.max(0, 1 - age * 2) * 3;
  const text = 'クリックではなく、キーボードで打って選びます';
  const w = sc.W(text, 10) + 44;
  const x = LW / 2 - w / 2;
  const y = 150 + bob;
  sc.PR(x + 2, y + 3, w, 24, '#0c0604', 0.5 * a);
  sc.panel(x, y, w, 24, '#fff3d6', C.gold2, a);
  drawKeyboard(g, x + 8, y + 6.5, a);
  sc.T(text, x + 36, y + 6, 10, '#3a2414', 'left', a);
}

/** 吊り看板：鎖で下がった木の板に店名を彫る */
export function drawSignboard(g: Game, x: number, y: number, w: number, h: number, chainFrom?: number) {
  const sc = g.sc;
  for (const cx of [x + 28, x + w - 28]) for (let cy = chainFrom ?? sc.ext.y0; cy < y; cy += 4) {
    sc.PR(cx - 1.5, cy, 3, 2.5, '#8a6a44');
    sc.PR(cx - 0.5, cy + 2.5, 1, 1.5, '#5a4128');
  }
  sc.PR(x + 3, y + 4, w, h, '#0c0604', 0.6);
  sc.panel(x, y, w, h, '#6b4422', '#2e1a0c');
  sc.PR(x + 2, y + 2, w - 4, 1.5, '#a8743f', 0.8);
  sc.PR(x + 2, y + h - 3, w - 4, 1.5, '#3c220f', 0.9);
  sc.panel(x + 5, y + 5, w - 10, h - 10, '#5e3b1d', '#c79a52');
  for (let k = 1; k < 4; k++) sc.PR(x + 7, y + 6 + k * (h - 12) / 4, w - 14, 0.8, '#4f3117', 0.7);
  for (const [nx, ny] of [[x + 9, y + 9], [x + w - 11, y + 9], [x + 9, y + h - 11], [x + w - 11, y + h - 11]]) {
    sc.PR(nx, ny, 2, 2, '#d8b06a');
    sc.PR(nx + 1, ny + 1, 1, 1, '#4a2c12');
  }
}
