# 方針の見直し 第3段（新しい方針5つと、かけ合わせの「効いた」） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 新しい方針5つ（早口自慢・景気づけ・手間ひま・強気の値付け・宵っ張り）を足し、かけ合わせ・型を「その皿に倍率（効果）が乗ったときだけ発見」に変える。ボットで測り、第2段の持ち越し（上位5%の ×15、上限4%、予告で選ぶ得、勢い・連鎖の弱さ）を見直す。

**Architecture:** 第2段と同じく、皿ごとの倍率は `Shop.price()` の `factors` に足し、値は `src/core/build.ts` の `L(a, b, c)` と `BuildMods` に置く。景気づけだけは倍率を持たず、大入り袋と同じ「コンボを切らさずに10皿」の数え方（`feverCount`）を使って素材を増やす。かけ合わせの判定（`recordFinds`）から「持っているだけ」（`BuildMods.passive`）をなくし、皿のタグ（`tags`）だけで決める。

**Tech Stack:** TypeScript、vitest。

**Spec:** `docs/superpowers/specs/2026-11-21-policy-multiply-design.md`（2026-11-22 承認）。5.1・5.2（新しい方針と景気づけの細かい決まり）・5.4・5.6・8.・10.・12. を使う。前段の結果は `docs/balance/2026-11-23-policy-multiply-stage2.md`。この計画は設計書 9. の手順4の残り（新しい方針5つ）と手順5（かけ合わせ・型の扱い、解放条件）にあたる。画面の仕上げ（選ぶ画面の光らせ方・見込み、式の帯、判子の順、円の振り返り）は第4段、目標の決め直しと1枠の差し替えの比べは第5段。

## Global Constraints

- 通常営業・ひがわり（`Shop.build === null`）の計算と乱数の使い方は変えない。`tests/regression.test.ts` のスナップショットが最後まで通ること。
- 今の20の方針の ID と、今の34組・7つの型のキーと名前は変えない。新しいかけ合わせは `PAIRS` の**末尾**に足す（古い保存データの発見の記録をそのまま使うため）。
- 倍率の決め方の軸（設計書 5.1）：全部の皿に効く方針は×1.1〜1.3（時間を限るものは高めでよい）、4〜7割は×1.3〜1.8、1〜3割は×2〜4。5.2 の値は仮の値で、Task 5 の測定で1回だけ決め直す。
- 上限は全部込みで `MULT_CAP = 30`。強気の値付けも上限の中。金額の上限は置かない。
- 打った腕前の倍率（一発勝負・連打の熱・おもてなし・**早口自慢**）は打った皿だけ。料理・素材・店の状態（手間ひま・宵っ張り・強気の値付けなど）は、まとめ出しのついでの皿にもその皿の条件で効く。
- 引き換えの倍率（一発勝負のミス×0.8、**宵っ張りの朝昼×0.9**）は、ほかの倍率と同じく `factors` に入れるが、タグ（判子・発見）は付けない。
- 効果の文は「〇〇の皿は ×いくつ」の一文にそろえる。新しい字を使ったら `npm run font-text` で作り直す。ゲームの中の言い方（ひらがなの語）に合わせる。
- 単体テストは `npx vitest run --exclude "tests/*.sim.test.ts"`、型は `npx tsc --noEmit -p .`。コミットはタスクごとに `policy-multiply` へ。メッセージはファイルに書いて `git commit -F`、最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。**push しない**。

## Review Focus

