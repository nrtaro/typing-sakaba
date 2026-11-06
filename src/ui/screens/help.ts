// 画面：help
import { C, TRIP_COLOR } from '../palette';
import { AMBER } from '../amber/layout';
import { RomajiMatcher } from '../../core/romaji';
import { FAMILY_NAME, INGREDIENT_NAME, TRIPS } from '../../core/shopConfig';
import { dailyConditions, jstDate } from '../../core/daily';
import type { Game } from '../game';
import { drawCondChip } from './conditions';

import { TRIP_HELP, ICON_FOR, splitHot } from './shared';

/** 遊び方の試し打ち：料理は提供の演出、調達は家族が出かける演出（本番と同じ音） */
export function helpPlay(g: Game, kind: 'dish' | 'fishing' | 'hunting') {
  if (kind === 'dish') {
    g.helpFx.push({ kind, x: 106, y: 76, start: g.t });
    g.sound.serve();
  } else {
    g.helpFx.push({ kind, x: kind === 'fishing' ? 241 : 277, y: 94, start: g.t });
    g.sound.tripStart();
  }
}

/**
 * 遊び方の札：本番の注文札と同じ見た目にし、何も打っていない間も「次に打つ文字」を光らせ、
 * 横でキーが押されている絵を動かして、打てる札だと見て分かるようにする。
 */
export function helpWord(g: Game, kana: string, text: string, cx: number, y: number, size: number) {
  const sc = g.sc;
  const live = g.menu.active.find((l) => l.target.id === kana);
  const typing = g.menu.typed.length > 0;
  const dim = typing && !live;
  const m = live?.matcher ?? new RomajiMatcher(kana);
  const w = Math.max(sc.W(text, size + 2), sc.W(m.typed + m.remaining, size)) + 16;
  const h = size * 2 + 14;
  // 何も打っていない間は、ゆっくり呼吸するように光らせる
  if (live) sc.glow(cx - w / 2, y, w, h);
  else if (!typing) sc.glow(cx - w / 2, y, w, h, C.gold3, 0.45 + 0.35 * Math.sin(g.t * 3));
  sc.panel(cx - w / 2, y, w, h, live ? '#4a2c3c' : '#211712', live ? C.gold : dim ? C.wood3 : C.gold2);
  sc.T(text, cx, y + 3, size + 2, dim ? '#a89a90' : C.cream, 'center');
  sc.roma(m.typed, m.remaining, cx, y + size + 8, size, dim ? 'dim' : 'active');
  // 右上で、次に打つキーが押されている絵（押す・離すを繰り返す）
  if (!dim) {
    const next = (m.remaining[0] ?? '').toUpperCase();
    const down = Math.floor(g.t * 2.5 + cx) % 2 === 0;
    const kx = cx + w / 2 - 4;
    const ky = y - 9 + (down ? 1.5 : 0);
    sc.PR(kx + 1, y - 6, 12, 12, '#1a0f08', 0.7);
    sc.panel(kx, ky, 12, 12, down ? '#e3c890' : '#f6e2b8', '#8a6232');
    sc.T(next, kx + 6, ky + 2, 8, '#3a2414', 'center');
  }
}

/**
 * 遊び方：①料理を出す → ②足りなくなったら調達 → ③3分で売上勝負、の流れを矢印でつなぐ。
 * ①②の札は実際に打って試せる。
 */
