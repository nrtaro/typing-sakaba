// ブラウザへの保存：設定・自己ベスト・直近の結果（3分の一周なので途中経過は保存しない）

import { readCollection, type CollectionState } from './collection';
import { PLAYER_ID } from './ranking';

import { applyPlay, markRead, readRecords, type PlayFacts, type Records } from './achievements';
import { readMeta, type RunMeta } from './run';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface Settings {
  muted: boolean;
  bgmVolume: number;
  seVolume: number;
  /** 段階6：BGM・効果音・打鍵音の音量（0〜10。8 がこれまでの大きさ） */
  bgmLevel: number;
  seLevel: number;
  keyLevel: number;
  /** 前回選んだ難易度（Enter で始めるときに使う） */
  difficulty: 'easy' | 'normal' | 'hard';
  /** 音量の段階（0=なし, 1=小, 2=中, 3=大） */
  volume: number;
  /** 最初の営業で、注文と調達の案内を見せ終えたか */
  guided: boolean;
  /** 前回選んだ営業（Enter で選ぶときに使う） */
  playMode: 'normal' | 'daily' | 'run';
  /** れんしゅうを最後まで終えたか */
  tutorialDone: boolean;
  /** はじめて開いたときの案内（タイトルの前）を見終えたか、飛ばしたか */
  introDone: boolean;
  /** ランキングで前回使った名前 */
  rankingName: string;
  /** 演出の強さ（0=ひかえめ、1=ふつう）。光・揺れ・紙吹雪の量を変える */
  fxLevel: number;
}

export const DEFAULT_SETTINGS: Settings = { muted: false, bgmVolume: 0.5, seVolume: 0.7, difficulty: 'normal', guided: false, volume: 3, playMode: 'normal', rankingName: '', tutorialDone: false, introDone: false, bgmLevel: 8, seLevel: 8, keyLevel: 8, fxLevel: 1 };

export interface DayRecord {
  score: number;
  served: number;
  maxCombo: number;
  angry: number;
  kps: number;
  accuracy: number;
  finishedAt: string;
}

const KEYS = { settings: 'lastorder2.settings', best: 'lastorder2.best', last: 'lastorder2.last', daily: 'lastorder2.daily', player: 'lastorder2.player', records: 'lastorder2.records.v1', collection: 'lastorder2.collection.v1', run: 'lastorder2.run.v1' };

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

export interface RunReward {
  runId: string | null;
  amount: number;
  achievements: string[];
}
export class RunConflict extends Error {}
interface RunCheckpoint { raw: string | null; pending: RunReward[] }

export class SaveStore {
  private checkpoints = new WeakMap<RunMeta, RunCheckpoint>();
  private keys: typeof KEYS;
  private player: string | null = null;

  /** slot を指定すると別の保存枠を使う（動作確認用） */
  constructor(private store: KeyValueStore | null, slot = '') {
    const sfx = slot ? `.${slot.replace(/[^a-z0-9_-]/gi, '')}` : '';
    this.keys = { settings: KEYS.settings + sfx, best: KEYS.best + sfx, last: KEYS.last + sfx, daily: KEYS.daily + sfx, player: KEYS.player + sfx, records: KEYS.records + sfx, collection: KEYS.collection + sfx, run: KEYS.run + sfx };
  }

  /** 記録・実績（段階5）。保存がない・壊れているときは、空の記録から始める */
  loadRecords(): Records {
    return readRecords(this.read<unknown>(this.keys.records));
  }

  /**
   * 1回の営業を記録に反映する。反映の直前に保存を読み直すので、別のタブで遊んだ分や解放を消さない。
   * 書き込みに失敗しても、営業と結果画面はそのまま使える。
   */
  recordPlay(f: PlayFacts, now = new Date()): { records: Records; unlocked: string[]; coins: number; credited: number } {
    const before = this.loadRecords();
    const result = applyPlay(before, f, now);
    if (result.records !== before) this.write(this.keys.records, result.records);
    // 段階6：売上を貯金箱へ。記録と同じ営業IDで一度だけ足す
    let credited = 0;
    const c = this.updateCollection((s) => {
      if (s.credited.includes(f.id)) return s;
      credited = Math.max(0, Math.floor(f.score));
      return { ...s, coins: s.coins + credited, credited: [...s.credited, f.id].slice(-200) };
    });
    return { ...result, coins: c.coins, credited };
  }

  /** コレクション（段階6）。保存がない・壊れているときは空から始める */
  loadCollection(): CollectionState {
    return readCollection(this.read<unknown>(this.keys.collection));
  }

  /** 保存の直前に読み直して変更する（別のタブの分を消さない）。書き込めなくても結果を返す */
  updateCollection(fn: (s: CollectionState) => CollectionState): CollectionState {
    const before = this.loadCollection();
    const after = fn(before);
    if (after !== before) this.write(this.keys.collection, after);
    return after;
  }

  /** 繁盛記の記録（進行中の挑戦を含む）。通常営業・ひがわりの記録とは別の場所に残す */
  loadRun(): RunMeta {
    const raw = safe(() => this.store?.getItem(this.keys.run) ?? null, null);
    let data: { _pending?: RunReward[] } | null = null;
    try { data = raw ? JSON.parse(raw) : null; } catch { /* 古い破損データは空から */ }
    const meta = readMeta(data);
    const pending = Array.isArray(data?._pending) ? data._pending.filter((r) => r && (r.runId === null || typeof r.runId === 'string') && Number.isFinite(r.amount) && r.amount >= 0 && Array.isArray(r.achievements) && r.achievements.every((id) => typeof id === 'string')) : [];
    this.checkpoints.set(meta, { raw, pending });
    return meta;
  }

