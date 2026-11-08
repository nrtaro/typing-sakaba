import { decorationOrNone, readDecoration, type Decoration, type DailyBoard, type RankReceipt, type ScoreSubmission } from '../core/ranking';
import type { DifficultyId } from '../core/shopConfig';

const OFFLINE = '今はランキングにつながりません。しばらくしてからお試しください';
const positiveInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v > 0;
const nonnegative = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;
function receipt(v: RankReceipt) { return v && positiveInt(v.rank) && positiveInt(v.total) && v.rank <= v.total; }
function board(v: DailyBoard) {
  return v && Array.isArray(v.top) && v.top.length <= 5 && nonnegative(v.total) && Number.isInteger(v.total) &&
    v.top.every(s => s && positiveInt(s.rank) && typeof s.name === 'string' && nonnegative(s.score)) &&
    (v.me === null || (v.me && positiveInt(v.me.rank) && nonnegative(v.me.score)));
}

/** 上位の飾りは一覧にあるものだけ残す（すべて空なら付けない） */
function cleanBoard(v: DailyBoard): DailyBoard {
  return { ...v, top: v.top.map(({ decoration, ...s }) => {
    const d = decoration === undefined ? undefined : decorationOrNone(readDecoration(decoration));
    return d ? { ...s, decoration: d } : s;
  }) };
}

export class RankingClient {
  constructor(private fetcher: typeof fetch = (...args) => fetch(...args)) {}

  private async request<T>(path: string, valid: (value: T) => boolean, init: RequestInit = {}): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await this.fetcher(path, { ...init, signal: controller.signal, cache: 'no-store' });
      const value = await response.json() as T & { error?: string };
      if (!response.ok) throw new Error(typeof value?.error === 'string' ? value.error : OFFLINE);
      if (!valid(value)) throw new Error(OFFLINE);
      return value;
    } catch (err) {
      if (err instanceof Error && !(err instanceof TypeError) && err.name !== 'AbortError' && !(err instanceof SyntaxError)) throw err;
      throw new Error(OFFLINE);
    } finally { clearTimeout(timeout); }
  }

  top(date: string, difficulty: DifficultyId, player: string): Promise<DailyBoard> {
    const params = new URLSearchParams({ date, difficulty, player });
    return this.request(`/api/daily/top?${params}`, board).then(cleanBoard);
  }

  /** 3つの難易度の順位表をまとめて読む */
  boards(date: string, player: string): Promise<Record<DifficultyId, DailyBoard>> {
    const params = new URLSearchParams({ date, player });
    return this.request(`/api/daily/boards?${params}`, (v: Record<string, DailyBoard>) => !!v && (['easy', 'normal', 'hard'] as const).every((id) => board(v[id])))
      .then((v) => ({ easy: cleanBoard(v.easy), normal: cleanBoard(v.normal), hard: cleanBoard(v.hard) }));
  }

  /** ランキングの設定：Turnstile の公開キー（使わないときは null） */
  async config(): Promise<{ turnstile: string | null }> {
    try {
      return await this.request<{ turnstile: string | null }>('/api/daily/config', (v) => !!v && (v.turnstile === null || typeof v.turnstile === 'string'));
    } catch {
      return { turnstile: null };
    }
  }

  /** 段階C：今日のランキングの自分の記録に、今の飾り（と、渡したときは名前）を反映する（更新した件数が返る） */
  decorate(date: string, player: string, decoration: Decoration, name?: string): Promise<{ updated: number }> {
    const body = name ? { date, player, decoration, name } : { date, player, decoration };
    return this.request('/api/daily/decoration', (v: { updated: number }) => !!v && Number.isInteger(v.updated) && v.updated >= 0,
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }

  submit(value: ScoreSubmission, turnstile: string | null = null): Promise<RankReceipt> {
    const body = turnstile ? { ...value, turnstile } : value;
    return this.request('/api/daily/score', receipt, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  }
}
