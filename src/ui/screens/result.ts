// 画面：result
import { PULL_PRICE } from '../../core/collection';
import { C } from '../palette';
import { LW } from '../screen';
import { dateLabel } from '../../core/daily';
import type { Game } from '../game';
import { chipWidth, drawCondChip } from './conditions';
import { button } from './common';
import { ACHIEVEMENTS } from '../../core/achievements';
import { DIFFICULTIES, type DifficultyId } from '../../core/shopConfig';

/** 結果画面の演出が終わって、選べるようになるまでの時間 */
export function resultStep(g: Game) {
  const r = g.result;
  if (!r) return;
  const age = g.t - g.resultAt;
  // 売上を数え上げる間、カチカチ鳴らす
  if (age > 0.3 && age < 1.6 && age - g.resultFx.tick > 0.06) {
    g.resultFx.tick = age;
    g.sound.tick();
  }
  if (!g.resultFx.stamped && age > 1.8) {
    g.resultFx.stamped = true;
    g.sound.stamp();
  }
  if (r.best && !g.resultFx.sparkled && age > 2.4) {
    g.resultFx.sparkled = true;
    g.sound.sparkle();
  }
  if (r.unlocked?.length && !g.resultFx.unlocked && age > 2.7) {
    g.resultFx.unlocked = true;
    g.sound.chord(4);
  }
}

