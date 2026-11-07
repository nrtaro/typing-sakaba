// 段階5：記録・実績と家族の会話
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, ICON: {}, PORTRAIT: {}, WALKERS: [], guestSprite: () => null }));
import { ACHIEVEMENTS, applyPlay, currentStreak, emptyRecords, longestStreak, readRecords, type PlayFacts, type Records } from '../src/core/achievements';
import { SaveStore } from '../src/core/save';
import { PlaySession, TICK } from '../src/core/session';
import { NORMAL_RULES } from '../src/core/daily';
import { Rng } from '../src/core/rng';
import { createMinigame, FishingGame, HuntingGame, TradingGame } from '../src/core/minigames';
import { Shop, LATE_SECONDS } from '../src/core/shop';
import { DAY_LENGTH, DISHES, TRIPS, difficultyOf } from '../src/core/shopConfig';
import { defaultRomaji } from '../src/core/romaji';
import { Game } from '../src/ui/game';

let n = 0;
function play(over: Partial<PlayFacts> = {}): PlayFacts {
  return {
    id: `p${++n}`, mode: 'normal', difficulty: 'normal', date: '2026-11-08', score: 1000, served: 5, maxCombo: 3, angry: 0,
    tripsStarted: 1, conds: [], bigFish: 0, deer: 0, streak: 0, late: 0, banquet: 0, returns: [], ...over,
  };
}
const id = (no: number) => ACHIEVEMENTS.find((a) => a.no === no)!.id;
/** 記録に営業を順に反映し、開いた実績の番号を返す */
function run(plays: PlayFacts[], start: Records = emptyRecords()) {
  let r = start;
  const opened: number[] = [];
  for (const p of plays) {
    const out = applyPlay(r, p);
    r = out.records;
    opened.push(...out.unlocked.map((u) => ACHIEVEMENTS.find((a) => a.id === u)!.no));
  }
  return { r, opened };
}
const has = (r: Records, no: number) => !!r.unlocked[id(no)];
function memory() {
  const m = new Map<string, string>();
  return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
}

describe('26件の定義', () => {
  it('番号1〜26・永続IDは重ならず、どれも条件と会話がある', () => {
    expect(ACHIEVEMENTS.map((a) => a.no)).toEqual(Array.from({ length: 26 }, (_, i) => i + 1));
    expect(new Set(ACHIEVEMENTS.map((a) => a.id)).size).toBe(26);
    for (const a of ACHIEVEMENTS) {
      expect(a.id).toMatch(/^[a-z0-9-]+$/);
      expect(!!a.progress || !!a.play).toBe(true);
      expect(a.lines.length).toBeGreaterThanOrEqual(6);
      expect(a.lines.every((l) => ['おやじ', '女将', '看板娘'].includes(l.who) && l.text.length > 0)).toBe(true);
    }
    expect(ACHIEVEMENTS.filter((a) => a.group === 'past').map((a) => a.no)).toEqual([17, 18, 19, 20, 21, 22]);
    expect(ACHIEVEMENTS.filter((a) => a.group === 'cooking').map((a) => a.no)).toEqual([23, 24, 25, 26]);
    expect(ACHIEVEMENTS[20].scene).toContain('魚の木札');
    expect(ACHIEVEMENTS.filter((a) => a.scene)).toHaveLength(1);
  });

  it('題名・条件・台詞は仕様書（正本）と同じ', () => {
    const spec = readFileSync(new URL('../docs/stage5-achievements-and-family-dialogue.md', import.meta.url), 'utf8');
    for (const a of ACHIEVEMENTS) {
      expect(spec).toContain(`### ${String(a.no).padStart(2, '0')}｜${a.title}`);
      expect(spec).toContain(`**解放条件**　${a.condition}`);
      for (const l of a.lines) expect(spec).toContain(`> ${l.who}「${l.text}」`);
    }
  });
});

