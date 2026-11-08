// 画面：設定（段階6の手直し）。全体の音量と、BGM・効果音・打鍵音それぞれの音量
import { C } from '../palette';
import { LW } from '../screen';
import type { Game } from '../game';
import { button, drawSignboard } from './common';
import { VOLUME_NAMES } from '../audio';

/** 設定の欄（上から順に） */
export const SETTING_ROWS = [
  { key: 'volume', label: '全体の音量', note: 'すべての音（なし・小・中・大）' },
  { key: 'bgmLevel', label: 'BGM', note: 'お店や調達の音楽' },
  { key: 'seLevel', label: '効果音', note: '料理を出す音・お客の声・ふくびきなど' },
  { key: 'keyLevel', label: '打鍵音', note: 'キーを打つたびの音' },
] as const;

export function drawSettings(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  const v = g.settingsView;
  if (!v) return;
  const s = g.settings;
  sc.shifted(0, e.y0 / 2, () => {
    drawSignboard(g, 170, 4, 140, 30);
    sc.TB('設定', LW / 2, 10, 15, '#ffd98a', 'center', '#3a1408');
    sc.panel(40, 44, 400, 150, 'rgba(36,23,14,0.95)', '#8a6232');
    SETTING_ROWS.forEach((row, i) => {
      const y = 54 + i * 34;
      const sel = i === v.row;
      if (sel) sc.PR(44, y - 4, 392, 30, '#4a2c1c');
      if (sel) sc.T('▶', 50, y + 3, 9, C.gold3);
      sc.T(row.label, 64, y + 1, 11, sel ? C.gold3 : C.cream);
      sc.T(row.note, 64, y + 15, 7, C.cream2);
      if (row.key === 'volume') {
        const level = s.muted ? 0 : s.volume ?? 3;
        VOLUME_NAMES.forEach((name, k) => {
          const x = 250 + k * 44;
          const on = k === level;
          sc.panel(x, y, 38, 18, on ? '#ebc47e' : 'rgba(20,12,8,0.6)', on ? C.w : '#6b4422');
          sc.T(name, x + 19, y + 4, 9, on ? '#3a2414' : C.cream2, 'center');
        });
      } else {
        const n = s[row.key] ?? 8;
        for (let k = 0; k < 10; k++) sc.PR(250 + k * 14, y + 3, 11, 12, k < n ? C.gold2 : '#3a2414');
        sc.T(String(n), 400, y + 3, 10, sel ? C.gold3 : C.cream, 'left');
      }
    });
    sc.T('↑↓で欄をえらぶ　←→で変える（音量の8がはじめの大きさ）', LW / 2, 200, 7, C.cream2, 'center');
  });
  sc.PR(e.x0, 224, e.w, e.y1 - 224, '#2a1a10');
  sc.PR(e.x0, 224, e.w, 2, '#a8743f');
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    button(g, g.menuItems()[0], 26, 232, 130, 30, 'plain', 'Esc', '◀');
  });
}
