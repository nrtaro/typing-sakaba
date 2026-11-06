import { describe, expect, it } from 'vitest';
import { CONDITIONS, NORMAL_RULES, dailyConditions, dateLabel, jstDate, rulesFor } from '../src/core/daily';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DIFFICULTIES, DISHES, SHOP, difficultyOf } from '../src/core/shopConfig';
import { DAILY_KEEP_DAYS, SaveStore, type DayRecord } from '../src/core/save';

const dish = (id: string) => DISHES.find((d) => d.id === id)!;
function memory() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) };
}
const rec = (score: number): DayRecord => ({ score, served: 1, maxCombo: 1, angry: 0, kps: 1, accuracy: 1, finishedAt: '' });

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
      const a = dailyConditions(d);
      expect(a.length).toBeGreaterThan(0);
      expect(a.map((c) => c.id)).toEqual(dailyConditions(d).map((c) => c.id));
    }
  });

  it('難易度で強さが変わる', () => {
    const conds = [CONDITIONS.noMiss];
    expect(rulesFor(conds, 'easy')).toEqual({ comboMissAllowance: 1, angryPenaltyMult: 1 });
    expect(rulesFor(conds, 'normal')).toEqual({ comboMissAllowance: 0, angryPenaltyMult: 1 });
    expect(rulesFor(conds, 'hard')).toEqual({ comboMissAllowance: 0, angryPenaltyMult: 2 });
  });

  it('お題の2行の説明は、どの難易度でもある', () => {
    for (const c of Object.values(CONDITIONS)) for (const d of DIFFICULTIES) {
      const lines = c.lines(d.id);
      expect(lines).toHaveLength(2);
      expect(lines.every((l) => l.length > 0 && l.length <= 22)).toBe(true);
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