describe('条件の境界', () => {
  it('01・02・03・04：営業回数と累計の皿数', () => {
    expect(has(run([play(), play()]).r, 1)).toBe(false);
    expect(has(run([play(), play(), play()]).r, 1)).toBe(true);
    expect(has(run([play({ served: 149 })]).r, 2)).toBe(false);
    expect(has(run([play({ served: 100 }), play({ served: 50 })]).r, 2)).toBe(true);
    expect(has(run([play({ served: 499 })]).r, 3)).toBe(false);
    expect(has(run([play({ served: 500 })]).r, 3)).toBe(true);
    expect(has(run([play({ served: 1499 })]).r, 4)).toBe(false);
    expect(has(run([play({ served: 1000 }), play({ served: 500 })]).r, 4)).toBe(true);
  });

  it('05：ふつう以上で20コンボ（やさしいでは数えない）', () => {
    expect(has(run([play({ maxCombo: 19 })]).r, 5)).toBe(false);
    expect(has(run([play({ maxCombo: 20 })]).r, 5)).toBe(true);
    expect(has(run([play({ maxCombo: 40, difficulty: 'easy' })]).r, 5)).toBe(false);
    expect(has(run([play({ maxCombo: 20, difficulty: 'hard', mode: 'daily' })]).r, 5)).toBe(true);
  });

  it('06：ふつう以上・35皿以上・怒った客0人を同じ営業で', () => {
    expect(has(run([play({ served: 35, angry: 0 })]).r, 6)).toBe(true);
    expect(has(run([play({ served: 34, angry: 0 })]).r, 6)).toBe(false);
    expect(has(run([play({ served: 40, angry: 1 })]).r, 6)).toBe(false);
    expect(has(run([play({ served: 40, angry: 0, difficulty: 'easy' })]).r, 6)).toBe(false);
  });

  it('07：通常営業のむずかしいで12,000円以上', () => {
    expect(has(run([play({ difficulty: 'hard', score: 11999 })]).r, 7)).toBe(false);
    expect(has(run([play({ difficulty: 'hard', score: 12000 })]).r, 7)).toBe(true);
    expect(has(run([play({ difficulty: 'hard', score: 20000, mode: 'daily', conds: ['noMiss'] })]).r, 7)).toBe(false);
    expect(has(run([play({ difficulty: 'normal', score: 20000 })]).r, 7)).toBe(false);
  });

  it('08：ひがわりのふつうで、異なる5組のお題それぞれ8,000以上（並びは問わず、同じ組は数えない）', () => {
    const d = (conds: string[], score = 8000, difficulty: PlayFacts['difficulty'] = 'normal') => play({ mode: 'daily', difficulty, score, conds });
    const four = [d(['smallStore', 'noMiss']), d(['busyAway', 'spill']), d(['luckyTrip', 'refill']), d(['delivery', 'hiden'])];
    // 同じ組み合わせ（並びが逆）・別の日・点数不足・別の難易度は増えない
    const { r } = run([...four, d(['noMiss', 'smallStore']), d(['spoil', 'prep'], 7999), d(['spoil', 'prep'], 9000, 'hard')]);
    expect(r.combos).toHaveLength(4);
    expect(has(r, 8)).toBe(false);
    expect(has(run([d(['spoil', 'prep'])], r).r, 8)).toBe(true);
  });

  it('09・10：大物の魚は1営業で2匹、鉄角ジカは累計10頭', () => {
    expect(has(run([play({ bigFish: 1 }), play({ bigFish: 1 })]).r, 9)).toBe(false);
    expect(has(run([play({ bigFish: 2 })]).r, 9)).toBe(true);
    expect(has(run([play({ deer: 4 }), play({ deer: 5 })]).r, 10)).toBe(false);
    expect(has(run([play({ deer: 4 }), play({ deer: 6 })]).r, 10)).toBe(true);
  });

  it('11：ふつう以上で、1回の交易中に3連勝', () => {
    expect(has(run([play({ streak: 2 })]).r, 11)).toBe(false);
    expect(has(run([play({ streak: 3 })]).r, 11)).toBe(true);
    expect(has(run([play({ streak: 5, difficulty: 'easy' })]).r, 11)).toBe(false);
  });

  it('12：4種類すべてで成果を持ち帰り、20皿以上', () => {
    const all = TRIPS.map((t) => ({ kind: t.id, gained: true, early: false }));
    expect(has(run([play({ served: 20, returns: all })]).r, 12)).toBe(true);
    expect(has(run([play({ served: 19, returns: all })]).r, 12)).toBe(false);
    const noGather = all.map((t) => (t.kind === 'gathering' ? { ...t, gained: false } : t));
    expect(has(run([play({ served: 30, returns: noGather })]).r, 12)).toBe(false);
  });

  it('13：通常営業のふつう以上で、調達に出ずに12皿以上', () => {
    expect(has(run([play({ tripsStarted: 0, served: 12 })]).r, 13)).toBe(true);
    expect(has(run([play({ tripsStarted: 0, served: 11 })]).r, 13)).toBe(false);
    expect(has(run([play({ tripsStarted: 1, served: 30 })]).r, 13)).toBe(false);
    expect(has(run([play({ tripsStarted: 0, served: 30, mode: 'daily', conds: ['prep'] })]).r, 13)).toBe(false);
    expect(has(run([play({ tripsStarted: 0, served: 30, difficulty: 'easy' })]).r, 13)).toBe(false);
  });

  it('14：成果を持ち帰る早帰りを2回、20皿以上（成果ゼロの早帰りは数えない）', () => {
    const early = { kind: 'fishing' as const, gained: true, early: true };
    expect(has(run([play({ served: 20, returns: [early, early] })]).r, 14)).toBe(true);
    expect(has(run([play({ served: 20, returns: [early, { ...early, gained: false }] })]).r, 14)).toBe(false);
    expect(has(run([play({ served: 20, returns: [early, { ...early, early: false }] })]).r, 14)).toBe(false);
    expect(has(run([play({ served: 19, returns: [early, early] })]).r, 14)).toBe(false);
  });

  it('15・16：最後の20秒で3皿、予約の宴会で宴会を2件', () => {
    expect(has(run([play({ late: 2 })]).r, 15)).toBe(false);
    expect(has(run([play({ late: 3 })]).r, 15)).toBe(true);
    expect(has(run([play({ mode: 'daily', conds: ['banquet', 'hiden'], banquet: 1 })]).r, 16)).toBe(false);
    expect(has(run([play({ mode: 'daily', conds: ['banquet', 'hiden'], banquet: 2 })]).r, 16)).toBe(true);
    expect(has(run([play({ mode: 'daily', conds: ['smallStore', 'hiden'], banquet: 3 })]).r, 16)).toBe(false);
  });

  it('23〜26：採取で成果を持ち帰り10皿以上の営業を数える（1営業で何回採取しても1回）', () => {
    const g = { kind: 'gathering' as const, gained: true, early: false };
    const cook = (k: number) => Array.from({ length: k }, () => play({ served: 10, returns: [g, g, g] }));
    expect(has(run(cook(2)).r, 23)).toBe(false);
    const r3 = run(cook(3)).r;
    expect(r3.cookingPlays).toBe(3);
    expect(has(r3, 23)).toBe(true);
    expect(has(run([play({ served: 9, returns: [g] })]).r, 23)).toBe(false);
    expect(run([play({ served: 30, returns: [{ ...g, gained: false }] })]).r.cookingPlays).toBe(0);
    const r15 = run(cook(15)).r;
    expect([23, 24, 25, 26].every((no) => has(r15, no))).toBe(true);
    expect(has(run(cook(14)).r, 26)).toBe(false);
  });
});

