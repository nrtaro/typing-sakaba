import { startingStock } from './startingStock';
import { Crew } from './crew';
import { BANQUET_MULT, BANQUET_PENALTY_MULT, BANQUET_WAIT_MULT, HIDEN_MULT, NORMAL_RULES, type DayRules } from './daily';
import { CandidateInput, type Target } from './candidates';
import { Rng } from './rng';
import { entryDistance, TAVERN_SEATS, WALK_SPEED } from './tavernNavigation';
import {
  DAY_LENGTH, DIFFICULTIES, DISHES, INGREDIENT_ORDER, PHASES, SHOP, TRIPS, dishGroup,
  type Difficulty, type Dish, type IngredientId, type Trip, type TripId,
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
  /** おかわり注文：食べ終わったあとに頼むもう1品（見えている） */
  extra?: Dish;
  /** おかわりの2品目を待っている（待たせても怒らずに帰る） */
  refill?: boolean;
  /** 予約の宴会のお客（売上が大きく、怒ると減点も大きい。品切れ札では断れない） */
  banquet?: boolean;
}

/** お題で増える言葉：品切れ札（しなぎれ）とひでんの */
export type SkillId = 'shinagire' | 'hiden';
export const SKILL_KANA: Record<SkillId, string> = { shinagire: 'しなぎれ', hiden: 'ひでんの' };

export type TargetData = { kind: 'order'; seat: number } | { kind: 'trip'; trip: Trip } | { kind: 'skill'; skill: SkillId };

type Gains = Partial<Record<IngredientId, number>>;

