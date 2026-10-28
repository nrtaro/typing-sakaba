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
  /**
   * 同じレシピ（材料・値段）の仲間をまとめる名前。省略時は id。
   * 注文の出やすさはレシピ単位で決め、仲間の間で等分する（名前を増やしても難しさは変わらない）。
   */
  group?: string;
}

export const GAME_TITLE = 'タイピング酒場';
export const GAME_SUBTITLE = '～おやじと女将と看板娘～';

export const DISHES: Dish[] = [
  // 同じレシピ（材料・値段・時間帯）の料理を3品ずつ。注文の出やすさはレシピ単位で、3品で等分する。
  // 読みの最初の文字は全料理で重ならないようにし、調達の言葉（つ・か・さ・し）とも重ねない。
  // 朝：主材料を２個使う軽い料理（酒は１杯）
  { id: 'grilledFish', text: '焼き魚', kana: 'やきざかな', need: { fish: 2 }, price: 120, from: 0 },
  { id: 'driedFish', group: 'grilledFish', text: '干物焼き', kana: 'ひものやき', need: { fish: 2 }, price: 120, from: 0 },
  { id: 'searedFish', group: 'grilledFish', text: 'あぶり魚', kana: 'あぶりざかな', need: { fish: 2 }, price: 120, from: 0 },
  { id: 'vegSoup', text: '温野菜盛り', kana: 'おんやさいもり', need: { veg: 2 }, price: 100, from: 0 },
  { id: 'minestrone', group: 'vegSoup', text: 'ミネストローネ', kana: 'みねすとろーね', need: { veg: 2 }, price: 100, from: 0 },
  { id: 'gazpacho', group: 'vegSoup', text: 'ガスパチョ', kana: 'がすぱちょ', need: { veg: 2 }, price: 100, from: 0 },
  { id: 'ale', text: 'エール', kana: 'えーる', need: { ale: 1 }, price: 80, from: 0 },
  { id: 'lager', group: 'ale', text: 'ラガー', kana: 'らがー', need: { ale: 1 }, price: 80, from: 0 },
  { id: 'localBeer', group: 'ale', text: '地ビール', kana: 'じびーる', need: { ale: 1 }, price: 80, from: 0 },
  { id: 'mushSaute', text: 'きのこソテー', kana: 'きのこそてー', need: { mush: 2 }, price: 110, from: 0 },
  { id: 'namekoSoup', group: 'mushSaute', text: 'なめこ汁', kana: 'なめこじる', need: { mush: 2 }, price: 110, from: 0 },
  { id: 'maitakeTen', group: 'mushSaute', text: 'まいたけ天', kana: 'まいたけてん', need: { mush: 2 }, price: 110, from: 0 },
  { id: 'jerky', text: 'ジャーキー', kana: 'じゃーきー', need: { meat: 2 }, price: 120, from: 0 },
  { id: 'smokedMeat', group: 'jerky', text: 'くんせい肉', kana: 'くんせいにく', need: { meat: 2 }, price: 120, from: 0 },
  { id: 'sausage', group: 'jerky', text: 'ソーセージ', kana: 'そーせーじ', need: { meat: 2 }, price: 120, from: 0 },
  // 昼：主材料２個＋付け合わせ・調味料
  { id: 'stirFry', text: '肉野菜炒め', kana: 'にくやさいいため', need: { meat: 2, veg: 1 }, price: 260, from: 1 },
  { id: 'cabbageRoll', group: 'stirFry', text: 'ロールキャベツ', kana: 'ろーるきゃべつ', need: { meat: 2, veg: 1 }, price: 260, from: 1 },
  { id: 'hamburg', group: 'stirFry', text: 'ハンバーグ', kana: 'はんばーぐ', need: { meat: 2, veg: 1 }, price: 260, from: 1 },
  { id: 'mushStew', text: 'グリルきのこ', kana: 'ぐりるきのこ', need: { mush: 2, veg: 1 }, price: 240, from: 1 },
  { id: 'risotto', group: 'mushStew', text: 'リゾット', kana: 'りぞっと', need: { mush: 2, veg: 1 }, price: 240, from: 1 },
  { id: 'pilaf', group: 'mushStew', text: 'ピラフ大盛り', kana: 'ぴらふおおもり', need: { mush: 2, veg: 1 }, price: 240, from: 1 },
  { id: 'karaage', text: '鶏の唐揚げ', kana: 'とりのからあげ', need: { meat: 2, spice: 1 }, price: 230, from: 1 },
  { id: 'spiceSkewer', group: 'karaage', text: 'スパイス焼き', kana: 'すぱいすやき', need: { meat: 2, spice: 1 }, price: 230, from: 1 },
  { id: 'pepperSteak', group: 'karaage', text: 'ペッパーステーキ', kana: 'ぺっぱーすてーき', need: { meat: 2, spice: 1 }, price: 230, from: 1 },
  { id: 'fishFry', text: '天ぷら盛り', kana: 'てんぷらもり', need: { fish: 2, spice: 1 }, price: 230, from: 1 },
  { id: 'tatsuta', group: 'fishFry', text: '竜田揚げ', kana: 'たつたあげ', need: { fish: 2, spice: 1 }, price: 230, from: 1 },
  { id: 'pepperFry', group: 'fishFry', text: '胡椒揚げ', kana: 'こしょうあげ', need: { fish: 2, spice: 1 }, price: 230, from: 1 },
  { id: 'herbFish', text: 'ムニエル', kana: 'むにえる', need: { fish: 2, veg: 1 }, price: 250, from: 1 },
  { id: 'bouillabaisse', group: 'herbFish', text: 'ブイヤベース', kana: 'ぶいやべーす', need: { fish: 2, veg: 1 }, price: 250, from: 1 },
  { id: 'chanchan', group: 'herbFish', text: 'ちゃんちゃん焼き', kana: 'ちゃんちゃんやき', need: { fish: 2, veg: 1 }, price: 250, from: 1 },
  // 夜：複数の主材料や酒を組み合わせる料理
  { id: 'hunterStew', text: 'ポトフの大鍋', kana: 'ぽとふのおおなべ', need: { meat: 2, veg: 2, mush: 1 }, price: 400, from: 2 },
  { id: 'beefStew', group: 'hunterStew', text: 'ビーフシチュー', kana: 'びーふしちゅー', need: { meat: 2, veg: 2, mush: 1 }, price: 400, from: 2 },
  { id: 'hunterPot', group: 'hunterStew', text: '猟師の鉄鍋', kana: 'りょうしのてつなべ', need: { meat: 2, veg: 2, mush: 1 }, price: 400, from: 2 },
  { id: 'spicyPot', text: 'チゲ鍋大盛り', kana: 'ちげなべおおもり', need: { fish: 2, mush: 1, spice: 1 }, price: 400, from: 2 },
  { id: 'paella', group: 'spicyPot', text: 'パエリア鍋', kana: 'ぱえりあなべ', need: { fish: 2, mush: 1, spice: 1 }, price: 400, from: 2 },
  { id: 'yuzuPot', group: 'spicyPot', text: 'ゆず胡椒鍋', kana: 'ゆずこしょうなべ', need: { fish: 2, mush: 1, spice: 1 }, price: 400, from: 2 },
  { id: 'sakeFish', text: 'ワイン蒸し焼き', kana: 'わいんむしやき', need: { fish: 2, ale: 1 }, price: 260, from: 2 },
  { id: 'tipsyFish', group: 'sakeFish', text: 'ほろ酔い焼き', kana: 'ほろよいやき', need: { fish: 2, ale: 1 }, price: 260, from: 2 },
  { id: 'umeFish', group: 'sakeFish', text: '梅酒の煮付け', kana: 'うめしゅのにつけ', need: { fish: 2, ale: 1 }, price: 260, from: 2 },
  { id: 'aleBeef', text: 'どて煮の大鍋', kana: 'どてにのおおなべ', need: { meat: 2, ale: 1 }, price: 280, from: 2 },
  { id: 'baconStew', group: 'aleBeef', text: 'ベーコンのエール煮', kana: 'べーこんのえーるに', need: { meat: 2, ale: 1 }, price: 280, from: 2 },
  { id: 'beefPot', group: 'aleBeef', text: '牛すじ煮込み', kana: 'ぎゅうすじにこみ', need: { meat: 2, ale: 1 }, price: 280, from: 2 },
  { id: 'spiceAle', text: 'モスコミュール', kana: 'もすこみゅーる', need: { ale: 2, spice: 1 }, price: 230, from: 2 },
  { id: 'negroni', group: 'spiceAle', text: 'ねぎ塩サワー', kana: 'ねぎしおさわー', need: { ale: 2, spice: 1 }, price: 230, from: 2 },
  { id: 'lemonSour', group: 'spiceAle', text: 'レモンサワー', kana: 'れもんさわー', need: { ale: 2, spice: 1 }, price: 230, from: 2 },
  { id: 'feast', text: 'フルコース料理', kana: 'ふるこーすりょうり', need: { meat: 2, fish: 2, veg: 2, spice: 1 }, price: 620, from: 2 },
  { id: 'banquet', group: 'feast', text: 'ごちそう大皿', kana: 'ごちそうおおざら', need: { meat: 2, fish: 2, veg: 2, spice: 1 }, price: 620, from: 2 },
  { id: 'everything', group: 'feast', text: '全部のせ大皿', kana: 'ぜんぶのせおおざら', need: { meat: 2, fish: 2, veg: 2, spice: 1 }, price: 620, from: 2 },
];

