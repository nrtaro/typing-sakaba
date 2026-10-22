import {
  BUSINESS, EFFECTS, INGREDIENTS, QUALITY_PRICE, RECIPES, RECIPE_ORDER, RUN, SCORE, TRENDS, TREND_ORDER, UPGRADES,
  UPGRADE_ORDER,
  type ActivityKind, type IngredientId, type Quality, type QualityCounts, type RecipeId, type TrendId, type UpgradeId,
} from './config';
import { accuracy, speedKps, type ActivityResult } from './activity';
import { subRng } from './rng';

export interface HaulRecord {
  day: number;
  kind: ActivityKind;
  result: ActivityResult;
}

export interface SaleLine {
  recipe: RecipeId;
  quality: Quality;
  count: number;
  revenue: number;
}

export interface NightReport {
  day: number;
  trend: TrendId;
  visitors: number;
  capacity: number;
  seated: number;
  served: number;
  turnedAway: number;
  noFood: number;
  sales: SaleLine[];
  revenue: number;
  /** 全部★1だった場合と比べて品質で増えた売上 */
  qualityBonus: number;
  repBefore: number;
  repAfter: number;
  leftoverDishes: number;
  menuKinds: number;
  trendMatched: boolean;
  notes: string[];
}

export interface PendingActivity {
  kind: ActivityKind;
  token: number;
}

export interface GameState {
  version: 1;
  seed: number;
  /** 状態が変わるたびに増える。UIからの二重操作を防ぐのに使う */
  rev: number;
  day: number;
  actionsLeft: number;
  phase: 'day' | 'ended';
  cash: number;
  reputation: number;
  levels: Record<UpgradeId, number>;
  spentOnUpgrades: number;
  ingredients: Record<IngredientId, QualityCounts>;
  dishes: Record<RecipeId, QualityCounts>;
  cookedToday: number;
  menu: RecipeId[];
  trend: TrendId;
  pending: PendingActivity | null;
  nextToken: number;
  hauls: HaulRecord[];
  nights: NightReport[];
  totalSales: number;
  /** 再開時に調達をやり直した回数（参考表示） */
  restartedActivities: number;
}

const ING_IDS = Object.keys(INGREDIENTS) as IngredientId[];

function zeros(): QualityCounts {
  return [0, 0, 0];
}

export function trendForDay(seed: number, day: number): TrendId {
  const rng = subRng(seed, 101, day);
  // 初日は穏やかに。最終日は大部隊が来やすい。
  if (day === 1) return rng.pick<TrendId>(['fish', 'meat']);
  if (day === RUN.days && rng.next() < 0.5) return 'crowd';
  return rng.pick(TREND_ORDER);
}

export function newGame(seed: number): GameState {
  const ingredients = Object.fromEntries(ING_IDS.map((id) => [id, zeros()])) as Record<IngredientId, QualityCounts>;
  for (const [id, counts] of Object.entries(RUN.startIngredients)) {
    ingredients[id as IngredientId] = [...counts!] as QualityCounts;
  }
  return {
    version: 1,
    seed,
    rev: 0,
    day: 1,
    actionsLeft: RUN.actionsPerDay,
    phase: 'day',
    cash: RUN.startCash,
    reputation: RUN.startReputation,
    levels: { seats: 0, kitchen: 0, sign: 0 },
    spentOnUpgrades: 0,
    ingredients,
    dishes: Object.fromEntries(RECIPE_ORDER.map((id) => [id, zeros()])) as Record<RecipeId, QualityCounts>,
    cookedToday: 0,
    menu: [],
    trend: trendForDay(seed, 1),
    pending: null,
    nextToken: 1,
    hauls: [],
    nights: [],
    totalSales: 0,
    restartedActivities: 0,
  };
}

// ---------- 参照用の計算 ----------

export const sum = (q: QualityCounts) => q[0] + q[1] + q[2];

