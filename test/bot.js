// テスト・バランス調整用のヘッドレス自動プレイ。UI なしで10年（480週）を通しで遊ぶ。
import { suspicion } from '../src/engine/listing.js';
import { unsellable } from '../src/engine/regulated.js';
import { createGame } from '../src/engine/state.js';
import { startWeek, endWeek } from '../src/engine/turn.js';
import { performCommand, availableCommands, availableNightCommands, nextCardTier } from '../src/engine/commands.js';
import { buy, activeUnits, cardAvailable, listUnits, feeRate, sellToBuyer } from '../src/engine/inventory.js';
import { estimateUnit, priceOf, estimate } from '../src/engine/market.js';
import { queueTargets, openLotteries } from '../src/engine/offers.js';
import { autoVisible } from '../src/engine/sourcing.js';
import { ABILITIES, abilityCost, convertExp, learnSkill, nodeState, raiseAbility, skillCost } from '../src/engine/abilities.js';
import { SKILLS, SKILL_MAP } from '../src/data/skills.js';
import { productOf, shippingCost } from '../src/data/products.js';
import { repay } from '../src/engine/finance.js';
import { finalResult } from '../src/engine/ending.js';
import { checkTutorial, currentMission } from '../src/engine/tutorial.js';
import { autoBuy, bestPlatform, reserveNeeded } from '../src/engine/automation.js';
import { openCourses } from '../src/engine/courses.js';
import { LOCATIONS } from '../src/engine/mystore.js';
import { buyPiece, openMuseum } from '../src/engine/collection.js';
import { audOf } from '../src/engine/careers.js';
import { INVEST_MAX, investIn, investLevel } from '../src/engine/lifestyle.js';

export function play(s, steps, policy) {
  const queue = [...steps];
  while (queue.length) {
    const st = queue.shift();
    globalThis.__onStep?.(st, s); // テストで、流れた演出を集める
    if (st.t === 'choice') {
      const idx = policy.choose(s, st);
      queue.unshift(...(st.options[idx].run() || []));
    } else if (st.t === 'defer') {
      queue.unshift(...(st.run() || []));
    } else if (st.t === 'offers') {
      policy.buyOffers(s, autoVisible(st, s));
    } else if (st.t === 'gallery') {
      policy.buyGallery?.(s, st.items);
    }
  }
}

const RISKY = /突っ込む|入会する|^買う$|5倍|やってみる|捨てアカ|無視|有料記事|福袋を買う|まだ/;

// 方針（spec 10.6）：light = 表（寄付で徳を積み、正道ルートを取る）、dark = 魔道（裏の人間になって走り切る）、wash = 魔道 → 蜘蛛の糸で足を洗う
const route = (s) => (s.botRoute === 'wash' && s.flags.spiderThread !== undefined ? 'light' : s.botRoute || 'light');

