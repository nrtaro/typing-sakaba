// ゲームバランスの数値はすべてここに置く（すべて仮設定・調整可能）。

export type IngredientId = 'smallFish' | 'bigFish' | 'smallMeat' | 'bigMeat';
export type RecipeId = 'grilledFish' | 'rabbitStew' | 'catfishSteam' | 'deerSteak' | 'hunterPlate' | 'feast';
export type UpgradeId = 'seats' | 'kitchen' | 'sign';
export type ActivityKind = 'fishing' | 'hunting';
export type TrendId = 'fish' | 'meat' | 'crowd' | 'quiet';
/** 品質 0=★1, 1=★2, 2=★3 */
export type Quality = 0 | 1 | 2;
export type QualityCounts = [number, number, number];

export const CURRENCY = 'Cr';

export const RUN = {
  days: 6,
  actionsPerDay: 3,
  startCash: 60,
  startReputation: 10,
  startIngredients: { smallFish: [0, 2, 0], smallMeat: [0, 1, 0] } as Partial<Record<IngredientId, QualityCounts>>,
};

export const INGREDIENTS: Record<IngredientId, { name: string; source: ActivityKind; desc: string }> = {
  smallFish: { name: '川魚', source: 'fishing', desc: '水路でよく釣れる小魚' },
  bigFish: { name: '大ナマズ', source: 'fishing', desc: 'ミスなしで粘ると掛かる大物' },
  smallMeat: { name: '砂ウサギ肉', source: 'hunting', desc: '荒野を跳ねる小さな獲物' },
  bigMeat: { name: '鉄角ジカ肉', source: 'hunting', desc: 'ときどき現れる大物。逃すと何も得られない' },
};

export interface Recipe {
  name: string;
  needs: Partial<Record<IngredientId, number>>;
  price: number;
  tags: ('fish' | 'meat')[];
}

export const RECIPES: Record<RecipeId, Recipe> = {
  grilledFish: { name: '川魚の塩焼き', needs: { smallFish: 1 }, price: 14, tags: ['fish'] },
  rabbitStew: { name: '砂ウサギの煮込み', needs: { smallMeat: 1 }, price: 16, tags: ['meat'] },
  hunterPlate: { name: '狩人の盛り合わせ', needs: { smallFish: 1, smallMeat: 1 }, price: 38, tags: ['fish', 'meat'] },
  catfishSteam: { name: '大ナマズの香草蒸し', needs: { bigFish: 1 }, price: 40, tags: ['fish'] },
  deerSteak: { name: '鉄角ジカのステーキ', needs: { bigMeat: 1 }, price: 40, tags: ['meat'] },
  feast: { name: '荒野の大皿', needs: { bigFish: 1, bigMeat: 1 }, price: 105, tags: ['fish', 'meat'] },
};

export const RECIPE_ORDER: RecipeId[] = ['grilledFish', 'rabbitStew', 'hunterPlate', 'catfishSteam', 'deerSteak', 'feast'];

/** 品質ごとの価格倍率（★1, ★2, ★3） */
export const QUALITY_PRICE = [1.0, 1.3, 1.7];

export interface UpgradeDef {
  name: string;
  /** 次のレベルへの価格（index = 現在レベル） */
  costs: number[];
  desc: string;
}

export const UPGRADES: Record<UpgradeId, UpgradeDef> = {
  seats: { name: '客席', costs: [90, 240, 520], desc: '一晩に受け入れられる客数が増える' },
  kitchen: { name: '厨房', costs: [80, 220, 480], desc: '1日に作れる料理の数が増える' },
  sign: { name: '看板・内装', costs: [70, 200, 450], desc: '来客が増え、メニューに載せられる品数も増える' },
};

export const UPGRADE_ORDER: UpgradeId[] = ['seats', 'kitchen', 'sign'];

/** レベルごとの効果（index = レベル 0..3） */
export const EFFECTS = {
  seats: [4, 7, 10, 14],
  turnsPerNight: 2,
  kitchenPerDay: [8, 14, 20, 28],
  menuSlots: [2, 3, 4, 5],
  signAttract: [1.0, 1.2, 1.4, 1.6],
};

export const BUSINESS = {
  baseVisitors: 10,
  /** 評判 0 → 0.6倍、100 → 1.4倍 */
  repMin: 0.6,
  repMax: 1.4,
  /** メニューの種類が1つ増えるごとの来客倍率 */
  varietyBonus: 0.12,
  noise: 0.08,
  repPerServed: [0.2, 0.5, 0.9],
  repPerTurnedAway: -0.4,
  repPerNoFood: -0.8,
  maxReputation: 100,
};

export const TRENDS: Record<TrendId, { name: string; desc: string; visitorMult: number; tagBoost?: 'fish' | 'meat' }> = {
  fish: { name: '魚料理が人気', desc: '魚を使った料理をメニューに出すと客が増え、魚料理から注文される', visitorMult: 1.25, tagBoost: 'fish' },
  meat: { name: '肉料理が人気', desc: '肉を使った料理をメニューに出すと客が増え、肉料理から注文される', visitorMult: 1.25, tagBoost: 'meat' },
  crowd: { name: '冒険者の大部隊が来る', desc: '今夜は客がいつもより多い', visitorMult: 1.35 },
  quiet: { name: '静かな夜', desc: '今夜は客が少なめ', visitorMult: 0.85 },
};

export const TREND_ORDER: TrendId[] = ['fish', 'meat', 'crowd', 'quiet'];

export const FISHING = {
  duration: 40,
  biteWait: [0.5, 1.0] as [number, number],
  landTime: 0.6,
  /** 「水面の静けさ」がこの値に達すると大物が掛かる */
  calmToBig: 3,
  /** 語句を打ち切ったときの静けさの増減（ミス0回 / 1回 / 2回以上） */
  calmGain: [1, 0.5, -1],
  bigWords: 3,
  smallYield: 1,
  bigYield: 2,
  /** 品質★3・★2になるミス数の上限 */
  qualityMisses: { small: [0, 2], big: [1, 4] },
};

export const HUNTING = {
  duration: 40,
  rabbit: { hp: 2, crossTime: 7.5, yield: 1 },
  deer: { hp: 5, crossTime: 11, yield: 2 },
  rabbitInterval: [2.2, 3.2] as [number, number],
  maxRabbits: 3,
  deerAt: [7, 22],
  /** ミスで獲物が驚いたときの速度倍率（上限あり） */
  startle: 1.12,
  maxStartle: 1.6,
  qualityMisses: { rabbit: [0, 1], deer: [1, 3] },
};

export const SCORE = {
  /** 設備は購入額のこの割合で評価する */
  upgradeValueRate: 0.5,
  perReputation: 3,
  ranks: [
    { name: 'S', min: 7500, title: '荒野に名高い大酒場' },
    { name: 'A', min: 5000, title: '街道の人気店' },
    { name: 'B', min: 3200, title: '常連の集まる店' },
    { name: 'C', min: 1800, title: '灯りのともる小さな店' },
    { name: 'D', min: 0, title: 'これからの店' },
  ],
};

export function qualityFromMisses(misses: number, limits: number[]): Quality {
  if (misses <= limits[0]) return 2;
  if (misses <= limits[1]) return 1;
  return 0;
}

export const STARS = ['★', '★★', '★★★'];
