# 方針の見直し 第5段（目標の決め直し・確かめ・公開） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 第1〜4段で変えた繁盛記を、目標・実績・道中の相性まで含めて仕上げる。ボットで全体を測り直し、1枠の差し替えで方針の値打ちを比べ、のれんの目標を「必要なところだけ」上げる。そのあと、ユーザーに遊んでもらい、sakurai と Codex のレビューを受け、承認されたら1回で公開する。

**Architecture:** 目標の数値は `src/core/run.ts` の `GOAL_BASE`・`loopGoalMult`（`GOAL_EASE_LOOP` まで二次、その先 `GOAL_LATE_STEP`）・`DAY_LOOP_WEIGHT`・営業条件の `goalMult`。測る道具は `tests/policy.sim.test.ts`（全体）に、新しく `tests/swap.sim.test.ts`（1枠の差し替え）を足す。公開は、メモの手順（`origin/main` をビルドした JS と公開版の JS を比べてから、ターミナルで `git push origin policy-multiply:main`）で行う。

**Tech Stack:** TypeScript、vitest、Cloudflare（main へ push すると約1分で自動公開）。

**Spec:** `docs/superpowers/specs/2026-11-21-policy-multiply-design.md`（8. 調整の進め方と目安、12. ユーザーの決定「倍率の手応えを残し、必要なところで目標を上げる。一律には上げない」、5.6 実績）。前段の記録は `docs/balance/2026-11-24-policy-multiply-stage3.md`・`-stage4.md`。sakurai スキルの要約に基づく原則：「思ったより下げるくらいでちょうど良い」「詰んでクリア不能が最悪」（本体 2.）、「平均は平凡（強すぎを削り弱いを埋めるを繰り返さない）」（本体 1.）。

## Global Constraints

- 目標は一律には上げない（ユーザーの決定）。変えてよいのは `GOAL_BASE` の日ごとの値、`loopGoalMult` の伸び、`GOAL_LATE_STEP`、営業条件の `goalMult`。**方針の倍率は、この段では変えない**（第3段・景気づけの値のまま。変えたくなったら、ユーザーに案として出す）。
- 値を変えるのは測定のあと1回だけ。変える前後の値と、確かめた測定を `docs/balance/` に残す。
- 実績の条件（一皿五千円・倍返し・大繁盛）は、**もう取った人の実績を消さない**。条件を変える案は出すだけにし、ユーザーが決める。
- 通常営業・ひがわり（`Shop.build === null`）は変えない。`tests/regression.test.ts` が最後まで通ること。
- **push は、ユーザーが公開を承認したあとに1回だけ**。それまで `policy-multiply` にコミットするだけ。共有の本体チェックアウト `Last-Order/Last-Order` には触れない。
- 単体テストは `npx vitest run --exclude "tests/*.sim.test.ts"`、型は `npx tsc --noEmit -p .`。コミットのメッセージはファイルに書いて `git commit -F`、最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。

## Review Focus

1. 目標を上げたあとも、のれん1枚目・初回・4.5打/秒で、少なくとも1つの組み方が4日をクリアできる（詰まない）。でたらめに選んだ店だけでクリアが続く楽すぎる状態でもない（Task 3 の目安）。
2. 目標を変えても、今あそんでいる途中の挑戦（保存された `RunState`）が読み込めて、その日の目標が変な値（0や NaN）にならない（Task 3 のテスト）。
3. 道中の営業条件の「相性」（`good`）に新しい方針を足しても、営業の候補（`roadOffers`）の出方の決まりが壊れない（Task 4 のテスト）。
4. 公開の前に、公開版が `origin/main` と同じであることを確かめる（ユーザーが wrangler で直接上げていることがある）。違えば止めて相談する（Task 8）。
5. 後回しにした細かい点のうち、遊ぶ人に見えるもの（判子が残る、知らせが途中で消える、見込みが多めに出る）を直しても、第4段のテスト（知らせの順番待ち・判子・見込み）が通る（Task 5）。

