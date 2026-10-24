import { C } from './palette';
import { Screen, LW } from './screen';
import { Sound } from './audio';
import { ShopView } from './shopView';
import { MinigameView } from './minigameView';
import { FAM, PORTRAIT } from './sprites';
import { drawLights, drawRoomLive, roomLayer } from './room';
import { Art } from './amber/art';
import { CandidateInput } from '../core/candidates';
import { Shop } from '../core/shop';
import { createMinigame, type Minigame } from '../core/minigames';
import { Rng } from '../core/rng';
import { RomajiMatcher } from '../core/romaji';
import { SaveStore, type DayRecord } from '../core/save';
import {
  DAY_LENGTH, DIFFICULTIES, FAMILY_NAME, GAME_SUBTITLE, GAME_TITLE, INGREDIENT_NAME, PHASES, SHOP, difficultyOf, rankFor,
  type DifficultyId,
} from '../core/shopConfig';

type Mode = 'title' | 'help' | 'difficulty' | 'play' | 'result';
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
  trip: { game: Minigame<unknown>; phase: 'intro' | 'game' | 'outro'; t: number } | null = null;
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
          { text: this.settings.muted ? 'おと：なし' : 'おと：あり', kana: 'おと', act: () => this.toggleMute() },
        ];
      case 'help':
        return [{ text: 'もどる', kana: 'もどる', act: () => { this.mode = 'title'; } }];
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

  private toggleMute() {
    this.settings.muted = !this.settings.muted;
    this.store.saveSettings(this.settings);
    this.sound.apply(this.settings);
  }

  private toTitle() {
    this.mode = 'title';
    this.shop = null;
    this.trip = null;
    this.paused = false;
    this.sound.bgm('title', 96);
  }

  /** Enter で選ばれる項目：難易度の画面では前回の難易度、それ以外は先頭 */
  private enterItem(): MenuItem | undefined {
    const items = this.menuItems();
    if (this.mode === 'difficulty') return items.find((it) => it.kana === difficultyOf(this.settings.difficulty).kana);
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
    this.sound.bgm('shop', PHASES[0].tempo);
    this.sound.chord(0);
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
    if (inMenu) {
      if (k === 'Enter') {
        e.preventDefault();
        const first = this.enterItem();
        if (first) { this.sound.chord(2); first.act(); this.menu.reset(); }
        return;
      }
      if (k === 'Backspace') { e.preventDefault(); this.menu.backspace(); return; }
      if (k === ' ') { e.preventDefault(); this.menu.reset(); return; }
      if (k.length === 1 && TYPABLE.test(k.toLowerCase())) {
        e.preventDefault();
        const r = this.menu.key(k);
        if (r.kind === 'miss') { this.sound.miss(); this.missFlash = 0.25; return; }
        this.sound.key(this.menu.typed.length || 1);
        if (r.done.length) { this.sound.chord(2); r.done[0].data.act(); this.menu.reset(); }
      }
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

  private stepTrip(dt: number) {
    const trip = this.trip!;
    trip.t -= dt;
    if (trip.phase === 'intro' && trip.t <= 0) {
      if (this.tripView.art && !this.tripView.art.has(`bg-${trip.game.kind}`)) return;
      trip.phase = 'game';
      this.sound.bgm('trip', 132);
    } else if (trip.phase === 'game') {
      trip.game.update(dt);
      if (trip.game.finished) {
        trip.phase = 'outro';
        trip.t = SHOP.tripIntro;
        this.sound.chord(5);
      }
    } else if (trip.phase === 'outro' && trip.t <= 0) {
      const r = trip.game.result();
      this.shop!.stats.correctKeys += r.correctKeys;
      this.shop!.stats.missKeys += r.missKeys;
      this.shop!.returnFromTrip(r.gains);
      this.trip = null;
      this.sound.bgm('shop', PHASES[this.shop!.phaseIndex].tempo);
    }
  }

  private drainEvents() {
    const shop = this.shop;
    if (!shop) return;
    for (const ev of shop.drainEvents()) {
      this.view.handle(ev, shop);
      switch (ev.type) {
        case 'key': if (ev.ok) this.sound.key(ev.count); else this.sound.miss(); break;
        case 'serve': this.sound.chord(Math.floor(ev.combo / 3)); this.sound.coin(); if (ev.combo >= 3) this.sound.combo(ev.combo); break;
        case 'lack': case 'angry': this.sound.bad(); break;
        case 'tripStart':
          this.trip = { game: createMinigame(ev.trip.id, new Rng(this.seed + shop.stats.trips * 7919), shop.difficulty), phase: 'intro', t: SHOP.tripIntro };
          this.tripView = new MinigameView();
          this.tripView.art = this.art;
          if (this.art) void this.art.ensure(`bg-${ev.trip.id}`).catch(() => { this.tripView.art = null; });
          this.sound.chord(3);
          break;
        case 'phase': if (!this.trip) this.sound.bgm('shop', PHASES[ev.index].tempo); break;
        case 'end': this.finish(); break;
        default: break;
      }
    }
    if (this.trip?.phase === 'game') {
      for (const ev of this.trip.game.drainEvents()) {
        this.tripView.handle(ev, this.trip.game);
        if (ev.type === 'key') { if (ev.ok) this.sound.key(ev.count); else this.sound.miss(); }
        else if (ev.type === 'gain') this.sound.chord(2);
        else if (ev.type === 'loss' || ev.type === 'escape') this.sound.bad();
        else if (ev.type === 'bite') this.sound.chord(1);
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
    this.sound.bgm('title', 96);
    this.sound.chord(8);
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
        this.tripView.draw(sc, this.trip.game, this.shop, this.t);
        if (this.trip.phase === 'outro') this.drawTripOutro();
      } else {
        this.view.draw(sc, this.shop, this.t, false);
        if (this.trip?.phase === 'intro') this.drawTripIntro();
      }
      if (this.paused) this.drawMenuScreen('一時停止中', 'さいかい／やめる を打って選ぶ（Enter・Esc でも再開）');
      return;
    }
    // タイトル・遊び方・結果：店内を背景に
    const g = sc.g;
    const ph = this.mode === 'result' ? 2 : 1;
    if (this.art) {
      sc.clearScreen();
      if (this.mode === 'result') this.art.drawBackground(sc, 'bg-tavern-night');
      else this.art.drawMenuBackground(sc);
    } else {
      sc.begin();
      g.drawImage(roomLayer(ph, sc), 0, 0);
      sc.toBase();
      drawRoomLive(g, this.t);
      drawLights(g, ph, sc);
      sc.present();
    }
    sc.cover(C.bg, this.mode === 'title' ? 0.18 : 0.7);
    if (this.mode === 'title') sc.fade(sc.ext.x0, sc.ext.y0, sc.ext.w * 0.72, sc.ext.h, '#190f09', 0.9, 0, 'x');
    if (this.mode === 'title') this.drawTitle();
    else if (this.mode === 'help') this.drawHelp();
    else if (this.mode === 'difficulty') this.drawDifficulty();
    else this.drawResult();
    this.drawMenu(this.mode === 'help' ? 210 : this.mode === 'result' ? 176 : this.mode === 'difficulty' ? 170 : 172);
    if (this.missFlash > 0) sc.PR(sc.ext.x0, sc.ext.y1 - 3, sc.ext.w, 3, C.red, this.missFlash * 3);
  }

  private drawMenu(y: number) {
    const sc = this.sc;
    const items = this.menuItems();
    if (this.mode === 'title') {
      items.forEach((it, i) => {
        const live = this.menu.active.find(l => l.target.id === it.kana);
        const m = live?.matcher ?? new RomajiMatcher(it.kana);
        const x = 24 + (i === 2 ? 112 : 0), yy = i === 0 ? 150 : 208, w = i === 0 ? 216 : 104;
        const primary = i === 0, dim = this.menu.typed.length > 0 && !live;
        sc.PR(x, yy + 3, w, primary ? 44 : 34, '#68401f', dim ? 0.4 : 1);
        sc.panel(x, yy, w, primary ? 44 : 34, primary ? (live ? '#ffe2a0' : '#e3b86e') : '#332419', live ? C.w : C.gold3, dim ? 0.45 : 1);
        sc.T(it.text, primary ? x + 12 : x + w / 2, yy + 5, primary ? 17 : 11, primary ? '#302014' : C.cream, primary ? 'left' : 'center');
        sc.roma(m.typed, m.remaining, x + w / 2, yy + (primary ? 28 : 21), primary ? 10 : 9, live ? 'active' : dim ? 'dim' : 'idle', 1, primary);
        if (primary) {
          sc.panel(x + w - 56, yy + 9, 44, 17, '#edc686', '#a67a3c');
          sc.T('Enter ↵', x + w - 34, yy + 14, 7, '#4b301e', 'center');
        }
      });
      sc.T('言葉を打って選ぶ ／ Enter：はじめる', 24, 252, 8, C.cream2);
      return;
    }
    if (this.mode === 'difficulty') {
      sc.T('Enter：前回の難易度で開店', 24, 242, 9, C.gold3);
      const back = items[items.length - 1], live = this.menu.active.find(l => l.target.id === back.kana);
      const m = live?.matcher ?? new RomajiMatcher(back.kana);
      sc.T('もどる', 410, 235, 9, C.cream);
      sc.roma(m.typed, m.remaining, 429, 251, 8, live ? 'active' : 'idle');
      return;
    }
    if (this.mode === 'help') {
      const m = this.menu.active[0]?.matcher ?? new RomajiMatcher('もどる');
      sc.PR(340, 215, 112, 34, '#68401f');
      sc.panel(340, 212, 112, 34, '#e3b86e', C.gold3);
      sc.T('もどる', 396, 216, 12, '#302014', 'center');
      sc.roma(m.typed, m.remaining, 396, 234, 9, this.menu.typed ? 'active' : 'idle', 1, true);
      sc.T('Enter でも戻れます', 396, 252, 7, C.cream2, 'center');
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
      sc.panel(x, y, iw, 40, live ? '#4a2c3c' : 'rgba(42,27,38,0.95)', live || isDefault ? C.gold : C.wood4, dim ? 0.5 : 1);
      sc.T(it.text, x + iw / 2, y + 3, 14, dim ? C.gray : C.w, 'center');
      const m = live?.matcher ?? new RomajiMatcher(it.kana);
      sc.roma(m.typed, m.remaining, x + iw / 2, y + 23, 11, live ? 'active' : dim ? 'dim' : 'idle');
    });
    const enterHint = this.mode === 'result' ? 'Enter：もういちど' : 'Enter：さいかい';
    sc.TB(`メニューも打って選ぶ　${enterHint}`, LW / 2, y + 46, 9, C.cream, 'center');
  }

  private drawMenuScreen(title: string, sub: string) {
    const sc = this.sc;
    sc.cover(C.bg, 0.6);
    sc.TB(title, LW / 2, 92, 20, C.gold3, 'center');
    sc.TB(sub, LW / 2, 122, 10, C.cream, 'center');
    this.drawMenu(146);
  }

  private drawTitle() {
    const sc = this.sc;
    sc.T('３分間のタイピング営業', 24, 32, 9, C.gold3);
    sc.TB(GAME_TITLE, 24, 51, 31, C.gold3, 'left', C.red2);
    sc.T(GAME_SUBTITLE, 24, 91, 10, C.cream);
    sc.T('打つほど、酒場がにぎわう。', 24, 116, 12, C.cream);
    if (this.art) {
      for (const [id, x, h] of [['master', 314, 116], ['wife', 374, 106], ['daughter', 432, 90]] as const) {
        sc.PR(x - 18, 222, 36, 3, '#170d08', 0.4);
        this.art.drawAnim(sc, `family-${id}`, '待機', this.t, x, 222, this.art.scaleFor(`family-${id}`, 0, h));
      }
    } else {
      sc.spr(FAM.master[0], 295, 130, 3);
      sc.spr(FAM.wife[0], 350, 140, 3);
      sc.spr(FAM.daughter[0], 405, 150, 3);
    }
    const diff = difficultyOf(this.settings.difficulty), best = this.store.loadBest(diff.id);
    sc.T(best ? `自己ベスト ${best.score.toLocaleString()}` : '自己ベスト ―', 456, 250, 8, C.cream2, 'right');
  }

  private drawDifficulty() {
    const sc = this.sc;
    sc.TB('今日は、どんなにぎわいにする？', 24, 18, 20, C.gold3, 'left');
    sc.T('初めてなら「やさしい」がおすすめ。言葉を打つと開店！', 24, 47, 9, C.cream);
    DIFFICULTIES.forEach((d, i) => {
      const x = 24 + i * 146, live = this.menu.active.find(l => l.target.id === d.kana);
      const chosen = this.menu.typed ? !!live : d.id === this.settings.difficulty;
      sc.panel(x, 74, 138, 145, chosen ? '#513824' : 'rgba(42,27,18,0.92)', chosen ? C.gold3 : C.wood4);
      if (!i) { sc.PR(x + 10, 84, 65, 13, '#a7c99d'); sc.T('はじめての人に', x + 14, 87, 7, '#203321'); }
      sc.T(d.name, x + 12, 108, 18, C.cream);
      sc.T(['のんびり楽しむ','ほどよい忙しさ','次々くる注文に挑戦'][i], x + 12, 136, 9, C.cream2);
      const m = live?.matcher ?? new RomajiMatcher(d.kana);
      sc.roma(m.typed, m.remaining, x + 69, 154, 10, live ? 'active' : 'idle');
      if (this.art) for (let j = 0; j <= i; j++) this.art.drawFrame(sc, 'guests-seated', j * 4,
        x + 23 + j * 33, 200, this.art.scaleFor('guests-seated', j * 4, 29));
      for (let j = 0; j < 3; j++) sc.PR(x + 12 + j * 16, 208, 12, 2, j <= i ? C.gold3 : C.wood3);
    });
  }

  private drawHelp() {
    const sc = this.sc;
    sc.TB('遊び方は、３つだけ。', 24, 18, 22, C.gold3, 'left');
    const titles = ['料理名を打つ','減ったら調達','たくさん出そう'];
    const lines = [['お客の頭上のローマ字を','打つと、料理を出せます。'],['画面下の言葉を打って、','食材を集めよう。'],['お客を待たせすぎず、','３分間の売上に挑戦！']];
    titles.forEach((title, i) => {
      const x = 24 + i * 146;
      sc.panel(x, 61, 138, 139, 'rgba(55,37,23,0.94)', C.wood4);
      sc.T(`0${i + 1}`, x + 12, 72, 9, C.gold3);
      if (i === 0) {
        this.art?.drawIcon(sc, 'icons-dishes', 7, x + 12, 92, 36);
        sc.panel(x + 55, 91, 73, 35, '#211712', C.wood4);
        sc.T('焼き魚', x + 91, 95, 10, C.cream, 'center');
        sc.T('yakizakana', x + 91, 112, 7, C.gold3, 'center');
      } else if (i === 1) {
        this.art?.drawIcon(sc, 'icons-dishes', 0, x + 24, 94, 25);
        this.art?.drawIcon(sc, 'icons-dishes', 1, x + 88, 94, 25);
        sc.T('つり', x + 36.5, 125, 10, C.cream, 'center');
        sc.T('かり', x + 100.5, 125, 10, C.cream, 'center');
      } else sc.T('3:00', x + 69, 98, 25, C.gold3, 'center');
      sc.T(title, x + 12, 145, 13, C.cream);
      lines[i].forEach((line, j) => sc.T(line, x + 12, 169 + j * 13, 8, C.cream2));
    });
    sc.T('半角英字で入力。shi / si どちらでもOK。', 24, 216, 8, C.cream2);
    sc.T('Backspace：１文字戻す　Space：打ち直し　Esc：一時停止', 24, 230, 7, C.cream2);
  }

  private drawResult() {
    const sc = this.sc;
    const r = this.result;
    if (!r) return;
    sc.TB('本日の営業終了', LW / 2, 8, 18, C.gold3, 'center');
    sc.TB(`売上 ${r.score.toLocaleString()}円`, LW / 2, 32, 26, C.w, 'center');
    sc.TB(`${r.difficulty}　ランク ${r.rank}　${r.title}`, LW / 2, 66, 14, C.pink, 'center');
    if (r.best) sc.TB('自己ベスト更新！', LW / 2, 86, 12, C.gold, 'center');
    const stats = [
      [`${r.served}皿`, '出した料理'], [`${r.maxCombo}`, '最大コンボ'], [`${r.angry}人`, '怒って帰った客'],
      [`${r.kps.toFixed(2)}`, '打鍵/秒'], [`${(r.accuracy * 100).toFixed(1)}%`, '正確さ'], [`${r.trips}回`, '調達'],
    ];
    stats.forEach(([v, l], i) => {
      const x = 28 + i * 72;
      sc.panel(x, 106, 66, 44, 'rgba(42,27,38,0.92)', C.wood4);
      sc.TB(v, x + 33, 110, 14, C.gold3, 'center');
      sc.T(l, x + 33, 133, 9, C.cream, 'center');
    });
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
    sc.TB(`${FAMILY_NAME[trip.who]}「ただいま！」`, LW / 2, 96, 14, C.gold3, 'center');
    const text = trip.gives.map((id) => `${INGREDIENT_NAME[id]} +${Math.max(trip.minimum[id] ?? 0, gains[id] ?? 0)}`).join('　');
    sc.TB(text, LW / 2, 122, 14, C.w, 'center');
  }
}
