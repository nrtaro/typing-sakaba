import type { DailyBoard, RankReceipt, ScoreSubmission } from '../core/ranking';
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
    return this.request(`/api/daily/top?${params}`, board);
  }

  submit(value: ScoreSubmission): Promise<RankReceipt> {
    return this.request('/api/daily/score', receipt, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
  }
}
