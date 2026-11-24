# 方針の見直し 第4段（画面の仕上げと、景気づけの見え方） Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 掛け算で重なる売上が、遊ぶ人に「見えて、選べる」ようにする。皿の上の判子・×10以上の式の帯・知らせの順番待ち・選ぶ画面の光らせ方と見込み・効果の文・方針ごとの稼ぎの振り返りを、設計書 5.5・5.7 のとおりに仕上げる。あわせて、景気づけの効き目が見えるようにし、それでも弱ければ強くする案をユーザーに出す。

**Architecture:** 計算（`src/core`）は、稼ぎの配り方（`BuildStats.yen`）と、見込みに使う昨日の注文の数（`BuildStats.seen` → `RunState.lastSeen`）だけを変える。売上の額・乱数・候補の出方は変えない。ほかは画面（`src/ui/shopView.ts`・`src/ui/runMode.ts`）と、効果の文（`src/core/build.ts`）。光らせる決まりは、候補の出やすさ（`linkFor`・`hot`）とは別の `Offer.glow` にする。

**Tech Stack:** TypeScript、vitest、Canvas（論理画面 480×270、`src/ui/screen.ts` の `LW`・`LH`）。

**Spec:** `docs/superpowers/specs/2026-11-21-policy-multiply-design.md`（5.5 画面、5.7 稼ぎの振り返り、10. 作る人に任せること）。前段は `docs/balance/2026-11-24-policy-multiply-stage3.md`（景気づけの相談は「第4段で一緒に考える」、2026-11-24 ユーザーの決定）。sakurai スキルの要約に基づく原則：#145「大事なものをより大きく」・#132「色による区分」・#252「HUD は状況で出し入れ」（references/ui.md）、「目標は目の前に吊るす」（本体 3.）。

## Global Constraints

- 売上の額・乱数・候補（`offersFor`）の出方は変えない。`tests/regression.test.ts` のスナップショットと、第3段までの単体テストがそのまま通ること。
- 通常営業・ひがわり（`Shop.build === null`）の画面と計算は変えない。
- 景気づけの数（+2/+3/+4）は、ユーザーの決定なので変えない。強くする案は Task 6 でユーザーに出すだけ。
- 効果の文は「〇〇の皿は ×いくつ」の一文にそろえる。数字は定数から作り、直書きしない。新しい字を使ったら `npm run font-text`。
- 画面の文字は、日本語は 7.5px 以上（今の最小と同じ）。
- 単体テストは `npx vitest run --exclude "tests/*.sim.test.ts"`、型は `npx tsc --noEmit -p .`。画面を変えたタスクは、プレビュー `sakaba-intro`（ポート5291、`?slot=claude-s4` などの別の保存枠）でスクリーンショットを撮って確かめる。ペインが隠れていたら `window.__game` の `step(1/60)`・`draw()` で進める。
- コミットはタスクごとに `policy-multiply` へ。メッセージはファイルに書いて `git commit -F`、最後に `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`。**push しない**。

## Review Focus

1. 前の日がない（1日目・古い保存データ）ときは、選ぶ画面に見込みを出さず、落ちない（Task 5 のテスト）。
2. 光らせる決まりを変えても、同じ種・同じ日の候補（`offersFor` の結果）が変わらない（Task 5 のテスト）。
3. 知らせが同じ瞬間に2つ以上来ても、どれも消えずに順に出る。待っている知らせが多すぎても、古いものから捨てて画面が詰まらない（Task 1 のテスト）。
4. 稼ぎの配り方で、引き換えの倍率（一発勝負のミス×0.8、宵っ張りの朝昼×0.9）だけの皿や、倍率が上限で止まった皿でも、配った額が有限で0以上、合計が実際の売上以内（Task 4 のテスト）。
5. どの方針・どの段階の効果の文も、選ぶ画面の札（4枚のときの幅）と入れ替えの画面の札に収まる（Task 3 のテスト）。

---

## ファイルの分け方

| ファイル | 役目 | タスク |
|---|---|---|
| `src/ui/shopView.ts` | 知らせの順番待ち、10皿の残り、判子の並びと押し方、式の帯 | 1, 2 |
| `src/core/build.ts` | 効果の文、重なりの目印（`MARKS`）、`BuildStats.seen`・`prep` | 3, 4, 5 |
| `src/core/shop.ts` | 稼ぎの配り方、昨日の注文の数、10皿の数え方（`streak`） | 4, 5 |
| `src/core/run.ts` | `Offer.glow`、`RunState.lastSeen`、見込みの文（`estimateFor`） | 5 |
| `src/ui/runMode.ts` | 選ぶ画面の光り方と見込み、結果の画面の「素材の助け」 | 4, 5 |
| `tests/run.test.ts`、新規 `tests/policy-text.test.ts` | テスト | 1〜5 |

