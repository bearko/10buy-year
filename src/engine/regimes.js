// 販売方式・法律の変化（いたちごっこ）。稼いでいる商材・販路ほど目立ち、対策の標的になる。
// 目立ち度（heat）が 100 を超えると対策を予告し、8週後に施行する。数年で緩む対策や、規制のあとに開く商機もある
import { productOf } from '../data/products.js';
import { REGIMES, REGIME_LADDER } from '../data/regimes.js';
import { info, sfx, talk } from './steps.js';

export const HEAT_MAX = 100;
export const ANNOUNCE_WEEKS = 8;
const COOL_WEEKS = 12; // 予告と予告の間は最低12週あける

export const heat = (s, key) => s.heat?.[key] || 0;
export function addHeat(s, key, n) {
  if (!key || n <= 0 || s.underworld) return;
  s.heat = { ...(s.heat || {}), [key]: Math.min(HEAT_MAX * 1.5, heat(s, key) + n) };
}
export const productKey = (pid) => `p:${pid}`;

// ---- 状態 ----
// s.regimes = [{ id, pid?, announced, start, end? }]
const live = (s) => (s.regimes || []).filter((r) => r.end === undefined || r.end > s.week);
export const activeRegimes = (s) => live(s).filter((r) => r.start <= s.week);
export const announcedRegimes = (s) => live(s).filter((r) => r.start > s.week);
export const regimeOn = (s, id, pid) => activeRegimes(s).some((r) => r.id === id && (!pid || r.pid === pid));
const known = (s, id, pid) => (s.regimes || []).some((r) => r.id === id && (!pid || r.pid === pid));

// ---- 効果（offers・sales・inventory が参照）----
// 出品できる上限価格（なければ Infinity）
export function priceCap(s, pid, platform) {
  const p = productOf(pid);
  if (platform === 'black') return Infinity;
  if (regimeOn(s, 'ban_expand', pid)) return Math.round(p.retail * 1.2);
  if (regimeOn(s, 'resale_official', pid) && (platform === 'merc' || platform === 'ama')) return Math.round(p.retail * 1.5);
  return Infinity;
}
export const lotteryRegimeMult = (s) => (regimeOn(s, 'lottery_id') ? 0.7 * (1 + Math.min(0.5, (s.member || 0) / 40)) : 1);
export const namesBanned = (s) => regimeOn(s, 'lottery_id');
export const queueLimited = (s) => regimeOn(s, 'buy_limit');
export const feeRegime = (s, platform) => (platform === 'merc' && regimeOn(s, 'fee_hike') ? 0.03 : 0);
export const usedRegimeMult = (s) => (regimeOn(s, 'certified_used') ? 1.15 : 1);
export const madeToOrder = (s, pid) => regimeOn(s, 'made_to_order', pid);
export const exportBlocked = (s, pid) => regimeOn(s, 'export_rule') && productOf(pid).kind === 'hype' && !s.certs?.includes('trade_practice');

// ---- 目立ち度を上げる行動 ----
// 高値で売る：定価の1.5倍を超えた分だけ目立つ（中古・家の不用品は対象外）
export function heatFromSale(s, sale) {
  const p = productOf(sale.pid);
  if (p.used || p.kind === 'home' || !['hype', 'boom', 'perishable', 'seasonal'].includes(p.kind)) return;
  const over = sale.price / p.retail - 1.5;
  if (over <= 0) return;
  addHeat(s, productKey(p.id), over * 10);
  if (sale.platform === 'merc') addHeat(s, 'merc', over * 4);
  if (sale.platform === 'exp' && p.kind === 'hype') addHeat(s, 'exp', 3 + over * 4);
}
// 品薄品の買い占め
export function heatFromBuy(s, offer, qty) {
  if (!offer.scarce) return;
  addHeat(s, productKey(offer.pid), 2 * qty);
  if (offer.source === 'queue') addHeat(s, 'queue', 4 * qty);
  if (offer.source === 'lottery' || offer.source === 'preorder') s.member = (s.member || 0) + qty; // 公式ストアの会員ランク
}

// ---- 週のはじめ：予告と施行 ----
export function regimeWeek(s) {
  if (s.underworld) return [];
  const steps = [];
  // 施行
  for (const r of (s.regimes || []).filter((x) => x.start === s.week)) steps.push(...enforce(s, r));
  // 緩む
  for (const r of (s.regimes || []).filter((x) => x.end === s.week)) {
    const def = REGIMES[r.id];
    steps.push(info(def.positive ? `${def.name}が落ち着いた` : `${def.name}が緩んだ`, [def.positive ? '中古品の相場が元に戻った' : 'いつの間にか、誰も守らなくなった…', '業界の動きは「メニュー → 業界の動き」で'], def.positive ? '' : 'good'));
  }
  // 予告：いちばん目立っている key から
  if (s.stage < 2 || s.week < (s.flags.regimeCool || 0)) return steps;
  const hot = Object.entries(s.heat || {}).filter(([, v]) => v >= HEAT_MAX).sort((a, b) => b[1] - a[1]);
  for (const [key] of hot) {
    const r = nextRegime(s, key);
    if (!r) {
      s.heat[key] = HEAT_MAX * 0.5; // 打つ手がもうない key は寝かせる
      continue;
    }
    s.heat[key] = 0;
    s.flags.regimeCool = s.week + COOL_WEEKS;
    steps.push(...announce(s, r));
    break;
  }
  return steps;
}

