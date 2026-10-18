// オンラインランキングの中身（worker/index.js・tools/dev-server.mjs から使う）。保存先は差し替えられる：
// 本番は Cloudflare D1（プレイログと同じ 10buy-telemetry。表は migrations/0002_ranking.sql）、テストはメモリ。
// Upstash Redis も残してある（Vercel で公開していたころの保存先。環境変数があれば使える）
import { openWeeks, validateEntry, weekKey } from '../src/engine/weekly.js';

export const TOP_N = 50;
export const POSTS_PER_HOUR = 20; // 1つのIPから1時間に登録できる回数
const TTL = 90 * 24 * 3600; // 90日で消える
const WEEK_RE = /^\d{4}-W\d{2}$/;

const scoresKey = (week) => `10buy:rank:${week}`;
const infoKey = (week) => `10buy:rank:${week}:info`;

// ---------------- 保存先 ----------------
// Upstash Redis の REST API（https://upstash.com/docs/redis/features/restapi）
export function upstashStore(url, token, fetchFn = fetch) {
  const call = async (cmds) => {
    const res = await fetchFn(`${url.replace(/\/$/, '')}/pipeline`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(cmds.map((c) => c.map(String))),
    });
    if (!res.ok) throw new Error(`upstash ${res.status}`);
    const out = await res.json();
    return out.map((x) => {
      if (x.error) throw new Error(x.error);
      return x.result;
    });
  };
  return {
    async hit(ip, hour) {
      const key = `10buy:rl:${ip}:${hour}`;
      const [n] = await call([['INCR', key], ['EXPIRE', key, 3600]]);
      return n;
    },
    async submit(e) {
      // 自己ベストを更新したときだけ、名前・ENDなども書き換える
      const [changed] = await call([['ZADD', scoresKey(e.week), 'GT', 'CH', e.netWorth, e.player], ['EXPIRE', scoresKey(e.week), TTL]]);
      if (changed) await call([['HSET', infoKey(e.week), e.player, JSON.stringify(e)], ['EXPIRE', infoKey(e.week), TTL]]);
      return changed > 0;
    },
    async top(week, n) {
      const [flat] = await call([['ZRANGE', scoresKey(week), 0, n - 1, 'REV', 'WITHSCORES']]);
      const players = flat.filter((_, i) => i % 2 === 0);
      if (!players.length) return [];
      const [infos] = await call([['HMGET', infoKey(week), ...players]]);
      return players.map((p, i) => ({ ...JSON.parse(infos[i] || '{}'), player: p, netWorth: Number(flat[i * 2 + 1]) }));
    },
    async position(week, player) {
      const [rank, total, score] = await call([['ZREVRANK', scoresKey(week), player], ['ZCARD', scoresKey(week)], ['ZSCORE', scoresKey(week), player]]);
      return { position: rank === null ? null : Number(rank) + 1, total: Number(total), best: score === null ? null : Number(score) };
    },
  };
}

// Cloudflare D1（本番）。Upstash と同じ動き：自己ベストを更新したときだけ書き換え、90 日で消える
export function d1Store(db, { random = Math.random, now = () => Date.now() } = {}) {
  return {
    async hit(ip, hour) {
      const row = await db
        .prepare('INSERT INTO ranking_hits (key, hour, count) VALUES (?1, ?2, 1) ON CONFLICT (key) DO UPDATE SET count = count + 1 RETURNING count')
        .bind(`r:${ip}:${hour}`, hour)
        .first();
      if (random() < 0.01) await db.prepare('DELETE FROM ranking_hits WHERE hour < ?1').bind(hour - 2).run();
      return Number(row?.count ?? 1);
    },
    async submit(e) {
      const at = now();
      const r = await db
        .prepare(
          'INSERT INTO ranking (week, player, net_worth, entry, updated_at) VALUES (?1, ?2, ?3, ?4, ?5) ' +
            'ON CONFLICT (week, player) DO UPDATE SET net_worth = excluded.net_worth, entry = excluded.entry, updated_at = excluded.updated_at ' +
            'WHERE excluded.net_worth > ranking.net_worth',
        )
        .bind(e.week, e.player, Math.round(e.netWorth), JSON.stringify(e), at)
        .run();
      if (random() < 0.01) await db.prepare('DELETE FROM ranking WHERE updated_at < ?1').bind(at - TTL * 1000).run();
      return Number(r?.meta?.changes ?? 0) > 0;
    },
    async top(week, n) {
      const { results } = await db
        .prepare('SELECT player, net_worth, entry FROM ranking WHERE week = ?1 ORDER BY net_worth DESC, updated_at ASC LIMIT ?2')
        .bind(week, n)
        .all();
      return results.map((r) => ({ ...JSON.parse(r.entry || '{}'), player: r.player, netWorth: Number(r.net_worth) }));
    },
    async position(week, player) {
      const [mine, total] = await db.batch([
        db.prepare('SELECT net_worth FROM ranking WHERE week = ?1 AND player = ?2').bind(week, player),
        db.prepare('SELECT COUNT(*) AS n FROM ranking WHERE week = ?1').bind(week),
      ]);
      const best = mine.results[0] ? Number(mine.results[0].net_worth) : null;
      const n = Number(total.results[0]?.n ?? 0);
      if (best === null) return { position: null, total: n, best: null };
      const above = await db.prepare('SELECT COUNT(*) AS n FROM ranking WHERE week = ?1 AND net_worth > ?2').bind(week, best).first();
      return { position: Number(above?.n ?? 0) + 1, total: n, best };
    },
  };
}

