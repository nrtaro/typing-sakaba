// 一日の営業の数値はすべてここに置く（すべて仮設定・調整可能）

export type IngredientId = 'fish' | 'meat' | 'veg' | 'mush' | 'ale' | 'spice';
export type TripId = 'fishing' | 'hunting' | 'gathering' | 'trading';
export type FamilyId = 'master' | 'wife' | 'daughter';

export const INGREDIENT_ORDER: IngredientId[] = ['fish', 'meat', 'veg', 'mush', 'ale', 'spice'];
export const INGREDIENT_NAME: Record<IngredientId, string> = {
  fish: '魚', meat: '肉', veg: '野菜', mush: 'きのこ', ale: '酒', spice: '香辛料',
};

export interface Dish {
  id: string;
  text: string;
  kana: string;
  need: Partial<Record<IngredientId, number>>;
  price: number;
  /** この時間帯（0=朝,1=昼,2=夜）から注文される */
  from: number;
}

export const GAME_TITLE = 'タイピング酒場';
export const GAME_SUBTITLE = '～おやじと女将と看板娘～';

export const DISHES: Dish[] = [
  // 朝：素材1つの軽い料理
  { id: 'grilledFish', text: '焼き魚', kana: 'やきざかな', need: { fish: 1 }, price: 120, from: 0 },
  { id: 'vegSoup', text: '野菜スープ', kana: 'やさいすーぷ', need: { veg: 1 }, price: 100, from: 0 },
  { id: 'ale', text: 'エール', kana: 'えーる', need: { ale: 1 }, price: 80, from: 0 },
  { id: 'mushSaute', text: 'きのこソテー', kana: 'きのこそてー', need: { mush: 1 }, price: 110, from: 0 },
  { id: 'jerky', text: '干し肉', kana: 'ほしにく', need: { meat: 1 }, price: 120, from: 0 },
  // 昼：素材2つ
  { id: 'stirFry', text: '肉野菜炒め', kana: 'にくやさいいため', need: { meat: 1, veg: 1 }, price: 260, from: 1 },
  { id: 'mushStew', text: 'きのこ煮込み', kana: 'きのこにこみ', need: { mush: 1, veg: 1 }, price: 240, from: 1 },
  { id: 'karaage', text: '唐揚げ', kana: 'からあげ', need: { meat: 1, spice: 1 }, price: 230, from: 1 },
  { id: 'fishFry', text: '魚フライ', kana: 'さかなふらい', need: { fish: 1, spice: 1 }, price: 230, from: 1 },
  { id: 'herbFish', text: '香草焼き', kana: 'こうそうやき', need: { fish: 1, veg: 1 }, price: 250, from: 1 },
  // 夜：素材3つ以上や酒を使う料理
  { id: 'hunterStew', text: 'ハンターシチュー', kana: 'はんたーしちゅー', need: { meat: 1, veg: 1, mush: 1 }, price: 400, from: 2 },
  { id: 'spicyPot', text: 'ピリ辛鍋', kana: 'ぴりからなべ', need: { fish: 1, mush: 1, spice: 1 }, price: 400, from: 2 },
  { id: 'sakeFish', text: '魚の酒蒸し', kana: 'さかなのさかむし', need: { fish: 1, ale: 1 }, price: 260, from: 2 },
  { id: 'aleBeef', text: '肉の黒エール煮', kana: 'にくのくろえーるに', need: { meat: 1, ale: 1 }, price: 280, from: 2 },
  { id: 'spiceAle', text: 'スパイスエール', kana: 'すぱいすえーる', need: { ale: 1, spice: 1 }, price: 200, from: 2 },
  { id: 'feast', text: '荒野の大皿', kana: 'こうやのおおざら', need: { meat: 1, fish: 1, veg: 1, spice: 1 }, price: 620, from: 2 },
];

export interface Trip {
  id: TripId;
  text: string;
  kana: string;
  who: FamilyId;
  act: string;
  place: string;
  gives: IngredientId[];
  /** 失敗しても持ち帰る最低量 */
  minimum: Partial<Record<IngredientId, number>>;
}

export const TRIPS: Trip[] = [
  { id: 'fishing', text: 'つり', kana: 'つり', who: 'wife', act: '釣り', place: '貯水池', gives: ['fish'], minimum: { fish: 4 } },
  { id: 'hunting', text: 'かり', kana: 'かり', who: 'master', act: '狩り', place: '荒野', gives: ['meat'], minimum: { meat: 5 } },
  { id: 'gathering', text: 'さいしゅ', kana: 'さいしゅ', who: 'daughter', act: '採取', place: '温室', gives: ['veg', 'mush'], minimum: { veg: 4, mush: 3 } },
  { id: 'trading', text: 'しいれ', kana: 'しいれ', who: 'master', act: '仕入れ', place: '隊商', gives: ['ale', 'spice'], minimum: { ale: 4, spice: 3 } },
];