---

### Task 1: 知らせの順番待ちと、10皿の残り

**Files:**
- Modify: `src/ui/shopView.ts`（`banner` を使う所すべて、`case 'keiki'`、方針の判子の列 `run.owned.forEach`、`shop.clock > 180`）
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:
  - `ShopView` の `banner` を、待ち行列（`banners: { text: string; t: number; col: Color }[]`）にする。新しい知らせは末尾に足し、先頭を出し終えたら次を出す。【待てる知らせの数】`BANNER_QUEUE = 3`、超えたら古いものから捨てる。ただし「― 朝の部 ―」などの時間帯の知らせは、来たときに前の知らせを打ち切って先頭に出す（今と同じく、すぐ見せる）。
  - 景気づけの知らせは `pop` をやめ、帯の知らせ（`景気づけ！ 魚+4 香辛料+4`、色 `'#ffd25c'`）にする。第3段の「傷む・こぼす」の知らせとの重なり（後回しの細かい点）もこれでなくなる。
  - 大入り袋か景気づけを持っているとき、その判子の右に、次の10皿までの残りを `あと${FEVER_EVERY - shop.feverCount}` で出す（7.5px、系統の色）。両方持っていれば、上にある方の判子にだけ出す。
  - `shop.clock > 180` を `shop.clock >= DAY_LENGTH` にする。

