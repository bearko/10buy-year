// 本番のプレイログを取ってくる。日ごとに analytics-data/YYYY-MM-DD.jsonl（1行に1束）に保存する。
// 使い方: TELEMETRY_READ_TOKEN=... node tools/analytics/fetch.mjs [開始日=7日前] [終了日=今日] [--base https://10buy-year.vercel.app]
// トークンは Vercel の環境変数 TELEMETRY_READ_TOKEN と同じもの。analytics-data/ はリポジトリに入れない
import { mkdirSync, writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
const bi = args.indexOf('--base');
const base = bi >= 0 ? args.splice(bi, 2)[1] : 'https://10buy-year.vercel.app';
const token = process.env.TELEMETRY_READ_TOKEN;
if (!token) {
  console.error('環境変数 TELEMETRY_READ_TOKEN を設定してください');
  process.exit(1);
}
const JST = 9 * 3600e3;
const day = (t) => new Date(t + JST).toISOString().slice(0, 10);
const to = args[1] || day(Date.now());
const from = args[0] || day(Date.parse(`${to}T00:00:00+09:00`) - 6 * 86400e3);

mkdirSync('analytics-data', { recursive: true });
for (let t = Date.parse(`${from}T12:00:00+09:00`); day(t) <= to; t += 86400e3) {
  const d = day(t);
  const items = [];
  let start = 0;
  while (start !== null) {
    const res = await fetch(`${base}/api/telemetry?day=${d}&start=${start}&count=1000`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.error(`${d}: ${res.status} ${await res.text()}`);
      process.exit(1);
    }
    const body = await res.json();
    items.push(...body.items);
    start = body.next;
  }
  if (items.length) writeFileSync(`analytics-data/${d}.jsonl`, `${items.map((x) => JSON.stringify(x)).join('\n')}\n`);
  console.log(`${d}: ${items.length}束`);
}