export function drawHelp(g: Game) {
  const sc = g.sc;
  sc.TB('遊び方', 24, 16, 22, C.gold3, 'left');
  sc.T('注文の料理を出して、３分間でたくさん売り上げよう', 112, 24, 10, C.cream);
  const steps = [
    { title: '料理を出す', lines: ['お客の頭上の料理名を', '打つと、料理を出せる'] },
    { title: '素材を調達', lines: ['素材が足りなくなったら', '下の言葉で集めに行く'] },
    { title: '3分で売上勝負', lines: ['閉店までにたくさん出して', '売上を伸ばそう'] },
  ];
  steps.forEach((st, i) => {
    const x = 22 + i * 147;
    const w = 132;
    const y = 50;
    const h = 132;
    sc.panel(x, y, w, h, 'rgba(55,37,23,0.94)', i === 0 ? C.gold2 : C.wood4);
    // 番号の丸と見出し
    sc.panel(x + 8, y + 7, 16, 16, C.gold2, C.ink);
    sc.TB(String(i + 1), x + 16, y + 9, 11, C.w, 'center', C.ink);
    sc.T(st.title, x + 29, y + 8, 12, C.cream);
    if (i === 0) {
      // お客と注文の札
      if (g.art) g.art.drawFrame(sc, 'guests-seated', 0, x + 22, y + 74, g.art.scaleFor('guests-seated', 0, 22));
      helpWord(g, 'やきざかな', '焼き魚', x + 84, y + 32, 8);
      sc.T('+120円', x + 84, y + 66, 9, C.gold, 'center');
    } else if (i === 1) {
      // 残りわずかの素材 → 家族が集めに行く
      const away = (k: string) => g.helpFx.some((f) => f.kind === k);
      if (g.art) {
        sc.panel(x + 8, y + 30, 40, 22, 'rgba(90,16,24,0.6)', '#ff5a4a');
        g.art.drawIcon(sc, 'icons-dishes', 0, x + 10, y + 32, 18);
        sc.TB('×0', x + 30, y + 35, 10, '#ff7a6a', 'left');
        if (!away('fishing')) g.art.drawHead(sc, 'family-wife', 0, x + 64, y + 28, 16);
        if (!away('hunting')) g.art.drawHead(sc, 'family-master', 0, x + 100, y + 28, 16);
      }
      sc.T('▶', x + 52, y + 36, 8, C.gold3);
      helpWord(g, 'つり', 'つり', x + 72, y + 52, 8);
      helpWord(g, 'かり', 'かり', x + 108, y + 52, 8);
    } else {
      sc.T('3:00', x + w / 2, y + 32, 24, C.gold3, 'center');
      // 売上が伸びていく棒グラフ
      for (let k = 0; k < 4; k++) {
        const bh = 6 + k * 6;
        sc.PR(x + 40 + k * 14, y + 84 - bh, 10, bh, k === 3 ? C.gold : C.gold2);
      }
      sc.T('売上', x + 22, y + 74, 8, C.cream, 'center');
    }
    st.lines.forEach((line, k) => sc.T(line, x + 10, y + 96 + k * 14, 9, C.cream2));
    // 次の手順への矢印
    if (i < 2) {
      const ax = x + w + 4;
      const ay = y + h / 2;
      for (let r = 0; r < 6; r++) sc.PR(ax + r, ay - (5 - r), 1.5, (5 - r) * 2 + 1, C.gold2);
    }
  });
  // ②から①へ戻る流れ：集めたら、また料理を出す
  const ly = 186;
  sc.PR(95, ly, 220, 1, C.gold2, 0.8);
  sc.PR(95, 182, 1, 4, C.gold2, 0.8);
  sc.PR(314, 182, 1, 4, C.gold2, 0.8);
  for (let r = 0; r < 4; r++) sc.PR(95 - (3 - r), 182 - r, (3 - r) * 2 + 1, 1, C.gold2, 0.8);
  const back = '集めたら、また料理を出す';
  const bw = sc.W(back, 8) + 8;
  sc.PR(205 - bw / 2, ly - 5, bw, 11, '#24170e');
  sc.T(back, 205, ly - 4, 8, C.gold3, 'center');
  drawHelpFx(g);
  // 操作キー：キーの形の札で並べる
  let kx = 24;
  for (const [key, label] of [['Backspace', '1文字戻す'], ['Space', '打ち直し'], ['Esc', '一時停止']] as const) {
    kx += sc.keycap(key, kx, 198, 9) + 5;
    sc.T(label, kx, 200, 10, C.cream);
    kx += sc.W(label, 10) + 18;
  }
}

/** 調達のしかたのページを開く（背景の絵をここで読み込み始める） */
export function openTripHelp(g: Game) {
  g.helpPage = 1;
  if (g.art) for (const h of TRIP_HELP) void g.art.ensureTrip(h.id).catch(() => {});
}

/**
 * 調達のしかた：4枚の札を2×2に並べる。色は店の調達欄と同じ。
 * 左に実際の場所の小さな絵（家族と獲物入り）、右に名前・手に入るもの・3行の説明。
 */
