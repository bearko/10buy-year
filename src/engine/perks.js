// スキルツリーの「ルート熟練度」「到達点（キャップストーン）」「記録パネル」の効果をまとめて引く。
// エンジンの各所は perk(s, key) を呼ぶだけでよい。
import { ROUTE_LEVELS, SKILL_MAP, SKILLS } from '../data/skills.js';

// 熟練度に数えないノード（中心・初期・チュートリアルでもらったもの）
const NOT_COUNTED = new Set(['root', 'initial', 'starter', 'red']);

export function routeCounts(s) {
  const counts = {};
  for (const id of s.skills) {
    const sk = SKILL_MAP[id];
    if (!sk?.route || NOT_COUNTED.has(sk.kind)) continue;
    counts[sk.route] = (counts[sk.route] || 0) + 1;
  }
  for (const [id, lv] of Object.entries(s.nodeLv || {})) {
    const sk = SKILL_MAP[id];
    if (sk?.route && lv > 0) counts[sk.route] = (counts[sk.route] || 0) + 1;
  }
  return counts;
}

export function routeLevel(s, route) {
  const n = routeCounts(s)[route] || 0;
  return ROUTE_LEVELS.filter((t) => n >= t).length;
}

// いちばん伸ばしているルート（同数なら先に伸ばした方ではなく、定義順）
export function mainRoutes(s) {
  return Object.entries(routeCounts(s))
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([r]) => r);
}

// [効果キー, 値, 条件] の一覧。加算（add）と乗算（mul）がある
const ROUTE_PERKS = {
  store: [{ lv: 1, key: 'storeOffers', add: 1 }, { lv: 2, key: 'storeStamina', mul: 0.85 }],
  online: [{ lv: 1, key: 'onlineOffers', add: 1 }, { lv: 2, key: 'pointsMult', mul: 1.2 }],
  vintage: [{ lv: 1, key: 'estErr', mul: 0.9 }, { lv: 2, key: 'fakeDetect', add: 0.2 }],
  sales: [{ lv: 1, key: 'sellCenter', add: 0.02 }, { lv: 2, key: 'buyers', mul: 1.1 }],
  system: [{ lv: 1, key: 'shipStamina', mul: 0.9 }, { lv: 2, key: 'monthlyFees', mul: 0.85 }],
  network: [{ lv: 1, key: 'trouble', mul: 0.9 }, { lv: 2, key: 'talkCheck', add: 0.1 }],
  manage: [{ lv: 1, key: 'expGain', mul: 1.05 }, { lv: 2, key: 'taxMult', mul: 0.9 }],
};

const NODE_PERKS = {
  cap_store: [{ key: 'storeOffers', add: 2 }, { key: 'storeDiscount', add: 0.05 }, { key: 'storeStamina', mul: 0.8 }],
  cap_online: [{ key: 'onlineOffers', add: 2 }, { key: 'pointsMult', mul: 1.3 }, { key: 'lotteryMult', mul: 1.2 }],
  cap_vintage: [{ key: 'fakeDetect', add: 1 }, { key: 'usedPrice', mul: 0.92 }],
  cap_sales: [{ key: 'sellCenter', add: 0.06 }, { key: 'buyers', mul: 1.2 }],
  cap_system: [{ key: 'monthlyFees', mul: 0.6 }, { key: 'outShipFee', mul: 0.5 }, { key: 'capacityAdd', add: 100 }],
  cap_network: [{ key: 'trouble', mul: 0.5 }, { key: 'talkCheck', add: 0.2 }],
  cap_manage: [{ key: 'taxMult', mul: 0.85 }, { key: 'cardLimitAdd', add: 1000000 }, { key: 'expGain', mul: 1.1 }],
  rec_walker: [{ key: 'storeStamina', mul: 0.9 }],
  rec_points: [{ key: 'pointsMult', mul: 1.1 }],
  rec_appraiser: [{ key: 'estErr', mul: 0.9 }],
  rec_seller: [{ key: 'buyers', mul: 1.1 }],
  rec_post: [{ key: 'shipStamina', mul: 0.85 }],
  rec_network: [{ key: 'trouble', mul: 0.9 }],
  rec_manage: [{ key: 'expGain', mul: 1.1 }],
  tr_fair: [{ key: 'trouble', mul: 0.9 }, { key: 'buyers', mul: 1.05 }],
  tr_agent: [{ key: 'buyers', mul: 1.1 }, { key: 'sellCenter', add: 0.02 }],
  tr_credit: [{ key: 'cardLimitAdd', add: 2000000 }, { key: 'taxMult', mul: 0.95 }],
  tr_staff: [{ key: 'monthlyFees', mul: 0.85 }, { key: 'expGain', mul: 1.1 }],
  tr_maker: [{ key: 'storeOffers', add: 2 }, { key: 'onlineOffers', add: 2 }],
  cap_trade: [{ key: 'buyers', mul: 1.2 }],
  dk_bot: [{ key: 'lotteryMult', mul: 1.5 }, { key: 'onlineOffers', add: 2 }],
  dk_crew: [{ key: 'storeOffers', add: 2 }],
  dk_names: [{ key: 'lotteryMult', mul: 1.5 }],
  dk_stolen: [{ key: 'usedPrice', mul: 0.7 }],
  cashflow: [{ key: 'cardLimitAdd', add: 300000 }, { key: 'taxMult', mul: 0.95 }],
};

