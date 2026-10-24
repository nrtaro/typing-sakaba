import { C } from './palette';
import { Screen, LW } from './screen';
import { Sound, VOLUME_NAMES } from './audio';
import { SEATS, ShopView } from './shopView';
import { MinigameView } from './minigameView';
import { FAM, PORTRAIT } from './sprites';
import { drawLights, drawRoomLive, roomLayer } from './room';
import { Art } from './amber/art';
import { CandidateInput } from '../core/candidates';
import { Shop } from '../core/shop';
import { createMinigame, type Minigame } from '../core/minigames';
import { Rng } from '../core/rng';
import { RomajiMatcher, defaultRomaji } from '../core/romaji';
import { SaveStore, type DayRecord } from '../core/save';
import {
  DAY_LENGTH, DIFFICULTIES, FAMILY_NAME, GAME_SUBTITLE, GAME_TITLE, INGREDIENT_NAME, PHASES, SHOP, difficultyOf, rankFor,
  type DifficultyId,
} from '../core/shopConfig';

type Mode = 'title' | 'help' | 'difficulty' | 'play' | 'result';

/** 時間帯ごとの曲 */
const PHASE_TRACK = ['morning', 'noon', 'night'] as const;
/** 結果画面の演出が終わるまでの秒数（この後にメニューを出す） */
const RESULT_READY = 2.6;
/** 結果画面に来てから、キーを受け付けない秒数（打ちながら来ても演出を飛ばさない） */
const RESULT_LOCK = 1.2;
interface MenuItem { text: string; kana: string; act: () => void }

const TYPABLE = /^[a-z\-]$/;

