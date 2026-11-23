# 方針の見直し 第2段（今の20の方針の書き直し） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 今の20の方針を、設計書 5.2 の「新しい効果」に書き直す。足し算（チップ・+円）の方針を倍率に直し、持っているだけの方針にも「その皿に効く倍率」を付ける。ボットで測り、皿の倍率とクリア数を設計書 8. の目安に近づける。

**Architecture:** 第1段で作った `Shop.quote()`（店の状態を変えない見積もり）に、方針ごとの倍率を `factors` として足していく。数値は `src/core/build.ts` の段階ごとの定数（`L(a, b, c)`）と `BuildMods` に置く。会計（`serveOne`）は `quote` の額で確定するだけなので、方針を足しても会計の流れは変えない。

**Tech Stack:** TypeScript、vitest。

**Spec:** `docs/superpowers/specs/2026-11-21-policy-multiply-design.md`（2026-11-22 承認）。前段の結果は `docs/balance/2026-11-23-policy-multiply-slice.md`。この計画は設計書 9. の手順4のうち「残りの方針の書き直し」にあたる。新しい方針5つ、かけ合わせ・型の「効いた」の決め方、画面の仕上げ、目標の調整は、次の計画（第3〜5段）。

## Global Constraints

- 通常営業・ひがわり（`Shop.build === null`）の計算と乱数の使い方は変えない。`tests/regression.test.ts` のスナップショットが最後まで通ること。
- 方針の ID（20個）、かけ合わせ・型のキーは変えない。
- 倍率の決め方の軸（設計書 5.1）：全部の皿に効く方針は【全皿の倍率】×1.1〜1.3（時間を限るものは高めでよい）、4〜7割の皿に効く方針は【広い条件の倍率】×1.3〜1.8、1〜3割の皿に効く方針は【せまい条件の倍率】×2〜4。5.2 の表の値は最初の仮の値で、Task 5 の測定で決め直す。
- 上限は全部込みで `MULT_CAP = 30`。金額の上限は置かない。
- 打った腕前の倍率（一発勝負・連打の熱・おもてなし）は打った皿だけ。ほかの条件は、まとめ出しのついでの皿にもその皿の条件で効く。
- 効果の文は「〇〇の皿は ×いくつ」の一文にそろえる。新しい字を使ったら `npm run font-text` で作り直す。ゲームの中の言い方（「ずかん」など、ひらがなの語）に合わせる。
- 単体テストは `npx vitest run --exclude "tests/*.sim.test.ts"`。コミットはタスクごとに `policy-multiply` へ。メッセージの最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。**push しない**。

## Review Focus

1. 全部の素材が0個のとき、見栄の「残っている素材のうち一番少ない素材」は空で、どの皿にも見栄が付かず、落ちない（Task 4 のテスト）。
2. 大入りの「コンボを切らさずに10皿」は、ミスでコンボが切れたときも、怒って帰ってコンボが切れたときも数え直す。ただし看板娘Lv3でコンボが続くときは数え直さない（Task 3 のテスト）。
3. 延長営業の倍率は、延長のあいだ（閉店時刻を過ぎて `extra` 秒）だけ付き、延長のない日や延長前には付かない（Task 3 のテスト）。
4. 仕込みたての15秒は、朝・昼・夜それぞれの時間帯のはじめから数え、営業の途中で方針を取っても、その時間帯のはじめから数える（Task 4 のテスト）。
5. もう一杯は、酒が0個のときは付かず、酒の料理には付かない。ついでの皿でも、その皿で酒を1つ使う（Task 2 のテスト）。

---

## ファイルの分け方

| ファイル | 役目 | タスク |
|---|---|---|
| `src/core/build.ts` | 方針の段階ごとの値、効果の文、`BuildMods`、`modsFor` | 1〜4 |
| `src/core/shop.ts` | `quote()` に倍率を足す。大入りの数え方、見栄の素材、会計と表示の見積もりの分け方 | 1〜4 |
| `src/ui/shopView.ts` | 見栄の表示（`lowMult`）、金の枠の色 | 1, 4 |
| `src/ui/runMode.ts` | 「×30まで」の文を `MULT_CAP` から作る | 1 |
| `src/core/dishPrice.ts` | `capped` の誤差の余裕 | 1 |
| `tests/run.test.ts` | 方針ごとのテスト | 1〜4 |
| `tests/runBot.ts`、`tests/policy.sim.test.ts` | 予告で選ぶ基準、1皿の割合の数え方 | 5 |
| `docs/balance/` | 第2段の測定と調整の記録 | 5 |

---