- [ ] **Step 1: テストを書く** — `ShopView` を作って `handle()` に知らせを3つ続けて渡し、`banners` の長さが3、1つ目を `t` が切れるまで進めると2つ目が先頭になることを確かめる。5つ渡すと長さは `BANNER_QUEUE` で、最後の3つが残る。`{ type: 'phase' }` を渡すと先頭になる。
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/run.test.ts -t "知らせの順番待ち"` / Expected: FAIL（`banners` がない）
- [ ] **Step 3: 直す**
- [ ] **Step 4: 通るのを確かめる** — 単体テストと型。Expected: PASS
- [ ] **Step 5: 画面で確かめる** — 大入り袋と景気づけを持つ店で10皿目を出し、大入りの知らせのあとに景気づけの知らせが続くこと、判子の右に「あと○」が出ることをスクリーンショットで見る。
- [ ] **Step 6: コミット** — 「繁盛記：知らせを順に出し、大入り・景気づけまでの残りの皿を見せる」

---

### Task 2: 皿の上の判子の並びと、×10以上の式の帯

**Files:**
- Modify: `src/ui/shopView.ts`（`case 'serve'` の判子、`drawRunFx`）
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:
  - `sealOrder(ev: ServeEvent): PolicyId[]`（`shopView.ts` から export）：判子にするタグを、その皿で効いた倍率の大きい順に並べる。倍率を持たないタグ（まとめ出し・領収書・景気づけ・まかないの倍率がないとき）は倍率 1.0 として後ろ。全部の皿に効く方針（予約のみ・強気の値付け）は、同じ倍率のときも後ろ。
  - 判子は先頭の3つ（上限で止まったら2つと「上限」）。1つずつ【判子1個を押す秒数】`SEAL_STEP = 0.06` 秒ずつずらして弾ませる（全部で0.5秒以内、1.0秒以内に消える。設計書 5.5）。ついでの皿は今どおり金額だけ。
  - 式の帯：`ev.paid >= FORMULA_AT`（【式を出す倍率】`FORMULA_AT = 10`）の皿だけ、新しい1件を `formula: { text: string; t: number } | null` に入れる。描く場所は、目標の帯の下・帯の知らせの上（論理座標 x 40〜470、y 44〜54。左の方針の判子の列は避ける）。1.8秒で消える。
  - 式の文の形：`${料理名} ${元の額}円 → ${判子}×${倍率} → … → コンボ×${倍率} = ${払う額}円`。倍率が1以下のもの（引き換え）も入れる。秘伝・宴会・大盛り（営業条件）は「秘伝」「宴会」「大盛」。上限で止まったら最後を `= 上限×30 ${払う額}円`。幅に入らなければ `sc.fitSize(text, 8, 430, 6.5)`。
  - `formulaText(ev: ServeEvent): string`（export、テスト用）。

- [ ] **Step 1: テストを書く**
  - `sealOrder`：factors が `ヌシ×1.8・予約×1.6・一発×2.0` の皿は `['ippatsu','nushi','yoyaku']`。まとめ出しのタグは最後。
  - `formulaText`：天ぷら盛り（230円）・`nushi 2.2, tairyo 1.8, ippatsu 2.0, combo 3` → `天ぷら盛り 230円 → ヌシ×2.2 → 大漁×1.8 → 一発×2 → コンボ×3 = 5,465円`（設計書 5.5 の例）。上限で止まった皿は `上限×30` を含む。
  - `paid` が 9.9 の皿では `formula` が入らず、10 の皿では入る。
- [ ] **Step 2: 失敗を確かめる** / Expected: FAIL
- [ ] **Step 3: 作る**
- [ ] **Step 4: 通るのを確かめる**
- [ ] **Step 5: 画面で確かめる** — `window.__game` で ×10 以上の皿の serve イベントを流し、帯が1行で、注文の札・判子の列・知らせの帯と重ならないことをスクリーンショットで見る。判子が順に押されることも見る。
- [ ] **Step 6: コミット** — 「繁盛記：判子を倍率の大きい順に押し、×10以上の皿は式を帯に出す」

---

### Task 3: 効果の文をそろえ、札に収まることを確かめる

**Files:**
- Modify: `src/core/build.ts`（`POLICIES` の `text`）
- Create: `tests/policy-text.test.ts`

**Interfaces:**
- Produces:
  - どの効果の文も「〇〇の皿は ×{n}」の形にそろえる（例：「主素材が${PLENTY_AT}個以上ある皿は ×{1}」「待ち時間が${pct(QUICK_RATIO)}以上残っているお客の皿は ×{0}」「${TAVERN_SEATS}席が埋まっているあいだは、全部の皿が ×{1}」「待ち時間が${pct(LATE_RATIO)}を切ったお客の皿は ×{2}」）。「売上×」の言い方はやめる。直書きの「8個」「7割」「8席」「半分」「10コンボごと」「10皿」は定数から作る。
  - 席の数は `src/core/tavernNavigation.ts` の `TAVERN_SEATS`（の長さ）を使う。

- [ ] **Step 1: テストを書く（`tests/policy-text.test.ts`）**
  - 文字の幅を、全角は1字＝文字の大きさ、半角は半分として数える小さな `Screen` の代わりを作り、`wrapText`（`src/ui/screens/records`）で折り返す。
  - すべての方針・すべての段階で：選ぶ画面の札（4枚のとき、幅 `110 - 14`、7.5px）の `descOf` と、強化の `descDiff`（Lv1→Lv3 のいちばん長い形）が 5行以内。入れ替えの画面の札（幅 76、7.5px）の `descOf` が 4行以内。
  - どの文にも `'売上×'` がなく、`' ×'` を含む。`'8個'`・`'7割'`・`'8席'`・`'半分'` を直書きで含まない（`build.ts` の文字列を読んで確かめる）。
- [ ] **Step 2: 失敗を確かめる** — Run: `npx vitest run tests/policy-text.test.ts` / Expected: FAIL（「売上×」がある、連打の熱・領収書が長い）
- [ ] **Step 3: 文を直す** — 長い文（連打の熱・領収書はいらない）は、細かい決まりをずかんのホバーに回して短くする。`npm run font-text`。
- [ ] **Step 4: 通るのを確かめる** — 単体テストと型。Expected: PASS
- [ ] **Step 5: 画面で確かめる** — 入れ替えの画面（方針5つで満杯の日）で、連打の熱と領収書の札がはみ出さないことをスクリーンショットで見る。
- [ ] **Step 6: コミット** — 「繁盛記：効果の文を「〇〇の皿は ×いくつ」にそろえ、札に収まることを確かめる」

---

### Task 4: 方針ごとの稼ぎの振り返りと、素材の助け

**Files:**
- Modify: `src/core/shop.ts`（`serveOne` の振り返り、仕込みで足した数）、`src/core/build.ts`（`BuildStats.prep`）、`src/ui/runMode.ts`（`drawTop`）
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:
  - 稼ぎの配り方（設計書 5.7）：`extra = max(0, gain - plain)` を、その皿で効いた方針の倍率（1より大きいもの）の **対数の比** で配る。重みは `Math.log(mult)`。領収書は、そのときのコンボの倍率が `SHOP.comboMaxMult` を超えた分だけ（`Math.log(comboMult / SHOP.comboMaxMult)`）。重みの合計が0なら配らない。まとめ出し・別腹の「皿ごと」の分（`whole`）は今のまま。
  - `BuildStats.prep: number`：こまめな仕込みで足した素材の合計の個数（時間帯のはじめに足した分。選んだその場の分は数えない）。`emptyBuildStats()` は 0。
  - 結果の画面の「直接売上の推計（上位3つ）」の下の注記の行を、素材の助けがある日は `素材の助け：景気づけ +${keiki}個・仕込み +${prep}個・まかない ${fired.makanai}皿` に替える（0のものは出さない。どれもなければ今の注記のまま）。

- [ ] **Step 1: テストを書く**
  - 一発勝負×2.0 とヌシ×4.0（とれたての倍率をテストで4にする）が乗った皿で、`yen.nushi` が `yen.ippatsu` の2倍（±1円）。
  - 宵っ張りの朝（×0.9）と一発勝負のミス（×0.8）だけの皿では、どの方針の `yen` も増えない。
  - 上限で止まった皿でも、配った額の合計が `gain` 以内で、どれも有限で0以上。
  - 仕込み Lv3 で昼の部に入ると `buildStats.prep` が `5 × 素材の種類の数` 増える。
- [ ] **Step 2: 失敗を確かめる** / Expected: 1つ目と4つ目が FAIL（今は等分、`prep` がない）
- [ ] **Step 3: 直す**
- [ ] **Step 4: 通るのを確かめる** — 単体テストと型。`tests/regression.test.ts` が通る（通常営業は振り返りを使わない）。
- [ ] **Step 5: 画面で確かめる** — 結果の画面で「素材の助け」の行が枠に収まることをスクリーンショットで見る。
- [ ] **Step 6: コミット** — 「繁盛記：稼ぎを倍率の大きさで配り、素材の助けを結果に出す」

---

### Task 5: 選ぶ画面の光らせ方と、昨日の注文からの見込み

**Files:**
- Modify: `src/core/build.ts`（`MARKS`、`BuildStats.seen`）、`src/core/shop.ts`（`seen` を数える、`streak`）、`src/core/run.ts`（`Offer.glow`、`glowFor`、`RunState.lastSeen`、`estimateFor`、`closeDay`、`readRun`）、`src/ui/runMode.ts`（候補の札）
- Test: `tests/run.test.ts`

**Interfaces:**
- Produces:
  - 重なりの目印 `MARKS: Record<PolicyId, Mark[]>`（`Mark = 'all' | 'typing' | 'night' | 'morning' | 'fresh' | 'plenty' | 'scarce' | 'combo' | 'wait' | 'rush' | 'ale'`）：

| 目印 | 方針 |
|---|---|
| all（光らせない） | 予約のみ、強気の値付け |
| typing（打ち方） | おもてなし、一発勝負、連打の熱、早口自慢 |
| night（夜） | 延長営業、早口自慢、手間ひま、宵っ張り |
| morning（朝） | 朝市 |
| fresh（調達帰り） | さっきのヌシ、大漁旗、朝市 |
| plenty（素材が多い） | 大漁旗、大盛り上等、こまめな仕込み、景気づけ |
| scarce（素材が少ない） | おやじの見栄、まかない名人 |
| combo（コンボ） | 領収書はいらない、大入り袋、延長営業、景気づけ |
| wait（待たせる） | しめは別腹、看板娘の愛想、おもてなし |
| rush（早くさばく） | まとめ出し、待たせない店、呼び込み上手、連打の熱 |
| ale（酒） | とりあえずもう一杯 |

  - `glowFor(id: PolicyId, owned: Owned[]): boolean`：候補が `all` なら false。持っている方針と、名前付きのかけ合わせになる（相手が `all` でない）か、型がそろうか、`all` 以外の目印が1つでも同じなら true。
  - `Offer.glow: boolean`。`offersFor` の最後で付ける（候補の選び方・乱数には使わない）。札の光と「★」は `o.glow` で決める。`o.link` の文と色は今のまま。
  - `BuildStats.seen: { served: number; long: number; kinds2: number; kinds3: number; morning: number; night: number; tens: number }`：方針の有無にかかわらず、繁盛記の営業で出した皿ごとに数える（`long` は読み `LONG_KANA` 字以上、`kinds2`・`kinds3` は素材の種類2つ・3つ以上、`morning`・`night` は時間帯）。`tens` は、コンボを切らさずに10皿出した回数（`Shop.streak`、`feverCount` と同じ所で0に戻す。方針の有無にかかわらず数える）。
  - `RunState.lastSeen: BuildStats['seen'] | null`：`closeDay` で入れる。`readRun` は、ない・形が違うときは null。
  - `estimateFor(id: PolicyId, lv: number, seen: BuildStats['seen'] | null): string | null`：
    - 早口自慢 `昨日なら${long}皿が対象`、手間ひま `昨日なら${kinds2 + kinds3}皿が対象`、宵っ張り `昨日なら夜の${night}皿が対象`、朝市 `昨日なら朝の${morning}皿が対象`、景気づけ `昨日なら${tens}回、素材+${tens * 2 * gain}個`（`gain` はその段階の数）。
    - ほかの方針と、`seen` が null のときは null。お客の数や待ち時間を変える方針には出さない（設計書 5.5）。
  - 札：見込みがあれば、一言（quip）の代わりに `#a9f0e4` の 7.5px で1行出す。