export type ShopEvent =
  | { type: 'key'; ok: boolean; count: number }
  | { type: 'serve'; seat: number; gain: number; combo: number; hiden?: boolean; banquet?: boolean }
  | { type: 'lack'; seat: number; missing: IngredientId[] }
  | { type: 'tripStart'; trip: Trip }
  | { type: 'tripEnd'; trip: Trip; gains: Gains; overflow: Gains; lucky: boolean; delayed?: boolean }
  /** 届くまで時間がかかる：調達した素材が届いた */
  | { type: 'delivery'; trip: Trip; gains: Gains; overflow: Gains }
  /** 素材が傷んで減った */
  | { type: 'spoil'; ing: IngredientId; n: number }
  /** 品切れ札で注文を断った */
  | { type: 'decline'; seat: number }
  /** ひでんの：次の1皿を売上2倍にする */
  | { type: 'hiden' }
  /** 予約の宴会のお客が来た */
  | { type: 'banquet'; dish: Dish }
  /** ミスで素材をこぼした */
  | { type: 'spill'; ing: IngredientId }
  /** おかわり：食べ終わったお客がもう1品たのんだ */
  | { type: 'refill'; seat: number }
  /** おかわりを待ちきれず、怒らずに帰った */
  | { type: 'leave'; seat: number }
  | { type: 'arrive'; seat: number }
  | { type: 'angry'; seat: number }
  /** ミスでコンボが切れた */
  | { type: 'comboBreak' }
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
  comboMistakes = 0;
  stock: Record<IngredientId, number>;
  seats: (Guest | null)[] = Array.from({ length: SHOP.seats }, () => null);
  queue: Guest[] = [];
  away: Trip | null = null;
  ended = false;
  stats: ShopStats = { served: 0, angry: 0, maxCombo: 0, correctKeys: 0, missKeys: 0, trips: 0, sales: 0, tips: 0 };
  readonly input: CandidateInput<TargetData>;
  /** 配膳の係。料理を出すと席へ運び、置いてからお客が食べ始める */
  readonly crew = new Crew<Guest>();
  private spawnTimer = 1;
  private entryTimer = 0;
  private nextId = 1;
  private events: ShopEvent[] = [];
  private lastPhase = 0;
  /** 調達に出た時間帯（当たりの判定に使う） */
  private awayPhase = 0;
  /** 前にこぼしてからのミスの数 */
  missSinceSpill = 0;
  /** 品切れ札・ひでんのを使った回数 */
  used: Record<SkillId, number> = { shinagire: 0, hiden: 0 };
  /** ひでんの：次に出す1皿が売上2倍 */
  hidenArmed = false;
  /** 届くまで時間がかかる：まだ届いていない素材 */
  pending: { trip: Trip; gains: Gains; at: number }[] = [];
  /** 素材が傷む：手に入れた時刻ごとのまとまり（古い順） */
  lots: { ing: IngredientId; n: number; at: number }[] = [];
  /** 予約の宴会：まだ来ていない分（来る順） */
  banquetsLeft: { at: number; dish: string }[];

  constructor(private readonly rng: Rng, readonly difficulty: Difficulty = DIFFICULTIES[1], readonly rules: DayRules = NORMAL_RULES) {
    this.stock = startingStock(this.rng);
    if (rules.storageCap !== null) for (const id of INGREDIENT_ORDER) this.stock[id] = Math.min(this.stock[id], rules.storageCap);
    if (rules.spoilAfter !== null) for (const id of INGREDIENT_ORDER) if (this.stock[id] > 0) this.lots.push({ ing: id, n: this.stock[id], at: 0 });
    this.banquetsLeft = [...rules.banquets].sort((a, b) => a.at - b.at);
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

  /** ミスしてもコンボが続く回数（ひがわりのお題で変わる） */
  get comboMissAllowance() {
    return this.rules.comboMissAllowance ?? this.difficulty.comboMissAllowance;
  }

  get comboMissesLeft() {
    return Math.max(0, this.comboMissAllowance - this.comboMistakes);
  }

  /** 1種類の素材を置ける数（狭い倉庫の日だけ制限がある） */
  get storageCap() {
    return this.rules.storageCap ?? Infinity;
  }

  /** 時間帯の当たりの調達先（その日でなければ null） */
  luckyTrip(phase = this.phaseIndex): TripId | null {
    return this.rules.luckyTrips?.[phase] ?? null;
  }

  /** 開店前の仕込み：開店時の在庫を、振り分けたとおりにする */
  applyPrep(alloc: Record<IngredientId, number>) {
    for (const id of INGREDIENT_ORDER) this.stock[id] = Math.max(0, Math.min(this.storageCap, Math.floor(alloc[id] ?? 0)));
    if (this.rules.spoilAfter !== null) {
      this.lots = INGREDIENT_ORDER.filter((id) => this.stock[id] > 0).map((id) => ({ ing: id, n: this.stock[id], at: 0 }));
    }
  }

  /** あと何回使えるか（そのお題の日でなければ 0） */
  skillLeft(skill: SkillId) {
    return Math.max(0, this.rules[skill] - this.used[skill]);
  }

  /** 今使える言葉か：品切れ札は断れる注文があるとき、ひでんのはまだ構えていないとき */
  canUseSkill(skill: SkillId) {
    if (this.skillLeft(skill) <= 0) return false;
    return skill === 'shinagire' ? this.declineSeat() !== null : !this.hidenArmed;
  }

  /** 品切れ札で断る注文：作れない注文のうち、一番待たせている客（宴会は断れない） */
  declineSeat(): number | null {
    let best: number | null = null;
    this.seats.forEach((g, i) => {
      if (!g || g.state !== 'wait' || g.banquet || !this.canMake(g.dish).length) return;
      if (best === null || g.wait < this.seats[best]!.wait) best = i;
    });
    return best;
  }

  /** 今打てる候補：注文中の客と、調達の言葉（誰も出かけていないとき）と、お題で増える言葉 */
  targets(): Target<TargetData>[] {
    const out: Target<TargetData>[] = [];
    this.seats.forEach((g, i) => {
      if (g && g.state === 'wait') out.push({ id: `seat:${i}`, kana: g.dish.kana, data: { kind: 'order', seat: i } });
    });
    if (!this.away) for (const t of TRIPS) out.push({ id: `trip:${t.id}`, kana: t.kana, data: { kind: 'trip', trip: t } });
    for (const skill of ['shinagire', 'hiden'] as const) {
      if (this.canUseSkill(skill)) out.push({ id: `skill:${skill}`, kana: SKILL_KANA[skill], data: { kind: 'skill', skill } });
    }
    return out;
  }

  /** 素材が傷む日：その素材の一番古いまとまりが傷むまでの秒数（なければ null） */
  spoilsIn(id: IngredientId): number | null {
    if (this.rules.spoilAfter === null) return null;
    const lot = this.lots.find((l) => l.ing === id && l.n > 0);
    return lot ? Math.max(0, lot.at + this.rules.spoilAfter - this.clock) : null;
  }

  /** 届くまで時間がかかる日：まだ届いていない量と、一番早く届くまでの秒数 */
  pendingFor(id: IngredientId): { n: number; in: number } | null {
    const list = this.pending.filter((p) => (p.gains[id] ?? 0) > 0);
    if (!list.length) return null;
    return { n: list.reduce((a, p) => a + (p.gains[id] ?? 0), 0), in: Math.max(0, Math.min(...list.map((p) => p.at)) - this.clock) };
  }

  /** 素材を増やす（傷む日は、手に入れた時刻を覚える） */
  private addStock(id: IngredientId, n: number) {
    if (n <= 0) return;
    this.stock[id] += n;
    if (this.rules.spoilAfter !== null) this.lots.push({ ing: id, n, at: this.clock });
  }

  /** 素材を使う（傷む日は、古いまとまりから使う） */
  private takeStock(id: IngredientId, n: number) {
    this.stock[id] -= n;
    if (this.rules.spoilAfter === null) return;
    let left = n;
    for (const lot of this.lots) {
      if (lot.ing !== id || left <= 0) continue;
      const k = Math.min(lot.n, left);
      lot.n -= k;
      left -= k;
    }
    this.lots = this.lots.filter((l) => l.n > 0);
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
      if (this.rules.spillEvery !== null && ++this.missSinceSpill >= this.rules.spillEvery) {
        this.missSinceSpill = 0;
        this.spill();
      }
      if (this.combo > 0 && ++this.comboMistakes > this.comboMissAllowance) {
        this.combo = 0;
        this.comboMistakes = 0;
        this.events.push({ type: 'comboBreak' });
      }
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
    else if (t.kind === 'skill') this.useSkill(t.skill);
    else this.serve(t.seat);
  }

  private useSkill(skill: SkillId) {
    if (!this.canUseSkill(skill)) return;
    this.used[skill]++;
    if (skill === 'hiden') {
      this.hidenArmed = true;
      this.events.push({ type: 'hiden' });
      return;
    }
    // 品切れ札：作れない注文を、怒らせずに断る（コンボも切れない）
    const seat = this.declineSeat()!;
    this.seats[seat] = null;
    this.events.push({ type: 'decline', seat });
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
    for (const [id, n] of Object.entries(g.dish.need)) this.takeStock(id as IngredientId, n!);
    this.combo++;
    this.comboMistakes = 0;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, this.combo);
    const tip = Math.round((g.wait / g.maxWait) * SHOP.tipMax);
    const hiden = this.hidenArmed;
    this.hidenArmed = false;
    const gain = Math.round((g.dish.price + tip) * this.multiplier * (hiden ? HIDEN_MULT : 1) * (g.banquet ? BANQUET_MULT : 1));
    this.score += gain;
    this.stats.served++;
    this.stats.sales += g.dish.price;
    this.stats.tips += tip;
    g.state = 'eat';
    g.t = SHOP.eatTime;
    this.crew.assign(seat, g, this.away?.who);
    this.events.push({ type: 'serve', seat, gain, combo: this.combo, hiden, banquet: !!g.banquet });
  }

  /** ミスで素材をこぼす：打っている料理の素材から。打っていなければ一番多い素材から */
  private spill() {
    const dishes = this.input.active
      .map((l) => l.target.data)
      .filter((d): d is { kind: 'order'; seat: number } => d.kind === 'order')
      .map((d) => this.seats[d.seat]?.dish)
      .filter((d): d is Dish => !!d);
    const fromDish = dishes.flatMap((d) => Object.keys(d.need) as IngredientId[]).find((id) => this.stock[id] > 0);
    const most = [...INGREDIENT_ORDER].sort((a, b) => this.stock[b] - this.stock[a])[0];
    const ing = fromDish ?? (this.stock[most] > 0 ? most : null);
    if (!ing) return;
    this.takeStock(ing, 1);
    this.events.push({ type: 'spill', ing });
  }

  private startTrip(trip: Trip) {
    if (this.away) return;
    this.away = trip;
    this.awayPhase = this.phaseIndex;
    this.crew.leave(trip.who);
    this.stats.trips++;
    this.input.reset();
    this.events.push({ type: 'tripStart', trip });
  }

  /** 途中帰還は獲得済みのみ。時間満了時は最低量を保証する。 */
  returnFromTrip(gains: Partial<Record<IngredientId, number>>, earlyReturn = false) {
    const trip = this.away;
    if (!trip) return;
    const amounts: Gains = {};
    // 時間帯の当たり：出かけた時間帯の当たりなら多く、それ以外は少なく持ち帰る
    const lucky = this.luckyTrip(this.awayPhase) === trip.id;
    const mult = this.rules.luckyTrips ? (lucky ? this.rules.luckyMult : this.rules.unluckyMult) : 1;
    for (const id of trip.gives) {
      const got = Math.max(earlyReturn ? 0 : trip.minimum[id] ?? 0, Math.floor(gains[id] ?? 0));
      amounts[id] = mult === 1 ? got : Math.max(earlyReturn ? 0 : 1, Math.round(got * mult));
    }
    this.away = null;
    // 届くまで時間がかかる日は、あとで届く
    if (this.rules.deliveryDelay > 0) {
      this.pending.push({ trip, gains: amounts, at: this.clock + this.rules.deliveryDelay });
      this.events.push({ type: 'tripEnd', trip, gains: amounts, overflow: {}, lucky, delayed: true });
      return;
    }
    const { final, overflow } = this.receive(trip, amounts);
    this.events.push({ type: 'tripEnd', trip, gains: final, overflow, lucky });
  }

  /** 素材を倉庫に入れる。狭い倉庫の日は、置ききれない分は持ち帰れない */
  private receive(trip: Trip, amounts: Gains) {
    const final: Gains = {};
    const overflow: Gains = {};
    for (const id of trip.gives) {
      let n = amounts[id] ?? 0;
      const room = Math.max(0, this.storageCap - this.stock[id]);
      if (n > room) {
        overflow[id] = n - room;
        n = room;
      }
      this.addStock(id, n);
      final[id] = n;
    }
    return { final, overflow };
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

    // 届くまで時間がかかる：届く時刻になった素材を入れる
    if (this.pending.length) {
      const due = this.pending.filter((p) => p.at <= this.clock);
      this.pending = this.pending.filter((p) => p.at > this.clock);
      for (const p of due) {
        const { final, overflow } = this.receive(p.trip, p.gains);
        this.events.push({ type: 'delivery', trip: p.trip, gains: final, overflow });
      }
    }
    // 素材が傷む：手に入れてから時間がたったまとまりを捨てる
    if (this.rules.spoilAfter !== null && this.lots.length) {
      const limit = this.clock - this.rules.spoilAfter;
      const lost: Gains = {};
      for (const lot of this.lots) {
        if (lot.at > limit) continue;
        const k = Math.min(lot.n, this.stock[lot.ing]);
        this.stock[lot.ing] -= k;
        lot.n = 0;
        if (k > 0) lost[lot.ing] = (lost[lot.ing] ?? 0) + k;
      }
      this.lots = this.lots.filter((l) => l.n > 0);
      for (const [ing, n] of Object.entries(lost)) this.events.push({ type: 'spoil', ing: ing as IngredientId, n: n! });
    }
    // 予約の宴会：時刻になったら、列の先頭に案内する
    while (this.banquetsLeft.length && this.banquetsLeft[0].at <= this.clock) {
      const b = this.banquetsLeft.shift()!;
      const dish = DISHES.find((d) => d.id === b.dish) ?? DISHES[DISHES.length - 1];
      const maxWait = PHASES[ph].maxWait * this.difficulty.waitMult * BANQUET_WAIT_MULT;
      this.queue.unshift({ id: this.nextId++, dish, look: this.nextId % LOOK_COUNT, wait: maxWait, maxWait, state: 'walk', t: 0, lack: 0, banquet: true });
      this.events.push({ type: 'banquet', dish });
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
        // 調達中は残り二人が機嫌を取るので待ち時間が止まる（お題によっては減り続ける）
        if (this.away && !this.rules.awayWaitRate) return;
        g.wait -= this.away ? dt * this.rules.awayWaitRate : dt;
        if (g.wait <= 0 && g.refill) {
          // おかわりの2品目は、待たせても怒らずに帰る
          this.seats[i] = null;
          this.events.push({ type: 'leave', seat: i });
        } else if (g.wait <= 0) {
          this.seats[i] = null;
          this.stats.angry++;
          this.combo = 0;
          this.comboMistakes = 0;
          this.score = Math.max(0, this.score - SHOP.angryPenalty * this.rules.angryPenaltyMult * (g.banquet ? BANQUET_PENALTY_MULT : 1));
          this.events.push({ type: 'angry', seat: i });
        }
      } else if (g.state === 'eat') {
        if (g.awaitingDelivery) return;
        g.t -= dt;
        if (g.t <= 0 && g.extra && !this.ended) {
          // おかわり：食べ終わったら、見せていたもう1品をたのむ
          g.dish = g.extra;
          g.extra = undefined;
          g.refill = true;
          g.state = 'wait';
          g.wait = g.maxWait;
          g.lack = 0;
          this.events.push({ type: 'refill', seat: i });
        } else if (g.t <= 0) this.seats[i] = null;
      }
    });
    this.crew.update(dt, this.seats.filter((g) => g !== null).length, this.away?.who);
    // 打っている途中のときだけ、消えた候補を外す（毎刻み候補を作り直さない）
    if (this.input.active.length) this.input.prune(new Set(this.targets().map((t) => t.id)));
  }

  private makeGuest(): Guest {
    const ph = this.phaseIndex;
    // 今テーブルにある注文・並んでいる客と同じ料理は出さない（全部出ている時だけ重複を許す）
    const taken = new Set([...this.seats, ...this.queue].filter((g): g is Guest => !!g).map((g) => g.dish.id));
    const dish = this.pickDish(taken);
    const maxWait = PHASES[ph].maxWait * this.difficulty.waitMult;
    const guest: Guest = { id: this.nextId++, dish, look: this.rng.int(0, LOOK_COUNT - 1), wait: maxWait, maxWait, state: 'walk', t: 0, lack: 0 };
    // おかわり注文の日だけ乱数を使う（通常営業のお客の並びは変えない）
    if (this.rules.refillChance > 0 && this.rng.next() < this.rules.refillChance) guest.extra = this.pickDish(new Set([...taken, dish.id]));
    return guest;
  }

  private pickDish(taken: Set<string>): Dish {
    const ph = this.phaseIndex;
    const open = DISHES.filter((d) => d.from <= ph && !taken.has(d.id));
    const menu = open.length ? open : DISHES.filter((d) => d.from <= ph);
    // 新しく出る料理と、夜のエールを少し多めに
    // 出やすさはレシピ（仲間）ごとに決め、同じレシピの料理で等分する
    const size = new Map<string, number>();
    for (const d of menu) size.set(dishGroup(d), (size.get(dishGroup(d)) ?? 0) + 1);
    const weights = menu.map((d) => (ph === 2 && dishGroup(d) === 'ale' ? 3 : d.from === ph ? 2 : 1) / size.get(dishGroup(d))!);
    let r = this.rng.next() * weights.reduce((a, b) => a + b, 0);
    let dish = menu[0];
    for (let i = 0; i < menu.length; i++) {
      r -= weights[i];
      if (r <= 0) {
        dish = menu[i];
        break;
      }
    }
    return dish;
  }
}

export { INGREDIENT_ORDER };
