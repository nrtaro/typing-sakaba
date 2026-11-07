# 引き継ぎ：ひがわり営業（段階0〜4の変更点と、段階5ランキングの指示）

作成：2026-11-07（Claude → Codex）
対象ブランチ：`daily-mode`（GitHub `nrtaro/typing-sakaba`）
分岐元：`main` の `9e8252d`（IME notice, phone/tablet notice…）。2026-11-07 時点で `main` はこのあと進んでいない。

---

## 0. 最初に守ってほしいこと

- **作業は `daily-mode` から切ったブランチで行う**（例：`daily-ranking`）。`main` から切ると段階0〜4が入っていない。
- **`main` へのマージ・push は、ユーザーが「反映して」「マージして」と言ったときだけ。** `main` に push すると Cloudflare に自動で本番デプロイされる。
- `daily-mode` もまだ `main` に入っていない（ユーザーの確認待ち）。段階5は `daily-mode` の上に積む。
- ユーザーとのやりとりは日本語。専門用語を避け、やさしい言葉で。
- 共有フォルダ `Last-Order/Last-Order` には、ほかの作業者の未コミットの変更があることがある。`git checkout -- <file>` や `git reset` で消さないこと。Claude は別のフォルダ（worktree `Last-Order/typing-sakaba-aff`、ブランチ `daily-mode`）で作業していた。
- **D1 データベースの作成はユーザーが行う**（Cloudflare アカウントの操作のため）。必要なコマンドと手順をユーザーに示し、作ってもらってから `database_id` を設定に入れる。
- 確かめ方：`npx tsc --noEmit -p .`、`npx vitest run`（いま 690 件すべて通る。`tests/daily.sim.test.ts` はボットで 36 通りを回すので 1〜2 分かかる）、`npx vite build`。
- 開発中の確認：`npm run dev` で開き、`?slot=名前` を付けると保存枠を分けられる（例：`http://localhost:5173/?slot=test`）。開発時だけ `window.__game` で `Game` を触れる（`src/main.ts`）。確認が終わったら `?slot=` の localStorage キー（末尾 `.名前`）を消す。
- git push がときどき無言で止まる。`timeout` を付けて何度か試すと通る（認証の問題ではなかった）。

---

## 1. ブランチのコミット（古い順）

| コミット | 内容 |
|---|---|
| `5404541` | 段階0：`src/ui/game.ts` の画面ごとの描画を `src/ui/screens/*.ts` に分けた（見た目・動きは変えていない） |
| `34f1651` | 段階1：営業の選択、今日のお題、ノーミス営業、日ごとの記録（このとき入れた「調達は2回まで」は次で撤廃） |
| `f91fd18` | 「調達は2回まで」を撤廃、説明から大小の表記を消す、「ひらく」→「はじめる」 |
| `1048571` | 段階2：狭い倉庫・調達中もお客は待たない・時間帯の当たり・ミスで素材をこぼす・おかわり注文、ボットでの釣り合い確認 |
| `eea4b48` | 営業中のお題の印を、画面の左に縦に並べる |
| `36128d6` | 段階3：品切れ札・ひでんの・届くまで時間がかかる・素材が傷む・予約の宴会 |
| `dc4b3b2` | 段階4：開店前の仕込み（新しい画面） |

---

## 2. できあがったもの（遊ぶ人から見て）

### 流れ
タイトル →「はじめる」→ **営業をえらぶ**（通常営業 `つうじょう`／ひがわり営業 `ひがわり`）→ 難易度 →（ひがわりのみ）**今日のお題** →（仕込みの日のみ）**開店前の仕込み** → カウントダウン → 営業 → 結果。

- Enter：営業の画面では前回の営業、難易度の画面では前回の難易度、それ以外は先頭の札。
- Esc：ひとつ前の画面へ（結果はタイトルへ）。
- 結果の「もういちど」：ひがわりは同じお題でもう一度（日付が変わっていたらお題の画面から。仕込みの日は仕込みの画面から、前の振り分けを残して）。

### お題の決まり方
- 日本時間（JST）の日付だけで決まる。どの難易度でも同じお題で、難易度で強さだけが変わる。
- 1日＝**大きなお題1つ＋小さなお題1つ**。大6×小6＝36通り（除外の組み合わせはどちらも同じ種類どうしなので、実際にはすべて出る）。
- お客の来かたは、同じ日でも遊ぶたびに変わる（乱数の種は毎回ちがう）。**同じ日の同じ難易度でも、お客の並びはプレイごとに違う**ことに注意（ランキングの公平さは「同じお題・同じ難易度」まで）。