### Task 1: 会計まわりの片付け（第1段の後回しの分）

**Files:**
- Modify: `src/core/shop.ts`、`src/core/dishPrice.ts`、`src/ui/runMode.ts`、`src/ui/shopView.ts`
- Test: `tests/dishPrice.test.ts`、`tests/run.test.ts`

**Interfaces:**
- Produces:
  - `Shop.price(seat: number, ctx: QuoteCtx): Quote | null`（private）：会計用。調達中かどうかを見ない。build がない・席が wait でないときは null。
  - `Shop.quote(seat, ctx)`：表示用。調達中は null、それ以外は `price()` と同じ。
  - `serveOne(seat: number, chain: number): ServeEvent`（`record` 引数をなくす）。発見の記録はいつも `serve()` が行う（build がないときは何もしない）。
  - `priceOf` の `capped` は `raw > MULT_CAP + 1e-9`、`paid` は `Math.min(raw, MULT_CAP)`。

- [ ] **Step 1: テストを書く**

```ts
// tests/dishPrice.test.ts
it('上限の判定は小数の誤差で止まった扱いにしない', () => {
  expect(priceOf(100, [{ id: 'combo', mult: 3 }, { id: 'ippatsu', mult: 10.000000000000002 }]).capped).toBe(false);
});
// tests/run.test.ts
it('会計は調達中でも方針の倍率で数える（表示の見積もりだけが調達中に null）', () => {
  // shopWith([{ id: 'ippatsu', lv: 3 }], ['grilledFish']) で s.away を立て、(s as any).serveOne(0, 0) を呼ぶ
  // serve イベントの factors に ippatsu があり、s.quote(0, ctx) は null（呼ぶ前に確かめる）
});
it('説明文の上限の数字は MULT_CAP から作る', () => {
  // readFileSync('src/ui/runMode.ts') に '×30まで' の直書きがなく、'MULT_CAP' を含む
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/dishPrice.test.ts tests/run.test.ts -t "誤差|調達中でも|MULT_CAP"` / Expected: FAIL

- [ ] **Step 3: 直す**
  - `price` / `quote` を分ける。
  - `record` 引数を消す。
  - `capped` の余裕を足す。
  - runMode の文を `` `…（全部込みで×${MULT_CAP}まで）。` `` にする。
  - 金の枠の色を `C.gold` から `'#ffe27a'` に変え、打っている札の縁（`C.gold`）と分ける。

- [ ] **Step 4: 全部のテスト** — Run: `npx vitest run --exclude "tests/*.sim.test.ts"` / Expected: PASS

- [ ] **Step 5: Commit**（「繁盛記：会計用と表示用の見積もりを分け、上限の判定と文を整える」）

---

### Task 2: 客あしらいの方針（もう一杯・呼び込み・看板娘・おもてなし）

**Files:**
- Modify: `src/core/build.ts`、`src/core/shop.ts`
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces（`build.ts` の段階ごとの値と `BuildMods` の項目）:

| 方針 | 定数（Lv1→Lv3） | `BuildMods` | 条件（`price()` の中） |
|---|---|---|---|
| もう一杯 | `ALE_MULT = L(1.3, 1.5, 1.8)`（`ALE_ADD` を消す） | `aleMult`（1 は持っていない。`aleAdd` を消す） | 酒以外の料理で、酒が1つ以上ある。会計で酒を1つ使う |
| 呼び込み | `FULL_MULT = L(1.2, 1.3, 1.5)`（`GUESTS` はそのまま） | `fullMult` | 8席すべてにお客がいる（状態は問わない） |
| 看板娘 | `LATE_MULT = L(1.5, 1.8, 2.2)`、`LATE_RATIO = 0.5`（`WAIT` はそのまま） | `lateMult` | 待ち時間の残りが `LATE_RATIO` 未満のお客の皿 |
| おもてなし | `IDLE_MULT = L(1.6, 2.0, 2.5)`（`IDLE_TIP` を消す。`IDLE_MIN = 2` は残し、`IDLE_MAX` は消す） | `idleMult`（`idleTip` を消す） | 打った皿で、前の皿から `IDLE_MIN` 秒以上あいた |

  - 効果の文（`text` と `vals`）は設計書 5.2 の「新しい効果」に合わせる。例：おもてなし「前の皿から2秒以上あけて打った皿は売上×{0}（ついでの皿には付かない）」。
  - `fires` は呼び込み・看板娘も `true` にしない（かけ合わせの「持っているだけ」の扱いは第3段で変える）。

- [ ] **Step 1: テストを書く**（今の「予約のみ：…／おもてなし：間があくほどチップが増える」のおもてなしの部分は、倍率の確かめに置き換える）

