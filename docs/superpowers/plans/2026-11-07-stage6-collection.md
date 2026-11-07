# 段階6 コレクション・ふくびき・シール帳 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 売上を貯めて引く「ふくびき」と実績で、二つ名（前＋つなぎ＋後ろ）・ネームプレート・打鍵音・シールの計156個を集め、二つ名とプレートをひがわりランキングに出す。

**Architecture:** 飾りの一覧（データ）と、所持・貯金箱・ふくびきの純粋な計算を `src/core` に置き、端末の保存は既存の `SaveStore` に枠を1つ足す。売上は段階5の `recordPlay` と同じ営業IDで一度だけ足す。サーバーは列を4つ足し、一覧にある ID だけを保存する。

**Tech Stack:** TypeScript 7（noUnusedLocals）、Vite 8、Vitest、Canvas 2D（基準 480×270）、Cloudflare Workers + D1。

**Spec:** `docs/superpowers/specs/2026-11-07-stage6-collection-design.md`

## Global Constraints

- 文章・画面の言葉は日本語。コードのコメントも既存どおり日本語。
- ふくびき 1回 8,000 円。最初の1回は無料。
- ☆の確率 40/30/18/11/1（%）。かぶりのおまけ札 1/2/5/15/50。交換 5/10/25/75/200。
- 見た目：☆1〜2 ふつう、☆3〜4 キラキラ、☆5 ホログラム。玉の色 白・緑・青・金・虹。
- 156個：前の言葉 40（実績6・☆12/10/6/4/2）、後ろの言葉 40（同）、プレート 24（実績4・☆6/5/4/3/2）、打鍵音 16（実績2・☆4/4/3/2/1）、シール 36（4シリーズ×9、実績8・☆8/7/5/4/4、各シリーズに実績2枚と☆5を1枚）。
- つなぎ：な／の／（なし）／のような／みたいな／という。最初から全部使える。
- 実績26件にちょうど1つずつ実績限定の飾り。実績限定はふくびきにも交換にも出ない。
- 永続 ID は小文字英数とハイフン。使い回さない。
- すべて端末で完結。サーバーは ID が一覧にあるかだけ確かめ、知らない ID は捨てて点数は受け付ける。
- 起動時の読み込みを重くしない（シールの絵はシール帳・ふくびきを開いたときに読む）。
- main への反映・公開・本番 D1 の移行は、ユーザーが明示的に依頼してから。

## Review Focus

- 打鍵音を付けたまま遊ぶ：営業中・調達中・メニューの打鍵すべてで選んだ音が鳴り、音量設定・消音に従うこと（Task 5 に試験）。
- 二つ名が長い組み合わせ（最長の前＋「のような」＋最長の後ろ）でも、ランキングの行・飾りの見本・結果画面で枠からはみ出さないこと（Task 6 に試験）。
- 旧版のまま開いていたタブと新版のタブが同じ端末で同時に保存する：貯金箱やおまけ札が消えない（保存の直前に読み直す。Task 3 に試験）。
- ひがわり結果で名前入力中に飾りを変える手段はないが、送信時は「その時点で付けている飾り」を使うこと（Task 7 に試験）。
- 交換画面で、すべて持っている☆を選んだときやおまけ札が足りないときに、何も減らず理由が出ること（Task 2・Task 9 に試験）。

---

## ファイル構成

| ファイル | 役割 |
| --- | --- |
| `src/core/collectionItems.ts`（新） | 156個とつなぎの一覧（データだけ）。ユーザーが直すのはここ |
| `src/core/collection.ts`（新） | 型・定数（値段・確率・枚数）・一覧の引き方・所持の判定・ふくびき・交換・付け替え・保存値の読み取り |
| `src/core/save.ts` | 保存枠 `collection` を足し、`recordPlay` で売上を足す |
| `src/core/ranking.ts` | `ScoreSubmission`・`RankedScore` に飾りの ID を足し、ID の確かめ方を置く |
| `worker/validation.ts`・`worker/repository.ts`・`migrations/0003_decorations.sql` | 受け付け・保存・上位の取得 |
| `src/ui/audio.ts` | 打鍵音の種類 |
| `src/ui/nameplate.ts`（新） | プレートと二つ名を描く共通の関数 |
| `src/ui/stickerArt.ts`（新） | シール・台紙の絵の読み込み（あとから）と、光り方の重ね描き |
| `src/ui/screens/collectionTabs.ts`（新）、`stickerBook.ts`（新）、`decor.ts`（新） | 「きろく」の3つのタブ |
| `src/ui/screens/fukubiki.ts`（新） | ふくびき画面 |
| `src/ui/game.ts`・`screens/title.ts`・`screens/result.ts`・`screens/ranking.ts`・`rankingClient.ts` | つなぎ込み |
| `public/stickers/`（新） | シールと台紙の絵（仮の絵から始める） |

