// プレイログの分析レポート（HTML）を作る。
// 使い方: node tools/analytics/report.mjs [JSONLファイル…] [--out dist/analytics.html] [--title 名前] [--idle 3]
//   ファイルを省くと analytics-data/ の *.jsonl をすべて読む。fetch.mjs で取ってきたもの・simulate.mjs の模擬データのどちらでも
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { analyze, labels, median, YEAR } from './lib.mjs';
import { ABILITIES, EXP_TYPES } from '../../src/engine/abilities.js';
import { ROUTE_MAP } from '../../src/data/skills.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf(name);
  if (i < 0) return def;
  const v = args[i + 1];
  args.splice(i, 2);
  return v;
};
const OUT = resolve(opt('--out', 'dist/analytics.html'));
const TITLE = opt('--title', null);
const IDLE = Number(opt('--idle', 3));
let files = args;
if (!files.length) files = readdirSync('analytics-data').filter((f) => f.endsWith('.jsonl')).map((f) => join('analytics-data', f));
const { loadBatches } = await import('./lib.mjs');
const batches = loadBatches(files);
const R = analyze(batches, { idleDays: IDLE });
const simulated = files.some((f) => /sim/.test(f));

// ---------------- 部品 ----------------
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const pct = (x, d = 0) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const num = (x) => (x == null ? '—' : Math.round(x).toLocaleString('ja-JP'));
const yen = (x) => (x == null ? '—' : Math.abs(x) >= 10000 ? `${(x / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 0 })}万円` : `${Math.round(x).toLocaleString('ja-JP')}円`);
const date = (t) => new Date(t * 1000 + 9 * 3600e3).toISOString().slice(0, 10);
const SERIES = 7;

