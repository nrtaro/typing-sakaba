import { describe, expect, it } from 'vitest';
import { CandidateInput } from '../src/core/candidates';
import { Shop } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DAY_LENGTH, DIFFICULTIES, DISHES, SHOP, TRIPS, dishGroup } from '../src/core/shopConfig';
import { defaultRomaji } from '../src/core/romaji';
import { SaveStore } from '../src/core/save';

const dish = (id: string) => DISHES.find((d) => d.id === id)!;

function seat(shop: Shop, i: number, id: string, wait = 20) {
  shop.seats[i] = { id: 100 + i, dish: dish(id), look: 0, wait, maxWait: 26, state: 'wait', t: 0, lack: 0 };
}

function type(shop: Shop, kana: string) {
  for (const c of defaultRomaji(kana)) shop.key(c);
}

describe('候補の絞り込み', () => {
  const targets = [
    { id: 'a', kana: 'やきざかな', data: 1 },
    { id: 'b', kana: 'やさいすーぷ', data: 2 },
    { id: 'c', kana: 'つり', data: 3 },
  ];

  it('打つほど候補が絞り込まれ、打ち切ると返す', () => {
    const inp = new CandidateInput(() => targets);
    inp.key('y');
    expect(inp.active.map((l) => l.target.id)).toEqual(['a', 'b']);
    inp.key('a');
    inp.key('s');
    expect(inp.active.map((l) => l.target.id)).toEqual(['b']);
    let done: string[] = [];
    for (const c of 'aisu-pu') {
      const r = inp.key(c);
      if (r.kind === 'ok' && r.done.length) done = r.done.map((t) => t.id);
    }
    expect(done).toEqual(['b']);
    expect(inp.typed).toBe('');
  });

  it('どの候補にも合わない文字はミスで、状態を変えない', () => {
    const inp = new CandidateInput(() => targets);
    inp.key('t');
    expect(inp.key('x').kind).toBe('miss');
    expect(inp.typed).toBe('t');
  });

  it('Backspace で1文字戻し、reset で最初に戻る', () => {
    const inp = new CandidateInput(() => targets);
    for (const c of 'yas') inp.key(c);
    inp.backspace();
    expect(inp.typed).toBe('ya');
    expect(inp.active.length).toBe(2);
    inp.reset();
    expect(inp.typed).toBe('');
    expect(inp.active.length).toBe(0);
  });

  it('別の綴り（si/shi など）でも絞り込める', () => {
    const inp = new CandidateInput(() => [{ id: 'x', kana: 'しいれ', data: 0 }]);
    let ok = false;
    for (const c of 'siire') {
      const r = inp.key(c);
      if (r.kind === 'ok' && r.done.length) ok = true;
    }
    expect(ok).toBe(true);
  });
});

