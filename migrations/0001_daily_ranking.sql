CREATE TABLE scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL,
  difficulty TEXT NOT NULL CHECK (difficulty IN ('easy', 'normal', 'hard')),
  name TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score >= 0),
  served INTEGER NOT NULL,
  max_combo INTEGER NOT NULL,
  angry INTEGER NOT NULL,
  accuracy REAL NOT NULL,
  kps REAL NOT NULL,
  player TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE (date, difficulty, player)
);
CREATE INDEX scores_board ON scores (date, difficulty, score DESC, created_at, player);

-- 自己ベストを更新しない送信も数える。生のIPアドレスは保存しない。
CREATE TABLE score_requests (
  request_id TEXT PRIMARY KEY,
  player TEXT NOT NULL,
  ip_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX requests_player ON score_requests (player, created_at);
CREATE INDEX requests_ip ON score_requests (ip_hash, created_at);
CREATE INDEX requests_time ON score_requests (created_at);
