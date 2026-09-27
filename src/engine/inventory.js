// 在庫・購入・出品の管理
import { productOf, SIZE_INFO } from '../data/products.js';
import { chance } from './rng.js';
import { addCash, hasSkill, record, yen } from './effects.js';

export const ROOM_CAPACITY = 30;
export const PLATFORMS = {
  merc: { id: 'merc', name: 'メルクリ', desc: 'フリマアプリ。手数料10%。値付け次第ですぐ売れるが、値下げ交渉とトラブルが多い' },
  auc: { id: 'auc', name: 'クリオク', desc: 'オークション。手数料10%。1週間で落札。コレクター品は競り上がりやすいが、入札ゼロもある' },
};

export function feeRate(s) {
  return hasSkill(s, 'tenka') ? 0.07 : 0.1;
}

export const listingCap = (s) => 5 + Math.floor(s.abilities.list / 10);
export const activeUnits = (s) => s.inventory.filter((u) => u.arrive <= s.week);
export const listedUnits = (s) => s.inventory.filter((u) => u.listing);
export const spaceUsed = (s) => s.inventory.reduce((sum, u) => sum + SIZE_INFO[productOf(u.pid).size].space, 0);

export function cardAvailable(s) {
  return Math.max(0, s.card.limit - s.card.current - s.card.due);
}

// 購入。支払いはポイント → 現金 or カード の順。
export function buy(s, offer, qty, method = 'cash') {
  qty = Math.max(1, Math.min(qty, offer.maxQty));
  const product = productOf(offer.pid);
  const total = offer.price * qty;
  const pointsUsed = Math.min(s.points, total);
  const rest = total - pointsUsed;
  if (method === 'card') {
    if (rest > cardAvailable(s)) return { ok: false, msg: 'カードの利用枠が足りない…' };
  } else if (rest > s.cash) {
    return { ok: false, msg: '現金が足りない…' };
  }
  s.points -= pointsUsed;
  if (method === 'card') {
    s.card.current += rest;
    record(s, `${product.name} ×${qty}（カード払い）`, 0);
    s.cardPoints += Math.floor(rest * (hasSkill(s, 'poikatsu') ? 0.02 : 0.01));
  } else {
    addCash(s, -rest, `仕入れ: ${product.name} ×${qty}`);
  }
  const earned = Math.floor(total * (offer.points || 0));
  s.points += earned;

  for (let i = 0; i < qty; i++) {
    s.inventory.push({
      uid: s.nextUid++,
      pid: offer.pid,
      cost: offer.price,
      week: s.week,
      arrive: offer.arriveWeek ?? s.week,
      used: !!product.used,
      fake: offer.fakeRate > 0 && chance(s, offer.fakeRate),
      damaged: false,
      stolen: !!offer.stolen,
      expire: product.kind === 'perishable' ? s.week + product.shelf : null,
      listing: null,
    });
  }
  s.stats.boughtUnits += qty;
  s.stats.spent += total;
  if (offer.scarce) s.stats.scarceBought += qty;
  offer.maxQty -= qty;
  const extra = earned > 0 ? `（${earned.toLocaleString()}pt獲得）` : '';
  return { ok: true, msg: `${product.name}を${qty}個仕入れた！ ${yen(total)}${extra}` };
}

export function listUnits(s, uids, platform, price) {
  const cap = listingCap(s);
  let listed = listedUnits(s).length;
  let n = 0;
  for (const uid of uids) {
    const u = s.inventory.find((x) => x.uid === uid);
    if (!u || u.arrive > s.week) continue;
    if (!u.listing && listed >= cap) break;
    if (!u.listing) listed++;
    u.listing = { platform, price: Math.round(price), week: s.week };
    n++;
  }
  return n;
}

export function unlistUnits(s, uids) {
  for (const uid of uids) {
    const u = s.inventory.find((x) => x.uid === uid);
    if (u) u.listing = null;
  }
}

export function removeUnit(s, uid) {
  s.inventory = s.inventory.filter((u) => u.uid !== uid);
}

// 在庫を「同じ商品・同じ状態・同じ出品状況」でまとめる（UI 表示用）
export function groupInventory(s) {
  const groups = new Map();
  for (const u of s.inventory) {
    const key = [u.pid, u.cost, u.arrive > s.week ? 'wait' : '', u.damaged ? 'dmg' : '', u.listing ? `${u.listing.platform}:${u.listing.price}` : ''].join('|');
    if (!groups.has(key)) groups.set(key, { key, pid: u.pid, cost: u.cost, units: [], listing: u.listing, arrive: u.arrive, damaged: u.damaged, expire: u.expire });
    groups.get(key).units.push(u);
  }
  return [...groups.values()];
}

// イベントで在庫を直接増やす（福袋など）
export function addUnits(s, pid, qty, cost, extra = {}) {
  const product = productOf(pid);
  for (let i = 0; i < qty; i++) {
    s.inventory.push({
      uid: s.nextUid++, pid, cost, week: s.week, arrive: s.week, used: !!product.used, fake: false, damaged: false, stolen: false,
      expire: product.kind === 'perishable' ? s.week + product.shelf : null, listing: null, ...extra,
    });
  }
  s.stats.boughtUnits += qty;
}