describe('営業', () => {
  it('料理を出すと素材を1回だけ消費し、売上が増える', () => {
    const shop = new Shop(new Rng(1));
    seat(shop, 0, 'grilledFish');
    const fish = shop.stock.fish;
    type(shop, 'やきざかな');
    expect(shop.stock.fish).toBe(fish - 2);
    expect(shop.seats[0]!.state).toBe('eat');
    expect(shop.score).toBeGreaterThan(0);
    expect(shop.stats.served).toBe(1);
  });

  it('素材が足りなければ出せず、在庫は負にならない', () => {
    const shop = new Shop(new Rng(1));
    shop.stock.meat = 0;
    seat(shop, 0, 'karaage');
    type(shop, 'とりのからあげ');
    expect(shop.seats[0]!.state).toBe('wait');
    expect(shop.stock.meat).toBe(0);
    const ev = shop.drainEvents().find((e) => e.type === 'lack');
    expect(ev && ev.type === 'lack' && ev.missing).toEqual(['meat']);
  });

  it('同じ料理なら待ち時間の残りが少ない客から出す', () => {
    const shop = new Shop(new Rng(1));
    seat(shop, 0, 'grilledFish', 20);
    seat(shop, 5, 'grilledFish', 6);
    type(shop, 'やきざかな');
    expect(shop.seats[5]!.state).toBe('eat');
    expect(shop.seats[0]!.state).toBe('wait');
    type(shop, 'やきざかな');
    expect(shop.seats[0]!.state).toBe('eat');
  });

  it('早く出すほどチップが多い', () => {
    const fast = new Shop(new Rng(1));
    seat(fast, 0, 'ale', 26);
    type(fast, 'えーる');
    const slow = new Shop(new Rng(1));
    seat(slow, 0, 'ale', 3);
    type(slow, 'えーる');
    expect(fast.score).toBeGreaterThan(slow.score);
  });

  it('むずかしいは1ミスでコンボが切れ、10コンボで倍率が上がる', () => {
    const shop = new Shop(new Rng(1), DIFFICULTIES[2]);
    shop.stock.ale = 99;
    for (let i = 0; i < 10; i++) {
      seat(shop, 0, 'ale');
      type(shop, 'えーる');
      shop.seats[0] = null;
    }
    expect(shop.combo).toBe(10);
    expect(shop.multiplier).toBe(1 + SHOP.comboBonus);
    shop.key('q');
    expect(shop.combo).toBe(0);
  });

  it.each([['easy', 2], ['normal', 1], ['hard', 0]] as const)('%s：%iミスまで維持し、次のミスでコンボを切る', (id, allowance) => {
    const shop = new Shop(new Rng(1), DIFFICULTIES.find(d => d.id === id)!);
    shop.combo = 12;
    for (let i = 0; i < allowance; i++) { shop.key('q'); expect(shop.combo).toBe(12); }
    expect(shop.comboMissesLeft).toBe(0);
    shop.key('q');
    expect(shop.combo).toBe(0);
    expect(shop.multiplier).toBe(1);
    expect(shop.stats.missKeys).toBe(allowance + 1);
  });

  it.each(['easy', 'normal'] as const)('%s：正しい1打鍵や調達では回復せず、注文完了で回復する', id => {
    const diff = DIFFICULTIES.find(d => d.id === id)!;
    const shop = new Shop(new Rng(1), diff);
    shop.combo = 8;
    for (let i = 0; i < diff.comboMissAllowance; i++) shop.key('q');
    shop.key('t');
    expect(shop.comboMissesLeft).toBe(0);
    for (const c of 'suri') shop.key(c);
    expect(shop.away?.id).toBe('fishing');
    shop.returnFromTrip({ fish: 4 });
    expect(shop.comboMissesLeft).toBe(0);
    seat(shop, 0, 'ale'); type(shop, 'えーる');
    expect(shop.combo).toBe(9);
    expect(shop.comboMissesLeft).toBe(diff.comboMissAllowance);
    for (let i = 0; i < diff.comboMissAllowance; i++) shop.key('q');
    expect(shop.combo).toBe(9);
  });

  it('材料不足の注文ではミス猶予を回復しない', () => {
    const shop = new Shop(new Rng(1)); shop.combo = 5; shop.key('q');
    shop.stock.fish = 1; seat(shop, 0, 'grilledFish'); type(shop, 'やきざかな');
    expect(shop.comboMissesLeft).toBe(0);
    expect(shop.combo).toBe(5);
    expect(shop.stock.fish).toBe(1);
  });

  it('待ち時間切れでコンボとミス数をリセットする', () => {
    const shop = new Shop(new Rng(1)); shop.combo = 5; shop.key('q');
    seat(shop, 0, 'ale', .1); shop.update(.2);
    expect(shop.combo).toBe(0);
    expect(shop.comboMissesLeft).toBe(1);
  });

  it.each(DISHES.map(d => [d.id, d] as const))('%s：レシピの必要量を一度だけ差し引く', (_id, recipe) => {
    const shop = new Shop(new Rng(1));
    for (const id of Object.keys(shop.stock) as (keyof typeof shop.stock)[]) shop.stock[id] = 20;
    seat(shop, 0, recipe.id); type(shop, recipe.kana);
    for (const id of Object.keys(shop.stock) as (keyof typeof shop.stock)[]) expect(shop.stock[id]).toBe(20 - (recipe.need[id] ?? 0));
    expect(shop.stats.served).toBe(1);
    expect(shop.combo).toBe(1);
  });

  it('待たせすぎると客が怒って帰る', () => {
    const shop = new Shop(new Rng(1));
    seat(shop, 0, 'ale', 0.5);
    shop.update(1);
    expect(shop.seats[0]).toBeNull();
    expect(shop.stats.angry).toBe(1);
  });

  it('3分で一日が終わる', () => {
    const shop = new Shop(new Rng(1));
    for (let t = 0; t < DAY_LENGTH + 1; t += 0.5) shop.update(0.5);
    expect(shop.ended).toBe(true);
    expect(shop.drainEvents().some((e) => e.type === 'end')).toBe(true);
  });

  it('朝・昼・夜で注文される料理が変わる', () => {
    const shop = new Shop(new Rng(3));
    const seen = new Set<number>();
    for (let t = 0; t < DAY_LENGTH; t += 0.25) {
      shop.update(0.25);
      for (const g of shop.queue) seen.add(g.dish.from);
      shop.queue = [];
      if (shop.ended) break;
    }
    expect([...seen].sort()).toEqual([0, 1, 2]);
  });
});

