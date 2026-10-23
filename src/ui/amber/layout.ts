// A案素材の配置。座標は基準の 480x270。背景画像（1672x941）の家具や地面に合わせて調整した値。
import type { IngredientId } from '../../core/shopConfig';

export { TAVERN_SEATS, entryPosition } from '../../core/tavernNavigation';
export const ORDER_CARD = { height: 34, offset: 58 };

export const AMBER = {
  tavern: {
    /** かまどの口（背景の石窯）に置く炎、鍋の湯気 */
    fire: { x: 38, y: 93, h: 11 },
    steam: { x: 76, y: 86, h: 16 },
    /** 足元は奥の作業通路。頭は y=88、腰より下は手前の天板に隠れる。 */
    master: { x: 66, y: 132, h: 44, hStir: 46 },
    /** 原画の天板奥端 y=393/941*270。前板だけでなく天板も人物より手前に置く。 */
    counterFront: { x: 6, y: 113, w: 137, h: 40 },
    /** 女将・看板娘の身長 */
    family: { wife: 38, daughter: 33 } as Record<'wife' | 'daughter', number>,
    /** テーブル・椅子・座った客。foot は席の基準（ty）からの足元のずれ */
    table: { h: 25, foot: 20 },
    chair: { h: 30, foot: 11 },
    guest: { h: 25, foot: 0 },
    dish: { y: -10 },
    /** 歩く客の身長 */
    walker: { h: 34 },
    /** 入り口で待つ客の位置 */
    queue: { x: 452, y: 200 },
  },
  fishing: {
    /** 足元を桟橋の板面の内側へ置く。手前の支柱・側面には乗せない。 */
    wife: { x: 90, y: 144, h: 60 },
    /** wife-fishing の各コマで、竿から下がる仕掛けの下端（セル内の座標） */
    lure: [[501, 244], [501, 234], [504, 284], [504, 244]] as [number, number][],
    /** 水面の浮き（足元＝水面） */
    bobber: { x: 372, y: 186, h: 11 },
    splash: { h: 22 },
  },
  hunting: {
    /** 左の柵の手前で構えるおやじ */
    master: { x: 49, y: 207, h: 48 },
    rabbit: { h: 22 },
    deer: { h: 48 },
  },
  gathering: {
    /** 左の石畳の通路に立つ看板娘とかご */
    daughter: { x: 92, y: 212, h: 44 },
    basket: { x: 120, y: 214, h: 16 },
    /** 6つの畑（背景の木枠の中央付近の土の上） */
    slots: [
      { x: 197, y: 150 }, { x: 296, y: 150 }, { x: 395, y: 150 },
      { x: 192, y: 206 }, { x: 296, y: 206 }, { x: 403, y: 206 },
    ],
    sprout: { size: 24 },
  },
  trading: {
    /** 露店の前のおやじと、荷車の前の商人 */
    master: { x: 132, y: 228, h: 46 },
    merchant: { x: 282, y: 214, h: 50 },
    crate: { h: 14 },
  },
};

/** icons-dishes のコマ番号 */
export const ICON_INDEX: Record<IngredientId | 'poison', number> = {
  fish: 0, meat: 1, veg: 2, mush: 3, ale: 4, spice: 5, poison: 6,
};

/** 料理に近い絵（16品のうち、素材に絵がない料理は近いものを使う） */
const DISH_ICON: Record<string, number> = {
  grilledFish: 7, herbFish: 7, sakeFish: 7,
  vegSoup: 8,
  ale: 9, spiceAle: 9,
  stirFry: 10, jerky: 10, aleBeef: 10,
  mushStew: 11, mushSaute: 11, hunterStew: 11, spicyPot: 11,
  karaage: 12, fishFry: 12,
  feast: 13,
};

export function dishIcon(id: string) {
  return DISH_ICON[id] ?? 7;
}
