// 繁盛記の画面と進行：入口・方針えらび・日別の結果・明日の営業えらび・最終結果・ずかん。
// 1日の営業そのものは Game／ShopView が動かし、ここは日をまたぐ流れと、その画面を受け持つ。
import { C, type Color } from './palette';
import { LW, type Screen } from './screen';
import type { Game } from './game';
import type { MenuItem } from './screens/shared';
import { button, drawSignboard } from './screens/common';
import { wrapText } from './screens/records';
import { runHud } from './shopView';
import { drawNameplate } from './nameplate';
import { pairTip, policyTip, setTip, type Tip } from './hover';
import { RomajiMatcher } from '../core/romaji';
import { INGREDIENT_ORDER } from '../core/shopConfig';
import { achievementItem, itemById, type Item } from '../core/collection';
import {
  FAMILY_COLOR, FAMILY_NAME, MAX_LEVEL, MAX_SLOTS, PAIRS, PAIR_MAX, POLICIES, POLICY_SEAL, SETS, SET_BONUS, setKey, setOf, setText, descAll, descDiff, descOf, modsFor, pairKey, pairOf, pairText, policyOf,
  type BuildStats, type Owned, type PolicyId,
} from '../core/build';
import {
  PERKS, RUN_ACHIEVEMENTS, RUN_DAYS, RUN_NAME, TRIALS, applyOffer, availablePolicies, closeDay, coinsFor, dayPlan, earnedAchievements, goalFor, loopGoalMult,
  newRun, offersFor, roadOffers, roadOf, runTotal, takeRoad, trialsFor,
  type DayOutcome, type Offer, type Road, type RunMeta, type RunState,
} from '../core/run';

export type RunScreen = 'hub' | 'book' | 'pick' | 'day' | 'road' | 'end';
const SLOT_NAME = ['朝', '昼', '夜'];
const KIND_NAME: Record<Item['kind'], string> = { front: '二つ名（前）', back: '二つ名（後ろ）', plate: 'プレート', sound: '打鍵音', sticker: 'シール' };
const BOOK_TABS = ['実績とごほうび', '型とかけ合わせ', '方針', 'おまけと試練'] as const;
const ease = (v: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 3);
const yen = (n: number) => `${Math.round(n).toLocaleString()}円`;

interface PickState {
  slot: number;
  offers: Offer[];
  rerolled: number;
  /** 入れ替え：外す方針を選んでいる最中の候補 */
  swap: Offer | null;
  /** 選び終えた候補（演出のあと先へ進む） */
  chosen: { offer: Offer; at: number } | null;
  /** 候補を出したときの、それぞれの方針の段階（強化の「前→後」に使う） */
  before: Partial<Record<PolicyId, number>>;
  inPlay: boolean;
  at: number;
}

export class RunUI {
  meta: RunMeta;
  run: RunState | null = null;
  screen: RunScreen = 'hub';
  /** 今の画面に入った時刻 */
  at = 0;
  pick: PickState | null = null;
  /** 昼・夜の方針えらび：調達から戻るまで待っている時間帯 */
  private pendingSlot: number | null = null;
  /** 方針を選んだあと、営業が再開するまでの間 */
  resumeIn = 0;
  outcome: (DayOutcome & { achievements: string[]; coins: number; yen: BuildStats['yen']; resumed?: boolean }) | null = null;
  book = { tab: 0, sel: 0, from: 'hub' as RunScreen, note: '' };
  private fxDone = { stamp: false, tick: 0, reward: false };

  constructor(private g: Game) {
    this.meta = g.store.loadRun();
  }

  /** 繁盛記の営業中か */
  get inRun() {
    return !!this.run && this.g.mode === 'play' && !this.g.tutorial && !!this.g.view.run;
  }

  private save() {
    try { this.g.store.saveRun(this.meta); } catch { /* 保存できなくても、この起動中は続けられる */ }
  }

  private go(screen: RunScreen) {
    this.screen = screen;
    this.at = this.g.t;
    this.g.mode = 'run';
    this.g.menu.reset();
  }

  // ---------- 流れ ----------

  open() {
    this.meta = this.g.store.loadRun();
    this.run = this.meta.active;
    this.pick = null;
    this.outcome = null;
    if (this.g.settings.playMode !== 'run') { this.g.settings.playMode = 'run'; this.g.store.saveSettings(this.g.settings); }
    this.go('hub');
  }

  /** 新しい挑戦を始める（進行中のものは捨てる） */
  begin() {
    this.meta = this.g.store.loadRun();
    this.run = newRun(this.meta, Math.floor(Math.random() * 4294967296), crypto.randomUUID());
    this.meta.active = this.run;
    this.save();
    this.enter();
  }

  /** 保存された段階から続ける */
  enter() {
    const run = this.run;
    if (!run) return;
    this.outcome = null;
    if (run.stage === 'morning') this.openPick(0, false);
    else if (run.stage === 'open') this.startDay();
    else if (run.stage === 'closed') {
      // 閉店の結果を見ている途中でやめた：結果をもう一度見せる
      const result = run.days[run.days.length - 1];
      this.outcome = { passed: true, cleared: false, result, newPairs: [], newSets: [], newPolicies: [], summary: null, achievements: [], coins: 0, yen: {}, resumed: true };
      this.fxDone = { stamp: true, tick: 9, reward: true };
      this.go('day');
    } else this.go('road');
  }

  private levels(): Partial<Record<PolicyId, number>> {
    return Object.fromEntries((this.run?.owned ?? []).map((o) => [o.id, o.lv]));
  }

  private openPick(slot: number, inPlay: boolean) {
    const run = this.run!;
    const offers = offersFor(run, this.meta, slot, 0);
    if (!offers.length) { this.afterPick(slot, inPlay); return; }
    this.pick = { slot, offers, rerolled: 0, swap: null, chosen: null, before: this.levels(), inPlay, at: this.g.t };
    this.g.menu.reset();
    if (!inPlay) this.go('pick');
    this.g.sound.select();
  }

  private reroll() {
    const p = this.pick;
    const run = this.run;
    if (!p || !run || run.rerolls <= 0 || p.chosen) return;
    run.rerolls--;
    p.rerolled++;
    p.offers = offersFor(run, this.meta, p.slot, p.rerolled);
    p.swap = null;
    p.at = this.g.t;
    this.g.sound.tripStart();
  }

  private choose(offer: Offer, drop: PolicyId | null = null) {
    const p = this.pick;
    const run = this.run;
    if (!p || !run || p.chosen) return;
    if (offer.kind === 'swap' && !drop) { p.swap = offer; p.at = this.g.t; return; }
    const r = applyOffer(run, offer, drop);
    if (!r) { this.g.sound.miss(); return; }
    p.chosen = { offer, at: this.g.t };
    p.swap = null;
    const shop = this.g.shop;
    if (p.inPlay && shop) {
      // 営業の途中で選んだ方針は、その場で効き始める
      for (const id of INGREDIENT_ORDER) shop.stock[id] += r.stock;
      shop.build = modsFor(run.owned, dayPlan(run, this.meta).base);
    }
    this.g.sound.pick(policyOf(offer.id).family, offer.lv);
  }

  /** 入れ替えで外す方針を選んでいる最中なら、候補の一覧へ戻す（Esc）。戻したら true */
  cancelSwap(): boolean {
    const p = this.pick;
    if (!p?.swap || p.chosen) return false;
    p.swap = null;
    p.at = this.g.t - 1;
    this.g.menu.reset();
    return true;
  }

  private afterPick(slot: number, inPlay: boolean) {
    const run = this.run!;
    this.pick = null;
    this.g.menu.reset();
    if (inPlay) { this.resumeIn = 0.9; return; }
    if (slot === 0) {
      run.stage = 'open';
      run.boost = false;
      this.meta.active = run;
      this.save();
      this.startDay();
    }
  }

  private startDay() {
    const run = this.run!;
    const plan = dayPlan(run, this.meta);
    this.pendingSlot = null;
    this.resumeIn = 0;
    this.g.startRunDay(plan, runHud(run.day, run.loop, plan.goal, run.owned));
  }

