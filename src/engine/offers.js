// 仕入れ候補（オファー）の生成。店舗・電脳・行列・抽選それぞれのルートがある。
import { PRODUCTS, productOf } from '../data/products.js';
import { chance, pick, randInt, randRange, weightedPick } from './rng.js';
import { flag, hasSkill } from './effects.js';
import { beforeRelease, estimate, estimateUpcoming, inBoom, inPreSale, isReleased, isRepOffer, isRestockWeek, isRetired, priceOf, REP_MULT, roundPrice } from './market.js';
import { woy, yearOf } from './calendar.js';
import { perk } from './perks.js';
import { buildListing, catOf } from './listing.js';
import { specCat } from './style.js';
import { knowsGenre, unknownGenres } from './courses.js';
import { openSpots } from './pioneer.js';
import { applySaturation, botActive, saturation } from './rivals.js';
import { lotteryRegimeMult, madeToOrder, queueLimited } from './regimes.js';
import { investPrice, investQty, investWeight } from './lifestyle.js';
import { IMPORT_WEEKS } from './importer.js';
import { isSneaker, pickSize, rollLeftover, sizeMult } from './shoes.js';
import { JUNK_PIDS, rollJunk, UNCHECKED_MULT } from './junk.js';
import { LIVE_MAP } from '../data/live.js';

let oidSeq = 1;
// 新ジャンル（know）はここでは除き、genreOffer で知っているものだけ出す。開拓先のシリーズ（spot）も除く
const byKind = (kind) => PRODUCTS.filter((p) => p.kind === kind && !p.know && !p.spot && !p.niche && !p.imported && !['med', 'device'].includes(p.reg) && !p.ownBrand);
// 定価10万円以上の高額品は、ステージ2になるまで仕入れ候補に出てこない（序盤の一攫千金を防ぐ）
const affordableTier = (s, p) => p.retail < 100000 || s.stage >= 2;
const round10 = (v) => Math.max(10, Math.round(v / 10) * 10);

function makeOffer(s, pid, fields) {
  const product = productOf(pid);
  const offer = { oid: oidSeq++, pid, maxQty: 1, points: 0, fakeRate: 0, ...fields };
  offer.rep = isRepOffer(s, product, offer); // 再販版
  // スニーカーのサイズ。売れ残りは不人気サイズが多いが、そのぶん値札も下がっている
  if (isSneaker(pid) && offer.shoe === undefined) {
    const leftover = rollLeftover(s, offer);
    offer.shoe = pickSize(s, { leftover });
    if (leftover && !offer.scarce && sizeMult(offer.shoe) < 1) offer.price = Math.max(10, Math.round((offer.price * sizeMult(offer.shoe)) / 10) * 10);
  }
  offer.est = Math.round((offer.junk ? UNCHECKED_MULT : 1) * (offer.upcoming ? estimateUpcoming(s, pid) : estimate(s, pid) * (offer.rep ? REP_MULT : 1)) * sizeMult(offer.shoe));
  // まとめ買い：数を選べる候補だけ（限定品・一点物・ロット仕入れは除く）
  if (!offer.scarce && !offer.minQty && offer.maxQty >= 2) offer.maxQty += perk(s, 'offerQty');
  // 偽物かどうかは出品の時点で決まっている。高額品ほど「巧妙な偽物」が多い
  offer.fake = offer.fakeRate > 0 && chance(s, offer.fakeRate);
  offer.clever = offer.fake && chance(s, product.retail >= 100000 ? 0.45 : 0.3);
  offer.listing = buildListing(s, offer);
  return offer;
}

// ほかの仕入れ元（百貨店・外商など）から候補を作るとき
export const specialOffer = (s, pid, fields) => makeOffer(s, pid, fields);

export const hasLicense = (s) => !!flag(s, 'license');
const canUsed = (s) => hasLicense(s) && hasSkill(s, 'src_used');

// 今年の新作を予約・抽選で買うときの到着週とエディション
function upcomingFields(s, p) {
  if (!beforeRelease(s, p)) return { edition: yearOf(s.week) };
  return { upcoming: true, edition: yearOf(s.week), arriveWeek: s.week + (p.release - woy(s.week)) };
}

// ---- 店舗せどり ----
// ふつうに店を回ったときに見つかる数（店舗巡りでは、これがルート全体に散らばる。engine/sourcing.js）
export function storeOfferCount(s) {
  let n = 4 + Math.floor(s.abilities.buy / 25);
  if (hasSkill(s, 'ino_map')) n += 2;
  if (hasSkill(s, 'tenka')) n += 1;
  if (hasSkill(s, 'eye_ai')) n += 2;
  return n + perk(s, 'storeOffers') + (s.style?.type === 'org' ? 2 : 0);
}