describe('営業日と過去編', () => {
  const day = (i: number) => new Date(Date.UTC(2026, 10, 8 + i)).toISOString().slice(0, 10);
  it('累計1〜6営業日に、過去編を1本ずつ番号順に開く（休んだ日があっても進む）', () => {
    let r = emptyRecords();
    const order: number[] = [];
    for (const i of [0, 1, 3, 7, 8, 20]) {
      const out = run([play({ date: day(i) })], r);
      r = out.r;
      order.push(...out.opened.filter((no) => no >= 17 && no <= 22));
    }
    expect(order).toEqual([17, 18, 19, 20, 21, 22]);
  });

  it('同じ日に何度遊んでも（通常とひがわりを両方でも）1日', () => {
    const { r, opened } = run([play({ date: day(0) }), play({ date: day(0), mode: 'daily', conds: ['noMiss'] }), play({ date: day(0) })]);
    expect(r.days).toEqual([day(0)]);
    expect(opened.filter((no) => no >= 17)).toEqual([17]);
  });

  it('日付をまたいだ営業は開店した日で数え、確定の順が前後しても重ならない', () => {
    const { r } = run([play({ date: day(2) }), play({ date: day(1) }), play({ date: day(2) }), play({ date: day(1) })]);
    expect(r.days).toEqual([day(1), day(2)]);
  });

  it('現在の連続日数は今日か昨日まで、最長の連続日数は途切れても残る', () => {
    const days = [day(0), day(1), day(2), day(5), day(6)];
    expect(currentStreak(days, day(6))).toBe(2);
    expect(currentStreak(days, day(7))).toBe(2);
    expect(currentStreak(days, day(8))).toBe(0);
    expect(longestStreak(days)).toBe(3);
    expect(currentStreak([], day(0))).toBe(0);
  });
});

