import { describe, expect, it } from 'vitest';
import { CONDITIONS, NORMAL_RULES, dailyConditions, dateLabel, isBanned, jstDate, luckySchedule, rulesFor } from '../src/core/daily';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { defaultRomaji } from '../src/core/romaji';
import { DIFFICULTIES, DISHES, SHOP, TRIPS, difficultyOf } from '../src/core/shopConfig';
import { DAILY_KEEP_DAYS, SaveStore, type DayRecord } from '../src/core/save';

const dish = (id: string) => DISHES.find((d) => d.id === id)!;
const trip = (id: string) => TRIPS.find((t) => t.id === id)!;
function type(shop: Shop, kana: string) {
  for (const c of defaultRomaji(kana)) shop.key(c);
}
function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const rec = (score: number): DayRecord => ({ score, served: 1, maxCombo: 1, angry: 0, kps: 1, accuracy: 1, finishedAt: '' });
const day = (i: number) => new Date(Date.UTC(2026, 10, 1 + i)).toISOString().slice(0, 10);

describe('ひがわり：日付', () => {
  it('日本時間の0時で日付が変わる', () => {
    expect(jstDate(new Date('2026-11-07T14:59:59Z'))).toBe('2026-11-07');
    expect(jstDate(new Date('2026-11-07T15:00:00Z'))).toBe('2026-11-08');
  });

  it('日付と曜日の表示', () => {
    expect(dateLabel('2026-11-08')).toBe('11月8日（日）');
    expect(dateLabel('2027-01-01')).toBe('1月1日（金）');
  });
});

describe('ひがわり：お題の決まり方', () => {
  it('同じ日付なら同じお題', () => {
    for (const d of ['2026-11-08', '2026-12-24', '2027-02-28']) {
      expect(dailyConditions(d).map((c) => c.id)).toEqual(dailyConditions(d).map((c) => c.id));
    }
  });

  it('大きいお題と小さいお題が1つずつ出て、除外の組み合わせは出ない', () => {
    const seen = new Set<string>();
    for (let i = 0; i < 1500; i++) {
      const [a, b] = dailyConditions(day(i));
      expect([a.kind, b.kind]).toEqual(['major', 'minor']);
      expect(isBanned(a.id, b.id)).toBe(false);
      seen.add(`${a.id}+${b.id}`);
    }
    // 大6つ×小5つ＝30通りすべてが、いずれかの日に出る
    expect(seen.size).toBe(30);
  });

  it('難易度で強さが変わる', () => {
    expect(rulesFor([CONDITIONS.noMiss], 'easy')).toMatchObject({ comboMissAllowance: 1, angryPenaltyMult: 1 });
    expect(rulesFor([CONDITIONS.noMiss], 'hard')).toMatchObject({ comboMissAllowance: 0, angryPenaltyMult: 2 });
    expect(DIFFICULTIES.map((d) => rulesFor([CONDITIONS.smallStore], d.id).storageCap)).toEqual([10, 8, 6]);
    expect(DIFFICULTIES.map((d) => rulesFor([CONDITIONS.busyAway], d.id).awayWaitRate)).toEqual([0.5, 0.75, 1]);
    expect(DIFFICULTIES.map((d) => rulesFor([CONDITIONS.luckyTrip], d.id, '2026-11-08').unluckyMult)).toEqual([1, 0.85, 0.7]);
    expect(DIFFICULTIES.map((d) => rulesFor([CONDITIONS.spill], d.id).spillEvery)).toEqual([3, 2, 1]);
    expect(DIFFICULTIES.map((d) => rulesFor([CONDITIONS.refill], d.id).refillChance)).toEqual([0.15, 0.2, 0.25]);
  });

  it('お題の2行の説明は、どの難易度でもある', () => {
    for (const c of Object.values(CONDITIONS)) for (const d of DIFFICULTIES) {
      const lines = c.lines(d.id);
      expect(lines).toHaveLength(2);
      expect(lines.every((l) => l.length > 0 && l.length <= 22)).toBe(true);
    }
  });

  it('当たりの調達先は日付で決まり、続けて同じ所にならない', () => {
    for (let i = 0; i < 60; i++) {
      const s = luckySchedule(day(i));
      expect(s).toEqual(luckySchedule(day(i)));
      expect(s).toHaveLength(3);
      expect(s[0]).not.toBe(s[1]);
      expect(s[1]).not.toBe(s[2]);
    }
  });
});

