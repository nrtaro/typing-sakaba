// 画面：記録・実績（タイトルの「きろく」）と、家族の会話を読む画面
import { C, type Color } from '../palette';
import { LW, type Screen } from '../screen';
import { ACHIEVEMENTS, GROUP_NAME, currentStreak, longestStreak, type Records } from '../../core/achievements';
import { jstDate } from '../../core/daily';
import { achievementItem, type Kind } from '../../core/collection';
import type { Game } from '../game';
import { button, drawSignboard } from './common';
import { drawStickerBook } from './stickerBook';
import { drawDecor } from './decor';
import { PORTRAIT } from '../sprites';
import type { FamilyId } from '../../core/shopConfig';

const SPEAKER_COLOR: Record<string, Color> = { おやじ: '#ffb08a', 女将: '#9fe0d0', 看板娘: '#ffb8d0' };
const SPEAKER_ID: Record<string, FamilyId> = { おやじ: 'master', 女将: 'wife', 看板娘: 'daughter' };
/** 台詞の左に置く顔の欄の幅 */
const FACE_W = 22;
/** 一覧に一度に見せる行数 */
export const LIST_ROWS = 8;

/**
 * 文を、決まった幅に収まるように折り返す。日本語は1文字ずつ。
 * 数字・倍率・英字のひと続き（x1.4、+150、Lv2 など）は途中で切らない（幅より長いときだけ1文字ずつに戻す）
 */
export function wrapText(sc: Pick<Screen, 'W'>, text: string, size: number, width: number): string[] {
  const out: string[] = [];
  let line = '';
  const units = text.match(/[A-Za-z0-9.+\-×%]+|[\s\S]/gu) ?? [];
  for (const unit of units) {
    const parts = unit.length > 1 && sc.W(unit, size) > width ? [...unit] : [unit];
    for (const u of parts) {
      if (line && sc.W(line + u, size) > width && !/^[、。」』）！？…]$/.test(u)) {
        out.push(line);
        line = u;
      } else line += u;
    }
  }
  if (line) out.push(line);
  return out;
}

/** 会話の行：話者名と、折り返した台詞 */
export function dialogueRows(sc: Pick<Screen, 'W'>, index: number, width: number) {
  const a = ACHIEVEMENTS[index];
  const rows: { who: string | null; text: string; scene?: boolean }[] = [];
  if (a.scene) for (const t of wrapText(sc, a.scene, 8, width)) rows.push({ who: null, text: t, scene: true });
  for (const l of a.lines) {
    wrapText(sc, `「${l.text}」`, 9, width - FACE_W).forEach((t, k) => rows.push({ who: k === 0 ? l.who : '', text: t }));
  }
  return rows;
}

const REWARD_KIND: Record<Kind, string> = { front: '前の言葉', back: '後ろの言葉', plate: 'プレート', sound: '打鍵音', sticker: 'シール' };

/** 実績でもらえる飾りの説明（もらえていれば「受け取り済み」） */
export function rewardText(achievementId: string, got: boolean): string {
  const it = achievementItem(achievementId);
  if (!it) return '';
  return `報酬：${REWARD_KIND[it.kind]}「${it.name}」☆${it.star}${got ? '（受け取り済み）' : ''}`;
}

function progressText(r: Records, i: number) {
  const a = ACHIEVEMENTS[i];
  if (r.unlocked[a.id]) return '解放';
  if (!a.progress) return '条件を満たす営業で';
  const p = a.progress(r);
  return `${Math.min(p.now, p.goal).toLocaleString()} / ${p.goal.toLocaleString()}`;
}

