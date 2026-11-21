-- 週替わりチャレンジのオンラインランキング（Cloudflare D1：10buy-telemetry。プレイログと同じデータベース）
-- 1 週 × 1 プレイヤーに 1 行。自己ベスト（純資産）を更新したときだけ書き換える。90 日で消える
CREATE TABLE IF NOT EXISTS ranking (
  week TEXT NOT NULL,
  player TEXT NOT NULL,
  net_worth INTEGER NOT NULL,
  entry TEXT NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (week, player)
);
CREATE INDEX IF NOT EXISTS ranking_week_nw ON ranking (week, net_worth);

-- 回数制限（1 つの IP から 1 時間に登録できる回数）。IP は数えるためだけに使い、ランキングには残さない
CREATE TABLE IF NOT EXISTS ranking_hits (
  key TEXT PRIMARY KEY,
  hour INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS ranking_hits_hour ON ranking_hits (hour);