  /** 時間帯が変わった：昼と夜の始まりに方針を選ぶ（調達の途中なら、戻ってから） */
  onPhase(index: number) {
    if (this.inRun && index >= 1 && index <= 2) this.pendingSlot = index;
  }

  /** 営業中の1コマ。営業を止めているあいだは true を返す */
  step(dt: number): boolean {
    const g = this.g;
    const p = this.pick;
    if (p?.chosen && g.t - p.chosen.at > 0.85) this.afterPick(p.slot, p.inPlay);
    if (!this.inRun) return false;
    if (this.pick) return true;
    if (this.resumeIn > 0) { this.resumeIn = Math.max(0, this.resumeIn - dt); return this.resumeIn > 0; }
    if (this.pendingSlot !== null && (g.shop?.timeLeft ?? 0) < 8) this.pendingSlot = null;
    if (this.pendingSlot !== null && !g.session?.trip && !g.session?.finished) {
      const slot = this.pendingSlot;
      this.pendingSlot = null;
      this.openPick(slot, true);
      return !!this.pick;
    }
    return false;
  }

  /** 閉店：目標を判定し、記録・実績・ごほうびを確定する */
  finishDay() {
    const g = this.g;
    const run = this.run;
    const session = g.session;
    if (!run || !session) return;
    const shop = session.shop;
    const out = closeDay(run, this.meta, { sales: shop.score, served: shop.stats.served, maxCombo: shop.stats.maxCombo, angry: shop.stats.angry, build: shop.buildStats });
    let achievements: string[] = [];
    let coins = 0;
    try { achievements = g.store.unlockAchievements(earnedAchievements(this.meta)); } catch { achievements = []; }
    if (out.summary && !this.meta.paid.includes(run.id)) {
      try { coins = g.store.creditRun(`run:${run.id}`, coinsFor(out.summary)); } catch { coins = 0; }
      this.meta.paid = [...this.meta.paid, run.id].slice(-50);
    }
    this.save();
    this.outcome = { ...out, achievements, coins, yen: { ...shop.buildStats.yen } };
    if (out.summary) this.run = null;
    this.pick = null;
    this.pendingSlot = null;
    this.fxDone = { stamp: false, tick: 0, reward: false };
    g.session = null;
    g.view.run = null;
    g.refreshCollection();
    g.sound.play('result');
    this.go(out.summary ? 'end' : 'day');
  }

  private toRoad() {
    const run = this.run;
    if (!run) return;
    run.stage = 'road';
    this.meta.active = run;
    this.save();
    this.go('road');
  }

  private pickRoad(road: Road) {
    const run = this.run;
    if (!run) return;
    takeRoad(run, this.meta, road.id);
    this.save();
    this.g.sound.bell();
    this.openPick(0, false);
  }

  private openBook() {
    this.book = { tab: 0, sel: 0, from: this.screen === 'end' ? 'end' : 'hub', note: '' };
    this.g.refreshCollection();
    this.go('book');
  }

  // ---------- 入力 ----------

  menuItems(): MenuItem[] {
    const g = this.g;
    const p = this.pick;
    if (p && (this.screen === 'pick' || p.inPlay) && (g.mode === 'run' || g.mode === 'play')) {
      if (p.chosen) return [];
      if (p.swap) {
        const swap = p.swap;
        return [...this.run!.owned.map((o) => ({ text: policyOf(o.id).name, kana: policyOf(o.id).kana, act: () => this.choose(swap, o.id) })),
          { text: 'やめる', kana: 'やめる', act: () => { this.cancelSwap(); } }];
      }
      return [...p.offers.map((o) => ({ text: policyOf(o.id).name, kana: policyOf(o.id).kana, act: () => this.choose(o) })),
        ...(this.run!.rerolls > 0 ? [{ text: 'ひきなおし', kana: 'ひきなおし', act: () => this.reroll() }] : [])];
    }
    if (g.mode !== 'run') return [];
    const zukan = { text: 'ずかん', kana: 'ずかん', act: () => this.openBook() };
    switch (this.screen) {
      case 'hub':
        return [
          ...(this.run ? [{ text: 'つづきから', kana: 'つづき', act: () => this.enter() }] : []),
          { text: this.run ? 'さいしょから' : 'はじめる', kana: this.run ? 'さいしょから' : 'はじめる', act: () => this.begin() },
          zukan,
          { text: 'もどる', kana: 'もどる', act: () => { g.mode = 'modeSelect'; } },
        ];
      case 'book':
        return [{ text: 'もどる', kana: 'もどる', act: () => this.go(this.book.from) }];
      case 'day':
        return [{ text: 'つぎへ', kana: 'つぎへ', act: () => this.toRoad() }, { text: 'ちゅうだん', kana: 'ちゅうだん', act: () => { this.toRoad(); this.open(); } }];
      case 'road':
        return this.run ? roadOffers(this.run.seed, this.run.day).map((r) => ({ text: r.name, kana: r.kana, act: () => this.pickRoad(r) })) : [];
      case 'end':
        // 走りきったあとは、次ののれんへ進む入口に戻る（同じのれんの「もういちど」は出さない）
        return this.outcome?.summary?.cleared
          ? [{ text: 'つぎののれんへ', kana: 'つぎへ', act: () => this.open() }, zukan, { text: 'たいとる', kana: 'たいとる', act: () => g.toTitle() }]
          : [{ text: 'もういちど', kana: 'もういちど', act: () => this.begin() }, zukan, { text: 'たいとる', kana: 'たいとる', act: () => g.toTitle() }];
      default:
        return [];
    }
  }

  /** Enter で選ばれる項目（方針えらびと明日の営業は、打って選ぶだけにして押し間違いを防ぐ） */
  enterItem(): MenuItem | undefined {
    if (this.pick || this.screen === 'road' || this.screen === 'pick') return undefined;
    if (this.g.t - this.at < 0.9 && (this.screen === 'day' || this.screen === 'end')) return undefined;
    return this.menuItems()[0];
  }

  escape() {
    const g = this.g;
    if (this.screen === 'book') this.go(this.book.from);
    else if (this.screen === 'hub') g.mode = 'modeSelect';
    else if (this.screen === 'end') g.toTitle();
    else if (this.screen === 'pick' && this.cancelSwap()) return;
    else this.open();
    g.menu.reset();
  }

  private bookCount() {
    const b = this.book;
    return b.tab === 0 ? RUN_ACHIEVEMENTS.length : b.tab === 1 ? PAIRS.length + SETS.length : b.tab === 2 ? POLICIES.length : PERKS.length + TRIALS.length;
  }

  /** ずかんのキー：←→でページ、↑↓でえらぶ、Enter でごほうびを付ける／打鍵音を試す */
  key(k: string): boolean {
    if (this.g.mode !== 'run' || this.screen !== 'book') return false;
    const b = this.book;
    const n = this.bookCount();
    if (k === 'ArrowLeft' || k === 'ArrowRight' || k === 'Tab') { b.tab = (b.tab + (k === 'ArrowLeft' ? BOOK_TABS.length - 1 : 1)) % BOOK_TABS.length; b.sel = 0; b.note = ''; this.g.sound.select(); return true; }
    if (k === 'ArrowUp' || k === 'ArrowDown') { b.sel = (b.sel + (k === 'ArrowDown' ? 1 : n - 1)) % n; b.note = ''; this.g.sound.key(1); return true; }
    if (k === 'Enter') { if (b.tab === 0) this.equipReward(RUN_ACHIEVEMENTS[b.sel].id); return true; }
    return false;
  }

  /** 実績のごほうびを付ける（打鍵音はその場で鳴らす）。まだ手に入れていなければ知らせる */
  private equipReward(achievementId: string) {
    const g = this.g;
    const it = achievementItem(achievementId);
    const b = this.book;
    if (!it) return;
    if (!g.records?.unlocked[achievementId]) { b.note = 'まだ手に入れていません'; g.sound.miss(); return; }
    if (it.kind === 'sticker') return;
    g.setDecor({ [it.kind]: it.id });
    b.note = `「${it.name}」を付けました（ふだんの営業やランキングでも使えます）`;
    if (it.kind === 'sound') { g.sound.key(1); g.sound.key(3); } else g.sound.select();
  }

  // ---------- 描画の部品 ----------

