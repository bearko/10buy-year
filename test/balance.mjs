import { runGame } from './bot.js';
const n = Number(process.argv[2] || 30);
const rows = [];
for (let i = 1; i <= n; i++) {
  const { s, result } = runGame(i * 7919);
  rows.push({ seed: i, end: result.ending.id, rank: result.rank, nw: result.netWorth, debt: s.debt, rev: result.revenue, profit: result.profit, sold: result.soldUnits, trouble: result.troubles, del: s.delinquency, week: s.week });
}
console.table(rows);
const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
console.log('avg netWorth', avg('nw'), 'avg revenue', avg('rev'), 'avg profit', avg('profit'));
const cnt = {};
rows.forEach((r) => (cnt[r.end] = (cnt[r.end] || 0) + 1));
console.log(cnt);
