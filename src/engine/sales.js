// 週末の販売処理。出品中の在庫が売れたかどうか、発送、トラブル発生を判定する。
import { PRODUCTS, productOf, shipFor, shippingCost, SIZE_INFO } from '../data/products.js';
import { chance, gauss, poisson, randRange, weightedPick } from './rng.js';
import { addHate, addRating, addStamina, hasSkill } from './effects.js';
import { demandOf, roundPrice, unitPrice } from './market.js';
import { platformFee, platformMult, removeUnit } from './inventory.js';
import { heatFromSale } from './regimes.js';
import { onSaleDept } from './collection.js';
import { audienceFromSale, consignPayout } from './careers.js';
import { addExpense, addHours, recordSale } from './kpi.js';
import { perk } from './perks.js';

export const OUTSOURCE_SHIP_FEE = 400;

// 値付けが相場の何倍かで、1人の買い手が買ってくれる確率が決まる
export function sellChance(s, ratio) {
  let center = 1.06 + s.abilities.list / 1000;
  if (hasSkill(s, 'photogenic')) center += 0.05;
  if (hasSkill(s, 'doyou')) center += 0.12;
  center += perk(s, 'sellCenter');
  return 1 / (1 + Math.exp((ratio - center) / 0.07));
}

export const ratingFactor = (s) => 0.6 + s.rating / 125;

export function unitValue(s, u) {
  if (u.fake) return 0;
  return unitPrice(s, u);
}

// 「買い手の人数」を決めて、安い出品から順に売れるか判定する（プンシー・アマクリ共通）
function fixedPriceMarket(s, units, buyers, platform, out, allowNego, mult = 1) {
  const boost = s.listBoost ? 1.25 : 1;
  const rf = ratingFactor(s);
  for (const u of units.sort((a, b) => a.listing.price - b.listing.price)) {
    const ratio = u.listing.price / Math.max(1, unitPrice(s, u) * mult);
    if (buyers > 0 && chance(s, Math.min(0.97, sellChance(s, ratio) * Math.min(1.15, rf * boost)))) {
      buyers--;
      out.sold.push(makeSale(u, u.listing.price, platform));
    } else if (allowNego && ratio > 1.0 && ratio < 1.6 && out.negotiations.length < 2 && chance(s, 0.22)) {
      out.negotiations.push({ uid: u.uid, pid: u.pid, price: u.listing.price, offer: roundPrice(u.listing.price * randRange(s, 0.78, 0.9)) });
    }
  }
}

export function resolveSales(s) {
  const out = { sold: [], negotiations: [], troubles: [], delayed: 0, damaged: [], auctionsUnsold: [] };
  const boost = s.listBoost ? 1.25 : 1;
  const rf = ratingFactor(s);

  for (const p of PRODUCTS) {
    const units = s.inventory.filter((u) => u.pid === p.id && u.listing);
    if (!units.length) continue;
    const d = demandOf(s, p) * perk(s, 'buyers');

    // プンシー（フリマ）
    const shops = hasSkill(s, 'ch_shops') ? 1.3 : 1;
    const merc = units.filter((u) => u.listing.platform === 'merc');
    if (merc.length) fixedPriceMarket(s, merc, poisson(s, d * rf * boost * shops * (s.banWeeks > 0 ? 0 : 1)), 'merc', out, true);

    // アマクリ（大手EC）：新品の買い手が多い。値下げ交渉はない
    const ama = units.filter((u) => u.listing.platform === 'ama');
    if (ama.length) fixedPriceMarket(s, ama, poisson(s, d * 3 * rf * (s.amaBan > 0 ? 0 : 1)), 'ama', out, false);

    // 海外EC（為替で売値が変わる）と裏市場（表の数倍）
    const exp = units.filter((u) => u.listing.platform === 'exp');
    if (exp.length) fixedPriceMarket(s, exp, poisson(s, d * 0.9 * rf), 'exp', out, false, platformMult(s, 'exp'));
    const black = units.filter((u) => u.listing.platform === 'black');
    if (black.length) fixedPriceMarket(s, black, poisson(s, d * 1.5), 'black', out, false, platformMult(s, 'black'));

    // ミィーム（オークション）：入札者数で落札価格が決まる。最低落札価格に届かなければ流れる
    for (const u of units.filter((x) => x.listing.platform === 'auc')) {
      const collectBonus = p.kind === 'collect' || p.kind === 'luxury' ? 1.6 : 1;
      const bidders = poisson(s, d * 1.1 * collectBonus * rf);
      const final = roundPrice(unitPrice(s, u) * (0.8 + 0.08 * Math.min(bidders, 5)) * Math.exp(gauss(s) * 0.1) * (1 + s.abilities.list / 1000));
      if (bidders > 0 && final >= u.listing.price) {
        out.sold.push(makeSale(u, final, 'auc'));
      } else {
        out.auctionsUnsold.push({ uid: u.uid, pid: p.id, bidders });
        u.listing = null;
      }
    }
  }

  // チュートリアルで最初に出品した週：相場の1.2倍までの値付けなら、いちばん安い1つは売れる（最初の手ごたえ）
  if (!out.sold.length && !s.stats.soldUnits && !s.flags.tutorialDone) {
    const first = s.inventory
      .filter((u) => u.listing?.platform === 'merc' && u.listing.price <= unitPrice(s, u) * 1.2)
      .sort((a, b) => a.listing.price - b.listing.price)[0];
    if (first) out.sold.push(makeSale(first, first.listing.price, 'merc'));
  }

  shipAll(s, out);
  return out;
}