---

## ファイルの分け方

| ファイル | 役目 | タスク |
|---|---|---|
| `tests/swap.sim.test.ts`（新規）、`package.json` | 1枠の差し替えの比べ（`npm run sim:swap`） | 1 |
| `tests/policy.sim.test.ts` | 実績に届いた割合の集計を足す | 1 |
| `docs/balance/2026-11-24-policy-multiply-stage5.md`（新規） | 測定・目標の決め直し・実績の案の記録 | 2, 3 |
| `src/core/run.ts` | 目標の値、営業条件の相性 | 3, 4 |
| `src/ui/shopView.ts`、`src/core/shop.ts`、`src/ui/runMode.ts` | 後回しにした見える点の直し | 5 |
| `docs/superpowers/specs/2026-11-24-policy-multiply-review-request-2.md`（新規） | Codex へのレビューの依頼書 | 6 |

---

### Task 1: 1枠の差し替えと、実績の届きやすさを測る道具

**Files:**
- Create: `tests/swap.sim.test.ts`
- Modify: `package.json`（`"sim:swap": "vitest run tests/swap.sim.test.ts --silent=false"`）、`tests/policy.sim.test.ts`（`SimRow` に実績の割合）

**Interfaces:**
- Produces:
  - `swap.sim`：組み方（`prefer` の並び）と、その中の1つを別の方針に替えた組み方を、同じ条件で比べる。条件は解放後、のれん 1・3・5、4.5・6.5・9打/秒、種8つ（`SIM_SEEDS`）、急ぐ順のボット。出すのは、クリア数・4日目の達成率の平均・1日の調達の回数・替えた方針の倍率が乗った皿の割合。結果は `docs/balance/2026-11-24-policy-multiply-swap.json`。
  - 比べる組（設計書 8. の必ず比べるものと、新しい方針）：

| 元の組み方 | 替える方針 → 替わり |
|---|---|
| 連鎖の店 | まとめ出し → まかない名人 |
| 強気の店 | 強気の値付け → 待たせない店 |
| 強気の店 | 呼び込み上手 → 大入り袋 |
| 少人数の店 | 予約のみ → 一発勝負 |
| 夜の店 | 宵っ張り → 一発勝負 |
| 夜の店 | 手間ひま → 大入り袋 |
| 夜の店 | 早口自慢 → まかない名人 |
| 景気づけ＋多い素材の店（`['keiki','tairyo','oomori','matome','ooiri','shikomi']`） | 景気づけ → まかない名人 |

  - `SimRow` に `serve5k`（1皿で5,000円以上を出した挑戦の割合）、`double`（目標の2倍で終えた日がある挑戦の割合）、`total100k`（4日の合計が10万円以上の挑戦の割合）を足す。

- [ ] **Step 1: 道具を書き、単体テストが通るのを確かめる** — Run: `npx vitest run --exclude "tests/*.sim.test.ts"` / Expected: PASS
- [ ] **Step 2: コミット** — 「繁盛記：1枠の差し替えと実績の届きやすさを測る道具」

---

### Task 2: 全体を測り直す（目標を変える前）

**Files:**
- Create: `docs/balance/2026-11-24-policy-multiply-stage5.md`

- [ ] **Step 1: 測る**（バックグラウンド）— `POLICY_SIM_LABEL=stage5a POLICY_SIM_AIMS=urgent,quote npm run sim:policy`（約30分）と `npm run sim:swap`（数分）。
- [ ] **Step 2: 記録を書く** — 第3段（stage3b）との比べ、1枠の差し替えの表、実績の届きやすさ、設計書 8. の目安ごとの合否。
- [ ] **Step 3: コミット** — 「繁盛記：第5段の測定（目標を変える前）」

---

### Task 3: のれんの目標を決め直す（1回だけ）