  /** 同期APIでも保存失敗・古い世代を黙殺しない。UIは必ずcommitRunでタブ間排他する。 */
  saveRun(m: RunMeta) {
    const checkpoint = this.checkpoints.get(m) ?? { raw: null, pending: [] };
    if ((this.store?.getItem(this.keys.run) ?? null) !== checkpoint.raw) throw new RunConflict('別タブで進行が更新されました');
    if (!this.store) throw new Error('保存先を利用できません');
    const raw = JSON.stringify({ ...m, _revision: crypto.randomUUID(), _pending: checkpoint.pending });
    this.store.setItem(this.keys.run, raw);
    this.checkpoints.set(m, { ...checkpoint, raw });
  }

  /** 進行＋未受領報酬を先に一括保存。途中で止まっても次回再試行できる。 */
  async commitRun(meta: RunMeta, reward?: RunReward): Promise<{ coins: number; achievements: string[] }> {
    const commit = () => {
      const checkpoint = this.checkpoints.get(meta) ?? { raw: null, pending: [] };
      if ((this.store?.getItem(this.keys.run) ?? null) !== checkpoint.raw) throw new RunConflict('別タブで進行が更新されました');
      if (reward && !checkpoint.pending.some((r) => JSON.stringify(r) === JSON.stringify(reward))) checkpoint.pending = [...checkpoint.pending, reward];
      this.checkpoints.set(meta, checkpoint);
      this.saveRun(meta);
      let coins = 0;
      const achievements: string[] = [];
      for (const r of checkpoint.pending) {
        achievements.push(...this.unlockAchievements(r.achievements));
        if (r.runId && !meta.paid.includes(r.runId)) {
          this.creditRun(`run:${r.runId}`, r.amount);
          meta.paid = [...meta.paid, r.runId].slice(-50);
        }
        if (r.runId) coins += r.amount;
      }
      if (checkpoint.pending.length) {
        // 受領済みの記録に失敗しても、永続したjournalが再試行を可能にする。
        const current = this.checkpoints.get(meta)!;
        this.checkpoints.set(meta, { ...current, pending: [] });
        try { this.saveRun(meta); }
        catch (error) { this.checkpoints.set(meta, { ...current, pending: checkpoint.pending }); throw error; }
      }
      return { coins, achievements };
    };
    if (typeof window !== 'undefined') {
      if (!navigator.locks) throw new Error('このブラウザでは安全な繁盛記の保存を利用できません');
      return navigator.locks.request(this.keys.run, commit);
    }
    // ブラウザ以外の同期メモリストアによる単体テスト用。
    return commit();
  }

  /**
   * 繁盛記の実績を解放する（段階5の実績と同じ場所に残すので、限定の飾りも同じ仕組みで「持っている」になる）。
   * 直前に読み直し、新しく解放した分だけを返す。
   */
  unlockAchievements(ids: string[], now = new Date()): string[] {
    const r = readRecords(this.readStrict(this.keys.records));
    const fresh = ids.filter((id) => !r.unlocked[id]);
    if (!fresh.length) return [];
    const unlocked = { ...r.unlocked };
    for (const id of fresh) unlocked[id] = now.toISOString();
    if (!this.store) throw new Error('保存先を利用できません');
    this.store.setItem(this.keys.records, JSON.stringify({ ...r, unlocked }));
    return fresh;
  }

  /** 繁盛記のごほうびを貯金箱へ（同じ挑戦のIDでは一度だけ） */
  creditRun(id: string, amount: number): number {
    const before = readCollection(this.readStrict(this.keys.collection));
    if (before.credited.includes(id) || before.runCredits?.includes(id)) return 0;
    const credited = Math.max(0, Math.floor(amount));
    if (!this.store) throw new Error('保存先を利用できません');
    this.store.setItem(this.keys.collection, JSON.stringify({ ...before, coins: before.coins + credited, credited: [...before.credited, id].slice(-200), runCredits: [...(before.runCredits ?? []), id] }));
    return credited;
  }

  /** 会話を開いたことを残す */
  markRecordRead(id: string): Records {
    const r = markRead(this.loadRecords(), id);
    this.write(this.keys.records, r);
    return r;
  }

  /** 保存できないブラウザでも、この起動中は同じ端末IDを使う。 */
  playerId(): string {
    if (this.player) return this.player;
    const saved = this.read<unknown>(this.keys.player);
    this.player = typeof saved === 'string' && PLAYER_ID.test(saved) ? saved.toLowerCase() : crypto.randomUUID();
    this.write(this.keys.player, this.player);
    return this.player;
  }

  private readStrict(key: string): unknown {
    if (!this.store) throw new Error('保存先を利用できません');
    const raw = this.store.getItem(key);
    return raw === null ? null : JSON.parse(raw);
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
    const saved = d && typeof d === 'object' ? d : null;
    // 案内ができる前から遊んでいる人（設定の保存がある人）には、はじめての案内を出さない
    return { ...DEFAULT_SETTINGS, ...(saved ? { introDone: true } : {}), ...(saved ?? {}) };
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