  private tip(sc: Screen, x: number, y: number, w: number, h: number, tip: Tip | null) {
    if (tip) this.g.hover.add(sc, x, y, w, h, tip);
  }

  /** 方針の判子（営業中の表示と同じ形）。マウスを乗せると効果が出る */
  private seal(sc: Screen, x: number, y: number, o: Owned, a = 1, owned: Owned[] = this.run?.owned ?? []) {
    const col = FAMILY_COLOR[policyOf(o.id).family];
    sc.panel(x, y, 22, 21, 'rgba(34,22,30,0.92)', col, a);
    sc.T(POLICY_SEAL[o.id], x + 11, y + 2, 8, col, 'center', a);
    for (let n = 0; n < MAX_LEVEL; n++) sc.PR(x + 3 + n * 6, y + 15, 4, 3, n < o.lv ? col : '#4a3a44', a);
    this.tip(sc, x, y, 22, 21, policyTip(o.id, o.lv, owned));
  }

  private build(sc: Screen, x: number, y: number, owned: Owned[], label = true) {
    const text = `いまの方針 ${owned.length}/${MAX_SLOTS}`;
    if (label) sc.T(text, x, y + 6, 8, C.cream);
    const x0 = x + (label ? sc.W(text, 8) + 8 : 0);
    for (let i = 0; i < MAX_SLOTS; i++) {
      if (owned[i]) this.seal(sc, x0 + i * 25, y, owned[i], 1, owned);
      else sc.panel(x0 + i * 25, y, 22, 21, 'rgba(20,14,18,0.6)', '#4a3a44');
    }
    if (label && owned.length) sc.T('マウスを乗せると効果', x0 + MAX_SLOTS * 25 + 4, y + 7, 7.5, C.gray);
  }

  /** 打つ言葉の札 */
  private roma(sc: Screen, kana: string, cx: number, y: number, dim: boolean, size = 10) {
    const live = this.g.menu.active.find((l) => l.target.id === kana);
    const m = live?.matcher ?? new RomajiMatcher(kana);
    const w = sc.W(m.typed + m.remaining, size) + 12;
    sc.panel(cx - w / 2, y, w, size + 7, '#211712', live ? C.gold : C.gold2, dim ? 0.5 : 1);
    sc.roma(m.typed, m.remaining, cx, y + 3, size, live ? 'active' : dim ? 'dim' : 'idle');
    return !!live;
  }

  /** 折り返しながら、印（hot）の付いた部分だけ色を変えて描く。描いた行数を返す */
  private rich(sc: Screen, segs: { t: string; hot: boolean }[], x: number, y: number, size: number, width: number, col: Color, hot: Color, a: number, lh = size + 2.5) {
    const lines: { t: string; hot: boolean }[][] = [[]];
    let w = 0;
    // 「前→後」の数字は途中で折り返さない（ひとかたまりで次の行へ送る）
    for (const s of segs) for (const ch of s.hot ? [s.t] : [...s.t]) {
      const cw = sc.W(ch, size);
      if (w + cw > width && lines[lines.length - 1].length && !/^[、。」』）！？…]$/.test(ch)) { lines.push([]); w = 0; }
      const line = lines[lines.length - 1];
      const last = line[line.length - 1];
      if (last && last.hot === s.hot) last.t += ch; else line.push({ t: ch, hot: s.hot });
      w += cw;
    }
    lines.forEach((line, i) => {
      let cx = x;
      for (const run of line) {
        if (run.hot) sc.PR(cx - 0.5, y + i * lh - 0.5, sc.W(run.t, size) + 1, size + 1.5, '#5a4410', 0.9 * a);
        sc.T(run.t, cx, y + i * lh, size, run.hot ? hot : col, 'left', a);
        cx += sc.W(run.t, size);
      }
    });
    return lines.length;
  }

  /** 文を折り返して全部描く（切り捨てない）。描いた行数を返す */
  private para(sc: Screen, text: string, x: number, y: number, size: number, width: number, col: Color, a = 1, lh = size + 2.5) {
    const rows = wrapText(sc, text, size, width);
    rows.forEach((t, i) => sc.T(t, x, y + i * lh, size, col, 'left', a));
    return rows.length;
  }

  draw() {
    const sc = this.g.sc;
    // 札や数字を読みやすくするため、入口以外は背景の店をもう少し沈める
    if (this.screen !== 'hub') sc.cover(C.bg, 0.4);
    if (this.screen === 'hub') this.drawHub(sc);
    else if (this.screen === 'book') this.drawBook(sc);
    else if (this.screen === 'pick') this.drawPick(sc);
    else if (this.screen === 'day') this.drawDay(sc);
    else if (this.screen === 'road') this.drawRoad(sc);
    else this.drawEnd(sc);
  }

  /** 営業中に重ねる：方針えらびと、再開の合図 */
  drawOverlay() {
    const sc = this.g.sc;
    if (this.pick?.inPlay) { sc.cover(C.bg, 0.72); this.drawPick(sc); }
    else if (this.resumeIn > 0 && this.inRun) {
      const k = 1 - this.resumeIn / 0.9;
      sc.TB('さあ、つづき！', LW / 2 + 40, 120 - k * 6, 18 + (k < 0.2 ? (0.2 - k) * 30 : 0), C.gold3, 'center', C.ink, Math.min(1, this.resumeIn * 4));
    }
  }

  // ---------- 入口 ----------

