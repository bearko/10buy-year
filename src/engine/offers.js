// 仕入れ候補（オファー）の生成。店舗・電脳・行列・抽選それぞれのルートがある。
import { PRODUCTS, productOf } from '../data/products.js';
import { chance, pick, randInt, randRange, weightedPick } from './rng.js';
import { flag, hasSkill } from './effects.js';
import { beforeRelease, estimate, estimateUpcoming, inBoom, inPreSale, isReleased, isRestockWeek, priceOf, roundPrice } from './market.js';
import { woy, yearOf } from './calendar.js';

let oidSeq = 1;
const byKind = (kind) => PRODUCTS.filter((p) => p.kind === kind);
const round10 = (v) => Math.max(10, Math.round(v / 10) * 10);

function makeOffer(s, pid, fields) {
  const product = productOf(pid);
  const offer = { oid: oidSeq++, pid, maxQty: 1, points: 0, fakeRate: 0, ...fields };
  offer.est = offer.upcoming ? estimateUpcoming(s, pid) : estimate(s, pid);
  // 目利きが高いと、偽物が混じっていそうなオファーに気づける
  offer.warn = offer.fakeRate >= 0.25 && chance(s, 0.1 + s.abilities.eye / 100 + (hasSkill(s, 'eye_fake') ? 0.3 : 0));
  offer.fakeNote = product.fakeNote;
  return offer;
}

export const hasLicense = (s) => !!flag(s, 'license');
const canUsed = (s) => hasLicense(s) && hasSkill(s, 'src_used');

// 今年の新作を予約・抽選で買うときの到着週とエディション
function upcomingFields(s, p) {
  if (!beforeRelease(s, p)) return { edition: yearOf(s.week) };
  return { upcoming: true, edition: yearOf(s.week), arriveWeek: s.week + (p.release - woy(s.week)) };
}

// ---- 店舗せどり ----
export function storeOffers(s) {
  let n = 4 + Math.floor(s.abilities.buy / 25);
  if (hasSkill(s, 'ino_map')) n += 2;
  if (hasSkill(s, 'tenka')) n += 1;
  if (hasSkill(s, 'eye_ai')) n += 2;
  const discountBoost = (s.mods?.storeDiscount ?? 0) + (hasSkill(s, 'bargain') ? 0.05 : 0);

  const gens = [
    {
      weight: 5,
      make: () => {
        const p = pick(s, byKind('staple'));
        const d = Math.min(0.7, randRange(s, 0.18, 0.55) + discountBoost + s.abilities.buy / 1000);
        return makeOffer(s, p.id, {
          source: 'store',
          label: pick(s, ['ワゴンセール', '閉店セール', '型落ち処分', '店長の気まぐれ値引き', '棚の奥で見つけた値札ミス']),
          price: round10(p.retail * (1 - d)),
          maxQty: randInt(s, 2, 4 + s.stage * 2),
        });
      },
    },
    {
      weight: 2,
      make: () => {
        const cands = byKind('hype').filter((p) => isReleased(s, p) && s.market[p.id].p > 1.1);
        if (!cands.length) return null;
        const p = pick(s, cands);
        return makeOffer(s, p.id, { source: 'store', label: '店頭在庫を発見！（お一人様1点）', price: p.retail, maxQty: 1, scarce: true });
      },
    },
    {
      weight: 1.5,
      make: () => {
        const p = byKind('boom')[0];
        const m = s.market[p.id];
        if (m.phase === 'calm') return makeOffer(s, p.id, { source: 'store', label: '雑貨屋で普通に売っている', price: p.retail, maxQty: randInt(s, 2, 6) });
        if (m.phase === 'boom') return chance(s, 0.3) ? makeOffer(s, p.id, { source: 'store', label: '奇跡の入荷直後！（お一人様1点）', price: p.retail, maxQty: 1, scarce: true }) : null;
        return makeOffer(s, p.id, { source: 'store', label: '在庫処分ワゴンに山積み', price: round10(p.retail * 0.5), maxQty: randInt(s, 3, 8) });
      },
    },
    {
      weight: 2,
      make: () => {
        const cands = byKind('seasonal').filter((p) => isReleased(s, p));
        if (!cands.length) return null;
        const p = pick(s, cands);
        const w = woy(s.week);
        if (w >= p.release && w <= p.peakWeek) return makeOffer(s, p.id, { source: 'store', label: '季節コーナーに入荷', price: p.retail, maxQty: randInt(s, 1, 3) });
        return makeOffer(s, p.id, { source: 'store', label: 'シーズン後の見切り品70%OFF', price: round10(p.retail * 0.3), maxQty: randInt(s, 1, 4) });
      },
    },
    {
      weight: canUsed(s) ? 4 : 0,
      make: () => {
        const p = weightedPick(s, [
          { id: 'novice_book', weight: 3 },
          { id: 'tsumi', weight: 0.8 },
          { id: 'taito', weight: 0.4 },
          { id: 'violin', weight: 0.4 },
          { id: 'jewel', weight: 0.4 },
        ]);
        const product = productOf(p.id);
        const mp = priceOf(s, p.id);
        if (p.id === 'novice_book') return makeOffer(s, p.id, { source: 'used', label: '古本屋の110円棚', price: pick(s, [110, 110, 220, 330]), maxQty: randInt(s, 2, 6) });
        if (p.id === 'tsumi') return makeOffer(s, p.id, { source: 'used', label: '古本屋の均一棚に紛れていた', price: pick(s, [110, 330, 550, 1100]), maxQty: 1 });
        return makeOffer(s, p.id, {
          source: 'used',
          label: 'リサイクルショップの中古品',
          price: roundPrice(mp * randRange(s, 0.3, 0.6)),
          maxQty: 1,
          fakeRate: product.fakeRisk * 0.35,
        });
      },
    },
    {
      weight: s.stage >= 2 ? 0.15 + s.abilities.buy / 400 : 0,
      make: () => makeOffer(s, 'queen_watch', { source: 'luxury', label: '正規店で「在庫がございます」…！', price: productOf('queen_watch').retail, maxQty: 1, scarce: true }),
    },
  ];
  const offers = generate(s, gens, n);
  if (!s.stats.purchases) offers.unshift(firstWagon(s));
  return offers;
}