describe('ひがわり：ノーミス営業', () => {
  it('ふつう：1回のミスでコンボが切れ、知らせが出る', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rulesFor([CONDITIONS.noMiss], 'normal'));
    shop.combo = 6;
    shop.drainEvents();
    shop.key('q');
    expect(shop.combo).toBe(0);
    expect(shop.drainEvents().some((e) => e.type === 'comboBreak')).toBe(true);
  });

  it('やさしい：1回までは続き、2回目で切れる', () => {
    const shop = new Shop(new Rng(1), difficultyOf('easy'), rulesFor([CONDITIONS.noMiss], 'easy'));
    shop.combo = 6;
    shop.key('q');
    expect(shop.combo).toBe(6);
    shop.key('q');
    expect(shop.combo).toBe(0);
  });

  it('通常営業の猶予は変わらない', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'));
    expect(shop.comboMissAllowance).toBe(difficultyOf('normal').comboMissAllowance);
    expect(shop.rules).toBe(NORMAL_RULES);
  });

  it('むずかしい：怒って帰る客の減点が2倍', () => {
    const shop = new Shop(new Rng(1), difficultyOf('hard'), rulesFor([CONDITIONS.noMiss], 'hard'));
    shop.score = 1000;
    shop.seats[0] = { id: 1, dish: dish('ale'), look: 0, wait: 0.01, maxWait: 20, state: 'wait', t: 0, lack: 0 };
    shop.update(0.05);
    expect(shop.score).toBe(1000 - SHOP.angryPenalty * 2);
  });
});

describe('ひがわり：狭い倉庫', () => {
  it('置ける数を超えた分は持ち帰れず、あふれた数を知らせる', () => {
    const shop = new Shop(new Rng(3), difficultyOf('normal'), rulesFor([CONDITIONS.smallStore], 'normal'));
    expect(Math.max(...Object.values(shop.stock))).toBeLessThanOrEqual(8);
    shop.stock.fish = 5;
    type(shop, 'つり');
    shop.drainEvents();
    shop.returnFromTrip({ fish: 6 });
    expect(shop.stock.fish).toBe(8);
    const end = shop.drainEvents().find((e) => e.type === 'tripEnd');
    expect(end).toMatchObject({ gains: { fish: 3 }, overflow: { fish: 3 } });
  });
});

describe('ひがわり：調達中もお客は待たない', () => {
  it('調達中も待ち時間が決まった速さで減る（通常は止まる）', () => {
    for (const [rules, expected] of [[NORMAL_RULES, 20], [rulesFor([CONDITIONS.busyAway], 'normal'), 20 - 0.75]] as const) {
      const shop = new Shop(new Rng(1), difficultyOf('normal'), rules);
      shop.seats[0] = { id: 1, dish: dish('ale'), look: 0, wait: 20, maxWait: 26, state: 'wait', t: 0, lack: 0 };
      type(shop, 'つり');
      expect(shop.away).not.toBeNull();
      shop.update(1);
      expect(shop.seats[0]!.wait).toBeCloseTo(expected);
    }
  });
});

describe('ひがわり：時間帯で当たりが変わる調達先', () => {
  it('出かけた時間帯の当たりなら多く、ほかは少なく持ち帰る', () => {
    const rules = rulesFor([CONDITIONS.luckyTrip], 'hard', '2026-11-08');
    const lucky = rules.luckyTrips![0];
    const other = TRIPS.find((t) => t.id !== lucky)!;
    const shop = new Shop(new Rng(1), difficultyOf('hard'), rules);
    expect(shop.luckyTrip()).toBe(lucky);
    const before = { ...shop.stock };
    type(shop, trip(lucky).kana);
    shop.returnFromTrip(Object.fromEntries(trip(lucky).gives.map((g) => [g, 10])));
    for (const g of trip(lucky).gives) expect(shop.stock[g] - before[g]).toBe(15);
    const mid = { ...shop.stock };
    type(shop, other.kana);
    shop.returnFromTrip(Object.fromEntries(other.gives.map((g) => [g, 10])));
    for (const g of other.gives) expect(shop.stock[g] - mid[g]).toBe(7);
  });
});

