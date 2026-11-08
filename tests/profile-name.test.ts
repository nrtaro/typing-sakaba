// @vitest-environment jsdom
// プロフィールで名前を変え、結果画面では「ランキングに載せるか」を決める
import { afterEach, describe, expect, it, vi } from 'vitest';
vi.mock('../src/ui/sprites', () => ({ FAM: {}, PORTRAIT: {}, CRATE: {}, DEER: [], ICON: {}, MERCHANT: {}, RABBIT: [], WALKERS: [], guestSprite() {} }));
import { Game } from '../src/ui/game';
import { SaveStore } from '../src/core/save';
import { dailyConditions } from '../src/core/daily';

afterEach(() => { document.body.replaceChildren(); localStorage.clear(); });
function game() {
  const store = new SaveStore(localStorage, 'test');
  const submit = vi.fn(async () => ({ rank: 1, total: 1 }));
  const sound = new Proxy({}, { get: () => vi.fn() });
  const g = Object.assign(Object.create(Game.prototype) as Game, {
    store, settings: store.loadSettings(), sound, menu: { reset: vi.fn(), typed: '', active: [] }, mode: 'title', t: 0, missFlash: 0,
    recordsView: null, records: null, stickerArt: { load: vi.fn(), get: () => null }, nameEntry: null, imeHintAt: -10,
    sc: { canvas: { focus: vi.fn() } }, submission: { state: 'idle', receipt: null, message: '' },
    ranking: { submit, config: async () => ({ turnstile: null }), boards: vi.fn(async () => ({})), decorate: vi.fn() },
  }) as unknown as Game;
  return { g, store, submit };
}
const tick = () => new Promise((r) => setTimeout(r, 0));

describe('プロフィールの名前', () => {
  it('「きろく」の3つ目のタブは「プロフィール」', () => {
    const { g } = game();
    g.openRecords();
    expect(g.menuItems().map((i) => i.kana)).toEqual(['もどる', 'じっせき', 'しーる', 'ぷろふぃーる']);
  });
  it('名前の欄で Enter を押すと名前を変えられ、保存される', () => {
    const { g, store } = game();
    g.openRecords();
    g.setRecordsTab('decor');
    g.recordsView!.decorRow = 5;
    g.recordsKey('Enter');
    const input = document.querySelector('input')!;
    expect(document.querySelector('label')!.textContent).toContain('なまえ');
    input.value = 'おやじ';
    document.querySelector('form')!.requestSubmit();
    expect(g.settings.rankingName).toBe('おやじ');
    expect(store.loadSettings().rankingName).toBe('おやじ');
    expect(g.nameEntry).toBeNull();
  });
});

describe('結果画面：ランキングに載せる', () => {
  function result(g: Game) {
    Object.assign(g, { mode: 'result', result: {
      score: 1000, served: 10, maxCombo: 5, angry: 0, kps: 3, accuracy: 1, finishedAt: '', best: true, rank: 'A', title: '店主', trips: 1,
      difficulty: 'ふつう', difficultyId: 'normal', daily: { date: '2026-11-08', conds: dailyConditions('2026-11-08') }, play: { seed: 1, record: '0a', prep: null }, unlocked: [] } });
  }
  it('札は「載せる」（上の行で、ランキングに載せるかを聞く）', () => {
    const { g } = game();
    result(g);
    const main = g.menuItems()[0];
    expect([main.text, main.kana]).toEqual(['載せる', 'のせる']);
  });
  it('名前が決まっていれば、その名前のまま確かめて送る', async () => {
    const { g, submit } = game();
    g.settings.rankingName = '女将';
    result(g);
    g.openRankingName();
    await tick();
    const input = document.querySelector('input')!;
    expect(input.readOnly).toBe(true);
    expect(input.value).toBe('女将');
    document.querySelector('form')!.requestSubmit();
    await tick();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: '女将' }), null);
  });
  it('名前がまだなければ、ここで決めて送れる（プロフィールにも残る）', async () => {
    const { g, submit, store } = game();
    result(g);
    g.openRankingName();
    await tick();
    const input = document.querySelector('input')!;
    expect(input.readOnly).toBe(false);
    input.value = '看板娘';
    document.querySelector('form')!.requestSubmit();
    await tick();
    expect(submit).toHaveBeenCalledWith(expect.objectContaining({ name: '看板娘' }), null);
    expect(store.loadSettings().rankingName).toBe('看板娘');
  });
});