describe('調達', () => {
  it('調達の言葉を打つと出かけ、待ち時間は止まり時計は進む', () => {
    const shop = new Shop(new Rng(1));
    seat(shop, 0, 'grilledFish', 10);
    type(shop, 'つり');
    expect(shop.away?.id).toBe('fishing');
    const clock = shop.clock;
    shop.update(5);
    expect(shop.seats[0]!.wait).toBe(10);
    expect(shop.clock).toBe(clock + 5);
  });

  it('調達中に来た客は入り口で待ち、戻ると席に着く', () => {
    const shop = new Shop(new Rng(1));
    type(shop, 'かり');
    for (let i = 0; i < 20; i++) shop.update(0.5);
    expect(shop.queue.length).toBeGreaterThan(0);
    expect(shop.seats.every((s) => s === null)).toBe(true);
    shop.returnFromTrip({ meat: 5 });
    shop.update(0.01);
    expect(shop.seats.some((s) => s !== null)).toBe(true);
  });

  it('調達中は他の調達を打てない', () => {
    const shop = new Shop(new Rng(1));
    type(shop, 'つり');
    expect(shop.targets().some((t) => t.data.kind === 'trip')).toBe(false);
  });

  it('戻ると素材が補充され、失敗しても最低量は持ち帰る', () => {
    const shop = new Shop(new Rng(1));
    const veg = shop.stock.veg;
    const mush = shop.stock.mush;
    type(shop, 'さいしゅ');
    shop.returnFromTrip({});
    const t = TRIPS.find((x) => x.id === 'gathering')!;
    expect(shop.stock.veg).toBe(veg + t.minimum.veg!);
    expect(shop.stock.mush).toBe(mush + t.minimum.mush!);
    expect(shop.away).toBeNull();
  });

  it('戻ったあと二重に補充されない', () => {
    const shop = new Shop(new Rng(1));
    const ale = shop.stock.ale;
    type(shop, 'しいれ');
    shop.returnFromTrip({ ale: 4 });
    shop.returnFromTrip({ ale: 4 });
    expect(shop.stock.ale).toBe(ale + 4);
  });
});

describe('保存', () => {
  it('自己ベストを記録し、壊れたデータや保存できない環境でも落ちない', () => {
    const mem = new Map<string, string>();
    const store = new SaveStore({ getItem: (k) => mem.get(k) ?? null, setItem: (k, v) => void mem.set(k, v), removeItem: (k) => void mem.delete(k) });
    const rec = { score: 1000, served: 10, maxCombo: 5, angry: 0, kps: 4, accuracy: 0.95, finishedAt: '' };
    expect(store.record(rec)).toBe(true);
    expect(store.record({ ...rec, score: 500 })).toBe(false);
    expect(store.loadBest()!.score).toBe(1000);
    expect(store.loadLast()!.score).toBe(500);
    const broken = new SaveStore({ getItem: () => '{x', setItem: () => { throw new Error(); }, removeItem: () => {} });
    expect(broken.loadBest()).toBeNull();
    expect(() => broken.record(rec)).not.toThrow();
  });
});

describe('料理の出題', () => {
  /** 読みの最初の音（小さい「ゃゅょ」などは前の文字と一緒に数える） */
  const firstMora = (kana: string) => (/^.[ぁぃぅぇぉゃゅょ]/.test(kana) ? kana.slice(0, 2) : kana.slice(0, 1));

  it('料理の読みの最初の音は重ならず、調達の言葉とも重ならない', () => {
    const seen = new Map<string, string>();
    for (const d of DISHES) {
      const m = firstMora(d.kana);
      expect(seen.get(m), `${d.text} と ${seen.get(m)}`).toBeUndefined();
      seen.set(m, d.text);
    }
    for (const t of TRIPS) expect(seen.has(firstMora(t.kana)), t.text).toBe(false);
  });

  it('同じレシピの料理は材料・値段・時間帯が同じ', () => {
    for (const d of DISHES) {
      const lead = DISHES.find((x) => x.id === dishGroup(d))!;
      expect([d.need, d.price, d.from]).toEqual([lead.need, lead.price, lead.from]);
    }
  });

  it('同じ時に同じ料理の注文は出ない', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const shop = new Shop(new Rng(seed));
      for (let i = 0; i < 60 * 150; i++) {
        shop.update(1 / 60);
        const ids = [...shop.seats, ...shop.queue].filter((g) => g).map((g) => g!.dish.id);
        expect(new Set(ids).size).toBe(ids.length);
      }
    }
  });
});
