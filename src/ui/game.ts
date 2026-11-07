import { ITEMS, LINKS, SERIES, PULL_PRICE, canPull, exchange, itemById, owns, pull, setEquip, type CollectionState, type Equip, type Kind, type PullResult } from '../core/collection';
import { StickerArt, sheetUrl, stickerUrl } from './stickerArt';
import { drawFukubiki, FUKUBIKI_ANIM } from './screens/fukubiki';
import { readDecoration, type Decoration } from '../core/ranking';
import { C } from './palette';
import { Screen, LW } from './screen';
import { Sound, VOLUME_NAMES } from './audio';
import { FINAL_SECONDS, ShopView } from './shopView';
import { MinigameView } from './minigameView';
import { drawLights, drawRoomLive, roomLayer } from './room';
import { Art } from './amber/art';
import { CandidateInput } from '../core/candidates';
import { PlaySession, TICK, type SessionTrip } from '../core/session';
import { Shop } from '../core/shop';
import { Rng, randomSeed } from '../core/rng';
import { RomajiMatcher } from '../core/romaji';
import { SaveStore, type DayRecord } from '../core/save';
import type { DailyBoard, RankReceipt } from '../core/ranking';
import { RankingClient } from './rankingClient';
import { openRankingName } from './rankingName';
import { shareUrl } from './share';
import { dailyConditions, defaultPrep, jstDate, prepCap, rulesFor, NORMAL_RULES, type Condition, type DayRules } from '../core/daily';
import { DIFFICULTIES, GAME_TITLE, INGREDIENT_ORDER, difficultyOf, rankFor, type DifficultyId, type IngredientId } from '../core/shopConfig';
import { drawVolume, drawMenu, drawMenuScreen, drawImeHint, drawClickHint } from './screens/common';
import { demoStep, drawCheers, drawTitle } from './screens/title';
import { drawDifficulty } from './screens/difficulty';
import { drawModeSelect } from './screens/modeSelect';
import { drawDaily } from './screens/daily';
import { drawRanking } from './screens/ranking';
import { drawRecords, dialogueRows, READER_ROWS } from './screens/records';
import { ACHIEVEMENTS, type PlayFacts, type Records } from '../core/achievements';
import { drawTutorial } from './screens/tutorial';
import { setupTutorial, tutorialEvent, tutorialStep, type TutorialState } from './tutorial';
import { drawPrep, PREP_WORDS } from './screens/prep';
import { helpPlay, drawHelp, openTripHelp, drawTripHelp, drawModeHelp } from './screens/help';
import { resultStep, drawResult, drawResultMenu } from './screens/result';
import { guideFor, drawCountdown, drawTripIntro, drawTripOutro } from './screens/play';
import { PHASE_TRACK, RESULT_READY, COUNTDOWN, RESULT_LOCK, MenuItem } from './screens/shared';

export type RecordsTab = 'achievements' | 'stickers' | 'decor';
/** 飾りの欄：前の言葉・つなぎ・後ろの言葉・プレート・打鍵音 */
export const DECOR_KEYS = ['front', 'link', 'back', 'plate', 'sound'] as const;
const DECOR_ROWS: (Kind | 'link')[] = ['front', 'link', 'back', 'plate', 'sound'];
export type Mode = 'title' | 'help' | 'modeSelect' | 'difficulty' | 'daily' | 'prep' | 'play' | 'result' | 'ranking' | 'records' | 'fukubiki';
export type PlayMode = 'normal' | 'daily';

const TYPABLE = /^[a-z\-]$/;

function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