  private drawHub(sc: Screen) {
    const g = this.g;
    const m = this.meta;
    const run = this.run;
    drawSignboard(g, 150, 4, 180, 36);
    sc.TB(RUN_NAME, LW / 2, 9, 18, '#ffd98a', 'center', '#3a1408');
    sc.T('方針を選んで店を育てる四日間', LW / 2, 29, 8, '#f3dcb0', 'center');
    sc.panel(18, 46, 270, 156, 'rgba(36,23,14,0.95)', '#8a6232');
    const lines: [string, Color][] = [
      ['朝・昼・夜に「方針」を1つ選んで、店を育てる。', C.cream],
      ['毎日の売上目標に届かないと、そこで店じまい。', C.cream],
      ['決まった2つの方針がそろって皿に効くと「かけ合わせ」。', '#ffe9b4'],
      [`育てた組ほど強い（最大+${Math.round(PAIR_MAX * 100)}%）。噛み合う店を組もう。`, '#ffe9b4'],
    ];
    lines.forEach(([t, c], i) => sc.T(t, 28, 53 + i * 12, sc.fitSize(t, 8, 252, 6), c));
    sc.PR(28, 103, 250, 1, '#5a3a1c');
    const loop = run?.loop ?? m.loop;
    if (run) {
      const where = `挑戦の途中：のれん${run.loop}枚目・${run.day + 1}日目の${run.stage === 'road' ? '閉店後（明日の営業えらび）' : run.stage === 'closed' ? '閉店後' : '朝'}から`;
      sc.T(where, 28, 108, sc.fitSize(where, 8.5, 252, 6), C.gold3);
      sc.T(`ここまでの売上 ${yen(runTotal(run))}`, 28, 121, 8, C.cream);
      this.build(sc, 28, 133, run.owned);
    } else {
      sc.T(`つぎの挑戦：のれん${m.loop}枚目`, 28, 108, 10, C.gold3);
      const goals = `1日ごとの目標 ${Array.from({ length: RUN_DAYS }, (_, d) => goalFor(d, m.loop, 'joren').toLocaleString()).join(' → ')}円`;
      sc.T(goals, 28, 123, sc.fitSize(goals, 8, 252, 6), C.w);
      const note = 'クリアするたびに、のれんが1枚増えて難しくなる（上限なし）';
      sc.T(note, 28, 136, sc.fitSize(note, 8, 252, 6), C.cream);
    }
    // のれんの試練（マウスを乗せると内容）
    const trials = trialsFor(loop);
    const ty = run ? 160 : 150;
    sc.T(trials.length ? `のれん${loop}枚目の試練` : '試練：2枚目から、営業そのものも難しくなる', 28, ty, 8, trials.length ? '#ff9a8a' : C.gray);
    let tx = 28;
    trials.forEach((t) => {
      const w = sc.W(t.name, 7.5) + 8;
      sc.panel(tx, ty + 11, w, 12, '#3a1418', '#c06060');
      sc.T(t.name, tx + 4, ty + 13, 8, '#ffb0a0');
      this.tip(sc, tx, ty + 11, w, 12, { title: `試練「${t.name}」`, col: '#ff9a8a', lines: [{ t: t.text(loop), col: C.w }, { t: `のれん${t.from}枚目から` }] });
      tx += w + 3;
    });
    // 常連のおまけ：挑戦をまたいで残る、小さな助け
    const perks = PERKS.filter((p) => m.daysCleared >= p.at);
    const next = PERKS.find((p) => m.daysCleared < p.at);
    const py = ty + (trials.length ? 27 : 13);
    const ptext = `常連のおまけ ${perks.length}/${PERKS.length}${next ? `（つぎは、目標突破があと${next.at - m.daysCleared}日）` : ''}`;
    sc.T(ptext, 28, py, sc.fitSize(ptext, 8, 252, 6), perks.length ? '#a9f0e4' : C.gray);
    this.tip(sc, 28, py - 1, 252, 10, { title: '常連のおまけ', col: '#a9f0e4', lines: [{ t: '目標を越えた日の数で増える、次の挑戦からずっと効く小さな助け。方針とちがって、選ばなくても付く。', col: C.w }, ...PERKS.map((p) => ({ t: `${m.daysCleared >= p.at ? '◆' : '◇'}${p.name}（${p.at}日）：${p.text}` }))] });
    // 右：これまでの記録
    sc.panel(296, 46, 166, 156, '#22322a', '#6b4422');
    sc.T('これまでの記録', 379, 52, 9, '#f2efe2', 'center');
    const rows: [string, string][] = [
      ['クリア', `${m.clears}回`], ['挑戦', `${m.runs}回`], ['最高の合計', m.best.total ? yen(m.best.total) : '―'], ['1日の最高', m.best.day ? yen(m.best.day) : '―'],
      ['一皿の最高', m.best.serve ? yen(m.best.serve) : '―'], ['最大コンボ', m.best.combo ? `${m.best.combo}` : '―'], ['同時に出した皿', m.best.chain > 1 ? `${m.best.chain}皿` : '―'],
      ['かけ合わせ・型', `${m.discovered.length}/${PAIRS.length}・${m.sets.length}/${SETS.length}`],
    ];
    rows.forEach(([k, v], i) => {
      sc.T(k, 306, 68 + i * 16, 8, '#d9e4cf');
      sc.T(v, 452, 68 + i * 16, sc.fitSize(v, 8.5, 80), '#fff7ea', 'right');
    });
    const items = this.menuItems();
    const w = items.length >= 4 ? 106 : 138;
    const gap = 8;
    const x0 = LW / 2 - (items.length * w + (items.length - 1) * gap) / 2;
    items.forEach((it, i) => button(g, it, x0 + i * (w + gap), 216, w, 34, i === 0 ? 'primary' : 'plain', it.kana === 'もどる' ? 'Esc' : undefined));
  }

  // ---------- 方針えらび ----------

  private drawPick(sc: Screen) {
    const g = this.g;
    const p = this.pick;
    const run = this.run;
    if (!p || !run) return;
    const age = g.t - p.at;
    const typing = g.menu.typed.length > 0;
    const head = `のれん${run.loop}枚目　${run.day + 1}日目・${SLOT_NAME[p.slot]}の方針`;
    sc.TB(head, LW / 2, 8, 14, '#ffd98a', 'center', '#3a1408');
    const boosted = p.slot === 0 && run.boost && !p.swap;
    const sub = p.swap ? `「${policyOf(p.swap.id).name}」を入れるために、外す方針を打って選ぶ`
      : boosted ? 'ごほうび：今朝えらぶ方針は、Lvが1つおまけ。名前を打って選ぶ' : '名前を打って選ぶ（選ぶと、すぐ効き始める）';
    sc.T(sub, LW / 2, 27, 8, boosted ? '#ffe9b4' : C.cream, 'center');
    if (p.swap) {
      // 入れ替え：外す方針を選ぶ（マウスを乗せると、その方針の効果）
      run.owned.forEach((o, i) => {
        const pol = policyOf(o.id);
        const x = 14 + i * 92;
        const live = g.menu.active.some((l) => l.target.id === pol.kana);
        const dim = typing && !live;
        sc.panel(x, 56, 86, 122, '#2a1b26', live ? C.gold : FAMILY_COLOR[pol.family], dim ? 0.45 : 1);
        this.seal(sc, x + 32, 61, o, dim ? 0.45 : 1);
        sc.T(pol.name, x + 43, 86, sc.fitSize(pol.name, 9, 80), dim ? C.gray : C.w, 'center');
        this.para(sc, descOf(o.id, o.lv), x + 5, 99, 7.5, 76, dim ? C.gray : C.cream, dim ? 0.5 : 1, 9.5);
        sc.T(`Lv${o.lv}を外す`, x + 43, 150, 8, '#ff9a8a', 'center', dim ? 0.5 : 1);
        this.roma(sc, pol.kana, x + 43, 160, dim, sc.fitSize(new RomajiMatcher(pol.kana).remaining, 8, 68, 5.5));
        this.tip(sc, x, 56, 86, 122, policyTip(o.id, o.lv, run.owned));
      });
      // 営業中の Esc は一時停止ではなく、ここでは「やめる」に使う
      const it = this.menuItems().find((x) => x.kana === 'やめる');
      if (it) button(g, it, LW / 2 - 60, 190, 120, 28, 'plain', 'Esc');
      this.build(sc, 20, 232, run.owned);
      return;
    }
    const n = p.offers.length;
    const w = n >= 4 ? 110 : 142;
    const gap = n >= 4 ? 6 : 10;
    const x0 = LW / 2 - (n * w + (n - 1) * gap) / 2;
    p.offers.forEach((o, i) => {
      const pol = policyOf(o.id);
      const col = FAMILY_COLOR[pol.family];
      const inT = ease((age - i * 0.07) / 0.28);
      const live = g.menu.active.some((l) => l.target.id === pol.kana);
      const chosen = p.chosen?.offer === o;
      const fade = p.chosen && !chosen ? Math.max(0, 1 - (g.t - p.chosen.at) * 4) : 1;
      const dim = typing && !live;
      const a = inT * fade * (dim ? 0.5 : 1);
      if (a <= 0.01) return;
      const up = chosen ? Math.sin(Math.min(1, (g.t - p.chosen!.at) / 0.3) * Math.PI) * 6 : 0;
      const x = x0 + i * (w + gap);
      const y = 40 + (1 - inT) * 18 - (live ? 2 : 0) - up;
      const h = 172;
      sc.PR(x + 2, y + 4, w, h, '#0c0604', 0.5 * a);
      if (live || chosen) sc.glow(x, y, w, h, chosen ? C.w : C.gold3, chosen ? 1 : 0.8);
      else if (o.hot) sc.glow(x, y, w, h, '#ffe27a', 0.3 + 0.2 * Math.sin(g.t * 4 + i));
      sc.panel(x, y, w, h, live ? '#3c2634' : '#2a1b26', chosen ? C.w : live ? C.gold : col, a);
      sc.PR(x + 1, y + 1, w - 2, 14, col, 0.85 * a);
      sc.T(`${FAMILY_NAME[pol.family]}の方針`, x + 5, y + 3.5, n >= 4 ? 7.5 : 8, '#1a1016', 'left', a);
      const from = p.before[o.id] ?? 0;
      const kind = o.kind === 'up' ? `強化 Lv${from}→Lv${o.lv}` : o.kind === 'swap' ? `入れ替え Lv${o.lv}` : `新しく Lv${o.lv}`;
      sc.T(kind, x + w - 5, y + 3.5, n >= 4 ? 7.5 : 8, '#1a1016', 'right', a);
      sc.T(pol.name, x + w / 2, y + 19, sc.fitSize(pol.name, 13, w - 10), C.w, 'center', a);
      for (let k = 0; k < MAX_LEVEL; k++) {
        const add = k >= from && k < o.lv;
        sc.PR(x + w / 2 - 14 + k * 10, y + 36, 8, 4, k < o.lv ? (add && from > 0 ? '#fff0a8' : col) : '#4a3a44', a);
      }
      // 効果：強化は、変わる数字を「前→後」で見せる
      const size = n >= 4 ? 7.5 : 8;
      const rows = o.kind === 'up'
        ? this.rich(sc, descDiff(o.id, from, o.lv), x + 7, y + 45, size, w - 14, C.cream, '#fff0a8', a)
        : this.para(sc, descOf(o.id, o.lv), x + 7, y + 45, size, w - 14, C.cream, a);
      const yy = y + 45 + rows * (size + 2.5) + 2;
      if (yy < y + 100) this.para(sc, pol.quip, x + 7, yy, 7.5, w - 14, '#b8a0b0', a, 9.5);
      if (o.link) {
        const lrows = wrapText(sc, (o.hot ? '★' : '') + o.link, 7.5, w - 16);
        const lh = 5 + lrows.length * 9.5;
        const ly = y + 146 - lh;
        sc.panel(x + 4, ly, w - 8, lh, o.hot ? '#4a3410' : '#22302a', o.hot ? '#ffe27a' : '#5a7a68', a);
        lrows.forEach((t, k) => sc.T(t, x + 8, ly + 3 + k * 9.5, 7.5, o.hot ? '#ffe9b4' : '#bfe6d2', 'left', a));
      }
      this.roma(sc, pol.kana, x + w / 2, y + 150, dim, sc.fitSize(new RomajiMatcher(pol.kana).remaining, 10, w - 22, 6.5));
      // 候補には効果と相性を直接表示する。札全体のホバーは隣の候補を覆うため付けない。
      if (chosen) {
        const k = (g.t - p.chosen!.at) / 0.85;
        sc.radialGlow(x + w / 2, y + h / 2, 60 + k * 80, col, 0.5 * (1 - k));
        sc.TB(o.kind === 'up' ? '強化！' : 'いただき！', x + w / 2, y + 62 - k * 10, 16 + Math.max(0, 0.15 - k) * 40, C.gold3, 'center', C.ink, Math.min(1, (1 - k) * 3));
      }
    });
    // 下：今の方針と、引き直し
    this.build(sc, 20, 222, run.owned);
    const rr = this.menuItems().find((x) => x.kana === 'ひきなおし');
    if (rr) {
      button(g, rr, 346, 216, 116, 28, 'plain');
      sc.T(`候補を入れ替える。今日はあと${run.rerolls}回`, 404, 248, 7.5, C.cream, 'center');
    } else if (!p.chosen) sc.T('今日の引き直しは使い切り', 404, 228, 8, C.gray, 'center');
    if (p.inPlay && !p.chosen) sc.T('営業は止まっています。ゆっくり選んで大丈夫', 150, 252, 8, '#a9f0e4', 'center');
  }