const PER_LV = Object.fromEntries(SKILLS.filter((x) => x.perLv).map((x) => [x.id, x.perLv]));

const MUL_DEFAULT = new Set(['storeStamina', 'pointsMult', 'estErr', 'buyers', 'shipStamina', 'monthlyFees', 'trouble', 'expGain', 'taxMult', 'lotteryMult', 'usedPrice', 'outShipFee']);

// 所有ノードが変わったときだけ計算し直す
const cache = new WeakMap();
const signature = (s) => `${(s.certs || []).length}:${s.skills.length}:${s.skills[s.skills.length - 1]}:${Object.values(s.nodeLv || {}).reduce((a, n) => a + n, 0)}`;

export function perk(s, key) {
  const sig = signature(s);
  let c = cache.get(s);
  if (!c || c.sig !== sig) {
    c = { sig, vals: new Map() };
    cache.set(s, c);
  }
  if (!c.vals.has(key)) c.vals.set(key, computePerk(s, key));
  return c.vals.get(key);
}

function computePerk(s, key) {
  let v = MUL_DEFAULT.has(key) ? 1 : 0;
  const apply = (e) => {
    if (e.key !== key) return;
    if (e.mul !== undefined) v *= e.mul;
    else v += e.add;
  };
  for (const [route, list] of Object.entries(ROUTE_PERKS)) {
    const lv = routeLevel(s, route);
    for (const e of list) if (lv >= e.lv) apply(e);
  }
  for (const id of s.skills) for (const e of NODE_PERKS[id] || []) apply(e);
  if (s.certs?.includes('boki') && key === 'taxMult') v *= 0.97;
  // 段階的に強化するパネル：レベルの数だけ効果を重ねる
  for (const [id, lv] of Object.entries(s.nodeLv || {})) for (const e of PER_LV[id] || []) for (let i = 0; i < lv; i++) apply(e);
  return v;
}

// ルート熟練度の説明（UI用）
export function routePerkText(route) {
  const names = {
    storeOffers: (e) => `店舗の仕入れ候補+${e.add}`, storeStamina: (e) => `店舗巡りの体力-${Math.round((1 - e.mul) * 100)}%`,
    onlineOffers: (e) => `電脳の仕入れ候補+${e.add}`, pointsMult: (e) => `ポイント還元+${Math.round((e.mul - 1) * 100)}%`,
    estErr: (e) => `推定誤差-${Math.round((1 - e.mul) * 100)}%`, fakeDetect: (e) => (e.add >= 1 ? '鑑定眼（目利き×1%の確率で真贋が分かる）' : '見られる細部+1'),
    sellCenter: () => '少し高めでも売れやすい', buyers: (e) => `買い手+${Math.round((e.mul - 1) * 100)}%`,
    shipStamina: (e) => `発送の体力-${Math.round((1 - e.mul) * 100)}%`, monthlyFees: (e) => `月額費用-${Math.round((1 - e.mul) * 100)}%`,
    trouble: (e) => `トラブル-${Math.round((1 - e.mul) * 100)}%`, talkCheck: (e) => `交渉判定+${Math.round(e.add * 100)}%`,
    expGain: (e) => `経験点+${Math.round((e.mul - 1) * 100)}%`, taxMult: (e) => `税額-${Math.round((1 - e.mul) * 100)}%`,
  };
  return ROUTE_PERKS[route].map((e) => ({ lv: e.lv, text: names[e.key](e) }));
}

export { SKILLS };
