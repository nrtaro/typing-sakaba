# クレジット

## フォント

- **DotGothic16** — Copyright 2020 The DotGothic16 Project Authors (https://github.com/fontworks-fonts/DotGothic16)
  SIL Open Font License, Version 1.1。npm パッケージ `@fontsource/dotgothic16` 経由で同梱しています。

## 画像素材（A案「琥珀の酒場」）

- 背景6枚、家族3人・客7種類・動物・商人の動き、家具・道具、食材と料理のアイコン、炎・湯気・水しぶき・きらめきの演出: `assets/amber-v2/` の画像を使っています。
- これらは画像生成AI（Codex の built-in image_gen）で作成した生成画像です。生成の指示文は `assets/amber-v2/revisions.json` と `assets/amber-v1/prompts.json` に記録しています。
- 切り出し位置・足元の位置・再生の順番と速さは `assets/amber-v2/manifest.json` に従います。不採用のコマ（`deprecatedFrames`）は使っていません。

## コードで描く絵・生成した音

- 画像を読み込めなかったときの代わりの絵、注文の吹き出し・ローマ字・在庫数・待ち時間のバー・画面上部の表示・下の4色の調達欄: プログラムで描いています（`src/ui/sprites.ts`、`src/ui/room.ts`、`src/ui/shopView.ts`、`src/ui/minigameView.ts`）。
- 効果音・BGM: Web Audio API で生成した電子音です（`src/ui/audio.ts`）。音声ファイルは使っていません。

外部の素材集の画像・音声は使用していません。
