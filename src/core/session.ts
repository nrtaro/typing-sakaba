// 1回の営業を、1/60秒刻みで進める。キー入力は「何刻み目に何を押したか」を記録する。
// 同じ種・同じルール・同じ記録なら、サーバーでもまったく同じ営業を再現でき、成績を確かめられる。
// 画面・音は扱わない（出来事を events で渡す）。

import { Shop, type ShopEvent } from './shop';
import { createMinigame, type Minigame } from './minigames';
import { Rng } from './rng';
import { DAY_LENGTH, INGREDIENT_ORDER, MINIGAME_SECONDS, SHOP, type Difficulty, type IngredientId } from './shopConfig';
import type { DayRules } from './daily';

/** 1刻みの長さ（秒） */
export const TICK = 1 / 60;

export interface SessionTrip {
  game: Minigame<unknown>;
  phase: 'intro' | 'game' | 'outro';
  t: number;
  earlyReturn?: boolean;
}

export type SessionEvent =
  | { src: 'shop'; ev: ShopEvent }
  | { src: 'trip'; ev: ReturnType<Minigame<unknown>['drainEvents']>[number] }
  /** 調達の画面が始まった／帰る演出が始まった／店に戻った */
  | { src: 'session'; type: 'tripGame' | 'tripReturn' | 'tripBack' };

/** 記録に使う文字：小文字と「-」はそのまま、Backspace=B、スペース=S、Enter=E */
const CODE: Record<string, string> = { Backspace: 'B', ' ': 'S', Enter: 'E' };
const FROM_CODE: Record<string, string> = { B: 'Backspace', S: ' ', E: 'Enter' };
const TYPABLE = /^[a-z-]$/;

export class PlaySession {
  readonly shop: Shop;
  trip: SessionTrip | null = null;
  /** 進めた刻みの数（営業時間の合計＝ticks×TICK） */
  ticks = 0;
  finished = false;
  private events: SessionEvent[] = [];
  private log: string[] = [];
  private lastLogged = 0;

  constructor(readonly seed: number, difficulty: Difficulty, readonly rules: DayRules, prep: Record<IngredientId, number> | null = null) {
    this.shop = new Shop(new Rng(seed), difficulty, rules);
    if (rules.prepBudget > 0 && prep) this.shop.applyPrep(prep);
  }

  /** 営業した時間（秒）。一時停止・読み込み待ちは含まない */
  get elapsed() {
    return this.ticks * TICK;
  }

  /** 入力の記録（数字＝前の入力からの刻み数、続く1文字＝押したキー） */
  get record() {
    return this.log.join('');
  }

  /** キーを1つ押す。受け付けたら true（記録にも残す） */
  input(key: string): boolean {
    if (this.finished) return false;
    if (key === 'Enter') {
      if (this.trip?.phase !== 'game') return false;
      this.endTrip(true);
      this.note(key);
      return true;
    }
    const target = this.trip?.phase === 'game' ? this.trip.game : this.trip ? null : this.shop;
    if (!target) return false;
    if (key === 'Backspace') target.input.backspace();
    else if (key === ' ') target.input.reset();
    else if (TYPABLE.test(key)) target.key(key);
    else return false;
    this.note(key);
    this.pump();
    return true;
  }

  private note(key: string) {
    this.log.push(`${this.ticks - this.lastLogged}${CODE[key] ?? key}`);
    this.lastLogged = this.ticks;
  }

  /** 1刻み進める */
  tick() {
    if (this.finished) return;
    const trip = this.trip;
    const shopDt = trip?.phase === 'game' ? TICK * MINIGAME_SECONDS / trip.game.duration : TICK;
    this.shop.update(shopDt);
    if (this.trip) this.stepTrip(TICK);
    this.ticks++;
    this.pump();
  }

  /** 調達の画面を始める前に、背景の読み込みを待つ必要があるか（待つ間は tick しない） */
  get introDone() {
    return this.trip?.phase === 'intro' && this.trip.t <= 0;
  }

  drain(): SessionEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  private endTrip(earlyReturn: boolean) {
    const trip = this.trip;
    if (!trip || trip.phase !== 'game') return;
    trip.earlyReturn = earlyReturn && !trip.game.finished;
    trip.phase = 'outro';
    trip.t = SHOP.tripIntro;
    this.events.push({ src: 'session', type: 'tripReturn' });
  }

