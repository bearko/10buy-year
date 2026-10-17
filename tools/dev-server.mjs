// 開発用サーバー：静的ファイルと /api/ranking・/api/telemetry（メモリに保存。再起動で消える）を配信する。
// プレイログは localhost では既定で送らない。確かめるときは、設定の「プレイ記録を送って改善に協力する」をONにする（読み出しのトークンは dev）
// 使い方: npm run dev → http://localhost:8000/
// Upstash の環境変数（KV_REST_API_URL / KV_REST_API_TOKEN）があれば、本物の保存先を使う
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHandler, memoryStore, storeFromEnv } from '../api/_ranking.js';
import { createTelemetryHandler, memoryTelemetryStore, telemetryStoreFromEnv } from '../api/_telemetry.js';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8000;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.mp3': 'audio/mpeg', '.wav': 'audio/wav' };
const store = storeFromEnv() || memoryStore();
const ranking = createHandler(() => store);
const tstore = telemetryStoreFromEnv() || memoryTelemetryStore();
const telemetry = createTelemetryHandler(() => tstore, { readToken: () => process.env.TELEMETRY_READ_TOKEN || 'dev' });

createServer(async (req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  if (path === '/api/ranking') return ranking(req, res);
  if (path === '/api/telemetry') return telemetry(req, res);
  const file = normalize(join(ROOT, path.endsWith('/') ? `${path}index.html` : path));
  if (!file.startsWith(ROOT)) {
    res.statusCode = 403;
    return res.end();
  }
  try {
    if (!(await stat(file)).isFile()) throw new Error('dir');
    res.setHeader('Content-Type', TYPES[extname(file)] || 'application/octet-stream');
    res.setHeader('Cache-Control', 'no-store');
    res.end(await readFile(file));
  } catch {
    res.statusCode = 404;
    res.end('not found');
  }
}).listen(PORT, () => console.log(`http://localhost:${PORT}/ （ランキングの保存先: ${storeFromEnv() ? 'Upstash' : 'メモリ'}）`));