describe('ひがわり：ミスで素材をこぼす', () => {
  it('決まった回数のミスで、打っている料理の素材を1つこぼす', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rulesFor([CONDITIONS.spill], 'normal'));
    shop.seats[0] = { id: 1, dish: dish('ale'), look: 0, wait: 20, maxWait: 26, state: 'wait', t: 0, lack: 0 };
    const ale = shop.stock.ale;
    shop.key('e');
    shop.key('q');
    expect(shop.stock.ale).toBe(ale);
    shop.key('q');
    expect(shop.stock.ale).toBe(ale - 1);
    expect(shop.drainEvents().filter((e) => e.type === 'spill')).toEqual([{ type: 'spill', ing: 'ale' }]);
  });

  it('何も打っていなければ、一番多い素材をこぼす', () => {
    const shop = new Shop(new Rng(1), difficultyOf('hard'), rulesFor([CONDITIONS.spill], 'hard'));
    const most = (Object.keys(shop.stock) as (keyof typeof shop.stock)[]).sort((a, b) => shop.stock[b] - shop.stock[a])[0];
    const n = shop.stock[most];
    shop.key('x');
    expect(shop.stock[most]).toBe(n - 1);
  });
});

describe('ひがわり：おかわり注文', () => {
  it('食べ終わると見せていた2品目をたのみ、待たせても怒らずに帰る', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rulesFor([CONDITIONS.refill], 'normal'));
    shop.seats[0] = { id: 1, dish: dish('ale'), extra: dish('grilledFish'), look: 0, wait: 20, maxWait: 26, state: 'eat', t: 0.01, lack: 0 };
    shop.update(0.05);
    const g = shop.seats[0]!;
    expect(g.state).toBe('wait');
    expect(g.dish.id).toBe('grilledFish');
    expect(g.refill).toBe(true);
    expect(shop.drainEvents().some((e) => e.type === 'refill')).toBe(true);
    shop.score = 500;
    shop.combo = 4;
    g.wait = 0.01;
    shop.update(0.05);
    expect(shop.seats[0]).toBeNull();
    expect(shop.stats.angry).toBe(0);
    expect(shop.score).toBe(500);
    expect(shop.combo).toBe(4);
  });

  it('おかわりを頼むお客が、ときどき来る（通常営業では来ない）', () => {
    const count = (rules = NORMAL_RULES) => {
      const shop = new Shop(new Rng(5), difficultyOf('hard'), rules);
      const seen = new Set<number>();
      let extra = 0;
      for (let i = 0; i < 180 * 20 && !shop.ended; i++) {
        shop.update(0.05);
        for (const g of [...shop.seats, ...shop.queue]) {
          if (g && !seen.has(g.id)) {
            seen.add(g.id);
            if (g.extra) extra++;
          }
        }
      }
      return { extra, all: seen.size };
    };
    expect(count().extra).toBe(0);
    const r = count(rulesFor([CONDITIONS.refill], 'hard'));
    expect(r.extra).toBeGreaterThan(0);
    expect(r.extra).toBeLessThan(r.all / 2);
  });
});

const wait = (d: string, w = 20, extra: object = {}) => ({ id: Math.floor(Math.random() * 1e6), dish: dish(d), look: 0, wait: w, maxWait: 26, state: 'wait' as const, t: 0, lack: 0, ...extra });

