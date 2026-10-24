// プレイログの集計。受け取った束（api/_telemetry.js の形）を、プレイごとにまとめて各分析の数字にする。
// 描画は report.mjs。ここは数字だけを返す（テストしやすいように）。
import '../../src/engine/turn.js'; // 読みこむ順番をゲームと同じにする（循環 import のため）
import { readFileSync } from 'node:fs';
import { COMMAND_MAP } from '../../src/engine/commands.js';
import { ABILITIES, EXP_TYPES } from '../../src/engine/abilities.js';
import { SKILL_MAP, ROUTE_MAP, ROUTES, TREE_NODES } from '../../src/data/skills.js';
import { PLATFORMS } from '../../src/engine/inventory.js';
import { MISSIONS } from '../../src/engine/tutorial.js';
import { ENDINGS } from '../../src/engine/ending.js';
import { VISIONS } from '../../src/engine/visions.js';

export const YEAR = 48;
const median = (xs) => {
  const a = xs.filter((x) => Number.isFinite(x)).sort((p, q) => p - q);
  if (!a.length) return null;
  const m = a.length >> 1;
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};
const sum = (xs) => xs.reduce((a, x) => a + x, 0);
const rate = (n, d) => (d ? n / d : null);
export { median };

// ---------------- 名前 ----------------
const PLATFORM_EXTRA = { shop: '自分の店', live: 'ライブ配信', buyback: '即決買取' };
export const labels = {
  cmd: (id) => (id === 'sleep' ? '（夜）寝る' : COMMAND_MAP[id]?.name || id),
  feature: (id) => (id.startsWith('night:') ? `夜：${COMMAND_MAP[id.slice(6)]?.name || id}` : id.startsWith('ui:') ? `メニュー：${UI_NAMES[id.slice(3)] || id}` : COMMAND_MAP[id]?.name || id),
  skill: (id) => SKILL_MAP[id]?.name || id,
  route: (id) => ROUTE_MAP[id]?.name || id,
  platform: (id) => PLATFORMS[id]?.name || PLATFORM_EXTRA[id] || id,
  ability: (id) => ABILITIES.find((a) => a.id === id)?.name || id,
  ending: (id) => (id.startsWith('vision_') ? (id === 'vision_half' ? '志半ばEND' : VISIONS[id.slice(7)]?.full.title) : ENDINGS[id]?.title) || id,
  mission: (i) => MISSIONS[i - 1]?.title || `ミッション${i}`,
};
const UI_NAMES = { quest: 'ミッション', tree: 'スキルツリー', ab: '能力強化', market: '相場', shop: '自分の店', rivals: '業界の動き', collection: 'コレクション', careers: 'キャリア', life: '暮らし', crypto: '仮想通貨', map: '店の地図' };
export const routeColorOrder = ROUTES.map((r) => r.id);

