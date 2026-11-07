-- 遊んだ記録（乱数の種・入力の記録・仕込みの振り分け）を、自己ベストと一緒に残す。
-- Workers の無料プランでは送信のたびにやり直せないため、上位の記録をあとから手元でやり直して確かめる。
-- 既存の記録には NULL が入る（段階6より前の送信）。
ALTER TABLE scores ADD COLUMN seed INTEGER;
ALTER TABLE scores ADD COLUMN record TEXT;
ALTER TABLE scores ADD COLUMN prep TEXT;
