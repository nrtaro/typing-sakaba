# 方針の見直し 第1段（守り・計測・小さく一通り） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 繁盛記の1皿の売上を「効いた倍率はぜんぶ掛け算、全部込みで×30まで」に作り替え、まとめ出し・大盛り上等・一発勝負の3つで、打った皿・ついでの皿・上限・札の予告まで一通り動かして、ボットで測る。

**Architecture:** 売上の計算を、店の状態を変えない見積もり `Shop.quote()` と、純粋な掛け算 `priceOf()`（新しい `src/core/dishPrice.ts`）に分ける。会計（`serveOne`）と札の予告は同じ `quote()` を使う。通常営業・ひがわり（`build === null`）の計算式と乱数の使い方には触れない。

**Tech Stack:** TypeScript、Vite、vitest。canvas の UI（`src/ui/shopView.ts`）。

**Spec:** `docs/superpowers/specs/2026-11-21-policy-multiply-design.md`（2026-11-22 ユーザー承認）。この計画は設計書 9. の手順1〜3にあたる。手順4〜7（残りの方針の書き直し、新しい方針5つ、かけ合わせ・型の扱いの仕上げ、画面の仕上げ、数値と目標の調整）は、Task 7 の測定結果を見てから次の計画に書く。

## Global Constraints

- 通常営業・ひがわり（`Shop.build === null`）の売上の式 `Math.round((g.dish.price + tip) * this.multiplier * special)` と、その手前の乱数の使い方・注文の作り方・丸めの順番を変えない。Task 1 の固定テストが最後まで通ること。
- 方針の ID（`PolicyId` の20個）、かけ合わせ・型のキー、報酬の ID は変えない。
- 調整する数値は `src/core/build.ts` か `src/core/dishPrice.ts` に名前付きの定数で置き、日本語のコメントで【日本語名】を書く：【1皿の倍率の上限】`MULT_CAP = 30`、【銀の枠の倍率】`PREVIEW_SILVER = 3`、【金の枠の倍率】`PREVIEW_GOLD = 10`。
- 上限は全部込み：方針の倍率・大盛り・コンボ・秘伝・宴会をすべて掛けた積を ×30 で止める。金額の上限は置かない。
- まとめ出しのついでの皿は、その皿自身の条件で計算する。打った腕前の倍率（一発勝負・連打の熱・おもてなし）は打った皿だけ。ついでの皿の ×0.6〜0.8 はやめる。
- コードのコメントと画面の文は、今のコードと同じく日本語。
- 単体テストは `npx vitest run --exclude "tests/*.sim.test.ts"`。`*.sim.test.ts` は長いので、決めたコマンドでだけ動かす。
- コミットはタスクごとにブランチ `policy-multiply` へ。メッセージの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。**push はしない**（main への push で自動公開されるため）。

## Review Focus

1. 注文の札は毎フレーム描くので、調達中・ミニゲーム中・席が空・お客が歩いている・食べている状態でも `quote()` が呼ばれる。`null` を返して落ちず、店の状態も乱数も変えない（Task 6 のテスト）。
2. 大盛りのお客がおかわりを頼んだら、2品目は大盛りではない（素材も倍率も普通）（Task 4 のテスト）。
3. 営業の途中で方針を入れ替えて `shop.build` が作り直されても、すでに出ている大盛りの注文は、約束した倍率と素材のまま（Task 4 のテスト）。
4. まとめ出しで、打った皿が素材を使い切り、ついでの皿が1枚も出ないとき、打った皿に「まとめ出し」の判子もかけ合わせの発見も付かず、`chain` のイベントも出ない（Task 5 のテスト）。
5. 倍率の積がちょうど ×30 のときは `capped` が false、×30 を超えたときだけ true で、宴会の皿も上限の中で止まる（Task 3 のテスト）。

---

## ファイルの分け方

| ファイル | 役目 | タスク |
|---|---|---|
| `src/core/dishPrice.ts`（新規） | 倍率の掛け算・上限・予告の段階。店の状態を知らない純粋な関数 | 3, 6 |
| `src/core/shop.ts` | `quote()`（見積もり）、`serveOne()`（会計の確定）、`serve()`（まとめ出しの順番）、大盛りの注文 | 3〜6 |
| `src/core/build.ts` | まとめ出しの `CHAIN_MULT` を外す。かけ合わせ・型の説明文を「発見」に直す | 3, 5 |
| `src/ui/shopView.ts` | 札の銀・金の枠、皿の上の判子と上限の印 | 6 |
| `tests/regression.test.ts`（新規） | 通常営業・ひがわりの結果の固定、古い保存データの読み込み | 1 |
| `tests/runBot.ts` | 日ごとの計測項目、狙う皿の選び方 | 2, 7 |
| `tests/policy.sim.test.ts`（新規） | 比べる元と、変えたあとの測定。`docs/balance/` に JSON を書く | 2, 7 |
| `tests/run.test.ts` | 今の方針のテストのうち、決まりが変わるものを直す | 3〜5 |