// trip：遠征（地元の同業者に荒らされていない店。開拓した仕入れ先は地元にしかない）
export function storeOffers(s, n = storeOfferCount(s), { trip = false } = {}) {
  const discountBoost = (s.mods?.storeDiscount ?? 0) + (hasSkill(s, 'bargain') ? 0.05 : 0) + perk(s, 'storeDiscount') + (trip ? 0.05 : 0);

  const gens = [
    {
      weight: 5,
      make: () => {
        const p = pick(s, byKind('staple').filter((x) => isReleased(s, x)));
        const d = Math.min(0.7, randRange(s, 0.18, 0.55) + discountBoost + s.abilities.buy / 1000);
        return makeOffer(s, p.id, {
          source: 'store',
          label: isRetired(s, p) ? '旧型の在庫処分' : pick(s, ['ワゴンセール', '閉店セール', '型落ち処分', '店長の気まぐれ値引き', '棚の奥で見つけた値札ミス']),
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
        ].filter((x) => affordableTier(s, productOf(x.id))));
        const product = productOf(p.id);
        const mp = priceOf(s, p.id);
        if (p.id === 'novice_book') return makeOffer(s, p.id, { source: 'used', label: '古本屋の110円棚', price: pick(s, [110, 110, 220, 330]), maxQty: randInt(s, 2, 6) });
        if (p.id === 'tsumi') return makeOffer(s, p.id, { source: 'used', label: '古本屋の均一棚に紛れていた', price: pick(s, [110, 330, 550, 1100]), maxQty: 1 });
        return makeOffer(s, p.id, {
          source: 'used',
          label: 'リサイクルショップの中古品',
          price: roundPrice(mp * randRange(s, 0.3, 0.6) * perk(s, 'usedPrice')),
          maxQty: 1,
          fakeRate: product.fakeRisk * 0.35,
        });
      },
    },
    {
      weight: s.stage >= 2 ? 0.15 + s.abilities.buy / 400 : 0,
      make: () => makeOffer(s, 'queen_watch', { source: 'luxury', label: '正規店で「在庫がございます」…！', price: productOf('queen_watch').retail, maxQty: 1, scarce: true }),
    },
    {
      // テレビで見た憧れの品。定価で並んでいるが、序盤の資金とカードの枠では手が届かない
      weight: flag(s, 'dreamJewel') !== undefined && s.stage <= 2 ? 0.6 : 0,
      make: () => makeOffer(s, 'jewel', { source: 'luxury', label: 'ショーウィンドウの憧れの品', price: productOf('jewel').retail, maxQty: 1, scarce: true, brandNew: true }),
    },
  ];
  // ジャンクかご：動作未確認の電子機器（買って動作確認・修理するまで中身はわからない。engine/junk.js）
  gens.push({
    weight: canUsed(s) ? 1.5 : 0,
    make: () => {
      const cands = JUNK_PIDS.map(productOf).filter((p) => isReleased(s, p) && affordableTier(s, p) && knowsGenre(s, p));
      if (!cands.length) return null;
      const p = pick(s, cands);
      return makeOffer(s, p.id, { source: 'used', label: 'ジャンクかご（動作未確認）', price: round10(priceOf(s, p.id) * randRange(s, 0.1, 0.2)), maxQty: 1, junk: rollJunk(s) });
    },
  });
  gens.push(genreGen(s, 'used', 0.6, 0.85), ...(trip ? [] : spotGens(s, 'store')), nicheGen(s, 'store', ['pretty_set', 'bonsai', 'haori']));
  const offers = trip ? generate(s, gens, n) : applySaturation(s, generate(s, gens, n), 'store');
  // ドラッグストアの見切り品：医薬品・カラコンは安いが、個人は転売できない（engine/regulated.js）。
  // ふつうの候補の枠は使わず、ときどき余分に並ぶ
  if (s.week >= 6 && chance(s, 0.3)) {
    const p = productOf(pick(s, ['kanpo', 'colorcon']));
    offers.push(makeOffer(s, p.id, { source: 'store', label: pick(s, ['使用期限が近い品の見切り', '箱つぶれ品の処分']), price: round10(p.retail * randRange(s, 0.35, 0.5)), maxQty: randInt(s, 3, 8) }));
  }
  if (!s.stats.purchases) offers.unshift(firstWagon(s));
  liveOffer(s, offers, 'store', 0.6);
  return withUnknown(s, withSpec(s, offers, 'store'));
}

