// 在庫・購入・出品の管理
import { productOf, SIZE_INFO } from '../data/products.js';
import { catOf } from './listing.js';
import { registerImport } from './importer.js';
import { claimable, unsellable } from './regulated.js';
import { chance } from './rng.js';
import { addCash, hasSkill, record, yen } from './effects.js';
import { yearOf } from './calendar.js';
import { nodeLv } from './abilities.js';
import { unitPrice } from './market.js';
import { perk } from './perks.js';
import { SPOT_MAP } from './pioneer.js';
import { addSaturation, markSatUsed, SAT_PER_SPOT_BUY } from './rivals.js';
import { exportBlocked, feeRegime, heatFromBuy, priceCap } from './regimes.js';
import { deptSpend } from './collection.js';
import { investSatMult } from './lifestyle.js';

export const ROOM_CAPACITY = 30;
export const PLATFORMS = {
  merc: { id: 'merc', node: 'ch_punsea', name: 'プンシー', fee: 0.1, desc: 'フリマ。手数料10%。値付け次第ですぐ売れるが、値下げ交渉とトラブルが多い' },
  auc: { id: 'auc', node: 'ch_miime', name: 'ミィーム', fee: 0.1, desc: 'オークション。手数料10%。1週間で落札。コレクター品は競り上がりやすいが、入札ゼロもある' },
  ama: { id: 'ama', node: 'ch_amacri', name: 'アマクリ', fee: 0.15, perUnit: 300, desc: '大手EC・倉庫委託。手数料15%＋納品料300円/個。新品だけ出品でき、買い手が多く発送の手間がない' },
  exp: { id: 'exp', cert: 'export', name: '海外EC', fee: 0.13, desc: '海外のECサイト。手数料13%、送料3倍。為替で売値が変わり、円安の週は高く売れる。国内で値崩れした品（型落ち・シーズン後・ブームの後）も、海の向こうでは定価近くで売れる' },
  spec: { id: 'spec', stage: 2, cats: ['sneaker', 'tcg'], name: 'ホンモノ堂', fee: 0.2, desc: 'スニーカー・トレカの専門マーケット。手数料20%。品物はいったん鑑定センターを通るので、すり替えや偽物騒ぎが起きず、買い手は安心料として相場の1割増しで買う。偽物は鑑定ではじかれて戻ってくる' },
  black: { id: 'black', underworld: true, name: '裏市場', fee: 0.2, desc: '裏のサービス。仲介料20%。表の数倍の値で売れるが、表の人間には使えない' },
};

// 海外での人気（定価に対する倍率）。和の品・日本のトレカやフィギュアは海外で高く、輸入ブランドは安い
export const ABROAD = {
  scroll: 1.15, heiho: 1.15, taito: 1.15, sylph: 1.15, old_figure: 1.15, kaeru: 1.1, retro_pc: 1.1,
  sake: 1.2, nectar: 1.2, gamaguchi: 1.2,
  kokeshi: 1.3, lacquer: 1.3, haori: 1.3, ichimatsu: 1.3, bangasa: 1.3, maiogi: 1.3, sakazuki: 1.3,
  scarf: 0.85, gentle_umbrella: 0.85, leather_wallet: 0.85,
};

// 海外の相場の倍率（為替を除く）：国内の相場が海外の相場（定価×海外での人気）を下回っていれば、その差だけ高く売れる
export function abroadMult(s, u) {
  if (!u) return 1;
  const p = productOf(u.pid);
  const ref = p.retail * (ABROAD[u.pid] ?? 1) * (u.damaged ? 0.5 : 1);
  return Math.min(2, Math.max(1, ref / Math.max(1, unitPrice(s, u))));
}

