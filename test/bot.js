// テスト・バランス調整用のヘッドレス自動プレイ。UI なしで 48 週を通しで遊ぶ。
import { createGame } from '../src/engine/state.js';
import { startWeek, endWeek } from '../src/engine/turn.js';
import { performCommand, availableCommands, COMMAND_MAP, sickRisk } from '../src/engine/commands.js';
import { buy, listUnits, activeUnits, cardAvailable } from '../src/engine/inventory.js';
import { estimate, isAnnounced, priceOf } from '../src/engine/market.js';
import { queueTargets, openLotteries } from '../src/engine/offers.js';
import { ABILITIES, raiseAbility, learnableSkills, learnSkill } from '../src/engine/abilities.js';
import { productOf, shippingCost } from '../src/data/products.js';
import { repay } from '../src/engine/finance.js';
import { finalResult } from '../src/engine/ending.js';

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

const RISKY = /突っ込む|入会する|^買う$|5倍|やってみる|捨てアカ|無視|note|福袋を買う/;

export const smartPolicy = {
  choose: (s, st) => {
    const idx = st.options.findIndex((o) => !RISKY.test(o.label));
    return idx >= 0 ? idx : st.options.length - 1;
  },
  buyOffers(s, offers) {
    for (const o of offers) {
      const p = productOf(o.pid);
      const est = process.env.ORACLE ? priceOf(s, o.pid) : o.est;
      const net = est * 0.9 - shippingCost(p);
      const margin = net - o.price;
      if (o.warn) continue;
      if (margin < Math.max(300, o.price * 0.08)) continue;
      // 月末の返済とカード引き落としに備えて現金を残しておく
      const reserve = 35000 + s.card.due + s.card.current * 0.5;
      for (let q = o.maxQty; q >= 1; q--) {
        const total = o.price * q;
        if (total <= s.cash - reserve) {
          buy(s, o, q, 'cash');
          break;
        }
        if (total <= cardAvailable(s) && (process.env.AGGRO || s.card.current + total < s.cash + 50000)) {
          buy(s, o, q, 'card');
          break;
        }
      }
    }
  },
};

export function manageListings(s) {
  for (const u of activeUnits(s)) {
    const p = productOf(u.pid);
    const est = (process.env.ORACLE ? priceOf(s, u.pid) : estimate(s, u.pid)) * (u.damaged ? 0.5 : 1);
    if (p.alcohol && s.flags.noAlcohol) continue;
    const age = u.listing ? s.week - u.listing.week : 0;
    const platform = p.kind === 'collect' || p.kind === 'luxury' ? 'auc' : s.banWeeks > 0 ? 'auc' : 'merc';
    const mult = platform === 'auc' ? 0.7 : Math.max(0.85, 1.02 - age * 0.04);
    if (!u.listing || age >= 1) listUnits(s, [u.uid], platform, est * mult);
  }
}

function chooseCommand(s) {
  const cmds = availableCommands(s).map((c) => c.id);
  if (cmds.length === 1) return cmds[0];
  if (s.stamina < 40) return 'rest';
  if (!s.flags.license && s.flags.licensePending === undefined && s.cash > 60000 && s.week > 3) return 'license';
  if (queueTargets(s).length && s.stamina >= 60) return 'queue';
  const fresh = openLotteries(s).filter((p) => !(s.botEntered ||= []).includes(p.id));
  if (fresh.length) {
    s.botEntered.push(...openLotteries(s).map((p) => p.id));
    return 'lottery';
  }
  if (s.week % 4 === 3 && s.cash < 60000) return 'parttime';
  const listed = s.inventory.filter((u) => u.listing).length;
  if (listed >= 8 && s.week % 3 === 1) return 'listing';
  return s.week % 2 ? 'store' : 'online';
}

function growth(s) {
  for (const sk of learnableSkills(s)) if (sk.kind !== 'red' || true) learnSkill(s, sk.id);
  for (let i = 0; i < 30; i++) for (const a of ABILITIES) raiseAbility(s, a.id, 1);
}

export function runGame(seed, policy = smartPolicy) {
  const s = createGame(seed);
  while (!s.over) {
    play(s, startWeek(s), policy);
    if (s.over) break;
    growth(s);
    manageListings(s);
    const cmd = chooseCommand(s);
    void COMMAND_MAP;
    void sickRisk;
    void isAnnounced;
    const cashBefore = s.cash;
    play(s, performCommand(s, cmd), policy);
    manageListings(s);
    if (process.env.BOT_DEBUG) console.log(`W${s.week} ${cmd} cash ${cashBefore}->${s.cash} inv=${s.inventory.length} card=${s.card.current}/${s.card.due} stam=${s.stamina} del=${s.delinquency} debt=${s.debt}`);
    if (s.cash > 400000 && s.debt > 0) repay(s, s.cash - 250000);
    play(s, endWeek(s), policy);
  }
  return { s, result: finalResult(s) };
}