export function drawResult(g: Game) {
  const sc = g.sc;
  const r = g.result;
  if (!r) return;
  const age = g.t - g.resultAt;
  const ease = (v: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 3);
  // 売上の後ろに、あたたかい明かり
  sc.radialGlow(LW / 2, 62, 140, '#ffb45a', 0.22 * ease(age / 0.6), 0.45);
  const daily = r.daily;
  sc.TB(daily ? `ひがわり営業 ${dateLabel(daily.date)}` : '本日の営業終了', LW / 2, 16, daily ? 14 : 16, C.gold3, 'center', C.ink, ease(age / 0.3));
  // ひがわり：今日のお題は2つとも右上に縦に並べ、左上に今日のランキング
  if (daily) {
    const d = g.settings.difficulty;
    const a = ease(age / 0.3);
    daily.conds.forEach((c, i) => drawCondChip(sc, g.art, c, d, LW - 8 - chipWidth(sc, c, d), 6 + i * 17, a));
    drawTodayBoard(g, r.difficultyId, a);
  }
  // 売上：数字が駆け上がり、止まった瞬間に少し弾む
  const count = Math.round(r.score * ease((age - 0.3) / 1.3));
  const pop = age > 1.6 && age < 1.8 ? 1 + (1.8 - age) * 0.6 : 1;
  sc.TB(`${count.toLocaleString()}円`, LW / 2, 40 - (pop - 1) * 10, 30 * pop, C.w, 'center', C.ink, ease(age / 0.3));
  // ランクの判子：大きく現れて押し付けられる
  if (age > 1.65) {
    const p = ease((age - 1.65) / 0.15);
    const scale = 2.2 - 1.2 * p;
    const cx = LW / 2 - 70;
    const cy = 92;
    const col = r.rank === 'S' ? '#ffd27a' : r.rank === 'A' ? '#ff9fbd' : r.rank === 'B' ? '#9cc4f6' : '#e8c9a0';
    sc.radialGlow(cx, cy, 20 * scale, col, 0.35 * p);
    sc.panel(cx - 14 * scale, cy - 14 * scale, 28 * scale, 28 * scale, '#3a1f18', col, Math.min(1, p * 1.5));
    sc.TB(r.rank, cx, cy - 11 * scale, 20 * scale, col, 'center', C.ink, Math.min(1, p * 1.5));
    sc.T(r.difficulty, cx + 26, cy - 11, 9, C.cream2, 'left', p);
    sc.TB(r.title, cx + 26, cy - 1, 13, C.pink, 'left', C.ink, p);
  }
  // 自己ベスト更新：帯と紙吹雪
  if (r.best && age > 2.3) {
    const p = ease((age - 2.3) / 0.25);
    const bw = 140 * p;
    sc.panel(LW / 2 - bw / 2, 112, bw, 16, '#7a2a3a', C.gold3, p);
    sc.TB(daily ? '今日のベスト更新！' : '自己ベスト更新！', LW / 2, 114, 11, C.gold3, 'center', C.ink, p);
    const colors = ['#ffd25c', '#ff7fb0', '#7fc8ff', '#7ff0d8', '#fff7ea'];
    for (let k = 0; k < 36; k++) {
      const t = age - 2.3 - (k % 6) * 0.08;
      if (t < 0) continue;
      const life = (t % 3) / 3;
      const x = ((k * 53) % 480) + Math.sin(t * 2 + k) * 8;
      const y = -6 + life * 280;
      sc.PR(x, y, 2, 1 + Math.abs(Math.sin(t * 6 + k)) * 2, colors[k % colors.length], 0.9 * (1 - life));
    }
  }
  // ひがわりで更新しなかったときは、今日のベストを小さく見せる
  if (daily && !r.best && age > 2.3) {
    const best = g.store.loadDailyBest(daily.date, g.settings.difficulty);
    if (best) sc.T(`今日のベスト ${best.score.toLocaleString()}円`, LW / 2, 116, 9, C.cream2, 'center', ease((age - 2.3) / 0.25));
  }
  // 成績：左から順に浮かび上がる
  const stats = [
    [`${r.served}皿`, '出した料理'], [`${r.maxCombo}`, '最大コンボ'], [`${r.angry}人`, '怒って帰った客'],
    [`${r.kps.toFixed(2)}`, '打鍵/秒'], [`${(r.accuracy * 100).toFixed(1)}%`, '正確さ'], [`${r.trips}回`, '調達'],
  ];
  stats.forEach(([v, l], i) => {
    const p = ease((age - 2.0 - i * 0.06) / 0.25);
    if (p <= 0) return;
    const x = 28 + i * 72;
    const y = 136 + (1 - p) * 10;
    sc.panel(x, y, 66, 44, 'rgba(42,27,38,0.92)', C.wood4, p);
    sc.TB(v, x + 33, y + 4, 14, C.gold3, 'center', C.ink, p);
    sc.T(l, x + 33, y + 27, 9, C.cream, 'center', p);
  });
  if (daily && age > 2.3) {
    const sent = g.submission;
    const text = sent.receipt ? `今日${sent.receipt.rank}位 ／ ${sent.receipt.total}人中（自分のベスト）`
      : sent.state === 'sending' ? 'ランキングに送信中…'
      : sent.state === 'error' ? `${sent.message}（端末の記録は保存済み）`
      : g.settings.rankingName ? `この結果を今日のランキングに載せますか？（名前：${g.settings.rankingName}）` : 'この結果を今日のランキングに載せますか？';
    sc.T(text, LW / 2, 183, sc.fitSize(text, 9, LW - 24), sent.state === 'error' ? '#ffb6a4' : C.gold3, 'center');
  }
  // 新しく開いた実績（判子の右）
  if (r.unlocked?.length && age > 2.6) {
    const p = ease((age - 2.6) / 0.3);
    const first = ACHIEVEMENTS.find((a) => a.id === r.unlocked[0]);
    const x = 334;
    const y = 72;
    const w = 138;
    sc.radialGlow(x + w / 2, y + 18, 60, '#ffd27a', 0.25 * p);
    sc.panel(x, y, w, 38, 'rgba(58,31,24,0.95)', C.gold3, p);
    sc.TB(`実績が開いた！${r.unlocked.length > 1 ? `（${r.unlocked.length}件）` : ''}`, x + 6, y + 3, 9, C.gold3, 'left', C.ink, p);
    if (first) {
      const name = `「${first.title}」${r.unlocked.length > 1 ? 'ほか' : ''}`;
      sc.T(name, x + 6, y + 15, sc.fitSize(name, 8, w - 12, 6), '#f2efe2', 'left', p);
    }
    sc.T('タイトルの「きろく」で会話が読めます', x + 6, y + 27, sc.fitSize('タイトルの「きろく」で会話が読めます', 6.5, w - 12, 5), C.cream2, 'left', p);
  }
  // 売上を貯金箱へ：小さく1行だけ（実績のお知らせがあればその下）
  if (r.credited && age > 2.6) {
    const p = ease((age - 2.6) / 0.3);
    const short = PULL_PRICE - (r.coins ?? 0);
    const line = `貯金箱 +${r.credited.toLocaleString()}円${r.canPull ? '' : short > 0 ? `（ふくびきまで あと${short.toLocaleString()}円）` : ''}`;
    sc.T(line, 334 + 4, r.unlocked?.length ? 114 : 74, sc.fitSize(line, 7.5, 130, 5.5), r.canPull ? C.gold3 : '#f2efe2', 'left', p);
  }
  // 家族が見送る
  if (g.art) {
    const p = ease((age - 0.4) / 0.5);
    for (const [id, x, hgt] of [['master', 28, 58], ['wife', 430, 52], ['daughter', 458, 46]] as const) {
      g.art.drawAnim(sc, `family-${id}`, '待機', g.t, x, 268 + (1 - p) * 30, g.art.scaleFor(`family-${id}`, 0, hgt), false, p);
    }
  }
}

