// 週末の販売処理。出品中の在庫が売れたかどうか、発送、トラブル発生を判定する。
import { PRODUCTS, productOf, shippingCost, SIZE_INFO } from '../data/products.js';
import { chance, gauss, poisson, randRange, weightedPick } from './rng.js';
import { addHate, addRating, addStamina, hasSkill } from './effects.js';
import { demandOf, priceOf, roundPrice } from './market.js';
import { feeRate, removeUnit } from './inventory.js';

// 値付けが相場の何倍かで、1人の買い手が買ってくれる確率が決まる
export function sellChance(s, ratio) {
  let center = 1.06 + s.abilities.list / 1000;
  if (hasSkill(s, 'photogenic')) center += 0.05;
  if (hasSkill(s, 'doyou')) center += 0.12;
  return 1 / (1 + Math.exp((ratio - center) / 0.07));
}

export const ratingFactor = (s) => 0.6 + s.rating / 125;

export function unitValue(s, u) {
  if (u.fake) return 0;
  const v = priceOf(s, u.pid);
  return u.damaged ? v * 0.5 : v;
}

export function resolveSales(s) {
  const out = { sold: [], negotiations: [], troubles: [], delayed: 0, damaged: [], auctionsUnsold: [] };
  const boost = s.listBoost ? 1.25 : 1;
  const rf = ratingFactor(s);

  for (const p of PRODUCTS) {
    const units = s.inventory.filter((u) => u.pid === p.id && u.listing);
    if (!units.length) continue;
    const market = priceOf(s, p.id);

    // メルクリ：買い手の人数（上限）を決め、安い出品から順に判定
    const merc = units.filter((u) => u.listing.platform === 'merc').sort((a, b) => a.listing.price - b.listing.price);
    let buyers = poisson(s, demandOf(s, p) * rf * boost * (s.banWeeks > 0 ? 0 : 1));
    for (const u of merc) {
      const value = u.damaged ? market * 0.5 : market;
      const ratio = u.listing.price / Math.max(1, value);
      if (buyers > 0 && chance(s, Math.min(0.97, sellChance(s, ratio) * Math.min(1.15, rf * boost)))) {
        buyers--;
        out.sold.push(makeSale(s, u, u.listing.price, 'merc'));
      } else if (ratio > 1.0 && ratio < 1.6 && out.negotiations.length < 2 && chance(s, 0.22)) {
        out.negotiations.push({ uid: u.uid, pid: p.id, price: u.listing.price, offer: roundPrice(u.listing.price * randRange(s, 0.78, 0.9)) });
      }
    }

    // クリオク：入札者数で落札価格が決まる。最低落札価格に届かなければ流れる
    for (const u of units.filter((x) => x.listing.platform === 'auc')) {
      const collectBonus = p.kind === 'collect' || p.kind === 'luxury' ? 1.6 : 1;
      const bidders = poisson(s, demandOf(s, p) * 1.1 * collectBonus * rf);
      const value = u.damaged ? market * 0.5 : market;
      const final = roundPrice(value * (0.8 + 0.08 * Math.min(bidders, 5)) * Math.exp(gauss(s) * 0.1) * (1 + s.abilities.list / 1000));
      if (bidders > 0 && final >= u.listing.price) {
        out.sold.push(makeSale(s, u, final, 'auc'));
      } else {
        out.auctionsUnsold.push({ uid: u.uid, pid: p.id, bidders });
        u.listing = null;
      }
    }
  }

  shipAll(s, out);
  return out;
}

function makeSale(s, u, price, platform) {
  return { uid: u.uid, pid: u.pid, price, platform, unit: u };
}

// 売れた商品の発送。体力が足りなければ発送遅延になる。
export function shipAll(s, out) {
  let staminaMult = 1 - s.abilities.pack / 200;
  if (hasSkill(s, 'pack_master')) staminaMult *= 0.5;
  if (hasSkill(s, 'tendon')) staminaMult *= 1.5;
  out.staminaUsed = 0;
  for (const sale of out.sold) {
    const product = productOf(sale.pid);
    const cost = Math.ceil(SIZE_INFO[product.size].stamina * staminaMult);
    if (s.stamina >= cost && s.sick <= 0) {
      addStamina(s, -cost);
      out.staminaUsed += cost;
    } else {
      out.delayed++;
      addRating(s, -2);
      sale.delayed = true;
    }
    finalizeSale(s, sale, out);
  }
}

