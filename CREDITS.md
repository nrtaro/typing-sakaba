# クレジット

## フォント

- **DotGothic16** — Copyright 2020 The DotGothic16 Project Authors (https://github.com/fontworks-fonts/DotGothic16)
  SIL Open Font License, Version 1.1。npm パッケージ `@fontsource/dotgothic16` 経由で同梱しています。ライセンスの全文は `public/licenses/OFL-DotGothic16.txt`（サイトでは `/licenses/OFL-DotGothic16.txt`）に置いています。

## 画像素材（A案「琥珀の酒場」）

- 背景6枚、家族3人・客7種類・動物・商人の動き、家具・道具、食材と料理のアイコン、炎・湯気・水しぶき・きらめきの演出: 原画像は `assets/amber-v2/`、ゲーム配信用のロスレスWebPと修正した切り出しは `assets/amber-v3/` にあります。
- これらは画像生成AI（Codex の built-in image_gen）で作成した生成画像です。生成の指示文は `assets/amber-v2/revisions.json` と `assets/amber-v1/prompts.json` に記録しています。
- 釣りの人物から浮きを除いた修正版も同じ内蔵image_genで作成しました。指示文は `assets/amber-v3/fishing-source.json` に保存しています。
- ゲームでは、配信用に軽くした `assets/amber-v4/`（v3 から WebP の非可逆圧縮で作成。切り出し・足元・再生設定は `assets/amber-v4/manifest.json`）を使用します。不採用のコマ（`deprecatedFrames`）は使っていません。

## コードで描く絵・生成した音

- 画像を読み込めなかったときの代わりの絵、注文の吹き出し・ローマ字・在庫数・待ち時間のバー・画面上部の表示・下の4色の調達欄: プログラムで描いています（`src/ui/sprites.ts`、`src/ui/room.ts`、`src/ui/shopView.ts`、`src/ui/minigameView.ts`）。
- 効果音・打鍵音: Web Audio API で生成した電子音です（`src/ui/audio.ts`）。BGM は下の「ゲーム内BGM」の音源を使っています（`assets/bgm/`）。

外部の素材集の画像は使用していません。音声の外部素材は、上記の BGM（音楽の卵）だけです。

## 規約など

利用規約・プライバシーポリシー・クレジットは、サイトの `/about.html`（`public/about.html`）に載せています。

## ゲーム内BGM

作曲は takai。配布元は [音楽の卵](https://ontama-m.com/) です。[音楽素材の利用規約](https://ontama-m.com/ongaku.html) に従い、配布元のループ対応 OGG を使用しています。

| 場面 | 曲名 |
| --- | --- |
| タイトル | [ピズベリーの香り](https://ontama-m.com/ongaku_rpg_machi.html#:~:text=ピズベリーの香り) |
| 朝の営業 | [そよ風とリンゴの村](https://ontama-m.com/ongaku_rpg_machi.html#:~:text=そよ風とリンゴの村) |
| 昼の営業 | [楽しい作業工程](https://ontama-m.com/ongaku_rpg_renkin.html#:~:text=楽しい作業工程) |
| 夜の営業 | [にぎやかな田舎町](https://ontama-m.com/ongaku_rpg_machi.html#:~:text=にぎやかな田舎町) |
| 釣り | [泉のほとりで](https://ontama-m.com/ongaku_rpg_machi.html#:~:text=泉のほとりで) |
| 狩り | [ぷにぷに警報](https://ontama-m.com/ongaku_rpg_battle.html#:~:text=ぷにぷに警報) |
| 採取 | [晴天の資材集め](https://ontama-m.com/ongaku_rpg_field.html#:~:text=晴天の資材集め) |
| 仕入れ | [手作りの街](https://ontama-m.com/ongaku_rpg_machi.html#:~:text=手作りの街) |
| 営業結果 | [故郷](https://ontama-m.com/ongaku_rpg_machi.html#:~:text=故郷) |