// 横棒（1系列＝1色）。rows: [{label, value, text, tip}]
function hbars(rows, { max = Math.max(...rows.map((r) => r.value), 1e-9), slot = 1, empty = 'データがありません' } = {}) {
  if (!rows.length) return `<p class="empty">${empty}</p>`;
  return `<div class="hbars">${rows.map((r) => `<div class="hb" data-tip="${esc(r.tip || `${r.label}：${r.text}`)}"><span class="hb-l">${esc(r.label)}</span><span class="hb-t"><i style="width:${Math.max(0.5, (r.value / max) * 100).toFixed(2)}%;background:var(--s${r.slot || slot})"></i></span><span class="hb-v">${esc(r.text)}</span></div>`).join('')}</div>`;
}
// 表（グラフの数字を読むため）
function table(headers, rows, { open = false, summary = '表で見る' } = {}) {
  return `<details class="tbl"${open ? ' open' : ''}><summary>${summary}</summary><div class="scroll"><table><thead><tr>${headers.map((h) => `<th>${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table></div></details>`;
}
const tile = (label, value, note = '') => `<div class="tile"><small>${esc(label)}</small><b>${esc(value)}</b>${note ? `<span>${esc(note)}</span>` : ''}</div>`;
const section = (id, title, lead, body) => `<section id="${id}"><h2>${esc(title)}</h2>${lead ? `<p class="lead">${lead}</p>` : ''}${body}</section>`;

// 年ごとの折れ線（1本の軸）。series: [{name, values:[{x, y}], slot}]
function lines(series, { yFmt = num, yLabel = '' } = {}) {
  const pts = series.flatMap((s) => s.values);
  if (pts.length < 2) return '<p class="empty">データがありません</p>';
  const W = 640;
  const H = 260;
  const L = 56;
  const Rm = 16;
  const T = 14;
  const B = 30;
  const xs = [...new Set(pts.map((p) => p.x))].sort((a, b) => a - b);
  const ymax = Math.max(...pts.map((p) => p.y), 1);
  const ymin = Math.min(0, ...pts.map((p) => p.y));
  const X = (x) => L + ((x - xs[0]) / Math.max(1, xs[xs.length - 1] - xs[0])) * (W - L - Rm);
  const Y = (y) => T + (1 - (y - ymin) / (ymax - ymin)) * (H - T - B);
  const ticks = 4;
  const grid = Array.from({ length: ticks + 1 }, (_, i) => ymin + ((ymax - ymin) * i) / ticks).map((v) => `<line x1="${L}" x2="${W - Rm}" y1="${Y(v).toFixed(1)}" y2="${Y(v).toFixed(1)}" class="grid"/><text x="${L - 6}" y="${(Y(v) + 4).toFixed(1)}" class="tick" text-anchor="end">${esc(yFmt(v))}</text>`).join('');
  const xt = xs.map((x) => `<text x="${X(x).toFixed(1)}" y="${H - 10}" class="tick" text-anchor="middle">${x}年目</text>`).join('');
  const paths = series.map((s) => `<polyline points="${s.values.map((p) => `${X(p.x).toFixed(1)},${Y(p.y).toFixed(1)}`).join(' ')}" fill="none" stroke="var(--s${s.slot})" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`).join('');
  const dots = series.map((s) => s.values.map((p) => `<circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="4" fill="var(--s${s.slot})" stroke="var(--surface)" stroke-width="2"/><circle cx="${X(p.x).toFixed(1)}" cy="${Y(p.y).toFixed(1)}" r="12" fill="transparent" data-tip="${esc(`${p.x}年目・${s.name}：${yFmt(p.y)}`)}"/>`).join('')).join('');
  const legend = series.length > 1 ? `<div class="legend">${series.map((s) => `<span><i style="background:var(--s${s.slot})"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  return `${legend}<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(yLabel)}"><line x1="${L}" x2="${W - Rm}" y1="${Y(ymin).toFixed(1)}" y2="${Y(ymin).toFixed(1)}" class="axis"/>${grid}${xt}${paths}${dots}</svg>`;
}

// 100%積み上げ（年ごと）。cats: [{id, label}]（7つまで。残りは「その他」）
function stacks(rows, cats) {
  if (!rows.length) return '<p class="empty">データがありません</p>';
  return `<div class="legend">${cats.map((c, i) => `<span><i style="background:${i < SERIES ? `var(--s${i + 1})` : 'var(--other)'}"></i>${esc(c.label)}</span>`).join('')}</div><div class="stacks">${rows.map((r) => `<div class="st-row"><span class="hb-l">${esc(r.label)}</span><span class="st-bar">${cats.map((c, i) => {
    const v = r.by[c.id] || 0;
    return v > 0 ? `<i style="width:${(v * 100).toFixed(2)}%;background:${i < SERIES ? `var(--s${i + 1})` : 'var(--other)'}" data-tip="${esc(`${r.label}・${c.label}：${pct(v)}`)}"></i>` : '';
  }).join('')}</span></div>`).join('')}</div>`;
}

// ---------------- 各章 ----------------
const O = R.overview;
const F = R.features;
const A = R.abilities;
const T = R.tree;
const S = R.sourcing;
const P = R.styles;
const C = R.churn;
const E = R.endings;
const hasUi = R.data.games.some((g) => Object.keys(g.ui).length) || R.data.players.some((p) => Object.keys(p.ui).length);

const yearReach = R.data.games.filter((g) => g.started).length ? R.data.games.filter((g) => g.started && g.lastWeek >= YEAR).length / R.data.games.filter((g) => g.started).length : null;
const summary = `<div class="tiles">
${tile('プレイヤー', num(O.players), `${num(O.sessions)}セッション`)}
${tile('プレイ', num(O.games), `記録の途中から：${num(O.games - O.started)}`)}
${tile('1年目を終えた割合', pct(yearReach), '始めたプレイのうち')}
${tile('エンディングまで', num(O.finished), `${pct(O.finished / Math.max(1, O.games))}`)}
${tile('遊んだ週（中央値）', `${num(O.medianWeeks)}週`)}
${tile('1セッション（中央値）', `${(O.medianSessionMin ?? 0).toFixed(0)}分`)}
</div>
<p class="meta">期間 ${O.from === Infinity ? '—' : `${date(O.from)} 〜 ${date(O.to)}`}・難易度 ${Object.entries(O.byDiff).map(([k, v]) => `${k} ${v}`).join(' / ')}・モード ${Object.entries(O.byMode).map(([k, v]) => `${k} ${v}`).join(' / ')}・端末 ${Object.entries(O.byDev).map(([k, v]) => `${k} ${v}`).join(' / ')}</p>`;

// 1. 機能の利用率
const featRows = F.rows.filter((r) => hasUi || r.kind !== 'menu');
const cmdRows = featRows.filter((r) => r.kind === 'cmd');
const nightRows = featRows.filter((r) => r.kind === 'night');
const menuRows = featRows.filter((r) => r.kind === 'menu');
const unused = featRows.filter((r) => r.rate < 0.2 && r.exposed >= 3);
const featBars = (rows) => hbars(rows.map((r) => ({ label: r.label, value: r.rate, text: `${pct(r.rate)}（${r.users}/${r.exposed}）`, tip: `${r.label}：使える人${r.exposed}のうち${r.users}が使った・100週あたり${r.per100.toFixed(1)}回` })), { max: 1 });
const ch1 = section('features', '機能の利用率', `その機能が<b>使えるようになってから${8}週以上遊んだプレイ</b>のうち、1回でも使ったプレイの割合。利用率の低い順に並べている（上のほうが「使われていない機能」の候補）。`, `
${unused.length ? `<div class="callout"><b>使われていない機能の候補（利用率20%未満）</b><p>${unused.map((r) => `${esc(r.label)}（${pct(r.rate)}）`).join('、')}</p></div>` : ''}
<div class="grid2">
<div><h3>行動（昼）</h3>${featBars(cmdRows)}${table(['機能', '使える', '使った', '利用率', '100週あたり'], cmdRows.map((r) => [r.label, r.exposed, r.users, pct(r.rate), r.per100.toFixed(1)]))}</div>
<div><h3>夜の行動</h3>${featBars(nightRows)}${table(['機能', '使える', '使った', '利用率', '100週あたり'], nightRows.map((r) => [r.label, r.exposed, r.users, pct(r.rate), r.per100.toFixed(1)]))}
<h3>右のボタン・メニュー</h3>${hasUi ? featBars(menuRows) : '<p class="empty">画面を開いた記録がありません（ボットの模擬データは画面を開かない）</p>'}</div>
</div>
<h3>行動の内訳（全プレイの行動に占める割合）</h3>
${hbars(F.mix.slice(0, 16).map((r) => ({ label: r.label, value: r.share, text: pct(r.share, 1) })))}
<p class="note">ルーティン・おまかせで選ばれた行動：${pct(F.auto, 1)}</p>
${table(['行動', '回数', '割合'], F.mix.map((r) => [r.label, num(r.n), pct(r.share, 1)]))}
<h3>開かれた画面（見出し）</h3>
${hasUi ? hbars(F.screens.slice(0, 20).map((r) => ({ label: r.id, value: r.rate, text: `${pct(r.rate)}・${num(r.opens)}回` }))) : '<p class="empty">画面を開いた記録がありません</p>'}
${hasUi ? table(['画面', '開いた人', '割合', '回数'], F.screens.map((r) => [r.id, r.players, pct(r.rate), r.opens])) : ''}
`);

// 2. 基礎能力
const abSeries = ABILITIES.map((a, i) => ({ name: a.name, slot: i + 1, values: A.byYear.filter((y) => y.ab[i] != null).map((y) => ({ x: y.year, y: y.ab[i] })) }));
const expSeries = [{ name: '使っていない経験点（5種の合計）', slot: 1, values: A.byYear.map((y) => ({ x: y.year, y: y.exp })) }];
const corrText = (r) => (r == null ? '—' : `${r >= 0 ? '+' : ''}${r.toFixed(2)}`);
const c3 = A.corr.find((c) => c.year === 3) || A.corr[A.corr.length - 1];
const verdict = !A.eligible ? '能力強化を使えるプレイがまだありません。'
  : `能力強化が使える${A.eligible}プレイのうち、${pct(A.raisedAny)}が能力を上げた（手で上げた ${pct(A.raisedManual)}・「自動で割り振る」を使った ${pct(A.raisedAuto)}）。`
  + (c3 ? `${c3.year}年目の終わりで、能力の合計と純資産の順位相関は ${corrText(c3.abNw)}、使っていない経験点と純資産は ${corrText(c3.expNw)}。` : '')
  + (c3 && c3.abNw < 0.2 ? '能力を上げても稼ぎにつながっていない（上げる理由が弱い）可能性がある。' : c3 ? '能力を上げた人ほど稼げている。' : '');
const ch2 = section('abilities', '基礎能力を上げるインセンティブ', '基礎能力を上げているか、経験点を使わずに貯めこんでいないか、上げた人ほど稼げているか。', `
<div class="tiles">
${tile('能力を上げたプレイ', pct(A.raisedAny), `能力強化が使える${num(A.eligible)}プレイのうち`)}
${tile('「自動で割り振る」の比率', pct(A.autoShare), '手で上げた分との合計に対して')}
${tile('初めて上げるまで', A.firstRaise == null ? '—' : `${num(A.firstRaise)}週`, '能力強化が開いてから（中央値）')}
${tile('経験点の振り替えを使った', pct(A.convertRate))}
</div>
<div class="callout"><p>${esc(verdict)}</p></div>
<div class="grid2">
<div><h3>基礎能力（各年の終わりの中央値）</h3>${lines(abSeries, { yLabel: '基礎能力の中央値' })}${table(['年', 'プレイ数', ...ABILITIES.map((a) => a.name), '純資産'], A.byYear.map((y) => [`${y.year}年目`, y.n, ...y.ab.map(num), yen(y.nw)]))}</div>
<div><h3>使っていない経験点（各年の終わりの中央値）</h3>${lines(expSeries, { yLabel: '使っていない経験点' })}${table(['年', ...EXP_TYPES.map((e) => e.name), '合計'], A.byYear.map((y) => [`${y.year}年目`, ...y.expBy.map(num), num(y.exp)]))}</div>
</div>
<h3>能力と純資産の関係（順位相関）</h3>
${table(['時点', 'プレイ数', '能力の合計', '使っていない経験点', ...ABILITIES.map((a) => a.name)], A.corr.map((c) => [`${c.year}年目の終わり`, c.n, corrText(c.abNw), corrText(c.expNw), ...c.each.map((x) => corrText(x.r))]), { open: true, summary: '表' })}
<p class="note">+1に近いほど「その値が高い人ほど純資産が多い」。0付近は関係がない。経験点の貯めこみが純資産とプラスの関係なら、経験点を使わずに稼げてしまっている（上げる理由が弱い）。</p>
`);

// 3. スキルツリー
const routeRows = (obj) => Object.entries(obj).sort((a, b) => b[1] - a[1]).map(([id, n]) => ({ label: labels.route(id), value: n, text: `${n}` }));
const ch3 = section('tree', 'スキルツリーの強化傾向', `24週以上遊んだ${num(T.base)}プレイ。パネルの数（中央値）：${num(T.medianNodes)}枚。`, `
<div class="grid3">
<div><h3>経験点で取ったパネルのルート</h3>${hbars(routeRows(T.routeShare))}</div>
<div><h3>最初に伸ばしたルート</h3>${hbars(routeRows(T.firstRoute))}</div>
<div><h3>いちばん伸ばしたルート</h3>${hbars(routeRows(T.mainRoute))}</div>
</div>
<h3>よく取られるパネル</h3>
${hbars(T.rows.slice(0, 20).map((r) => ({ label: r.label, value: r.rate || 0, text: `${pct(r.rate)}・${r.week == null ? '—' : `${num(r.week)}週目`}`, tip: `${r.label}（${labels.route(r.route)}）：${pct(r.rate)}が取った・取った週の中央値 ${r.week ?? '—'}${r.free ? `・無料でもらった${r.free}` : ''}` })), { max: 1 })}
${table(['パネル', 'ルート', '種類', '取ったプレイ', '割合', '取った週（中央値）'], T.rows.map((r) => [r.label, labels.route(r.route), r.kind, r.n, pct(r.rate), r.week ?? '—']))}
${T.never.length ? `<div class="callout"><b>一度も取られていないパネル（${T.never.length}枚）</b><p>${T.never.map((r) => `${esc(r.label)}（${esc(labels.route(r.route))}）`).join('、')}</p></div>` : ''}
`);

// 4. 仕入れルート
const topCmds = S.cmds.slice(0, SERIES).map((c) => ({ id: c.id, label: c.label }));
const yearRows = S.years.map((y) => {
  const by = {};
  let other = 0;
  for (const [k, v] of Object.entries(y.by)) {
    if (topCmds.some((c) => c.id === k)) by[k] = v / y.total;
    else other += v / y.total;
  }
  if (other) by.__other = other;
  return { label: `${y.year}年目`, by };
});
const ch4 = section('sourcing', '仕入れルートの偏り', `仕入れ額のうち、どの行動（仕入れルート）で買ったか。合計 ${yen(S.total)}。`, `
<div class="tiles">
${tile('いちばん使うルートの割合', pct(S.concentration.median), '1プレイの仕入れ額のうち（中央値）')}
${tile('5%以上使うルートの数', S.concentration.kinds == null ? '—' : `${S.concentration.kinds}本`, '中央値')}
${tile('カード払いの割合', pct(S.cardShare), '仕入れ額のうち')}
</div>
<div class="grid2">
<div><h3>ルートごとの仕入れ額</h3>${hbars(S.cmds.map((c) => ({ label: c.label, value: c.share, text: `${pct(c.share, 1)}・${yen(c.amt)}`, tip: `${c.label}：${yen(c.amt)}・${num(c.n)}点・${c.games}プレイ` })))}</div>
<div><h3>1つのルートへの偏り（プレイ数）</h3>${hbars(S.concentration.bins.map((b) => ({ label: b.label, value: b.n, text: `${b.n}` })))}<p class="note">いちばん使うルートが、そのプレイの仕入れ額の何割か（仕入れ額10万円以上のプレイ）。</p></div>
</div>
<h3>年ごとの内訳（仕入れ額）</h3>
${stacks(yearRows, [...topCmds, ...(yearRows.some((r) => r.by.__other) ? [{ id: '__other', label: 'その他' }] : [])])}
${table(['年', ...topCmds.map((c) => c.label), 'その他'], yearRows.map((r) => [r.label, ...topCmds.map((c) => pct(r.by[c.id] || 0)), pct(r.by.__other || 0)]))}
<h3>販路（売上と利益率）</h3>
${hbars(S.sells.map((x) => ({ label: x.label, value: x.amt, text: `${yen(x.amt)}・利益率${pct(x.margin)}` })))}
${table(['販路', '個数', '売上', '利益率'], S.sells.map((x) => [x.label, num(x.n), yen(x.amt), pct(x.margin)]))}
${table(['仕入れ先（offer.source）', '個数', '金額', '割合'], S.srcs.map((x) => [x.id, num(x.n), yen(x.amt), pct(x.share, 1)]), { summary: '仕入れ先の内訳' })}
`);

// 5. プレイスタイル
const clusterName = (c) => (c.traits.length ? c.traits.slice(0, 2).map((t) => t.key.replace(/^(行動|販路|ツリー)：/, '')).join('×') : '平均的');
const ch5 = section('styles', 'プレイスタイルの大別', P.k ? `1年以上遊んだ${num(P.n)}プレイを、行動の内訳・販路・スキルツリーのルート・TOKUで${P.k}つに分けた（k-means、シルエット係数 ${P.sil.toFixed(2)}）。` : '', P.k ? `
<div class="clusters">${P.clusters.map((c, i) => `<article class="cluster">
<header><span class="dot" style="background:var(--s${i + 1})"></span><h3>${esc(clusterName(c))}</h3><b>${pct(c.share)}</b></header>
<p class="chips">${c.traits.map((t) => `<span>${esc(t.key)} ${pct(t.avg)}<small>（全体 ${pct(t.all)}）</small></span>`).join('')}</p>
${hbars(c.cmdMix.map((m) => ({ label: m.name, value: m.share, text: pct(m.share), slot: i + 1 })), { max: 1 })}
<dl><div><dt>プレイ数</dt><dd>${c.n}</dd></div><div><dt>純資産（中央値）</dt><dd>${yen(c.nw)}</dd></div><div><dt>遊んだ週</dt><dd>${num(c.weeks)}週</dd></div><div><dt>ステージ3以上</dt><dd>${pct(c.stage3)}</dd></div><div><dt>多いEND</dt><dd>${esc(c.ending ? labels.ending(c.ending) : '—')}</dd></div></dl>
</article>`).join('')}</div>` : `<p class="empty">1年以上遊んだプレイが8つ以上たまると分けられます（いま${P.n}）</p>`);

// 6. 序盤の離脱
const funnelBars = (rows) => hbars(rows.map((r, i) => ({ label: r.label, value: r.n, text: `${num(r.n)}（${pct(r.n / Math.max(1, rows[0].n))}）`, tip: `${r.label}：${r.n}${i ? `・前の段から ${pct(r.n / Math.max(1, rows[i - 1].n))}` : ''}` })), { max: Math.max(1, rows[0]?.n || 1) });
const ch6 = section('churn', '序盤の離脱ポイント', `始めたプレイ ${num(C.games)}：遊び終えた ${num(C.finished)}（うち10年を待たずに終わった ${num(C.earlyEnd)}）・離脱 ${num(C.churned)}・遊んでいる途中 ${num(C.active)}。離脱は、エンディングまで行かず${IDLE}日以上記録がないもの。`, `
<div class="tiles">
${tile('セッション数（中央値）', num(C.sessions), '1プレイあたり')}
${tile('最初のセッションで進んだ週', C.firstSessionWeeks == null ? '—' : `${num(C.firstSessionWeeks)}週`, '中央値')}
</div>
<div class="grid2">
<div><h3>どこまで遊んだか</h3>${funnelBars(C.funnel)}</div>
<div><h3>チュートリアル</h3>${funnelBars(C.tutorial)}</div>
</div>
<div class="grid2">
<div><h3>離脱したプレイの最後の週</h3>${hbars(C.lastWeekBins.map((b) => ({ label: b.label, value: b.n, text: `${b.n}` })))}</div>
<div><h3>離脱する直前にしていたこと（1年目まで）</h3>${hbars(C.lastWhat.map((r) => ({ label: r.label, value: r.n, text: `${r.n}` })))}
<h3>チュートリアルの途中で離れた場所</h3>${hbars(C.tutStop.map((r) => ({ label: r.label, value: r.n, text: `${r.n}` })), { empty: 'チュートリアルの途中で離れたプレイはありません' })}</div>
</div>
`);

// 7. エンディング
const ch7 = section('endings', 'エンディングとランク', `エンディングまで遊んだ ${num(E.n)}プレイ。純資産（中央値）：${yen(E.nw)}。`, `
<div class="grid2">
<div><h3>エンディング</h3>${hbars(E.by.map((r) => ({ label: r.label, value: r.n, text: `${r.n}` })))}</div>
<div><h3>ランク</h3>${hbars(E.ranks.map((r) => ({ label: r.label, value: r.n, text: `${r.n}` })))}</div>
</div>`);

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(TITLE || (simulated ? 'プレイログ分析（模擬データ）' : 'プレイログ分析'))}</title>
<style>
/* 1段組みの読みもの＋グラフ。色は役割の名前で（ライト／ダーク） */
:root {
  --page: #f9f9f7; --surface: #fcfcfb; --ink: #0b0b0b; --ink2: #52514e; --muted: #898781; --grid: #e1e0d9; --axis: #c3c2b7; --ring: rgba(11,11,11,0.10);
  --s1: #2a78d6; --s2: #eb6834; --s3: #1baf7a; --s4: #eda100; --s5: #e87ba4; --s6: #008300; --s7: #4a3aa7; --other: #b4b2aa; --track: #efeeea; --accent-bg: #eef4fc;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink2: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300; --s7: #9085e9; --other: #5d5c57; --track: #262624; --accent-bg: #16243a;
  color-scheme: dark;
} }
:root[data-theme="dark"] {
  --page: #0d0d0d; --surface: #1a1a19; --ink: #ffffff; --ink2: #c3c2b7; --muted: #898781; --grid: #2c2c2a; --axis: #383835; --ring: rgba(255,255,255,0.10);
  --s1: #3987e5; --s2: #d95926; --s3: #199e70; --s4: #c98500; --s5: #d55181; --s6: #008300; --s7: #9085e9; --other: #5d5c57; --track: #262624; --accent-bg: #16243a;
  color-scheme: dark;
}
* { box-sizing: border-box; }
body { margin: 0; background: var(--page); color: var(--ink); font: 15px/1.7 system-ui, -apple-system, "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif; }
main { max-width: 1120px; margin: 0 auto; padding: 28px 16px 64px; }
header.top h1 { margin: 0; font-size: 26px; text-wrap: balance; }
header.top p { margin: 4px 0 0; color: var(--ink2); }
.badge { display: inline-block; margin-left: 8px; padding: 2px 8px; border-radius: 999px; font-size: 12px; background: var(--accent-bg); color: var(--ink2); vertical-align: middle; }
nav.toc { display: flex; flex-wrap: wrap; gap: 6px 14px; margin: 16px 0 8px; font-size: 14px; }
nav.toc a { color: var(--ink2); }
section { margin-top: 40px; padding-top: 8px; border-top: 1px solid var(--grid); }
h2 { font-size: 21px; margin: 12px 0 6px; text-wrap: balance; }
h3 { font-size: 15px; margin: 22px 0 8px; color: var(--ink); }
.lead { color: var(--ink2); max-width: 72ch; margin: 0 0 12px; }
.note, .meta { color: var(--muted); font-size: 13px; }
.empty { color: var(--muted); font-size: 13px; padding: 10px 0; }
.tiles { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 10px; margin: 14px 0; }
.tile { background: var(--surface); border: 1px solid var(--ring); border-radius: 10px; padding: 12px 14px; display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.tile small { color: var(--ink2); font-size: 12px; }
.tile b { font-size: 24px; font-weight: 650; line-height: 1.25; }
.tile span { color: var(--muted); font-size: 12px; }
.callout { background: var(--accent-bg); border-radius: 10px; padding: 10px 14px; margin: 12px 0; }
.callout b { display: block; margin-bottom: 2px; }
.callout p { margin: 0; color: var(--ink2); }
.grid2 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 420px), 1fr)); gap: 8px 28px; }
.grid3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 280px), 1fr)); gap: 8px 24px; }
.grid2 > *, .grid3 > * { min-width: 0; }
.hbars { display: flex; flex-direction: column; gap: 2px; }
.hb, .st-row { display: grid; grid-template-columns: minmax(0, 11em) minmax(0, 1fr) auto; align-items: center; gap: 10px; padding: 3px 0; border-radius: 4px; }
.st-row { grid-template-columns: minmax(0, 6em) minmax(0, 1fr); }
.hb:hover, .st-row:hover { background: var(--track); }
.hb-l { font-size: 13px; color: var(--ink2); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.hb-t { height: 12px; background: var(--track); border-radius: 0 4px 4px 0; overflow: hidden; }
.hb-t i { display: block; height: 100%; border-radius: 0 4px 4px 0; }
.hb-v { font-size: 13px; color: var(--ink); font-variant-numeric: tabular-nums; white-space: nowrap; }
.st-bar { display: flex; gap: 2px; height: 14px; }
.st-bar i { display: block; height: 100%; }
.st-bar i:last-child { border-radius: 0 4px 4px 0; }
.legend { display: flex; flex-wrap: wrap; gap: 4px 14px; font-size: 12px; color: var(--ink2); margin: 4px 0 8px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 3px; margin-right: 5px; vertical-align: -1px; }
svg.chart { width: 100%; height: auto; display: block; background: var(--surface); border-radius: 10px; border: 1px solid var(--ring); }
svg .grid { stroke: var(--grid); stroke-width: 1; }
svg .axis { stroke: var(--axis); stroke-width: 1; }
svg .tick { fill: var(--muted); font-size: 11px; font-variant-numeric: tabular-nums; }
details.tbl { margin: 8px 0 4px; font-size: 13px; }
details.tbl summary { cursor: pointer; color: var(--ink2); }
.scroll { overflow-x: auto; }
table { border-collapse: collapse; margin-top: 6px; min-width: 100%; font-variant-numeric: tabular-nums; }
th, td { text-align: left; padding: 5px 10px; border-bottom: 1px solid var(--grid); white-space: nowrap; }
th { color: var(--ink2); font-weight: 600; }
.clusters { display: grid; grid-template-columns: repeat(auto-fit, minmax(min(100%, 320px), 1fr)); gap: 14px; }
.cluster { background: var(--surface); border: 1px solid var(--ring); border-radius: 12px; padding: 14px 16px; min-width: 0; }
.cluster header { display: flex; align-items: center; gap: 8px; }
.cluster h3 { margin: 0; flex: 1; font-size: 16px; }
.cluster .dot { width: 10px; height: 10px; border-radius: 50%; flex: none; }
.chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 8px 0; }
.chips span { font-size: 12px; background: var(--track); border-radius: 999px; padding: 2px 9px; }
.chips small { color: var(--muted); }
dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(110px, 1fr)); gap: 6px 12px; margin: 10px 0 0; }
dt { font-size: 12px; color: var(--muted); }
dd { margin: 0; font-weight: 600; }
#tip { position: fixed; pointer-events: none; background: var(--ink); color: var(--page); font-size: 12px; padding: 5px 9px; border-radius: 6px; max-width: 320px; z-index: 9; display: none; }
a:focus-visible, summary:focus-visible { outline: 2px solid var(--s1); outline-offset: 2px; }
</style>
</head>
<body>
<main>
<header class="top"><h1>${esc(TITLE || 'プレイログ分析')}${simulated ? '<span class="badge">模擬データ（ボット）</span>' : ''}</h1><p>『10 buy year！』の匿名のプレイ記録から作成。作成：${esc(new Date().toISOString().slice(0, 10))}・束 ${num(batches.length)}・出来事 ${num(O.events)}</p></header>
${simulated ? '<div class="callout"><b>これは模擬データです</b><p>自動プレイのボット（test/bot.js）に遊ばせ、途中でやめる人の分は週数を打ち切ってまねたもの。レポートの形を確かめるためのもので、実際のプレイヤーの傾向ではありません。ボットは画面を開かないので、画面・メニューの利用率は出ません。</p></div>' : ''}
${summary}
<nav class="toc"><a href="#features">機能の利用率</a><a href="#abilities">基礎能力</a><a href="#tree">スキルツリー</a><a href="#sourcing">仕入れルート</a><a href="#styles">プレイスタイル</a><a href="#churn">序盤の離脱</a><a href="#endings">エンディング</a></nav>
${[ch1, ch2, ch3, ch4, ch5, ch6, ch7].join('\n')}
</main>
<div id="tip" role="tooltip"></div>
<script>
const tip = document.getElementById('tip');
document.addEventListener('pointerover', (e) => { const t = e.target.closest('[data-tip]'); if (!t) { tip.style.display = 'none'; return; } tip.textContent = t.dataset.tip; tip.style.display = 'block'; });
document.addEventListener('pointermove', (e) => { if (tip.style.display !== 'block') return; const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = (e.clientY + 16) + 'px'; });
document.addEventListener('pointerleave', () => { tip.style.display = 'none'; });
</script>
</body>
</html>
`;
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, html);
console.log(`${OUT}（${(html.length / 1024).toFixed(0)}KB）`);
console.log(`プレイヤー ${O.players}・プレイ ${O.games}・1年目を終えた ${pct(yearReach)}・利用率20%未満の機能 ${unused.length}件・プレイスタイル ${P.k}つ`);
void median;
void ROUTE_MAP;