// ---------------- 読みこみ ----------------
// 1行に1つの束（JSONL）。GET /api/telemetry の応答（{items:[...]}）をそのまま保存したものも読める
export function loadBatches(files) {
  const out = [];
  for (const f of files) {
    for (const line of readFileSync(f, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const x = JSON.parse(line);
      if (Array.isArray(x.items)) out.push(...x.items);
      else out.push(x);
    }
  }
  return out;
}

// 束をプレイ（g）ごとにまとめる。タイトル画面の出来事（g なし）はプレイヤーごとに
export function buildGames(batches) {
  const games = new Map();
  const players = new Map();
  let first = Infinity;
  let last = 0;
  for (const b of batches) {
    const p = players.get(b.pid) || { pid: b.pid, games: new Set(), ui: {}, dev: b.dev, lang: b.lang, sids: new Set() };
    players.set(b.pid, p);
    p.sids.add(b.sid);
    for (const e of b.ev) {
      const at = e.at ?? b.rt;
      first = Math.min(first, at);
      last = Math.max(last, at);
      if (!e.g) {
        if (e.e === 'ui') p.ui[e.id] = (p.ui[e.id] || 0) + 1;
        continue;
      }
      let g = games.get(e.g);
      if (!g) {
        g = { g: e.g, pid: b.pid, dev: b.dev, lang: b.lang, ev: [], sessions: new Map() };
        games.set(e.g, g);
      }
      p.games.add(e.g);
      g.ev.push({ ...e, at, sid: b.sid });
      const se = g.sessions.get(b.sid) || [at, at];
      g.sessions.set(b.sid, [Math.min(se[0], at), Math.max(se[1], at)]);
    }
  }
  for (const g of games.values()) summarize(g);
  return { games: [...games.values()], players: [...players.values()], first, last };
}

function summarize(g) {
  g.ev.sort((a, b) => a.at - b.at || (a.w ?? 0) - (b.w ?? 0));
  g.meta = {};
  g.started = false;
  g.cmds = {};
  g.autoCmds = 0;
  g.totalCmds = 0;
  g.unlock = {}; // 機能 → 使えるようになった週
  g.used = {}; // 機能 → 使った回数
  g.firstUse = {};
  g.ui = {};
  g.mon = [];
  g.buy = {};
  g.sell = {};
  g.prof = {};
  g.pay = {};
  g.skills = [];
  g.ab = { manual: 0, auto: 0, bot: 0, first: null, points: { manual: 0, auto: 0, bot: 0 } };
  g.tut = 0;
  g.stages = {};
  g.lastWeek = 0;
  g.end = null;
  g.quests = 0;
  g.cv = 0;
  for (const e of g.ev) {
    if (Number.isInteger(e.w)) g.lastWeek = Math.max(g.lastWeek, e.w);
    switch (e.e) {
      case 'new':
        g.started = true;
        g.startWeek = e.w ?? 0;
        Object.assign(g.meta, pickMeta(e));
        break;
      case 'sess':
        Object.assign(g.meta, { ...pickMeta(e), ...g.meta });
        if (g.startWeek === undefined) g.startWeek = e.w ?? 0;
        break;
      case 'unl':
        for (const id of e.ids || []) if (g.unlock[id] === undefined) g.unlock[id] = e.w;
        break;
      case 'cmd': {
        const id = e.n ? `night:${e.id}` : e.id;
        g.totalCmds++;
        if (e.auto) g.autoCmds++;
        g.cmds[e.id] = (g.cmds[e.id] || 0) + 1;
        g.used[id] = (g.used[id] || 0) + 1;
        if (g.firstUse[id] === undefined) g.firstUse[id] = e.w;
        break;
      }
      case 'ui': {
        g.ui[e.id] = (g.ui[e.id] || 0) + 1;
        const m = /^(?:tab|menu):(.+)$/.exec(e.id);
        if (m) {
          const key = `ui:${m[1]}`;
          g.used[key] = (g.used[key] || 0) + 1;
          if (g.firstUse[key] === undefined) g.firstUse[key] = e.w;
        }
        break;
      }
      case 'mon':
        g.mon.push(e);
        for (const [kind, target] of [['buy', g.buy], ['sell', g.sell], ['prof', g.prof], ['pay', g.pay]]) {
          for (const [k, [n, amt]] of Object.entries(e.t?.[kind] || {})) {
            const cur = (target[k] ||= [0, 0]);
            cur[0] += n;
            cur[1] += amt;
          }
        }
        break;
      case 'sk':
        g.skills.push({ id: e.id, w: e.w, free: !!e.free });
        break;
      case 'ab': {
        const how = e.how || 'manual';
        g.ab[how] = (g.ab[how] || 0) + 1;
        g.ab.points[how] = (g.ab.points[how] || 0) + sum(Object.values(e.d || {}));
        if (g.ab.first === null) g.ab.first = e.w;
        break;
      }
      case 'tut':
        g.tut = Math.max(g.tut, e.i);
        break;
      case 'stage':
        g.stages[e.to] = e.w;
        break;
      case 'quest':
        g.quests++;
        break;
      case 'cv':
        g.cv++;
        break;
      case 'end':
        g.end = e;
        break;
      default:
    }
  }
  // 使った機能は、使えるようになっていたことにする（記録を始める前に開いていたもの）
  for (const [id, w] of Object.entries(g.firstUse)) if (g.unlock[id] === undefined || g.unlock[id] > w) g.unlock[id] = w;
  g.lastAt = g.ev.length ? g.ev[g.ev.length - 1].at : 0;
  g.lastEv = [...g.ev].reverse().find((e) => !['mon', 'unl'].includes(e.e)) || null;
  g.finalMon = g.mon[g.mon.length - 1] || null;
  g.year = (y) => [...g.mon].reverse().find((m) => m.w < y * YEAR) || null; // y年目の終わりの様子
  g.reached = (y) => g.lastWeek >= y * YEAR - 4;
}
const pickMeta = (e) => Object.fromEntries(['diff', 'style', 'cat', 'mode', 'legacy', 'mentor'].filter((k) => e[k] !== undefined).map((k) => [k, e[k]]));

// ---------------- 概要 ----------------
export function overview(data) {
  const { games, players } = data;
  const count = (f) => {
    const out = {};
    for (const g of games) {
      const k = f(g) ?? '不明';
      out[k] = (out[k] || 0) + 1;
    }
    return out;
  };
  const sessions = games.flatMap((g) => [...g.sessions.values()].map(([a, b]) => (b - a) / 60));
  return {
    players: players.length,
    games: games.length,
    started: games.filter((g) => g.started).length,
    finished: games.filter((g) => g.end).length,
    sessions: sum(games.map((g) => g.sessions.size)),
    events: sum(games.map((g) => g.ev.length)),
    medianWeeks: median(games.map((g) => g.lastWeek)),
    medianSessionMin: median(sessions),
    from: data.first,
    to: data.last,
    byDiff: count((g) => g.meta.diff),
    byMode: count((g) => g.meta.mode),
    byStyle: count((g) => g.meta.style),
    byDev: count((g) => g.dev),
  };
}

// ---------------- 機能の利用率 ----------------
// 使えるようになってから8週以上遊んだプレイ（または使ったプレイ）を「使える人」とし、そのうち何割が使ったか
export const EXPOSE_WEEKS = 8;
export function featureUsage(data) {
  const ids = new Set();
  for (const g of data.games) for (const id of Object.keys(g.unlock)) ids.add(id);
  const rows = [];
  for (const id of ids) {
    let exposed = 0;
    let users = 0;
    let uses = 0;
    let weeks = 0;
    for (const g of data.games) {
      const u = g.unlock[id];
      if (u === undefined) continue;
      const span = g.lastWeek - u;
      if (span < EXPOSE_WEEKS && !g.used[id]) continue;
      exposed++;
      weeks += Math.max(1, span);
      if (g.used[id]) {
        users++;
        uses += g.used[id];
      }
    }
    if (!exposed) continue;
    rows.push({ id, label: labels.feature(id), kind: id.startsWith('night:') ? 'night' : id.startsWith('ui:') ? 'menu' : 'cmd', exposed, users, rate: users / exposed, uses, per100: (uses / weeks) * 100 });
  }
  rows.sort((a, b) => a.rate - b.rate || a.per100 - b.per100);
  // 行動の内訳（全プレイの行動のうちの割合）
  const total = sum(data.games.map((g) => g.totalCmds));
  const share = {};
  for (const g of data.games) for (const [id, n] of Object.entries(g.cmds)) share[id] = (share[id] || 0) + n;
  const mix = Object.entries(share).map(([id, n]) => ({ id, label: labels.cmd(id), n, share: n / total })).sort((a, b) => b.n - a.n);
  const auto = rate(sum(data.games.map((g) => g.autoCmds)), total);
  // 画面（モーダルの見出し）：開いたプレイヤーの数
  const screens = {};
  for (const p of data.players) {
    const seen = new Set(Object.keys(p.ui));
    for (const g of data.games.filter((x) => x.pid === p.pid)) for (const id of Object.keys(g.ui)) seen.add(id);
    for (const id of seen) screens[id] = (screens[id] || 0) + 1;
  }
  const opens = {};
  for (const g of data.games) for (const [id, n] of Object.entries(g.ui)) opens[id] = (opens[id] || 0) + n;
  for (const p of data.players) for (const [id, n] of Object.entries(p.ui)) opens[id] = (opens[id] || 0) + n;
  const screenRows = Object.keys(screens).filter((id) => !/^(tab|menu):/.test(id)).map((id) => ({ id, players: screens[id], rate: screens[id] / data.players.length, opens: opens[id] })).sort((a, b) => b.players - a.players || b.opens - a.opens);
  return { rows, mix, auto, screens: screenRows, totalCmds: total };
}

// ---------------- 基礎能力 ----------------
export function abilityIncentive(data) {
  const eligible = data.games.filter((g) => g.unlock['ui:ab'] !== undefined && g.lastWeek - g.unlock['ui:ab'] >= EXPOSE_WEEKS);
  const any = eligible.filter((g) => g.ab.manual + g.ab.auto + g.ab.bot > 0);
  const byYear = [];
  for (let y = 1; y <= 10; y++) {
    const snaps = data.games.filter((g) => g.reached(y)).map((g) => g.year(y)).filter(Boolean);
    if (snaps.length < 2) continue;
    byYear.push({
      year: y,
      n: snaps.length,
      ab: ABILITIES.map((a, i) => median(snaps.map((s) => s.ab?.[i]))),
      abSum: median(snaps.map((s) => sum(s.ab || []))),
      exp: median(snaps.map((s) => sum(s.ex || []))),
      expBy: EXP_TYPES.map((x, i) => median(snaps.map((s) => s.ex?.[i]))),
      nw: median(snaps.map((s) => s.nw)),
    });
  }
  // 能力の合計と純資産の関係（順位相関）。プラスなら「上げた人ほど稼げている」
  const corr = [];
  for (const y of [1, 2, 3, 5]) {
    const snaps = data.games.filter((g) => g.reached(y)).map((g) => g.year(y)).filter((s) => s?.ab);
    if (snaps.length < 5) continue;
    corr.push({
      year: y,
      n: snaps.length,
      abNw: spearman(snaps.map((s) => sum(s.ab)), snaps.map((s) => s.nw)),
      expNw: spearman(snaps.map((s) => sum(s.ex || [])), snaps.map((s) => s.nw)),
      each: ABILITIES.map((a, i) => ({ id: a.id, r: spearman(snaps.map((s) => s.ab[i]), snaps.map((s) => s.nw)) })),
    });
  }
  return {
    eligible: eligible.length,
    raisedAny: rate(any.length, eligible.length),
    raisedManual: rate(eligible.filter((g) => g.ab.manual > 0).length, eligible.length),
    raisedAuto: rate(eligible.filter((g) => g.ab.auto > 0).length, eligible.length),
    autoShare: rate(sum(eligible.map((g) => g.ab.points.auto)), sum(eligible.map((g) => g.ab.points.manual + g.ab.points.auto))),
    firstRaise: median(any.map((g) => g.ab.first - g.unlock['ui:ab'])),
    convertRate: rate(eligible.filter((g) => g.cv > 0).length, eligible.length),
    byYear,
    corr,
  };
}

export function spearman(xs, ys) {
  const rank = (a) => {
    const idx = a.map((v, i) => [v, i]).sort((p, q) => p[0] - q[0]);
    const r = new Array(a.length);
    for (let i = 0; i < idx.length;) {
      let j = i;
      while (j + 1 < idx.length && idx[j + 1][0] === idx[i][0]) j++;
      for (let k = i; k <= j; k++) r[idx[k][1]] = (i + j) / 2 + 1;
      i = j + 1;
    }
    return r;
  };
  const rx = rank(xs);
  const ry = rank(ys);
  const n = xs.length;
  const mx = sum(rx) / n;
  const my = sum(ry) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2;
    dy += (ry[i] - my) ** 2;
  }
  return dx && dy ? num / Math.sqrt(dx * dy) : 0;
}