  // ---------- 日別の結果 ----------

  /** いちばん働いた方針（増えた売上の多い順に3つ） */
  private drawTop(sc: Screen, x: number, y: number, w: number, yenBy: BuildStats['yen'], a: number, owned: Owned[]) {
    const top = (Object.entries(yenBy) as [PolicyId, number][]).filter(([, v]) => v > 0).sort((p, q) => q[1] - p[1]).slice(0, 3);
    sc.T('いちばん働いた方針', x, y, 8, C.gold3, 'left', a);
    if (!top.length) { sc.T('方針で増えた売上はなし', x, y + 14, 8, C.gray, 'left', a); return; }
    const max = top[0][1];
    top.forEach(([id, v], i) => {
      const pol = policyOf(id);
      const col = FAMILY_COLOR[pol.family];
      const yy = y + 13 + i * 15;
      sc.T(pol.name, x, yy, sc.fitSize(pol.name, 8, 78), C.w, 'left', a);
      sc.PR(x + 82, yy + 1, (w - 150) * (v / max) * a, 8, col, 0.9);
      sc.T(`+${yen(v)}`, x + w, yy, 8, col, 'right', a);
      this.tip(sc, x, yy - 2, w, 13, policyTip(id, owned.find((o) => o.id === id)?.lv ?? 1, owned));
    });
  }

  private drawRewards(sc: Screen, x: number, y: number, w: number, ids: string[], a: number) {
    ids.slice(0, 3).forEach((id, i) => {
      const ach = RUN_ACHIEVEMENTS.find((q) => q.id === id);
      const it = achievementItem(id);
      if (!ach) return;
      const yy = y + i * 18;
      sc.glow(x, yy, w, 17, C.gold3, 0.4 * a * (0.7 + 0.3 * Math.sin(this.g.t * 5 + i)));
      sc.panel(x, yy, w, 17, '#3a2410', C.gold3, a);
      const left = `実績「${ach.title}」`;
      sc.T(left, x + 5, yy + 4, sc.fitSize(left, 8, w * 0.42, 6), '#fff0b0', 'left', a);
      const right = it ? `${KIND_NAME[it.kind]}「${it.name.replace(/（.*）/, '')}」` : '';
      if (it) sc.T(right, x + w - 5, yy + 4, sc.fitSize(right, 8, w * 0.55 - 8, 6), C.w, 'right', a);
      this.tip(sc, x, yy, w, 17, { title: left, col: C.gold3, lines: [{ t: ach.condition, col: C.w }, ...(it ? [{ t: `ごほうび：${right}。ずかんから付けられ、ふだんの営業でも使える` }] : [])] });
    });
    if (ids.length > 3) sc.T(`ほか${ids.length - 3}件（ずかんで確認）`, x + w, y + 53.5, 8, C.cream, 'right', a);
  }

  /** かけ合わせの名前を並べる（マウスを乗せると説明）。使った高さを返す */
  private pairList(sc: Screen, keys: string[], x: number, y: number, w: number, col: Color, a: number) {
    let cx = x;
    let cy = y;
    for (const k of keys) {
      const name = `『${pairOf(k)?.name ?? ''}』`;
      const tw = sc.W(name, 8);
      if (cx + tw > x + w && cx > x) { cx = x; cy += 11; }
      sc.T(name, cx, cy, 8, col, 'left', a);
      this.tip(sc, cx, cy - 1, tw, 10, pairTip(k));
      cx += tw + 2;
    }
    return cy - y + 11;
  }

