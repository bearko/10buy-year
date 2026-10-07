// 相場シミュレーション。商品ごとに「定価に対する倍率（premium）」を持ち、毎週動かす。
import { catOf } from './listing.js';
import { specErr } from './style.js';
import { madeToOrder, usedRegimeMult } from './regimes.js';
import { AUD_OF } from '../data/careers.js';
import { PRODUCTS, productOf } from '../data/products.js';
import { chance, gauss, hashNoise, randInt, randRange } from './rng.js';
import { clamp, hasSkill, tired } from './effects.js';
import { woy, yearOf } from './calendar.js';
import { perk } from './perks.js';

const PRODUCT_INDEX = Object.fromEntries(PRODUCTS.map((p, i) => [p.id, i]));

export function initMarket(s) {
  s.market = {};
  ensureMarket(s);
}

// 古いセーブに、あとから追加した商品の相場がなければ作る
export function ensureMarket(s) {
  const added = [];
  for (const p of PRODUCTS) {
    if (s.market[p.id]) continue;
    added.push(p);
    const m = { p: p.kind === 'hype' ? p.peak : p.base ?? 1, hist: [], restockWeek: -1, restocks: 0 };
    if (p.kind === 'hype') {
      m.floor = p.floor;
      m.edition = 0; // 発売済みの最新エディション（何年目のモデルか）。0 = まだ発売されていない
      m.oldP = p.floor;
    }
    if (p.kind === 'perishable') m.p = p.premium;
    if (p.kind === 'seasonal') m.p = p.base;
    if (p.kind === 'boom') {
      m.boomStart = randInt(s, p.boomFrom, p.boomTo);
      m.phase = 'calm';
    }
    s.market[p.id] = m;
  }
  for (const p of added) s.market[p.id].hist.push(priceOf(s, p.id));
}

// 業界の年表（engine/annals.js）の効果：その年だけ、ある顧客層の品の相場が上がる・為替が円安に振れる
const annalMult = (s, pid) => (s.annalFx && s.week < s.annalFx.until && AUD_OF[pid] === s.annalFx.aud ? s.annalFx.mult : 1);
const fxBias = (s) => (s.fxBias && s.week < s.fxBias.until ? s.fxBias.bias : 0);

export const priceOf = (s, pid) => Math.round(productOf(pid).retail * s.market[pid].p * annalMult(s, pid));

// 一度でも発売されていれば true（2年目以降は前年モデルが流通している）
export function isReleased(s, product, week = s.week) {
  if (product.launch !== undefined && week < product.launch) return false; // シリーズの次の世代はまだ出ていない
  if (product.kind === 'hype' || product.kind === 'seasonal') return yearOf(week) > 1 || woy(week) >= product.release;
  return true;
}

// 今年の新作の抽選・予約期間（発売4週前〜発売週の翌週）
export function inPreSale(s, product, week = s.week) {
  return product.kind === 'hype' && woy(week) >= product.release - 4 && woy(week) <= product.release + 1;
}

// 発売前（今年の新作がまだ出ていない予約期間）
export const beforeRelease = (s, product, week = s.week) => product.kind === 'hype' && woy(week) >= product.release - 4 && woy(week) < product.release;

export function isAnnounced(s, product, week = s.week) {
  if (product.launch !== undefined && week < product.launch) return week >= product.launch - 4; // 新世代は発売4週前に発表
  if (product.kind === 'hype') return isReleased(s, product, week) || woy(week) >= product.release - 4;
  if (product.kind === 'seasonal') return isReleased(s, product, week) || woy(week) >= product.release - 2;
  if (product.kind === 'perishable') return product.eventWeeks.some((w) => w - 2 <= woy(week) && woy(week) <= w + 1);
  return true;
}

// 在庫1個あたりの本当の相場（前年モデル・傷ありを反映）
export function unitPrice(s, u) {
  const p = productOf(u.pid);
  const m = s.market[u.pid];
  let mult = m.p;
  if (p.kind === 'hype' && u.edition && m.edition && u.edition < m.edition) mult = m.oldP;
  if (p.used || u.used) mult *= usedRegimeMult(s); // 認定中古市場
  if (u.rep) mult *= REP_MULT; // 再販版は初版より安い
  mult *= annalMult(s, u.pid);
  return Math.round(p.retail * mult * (u.damaged ? 0.5 : 1));
}

