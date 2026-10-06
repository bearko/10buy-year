// 自動プレイの統計。ステージ到達・完済の時期と最終資産を見る
import { runGame } from './bot.js';
const n = Number(process.argv[2] || 20);
const yr = (w) => (w === undefined ? '-' : (w / 48 + 1).toFixed(1));
const rows = [];
for (let i = 1; i <= n; i++) {
  const { s, result } = runGame(i * 7919);
  const sw = s.stageWeeks || {};
  rows.push({
    seed: i, end: result.ending.id, toku: s.underworld ? '裏' : Math.round(s.toku), tr: s.skills.filter((x) => /^(tr_|cap_trade)/.test(x)).length, dk: s.skills.filter((x) => /^(dk_|cap_dark)/.test(x)).length, shop: s.shop ? s.shop.loc : '-', spots: (s.spots || []).length, satS: Math.round(s.saturation?.store || 0), satO: Math.round(s.saturation?.online || 0), rivals: Object.keys(s.rivals || {}).length, passed: Object.values(s.rivals || {}).filter((r) => r.passed).length, rank: result.rank, nw: result.netWorth, stage: s.stage,
    st2: yr(sw[2]), st3: yr(sw[3]), st4: yr(sw[4]), st5: yr(sw[5]), debtFree: yr(s.flags.debtFree), rev: result.revenue, sold: result.soldUnits, week: s.week,
  });
}
console.table(rows);
const avg = (k) => Math.round(rows.reduce((a, r) => a + r[k], 0) / rows.length);
console.log('avg netWorth', avg('nw'), 'avg revenue', avg('rev'));
const cnt = {};
rows.forEach((r) => (cnt[`stage${r.stage}`] = (cnt[`stage${r.stage}`] || 0) + 1));
console.log(cnt);