// その販路が使えるか（表の販路はスキル・資格、裏市場は裏の人間だけ）
export function platformOpen(s, pf) {
  if (s.underworld) return !!pf.underworld;
  if (pf.underworld) return false;
  if (pf.id === 'exp' && s.flags?.abroad) return true; // マルコ・ポーロの紹介
  if (pf.cert) return !!s.certs?.includes(pf.cert);
  // 専門マーケット：ステージ2から（その商材の専門家なら最初から）
  if (pf.stage) return s.stage >= pf.stage || (s.style?.type === 'spec' && pf.cats.includes(s.style.cat));
  return hasSkill(s, pf.node);
}

// 販路ごとの売値の倍率（海外ECは為替と海外の相場、裏市場は表の数倍）。u を渡すと品ごとの差も入る
export function platformMult(s, platform, u) {
  if (platform === 'exp') return (s.fx || 1) * abroadMult(s, u);
  if (platform === 'spec') return 1.1;
  if (platform === 'black') return 2.5 * (hasSkill(s, 'cap_dark') ? 1.2 : 1);
  return 1;
}

export function feeRate(s, platform = 'merc') {
  // 保護観察中（足を洗った直後）は表の販路の手数料が高い
  const base = (PLATFORMS[platform]?.fee ?? 0.1) + (s.probation > 0 && platform !== 'black' ? 0.08 : 0) + feeRegime(s, platform);
  return hasSkill(s, 'tenka') ? base - 0.03 : base;
}

export function platformFee(s, platform, price) {
  return Math.floor(price * feeRate(s, platform)) + (PLATFORMS[platform]?.perUnit || 0);
}

// その在庫を出品できる販路
export function platformsFor(s, u) {
  return Object.values(PLATFORMS).filter((pf) => {
    if (!platformOpen(s, pf)) return false;
    if (pf.id === 'ama' && (u?.used || u?.home || u?.damaged)) return false;
    if (pf.id === 'exp' && u && exportBlocked(s, u.pid)) return false; // 輸出規制
    if (u && unsellable(u.pid) && !pf.underworld) return false; // 薬機法：医薬品・高度管理医療機器は個人が売れない
    if (pf.cats && u && (!pf.cats.includes(catOf(u.pid)) || u.damaged || u.authFail)) return false; // 専門外・傷あり・鑑定NG
    return true;
  });
}

export const listingCap = (s) => 5 + Math.floor(s.abilities.list / 10) + nodeLv(s, 'slots') * 3 + (hasSkill(s, 'ch_shops') ? 5 : 0);
export const capacity = (s) => ROOM_CAPACITY + (hasSkill(s, 'warehouse') ? 60 : 0) + (hasSkill(s, 'warehouse2') ? 300 : 0) + perk(s, 'capacityAdd') + ((s.lifestyle || 0) >= 2 ? 20 : 0) + (s.secrets?.includes('logistics') ? 40 : 0); // 車のトランク・ナポレオンの奥義
export const activeUnits = (s) => s.inventory.filter((u) => u.arrive <= s.week);
export const listedUnits = (s) => s.inventory.filter((u) => u.listing);
const spaceOf = (units) => units.reduce((sum, u) => sum + SIZE_INFO[productOf(u.pid).size].space, 0);
// 届く予定の分も含めた置き場（仕入れの上限・自動仕入れの判断に使う。届いたら置く場所が要るので）
export const spaceUsed = (s) => spaceOf(s.inventory);
// いま部屋にある分だけ（予約中・輸送中の品はまだ部屋をふさいでいない）
export const roomUsed = (s) => spaceOf(activeUnits(s));
export const incomingSpace = (s) => spaceUsed(s) - roomUsed(s);
// 部屋があふれている（睡眠の回復・家族の信頼・イベントに響く）。届いていない品は数えない
export const overCapacity = (s) => roomUsed(s) > capacity(s);
// 通路や玄関まで段ボールを積んでも、これ以上は物理的に置けない
export const hardCapacity = (s) => Math.round(capacity(s) * 1.5);

export function cardAvailable(s) {
  return Math.max(0, s.card.limit + perk(s, 'cardLimitAdd') - s.card.current - s.card.due - (s.card.next || 0));
}