// 初めての店舗せどりでは、わかりやすく利益の出るワゴン品を必ず1つ出す
function firstWagon(s) {
  const p = productOf('scroll');
  return makeOffer(s, p.id, { source: 'store', label: 'ワゴンセール（在庫一掃）', price: round10(p.retail * 0.6), maxQty: 3 });
}

// ---- 電脳せどり ----
export function onlineOffers(s) {
  const n = 4 + Math.floor(s.abilities.buy / 35) + (hasSkill(s, 'eye_ai') ? 2 : 0);
  const lottery = hasSkill(s, 'src_lottery');
  const pointBoost = (s.mods?.onlinePoints ?? 1) * (1 + (hasSkill(s, 'poikatsu') ? 0.4 : 0));
  const upcoming = lottery ? byKind('hype').filter((p) => beforeRelease(s, p)) : [];
  const restocked = lottery ? byKind('hype').filter((p) => isReleased(s, p) && (isRestockWeek(s, p.id) || chance(s, 0.08))) : [];
  const gens = [
    {
      weight: 4,
      make: () => {
        const p = pick(s, byKind('staple'));
        const rate = Math.min(0.4, randRange(s, 0.08, 0.22) * pointBoost);
        return makeOffer(s, p.id, { source: 'online', label: `ポイント${Math.round(rate * 100)}%還元セール`, price: p.retail, points: rate, maxQty: randInt(s, 2, 3 + s.stage * 2) });
      },
    },
    {
      weight: upcoming.length ? 3 : 0,
      make: () => {
        const p = pick(s, upcoming);
        if (!chance(s, 0.35 + s.abilities.buy / 200)) return null;
        return makeOffer(s, p.id, { source: 'preorder', label: `予約受付中！（発売週に届く）`, price: p.retail, maxQty: randInt(s, 1, 2), scarce: true, ...upcomingFields(s, p) });
      },
    },
    {
      weight: restocked.length ? 2 : 0,
      make: () => makeOffer(s, pick(s, restocked).id, { source: 'online', label: '公式通販で在庫復活！', price: 0, maxQty: 1, scarce: true }),
    },
    {
      weight: hasLicense(s) && hasSkill(s, 'src_flea') ? 2.5 : 0,
      make: () => {
        const cands = PRODUCTS.filter((p) => isReleased(s, p) && ['hype', 'collect', 'boom'].includes(p.kind));
        const p = pick(s, cands);
        return makeOffer(s, p.id, {
          source: 'flea',
          label: 'フリマで相場より安い出品',
          price: roundPrice(priceOf(s, p.id) * randRange(s, 0.68, 0.9)),
          maxQty: 1,
          fakeRate: p.fakeRisk * 0.3,
        });
      },
    },
    {
      weight: 1.5,
      make: () => {
        const cands = PRODUCTS.filter((p) => isReleased(s, p) && (p.kind === 'hype' || inBoom(s, p.id) || p.kind === 'luxury'));
        if (!cands.length) return null;
        const p = pick(s, cands);
        return makeOffer(s, p.id, {
          source: 'shady',
          label: '海外通販サイトで激安！（日本語が少しおかしい）',
          price: roundPrice(p.retail * randRange(s, 0.3, 0.5)),
          maxQty: randInt(s, 1, 5),
          fakeRate: Math.min(0.95, p.fakeRisk + 0.35),
        });
      },
    },
  ];
  const offers = generate(s, gens, n);
  for (const o of offers) if (o.price === 0) o.price = productOf(o.pid).retail;
  return offers;
}

