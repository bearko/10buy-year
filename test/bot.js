// テスト・バランス調整用のヘッドレス自動プレイ。UI なしで10年（480週）を通しで遊ぶ。
import { suspicion } from '../src/engine/listing.js';
import { createGame } from '../src/engine/state.js';
import { startWeek, endWeek } from '../src/engine/turn.js';
import { performCommand, availableCommands, availableNightCommands, nextCardTier } from '../src/engine/commands.js';
import { buy, activeUnits, cardAvailable, listUnits, feeRate, sellToBuyer } from '../src/engine/inventory.js';
import { estimateUnit, priceOf, estimate } from '../src/engine/market.js';
import { queueTargets, openLotteries } from '../src/engine/offers.js';
import { ABILITIES, learnSkill, nodeState, raiseAbility, skillCost } from '../src/engine/abilities.js';
import { SKILLS, SKILL_MAP } from '../src/data/skills.js';
import { productOf, shippingCost } from '../src/data/products.js';
import { repay } from '../src/engine/finance.js';
import { finalResult } from '../src/engine/ending.js';
import { checkTutorial, currentMission } from '../src/engine/tutorial.js';
import { autoBuy, bestPlatform, reserveNeeded } from '../src/engine/automation.js';

export function play(s, steps, policy) {
  const queue = [...steps];
  while (queue.length) {
    const st = queue.shift();
    if (st.t === 'choice') {
      const idx = policy.choose(s, st);
      queue.unshift(...(st.options[idx].run() || []));
    } else if (st.t === 'defer') {
      queue.unshift(...(st.run() || []));
    } else if (st.t === 'offers') {
      policy.buyOffers(s, st.offers);
    }
  }
}

const RISKY = /突っ込む|入会する|^買う$|5倍|やってみる|捨てアカ|無視|有料記事|福袋を買う|まだ/;

export const smartPolicy = {
  choose: (s, st) => {
    const idx = st.options.findIndex((o) => !RISKY.test(o.label));
    return idx >= 0 ? idx : st.options.length - 1;
  },
  buyOffers(s, offers) {
    if (s.skills.includes('out_buy')) {
      autoBuy(s, offers);
      return;
    }
    for (const o of offers) {
      const p = productOf(o.pid);
      const est = process.env.ORACLE ? priceOf(s, o.pid) : o.est;
      const net = est * (1 - feeRate(s)) - shippingCost(p) + o.price * (o.points || 0);
      const margin = net - o.price;
      if (suspicion(s, o) >= 4) continue; // ふつうのプレイヤー並み：手がかりがそろったときだけ避ける
      if (p.used && !s.flags.license) continue;
      if (p.alcohol && s.flags.noAlcohol) continue;
      if (margin < Math.max(300, o.price * 0.1)) continue;
      const reserve = reserveNeeded(s) * (o.minQty ? 4 : 1) + s.card.current * 0.5;
      const cap = o.minQty ? s.cash * 0.4 : Infinity;
      for (let q = o.maxQty; q >= (o.minQty || 1); q--) {
        const total = o.price * q;
        if (total <= s.cash - reserve && total <= cap) {
          buy(s, o, q, 'cash');
          break;
        }
        if (!o.minQty && total <= cardAvailable(s) && s.card.current + total < s.cash + 100000) {
          buy(s, o, q, 'card');
          break;
        }
      }
    }
  },
};

export function manageListings(s) {
  // 売れない在庫（酒類の出品停止、半年以上の滞留）は買取業者で損切り
  const dump = activeUnits(s).filter((u) => (productOf(u.pid).alcohol && s.flags.noAlcohol) || s.week - u.week > 26);
  if (dump.length) sellToBuyer(s, dump.map((u) => u.uid));
  for (const u of activeUnits(s)) {
    const p = productOf(u.pid);
    if (p.alcohol && s.flags.noAlcohol) continue;
    const pf = bestPlatform(s, u);
    if (!pf) continue;
    const est = process.env.ORACLE ? priceOf(s, u.pid) : estimateUnit(s, u);
    const age = u.listing ? s.week - u.listing.week : 0;
    const mult = pf === 'auc' ? 0.7 : Math.max(0.85, 1.02 - age * 0.04);
    if (!u.listing || age >= 1) listUnits(s, [u.uid], pf, est * mult);
  }
}

// スキルツリーの解放優先度：まず基本、次に「目指すルート」2本、最後に残り
const ESSENTIAL = ['eye_calc', 'eye_market', 'src_online', 'license', 'src_used', 'ch_miime', 'ch_amacri', 'src_lottery', 'kpi_mid', 'net_meetup', 'src_queue', 'slots', 'price_tool', 'warehouse', 'routine', 'out_ship', 'out_list', 'out_buy', 'warehouse2', 'kpi_pro', 'ch_shops'];
const ROUTE_PLANS = [['store', 'system'], ['online', 'sales'], ['vintage', 'system'], ['sales', 'manage'], ['store', 'online'], ['network', 'system']];
function priorityFor(s) {
  const plan = ROUTE_PLANS[s.seed % ROUTE_PLANS.length];
  const inPlan = SKILLS.filter((x) => plan.includes(x.route)).sort((a, b) => a.depth - b.depth).map((x) => x.id);
  return [...ESSENTIAL, ...inPlan, ...SKILLS.map((x) => x.id)];
}