---

### Task 1: 飾りの一覧（下書き）と型 — ユーザー確認で止める

**Files:**
- Create: `src/core/collection.ts`（型と一覧の引き方だけ。ふくびきは Task 2）
- Create: `src/core/collectionItems.ts`
- Test: `tests/collection.test.ts`

**Interfaces:**
- Consumes: `ACHIEVEMENTS`（`src/core/achievements.ts`）の `id`
- Produces:
  ```ts
  export type Kind = 'front' | 'back' | 'plate' | 'sound' | 'sticker';
  export type Star = 1 | 2 | 3 | 4 | 5;
  export type Source = { achievement: string } | 'gacha';
  export interface Item {
    id: string; kind: Kind; star: Star; source: Source; name: string;
    plate?: { bg: string; border: string; text: string; pattern?: 'plain' | 'stripe' | 'dots' | 'wood' | 'gold' };
    sound?: { wave: OscillatorType; base: number; decay: number; partial?: number; noise?: number };
    sticker?: { series: string; slot: number };   // slot 0〜8
  }
  export interface Series { id: string; name: string }
  export interface Link { id: string; text: string }   // text '' は（なし）
  export const ITEMS: Item[]; export const SERIES: Series[]; export const LINKS: Link[];
  export function itemById(id: string): Item | undefined;
  export function achievementItem(achievementId: string): Item | undefined;
  ```

- [ ] **Step 1: 失敗するテストを書く** — `tests/collection.test.ts`
  - `ITEMS` の ID が重ならず `/^[a-z0-9-]+$/`。`LINKS` は6件でテキストが `['な','の','','のような','みたいな','という']`。
  - 種類ごとの数と☆の配分が Global Constraints の表どおり（`source === 'gacha'` だけを☆で数える）。
  - `ACHIEVEMENTS` の各 id に `source.achievement` がちょうど1つ、実績限定は合計26。
  - シール：4シリーズ×slot 0〜8 がちょうど1枚ずつ、各シリーズに実績限定2枚と☆5が1枚。
  - プレートには `plate`、打鍵音には `sound`、シールには `sticker` がある。
  - 前の言葉は6文字以内、後ろの言葉は6文字以内（長さの上限。Review Focus の表示幅の前提）。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/collection.test.ts` → モジュールがないので FAIL
- [ ] **Step 3: 一覧の下書きを書く** — `collectionItems.ts`。店の設定（`docs/family-backstory.md`、料理・調達・客）に合わせ、前の言葉は様子、後ろの言葉は人を表す言葉。シリーズは「店の料理」「調達の旅」「酒場のお客さん」「家族の毎日」。実績との割り当ては実績の内容に寄せる（例：鉄角ジカ→後ろの言葉「狩人」）。シール名は絵を描く人への指示になるよう具体的に。
- [ ] **Step 4: テストが通ることを確かめる** — `npx vitest run tests/collection.test.ts` → PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：飾りの一覧の下書き"`
- [ ] **Step 6: ユーザーに一覧の確認を頼んで止まる** — 名前・☆・実績の割り当てを表にして見せ、直しを反映してから Task 2 へ進む。

### Task 2: ふくびき・交換・所持の計算

**Files:**
- Modify: `src/core/collection.ts`
- Test: `tests/gacha.test.ts`