  private drawDay(sc: Screen) {
    const g = this.g;
    const o = this.outcome;
    const run = this.run;
    if (!o || !run) return;
    const age = o.resumed ? 9 : g.t - this.at;
    const r = o.result;
    // 音：売上を数える音 → 判子 → ごほうび
    if (!this.fxDone.stamp && age > 1.5) { this.fxDone.stamp = true; g.sound.stamp(); g.sound.dayClear(); }
    if (age > 0.25 && age < 1.4 && age - this.fxDone.tick > 0.06) { this.fxDone.tick = age; g.sound.tick(); }
    if (!this.fxDone.reward && age > 2.1 && (o.achievements.length || o.newPairs.length || o.newSets.length)) { this.fxDone.reward = true; g.sound.reward(); }
    sc.radialGlow(LW / 2, 60, 150, '#ffb45a', 0.22 * ease(age / 0.6), 0.45);
    sc.TB(`のれん${run.loop}枚目　${run.day + 1}日目の閉店`, LW / 2, 8, 13, C.gold3, 'center', C.ink, ease(age / 0.3));
    const shown = Math.round(r.sales * ease((age - 0.25) / 1.15));
    sc.TB(yen(shown), LW / 2, 26, 26, C.gold, 'center', C.ink, ease(age / 0.3));
    // 目標の帯：越えた分は光る
    const bw = 280;
    const bx = LW / 2 - bw / 2 - 20;
    const ratio = shown / Math.max(1, r.goal);
    sc.panel(bx, 60, bw, 12, '#211712', C.wood3);
    sc.PR(bx + 1, 61, (bw - 2) * Math.min(1, ratio), 10, ratio >= 1 ? '#d8a030' : '#8a4a62');
    sc.T(`目標 ${yen(r.goal)}`, bx + 4, 62, 8, C.w);
    sc.T(`${Math.round(ratio * 100)}%`, bx + bw - 4, 62, 8, ratio >= 1 ? '#fff0b0' : C.cream, 'right');
    if (age > 1.5) {
      const k = Math.min(1, (age - 1.5) / 0.18);
      sc.TB('目標突破！', bx + bw + 6, 60 - (1 - k) * 8, 12 + (1 - k) * 10, '#ff6a5a', 'left', '#fff3d6', k);
    }
    const a2 = ease((age - 1.7) / 0.4);
    // 左：この日の数字と、働いた方針
    sc.panel(18, 82, 216, 124, 'rgba(36,23,14,0.95)', '#8a6232', a2);
    const stats: [string, string][] = [['出した皿', `${r.served}皿`], ['最大コンボ', `${r.maxCombo}`], ['同時に出した皿', r.maxChain > 1 ? `${r.maxChain}皿` : '―'], ['一皿の最高', yen(r.bestServe)]];
    stats.forEach(([k, v], i) => {
      sc.T(k, 28 + (i % 2) * 104, 88 + Math.floor(i / 2) * 13, 8, '#d9c2a0', 'left', a2);
      sc.T(v, 124 + (i % 2) * 104, 88 + Math.floor(i / 2) * 13, 8, C.w, 'right', a2);
    });
    sc.PR(28, 116, 196, 1, '#5a3a1c', a2);
    this.drawTop(sc, 28, 122, 196, o.yen, a2, run.owned);
    // 右：見つけたかけ合わせ・解放・ごほうび
    sc.panel(244, 82, 218, 124, 'rgba(36,23,14,0.95)', '#8a6232', a2);
    let y = 88;
    if (o.newSets.length) {
      sc.T('型を見つけた！', 254, y, 8, '#ffb0e0', 'left', a2);
      let cx = 258;
      for (const k of o.newSets) {
        const name = `『${setOf(k)?.name ?? ''}』`;
        sc.T(name, cx, y + 12, 8, C.w, 'left', a2);
        this.tip(sc, cx, y + 11, sc.W(name, 8), 10, setTip(k));
        cx += sc.W(name, 8) + 2;
      }
      y += 25;
    }
    if (o.newPairs.length) {
      sc.T('かけ合わせを見つけた！', 254, y, 8, '#ffe27a', 'left', a2);
      y += 12 + this.pairList(sc, o.newPairs, 258, y + 12, 196, C.w, a2);
    }
    if (o.newPolicies.length) {
      sc.T('新しい方針が選べるように', 254, y, 8, '#a9f0e4', 'left', a2);
      let cx = 258;
      for (const id of o.newPolicies) {
        const name = `「${policyOf(id).name}」`;
        sc.T(name, cx, y + 11, 8, C.w, 'left', a2);
        this.tip(sc, cx, y + 10, sc.W(name, 8), 10, policyTip(id, 1, run.owned));
        cx += sc.W(name, 8);
      }
      y += 24;
    }
    if (o.achievements.length) this.drawRewards(sc, 252, y, 202, o.achievements, ease((age - 2.1) / 0.3));
    else if (!o.newPairs.length && !o.newSets.length && !o.newPolicies.length) {
      sc.T('明日は、もっとお客が来る。', 254, y, 8.5, C.cream, 'left', a2);
      sc.T('このあと、明日の営業を3つから選ぶ', 254, y + 14, 8, C.w, 'left', a2);
      this.build(sc, 254, y + 34, run.owned, false);
    }
    if (age > 2.0) {
      const items = this.menuItems();
      button(g, items[0], LW / 2 - 70, 216, 150, 36, 'primary', 'Enter');
      button(g, items[1], 24, 222, 110, 28, 'plain');
    }
  }

  // ---------- 明日の営業えらび ----------

  private drawRoad(sc: Screen) {
    const g = this.g;
    const run = this.run;
    if (!run) return;
    const age = g.t - this.at;
    const typing = g.menu.typed.length > 0;
    sc.TB(`${run.day + 2}日目は、どんな営業にする？`, LW / 2, 8, 14, '#ffd98a', 'center', '#3a1408');
    sc.T('名前を打って選ぶ。きつい日ほど、目標もごほうびも大きい', LW / 2, 27, 8, C.cream, 'center');
    const roads = roadOffers(run.seed, run.day);
    roads.forEach((r, i) => {
      const inT = ease((age - i * 0.08) / 0.3);
      const live = g.menu.active.some((l) => l.target.id === r.kana);
      const dim = typing && !live;
      const a = inT * (dim ? 0.5 : 1);
      const w = 146;
      const x = 13 + i * 154;
      const y = 40 + (1 - inT) * 18 - (live ? 2 : 0);
      const h = 162;
      const col = r.goalMult > 1.12 ? '#ffb86a' : r.goalMult >= 1 ? '#ffe9b4' : '#8fe6a0';
      sc.PR(x + 2, y + 4, w, h, '#0c0604', 0.5 * a);
      if (live) sc.glow(x, y, w, h, C.gold3);
      drawSignboard(g, x, y, w, h, y);
      if (dim) sc.PR(x, y, w, h, '#0e0805', 0.55);
      sc.TB(r.name, x + w / 2, y + 11, sc.fitSize(r.name, 15, w - 24), '#ffe7b0', 'center', '#3a1408', a);
      // 文は切り捨てずに、上から順に置く
      let yy = y + 34;
      r.lines.forEach((t, k) => { yy += this.para(sc, t, x + 12, yy, 8, w - 24, k === 1 && r.gift ? '#ffe9b4' : '#f3dcb0', a, 9.5) * 9.5 + 3; });
      sc.panel(x + 10, y + 104, w - 20, 15, '#22322a', '#6b4422', a);
      sc.T(`目標 ${yen(goalFor(run.day + 1, run.loop, r.id))}`, x + w / 2, y + 107, 8.5, col, 'center', a);
      const good = r.good.filter((p) => run.owned.some((q) => q.id === p));
      if (good.length) {
        const text = `相性◎ ${good.map((p) => POLICY_SEAL[p]).join('・')}`;
        sc.T(text, x + w / 2, y + 123, sc.fitSize(text, 8, w - 22, 5.5), '#a9f0e4', 'center', a);
        this.tip(sc, x + 10, y + 121, w - 20, 11, { title: 'いまの方針との相性', col: '#a9f0e4', lines: good.map((p) => ({ t: `${policyOf(p).name}：${descOf(p, run.owned.find((q) => q.id === p)!.lv)}` })) });
      }
      this.roma(sc, r.kana, x + w / 2, y + 138, dim);
    });
    this.build(sc, 20, 212, run.owned);
    sc.T(`ここまでの売上 ${yen(runTotal(run))}`, 460, 236, 8, C.cream, 'right');
    sc.T('Esc でここまでを残して中断', 460, 249, 8, C.gray, 'right');
  }

  // ---------- 最終結果 ----------