function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** ゲーム全体：画面の切り替え・入力・時間の進行 */
export class Game {
  readonly sc: Screen;
  readonly store = new SaveStore(localStore(), new URLSearchParams(location.search).get('slot') ?? '');
  settings = this.store.loadSettings();
  readonly sound = new Sound(this.settings);
  mode: Mode = 'title';
  shop: Shop | null = null;
  view = new ShopView();
  trip: { game: Minigame<unknown>; phase: 'intro' | 'game' | 'outro'; t: number; earlyReturn?: boolean } | null = null;
  tripView = new MinigameView();
  paused = false;
  result: (DayRecord & { best: boolean; rank: string; title: string; trips: number; difficulty: string }) | null = null;
  readonly menu: CandidateInput<MenuItem>;
  private t = 0;
  private last = performance.now();
  private missFlash = 0;
  private seed = Math.floor(Math.random() * 1e9);
  /** A案の画像素材。読み込み中は null。失敗したらコードで描く絵で動かす */
  art: Art | null = null;
  artState: 'loading' | 'ready' | 'failed' = 'loading';
  private artProgress = 0;
  /** タイトルの背景で動かす営業（自動で料理を出し続ける、にぎわう夜の店） */
  private demo: { shop: Shop; view: ShopView; next: number; rng: Rng } | null = null;
  /** 客席から上がる掛け声や音符 */
  private cheers: { x: number; y: number; t: number; text: string; col: string }[] = [];
  private cheerNext = 0.6;
  /** 遊び方で試し打ちしたときの演出（料理は提供、調達は出発） */
  private helpFx: { kind: 'dish' | 'fishing' | 'hunting'; x: number; y: number; start: number }[] = [];
  /** 結果画面の演出の開始時刻と、鳴らした音の記録 */
  private resultAt = 0;
  private resultFx = { tick: 0, stamped: false, sparkled: false };
  /** 音量を変えたときの表示の残り時間 */
  private volumeShown = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.sc = new Screen(canvas);
    Art.load((done, total) => { this.artProgress = done / total; })
      .then((art) => {
        this.art = art;
        this.view.art = art;
        this.tripView.art = art;
        this.artState = 'ready';
      })
      .catch((err) => {
        console.warn(err);
        this.artState = 'failed';
      });
    this.menu = new CandidateInput(() => this.menuItems().map((it) => ({ id: it.kana, kana: it.kana, data: it })));
    window.addEventListener('keydown', (e) => this.onKey(e));
    // クリックでも音を鳴らせるようにする（ブラウザは操作の前に音を出させない）
    window.addEventListener('pointerdown', () => this.sound.unlock());
    this.sound.play('title');
    window.addEventListener('blur', () => this.autoPause());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.autoPause(); });
    requestAnimationFrame((now) => this.frame(now));
  }

  // ---------- メニュー（打って選ぶ） ----------

  menuItems(): MenuItem[] {
    if (this.mode === 'play' && this.paused) {
      return [
        { text: 'さいかい', kana: 'さいかい', act: () => { this.paused = false; } },
        { text: 'やめる', kana: 'やめる', act: () => this.toTitle() },
      ];
    }
    switch (this.mode) {
      case 'title':
        return [
          { text: 'はじめる', kana: 'はじめる', act: () => { this.mode = 'difficulty'; } },
          { text: 'あそびかた', kana: 'あそびかた', act: () => { this.mode = 'help'; } },
          { text: `おと：${VOLUME_NAMES[this.volume]}`, kana: 'おと', act: () => this.setVolume(this.volume === 0 ? 3 : this.volume - 1) },
        ];
      case 'help':
        // 遊び方の画面では、例の言葉を実際に打って試せる（打ち切ると演出が出て、また打てる）
        return [
          { text: '焼き魚', kana: 'やきざかな', act: () => this.helpPlay('dish') },
          { text: 'つり', kana: 'つり', act: () => this.helpPlay('fishing') },
          { text: 'かり', kana: 'かり', act: () => this.helpPlay('hunting') },
          { text: 'もどる', kana: 'もどる', act: () => { this.mode = 'title'; } },
        ];
      case 'difficulty':
        return [
          ...DIFFICULTIES.map((d) => ({ text: d.name, kana: d.kana, act: () => this.start(d.id) })),
          { text: 'もどる', kana: 'もどる', act: () => { this.mode = 'title'; } },
        ];
      case 'result':
        return [
          { text: 'もういちど', kana: 'もういちど', act: () => this.start() },
          { text: 'たいとる', kana: 'たいとる', act: () => this.toTitle() },
        ];
      default:
        return [];
    }
  }

  /** 今の音量の段階（以前の「おと：なし」の保存も読めるようにする） */
  get volume() {
    return this.settings.muted ? 0 : this.settings.volume ?? 3;
  }

  /** 音量を変えて保存し、右上に小さく出す */
  private setVolume(v: number) {
    this.settings.volume = Math.max(0, Math.min(3, v));
    this.settings.muted = this.settings.volume === 0;
    this.volumeShown = 1.4;
    this.store.saveSettings(this.settings);
    this.sound.apply(this.settings);
    if (this.settings.volume > 0) this.sound.select();
  }


  private toTitle() {
    this.mode = 'title';
    this.shop = null;
    this.trip = null;
    this.paused = false;
    this.sound.play('title');
  }

  /** Enter で選ばれる項目：難易度の画面では前回の難易度、それ以外は先頭 */
  private enterItem(): MenuItem | undefined {
    const items = this.menuItems();
    if (this.mode === 'difficulty') return items.find((it) => it.kana === difficultyOf(this.settings.difficulty).kana);
    if (this.mode === 'help') return items[items.length - 1];
    return items[0];
  }

  start(difficulty: DifficultyId = this.settings.difficulty) {
    if (difficulty !== this.settings.difficulty) {
      this.settings.difficulty = difficulty;
      this.store.saveSettings(this.settings);
    }
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    this.shop = new Shop(new Rng(this.seed), difficultyOf(difficulty));
    this.view = new ShopView();
    this.view.art = this.art;
    this.trip = null;
    this.paused = false;
    this.mode = 'play';
    this.result = null;
    this.sound.play('morning');
    this.sound.bell();
  }

  private autoPause() {
    if (this.mode === 'play' && !this.paused) {
      this.paused = true;
      this.menu.reset();
    }
  }

  // ---------- 入力 ----------

  private onKey(e: KeyboardEvent) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.sound.unlock();
    if (e.isComposing || e.key === 'Process') return;
    if (this.artState === 'loading') return;
    const k = e.key;
    if (k === 'Escape' && this.mode === 'play') {
      e.preventDefault();
      if (this.paused) this.paused = false;
      else this.autoPause();
      return;
    }
    const inMenu = this.mode !== 'play' || this.paused;
    // ←→ でいつでも音量を変えられる
    if (k === 'ArrowLeft' || k === 'ArrowRight') {
      e.preventDefault();
      this.setVolume(this.volume + (k === 'ArrowRight' ? 1 : -1));
      return;
    }
    // 結果の演出中：打ち続けたまま来ても飛ばされないよう、最初の少しはキーを受け付けない。
    // そのあとはキーで演出を飛ばして最後の状態にする
    if (this.mode === 'result' && this.t - this.resultAt < RESULT_READY) {
      e.preventDefault();
      if (this.t - this.resultAt > RESULT_LOCK) this.resultAt = this.t - RESULT_READY;
      return;
    }
    if (k === 'Escape' && (this.mode === 'help' || this.mode === 'difficulty' || this.mode === 'result')) {
      e.preventDefault();
      this.sound.select();
      if (this.mode === 'result') this.toTitle();
      else this.mode = 'title';
      this.menu.reset();
      return;
    }
    if (inMenu) {
      if (k === 'Enter') {
        e.preventDefault();
        const first = this.enterItem();
        if (first) { this.sound.select(); first.act(); this.menu.reset(); }
        return;
      }
      if (k === 'Backspace') { e.preventDefault(); this.menu.backspace(); return; }
      if (k === ' ') { e.preventDefault(); this.menu.reset(); return; }
      if (k.length === 1 && TYPABLE.test(k.toLowerCase())) {
        e.preventDefault();
        const r = this.menu.key(k);
        if (r.kind === 'miss') { this.sound.miss(); this.missFlash = 0.25; return; }
        this.sound.key(this.menu.typed.length || 1);
        if (r.done.length) { if (this.mode !== 'help' || r.done[0].data.kana === 'もどる') this.sound.select(); r.done[0].data.act(); this.menu.reset(); }
      }
      return;
    }
    // 長押しや帰還演出中の連打で二重に帰還処理を始めない。
    if (k === 'Enter') {
      e.preventDefault();
      if (!e.repeat) this.endTrip(true);
      return;
    }
    // 営業中・調達中
    const target = this.trip?.phase === 'game' ? this.trip.game : this.trip ? null : this.shop;
    if (!target) return;
    if (k === 'Backspace') { e.preventDefault(); target.input.backspace(); return; }
    if (k === ' ') { e.preventDefault(); target.input.reset(); return; }
    if (k.length === 1 && TYPABLE.test(k.toLowerCase())) {
      e.preventDefault();
      target.key(k.toLowerCase());
      this.drainEvents();
    }
  }

  // ---------- 進行 ----------

  private frame(now: number) {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.step(dt);
    this.sc.now = this.t;
    this.draw();
    requestAnimationFrame((n) => this.frame(n));
  }

  /** 動作確認用：今の画面で次に打つべき1文字（最初の候補） */
  debugNextKey(prefer?: (id: string) => boolean): string | null {
    const target = this.trip?.phase === 'game' ? this.trip.game : this.trip ? null : this.shop;
    if (!target) return null;
    const live = target.input.active[0];
    if (live) return live.matcher.remaining[0] ?? null;
    const ts = target.targets() as { id: string; kana: string }[];
    const t = ts.find((x) => !prefer || prefer(x.id)) ?? null;
    return t ? new RomajiMatcher(t.kana).remaining[0] : null;
  }

  /** 動作確認からも呼べる1コマの進行 */
  step(dt: number) {
    this.t += dt;
    this.missFlash = Math.max(0, this.missFlash - dt);
    this.volumeShown = Math.max(0, this.volumeShown - dt);
    if (this.mode === 'title' || this.mode === 'difficulty') this.demoStep(dt);
    if (this.mode === 'result') this.resultStep();
    if (this.mode === 'play' && this.shop) this.view.guide = this.settings.guided ? null : this.guideFor(this.shop);
    if (this.mode !== 'play' || !this.shop || this.paused) return;
    // 背景の読み込み待ちで営業時間を消費しない。
    if (this.trip?.phase === 'intro' && this.trip.t <= 0 && this.tripView.art && !this.tripView.art.has(`bg-${this.trip.game.kind}`)) return;
    const shop = this.shop;
    shop.update(dt);
    this.view.update(dt, shop);
    this.tripView.update(dt);
    if (this.trip) this.stepTrip(dt);
    this.drainEvents();
  }

  private endTrip(earlyReturn = false) {
    const trip = this.trip;
    if (!trip || trip.phase !== 'game') return;
    trip.earlyReturn = earlyReturn && !trip.game.finished;
    trip.phase = 'outro';
    trip.t = SHOP.tripIntro;
    this.sound.tripReturn();
  }

  private stepTrip(dt: number) {
    const trip = this.trip!;
    trip.t -= dt;
    if (trip.phase === 'intro' && trip.t <= 0) {
      if (this.tripView.art && !this.tripView.art.has(`bg-${trip.game.kind}`)) return;
      trip.phase = 'game';
      this.sound.play(trip.game.kind);
    } else if (trip.phase === 'game') {
      trip.game.update(dt);
      if (trip.game.finished) this.endTrip();
    } else if (trip.phase === 'outro' && trip.t <= 0) {
      const r = trip.game.result();
      this.shop!.stats.correctKeys += r.correctKeys;
      this.shop!.stats.missKeys += r.missKeys;
      this.shop!.returnFromTrip(r.gains, trip.earlyReturn);
      this.trip = null;
      this.sound.play(PHASE_TRACK[this.shop!.phaseIndex]);
    }
  }

  private drainEvents() {
    const shop = this.shop;
    if (!shop) return;
    for (const ev of shop.drainEvents()) {
      this.view.handle(ev, shop);
      switch (ev.type) {
        case 'key': if (ev.ok) this.sound.key(ev.count); else this.sound.miss(); break;
        case 'serve': this.sound.serve(); if (ev.combo >= 1) this.sound.combo(ev.combo); break;
        case 'lack': this.sound.lack(); break;
        case 'angry': this.sound.angry(); break;
        case 'tripStart':
          this.trip = { game: createMinigame(ev.trip.id, new Rng(this.seed + shop.stats.trips * 7919), shop.difficulty), phase: 'intro', t: SHOP.tripIntro };
          this.tripView = new MinigameView();
          this.tripView.art = this.art;
          if (this.art) void this.art.ensure(`bg-${ev.trip.id}`).catch(() => { this.tripView.art = null; });
          this.sound.tripStart();
          // 最初の調達に出たら、はじめての人向けの案内は終わり
          if (!this.settings.guided) { this.settings.guided = true; this.store.saveSettings(this.settings); }
          break;
        case 'phase': this.sound.bell(); if (!this.trip) this.sound.play(PHASE_TRACK[ev.index]); break;
        case 'end': this.finish(); break;
        default: break;
      }
    }
    if (this.trip?.phase === 'game') {
      for (const ev of this.trip.game.drainEvents()) {
        this.tripView.handle(ev, this.trip.game);
        if (ev.type === 'key') { if (ev.ok) this.sound.key(ev.count); else this.sound.miss(); }
        else if (ev.type === 'gain') this.sound.gain(this.trip.game.kind);
        else if (ev.type === 'loss' || ev.type === 'escape') this.sound.loss();
        else if (ev.type === 'bite') this.sound.bite();
      }
    }
  }

  private finish() {
    const shop = this.shop!;
    if (this.trip) {
      // 調達中に閉店しても、持ち帰った分の打鍵は記録に残す
      const r = this.trip.game.result();
      shop.stats.correctKeys += r.correctKeys;
      shop.stats.missKeys += r.missKeys;
      this.trip = null;
    }
    const s = shop.stats;
    const total = s.correctKeys + s.missKeys;
    const rec: DayRecord = {
      score: shop.score, served: s.served, maxCombo: s.maxCombo, angry: s.angry,
      kps: s.correctKeys / DAY_LENGTH, accuracy: total ? s.correctKeys / total : 1, finishedAt: new Date().toISOString(),
    };
    const diff = shop.difficulty;
    const best = this.store.record(rec, diff.id);
    const rank = rankFor(rec.score, diff);
    this.result = { ...rec, best, rank: rank.name, title: rank.title, trips: s.trips, difficulty: diff.name };
    this.mode = 'result';
    this.menu.reset();
    this.resultAt = this.t;
    this.resultFx = { tick: 0, stamped: false, sparkled: false };
    this.sound.play('result');
  }

  /** はじめての営業だけ出す案内：まず料理を出す → 食材が減ったら調達 */
  private guideFor(shop: Shop): 'order' | 'supply' | null {
    if (shop.away || this.trip) return null;
    if (shop.stats.served === 0) return shop.seats.some((g) => g && g.state === 'wait') ? 'order' : null;
    const low = Object.values(shop.stock).some((n) => n <= 3);
    return low || shop.stats.served >= 3 ? 'supply' : null;
  }

  // ---------- タイトルの背景：にぎわう夜の店 ----------

  /** 夜の部の途中で時間を止め、食材は尽きないようにして、自動で料理を出し続ける */
  private demoStep(dt: number) {
    if (!this.art) return;
    if (!this.demo) {
      // 客が次々に来て、ゆっくり食べていく店にする（背景用。遊ぶときの難易度とは別）
      const shop = new Shop(new Rng(20261024), { ...difficultyOf('normal'), everyMult: 0.5, waitMult: 4 });
      const view = new ShopView();
      view.art = this.art;
      this.demo = { shop, view, next: 0.5, rng: new Rng(99) };
      // 最初から席が埋まっている状態にしておく
      for (let i = 0; i < 20 * 60; i++) this.demoTick(1 / 20);
    }
    this.demoTick(dt);
  }

  private demoTick(dt: number) {
    const d = this.demo!;
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
    for (const c of this.cheers) c.t += dt;
    this.cheers = this.cheers.filter((c) => c.t < 1.6);
    this.cheerNext -= dt;
    if (this.cheerNext <= 0) {
      this.cheerNext = d.rng.range(0.35, 0.9);
      const eating = shop.seats.map((g, i) => ({ g, i })).filter((x) => x.g && x.g.state === 'eat' && !x.g.awaitingDelivery);
      if (eating.length) {
        const { i } = d.rng.pick(eating);
        const words = ['カンパイ！', 'うまい！', '♪', '♪', 'おかわり！', '♪'];
        const text = d.rng.pick(words);
        this.cheers.push({ x: SEATS[i].x + d.rng.range(-6, 6), y: SEATS[i].ty - 30, t: 0, text, col: text === '♪' ? C.gold3 : C.cream });
      }
    }
  }

  private drawCheers() {
    const sc = this.sc;
    for (const c of this.cheers) {
      const a = Math.min(1, c.t * 4, (1.6 - c.t) * 2);
      const size = c.text === '♪' ? 10 : 8;
      sc.TB(c.text, c.x + Math.sin(c.t * 3 + c.x) * 2, c.y - c.t * 14, size, c.col, 'center', C.ink, a);
    }
  }

  // ---------- 描画 ----------

  private draw() {
    const sc = this.sc;
    if (this.artState === 'loading') {
      sc.clearScreen();
      sc.TB(GAME_TITLE, LW / 2, 100, 24, C.gold3, 'center', C.red2);
      sc.TB(`絵を読み込み中… ${Math.round(this.artProgress * 100)}%`, LW / 2, 140, 12, C.cream, 'center');
      sc.PR(LW / 2 - 80, 160, 160, 5, C.ink);
      sc.PR(LW / 2 - 80, 160, 160 * this.artProgress, 5, C.gold);
      return;
    }
    if (this.mode === 'play' && this.shop) {
      if (this.trip?.phase === 'game' || this.trip?.phase === 'outro') {
        this.tripView.draw(sc, this.trip.game, this.shop, this.t, this.trip.phase === 'game');
        if (this.trip.phase === 'outro') this.drawTripOutro();
      } else {
        this.view.draw(sc, this.shop, this.t, false);
        if (this.trip?.phase === 'intro') this.drawTripIntro();
      }
      if (this.paused) this.drawMenuScreen('一時停止中', '');
      this.drawVolume();
      return;
    }
    // タイトル・遊び方・結果：店内を背景に
    const g = sc.g;
    const ph = this.mode === 'result' ? 2 : 1;
    if ((this.mode === 'title' || this.mode === 'difficulty') && this.art && this.demo) {
      sc.clearScreen();
      this.demo.view.drawTavern(sc, this.demo.shop);
      this.drawCheers();
    } else if (this.art) {
      sc.clearScreen();
      if (this.mode === 'result' || this.mode === 'title') this.art.drawBackground(sc, 'bg-tavern-night');
      else this.art.drawMenuBackground(sc);
    } else {
      sc.begin();
      g.drawImage(roomLayer(ph, sc), 0, 0);
      sc.toBase();
      drawRoomLive(g, this.t);
      drawLights(g, ph, sc);
      sc.present();
    }
    if (this.mode === 'title') {
      // 店の様子は見せたまま、上だけ少し沈めて看板と黒板を読みやすくする
      sc.cover(C.bg, 0.08);
      sc.fade(sc.ext.x0, sc.ext.y0, sc.ext.w, 100 - sc.ext.y0, '#120a06', 0.55, 0, 'y');
    } else if (this.mode === 'difficulty' && this.demo) {
      // タイトルと同じ店を背景に、少し暗くして札を引き立てる
      sc.cover(C.bg, 0.4);
    } else sc.cover(C.bg, 0.7);
    if (this.mode === 'title') this.drawTitle();
    else if (this.mode === 'help') this.drawHelp();
    else if (this.mode === 'difficulty') this.drawDifficulty();
    else this.drawResult();
    if (this.mode !== 'result' || this.t - this.resultAt > RESULT_READY - 0.3) this.drawMenu(this.mode === 'help' ? 210 : this.mode === 'result' ? 200 : this.mode === 'difficulty' ? 170 : 172);
    if (this.missFlash > 0) sc.PR(sc.ext.x0, sc.ext.y1 - 3, sc.ext.w, 3, C.red, this.missFlash * 3);
    this.drawVolume();
  }

  /** 音量を変えた直後だけ、右上に4段のメーターを出す */
  private drawVolume() {
    if (this.volumeShown <= 0) return;
    const sc = this.sc;
    const a = Math.min(1, this.volumeShown * 3);
    const x = sc.ext.x1 - 92;
    const y = sc.ext.y0 + 30;
    sc.panel(x, y, 84, 20, 'rgba(42,27,38,0.95)', C.gold, a);
    sc.T(`音量 ${VOLUME_NAMES[this.volume]}`, x + 6, y + 5, 9, C.cream, 'left', a);
    for (let i = 0; i < 3; i++) sc.PR(x + 52 + i * 9, y + 13 - i * 3, 6, 4 + i * 3, i < this.volume ? C.gold : C.ink, a);
  }

  private drawMenu(y: number) {
    const sc = this.sc;
    const items = this.menuItems();
    if (this.mode === 'title') return;
    if (this.mode === 'difficulty') return;
    if (this.mode === 'help') {
      this.button(items[items.length - 1], 22, 226, 116, 30, 'plain', 'Esc', '◀');
      return;
    }
    const iw = items.length >= 4 ? 108 : 124;
    const gap = items.length >= 4 ? 8 : 12;
    const def = this.enterItem();
    const total = items.length * iw + (items.length - 1) * gap;
    const typing = this.menu.typed.length > 0;
    items.forEach((it, k) => {
      const x = LW / 2 - total / 2 + k * (iw + gap);
      const live = this.menu.active.find((l) => l.target.id === it.kana);
      const dim = typing && !live;
      const isDefault = !typing && def === it && this.mode === 'difficulty';
      const yy = live ? y - 2 : y;
      if (live) sc.glow(x, yy, iw, 40);
      sc.panel(x, yy, iw, 40, live ? '#4a2c3c' : 'rgba(42,27,38,0.95)', live || isDefault ? C.gold : C.wood4, dim ? 0.4 : 1);
      sc.T(it.text, x + iw / 2, yy + 3, 14, dim ? C.gray : C.w, 'center', dim ? 0.5 : 1);
      const m = live?.matcher ?? new RomajiMatcher(it.kana);
      sc.roma(m.typed, m.remaining, x + iw / 2, yy + 23, 11, live ? 'active' : dim ? 'dim' : 'idle');
      if (k === 0 && !typing) sc.keycap('Enter', x + iw - 30, yy - 7, 6);
      if (this.mode === 'result' && k === items.length - 1 && !typing) sc.keycap('Esc', x + iw - 22, yy - 7, 6);
    });
  }

  private drawMenuScreen(title: string, sub: string) {
    const sc = this.sc;
    sc.cover(C.bg, 0.6);
    sc.TB(title, LW / 2, 92, 20, C.gold3, 'center');
    if (sub) sc.TB(sub, LW / 2, 122, 10, C.cream, 'center');
    this.drawMenu(146);
  }

  /**
   * 打って選ぶ札。打ち始めると合う札が浮き上がって光り、下の帯が打った分だけ伸びる。
   * 合わない札は暗く沈む。primary は明るい木札、plain は暗い札。
   */
  private button(it: MenuItem, x: number, y: number, w: number, h: number, style: 'primary' | 'plain', key?: string, mark?: string) {
    const sc = this.sc;
    const live = this.menu.active.find((l) => l.target.id === it.kana);
    const typing = this.menu.typed.length > 0;
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
    sc.roma(m.typed, m.remaining, romaX, yy + (primary ? 23 : 17), romaSize, live ? 'active' : dim ? 'dim' : 'idle', 1, primary);
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

  /** 吊り看板：鎖で下がった木の板に店名を彫る */
  private drawSignboard(x: number, y: number, w: number, h: number) {
    const sc = this.sc;
    for (const cx of [x + 28, x + w - 28]) for (let cy = sc.ext.y0; cy < y; cy += 4) {
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

  /**
   * タイトル：上に吊り看板と自己ベストの黒板、下に木のカウンター風のメニュー台。
   * 真ん中は実際の店（客が食べ、家族が運び、おやじが鍋を混ぜる）をそのまま見せる。
   */
  private drawTitle() {
    const sc = this.sc;
    const e = sc.ext;
    if (!this.art || !this.demo) {
      sc.spr(FAM.master[0], 300, 120, 3);
      sc.spr(FAM.wife[0], 350, 130, 3);
      sc.spr(FAM.daughter[0], 400, 140, 3);
    }
    sc.shifted(0, e.y0, () => {
      this.drawSignboard(14, 8, 232, 66);
      sc.TB(GAME_TITLE, 130, 15, 27, '#ffd98a', 'center', '#3a1408');
      sc.T(GAME_SUBTITLE, 130, 51, 9, '#f3dcb0', 'center');
      this.drawBestBoard(330, 8, 138, 74);
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
      if (!this.sound.ready && this.volume > 0) sc.T('♪ キーかクリックで音楽が流れます', 470, 205, 7, C.cream2, 'right', 0.8);
      // 音量は ←→ でも変えられる
      const aw = sc.keycap('←→', 410, 216, 6, 0.85);
      sc.T('音量', 410 + aw + 3, 217, 7, C.cream2, 'left', 0.85);
      const [start, help, sound] = this.menuItems();
      this.button(start, 30, 224, 180, 38, 'primary', 'Enter');
      this.button(help, 218, 228, 130, 30, 'plain');
      this.button(sound, 356, 228, 94, 30, 'plain');
    });
  }

  /** 黒板：難易度ごとの自己ベストとランク。前回選んだ難易度に印を付ける */
  private drawBestBoard(x: number, y: number, w: number, h: number) {
    const sc = this.sc;
    sc.PR(x + 3, y + 4, w, h, '#0c0604', 0.55);
    sc.panel(x, y, w, h, '#22322a', '#6b4422');
    sc.PR(x + 3, y + 3, w - 6, h - 6, '#1d2b24');
    sc.T('自己ベスト', x + w / 2, y + 6, 10, '#f2efe2', 'center');
    sc.PR(x + 14, y + 20, w - 28, 0.8, '#f2efe2', 0.35);
    DIFFICULTIES.forEach((d, i) => {
      const rowY = y + 26 + i * 15;
      const cur = d.id === this.settings.difficulty;
      const best = this.store.loadBest(d.id);
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

  /**
   * 難易度：タイトルと同じ店を背景に、吊り看板と同じ木の札を3枚下げる。
   * 下はタイトルと同じ木のカウンター。打てる札は次のキーが光り、キーが押される絵が動く。
   */
  private drawDifficulty() {
    const sc = this.sc;
    const e = sc.ext;
    const typing = this.menu.typed.length > 0;
    const crowds = ['のんびり', 'ほどよく忙しい', '次々に注文'];
    sc.shifted(0, e.y0 / 2, () => {
      this.drawSignboard(160, 6, 160, 34);
      sc.TB('難易度をえらぶ', LW / 2, 13, 16, '#ffd98a', 'center', '#3a1408');
      DIFFICULTIES.forEach((d, i) => {
        const live = this.menu.active.find((l) => l.target.id === d.kana);
        const last = d.id === this.settings.difficulty;
        const dim = typing && !live;
        const x = 26 + i * 146;
        const y = (live ? 50 : 52) + Math.sin(this.t * 1.6 + i * 1.3) * (typing ? 0 : 0.8);
        const w = 136;
        const h = 150;
        if (live) sc.glow(x, y, w, h, C.gold3);
        else if (last && !typing) sc.glow(x, y, w, h, C.gold3, 0.35 + 0.25 * Math.sin(this.t * 3));
        this.drawSignboard(x, y, w, h);
        if (!i) {
          sc.panel(x + 10, y + 10, 66, 13, '#a7c99d', '#4c6b43');
          sc.T('はじめての人に', x + 14, y + 13, 7, '#203321');
        }
        sc.TB(d.name, x + w / 2, y + 28, 20, '#ffe7b0', 'center', '#3a1408');
        sc.T(crowds[i], x + w / 2, y + 55, 9, '#f3dcb0', 'center');
        // ローマ字の札：遊び方と同じく、次に打つ文字が光り、キーが押される絵が動く
        const m = live?.matcher ?? new RomajiMatcher(d.kana);
        const rw = sc.W(m.typed + m.remaining, 11) + 14;
        sc.panel(x + w / 2 - rw / 2, y + 70, rw, 18, '#211712', live ? C.gold : C.gold2);
        sc.roma(m.typed, m.remaining, x + w / 2, y + 73, 11, dim ? 'dim' : 'active');
        if (!dim) {
          const down = Math.floor(this.t * 2.5 + i) % 2 === 0;
          const kx = x + w / 2 + rw / 2 - 5;
          const ky = y + 64 + (down ? 1.5 : 0);
          sc.panel(kx, ky, 12, 12, down ? '#e3c890' : '#f6e2b8', '#8a6232');
          sc.T((m.remaining[0] ?? '').toUpperCase(), kx + 6, ky + 2, 8, '#3a2414', 'center');
        }
        // お客の多さ：並ぶ客の数で見せる
        if (this.art) for (let j = 0; j <= i; j++) {
          this.art.drawFrame(sc, 'guests-seated', j * 4, x + w / 2 - i * 17 + j * 34, y + 122, this.art.scaleFor('guests-seated', j * 4, 24));
        }
        // ベスト：黒板の帯
        const best = this.store.loadBest(d.id);
        sc.panel(x + 12, y + 127, w - 24, 15, '#22322a', '#6b4422');
        sc.T(best ? `ベスト ${best.score.toLocaleString()}` : 'ベスト ―', x + w / 2, y + 130, 8, '#f2efe2', 'center');
        if (last && !typing) sc.keycap('Enter', x + w - 38, y + 10, 7);
        if (dim) sc.PR(x, y, w, h, '#0e0805', 0.6);
      });
    });
    // 下：タイトルと同じ木のカウンター
    sc.PR(e.x0, 212, e.w, e.y1 - 212, '#2a1a10');
    sc.PR(e.x0, 212, e.w, 2, '#a8743f');
    sc.PR(e.x0, 214, e.w, 1, '#5a3a1c');
    for (let yy = 232; yy < e.y1; yy += 18) sc.PR(e.x0, yy, e.w, 0.6, '#3a2414', 0.8);
    sc.shifted(0, (e.y1 - 270) / 2, () => {
      const items = this.menuItems();
      this.button(items[items.length - 1], 26, 228, 120, 30, 'plain', 'Esc', '◀');
    });
  }

  /** 遊び方の試し打ち：料理は提供の演出、調達は家族が出かける演出（本番と同じ音） */
  private helpPlay(kind: 'dish' | 'fishing' | 'hunting') {
    if (kind === 'dish') {
      this.helpFx.push({ kind, x: 116, y: 70, start: this.t });
      this.sound.serve();
    } else {
      this.helpFx.push({ kind, x: kind === 'fishing' ? 196 : 260, y: 86, start: this.t });
      this.sound.tripStart();
    }
  }

  /**
   * 遊び方の札：本番の注文札と同じ見た目にし、何も打っていない間も「次に打つ文字」を光らせ、
   * 横でキーが押されている絵を動かして、打てる札だと見て分かるようにする。
   */
  private helpWord(kana: string, text: string, cx: number, y: number, size: number) {
    const sc = this.sc;
    const live = this.menu.active.find((l) => l.target.id === kana);
    const typing = this.menu.typed.length > 0;
    const dim = typing && !live;
    const m = live?.matcher ?? new RomajiMatcher(kana);
    const w = Math.max(sc.W(text, size + 2), sc.W(m.typed + m.remaining, size)) + 16;
    const h = size * 2 + 14;
    // 何も打っていない間は、ゆっくり呼吸するように光らせる
    if (live) sc.glow(cx - w / 2, y, w, h);
    else if (!typing) sc.glow(cx - w / 2, y, w, h, C.gold3, 0.45 + 0.35 * Math.sin(this.t * 3));
    sc.panel(cx - w / 2, y, w, h, live ? '#4a2c3c' : '#211712', live ? C.gold : dim ? C.wood3 : C.gold2);
    sc.T(text, cx, y + 3, size + 2, dim ? '#a89a90' : C.cream, 'center');
    sc.roma(m.typed, m.remaining, cx, y + size + 8, size, dim ? 'dim' : 'active');
    // 右上で、次に打つキーが押されている絵（押す・離すを繰り返す）
    if (!dim) {
      const next = (m.remaining[0] ?? '').toUpperCase();
      const down = Math.floor(this.t * 2.5 + cx) % 2 === 0;
      const kx = cx + w / 2 - 4;
      const ky = y - 9 + (down ? 1.5 : 0);
      sc.PR(kx + 1, y - 6, 12, 12, '#1a0f08', 0.7);
      sc.panel(kx, ky, 12, 12, down ? '#e3c890' : '#f6e2b8', '#8a6232');
      sc.T(next, kx + 6, ky + 2, 8, '#3a2414', 'center');
    }
  }

  private drawHelp() {
    const sc = this.sc;
    sc.TB('遊び方', 24, 18, 22, C.gold3, 'left');
    const titles = ['料理名を打つ', '減ったら調達', 'たくさん出そう'];
    const lines = [['お客の頭上のローマ字を', '打つと、料理を出せます。'], ['下の言葉を打って食材集め。', 'Enterで途中帰還できます。'], ['お客を待たせすぎず、', '３分間の売上に挑戦！']];
    titles.forEach((title, i) => {
      const x = 24 + i * 146;
      sc.panel(x, 54, 138, 128, 'rgba(55,37,23,0.94)', C.wood4);
      sc.T(`0${i + 1}`, x + 12, 63, 9, C.gold3);
      if (i === 0) {
        this.art?.drawIcon(sc, 'icons-dishes', 7, x + 8, 84, 32);
        this.helpWord('やきざかな', '焼き魚', x + 90, 82, 8);
      } else if (i === 1) {
        // 出かけている間は、元の場所の顔を消す
        const away = (k: string) => this.helpFx.some((f) => f.kind === k);
        if (this.art && !away('fishing')) this.art.drawHead(sc, 'family-wife', 0, x + 26, 70, 18);
        if (this.art && !away('hunting')) this.art.drawHead(sc, 'family-master', 0, x + 90, 70, 18);
        this.helpWord('つり', 'つり', x + 35, 96, 8);
        this.helpWord('かり', 'かり', x + 99, 96, 8);
      } else sc.T('3:00', x + 69, 86, 25, C.gold3, 'center');
      sc.T(title, x + 12, 130, 13, C.cream);
      lines[i].forEach((line, j) => sc.T(line, x + 12, 152 + j * 13, 8, C.cream2));
    });
    this.drawHelpFx();
    // 操作キー：キーの形の札で並べる
    let kx = 24;
    for (const [key, label] of [['Backspace', '1文字戻す'], ['Space', '打ち直し'], ['Esc', '一時停止']] as const) {
      kx += sc.keycap(key, kx, 194, 9) + 5;
      sc.T(label, kx, 196, 10, C.cream);
      kx += sc.W(label, 10) + 18;
    }
  }

  /** 試し打ちの演出 */
  private drawHelpFx() {
    const sc = this.sc;
    this.helpFx = this.helpFx.filter((f) => this.t - f.start < 1.2);
    for (const f of this.helpFx) {
      const age = this.t - f.start;
      const a = Math.min(1, (1.2 - age) * 3);
      if (f.kind === 'dish') {
        // 提供：金色の火花・料理の皿・売上
        for (let k = 0; k < 14; k++) {
          const ang = (k / 14) * Math.PI * 2;
          const r = 6 + age * 34;
          sc.PR(f.x + Math.cos(ang) * r, f.y + Math.sin(ang) * r * 0.7, 1.5, 1.5, k % 2 ? C.gold : C.gold3, a);
        }
        this.art?.drawIcon(sc, 'icons-dishes', 7, f.x - 9, f.y - 12 - age * 10, 18, a);
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
        this.art?.drawHead(sc, who, 0, x - 9, f.y - 16 - hop, 18, 0.42, a);
        const say = 'いってきます！';
        const bw = sc.W(say, 7) + 8;
        sc.panel(x - bw / 2, f.y - 32 - hop, bw, 12, C.cream, C.ink, a);
        sc.T(say, x, f.y - 30 - hop, 7, C.ink, 'center', a);
      }
    }
  }

  /** 結果画面の演出が終わって、選べるようになるまでの時間 */
  private resultStep() {
    const r = this.result;
    if (!r) return;
    const age = this.t - this.resultAt;
    // 売上を数え上げる間、カチカチ鳴らす
    if (age > 0.3 && age < 1.6 && age - this.resultFx.tick > 0.06) {
      this.resultFx.tick = age;
      this.sound.tick();
    }
    if (!this.resultFx.stamped && age > 1.8) {
      this.resultFx.stamped = true;
      this.sound.stamp();
    }
    if (r.best && !this.resultFx.sparkled && age > 2.4) {
      this.resultFx.sparkled = true;
      this.sound.sparkle();
    }
  }

  private drawResult() {
    const sc = this.sc;
    const r = this.result;
    if (!r) return;
    const age = this.t - this.resultAt;
    const ease = (v: number) => 1 - Math.pow(1 - Math.max(0, Math.min(1, v)), 3);
    // 売上の後ろに、あたたかい明かり
    sc.radialGlow(LW / 2, 62, 140, '#ffb45a', 0.22 * ease(age / 0.6), 0.45);
    sc.TB('本日の営業終了', LW / 2, 16, 16, C.gold3, 'center', C.ink, ease(age / 0.3));
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
      sc.TB('自己ベスト更新！', LW / 2, 114, 11, C.gold3, 'center', C.ink, p);
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
    // 家族が見送る
    if (this.art) {
      const p = ease((age - 0.4) / 0.5);
      for (const [id, x, hgt] of [['master', 28, 58], ['wife', 452, 52]] as const) {
        this.art.drawAnim(sc, `family-${id}`, '待機', this.t, x, 268 + (1 - p) * 30, this.art.scaleFor(`family-${id}`, 0, hgt), false, p);
      }
    }
  }

  private drawTripIntro() {
    const sc = this.sc;
    const trip = this.shop?.away;
    if (!trip) return;
    sc.cover(C.bg, 0.35);
    sc.panel(110, 94, 260, 54, 'rgba(42,27,38,0.96)', C.gold);
    if (this.art) this.art.drawHead(sc, `family-${trip.who}`, 0, 120, 102, 34, 0.55);
    else sc.spr(PORTRAIT[trip.who], 120, 102, 2.5);
    sc.TB(`${FAMILY_NAME[trip.who]}が${trip.place}へ`, 162, 100, 13, C.gold3, 'left');
    sc.TB(`${trip.act}に出かけた！`, 162, 122, 13, C.w, 'left');
  }

  private drawTripOutro() {
    const sc = this.sc;
    const trip = this.shop?.away;
    if (!trip || !this.trip) return;
    const gains = this.trip.game.result().gains;
    sc.cover(C.bg, 0.45);
    sc.panel(100, 90, 280, 62, 'rgba(42,27,38,0.96)', C.gold);
    sc.TB(this.trip.earlyReturn ? `${FAMILY_NAME[trip.who]}が店に戻った！` : `${FAMILY_NAME[trip.who]}「ただいま！」`, LW / 2, 96, 14, C.gold3, 'center');
    const text = trip.gives.map((id) => `${INGREDIENT_NAME[id]} +${Math.max(this.trip!.earlyReturn ? 0 : trip.minimum[id] ?? 0, gains[id] ?? 0)}`).join('　');
    sc.TB(text, LW / 2, 122, 14, C.w, 'center');
  }
}