// ---------------- スキルツリー ----------------
export function treeTrends(data) {
  const base = data.games.filter((g) => g.lastWeek >= 24);
  const nodes = TREE_NODES.filter((n) => n.kind !== 'root' && n.kind !== 'red');
  const rows = nodes.map((n) => {
    const got = base.map((g) => g.skills.find((s) => s.id === n.id)).filter(Boolean);
    return { id: n.id, label: n.name, route: n.route, kind: n.kind, n: got.length, rate: rate(got.length, base.length), week: median(got.map((s) => s.w)), free: got.filter((s) => s.free).length };
  });
  const paid = base.flatMap((g) => g.skills.filter((s) => !s.free && SKILL_MAP[s.id]?.route));
  const routeShare = {};
  for (const s of paid) routeShare[SKILL_MAP[s.id].route] = (routeShare[SKILL_MAP[s.id].route] || 0) + 1;
  // 最初に伸ばしたルート（入門・中心を除く、経験点で取った最初の3枚でいちばん多いルート）
  const firstRoute = {};
  for (const g of base) {
    const first = g.skills.filter((s) => !s.free && SKILL_MAP[s.id]?.route && SKILL_MAP[s.id].kind !== 'starter').slice(0, 3);
    if (!first.length) continue;
    const c = {};
    for (const s of first) c[SKILL_MAP[s.id].route] = (c[SKILL_MAP[s.id].route] || 0) + 1;
    const top = Object.entries(c).sort((a, b) => b[1] - a[1])[0][0];
    firstRoute[top] = (firstRoute[top] || 0) + 1;
  }
  // いちばん伸ばしたルート（最後の月末の様子から）
  const mainRoute = {};
  for (const g of base) {
    const rt = g.finalMon?.rt;
    if (!rt || !Object.keys(rt).length) continue;
    const top = Object.entries(rt).sort((a, b) => b[1] - a[1])[0][0];
    mainRoute[top] = (mainRoute[top] || 0) + 1;
  }
  return {
    base: base.length,
    rows: rows.sort((a, b) => (b.rate ?? 0) - (a.rate ?? 0)),
    never: rows.filter((r) => !r.n),
    routeShare,
    firstRoute,
    mainRoute,
    medianNodes: median(base.map((g) => g.finalMon?.sk)),
  };
}