// テスト・ローカル確認用
export function memoryStore() {
  const hits = new Map();
  const weeks = new Map(); // week → Map(player → entry)
  const sorted = (week) => [...(weeks.get(week) || new Map()).values()].sort((a, b) => b.netWorth - a.netWorth);
  return {
    async hit(ip, hour) {
      const k = `${ip}:${hour}`;
      hits.set(k, (hits.get(k) || 0) + 1);
      return hits.get(k);
    },
    async submit(e) {
      if (!weeks.has(e.week)) weeks.set(e.week, new Map());
      const m = weeks.get(e.week);
      if (m.has(e.player) && m.get(e.player).netWorth >= e.netWorth) return false;
      m.set(e.player, e);
      return true;
    },
    async top(week, n) {
      return sorted(week).slice(0, n);
    },
    async position(week, player) {
      const list = sorted(week);
      const i = list.findIndex((e) => e.player === player);
      return { position: i < 0 ? null : i + 1, total: list.length, best: i < 0 ? null : list[i].netWorth };
    },
  };
}

// 環境変数から保存先を作る。D1（TELEMETRY_DB）があればそれ、なければ Upstash。どちらもなければ null
export function storeFromEnv(env = process.env) {
  if (env.TELEMETRY_DB) return d1Store(env.TELEMETRY_DB);
  const url = env.KV_REST_API_URL || env.UPSTASH_REDIS_REST_URL;
  const token = env.KV_REST_API_TOKEN || env.UPSTASH_REDIS_REST_TOKEN;
  return url && token ? upstashStore(url, token) : null;
}

// 表に出す項目だけにする（プレイヤーIDは本人以外に見せない）
const publicEntry = (e) => ({ name: e.name, netWorth: e.netWorth, rank: e.rank, ending: e.ending, title: e.title, stage: e.stage });

// ---------------- リクエストの処理 ----------------
// GET  /api/ranking?week=2026-W41&player=xxxx … 上位50人（と自分の順位）
// POST /api/ranking {week, player, name, netWorth, revenue, endingId, title, stage} … 登録
export function createHandler(getStore, { now = () => Date.now() } = {}) {
  return async function handler(req, res) {
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    const send = (status, body) => {
      res.statusCode = status;
      res.end(JSON.stringify(body));
    };
    const store = getStore();
    if (!store) return send(503, { error: 'not-configured' });
    try {
      const url = new URL(req.url, 'http://localhost');
      if (req.method === 'GET') {
        const week = url.searchParams.get('week') || weekKey(now());
        if (!WEEK_RE.test(week)) return send(400, { error: 'week' });
        const entries = (await store.top(week, TOP_N)).map(publicEntry);
        const player = url.searchParams.get('player');
        const me = player && /^[a-z0-9]{8,32}$/.test(player) ? await store.position(week, player) : null;
        res.setHeader('Cache-Control', player ? 'no-store' : 'public, s-maxage=30, stale-while-revalidate=60');
        return send(200, { week, open: openWeeks(now()).includes(week), entries, me });
      }
      if (req.method === 'POST') {
        const ip = String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();
        if ((await store.hit(ip, Math.floor(now() / 3600000))) > POSTS_PER_HOUR) return send(429, { error: 'too-many' });
        let body = req.body;
        if (body === undefined) {
          // Vercel の補助がない環境（素の Node）では、自分で読む
          let raw = '';
          for await (const c of req) raw += c;
          body = raw;
        }
        if (typeof body === 'string') {
          try {
            body = JSON.parse(body);
          } catch {
            return send(400, { error: 'json' });
          }
        }
        const v = validateEntry(body, now());
        if (!v.ok) return send(400, { error: v.error });
        const improved = await store.submit(v.entry);
        const me = await store.position(v.entry.week, v.entry.player);
        return send(200, { ok: true, improved, ...me });
      }
      res.setHeader('Allow', 'GET, POST');
      return send(405, { error: 'method' });
    } catch (e) {
      return send(500, { error: 'server', detail: String(e.message || e).slice(0, 100) });
    }
  };
}