// カードで払う。締め日は月の第3週の終わり：月の最終週（第4週）の利用は翌月分の請求に回す
// （月末にカードで仕入れても、引き落としまで最低5週はある。engine/finance.js の monthEnd）
export function chargeCard(s, amount) {
  if (amount <= 0) return;
  if (s.week % 4 === 3) s.card.next = (s.card.next || 0) + amount;
  else s.card.current += amount;
}

function newUnit(s, pid, cost, extra) {
  const product = productOf(pid);
  return {
    uid: s.nextUid++,
    pid,
    cost,
    week: s.week,
    arrive: s.week,
    used: !!product.used,
    fake: false,
    damaged: false,
    stolen: false,
    home: false,
    edition: product.kind === 'hype' ? s.market[pid].edition || yearOf(s.week) : null,
    expire: product.kind === 'perishable' ? s.week + product.shelf : null,
    listing: null,
    ...extra,
  };
}

// 購入。支払いはポイント → 現金 or カード の順。
export function buy(s, offer, qty, method = 'cash') {
  qty = Math.max(1, Math.min(qty, offer.maxQty));
  if (offer.minQty && qty < offer.minQty) return { ok: false, msg: `最低${offer.minQty}個から` };
  const product = productOf(offer.pid);
  const need = SIZE_INFO[product.size].space * qty;
  if (spaceUsed(s) + need > hardCapacity(s)) return { ok: false, msg: '置き場所がない…（在庫スペースを増やすか、先に売ろう）' };
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
    chargeCard(s, rest);
    record(s, `${product.name} ×${qty}（カード払い）`, 0);
    s.cardPoints += Math.floor(rest * (hasSkill(s, 'poikatsu') ? 0.02 : 0.01));
  } else {
    addCash(s, -rest, `仕入れ: ${product.name} ×${qty}`);
  }
  const earned = Math.floor(total * (offer.points || 0));
  s.points += earned;
  s.stats.pointsEarned = (s.stats.pointsEarned || 0) + earned;

  const first = s.inventory.length;
  for (let i = 0; i < qty; i++) {
    s.inventory.push(newUnit(s, offer.pid, offer.price, {
      arrive: offer.arriveWeek ?? s.week,
      fake: offer.fake ?? (offer.fakeRate > 0 && chance(s, offer.fakeRate)),
      stolen: !!offer.stolen,
      ...(offer.brandNew ? { used: false } : {}), // 正規店の新品（古物ではない）
      ...(offer.edition ? { edition: offer.edition } : {}),
      ...(offer.rep ? { rep: true } : {}), // 再販版
      ...(offer.shoe ? { shoe: offer.shoe } : {}), // スニーカーのサイズ
      ...(offer.junk ? { junk: { state: offer.junk, checked: false }, used: true } : {}), // ジャンク品
      ...(offer.gaisho ? { gaisho: true } : {}), // 外商の優先案内（転売するとバレることがある）
    }));
  }
  if (offer.import) registerImport(s, offer, s.inventory.slice(first), { inspect: !!s.flags?.importInspect }); // 中国輸入：届くまでに何が起きるか
  s.stats.boughtUnits += qty;
  s.stats.purchases += qty;
  s.stats.spent += total;
  s.cur.bought += qty;
  s.cur.spent += total;
  if (offer.scarce) s.stats.scarceBought += qty;
  heatFromBuy(s, offer, qty); // 品薄品の買い占めは目立つ
  if (offer.source === 'dept' || offer.source === 'gaisho') deptSpend(s, total); // 百貨店の年間購入額
  // 開拓した仕入れ先は、買うほど荒れる
  if (SPOT_MAP[offer.source]) {
    addSaturation(s, offer.source, SAT_PER_SPOT_BUY * investSatMult(s, offer.source)); // 出資した仕入れ先は荒れにくい
    markSatUsed(s, offer.source);
  }
  offer.maxQty -= qty;
  const extra = earned > 0 ? `（${earned.toLocaleString()}pt獲得）` : '';
  return { ok: true, msg: `${product.name}を${qty}個仕入れた！ ${yen(total)}${extra}` };
}