function growth(s) {
  for (const id of priorityFor(s)) {
    const st = nodeState(s, id);
    if (st === 'available' || st === 'red') learnSkill(s, id);
  }
  // 能力の前提で止まっているノードがあれば、その能力を優先して上げる（プレイヤーと同じく狙いを持って育てる）
  for (const id of priorityFor(s).slice(0, 40)) {
    const sk = SKILL_MAP[id];
    if (!sk?.need || nodeState(s, id) !== 'locked') continue;
    for (const [k, v] of Object.entries(sk.need)) if (s.abilities[k] < v) raiseAbility(s, k, v - s.abilities[k]);
  }
  // 次に狙うノード（コスト不足で取れなかったもの）の分を残して、余った経験点で基礎能力を上げる
  const target = priorityFor(s).find((id) => nodeState(s, id) === 'available');
  const reserve = target ? skillCost(s, target) : {};
  const spare = () => Object.values(s.exp).filter((v) => v > 60).length >= 3;
  for (let i = 0; i < 20 && spare(); i++) {
    for (const a of ABILITIES) {
      const exp = { ...s.exp }, lv = s.abilities[a.id];
      raiseAbility(s, a.id, 1);
      if (Object.entries(reserve).some(([k, v]) => s.exp[k] < exp[k] && s.exp[k] < v)) { s.exp = exp; s.abilities[a.id] = lv; }
    }
  }
}

function chooseCommand(s) {
  const cmds = availableCommands(s).map((c) => c.id);
  const has = (id) => cmds.includes(id);
  if (cmds.length === 1) return cmds[0];
  if (s.stamina < 40) return 'rest';
  if (currentMission(s)?.id === 'go_store' && has('store')) return 'store';
  if (has('license') && s.cash > 60000) return 'license';
  // カードの枠：審査に通りそうなら申し込む
  const tier = nextCardTier(s);
  const last = s.monthly.slice(-3);
  const rev = last.length ? last.reduce((a, m) => a + (m.revenue || 0), 0) / last.length : 0;
  if (has('card_up') && tier && tier.limit <= 1000000 && rev >= tier.revenue && s.stage >= (tier.stage || 1) && !s.delinquency) return 'card_up';
  if (has('queue') && queueTargets(s).length && s.stamina >= 60) return 'queue';
  const fresh = has('lottery') ? openLotteries(s).filter((p) => !(s.botEntered ||= []).includes(`${p.id}@${Math.floor(s.week / 48)}`)) : [];
  if (fresh.length) {
    s.botEntered.push(...openLotteries(s).map((p) => `${p.id}@${Math.floor(s.week / 48)}`));
    return 'lottery';
  }
  if (has('parttime') && s.week % 4 === 3 && s.cash < reserveNeeded(s)) return 'parttime';
  if (has('home_search') && s.week % 3 === 0) return 'home_search';
  if (has('wholesale') && s.cash > 1500000 && s.week % 2 === 0) return 'wholesale';
  if (has('auction') && s.cash > 300000 && s.week % 3 === 1) return 'auction';
  const listed = s.inventory.filter((u) => u.listing).length;
  if (listed >= 8 && s.week % 5 === 1 && !s.skills.includes('out_list')) return 'listing';
  if (!has('store')) return has('home_search') ? 'home_search' : 'parttime';
  if (!has('online')) return 'store';
  return (s.week + (s.actionsLeft || 0)) % 2 ? 'store' : 'online';
}

export function runGame(seed, policy = smartPolicy, { weeks = Infinity } = {}) {
  const s = createGame(seed);
  while (!s.over && s.week < weeks) {
    play(s, startWeek(s), policy);
    play(s, checkTutorial(s), policy);
    if (s.over) break;
    growth(s);
    manageListings(s);
    play(s, checkTutorial(s), policy);
    while (s.actionsLeft > 0 && !s.over) {
      s.actionsLeft--;
      play(s, performCommand(s, chooseCommand(s)), policy);
      manageListings(s);
      play(s, checkTutorial(s), policy);
    }
    if (s.nightLeft > 0 && s.stamina >= 45) {
      s.nightLeft--;
      const night = availableNightCommands(s).map((c) => c.id);
      const pickNight = night.includes('online') ? 'online' : night.includes('listing') ? 'listing' : night[0];
      if (pickNight) {
        play(s, performCommand(s, pickNight, { night: true }), policy);
        manageListings(s);
      }
    }
    const keep = Math.max(400000, reserveNeeded(s) * 3);
    if (s.cash > keep && s.debt > 0) repay(s, s.cash - keep);
    play(s, endWeek(s), policy);
    play(s, checkTutorial(s), policy);
  }
  return { s, result: finalResult(s) };
}

export { estimate };
