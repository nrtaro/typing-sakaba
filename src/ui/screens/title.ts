// 画面：title
import { C } from '../palette';
import { LW } from '../screen';
import { SEATS, ShopView } from '../shopView';
import { FAM } from '../sprites';
import { Shop } from '../../core/shop';
import { Rng } from '../../core/rng';
import { defaultRomaji } from '../../core/romaji';
import { DIFFICULTIES, GAME_SUBTITLE, GAME_TITLE, PHASES, difficultyOf, rankFor } from '../../core/shopConfig';
import type { Game } from '../game';
import { button, drawKeyboard, drawSignboard } from './common';

/** 夜の部の途中で時間を止め、食材は尽きないようにして、自動で料理を出し続ける */
export function demoStep(g: Game, dt: number) {
  if (!g.art) return;
  if (!g.demo) {
    // 客が次々に来て、ゆっくり食べていく店にする（背景用。遊ぶときの難易度とは別）
    const shop = new Shop(new Rng(20261024), { ...difficultyOf('normal'), everyMult: 0.5, waitMult: 4 });
    const view = new ShopView();
    view.art = g.art;
    g.demo = { shop, view, next: 0.5, rng: new Rng(99) };
    // 最初から席が埋まっている状態にしておく
    for (let i = 0; i < 20 * 60; i++) demoTick(g, 1 / 20);
  }
  demoTick(g, dt);
}

export function demoTick(g: Game, dt: number) {
  const d = g.demo!;
  const shop = d.shop;
  shop.clock = PHASES[0].length + PHASES[1].length + 20;
  for (const k of Object.keys(shop.stock) as (keyof typeof shop.stock)[]) shop.stock[k] = 99;
  shop.update(dt);
  for (const ev of shop.drainEvents()) d.view.handle(ev, shop);
  d.view.update(dt, shop);
  // 一番待たせている客から、少し間を置いて出していく
  d.next -= dt;
  if (d.next <= 0) {
    d.next = d.rng.range(0.6, 1.3);
    const waiting = shop.seats
      .map((g, i) => ({ g, i }))
      .filter((x) => x.g && x.g.state === 'wait')
      .sort((a, b) => a.g!.wait - b.g!.wait)[0];
    if (waiting) {
      shop.input.reset();
      for (const c of defaultRomaji(waiting.g!.dish.kana)) shop.key(c);
      shop.input.reset();
    }
  }
  // 食べている客から、ときどき掛け声や音符が上がる
  for (const c of g.cheers) c.t += dt;
  g.cheers = g.cheers.filter((c) => c.t < 1.6);
  g.cheerNext -= dt;
  if (g.cheerNext <= 0) {
    g.cheerNext = d.rng.range(0.35, 0.9);
    const eating = shop.seats.map((g, i) => ({ g, i })).filter((x) => x.g && x.g.state === 'eat' && !x.g.awaitingDelivery);
    if (eating.length) {
      const { i } = d.rng.pick(eating);
      const words = ['カンパイ！', 'うまい！', '♪', '♪', 'おかわり！', '♪'];
      const text = d.rng.pick(words);
      g.cheers.push({ x: SEATS[i].x + d.rng.range(-6, 6), y: SEATS[i].ty - 30, t: 0, text, col: text === '♪' ? C.gold3 : C.cream });
    }
  }
}

export function drawCheers(g: Game) {
  const sc = g.sc;
  for (const c of g.cheers) {
    const a = Math.min(1, c.t * 4, (1.6 - c.t) * 2);
    const size = c.text === '♪' ? 10 : 8;
    sc.TB(c.text, c.x + Math.sin(c.t * 3 + c.x) * 2, c.y - c.t * 14, size, c.col, 'center', C.ink, a);
  }
}

/**
 * タイトル：上に吊り看板と自己ベストの黒板、下に木のカウンター風のメニュー台。
 * 真ん中は実際の店（客が食べ、家族が運び、おやじが鍋を混ぜる）をそのまま見せる。
 */
