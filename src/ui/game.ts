import { C } from './palette';
import { Screen, LW } from './screen';
import { Sound, VOLUME_NAMES } from './audio';
import { ShopView } from './shopView';
import { MinigameView } from './minigameView';
import { drawLights, drawRoomLive, roomLayer } from './room';
import { Art } from './amber/art';
import { CandidateInput } from '../core/candidates';
import { Shop } from '../core/shop';
import { createMinigame, type Minigame } from '../core/minigames';
import { Rng } from '../core/rng';
import { RomajiMatcher } from '../core/romaji';
import { SaveStore, type DayRecord } from '../core/save';
import type { DailyBoard, RankReceipt } from '../core/ranking';
import { RankingClient } from './rankingClient';
import { openRankingName } from './rankingName';
import { dailyConditions, defaultPrep, jstDate, prepCap, rulesFor, NORMAL_RULES, type Condition, type DayRules } from '../core/daily';
import { MINIGAME_SECONDS, DIFFICULTIES, GAME_TITLE, INGREDIENT_ORDER, SHOP, difficultyOf, rankFor, type DifficultyId, type IngredientId } from '../core/shopConfig';
import { drawVolume, drawMenu, drawMenuScreen, drawImeHint, drawClickHint } from './screens/common';
import { demoStep, drawCheers, drawTitle } from './screens/title';
import { drawDifficulty } from './screens/difficulty';
import { drawModeSelect } from './screens/modeSelect';
import { drawDaily } from './screens/daily';
import { drawPrep, PREP_WORDS } from './screens/prep';
import { helpPlay, drawHelp, openTripHelp, drawTripHelp, drawModeHelp } from './screens/help';
import { resultStep, drawResult } from './screens/result';
import { guideFor, drawCountdown, drawTripIntro, drawTripOutro } from './screens/play';
import { PHASE_TRACK, RESULT_READY, COUNTDOWN, RESULT_LOCK, MenuItem } from './screens/shared';

export type Mode = 'title' | 'help' | 'modeSelect' | 'difficulty' | 'daily' | 'prep' | 'play' | 'result';
export type PlayMode = 'normal' | 'daily';

const TYPABLE = /^[a-z\-]$/;

