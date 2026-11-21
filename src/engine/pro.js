// プロの仕入れ現場の演出：業者オークションの「競り」と、問屋の「見積書」。
// どちらも通常の仕入れ候補に上乗せする分で、オート（ルーティン・ボット）は使わない
import { PRODUCTS, productOf } from '../data/products.js';
import { chance, pick, randRange } from './rng.js';
import { estimate, isReleased, priceOf, roundPrice } from './market.js';
import { knowsGenre } from './courses.js';
import { specialOffer } from './offers.js';

// ---- 競り：ロットが順番に流れ、手を挙げ続けた人が落とす。相手はプロの目利き ----
export const SERI_RIVAL = 'rival_gogh';
// 1回の札で上がる額：相場の5%くらいのきりのいい額（4〜9回の札で決まる）
const STEPS = [100, 200, 500, 1000, 2000, 5000, 10000, 20000, 50000, 100000];
export const seriStep = (market) => STEPS.filter((x) => x <= market * 0.05).pop() || 100;

export function seriLots(s, n = 2) {
  const pool = PRODUCTS.filter((p) => (['collect', 'luxury'].includes(p.kind) || (p.kind === 'hype' && isReleased(s, p))) && !p.spot && knowsGenre(s, p) && (p.retail < 100000 || s.stage >= 2));
  const lots = [];
  for (let i = 0; i < n && pool.length; i++) {
    const p = pick(s, pool);
    pool.splice(pool.indexOf(p), 1);
    const market = priceOf(s, p.id);
    const start = roundPrice(market * randRange(s, 0.35, 0.45));
    // 相手が降りる値：ふつうは相場の6〜8割。ときどき相場より上まで競る（熱くなった相手）
    const rivalMax = roundPrice(market * (chance(s, 0.15) ? randRange(s, 0.95, 1.1) : randRange(s, 0.55, 0.8)));
    lots.push({ pid: p.id, est: estimate(s, p.id), start, rivalMax, step: seriStep(market), fake: chance(s, p.fakeRisk * 0.05) });
  }
  return lots;
}

// 落札した品を仕入れ候補（1個）にする。買うのは inventory.buy で
export const seriOffer = (s, lot, price) => specialOffer(s, lot.pid, { source: 'auction', label: '競りで落札', price, maxQty: 1, fake: lot.fake });

// ---- 見積書：問屋の掛け率と最低ロットを、交渉で動かす ----
export const quoteRate = (s) => Math.min(0.85, 0.35 + s.abilities.talk / 200); // 交渉が通る確率

// kind：'rate'（掛け率を5%下げる） / 'lot'（最低ロットを半分に）。1回の商談でそれぞれ1回まで
export function negotiateQuote(s, offers, kind, roll = chance(s, quoteRate(s))) {
  if (!roll) return false;
  for (const o of offers) {
    if (o.source !== 'wholesale') continue;
    if (kind === 'rate') o.price = Math.max(10, Math.round((o.price * 0.95) / 10) * 10);
    if (kind === 'lot' && o.minQty) o.minQty = Math.max(5, Math.round(o.minQty / 2));
    o.label = `卸値でロット仕入れ（最低${o.minQty}個〜）${kind === 'rate' || o.quoted ? '・値引き済み' : ''}`;
    if (kind === 'rate') o.quoted = true;
  }
  return true;
}

// 見積書の掛け率（相場に対する卸値）
export const quoteLine = (s, o) => `${productOf(o.pid).name}：掛け率 ${Math.round((o.price / productOf(o.pid).retail) * 100)}%・最低${o.minQty}個`;