---

### Task 1: 通常営業・ひがわり・保存データを固定する

**Files:**
- Create: `tests/regression.test.ts`
- Create: `tests/__snapshots__/regression.test.ts.snap`（vitest が初回に書く）
- Commit も: `docs/superpowers/specs/2026-11-21-policy-multiply-design.md`、`docs/superpowers/specs/2026-11-21-policy-multiply-review-request.md`、この計画

**Interfaces:**
- Consumes: `botPlay(seed, diff, rules, kps, prep)`（`tests/bot.ts`、`PlaySession` を返す）、`rulesFor`・`CONDITIONS`（`src/core/daily.ts`）、`newRun`・`applyOffer`・`offersFor`・`closeDay`・`readMeta`・`earnedAchievements`・`emptyMeta`（`src/core/run.ts`）、`PAIRS`・`pairKey`（`src/core/build.ts`）
- Produces: なし（以降のタスクは、このテストを壊さないこと）

- [ ] **Step 1: 変える前のコードで、固定テストを書く**

```ts
// tests/regression.test.ts
describe('通常営業・ひがわりは方針の見直しで変わらない', () => {
  const cases: [string, DifficultyId, DayRules][] = [
    ['通常・やさしい', 'easy', NORMAL_RULES], ['通常・ふつう', 'normal', NORMAL_RULES], ['通常・むずかしい', 'hard', NORMAL_RULES],
    ['ひがわり・宴会', 'normal', rulesFor([CONDITIONS.banquet], 'normal', '2026-11-23')],
    ['ひがわり・おかわり', 'normal', rulesFor([CONDITIONS.refill], 'normal', '2026-11-23')],
    ['ひがわり・秘伝', 'normal', rulesFor([CONDITIONS.hiden], 'normal', '2026-11-23')],
  ];
  for (const [name, d, rules] of cases) it(name, () => {
    const out = [3, 17, 42].map((seed) => { const s = botPlay(seed, d, rules, 5); const st = s.shop.stats; return [s.shop.score, st.served, st.sales, st.tips, st.angry, s.record.length]; });
    expect(out).toMatchSnapshot();
  });
  it('秘伝と宴会の皿の金額（方針なし）', () => {
    // NORMAL_RULES に hiden: 1 を足した店で「ひでんの」を打ってから宴会のお客に出し、
    // gain が Math.round((price + tip) * multiplier * HIDEN_MULT * BANQUET_MULT) と一致すること
  });
});
describe('古い保存データ', () => {
  it('朝・営業中・閉店後・道中の4つの状態を読み直しても同じ', () => {
    // newRun → applyOffer で 'morning'、stage='open'、closeDay で 'closed'、道を選ぶ前の 'road' の4つを作る
    // 各 meta を JSON にして readMeta で読み、back.active が元と toEqual
  });
  it('34組を全部見つけた記録は、読み直しても残り、「秘伝の書」が取れている', () => {
    // meta.discovered = PAIRS.map((p) => pairKey(p.a, p.b))
    // readMeta 後も長さ 34、earnedAchievements(back) に 'run-discover-all' が入る
  });
});
```

- [ ] **Step 2: 動かして、スナップショットを書かせる**

Run: `npx vitest run tests/regression.test.ts`
Expected: PASS（初回は `tests/__snapshots__/regression.test.ts.snap` が作られる。中身の数字が0ばかりでないことを目で確かめる）

- [ ] **Step 3: もう一度動かして、同じ結果になることを確かめる**

Run: `npx vitest run tests/regression.test.ts`
Expected: PASS（スナップショットが書き換わらない）

- [ ] **Step 4: Commit**

```bash
git add tests/regression.test.ts tests/__snapshots__/regression.test.ts.snap docs/superpowers/specs/2026-11-21-policy-multiply-design.md docs/superpowers/specs/2026-11-21-policy-multiply-review-request.md docs/superpowers/plans/2026-11-23-policy-multiply-stage1.md
git commit -F <メッセージのファイル>   # 「繁盛記：方針の見直しの設計書と、通常営業・ひがわり・保存データの固定テスト」
```

---