// 初めての店舗せどりでは、わかりやすく利益の出るワゴン品を必ず1つ出す
function firstWagon(s) {
  const p = productOf('scroll');
  return makeOffer(s, p.id, { source: 'store', label: 'ワゴンセール（在庫一掃）', price: round10(p.retail * 0.6), maxQty: 3, first: true });
}

// ---- 電脳せどり ----
export function onlineOffers(s) {
  const n = 4 + Math.floor(s.abilities.buy / 35) + (hasSkill(s, 'eye_ai') ? 2 : 0) + perk(s, 'onlineOffers') + (s.style?.type === 'org' ? 2 : 0);
  const lottery = hasSkill(s, 'src_lottery');
  const pointBoost = (s.mods?.onlinePoints ?? 1) * (1 + (hasSkill(s, 'poikatsu') ? 0.4 : 0)) * perk(s, 'pointsMult');
  const upcoming = lottery ? byKind('hype').filter((p) => beforeRelease(s, p)) : [];
  // 転売ボット（ライバル）が動いている間は、在庫復活に気づけない
  const restocked = lottery && !botActive(s) ? byKind('hype').filter((p) => isReleased(s, p) && (isRestockWeek(s, p.id) || chance(s, 0.08))) : [];
  const gens = [
    {
      weight: 4,
      make: () => {
        const p = pick(s, byKind('staple').filter((x) => isReleased(s, x)));
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
        const cands = PRODUCTS.filter((p) => isReleased(s, p) && ['hype', 'collect', 'boom'].includes(p.kind) && affordableTier(s, p) && knowsGenre(s, p));
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
        const cands = PRODUCTS.filter((p) => isReleased(s, p) && (p.kind === 'hype' || inBoom(s, p.id) || p.kind === 'luxury') && affordableTier(s, p) && knowsGenre(s, p));
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
  // バラパックのまとめ売り：安いものは、たいてい当たりを抜いた「サーチ済み」
  gens.push({
    weight: hasLicense(s) && hasSkill(s, 'src_flea') ? 1.2 : 0,
    make: () => makeOffer(s, 'packs', { source: 'flea', label: 'バラパックまとめ売り（未開封）', price: roundPrice(priceOf(s, 'packs') * randRange(s, 0.5, 0.75)), maxQty: randInt(s, 1, 3), fakeRate: 0.6 }),
  });
  gens.push(genreGen(s, 'flea', 0.65, 0.9), ...spotGens(s, 'online'), nicheGen(s, 'online', ['dream_set', 'cyber_staff', 'star_globe']));
  const offers = applySaturation(s, generate(s, gens, n), 'online');
  for (const o of offers) if (o.price === 0) o.price = productOf(o.pid).retail;
  liveOffer(s, offers, 'online', 0.5);
  return withUnknown(s, withSpec(s, offers, 'online'));
}

// 期間限定フェア（data/live.js）の品：フェアの間だけ、ふつうの候補とは別に定価で並ぶ。
// フェアがないときは乱数を使わない（デイリー・週替わりチャレンジの展開を変えない）
function liveOffer(s, offers, source, rate) {
  const ev = s.live && LIVE_MAP[s.live.id];
  if (!ev || !chance(s, rate)) return;
  const p = productOf(ev.pid);
  offers.push(makeOffer(s, p.id, { source, label: `${ev.name}の限定品（お一人様3点まで）`, price: p.retail, maxQty: 3, scarce: true, live: true }));
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
    if (p.kind === 'hype' && !madeToOrder(s, p.id) && (w === p.release || isRestockWeek(s, p.id))) targets.push({ pid: p.id, reason: w === p.release ? '発売日' : '再販日' });
    if (p.kind === 'perishable' && p.eventWeeks.includes(w)) targets.push({ pid: p.id, reason: '催事' });
    if (p.kind === 'boom' && inBoom(s, p.id)) targets.push({ pid: p.id, reason: '入荷情報' });
    if (p.kind === 'seasonal' && w === p.release) targets.push({ pid: p.id, reason: '販売開始' });
  }
  for (const pid of s.mods?.queueExtra ?? []) if (!targets.some((t) => t.pid === pid)) targets.push({ pid, reason: 'イベント限定' });
  return targets;
}

export function queueSuccessRate(s, crowd = 1) {
  let r = 0.35 + s.abilities.buy / 250 + (hasSkill(s, 'early_bird') ? 0.25 : 0) + (hasSkill(s, 'dk_crew') || s.style?.type === 'org' ? 0.3 : 0) + (s.mood - 2) * 0.03;
  if (queueLimited(s)) r *= 0.8; // 購入制限（会員証の確認で列が進まない）
  return Math.max(0.05, Math.min(0.95, r / crowd));
}

export function queueOffer(s, pid, qty) {
  const p = productOf(pid);
  return makeOffer(s, pid, { source: 'queue', label: '行列の末に購入権ゲット（定価）', price: p.retail, maxQty: qty, scarce: true, ...(p.kind === 'hype' ? { edition: yearOf(s.week) } : {}) });
}

// ---- 抽選 ----
export function openLotteries(s) {
  return byKind('hype').filter((p) => inPreSale(s, p) && !madeToOrder(s, p.id)); // 受注生産なら抽選はない
}

export function lotteryWinRate(s, product) {
  let r = product.odds * (1 + s.abilities.buy / 100);
  if (hasSkill(s, 'lottery_nose')) r *= 1.3;
  if (flag(s, 'lotteryPenalty')) r *= 0.6;
  r *= perk(s, 'lotteryMult');
  if (botActive(s)) r *= 0.6; // ライバルの転売ボット
  r *= lotteryRegimeMult(s); // 抽選の本人確認（会員ランクで戻る）
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
// exclude：同じ回の競りにかかった品（一覧には出さない）
export function auctionOffers(s, { exclude = null } = {}) {
  const n = 4 + Math.floor(s.abilities.buy / 30);
  const pool = PRODUCTS.filter((p) => (['collect', 'luxury'].includes(p.kind) || (p.kind === 'hype' && isReleased(s, p))) && affordableTier(s, p) && knowsGenre(s, p) && !p.spot && !exclude?.has(p.id));
  const gens = pool.map((p) => ({
    weight: p.kind === 'collect' ? 3 : 1,
    make: () => makeOffer(s, p.id, {
      source: 'auction',
      label: '業者オークションで落札できる',
      price: roundPrice(priceOf(s, p.id) * randRange(s, 0.5, 0.72) * perk(s, 'usedPrice')),
      maxQty: p.retail >= 100000 ? 1 : randInt(s, 2, 8),
      fakeRate: p.fakeRisk * 0.05,
    }),
  }));
  gens.push(...spotGens(s, 'auction'));
  return applySaturation(s, generate(s, gens, n), 'auction');
}

// ---- 問屋・メーカー直取引（定番品をロットで卸値仕入れ）----
export function wholesaleOffers(s) {
  const n = 3 + Math.floor(s.abilities.talk / 30);
  const gens = byKind('staple').filter((p) => !p.alcohol && isReleased(s, p) && !isRetired(s, p)).map((p) => ({
    weight: 1,
    make: () => makeOffer(s, p.id, {
      source: 'wholesale',
      label: `卸値でロット仕入れ（最低${20}個〜）`,
      price: round10(p.retail * randRange(s, 0.62, 0.74)),
      maxQty: randInt(s, 30, 80),
      minQty: 20,
    }),
  }));
  gens.push(...spotGens(s, 'wholesale'));
  return applySaturation(s, generate(s, gens, n), 'wholesale');
}

// ---- 自社製品（エジソンの奥義）：工場に発注する。競合がいないので荒れない ----
export const OEM_WEEKS = 4;
export function oemOffers(s) {
  const p = productOf('own_brand');
  return [makeOffer(s, p.id, { source: 'oem', label: `工場に発注（最低30個・${OEM_WEEKS}週後に納品）`, price: round10(p.retail * 0.28), maxQty: 300, minQty: 30, arriveWeek: s.week + OEM_WEEKS })];
}

// ---- 中国輸入（ノーブランド品をロットで。仕入れ値は為替しだい、届くのは3週後）----
export function importOffers(s) {
  const fx = s.fx || 1.1;
  const n = 3 + Math.floor(s.abilities.eye / 40);
  const gens = PRODUCTS.filter((p) => p.imported).map((p) => ({
    weight: 2,
    make: () => makeOffer(s, p.id, {
      source: 'import',
      label: `工場直送・最低10個（${IMPORT_WEEKS}週後に到着）`,
      price: round10(p.retail * randRange(s, 0.22, 0.32) * fx),
      maxQty: randInt(s, 30, 100),
      minQty: 10,
      arriveWeek: s.week + IMPORT_WEEKS,
      import: true,
    }),
  }));
  // 人気品の激安コピー（税関でほぼ没収される）
  gens.push({
    weight: 1,
    make: () => {
      const p = pick(s, PRODUCTS.filter((x) => ['kaeru', 'boots', 'scroll', 'cyber_staff'].includes(x.id)));
      return makeOffer(s, p.id, {
        source: 'import',
        label: `激安！人気モデル同等品・最低10個（${IMPORT_WEEKS}週後に到着）`,
        price: round10(p.retail * randRange(s, 0.12, 0.2) * fx),
        maxQty: randInt(s, 20, 60),
        minQty: 10,
        arriveWeek: s.week + IMPORT_WEEKS,
        import: true,
        knockoff: true,
        fakeRate: 1,
      });
    },
  });
  return generate(s, gens, n);
}

// ---- 美容・ガジェット・インバウンドの品（顧客層を育てる。engine/careers.js）。一般の品ぞろえとは別枠 ----
function nicheGen(s, source, ids) {
  return {
    weight: 1.2,
    make: () => {
      const p = productOf(pick(s, ids));
      if (p.used && !canUsed(s)) return null;
      const price = p.used ? roundPrice(priceOf(s, p.id) * randRange(s, 0.45, 0.65)) : round10(p.retail * (1 - randRange(s, 0.15, 0.4)));
      return makeOffer(s, p.id, { source: p.used ? 'used' : source, label: p.used ? 'リサイクルショップの掘り出し物' : source === 'store' ? 'ドラッグストア・雑貨店のセール' : 'ネットのタイムセール', price, maxQty: p.used ? 1 : randInt(s, 2, 5), fakeRate: p.used ? p.fakeRisk * 0.35 : 0 });
    },
  };
}

// ---- 開拓した仕入れ先（engine/pioneer.js）。そこでしか出会えないシリーズが並ぶ ----
function spotGens(s, route) {
  return openSpots(s, route).map((sp) => ({
    weight: 1.5 * (1 - saturation(s, sp.id) / 150) * investWeight(s, sp.id), // 荒れた仕入れ先は品が減る。出資すると増える
    make: () => {
      const p = productOf(sp.pid);
      return makeOffer(s, p.id, {
        source: sp.id,
        label: `${sp.name}で仕入れ${sp.minQty ? `（最低${sp.minQty}個〜）` : ''}`,
        price: roundPrice(priceOf(s, p.id) * randRange(s, sp.ratio[0], sp.ratio[1]) * (p.used ? perk(s, 'usedPrice') : 1) * investPrice(s, sp.id)),
        maxQty: Math.round(randInt(s, sp.qty[0], sp.qty[1]) * investQty(s, sp.id)),
        ...(sp.minQty ? { minQty: sp.minQty } : {}),
        fakeRate: p.fakeRisk * 0.15,
      });
    },
  }));
}

// ---- ステージ3以降の新ジャンル ----
function genreGen(s, source, lo, hi) {
  const known = PRODUCTS.filter((p) => p.know && knowsGenre(s, p));
  return {
    weight: known.length ? 2 : 0,
    make: () => {
      const p = pick(s, known);
      return makeOffer(s, p.id, {
        source,
        label: source === 'used' ? 'リサイクルショップの掘り出し物' : 'フリマで相場より安い出品',
        price: roundPrice(priceOf(s, p.id) * randRange(s, lo, hi)),
        maxQty: 1,
        fakeRate: p.fakeRisk * 0.35,
      });
    },
  };
}

// 知らないジャンルが並んでいることだけ見せる（買えない）
// 商材特化：専門の仕入れ先から掘り出し物が回ってくる（高級品は除く）
function withSpec(s, offers, source) {
  const cat = specCat(s);
  if (!cat) return offers;
  const pool = PRODUCTS.filter((p) => catOf(p.id) === cat && isReleased(s, p) && !p.spot && !p.know && p.kind !== 'luxury');
  for (let i = 0; i < 2 && pool.length; i++) {
    const p = pick(s, pool);
    offers.push(makeOffer(s, p.id, { source, label: '専門のつながりで回ってきた品', price: roundPrice(priceOf(s, p.id) * randRange(s, 0.8, 0.9)), maxQty: 1, fakeRate: p.fakeRisk * 0.2 }));
  }
  return offers;
}

function withUnknown(s, offers) {
  const unk = unknownGenres(s);
  if (!unk.length || !chance(s, 0.6)) return offers;
  const [g, name] = pick(s, unk);
  offers.push({ oid: oidSeq++, unknown: true, genreName: name, know: g, pid: 'novice_book', price: 0, est: 0, maxQty: 0, label: '未知のジャンル' });
  return offers;
}