// ---------------- 仕入れルート ----------------
export function sourcing(data) {
  const byCmd = {};
  const bySrc = {};
  const yearCmd = [];
  for (const g of data.games) {
    for (const [k, [n, amt]] of Object.entries(g.buy)) {
      const [cmd, src] = k.split(':');
      const c = (byCmd[cmd] ||= { n: 0, amt: 0, games: new Set() });
      c.n += n;
      c.amt += amt;
      c.games.add(g.g);
      const s = (bySrc[src] ||= { n: 0, amt: 0 });
      s.n += n;
      s.amt += amt;
    }
    for (const m of g.mon) {
      const y = Math.min(10, Math.floor(m.w / YEAR) + 1);
      for (const [k, [, amt]] of Object.entries(m.t?.buy || {})) {
        const cmd = k.split(':')[0];
        (yearCmd[y] ||= {})[cmd] = ((yearCmd[y] ||= {})[cmd] || 0) + amt;
      }
    }
  }
  const total = sum(Object.values(byCmd).map((c) => c.amt));
  // 偏り：プレイごとに、いちばん使った仕入れ（行動）が仕入れ額の何割か
  const conc = [];
  for (const g of data.games) {
    const amts = {};
    for (const [k, [, amt]] of Object.entries(g.buy)) amts[k.split(':')[0]] = (amts[k.split(':')[0]] || 0) + amt;
    const t = sum(Object.values(amts));
    if (t < 100000) continue; // ほとんど仕入れていないプレイは除く
    const top = Object.entries(amts).sort((a, b) => b[1] - a[1])[0];
    conc.push({ g: g.g, top: top[0], share: top[1] / t, kinds: Object.values(amts).filter((v) => v / t >= 0.05).length });
  }
  const bins = [['〜40%', 0, 0.4], ['40〜60%', 0.4, 0.6], ['60〜80%', 0.6, 0.8], ['80%〜', 0.8, 1.01]].map(([label, lo, hi]) => ({ label, n: conc.filter((c) => c.share >= lo && c.share < hi).length }));
  const sellTotals = {};
  for (const g of data.games) {
    for (const [k, [n, amt]] of Object.entries(g.sell)) {
      const c = (sellTotals[k] ||= { n: 0, amt: 0, prof: 0 });
      c.n += n;
      c.amt += amt;
      c.prof += g.prof[k]?.[1] || 0;
    }
  }
  const payTotal = sum(data.games.flatMap((g) => Object.values(g.pay).map((x) => x[1])));
  return {
    total,
    cmds: Object.entries(byCmd).map(([id, c]) => ({ id, label: labels.cmd(id), n: c.n, amt: c.amt, share: c.amt / total, games: c.games.size })).sort((a, b) => b.amt - a.amt),
    srcs: Object.entries(bySrc).map(([id, c]) => ({ id, n: c.n, amt: c.amt, share: c.amt / total })).sort((a, b) => b.amt - a.amt),
    years: yearCmd.map((m, y) => (m ? { year: y, total: sum(Object.values(m)), by: m } : null)).filter(Boolean),
    concentration: { bins, n: conc.length, median: median(conc.map((c) => c.share)), kinds: median(conc.map((c) => c.kinds)) },
    sells: Object.entries(sellTotals).map(([id, c]) => ({ id, label: labels.platform(id), n: c.n, amt: c.amt, margin: c.amt ? c.prof / c.amt : null })).sort((a, b) => b.amt - a.amt),
    cardShare: rate(sum(data.games.map((g) => g.pay.card?.[1] || 0)), payTotal),
  };
}

