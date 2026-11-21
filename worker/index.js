// Cloudflare Workers の入口。
// /api/ranking と /api/telemetry は api/ のハンドラ（Node の req・res 形式）に渡し、
// それ以外は静的ファイル（ASSETS）をそのまま返す。
import { createHandler, storeFromEnv } from '../api/_ranking.js';
import { createTelemetryHandler, d1TelemetryStore, telemetryStoreFromEnv } from '../api/_telemetry.js';

let ranking;
let telemetry;

// プレイログの保存先：D1（TELEMETRY_DB）がつながっていればそちら、なければ Upstash
const telemetryStoreOf = (env) => (env.TELEMETRY_DB ? d1TelemetryStore(env.TELEMETRY_DB) : telemetryStoreFromEnv(env));

function init(env) {
  if (ranking) return;
  let rankingStore;
  let telemetryStore;
  ranking = createHandler(() => (rankingStore ??= storeFromEnv(env)));
  telemetry = createTelemetryHandler(() => (telemetryStore ??= telemetryStoreOf(env)), {
    readToken: () => env.TELEMETRY_READ_TOKEN,
  });
}

// Web 標準の Request を Node 形式の req・res に置き換えてハンドラを動かし、Response に戻す
export async function runNodeHandler(handler, request) {
  const url = new URL(request.url);
  const headers = {};
  request.headers.forEach((value, key) => {
    headers[key] = value;
  });
  // 回数制限に使う接続元 IP。Cloudflare では cf-connecting-ip に入る
  const ip = request.headers.get('cf-connecting-ip');
  if (ip) headers['x-forwarded-for'] = ip;

  const hasBody = request.method !== 'GET' && request.method !== 'HEAD';
  const req = {
    method: request.method,
    url: url.pathname + url.search,
    headers,
    body: hasBody ? await request.text() : undefined,
  };

  const outHeaders = new Headers();
  let payload = '';
  const res = {
    statusCode: 200,
    setHeader(key, value) {
      outHeaders.set(key, String(value));
    },
    end(chunk = '') {
      payload = chunk;
    },
  };

  await handler(req, res);
  const empty = res.statusCode === 204 || res.statusCode === 304 || request.method === 'HEAD';
  return new Response(empty ? null : payload, { status: res.statusCode, headers: outHeaders });
}

export default {
  async fetch(request, env) {
    init(env);
    const { pathname } = new URL(request.url);
    if (pathname === '/api/ranking') return runNodeHandler(ranking, request);
    if (pathname === '/api/telemetry') return runNodeHandler(telemetry, request);
    return env.ASSETS.fetch(request);
  },
};
