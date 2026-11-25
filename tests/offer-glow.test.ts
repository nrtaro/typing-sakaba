// 繁盛記：選ぶ画面の光らせ方と、昨日の注文からの見込み（候補の出方は変えない）
import { describe, expect, it } from 'vitest';
import { Shop, type Guest } from '../src/core/shop';
import { Rng } from '../src/core/rng';
import { DISHES, DIFFICULTIES } from '../src/core/shopConfig';
import { NORMAL_RULES } from '../src/core/daily';
import { modsFor, type BuildStats } from '../src/core/build';
import { RomajiMatcher } from '../src/core/romaji';
import { closeDay, emptyMeta, estimateFor, glowFor, newRun, offersFor, readMeta } from '../src/core/run';
import { allMeta } from './runBot';

// 光らせ方を変える前（コミット 27125b3）の候補。種 1〜5 × 日 0〜3 × 持っている方針（なし／一発勝負と宵っ張り）
const BEFORE: string[] = ["add:hayakuchi,add:makanai,add:betsubara,add:tairyo","add:encho,add:betsubara,add:tema,add:tairyo","add:makanai,add:matome,add:aiso","up:ippatsu,add:oomori,up:yoippari","add:yoyaku,add:makanai,add:betsubara","add:encho,add:ryoshusho,up:ippatsu","add:mie,add:netsu,add:mouippai","up:yoippari,add:mouippai,add:matome","add:yoyaku,add:shikomi,add:omotenashi,add:tairyo","add:encho,add:shikomi,add:tsuyoki,add:nushi","add:makanai,add:yobikomi,add:encho","up:ippatsu,add:netsu,up:yoippari","add:tema,add:keiki,add:omotenashi","add:tema,add:shikomi,add:makanai","add:matome,add:yoyaku,add:yoippari","up:yoippari,add:keiki,up:ippatsu","add:keiki,add:omotenashi,add:mie,add:asaichi","add:hayakuchi,add:oomori,add:betsubara,add:matome","add:tairyo,add:yobikomi,add:makanai","up:ippatsu,add:mouippai,add:nushi","add:shikomi,add:tairyo,add:matome","add:yoyaku,add:matome,up:ippatsu","add:ooiri,add:yobikomi,add:shikomi","up:ippatsu,add:shikomi,add:yobikomi","add:omotenashi,add:matome,add:asaichi,add:encho","add:mie,add:shikomi,add:nushi,add:hayakuchi","add:keiki,add:tairyo,add:mouippai","add:yoyaku,add:sekkachi,up:ippatsu","add:encho,add:shikomi,add:omotenashi","add:hayakuchi,add:aiso,add:shikomi","add:keiki,add:tairyo,add:tsuyoki","add:yoyaku,add:asaichi,up:yoippari","add:tsuyoki,add:ryoshusho,add:matome,add:nushi","add:mie,add:matome,up:yoippari,add:oomori","add:sekkachi,add:shikomi,add:aiso","up:yoippari,add:ooiri,add:omotenashi","add:sekkachi,add:yobikomi,add:oomori","up:ippatsu,add:makanai,up:yoippari","add:tema,add:yobikomi,add:nushi","add:omotenashi,add:nushi,up:yoippari"];

describe('候補の出方', () => {
  it('光らせ方を変えても、同じ種・同じ日の候補は変わらない', () => {
    const out: string[] = [];
    for (const seed of [1, 2, 3, 4, 5]) for (const day of [0, 1, 2, 3]) for (const owned of [[], [{ id: 'ippatsu', lv: 1 }, { id: 'yoippari', lv: 1 }]] as const) {
      const meta = allMeta();
      const run = newRun(meta, seed, 'r1');
      run.day = day;
      run.owned = owned.map((o) => ({ ...o }));
      out.push(offersFor(run, meta, 0, 0).map((o) => `${o.kind}:${o.id}`).join(','));
    }
    expect(out).toEqual(BEFORE);
  });
});

describe('光らせ方', () => {
  it('全部の皿に効く方針は光らせない。目印が同じか、名前付きの組の相手なら光る', () => {
    expect(glowFor('tsuyoki', [{ id: 'aiso', lv: 1 }])).toBe(true);
    expect(glowFor('hayakuchi', [{ id: 'ippatsu', lv: 1 }])).toBe(true);
    expect(glowFor('tema', [{ id: 'yoippari', lv: 1 }])).toBe(true);
    expect(glowFor('tsuyoki', [{ id: 'ippatsu', lv: 1 }])).toBe(false);
    expect(glowFor('ippatsu', [{ id: 'tsuyoki', lv: 1 }])).toBe(false);
    expect(glowFor('mie', [{ id: 'makanai', lv: 1 }])).toBe(true);
    expect(glowFor('mouippai', [])).toBe(false);
  });

  it('名前付きの組・型の相手を持っていれば、全部の皿に効く方針でも光る（設計書 5.5）', () => {
    expect(glowFor('ippatsu', [{ id: 'yoyaku', lv: 1 }])).toBe(true);
    expect(glowFor('tsuyoki', [{ id: 'yoyaku', lv: 1 }])).toBe(true);
    expect(glowFor('yoyaku', [{ id: 'ippatsu', lv: 1 }, { id: 'ryoshusho', lv: 1 }])).toBe(true);
  });

  it('候補の札に glow が付く', () => {
    const meta = allMeta();
    const run = newRun(meta, 3, 'r1');
    run.day = 1;
    run.owned = [{ id: 'ippatsu', lv: 1 }];
    for (const o of offersFor(run, meta, 0, 0)) expect(o.glow).toBe(o.kind === 'up' ? false : glowFor(o.id, run.owned));
  });
});