1. かけ合わせを全部（34組）見つけて「秘伝の書」を取った人が、組が44組に増えたあとも実績とプレートを失わない（Task 4 のテスト）。
2. 景気づけの「その10皿で使った素材」は、まかないで減らなかった皿を数えず、大盛りの倍の分ともう一杯の酒を数える。コンボが切れたら、数えた素材も0に戻る（Task 3 のテスト）。
3. 宵っ張りの朝昼×0.9 は、宵っ張りを持っていない店には付かず、延長営業のあいだ（閉店時刻のあと）は夜として×1.5〜2.2 が付く（Task 2 のテスト）。
4. 店全体に効く方針（大漁旗・呼び込みなど）を持っているだけでは、かけ合わせを発見しない。倍率が乗った皿でだけ発見する（Task 1 のテスト）。
5. 同時には起きない条件の2つ（朝市と宵っ張り、待たせない店と看板娘の愛想）が、名前付きのかけ合わせ・型に入っていない（Task 4 のテスト）。

---

## ファイルの分け方

| ファイル | 役目 | タスク |
|---|---|---|
| `src/core/build.ts` | 新しい方針の定義・値・判子・`BuildMods`・`modsFor`、かけ合わせ、`BuildStats` | 1〜4 |
| `src/core/shop.ts` | `price()` の倍率、景気づけの数え方、`recordFinds` | 1〜3 |
| `src/core/run.ts` | 解放条件、秘伝の書の記録 | 4 |
| `src/ui/hover.ts`、`src/ui/runMode.ts`、`src/ui/shopView.ts` | `fires` をなくした分の文、景気づけの知らせ | 1, 3 |
| `tests/run.test.ts` | 方針ごとのテスト | 1〜4 |
| `tests/runBot.ts`、`tests/policy.sim.test.ts` | 新しい組み方、方針ごとの効いた皿の割合 | 5 |
| `docs/balance/` | 第3段の測定と調整の記録 | 5 |

---

### Task 1: かけ合わせ・型は「その皿に効いたとき」だけ

**Files:**
- Modify: `src/core/build.ts`（`Policy.fires`・`BuildMods.passive` をなくす、`pairText`・`setText`・`BuildStats`）、`src/core/shop.ts`（`recordFinds`、`serveOne` の数え方）、`src/ui/hover.ts:70`、`src/ui/runMode.ts:1208`、`src/ui/shopView.ts:987`
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:
  - `Policy` から `fires` をなくす。`BuildMods` から `passive` をなくす。
  - `BuildStats.boosted: Partial<Record<PolicyId, number>>`：その方針の倍率（1より大きいもの）が乗った皿の数。`fired`（タグが付いた皿の数）とは別に数える。`emptyBuildStats()` は `boosted: {}`。
  - `recordFinds(ev, chain)` は `ev.tags` だけで組と型を決める。型はこれまでどおり打った皿（`chain === 0`）だけ。
  - `pairText(p)` は「「A」と「B」が同じ皿に効くと、この組を発見」の一文だけ。

- [ ] **Step 1: テストを書く**

```ts
it('店全体の方針は持っているだけではかけ合わせにならない（倍率が乗った皿だけ）', () => {
  // shopWith([{ id: 'oomori', lv: 3 }, { id: 'tairyo', lv: 3 }], ['grilledFish'])、席0を大盛り（bigFrom 'policy'）にし、fish を 3 個にする
  // 打って出す → serve の tags に tairyo がなく、buildStats.pairs に pairKey('oomori','tairyo') がない
  // 同じ形で fish を 30 個 → buildStats.pairs に pairKey('oomori','tairyo') がある
});
it('型も、3つがその皿に効いたときだけ成立する', () => {
  // 朝駆けの型（asaichi, nushi, tairyo）を持ち、朝・とれたて中・主素材 3 個 → sets に入らない。主素材 30 個 → 入る
});
it('倍率が乗った回数は、判子の回数と別に数える', () => {
  // ippatsu Lv1 で、ミスして出した皿：fired.ippatsu は増えず、boosted.ippatsu も増えない
  // ミスなしで出した皿：fired.ippatsu と boosted.ippatsu が 1 ずつ
  // makanai で減らなかった皿：fired.makanai と boosted.makanai が 1（saveMult > 1）
});
```

あわせて、`tests/run.test.ts:174` と `:625` の「どちらかが fires」の確かめは消す（`fires` がなくなるため）。

- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/run.test.ts -t "持っているだけ|型も、3つ|別に数える"` / Expected: FAIL（1つ目・2つ目は発見してしまう、3つ目は `boosted` がない）

- [ ] **Step 3: 直す**
  - `recordFinds` から `b.passive` を使う2か所を消し、`on = (id) => tags.includes(id)` にする。
  - `serveOne` で、`q.factors` のうち `mult > 1` かつ方針の ID のものを `boosted` に数える。
  - `hover.ts`・`runMode.ts` の「皿ごとに効く方針／店全体に、いつも効く方針」の行は消す。`shopView.ts:987` の枠の透明度は 1 にそろえる。
  - `setText` の「（売上は変わらない。ついでの皿では成立しない）」は残す。

- [ ] **Step 4: 通るのを確かめる** — Run: `npx vitest run --exclude "tests/*.sim.test.ts"` と `npx tsc --noEmit -p .` / Expected: すべて PASS、型の誤りなし

- [ ] **Step 5: コミット** — 「繁盛記：かけ合わせ・型は、その皿に効いたときだけ発見する」

---

### Task 2: 皿に倍率が付く新しい方針4つ（早口自慢・手間ひま・強気の値付け・宵っ張り）

**Files:**
- Modify: `src/core/build.ts`、`src/core/shop.ts`（`price()`）
- Test: `tests/run.test.ts`

**Interfaces:**
- Consumes: Task 1 の `boosted`。
- Produces:
  - `PolicyId` に `'hayakuchi' | 'tema' | 'tsuyoki' | 'yoippari'` を足す（Task 3 で `'keiki'`）。
  - 定数：`LONG_KANA = 7`（【長い読みの文字数】）、`YOI_DAY = 0.9`（宵っ張りの朝昼）。
  - `BuildMods` に `longMult`・`tema2Mult`・`tema3Mult`・`boldMult`・`nightMult`（どれも 1 は持っていない）。`emptyMods()` は 1。
  - 値（Lv1→Lv2→Lv3、設計書 5.2 の仮の値）：

| ID | 名前・かな・系統・判子 | 条件 | 倍率 | 引き換え |
|---|---|---|---|---|
| `hayakuchi` | 早口自慢・はやくち・`combo`・`早口` | 打った皿（`chain === 0`）で、`g.dish.kana.length >= LONG_KANA` | `LONG_MULT` 1.5→2.0→2.5 | — |
| `tema` | 手間ひま・てまひま・`stock`・`手間` | `Object.keys(g.dish.need).length` が 2 / 3以上 | `TEMA2_MULT` 1.5→1.8→2.2 / `TEMA3_MULT` 2.0→2.5→3.0 | — |
| `tsuyoki` | 強気の値付け・つよき・`guest`・`強気` | 全部の皿 | `BOLD_MULT` 1.2→1.35→1.5 | `waitMult *= 1 - BOLD_WAIT`（0.15→0.2→0.25） |
| `yoippari` | 宵っ張り・よいっぱり・`guest`・`宵` | `this.phaseIndex === 2`（延長のあいだも夜） | `NIGHT_MULT` 1.5→1.8→2.2 | 朝昼の皿は `{ id: 'yoippari', mult: YOI_DAY }`（タグなし） |

  - かなの数は `kana.length` で数える（「ー」と小さい字も1字。設計書 5.2）。大盛りの皿も元の料理の読みで数える。
  - 手間ひまの種類の数は、料理そのものの `need` の種類（大盛りで個数が倍になっても種類は同じ。もう一杯の酒は数えない）。
  - 解放は Task 4 で決める。このタスクではいったん `starter: true`。

- [ ] **Step 1: テストを書く**

```ts
it('早口自慢：読み7文字以上の料理を打って出した皿だけ ×1.5→2.0→2.5', () => {
  // 'vegSoup'（おんやさいもり＝7字）で Lv3 → factors に { id: 'hayakuchi', mult: 2.5 }、tags に hayakuchi
  // 'grilledFish'（やきざかな＝5字）→ hayakuchi なし
  // まとめ出し Lv1 で、ついでの皿が7字以上でも、ついでの皿には hayakuchi が付かない
});
it('手間ひま：2種類の皿 ×1.5→1.8→2.2、3種類以上の皿 ×2.0→2.5→3.0（ついでの皿にも効く）', () => {
  // 素材1種類の皿には付かない。2種類の皿 Lv2 → 1.8。3種類の皿 Lv3 → 3.0。まとめ出しのついでの3種類の皿にも 3.0
});
it('強気の値付け：全部の皿 ×1.2→1.35→1.5、お客の待ち時間が 15→20→25% 短い', () => {
  // modsFor([{ id: 'tsuyoki', lv: 3 }]).waitMult が 0.75、boldMult が 1.5
  // 看板娘 Lv3 と重ねると waitMult は 1.7 × 0.75（約1.28）
});
it('宵っ張り：夜の皿 ×1.5→1.8→2.2、朝昼の皿は ×0.9（判子なし）、延長のあいだも夜', () => {
  // clock を朝・昼・夜・DAY_LENGTH 以後（extra > 0）に置いて price を見る
  // 朝昼：factors に { id: 'yoippari', mult: 0.9 }、tags に yoippari なし。夜と延長：2.2 と tags
  // 宵っ張りを持たない店の朝の皿には yoippari の factor がない
});
it('新しい方針にも判子と効果の文がある', () => {
  // POLICY_SEAL[id] が1〜2字、descOf(id, 3) に '×' を含み '{' を含まない
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/run.test.ts -t "早口自慢|手間ひま|強気の値付け|宵っ張り|新しい方針にも"` / Expected: FAIL（ID がない）

- [ ] **Step 3: 足す** — `POLICIES` に4つ（一言 `quip` は作る人に任せる）、`POLICY_SEAL`、`modsFor` の `case`、`price()` の判定（早口自慢は一発勝負の近く、`chain === 0` の中）。効果の文の例：「読みが${LONG_KANA}文字以上の料理を打って出した皿は ×{0}」。`npm run font-text` を回す。

- [ ] **Step 4: 通るのを確かめる** — Run: `npx vitest run --exclude "tests/*.sim.test.ts"` と `npx tsc --noEmit -p .` / Expected: PASS

- [ ] **Step 5: コミット** — 「繁盛記：新しい方針（早口自慢・手間ひま・強気の値付け・宵っ張り）」

---

### Task 3: 景気づけ（10皿ごとに、よく使った素材2種類が増える）

**Files:**
- Modify: `src/core/build.ts`、`src/core/shop.ts`、`src/ui/shopView.ts`（`case 'fever'` の近く）
- Test: `tests/run.test.ts`

**Interfaces:**
- Consumes: `FEVER_EVERY`（10）、`feverCount`（コンボを切らさずに出した皿の数）、`INGREDIENT_ORDER`。
- Produces:
  - `PolicyId` に `'keiki'`（景気づけ・けいきづけ・`combo`・判子 `景気`）。`KEIKI_GAIN` 2→3→4、`BuildMods.keikiGain`（0 は持っていない）。
  - `Shop` に `private keikiUsed: Partial<Record<IngredientId, number>>`。`feverCount` を 0 に戻す3か所（コンボが切れたとき2か所と、10皿目）で、いっしょに `{}` に戻す。
  - `feverCount` は `b.feverSecs > 0 || b.keikiGain > 0` のときに数える（大入り袋と景気づけで同じ数を使う）。
  - 新しいイベント `{ type: 'keiki'; items: { id: IngredientId; n: number }[] }`。
  - `BuildStats.keiki: number`（その日に増えた素材の合計の個数）。円には換えない（設計書 5.7）。

決まり（設計書 5.2 の「景気づけの細かい決まり」）
- 数えるのは実際に倉庫から減った個数：料理の `need`（大盛りは倍になった分）と、もう一杯で付けた酒1つ。まかないで減らなかった皿は数えない。
- 10皿目の会計が終わったあとで、数が多い順に2種類。同じ数なら `INGREDIENT_ORDER` の順。1種類しか使っていなければ、その1種類だけ。
- 増やすのは `addStock(id, keikiGain)`。10皿目の皿のタグに `keiki` を付ける（判子と発見。倍率はない）。`fired.keiki` を1つ増やす。
- 画面：`keiki` イベントで、`banner` に「景気づけ！ 魚+4 酒+4」のように一度出す（大入りと同じ10皿目なら、大入りの知らせのあとに続けて出す）。

- [ ] **Step 1: テストを書く**

```ts
it('景気づけ：コンボを切らさずに10皿出すと、その10皿で一番多く使った素材2種類が +2→+3→+4', () => {
  // keiki Lv3。fish を使う皿を6皿、veg を使う皿を3皿、rice を使う皿を1皿出す → 10皿目で fish と veg が +4、rice は増えない
  // keiki イベントの items が [{ id: 'fish', n: 4 }, { id: 'veg', n: 4 }]、10皿目の tags に keiki、buildStats.keiki が 8
});
it('景気づけ：まかないで減らなかった分は数えず、大盛りの倍の分ともう一杯の酒は数える', () => {
  // (s as any).keikiUsed を見て確かめる
});
it('景気づけ：コンボが切れたら、数えた皿も素材も数え直す', () => {
  // 9皿出してからミスでコンボを切る → keikiUsed が {}、feverCount が 0。そこから10皿で初めて増える
});
it('景気づけ：使った数が同じなら素材の並び順、1種類だけならその1種類', () => {});
it('大入り袋だけを持つ店の大入りの数え方は変わらない', () => {
  // ooiri だけで10皿 → fever イベント、keiki イベントなし
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/run.test.ts -t "景気づけ|大入り袋だけ"` / Expected: 景気づけの4つが FAIL、大入り袋だけのテストは PASS（守りのテスト）

- [ ] **Step 3: 足す** — 素材を減らす所（`serveOne` の `takeStock` 2か所）で `keikiUsed` に足す。10皿目の判定は大入りと同じ場所に置き、大入りの処理の前に景気づけを処理する。`npm run font-text`。

- [ ] **Step 4: 通るのを確かめる** — Run: `npx vitest run --exclude "tests/*.sim.test.ts"` と `npx tsc --noEmit -p .` / Expected: PASS

- [ ] **Step 5: 画面で確かめる** — プレビュー `sakaba-intro`（ポート5291）で `window.__game` から景気づけ Lv3 の店を作り、10皿出して知らせの帯が読めること、文字がはみ出さないことをスクリーンショットで見る（ペインが隠れていたら `g.step(1/60)`・`g.draw()` で進める）。

- [ ] **Step 6: コミット** — 「繁盛記：新しい方針 景気づけ」

---

### Task 4: 解放条件・新しいかけ合わせ・秘伝の書

**Files:**
- Modify: `src/core/build.ts`（`starter`・`unlock`、`PAIRS` の末尾）、`src/core/run.ts`（`closeDay` の解放、`RunMeta.flags`、読み込み、`RUN_ACHIEVEMENTS`）、`tests/runBot.ts`（`allMeta`）
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:
  - 解放（作る人の判断、設計書 10.。最初から選べる方針を増やしすぎない）：

| 方針 | 最初から | 解放の条件（`unlock` の文） | `closeDay` での判定 |
|---|---|---|---|
| 強気の値付け | ○ | — | — |
| 早口自慢 | × | 繁盛記で50コンボを出す | `b.combo >= 50` |
| 手間ひま | × | 繁盛記で目標を5回突破する | `meta.daysCleared >= 5` |
| 宵っ張り | × | 延長営業で営業を延ばす | `f.build.extended > 0` |
| 景気づけ | × | 大入り袋で大入りを出す | `f.build.fevers > 0` |

  - `allMeta()` の `policies` に4つを足す。
  - 新しいかけ合わせ10組（`PAIRS` の末尾、この順）：
    - `hayakuchi`+`ippatsu`「立て板に水」、`hayakuchi`+`netsu`「早口言葉」
    - `keiki`+`matome`「大盤振る舞い」、`keiki`+`shikomi`「蔵いっぱい」
    - `tema`+`oomori`「特上の大皿」、`tema`+`yoippari`「夜の御膳」
    - `tsuyoki`+`aiso`「強気の看板」、`tsuyoki`+`yoyaku`「格式の店」
    - `yoippari`+`encho`「夜通し」
    - `hayakuchi`+`yoippari`「夜の早口」
  - 型は足さない。
  - `RunMeta.flags.allPairs: boolean`：かけ合わせを全部見つけた記録。`closeDay` で `discovered.length >= PAIRS.length` なら true。読み込みでは、保存の値に加えて、**最初の34組をすべて見つけている記録も true** にする（`PAIRS.slice(0, 34)` のキーがすべて `discovered` にある）。
  - 秘伝の書の `progress` は、`flags.allPairs` なら達成（`now = goal`）、そうでなければ今までどおり `discovered.length / PAIRS.length`。

- [ ] **Step 1: テストを書く**

```ts
it('新しい方針の解放：50コンボ・目標5回・延長・大入りで解放する（強気の値付けは最初から）', () => {
  // availablePolicies(emptyMeta()) に tsuyoki があり、hayakuchi・tema・yoippari・keiki がない
  // closeDay を条件ごとに通して meta.policies に入る
});
it('34組を全部見つけた古い記録は、組が増えても秘伝の書を失わない', () => {
  // loadMeta 相当で discovered = 最初の34組 → earnedAchievements に 'run-discover-all'
  // 33組だけ → 入らない
});
it('同時に起きない条件の2つは、かけ合わせ・型に入れない', () => {
  const EXCLUSIVE: [PolicyId, PolicyId][] = [['asaichi', 'yoippari'], ['sekkachi', 'aiso']];
  // PAIRS のどの組も、SETS のどの型も、EXCLUSIVE の2つを両方含まない
});
it('新しいかけ合わせは、実際に同じ皿で発見できる', () => {
  // 10組それぞれで shopWith と時刻・素材・入力を整えて1皿（まとめ出しは2皿）出し、buildStats.pairs にそのキーが入る
});
```

- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/run.test.ts -t "新しい方針の解放|秘伝の書を失わない|同時に起きない|実際に同じ皿で"` / Expected: 「同時に起きない」以外は FAIL

- [ ] **Step 3: 足す** — 上の表どおり。読み込みの関数（`run.ts:285` 付近）で `flags.allPairs` を作る。`npm run font-text`。

- [ ] **Step 4: 通るのを確かめる** — Run: `npx vitest run --exclude "tests/*.sim.test.ts"` と `npx tsc --noEmit -p .` / Expected: PASS（`tests/regression.test.ts` の、34組を全部見つけた記録の読み込みも通る）

- [ ] **Step 5: コミット** — 「繁盛記：新しい方針の解放条件と、かけ合わせ10組」

---

### Task 5: ボットで測り、1回だけ値を決め直す

**Files:**
- Modify: `tests/runBot.ts`（`BUILDS`）、`tests/policy.sim.test.ts`（`SimRow`）、必要なら `src/core/build.ts` の値
- Create: `docs/balance/2026-11-24-policy-multiply-stage3.md`、`docs/balance/2026-11-23-policy-multiply-stage3.json`（出力名は今の `runSim` のまま）

**Interfaces:**
- Consumes: Task 1 の `boosted`、Task 2〜4 の方針と `allMeta`。
- Produces:
  - `BUILDS` の末尾に3つ：
    - `prefer('夜の店', ['yoippari', 'tema', 'hayakuchi', 'tsuyoki', 'aiso', 'ryoshusho'])`
    - `prefer('強気の店', ['tsuyoki', 'yobikomi', 'aiso', 'sekkachi', 'ooiri', 'matome'])`
    - `prefer('景気の店', ['keiki', 'ooiri', 'ryoshusho', 'matome', 'mie', 'shikomi'])`
  - 初回（`emptyMeta`）の条件では、解放の要る方針は候補に出ないので、上の店は出る方針だけで組む（そのままでよい）。
  - `SimRow.boostShare: Partial<Record<PolicyId, number>>`：方針ごとの `boosted` の合計 ÷ 出した皿の数（4日目まで続けた結果）。`BotDay` に `boosted` を足して写す。

- [ ] **Step 1: 組み方と集計を足し、単体テストが通るのを確かめる** — Run: `npx vitest run --exclude "tests/*.sim.test.ts"` / Expected: PASS（「考えた構成は、でたらめより先まで進む」も通る）

- [ ] **Step 2: 測る** — Run（バックグラウンド、約60〜100分）: `POLICY_SIM_LABEL=stage3 POLICY_SIM_AIMS=urgent,quote npm run sim:policy` / Expected: `docs/balance/2026-11-23-policy-multiply-stage3.json` ができる

- [ ] **Step 3: 目安と比べ、1回だけ決め直す** — 設計書 8. の目安と比べる。
  - 上限に届いた皿が10%を超える組み方があれば、5.2 の末尾の順で条件をせまくする（手間ひま→3種類以上だけ、宵っ張り→閉店前35秒と延長だけ、早口自慢→打つ回数、強気→お客が少し減る）。
  - 上位5%が ×15 に届かなければ、せまい条件の倍率を一段上げる（第2段の持ち越し1）。
  - 新しい方針の `boostShare` が 5.1 の軸の割合（全部の皿／4〜7割／1〜3割）から大きく外れたら、その方針の倍率を軸に合わせて直す。
  - 強気の店（強気の値付け＋呼び込み＋看板娘）が、どの速さでも一番になるなら土台になっているので、強気の値付けの倍率を下げる。
  - 景気の店の調達が1日0〜1回まで減っていたら、`KEIKI_GAIN` を下げる（設計書 8.）。大入りの時間が1日の30%を超えたら、大入り袋の秒数を下げる。
  - 素材の種類の数（朝は1種類だけ・昼は2種類・夜は2〜4種類）から、手間ひまは昼と夜にしか効かない。のれん3枚目からの「背伸びの献立」で朝にも効くようになるので、低いのれんと高いのれんを分けて見る。
  - 値を変えたら Step 2 をもう一度回す（ラベル `stage3b`）。2回目のあとは値を変えず、残りは第5段へ持ち越す。

- [ ] **Step 4: 記録を書く** — `docs/balance/2026-11-24-policy-multiply-stage3.md` に、第2段（stage2b）との比べ（クリア数・組み方ごと・倍率の中央値・上位5%・上限・1皿の割合・方針ごとの効いた皿の割合）、変えた値とわけ、第4・5段への持ち越しを書く。

- [ ] **Step 5: コミット** — 「繁盛記：第3段を測り、新しい方針の値を決め直す」

---

## このあと（この計画では作らない）

- 第4段：選ぶ画面の光らせ方と見込み（`offersFor` の `linkFor`・`SUPPORT` の書き直しを含む）、×10 以上の式の帯、判子の並べ方、効果の文の数字の直書き、文の長さのテスト、方針ごとの円の振り返り。
- 第5段：目標の決め直し、1枠の差し替えの比べ（まとめ出し、強気＋呼び込み＋看板娘、予約のみを速さごとに）、遊んでの確かめ、sakurai と Codex のレビュー、公開。