// claim：説明文で効能をうたう（薬機法に触れる。engine/regulated.js）
export function listUnits(s, uids, platform, price, { claim = false } = {}) {
  const cap = listingCap(s);
  let listed = listedUnits(s).length;
  let n = 0;
  for (const uid of uids) {
    const u = s.inventory.find((x) => x.uid === uid);
    if (!u || u.arrive > s.week) continue;
    if (!platformsFor(s, u).some((pf) => pf.id === platform)) continue;
    if (!u.listing && listed >= cap) break;
    if (!u.listing) listed++;
    // 規制（公式リセール・不正転売禁止）の上限を超える値付けはできない
    u.listing = { platform, price: Math.round(Math.min(price, priceCap(s, u.pid, platform))), week: s.week, ...(claim && claimable(u.pid) ? { claim: true } : {}) };
    n++;
  }
  s.stats.listed = (s.stats.listed || 0) + n;
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
    const key = [u.pid, u.cost, u.edition || '', u.home ? 'home' : '', u.arrive > s.week ? 'wait' : '', u.damaged ? 'dmg' : '', u.authFail ? 'ng' : '', u.rep ? 'rep' : '', u.shoe || '', u.junk ? `junk:${u.junk.checked ? u.junk.state : '?'}` : '', u.listing ? `${u.listing.platform}:${u.listing.price}` : ''].join('|');
    if (!groups.has(key)) groups.set(key, { key, pid: u.pid, cost: u.cost, units: [], listing: u.listing, arrive: u.arrive, damaged: u.damaged, authFail: u.authFail, rep: u.rep, shoe: u.shoe, junk: u.junk, expire: u.expire, home: u.home, edition: u.edition, week: u.week });
    groups.get(key).units.push(u);
  }
  return [...groups.values()];
}

// 出品できるのに出していない在庫と、出品枠の空き（週の最後の行動の前に知らせる）
export function idleListing(s) {
  const unlisted = activeUnits(s).filter((u) => !u.listing && !(productOf(u.pid).alcohol && s.flags.noAlcohol) && platformsFor(s, u).length > 0).length;
  const free = Math.max(0, listingCap(s) - listedUnits(s).length);
  return { unlisted, free, n: Math.min(unlisted, free) };
}

// イベント・家探しで在庫を直接増やす（福袋、家の不用品など）
export function addUnits(s, pid, qty, cost, extra = {}) {
  for (let i = 0; i < qty; i++) s.inventory.push(newUnit(s, pid, cost, extra));
  if (!extra.home) s.stats.boughtUnits += qty;
}

// 買取業者に売る（損切り）。すぐ現金になるが、相場の半分以下。偽物・盗品は値がつかない
export const BUYBACK_RATE = 0.45;
export function buybackQuote(s, u) {
  if (u.fake || u.stolen || unsellable(u.pid)) return 0; // 医薬品などは買取業者も引き取らない
  return Math.floor((unitPrice(s, u) * BUYBACK_RATE) / 10) * 10;
}

export function sellToBuyer(s, uids) {
  let total = 0;
  let n = 0;
  for (const uid of uids) {
    const u = s.inventory.find((x) => x.uid === uid);
    if (!u || u.arrive > s.week) continue;
    const price = buybackQuote(s, u);
    removeUnit(s, uid);
    total += price;
    n++;
    const profit = price - u.cost;
    s.stats.revenue += price;
    s.stats.cogs += u.cost;
    s.stats.soldUnits++;
    s.cur.revenue += price;
    s.cur.salesProfit += profit;
    s.cur.sold++;
    s.cur.daysSum += Math.max(0, (s.week - u.week) * 7);
    if (profit < 0) s.cur.lossCuts++;
  }
  if (n) addCash(s, total, `買取業者へ売却（${n}個）`);
  return { n, total };
}