### Task 2: ボットの計測を足し、比べる元を保存する

**Files:**
- Modify: `tests/runBot.ts`（`BotRun['days']` の項目、`botRun` の集計）
- Create: `tests/policy.sim.test.ts`
- Modify: `package.json`（`"sim:policy": "vitest run tests/policy.sim.test.ts --silent=false"`）
- Create: `docs/balance/2026-11-23-policy-multiply-before.json`（測定の出力）

**Interfaces:**
- Consumes: `botRun`、`prefer`、`RANDOM`、`BUILDS`（`tests/run.sim.test.ts` から export 済み）
- Produces:
  - `BotRun['days'][number]` に足す項目：`bestServe: number`（1皿の最高額）、`bestInput: number`（1回の入力で出た皿の合計の最高。まとめ出しがなければ1皿の額）、`feverSecs: number`（大入りだった秒数）、`blockedSecs: number`（待っているお客はいるのに、作れる皿が1つもない秒数。調達中は数えない）、`fired: Partial<Record<PolicyId, number>>`（`buildStats.fired` の写し）、`paid: number[]`（Task 7 で中身を入れる。ここでは空配列）、`capped: number`（同じく Task 7。ここでは0）
  - `tests/policy.sim.test.ts` の `SIM_SEEDS = [11, 23, 37, 41, 59, 67, 83, 97]` と `runSim(label: string, aim: 'urgent' | 'quote')`。出力 `docs/balance/2026-11-23-policy-multiply-<label>.json` は `{ seeds, rows: SimRow[] }`
  - `SimRow`：`{ strategy, kps, miss, think, loop, state: '初回' | '解放後', clear: number, reached: number[], ratio: number[], medianPaid: number | null, p95Paid: number | null, cappedRate: number | null, bestServeShare: number, bestInputShare: number, feverShare: number, blockedSecs: number, trips: number }`（`*Share` は日の売上に対する割合の最大、`feverShare` は営業時間に対する割合の平均）

- [ ] **Step 1: 項目が入ることを確かめるテストを書く**

```ts
// tests/run.test.ts の「ボット」の並びに足す
it('ボット：日ごとに、1皿・1回の入力の最高額、大入りの秒数、手が止まった秒数を数える', () => {
  const r = botRun(11, prefer('連鎖', ['matome', 'mouippai', 'betsubara']), 6.5, 0.04, 1, emptyMeta(), true);
  const d = r.days[0];
  expect(d.bestServe).toBeGreaterThan(0);
  expect(d.bestInput).toBeGreaterThanOrEqual(d.bestServe);
  expect(d.feverSecs).toBe(0);           // 大入り袋を持っていない
  expect(d.blockedSecs).toBeGreaterThanOrEqual(0);
  expect(d.fired.matome ?? 0).toBeGreaterThan(0);
  expect(d.paid).toEqual([]);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run tests/run.test.ts -t "手が止まった秒数"`
Expected: FAIL（`bestServe` が undefined）

- [ ] **Step 3: `botRun` に集計を足す**