**Files:**
- Modify: `src/core/run.ts`（目標の値）、`tests/run.test.ts`（目標の値のテスト）
- Modify: `docs/balance/2026-11-24-policy-multiply-stage5.md`

**決め方**（設計書 8. の順。目安の数は作り手の判断で、測定の結果と一緒にユーザーに見せる）

1. **初回・のれん1・4.5打/秒**：組み方を考えた店のうち上位3つのクリアの平均が【初回の手ごたえ】4〜6/8、でたらめが2/8以下。外れていたら `GOAL_BASE` の1・2日目だけを動かす。
2. **低いのれん（1・3・5・6）**：強い店の4日目の達成率の平均が【できあがった店の余裕】120〜160%。超えていれば `GOAL_BASE` の3・4日目を上げる（目標を抜きすぎる日だけ）。でたらめの店の4日目は今（約93%）より下げすぎない（80%以上）。
3. **高いのれん（10・15・20）**：15・20枚目で、組み方を詰めた店×12打/秒が4/8以上、合わない店×7打/秒が1/8以下。外れていれば `GOAL_LATE_STEP` か10枚目までの伸びを動かす。
4. 営業条件の `goalMult` は、その日の目標を抜きすぎる条件（測定で達成率の平均が他より30ポイント以上高い条件）だけ +5% ずつ。

- [ ] **Step 1: テストを書く** — 決めた新しい値で `goalFor` のいくつかの日・枚数の値を確かめるテスト（今ある `GOAL_BASE`・`loopGoalMult` のテストの期待値を直す）。保存された途中の `RunState` を読み込んで `dayPlan(run, meta).goal` が正の有限の数になるテストを足す。
- [ ] **Step 2: 失敗を確かめる** / Expected: 値のテストが FAIL
- [ ] **Step 3: 値を変える**
- [ ] **Step 4: 通るのを確かめる** — 単体テストと型。
- [ ] **Step 5: 測り直す** — `POLICY_SIM_LABEL=stage5b` で全体をもう一度。2回目のあとは値を変えず、外れたものは記録に残す。
- [ ] **Step 6: 記録とコミット** — 前後の値と結果を記録。「繁盛記：のれんの目標を決め直す」

---

### Task 4: 道中の営業条件の相性に、新しい方針を足す

**Files:**
- Modify: `src/core/run.ts`（`ROADS` の `good`）
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces（作り手の判断。営業条件の性格に合わせる）：
  - 満員御礼（お客が多い）：強気の値付け
  - 市の立つ日（調達の持ち帰りが多い）：景気づけ
  - はしご酒の日（もう1品）：手間ひま
  - せっかち客の日（チップ3倍）：早口自慢
  - 宴会の日：宵っ張り

- [ ] **Step 1: テストを書く** — 新しい方針5つが、どれか1つ以上の営業条件の `good` に入っている。`good` の中の ID がすべて方針である。
- [ ] **Step 2: 失敗を確かめる** / Expected: FAIL
- [ ] **Step 3: 足す**
- [ ] **Step 4: 通るのを確かめる**
- [ ] **Step 5: コミット** — 「繁盛記：営業条件の相性に新しい方針を足す」

---

### Task 5: 後回しにした、遊ぶ人に見える点を直す

**Files:**
- Modify: `src/ui/shopView.ts`、`src/core/shop.ts`、`src/ui/runMode.ts`
- Test: `tests/seal-formula.test.ts`、`tests/banner-queue.test.ts`、`tests/offer-glow.test.ts`