export function finalizeSale(s, sale, out) {
  const u = sale.unit;
  const product = productOf(sale.pid);
  sale.fee = Math.floor(sale.price * feeRate(s));
  sale.ship = shippingCost(product);
  sale.net = sale.price - sale.fee - sale.ship;
  sale.cost = u.cost;
  sale.profit = sale.net - u.cost;
  sale.id = `${s.week}-${u.uid}`;
  s.pending.push({ id: sale.id, amount: sale.net, week: s.week + 1, label: `売上金: ${product.name}` });
  removeUnit(s, u.uid);

  const st = s.stats;
  st.revenue += sale.price;
  st.fees += sale.fee;
  st.shipping += sale.ship;
  st.cogs += u.cost;
  st.soldUnits++;
  if (!st.bestSale || sale.profit > st.bestSale.profit) st.bestSale = { pid: sale.pid, profit: sale.profit, price: sale.price, week: s.week };
  if (product.alcohol) st.alcoholSold++;
  const bp = (st.byPid[sale.pid] ||= { n: 0, revenue: 0, profit: 0 });
  bp.n++;
  bp.revenue += sale.price;
  bp.profit += sale.profit;
  if (sale.price > product.retail * 2 && !product.used) addHate(s, 1);
  addRating(s, hasSkill(s, 'quick_reply') ? 0.9 : 0.6);

  // 配送破損
  const dmgRate = hasSkill(s, 'pack_master') ? 0 : 0.03 * (1 - s.abilities.pack / 120) * (product.size === 'L' ? 2 : 1);
  if (!u.fake && chance(s, dmgRate)) {
    out?.troubles.push({ kind: 'damage', sale });
    return;
  }
  const kind = rollTrouble(s, sale);
  if (kind) out?.troubles.push({ kind, sale });
}

function rollTrouble(s, sale) {
  const u = sale.unit;
  if (u.fake) return chance(s, 0.85) ? 'fake' : null;
  if (u.stolen) return null;
  let rate = 0.07 * (1 - s.abilities.talk / 250);
  if (hasSkill(s, 'profile')) rate *= 0.7;
  if (hasSkill(s, 'quick_reply')) rate *= 0.85;
  if (s.rating < 30) rate *= 1.3;
  if (sale.delayed) rate += 0.15;
  if (!chance(s, rate)) return null;
  const expensive = sale.price >= 30000;
  return weightedPick(s, [
    { k: 'ghost', weight: 3 },
    { k: 'swap', weight: expensive ? 3 : 1 },
    { k: 'claimer', weight: sale.delayed ? 4 : 2 },
    { k: 'return', weight: 1.5 },
    { k: 'bad_review', weight: 2 },
    { k: 'prank', weight: 1 },
  ]).k;
}

// 売上を取り消す（全額返金）。受取前なら売上金は入らず、送料だけ自腹になる。
export function cancelSale(s, sale) {
  const idx = s.pending.findIndex((x) => x.id === sale.id);
  if (idx >= 0) {
    s.pending.splice(idx, 1);
    s.cash -= sale.ship;
  } else {
    s.cash -= sale.net;
  }
  s.stats.revenue -= sale.price;
  s.stats.fees -= sale.fee;
  s.stats.refunds++;
}

// 一部返金
export function partialRefund(s, sale, amount) {
  const pend = s.pending.find((x) => x.id === sale.id);
  if (pend) pend.amount -= amount;
  else s.cash -= amount;
  s.stats.revenue -= amount;
}

// 返品された在庫を戻す
export function restoreUnit(s, sale, patch = {}) {
  const u = { ...sale.unit, listing: null, ...patch };
  s.inventory.push(u);
  s.stats.cogs -= u.cost;
  s.stats.soldUnits--;
  return u;
}
