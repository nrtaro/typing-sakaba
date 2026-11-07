import { describe, expect, it } from 'vitest';
import { dailyConditions } from '../src/core/daily';
import { normalizeRankingName, readDecoration } from '../src/core/ranking';
import { SaveStore, type KeyValueStore } from '../src/core/save';
import { validateSubmission } from '../worker/validation';

const now = new Date('2026-11-07T03:00:00Z');
function score(overrides: Record<string, unknown> = {}) {
  return {
    date: '2026-11-07', difficulty: 'normal', name: ' おやじ ',
    player: '12345678-1234-4123-8123-123456789abc', score: 18000, served: 35,
    maxCombo: 20, angry: 2, accuracy: 0.98, kps: 5,
    conds: dailyConditions('2026-11-07').map(c => c.id), seed: 1, record: '12a0B', prep: null, ...overrides,
  };
}

describe('ランキングの入力確認', () => {
  it('余白と文字幅を整えて記録を受け取る', () => {
    const result = validateSubmission(score({ name: ' Ａ店主 ' }), now);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.name).toBe('A店主');
  });
  it.each(['', '   ', 'あ'.repeat(11), '店\n主', '店\u0000主', '店\u202e主', '店\u200b主', '死ね', 'ＦＵＣＫ'])('名前「%s」を拒否する', name => {
    expect(normalizeRankingName(name)).toBeNull();
  });
  it('絵文字はコードポイントで数え、10文字まで受け付ける', () => {
    expect(normalizeRankingName('🍺'.repeat(10))).toBe('🍺'.repeat(10));
  });
  it('JSTの前日は0時から5分未満だけ送れる', () => {
    const previous = score();
    expect(validateSubmission(previous, new Date('2026-11-07T15:04:59Z')).ok).toBe(true);
    expect(validateSubmission(previous, new Date('2026-11-07T15:05:00Z')).ok).toBe(false);
    expect(validateSubmission(previous, new Date('2026-11-06T15:00:00Z')).ok).toBe(true);
    expect(validateSubmission(previous, new Date('2026-11-06T14:59:59Z')).ok).toBe(false);
  });
  it.each([
    { date: '2026-02-30' }, { date: '2026-11-06' }, { difficulty: 'expert' },
    { conds: ['banquet', 'hiden'] }, { conds: [] }, { conds: ['x', 'x'] },
    { player: '' }, { player: 'other-player' }, { name: null },
    { score: -1 }, { score: '1000' }, { score: 1.5 }, { score: 100001 },
    { served: 151 }, { served: -1 }, { served: 0, score: 100 },
    { maxCombo: 36 }, { maxCombo: -1 }, { angry: -1 }, { angry: 301 },
    { accuracy: 1.01 }, { accuracy: -0.01 }, { accuracy: NaN },
    { kps: Infinity }, { kps: 15.01 }, { kps: -1 },
  ])('不正な値を拒否する: %j', invalid => {
    expect(validateSubmission(score(invalid), now).ok).toBe(false);
  });
  it.each([null, [], 'oops', {}, { score: 1 }])('壊れた本文を拒否する: %j', value => {
    expect(validateSubmission(value, now).ok).toBe(false);
  });
  it('何もできなかった営業の0点は送れる', () => {
    expect(validateSubmission(score({ score: 0, served: 0, maxCombo: 0, kps: 0, accuracy: 1 }), now).ok).toBe(true);
  });
  it.each([
    { score: 100000, served: 19, maxCombo: 0, kps: 0, accuracy: 0 },
    { score: 1000, served: 10, maxCombo: 0 },
    { score: 1000, served: 10, maxCombo: 5, kps: 0 },
    { score: 1000, served: 10, maxCombo: 5, accuracy: 0 },
    { score: 5000, served: 1, maxCombo: 1 },
    { score: 14000, served: 10, maxCombo: 1 },
  ])('皿数・コンボ・お題とつじつまの合わない記録を拒否する: %j', invalid => {
    expect(validateSubmission(score(invalid), now).ok).toBe(false);
  });
  it('売上上限は最大コンボの倍率に合わせ、上限ちょうどは受け付ける', () => {
    const base = { served: 20, maxCombo: 9, score: 13600 };
    expect(validateSubmission(score(base), now).ok).toBe(true);
    expect(validateSubmission(score({ ...base, score: 13601 }), now).ok).toBe(false);
    expect(validateSubmission(score({ ...base, maxCombo: 10, score: 20400 }), now).ok).toBe(true);
  });
  it('宴会とひでんのが重なる日は回数を含む上限まで受け付ける', () => {
    // 11/9は宴会+ひでんの。ふつうは宴会2回・ひでんの3回、最大倍率2。
    const base = { date: '2026-11-09', conds: ['banquet', 'hiden'], served: 20, maxCombo: 20, score: 36720 };
    const day = new Date('2026-11-09T03:00:00Z');
    expect(validateSubmission(score(base), day).ok).toBe(true);
    expect(validateSubmission(score({ ...base, score: 36721 }), day).ok).toBe(false);
  });
});

