// 画面：result
import { PULL_PRICE } from '../../core/collection';
import { C } from '../palette';
import { LW } from '../screen';
import { dateLabel } from '../../core/daily';
import type { Game } from '../game';
import { chipWidth, drawCondChip } from './conditions';
import { button } from './common';
import { ACHIEVEMENTS } from '../../core/achievements';

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
  // ひがわり：上の両端に今日のお題
  if (daily) {
    const d = g.settings.difficulty;
    const a = ease(age / 0.3);
    daily.conds.forEach((c, i) => drawCondChip(sc, g.art, c, d, i === 0 ? 10 : LW - 10 - chipWidth(sc, c, d), 6, a));
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
      : '名前を付けて、今日のランキングへ';
    sc.T(text, LW / 2, 185, sc.fitSize(text, 9, LW - 24), sent.state === 'error' ? '#ffb6a4' : C.gold3, 'center');
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
  // 段階6：売上を貯金箱へ（実績のお知らせがあればその下）
  if (r.credited !== undefined && age > 2.6) {
    const p = ease((age - 2.6) / 0.3);
    const x = 334;
    const y = r.unlocked?.length ? 112 : 72;
    const w = 138;
    const can = (r.coins ?? 0) >= PULL_PRICE;
    sc.panel(x, y, w, can ? 26 : 16, 'rgba(36,40,30,0.95)', can ? C.gold3 : '#8a6232', p);
    const line = `本日の売上 ＋${r.credited.toLocaleString()}円 → 貯金箱`;
    sc.T(line, x + 6, y + 3.5, sc.fitSize(line, 7.5, w - 12, 5.5), '#f2efe2', 'left', p);
    if (can) sc.T('ふくびきが引けます（タイトルの「ふくびき」）', x + 6, y + 14.5, sc.fitSize('ふくびきが引けます（タイトルの「ふくびき」）', 6.5, w - 12, 5), C.gold3, 'left', p);
  }
  // 家族が見送る
  if (g.art) {
    const p = ease((age - 0.4) / 0.5);
    for (const [id, x, hgt] of [['master', 28, 58], ['wife', 452, 52]] as const) {
      g.art.drawAnim(sc, `family-${id}`, '待機', g.t, x, 268 + (1 - p) * 30, g.art.scaleFor(`family-${id}`, 0, hgt), false, p);
    }
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
  const mw = 186;
  button(g, main, LW / 2 - mw / 2, 194, mw, 37, 'primary', 'Enter');
  const w = 104;
  const gap = 8;
  const total = rest.length * w + (rest.length - 1) * gap;
  rest.forEach((it, k) => {
    const last = k === rest.length - 1;
    button(g, it, LW / 2 - total / 2 + k * (w + gap), 237, w, 27, 'plain', last ? 'Esc' : undefined);
  });
}