describe('一度だけ反映する', () => {
  it('同じ営業IDは二度数えない', () => {
    const p = play({ served: 40 });
    const once = applyPlay(emptyRecords(), p).records;
    const twice = applyPlay(once, p);
    expect(twice.records).toBe(once);
    expect(twice.unlocked).toEqual([]);
    expect(once.plays).toBe(1);
  });

  it('一度開いた実績は取り消さない（壊れた値や古い形でも、読める分を使う）', () => {
    const r = readRecords({ plays: 1, unlocked: { 'three-chopsticks': '2026-11-01T00:00:00Z', other: 5 }, days: ['2026-11-01', 'bad', '2026-11-01'], best: { combo: 'x' } });
    expect(r.unlocked).toEqual({ 'three-chopsticks': '2026-11-01T00:00:00Z' });
    expect(r.days).toEqual(['2026-11-01']);
    expect(r.best.combo).toBe(0);
    expect(applyPlay(r, play()).records.unlocked['three-chopsticks']).toBe('2026-11-01T00:00:00Z');
  });

  it('旧セーブ：記録がなくても空から始め、設定・自己ベスト・ひがわりの記録には触れない', () => {
    const { m, store } = memory();
    m.set('lastorder2.settings', JSON.stringify({ difficulty: 'hard', volume: 2 }));
    m.set('lastorder2.best', JSON.stringify({ score: 5000, served: 1, maxCombo: 1, angry: 0, kps: 1, accuracy: 1, finishedAt: '' }));
    m.set('lastorder2.daily', JSON.stringify({ '2026-11-07': { normal: { score: 3000 } } }));
    const s = new SaveStore(store);
    expect(s.loadRecords()).toEqual(emptyRecords());
    const out = s.recordPlay(play({ id: 'first' }));
    expect(out.records.plays).toBe(1);
    expect(s.loadSettings().difficulty).toBe('hard');
    expect(s.loadBest('normal')?.score).toBe(5000);
    expect(m.get('lastorder2.daily')).toContain('3000');
    m.set('lastorder2.records.v1', '{壊れた');
    expect(s.loadRecords()).toEqual(emptyRecords());
  });

  it('保存の直前に読み直す：別のタブで増えた分を消さない', () => {
    const { store } = memory();
    const tabA = new SaveStore(store);
    const tabB = new SaveStore(store);
    tabA.recordPlay(play({ id: 'a1', served: 10 }));
    tabB.recordPlay(play({ id: 'b1', served: 20 }));
    tabA.recordPlay(play({ id: 'a1', served: 10 }));
    const r = tabA.loadRecords();
    expect(r.plays).toBe(2);
    expect(r.served).toBe(30);
  });

  it('書き込めなくても、営業の反映は例外を出さずに結果を返す', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    const s = new SaveStore(broken);
    expect(() => s.recordPlay(play())).not.toThrow();
    expect(s.recordPlay(play()).records.plays).toBe(1);
  });
});

describe('ゲームでの集計の入口', () => {
  function game() {
    const { store } = memory();
    const s = new SaveStore(store);
    const g = Object.assign(Object.create(Game.prototype) as Game, {
      store: s, settings: s.loadSettings(), sound: new Proxy({}, { get: () => vi.fn() }), menu: { reset: vi.fn() },
      view: { update: vi.fn(), handle: vi.fn() }, tripView: { art: null, update: vi.fn(), handle: vi.fn() },
      mode: 'play', t: 0, daily: null, prep: null, paused: false, countdown: 0, goShown: 0, seed: 7, art: null,
      submission: { state: 'idle', receipt: null, message: '' },
    }) as unknown as Game;
    return { g, s };
  }

  it('閉店結果の確定で1回だけ反映し、結果に新しく開いた実績を渡す', () => {
    const { g, s } = game();
    g.session = new PlaySession(1, difficultyOf('normal'), NORMAL_RULES);
    g.playId = 'play-1';
    g.openDate = '2026-11-08';
    g.session.shop.stats.served = 160;
    g.finish();
    expect(s.loadRecords().plays).toBe(1);
    expect(g.result!.unlocked).toEqual(expect.arrayContaining([id(2), id(17)]));
    // 結果の再描画や再入場で finish がもう一度呼ばれても増えない
    g.finish();
    expect(s.loadRecords().plays).toBe(1);
  });

  it('れんしゅうと、途中でやめた営業は数えない', () => {
    const { g, s } = game();
    g.startTutorial();
    for (let i = 0; i < 600; i++) g.step(TICK);
    g.toTitle();
    expect(s.loadRecords().plays).toBe(0);
  });
});