/** 営業をやり直すのに要るもの：乱数の種・入力の記録・仕込みの振り分け */
export interface PlayRecord {
  seed: number;
  record: string;
  prep: Record<IngredientId, number> | null;
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
  /** 営業中の1回分（1/60秒刻みで進み、入力を記録する）。営業していないときは null */
  session: PlaySession | null = null;
  get shop(): Shop | null { return this.session?.shop ?? null; }
  get trip(): SessionTrip | null { return this.session?.trip ?? null; }
  /** 画面の時計の端数（1/60秒に満たない分を次のコマへ持ち越す） */
  private acc = 0;
  view = new ShopView();
  tripView = new MinigameView();
  paused = false;
  result: (DayRecord & { best: boolean; rank: string; title: string; trips: number; difficulty: string; difficultyId: DifficultyId; daily: DailyPlay | null; play: PlayRecord; unlocked: string[]; credited?: number; coins?: number }) | null = null;
  /** 記録・実績の画面で見ている記録と、選んでいる実績・読んでいる会話 */
  records: Records | null = null;
  recordsView: { tab: RecordsTab; sel: number; reading: number | null; scroll: number; series: number; decorRow: number } | null = null;
  /** 段階6：コレクション（画面を開いたときと変えたときに読み直す） */
  collection: CollectionState | null = null;
  readonly stickerArt = new StickerArt();
  /** ふくびきの画面：演出の経過秒・最後の結果・案内・交換の一覧 */
  fukubiki: { anim: number; last: PullResult | null; message: string; exchange: { sel: number } | null } | null = null;
  /** この営業の一意なIDと、開店時に確定した JST の日付（記録・実績に使う） */
  playId = '';
  openDate = '';
  readonly ranking = new RankingClient();
  board: { key: string; state: 'loading' | 'ready' | 'error'; value: DailyBoard | null } | null = null;
  submission: { state: 'idle' | 'sending' | 'sent' | 'error'; receipt: RankReceipt | null; message: string } = { state: 'idle', receipt: null, message: '' };
  nameEntry: ReturnType<typeof openRankingName> | null = null;
  /** 今日の3つの難易度の順位表（タイトル画面とランキングの画面で使う） */
  boards: { date: string; state: 'loading' | 'ready' | 'error'; value: Record<DifficultyId, DailyBoard> | null; at: number } | null = null;
  /** れんしゅう中の手順（れんしゅうでないときは null） */
  tutorial: TutorialState | null = null;
  /** ランキングの画面を閉じたときに戻る画面 */
  rankingFrom: Mode = 'title';
  /** ひがわり営業で遊んでいるときの、日付とお題（通常営業では null） */
  daily: DailyPlay | null = null;
  /** 開店前の仕込み：振り分け（同じ日・同じ難易度なら、もういちどのときも前の振り分けから） */
  prep: { key: string; alloc: Record<IngredientId, number>; sel: number; changed: IngredientId | null; changedAt: number } | null = null;
  readonly menu: CandidateInput<MenuItem>;
  t = 0;
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
  resultFx = { tick: 0, stamped: false, sparkled: false, unlocked: false };
  /** 開店までの残り秒数（0 なら営業中） */
  countdown = 0;
  /** 「開店！」を見せている残り時間 */
  goShown = 0;
  /** 音量を変えたときの表示の残り時間 */
  volumeShown = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.applyKeyVoice();
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
    if (this.mode === 'play' && this.tutorial?.step === 'done') {
      return [
        { text: 'はじめる', kana: 'はじめる', act: () => { this.leavePlay(); this.mode = 'modeSelect'; } },
        { text: 'もういちど', kana: 'もういちど', act: () => this.startTutorial() },
        { text: 'たいとる', kana: 'たいとる', act: () => this.toTitle() },
      ];
    }
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
          { text: 'らんきんぐ', kana: 'らんきんぐ', act: () => this.openRanking() },
          { text: 'きろく', kana: 'きろく', act: () => this.openRecords() },
          { text: 'ふくびき', kana: 'ふくびき', act: () => this.openFukubiki() },
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
          { text: 'れんしゅう', kana: 'れんしゅう', act: () => this.startTutorial() },
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
      case 'records':
        return [
          { text: 'もどる', kana: 'もどる', act: () => { this.mode = 'title'; } },
          { text: 'じっせき', kana: 'じっせき', act: () => this.setRecordsTab('achievements') },
          { text: 'シール', kana: 'しーる', act: () => this.setRecordsTab('stickers') },
          { text: 'かざり', kana: 'かざり', act: () => this.setRecordsTab('decor') },
        ];
      case 'fukubiki':
        if (this.fukubiki?.exchange) return [{ text: 'もどる', kana: 'もどる', act: () => { this.fukubiki!.exchange = null; } }];
        return [
          { text: 'ひく', kana: 'ひく', act: () => this.pullOnce() },
          { text: 'こうかん', kana: 'こうかん', act: () => { this.fukubiki!.exchange = { sel: 0 }; this.fukubiki!.message = ''; } },
          { text: 'もどる', kana: 'もどる', act: () => { this.mode = 'title'; } },
        ];
      case 'ranking':
        return [{ text: 'もどる', kana: 'もどる', act: () => this.closeRanking() }];
      case 'result':
        return [
          ...(this.result?.daily && this.submission.state !== 'sent' ? [{
            text: this.submission.state === 'sending' ? '送信中…' : this.submission.state === 'error' ? 'もういちど送る' : 'なまえをいれる',
            kana: 'なまえ', act: () => this.openRankingName(),
          }] : []),
          // ひがわりは同じお題でもう一度。日付が変わっていたら、新しいお題を見せてから
          { text: 'もういちど', kana: 'もういちど', act: () => (this.daily && this.daily.date !== jstDate() ? this.openDaily() : this.daily ? this.afterDaily() : this.start()) },
          { text: 'Xにポスト', kana: 'ぽすと', act: () => this.shareToX() },
          // 送ったあとは、今日のランキングをすぐ見られるように
          ...(this.result?.daily && this.submission.state === 'sent' ? [{ text: 'らんきんぐ', kana: 'らんきんぐ', act: () => this.openRanking() }] : []),
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
    this.leavePlay();
    this.mode = 'title';
  }

