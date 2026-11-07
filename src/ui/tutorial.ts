// れんしゅう：時計を止めた店で、「料理を出す → 素材が足りない → 調達に出る → 店に戻る → また出す」を一度ずつ体験する。
// 本物の営業（PlaySession）を使い、手順に合わせてお客と在庫を用意し、出来事を見て次の手順へ進める。
import type { PlaySession, SessionEvent } from '../core/session';
import { DISHES, type IngredientId } from '../core/shopConfig';
import type { Guest } from '../core/shop';

export type TutorialStep = 'serve1' | 'lack' | 'trip' | 'serve2' | 'done';

export interface TutorialState {
  step: TutorialStep;
  /** 今の手順に入ってからの秒数 */
  t: number;
  /** 調達で何か取れたか（取れたら「Enter で戻ろう」を強める） */
  gained: boolean;
}

/** 手順ごとに使う席（上の段の左から2つめと、下の段の右から2つめ） */
export const FIRST_SEAT = 1;
export const SECOND_SEAT = 6;

const dish = (id: string) => DISHES.find((d) => d.id === id)!;

function guest(id: number, dishId: string, look: number): Guest {
  return { id, dish: dish(dishId), look, wait: 30, maxWait: 30, state: 'wait', t: 0, lack: 0 };
}

/** 練習の店を用意する：時計を止め、魚だけ空にして、最初のお客（エール）を座らせる */
export function setupTutorial(s: PlaySession): TutorialState {
  const shop = s.shop;
  shop.holdTime = true;
  shop.noTrips = true;
  // 釣りだけを教える（ほかの調達は、時間切れや失敗の仕組みが違うため）
  shop.onlyTrip = 'fishing';
  const stock: Record<IngredientId, number> = { fish: 0, meat: 6, veg: 6, mush: 4, ale: 3, spice: 3 };
  Object.assign(shop.stock, stock);
  shop.seats.fill(null);
  shop.queue.length = 0;
  shop.seats[FIRST_SEAT] = guest(9001, 'ale', 2);
  return { step: 'serve1', t: 0, gained: false };
}

/** 出来事を見て、次の手順へ進める */
export function tutorialEvent(state: TutorialState, s: PlaySession, item: SessionEvent) {
  const shop = s.shop;
  if (item.src === 'shop') {
    const ev = item.ev;
    if (ev.type === 'serve' && state.step === 'serve1' && ev.seat === FIRST_SEAT) next(state, 'lack');
    else if (ev.type === 'serve' && state.step === 'serve2' && ev.seat === SECOND_SEAT) next(state, 'done');
    else if (ev.type === 'tripStart' && state.step === 'lack') {
      // 練習の釣り：時間が減らず、魚も逃げない
      if (s.trip) s.trip.game.practice = true;
      next(state, 'trip');
    }
    // 練習なので、持ち帰りが少なくても焼き魚が作れるだけの魚は置いておく
    else if (ev.type === 'tripEnd') shop.stock.fish = Math.max(shop.stock.fish, 2);
  } else if (item.src === 'trip') {
    if (item.ev.type === 'gain') state.gained = true;
  } else if (item.type === 'tripBack' && state.step === 'trip') {
    shop.noTrips = true;
    next(state, 'serve2');
  }
}

/** 時間で進める部分：最初の料理を出したら、少しして魚料理のお客を座らせ、調達の言葉を出す */
export function tutorialStep(state: TutorialState, s: PlaySession, dt: number) {
  state.t += dt;
  if (state.step === 'lack' && state.t > 0.8 && !s.shop.seats[SECOND_SEAT]) {
    s.shop.seats[SECOND_SEAT] = guest(9002, 'grilledFish', 5);
    s.shop.noTrips = false;
  }
}

function next(state: TutorialState, step: TutorialStep) {
  state.step = step;
  state.t = 0;
}

/** 手順ごとの見出しと説明（1行は全角20文字くらいまで） */
export function tutorialText(state: TutorialState): { title: string; lines: string[] } {
  switch (state.step) {
    case 'serve1':
      return { title: '① 料理を出す', lines: ['お客の頭の上に、注文の', '料理名が出ます。', '「エール」と打つと、', '料理を出せます。'] };
    case 'lack':
      return { title: '② 素材が足りない', lines: ['焼き魚には魚が2つ要るけど、', '魚がありません（×の印）。', '下の「つり」と打って、', '女将に釣ってきてもらおう。'] };
    case 'trip':
      return state.gained
        ? { title: '③ 店に戻る', lines: ['魚が取れました！', '調達はいつでも Enter で', '切り上げて、店に戻れます。', 'さあ、Enter で戻ろう！'] }
        : { title: '③ 調達（つり）', lines: ['練習なので時間は止まっていて、', '魚は逃げません。ゆっくりどうぞ。', '浮きが沈んだら、出た言葉を打って', '合わせ、次の言葉で巻き上げよう。', '本番では時間内に戻ってきます。'] };
    case 'serve2':
      return { title: '④ もう一度、料理を出す', lines: ['持ち帰った魚で、', '「焼き魚」を出そう。'] };
    default:
      return { title: '練習はおしまい！', lines: [] };
  }
}