describe('事実が確定するところ', () => {
  it('大物の魚は釣り上げが確定したときだけ数える', () => {
    const f = new FishingGame(new Rng(3), difficultyOf('normal'));
    // 1匹目は小物、2匹目は大物
    const catchOne = () => {
      for (let i = 0; i < 600 && f.phase !== 'hook' && f.phase !== 'land'; i++) f.update(1 / 60);
      while (f.phase === 'hook' || f.phase === 'land' || f.phase === 'reel') {
        const before = f.fishIndex;
        for (const c of defaultRomaji(f.word!.kana)) f.key(c);
        if (f.fishIndex !== before) break;
      }
    };
    catchOne();
    expect(f.feats.bigFish).toBe(0);
    catchOne();
    expect(f.feats.bigFish).toBe(1);
  });

  it('鉄角ジカは仕留めたときだけ数える（小物は数えない）', () => {
    const h = new HuntingGame(new Rng(7), difficultyOf('normal'));
    for (let i = 0; i < 600 && !(h.prey.some((p) => p.kind === 'deer') && h.prey.some((p) => p.kind === 'rabbit')); i++) h.update(1 / 60);
    const rabbit = h.prey.find((p) => p.kind === 'rabbit')!;
    for (const c of defaultRomaji(rabbit.word.kana)) h.key(c);
    expect(h.feats.deer).toBe(0);
    const deer = h.prey.find((p) => p.kind === 'deer')!;
    while (h.prey.includes(deer)) for (const c of defaultRomaji(deer.word.kana)) h.key(c);
    expect(h.feats.deer).toBe(1);
  });

  it('競りの連勝は、負けを挟むとつながらない', () => {
    const t = new TradingGame(new Rng(2), difficultyOf('normal'));
    const win = () => { for (let i = 0; i < 200 && t.lot.outcome !== 'open'; i++) t.update(1 / 60); for (const c of defaultRomaji(t.lot.word.kana)) t.key(c); };
    const lose = () => { for (let i = 0; i < 2000 && t.lot.outcome === 'open'; i++) t.update(1 / 60); for (let i = 0; i < 400 && t.lot.outcome !== 'open'; i++) t.update(1 / 60); };
    win(); win(); lose(); win();
    expect(t.feats.streak).toBe(2);
    win(); win();
    expect(t.feats.streak).toBe(3);
  });

  it('成果ゼロの早帰りと、最低保証だけの帰還は「持ち帰り」に数えない', () => {
    const s = new PlaySession(1, difficultyOf('normal'), NORMAL_RULES);
    const go = (setup: (g: ReturnType<typeof createMinigame>) => void, enter: boolean) => {
      for (const c of defaultRomaji('つり')) s.input(c);
      s.trip!.phase = 'game';
      setup(s.trip!.game);
      if (enter) s.input('Enter'); else { s.trip!.game.timeLeft = 0; s.tick(); }
      for (let i = 0; i < 120 && s.trip; i++) s.tick();
      s.drain();
    };
    go(() => {}, true);
    go((g) => { g.timeLeft = 0; }, false);
    go((g) => { g.gains = { fish: 3 }; }, true);
    expect(s.returns).toEqual([
      { kind: 'fishing', gained: false, early: true },
      { kind: 'fishing', gained: false, early: false },
      { kind: 'fishing', gained: true, early: true },
    ]);
    // 最低保証の分は在庫には入るが、「成果」とはみなさない
    expect(s.shop.stock.fish).toBeGreaterThan(0);
  });

  it('最後の20秒は、残りちょうど20秒を含めて数える。宴会の注文も数える', () => {
    const shop = new Shop(new Rng(1));
    shop.stock.ale = 9;
    const serve = (left: number, banquet = false) => {
      shop.clock = DAY_LENGTH - left;
      shop.seats[0] = { id: Math.random(), dish: DISHES.find((d) => d.id === 'ale')!, look: 0, wait: 20, maxWait: 26, state: 'wait', t: 0, lack: 0, banquet };
      for (const c of defaultRomaji('えーる')) shop.key(c);
    };
    serve(LATE_SECONDS + 0.01);
    expect(shop.stats.lateServes).toBe(0);
    serve(LATE_SECONDS);
    serve(5, true);
    expect(shop.stats.lateServes).toBe(2);
    expect(shop.stats.banquetServed).toBe(1);
  });
});