export function kitchenCap(s: GameState) {
  return EFFECTS.kitchenPerDay[s.levels.kitchen];
}
export function kitchenLeft(s: GameState) {
  return Math.max(0, kitchenCap(s) - s.cookedToday);
}
export function capacity(s: GameState) {
  return EFFECTS.seats[s.levels.seats] * EFFECTS.turnsPerNight;
}
export function menuSlots(s: GameState) {
  return EFFECTS.menuSlots[s.levels.sign];
}
export function nightsLeft(s: GameState) {
  return s.phase === 'ended' ? 0 : RUN.days - s.day + 1;
}
export function upgradeCost(s: GameState, id: UpgradeId): number | null {
  const lv = s.levels[id];
  return lv < UPGRADES[id].costs.length ? UPGRADES[id].costs[lv] : null;
}

/** 作れる数（材料と厨房の残り能力の両方で制限） */
export function cookableCount(s: GameState, id: RecipeId): number {
  let n = kitchenLeft(s);
  for (const [ing, need] of Object.entries(RECIPES[id].needs)) {
    n = Math.min(n, Math.floor(sum(s.ingredients[ing as IngredientId]) / need!));
  }
  return Math.max(0, n);
}

export function menuDishCount(s: GameState) {
  return s.menu.reduce((a, id) => a + sum(s.dishes[id]), 0);
}

// ---------- 操作（失敗時は false を返し、状態を変えない） ----------

function touch(s: GameState) {
  s.rev++;
}

export function startActivity(s: GameState, kind: ActivityKind, rev: number): number | null {
  if (s.rev !== rev || s.phase !== 'day' || s.pending || s.actionsLeft <= 0) return null;
  s.actionsLeft--;
  const token = s.nextToken++;
  s.pending = { kind, token };
  touch(s);
  return token;
}

/** 調達の結果を反映する。同じ token で2回呼んでも1回分しか反映しない。 */
export function completeActivity(s: GameState, token: number, result: ActivityResult): boolean {
  if (!s.pending || s.pending.token !== token || s.pending.kind !== result.kind) return false;
  for (const c of result.catches) {
    s.ingredients[c.ingredient][c.quality] += c.count;
  }
  s.hauls.push({ day: s.day, kind: result.kind, result });
  s.pending = null;
  touch(s);
  return true;
}

/** 材料を使い、最も品質の高い材料から消費する。料理の品質は材料の平均（四捨五入）。 */
export function cook(s: GameState, id: RecipeId, count: number): number {
  if (s.phase !== 'day' || s.pending) return 0;
  const n = Math.min(Math.floor(count), cookableCount(s, id));
  if (n <= 0) return 0;
  for (let i = 0; i < n; i++) {
    let qSum = 0;
    let qN = 0;
    for (const [ing, need] of Object.entries(RECIPES[id].needs)) {
      const stock = s.ingredients[ing as IngredientId];
      for (let k = 0; k < need!; k++) {
        const q = stock[2] > 0 ? 2 : stock[1] > 0 ? 1 : 0;
        stock[q]--;
        qSum += q;
        qN++;
      }
    }
    const dishQ = Math.round(qSum / qN) as Quality;
    s.dishes[id][dishQ]++;
    s.cookedToday++;
  }
  if (!s.menu.includes(id) && s.menu.length < menuSlots(s)) s.menu.push(id);
  touch(s);
  return n;
}

export function toggleMenu(s: GameState, id: RecipeId): boolean {
  if (s.phase !== 'day') return false;
  if (s.menu.includes(id)) {
    s.menu = s.menu.filter((m) => m !== id);
  } else {
    if (s.menu.length >= menuSlots(s)) return false;
    s.menu = [...s.menu, id];
  }
  touch(s);
  return true;
}