export function drawRecords(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const view = g.recordsView;
  const r = g.records;
  if (!view || !r) return;
  const today = jstDate();
  sc.shifted(0, e.y0 / 2, () => {
    drawSignboard(g, 150, 4, 180, 30);
    sc.TB(TAB_TITLE[view.tab], LW / 2, 10, 15, '#ffd98a', 'center', '#3a1408');
    if (view.tab === 'stickers') {
      drawStickerBook(g);
      sc.T('←→でシリーズを切り替える　Tabでタブを切り替える', LW / 2, 210, 7, C.cream2, 'center');
      return;
    }
    if (view.tab === 'decor') { drawDecor(g); return; }
    // 左：遊んだ記録
    const px = 10;
    sc.panel(px, 40, 140, 166, 'rgba(34,50,42,0.96)', '#6b4422');
    const open = ACHIEVEMENTS.filter((a) => r.unlocked[a.id]).length;
    const stats: [string, string][] = [
      ['営業', `${r.plays.toLocaleString()}回`], ['出した料理', `${r.served.toLocaleString()}皿`], ['営業日', `${r.days.length}日`],
      ['連続', `${currentStreak(r.days, today)}日`], ['最長の連続', `${longestStreak(r.days)}日`],
      ['大物の魚', `${r.bigFish}匹`], ['鉄角ジカ', `${r.deer}頭`], ['実績', `${open} / ${ACHIEVEMENTS.length}`],
    ];
    stats.forEach(([k, v], i) => {
      const y = 48 + i * 19;
      sc.T(k, px + 8, y, 8, C.cream2);
      sc.TB(v, px + 132, y - 1, 10, C.gold3, 'right', C.ink);
    });
    // 右：実績の一覧（選んでいる行が見えるように送る）
    const lx = 158;
    const lw = 312;
    sc.panel(lx, 40, lw, 126, 'rgba(36,23,14,0.95)', '#8a6232');
    const top = Math.max(0, Math.min(ACHIEVEMENTS.length - LIST_ROWS, view.sel - Math.floor(LIST_ROWS / 2)));
    for (let k = 0; k < LIST_ROWS; k++) {
      const i = top + k;
      const a = ACHIEVEMENTS[i];
      if (!a) break;
      const y = 44 + k * 15;
      const sel = i === view.sel;
      const opened = !!r.unlocked[a.id];
      if (sel) sc.PR(lx + 3, y - 1, lw - 6, 14, '#4a2c1c');
      if (sel) sc.T('▶', lx + 5, y + 2, 7, C.gold3);
      sc.T(String(a.no).padStart(2, '0'), lx + 14, y + 1.5, 8, opened ? C.gold3 : C.gray);
      sc.T(a.title, lx + 30, y + 1, 9, opened ? '#f2efe2' : '#a89a90');
      if (opened && !r.read.includes(a.id)) sc.TB('NEW', lx + 30 + sc.W(a.title, 9) + 4, y + 1.5, 7, '#ff8a7a', 'left', C.ink);
      const p = progressText(r, i);
      sc.T(p, lx + lw - 8, y + 2, 7.5, opened ? '#a9f0e4' : C.cream2, 'right');
    }
    // 送りの印
    if (top > 0) sc.T('▲', lx + lw - 12, 41, 6, C.cream2);
    if (top + LIST_ROWS < ACHIEVEMENTS.length) sc.T('▼', lx + lw - 12, 158, 6, C.cream2);
    // 選んだ実績：章・条件・進み具合
    const a = ACHIEVEMENTS[view.sel];
    const opened = !!r.unlocked[a.id];
    sc.panel(lx, 170, lw, 36, 'rgba(48,30,18,0.96)', opened ? C.gold2 : '#6b4422');
    sc.T(`${GROUP_NAME[a.group]}・${String(a.no).padStart(2, '0')}「${a.title}」`, lx + 8, 173, 8, C.gold3);
    sc.T(a.condition, lx + 8, 185, sc.fitSize(a.condition, 8, lw - 16, 6), C.cream);
    const reward = rewardText(a.id, opened);
    sc.T(reward, lx + 8, 196, sc.fitSize(reward, 7, lw * 0.62, 5), opened ? '#ffd98a' : '#ffb8d0');
    if (a.progress && !opened) {
      const p = a.progress(r);
      const w = lw * 0.3;
      sc.PR(lx + lw - 8 - w, 198, w, 3, C.ink);
      sc.PR(lx + lw - 8 - w, 198, w * Math.min(1, p.now / p.goal), 3, C.gold2);
    }
    if (opened) sc.T('Enter で会話を読む', lx + lw - 8, 196, 7, '#a9f0e4', 'right');
    const hint = '↑↓でえらぶ　Enterで会話を読む　Tabでタブを切り替える';
    sc.T(hint, LW / 2, 210, 7, C.cream2, 'center');
  });
  sc.PR(e.x0, 224, e.w, e.y1 - 224, '#2a1a10');
  sc.PR(e.x0, 224, e.w, 2, '#a8743f');
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    const items = g.menuItems();
    button(g, items[0], 26, 232, 110, 30, 'plain', 'Esc', '◀');
    // タブ：今のタブに金の線
    const tabs: [number, typeof view.tab][] = [[1, 'achievements'], [2, 'stickers'], [3, 'decor']];
    for (const [i, tab] of tabs) {
      const x = 160 + (i - 1) * 102;
      if (!items[i]) continue;
      button(g, items[i], x, 232, 94, 30, 'plain');
      if (view.tab === tab) sc.PR(x + 6, 264, 82, 2, C.gold3);
    }
  });
  if (view.reading !== null) drawReader(g, view.reading, view.scroll);
}

