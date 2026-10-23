import { CandidateInput, type Target } from './candidates';
import { Rng } from './rng';
import { entryDistance, TAVERN_SEATS, WALK_SPEED } from './tavernNavigation';
import {
  DAY_LENGTH, DIFFICULTIES, DISHES, INGREDIENT_ORDER, PHASES, SHOP, TRIPS,
  type Difficulty, type Dish, type IngredientId, type Trip,
} from './shopConfig';

export const LOOK_COUNT = 7;

export interface Guest {
  id: number;
  dish: Dish;
  look: number;
  wait: number;
  maxWait: number;
  state: 'walk' | 'wait' | 'eat';
  /** walk/eat の残り時間 */
  t: number;
  /** 席までの経路長から決まる入店時間。描画も同じ時間を使う。 */
  walkDuration?: number;
  /** 画像演出の配膳待ち。判定と売上は注文成立時、食事時間は受渡し後から。 */
  awaitingDelivery?: boolean;
  /** 素材が足りないと言われた演出の残り時間 */
  lack: number;
}

export type TargetData = { kind: 'order'; seat: number } | { kind: 'trip'; trip: Trip };

export type ShopEvent =
  | { type: 'key'; ok: boolean; count: number }
  | { type: 'serve'; seat: number; gain: number; combo: number }
  | { type: 'lack'; seat: number; missing: IngredientId[] }
  | { type: 'tripStart'; trip: Trip }
  | { type: 'tripEnd'; trip: Trip; gains: Partial<Record<IngredientId, number>> }
  | { type: 'arrive'; seat: number }
  | { type: 'angry'; seat: number }
  | { type: 'phase'; index: number }
  | { type: 'end' };

export interface ShopStats {
  served: number;
  angry: number;
  maxCombo: number;
  correctKeys: number;
  missKeys: number;
  trips: number;
  sales: number;
  tips: number;
}

/** 一日の営業。時間で進み、打った文字で料理を出したり調達に出たりする */
export class Shop {
  clock = 0;
  score = 0;
  combo = 0;
  stock: Record<IngredientId, number> = { ...SHOP.startStock };
  seats: (Guest | null)[] = Array.from({ length: SHOP.seats }, () => null);
  queue: Guest[] = [];
  away: Trip | null = null;
  ended = false;
  stats: ShopStats = { served: 0, angry: 0, maxCombo: 0, correctKeys: 0, missKeys: 0, trips: 0, sales: 0, tips: 0 };
  readonly input: CandidateInput<TargetData>;
  private spawnTimer = 1;
  private entryTimer = 0;
  private nextId = 1;
  private events: ShopEvent[] = [];
  private lastPhase = 0;

  constructor(private readonly rng: Rng, readonly difficulty: Difficulty = DIFFICULTIES[1]) {
    this.input = new CandidateInput(() => this.targets());
  }

  get phaseIndex(): number {
    let t = this.clock;
    for (let i = 0; i < PHASES.length; i++) {
      if (t < PHASES[i].length) return i;
      t -= PHASES[i].length;
    }
    return PHASES.length - 1;
  }

  get timeLeft() {
    return Math.max(0, DAY_LENGTH - this.clock);
  }

  get multiplier() {
    return Math.min(SHOP.comboMaxMult, 1 + Math.floor(this.combo / SHOP.comboStep) * SHOP.comboBonus);
  }

  /** 今打てる候補：注文中の客と、調達の言葉（誰も出かけていないとき） */
  targets(): Target<TargetData>[] {
    const out: Target<TargetData>[] = [];
    this.seats.forEach((g, i) => {
      if (g && g.state === 'wait') out.push({ id: `seat:${i}`, kana: g.dish.kana, data: { kind: 'order', seat: i } });
    });
    if (!this.away) for (const t of TRIPS) out.push({ id: `trip:${t.id}`, kana: t.kana, data: { kind: 'trip', trip: t } });
    return out;
  }

  canMake(dish: Dish): IngredientId[] {
    return (Object.keys(dish.need) as IngredientId[]).filter((id) => this.stock[id] < dish.need[id]!);
  }

  drainEvents(): ShopEvent[] {
    const e = this.events;
    this.events = [];
    return e;
  }

  // ---------- 入力 ----------

  key(ch: string) {
    if (this.ended) return;
    const r = this.input.key(ch);
    if (r.kind === 'miss') {
      this.stats.missKeys++;
      this.combo = 0;
      this.events.push({ type: 'key', ok: false, count: 0 });
      return;
    }
    this.stats.correctKeys++;
    this.events.push({ type: 'key', ok: true, count: this.input.typed.length || 1 });
    if (r.done.length) this.complete(r.done);
  }

  backspace() {
    this.input.backspace();
  }

  clearInput() {
    this.input.reset();
  }

  /** 同じ言葉の候補が複数あれば、待ち時間の残りが少ない客を選ぶ */
  private complete(done: Target<TargetData>[]) {
    const sorted = [...done].sort((a, b) => this.urgency(a.data) - this.urgency(b.data));
    const t = sorted[0].data;
    if (t.kind === 'trip') this.startTrip(t.trip);
    else this.serve(t.seat);
  }