  private drawEnd(sc: Screen) {
    const g = this.g;
    const o = this.outcome;
    const s = o?.summary;
    if (!o || !s) return;
    const age = g.t - this.at;
    if (!this.fxDone.stamp && age > 0.5) { this.fxDone.stamp = true; if (s.cleared) g.sound.runClear(); else g.sound.dayFail(); }
    if (!this.fxDone.reward && age > 1.6 && o.achievements.length) { this.fxDone.reward = true; g.sound.reward(); }
    const last = s.days[s.days.length - 1];
    sc.radialGlow(LW / 2, 50, 170, s.cleared ? '#ffcf5a' : '#6a7aa0', 0.25 * ease(age / 0.6), 0.45);
    if (s.cleared) {
      const k = ease(age / 0.35);
      sc.TB(`のれん${s.loop}枚目　四日間を走りきった！`, LW / 2, 8 - (1 - k) * 10, 16, C.gold3, 'center', '#3a1408', k);
      const fresh = TRIALS.filter((t) => t.from === s.loop + 1).map((t) => t.name);
      const nextText = `つぎは のれん${s.loop + 1}枚目：目標${loopGoalMult(s.loop + 1).toFixed(2)}倍、お客の足も速い${fresh.length ? `。新しい試練「${fresh.join('」「')}」` : ''}`;
      sc.T(nextText, LW / 2, 29, sc.fitSize(nextText, 8.5, 440, 6), '#fff0b0', 'center', k);
    } else {
      sc.TB(`${s.day + 1}日目で店じまい…`, LW / 2, 8, 16, '#c8d4f0', 'center', C.ink, ease(age / 0.35));
      sc.T(`目標まで あと${yen(last.goal - last.sales)}。方針を変えて、もういちど`, LW / 2, 29, 8.5, C.cream, 'center', ease(age / 0.35));
    }
    const a = ease((age - 0.4) / 0.4);
    // 左：日ごとの売上と目標
    sc.panel(18, 44, 216, 114, 'rgba(36,23,14,0.95)', '#8a6232', a);
    sc.T(`合計 ${yen(s.total)}`, 28, 50, 11, C.gold, 'left', a);
    const max = Math.max(1, ...s.days.map((d) => Math.max(d.sales, d.goal)));
    for (let d = 0; d < RUN_DAYS; d++) {
      const day = s.days[d];
      const y = 68 + d * 21;
      sc.T(`${d + 1}日目`, 28, y + 3, 8, day ? C.cream : C.gray2, 'left', a);
      sc.PR(62, y, 104, 12, '#211712', a);
      if (!day) continue;
      const ok = day.sales >= day.goal;
      sc.PR(62, y + 1, 104 * (day.sales / max) * a, 10, ok ? '#d8a030' : '#8a4a62');
      sc.PR(62 + 104 * (day.goal / max), y - 1, 1.5, 14, C.w, a);
      sc.T(yen(day.sales), 226, y - 1, sc.fitSize(yen(day.sales), 8, 56, 5.5), ok ? '#fff0b0' : '#ff9a8a', 'right', a);
      sc.T(roadOf(day.road).name, 226, y + 7, 6, C.gray, 'right', a);
    }
    // 右：できあがった店と、次の一手
    sc.panel(244, 44, 218, 114, 'rgba(36,23,14,0.95)', '#8a6232', a);
    sc.T(s.cleared ? 'この店の方針' : 'ここまでの方針', 254, 50, 8, C.gold3, 'left', a);
    for (let i = 0; i < MAX_SLOTS; i++) if (s.owned[i]) this.seal(sc, 254 + i * 25, 61, s.owned[i], a, s.owned);
    if (!s.owned.length) sc.T('方針なし', 254, 68, 8, C.gray, 'left', a);
    if (s.sig) {
      const sig = s.sig;
      sc.T(`主力：${policyOf(sig).name}`, 254, 87, 8.5, FAMILY_COLOR[policyOf(sig).family], 'left', a);
      this.tip(sc, 254, 86, 200, 11, policyTip(sig, s.owned.find((q) => q.id === sig)?.lv ?? 1, s.owned));
    }
    let py = 100;
    if (s.pairs.length) py += this.pairList(sc, s.pairs, 254, py, 200, '#ffe9b4', a);
    else { sc.T('かけ合わせは成立しなかった', 254, py, 8, C.gray, 'left', a); py += 11; }
    if (py < 136) this.para(sc, this.hint(s.cleared, s.owned, s.pairs), 254, py + 1, 8, 200, '#a9f0e4', a, 9);
    if (o.coins > 0) sc.T(`ごほうび：貯金箱に +${yen(o.coins)}`, 254, 146, 8, C.gold, 'left', a);
    // 下：実績と限定の飾り
    if (o.achievements.length) this.drawRewards(sc, 60, 160, 360, o.achievements, ease((age - 1.6) / 0.3));
    else if (o.newPolicies.length) sc.T(`新しい方針が選べるように：${o.newPolicies.map((p) => `「${policyOf(p).name}」`).join('')}`, LW / 2, 170, 8.5, '#a9f0e4', 'center', a);
    else sc.T(`見つけたかけ合わせ ${this.meta.discovered.length}/${PAIRS.length}`, LW / 2, 170, 8.5, C.cream, 'center', a);
    if (age > 1.4) {
      const items = this.menuItems();
      button(g, items[0], LW / 2 - 80, 226, 160, 36, 'primary', 'Enter');
      button(g, items[1], 24, 232, 116, 28, 'plain');
      button(g, items[2], 340, 232, 116, 28, 'plain', 'Esc');
    }
  }

  /** 次に試すことの一言 */
  private hint(cleared: boolean, owned: Owned[], pairs: string[]): string {
    if (cleared) return 'ちがう主力でも、クリアを狙ってみよう';
    const has = (p: PolicyId) => owned.some((o) => o.id === p);
    const near = PAIRS.find((p) => has(p.a) !== has(p.b) && !pairs.includes(pairKey(p.a, p.b)));
    if (near) return `次は「${policyOf(has(near.a) ? near.b : near.a).name}」を足すと『${near.name}』になる`;
    if (owned.some((o) => o.lv < MAX_LEVEL)) return '広げすぎず、かけ合わせの2つを最大まで育てると伸びる';
    return '明日の営業は、目標の軽い日を選ぶ手もある';
  }

  // ---------- ずかん ----------