// ---------------- プレイスタイル（k-means） ----------------
const CMD_GROUPS = {
  店舗: ['store', 'expedition'], 電脳: ['online'], 抽選と行列: ['lottery', 'queue'], 業者オークション: ['auction'], 問屋と輸入: ['wholesale', 'import', 'oem'], くじ: ['kuji'],
  出品作業: ['listing'], 勉強と講座: ['study', 'course', 'meetup'], 休む: ['rest', 'play', 'clinic'], バイト: ['parttime'], キャリア: ['live', 'tour', 'buying', 'appraise_job', 'review'],
};
const SELL_KEYS = ['merc', 'auc', 'ama', 'exp', 'spec', 'shop', 'live', 'buyback', 'black'];
export function featureVector(g) {
  const v = {};
  const tc = Math.max(1, g.totalCmds);
  for (const [name, ids] of Object.entries(CMD_GROUPS)) v[`行動：${name}`] = sum(ids.map((id) => g.cmds[id] || 0)) / tc;
  const sellT = Math.max(1, sum(Object.values(g.sell).map((x) => x[1])));
  for (const k of SELL_KEYS) v[`販路：${labels.platform(k)}`] = (g.sell[k]?.[1] || 0) / sellT;
  const rt = g.finalMon?.rt || {};
  const rtT = Math.max(1, sum(Object.values(rt)));
  for (const r of ROUTES) v[`ツリー：${r.name}`] = (rt[r.id] || 0) / rtT;
  v['TOKUの低さ'] = 1 - Math.min(200, g.finalMon?.toku ?? 100) / 200;
  return v;
}