const TAB_TITLE = { achievements: '記録・実績', stickers: 'シール帳', decor: 'プロフィール' } as const;

/** 会話を読む画面：話者ごとに色を分け、長い会話は↑↓で送る */
export function drawReader(g: Game, index: number, scroll: number) {
  const sc = g.sc;
  const e = sc.ext;
  const a = ACHIEVEMENTS[index];
  sc.cover(C.bg, 0.75);
  sc.shifted(0, e.y0 / 2, () => {
    const x = 34;
    const w = 412;
    const y = 18;
    const h = 214;
    sc.PR(x + 3, y + 4, w, h, '#0c0604', 0.6);
    sc.panel(x, y, w, h, '#2a1a10', '#c79a52');
    sc.TB(`${String(a.no).padStart(2, '0')}「${a.title}」`, x + 12, y + 8, 13, C.gold3, 'left', C.ink);
    sc.T(GROUP_NAME[a.group], x + w - 12, y + 11, 8, C.cream2, 'right');
    sc.PR(x + 10, y + 28, w - 20, 0.8, '#6b4422');
    const rows = dialogueRows(sc, index, w - 24);
    const visible = READER_ROWS;
    rows.slice(scroll, scroll + visible).forEach((row, k) => {
      const ry = y + 35 + k * 14;
      if (row.scene) { sc.T(row.text, x + 14, ry, 8, '#d9c2a0', 'left', 0.9); return; }
      if (row.who) drawFace(g, row.who, x + 12, ry - 2);
      sc.T(row.text, x + 12 + FACE_W, ry, 9, '#f2efe2');
    });
    if (scroll > 0) sc.T('▲', x + w - 16, y + 30, 7, C.gold3);
    if (scroll + visible < rows.length) sc.T('▼ 続き', x + w - 14, y + h - 30, 7, C.gold3, 'right');
    sc.T('↑↓で送る　←→でほかの会話　Enter・Escで閉じる', LW / 2, y + h - 14, 7, C.cream2, 'center');
  });
}

/** 話者の顔（イラスト。絵がまだ読めていなければ小さなドット絵） */
function drawFace(g: Game, who: string, x: number, y: number) {
  const sc = g.sc;
  const id = SPEAKER_ID[who];
  if (!id) return;
  sc.panel(x, y, 16, 13.5, '#1a0f08', SPEAKER_COLOR[who] ?? C.cream);
  if (g.art) g.art.drawHead(sc, `family-${id}`, 0, x + 2.5, y + 1.2, 11);
  else sc.spr(PORTRAIT[id], x + 1, y + 1, 1);
}

/** 会話の画面に一度に見せる行数 */
export const READER_ROWS = 10;
