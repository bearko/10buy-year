// プレイログの受け取り（api/telemetry.js から使う）。保存先は差し替えられる：本番は Upstash Redis（ランキングと同じ）、テストはメモリ。
// 受け取った束は、受け取った日（日本時間）ごとのリストに入れる。180日で消える。IPアドレスは回数制限にだけ使い、保存しない。
// 読み出し（GET）は、環境変数 TELEMETRY_READ_TOKEN と同じトークンを Authorization: Bearer で渡したときだけ。
import { upstashStore } from './_ranking.js';

export const MAX_BODY = 64 * 1024;
export const MAX_EVENTS = 400;
export const POSTS_PER_HOUR = 240; // 1つのIPから1時間に受け取る回数（家族・学校などで共有していても足りるように多め）
const TTL = 180 * 24 * 3600;
const JST = 9 * 3600 * 1000;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const ID_RE = /^[a-z0-9]{6,32}$/;
const EV_RE = /^[a-z]{2,12}$/;

export const dayKey = (now) => new Date(now + JST).toISOString().slice(0, 10);
const listKey = (day) => `10buy:tlm:${day}`;

// 送られてきた束を確かめる。ゲームの中身までは見ない（形と大きさだけ）
export function validateBatch(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return { ok: false, error: 'body' };
  if (body.v !== 1) return { ok: false, error: 'version' };
  if (!ID_RE.test(body.pid || '') || !ID_RE.test(body.sid || '')) return { ok: false, error: 'id' };
  if (!Array.isArray(body.ev) || !body.ev.length || body.ev.length > MAX_EVENTS) return { ok: false, error: 'events' };
  for (const e of body.ev) {
    if (!e || typeof e !== 'object' || !EV_RE.test(e.e || '')) return { ok: false, error: 'event' };
    if (e.g != null && !ID_RE.test(e.g)) return { ok: false, error: 'game' };
    if (e.w != null && !(Number.isInteger(e.w) && e.w >= 0 && e.w <= 1000)) return { ok: false, error: 'week' };
  }
  const short = (x) => (typeof x === 'string' ? x.slice(0, 16) : undefined);
  return { ok: true, batch: { v: 1, pid: body.pid, sid: body.sid, dev: short(body.dev), lang: short(body.lang), ev: body.ev } };
}

// ---------------- 保存先 ----------------
export function redisTelemetryStore(url, token, fetchFn = fetch) {
  const base = upstashStore(url, token, fetchFn); // 回数制限（hit）はランキングと同じ仕組み
  const call = async (cmds) => {
    const res = await fetchFn(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds.map((c) => c.map(String))),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    return (await res.json()).map((x) => {
      if (x.error) throw new Error(x.error);
      return x.result;
    });
  };
  return {
    hit: (ip, hour) => base.hit(`t:${ip}`, hour),
    async append(day, json) {
      await call([['RPUSH', listKey(day), json], ['EXPIRE', listKey(day), TTL]]);
    },
    async read(day, start, count) {
      const [items, total] = await call([['LRANGE', listKey(day), start, start + count - 1], ['LLEN', listKey(day)]]);
      return { items, total: Number(total) };
    },
  };
}

export function memoryTelemetryStore() {
  const hits = new Map();
  const days = new Map();
  return {
    async hit(ip, hour) {
      const k = `${ip}:${hour}`;
      hits.set(k, (hits.get(k) || 0) + 1);
      return hits.get(k);
    },
    async append(day, json) {
      if (!days.has(day)) days.set(day, []);
      days.get(day).push(json);
    },
    async read(day, start, count) {
      const list = days.get(day) || [];
      return { items: list.slice(start, start + count), total: list.length };
    },
  };
}

export function telemetryStoreFromEnv(env = process.env) {
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? redisTelemetryStore(url, token) : null;
}

async function readBody(req) {
  let body = req.body;
  if (body === undefined) {
    let raw = '';
    for await (const c of req) {
      raw += c;
      if (raw.length > MAX_BODY) return { tooBig: true };
    }
    body = raw;
  }
  if (Buffer.isBuffer?.(body)) body = body.toString('utf8');
  if (typeof body === 'string') {
    if (body.length > MAX_BODY) return { tooBig: true };
    try {
      return { body: JSON.parse(body) };
    } catch {
      return { body: null };
    }
  }
  if (JSON.stringify(body ?? null).length > MAX_BODY) return { tooBig: true };
  return { body };
}

// ---------------- リクエストの処理 ----------------
// POST /api/telemetry {v, pid, sid, dev, lang, ev:[...]} … 受け取る（204）
// GET  /api/telemetry?day=2026-10-09&start=0&count=500（Authorization: Bearer <TELEMETRY_READ_TOKEN>）… その日の束
export function createTelemetryHandler(getStore, { now = () => Date.now(), readToken = () => process.env.TELEMETRY_READ_TOKEN } = {}) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, body) => {
      res.statusCode = status;
      res.end(body === undefined ? '' : JSON.stringify(body));
    };
    const store = getStore();
    if (!store) return send(503, { error: 'not-configured' });
    try {
      if (req.method === 'POST') {
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
        if ((await store.hit(ip, Math.floor(now() / 3600000))) > POSTS_PER_HOUR) return send(429, { error: 'too-many' });
        const { body, tooBig } = await readBody(req);
        if (tooBig) return send(413, { error: 'too-big' });
        const v = validateBatch(body);
        if (!v.ok) return send(400, { error: v.error });
        await store.append(dayKey(now()), JSON.stringify({ ...v.batch, rt: Math.round(now() / 1000) }));
        return send(204);
      }
      if (req.method === 'GET') {
        const token = readToken();
        const auth = String(req.headers.authorization || '');
        if (!token || auth !== `Bearer ${token}`) return send(401, { error: 'auth' });
        const url = new URL(req.url, 'http://localhost');
        const day = url.searchParams.get('day') || dayKey(now());
        if (!DAY_RE.test(day)) return send(400, { error: 'day' });
        const start = Math.max(0, Number(url.searchParams.get('start')) || 0);
        const count = Math.min(1000, Math.max(1, Number(url.searchParams.get('count')) || 500));
        const { items, total } = await store.read(day, start, count);
        const next = start + items.length < total ? start + items.length : null;
        return send(200, { day, total, next, items: items.map((x) => JSON.parse(x)) });
      }
      res.setHeader('Allow', 'GET, POST');
      return send(405, { error: 'method' });
    } catch (e) {
      return send(500, { error: 'server', detail: String(e.message || e).slice(0, 100) });
    }
  };
}