function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x = (x * 1664525 + 1013904223) >>> 0;
    return x / 2 ** 32;
  };
}
const dist2 = (a, b) => sum(a.map((x, i) => (x - b[i]) ** 2));
export function kmeans(points, k, seed = 1) {
  const r = rng(seed);
  const cents = [points[Math.floor(r() * points.length)]];
  while (cents.length < k) {
    const d = points.map((p) => Math.min(...cents.map((c) => dist2(p, c))));
    let t = r() * sum(d);
    let i = 0;
    while (t > d[i] && i < d.length - 1) t -= d[i++];
    cents.push(points[i]);
  }
  let assign = new Array(points.length).fill(0);
  for (let it = 0; it < 100; it++) {
    const next = points.map((p) => cents.map((c) => dist2(p, c)).reduce((bi, d, i, arr) => (d < arr[bi] ? i : bi), 0));
    const changed = next.some((a, i) => a !== assign[i]);
    assign = next;
    for (let c = 0; c < k; c++) {
      const mem = points.filter((_, i) => assign[i] === c);
      if (mem.length) cents[c] = mem[0].map((_, j) => sum(mem.map((p) => p[j])) / mem.length);
    }
    if (!changed && it) break;
  }
  return { assign, cents };
}
export function silhouette(points, assign) {
  const k = Math.max(...assign) + 1;
  let total = 0;
  for (let i = 0; i < points.length; i++) {
    const d = (c) => {
      const mem = points.filter((_, j) => assign[j] === c && j !== i);
      return mem.length ? sum(mem.map((p) => Math.sqrt(dist2(p, points[i])))) / mem.length : 0;
    };
    const a = d(assign[i]);
    let b = Infinity;
    for (let c = 0; c < k; c++) if (c !== assign[i]) b = Math.min(b, d(c));
    total += b === Infinity || Math.max(a, b) === 0 ? 0 : (b - a) / Math.max(a, b);
  }
  return total / points.length;
}