```ts
it('もう一杯：酒以外の料理に酒を付けた皿が×1.5（Lv2）。酒が0個・酒の料理には付かない', () => {
  // shopWith([{ id: 'mouippai', lv: 2 }], ['grilledFish', 'ale']) で焼き魚：factors に { id: 'mouippai', mult: 1.5 }、stock.ale が1減る
  // エール：factors に mouippai がない。stock.ale = 0 にした別の店の焼き魚：mouippai がない
});
it('もう一杯：まとめ出しのついでの皿でも、その皿で酒を1つ使って付く', () => {
  // まとめ出しLv1・もう一杯Lv1、grilledFish と driedFish：2皿とも mouippai ×1.3、stock.ale が2減る
});
it('呼び込み：8席が埋まっているあいだ、全部の皿が×1.3（Lv2）', () => {
  // 8席すべてに客（7席は walk）：factors に { id: 'yobikomi', mult: 1.3 }。1席空けた店では付かない
});
it('看板娘：待ち時間が半分を切ったお客の皿が×1.8（Lv2）', () => {
  // wait 14 / maxWait 30 の客：{ id: 'aiso', mult: 1.8 }。wait 16 の客には付かない
});
it('おもてなし：前の皿から2秒以上あけて打った皿が×2.0（Lv2）。ついでの皿には付かない', () => {
  // s.clock = 5、lastServeAt = 0：{ id: 'omotenashi', mult: 2 }。clock 1.5 では付かない。まとめ出しのついでの皿には付かない
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/run.test.ts -t "もう一杯|呼び込み|看板娘：待ち|おもてなし"` / Expected: FAIL

- [ ] **Step 3: `build.ts` の値・文・`modsFor`、`shop.ts` の `price()` を直す**（足し算の `add` と、おもてなしのチップの上乗せは消す。`base` は 値段＋チップ）

- [ ] **Step 4: 全部のテスト** — Run: `npm run font-text` のあと `npx vitest run --exclude "tests/*.sim.test.ts"` / Expected: PASS

- [ ] **Step 5: Commit**（「繁盛記：もう一杯・呼び込み・看板娘・おもてなしを皿の倍率に書き直す」）

---

### Task 3: 勢いの方針（待たせない店・予約のみ・大入り袋・延長営業）

**Files:**
- Modify: `src/core/build.ts`、`src/core/shop.ts`
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:

| 方針 | 定数 | `BuildMods` | 条件 |
|---|---|---|---|
| 待たせない店 | `QUICK_MULT = L(1.5, 1.8, 2.2)`（`QUICK_TIP` を消す。`QUICK_RATIO = 0.7` は残す） | `quickMult`（`quickTip` を消す） | 待ち時間の残りが `QUICK_RATIO` 以上 |
| 予約のみ | `YOYAKU_MULT = L(1.4, 1.6, 1.8)`（`FEWER`・`COMBO_PLUS` はそのまま） | `yoyakuMult` | 全部の皿 |
| 大入り袋 | 値はそのまま。`FEVER_EVERY = 10` は「コンボを切らさずに出した皿の数」 | — | `Shop.feverCount`：皿を出すたびに +1、10 で大入りを始めて 0 に戻す。コンボが切れたら 0 |
| 延長営業 | `EXTEND_MULT = L(1.5, 1.8, 2.2)` | `extendMult` | `this.extra > 0 && this.clock >= DAY_LENGTH` |

  - `Shop.feverCount: number`（public、初期値0）。コンボが切れる場所（ミスでの `comboBreak`、怒って帰ったときの `combo = 0`）で 0 に戻す。
  - 大入りの判定は、`serveOne` の今の「`Math.floor(combo / FEVER_EVERY)` が増えたら」を、`feverCount` に置き換える。

- [ ] **Step 1: テストを書く**（今の「領収書はいらない：…／大入り袋：10コンボごとに大入り」と「予約のみ：1皿でコンボがよけいに進む…」を直す）