/** 素材 → 取れる調達 */
export const SOURCE: Record<IngredientId, TripId> = {
  fish: 'fishing', meat: 'hunting', veg: 'gathering', mush: 'gathering', ale: 'trading', spice: 'trading',
};

export const FAMILY_NAME: Record<FamilyId, string> = { master: 'おやじ', wife: '女将', daughter: '看板娘' };

export interface Phase {
  name: string;
  length: number;
  /** 客が来る間隔（秒） */
  every: number;
  maxWait: number;
  tempo: number;
}

export const PHASES: Phase[] = [
  { name: '朝', length: 50, every: 5.0, maxWait: 30, tempo: 104 },
  { name: '昼', length: 60, every: 3.6, maxWait: 30, tempo: 120 },
  { name: '夜', length: 70, every: 2.8, maxWait: 26, tempo: 138 },
];

export const DAY_LENGTH = PHASES.reduce((a, p) => a + p.length, 0);

export const SHOP = {
  seats: 8,
  queueMax: 6,
  /** 旧セーブ・手動生成した客の表示用。通常の入店時間は経路長と歩速から決める。 */
  walkTime: 0.9,
  eatTime: 2.4,
  startStock: { fish: 5, meat: 4, veg: 5, mush: 3, ale: 5, spice: 3 } as Record<IngredientId, number>,
  /** チップの最大額（待ち時間が満タンのとき） */
  tipMax: 60,
  /** 何コンボごとに倍率が上がるか・上がる量・上限 */
  comboStep: 10,
  comboBonus: 0.5,
  comboMaxMult: 2,
  angryPenalty: 50,
  /** 調達の前後の演出（出発・帰還）の秒数。ミニゲームの時間とは別 */
  tripIntro: 0.9,
};

export const MINIGAME_SECONDS = 10;

export type DifficultyId = 'easy' | 'normal' | 'hard';

/** 難易度ごとの倍率。1 が「ふつう」 */
export interface Difficulty {
  id: DifficultyId;
  name: string;
  kana: string;
  desc: string;
  /** お客の来る間隔（大きいほど客が少ない） */
  everyMult: number;
  /** 待ってくれる時間 */
  waitMult: number;
  /** 釣り：あわせの猶予 */
  hookMult: number;
  /** 狩り：獲物の速さ */
  preyMult: number;
  /** 採取：芽の出ている時間・毒の出やすさ */
  sproutLifeMult: number;
  poisonRate: number;
  /** 仕入れ：ライバルの速さ */
  rivalMult: number;
  /** ランクのしきい値の倍率 */
  rankMult: number;
}

export const DIFFICULTIES: Difficulty[] = [
  { id: 'easy', name: 'やさしい', kana: 'やさしい', desc: 'お客はのんびり、獲物もゆっくり。はじめての人に', everyMult: 1.3, waitMult: 1.4, hookMult: 1.4, preyMult: 0.8, sproutLifeMult: 1.25, poisonRate: 0.15, rivalMult: 0.75, rankMult: 0.8 },
  { id: 'normal', name: 'ふつう', kana: 'ふつう', desc: '標準の忙しさ', everyMult: 1, waitMult: 1, hookMult: 1, preyMult: 1, sproutLifeMult: 1, poisonRate: 0.25, rivalMult: 1, rankMult: 1 },
  { id: 'hard', name: 'むずかしい', kana: 'むずかしい', desc: 'お客が次々来て待ってくれない。腕に自信のある人に', everyMult: 0.78, waitMult: 0.75, hookMult: 0.75, preyMult: 1.25, sproutLifeMult: 0.8, poisonRate: 0.35, rivalMult: 1.3, rankMult: 1.2 },
];

export function difficultyOf(id: DifficultyId): Difficulty {
  return DIFFICULTIES.find((d) => d.id === id) ?? DIFFICULTIES[1];
}

export const RANKS = [
  { name: 'S', min: 12000, title: '荒野いちばんの名店' },
  { name: 'A', min: 9000, title: '街道で評判の酒場' },
  { name: 'B', min: 6000, title: '常連でにぎわう店' },
  { name: 'C', min: 0, title: 'あたたかい家族の店' },
];

export function rankFor(score: number, diff: Difficulty = DIFFICULTIES[1]) {
  return RANKS.find((r) => score >= r.min * diff.rankMult) ?? RANKS[RANKS.length - 1];
}
