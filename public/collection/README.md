# プレート・シール・台紙の絵（段階6）

ChatGPT で描いた元の絵は `art-src/stage6/`、作り方の指示は `docs/stage6-art-prompts.md`。
ここにある絵は `node scripts/stage6-art.mjs` で元の絵から切り分けて作る（手で直さない）。

| 種類 | 置き場所 | 大きさ |
| --- | --- | --- |
| ネームプレート | `plates/<永続ID>.webp`（例：`p-kinari.webp`） | 高さ 96px・横長。ゲームは真ん中だけ伸ばして敷く |
| シール | `stickers/<永続ID>.webp`（例：`st-ale.webp`） | 透過・160×160 |
| 台紙（未完成・完成） | `sheets/sheet-<シリーズID>.webp`・`sheet-<シリーズID>-done.webp` | 512×512。3×3 の枠の位置は全シリーズ共通 |

- 描き直すときは、`art-src/stage6/` の同じ名前の画像を差し替えてスクリプトを流す。
- 台紙の未完成版は、完成版の絵を紙の色へ寄せて作る。
- 永続IDと名前は `src/core/collectionItems.ts`。プレートの名前の文字の色（`text`）は、絵の明るさに合わせてある。