`serve` イベントの `gain` で `bestServe`、`chain` イベントの `total` で `bestInput` を取る。`s.tick()` のたびに `shop.fever` なら `feverSecs += 1/60`、調達中でなく、待っている席があり、どれも `canMake` が空でないなら `blockedSecs += 1/60`。

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run tests/run.test.ts -t "ボット"`
Expected: PASS

- [ ] **Step 5: `tests/policy.sim.test.ts` を書く**

組み方は `[RANDOM, ...BUILDS]`。測る条件は次のとおり（速さは `[kps, miss, think]`）。
- 初回（`emptyMeta`）：のれん1で `[4.5, 0.06, 0.5]` と `[7, 0.04, 0.35]`
- 解放後（`run.sim.test.ts` の `allMeta` と同じ）：のれん1・3・5・6で `[4.5, 0.06, 0.5]` `[6.5, 0.04, 0.35]` `[9, 0.03, 0.25]`、のれん10・15・20で `[7, 0.04, 0.35]` `[9, 0.03, 0.25]` `[12, 0.02, 0.2]`

`clear` は `forceAll=false` の結果、`ratio`・`*Share` は `forceAll=true` の結果から出す。表を `console.log` し、JSON を `process.env.POLICY_SIM_LABEL ?? 'before'` の名前で書く。`it` の timeout は 3600000。

- [ ] **Step 6: 比べる元を測る（長いのでバックグラウンドで）**

Run: `POLICY_SIM_LABEL=before npm run sim:policy`
Expected: PASS。`docs/balance/2026-11-23-policy-multiply-before.json` ができる。初回・のれん1・4.5打/秒の少人数の店のクリア数が、Codex の測定（5/8）と大きく違わないことを確かめる（違えば、作戦や meta の違いを結果のメモに書く）。

- [ ] **Step 7: Commit**

```bash
git add tests/runBot.ts tests/run.test.ts tests/policy.sim.test.ts package.json docs/balance/2026-11-23-policy-multiply-before.json
git commit -F <メッセージのファイル>   # 「繁盛記：ボットの計測を足し、方針の見直しの前の結果を残す」
```

---

### Task 3: 掛け算と ×30 の上限（会計の芯）

**Files:**
- Create: `src/core/dishPrice.ts`
- Modify: `src/core/shop.ts`（`serveOne` の `build` がある側、`ShopEvent` の serve、`quote` を足す）
- Modify: `src/core/build.ts`（`pairText`・`setText` の文、`SET_BONUS`・`PAIR_STEP`・`pairBonus`・`PAIR_MAX` の扱い）
- Modify: `src/ui/runMode.ts`・`src/ui/hover.ts`（`SET_BONUS`・`PAIR_MAX` を使う所。売上の割合を出している文を消す）
- Test: `tests/dishPrice.test.ts`（新規）、`tests/run.test.ts`

**Interfaces:**
- Produces（`src/core/dishPrice.ts`）:
  ```ts
  /** 【1皿の倍率の上限】方針・大盛り・コンボ・秘伝・宴会をぜんぶ掛けた積をここで止める */
  export const MULT_CAP = 30;
  export type FactorId = PolicyId | 'combo' | 'hiden' | 'banquet' | 'big';
  export interface Factor { id: FactorId; mult: number }
  export interface Price { base: number; factors: Factor[]; raw: number; paid: number; capped: boolean; gain: number }
  export function priceOf(base: number, factors: Factor[]): Price
  ```
  `raw` は `factors` の `mult` の積（`mult === 1` のものは `factors` から外す）、`paid = Math.min(raw, MULT_CAP)`、`capped = raw > MULT_CAP`、`gain = Math.round(base * paid)`。
- Produces（`src/core/shop.ts`）:
  ```ts
  export interface QuoteCtx { chain: number; clean: boolean; saved: boolean }
  export type Quote = Price & { tags: PolicyId[] };
  /** 繁盛記：その席の注文を今出したらいくらか。店の状態も乱数も変えない。出せない席・build がないときは null */
  quote(seat: number, ctx: QuoteCtx): Quote | null
  ```
  - `base` = 値段 + チップ（営業条件の倍率・待たせない店・おもてなしを含む今の計算のまま）+ もう一杯の +円（今は足し算のまま。次の計画で倍率に直す）
  - `factors`：今の `mult` に入っている倍率（別腹・ヌシ・見栄・大入り・一発勝負・連打の熱）、`combo`（この皿でコンボが進んだあとの `multiplier`）、`hiden`、`banquet`。大盛りは、Task 3 の時点では今のまま `makeGuest` が値段に入れているので `factors` に足さない（Task 4 で倍率に移す）
  - 連打の熱は、今の時刻で出したら熱がいくつになるかを計算するだけで、`this.heat` は書き換えない
  - 見栄は、素材を使う前の在庫で判定する（今と同じ）
- serve イベントに足す項目：`base: number; raw: number; paid: number; capped: boolean; factors: Factor[]`。`pairMult` は消す。`pairs`（この皿で成立した名前付きの組の数）は残す。

- [ ] **Step 1: `priceOf` のテストを書く**

```ts
// tests/dishPrice.test.ts
it('倍率はぜんぶ掛け算で、×30 で止まる。ちょうど×30 は止まった扱いにしない', () => {
  expect(priceOf(100, [{ id: 'combo', mult: 2 }, { id: 'ippatsu', mult: 1.5 }])).toMatchObject({ raw: 3, paid: 3, capped: false, gain: 300 });
  expect(priceOf(100, [{ id: 'combo', mult: 3 }, { id: 'ippatsu', mult: 10 }])).toMatchObject({ raw: 30, paid: 30, capped: false, gain: 3000 });
  expect(priceOf(100, [{ id: 'combo', mult: 3.5 }, { id: 'ippatsu', mult: 10 }])).toMatchObject({ raw: 35, paid: 30, capped: true, gain: 3000 });
  expect(priceOf(80, [{ id: 'combo', mult: 1 }]).factors).toEqual([]);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run tests/dishPrice.test.ts`
Expected: FAIL（`dishPrice` がない）

- [ ] **Step 3: `src/core/dishPrice.ts` を書く**

- [ ] **Step 4: 店の会計のテストを書く**

```ts
// tests/run.test.ts の「方針のはたらき」に足す
it('掛け算：一発勝負とコンボが掛かり、かけ合わせ・型は売上を変えない', () => {
  // shopWith([{ id: 'ippatsu', lv: 3 }, { id: 'omotenashi', lv: 1 }], ['grilledFish']) で combo = 19 にしてからミスなく出す
  // ev.factors に ippatsu ×2.0 と combo ×1.5（20コンボ目）が入り、ev.gain === Math.round(ev.base * 2.0 * 1.5)
  // 名前付きの組『丁寧な仕事』（ippatsu+omotenashi）が成立しても、ev.paid === 3.0
});
it('上限：宴会の皿も含めて、倍率の積は×30 で止まる', () => {
  // 宴会のお客（banquet: true）に、一発勝負Lv3・ヌシLv3（とれたて中）・コンボ×3.5 の店で出す
  // ev.raw > 30、ev.paid === 30、ev.capped === true、ev.gain === Math.round(ev.base * 30)
});
it('見積もりと会計が1円まで一致する', () => {
  // quote(0, { chain: 0, clean: true, saved: false }) を取ってから、同じ席をミスなく打つ（まかないなし）
  // serve の gain === quote.gain、factors も同じ
});
```

あわせて、今の次のテストを新しい決まりに直す。
- 「かけ合わせ：名前付きの2つが同じ皿に効くと、1組につき売上が増える」→ 組が成立しても売上は同じで、発見（`buildStats.pairs`）には残る。
- 「型：3つがそろって打った皿に効くと、売上が大きく増え、初めてなら記録」→ 売上は変わらず、記録は残る。

- [ ] **Step 5: 失敗を確かめる**

Run: `npx vitest run tests/run.test.ts -t "掛け算|上限|見積もり"`
Expected: FAIL

- [ ] **Step 6: `quote()` を書き、`serveOne` の build がある側を `quote()` に置き換える**

`serveOne` の流れは次の順にする（通常営業側の分岐はそのまま）。
1. まかないの抽選（今と同じ位置で `brng` を引く）
2. `quote(seat, { chain, clean: this.wordMisses === 0, saved })`
3. 素材を使う → コンボ → 熱と `lastTypedAt` → 秘伝を消す → 統計・発見・振り返り

かけ合わせ・型の `bonus` の足し算は消し、発見と記録だけ残す。振り返りの `yen` は、今の「方針がなかった場合との差」の配り方のまま（作り直しは次の計画）。

- [ ] **Step 7: 説明文を直す**

`pairText` は「〜が同じ皿に効くと、その組を発見」、`setText` は「3つが同じ皿に効くと型が成立（売上は変わらない）」にする。`SET_BONUS`・`PAIR_STEP`・`pairBonus`・`PAIR_MAX` は消し、使っている UI（`runMode.ts`・`hover.ts`）から割合の文を外す。

- [ ] **Step 8: 全部のテストを確かめる**

Run: `npx vitest run --exclude "tests/*.sim.test.ts"`
Expected: PASS（`tests/regression.test.ts` のスナップショットも変わらない）

- [ ] **Step 9: Commit**

```bash
git add src/core/dishPrice.ts src/core/shop.ts src/core/build.ts src/ui/runMode.ts src/ui/hover.ts tests/dishPrice.test.ts tests/run.test.ts
git commit -F <メッセージのファイル>   # 「繁盛記：1皿の倍率をぜんぶ掛け算にし、全部込みで×30まで。かけ合わせ・型は発見だけに」
```

---

### Task 4: 大盛りを「今の注文」に持たせる

**Files:**
- Modify: `src/core/shop.ts`（`Guest`、`makeGuest`、おかわりの切り替え、`quote`）
- Modify: 大盛りの値段の書き換えに頼っている UI があれば合わせる（`grep -n "\.big" src/ui`）
- Test: `tests/run.test.ts`

**Interfaces:**
- Consumes: Task 3 の `quote`・`Factor`
- Produces: `Guest` に `bigMult?: number`（約束した大盛りの倍率）と `bigFrom?: 'policy' | 'road'`（`'policy'` は大盛り上等を持っていたとき、`'road'` は営業条件「大食いの日」だけのとき）。`g.dish` は素材だけ2倍にした写しで、`price` は書き換えない。`quote` は `g.big` のとき、`bigFrom === 'policy'` なら `{ id: 'oomori', mult: g.bigMult }`、`'road'` なら `{ id: 'big', mult: g.bigMult }` を足す。タグ `oomori` は `'policy'` のときだけ付ける。

- [ ] **Step 1: テストを書く**

```ts
it('大盛り：値段は書き換えず、倍率として掛かる。おかわりの2品目は普通の量と値段', () => {
  // 大盛り上等Lv3・別腹Lv3の店（bigChance と refillChance を 1 にした mods）で客を作る
  // g.dish.price === 元の料理の price、g.dish.need は2倍、g.bigMult === 3.3、g.bigFrom === 'policy'
  // 1品目の serve の factors に { id: 'oomori', mult: 3.3 }
  // おかわりに切り替わったあと：g.big が false、g.bigMult が undefined、g.dish.need は元のまま、2品目の factors に oomori がない
});
it('大食いの日の大盛りは会計に入るが、持っていない大盛り上等の判子は付かない', () => {
  // modsFor([], { bigChance: 1 }) の店：factors に { id: 'big', mult: 2 }、tags に 'oomori' がない、buildStats.fired.oomori は undefined
});
it('方針を入れ替えても、すでに出ている大盛りの注文は約束した倍率のまま', () => {
  // 大盛り上等Lv1（×2.4）で大盛りの客を作ったあと shop.build = modsFor([{ id: 'oomori', lv: 3 }])
  // その客の quote の oomori は 2.4
});
```

今の「大盛り上等：素材を2倍使い、売上が上がる…」のテストは、値段ではなく倍率を見るように直す。

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run tests/run.test.ts -t "大盛り|大食い"`
Expected: FAIL

- [ ] **Step 3: `makeGuest` とおかわりの切り替えを直す**

`makeGuest` は `bigMult = b.bigMult`、`bigFrom = levels.oomori ? 'policy' : 'road'` を入れ、`price` を書き換えない。`update` のおかわりの切り替え（`g.dish = g.extra`）で `big`・`bigMult`・`bigFrom` を消す。

- [ ] **Step 4: 全部のテストを確かめる**

Run: `npx vitest run --exclude "tests/*.sim.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/shop.ts tests/run.test.ts
git commit -F <メッセージのファイル>   # 「繁盛記：大盛りを注文に持たせ、おかわりと大食いの日を正しく数える」
```

---

### Task 5: まとめ出しを1皿ずつ確定する

**Files:**
- Modify: `src/core/shop.ts`（`serve`、`serveOne` の戻り値、`quote` のまとめ出し）
- Modify: `src/core/build.ts`（`CHAIN_MULT` と `BuildMods.chainMult` を消す。まとめ出しの効果の文を「ついでの皿も、その皿の条件で計算する」に）
- Test: `tests/run.test.ts`

**Interfaces:**
- Consumes: Task 3 の `quote`
- Produces: `serveOne(seat: number, chain: number): Extract<ShopEvent, { type: 'serve' }>`（積んだ serve イベントを返す。`chained` 引数はなくす）。`quote` は `chain > 0` のとき、`tags` に `matome` を入れ、一発勝負・連打の熱・おもてなしを入れない。

- [ ] **Step 1: テストを書く**

```ts
it('まとめ出し：ついでの皿は割り引かず、その皿の条件で計算する。打った腕前は打った皿だけ', () => {
  // まとめ出しLv2・一発勝負Lv3の店、grilledFish（打つ）と driedFish（ついで）をミスなく出す
  // 打った皿の factors に ippatsu、ついでの皿の factors に ippatsu がなく、ついでの皿の tags に matome
  // ついでの皿の gain === Math.round(ついでの皿の base * combo の倍率)（×0.6〜0.8 がない）
});
it('まとめ出し：打った皿で素材を使い切ったら、ついでの皿は出ず、判子も発見も付かない', () => {
  // まとめ出しLv3、stock.fish = 2、grilledFish と driedFish を待たせて grilledFish を打つ
  // serve は1つだけ、その tags に matome がない、chain イベントがない、buildStats.pairs にまとめ出しの組がない
});
it('まとめ出し：ついでの皿が実際に出たときだけ、打った皿にまとめ出しの判子が付く', () => {
  // ついでの皿が1枚出たら、打った皿の serve の tags に matome が入り、chain イベントの count は2
});
it('まとめ出し：1皿ずつ確定するので、ついでの皿のコンボは1皿ごとに進む', () => {
  // combo = 9 から、まとめ出しで3皿出す：打った皿は10コンボ目（combo ×1.5）、ついでの皿も ×1.5
});
```

今の「まとめ出し：ついでの皿は割安（単体では稼ぎすぎない）」のテストは消し、上の1つ目に置き換える。

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run tests/run.test.ts -t "まとめ出し"`
Expected: FAIL

- [ ] **Step 3: `serve` を直す**

打った皿を確定し、そのあと `chainSeats` の順に、その時点の在庫で出せる皿だけを1皿ずつ確定する。出した皿が2枚以上になったら、打った皿のイベントの `tags` に `matome` を足し、そのとき成立した名前付きの組を発見に足してから、`chain` イベントを積む。

- [ ] **Step 4: 全部のテストを確かめる**

Run: `npx vitest run --exclude "tests/*.sim.test.ts"`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/shop.ts src/core/build.ts tests/run.test.ts
git commit -F <メッセージのファイル>   # 「繁盛記：まとめ出しを1皿ずつ確定し、ついでの皿はその皿の条件で計算する」
```

---

### Task 6: 札の予告（銀・金）と、皿の上の判子

**Files:**
- Modify: `src/core/dishPrice.ts`（予告の段階）
- Modify: `src/ui/shopView.ts`（`drawOrderCard` の枠、serve イベントの表示）
- Test: `tests/dishPrice.test.ts`、`tests/run.test.ts`

**Interfaces:**
- Consumes: Task 3 の `quote`
- Produces（`src/core/dishPrice.ts`）:
  ```ts
  /** 【銀の枠の倍率】【金の枠の倍率】 */
  export const PREVIEW_SILVER = 3;
  export const PREVIEW_GOLD = 10;
  export type PreviewTier = 'none' | 'silver' | 'gold';
  export function previewTier(paid: number): PreviewTier   // paid < 3 → none、3以上 → silver、10以上 → gold
  ```

- [ ] **Step 1: テストを書く**

```ts
// tests/dishPrice.test.ts
it('予告の段階：×3未満はなし、×3から銀、×10から金', () => {
  expect([2.99, 3, 9.99, 10, 30].map(previewTier)).toEqual(['none', 'silver', 'silver', 'gold', 'gold']);
});
// tests/run.test.ts
it('見積もりは、何回呼んでも営業の結果を変えない', () => {
  // 「同じ種・同じ入力なら、方針つきの営業も同じ結果になる」と同じ手順で2回営業する
  // 片方だけ、毎刻みすべての席に quote(i, { chain: 0, clean: true, saved: false }) を呼ぶ
  // score・served・record の長さ・buildStats が一致する
});
it('見積もりは、空いた席・歩いている客・食べている客・調達中・build なしでは null', () => {
  // それぞれの状態で quote(0, ...) === null。例外を出さない
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run tests/dishPrice.test.ts tests/run.test.ts -t "予告|見積もり"`
Expected: FAIL

- [ ] **Step 3: `previewTier` を書き、`quote` の null の条件を確かめる**

- [ ] **Step 4: 画面を直す**

- `drawOrderCard`：繁盛記のときだけ、`previewTier(shop.quote(i, { chain: 0, clean: true, saved: false })?.paid ?? 0)` で枠を変える。銀は銀色の枠を1px太く、金は金色の枠を2px太くし、四隅に2px の角飾りを付ける（色が見分けにくい人のため、太さと角でも分かるように）。今の「打っている」「素材が足りない」の枠の色が先に勝つ。
- serve イベントの表示：「かけ合わせ ×」「型！ ×」の文をやめ、判子（`POLICY_SEAL`、最大4個）を `・` でつないで出す。`capped` のときは最後に「上限」を付ける。ついでの皿（`chain > 0`）は金額だけにする。型・かけ合わせを初めて見つけたときの `pairNote` はそのまま。

- [ ] **Step 5: プレビューで目で確かめる**

`My_App/.claude/launch.json` の `sakaba-build`（ポート5290）の設定を、この worktree を開くように確かめてから `preview_start`。`?slot=policy-check` の別の保存枠で繁盛記を始め、夜の満席で次を見る。
- 銀・金の枠が出る
- 打つ言葉の文字が読める
- 判子が隣の席の札にかからない

スクリーンショットを残す。ユーザーも使うタブには触れない。

- [ ] **Step 6: 全部のテストを確かめる**

Run: `npx vitest run --exclude "tests/*.sim.test.ts"`
Expected: PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/dishPrice.ts src/ui/shopView.ts tests/dishPrice.test.ts tests/run.test.ts
git commit -F <メッセージのファイル>   # 「繁盛記：注文の札に倍率の予告（銀・金）を出し、皿の上は判子と上限の印だけに」
```

---

### Task 7: 新しい会計をボットで測り、結果を残す

**Files:**
- Modify: `tests/runBot.ts`（狙う皿の選び方、`paid`・`capped` の集計）
- Modify: `tests/policy.sim.test.ts`（`aim` を両方測る）
- Create: `docs/balance/2026-11-23-policy-multiply-slice.json`
- Create: `docs/balance/2026-11-23-policy-multiply-slice.md`（結果のまとめ）

**Interfaces:**
- Consumes: Task 2 の `SimRow`・`runSim`、Task 3 の serve イベントの `paid`・`capped`、`Shop.quote`
- Produces: `botRun(seed, strat, kps, missRate, loop?, meta?, forceAll?, think?, aim: 'urgent' | 'quote' = 'urgent')`。`'quote'` は、作れる皿のうち、残りの待ち時間が【予告で選ぶときの余裕】3秒以上ある皿の中から `quote().gain` がいちばん高い皿を狙う。なければ今と同じく、いちばん急ぐ皿を狙う。

- [ ] **Step 1: テストを書く**

```ts
it('ボット：予告で選ぶと、同じ種でも狙う皿が変わり、倍率の記録が入る', () => {
  const a = botRun(11, prefer('一発', ['ippatsu', 'oomori', 'matome']), 6.5, 0.04, 1, emptyMeta(), true, 0.4, 'urgent');
  const b = botRun(11, prefer('一発', ['ippatsu', 'oomori', 'matome']), 6.5, 0.04, 1, emptyMeta(), true, 0.4, 'quote');
  expect(a.days[0].paid.length).toBe(a.days[0].served);
  expect(b.days[0].sales).not.toBe(a.days[0].sales);
  expect(Math.max(...b.days[0].paid)).toBeLessThanOrEqual(30);
});
```

- [ ] **Step 2: 失敗を確かめる**

Run: `npx vitest run tests/run.test.ts -t "予告で選ぶ"`
Expected: FAIL

- [ ] **Step 3: `botRun` に `aim` と `paid`・`capped` の集計を足す**

`paid` は serve イベントの `paid`（通常営業側ではない）。`capped` はその日に `capped === true` だった皿の数。

- [ ] **Step 4: 通ることを確かめる**

Run: `npx vitest run tests/run.test.ts -t "ボット"`
Expected: PASS

- [ ] **Step 5: 測る（長いのでバックグラウンドで）**

Run: `POLICY_SIM_LABEL=slice npm run sim:policy`
Expected: PASS。`docs/balance/2026-11-23-policy-multiply-slice.json` ができる（`aim` は `urgent` と `quote` の両方）。

- [ ] **Step 6: 結果をまとめる**

`docs/balance/2026-11-23-policy-multiply-slice.md` に、before と slice を同じ条件で並べた表を書く。中身は次のとおり。
- クリア数
- 日ごとの達成率
- 皿の倍率の中央値・上位5%・上限に届いた割合
- 1皿・1回の入力が日の売上に占める最大の割合
- 手が止まった秒数

あわせて、設計書 8. の目安と比べて外れているものを箇条書きにする。特に次の2つは必ず書く。
- 初回・のれん1・4.5打/秒の少人数の店が 5/8 から変わったか
- 予告で選ぶと売上が増えるか（「判断が報われる」か）

まだ書き直していない17の方針は今の効果のままなので、その影響も書き添える。

- [ ] **Step 7: 全部のテストを確かめる**

Run: `npx vitest run --exclude "tests/*.sim.test.ts"`
Expected: PASS

- [ ] **Step 8: Commit**

```bash
git add tests/runBot.ts tests/run.test.ts tests/policy.sim.test.ts docs/balance/2026-11-23-policy-multiply-slice.json docs/balance/2026-11-23-policy-multiply-slice.md
git commit -F <メッセージのファイル>   # 「繁盛記：新しい会計をボットで測り、変える前と比べた結果を残す」
```

---

## この計画でやらないこと（次の計画）

- 残り17の方針の書き直し（倍率の付与、もう一杯・おもてなし・待たせない店の足し算をやめる、見栄の「残っている素材のうち」、大入りの「10皿ごと」など）と、新しい方針5つ
- かけ合わせ・型の「効いた」の決め方の変更（持っているだけ → 倍率が乗ったとき）、景気づけ・まかないの発見
- `BuildStats.yen` の作り直し（実際に増えた分を対数の比で配る）
- 選ぶ画面の光らせ方と見込み、×10 以上の式の帯、ずかん・ホバーの文の仕上げ
- 数値の調整、目標の決め直し、実績の取りやすさの見直し