  urgency(d: TargetData): number {
    return d.kind === 'order' ? this.seats[d.seat]?.wait ?? Infinity : Infinity;
  }

  private serve(seat: number) {
    const g = this.seats[seat];
    if (!g || g.state !== 'wait') return;
    const missing = this.canMake(g.dish);
    if (missing.length) {
      g.lack = 1.4;
      this.events.push({ type: 'lack', seat, missing });
      return;
    }
    for (const [id, n] of Object.entries(g.dish.need)) this.stock[id as IngredientId] -= n!;
    this.combo++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    const tip = Math.round((g.wait / g.maxWait) * SHOP.tipMax);
    const gain = Math.round((g.dish.price + tip) * this.multiplier);
    this.score += gain;
    this.stats.served++;
    this.stats.sales += g.dish.price;
    this.stats.tips += tip;
    g.state = 'eat';
    g.t = SHOP.eatTime;
    this.events.push({ type: 'serve', seat, gain, combo: this.combo });
  }

  private startTrip(trip: Trip) {
    if (this.away) return;
    this.away = trip;
    this.stats.trips++;
    this.input.reset();
    this.events.push({ type: 'tripStart', trip });
  }

  /** 調達のミニゲームが終わったら呼ぶ。最低量は必ず持ち帰る */
  returnFromTrip(gains: Partial<Record<IngredientId, number>>) {
    const trip = this.away;
    if (!trip) return;
    const final: Partial<Record<IngredientId, number>> = {};
    for (const id of trip.gives) {
      const n = Math.max(trip.minimum[id] ?? 0, Math.floor(gains[id] ?? 0));
      this.stock[id] += n;
      final[id] = n;
    }
    this.away = null;
    this.events.push({ type: 'tripEnd', trip, gains: final });
  }

  // ---------- 時間 ----------

  update(dt: number) {
    if (this.ended) return;
    this.clock += dt;
    const ph = this.phaseIndex;
    if (ph !== this.lastPhase) {
      this.lastPhase = ph;
      this.events.push({ type: 'phase', index: ph });
    }
    if (this.clock >= DAY_LENGTH) {
      this.ended = true;
      this.input.reset();
      this.events.push({ type: 'end' });
      return;
    }

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = PHASES[ph].every * this.difficulty.everyMult * this.rng.range(0.75, 1.25);
      if (this.queue.length < SHOP.queueMax) this.queue.push(this.makeGuest());
    }
    // 同じ入口へ重ねて出さず、歩幅ぶんの間隔を空けて案内する。
    this.entryTimer = Math.max(0, this.entryTimer - dt);
    if (!this.away && this.entryTimer <= 0) {
      for (let i = 0; i < this.seats.length && this.queue.length; i++) {
        if (this.seats[i]) continue;
        const g = this.queue.shift()!;
        g.state = 'walk';
        g.walkDuration = entryDistance(TAVERN_SEATS[i]) / WALK_SPEED;
        g.t = g.walkDuration;
        this.seats[i] = g;
        this.events.push({ type: 'arrive', seat: i });
        this.entryTimer = 0.45;
        break;
      }
    }

    this.seats.forEach((g, i) => {
      if (!g) return;
      g.lack = Math.max(0, g.lack - dt);
      if (g.state === 'walk') {
        g.t -= dt;
        if (g.t <= 0) g.state = 'wait';
      } else if (g.state === 'wait') {
        if (this.away) return; // 調達中は残り二人が機嫌を取るので待ち時間が止まる
        g.wait -= dt;
        if (g.wait <= 0) {
          this.seats[i] = null;
          this.stats.angry++;
          this.combo = 0;
          this.score = Math.max(0, this.score - SHOP.angryPenalty);
          this.events.push({ type: 'angry', seat: i });
        }
      } else if (g.state === 'eat') {
        if (g.awaitingDelivery) return;
        g.t -= dt;
        if (g.t <= 0) this.seats[i] = null;
      }
    });
    this.input.prune(new Set(this.targets().map((t) => t.id)));
  }

  private makeGuest(): Guest {
    const ph = this.phaseIndex;
    const menu = DISHES.filter((d) => d.from <= ph);
    // 新しく出る料理と、夜のエールを少し多めに
    const weights = menu.map((d) => (ph === 2 && d.id === 'ale' ? 3 : d.from === ph ? 2 : 1));
    let r = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    let dish = menu[0];
    for (let i = 0; i < menu.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        dish = menu[i];
        break;
      }
    }
    const maxWait = PHASES[ph].maxWait * this.difficulty.waitMult;
    return { id: this.nextId++, dish, look: this.rng.int(0, LOOK_COUNT - 1), wait: maxWait, maxWait, state: 'walk', t: 0, lack: 0 };
  }
}

export { INGREDIENT_ORDER };
