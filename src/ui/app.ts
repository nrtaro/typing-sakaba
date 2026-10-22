import { H, W } from './art/px';
import { Audio } from './audio';
import { SaveStore, type Settings } from '../core/save';
import type { GameState } from '../core/game';

export interface Scene {
  /** UI を組み立てる（app.ui は空の状態で渡される） */
  enter(app: App): void;
  exit?(): void;
  update?(dt: number): void;
  render(ctx: CanvasRenderingContext2D, t: number): void;
  /** true を返すとキーを処理済みとして既定動作を止める */
  onKey?(e: KeyboardEvent): boolean;
  /** フォーカス喪失などでの自動一時停止 */
  autoPause?(): void;
  /** プレイ時間として数えるか */
  countsPlayTime?: boolean;
  /** 一時停止中ならプレイ時間を数えない */
  paused?: boolean;
}

function localStore() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class App {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly ui: HTMLElement;
  readonly stage: HTMLElement;
  readonly store = new SaveStore(localStore(), new URLSearchParams(location.search).get('slot') ?? '');
  settings: Settings;
  readonly audio: Audio;
  state: GameState | null = null;
  playSeconds = 0;
  private scene: Scene | null = null;
  private last = performance.now();
  private time = 0;
  private toastTimer = 0;

  constructor() {
    this.stage = document.getElementById('stage')!;
    this.canvas = document.getElementById('world') as HTMLCanvasElement;
    this.ui = document.getElementById('ui')!;
    this.canvas.width = W;
    this.canvas.height = H;
    this.ctx = this.canvas.getContext('2d')!;
    this.ctx.imageSmoothingEnabled = false;
    this.settings = this.store.loadSettings();
    this.audio = new Audio(this.settings);
    this.applySettings();

    window.addEventListener('resize', () => this.fit());
    new ResizeObserver(() => this.fit()).observe(document.documentElement);
    this.fit();

    window.addEventListener('keydown', (e) => this.handleKey(e));
    window.addEventListener('pointerdown', () => this.audio.unlock());
    window.addEventListener('blur', () => this.scene?.autoPause?.());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.scene?.autoPause?.();
    });
    requestAnimationFrame((t) => this.frame(t));
  }

  /** 画面サイズに合わせて整数倍で拡大する（小さい画面では小数倍） */
  private fit() {
    const sw = window.innerWidth;
    const sh = window.innerHeight;
    const raw = Math.min(sw / W, sh / H);
    const scale = raw >= 2 ? Math.floor(raw) : Math.max(1, raw);
    document.documentElement.style.setProperty('--u', `${scale}px`);
  }

  go(scene: Scene) {
    this.scene?.exit?.();
    this.ui.replaceChildren();
    this.scene = scene;
    scene.enter(this);
  }

  applySettings() {
    this.audio.apply(this.settings);
    this.stage.classList.toggle('reduce', this.settings.reduceEffects);
    this.stage.classList.toggle('hide-romaji', !this.settings.showRomaji);
  }

  saveSettings() {
    this.store.saveSettings(this.settings);
    this.applySettings();
  }

  /** 一周の途中経過を保存する */
  save() {
    if (this.state && this.state.phase === 'day') this.store.saveRun(this.state, this.playSeconds);
  }

  toast(text: string, ms = 2200) {
    const el = document.getElementById('toast')!;
    el.textContent = text;
    el.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => el.classList.remove('show'), ms);
  }

  private handleKey(e: KeyboardEvent) {
    this.audio.unlock();
    if (e.isComposing || e.key === 'Process' || e.keyCode === 229) {
      this.toast('日本語入力（IME）をオフにして、半角英数で入力してください', 3000);
      return;
    }
    // フォーム部品の入力中はゲームのキー操作を割り込ませない
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') && (target as HTMLInputElement).type === 'text') {
      if (e.key !== 'Escape') return;
    }
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (this.scene?.onKey?.(e)) e.preventDefault();
  }

  /** 動作確認用: 時間を指定して1コマ進める */
  debugStep(dt: number) {
    this.time += dt;
    const s = this.scene;
    if (!s) return;
    if (s.countsPlayTime && !s.paused) this.playSeconds += dt;
    s.update?.(dt);
    s.render(this.ctx, this.time);
  }

  private frame(now: number) {
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.time += dt;
    const s = this.scene;
    if (s) {
      if (s.countsPlayTime && !s.paused && !document.hidden) this.playSeconds += dt;
      s.update?.(dt);
      s.render(this.ctx, this.time);
    }
    requestAnimationFrame((t) => this.frame(t));
  }
}
