-- プレイログ（Cloudflare D1：10buy-telemetry）
-- 受け取った束を、受け取った日（日本時間）ごとに 1行ずつ入れる。中身は JSON のまま。
CREATE TABLE IF NOT EXISTS telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  day TEXT NOT NULL,
  json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS telemetry_day ON telemetry (day, id);

-- 回数制限（1つのIPから1時間に受け取る回数）。IPは数えるためだけに使い、プレイログには残さない
CREATE TABLE IF NOT EXISTS telemetry_hits (
  key TEXT PRIMARY KEY,
  hour INTEGER NOT NULL,
  count INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS telemetry_hits_hour ON telemetry_hits (hour);