export function buyUpgrade(s: GameState, id: UpgradeId, rev: number): boolean {
  if (s.rev !== rev || s.phase !== 'day') return false;
  const cost = upgradeCost(s, id);
  if (cost === null || s.cash < cost) return false;
  s.cash -= cost;
  s.spentOnUpgrades += cost;
  s.levels[id]++;
  touch(s);
  return true;
}

// ---------- 営業 ----------

export function visitorsFor(s: GameState, noise: number): number {
  const trend = TRENDS[s.trend];
  const repMult = BUSINESS.repMin + (BUSINESS.repMax - BUSINESS.repMin) * (s.reputation / BUSINESS.maxReputation);
  const stocked = s.menu.filter((id) => sum(s.dishes[id]) > 0);
  const kinds = stocked.length;
  if (kinds === 0) return 0;
  const variety = 1 + BUSINESS.varietyBonus * (kinds - 1);
  let trendMult = trend.visitorMult;
  if (trend.tagBoost && !stocked.some((id) => RECIPES[id].tags.includes(trend.tagBoost!))) trendMult = 1;
  const sign = EFFECTS.signAttract[s.levels.sign];
  return Math.max(0, Math.round(BUSINESS.baseVisitors * repMult * variety * trendMult * sign * noise));
}

/** 夜の営業を行い、翌日へ進める。rev が古ければ何もしない。 */
export function openTavern(s: GameState, rev: number): NightReport | null {
  if (s.rev !== rev || s.phase !== 'day' || s.pending) return null;
  const rng = subRng(s.seed, 202, s.day);
  const noise = 1 + (rng.next() * 2 - 1) * BUSINESS.noise;
  const trend = TRENDS[s.trend];
  const menuKinds = s.menu.filter((id) => sum(s.dishes[id]) > 0).length;
  const visitors = visitorsFor(s, noise);
  const cap = capacity(s);
  const seated = Math.min(visitors, cap);
  const repBefore = s.reputation;

  // 注文: 客は流行に合う料理、次に価格の高い料理から選ぶ
  const offers: { recipe: RecipeId; quality: Quality; appeal: number }[] = [];
  for (const id of s.menu) {
    for (const q of [2, 1, 0] as Quality[]) {
      if (s.dishes[id][q] <= 0) continue;
      const boost = trend.tagBoost && RECIPES[id].tags.includes(trend.tagBoost) ? 1000 : 0;
      offers.push({ recipe: id, quality: q, appeal: boost + RECIPES[id].price * QUALITY_PRICE[q] });
    }
  }
  offers.sort((a, b) => b.appeal - a.appeal);

  const salesMap = new Map<string, SaleLine>();
  let served = 0;
  let revenue = 0;
  let baseRevenue = 0;
  let repDelta = 0;
  let trendSold = 0;
  for (const o of offers) {
    while (served < seated && s.dishes[o.recipe][o.quality] > 0) {
      s.dishes[o.recipe][o.quality]--;
      served++;
      const price = Math.round(RECIPES[o.recipe].price * QUALITY_PRICE[o.quality]);
      revenue += price;
      baseRevenue += RECIPES[o.recipe].price;
      repDelta += BUSINESS.repPerServed[o.quality];
      if (trend.tagBoost && RECIPES[o.recipe].tags.includes(trend.tagBoost)) trendSold++;
      const key = `${o.recipe}:${o.quality}`;
      const line = salesMap.get(key) ?? { recipe: o.recipe, quality: o.quality, count: 0, revenue: 0 };
      line.count++;
      line.revenue += price;
      salesMap.set(key, line);
    }
  }
  const turnedAway = visitors - seated;
  const noFood = seated - served;
  repDelta += turnedAway * BUSINESS.repPerTurnedAway + noFood * BUSINESS.repPerNoFood;
  s.reputation = clamp(Math.round((s.reputation + repDelta) * 10) / 10, 0, BUSINESS.maxReputation);
  s.cash += revenue;
  s.totalSales += revenue;

  const leftoverDishes = RECIPE_ORDER.reduce((a, id) => a + sum(s.dishes[id]), 0);
  const report: NightReport = {
    day: s.day,
    trend: s.trend,
    visitors,
    capacity: cap,
    seated,
    served,
    turnedAway,
    noFood,
    sales: [...salesMap.values()],
    revenue,
    qualityBonus: revenue - baseRevenue,
    repBefore,
    repAfter: s.reputation,
    leftoverDishes,
    menuKinds,
    trendMatched: trendSold > 0,
    notes: [],
  };
  report.notes = explainNight(report, s);
  s.nights.push(report);

  // 翌日へ
  if (s.day >= RUN.days) {
    s.phase = 'ended';
    s.actionsLeft = 0;
  } else {
    s.day++;
    s.actionsLeft = RUN.actionsPerDay;
    s.cookedToday = 0;
    s.trend = trendForDay(s.seed, s.day);
  }
  touch(s);
  return report;
}

