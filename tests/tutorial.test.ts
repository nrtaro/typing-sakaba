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
});