/** 左上：今日のひがわり（遊んだ難易度）のランキングの上位5人と、自分の順位 */
function drawTodayBoard(g: Game, difficulty: DifficultyId, a: number) {
  const sc = g.sc;
  const boards = g.boards;
  const board = boards?.date === g.result?.daily?.date && boards?.state === 'ready' ? boards.value?.[difficulty] : null;
  const x = 8;
  const y = 6;
  const w = 134;
  const rows = board?.top.slice(0, 5) ?? [];
  const h = 18 + Math.max(1, rows.length) * 11 + (board?.me ? 11 : 0);
  sc.panel(x, y, w, h, 'rgba(34,50,42,0.92)', '#6b4422', a);
  const name = DIFFICULTIES.find((d) => d.id === difficulty)?.name ?? '';
  sc.T(`今日のランキング・${name}`, x + 6, y + 4, 7.5, C.gold3, 'left', a);
  if (!board) {
    sc.T(boards?.state === 'error' ? '今はつながりません' : '読み込み中…', x + 6, y + 18, 7.5, C.cream2, 'left', a);
    return;
  }
  if (!rows.length) sc.T('まだ記録がありません', x + 6, y + 18, 7.5, C.cream2, 'left', a);
  rows.forEach((s, k) => {
    const ry = y + 17 + k * 11;
    const col = k === 0 ? '#ffd27a' : k === 1 ? '#e8e4d4' : k === 2 ? '#e8b48a' : C.cream;
    const score = `${s.score.toLocaleString()}円`;
    sc.T(`${s.rank}`, x + 10, ry, 7.5, col, 'center', a);
    sc.T(s.name, x + 18, ry, sc.fitSize(s.name, 7.5, w - 26 - sc.W(score, 7), 5), '#f2efe2', 'left', a);
    sc.T(score, x + w - 6, ry + 0.5, 7, col, 'right', a);
  });
  if (board.me) {
    const my = `あなた：${board.me.rank}位（${board.me.score.toLocaleString()}円）`;
    sc.T(my, x + 6, y + 17 + rows.length * 11, sc.fitSize(my, 7, w - 12, 5), '#a9f0e4', 'left', a);
  }
}

/**
 * 結果画面の札：家族の絵（左右の下の角）に重ならないよう、真ん中に2段で並べる。
 * 上の段は Enter で選ぶ大きな札（名前を入れる／もういちど）、下の段はほかの札を小さく並べる。
 */
export function drawResultMenu(g: Game) {
  const items = g.menuItems();
  if (!items.length) return;
  const [main, ...rest] = items;
  const mw = 168;
  button(g, main, LW / 2 - mw / 2, 196, mw, 33, 'primary', 'Enter');
  const w = 104;
  const gap = 8;
  const total = rest.length * w + (rest.length - 1) * gap;
  rest.forEach((it, k) => {
    const last = k === rest.length - 1;
    const bx = LW / 2 - total / 2 + k * (w + gap);
    button(g, it, bx, 238, w, 27, 'plain', last ? 'Esc' : undefined);
    // ふくびきが引けるときの印（タイトルの札と同じ）
    if (it.kana === 'ふくびき') {
      g.sc.panel(bx + w / 2 - 19, 229, 38, 10, '#2a5a3a', C.gold3);
      g.sc.T('引ける！', bx + w / 2, 230.5, 6.5, C.gold3, 'center');
    }
  });
}