**Interfaces:**
- Consumes: Task 1 の `ITEMS`・`itemById`、`Rng`（`next(): number` が [0,1)）
- Produces:
  ```ts
  export const PULL_PRICE = 8000;
  export const STAR_RATE: Record<Star, number>;      // 0.40, 0.30, 0.18, 0.11, 0.01
  export const DUP_TICKETS: Record<Star, number>;    // 1, 2, 5, 15, 50
  export const EXCHANGE_COST: Record<Star, number>;  // 5, 10, 25, 75, 200
  export interface Equip { front: string | null; link: string; back: string | null; plate: string | null; sound: string | null }
  export interface CollectionState { v: 1; coins: number; tickets: number; owned: Record<string, string>; equip: Equip; freeUsed: boolean; credited: string[] }
  export function emptyCollection(): CollectionState;          // link は 'na'（「な」）
  export function readCollection(raw: unknown): CollectionState;  // 壊れた値でも読める分を使う。一覧にない owned・equip は捨てる
  export function owns(s: CollectionState, unlocked: Record<string, string>, id: string): boolean;
  export function canPull(s: CollectionState): boolean;         // !freeUsed || coins >= PULL_PRICE
  export interface PullResult { state: CollectionState; star: Star; items: { id: string; isNew: boolean; tickets: number }[] }
  export function pull(s: CollectionState, rng: Rng, now?: Date): PullResult | null;  // 引けなければ null
  export function exchange(s: CollectionState, id: string, now?: Date): { state: CollectionState } | { error: string };
  export function setEquip(s: CollectionState, unlocked: Record<string, string>, patch: Partial<Equip>): CollectionState;  // 持っていない ID は無視
  export function seriesComplete(s: CollectionState, unlocked: Record<string, string>, seriesId: string): boolean;
  export function equippedTitle(e: Equip): string | null;      // 前・後ろがそろっていれば「前+つなぎ+後ろ」、なければ null
  ```

- [ ] **Step 1: 失敗するテストを書く** — `tests/gacha.test.ts`
  - 固定の種で 100,000 回 `pull` すると、☆の割合が `STAR_RATE` から ±0.6 ポイント以内。
  - ☆の中の選ばれ方：☆1 の各枠の出現回数が平均の ±15% 以内（二つ名は前の言葉1つを1枠）。
  - 二つ名が出たら `items` は前と後ろの2つで、同じ☆。
  - 最初は無料（`coins` 0 でも引ける）→ 2回目は `coins < 8000` で `null`、`coins` 8000 なら引けて 0 になる。
  - かぶり：同じ飾りが2回目に出たら `isNew:false`・`tickets` が☆の枚数、`owned` は変わらない。
  - 実績限定の ID はふくびきの結果に一度も出ない。
  - `exchange`：おまけ札が足りない→`{error}`で何も変わらない／持っているもの→`{error}`／実績限定→`{error}`／☆3 を 25 枚で交換できる。
  - `owns` は実績限定を `unlocked` から判定する。
  - `setEquip` は持っていない ID を無視、`equippedTitle` は `{front:'x',link:'no',back:'y'}` で「前の名＋の＋後ろの名」、前か後ろがなければ `null`、つなぎ（なし）は空文字でつなぐ。
  - `readCollection`：`null`・配列・数値が文字列・一覧にない owned／equip → それぞれ空・捨てる。
  - `seriesComplete`：9枚（実績限定を含む）で `true`、8枚で `false`。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/gacha.test.ts` → FAIL
- [ ] **Step 3: 実装する** — 引き方は「☆を `STAR_RATE` の累積で決める → その☆のふくびき対象の『枠』（前の言葉・プレート・打鍵音・シール。後ろの言葉は枠に入れない）から一様に選ぶ → 前の言葉なら同じ☆の後ろの言葉を一様に1つ足す」。状態は書き換えず新しいオブジェクトを返す。
- [ ] **Step 4: テストが通ることを確かめる** — `npx vitest run tests/gacha.test.ts` → PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：ふくびき・交換・所持の計算"`

### Task 3: 端末の保存と、売上を一度だけ足す

**Files:**
- Modify: `src/core/save.ts`
- Test: `tests/collection-save.test.ts`

**Interfaces:**
- Consumes: Task 2 の `CollectionState`・`readCollection`、段階5の `recordPlay(f)`
- Produces（`SaveStore` のメソッド）：
  ```ts
  loadCollection(): CollectionState;
  updateCollection(fn: (s: CollectionState) => CollectionState): CollectionState;  // 読み直し→fn→書き込み。書けなくても結果を返す
  recordPlay(f: PlayFacts, now?: Date): { records: Records; unlocked: string[]; coins: number; credited: number };
  ```
  - 保存キー `lastorder2.collection.v1`（スロットの接尾辞つき）。
  - `recordPlay` は記録の反映に続けて、`f.id` が `credited` になければ `coins += f.score` して `credited` に足す（直近 200 件を残す）。`credited` は今回足した額（二重なら 0）。