function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** ひがわり営業の1回分：日本時間の日付と、その日のお題 */
export interface DailyPlay {
  date: string;
  conds: Condition[];
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
  result: (DayRecord & { best: boolean; rank: string; title: string; trips: number; difficulty: string; difficultyId: DifficultyId; daily: DailyPlay | null }) | null = null;
  readonly ranking = new RankingClient();
  board: { key: string; state: 'loading' | 'ready' | 'error'; value: DailyBoard | null } | null = null;
  submission: { state: 'idle' | 'sending' | 'sent' | 'error'; receipt: RankReceipt | null; message: string } = { state: 'idle', receipt: null, message: '' };
  nameEntry: ReturnType<typeof openRankingName> | null = null;
  /** ひがわり営業で遊んでいるときの、日付とお題（通常営業では null） */
  daily: DailyPlay | null = null;
  /** 開店前の仕込み：振り分け（同じ日・同じ難易度なら、もういちどのときも前の振り分けから） */
  prep: { key: string; alloc: Record<IngredientId, number>; sel: number; changed: IngredientId | null; changedAt: number } | null = null;
  readonly menu: CandidateInput<MenuItem>;
  t = 0;
  playElapsed = 0;
  last = performance.now();
  readyMarked = false;
  missFlash = 0;
  seed = Math.floor(Math.random() * 1e9);
  /** A案の画像素材。読み込み中は null。失敗したらコードで描く絵で動かす */
  art: Art | null = null;
  artState: 'loading' | 'ready' | 'failed' = 'loading';
  artProgress = 0;
  /** タイトルの背景で動かす営業（自動で料理を出し続ける、にぎわう夜の店） */
  demo: { shop: Shop; view: ShopView; next: number; rng: Rng } | null = null;
  /** 客席から上がる掛け声や音符 */
  cheers: { x: number; y: number; t: number; text: string; col: string }[] = [];
  cheerNext = 0.6;
  /** 遊び方で試し打ちしたときの演出（料理は提供、調達は出発） */
  helpFx: { kind: 'dish' | 'fishing' | 'hunting'; x: number; y: number; start: number }[] = [];
  /** 最後にキーを押した（またはクリックした）時刻。しばらく何もしないと、打ち方の見本を見せる */
  lastInput = 0;
  /** メニューでクリックされた時刻（「キーボードで打ってね」を出す） */
  clickHintAt = -10;
  /** 日本語入力のまま打たれた時刻（「日本語入力をオフに」を出す） */
  imeHintAt = -10;
  /** 遊び方のページ（0=基本、1=調達のしかた、2=ひがわり営業） */
  helpPage = 0;
  /** 結果画面の演出の開始時刻と、鳴らした音の記録 */
  resultAt = 0;
  resultFx = { tick: 0, stamped: false, sparkled: false };
  /** 開店までの残り秒数（0 なら営業中） */
  countdown = 0;
  /** 「開店！」を見せている残り時間 */
  goShown = 0;
  /** 音量を変えたときの表示の残り時間 */
  volumeShown = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.sc = new Screen(canvas);
    Art.load((done, total) => { this.artProgress = done / total; })
      .then((art) => {
        this.art = art;
        this.view.art = art;
        this.tripView.art = art;
        this.artState = 'ready';
        performance.mark('game:images-ready');
      })
      .catch((err) => {
        console.warn(err);
        this.artState = 'failed';
      });
    this.menu = new CandidateInput(() => this.menuItems().map((it) => ({ id: it.kana, kana: it.kana, data: it })));
    window.addEventListener('keydown', (e) => this.onKey(e));
    // クリックでも音を鳴らせるようにする（ブラウザは操作の前に音を出させない）
    // クリックしても反応しないと戸惑うので、メニューでクリックされたら「キーボードで打つ」ことを知らせる
    window.addEventListener('pointerdown', () => {
      this.sound.unlock();
      if (this.mode !== 'play' || this.paused) {
        this.clickHintAt = this.t;
        this.lastInput = this.t;
      }
    });
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
        { text: `おと：${VOLUME_NAMES[this.volume]}`, kana: 'おと', act: () => this.setVolume(this.volume === 0 ? 3 : this.volume - 1) },
        { text: 'やめる', kana: 'やめる', act: () => this.toTitle() },
      ];
    }
    switch (this.mode) {
      case 'title':
        return [
          { text: 'はじめる', kana: 'はじめる', act: () => { this.mode = 'modeSelect'; } },
          { text: 'あそびかた', kana: 'あそびかた', act: () => { this.mode = 'help'; this.helpPage = 0; } },
          { text: `おと：${VOLUME_NAMES[this.volume]}`, kana: 'おと', act: () => this.setVolume(this.volume === 0 ? 3 : this.volume - 1) },
        ];
      case 'help':
        // 遊び方の画面では、例の言葉を実際に打って試せる（打ち切ると演出が出て、また打てる）
        // 2ページ目：4つの調達のくわしい説明（もどるで1ページ目へ）
        if (this.helpPage !== 0) return [{ text: 'もどる', kana: 'もどる', act: () => { this.helpPage = 0; } }];
        return [
          { text: '焼き魚', kana: 'やきざかな', act: () => helpPlay(this, 'dish') },
          { text: 'つり', kana: 'つり', act: () => helpPlay(this, 'fishing') },
          { text: 'かり', kana: 'かり', act: () => helpPlay(this, 'hunting') },
          { text: 'ひがわり営業', kana: 'ひがわり', act: () => { this.helpPage = 2; } },
          { text: '調達のしかた ▶', kana: 'ちょうたつ', act: () => openTripHelp(this) },
          { text: 'もどる', kana: 'もどる', act: () => { this.mode = 'title'; } },
        ];
      case 'modeSelect':
        return [
          { text: '通常営業', kana: 'つうじょう', act: () => this.pickMode('normal') },
          { text: 'ひがわり営業', kana: 'ひがわり', act: () => this.pickMode('daily') },
          { text: 'もどる', kana: 'もどる', act: () => { this.mode = 'title'; } },
        ];
      case 'difficulty':
        return [
          ...DIFFICULTIES.map((d) => ({ text: d.name, kana: d.kana, act: () => (this.settings.playMode === 'daily' ? this.openDaily(d.id) : this.start(d.id)) })),
          { text: 'もどる', kana: 'もどる', act: () => { this.mode = 'modeSelect'; } },
        ];
      case 'daily':
        return [
          { text: 'はじめる', kana: 'はじめる', act: () => this.afterDaily() },
          { text: 'もどる', kana: 'もどる', act: () => { this.mode = 'difficulty'; } },
        ];
      case 'prep':
        return [
          { text: 'はじめる', kana: 'はじめる', act: () => this.start() },
          ...INGREDIENT_ORDER.map((id) => ({ text: PREP_WORDS[id], kana: PREP_WORDS[id], act: () => this.prepAdd(id, 1) })),
          { text: 'おまかせ', kana: 'おまかせ', act: () => this.prepReset() },
          { text: 'もどる', kana: 'もどる', act: () => this.returnToDaily() },
        ];
      case 'result':
        return [
          ...(this.result?.daily && this.submission.state !== 'sent' ? [{
            text: this.submission.state === 'sending' ? '送信中…' : this.submission.state === 'error' ? 'もういちど送る' : 'なまえをいれる',
            kana: 'なまえ', act: () => this.openRankingName(),
          }] : []),
          // ひがわりは同じお題でもう一度。日付が変わっていたら、新しいお題を見せてから
          { text: 'もういちど', kana: 'もういちど', act: () => (this.daily && this.daily.date !== jstDate() ? this.openDaily() : this.daily ? this.afterDaily() : this.start()) },
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
  setVolume(v: number) {
    this.settings.volume = Math.max(0, Math.min(3, v));
    this.settings.muted = this.settings.volume === 0;
    this.volumeShown = 1.4;
    this.store.saveSettings(this.settings);
    this.sound.apply(this.settings);
    if (this.settings.volume > 0) this.sound.select();
  }

  toTitle() {
    this.nameEntry?.close();
    this.mode = 'title';
    this.shop = null;
    this.trip = null;
    this.paused = false;
    this.sound.play('title');
  }

  /** 通常営業かひがわり営業かを選んで、難易度の画面へ */
  pickMode(m: PlayMode) {
    if (this.settings.playMode !== m) {
      this.settings.playMode = m;
      this.store.saveSettings(this.settings);
    }
    this.mode = 'difficulty';
  }

  /** 今日のお題の画面を開く（ひがわり営業） */
  openDaily(difficulty: DifficultyId = this.settings.difficulty) {
    this.saveDifficulty(difficulty);
    const date = jstDate();
    this.daily = { date, conds: dailyConditions(date) };
    this.mode = 'daily';
    void this.loadBoard(date, difficulty);
  }

  async loadBoard(date: string, difficulty: DifficultyId) {
    const board = { key: `${date}:${difficulty}`, state: 'loading' as 'loading' | 'ready' | 'error', value: null as DailyBoard | null };
    this.board = board;
    try {
      const value = await this.ranking.top(date, difficulty, this.store.playerId());
      if (this.board !== board) return;
      board.value = value;
      board.state = 'ready';
    } catch {
      if (this.board === board) board.state = 'error';
    }
  }

  /** 仕込みから戻るときも、開いているお題の日付のまま順位を読み直す。 */
  returnToDaily() {
    this.mode = 'daily';
    if (this.daily) void this.loadBoard(this.daily.date, this.settings.difficulty);
  }

  openRankingName() {
    if (!this.result?.daily || this.nameEntry || this.submission.state === 'sending' || this.submission.state === 'sent') return;
    this.menu.reset();
    this.imeHintAt = -10;
    this.nameEntry = openRankingName({
      initialName: this.settings.rankingName,
      onClose: () => { this.nameEntry = null; this.menu.reset(); this.sc.canvas.focus(); },
      onSubmit: name => { void this.submitRanking(name); },
    });
  }

  async submitRanking(name: string) {
    const result = this.result;
    if (!result?.daily || this.submission.state === 'sending' || this.submission.state === 'sent') return;
    this.settings.rankingName = name;
    this.store.saveSettings(this.settings);
    this.submission = { state: 'sending', receipt: null, message: '' };
    try {
      const receipt = await this.ranking.submit({
        date: result.daily.date, difficulty: result.difficultyId, name, player: this.store.playerId(),
        score: result.score, served: result.served, maxCombo: result.maxCombo, angry: result.angry,
        accuracy: result.accuracy, kps: result.kps, conds: result.daily.conds.map(c => c.id),
      });
      if (this.result !== result || this.mode !== 'result') return;
      this.submission = { state: 'sent', receipt, message: '' };
      this.menu.reset();
    } catch (err) {
      if (this.result !== result || this.mode !== 'result') return;
      this.submission = { state: 'error', receipt: null, message: err instanceof Error ? err.message : '送信できませんでした' };
    }
  }

  /** 今日のお題のあと：仕込みの日は仕込みの画面へ、それ以外はすぐ開店 */
  afterDaily() {
    if (this.prepRules().prepBudget > 0) this.openPrep();
    else this.start();
  }

  /** 今のお題のルール（ひがわりでなければ通常） */
  prepRules(): DayRules {
    return this.daily ? rulesFor(this.daily.conds, this.settings.difficulty, this.daily.date) : NORMAL_RULES;
  }

  openPrep() {
    const key = `${this.daily?.date}:${this.settings.difficulty}`;
    if (!this.prep || this.prep.key !== key) this.prep = { key, alloc: defaultPrep(this.prepRules()), sel: 0, changed: null, changedAt: -10 };
    this.mode = 'prep';
  }

  /** 仕込みの残り（振り分けていない数） */
  prepLeft() {
    if (!this.prep) return 0;
    return this.prepRules().prepBudget - INGREDIENT_ORDER.reduce((a, id) => a + this.prep!.alloc[id], 0);
  }

  /** 仕込み：1つ増やす・減らす。できないときはミスの音 */
  prepAdd(id: IngredientId, d: number) {
    const p = this.prep;
    if (!p) return;
    p.sel = INGREDIENT_ORDER.indexOf(id);
    const n = p.alloc[id] + d;
    if (n < 0 || n > prepCap(this.prepRules()) || (d > 0 && this.prepLeft() <= 0)) {
      this.sound.miss();
      this.missFlash = 0.25;
      return;
    }
    p.alloc[id] = n;
    p.changed = id;
    p.changedAt = this.t;
    this.sound.key(1);
  }

  prepReset() {
    if (!this.prep) return;
    this.prep.alloc = defaultPrep(this.prepRules());
    this.prep.changed = null;
  }

  private saveDifficulty(difficulty: DifficultyId) {
    if (difficulty !== this.settings.difficulty) {
      this.settings.difficulty = difficulty;
      this.store.saveSettings(this.settings);
    }
  }

  /** Enter で選ばれる項目：難易度の画面では前回の難易度、営業の画面では前回の営業、それ以外は先頭 */
  enterItem(): MenuItem | undefined {
    const items = this.menuItems();
    if (this.mode === 'modeSelect') return items[this.settings.playMode === 'daily' ? 1 : 0];
    if (this.mode === 'difficulty') return items.find((it) => it.kana === difficultyOf(this.settings.difficulty).kana);
    if (this.mode === 'help') return items[items.length - 1];
    return items[0];
  }

  start(difficulty: DifficultyId = this.settings.difficulty) {
    this.nameEntry?.close();
    this.submission = { state: 'idle', receipt: null, message: '' };
    this.saveDifficulty(difficulty);
    // ひがわりは、お題の画面で見せた日付のお題で開店する（お客の来かたは毎回ちがう）
    if (this.settings.playMode !== 'daily') this.daily = null;
    else if (!this.daily) {
      const date = jstDate();
      this.daily = { date, conds: dailyConditions(date) };
    }
    const rules = this.daily ? rulesFor(this.daily.conds, difficulty, this.daily.date) : NORMAL_RULES;
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    this.shop = new Shop(new Rng(this.seed), difficultyOf(difficulty), rules);
    // 開店前の仕込みの日は、振り分けたとおりの在庫で開店する
    if (rules.prepBudget > 0) {
      if (!this.prep) this.prep = { key: `${this.daily?.date}:${difficulty}`, alloc: defaultPrep(rules), sel: 0, changed: null, changedAt: -10 };
      this.shop.applyPrep(this.prep.alloc);
    }
    this.view = new ShopView();
    this.view.art = this.art;
    this.trip = null;
    this.paused = false;
    this.mode = 'play';
    this.result = null;
    this.playElapsed = 0;
    // 開店まで3秒数える。その間は時間が進まず、打っても反応しない
    this.countdown = COUNTDOWN;
    this.goShown = 0;
    this.sound.stop();
    this.sound.count(3);
  }

  autoPause() {
    if (this.mode === 'play' && !this.paused) {
      this.paused = true;
      this.menu.reset();
    }
  }

  // ---------- 入力 ----------

  onKey(e: KeyboardEvent) {
    if (this.nameEntry) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    this.sound.unlock();
    this.lastInput = this.t;
    this.clickHintAt = -10;
    // 日本語入力がオンのまま打つと、文字が届かない。黙って無視せず、オフにするよう知らせる
    if (e.isComposing || e.key === 'Process' || (e.key.length === 1 && /[^ -]/.test(e.key))) {
      if (this.artState !== 'loading') this.imeHintAt = this.t;
      return;
    }
    if (this.artState === 'loading') return;
    const k = e.key;
    if (k === 'Escape' && this.mode === 'play') {
      e.preventDefault();
      if (this.paused) this.paused = false;
      else this.autoPause();
      return;
    }
    const inMenu = this.mode !== 'play' || this.paused;
    // 結果の演出中：打ち続けたまま来ても飛ばされないよう、最初の少しはキーを受け付けない。
    // そのあとはキーで演出を飛ばして最後の状態にする
    if (this.mode === 'result' && this.t - this.resultAt < RESULT_READY) {
      e.preventDefault();
      if (this.t - this.resultAt > RESULT_LOCK) this.resultAt = this.t - RESULT_READY;
      return;
    }
    if (k === 'Escape' && this.mode !== 'title') {
      e.preventDefault();
      this.sound.select();
      if (this.mode === 'result') this.toTitle();
      else if (this.mode === 'help' && this.helpPage !== 0) this.helpPage = 0;
      else if (this.mode === 'difficulty') this.mode = 'modeSelect';
      else if (this.mode === 'daily') this.mode = 'difficulty';
      else if (this.mode === 'prep') this.returnToDaily();
      else this.mode = 'title';
      this.menu.reset();
      return;
    }
    if (inMenu) {
      // 仕込み：↑↓でえらぶ、←→で増減、何も打っていないときの Backspace で−1
      if (this.mode === 'prep' && this.prep && (k.startsWith('Arrow') || (k === 'Backspace' && !this.menu.typed))) {
        e.preventDefault();
        const p = this.prep;
        const id = INGREDIENT_ORDER[p.sel];
        if (k === 'ArrowUp') { p.sel = (p.sel + INGREDIENT_ORDER.length - 1) % INGREDIENT_ORDER.length; this.sound.key(1); }
        else if (k === 'ArrowDown') { p.sel = (p.sel + 1) % INGREDIENT_ORDER.length; this.sound.key(1); }
        else if (k === 'ArrowRight') this.prepAdd(id, 1);
        else this.prepAdd(id, -1);
        return;
      }
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
    // カウントダウン中は打っても反応しない（Esc の一時停止だけは使える）
    if (this.countdown > 0) {
      if (k.length === 1 || k === 'Enter' || k === 'Backspace') e.preventDefault();
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

  frame(now: number) {
    const dt = Math.max(0, Math.min(0.05, (now - this.last) / 1000));
    this.last = now;
    this.step(dt);
    this.sc.now = this.t;
    this.draw();
    if (!this.readyMarked && this.artState === 'ready' && document.fonts.status === 'loaded') {
      this.readyMarked = true;
      performance.mark('game:ready');
    }
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
    if (this.overTavern) demoStep(this, dt);
    if (this.mode === 'result') resultStep(this);
    if (this.mode === 'play' && this.shop) this.view.guide = this.settings.guided ? null : guideFor(this, this.shop);
    if (this.mode !== 'play' || !this.shop || this.paused) return;
    if (this.countdown > 0) {
      const before = Math.ceil(this.countdown);
      this.countdown = Math.max(0, this.countdown - dt);
      const after = Math.ceil(this.countdown);
      if (after !== before) this.sound.count(after);
      if (this.countdown === 0) {
        this.goShown = 0.9;
        this.sound.play('morning');
      }
      this.view.update(dt);
      return;
    }
    this.goShown = Math.max(0, this.goShown - dt);
    // 背景の読み込み待ちで営業時間を消費しない。
    if (this.trip?.phase === 'intro' && this.trip.t <= 0 && this.tripView.art && !this.tripView.art.hasTrip(this.trip.game.kind)) return;
    const shop = this.shop;
    this.playElapsed += dt;
    const shopDt = this.trip?.phase === 'game' ? dt * MINIGAME_SECONDS / this.trip.game.duration : dt;
    shop.update(shopDt);
    this.view.update(dt, shop);
    this.tripView.update(dt);
    if (this.trip) this.stepTrip(dt);
    this.drainEvents();
  }

  endTrip(earlyReturn = false) {
    const trip = this.trip;
    if (!trip || trip.phase !== 'game') return;
    trip.earlyReturn = earlyReturn && !trip.game.finished;
    trip.phase = 'outro';
    trip.t = SHOP.tripIntro;
    this.sound.tripReturn();
  }

  stepTrip(dt: number) {
    const trip = this.trip!;
    trip.t -= dt;
    if (trip.phase === 'intro' && trip.t <= 0) {
      if (this.tripView.art && !this.tripView.art.hasTrip(trip.game.kind)) return;
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

  drainEvents() {
    const shop = this.shop;
    if (!shop) return;
    for (const ev of shop.drainEvents()) {
      this.view.handle(ev, shop);
      switch (ev.type) {
        case 'key': if (ev.ok) this.sound.key(ev.count); else this.sound.miss(); break;
        case 'serve': this.sound.serve(); if (ev.combo >= 1) this.sound.combo(ev.combo); break;
        case 'lack': this.sound.lack(); break;
        case 'angry': this.sound.angry(); break;
        case 'spill': this.sound.loss(); break;
        case 'spoil': this.sound.loss(); break;
        case 'decline': this.sound.select(); break;
        case 'hiden': this.sound.sparkle(); break;
        case 'delivery': this.sound.tripReturn(); break;
        case 'banquet': this.sound.bell(); break;
        case 'refill': this.sound.select(); break;
        case 'tripStart':
          this.trip = { game: createMinigame(ev.trip.id, new Rng(this.seed + shop.stats.trips * 7919), shop.difficulty), phase: 'intro', t: SHOP.tripIntro };
          this.tripView = new MinigameView();
          this.tripView.art = this.art;
          if (this.art) void this.art.ensureTrip(ev.trip.id).catch(() => { this.tripView.art = null; });
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
        const kind = this.trip.game.kind;
        if (ev.type === 'key') { if (ev.ok) this.sound.key(ev.count); else this.sound.miss(); }
        else if (ev.type === 'word' && kind === 'hunting') this.sound.shot();
        else if (ev.type === 'gain' && kind === 'hunting') this.sound.kill(!!ev.big);
        else if (ev.type === 'gain') {
          this.sound.gain(kind);
          // 釣りの大物は、きらめく音を重ねる
          if (kind === 'fishing' && (this.trip.game as unknown as { big: boolean }).big) this.sound.sparkle();
        }
        else if (ev.type === 'loss' && kind === 'gathering') this.sound.poison();
        else if (ev.type === 'loss' || ev.type === 'escape') this.sound.loss();
        else if (ev.type === 'bite') this.sound.bite();
      }
    }
  }

  finish() {
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
      kps: this.playElapsed > 0 ? s.correctKeys / this.playElapsed : 0, accuracy: total ? s.correctKeys / total : 1, finishedAt: new Date().toISOString(),
    };
    const diff = shop.difficulty;
    // ひがわりの記録は日付×難易度ごと。通常営業の自己ベストとは混ぜない
    const best = this.daily ? this.store.recordDaily(rec, this.daily.date, diff.id) : this.store.record(rec, diff.id);
    const rank = rankFor(rec.score, diff);
    this.result = { ...rec, best, rank: rank.name, title: rank.title, trips: s.trips, difficulty: diff.name, difficultyId: diff.id, daily: this.daily };
    this.submission = { state: 'idle', receipt: null, message: '' };
    this.mode = 'result';
    this.menu.reset();
    this.resultAt = this.t;
    this.resultFx = { tick: 0, stamped: false, sparkled: false };
    this.sound.play('result');
  }

  /** タイトルと同じ、にぎわう店を背景に使う画面 */
  get overTavern() {
    return this.mode === 'title' || this.mode === 'modeSelect' || this.mode === 'difficulty' || this.mode === 'daily' || this.mode === 'prep';
  }

  // ---------- 描画 ----------

  draw() {
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
        if (this.trip.phase === 'outro') drawTripOutro(this);
      } else {
        this.view.draw(sc, this.shop, this.t, false);
        if (this.trip?.phase === 'intro') drawTripIntro(this);
        drawCountdown(this);
      }
      if (this.paused) drawMenuScreen(this, '一時停止中', '');
      if (this.paused) drawClickHint(this);
      drawImeHint(this);
      drawVolume(this);
      return;
    }
    // タイトル・遊び方・結果：店内を背景に
    const g = sc.g;
    const ph = this.mode === 'result' ? 2 : 1;
    if (this.overTavern && this.art && this.demo) {
      sc.clearScreen();
      this.demo.view.drawTavern(sc, this.demo.shop);
      drawCheers(this);
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
    } else if (this.overTavern && this.demo) {
      // タイトルと同じ店を背景に、少し暗くして札を引き立てる
      sc.cover(C.bg, 0.4);
    } else sc.cover(C.bg, 0.7);
    if (this.mode === 'title') drawTitle(this);
    else if (this.mode === 'help') { if (this.helpPage === 1) drawTripHelp(this); else if (this.helpPage === 2) drawModeHelp(this); else drawHelp(this); }
    else if (this.mode === 'modeSelect') drawModeSelect(this);
    else if (this.mode === 'difficulty') drawDifficulty(this);
    else if (this.mode === 'daily') drawDaily(this);
    else if (this.mode === 'prep') drawPrep(this);
    else drawResult(this);
    if (this.mode !== 'result' || this.t - this.resultAt > RESULT_READY - 0.3) drawMenu(this, this.mode === 'help' ? 210 : this.mode === 'result' ? 200 : this.mode === 'difficulty' ? 170 : 172);
    if (this.missFlash > 0) sc.PR(sc.ext.x0, sc.ext.y1 - 3, sc.ext.w, 3, C.red, this.missFlash * 3);
    drawClickHint(this);
    drawImeHint(this);
    drawVolume(this);
  }

}