/** 料理のレシピの仲間の名前 */
export function dishGroup(d: Dish) {
  return d.group ?? d.id;
}

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
  /** 基準配分。初期在庫はこの合計を維持してランダムに振り分ける。 */
  startStock: { fish: 6, meat: 6, veg: 6, mush: 4, ale: 5, spice: 3 } as Record<IngredientId, number>,
  startStockRange: {
    fish: [2, 8], meat: [2, 8], veg: [2, 8], mush: [2, 6], ale: [2, 7], spice: [2, 4],
  } as Record<IngredientId, readonly [number, number]>,
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
export const EASY_MINIGAME_SECONDS = 15;

export type DifficultyId = 'easy' | 'normal' | 'hard';

/** 基準報酬への上乗せ。短い語でも難易度ごとの差を保証する。 */
export const PROCUREMENT_BONUS: Record<DifficultyId, { rate: number; minimum: number }> = {
  easy: { rate: 0.8, minimum: 3 },
  normal: { rate: 0.25, minimum: 1 },
  hard: { rate: 0, minimum: 0 },
};

/** 難易度ごとの倍率。1 が「ふつう」 */
export interface Difficulty {
  id: DifficultyId;
  name: string;
  kana: string;
  desc: string;
  /** 注文成立までに許容するミス数。料理を出すと回復する。 */
  comboMissAllowance: number;
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
  { id: 'easy', comboMissAllowance: 3, name: 'やさしい', kana: 'やさしい', desc: 'お客はのんびり、獲物もゆっくり。はじめての人に', everyMult: 2.1, waitMult: 2.2, hookMult: 3.2, preyMult: 0.45, sproutLifeMult: 2.2, poisonRate: 0.04, rivalMult: 0.35, rankMult: 0.6 },
  { id: 'normal', comboMissAllowance: 2, name: 'ふつう', kana: 'ふつう', desc: '標準の忙しさ', everyMult: 1.2, waitMult: 1.2, hookMult: 1.3, preyMult: 0.9, sproutLifeMult: 1.15, poisonRate: 0.1, rivalMult: 0.85, rankMult: 1 },
  { id: 'hard', comboMissAllowance: 1, name: 'むずかしい', kana: 'むずかしい', desc: 'お客が次々来て待ってくれない。腕に自信のある人に', everyMult: 0.9, waitMult: 0.9, hookMult: 1, preyMult: 1.1, sproutLifeMult: 0.95, poisonRate: 0.17, rivalMult: 1.1, rankMult: 1.2 },
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