const seen = (over: Partial<BuildStats['seen']> = {}): BuildStats['seen'] => ({ served: 40, long: 12, kinds2: 9, kinds3: 4, morning: 8, night: 20, tens: 3, fives: 6, ...over });

describe('昨日の注文からの見込み', () => {
  it('見て分かる条件の方針だけに出す。前の日がなければ出さない', () => {
    expect(estimateFor('hayakuchi', 1, null)).toBeNull();
    expect(estimateFor('hayakuchi', 1, seen())).toBe('昨日なら12皿が対象');
    expect(estimateFor('tema', 2, seen())).toBe('昨日なら13皿が対象');
    expect(estimateFor('yoippari', 1, seen())).toBe('昨日なら夜の20皿が対象');
    expect(estimateFor('asaichi', 1, seen())).toBe('昨日なら朝の8皿が対象');
    expect(estimateFor('keiki', 3, seen())).toBe('昨日なら6回、素材+48個');
    expect(estimateFor('keiki', 1, seen({ fives: 0 }))).toBe('昨日なら0回、素材+0個');
    expect(estimateFor('yoyaku', 3, seen())).toBeNull();
    expect(estimateFor('aiso', 3, seen())).toBeNull();
  });

  const dish = (id: string) => DISHES.find((d) => d.id === id)!;
  const guest = (id: string): Guest => ({ id: Math.random(), dish: dish(id), look: 0, wait: 20, maxWait: 30, state: 'wait', t: 0, lack: 0 });
  const shop = () => { const s = new Shop(new Rng(1), DIFFICULTIES[1], NORMAL_RULES, modsFor([])); for (const k of Object.keys(s.stock) as (keyof typeof s.stock)[]) s.stock[k] = 50; return s; };
  const serve = (s: Shop, id: string) => { s.seats[0] = guest(id); for (const ch of new RomajiMatcher(dish(id).kana).remaining) s.key(ch); s.drainEvents(); };

  it('方針がなくても、出した皿を数える（読みの長さ・素材の種類・時間帯・10皿）', () => {
    const s = shop();
    serve(s, 'vegSoup');
    serve(s, 'spicyPot');
    const v = s.buildStats.seen;
    expect(v.served).toBe(2);
    expect(v.long).toBe(2);
    expect(v.kinds3).toBe(1);
    expect(v.morning).toBe(2);
    for (let i = 0; i < 8; i++) serve(s, 'grilledFish');
    expect(s.buildStats.seen.tens).toBe(1);
    expect(s.buildStats.seen.fives).toBe(2);
    for (let i = 0; i < 9; i++) serve(s, 'grilledFish');
    for (let i = 0; i <= s.comboMissAllowance; i++) s.key('q');
    serve(s, 'grilledFish');
    expect(s.buildStats.seen.tens).toBe(1);
  });

  it('閉店で昨日の数を残し、古い保存データは null', () => {
    const meta = emptyMeta();
    const run = newRun(meta, 5, 'r1');
    meta.active = run;
    const build = { ...shop().buildStats, seen: seen() };
    closeDay(run, meta, { sales: 999999, served: 40, maxCombo: 12, angry: 0, build });
    expect(meta.active?.lastSeen ?? run.lastSeen).toEqual(seen());
    const raw = JSON.parse(JSON.stringify(meta));
    delete raw.active.lastSeen;
    expect(readMeta(raw).active?.lastSeen).toBeNull();
  });
});

describe('営業条件の相性', () => {
  it('新しい方針5つは、どれかの営業条件の相性に入っている。相性の中は方針の ID だけ', async () => {
    const { ROADS } = await import('../src/core/run');
    const { isPolicy } = await import('../src/core/build');
    for (const id of ['tsuyoki', 'keiki', 'tema', 'hayakuchi', 'yoippari'] as const) expect(ROADS.some((r) => r.good.includes(id)), id).toBe(true);
    for (const r of ROADS) for (const id of r.good) expect(isPolicy(id), `${r.name}:${id}`).toBe(true);
    expect(ROADS.find((r) => r.id === 'manin')!.good).toContain('tsuyoki');
    expect(ROADS.find((r) => r.id === 'ichi')!.good).toContain('keiki');
    expect(ROADS.find((r) => r.id === 'hashigo')!.good).toContain('tema');
    expect(ROADS.find((r) => r.id === 'sekkachi')!.good).toContain('hayakuchi');
    expect(ROADS.find((r) => r.id === 'enkai')!.good).toContain('yoippari');
  });
});