  /** 営業・れんしゅうを片付けて、メニューの画面へ戻る準備をする */
  leavePlay() {
    this.nameEntry?.close();
    this.session = null;
    this.tutorial = null;
    this.paused = false;
    this.sound.play('title');
  }

  /** れんしゅう：時計を止めた店で、料理を出す・調達に出る・戻るを一度ずつ */
  startTutorial() {
    this.nameEntry?.close();
    this.daily = null;
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    this.session = new PlaySession(this.seed, difficultyOf('easy'), NORMAL_RULES);
    this.tutorial = setupTutorial(this.session);
    this.view = new ShopView();
    this.view.art = this.art;
    this.paused = false;
    this.mode = 'play';
    this.result = null;
    this.countdown = 0;
    this.goShown = 0;
    this.menu.reset();
    this.sound.play('morning');
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

  /** れんしゅうを終えた：覚えておき、終わりのメニューを出す */
  private finishTutorial() {
    if (!this.settings.tutorialDone) {
      this.settings.tutorialDone = true;
      this.store.saveSettings(this.settings);
    }
    this.menu.reset();
    this.sound.sparkle();
  }

  /** 閉店前の秒読みで最後に鳴らした秒（同じ秒で二度鳴らさない） */
  private lastCall = 0;

  /** 閉店まで10秒：1秒ごとに秒読みの音、BGM を速め、知らせを出す */
  private finalCall(left: number) {
    if (left > FINAL_SECONDS || left <= 0) { this.lastCall = 0; return; }
    this.sound.setRate(1.25);
    const sec = Math.ceil(left);
    if (sec === this.lastCall) return;
    this.lastCall = sec;
    this.sound.final(sec);
    if (sec === FINAL_SECONDS) this.view.banner = { text: 'ラストスパート！ 閉店まで10秒', t: 1.8, col: C.gold3 };
  }

  /** 段階6：付けている打鍵音を音に伝える（持っていない・一覧にないものは元の音） */
  applyKeyVoice() {
    try {
      const c = this.store.loadCollection();
      const id = c.equip.sound;
      const item = id && owns(c, this.store.loadRecords().unlocked, id) ? itemById(id) : undefined;
      this.sound.setKeyVoice(item?.sound ?? null);
    } catch { this.sound.setKeyVoice(null); }
  }

  /** 段階6：いま付けている二つ名とプレート（持っていないものは外す） */
  currentDecoration(): Decoration {
    try {
      const c = this.store.loadCollection();
      const u = this.store.loadRecords().unlocked;
      const has = (id: string | null) => !!id && owns(c, u, id);
      const title = has(c.equip.front) && has(c.equip.back);
      return readDecoration({
        titleFront: title ? c.equip.front : null, titleLink: title ? c.equip.link : null, titleBack: title ? c.equip.back : null,
        plate: has(c.equip.plate) ? c.equip.plate : null,
      });
    } catch { return readDecoration(null); }
  }

  /** この営業で確定した事実（記録・実績用） */
  playFacts(session: PlaySession): PlayFacts {
    const s = session.shop.stats;
    return {
      id: this.playId || crypto.randomUUID(),
      mode: this.daily ? 'daily' : 'normal',
      difficulty: session.shop.difficulty.id,
      date: this.openDate || this.daily?.date || jstDate(),
      score: session.shop.score, served: s.served, maxCombo: s.maxCombo, angry: s.angry, tripsStarted: s.trips,
      conds: this.daily ? this.daily.conds.map((c) => c.id) : [],
      bigFish: session.feats.bigFish, deer: session.feats.deer, streak: session.feats.streak,
      late: s.lateServes, banquet: s.banquetServed, returns: session.returns.map((t) => ({ ...t })),
    };
  }

  /** まだ読んでいない会話があるか（タイトルの「きろく」に印を付ける）。毎コマ保存を読まないよう、少し間を置いて確かめる */
  private unreadAt = -10;
  private unreadCache = false;
  unreadRecords() {
    if (this.t - this.unreadAt > 2) {
      this.unreadAt = this.t;
      try {
        const r = this.store.loadRecords();
        this.unreadCache = ACHIEVEMENTS.some((a) => r.unlocked[a.id] && !r.read.includes(a.id));
      } catch { this.unreadCache = false; }
    }
    return this.unreadCache;
  }

  /** 段階6：ふくびきが引けるか（タイトルの印。毎コマ保存を読まないよう、少し間を置いて確かめる） */
  private pullAt = -10;
  private pullCache = false;
  canPullNow() {
    if (this.t - this.pullAt > 2) {
      this.pullAt = this.t;
      try { this.pullCache = canPull(this.store.loadCollection()); } catch { this.pullCache = false; }
    }
    return this.pullCache;
  }

  /** 記録・実績の画面を開く（まだ読んでいない会話があれば、そこを選んでおく） */
  openRecords() {
    this.records = this.store.loadRecords();
    const r = this.records;
    const unread = ACHIEVEMENTS.findIndex((a) => r.unlocked[a.id] && !r.read.includes(a.id));
    this.recordsView = { tab: 'achievements', sel: Math.max(0, unread), reading: null, scroll: 0, series: 0, decorRow: 0 };
    this.refreshCollection();
    this.mode = 'records';
    this.menu.reset();
  }

  /** 段階6：コレクションを読み直す */
  refreshCollection() {
    try { this.collection = this.store.loadCollection(); } catch { this.collection = null; }
    try { this.records = this.store.loadRecords(); } catch { /* 前の値のまま */ }
  }

  setRecordsTab(tab: RecordsTab) {
    const v = this.recordsView;
    if (!v) return;
    v.tab = tab;
    v.reading = null;
    if (tab === 'stickers') this.loadStickerArt();
    this.sound.select();
  }

  /** シールと台紙の絵を読む（開いたときだけ。読めなければ仮の描き方） */
  loadStickerArt() {
    this.stickerArt.load([
      ...ITEMS.filter((i) => i.kind === 'sticker').map((i) => stickerUrl(i.id)),
      ...SERIES.flatMap((x) => [sheetUrl(x.id, false), sheetUrl(x.id, true)]),
    ]);
  }

  /** 飾りの欄ごとの選べるもの（null は「なし」） */
  decorOptions(row: number): (string | null)[] {
    if (row === 1) return LINKS.map((l) => l.id);
    const kind = DECOR_ROWS[row];
    const c = this.collection ?? this.store.loadCollection();
    const u = this.records?.unlocked ?? {};
    return [null, ...ITEMS.filter((i) => i.kind === kind && owns(c, u, i.id)).map((i) => i.id)];
  }

  /** 飾りを付け替えて保存する（持っていないものは付かない） */
  setDecor(patch: Partial<Equip>) {
    const u = this.records?.unlocked ?? this.store.loadRecords().unlocked;
    this.collection = this.store.updateCollection((c) => setEquip(c, u, patch));
    if ('sound' in patch) {
      this.applyKeyVoice();
      this.sound.key(1);
    }
  }

  // ---------- ふくびき ----------

  openFukubiki() {
    this.fukubiki = { anim: FUKUBIKI_ANIM, last: null, message: '', exchange: null };
    this.refreshCollection();
    this.loadStickerArt();
    this.mode = 'fukubiki';
    this.menu.reset();
  }

  /** 1回引く。演出中や貯金箱が足りないときは引かない */
  pullOnce() {
    const f = this.fukubiki;
    if (!f || f.anim < FUKUBIKI_ANIM) return;
    let result: PullResult | null = null;
    const c = this.store.updateCollection((s) => {
      result = pull(s, new Rng(randomSeed() ^ (Date.now() & 0xffffff)));
      return result ? result.state : s;
    });
    this.collection = c;
    if (!result) {
      f.message = `貯金箱のお金が足りません（あと${(PULL_PRICE - c.coins).toLocaleString()}円）`;
      this.sound.miss();
      this.missFlash = 0.25;
      return;
    }
    f.last = result;
    f.anim = 0;
    f.message = '';
    this.sound.select();
  }

  /** ふくびき画面のキー：演出中は飛ばすだけ、交換の一覧では↑↓・Enter・Esc */
  fukubikiKey(k: string) {
    const f = this.fukubiki;
    if (!f) return;
    if (f.anim < FUKUBIKI_ANIM) { f.anim = FUKUBIKI_ANIM; return; }
    const ex = f.exchange;
    if (!ex) return;
    const list = this.exchangeList();
    const n = Math.max(1, list.length);
    if (k === 'Escape') { f.exchange = null; this.sound.select(); return; }
    if (k === 'ArrowUp') ex.sel = (ex.sel + n - 1) % n;
    else if (k === 'ArrowDown') ex.sel = (ex.sel + 1) % n;
    else if (k === 'ArrowLeft') ex.sel = Math.max(0, ex.sel - 8);
    else if (k === 'ArrowRight') ex.sel = Math.min(n - 1, ex.sel + 8);
    else if (k === 'Enter') { if (list[ex.sel]) this.exchangeItem(list[ex.sel].id); return; }
    this.sound.key(1);
  }

  /** 交換できる飾り（まだ持っていないふくびきの飾り）。☆の高い順 */
  exchangeList() {
    const c = this.collection ?? this.store.loadCollection();
    return ITEMS.filter((i) => i.source === 'gacha' && !c.owned[i.id]).sort((a, b) => b.star - a.star);
  }

  exchangeItem(id: string) {
    const f = this.fukubiki;
    if (!f) return;
    let error = '';
    this.collection = this.store.updateCollection((s) => {
      const r = exchange(s, id);
      if ('error' in r) { error = r.error; return s; }
      return r.state;
    });
    if (error) { f.message = error; this.sound.miss(); this.missFlash = 0.25; return; }
    f.message = `「${itemById(id)?.name}」と交換しました`;
    if (f.exchange) f.exchange.sel = Math.min(f.exchange.sel, Math.max(0, this.exchangeList().length - 1));
    this.sound.select();
  }

  /** 記録・実績の画面のキー操作 */
  recordsKey(k: string) {
    const v = this.recordsView!;
    if (k === 'Tab' && v.reading === null) {
      const order: RecordsTab[] = ['achievements', 'stickers', 'decor'];
      this.setRecordsTab(order[(order.indexOf(v.tab) + 1) % order.length]);
      return;
    }
    if (v.tab === 'stickers') {
      if (k === 'ArrowLeft' || k === 'ArrowRight') { v.series = (v.series + (k === 'ArrowRight' ? 1 : SERIES.length - 1)) % SERIES.length; this.sound.key(1); }
      return;
    }
    if (v.tab === 'decor') {
      if (k === 'ArrowUp' || k === 'ArrowDown') { v.decorRow = (v.decorRow + (k === 'ArrowDown' ? 1 : DECOR_ROWS.length - 1)) % DECOR_ROWS.length; this.sound.key(1); return; }
      if (k === 'ArrowLeft' || k === 'ArrowRight') {
        const opts = this.decorOptions(v.decorRow);
        const key = DECOR_KEYS[v.decorRow];
        const cur = (this.collection ?? this.store.loadCollection()).equip[key];
        const i = opts.indexOf(cur);
        const next = opts[(Math.max(0, i) + (k === 'ArrowRight' ? 1 : opts.length - 1)) % opts.length];
        this.setDecor({ [key]: next } as Partial<Equip>);
        if (key !== 'sound') this.sound.key(1);
      }
      return;
    }
    const r = this.records!;
    const opened = (i: number) => !!r.unlocked[ACHIEVEMENTS[i].id];
    if (v.reading === null) {
      if (k === 'ArrowUp') v.sel = (v.sel + ACHIEVEMENTS.length - 1) % ACHIEVEMENTS.length;
      else if (k === 'ArrowDown') v.sel = (v.sel + 1) % ACHIEVEMENTS.length;
      else if (k === 'ArrowLeft') v.sel = Math.max(0, v.sel - 8);
      else if (k === 'ArrowRight') v.sel = Math.min(ACHIEVEMENTS.length - 1, v.sel + 8);
      else if (k === 'Enter') {
        if (!opened(v.sel)) { this.sound.miss(); this.missFlash = 0.25; return; }
        this.openDialogue(v.sel);
        return;
      }
      this.sound.key(1);
      return;
    }
    if (k === 'Enter' || k === 'Escape') { v.reading = null; this.sound.select(); return; }
    if (k === 'ArrowUp' || k === 'ArrowDown') {
      const rows = dialogueRows(this.sc, v.reading, 388).length;
      v.scroll = Math.max(0, Math.min(Math.max(0, rows - READER_ROWS), v.scroll + (k === 'ArrowDown' ? 1 : -1)));
      this.sound.key(1);
      return;
    }
    // ←→：解放済みのほかの会話へ
    const dir = k === 'ArrowRight' ? 1 : -1;
    for (let i = v.reading + dir; i >= 0 && i < ACHIEVEMENTS.length; i += dir) {
      if (opened(i)) { v.sel = i; this.openDialogue(i); return; }
    }
    this.sound.miss();
  }

  private openDialogue(i: number) {
    const v = this.recordsView!;
    v.reading = i;
    v.scroll = 0;
    try { this.records = this.store.markRecordRead(ACHIEVEMENTS[i].id); } catch { /* 保存できなくても読める */ }
    this.sound.select();
  }

  /** ランキングの画面を開く（開くたびに読み直す） */
  openRanking() {
    if (this.mode !== 'ranking') this.rankingFrom = this.mode;
    this.mode = 'ranking';
    this.menu.reset();
    void this.loadBoards(jstDate(), true);
  }

  closeRanking() {
    this.mode = this.rankingFrom;
    this.menu.reset();
  }

  /** 今日の順位表を読む。1分以内に読んだものは使い回す（force のときは読み直す） */
  async loadBoards(date: string, force = false) {
    const cur = this.boards;
    if (cur && cur.date === date && (cur.state === 'loading' || (!force && this.t - cur.at < 60))) return;
    const next = { date, state: 'loading' as 'loading' | 'ready' | 'error', value: cur?.date === date ? cur.value : null, at: this.t };
    this.boards = next;
    try {
      next.value = await this.ranking.boards(date, this.store.playerId());
      next.state = 'ready';
    } catch {
      next.state = next.value ? 'ready' : 'error';
    }
    next.at = this.t;
  }

  /** 結果を X にポストする画面を、新しいタブで開く（投稿するかは遊ぶ人が決める） */
  shareToX() {
    if (!this.result) return;
    const receipt = this.submission.state === 'sent' ? this.submission.receipt : null;
    window.open(shareUrl(this.result, receipt, `${location.origin}/`), '_blank', 'noopener,noreferrer');
  }

  /** ランキングの設定（Turnstile の公開キー）。一度だけ読み、以後は使い回す */
  private rankingConfig: Promise<{ turnstile: string | null }> | null = null;

  openRankingName() {
    if (!this.result?.daily || this.nameEntry || this.submission.state === 'sending' || this.submission.state === 'sent') return;
    this.menu.reset();
    this.imeHintAt = -10;
    // 設定を読み終わるまでの間に二重に開かないよう、先に印を付ける
    const pending = { close: () => {} };
    this.nameEntry = pending;
    this.rankingConfig ??= this.ranking.config();
    void this.rankingConfig.then((config) => {
      if (this.nameEntry !== pending || this.mode !== 'result') return;
      this.nameEntry = openRankingName({
        initialName: this.settings.rankingName,
        turnstile: config.turnstile,
        onClose: () => { this.nameEntry = null; this.menu.reset(); this.sc.canvas.focus(); },
        onSubmit: (name, token) => { void this.submitRanking(name, token); },
      });
    });
  }

  async submitRanking(name: string, token: string | null = null) {
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
        // サーバーがこの記録どおりに営業をやり直して、成績を確かめる
        seed: result.play.seed, record: result.play.record, prep: result.play.prep,
        decoration: this.currentDecoration(),
      }, token);
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
    this.tutorial = null;
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
    // 開店前の仕込みの日は、振り分けたとおりの在庫で開店する
    if (rules.prepBudget > 0 && !this.prep) this.prep = { key: `${this.daily?.date}:${difficulty}`, alloc: defaultPrep(rules), sel: 0, changed: null, changedAt: -10 };
    this.session = new PlaySession(this.seed, difficultyOf(difficulty), rules, rules.prepBudget > 0 ? { ...this.prep!.alloc } : null);
    // 記録・実績：この営業のIDと営業日（0時を越えて閉店しても、開店した日で数える）
    this.playId = crypto.randomUUID();
    this.openDate = this.daily?.date ?? jstDate();
    this.view = new ShopView();
    this.view.art = this.art;
    this.paused = false;
    this.mode = 'play';
    this.result = null;
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
      if (this.tutorial?.step === 'done') { this.sound.select(); this.toTitle(); return; }
      if (this.paused) this.paused = false;
      else this.autoPause();
      return;
    }
    const inMenu = this.mode !== 'play' || this.paused || this.tutorial?.step === 'done';
    // 結果の演出中：打ち続けたまま来ても飛ばされないよう、最初の少しはキーを受け付けない。
    // そのあとはキーで演出を飛ばして最後の状態にする
    if (this.mode === 'result' && this.t - this.resultAt < RESULT_READY) {
      e.preventDefault();
      if (this.t - this.resultAt > RESULT_LOCK) this.resultAt = this.t - RESULT_READY;
      return;
    }
    // 記録・実績：↑↓でえらぶ、Enter で会話を開く／閉じる、会話の中は↑↓で送り、←→でほかの会話へ
    // ふくびき：演出中はキーで飛ばす。交換の一覧は↑↓・Enter・Esc
    if (this.mode === 'fukubiki' && this.fukubiki && (this.fukubiki.anim < FUKUBIKI_ANIM || (this.fukubiki.exchange && (k.startsWith('Arrow') || k === 'Enter' || k === 'Escape')))) {
      e.preventDefault();
      this.fukubikiKey(k);
      return;
    }
    if (this.mode === 'records' && this.recordsView && (k.startsWith('Arrow') || k === 'Enter' || k === 'Tab' || (k === 'Escape' && this.recordsView.reading !== null))) {
      e.preventDefault();
      this.recordsKey(k);
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
      else if (this.mode === 'ranking') this.closeRanking();
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
      if (!e.repeat) this.session?.input('Enter');
      this.drainEvents();
      return;
    }
    // 営業中・調達中：打ったキーは「何刻み目に押したか」と一緒に記録される
    if (!this.session) return;
    if (k === 'Backspace' || k === ' ') { e.preventDefault(); this.session.input(k); return; }
    if (k.length === 1 && TYPABLE.test(k.toLowerCase())) {
      e.preventDefault();
      this.session.input(k.toLowerCase());
      this.drainEvents();
    }
  }

  // ---------- 進行 ----------

  frame(now: number) {
    const dt = Math.max(0, Math.min(0.1, (now - this.last) / 1000));
    this.last = now;
    // 画面の更新の間隔にかかわらず、1/60秒ずつ進める（遅い端末では1コマで何刻みか進める）
    this.acc += dt;
    for (let n = 0; this.acc >= TICK && n < 6; n++) {
      this.acc -= TICK;
      this.step(TICK);
    }
    if (this.acc > TICK) this.acc = 0;
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
    if (this.fukubiki && this.fukubiki.anim < 10) this.fukubiki.anim += dt;
    this.t += dt;
    this.missFlash = Math.max(0, this.missFlash - dt);
    this.volumeShown = Math.max(0, this.volumeShown - dt);
    if (this.overTavern) demoStep(this, dt);
    // タイトル画面では、今日のランキングの1位を見せるために順位表を読んでおく
    if (this.mode === 'title' && this.artState !== 'loading') void this.loadBoards(jstDate());
    if (this.mode === 'result') resultStep(this);
    if (this.mode === 'play' && this.shop) this.view.guide = this.settings.guided || this.tutorial ? null : guideFor(this, this.shop);
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
    // 背景の読み込み待ちで営業時間を消費しない（刻みも数えないので、記録の再現には影響しない）
    const session = this.session!;
    if (session.introDone && this.tripView.art && !this.tripView.art.hasTrip(session.trip!.game.kind)) return;
    session.tick();
    this.finalCall(session.shop.timeLeft);
    if (this.tutorial) tutorialStep(this.tutorial, session, dt);
    this.view.update(dt, session.shop);
    this.tripView.update(dt);
    this.drainEvents();
  }



  drainEvents() {
    const session = this.session;
    if (!session) return;
    const shop = session.shop;
    for (const item of session.drain()) {
      if (this.tutorial) {
        const before = this.tutorial.step;
        tutorialEvent(this.tutorial, session, item);
        if (before !== 'done' && this.tutorial.step === 'done') this.finishTutorial();
      }
      if (item.src === 'session') {
        if (item.type === 'tripGame' && session.trip) this.sound.play(session.trip.game.kind);
        else if (item.type === 'tripReturn') this.sound.tripReturn();
        else if (item.type === 'tripBack') this.sound.play(PHASE_TRACK[shop.phaseIndex]);
        continue;
      }
      if (item.src === 'trip') {
        const trip = session.trip;
        if (!trip) continue;
        const ev = item.ev;
        this.tripView.handle(ev, trip.game);
        const kind = trip.game.kind;
        if (ev.type === 'key') { if (ev.ok) this.sound.key(ev.count); else this.sound.miss(); }
        else if (ev.type === 'word' && kind === 'hunting') this.sound.shot();
        else if (ev.type === 'gain' && kind === 'hunting') this.sound.kill(!!ev.big);
        else if (ev.type === 'gain') {
          this.sound.gain(kind);
          // 釣りの大物は、きらめく音を重ねる
          if (kind === 'fishing' && (trip.game as unknown as { big: boolean }).big) this.sound.sparkle();
        }
        else if (ev.type === 'loss' && kind === 'gathering') this.sound.poison();
        else if (ev.type === 'loss' || ev.type === 'escape') this.sound.loss();
        else if (ev.type === 'bite') this.sound.bite();
        continue;
      }
      const ev = item.ev;
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
          this.tripView = new MinigameView();
          this.tripView.art = this.art;
          if (this.art) void this.art.ensureTrip(ev.trip.id).catch(() => { this.tripView.art = null; });
          this.sound.tripStart();
          // 最初の調達に出たら、はじめての人向けの案内は終わり
          if (!this.settings.guided) { this.settings.guided = true; this.store.saveSettings(this.settings); }
          break;
        case 'phase': this.sound.bell(); if (!session.trip) this.sound.play(PHASE_TRACK[ev.index]); break;
        case 'end': this.finish(); break;
        default: break;
      }
    }
  }

  finish() {
    const session = this.session!;
    const shop = session.shop;
    const sum = session.summary();
    const rec: DayRecord = {
      score: sum.score, served: sum.served, maxCombo: sum.maxCombo, angry: sum.angry,
      kps: sum.kps, accuracy: sum.accuracy, finishedAt: new Date().toISOString(),
    };
    const diff = shop.difficulty;
    // ひがわりの記録は日付×難易度ごと。通常営業の自己ベストとは混ぜない
    const best = this.daily ? this.store.recordDaily(rec, this.daily.date, diff.id) : this.store.record(rec, diff.id);
    const rank = rankFor(rec.score, diff);
    // ランキングでは、サーバーがこの記録どおりに営業をやり直して成績を確かめる
    const play = { seed: session.seed, record: session.record, prep: session.rules.prepBudget > 0 && this.prep ? { ...this.prep.alloc } : null };
    // 記録・実績：閉店結果が確定したこのときに、1営業分を一度だけ反映する（同じ営業IDは二度数えない）
    let unlocked: string[] = [];
    let credited = 0;
    let coins = 0;
    try { ({ unlocked, credited, coins } = this.store.recordPlay(this.playFacts(session))); } catch { unlocked = []; }
    this.result = { ...rec, best, rank: rank.name, title: rank.title, trips: sum.trips, difficulty: diff.name, difficultyId: diff.id, daily: this.daily, play, unlocked, credited, coins };
    this.submission = { state: 'idle', receipt: null, message: '' };
    this.mode = 'result';
    this.menu.reset();
    this.resultAt = this.t;
    this.resultFx = { tick: 0, stamped: false, sparkled: false, unlocked: false };
    this.sound.play('result');
  }

  /** タイトルと同じ、にぎわう店を背景に使う画面 */
  get overTavern() {
    return this.mode === 'title' || this.mode === 'modeSelect' || this.mode === 'difficulty' || this.mode === 'daily' || this.mode === 'prep' || this.mode === 'ranking' || this.mode === 'records' || this.mode === 'fukubiki';
  }

  // ---------- 描画 ----------

  /** タイトル画面の右下の「利用規約・プライバシー」（HTML の小さな文字） */
  private legalLink: HTMLElement | null | undefined;

  draw() {
    const sc = this.sc;
    // タイトル画面のときだけ見せる（遊んでいる間は画面に重ねない）
    if (this.legalLink === undefined) this.legalLink = typeof document !== 'undefined' ? document.getElementById('legal-link') : null;
    if (this.legalLink) this.legalLink.hidden = this.mode !== 'title' || this.artState === 'loading';
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
      drawTutorial(this);
      if (this.tutorial?.step === 'done' && !this.paused) drawMenuScreen(this, '練習はおしまい！', '本番は3分間。時間が進み、お客が次々に来ます');
      if (this.paused) drawMenuScreen(this, '一時停止中', '');
      if (this.paused || this.tutorial?.step === 'done') drawClickHint(this);
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
    else if (this.mode === 'ranking') drawRanking(this);
    else if (this.mode === 'records') drawRecords(this);
    else if (this.mode === 'fukubiki') drawFukubiki(this);
    else drawResult(this);
    if (this.mode === 'result') { if (this.t - this.resultAt > RESULT_READY - 0.3) drawResultMenu(this); }
    else drawMenu(this, this.mode === 'help' ? 210 : this.mode === 'difficulty' ? 170 : 172);
    if (this.missFlash > 0) sc.PR(sc.ext.x0, sc.ext.y1 - 3, sc.ext.w, 3, C.red, this.missFlash * 3);
    drawClickHint(this);
    drawImeHint(this);
    drawVolume(this);
  }

}