export const smartPolicy = {
  // 百貨店の美術画廊：余裕資金（3,000万円を超える分）で、安い品から集める
  buyGallery(s, items) {
    for (const it of [...items].sort((a, b) => a.price - b.price)) if (s.cash - it.price > 30000000) buyPiece(s, it);
  },
  choose: (s, st) => {
    const labels = st.options.map((o) => o.label);
    const find = (re) => labels.findIndex((l) => re.test(l));
    // 志：シードごとに違う志を選ぶ（すべての志を試すため）
    if (find(/^まだ決めない$/) >= 0) return (s.seed >> 3) % (labels.length - 1);
    if (find(/足を洗う/) >= 0) return route(s) === 'wash' ? find(/足を洗う/) : labels.findIndex((l) => !/足を洗う/.test(l));
    if (find(/義援金/) >= 0) return s.cash > 4000000 ? find(/義援金/) : s.cash > 1000000 ? find(/子ども食堂/) : 0;
    if (route(s) !== 'light' && find(/捨てアカ/) >= 0) return find(/捨てアカ/);
    if (route(s) !== 'light' && find(/^無視する$/) >= 0) return find(/^無視する$/);
    // 資格講座：目当ての講座を選ぶ。店の立地は商店街（コレクター品が強い）
    const want = wantedCourse(s);
    if (want && find(new RegExp(`^${want.name}（`)) >= 0) return find(new RegExp(`^${want.name}（`));
    if (find(/^商店街（/) >= 0) return find(/^商店街（/);
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
      if ((p.alcohol && s.flags.noAlcohol) || unsellable(p.id)) continue; // 酒の免許なし・薬機法で売れない品は買わない
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

// C の仕組み（spec 9）：ステージ3で輸出と新ジャンル、ステージ4で店舗経営の講座を取る
const WANT_COURSES = ['export', 'know_game', 'know_antique', 'store_mgmt'];
function wantedCourse(s) {
  if (s.course) return null;
  return openCourses(s).find((c) => WANT_COURSES.includes(c.id)) || null;
}

// 店がある間は、立地の客層に合う品を少しのあいだ店頭に並べる（出品しない）
const forShelf = (s, u) => {
  if (!s.shop || s.week - u.week >= 4) return false;
  const loc = LOCATIONS[s.shop.loc], p = productOf(u.pid);
  return loc.likes.includes(p.kind) || (p.know && loc.know.includes(p.know));
};

export function manageListings(s) {
  // 売れない在庫（酒類の出品停止、半年以上の滞留）は買取業者で損切り
  const dump = activeUnits(s).filter((u) => (productOf(u.pid).alcohol && s.flags.noAlcohol) || s.week - u.week > 26);
  if (dump.length) sellToBuyer(s, dump.map((u) => u.uid));
  for (const u of activeUnits(s)) {
    const p = productOf(u.pid);
    if ((p.alcohol && s.flags.noAlcohol) || unsellable(p.id)) continue; // 酒の免許なし・薬機法で売れない品は買わない
    if (!u.listing && forShelf(s, u)) continue;
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
  const plan = [...ROUTE_PLANS[s.seed % ROUTE_PLANS.length], route(s) === 'light' ? 'trade' : 'dark'];
  const inPlan = SKILLS.filter((x) => plan.includes(x.route)).sort((a, b) => a.depth - b.depth).map((x) => x.id);
  const all = [...ESSENTIAL, ...inPlan, ...SKILLS.map((x) => x.id)];
  // 表の方針なら魔道のパネルは取らない
  return route(s) === 'light' ? all.filter((id) => SKILL_MAP[id]?.route !== 'dark') : all;
}

// プレイヤーと同じく、余っている経験点を足りない種類に振り替える（×0.5）。いちばん多い種類から、150は残して
function topUp(s, need) {
  for (const [k, v] of Object.entries(need)) {
    const lack = v - (s.exp[k] || 0);
    if (lack <= 0) continue;
    const [from, have] = Object.entries(s.exp).filter(([x]) => x !== k).sort((a, b) => b[1] - a[1])[0];
    if (have - lack * 2 >= 150) convertExp(s, from, k, lack * 2);
  }
}

// 目指すルートの到達点に、経験点の種類が足りなければ振り替える（能力の前提に要る分も）
function aimCapstones(s) {
  if (s.stage < 3) return; // 稼ぎが安定してから（序盤は稼ぐためのパネルが先）
  const plan = ROUTE_PLANS[s.seed % ROUTE_PLANS.length];
  // 目指すルートの道のりのパネル（段の浅い順）。経験点の種類が足りないだけなら振り替えて取る
  for (const sk of SKILLS.filter((x) => plan.includes(x.route) && x.kind !== 'repeat' && x.kind !== 'capstone').sort((a, b) => a.depth - b.depth)) {
    if (nodeState(s, sk.id) !== 'available') continue;
    topUp(s, skillCost(s, sk.id));
    learnSkill(s, sk.id);
  }
  for (const sk of SKILLS) {
    if (sk.kind !== 'capstone' || !plan.includes(sk.route) || s.skills.includes(sk.id)) continue;
    const need = {};
    for (const [a, target] of Object.entries(sk.need || {})) {
      for (let lv = s.abilities[a]; lv < target; lv++) for (const [k, v] of Object.entries(abilityCost(a, lv))) need[k] = (need[k] || 0) + v;
    }
    topUp(s, need);
    for (const [a, target] of Object.entries(sk.need || {})) if (s.abilities[a] < target) raiseAbility(s, a, target - s.abilities[a]);
    if (Object.entries(sk.need || {}).every(([a, t]) => s.abilities[a] >= t)) topUp(s, skillCost(s, sk.id));
    if (nodeState(s, sk.id) === 'available') learnSkill(s, sk.id);
  }
}

function growth(s) {
  aimCapstones(s);
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

// 経験点に余裕があるか（ステージ5に必要な外注のパネルを取り終えている）
const surplusExp = (s) => ['out_list', 'out_ship', 'out_buy'].every((id) => s.skills.includes(id));

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
  // 表の方針：お金に余裕ができたら寄付で徳を積む（正道ルートのパネルの条件）
  if (route(s) === 'light' && has('donate') && s.toku < 175 && s.week % 4 === 2 && (s.cash > 4000000 || s.stage >= 3)) return 'donate';
  if (has('course') && s.cash > 1500000 && (s.course ? WANT_COURSES.includes(s.course.id) : wantedCourse(s)) && s.week % 2 === 0) return 'course';
  if (has('open_shop') && s.cash > 4000000) return 'open_shop';
  if (has('dept') && s.cash > 35000000 && s.week % 8 === 4) return 'dept';
  // キャリアのコマンド：余った経験点で回す（外注のパネルを取り終えてから）
  if (surplusExp(s) && has('appraise_job') && s.exp.info >= 200 && s.exp.mind >= 200 && s.week % 3 === 0) return 'appraise_job';
  if (surplusExp(s) && has('buying') && s.exp.tech >= 200 && s.cash > 2000000 && s.week % 4 === 2) return 'buying';
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
  // 荒れてきたら、静かなほうへ回る（プレイヤーが「荒れ具合」を見て動くのと同じ）
  const sat = (k) => s.saturation?.[k] || 0;
  if (Math.abs(sat('store') - sat('online')) > 15) return sat('store') < sat('online') ? 'store' : 'online';
  return (s.week + (s.actionsLeft || 0)) % 2 ? 'store' : 'online';
}

// tid を渡すと、プレイログ（engine/telemetry.js）の記録の対象になる（tools/analytics/simulate.mjs）
export function runGame(seed, policy = smartPolicy, { weeks = Infinity, route = process.env.BOT_ROUTE, difficulty = process.env.BOT_DIFF || 'normal', style = process.env.BOT_STYLE, tid = null, onStart = null, onWeek = null } = {}) {
  const s = createGame(seed, difficulty);
  if (tid) s.tid = tid;
  // キャリアの型（例：BOT_STYLE=spec:tcg）
  if (style) { const [type, cat] = style.split(':'); s.style = { type, cat }; }
  if (route) s.botRoute = route;
  onStart?.(s);
  while (!s.over && s.week < weeks) {
    play(s, startWeek(s), policy);
    play(s, checkTutorial(s), policy);
    if (s.over) break;
    growth(s);
    if (!s.museum && (s.collection || []).length >= 5 && s.cash > 15000000) openMuseum(s);
    // 出資：余裕資金で、開拓した仕入れ先に（月に1回まで）
    if (s.cash > 25000000 && s.week % 4 === 1) {
      const sp = (s.spots || []).find((id) => investLevel(s, id) < INVEST_MAX);
      if (sp) investIn(s, sp);
    }
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
      const calm = (s.saturation?.online || 0) < 50;
      const beauty = s.inventory.filter((u) => u.listing && audOf(u.pid) === 'beauty').length;
      const pickNight = surplusExp(s) && night.includes('live') && beauty >= 3 && s.exp.social >= 200 ? 'live'
        : surplusExp(s) && night.includes('review') && s.exp.info >= 200 && s.week % 2 ? 'review'
          : night.includes('online') && calm ? 'online' : night.includes('listing') ? 'listing' : night[0];
      if (pickNight) {
        play(s, performCommand(s, pickNight, { night: true }), policy);
        manageListings(s);
      }
    }
    const keep = Math.max(400000, reserveNeeded(s) * 3);
    if (s.cash > keep && s.debt > 0) repay(s, s.cash - keep);
    play(s, endWeek(s), policy);
    play(s, checkTutorial(s), policy);
    onWeek?.(s);
  }
  return { s, result: finalResult(s) };
}

export { estimate };