export function playStyles(data, { minWeeks = YEAR } = {}) {
  const games = data.games.filter((g) => g.lastWeek >= minWeeks && g.totalCmds >= 20);
  if (games.length < 8) return { n: games.length, clusters: [], k: 0 };
  const vecs = games.map(featureVector);
  const keys = Object.keys(vecs[0]);
  const raw = vecs.map((v) => keys.map((k) => v[k]));
  const mean = keys.map((_, j) => sum(raw.map((r) => r[j])) / raw.length);
  const sd = keys.map((_, j) => Math.sqrt(sum(raw.map((r) => (r[j] - mean[j]) ** 2)) / raw.length) || 1);
  const z = raw.map((r) => r.map((x, j) => (x - mean[j]) / sd[j]));
  let best = null;
  for (let k = 2; k <= Math.min(6, Math.floor(games.length / 4)); k++) {
    const km = kmeans(z, k, 7 + k);
    const sil = silhouette(z, km.assign);
    if (!best || sil > best.sil + 0.01) best = { k, sil, ...km };
  }
  const clusters = [];
  for (let c = 0; c < best.k; c++) {
    const idx = best.assign.map((a, i) => (a === c ? i : -1)).filter((i) => i >= 0);
    if (!idx.length) continue;
    const zc = keys.map((_, j) => sum(idx.map((i) => z[i][j])) / idx.length);
    const avg = keys.map((_, j) => sum(idx.map((i) => raw[i][j])) / idx.length);
    const traits = keys.map((k, j) => ({ key: k, z: zc[j], avg: avg[j], all: mean[j] })).filter((t) => t.avg >= 0.05 || t.key === 'TOKUの低さ').sort((a, b) => b.z - a.z).slice(0, 4).filter((t) => t.z > 0.3);
    const mem = idx.map((i) => games[i]);
    const ends = {};
    for (const g of mem) if (g.end) ends[g.end.id] = (ends[g.end.id] || 0) + 1;
    clusters.push({
      n: mem.length,
      share: mem.length / games.length,
      traits,
      cmdMix: Object.entries(CMD_GROUPS).map(([name]) => ({ name, share: avg[keys.indexOf(`行動：${name}`)] })).filter((x) => x.share >= 0.03).sort((a, b) => b.share - a.share),
      nw: median(mem.map((g) => g.finalMon?.nw)),
      weeks: median(mem.map((g) => g.lastWeek)),
      stage3: rate(mem.filter((g) => (g.finalMon?.st || 1) >= 3).length, mem.length),
      ending: Object.entries(ends).sort((a, b) => b[1] - a[1])[0]?.[0] || null,
    });
  }
  clusters.sort((a, b) => b.n - a.n);
  return { n: games.length, k: best.k, sil: best.sil, clusters };
}