export function drawTripHelp(g: Game) {
  const sc = g.sc;
  sc.TB('調達のしかた', 24, 14, 20, C.gold3, 'left');
  // 共通のコツ（キーの絵で短く）
  const tipX = 196;
  sc.T('長い言葉ほど多く取れる', tipX, 21, 9, C.cream);
  const ew = sc.keycap('Enter', tipX + sc.W('長い言葉ほど多く取れる', 9) + 12, 18, 8);
  sc.T('途中で店へ戻る', tipX + sc.W('長い言葉ほど多く取れる', 9) + 16 + ew, 21, 9, C.cream);
  TRIP_HELP.forEach((h, n) => {
    const x = 22 + (n % 2) * 222;
    const y = 46 + Math.floor(n / 2) * 88;
    const w = 214;
    const hh = 82;
    const col = TRIP_COLOR[h.id];
    const trip = TRIPS.find((t) => t.id === h.id)!;
    // 札：調達欄と同じ色の縁と見出しの帯
    sc.PR(x + 2, y + 3, w, hh, '#0c0604', 0.5);
    sc.panel(x, y, w, hh, col.dark, col.main);
    // 場所の絵
    const tx = x + 5;
    const ty = y + 5;
    const tw = 74;
    const th = hh - 10;
    drawTripThumb(g, h.id, tx, ty, tw, th);
    sc.PR(tx - 1, ty - 1, tw + 2, 1, col.main);
    sc.PR(tx - 1, ty + th, tw + 2, 1, col.main);
    // 見出し：調達の言葉と担当
    const rx = tx + tw + 8;
    sc.PR(rx - 3, y + 4, w - (rx - x) - 2, 17, col.main, 0.55);
    sc.TB(trip.text, rx, y + 5, 12, C.w, 'left');
    const tw2 = sc.W(trip.text, 12);
    sc.T(`${trip.place}で${FAMILY_NAME[trip.who]}が${trip.act}`, rx + tw2 + 6, y + 9, 7, C.cream, 'left', 0.9);
    // 手に入るもの
    let ix = rx;
    for (const ing of trip.gives) {
      g.art?.drawIcon(sc, 'icons-dishes', ICON_FOR[ing], ix, y + 24, 13);
      sc.T(INGREDIENT_NAME[ing], ix + 15, y + 26, 8, C.gold3);
      ix += 17 + sc.W(INGREDIENT_NAME[ing], 8) + 6;
    }
    // 説明：要点だけ3行。打つ言葉は色を変える
    const room = x + w - 6 - (rx + 7);
    h.lines.forEach((line, k) => {
      const ly = y + 41 + k * 13;
      sc.PR(rx, ly + 3, 3, 3, col.main);
      // 札からはみ出さない大きさで描く
      const size = sc.fitSize(line.replace(/[【】]/g, ''), 8.5, room, 7);
      let cx = rx + 7;
      for (const [part, hot] of splitHot(line)) {
        if (hot) sc.TB(part, cx, ly, size, C.gold, 'left', C.ink);
        else sc.T(part, cx, ly, size, C.cream);
        cx += sc.W(part, size);
      }
    });
  });
}

/**
 * 調達の場所の小さな絵：ゲーム画面（基準の 480x270）の一部をそのまま縮めて切り取る。
 * 家族や獲物はゲームと同じ立ち位置・大きさで描くので、桟橋や地面にきちんと立つ。
 */
export function drawTripThumb(g: Game, id: 'fishing' | 'hunting' | 'gathering' | 'trading', x: number, y: number, w: number, h: number) {
  const sc = g.sc;
  const art = g.art;
  const bg = `bg-${id}`;
  sc.PR(x, y, w, h, '#1a120c');
  if (!art || !art.hasTrip(id)) return;
  const view = TRIP_HELP.find((t) => t.id === id)!.view;
  const bw = view[2];
  const bh = bw * (h / w);
  const s = w / bw;
  const { img } = art.sheet(bg);
  const kx = img.naturalWidth / 480;
  const ky = img.naturalHeight / 270;
  sc.blit(img, view[0] * kx, view[1] * ky, bw * kx, bh * ky, x, y, w, h);
  // 基準の座標 → 小さな絵の座標
  const X = (bx: number) => x + (bx - view[0]) * s;
  const Y = (by: number) => y + (by - view[1]) * s;
  const L = AMBER;
  sc.clip(x, y, w, h, () => {
    if (id === 'fishing') {
      const f = L.fishing.wife;
      sc.PR(X(f.x) - 8 * s, Y(f.y) - 1, 16 * s, 1.5, '#332313', 0.3);
      art.drawFrame(sc, 'wife-fishing', 0, X(f.x), Y(f.y), art.scaleFor('wife-fishing', 0, f.h * s));
    } else if (id === 'hunting') {
      const m = L.hunting.master;
      art.drawFrame(sc, 'props-actions', 4, X(m.x), Y(m.y), art.scaleFor('props-actions', 4, m.h * s));
      art.drawAnim(sc, 'wildlife', 'シカ・走行', g.t, X(150), Y(222), art.scaleFor('wildlife', 4, L.hunting.deer.h * s));
    } else if (id === 'gathering') {
      const ga = L.gathering;
      const sz = ga.sprout.size * s;
      art.drawIcon(sc, 'icons-dishes', 2, X(ga.slots[0].x) - sz / 2, Y(ga.slots[0].y) - sz + 1, sz);
      art.drawIcon(sc, 'icons-dishes', 3, X(ga.slots[3].x) - sz / 2, Y(ga.slots[3].y) - sz + 1, sz);
      art.drawAnim(sc, 'family-daughter', '待機', g.t, X(ga.daughter.x), Y(ga.daughter.y), art.scaleFor('family-daughter', 0, ga.daughter.h * s));
      art.drawFrame(sc, 'props-actions', 11, X(ga.basket.x), Y(ga.basket.y), art.scaleFor('props-actions', 11, ga.basket.h * s));
    } else {
      const tr = L.trading;
      art.drawAnim(sc, 'family-master', '待機', g.t, X(tr.master.x), Y(tr.master.y), art.scaleFor('family-master', 0, tr.master.h * s));
      art.drawFrame(sc, 'props-actions', 0, X(tr.merchant.x), Y(tr.merchant.y), art.scaleFor('props-actions', 0, tr.merchant.h * s), true);
    }
  });
}