### お題の一覧（数字は やさしい／ふつう／むずかしい）

| 種類 | お題 | ルール |
|---|---|---|
| 大 | 狭い倉庫 | 素材は1種類 10／8／6 個まで。あふれた分は持ち帰れない |
| 大 | 調達中もお客は待たない | 調達中も待ち時間が減る（0.5／0.75／1 倍の速さ） |
| 大 | 時間帯で当たりが変わる | 朝・昼・夜で当たりの調達先が変わり 1.5 倍。ほかは 1／0.85／0.7 倍（出かけた時間帯で判定） |
| 大 | 届くまで時間がかかる | 帰ってから素材が届くまで 10／20／30 秒 |
| 大 | 素材が傷む | 手に入れてから 90／75／60 秒で傷む。使うときは古いものから |
| 大 | 予約の宴会 | 決まった時刻（1／2／3 回）に宴会のお客が列の先頭に来る。売上2倍、怒ると減点3倍、品切れ札では断れない |
| 小 | ノーミス営業 | ミスでコンボが切れる（やさしいは1回まで続く）。むずかしいは怒って帰る客の減点2倍 |
| 小 | ミスで素材をこぼす | ミス 3／2／1 回ごとに素材を1つこぼす（打っている料理の素材から） |
| 小 | おかわり注文 | 15／20／25％ のお客が、食べ終わるともう1品たのむ。2品目は待たせても怒らない |
| 小 | 品切れ札 | 「しなぎれ」で作れない注文を断れる（5／3／2 回）。怒られず、コンボも切れない |
| 小 | ひでんの | 「ひでんの」で次の1皿が売上2倍（4／3／2 回）。ローマ字は `hidennno` |
| 小 | 開店前の仕込み | 開店前に素材 36／30／26 個を自分で振り分ける（1種類12個まで）。宴会・当たりと同じ日に出せるよう小にした |

除外：`ノーミス営業＋ミスで素材をこぼす`、`素材が傷む＋届くまで時間がかかる`（`DISALLOWED_PAIRS`）。

### ボットでの釣り合い（通常営業の売上を100とする）
- 36通りすべて 44〜170 に収まることをテストで確かめている（`tests/daily.sim.test.ts`）。
- 重めなのは「ノーミス営業」（単独で ふつう 60前後）と「素材が傷む」。軽め（ごほうびの日）なのは やさしいの「予約の宴会＋おかわり注文」。
- **日によって売上の高さが違うので、ランキングは「日付×難易度」ごとに分ける前提**。

---

## 3. コードの地図

### 中心（`src/core`）
- `daily.ts`（新規）
  - `DayRules`：お題が営業に与える変更の型。`NORMAL_RULES` が通常営業。
  - `CONDITIONS`：お題の定義（`kind`、`title(d)`、`lines(d)`（2行の説明）、`apply(rules, d, date)`）。
  - `dailyConditions(date)`：その日のお題（大→小の順の配列）。`rulesFor(conds, d, date)`：ルールにまとめる。
  - `jstDate(now)`：JST の `YYYY-MM-DD`。`dateLabel(date)`：「11月8日（日）」。
  - `luckySchedule(date)`、`banquetPlan(date, d)`、`defaultPrep(rules)`、`prepCap(rules)`、`isBanned(a, b)`。
  - 日付から決める部分は `hash()`（FNV 系）で決めているので、**サーバー側でも同じ関数を使えばお題を再現できる**（段階5の確認・段階6の再現に使える）。
- `shop.ts`
  - `new Shop(rng, difficulty, rules = NORMAL_RULES)`。ルールに応じて：倉庫の上限、調達中の待ち時間、当たりの倍率、こぼす、おかわり（`Guest.extra` / `Guest.refill`）、品切れ札・ひでんの（`TargetData` に `{ kind: 'skill' }`、`canUseSkill`、`skillLeft`、`declineSeat`）、届く遅れ（`pending`、`pendingFor`）、傷む（`lots`、`spoilsIn`）、宴会（`banquetsLeft`、`Guest.banquet`）、仕込み（`applyPrep(alloc)`）。
  - 新しいイベント：`comboBreak`、`spill`、`refill`、`leave`、`delivery`、`spoil`、`decline`、`hiden`、`banquet`。`serve` に `hiden` / `banquet`、`tripEnd` に `overflow` / `lucky` / `delayed` を追加。
  - **通常営業の乱数の使い方は変えていない**（おかわりの日だけ追加で乱数を引く）。通常営業の既存テストはそのまま通る。
