// 仕組み化（外注・ツール）による自動処理。ここで作った仕組みが、後半の「手を動かさなくても回る」状態を支える。
import { suspicion } from './listing.js';
import { unsellable } from './regulated.js';
import { productOf, shippingCost } from '../data/products.js';
import { hasSkill } from './effects.js';
import { abroadMult, activeUnits, buy, capacity, cardAvailable, feeRate, listUnits, platformMult, platformsFor, spaceUsed } from './inventory.js';
import { SIZE_INFO } from '../data/products.js';
import { estimateUnit } from './market.js';
import { CORP_SOCIAL, LIVING_COST } from './career.js';
import { minPayment } from './finance.js';

// 在庫に合った販路：新品の量産品はアマクリ、コレクター品はミィーム、それ以外はプンシー
export function bestPlatform(s, u) {
  const p = productOf(u.pid);
  const ids = platformsFor(s, u).map((pf) => pf.id).filter((id) => !(id === 'merc' && s.banWeeks > 0) && !(id === 'ama' && s.amaBan > 0));
  if (ids.includes('exp') && (s.fx || 1) * abroadMult(s, u) >= 1.35) return 'exp'; // 国内で値崩れした品は海外へ
  if (['collect', 'luxury'].includes(p.kind) && ids.includes('auc')) return 'auc';
  if (ids.includes('ama') && ['staple', 'hype', 'seasonal', 'boom'].includes(p.kind)) return 'ama';
  if (ids.includes('black')) return 'black';
  if (ids.includes('merc')) return 'merc';
  return ids[0] || null;
}

// 相場どおりの出品先と値段（オークションは開始価格を相場の75%に）
export function marketListing(s, u) {
  if (productOf(u.pid).alcohol && s.flags.noAlcohol) return null;
  const pf = bestPlatform(s, u);
  if (!pf) return null;
  const est = estimateUnit(s, u);
  return { platform: pf, price: Math.round((pf === 'auc' ? est * 0.75 : est * 1.02) * platformMult(s, pf, u)) };
}

// 指定した在庫を、それぞれ合った販路に相場で出品する。出品できた数と、出品額の合計を返す
export function quickList(s, uids) {
  let n = 0;
  let total = 0;
  for (const uid of uids) {
    const u = s.inventory.find((x) => x.uid === uid);
    if (!u || u.listing || u.arrive > s.week) continue;
    const m = marketListing(s, u);
    if (!m) continue;
    const k = listUnits(s, [uid], m.platform, m.price);
    n += k;
    if (k) total += u.listing.price;
  }
  return { listed: n, total };
}

// 外注：撮影・出品 … 未出品の在庫を相場で出品する
export function autoList(s) {
  if (!hasSkill(s, 'out_list')) return 0;
  return quickList(s, activeUnits(s).filter((u) => !u.listing).map((u) => u.uid)).listed;
}

// 価格改定ツール … 2週以上売れていない出品を5%ずつ下げる（推定相場の85%まで）
export function autoReprice(s) {
  if (!hasSkill(s, 'price_tool')) return 0;
  let n = 0;
  for (const u of s.inventory) {
    if (!u.listing || u.listing.platform === 'auc') continue;
    if (s.week - u.listing.week < 2) continue;
    const floor = estimateUnit(s, u) * 0.85;
    const next = Math.max(floor, u.listing.price * 0.95);
    if (next < u.listing.price) {
      u.listing.price = Math.round(next);
      u.listing.week = s.week;
      n++;
    }
  }
  return n;
}

// 月末までに必要なお金（返済・カード・生活費・社会保険）
export function reserveNeeded(s) {
  return Math.min(s.debt, minPayment(s)) + s.card.due + (s.fulltime ? LIVING_COST : 0) + (s.corp ? CORP_SOCIAL : 0) + 30000;
}

// 外注：リサーチ・仕入れ … 利益率15%以上の候補を、手元資金の範囲で自動で仕入れる
export function autoBuy(s, offers) {
  const bought = [];
  // 外注に任せるのは「手元資金から、来月までの支払いを引いた残りの半分」まで
  let budgetLeft = Math.max(0, (s.cash - reserveNeeded(s) - s.card.current) * 0.5);
  for (const o of offers) {
    if (o.maxQty <= 0 || suspicion(s, o) >= 2) continue; // 怪しい手がかりが2つ以上ある出品は避ける
    const p = productOf(o.pid);
    if (p.used && !s.flags.license) continue;
    if ((p.alcohol && s.flags.noAlcohol) || unsellable(p.id)) continue; // 酒の免許なし・薬機法で売れない品は買わない
    const net = o.est * (1 - feeRate(s, 'merc')) - shippingCost(p) + o.price * (o.points || 0);
    const margin = (net - o.price) / o.price;
    if (margin < 0.15) continue;
    const budget = budgetLeft;
    const minQ = o.minQty || 1;
    const room = Math.floor((capacity(s) - spaceUsed(s)) / SIZE_INFO[p.size].space);
    let q = Math.min(o.maxQty, room, Math.floor(Math.max(0, budget) / o.price));
    let method = 'cash';
    if (q < minQ && s.card.due === 0) {
      q = Math.min(o.maxQty, room, Math.floor(cardAvailable(s) * 0.3 / o.price));
      method = 'card';
    }
    if (q < minQ) continue;
    const res = buy(s, o, q, method);
    if (res.ok) {
      bought.push(res.msg);
      if (method === 'cash') budgetLeft -= o.price * q;
    }
  }
  return bought;
}