- [ ] **Step 1: 失敗するテストを書く** — `tests/collection-save.test.ts`
  - 段階6の保存がない旧セーブで `loadCollection()` が `emptyCollection()` と等しく、設定・自己ベスト・記録に触れない。
  - `recordPlay` を同じ営業IDで2回 → `coins` は1回分。別の ID → 足される。
  - 2つの `SaveStore`（同じ記憶域）で交互に `recordPlay`・`updateCollection` しても、貯金箱とおまけ札が消えない。
  - 書き込みが例外を出す記憶域でも `recordPlay`・`updateCollection` が例外を出さず結果を返す。
  - 既存の `tests/achievements.test.ts` がそのまま通る（`recordPlay` の戻り値に足しただけ）。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/collection-save.test.ts` → FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 確かめる** — `npx vitest run tests/collection-save.test.ts tests/achievements.test.ts` → PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：コレクションの保存と売上の貯金"`

### Task 4: ランキングの飾り（サーバーと型）

**Files:**
- Create: `migrations/0003_decorations.sql`
- Modify: `src/core/ranking.ts`、`worker/validation.ts`、`worker/repository.ts`、`src/ui/rankingClient.ts`
- Test: `tests/ranking-worker.test.ts`、`tests/ranking.test.ts`、`tests/ranking-client.test.ts`（既存に追記）

**Interfaces:**
- Consumes: Task 1 の `itemById`・`LINKS`
- Produces:
  ```ts
  export interface Decoration { titleFront: string | null; titleLink: string | null; titleBack: string | null; plate: string | null }
  // ScoreSubmission に `decoration?: Decoration` を足す。RankedScore に `decoration?: Decoration` を足す
  export function readDecoration(v: unknown): Decoration;  // src/core/ranking.ts。一覧にない ID は null、二つ名は3つとも正しいときだけ残す
  ```
  - SQL：`ALTER TABLE scores ADD COLUMN title_front TEXT;` `title_link`・`title_back`・`plate` も同様。
  - 保存：自己ベストを更新したとき（既存の `WHERE excluded.score > scores.score`）に4列も更新。
  - 上位の取得（`readBoard`・`readBoards`）で4列を返し、`RankedScore.decoration` に入れる（すべて NULL なら省く）。

- [ ] **Step 1: 失敗するテストを書く**
  - `readDecoration`：正しい3つ＋プレート→そのまま／前だけ知らない ID→二つ名3つとも null・プレートは残る／`undefined`→すべて null／前の言葉の ID を後ろに入れた→二つ名 null。
  - `validateSubmission`：`decoration` がない古い送信が通る／知らない ID でも `ok:true` で飾りだけ null。
  - Worker（既存のテスト用 D1 の作り方に合わせる）：飾りつきで送信→上位の取得に `decoration` が出る／点数が下がった再送信では飾りも変わらない／列が NULL の古い行は `decoration` なし。
  - クライアントの上位の読み取り：`decoration` があってもなくても受け付ける。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/ranking.test.ts tests/ranking-worker.test.ts tests/ranking-client.test.ts` → FAIL
- [ ] **Step 3: 実装する**（移行ファイル・型・検証・保存・取得）。テスト用 D1 のスキーマ読み込みに 0003 を含める。
- [ ] **Step 4: 確かめる** — 同じコマンド → PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：ランキングに二つ名とプレートの列"`

### Task 5: 打鍵音の種類

**Files:**
- Modify: `src/ui/audio.ts`、`src/ui/game.ts`
- Test: `tests/key-sound.test.ts`

**Interfaces:**
- Consumes: Task 1 の `Item.sound`、Task 3 の `loadCollection().equip.sound`
- Produces: `Sound.setKeyVoice(v: Item['sound'] | null): void`（null で今の音）。`key(n)` は設定された音で鳴らす。`Game` は起動時と飾りの付け替え時に `setKeyVoice` を呼ぶ。

- [ ] **Step 1: 失敗するテストを書く** — 偽の AudioContext（既存のテストに偽物があればそれ）で、`setKeyVoice({wave:'sine',base:440,decay:0.1})` のあと `key(3)` が sine の発振器を作る／`null` に戻すと square／消音中は何も作らない。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/key-sound.test.ts` → FAIL
- [ ] **Step 3: 実装する** — 音の高さの上がり方（`note(n)`）は既存のまま、波形・基準・減衰・倍音・雑音だけを入れ替える。
- [ ] **Step 4: 確かめる** — PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：打鍵音の種類"`