```ts
it('待たせない店：待ち時間が7割以上残っているお客の皿が×1.8（Lv2）', () => {
  // wait 21/30：{ id: 'sekkachi', mult: 1.8 }。wait 20/30：付かない。チップは倍にならない（base は値段＋普通のチップ）
});
it('予約のみ：全部の皿が×1.6（Lv2）。1皿でコンボが3進む', () => {
  // factors に { id: 'yoyaku', mult: 1.6 }、combo が 3
});
it('大入り袋：コンボを切らさずに10皿出すと大入り。予約のみでコンボが速く進んでも、皿の数で数える', () => {
  // 予約のみLv3・大入り袋Lv1：9皿出しても大入りでない（combo は 36）。10皿目で fever イベント、11皿目に ooiri ×1.3
});
it('大入り袋：ミスや怒って帰ってコンボが切れたら数え直す。看板娘Lv3でコンボが続くときは数え直さない', () => {
  // 5皿出してからコンボが切れる → feverCount が 0
  // 看板娘Lv3で客が怒って帰る → feverCount はそのまま
});
it('延長営業：延長のあいだだけ、全部の皿が×1.8（Lv2）', () => {
  // 閉店前：付かない。combo 30 で閉店を越え、extra が付いたあと：{ id: 'encho', mult: 1.8 }
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/run.test.ts -t "待たせない|予約のみ|大入り袋|延長営業"` / Expected: FAIL

- [ ] **Step 3: 直す**（効果の文も設計書 5.2 に合わせる。大入り袋は「コンボを切らさずに10皿出すごとに…」）

- [ ] **Step 4: 全部のテスト** — Run: `npm run font-text` のあと `npx vitest run --exclude "tests/*.sim.test.ts"` / Expected: PASS

- [ ] **Step 5: Commit**（「繁盛記：待たせない店・予約のみ・大入り袋・延長営業を皿の倍率に書き直す」）

---

### Task 4: 調達と台所の方針（ヌシ・大漁旗・朝市・見栄・まかない・仕込み）

**Files:**
- Modify: `src/core/build.ts`、`src/core/shop.ts`、`src/ui/shopView.ts`（見栄の表示）
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:

| 方針 | 定数 | `BuildMods` | 条件 |
|---|---|---|---|
| さっきのヌシ | `FRESH_MULT = L(1.5, 1.8, 2.2)`（秒数はそのまま） | 今のまま | 今のまま |
| 大漁旗 | `PLENTY_MULT = L(1.3, 1.5, 1.8)`、`PLENTY_AT = 8` | `plentyMult` | 料理の主素材（`Shop.mainOf`）が、素材を使う前に `PLENTY_AT` 個以上ある |
| 朝市 | `MORNING_MULT = L(1.5, 1.8, 2.2)` | `morningMult` | `phaseIndex === 0` |
| おやじの見栄 | `LOW_MULT = L(2.0, 2.5, 3.0)` | 今のまま | `scarcest()` を「1個以上ある素材のうち一番少ないもの（同じ数なら全部）」に変える。1個以上ある素材がなければ空 |
| まかない名人 | `SAVE_MULT = L(1.2, 1.4, 1.6)` | `saveMult` | `ctx.saved`（素材が減らなかった皿）。予告では付けない |
| こまめな仕込み | `PREP_MULT = L(1.3, 1.5, 1.8)`、`PREP_SECS = 15` | `prepMult` | 今の時間帯のはじめから `PREP_SECS` 秒未満 |

  - 時間帯のはじめの時刻は、`PHASES` の長さの和から出す（`Shop.phaseStart: number` の getter を足す）。
  - 見栄の表示（`shopView.ts` の `見栄×…`）は、新しい `scarcest()` に合わせて、0個の素材には出さない。

- [ ] **Step 1: テストを書く**（今の「おやじの見栄：いま一番少ない素材を使う皿だけ…」「さっきのヌシ…」「朝市…」を直す）

```ts
it('さっきのヌシ：とれたてのあいだ全部の皿が×1.8（Lv2）', () => { /* factors に { id: 'nushi', mult: 1.8 } */ });
it('大漁旗：主素材が8個以上ある皿が×1.5（Lv2）', () => {
  // stock.fish = 8 の焼き魚：{ id: 'tairyo', mult: 1.5 }。stock.fish = 7：付かない
});
it('朝市：朝の時間帯の皿が×1.8（Lv2）。昼には付かない', () => { /* clock 10 で付く、clock 60 で付かない */ });
it('おやじの見栄：残っている素材のうち一番少ない素材の皿が×2.5（Lv2）。0個の素材は数えない', () => {
  // stock：魚 0・肉 2・ほか 10 → scarcest() は ['meat']。ジャーキーに { id: 'mie', mult: 2.5 }
  // 全部の素材が 0 → scarcest() は []
});
it('まかない名人：素材が減らなかった皿が×1.4（Lv2）。予告には付かない', () => {
  // saveChance 1 にした mods：serve の factors に { id: 'makanai', mult: 1.4 }、quote には makanai がない
});
it('こまめな仕込み：時間帯のはじめの15秒、全部の皿が×1.5（Lv2）。昼のはじめからも数える', () => {
  // clock 10：付く。clock 20：付かない。clock 55（昼が50秒で始まって5秒）：付く
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/run.test.ts -t "ヌシ|大漁旗|朝市|見栄|まかない|仕込み"` / Expected: FAIL

