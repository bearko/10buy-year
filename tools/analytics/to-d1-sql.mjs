// fetch.mjs で取ってきたプレイログ（analytics-data/YYYY-MM-DD.jsonl）を、D1 に入れる SQL にする。
// Upstash から Cloudflare D1 へ移すときに一度だけ使う。
// 使い方:
//   node tools/analytics/to-d1-sql.mjs [JSONLファイル…] > analytics-data/import.sql
//   npx wrangler d1 execute 10buy-telemetry --remote --file analytics-data/import.sql
// ファイルを省くと analytics-data/ の YYYY-MM-DD.jsonl をすべて読む。日付はファイル名から取る（受け取った日・日本時間）
import { readdirSync, readFileSync } from 'node:fs';
import { basename, join } from 'node:path';

const DAY_RE = /^(\d{4}-\d{2}-\d{2})\.jsonl$/;
let files = process.argv.slice(2);
if (!files.length) files = readdirSync('analytics-data').filter((f) => DAY_RE.test(f)).sort().map((f) => join('analytics-data', f));

const quote = (s) => `'${s.replace(/'/g, "''")}'`;
let rows = 0;
for (const file of files) {
  const m = DAY_RE.exec(basename(file));
  if (!m) {
    console.error(`${file}: ファイル名が YYYY-MM-DD.jsonl ではないので飛ばします`);
    continue;
  }
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    if (!line.trim()) continue;
    const json = JSON.stringify(JSON.parse(line)); // 壊れた行はここで止まる
    process.stdout.write(`INSERT INTO telemetry (day, json) VALUES (${quote(m[1])}, ${quote(json)});\n`);
    rows++;
  }
}
console.error(`${files.length}ファイル・${rows}束`);