/** 試し打ちの演出 */
export function drawHelpFx(g: Game) {
  const sc = g.sc;
  g.helpFx = g.helpFx.filter((f) => g.t - f.start < 1.2);
  for (const f of g.helpFx) {
    const age = g.t - f.start;
    const a = Math.min(1, (1.2 - age) * 3);
    if (f.kind === 'dish') {
      // 提供：金色の火花・料理の皿・売上
      for (let k = 0; k < 14; k++) {
        const ang = (k / 14) * Math.PI * 2;
        const r = 6 + age * 34;
        sc.PR(f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r * 0.7, 1.5, 1.5, k % 2 ? C.gold : C.gold3, a);
      }
      g.art?.drawIcon(sc, 'icons-dishes', 7, f.x - 9, f.y - 12 - age * 10, 18, a);
      sc.TB('+120円', f.x, f.y - 26 - age * 14, 11, C.gold3, 'center', C.ink, a);
    } else {
      // 調達：家族が手を振って右へ出かけていく。足もとに土ぼこり、吹き出しで「いってきます」
      const who = f.kind === 'fishing' ? 'family-wife' : 'family-master';
      const x = f.x - 8 + age * 40;
      const hop = Math.abs(Math.sin(age * 14)) * 2;
      for (let k = 0; k < 4; k++) {
        const d = age - k * 0.12;
        if (d > 0) sc.PR(x - 6 - k * 7, f.y + 4 - d * 6, 3, 2, '#c9a77a', Math.max(0, 0.7 - d) * a);
      }
      g.art?.drawHead(sc, who, 0, x - 9, f.y - 16 - hop, 18, 0.42, a);
      const say = 'いってきます！';
      const bw = sc.W(say, 7) + 8;
      sc.panel(x - bw / 2, f.y - 32 - hop, bw, 12, C.cream, C.ink, a);
      sc.T(say, x, f.y - 30 - hop, 7, C.ink, 'center', a);
    }
  }
}

/**
 * ひがわり営業の説明：左に通常営業、右にひがわり営業。右には今日のお題も出す。
 */
export function drawModeHelp(g: Game) {
  const sc = g.sc;
  sc.TB('2つの営業', 24, 16, 22, C.gold3, 'left');
  sc.T('「はじめる」のあとで、どちらの営業にするかを選べます', 142, 24, 10, C.cream);
  const cols = [
    { name: '通常営業', kana: 'つうじょう', lines: ['3分間で、売上の自己ベストに挑戦', 'お客の来かたは、遊ぶたびに変わる', '自己ベストは難易度ごとに残る'] },
    { name: 'ひがわり営業', kana: 'ひがわり', lines: ['毎日変わる「お題」つきの営業', 'お題は大小1つずつ。0時に変わる', '難易度でお題の強さが変わる', '何度でも挑戦でき、その日のベストが残る', '記録は通常営業とは別'] },
  ];
  cols.forEach((col, i) => {
    const x = i === 0 ? 22 : 214;
    const w = i === 0 ? 184 : 244;
    const y = 48;
    const h = 156;
    sc.panel(x, y, w, h, 'rgba(55,37,23,0.94)', i === 1 ? C.gold2 : C.wood4);
    sc.TB(col.name, x + 10, y + 8, 14, C.gold3, 'left');
    sc.T(`（${new RomajiMatcher(col.kana).remaining}）`, x + 12 + sc.W(col.name, 14), y + 12, 8, C.cream2);
    col.lines.forEach((line, k) => {
      sc.PR(x + 11, y + 35 + k * 15, 3, 3, C.gold2);
      sc.T(line, x + 18, y + 31 + k * 15, sc.fitSize(line, 9, w - 26), C.cream);
    });
    if (i === 1) {
      const d = g.settings.difficulty;
      sc.T('今日のお題', x + 10, y + 112, 9, C.gold3);
      dailyConditions(jstDate()).forEach((c, k) => drawCondChip(sc, g.art, c, d, x + 10 + k * 116, y + 128));
    }
  });
}