- [ ] **Step 3: 直す**（効果の文も設計書 5.2 に合わせる）

- [ ] **Step 4: 全部のテスト** — Run: `npm run font-text` のあと `npx vitest run --exclude "tests/*.sim.test.ts"` / Expected: PASS（今の方針の一覧のテスト「方針は20種類。段階ごとの値があり…」もそのまま通ること）

- [ ] **Step 5: Commit**（「繁盛記：調達と台所の方針を皿の倍率に書き直し、見栄は0個の素材を数えない」）

---

### Task 5: 測って、倍率を決め直す

**Files:**
- Modify: `tests/runBot.ts`（予告で選ぶ基準）、`tests/policy.sim.test.ts`（1皿の割合の数え方）
- Modify: `src/core/build.ts`（調整した値）
- Create: `docs/balance/2026-11-23-policy-multiply-stage2.json`、`docs/balance/2026-11-23-policy-multiply-stage2.md`
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:
  - `pickBy === 'quote'` は、余裕のある皿のうち `paid`（倍率）が高い皿を選び、同じなら `gain` が高い皿を選ぶ。
  - `SimRow` に `bestServeShareMid: number` と `bestInputShareMid: number` を足す。どちらも、目標の3割以上を売った日だけで出した中央値。今の `bestServeShare` / `bestInputShare` も、目標の3割以上を売った日だけで数える。

- [ ] **Step 1: テストを直す** — 「ボット：予告で選ぶと…」に `b.days[0].paid` の中央値が `a.days[0].paid` の中央値以上であることを足す。Run で FAIL を確かめてから、`runBot.ts` を直して PASS。

- [ ] **Step 2: 1回目の測定** — Run: `POLICY_SIM_LABEL=stage2 POLICY_SIM_AIMS=urgent,quote npm run sim:policy`（バックグラウンド） / Expected: PASS、JSON ができる

- [ ] **Step 3: 目安と比べて、倍率を決め直す**

目安（設計書 8.）：
- 皿の倍率の中央値 ×3〜6、上位5% ×15 以上、上限に届く皿 3% 以下
- 1皿の割合の中央値 5% 以下
- 強い組み方の1日の売上が、でたらめの2〜3倍
- 変える前（`before.json`）と同じくらいのクリア数
- 予告で選ぶ（quote）が、急ぐ順（urgent）以上のクリア数

外れた方針は、5.1 の範囲の中で値を動かす。
- 全部の皿に効く方針が強すぎる → 下げる
- せまい条件の方針が効かない → 上げる
- 設計書 5.2 の末尾の「強すぎたら条件をせまくする」順も使う

動かすのは1回だけにし、変える前と後の値を md に表で残す。

- [ ] **Step 4: 2回目の測定** — Run: `POLICY_SIM_LABEL=stage2b POLICY_SIM_AIMS=urgent,quote npm run sim:policy` / Expected: PASS

- [ ] **Step 5: ゆるめたテストを戻せるか確かめる** — 「考えた構成は、でたらめより先まで進む」を `toBeGreaterThan` に戻して動かす。通れば戻す。通らなければ「でたらめ以上」のまま、md にわけを書く。

- [ ] **Step 6: まとめを書く** — `docs/balance/2026-11-23-policy-multiply-stage2.md` に次の4つを並べ、目安から外れているものを箇条書きにする。
  - before、slice、stage2、stage2b の表（クリア数・倍率の分布・1皿の割合・予告の得）
  - 方針ごとの効いた皿の割合（`fired` ÷ 出した皿）
  - 変えた値
  - 次の段への持ち越し

- [ ] **Step 7: 全部のテスト** — Run: `npx vitest run --exclude "tests/*.sim.test.ts"` / Expected: PASS

- [ ] **Step 8: Commit**（「繁盛記：第2段を測り、方針の倍率を決め直す」。JSON 2つと md と値の変更）

---

## この計画でやらないこと（第3段以降）

- 新しい方針5つ（早口自慢・景気づけ・手間ひま・強気の値付け・宵っ張り）
- かけ合わせ・型の「効いた」を「倍率が乗ったとき」に変える。持っているだけの扱い（`fires` / `passive`）を見直す
- `BuildStats.yen` の作り直し、×10 の式の帯、選ぶ画面の光らせ方と見込み、景気づけの表示
- のれんの目標・実績の見直し