export const REP_MULT = 0.9;
// その仕入れ候補が再販版か（再販が決まった年のモデルを、そのあとに仕入れる）
export const isRepOffer = (s, p, offer) => !!p.rep && !offer.upcoming && !!s.market[p.id]?.repEdition && (offer.edition ?? s.market[p.id].edition) === s.market[p.id].repEdition;

// シリーズの前の世代（次の世代が出て型落ちになった）
export const isRetired = (s, p, week = s.week) => p.retire != null && week >= p.retire;

export const isRestockWeek = (s, pid) => s.market[pid].restockWeek === s.week;
export const inBoom = (s, pid) => s.market[pid]?.phase === 'boom';

// 相場ショック（テレビ紹介・再販発表など）。news に積んで返す。
export function applyShock(s, pid, mult, text, news) {
  const m = s.market[pid];
  m.p = clamp(m.p * mult, 0.2, 12);
  if (news && text) news.push({ pid, text, kind: mult >= 1 ? 'up' : 'down' });
}

// 週の頭に呼ぶ。相場を1週分進めて、発生したニュースを返す。
export function updateMarket(s) {
  const news = [];
  // 為替（海外ECの売値の倍率）。1.1 あたりを中心にゆっくり動く
  const fxMean = 1.1 + fxBias(s); // 円安ショックの年は円安側へ
  s.fx = Math.max(0.9, Math.min(1.35 + fxBias(s), (s.fx || 1.1) + (fxMean - (s.fx || 1.1)) * 0.1 + gauss(s) * 0.03));
  const w = woy(s.week);
  const mine = new Map();
  for (const u of s.inventory || []) if (u.listing) mine.set(u.pid, (mine.get(u.pid) || 0) + 1);
  for (const p of PRODUCTS) {
    const m = s.market[p.id];
    // 自分の出品が多すぎると、同じ品の相場が下がる（買い手の数に対して出品が余る）
    const flood = (mine.get(p.id) || 0) - Math.max(4, Math.round(10 * p.demand));
    if (flood > 0 && p.kind !== 'home') {
      m.p *= 1 - Math.min(0.08, flood * 0.01);
      if (!(s.week - (m.floodWarned ?? -99) < 12)) {
        m.floodWarned = s.week;
        news.push({ pid: p.id, text: `「${p.name}」の出品が多すぎて、相場が下がり気味（自分の出品 ${mine.get(p.id)}件）`, kind: 'down' });
      }
    }
    switch (p.kind) {
      case 'staple': {
        if (p.series) {
          updateSeries(s, p, m, news);
          break;
        }
        // 新モデル発表：旧型の相場が2割下がり、しばらく（12週）戻らない。1つの商品で2年に1回くらい
        if (m.oldModel > 0) m.oldModel--;
        else if (s.week > 24 && chance(s, 1 / 96)) {
          m.oldModel = 12;
          m.p *= 0.8;
          news.push({ pid: p.id, text: `【新モデル発表】「${p.name}」の新型が出る。型落ちになる旧型の相場が下がりそうだ`, kind: 'down' });
        }
        const target = m.oldModel > 0 ? p.base * 0.8 : p.base;
        m.p = clamp(m.p + (target - m.p) * 0.3 + gauss(s) * 0.025, m.oldModel > 0 ? 0.65 : 0.8, 1.25);
        break;
      }
      case 'collect':
        m.p = clamp(m.p * (1 + p.drift + gauss(s) * 0.02), 0.6, 3);
        break;
      case 'home':
        m.p = clamp(m.p + (p.base - m.p) * 0.3 + gauss(s) * 0.03, 0.8, 1.2);
        break;
      case 'luxury':
        m.p = clamp(m.p + (p.base - m.p) * 0.2 + gauss(s) * 0.02, 1.15, 1.6);
        break;
      case 'perishable':
        m.p = clamp(p.premium + gauss(s) * 0.08, 1.4, 2.4);
        if (p.eventWeeks.includes(w)) news.push({ pid: p.id, text: `百貨店の催事に「${p.name}」が今週だけ出店！行列必至`, kind: 'event' });
        else if (p.eventWeeks.includes(w + 2)) news.push({ pid: p.id, text: `再来週、催事で「${p.name}」が限定販売されるらしい`, kind: 'info' });
        break;
      case 'hype':
        updateHype(s, p, m, news);
        break;
      case 'seasonal':
        updateSeasonal(s, p, m, news);
        break;
      case 'boom':
        updateBoom(s, p, m, news);
        break;
      default:
        break;
    }
  }
  for (const p of PRODUCTS) {
    const m = s.market[p.id];
    m.hist.push(priceOf(s, p.id));
    if (m.hist.length > 12) m.hist.shift();
  }
  return news;
}