function makeSale(u, price, platform) {
  return { uid: u.uid, pid: u.pid, price, platform, unit: u };
}

export function shipStaminaMult(s) {
  let m = 1 - s.abilities.pack / 200;
  if (hasSkill(s, 'pack_master')) m *= 0.5;
  if (hasSkill(s, 'tendon')) m *= 1.5;
  return m * perk(s, 'shipStamina');
}

// 売れた商品の発送。体力が足りなければ発送遅延になる。倉庫（アマクリ）と外注は体力を使わない。
export function shipAll(s, out) {
  const mult = shipStaminaMult(s);
  out.staminaUsed = 0;
  let outsourced = 0;
  for (const sale of out.sold) {
    const product = productOf(sale.pid);
    if (sale.platform === 'ama') {
      // 倉庫から出荷されるので何もしなくていい
    } else if (hasSkill(s, 'out_ship')) {
      outsourced++;
    } else {
      const cost = Math.ceil(SIZE_INFO[product.size].stamina * mult);
      if (s.stamina >= cost && s.sick <= 0) {
        addStamina(s, -cost);
        addHours(s, 0.4);
        s.stats.selfShipped = (s.stats.selfShipped || 0) + 1;
        out.staminaUsed += cost;
      } else {
        out.delayed++;
        addRating(s, -2);
        sale.delayed = true;
      }
    }
    finalizeSale(s, sale, out);
  }
  if (outsourced) addExpense(s, outsourced * OUTSOURCE_SHIP_FEE * perk(s, 'outShipFee'), `外注：梱包・発送 ${outsourced}件`);
  out.outsourced = outsourced;
}

