import type { GameState } from './game';
import type { ScoreBreakdown, TypingSummary } from './game';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Settings {
  bgmVolume: number;
  seVolume: number;
  muted: boolean;
  reduceEffects: boolean;
  showRomaji: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  bgmVolume: 0.35,
  seVolume: 0.6,
  muted: false,
  reduceEffects: false,
  showRomaji: true,
};

export interface RunRecord {
  seed: number;
  score: ScoreBreakdown;
  typing: TypingSummary;
  finishedAt: string;
  playSeconds: number;
}

const KEYS = {
  run: 'lastorder.run.v1',
  settings: 'lastorder.settings.v1',
  best: 'lastorder.best.v1',
  last: 'lastorder.last.v1',
};

/** ブラウザの保存領域が使えない環境でも落ちないようにする */
function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export class SaveStore {
  constructor(private store: KeyValueStore | null) {}

  saveRun(s: GameState, playSeconds: number) {
    safe(() => this.store?.setItem(KEYS.run, JSON.stringify({ state: s, playSeconds })), undefined);
  }

  loadRun(): { state: GameState; playSeconds: number } | null {
    const raw = safe(() => this.store?.getItem(KEYS.run) ?? null, null);
    if (!raw) return null;
    const data = safe(() => JSON.parse(raw), null);
    if (!data || !isValidState(data.state)) return null;
    return { state: data.state, playSeconds: Number(data.playSeconds) || 0 };
  }

  clearRun() {
    safe(() => this.store?.removeItem(KEYS.run), undefined);
  }

  loadSettings(): Settings {
    const raw = safe(() => this.store?.getItem(KEYS.settings) ?? null, null);
    const data = raw ? safe(() => JSON.parse(raw), null) : null;
    return { ...DEFAULT_SETTINGS, ...(data && typeof data === 'object' ? data : {}) };
  }

  saveSettings(s: Settings) {
    safe(() => this.store?.setItem(KEYS.settings, JSON.stringify(s)), undefined);
  }

  loadBest(): RunRecord | null {
    return this.loadRecord(KEYS.best);
  }

  loadLast(): RunRecord | null {
    return this.loadRecord(KEYS.last);
  }

  /** 直近の結果を保存し、自己ベストなら更新する。自己ベスト更新なら true */
  recordResult(r: RunRecord): boolean {
    safe(() => this.store?.setItem(KEYS.last, JSON.stringify(r)), undefined);
    const best = this.loadBest();
    if (!best || r.score.total > best.score.total) {
      safe(() => this.store?.setItem(KEYS.best, JSON.stringify(r)), undefined);
      return true;
    }
    return false;
  }

  private loadRecord(key: string): RunRecord | null {
    const raw = safe(() => this.store?.getItem(key) ?? null, null);
    if (!raw) return null;
    const data = safe(() => JSON.parse(raw), null);
    return data && data.score && typeof data.score.total === 'number' ? data : null;
  }
}

function isValidState(s: unknown): s is GameState {
  if (!s || typeof s !== 'object') return false;
  const g = s as Partial<GameState>;
  return (
    g.version === 1 &&
    typeof g.day === 'number' &&
    typeof g.cash === 'number' &&
    typeof g.actionsLeft === 'number' &&
    !!g.ingredients &&
    !!g.dishes &&
    !!g.levels &&
    Array.isArray(g.menu) &&
    Array.isArray(g.hauls) &&
    Array.isArray(g.nights)
  );
}
