# ひがわり営業ランキング Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** ひがわり営業の記録を名前付きで送り、日付・難易度ごとの上位5人と自分の順位を確認できるようにする。

**Architecture:** 合意済みの引き継ぎを設計として使う。既存の静的配信に `/api/*` の Worker を足し、D1 に端末ごとのベストを保存する。送信履歴は別テーブルで数え、ベストの更新有無にかかわらず制限する。

**Tech Stack:** TypeScript / Vite / Vitest / Cloudflare Worker / D1 (SQLite)

**Spec:** `docs/handoff-daily-mode-stage5.md`

## Global Constraints

- `daily-mode` から作った `codex/daily-ranking` で作業する。main のマージ・push・本番操作は行わない。
- 既存の未コミットファイルを消さない。現在の作業フォルダを使う。
- D1 の作成はユーザーが行う。ローカルDBのみで検証し、本番のIDは後から設定する。
- 通常営業の記録・操作と静的配信は維持する。段階6の再現確認・Turnstile・共有は実装しない。
- 名前はHTML入力、日本語入力に対応し、入力中はゲームの操作を止める。

## Review Focus

- JSTの0時から5分以内は前日の送信を受け、それ以降は拒否する。
- 同点は同順位、同じ端末の低い記録・同点の再送では名前を含めベストを変えない。
- 送信が同時でもIPまたは端末の10分10回制限を超えない。
- 日本語の確定Enterが送信にならず、送信ボタンの連打でも重複しない。
- 通信の遅い返答が、戻った後や次の営業の画面を書き換えない。

## Task 1: 入力確認・順位・保存

**Files:** `src/core/ranking.ts`, `worker/validation.ts`, `src/core/save.ts`, `tests/ranking.test.ts`

**Interfaces:** `ScoreSubmission`, `DailyBoard`, `validateSubmission(value, now)`（整形済み値かエラー）, `SaveStore.playerId()`（保存枠ごとのUUID）, `Settings.rankingName`。

- [x] 日付境界、不正な名前・数字・お題、同点・重複を扱うテストを先に書き、不足で失敗することを確認する。
- [x] 名前はNFKC・trim後1〜10コードポイント、制御文字と簡単な禁止語を拒否。数値の型・有限・整数・範囲・コンボと皿数の整合を確認する。
- [x] 端末IDの保存・同一インスタンスでの保存失敗時の安定性・保存枠分離、前回の名前を実装する。
- [x] `npx vitest run tests/ranking.test.ts tests/daily.test.ts` が成功する。

## Task 2: WorkerとD1

**Files:** `worker/index.ts`, `worker/repository.ts`, `migrations/0001_daily_ranking.sql`, `wrangler.jsonc`, `tsconfig.json`, `package.json`, `tests/ranking-worker.test.ts`

**Interfaces:** Task 1の型・検証を使う。POST `/api/daily/score` → `{ rank, total }`、GET `/api/daily/top` → `DailyBoard`。`DB` と秘密の `RANKING_IP_SALT` を使う。

- [x] SQLiteを使い、自己ベストの更新、日付・難易度の分離、同点順位、IP/端末の制限と同時送信、無効入力・DB障害を先にテストする。
- [x] D1のトランザクション内で送信履歴の制限判定・追加・スコアのupsert・順位取得を実施する。IPはHMACでハッシュ化し、生の値は保存しない。
- [x] WorkerはJSONエラーと期限付き応答を返す。API以外はASSETSへ渡す。POSTは同一オリジンのみ、入力サイズを制限する。
- [x] ローカルDBのマイグレーションと実WorkerへのPOST/GETを確認する。

## Task 3: ゲーム画面と名前入力

**Files:** `src/ui/rankingClient.ts`, `src/ui/rankingName.ts`, `src/ui/game.ts`, `src/ui/screens/daily.ts`, `src/ui/screens/result.ts`, `src/ui/screens/common.ts`, `vite.config.ts`, `tests/ranking-client.test.ts`

**Interfaces:** Task 2のAPIを使う。読み込み・成功・失敗の状態を分ける。名前入力は閉じる/送信のコールバックを持つ。