- [ ] **Step 1: テストを書く**
  - 候補が変わらない：今の `offersFor` の結果（種 1〜5、日 0〜3、枠 0、引き直し 0、`allMeta` 相当、持っている方針あり・なし）を、変える**前**にテストの中の表として書き出しておき、変えたあとも `id` と `kind` の並びが同じ。
  - `glowFor`：`tsuyoki` はいつも false。`ippatsu` を持っていると `hayakuchi` は true。`yoippari` を持っていると `tema` は true。`yoyaku` だけ持っていても `tsuyoki`・`ippatsu` は false（名前付きの組「格式の店」の相手でも、候補が `all` なら false）。
  - `estimateFor`：`seen` が null なら全部 null。`keiki` Lv3・`tens` 3 なら `昨日なら3回、素材+24個`。`yoyaku` はいつも null。
  - `seen`：方針なしの繁盛記の店で、7字の料理と3種類の料理を出すと `long`・`kinds3` が増える。10皿続けて出すと `tens` が1。コンボが切れると数え直す。
  - 古い保存データ（`lastSeen` がない `RunState`）を `readRun` で読むと `lastSeen` は null。
- [ ] **Step 2: 失敗を確かめる** / Expected: 「候補が変わらない」以外は FAIL
- [ ] **Step 3: 作る**
- [ ] **Step 4: 通るのを確かめる** — 単体テストと型。
- [ ] **Step 5: 画面で確かめる** — 2日目の朝の選ぶ画面で、見込みの行と光り方をスクリーンショットで見る（候補3枚と4枚の両方）。
- [ ] **Step 6: コミット** — 「繁盛記：選ぶ画面は重なる方針だけを光らせ、昨日の注文から見込みを出す」