export function drawTitle(g: Game) {
  const sc = g.sc;
  const e = sc.ext;
  if (!g.art || !g.demo) {
    sc.spr(FAM.master[0], 300, 120, 3);
    sc.spr(FAM.wife[0], 350, 130, 3);
    sc.spr(FAM.daughter[0], 400, 140, 3);
  }
  sc.shifted(0, e.y0, () => {
    drawSignboard(g, 14, 8, 232, 66);
    sc.TB(GAME_TITLE, 130, 15, 27, '#ffd98a', 'center', '#3a1408');
    sc.T(GAME_SUBTITLE, 130, 51, 9, '#f3dcb0', 'center');
    drawBestBoard(g, 330, 8, 138, 74);
  });
  // メニュー台：店の床から下をすべて覆う木の台（縦に長いウィンドウでも下に隙間を作らない）
  sc.PR(e.x0, 212, e.w, e.y1 - 212, '#2a1a10');
  sc.PR(e.x0, 212, e.w, 2, '#a8743f');
  sc.PR(e.x0, 214, e.w, 1, '#5a3a1c');
  for (let y = 232; y < e.y1; y += 18) sc.PR(e.x0, y, e.w, 0.6, '#3a2414', 0.8);
  const tag = '打つほどに、店がにぎわう';
  const tw = sc.W(tag, 8) + 16;
  sc.panel(LW / 2 - tw / 2, 205, tw, 13, '#2a1a10', '#a8743f');
  sc.T(tag, LW / 2, 207.5, 8, C.gold3, 'center');
  sc.shifted(0, (e.y1 - 270) / 2, () => {
    if (!g.sound.ready && g.volume > 0) sc.T('♪ キーかクリックで音楽が流れます', 470, 205, 7, C.cream2, 'right', 0.8);
    // メニューは打って選ぶ：キーボードの絵と短い一言
    drawKeyboard(g, 30, 212);
    sc.T('打って選ぶ', 56, 213.5, 8, C.cream, 'left', 0.95);
    const [start, help, sound] = g.menuItems();
    button(g, start, 30, 224, 180, 38, 'primary', 'Enter');
    button(g, help, 218, 228, 130, 30, 'plain');
    button(g, sound, 356, 228, 94, 30, 'plain');
  });
}

/** 黒板：難易度ごとの自己ベストとランク。前回選んだ難易度に印を付ける */
export function drawBestBoard(g: Game, x: number, y: number, w: number, h: number) {
  const sc = g.sc;
  sc.PR(x + 3, y + 4, w, h, '#0c0604', 0.55);
  sc.panel(x, y, w, h, '#22322a', '#6b4422');
  sc.PR(x + 3, y + 3, w - 6, h - 6, '#1d2b24');
  sc.T('自己ベスト', x + w / 2, y + 6, 10, '#f2efe2', 'center');
  sc.PR(x + 14, y + 20, w - 28, 0.8, '#f2efe2', 0.35);
  DIFFICULTIES.forEach((d, i) => {
    const rowY = y + 26 + i * 15;
    const cur = d.id === g.settings.difficulty;
    const best = g.store.loadBest(d.id);
    const col = cur ? '#ffe7a6' : '#e8e4d4';
    if (cur) sc.T('▶', x + 8, rowY + 1, 7, col);
    sc.T(d.name, x + 18, rowY, 9, col, 'left', cur ? 1 : 0.85);
    if (best) {
      const rank = rankFor(best.score, d);
      sc.T(best.score.toLocaleString(), x + w - 26, rowY, 10, col, 'right', cur ? 1 : 0.85);
      sc.T(rank.name, x + w - 13, rowY, 10, rank.name === 'S' ? '#ffd27a' : col, 'center');
    } else sc.T('―', x + w - 26, rowY, 10, col, 'right', 0.6);
  });
}