// シリーズの世代交代：発売直後は定価より少し高く、次の世代が出ると型落ちで相場が6割まで下がっていく
function updateSeries(s, p, m, news) {
  if (s.week < p.launch) {
    m.p = 1.15; // 発売前の予想相場
    if (s.week === p.launch - 4) news.push({ pid: p.id, text: `【新世代発表】${p.genre}「${p.name}」が4週後に発売。前の世代は型落ちになりそうだ`, kind: 'info' });
    return;
  }
  if (s.week === p.launch && p.gen > 1) {
    m.p = 1.15;
    news.push({ pid: p.id, text: `【発売】「${p.name}」発売。前の世代の相場が下がり始めた`, kind: 'event' });
    return;
  }
  const target = isRetired(s, p) ? 0.6 : p.base;
  m.p = clamp(m.p + (target - m.p) * (isRetired(s, p) ? 0.08 : 0.15) + gauss(s) * 0.02, isRetired(s, p) ? 0.5 : 0.85, 1.25);
}

function updateHype(s, p, m, news) {
  const w = woy(s.week);
  const year = yearOf(s.week);
  const label = year > 1 ? `${p.name}（${year}年モデル）` : p.name;
  // 受注生産になった商品は品薄でなくなり、相場が定価近くまで下がっていく
  if (madeToOrder(s, p.id)) {
    m.floor = 1.02;
    m.p += (1.05 - m.p) * 0.15;
    m.oldP = Math.min(m.oldP, m.p);
    return;
  }
  // 旧モデルはゆっくり値下がりしていく
  m.oldP = Math.max(0.55, m.oldP * 0.985 + gauss(s) * 0.01);
  if (w === Math.max(0, p.release - 4)) news.push({ pid: p.id, text: `【発表】${p.genre}「${label}」が${p.release - w}週後に発売決定！抽選・予約受付スタート`, kind: 'info' });
  if (!m.edition && w < p.release) {
    m.p = p.peak * (1 + gauss(s) * 0.03); // 初年度の発売前は「予想相場」
    return;
  }
  if (w === p.release) {
    if (m.edition) m.oldP = m.p;
    m.edition = year;
    m.floor = p.floor;
    m.p = p.peak * randRange(s, 0.95, 1.08);
    news.push({ pid: p.id, text: `【本日発売】「${label}」発売日。店頭には早朝から長蛇の列`, kind: 'event' });
    return;
  }
  m.p += (m.floor - m.p) * p.decay + gauss(s) * 0.04 * m.p;
  if (!inPreSale(s, p) && chance(s, p.restock)) {
    m.restockWeek = s.week;
    m.restocks++;
    m.floor = Math.max(0.85, m.floor * 0.85);
    m.repEdition = m.edition; // これ以降に出回るこの年のモデルは「再販版」
    applyShock(s, p.id, 0.72, `【再販決定】メーカーが「${p.name}」の再販を発表。相場が急落中…`, news);
  }
  m.p = clamp(m.p, 0.6, 6);
}

function updateSeasonal(s, p, m, news) {
  const w = woy(s.week);
  if (w < p.release) {
    // シーズンオフ。一度シーズンを経験した商品は「季節外れ」の安値
    m.p = m.seasonDone ? clamp(p.after + gauss(s) * 0.03, p.after * 0.8, p.after * 1.3) : p.base;
    return;
  }
  if (w === p.release) news.push({ pid: p.id, text: `季節商品「${p.name}」の販売が始まった`, kind: 'info' });
  if (w <= p.peakWeek) {
    const t = (w - p.release) / Math.max(1, p.peakWeek - p.release);
    m.p = p.base + (p.peak - p.base) * Math.pow(t, 1.5) + gauss(s) * 0.03;
  } else {
    if (w === p.peakWeek + 1) news.push({ pid: p.id, text: `シーズンが終わり「${p.name}」の需要が蒸発。在庫を抱えた人の悲鳴が…`, kind: 'down' });
    m.seasonDone = true;
    m.p = Math.max(p.after, m.p * 0.6);
  }
}