function generate(s, gens, n) {
  const offers = [];
  const seen = new Set();
  for (let tries = 0; offers.length < n && tries < n * 6; tries++) {
    const g = weightedPick(s, gens);
    if (!g) break;
    const o = g.make();
    if (!o) continue;
    const key = `${o.pid}:${o.source}`;
    if (seen.has(key)) continue;
    seen.add(key);
    offers.push(o);
  }
  return offers;
}

// ---- 行列 ----
// 今週「並ぶ価値のある」ターゲット
export function queueTargets(s) {
  const targets = [];
  for (const p of PRODUCTS) {
    const w = woy(s.week);
    if (p.kind === 'hype' && (w === p.release || isRestockWeek(s, p.id))) targets.push({ pid: p.id, reason: w === p.release ? '発売日' : '再販日' });
    if (p.kind === 'perishable' && p.eventWeeks.includes(w)) targets.push({ pid: p.id, reason: '催事' });
    if (p.kind === 'boom' && inBoom(s, p.id)) targets.push({ pid: p.id, reason: '入荷情報' });
    if (p.kind === 'seasonal' && w === p.release) targets.push({ pid: p.id, reason: '販売開始' });
  }
  for (const pid of s.mods?.queueExtra ?? []) if (!targets.some((t) => t.pid === pid)) targets.push({ pid, reason: 'イベント限定' });
  return targets;
}

export function queueSuccessRate(s, crowd = 1) {
  let r = 0.35 + s.abilities.buy / 250 + (hasSkill(s, 'early_bird') ? 0.25 : 0) + (s.mood - 2) * 0.03;
  return Math.max(0.05, Math.min(0.95, r / crowd));
}

export function queueOffer(s, pid, qty) {
  const p = productOf(pid);
  return makeOffer(s, pid, { source: 'queue', label: '行列の末に購入権ゲット（定価）', price: p.retail, maxQty: qty, scarce: true, ...(p.kind === 'hype' ? { edition: yearOf(s.week) } : {}) });
}

// ---- 抽選 ----
export function openLotteries(s) {
  return byKind('hype').filter((p) => inPreSale(s, p));
}

export function lotteryWinRate(s, product) {
  let r = product.odds * (1 + s.abilities.buy / 100);
  if (hasSkill(s, 'lottery_nose')) r *= 1.3;
  if (flag(s, 'lotteryPenalty')) r *= 0.6;
  return Math.min(0.8, r);
}

export const lotteryEntries = (s) => 2 + Math.floor(s.abilities.buy / 30);

export function lotteryOffer(s, pid) {
  const p = productOf(pid);
  return makeOffer(s, pid, { source: 'lottery', label: '抽選に当選！（定価で購入）', price: p.retail, maxQty: 1, scarce: true, ...upcomingFields(s, p) });
}

export function giftOffer(s, pid, fields) {
  return makeOffer(s, pid, fields);
}

// ---- 業者オークション（古物商だけが参加できる市場）----
export function auctionOffers(s) {
  const n = 4 + Math.floor(s.abilities.buy / 30);
  const pool = PRODUCTS.filter((p) => ['collect', 'luxury'].includes(p.kind) || (p.kind === 'hype' && isReleased(s, p)));
  const gens = pool.map((p) => ({
    weight: p.kind === 'collect' ? 3 : 1,
    make: () => makeOffer(s, p.id, {
      source: 'auction',
      label: '業者オークションで落札できる',
      price: roundPrice(priceOf(s, p.id) * randRange(s, 0.5, 0.72)),
      maxQty: p.retail >= 100000 ? 1 : randInt(s, 2, 8),
      fakeRate: p.fakeRisk * 0.05,
    }),
  }));
  return generate(s, gens, n);
}

// ---- 問屋・メーカー直取引（定番品をロットで卸値仕入れ）----
export function wholesaleOffers(s) {
  const n = 3 + Math.floor(s.abilities.talk / 30);
  const gens = byKind('staple').filter((p) => !p.alcohol).map((p) => ({
    weight: 1,
    make: () => makeOffer(s, p.id, {
      source: 'wholesale',
      label: `卸値でロット仕入れ（最低${20}個〜）`,
      price: round10(p.retail * randRange(s, 0.62, 0.74)),
      maxQty: randInt(s, 30, 80),
      minQty: 20,
    }),
  }));
  return generate(s, gens, n);
}