- [x] APIの送受信、通信失敗・時間切れ、保存枠のIDと記録の送信をテストする。
- [x] 結果の先頭に「なまえをいれる」の札を追加し、Enterで入力を開く。送信中は再送を止め、失敗時には再試行できるようにする。
- [x] 今日のお題の説明と上位5人を両方読める配置にし、読み込み・空・失敗を表示する。
- [x] 日本語入力の確定Enter、Esc、キャンセル、画面遷移後の返答無視を確認する。

## Task 4: 手順・全体確認・レビュー

**Files:** `docs/daily-ranking.md`, `.dev.vars.example`, `.gitignore`, 必要なテスト

- [x] D1作成、database_id設定、秘密値設定、ローカル/本番マイグレーション（本番は了承後）、開発手順を日本語で書く。
- [x] 型確認、全テスト、ビルド、ローカルWorkerの送信・表示を確認する。
- [x] 全変更を独立したレビュアーが読み、重大な指摘を修正・再検証する。

## 作業記録

- Pre-flight: Task 1→2 はScoreSubmission/検証、Task 2→3 はDailyBoard/API形、Task 3→4 は開発プロキシと秘密設定を共有する。衝突なし。
- 既存テストは制限環境では進まず、通常環境の `tests/daily.test.ts` は32件成功。テストは実行権限を切り替えて確認する。
- Task 1: 入力・保存47件と既存daily32件、計79件成功。
- Task 2: 実SQLiteを使う13件を追加し、入力と合わせ60件成功。ローカルD1マイグレーション成功、Workerを含む型確認成功。
- Task 2: Ruling: 順位計算はSQLiteのRANK/COUNTを正とし、純粋関数へ二重実装しない。実SQLiteで同点・重複・難易度・日付を検証する。重複実装による食い違いを防ぐため。SQLite依存のためNode 24が必要。
- Task 3: HTMLのIME・取消・重複送信5件、通信6件を追加し、ランキングの計71件成功。型確認とViteビルド成功。
- Baseline: 実装前の全690件成功（80秒）。Task 2時点の全750件成功（87秒）。
- Final review: 独立したレビュアーが全変更を点検。Criticalなし、Important 2件（仕込みから戻った際の順位再取得、不自然な成績の整合確認）とMinor 2件を報告。
- Final: 仕込みの札/Esc、コンボ・正しい打鍵・売上の整合性、日本語確定直後の明示的クリックを再現するテストが失敗することを確認して修正。ランキング85件成功（正しい売上境界の追加前）。
- Final: Ruling: .dev.varsを上書きする手順と明示的な送信クリックの無反応は、設定の保護と基本操作に影響するためImportantとして同じ修正パスで対応。Nodeの下限も同じ手順の修正内で訂正。
- Final: レビュアーが判定しなかった実機IME、Cloudflareの同時負荷、本番配信は、本番アカウント操作をしない制約と照合。手元のDOMイベント・トランザクション・ローカルWorkerで検証し、実機IMEと本番環境の最終確認は公開前の確認事項として残す。
- Browser: 開発プロキシ越しのPOSTがOrigin不一致で403になることを確認。実HTTPのプロキシテストで403を再現し、同一の開発画面のOriginだけを中継先に合わせるよう修正。別サイトのOriginは維持し、拒否されることをテスト（1件成功）。
- Local Worker: HTTPの同時11送信で200が10件、429が1件。上位5人と同点1位・合計10人を確認。静的ゲームもHTTP200。

- Final verification: 24ファイル・778テストすべて成功（npm test -- --maxWorkers=1 --reporter=verbose、終了コード0）。型確認を含む npm run build 成功。git diff --check 成功。
- Integration: ユーザーの既定の指示に従い、専用ブランチを保持。mainへのマージ・push・本番D1操作は行わない。
- Browser final: 名前入力とEsc取消、前回の名前の復元、開発画面からの送信成功「今日2位／2人中」、むずかしいの上位5人（同点1位）を実画面で確認。横長と縦長の配置を確認。確認画像は `.wrangler/ranking-result.jpg` と `.wrangler/ranking-top.jpg`。一時的な画面サイズ指定を解除し、確認用タブを閉じた。
