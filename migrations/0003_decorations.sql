-- 段階6：ランキングに出す二つ名（前の言葉・つなぎ・後ろの言葉）とネームプレートの永続ID。
-- 自己ベストを更新した送信の時点で付けていたもの。既存の記録は NULL（飾りなしで表示する）。
ALTER TABLE scores ADD COLUMN title_front TEXT;
ALTER TABLE scores ADD COLUMN title_link TEXT;
ALTER TABLE scores ADD COLUMN title_back TEXT;
ALTER TABLE scores ADD COLUMN plate TEXT;