describe('ひがわり：品切れ札', () => {
  it('作れない注文があるときだけ打てて、一番待たせている客を怒らせずに断る', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rulesFor([CONDITIONS.shinagire], 'normal'));
    shop.seats[0] = wait('ale');
    expect(shop.canUseSkill('shinagire')).toBe(false);
    shop.stock.fish = 0;
    shop.seats[1] = wait('grilledFish', 18);
    shop.seats[2] = wait('driedFish', 9);
    shop.combo = 5;
    expect(shop.declineSeat()).toBe(2);
    type(shop, 'しなぎれ');
    expect(shop.seats[2]).toBeNull();
    expect(shop.seats[1]).not.toBeNull();
    expect(shop.combo).toBe(5);
    expect(shop.stats.angry).toBe(0);
    expect(shop.skillLeft('shinagire')).toBe(2);
    expect(shop.drainEvents().some((e) => e.type === 'decline')).toBe(true);
  });

  it('回数を使い切ると打てない。宴会のお客は断れない', () => {
    const shop = new Shop(new Rng(1), difficultyOf('hard'), rulesFor([CONDITIONS.shinagire], 'hard'));
    shop.stock.fish = 0;
    shop.seats[0] = wait('grilledFish', 10, { banquet: true });
    expect(shop.declineSeat()).toBeNull();
    shop.seats[1] = wait('grilledFish', 12);
    type(shop, 'しなぎれ');
    shop.seats[1] = wait('grilledFish', 12);
    type(shop, 'しなぎれ');
    shop.seats[1] = wait('grilledFish', 12);
    expect(shop.skillLeft('shinagire')).toBe(0);
    expect(shop.targets().some((t) => t.id === 'skill:shinagire')).toBe(false);
  });

  it('「しいれ」と最初の音が同じでも、どちらも打てる', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rulesFor([CONDITIONS.shinagire], 'normal'));
    shop.stock.fish = 0;
    shop.seats[0] = wait('grilledFish', 10);
    type(shop, 'しいれ');
    expect(shop.away?.id).toBe('trading');
    shop.returnFromTrip({});
    type(shop, 'しなぎれ');
    expect(shop.seats[0]).toBeNull();
  });
});

describe('ひがわり：ひでんの', () => {
  it('打つと構え、次に出す1皿だけ売上が2倍になる', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rulesFor([CONDITIONS.hiden], 'normal'));
    shop.stock.ale = 9;
    type(shop, 'ひでんの');
    expect(shop.hidenArmed).toBe(true);
    expect(shop.canUseSkill('hiden')).toBe(false);
    shop.seats[0] = wait('ale', 26);
    type(shop, 'えーる');
    const first = shop.drainEvents().find((e) => e.type === 'serve');
    shop.seats[1] = wait('ale', 26);
    type(shop, 'えーる');
    const second = shop.drainEvents().find((e) => e.type === 'serve');
    expect(first).toMatchObject({ hiden: true });
    expect(second).toMatchObject({ hiden: false });
    expect(first!.type === 'serve' && second!.type === 'serve' && first!.gain).toBe(2 * (second as { gain: number }).gain);
    expect(shop.skillLeft('hiden')).toBe(2);
  });

  it('「ひものやき」と最初の音が同じでも、どちらも打てる', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rulesFor([CONDITIONS.hiden], 'normal'));
    shop.stock.fish = 9;
    shop.seats[0] = wait('driedFish', 26);
    type(shop, 'ひものやき');
    expect(shop.seats[0]!.state).toBe('eat');
    expect(shop.hidenArmed).toBe(false);
    type(shop, 'ひでんの');
    expect(shop.hidenArmed).toBe(true);
    expect(shop.stats.missKeys).toBe(0);
  });
});

describe('ひがわり：届くまで時間がかかる', () => {
  it('帰ってきてから決まった秒数のあとに素材が届く', () => {
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rulesFor([CONDITIONS.delivery], 'normal'));
    const fish = shop.stock.fish;
    type(shop, 'つり');
    shop.returnFromTrip({ fish: 6 });
    expect(shop.stock.fish).toBe(fish);
    expect(shop.pendingFor('fish')).toMatchObject({ n: 6 });
    expect(shop.drainEvents().find((e) => e.type === 'tripEnd')).toMatchObject({ delayed: true });
    for (let i = 0; i < 19 * 10; i++) shop.update(0.1);
    expect(shop.stock.fish).toBe(fish);
    for (let i = 0; i < 12; i++) shop.update(0.1);
    expect(shop.stock.fish).toBe(fish + 6);
    expect(shop.pendingFor('fish')).toBeNull();
    expect(shop.drainEvents().some((e) => e.type === 'delivery')).toBe(true);
  });
});