function nextRegime(s, key) {
  if (key.startsWith('p:')) {
    const pid = key.slice(2);
    const id = REGIME_LADDER.product.find((x) => !known(s, x, pid));
    return id ? { id, pid } : null;
  }
  const id = (REGIME_LADDER[key] || []).find((x) => !known(s, x));
  return id ? { id } : null;
}

function announce(s, r) {
  const def = REGIMES[r.id];
  const name = r.pid ? productOf(r.pid).name : '';
  const reg = { id: r.id, ...(r.pid ? { pid: r.pid } : {}), announced: s.week, start: s.week + ANNOUNCE_WEEKS };
  if (def.relax) reg.end = reg.start + def.relax;
  (s.regimes ||= []).push(reg);
  return [
    sfx('trouble'),
    talk('ieyasu', '「鳴かぬなら、鳴くまで待とう。……転売ヤーが目立ちすぎたな。手を打たせてもらう」'),
    info(`予告：${def.name}`, [def.announce(name), `${ANNOUNCE_WEEKS}週後に施行`, ...def.rules(name)], 'bad'),
    talk('mine', `あと${ANNOUNCE_WEEKS}週で、今のやり方が通用しなくなるわ。在庫を売り切るか、乗り換え先を探しましょう。`, 'arms'),
  ];
}

function enforce(s, r) {
  const def = REGIMES[r.id];
  const name = r.pid ? productOf(r.pid).name : '';
  const lines = [...def.rules(name)];
  // 上限を超える出品は値下げされる
  let cut = 0;
  for (const u of s.inventory) {
    if (!u.listing) continue;
    const cap = priceCap(s, u.pid, u.listing.platform);
    if (u.listing.price > cap) {
      u.listing.price = cap;
      cut++;
    }
    if (u.listing.platform === 'exp' && exportBlocked(s, u.pid)) {
      u.listing = null;
      cut++;
    }
  }
  if (cut) lines.push(`出品中の${cut}件が値下げ・取り下げになった`);
  const steps = [sfx(def.positive ? 'hint' : 'damage'), info(`施行：${def.name}`, lines, def.positive ? 'good' : 'bad'), talk('mine', def.hint, def.positive ? 'smile' : 'pointer')];
  // 規制のあとには、新しい商機が開く（新品の転売規制 → 認定中古）
  if (!def.positive && (r.id === 'ban_expand' || r.id === 'buy_limit') && !known(s, 'certified_used')) {
    (s.regimes ||= []).push({ id: 'certified_used', announced: s.week, start: s.week + 16, end: s.week + 16 + REGIMES.certified_used.relax });
  }
  return steps;
}

// 業界の年表から：対策を直接起こす（まだ出ていなければ）。来週に施行
export function forceRegime(s, id) {
  if (known(s, id)) return false;
  const def = REGIMES[id];
  const reg = { id, announced: s.week, start: s.week + 1 };
  if (def.relax) reg.end = reg.start + def.relax;
  (s.regimes ||= []).push(reg);
  return true;
}

// ---- 月末：目立ち度が冷める。ライバルも業界を目立たせる ----
export function regimeMonthly(s, rivals = []) {
  for (const k of Object.keys(s.heat || {})) s.heat[k] *= 0.9;
  for (const id of rivals) {
    if (id === 'edison') addHeat(s, 'lottery', 12);
    if (id === 'cao') addHeat(s, 'queue', 10);
    if (id === 'billy') addHeat(s, 'merc', 10);
    if (id === 'gogh') addHeat(s, 'exp', 6);
  }
}

// 業界の動きの画面用
export function regimeRows(s) {
  return (s.regimes || []).map((r) => {
    const def = REGIMES[r.id];
    const name = r.pid ? productOf(r.pid).name : '';
    const state = r.start > s.week ? `あと${r.start - s.week}週で施行` : r.end !== undefined && r.end <= s.week ? '終わった' : r.end !== undefined ? `施行中（あと${r.end - s.week}週）` : '施行中';
    return { id: r.id, title: name ? `${def.name}：${name}` : def.name, state, rules: def.rules(name), positive: !!def.positive, over: r.end !== undefined && r.end <= s.week };
  }).reverse();
}

// 目立っている key（画面用）
export function hotKeys(s) {
  return Object.entries(s.heat || {}).filter(([, v]) => v >= 20).sort((a, b) => b[1] - a[1]).slice(0, 5)
    .map(([k, v]) => ({ key: k, name: k.startsWith('p:') ? productOf(k.slice(2)).name : { lottery: '抽選', queue: '行列', merc: 'プンシー', exp: '海外EC' }[k] || k, v: Math.round(Math.min(100, v)) }));
}

