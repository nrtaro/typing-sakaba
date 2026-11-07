// れんしゅう：時計を止めた店で、手順どおりに進む
import { describe, expect, it } from 'vitest';
import { PlaySession, TICK } from '../src/core/session';
import { NORMAL_RULES } from '../src/core/daily';
import { defaultRomaji } from '../src/core/romaji';
import { difficultyOf } from '../src/core/shopConfig';
import { FIRST_SEAT, SECOND_SEAT, setupTutorial, tutorialEvent, tutorialStep, tutorialText } from '../src/ui/tutorial';

function run(s: PlaySession, state: ReturnType<typeof setupTutorial>, seconds: number) {
  for (let i = 0; i < Math.ceil(seconds / TICK); i++) {
    s.tick();
    tutorialStep(state, s, TICK);
    for (const item of s.drain()) tutorialEvent(state, s, item);
  }
}
function type(s: PlaySession, state: ReturnType<typeof setupTutorial>, kana: string) {
  for (const c of defaultRomaji(kana)) {
    s.input(c);
    for (const item of s.drain()) tutorialEvent(state, s, item);
  }
}

describe('れんしゅう', () => {
  it('料理を出す → 素材が足りない → つり → Enter で戻る → 焼き魚を出す、の順に進む', () => {
    const s = new PlaySession(1, difficultyOf('easy'), NORMAL_RULES);
    const state = setupTutorial(s);
    expect(state.step).toBe('serve1');
    expect(s.shop.seats[FIRST_SEAT]?.dish.id).toBe('ale');
    // 最初は調達の言葉を打てない（手順の順番を守る）
    expect(s.shop.targets().some((t) => t.data.kind === 'trip')).toBe(false);
    type(s, state, 'つり');
    expect(s.trip).toBeNull();
    type(s, state, 'えーる');
    expect(state.step).toBe('lack');
    run(s, state, 1);
    expect(s.shop.seats[SECOND_SEAT]?.dish.id).toBe('grilledFish');
    expect(s.shop.stock.fish).toBe(0);
    type(s, state, 'つり');
    expect(state.step).toBe('trip');
    run(s, state, 3);
    s.input('Enter');
    run(s, state, 3);
    expect(state.step).toBe('serve2');
    expect(s.shop.stock.fish).toBeGreaterThanOrEqual(2);
    type(s, state, 'やきざかな');
    expect(state.step).toBe('done');
    expect(tutorialText(state).title).toBe('練習はおしまい！');
  });

  it('時計は止まったまま：営業の時間が進まず、お客の待ち時間も減らず、新しいお客も来ない', () => {
    const s = new PlaySession(2, difficultyOf('easy'), NORMAL_RULES);
    const state = setupTutorial(s);
    run(s, state, 60);
    expect(s.shop.clock).toBe(0);
    expect(s.shop.seats[FIRST_SEAT]?.wait).toBe(30);
    expect(s.shop.seats.filter(Boolean)).toHaveLength(1);
    expect(s.shop.queue).toHaveLength(0);
    expect(s.finished).toBe(false);
  });

  it('料理を出したお客は、配膳を受けて食べ終わると帰る（時計が止まっていても動く）', () => {
    const s = new PlaySession(3, difficultyOf('easy'), NORMAL_RULES);
    const state = setupTutorial(s);
    type(s, state, 'えーる');
    run(s, state, 20);
    expect(s.shop.seats[FIRST_SEAT]).toBeNull();
  });

  it('練習の釣りは時間が減らず、かかった魚は逃げず、打ち間違えても糸が切れない', () => {
    const s = new PlaySession(4, difficultyOf('easy'), NORMAL_RULES);
    const state = setupTutorial(s);
    type(s, state, 'えーる');
    run(s, state, 1);
    // つりだけを教える
    expect(s.shop.targets().filter((t) => t.data.kind === 'trip').map((t) => t.id)).toEqual(['trip:fishing']);
    type(s, state, 'つり');
    const game = s.trip!.game as import('../src/core/minigames').FishingGame;
    expect(game.practice).toBe(true);
    run(s, state, 2);
    const timeLeft = game.timeLeft;
    // 魚がかかるまで待ち、そのあと1分放っておいても逃げない
    run(s, state, 5);
    expect(game.phase).toBe('hook');
    run(s, state, 60);
    expect(game.phase).toBe('hook');
    expect(game.timeLeft).toBe(timeLeft);
    expect(s.trip).not.toBeNull();
    // 合わせてから、わざと何度も間違えても糸は切れない
    type(s, state, game.word!.kana);
    expect(game.phase).toBe('reel');
    for (let i = 0; i < 10; i++) s.input('q');
    expect(game.phase).toBe('reel');
  });
});
