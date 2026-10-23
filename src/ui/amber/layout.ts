// A案素材の配置。座標は基準の 480x270。背景画像（1672x941）の家具や地面に合わせて調整した値。
import type { IngredientId } from '../../core/shopConfig';

export const AMBER = {
  tavern: {
    /** かまどの口（背景の石窯）に置く炎、鍋の湯気 */
    fire: { x: 38, y: 93, h: 11 },
    steam: { x: 76, y: 86, h: 16 },
    /** おやじ：カウンターの奥。y は足元（カウンターの前板で隠れる位置） */
    master: { x: 66, y: 138, h: 44, hStir: 46 },
    /** カウンターの前板（おやじの下半身を隠すため、背景から切り出して上に描き直す） */
    counterFront: { x: 6, y: 127, w: 137, h: 26 },
    /** 女将・看板娘の身長 */
    family: { wife: 38, daughter: 33 } as Record<'wife' | 'daughter', number>,
    /** テーブル・椅子・座った客。foot は席の基準（ty）からの足元のずれ */
    table: { h: 22, foot: 15 },
    chair: { h: 27, foot: 10 },
    guest: { h: 25, foot: 0 },
    dish: { y: -13 },
    /** 歩く客の身長 */
    walker: { h: 34 },
    /** 入り口で待つ客の位置 */
    queue: { x: 452, y: 200 },
  },
  fishing: {
    /** 桟橋の上の女将（足元）。竿の先から下がる仕掛けの位置は wife-fishing のコマごとの値 */
    wife: { x: 104, y: 156, h: 60 },
    /** wife-fishing の各コマで、竿から下がる仕掛けの下端（セル内の座標） */
    lure: [[507, 420], [506, 387], [513, 441], [513, 398]] as [number, number][],
    /** 水面の浮き（足元＝水面） */
    bobber: { x: 372, y: 186, h: 11 },
    splash: { h: 22 },
  },
  hunting: {
    /** 左の柵の手前で構えるおやじ */
    master: { x: 28, y: 182, h: 54 },
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