function explainNight(r: NightReport, s: GameState): string[] {
  const notes: string[] = [];
  if (r.visitors === 0) {
    notes.push('メニューに料理が無く、店を開けられなかった。料理を作ってメニューに載せよう。');
    return notes;
  }
  if (r.trendMatched && TRENDS[r.trend].tagBoost) notes.push(`噂どおり「${TRENDS[r.trend].name}」で客が増えた。`);
  else if (TRENDS[r.trend].tagBoost) notes.push(`「${TRENDS[r.trend].name}」だったが、合う料理が無く客を増やせなかった。`);
  if (r.turnedAway > 0) notes.push(`席が足りず ${r.turnedAway}人を帰してしまった。客席を増やせば売上が伸びそう。`);
  if (r.noFood > 0) notes.push(`料理が足りず ${r.noFood}人が注文できなかった。材料集めか厨房の強化を。`);
  if (r.qualityBonus > 0) notes.push(`品質の良い料理のおかげで +${r.qualityBonus}Cr 多く稼げた。`);
  if (r.turnedAway === 0 && r.noFood === 0 && r.leftoverDishes > 0) {
    notes.push(`料理が ${r.leftoverDishes}皿余った（明日に持ち越し）。看板で客を呼べばもっと売れる。`);
  }
  if (r.menuKinds === 1) notes.push('メニューが1品だけだった。品数が多いほど客が集まる。');
  if (menuSlots(s) > r.menuKinds && r.menuKinds > 0 && r.noFood === 0 && r.turnedAway === 0 && notes.length < 2) {
    notes.push('メニューの空き枠がある。違う料理を加えると客が増える。');
  }
  if (r.repAfter > r.repBefore) notes.push(`評判が ${fmt1(r.repBefore)} → ${fmt1(r.repAfter)} に上がった。`);
  else if (r.repAfter < r.repBefore) notes.push(`評判が ${fmt1(r.repBefore)} → ${fmt1(r.repAfter)} に下がった。`);
  return notes;
}

const fmt1 = (n: number) => (Math.round(n * 10) / 10).toFixed(1);

function clamp(v: number, lo: number, hi: number) {
  return Math.min(hi, Math.max(lo, v));
}

// ---------- スコア ----------

export interface ScoreBreakdown {
  cash: number;
  upgradeValue: number;
  reputationBonus: number;
  total: number;
  rank: string;
  rankTitle: string;
}

export function computeScore(s: GameState): ScoreBreakdown {
  const upgradeValue = Math.round(s.spentOnUpgrades * SCORE.upgradeValueRate);
  const reputationBonus = Math.round(s.reputation * SCORE.perReputation);
  const total = s.cash + upgradeValue + reputationBonus;
  const rank = SCORE.ranks.find((r) => total >= r.min) ?? SCORE.ranks[SCORE.ranks.length - 1];
  return { cash: s.cash, upgradeValue, reputationBonus, total, rank: rank.name, rankTitle: rank.title };
}

export interface TypingSummary {
  correctKeys: number;
  missKeys: number;
  activeSeconds: number;
  kps: number;
  accuracy: number;
}