### Task 6: プレートと二つ名の描画

**Files:**
- Create: `src/ui/nameplate.ts`
- Test: `tests/nameplate.test.ts`

**Interfaces:**
- Consumes: Task 1 の `itemById`、Task 2 の `equippedTitle` の考え方（文字列は `Decoration` から作る）
- Produces:
  ```ts
  export function titleOf(d: Decoration | undefined): string | null;
  export function drawNameplate(sc: Screen, x: number, y: number, w: number, h: number, name: string, d: Decoration | undefined, size: number): void;
  ```
  - プレートがなければ今の見た目（名前だけ）。二つ名は名前の上か横に小さく、`sc.fitSize` で幅に収める。☆3〜4 のプレートはゆっくり光る線、☆5 は虹色の縁。

- [ ] **Step 1: 失敗するテストを書く** — 文字幅を数える偽の `Screen`（既存の `tests/screen.test.ts` の作り方）で、最長の前＋「のような」＋最長の後ろでも描いた文字の幅が `w` を超えない／`d` なしで名前だけ描く／`titleOf` が（なし）のつなぎで前と後ろをそのままつなぐ。
- [ ] **Step 2: 失敗を確かめる** — FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 確かめる** — PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：ネームプレートと二つ名の描画"`

### Task 7: 送信とランキング画面のつなぎ込み

**Files:**
- Modify: `src/ui/game.ts`（`ranking.submit` の呼び出し）、`src/ui/screens/ranking.ts`、タイトル・結果の上位表示（`drawRanking` を使っている所）
- Test: `tests/ranking-game.test.ts`、`tests/ranking-screen.test.ts`（既存に追記）

**Interfaces:**
- Consumes: Task 3 の `loadCollection()`、Task 4 の `Decoration`、Task 6 の `drawNameplate`
- Produces: 送信の本体に `decoration`（送信する瞬間に `loadCollection().equip` から作る。持っていない飾りは送らない）。

- [ ] **Step 1: 失敗するテストを書く** — 送信の直前に付け替えた飾りが送られる／何も付けていなければ `decoration` の4つが null／ランキング画面が `decoration` つきの行で `drawNameplate` を使う（描画の呼び出しを数える既存の方法に合わせる）。
- [ ] **Step 2: 失敗を確かめる** — FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 確かめる** — `npx vitest run tests/ranking-game.test.ts tests/ranking-screen.test.ts` → PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：ランキングに飾りを送って見せる"`

### Task 8: シールの絵の読み込みと光り方

**Files:**
- Create: `src/ui/stickerArt.ts`、`public/stickers/README.md`、仮の絵を作るスクリプト `scripts/placeholder-stickers.py`
- Test: `tests/sticker-art.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function stickerUrl(id: string): string;              // `/stickers/${id}.png`
  export function sheetUrl(seriesId: string, done: boolean): string;  // `/stickers/sheet-${seriesId}${done ? '-done' : ''}.png`
  export class StickerArt { load(ids: string[]): void; get(id: string): HTMLImageElement | null }  // 初めて要るときに読む。失敗したら null のまま
  export function drawSticker(sc: Screen, art: StickerArt, item: Item, x: number, y: number, size: number, t: number, owned: boolean): void;  // 持っていなければ影絵。☆で光り方を重ねる
  ```
  - 絵の決まり（README に書く）：シールは透過 PNG・64×64、台紙は 192×192 で未完成と完成の2枚、ファイル名は永続 ID。
  - 仮の絵：シール名の頭文字と☆の色の丸。台紙は9マスの枠。

- [ ] **Step 1: 失敗するテストを書く** — `load` が同じ ID を二度読まない／読み込み失敗で `get` が null のまま例外を出さない／起動時の読み込み（`src/ui/fontText.ts` 以外の起動の経路）に `/stickers/` が含まれない。
- [ ] **Step 2: 失敗を確かめる** — FAIL
- [ ] **Step 3: 実装し、仮の絵を作る** — `PYTHONIOENCODING=utf-8 python scripts/placeholder-stickers.py`
- [ ] **Step 4: 確かめる** — PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：シールの絵の読み込みと仮の絵"`

### Task 9: 画面（ふくびき・きろくのタブ・タイトル・結果）