直すもの（第3・4段の後回しから、遊ぶ人に見えるものだけ）
1. 同じ席で続けて皿を出すと、前の判子が残る → 判子を押す前に、その席の判子（`tags${seat}-` で始まる置き場）をまとめて消す。
2. 「ラストスパート」と時間帯の知らせが、今出している知らせを途中で消す → `say()` を公開し、`game.ts` の直接の代入を `say(…, true)` にする。急ぎの知らせが来たら、今の知らせを待ち行列の先頭に戻す。
3. 早口自慢の見込みが、まとめ出しのついでの皿も数える → `countSeen` に `chain` を渡し、`long` は打った皿だけ数える。
4. 素材の行が出る日に「補給・客数・コンボ進行等は含まない」の注記が消える → 素材の行を1行下に出し、注記を残す（枠に入るか画面で確かめる）。

- [ ] **Step 1: 4つそれぞれのテストを書く**（判子が消えている／急ぎの知らせのあと、前の知らせが先頭に戻る／ついでの皿は `long` に入らない／`drawTop` の行の位置は画面で確かめる）
- [ ] **Step 2: 失敗を確かめる**
- [ ] **Step 3: 直す**
- [ ] **Step 4: 通るのを確かめる**、画面で確かめる
- [ ] **Step 5: コミット** — 「繁盛記：判子の残り・知らせの打ち切り・見込みの数え方を直す」

---

### Task 6: レビュー（sakurai と Codex）

**Files:**
- Create: `docs/superpowers/specs/2026-11-24-policy-multiply-review-request-2.md`

- [ ] **Step 1: ブランチ全体のコードの見直し**（新しい担当、`origin/main..policy-multiply`）。重大・直すべき点は1回で直す（テストを先に）。
- [ ] **Step 2: sakurai-game-reviewer に頼む** — 設計書・第3〜5段の記録・画面のスクリーンショット（選ぶ画面・営業中の判子と式の帯・景気づけの知らせ・結果の画面）を渡し、完成前の横断点検（初回体験・操作の導線・ご褒美・演出・続ける動機・品質）をしてもらう。
- [ ] **Step 3: Codex への依頼書を書く** — 前の依頼書（`2026-11-21-policy-multiply-review-request.md`）の形で、変わったこと・測定の結果・判断してほしい点をまとめる。ユーザーが Codex に渡す。
- [ ] **Step 4: 2つのレビューの指摘を、ユーザーの優先順位（ユーザーの指示 → 作品のコンセプトと仕様 → sakurai の原則）で取捨し、直すものを直す**。直さないものは理由を記録する。
- [ ] **Step 5: コミット**

---

### Task 7: ユーザーに遊んでもらう

- [ ] **Step 1: プレビュー `sakaba-intro` を起動し、ユーザーに遊んでもらう**（ユーザーの保存枠はそのまま。私の確かめは別の保存枠で）。
- [ ] **Step 2: 遊んだ感想を受けて直す**（直すものはテストを先に。数値を変えたら Task 3 の測定で確かめる）。
- [ ] **Step 3: 公開してよいかを聞く**。

---

### Task 8: 公開（ユーザーが承認したあとだけ）

- [ ] **Step 1: 公開版を確かめる** — `git fetch`、`origin/main` が `f5b6cd4` のままか。`git archive origin/main` を scratchpad に展開し、node_modules をジャンクションでつないで `npx vite build`、出てきた `assets/index-*.js` の名前を公開版と比べる（ジャンクションは `(Get-Item path).Delete()` で消す）。違えば止めて相談。
- [ ] **Step 2: `policy-multiply` を `origin/main` の上に載せられるか確かめる**（fast-forward できるか）。できなければ止めて相談。
- [ ] **Step 3: 全部のテストとビルド** — 単体テスト・型・`npx vite build`。
- [ ] **Step 4: push** — ターミナル（`run_in_terminal`）で `git push origin policy-multiply:main`（サインイン待ちで止まったら、ユーザーにサインインしてもらう）。
- [ ] **Step 5: 公開版を確かめる** — 約1分後、公開版の JS の名前が手元のビルドと同じになったか。繁盛記を開いて、選ぶ画面と営業が動くか。
- [ ] **Step 6: メモを更新する**（公開したコミットと公開版の JS 名）。