export function finalizeSale(s, sale, out) {
  const u = sale.unit;
  const product = productOf(sale.pid);
  sale.fee = platformFee(s, sale.platform, sale.price);
  sale.ship = shipFor(sale.platform, product);
  sale.net = sale.price - sale.fee - sale.ship;
  sale.cost = u.cost;
  sale.profit = sale.net - u.cost;
  consignPayout(s, sale); // 委託販売：売上金の8割は持ち主へ
  sale.id = `${s.week}-${u.uid}`;
  s.pending.push({ id: sale.id, amount: sale.net, week: s.week + 1, label: `売上金: ${product.name}` });
  removeUnit(s, u.uid);
  recordSale(s, sale);
  heatFromSale(s, sale); // 高値で売ると目立つ（いたちごっこ）
  onSaleDept(s, u); // 外商の優先案内の品は、転売するとバレることがある
  audienceFromSale(s, sale); // 顧客層が育つ

  const st = s.stats;
  st.revenue += sale.price;
  st.fees += sale.fee;
  st.shipping += sale.ship;
  st.cogs += u.cost;
  st.soldUnits++;
  if (product.used && !u.home) st.usedSold = (st.usedSold || 0) + 1;
  if (!u.home) {
    st.purchasedSold++;
    if (!st.firstFlip) st.firstFlip = { pid: sale.pid, price: sale.price, cost: u.cost, platform: sale.platform };
  }
  if (!st.bestSale || sale.profit > st.bestSale.profit) st.bestSale = { pid: sale.pid, profit: sale.profit, price: sale.price, week: s.week };
  if (product.alcohol) st.alcoholSold++;
  const bp = (st.byPid[sale.pid] ||= { n: 0, revenue: 0, profit: 0 });
  bp.n++;
  bp.revenue += sale.price;
  bp.profit += sale.profit;
  if (sale.price > product.retail * 2 && !product.used) addHate(s, 1, false);
  addRating(s, hasSkill(s, 'quick_reply') ? 0.9 : 0.6);

  // 配送破損（倉庫出荷はプロの梱包なので起きない）
  const dmgRate = hasSkill(s, 'pack_master') || hasSkill(s, 'out_ship') || sale.platform === 'ama' ? 0 : 0.03 * (1 - s.abilities.pack / 120) * (product.size === 'L' ? 2 : 1);
  if (!u.fake && chance(s, dmgRate)) {
    out?.troubles.push({ kind: 'damage', sale });
    return;
  }
  const kind = rollTrouble(s, sale);
  // チュートリアル中は、取引トラブルを週に1件まで
  if (kind && !(!s.flags.tutorialDone && out?.troubles.length)) out?.troubles.push({ kind, sale });
}

function rollTrouble(s, sale) {
  const u = sale.unit;
  if (u.fake) return chance(s, 0.85) ? 'fake' : null;
  if (u.stolen) return null;
  let rate = 0.07 * (1 - s.abilities.talk / 250);
  if (hasSkill(s, 'profile')) rate *= 0.7;
  if (hasSkill(s, 'quick_reply')) rate *= 0.85;
  if (s.rating < 30) rate *= 1.3;
  if (sale.platform === 'ama') rate *= 0.5;
  if (sale.platform === 'black') return null; // 裏の取引に「評価」はない
  rate *= perk(s, 'trouble');
  if (sale.delayed) rate += 0.15;
  if (!s.flags.tutorialDone) rate *= 0.4; // 序盤は売る流れを覚えるのが先
  if (!chance(s, rate)) return null;
  const expensive = sale.price >= 30000;
  return weightedPick(s, [
    { k: 'ghost', weight: sale.platform === 'ama' ? 0 : 3 },
    { k: 'swap', weight: expensive ? 3 : 1 },
    { k: 'claimer', weight: sale.delayed ? 4 : 2 },
    { k: 'return', weight: 1.5 },
    { k: 'bad_review', weight: 2 },
    { k: 'prank', weight: sale.platform === 'merc' ? 1 : 0 },
  ]).k;
}

// 売上を取り消す（全額返金）。受取前なら売上金は入らず、送料だけ自腹になる。
// restored: 商品が手元に戻ってくるか（戻らない＝すり替え・偽物）
export function cancelSale(s, sale, { restored = false } = {}) {
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
  s.cur.revenue -= sale.price;
  s.cur.salesProfit -= sale.profit + sale.ship + (restored ? 0 : sale.cost);
  s.cur.returns++;
}

// 一部返金
export function partialRefund(s, sale, amount) {
  const pend = s.pending.find((x) => x.id === sale.id);
  if (pend) pend.amount -= amount;
  else s.cash -= amount;
  s.stats.revenue -= amount;
  s.cur.revenue -= amount;
  s.cur.salesProfit -= amount;
}

// 返品された在庫を戻す
export function restoreUnit(s, sale, patch = {}) {
  const u = { ...sale.unit, listing: null, ...patch };
  s.inventory.push(u);
  s.stats.cogs -= u.cost;
  s.stats.soldUnits--;
  s.cur.sold--;
  return u;
}