  private drawBook(sc: Screen) {
    const g = this.g;
    const b = this.book;
    const m = this.meta;
    const unlocked = g.records?.unlocked ?? {};
    drawSignboard(g, 170, 2, 140, 28);
    sc.TB('繁盛記のずかん', LW / 2, 8, 13, '#ffd98a', 'center', '#3a1408');
    BOOK_TABS.forEach((t, i) => {
      const x = 22 + i * 110;
      sc.panel(x, 34, 104, 15, i === b.tab ? '#5e3b1d' : '#2a1a10', i === b.tab ? C.gold3 : '#6b4422');
      sc.T(t, x + 52, 37.5, 8, i === b.tab ? '#ffe7b0' : '#b89a70', 'center');
    });
    sc.panel(18, 52, 444, 160, 'rgba(36,23,14,0.95)', '#8a6232');
    const rows = 10;
    const top = Math.max(0, Math.min(b.sel - 4, this.bookCount() - rows));
    const row = (i: number, draw: (y: number) => void) => {
      if (i < top || i >= top + rows) return;
      const y = 57 + (i - top) * 15;
      if (i === b.sel) { sc.PR(22, y - 2, 216, 14, '#4a2c1c'); sc.T('▶', 25, y, 8, C.gold3); }
      draw(y);
    };
    const X = 250;
    const W = 202;
    if (b.tab === 0) {
      RUN_ACHIEVEMENTS.forEach((a, i) => row(i, (y) => {
        const got = !!unlocked[a.id];
        sc.T(a.title, 36, y, 8.5, got ? '#fff0b0' : C.cream);
        const p = a.progress(m);
        sc.T(got ? '達成' : `${Math.min(p.now, p.goal).toLocaleString()}/${p.goal.toLocaleString()}`, 234, y, 8, got ? '#a9f0e4' : C.gray, 'right');
      }));
      const a = RUN_ACHIEVEMENTS[b.sel];
      const it = achievementItem(a.id);
      const got = !!unlocked[a.id];
      sc.T(a.title, X, 60, 11, C.gold3);
      this.para(sc, a.condition, X, 78, 8.5, W, C.w);
      if (it) {
        sc.T(`ごほうび：限定の${KIND_NAME[it.kind]} ☆${it.star}`, X, 106, 8, '#ffe9b4');
        sc.panel(X, 118, W, 44, '#211712', got ? C.gold3 : '#5a3a1c');
        const name = g.settings.rankingName || 'あなた';
        const eq = g.collection?.equip;
        if (it.kind === 'plate') drawNameplate(sc, X + 12, 128, W - 24, 24, name, { titleFront: null, titleLink: null, titleBack: null, plate: it.id }, 12);
        else if (it.kind === 'sound') {
          sc.T(`♪ ${it.name}`, X + W / 2, 126, sc.fitSize(`♪ ${it.name}`, 10, W - 12), C.w, 'center');
          sc.T(got ? 'Enter で付けて、試し打ち' : '手に入れると試せる', X + W / 2, 144, 8, C.cream, 'center');
        } else {
          const front = it.kind === 'front' ? it.name : itemById(eq?.front ?? '')?.name ?? '○○';
          const back = it.kind === 'back' ? it.name : itemById(eq?.back ?? '')?.name ?? '○○';
          sc.T(`「${it.kind === 'front' ? `${it.name}…` : `…${it.name}`}」`, X + W / 2, 124, 11, C.w, 'center');
          sc.T(`例：${front}な${back}`, X + W / 2, 144, sc.fitSize(`例：${front}な${back}`, 8, W - 12, 5.5), C.cream, 'center');
        }
        const worn = !!eq && Object.values(eq).includes(it.id);
        this.para(sc, got ? (worn ? '付けています（ふだんの営業やランキングでも使われます）' : 'Enter で付ける（「きろく」のプロフィールでも選べます）') : 'まだ手に入れていません', X, 167, 8, W, got ? '#a9f0e4' : C.gray, 1, 9.5);
      }
    } else if (b.tab === 1) {
      // 3つ組の「型」を先に、2つ組のかけ合わせをそのあとに並べる
      SETS.forEach((x, i) => row(i, (y) => {
        const found = m.sets.includes(setKey(x));
        sc.T(found ? `型『${x.name}』` : '型『？？？』', 36, y, 8.5, found ? '#ffb0e0' : C.gray);
        sc.T(found ? x.ids.map((q) => POLICY_SEAL[q]).join('＋') : `${POLICY_SEAL[x.ids[0]]}＋？＋？`, 234, y, 8, found ? C.cream : C.gray, 'right');
      }));
      PAIRS.forEach((p, i) => row(SETS.length + i, (y) => {
        const found = m.discovered.includes(pairKey(p.a, p.b));
        sc.T(found ? `『${p.name}』` : '『？？？』', 36, y, 8.5, found ? '#ffe9b4' : C.gray);
        sc.T(found ? `${POLICY_SEAL[p.a]}＋${POLICY_SEAL[p.b]}` : `${POLICY_SEAL[p.a]}＋？`, 234, y, 8, found ? C.cream : C.gray, 'right');
      }));
      if (b.sel < SETS.length) {
        const x = SETS[b.sel];
        const found = m.sets.includes(setKey(x));
        sc.T(found ? `型『${x.name}』` : '型『？？？』', X, 60, 11, '#ffb0e0');
        let yy = 80;
        yy += this.para(sc, found ? setText(x) : `「${policyOf(x.ids[0]).name}」と、まだ見つけていない2つの方針の型`, X, yy, 8.5, W, found ? C.w : C.gray) * 11 + 6;
        this.para(sc, `型は打った皿だけに効き、+${Math.round(SET_BONUS * 100)}%。まとめ出しは入らない。`, X, yy, 8, W, C.cream);
        sc.T(`見つけた型 ${m.sets.length}/${SETS.length}・かけ合わせ ${m.discovered.length}/${PAIRS.length}`, X, 180, 8, '#a9f0e4');
      } else {
      const p = PAIRS[b.sel - SETS.length];
      const found = m.discovered.includes(pairKey(p.a, p.b));
      sc.T(found ? `『${p.name}』` : '『？？？』', X, 60, 11, C.gold3);
      let y = 80;
      y += this.para(sc, found ? pairText(p) : `「${policyOf(p.a).name}」と、まだ見つけていない方針の組`, X, y, 8.5, W, found ? C.w : C.gray) * 11 + 6;
      this.para(sc, `増える割合は、2つの段階の合計×10%（Lv1同士で+20%、最大+${Math.round(PAIR_MAX * 100)}%）。いくつも重なると、そのぶん足される。`, X, y, 8, W, C.cream);
      sc.T(`見つけた型 ${m.sets.length}/${SETS.length}・かけ合わせ ${m.discovered.length}/${PAIRS.length}`, X, 180, 8, '#a9f0e4');
      }
    } else if (b.tab === 2) {
      const avail = availablePolicies(m);
      POLICIES.forEach((p, i) => row(i, (y) => {
        const open = avail.includes(p.id);
        sc.PR(36, y + 1, 6, 6, FAMILY_COLOR[p.family], open ? 1 : 0.35);
        sc.T(open ? p.name : '？？？', 46, y, 8.5, open ? C.w : C.gray);
        sc.T(FAMILY_NAME[p.family], 234, y, 8, FAMILY_COLOR[p.family], 'right', open ? 1 : 0.4);
      }));
      const p = POLICIES[b.sel];
      const open = avail.includes(p.id);
      sc.T(open ? p.name : '？？？', X, 58, 11, FAMILY_COLOR[p.family]);
      if (open) {
        sc.T(p.quip, X, 73, sc.fitSize(p.quip, 8, W, 5.5), '#b8a0b0');
        let y = 86;
        // 段階で変わる数字は「Lv1→Lv2→Lv3」の順に並べる
        y += this.rich(sc, descAll(p.id), X, y, 8, W, C.cream, '#fff0a8', 1, 10.5) * 10.5 + 2;
        sc.T('色の付いた数字は Lv1→Lv2→Lv3', X, y, 8, '#b8a0b0');
        y += 12;
        sc.T(p.fires ? '皿ごとに効く方針' : '店全体に、いつも効く方針', X, y, 8, '#8fb8a8');
        const partners = PAIRS.filter((q) => q.a === p.id || q.b === p.id);
        this.para(sc, `かけ合わせ：${partners.map((q) => (m.discovered.includes(pairKey(q.a, q.b)) ? `『${q.name}』` : `${policyOf(q.a === p.id ? q.b : q.a).name}と…`)).join(' ')}`, X, y + 11, 8, W, '#ffe9b4', 1, 9);
      } else this.para(sc, `解放の条件：${p.unlock}`, X, 80, 8.5, W, C.cream);
    } else {
      const loop = m.loop;
      PERKS.forEach((q, i) => row(i, (y) => {
        const on = m.daysCleared >= q.at;
        sc.T(`${on ? '◆' : '◇'}おまけ「${q.name}」`, 36, y, 8, on ? '#a9f0e4' : C.gray);
        sc.T(on ? '有効' : `あと${q.at - m.daysCleared}日`, 234, y, 8, on ? '#a9f0e4' : C.gray, 'right');
      }));
      TRIALS.forEach((t, i) => row(PERKS.length + i, (y) => {
        const on = loop >= t.from;
        sc.T(`${on ? '◆' : '◇'}試練「${t.name}」`, 36, y, 8, on ? '#ffb0a0' : C.gray);
        sc.T(`${t.from}枚目から`, 234, y, 8, on ? '#ffb0a0' : C.gray, 'right');
      }));
      if (b.sel < PERKS.length) {
        const q = PERKS[b.sel];
        sc.T(`常連のおまけ「${q.name}」`, X, 60, 10, '#a9f0e4');
        let y = 78;
        y += this.para(sc, q.text, X, y, 8.5, W, C.w) * 11 + 6;
        y += this.para(sc, `目標を越えた日が、通算${q.at}日になると付く（いま${m.daysCleared}日）。`, X, y, 8, W, C.cream) * 10.5 + 6;
        this.para(sc, '「方針」は挑戦のたびに選び直すもの。「おまけ」は一度付けば、次の挑戦からずっと効く小さな助け。', X, y, 8, W, '#8fb8a8', 1, 9.5);
      } else {
        const t = TRIALS[b.sel - PERKS.length];
        sc.T(`のれんの試練「${t.name}」`, X, 60, 10, '#ff9a8a');
        let y = 78;
        y += this.para(sc, t.text(Math.max(loop, t.from)), X, y, 8.5, W, C.w) * 11 + 6;
        y += this.para(sc, `のれん${t.from}枚目から加わる。${loop >= t.from ? 'いまの挑戦で有効。' : ''}`, X, y, 8, W, C.cream) * 10.5 + 6;
        this.para(sc, 'のれんが増えると、売上の目標だけでなく営業そのものも難しくなる。試練は重なっていく。', X, y, 8, W, '#8fb8a8', 1, 9.5);
      }
    }
    if (b.note) sc.T(b.note, X, 199, sc.fitSize(b.note, 8, W, 5.5), b.note.startsWith('まだ') ? '#ff9a8a' : C.gold3);
    sc.T('←→ ページ　↑↓ えらぶ' + (b.tab === 0 ? '　Enter 付ける' : ''), 150, 238, 8, C.cream, 'left');
    button(g, this.menuItems()[0], 24, 228, 116, 28, 'plain', 'Esc', '◀');
  }
}
