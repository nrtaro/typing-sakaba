import { C } from './palette';
import { Screen, LW } from './screen';
import { Sound } from './audio';
import { ShopView } from './shopView';
import { MinigameView } from './minigameView';
import { FAM, PORTRAIT } from './sprites';
import { drawLights, drawRoomLive, roomLayer } from './room';
import { CandidateInput } from '../core/candidates';
import { Shop } from '../core/shop';
import { createMinigame, type Minigame } from '../core/minigames';
import { Rng } from '../core/rng';
import { RomajiMatcher } from '../core/romaji';
import { SaveStore, type DayRecord } from '../core/save';
import { DAY_LENGTH, FAMILY_NAME, GAME_SUBTITLE, GAME_TITLE, INGREDIENT_NAME, PHASES, SHOP, rankFor } from '../core/shopConfig';

type Mode = 'title' | 'help' | 'play' | 'result';
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
  result: (DayRecord & { best: boolean; rank: string; title: string; trips: number }) | null = null;
  readonly menu: CandidateInput<MenuItem>;
  private t = 0;
  private last = performance.now();
  private missFlash = 0;
  private seed = Math.floor(Math.random() * 1e9);

  constructor(canvas: HTMLCanvasElement) {
    this.sc = new Screen(canvas);
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
          { text: 'はじめる', kana: 'はじめる', act: () => this.start() },
          { text: 'あそびかた', kana: 'あそびかた', act: () => { this.mode = 'help'; } },
          { text: this.settings.muted ? 'おと：なし' : 'おと：あり', kana: 'おと', act: () => this.toggleMute() },
        ];
      case 'help':
        return [{ text: 'もどる', kana: 'もどる', act: () => { this.mode = 'title'; } }];
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

  start() {
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    this.shop = new Shop(new Rng(this.seed));
    this.view = new ShopView();
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
        const first = this.menuItems()[0];
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
    const shop = this.shop;
    shop.update(dt);
    this.view.update(dt);
    this.tripView.update(dt);
    if (this.trip) this.stepTrip(dt);
    this.drainEvents();
  }

  private stepTrip(dt: number) {
    const trip = this.trip!;
    trip.t -= dt;
    if (trip.phase === 'intro' && trip.t <= 0) {
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
        case 'serve': this.sound.chord(Math.floor(ev.combo / 3)); this.sound.coin(); break;
        case 'lack': case 'angry': this.sound.bad(); break;
        case 'tripStart':
          this.trip = { game: createMinigame(ev.trip.id, new Rng(this.seed + shop.stats.trips * 7919)), phase: 'intro', t: SHOP.tripIntro };
          this.tripView = new MinigameView();
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
    const best = this.store.record(rec);
    const rank = rankFor(rec.score);
    this.result = { ...rec, best, rank: rank.name, title: rank.title, trips: s.trips };
    this.mode = 'result';
    this.menu.reset();
    this.sound.bgm('title', 96);
    this.sound.chord(8);
  }

  // ---------- 描画 ----------

  private draw() {
    const sc = this.sc;
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
    sc.begin();
    g.drawImage(roomLayer(ph, sc), 0, 0);
    sc.toBase();
    drawRoomLive(g, this.t);
    drawLights(g, ph, sc);
    sc.present();
    sc.cover(C.bg, 0.5);
    if (this.mode === 'title') this.drawTitle();
    else if (this.mode === 'help') this.drawHelp();
    else this.drawResult();
    this.drawMenu(this.mode === 'help' ? 210 : this.mode === 'result' ? 176 : 172);
    if (this.missFlash > 0) sc.PR(sc.ext.x0, sc.ext.y1 - 3, sc.ext.w, 3, C.red, this.missFlash * 3);
  }

  private drawMenu(y: number) {
    const sc = this.sc;
    const items = this.menuItems();
    const iw = 124;
    const gap = 12;
    const total = items.length * iw + (items.length - 1) * gap;
    const typing = this.menu.typed.length > 0;
    items.forEach((it, k) => {
      const x = LW / 2 - total / 2 + k * (iw + gap);
      const live = this.menu.active.find((l) => l.target.id === it.kana);
      const dim = typing && !live;
      sc.panel(x, y, iw, 40, live ? '#4a2c3c' : 'rgba(42,27,38,0.95)', live ? C.gold : C.wood4, dim ? 0.5 : 1);
      sc.T(it.text, x + iw / 2, y + 3, 14, dim ? C.gray : C.w, 'center');
      const m = live?.matcher ?? new RomajiMatcher(it.kana);
      sc.roma(m.typed, m.remaining, x + iw / 2, y + 23, 11, live ? 'active' : dim ? 'dim' : 'idle');
    });
    const enterHint = this.mode === 'help' ? 'Enter：もどる' : this.mode === 'result' ? 'Enter：もういちど' : this.paused ? 'Enter：さいかい' : 'Enter：はじめる';
    sc.TB(`メニューも打って選ぶ　${enterHint}　Backspace：1文字戻す　Space：やり直し`, LW / 2, y + 46, 9, C.cream, 'center');
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
    sc.TB(GAME_TITLE, LW / 2, 14, 34, C.gold3, 'center', C.red2);
    sc.TB(GAME_SUBTITLE, LW / 2, 56, 15, C.cream, 'center', C.red2);
    sc.spr(FAM.master[0], 190, 76, 2);
    sc.spr(FAM.wife[0], 226, 78, 2);
    sc.spr(FAM.daughter[0], 258, 86, 2);
    sc.TB('おやじ', 207, 128, 9, C.cream, 'center');
    sc.TB('女将', 241, 128, 9, C.cream, 'center');
    sc.TB('看板娘', 271, 128, 9, C.cream, 'center');
    const best = this.store.loadBest();
    sc.TB(best ? `自己ベスト ${best.score.toLocaleString()}（${rankFor(best.score).name}）` : '自己ベスト ―', LW / 2, 146, 11, C.gold3, 'center');
    sc.TB('3分間、家族で酒場を回すタイピングゲーム。IMEはオフに。音は最初のキー入力から鳴ります', LW / 2, 236, 8, C.cream2, 'center');
  }

  private drawHelp() {
    const sc = this.sc;
    sc.panel(22, 8, 436, 196, 'rgba(42,27,38,0.96)', C.gold);
    sc.TB('あそびかた', LW / 2, 13, 15, C.gold3, 'center');
    const lines = [
      '・お客の頭上の料理名をローマ字で打つと料理を出せる（shi/si などどの綴りでもOK）',
      '・打ち始めると合う候補が光り、打つほど絞り込まれる。同じ料理は待ちが短い客から',
      '・料理には素材が要る。足りない素材には×、取りに行く枠が赤く光る',
      '・画面下の言葉を打つと家族が調達へ（約10秒のミニゲーム）',
      '　つり＝女将（魚）　かり＝おやじ（肉）　さいしゅ＝娘（野菜・きのこ）　しいれ＝おやじ（酒・香辛料）',
      '・調達中はお客の待ち時間が止まるが、3分の時計は進む',
      '・ミスなく出し続けるとコンボ。10コンボごとに売上の倍率アップ',
      '・待たせすぎるとお客が怒って帰る。朝→昼→夜と客が増え、注文も変わる',
      '・Backspace：1文字戻す　Space：打ち直し　Esc：一時停止',
    ];
    lines.forEach((l, k) => sc.T(l, 34, 36 + k * 18, 9, C.cream));
  }

  private drawResult() {
    const sc = this.sc;
    const r = this.result;
    if (!r) return;
    sc.TB('本日の営業終了', LW / 2, 8, 18, C.gold3, 'center');
    sc.TB(`売上 ${r.score.toLocaleString()}`, LW / 2, 32, 26, C.w, 'center');
    sc.TB(`ランク ${r.rank}　${r.title}`, LW / 2, 66, 14, C.pink, 'center');
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
    sc.spr(PORTRAIT[trip.who], 120, 102, 2.5);
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
