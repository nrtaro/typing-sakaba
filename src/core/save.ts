// ブラウザへの保存：設定・自己ベスト・直近の結果（3分の一周なので途中経過は保存しない）

import { PLAYER_ID } from './ranking';

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
  /** 前回選んだ営業（Enter で選ぶときに使う） */
  playMode: 'normal' | 'daily';
  /** ランキングで前回使った名前 */
  rankingName: string;
}

export const DEFAULT_SETTINGS: Settings = { muted: false, bgmVolume: 0.5, seVolume: 0.7, difficulty: 'normal', guided: false, volume: 3, playMode: 'normal', rankingName: '' };

export interface DayRecord {
  score: number;
  served: number;
  maxCombo: number;
  angry: number;
  kps: number;
  accuracy: number;
  finishedAt: string;
}

const KEYS = { settings: 'lastorder2.settings', best: 'lastorder2.best', last: 'lastorder2.last', daily: 'lastorder2.daily', player: 'lastorder2.player' };

/** ひがわり営業の記録は、直近の何日分を残すか */
export const DAILY_KEEP_DAYS = 30;

/** ひがわりの記録：日付 → 難易度 → その日のベスト */
type DailyBook = Record<string, Partial<Record<string, DayRecord>>>;

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

export class SaveStore {
  private keys: typeof KEYS;
  private player: string | null = null;

  /** slot を指定すると別の保存枠を使う（動作確認用） */
  constructor(private store: KeyValueStore | null, slot = '') {
    const sfx = slot ? `.${slot.replace(/[^a-z0-9_-]/gi, '')}` : '';
    this.keys = { settings: KEYS.settings + sfx, best: KEYS.best + sfx, last: KEYS.last + sfx, daily: KEYS.daily + sfx, player: KEYS.player + sfx };
  }

  /** 保存できないブラウザでも、この起動中は同じ端末IDを使う。 */
  playerId(): string {
    if (this.player) return this.player;
    const saved = this.read<unknown>(this.keys.player);
    this.player = typeof saved === 'string' && PLAYER_ID.test(saved) ? saved.toLowerCase() : crypto.randomUUID();
    this.write(this.keys.player, this.player);
    return this.player;
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

  private loadDailyBook(): DailyBook {
    const d = this.read<DailyBook>(this.keys.daily);
    return d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  }

  /** ひがわり営業の、その日・その難易度のベスト（通常営業の記録とは別） */
  loadDailyBest(date: string, difficulty: string): DayRecord | null {
    const r = this.loadDailyBook()[date]?.[difficulty];
    return r && typeof r.score === 'number' ? r : null;
  }

  /** ひがわり営業の結果を記録し、その日のベストを更新したら true */
  recordDaily(r: DayRecord, date: string, difficulty: string): boolean {
    const book = this.loadDailyBook();
    const day = book[date] ?? {};
    const best = day[difficulty];
    const isBest = !best || typeof best.score !== 'number' || r.score > best.score;
    if (isBest) {
      day[difficulty] = r;
      book[date] = day;
      // 古い日の記録は消す（日付の文字列は並べ替えるとそのまま古い順になる）
      const dates = Object.keys(book).sort();
      for (const old of dates.slice(0, Math.max(0, dates.length - DAILY_KEEP_DAYS))) delete book[old];
      this.write(this.keys.daily, book);
    }
    return isBest;
  }
}