function memoryStore(): KeyValueStore {
  const data = new Map<string, string>();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => { data.set(key, value); }, removeItem: key => { data.delete(key); } };
}

describe('ランキングの端末設定', () => {
  it('端末IDを保持し、保存枠を分ける', () => {
    const mem = memoryStore();
    const first = new SaveStore(mem, 'test');
    const id = first.playerId();
    expect(id).toMatch(/^[\da-f]{8}(-[\da-f]{4}){3}-[\da-f]{12}$/);
    expect(new SaveStore(mem, 'test').playerId()).toBe(id);
    expect(new SaveStore(mem, 'another').playerId()).not.toBe(id);
  });
  it('保存できなくても同じ営業中に端末IDを作り直さない', () => {
    const store = new SaveStore({ getItem() { throw Error(); }, setItem() { throw Error(); }, removeItem() {} });
    expect(store.playerId()).toBe(store.playerId());
  });
  it('古い設定では名前は空欄で、保存した名前を次に使える', () => {
    const mem = memoryStore();
    const store = new SaveStore(mem);
    const settings = store.loadSettings();
    expect(settings.rankingName).toBe('');
    store.saveSettings({ ...settings, rankingName: 'おかみ' });
    expect(new SaveStore(mem).loadSettings().rankingName).toBe('おかみ');
  });
});

describe('やり直しに要る項目', () => {
  it.each([
    { seed: -1 }, { seed: 1.5 }, { seed: 2 ** 32 }, { record: 123 }, { record: 'abc' }, { record: '1a2' },
    { record: '1A' }, { record: '1a'.repeat(15001) }, { prep: { fish: 1 } }, { prep: [] },
    { prep: { fish: 1, meat: 1, veg: 1, mush: 1, ale: 1, spice: -1 } },
  ])('読めない記録を拒否する: %j', (bad) => {
    expect(validateSubmission(score(bad), now).ok).toBe(false);
  });
  it('仕込みのない日は null、ある日は6種類の数で受け取る', () => {
    const prep = { fish: 6, meat: 6, veg: 5, mush: 3, ale: 4, spice: 2 };
    const ok = validateSubmission(score({ prep }), now);
    expect(ok.ok && ok.value.prep).toEqual(prep);
    const none = validateSubmission(score({ prep: null }), now);
    expect(none.ok && none.value.prep).toBeNull();
  });
});

// 段階6：二つ名とプレート
describe('ランキングの飾り', () => {
  const ok = { titleFront: 'f-nonbiri', titleLink: 'na', titleBack: 'b-minarai', plate: 'p-kinari' };
  it('一覧にある飾りはそのまま、知らないものは捨てる', () => {
    expect(readDecoration(ok)).toEqual(ok);
    expect(readDecoration({ ...ok, titleFront: 'f-zzz' })).toEqual({ titleFront: null, titleLink: null, titleBack: null, plate: 'p-kinari' });
    expect(readDecoration({ ...ok, titleFront: 'b-minarai' }).titleFront).toBeNull();
    expect(readDecoration({ ...ok, titleLink: 'zz' }).titleBack).toBeNull();
    expect(readDecoration({ ...ok, plate: 'f-nonbiri' }).plate).toBeNull();
    expect(readDecoration(undefined)).toEqual({ titleFront: null, titleLink: null, titleBack: null, plate: null });
    expect(readDecoration('x')).toEqual({ titleFront: null, titleLink: null, titleBack: null, plate: null });
  });
  it('飾りのない古い送信も、知らない飾りの送信も受け付ける', () => {
    const old = validateSubmission(score(), now);
    expect(old.ok && old.value.decoration).toEqual({ titleFront: null, titleLink: null, titleBack: null, plate: null });
    const bad = validateSubmission(score({ decoration: { titleFront: 'f-zzz', plate: 'p-zzz' } }), now);
    expect(bad.ok).toBe(true);
    const good = validateSubmission(score({ decoration: ok }), now);
    expect(good.ok && good.value.decoration).toEqual(ok);
  });
});