function updateBoom(s, p, m, news) {
  const w = woy(s.week);
  if (w === 0 && yearOf(s.week) > 1) {
    // 年が変わったら、次のブームが来るかどうか
    m.phase = 'calm';
    m.boomStart = chance(s, 0.55) ? randInt(s, 6, 30) : 99;
  }
  if (m.phase === 'calm' && w >= m.boomStart) {
    m.phase = 'boom';
    m.boomWeeks = 0;
    news.push({ pid: p.id, text: `【バズ】海外セレブがSNSで「${p.name}」を紹介！品薄で相場が急騰中`, kind: 'up' });
  }
  if (m.phase === 'calm' && w === m.boomStart - 2) {
    news.push({ pid: p.id, text: `海外のSNSで「${p.name}」の開封動画がじわじわ再生数を伸ばしているらしい…`, kind: 'info' });
  }
  if (m.phase === 'calm') {
    m.p = clamp(p.base + gauss(s) * 0.03, 0.8, 1.05);
  } else if (m.phase === 'boom') {
    m.boomWeeks++;
    m.p = Math.min(p.peak, m.p * randRange(s, 1.35, 1.6));
    if (m.boomWeeks >= 5) {
      m.phase = 'crash';
      news.push({ pid: p.id, text: `「${p.name}」ブームに陰り？ パチモン流通と大量再入荷で相場が崩壊`, kind: 'down' });
    } else if (m.boomWeeks === 4 && hasSkill(s, 'crowd_madness')) {
      news.push({ pid: p.id, text: `（群衆の狂気）「${p.name}」…熱狂が天井に近い気がする。そろそろ逃げ時か`, kind: 'info' });
    }
  } else {
    m.p = Math.max(0.65, m.p * 0.55);
  }
}

// ---- 需要 ----
export function demandOf(s, product) {
  const m = s.market[product.id];
  let d = product.demand * (s.mods?.demand ?? 1);
  if (product.kind === 'seasonal') {
    const w = woy(s.week);
    if (w < product.release) d *= m.seasonDone ? 0.25 : 0;
    else if (w > product.peakWeek) d *= 0.4;
  }
  if (isRetired(s, product)) d *= 0.5; // 型落ちは買い手が半分
  if (product.kind === 'boom' && m.phase === 'boom') d *= 1.8;
  if (product.kind === 'boom' && m.phase === 'crash') d *= 0.6;
  if (product.kind === 'hype' && m.p > 2) d *= 1.2;
  return d;
}

// ---- 相場の推定（プレイヤーが見る値）----
export function estimateError(s) {
  let amp = 0.32 * (1 - s.abilities.eye / 115);
  if (hasSkill(s, 'eye_market')) amp *= 0.75;
  if (hasSkill(s, 'eye_ai')) amp *= 0.7;
  if (hasSkill(s, 'crowd_madness')) amp *= 0.5;
  if (tired(s)) amp *= 1.3; // 疲れていると判断が甘くなる
  return amp * perk(s, 'estErr');
}

export function estimateAt(s, pid, week, truePrice) {
  let amp = estimateError(s);
  if (s.certs?.includes(`appraise_${catOf(pid)}`)) amp *= 0.8; // ジャンル別の目利き講座
  amp *= specErr(s, pid); // 商材特化：専門は鋭く、専門外はぶれる
  const noise = (hashNoise(s.seed, week, PRODUCT_INDEX[pid]) * 2 - 1) * amp;
  const bias = hasSkill(s, 'optimist') ? 0.1 : 0;
  return roundPrice(truePrice * (1 + noise + bias));
}

export const estimate = (s, pid) => estimateAt(s, pid, s.week, priceOf(s, pid));
export const estimateUnit = (s, u) => estimateAt(s, u.pid, s.week, unitPrice(s, u));
// 発売前の新作の予想相場
export const estimateUpcoming = (s, pid) => estimateAt(s, pid, s.week, productOf(pid).retail * productOf(pid).peak);

export function roundPrice(v) {
  if (v >= 100000) return Math.round(v / 1000) * 1000;
  if (v >= 10000) return Math.round(v / 100) * 100;
  return Math.max(10, Math.round(v / 10) * 10);
}

export function confidenceLabel(s) {
  const e = estimateError(s);
  if (e <= 0.08) return '高';
  if (e <= 0.18) return '中';
  return '低';
}

// 相場画面に並べる商品（発表済み・流通中のもの）
// 知らないジャンルと、まだ開拓していない仕入れ先のシリーズは相場画面に出さない
export const visibleProducts = (s) => PRODUCTS.filter((p) => isAnnounced(s, p) && (!p.imported || s.flags?.importIntro) && (!p.know || (s.certs || []).includes(`know_${p.know}`)) && (!p.spot || (s.spots || []).includes(p.spot)));
