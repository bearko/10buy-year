// ルーティン：「仕入れ → 出品 → 売却 → 値下げ・損切り」のサイクルを、決めたルールで毎週回す。
// 外注はお金を払って体力を使わない分、ルーティンは自分の手で回す分（出品の体力を使う）
import { productOf, shippingCost, SIZE_INFO } from '../data/products.js';
import { hasSkill } from './effects.js';
import { activeUnits, buy, capacity, cardAvailable, feeRate, listUnits, platformMult, platformsFor, sellToBuyer, spaceUsed } from './inventory.js';
import { estimateUnit } from './market.js';
import { suspicion } from './listing.js';
import { bestPlatform, reserveNeeded } from './automation.js';

export const ROUTINE_CMDS = ['store', 'online', 'auction', 'wholesale'];

export const DEFAULT_ROUTINE = {
  cmd: 'store', // 仕入れに行く行動
  minMargin: 0.15, // 見込み利益率 ◯%以上だけ買う
  budgetRate: 0.5, // 手元資金（月末の支払いを除く）の何割まで使うか
  maxQty: 3, // 1商品の最大個数
  avoidClues: 2, // 偽物の手がかりが◯個以上なら避ける
  market: 'auto', // 売り先（auto / merc / auc / ama）
  mult: 1.0, // 値付け（推定相場×）
  cutWeeks: 2, // ◯週売れなければ
  cutRate: 0.08, // ◯%値下げ（推定相場の70%まで）
  dumpWeeks: 0, // ◯週売れなければ即決買取（0 = しない）
  weeks: 4,
};

export const routineCfg = (s) => ({ ...DEFAULT_ROUTINE, ...(s.routine || {}) });

// 仕入れ：ルールに合う候補を買う
export function routineBuy(s, offers, cfg = routineCfg(s)) {
  const got = [];
  let budget = Math.max(0, (s.cash - reserveNeeded(s) - s.card.current) * cfg.budgetRate);
  for (const o of offers) {
    if (o.maxQty <= 0 || suspicion(s, o) >= cfg.avoidClues) continue;
    const p = productOf(o.pid);
    if (p.used && !s.flags.license && !o.brandNew) continue;
    if (p.alcohol && s.flags.noAlcohol) continue;
    const net = o.est * (1 - feeRate(s, 'merc')) - shippingCost(p) + o.price * (o.points || 0);
    if ((net - o.price) / o.price < cfg.minMargin) continue;
    const minQ = o.minQty || 1;
    const room = Math.floor((capacity(s) - spaceUsed(s)) / SIZE_INFO[p.size].space);
    let q = Math.min(o.maxQty, room, o.minQty ? o.maxQty : cfg.maxQty, Math.floor(budget / o.price));
    let method = 'cash';
    if (q < minQ && s.card.due === 0) {
      q = Math.min(o.maxQty, room, cfg.maxQty, Math.floor((cardAvailable(s) * 0.3) / o.price));
      method = 'card';
    }
    if (q < minQ) continue;
    const res = buy(s, o, q, method);
    if (!res.ok) continue;
    got.push({ pid: o.pid, qty: q, cost: o.price * q });
    if (method === 'cash') budget -= o.price * q;
  }
  return got;
}

// 出品：まだ出していない在庫を、決めた売り先と値付けで出す
export function routineList(s, cfg = routineCfg(s)) {
  let n = 0;
  for (const u of activeUnits(s)) {
    if (u.listing) continue;
    if (productOf(u.pid).alcohol && s.flags.noAlcohol) continue;
    const ok = platformsFor(s, u).map((x) => x.id).filter((id) => !(id === 'merc' && s.banWeeks > 0) && !(id === 'ama' && s.amaBan > 0));
    const pf = cfg.market !== 'auto' && ok.includes(cfg.market) ? cfg.market : bestPlatform(s, u);
    if (!pf) continue;
    const est = estimateUnit(s, u);
    n += listUnits(s, [u.uid], pf, Math.max(100, est * platformMult(s, pf) * cfg.mult * (pf === 'auc' ? 0.75 : 1)));
  }
  return n;
}

// 出品の体力（外注：撮影・出品があれば0）
export const routineListStamina = (s, n) => (hasSkill(s, 'out_list') ? 0 : Math.ceil(n / 3));

// 売れ残り：値下げと即決買取
export function routineStale(s, cfg = routineCfg(s)) {
  let cut = 0;
  const dumpIds = [];
  for (const u of s.inventory) {
    if (u.arrive > s.week) continue;
    if (cfg.dumpWeeks > 0 && s.week - u.week >= cfg.dumpWeeks) {
      dumpIds.push(u.uid);
      continue;
    }
    if (!u.listing || u.listing.platform === 'auc') continue;
    if (s.week - u.listing.week < cfg.cutWeeks) continue;
    const floor = estimateUnit(s, u) * 0.7;
    const next = Math.max(floor, u.listing.price * (1 - cfg.cutRate));
    if (next < u.listing.price) {
      u.listing.price = Math.round(next);
      u.listing.week = s.week;
      cut++;
    }
  }
  const dumped = dumpIds.length ? sellToBuyer(s, dumpIds) : { n: 0, total: 0 };
  return { cut, dumped: dumped.n, dumpTotal: dumped.total };
}
