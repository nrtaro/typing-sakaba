// ブラウザへの保存：設定・自己ベスト・直近の結果（3分の一周なので途中経過は保存しない）

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Settings {
  muted: boolean;
  bgmVolume: number;
  seVolume: number;
  /** 前回選んだ難易度（Enter で始めるときに使う） */
  difficulty: 'easy' | 'normal' | 'hard';
  /** 音量の段階（0=なし, 1=小, 2=中, 3=大） */
  volume: number;
  /** 最初の営業で、注文と調達の案内を見せ終えたか */
  guided: boolean;
}

export const DEFAULT_SETTINGS: Settings = { muted: false, bgmVolume: 0.5, seVolume: 0.7, difficulty: 'normal', guided: false, volume: 3 };

export interface DayRecord {
  score: number;
  served: number;
  maxCombo: number;
  angry: number;
  kps: number;
  accuracy: number;
  finishedAt: string;
}

const KEYS = { settings: 'lastorder2.settings', best: 'lastorder2.best', last: 'lastorder2.last' };

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export class SaveStore {
  private keys: typeof KEYS;

  /** slot を指定すると別の保存枠を使う（動作確認用） */
  constructor(private store: KeyValueStore | null, slot = '') {
    const sfx = slot ? `.${slot.replace(/[^a-z0-9_-]/gi, '')}` : '';
    this.keys = { settings: KEYS.settings + sfx, best: KEYS.best + sfx, last: KEYS.last + sfx };
  }

  private read<T>(key: string): T | null {
    const raw = safe(() => this.store?.getItem(key) ?? null, null);
    if (!raw) return null;
    return safe(() => JSON.parse(raw) as T, null);
  }

  private write(key: string, v: unknown) {
    safe(() => this.store?.setItem(key, JSON.stringify(v)), undefined);
  }

  loadSettings(): Settings {
    const d = this.read<Partial<Settings>>(this.keys.settings);
    return { ...DEFAULT_SETTINGS, ...(d && typeof d === 'object' ? d : {}) };
  }

  saveSettings(s: Settings) {
    this.write(this.keys.settings, s);
  }

  /** 自己ベストは難易度ごと（ふつうは以前の記録と同じ場所） */
  private bestKey(difficulty: string) {
    return difficulty === 'normal' ? this.keys.best : `${this.keys.best}.${difficulty}`;
  }

  loadBest(difficulty = 'normal'): DayRecord | null {
    const d = this.read<DayRecord>(this.bestKey(difficulty));
    return d && typeof d.score === 'number' ? d : null;
  }

  loadLast(): DayRecord | null {
    const d = this.read<DayRecord>(this.keys.last);
    return d && typeof d.score === 'number' ? d : null;
  }

  /** 結果を記録し、自己ベストを更新したら true */
  record(r: DayRecord, difficulty = 'normal'): boolean {
    this.write(this.keys.last, r);
    const best = this.loadBest(difficulty);
    if (!best || r.score > best.score) {
      this.write(this.bestKey(difficulty), r);
      return true;
    }
    return false;
  }
}