describe('ひがわり：素材が傷む', () => {
  it('手に入れてから決まった秒数で傷み、使うときは古いものから使う', () => {
    const shop = new Shop(new Rng(1), difficultyOf('hard'), rulesFor([CONDITIONS.spoil], 'hard'));
    const start = shop.stock.ale;
    shop.update(30);
    type(shop, 'しいれ');
    shop.returnFromTrip({ ale: 5, spice: 0 });
    expect(shop.stock.ale).toBe(start + 5);
    // 開店時の分から1つ使う
    shop.seats[0] = wait('ale', 26);
    type(shop, 'えーる');
    expect(shop.spoilsIn('ale')).toBeCloseTo(30);
    shop.update(31);
    expect(shop.stock.ale).toBe(5);
    expect(shop.drainEvents().find((e) => e.type === 'spoil' && e.ing === 'ale')).toMatchObject({ n: start - 1 });
    shop.update(30);
    expect(shop.stock.ale).toBe(0);
  });
});

describe('ひがわり：予約の宴会', () => {
  it('決まった時刻に宴会のお客が列の先頭に来て、売上は2倍、怒ると減点も大きい', () => {
    const rules = rulesFor([CONDITIONS.banquet], 'normal', '2026-11-08');
    expect(rules.banquets.map((b) => b.at)).toEqual([90, 150]);
    const shop = new Shop(new Rng(1), difficultyOf('normal'), rules);
    for (let i = 0; i < 90 * 10 + 1; i++) {
      shop.update(0.1);
      if (shop.queue[0]?.banquet) break;
    }
    const b = shop.queue[0];
    expect(b.banquet).toBe(true);
    expect(b.dish.id).toBe(rules.banquets[0].dish);
    expect(shop.drainEvents().some((e) => e.type === 'banquet')).toBe(true);

    // 売上2倍
    const plain = new Shop(new Rng(1), difficultyOf('normal'));
    for (const s of [shop, plain]) {
      for (const id of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[id] = 9;
      s.combo = 0;
      s.seats[7] = wait('feast', 26, s === shop ? { banquet: true } : {});
      s.drainEvents();
      type(s, 'ふるこーすりょうり');
    }
    const g1 = shop.drainEvents().find((e) => e.type === 'serve') as { gain: number };
    const g2 = plain.drainEvents().find((e) => e.type === 'serve') as { gain: number };
    expect(g1.gain).toBe(g2.gain * 2);

    // 怒ると減点3倍
    shop.score = 1000;
    shop.seats[6] = wait('feast', 0.01, { banquet: true });
    shop.update(0.05);
    expect(shop.score).toBe(1000 - SHOP.angryPenalty * 3);
  });
});

describe('ひがわり：記録', () => {
  it('日付×難易度ごとに残り、通常営業の自己ベストとは混ざらない', () => {
    const store = new SaveStore(memory());
    expect(store.recordDaily(rec(500), '2026-11-08', 'normal')).toBe(true);
    expect(store.recordDaily(rec(300), '2026-11-08', 'normal')).toBe(false);
    expect(store.recordDaily(rec(200), '2026-11-08', 'hard')).toBe(true);
    expect(store.loadDailyBest('2026-11-08', 'normal')?.score).toBe(500);
    expect(store.loadDailyBest('2026-11-08', 'hard')?.score).toBe(200);
    expect(store.loadDailyBest('2026-11-09', 'normal')).toBeNull();
    expect(store.loadBest('normal')).toBeNull();
    store.record(rec(900), 'normal');
    expect(store.loadDailyBest('2026-11-08', 'normal')?.score).toBe(500);
  });

  it('古い日の記録は消える', () => {
    const store = new SaveStore(memory());
    for (let i = 0; i < DAILY_KEEP_DAYS + 5; i++) {
      const d = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
      store.recordDaily(rec(100 + i), d, 'normal');
    }
    expect(store.loadDailyBest('2026-01-01', 'normal')).toBeNull();
    const last = new Date(Date.UTC(2026, 0, DAILY_KEEP_DAYS + 5)).toISOString().slice(0, 10);
    expect(store.loadDailyBest(last, 'normal')?.score).toBe(100 + DAILY_KEEP_DAYS + 4);
  });

  it('前回選んだ営業を覚える（以前の保存は通常営業）', () => {
    const m = memory();
    m.setItem('lastorder2.settings', JSON.stringify({ difficulty: 'hard' }));
    const store = new SaveStore(m);
    expect(store.loadSettings().playMode).toBe('normal');
    store.saveSettings({ ...store.loadSettings(), playMode: 'daily' });
    expect(store.loadSettings().playMode).toBe('daily');
  });
});
