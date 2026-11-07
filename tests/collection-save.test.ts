// 段階6：コレクションの保存と売上の貯金
import { describe, expect, it } from 'vitest';
import { emptyCollection } from '../src/core/collection';
import type { PlayFacts } from '../src/core/achievements';
import { SaveStore } from '../src/core/save';

function memory() {
  const m = new Map<string, string>();
  return { m, store: { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), removeItem: (k: string) => void m.delete(k) } };
}
let n = 0;
const play = (over: Partial<PlayFacts> = {}): PlayFacts => ({
  id: `p${++n}`, mode: 'normal', difficulty: 'normal', date: '2026-11-08', score: 3000, served: 10, maxCombo: 3, angry: 0,
  tripsStarted: 0, conds: [], bigFish: 0, deer: 0, streak: 0, late: 0, banquet: 0, returns: [], ...over,
});

describe('コレクションの保存', () => {
  it('旧セーブ：保存がなければ空から始め、ほかの保存に触れない', () => {
    const { m, store } = memory();
    m.set('lastorder2.settings', JSON.stringify({ difficulty: 'hard' }));
    const s = new SaveStore(store);
    expect(s.loadCollection()).toEqual(emptyCollection());
    expect(s.loadSettings().difficulty).toBe('hard');
    expect(m.has('lastorder2.collection.v1')).toBe(false);
  });

  it('同じ営業の売上は一度だけ貯金箱に足す', () => {
    const { store } = memory();
    const s = new SaveStore(store);
    const p = play({ score: 4200 });
    expect(s.recordPlay(p).credited).toBe(4200);
    const again = s.recordPlay(p);
    expect(again.credited).toBe(0);
    expect(again.coins).toBe(4200);
    expect(s.recordPlay(play({ score: 800 })).coins).toBe(5000);
    expect(s.loadRecords().plays).toBe(2);
  });

  it('保存枠ごとに分かれる', () => {
    const { m, store } = memory();
    new SaveStore(store, 'dtest').recordPlay(play({ score: 100 }));
    expect(m.has('lastorder2.collection.v1.dtest')).toBe(true);
    expect(new SaveStore(store).loadCollection().coins).toBe(0);
  });

  it('2つのタブが交互に保存しても、貯金箱とおまけ札が消えない', () => {
    const { store } = memory();
    const a = new SaveStore(store);
    const b = new SaveStore(store);
    a.recordPlay(play({ score: 1000 }));
    b.updateCollection((c) => ({ ...c, tickets: c.tickets + 7 }));
    a.recordPlay(play({ score: 2000 }));
    b.updateCollection((c) => ({ ...c, tickets: c.tickets + 1 }));
    const c = a.loadCollection();
    expect(c.coins).toBe(3000);
    expect(c.tickets).toBe(8);
  });

  it('書き込めなくても例外を出さず結果を返す', () => {
    const broken = { getItem: () => null, setItem: () => { throw new Error('full'); }, removeItem: () => {} };
    const s = new SaveStore(broken);
    expect(() => s.recordPlay(play({ score: 10 }))).not.toThrow();
    expect(s.recordPlay(play({ score: 10 })).credited).toBe(10);
    expect(s.updateCollection((c) => ({ ...c, tickets: 3 })).tickets).toBe(3);
  });
});