**Files:**
- Create: `src/ui/screens/fukubiki.ts`、`src/ui/screens/collectionTabs.ts`、`src/ui/screens/stickerBook.ts`、`src/ui/screens/decor.ts`
- Modify: `src/ui/game.ts`（mode `'fukubiki'`、`recordsView` に `tab: 'achievements' | 'stickers' | 'decor'`、キー操作）、`src/ui/screens/title.ts`、`src/ui/screens/result.ts`、`src/ui/screens/records.ts`、`src/ui/screens/common.ts`
- Test: `tests/collection-screens.test.ts`

**Interfaces:**
- Consumes: Task 2〜8 のすべて
- Produces（`Game` のメソッド）：`openFukubiki()`、`fukubikiKey(k: string)`、`pullOnce()`、`exchangeItem(id: string)`、`setDecor(patch: Partial<Equip>)`
  - タイトル：ボタン6つ（はじめる・あそびかた・らんきんぐ・きろく・ふくびき・おと）。打って選ぶ言葉は「ふくびき」。
  - ふくびき：「ひく」「こうかん」「もどる」。演出はガラガラ 1.2 秒→玉→カード。演出中のキーは演出を飛ばすだけで、二度引かない。
  - きろく：Tab キーと「じっせき」「しーる」「かざり」を打つとタブを切り替える。←→はシール帳ではシリーズ、実績では今どおり±8。
  - 飾り：↑↓で欄（前・つなぎ・後ろ・プレート・打鍵音）、←→で持っている中から選ぶ。打鍵音は選んだときに `sound.key(1)` で鳴らす。
  - 結果：段階5のお知らせの欄に「本日の売上 ＋n円 → 貯金箱」、引けるなら「ふくびきが引けます」。実績が開いたときは2行に分けて同じ枠に収める。

- [ ] **Step 1: 失敗するテストを書く** — 段階5のテストと同じく `Object.create(Game.prototype)` で：
  - タイトルで「ふくびき」と打つと mode が `'fukubiki'`。
  - 無料の1回で `pullOnce()` → 所持が増え、2回目は貯金箱が足りず増えない（理由の文言が出る状態になる）。
  - 演出中に Enter を連打しても1回分しか減らない。
  - `exchangeItem` でおまけ札が足りないとき、おまけ札も所持も変わらない。
  - `setDecor` で付けた飾りが保存され、再読み込み（新しい `SaveStore`）で戻る。打鍵音を変えると `setKeyVoice` が呼ばれる。
  - きろくで Tab を押すとタブが順に変わり、実績タブの既存の操作（↑↓・Enter で会話）はそのまま動く。
  - 結果に `credited` が出る（`result.credited`）。
- [ ] **Step 2: 失敗を確かめる** — `npx vitest run tests/collection-screens.test.ts` → FAIL
- [ ] **Step 3: 実装する**
- [ ] **Step 4: 確かめる** — `npx vitest run` → 全部 PASS
- [ ] **Step 5: コミット** — `git commit -m "段階6：ふくびき・シール帳・飾りの画面"`

### Task 10: 仕上げと確認

**Files:**
- Modify: `src/ui/fontText.ts`（再生成）

- [ ] **Step 1: 文字の一覧を作り直す** — `npm run font-text` → `tests/font-text.test.ts` が通る。増えた量（バイト）を記録する。
- [ ] **Step 2: 全体の確認** — `npx tsc --noEmit -p .`、`npm test`、`npm run build` がすべて成功。
- [ ] **Step 3: ブラウザーで確認**（`typing-sakaba-aff` の preview、`?slot=dtest`、終わったら `.dtest` のキーを消す）：タイトルの「ふくびき」、無料の1回と演出、かぶりとおまけ札、交換、シール帳（影絵・仮の絵・完成）、飾りの付け替えと見本、打鍵音、結果の貯金表示、ひがわりの名前入力とランキングの飾り表示、再読み込み後の復元、狭い画面幅。
- [ ] **Step 4: ローカルの Worker で移行を試す** — `npx wrangler d1 migrations apply DB --local` のあと、飾りつき送信と上位の取得を確かめる（本番には流さない）。
- [ ] **Step 5: コミット** — `git commit -m "段階6：文字の一覧と仕上げ"`
- [ ] **Step 6: ユーザーに報告** — 変更・テスト結果・手で確かめられなかった所。候補版・本番の移行・公開は依頼を待つ。