- `save.ts`
  - `Settings.playMode: 'normal' | 'daily'`（前回選んだ営業）。
  - ひがわりの記録は `lastorder2.daily`（`{ [date]: { [difficulty]: DayRecord } }`、直近30日分）。`loadDailyBest(date, diff)`、`recordDaily(rec, date, diff)`。通常営業の自己ベスト（`lastorder2.best*`）とは混ぜない。

### 画面（`src/ui`）
- `game.ts`：`Game` は画面の切り替え・入力・時間の進行の司令塔。各画面の描画は `screens/` の関数（`drawXxx(g: Game)`）。
  - `Mode`：`'title' | 'help' | 'modeSelect' | 'difficulty' | 'daily' | 'prep' | 'play' | 'result'`。
  - `menuItems()`：その画面で打てる札（`{ text, kana, act }`）。打ち切ると `act()`。
  - `daily: { date, conds } | null`（ひがわりのとき）、`prep`（仕込みの振り分け）、`result`（`daily` を含む）。
  - `onKey(e)`：すべてのキー入力はここ（`window` の `keydown`）。**名前入力の欄を出す間は、ここで早めに return してゲームの操作を止める必要がある**（下の段階5を参照）。
  - `finish()`：営業の終わり。ひがわりは `store.recordDaily()`、通常は `store.record()`。**ランキングへの送信はここ（または結果画面）から始めるのが自然。**
- `screens/`：`common.ts`（打つ札・メニュー・案内）、`title.ts`、`help.ts`（遊び方。3ページ目「2つの営業」）、`modeSelect.ts`、`difficulty.ts`、`daily.ts`（今日のお題）、`prep.ts`（仕込み）、`result.ts`（結果。ひがわりは見出し・お題・今日のベスト）、`play.ts`、`conditions.ts`（お題の絵と札）、`shared.ts`（定数と型）。
- `shopView.ts`：営業中の表示。お題の印は `drawRules()`（左に縦に並ぶ）、調達の欄の「満」「当たり」「＋n ○秒後」「傷む○秒」、注文の札の「＋もう1品」「予約の宴会」「しなぎれで断れる」。
- `minigameView.ts`：調達中の画面。「調達中もお客は待たない」の日に「店で○人が待っている」を出す。

### テスト
- `tests/daily.test.ts`：日付、お題の決まり方、各お題のルール、記録。
- `tests/daily.sim.test.ts`：ボットで 36 通り×3 難易度の売上を通常営業と比べる。
- `tests/day.sim.test.ts`：`playDay(seed, kps, missRate, diff, rules)`。ボットは品切れ札・ひでんのも使い、届く日は早めに取りに行き、仕込みは「おまかせ」。

---

## 4. 段階5の指示：ランキング（Cloudflare Worker ＋ D1）

### 目的
ひがわり営業の結果を、**日付×難易度ごと**に、ほかの人と比べられるようにする。プレイ後に名前を付けて送る。

### 決まっていること（ユーザーと合意済み）
- 方式は **Cloudflare Worker ＋ D1**。
- ランキングは日付×難易度ごと（3難易度）。通常営業はランキングなし。
- プレイ後に名前を付ける。名前入力は **HTML の `<input>`** を重ねて出し、日本語入力（IME）を使えるようにする。入力中はゲームのキー操作を止める。
- もっともらしさの確認（ありえない記録をはじく）、送信の回数制限、上位5人の表示、つながらないときの代わりの表示。
- **D1 の作成はユーザーが行う。**
- 段階6（あとで）：サーバー側でのプレイの再現確認、Turnstile、X への共有文。段階5では入れない。

### 構成の案
1. **Worker を足す**（いまは静的配信だけ）
   - `wrangler.jsonc` に `main`（例：`worker/index.ts`）、`assets`（`directory: "./dist"`、`/api/*` 以外は今までどおり静的ファイル）、`d1_databases`（binding 例：`DB`）。
   - 静的ファイルの配信はこれまでどおりにすること（`assets` の `run_worker_first` を `/api/*` だけにする、またはWorker内で `env.ASSETS.fetch` に回す）。本番の見た目・動きを変えない。