---

### Task 6: 景気づけの相談の材料をそろえる

**Files:**
- Create: `docs/balance/2026-11-24-policy-multiply-stage4.md`

- [ ] **Step 1: 景気の店を見えるようにした状態で、1日遊んだ画面を撮る** — 10皿目の知らせ、「あと○」、結果の画面の「素材の助け」、2日目の選ぶ画面の見込み。
- [ ] **Step 2: 強くする案を3つまで書く** — どれも「素材を増やす方針」という性格は残す（倍率の方針にしない）。案ごとに、変える値、ほかの方針（調達・見栄・大漁旗）への影響、確かめ方（`npm run sim:policy` の景気の店）を書く。案の例：増やす素材を2種類から3種類に／増えた素材を使う次の10皿に小さな倍率／10皿ごとをコンボ8皿ごとに。
- [ ] **Step 3: コミット** — 「繁盛記：第4段の記録と、景気づけの案」
- [ ] **Step 4: ユーザーに案を出して選んでもらう**（実装は選ばれてから、第5段の調整と一緒に行う）。

---

## このあと（この計画では作らない）

- 第5段：景気づけの案の実装（選ばれたもの）、目標の決め直し、1枠の差し替えの比べ、予告で選ぶ得の測り直し、遊んでの確かめ、sakurai と Codex のレビュー、公開。