// ---------------- 序盤の離脱 ----------------
const LAST_LABEL = { sk: 'スキルのパネルを取った直後', stage: 'ステージが上がった直後', new: '始めた直後', sess: '再開した直後', ab: '基礎能力を上げた直後', cv: '経験点を振り替えた直後', quest: 'ミッションを達成した直後', repay: '繰上げ返済した直後', routine: 'ルーティンを始めた直後', cure: '不調を治した直後' };
// 離脱：エンディングまで行かず、データの最後の日から idleDays 以上記録がないプレイ
export function churn(data, { idleDays = 3 } = {}) {
  const games = data.games.filter((g) => g.started);
  const idle = data.last - idleDays * 86400;
  const churned = games.filter((g) => !g.end && g.lastAt < idle);
  // 週の進み具合（どこまで遊んだか）と、チュートリアルの進み具合は、別々の漏斗にする
  const weekSteps = [
    ['ゲームを始めた', () => true], ['4週目', (g) => g.lastWeek >= 4], ['8週目', (g) => g.lastWeek >= 8], ['12週目', (g) => g.lastWeek >= 12], ['24週目（半年）', (g) => g.lastWeek >= 24],
    ['1年目を終えた', (g) => g.lastWeek >= YEAR], ['2年目を終えた', (g) => g.lastWeek >= 2 * YEAR], ['5年目を終えた', (g) => g.lastWeek >= 5 * YEAR], ['10年を終えた', (g) => g.lastWeek >= 10 * YEAR - 1],
  ];
  const funnel = weekSteps.map(([label, f]) => ({ label, n: games.filter(f).length }));
  const tutorial = [{ label: 'ゲームを始めた', n: games.length }, ...MISSIONS.map((m, i) => ({ label: `${i + 1}. ${m.title}`, n: games.filter((g) => g.tut >= i + 1).length }))];
  const earlyEnd = games.filter((g) => g.end && g.lastWeek < 10 * YEAR - 1).length; // 途中のエンディング（債務整理・イグジットなど）
  const lastWeekBins = [];
  for (let lo = 0; lo < YEAR; lo += 4) lastWeekBins.push({ label: `${lo}〜${lo + 3}週`, n: churned.filter((g) => g.lastWeek >= lo && g.lastWeek < lo + 4).length });
  lastWeekBins.push({ label: '48週〜', n: churned.filter((g) => g.lastWeek >= YEAR).length });
  const lastWhat = {};
  for (const g of churned.filter((x) => x.lastWeek < YEAR)) {
    const e = g.lastEv;
    if (!e) continue;
    const k = e.e === 'cmd' ? `行動：${labels.cmd(e.id)}` : e.e === 'ui' ? `画面：${e.id}` : e.e === 'tut' ? `チュートリアル${e.i}を達成した直後` : LAST_LABEL[e.e] || e.e;
    lastWhat[k] = (lastWhat[k] || 0) + 1;
  }
  const inTut = churned.filter((g) => g.tut < MISSIONS.length);
  const tutStop = {};
  for (const g of inTut) tutStop[g.tut] = (tutStop[g.tut] || 0) + 1;
  return {
    games: games.length,
    churned: churned.length,
    active: games.filter((g) => !g.end && g.lastAt >= idle).length,
    finished: games.filter((g) => g.end).length,
    funnel,
    tutorial,
    earlyEnd,
    lastWeekBins,
    lastWhat: Object.entries(lastWhat).map(([k, n]) => ({ label: k, n })).sort((a, b) => b.n - a.n).slice(0, 12),
    tutStop: Object.entries(tutStop).map(([i, n]) => ({ label: Number(i) === 0 ? '1つ目の前' : `${i}つ目のあと（次：${MISSIONS[i]?.title || '-'}）`, n })).sort((a, b) => b.n - a.n),
    sessions: median(games.map((g) => g.sessions.size)),
    firstSessionWeeks: median(games.map((g) => {
      const first = [...g.sessions.entries()].sort((a, b) => a[1][0] - b[1][0])[0]?.[0];
      return Math.max(0, ...g.ev.filter((e) => e.sid === first && Number.isInteger(e.w)).map((e) => e.w));
    })),
  };
}

// ---------------- エンディング ----------------
export function endings(data) {
  const ends = data.games.filter((g) => g.end);
  const by = {};
  const ranks = {};
  for (const g of ends) {
    by[g.end.id] = (by[g.end.id] || 0) + 1;
    ranks[g.end.rank] = (ranks[g.end.rank] || 0) + 1;
  }
  return {
    n: ends.length,
    by: Object.entries(by).map(([id, n]) => ({ id, label: labels.ending(id), n })).sort((a, b) => b.n - a.n),
    ranks: ['S', 'A', 'B', 'C', 'D', 'E', 'F', 'G'].map((r) => ({ label: r, n: ranks[r] || 0 })),
    nw: median(ends.map((g) => g.end.nw)),
  };
}

export function analyze(batches, opts = {}) {
  const data = buildGames(batches);
  return {
    data,
    overview: overview(data),
    features: featureUsage(data),
    abilities: abilityIncentive(data),
    tree: treeTrends(data),
    sourcing: sourcing(data),
    styles: playStyles(data),
    churn: churn(data, opts),
    endings: endings(data),
  };
}