2. **D1 のテーブル**（例）
   ```sql
   CREATE TABLE scores (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     date TEXT NOT NULL,          -- JST の YYYY-MM-DD
     difficulty TEXT NOT NULL,    -- easy / normal / hard
     name TEXT NOT NULL,          -- 1〜10文字
     score INTEGER NOT NULL,
     served INTEGER NOT NULL,
     max_combo INTEGER NOT NULL,
     accuracy REAL NOT NULL,
     kps REAL NOT NULL,
     player TEXT NOT NULL,        -- 端末ごとのランダムなID（localStorage）
     ip_hash TEXT NOT NULL,       -- 回数制限用（生のIPは保存しない）
     created_at TEXT NOT NULL
   );
   CREATE INDEX scores_board ON scores (date, difficulty, score DESC);
   ```
   - 同じ `player` が同じ日・同じ難易度で何度も送ったときは、**一番よい記録だけを順位に使う**（上書き保存か、集計時に MAX を取るかは任せる）。
   - マイグレーションは `migrations/` に置き、`npx wrangler d1 migrations apply <DB名> --local / --remote` で当てる手順をユーザー向けに書く。
3. **API**（例）
   - `POST /api/daily/score`：`{ date, difficulty, name, player, score, served, maxCombo, angry, accuracy, kps, conds }` → `{ rank, total }`。
   - `GET /api/daily/top?date=…&difficulty=…&player=…` → `{ top: [{ name, score }] (上位5), me: { rank, score } | null, total }`。
4. **サーバー側の確認**
   - `date` は JST の今日（日付が変わった直後の送信のため、前日も数分だけ受ける）。
   - `difficulty` は3つのどれか。`conds` はサーバーで `dailyConditions(date)` を計算して一致を確かめる（`src/core/daily.ts` をそのまま読み込める作りにする）。
   - 名前：前後の空白を除いて1〜10文字、制御文字なし。ひどい言葉の簡単な除外（短い一覧でよい）。
   - もっともらしさ：`score` の上限（難易度ごと。いまのボットの最高は ふつう 約1.8万、むずかしい 約1.5万。宴会・ひでんのの日を考えて余裕を持たせる）、`served` の上限、`kps` は 0〜15 程度、`accuracy` は 0〜1。はみ出したら受け付けない。
   - 回数制限：`ip_hash` と `player` ごとに、たとえば 10分に10回まで。
5. **ゲーム側**
   - 端末ごとの `player` ID を `localStorage` に作って持つ（`save.ts` に足す。`?slot=` の枠分けにも従う）。
   - 前回の名前を `Settings` に覚えておき、次から初めに入れておく。
   - **結果画面（ひがわり）**：「なまえをいれる」の札（打って選ぶ、または Enter）→ `<input>` を画面の上に重ねて出す（日本語入力可、Enter で送信、Esc で取り消し）。入力中は `Game.onKey` の先頭で return してゲームの操作を止め、閉じたら戻す。送信後は「今日○位／○人中」を出す。
   - **今日のお題の画面**：その難易度の上位5人を出す（読み込み中・つながらないときの表示も）。
   - つながらないとき：送信できなかったことを短く知らせ、端末の記録（`lastorder2.daily`）はこれまでどおり残す。ゲームは止めない。
   - 画面の文字はキャンバスに描く作り。名前入力の `<input>` だけは HTML で、`src/ui/deviceNotice.ts`（スマホ向けの案内を HTML で出している）が参考になる。
6. **テスト**
   - 入力の確認（名前・日付・もっともらしさ）は、Worker と切り離した純粋な関数にして vitest で確かめる。
   - 順位の計算（同じ人の一番よい記録だけ数える）も関数にして確かめる。
   - 手元では `npx wrangler dev`（`--local` の D1）で通して確かめる。
7. **ユーザーにお願いすること**（作業の前に、コマンドと手順を示す）
   - `npx wrangler d1 create typing-sakaba`（名前は任意）を実行し、表示された `database_id` を教えてもらう。
   - 本番のテーブル作成（`migrations apply --remote`）も、ユーザーの了承を得てから。

### 段階5では入れないもの
- サーバーでのプレイの再現確認、Turnstile、X への共有（段階6）。
- 通常営業のランキング。

---

## 5. 気をつけること・未確認のこと
- 「ノーミス営業」はボットだと重め（ミス2〜5%のボットではコンボがほとんど続かない）。ユーザーには伝えてあり、変えるかは未決定。
- 「ひでんの」と料理「ひものやき」、「しなぎれ」と調達「しいれ」は最初の音が同じだが、2文字目で分かれるので言葉はそのまま（テストあり）。
- 日付が変わる瞬間（0時）のまたぎ：開店時の日付のお題で最後まで遊び、記録もその日付で残す作りにしている。送信もその日付で行い、サーバーは前日を数分だけ受ける想定。
- 実際の人が遊んだときの難しさは、ボットでしか確かめていない。