  private stepTrip(dt: number) {
    const trip = this.trip!;
    trip.t -= dt;
    if (trip.phase === 'intro' && trip.t <= 0) {
      trip.phase = 'game';
      this.events.push({ src: 'session', type: 'tripGame' });
    } else if (trip.phase === 'game') {
      trip.game.update(dt);
      if (trip.game.finished) this.endTrip(false);
    } else if (trip.phase === 'outro' && trip.t <= 0) {
      const r = trip.game.result();
      this.shop.stats.correctKeys += r.correctKeys;
      this.shop.stats.missKeys += r.missKeys;
      this.shop.returnFromTrip(r.gains, trip.earlyReturn);
      this.trip = null;
      this.events.push({ src: 'session', type: 'tripBack' });
    }
  }

  /** 店と調達の出来事を集める。調達に出たら調達を作り、閉店したら締める */
  private pump() {
    for (const ev of this.shop.drainEvents()) {
      if (ev.type === 'tripStart') {
        this.trip = { game: createMinigame(ev.trip.id, new Rng(this.seed + this.shop.stats.trips * 7919), this.shop.difficulty), phase: 'intro', t: SHOP.tripIntro };
      }
      if (ev.type === 'end') this.close();
      this.events.push({ src: 'shop', ev });
    }
    if (this.trip?.phase === 'game') for (const ev of this.trip.game.drainEvents()) this.events.push({ src: 'trip', ev });
  }

  /** 閉店：調達中に閉店しても、持ち帰った分の打鍵は記録に残す */
  private close() {
    if (this.finished) return;
    this.finished = true;
    if (this.trip) {
      const r = this.trip.game.result();
      this.shop.stats.correctKeys += r.correctKeys;
      this.shop.stats.missKeys += r.missKeys;
      this.trip = null;
    }
  }

  /** 成績（画面の結果と、サーバーで確かめる値は同じ計算） */
  summary() {
    const s = this.shop.stats;
    const total = s.correctKeys + s.missKeys;
    return {
      score: this.shop.score, served: s.served, maxCombo: s.maxCombo, angry: s.angry, trips: s.trips,
      kps: this.elapsed > 0 ? s.correctKeys / this.elapsed : 0, accuracy: total ? s.correctKeys / total : 1,
    };
  }
}

export type ReplayResult = { ok: true; summary: ReturnType<PlaySession['summary']>; ticks: number } | { ok: false; error: string };

/** 記録を読み取る（数字＋1文字の並び） */
export function parseRecord(record: string): { gap: number; key: string }[] | null {
  const out: { gap: number; key: string }[] = [];
  const re = /(\d{1,6})([a-z\-BSE])/gy;
  let m: RegExpExecArray | null;
  let pos = 0;
  while ((m = re.exec(record))) {
    out.push({ gap: Number(m[1]), key: FROM_CODE[m[2]] ?? m[2] });
    pos = re.lastIndex;
  }
  return pos === record.length ? out : null;
}

/** 刻みの上限：調達中は店の時計がゆっくり進むので、営業時間の数倍まで許す */
export const MAX_TICKS = Math.ceil((DAY_LENGTH * 4) / TICK);

/** 記録どおりに営業をやり直す。サーバーで成績を確かめるのに使う */
export function replay(seed: number, difficulty: Difficulty, rules: DayRules, prep: Record<IngredientId, number> | null, record: string): ReplayResult {
  const inputs = parseRecord(record);
  if (!inputs) return { ok: false, error: '記録を読み取れませんでした' };
  const s = new PlaySession(seed, difficulty, rules, prep);
  for (const { gap, key } of inputs) {
    for (let i = 0; i < gap; i++) {
      if (s.finished || s.ticks >= MAX_TICKS) return { ok: false, error: '記録が営業時間を超えています' };
      s.tick();
      s.drain();
    }
    if (s.finished) return { ok: false, error: '記録が営業時間を超えています' };
    s.input(key);
    s.drain();
  }
  while (!s.finished && s.ticks < MAX_TICKS) {
    s.tick();
    s.drain();
  }
  if (!s.finished) return { ok: false, error: '営業が終わりませんでした' };
  return { ok: true, summary: s.summary(), ticks: s.ticks };
}

/** 仕込みの振り分けが正しいか（合計が数以内、1種類の上限以内） */
export function validPrep(prep: Record<IngredientId, number> | null, budget: number, cap: number) {
  if (budget <= 0) return prep === null;
  if (!prep) return false;
  let sum = 0;
  for (const id of INGREDIENT_ORDER) {
    const n = prep[id];
    if (!Number.isInteger(n) || n < 0 || n > cap) return false;
    sum += n;
  }
  return sum <= budget;
}