export function typingSummary(hauls: HaulRecord[], kind?: ActivityKind): TypingSummary & { count: number } {
  const list = kind ? hauls.filter((h) => h.kind === kind) : hauls;
  const t = list.reduce(
    (a, h) => ({
      correctKeys: a.correctKeys + h.result.correctKeys,
      missKeys: a.missKeys + h.result.missKeys,
      activeSeconds: a.activeSeconds + h.result.activeSeconds,
    }),
    { correctKeys: 0, missKeys: 0, activeSeconds: 0 },
  );
  return { ...t, kps: speedKps(t), accuracy: accuracy(t), count: list.length };
}

/** 結果画面の「うまくいった点」「次に改善できる点」 */
export function reflections(s: GameState): { good: string[]; improve: string[] } {
  const good: string[] = [];
  const improve: string[] = [];
  const typing = typingSummary(s.hauls);
  const fishing = typingSummary(s.hauls, 'fishing');
  const hunting = typingSummary(s.hauls, 'hunting');
  const turned = s.nights.reduce((a, n) => a + n.turnedAway, 0);
  const noFood = s.nights.reduce((a, n) => a + n.noFood, 0);
  const qBonus = s.nights.reduce((a, n) => a + n.qualityBonus, 0);
  const leftoverIng = ING_IDS.reduce((a, id) => a + sum(s.ingredients[id]), 0);
  const leftoverDish = RECIPE_ORDER.reduce((a, id) => a + sum(s.dishes[id]), 0);
  const trendHits = s.nights.filter((n) => n.trendMatched).length;
  const bigCatches = s.hauls.reduce(
    (a, h) => a + h.result.catches.filter((c) => c.ingredient === 'bigFish' || c.ingredient === 'bigMeat').length,
    0,
  );

  if (typing.accuracy >= 0.95) good.push(`正確さ ${(typing.accuracy * 100).toFixed(1)}%。高品質の食材を多く集められた。`);
  if (qBonus > 0) good.push(`品質の良い料理で合計 +${qBonus}Cr を上乗せできた。`);
  if (bigCatches >= 3) good.push(`大物を ${bigCatches}回仕留めた。`);
  if (trendHits >= 3) good.push(`噂に合わせた料理を ${trendHits}晩出せた。`);
  if (fishing.count > 0 && hunting.count > 0) good.push('釣りと狩りを使い分けて、盛り合わせ料理の材料をそろえられた。');
  if (s.spentOnUpgrades > 0) good.push(`設備に ${s.spentOnUpgrades}Cr 投資して店を広げた。`);

  if (typing.accuracy < 0.9) improve.push('ミスを減らすと食材の品質が上がり、釣りでは大物も掛かりやすくなる。');
  if (turned > 0) improve.push(`席が足りず合計 ${turned}人を帰した。客席を早めに増やすと良い。`);
  if (noFood > 0) improve.push(`料理切れで合計 ${noFood}人が注文できなかった。材料と厨房の能力を見直そう。`);
  if (leftoverIng + leftoverDish > 4) improve.push(`食材${leftoverIng}個・料理${leftoverDish}皿が売れ残った（スコアにならない）。`);
  if (fishing.count === 0) improve.push('釣りを一度も選ばなかった。魚料理と盛り合わせが作れない。');
  if (hunting.count === 0) improve.push('狩りを一度も選ばなかった。肉料理と盛り合わせが作れない。');
  if (s.spentOnUpgrades === 0) improve.push('設備に投資しなかった。早めの投資は毎晩の売上を伸ばす。');
  if (good.length === 0) good.push('最後まで店を続けられた。');
  if (improve.length === 0) improve.push('大きな問題は無かった。さらに速く正確に打てば上を狙える。');
  return { good: good.slice(0, 4), improve: improve.slice(0, 4) };
}

export { UPGRADE_ORDER };
