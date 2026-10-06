// ステージ4：自分の店。立地で客層と家賃が変わる。出品していない在庫が店頭に並び、毎週お客さんが来て買っていく
import { PRODUCTS, productOf } from '../data/products.js';
import { chance, pick, poisson, randInt } from './rng.js';
import { addCash, addExp, yen } from './effects.js';
import { activeUnits, addUnits, removeUnit } from './inventory.js';
import { addExpense } from './kpi.js';
import { roundPrice, unitPrice } from './market.js';
import { woy } from './calendar.js';
import { choice, info, sfx, talk } from './steps.js';
import { knowsGenre } from './courses.js';

export const LOCATIONS = {
  station: { name: '駅前', rent: 400000, traffic: 60, tolerance: 1.03, likes: ['staple', 'hype', 'boom'], know: ['fashion'], desc: '客足が多い。通勤客は新品の定番・話題の品を買う' },
  street: { name: '商店街', rent: 200000, traffic: 35, tolerance: 1.08, likes: ['collect'], know: ['antique', 'game'], desc: '地元のコレクターが通う。中古・コレクター品が強い' },
  roadside: { name: '郊外ロードサイド', rent: 120000, traffic: 25, tolerance: 1.0, likes: ['staple', 'seasonal'], know: [], desc: '家賃が安い。車で来るファミリーが季節品や大物を買う' },
  tourist: { name: '観光地', rent: 350000, traffic: 50, tolerance: 1.12, likes: ['luxury', 'collect'], know: ['antique', 'art'], desc: '季節で客足が波打つ。インバウンドは高額品に強い' },
};

export const STAFF_COST = 250000;
export const RENOVATE_COST = (lv) => 1500000 * (lv + 1);
export const COUNTER_COST = 300000;

const likes = (loc, p) => loc.likes.includes(p.kind) || (p.know && loc.know.includes(p.know));

// 外出「店を開く」：立地を選んで、保証金（家賃3か月）を払う
export function openShopSteps(s) {
  return [
    talk('chris', 'ついに自分の店か…。どこに出そう？', 'sparkle'),
    choice(Object.entries(LOCATIONS).map(([id, loc]) => ({
      label: `${loc.name}（家賃 ${yen(loc.rent)}/月）`,
      sub: loc.desc,
      run: () => {
        const deposit = loc.rent * 3;
        if (s.cash < deposit) return [talk('chris', `保証金が足りない…（${yen(deposit)}必要）`, 'sad')];
        addExpense(s, deposit, `店の保証金（${loc.name}）`);
        s.shop = { loc: id, renov: 0, staff: false, counter: false, opened: s.week, last: null };
        return [sfx('stageup'), info('店を開いた', [`${loc.name}に「クリス物販」を開店`, '出品していない在庫が店頭に並ぶ', '店の経営はメニューの「店」から'], 'good')];
      },
    }))),
  ];
}

// 毎週：店頭（出品していない在庫）からお客さんが買っていく。手数料・送料はかからない
export function shopWeek(s) {
  if (!s.shop) return null;
  const loc = LOCATIONS[s.shop.loc];
  const season = s.shop.loc === 'tourist' ? 0.6 + 0.8 * Math.abs(Math.sin((woy(s.week) / 48) * Math.PI * 2)) : 1;
  const visitors = poisson(s, loc.traffic * (1 + 0.3 * s.shop.renov) * season * (0.6 + s.rating / 125));
  const shelf = activeUnits(s).filter((u) => !u.listing && !(productOf(u.pid).alcohol && s.flags.noAlcohol));
  let sold = 0;
  let revenue = 0;
  for (let i = 0; i < visitors && shelf.length; i++) {
    const idx = randInt(s, 0, shelf.length - 1);
    const u = shelf[idx];
    const p = productOf(u.pid);
    const rate = (likes(loc, p) ? 0.2 : 0.05) + (s.shop.staff ? 0.06 : 0);
    if (!chance(s, rate)) continue;
    const price = roundPrice(unitPrice(s, u) * loc.tolerance);
    shelf.splice(idx, 1);
    sellInShop(s, u, price);
    sold++;
    revenue += price;
  }
  // 買取カウンター：近所の人が品物を持ち込む（相場の4割で買い取る）
  let bought = 0;
  if (s.shop.counter) {
    const pool = PRODUCTS.filter((p) => ['collect', 'staple'].includes(p.kind) && knowsGenre(s, p) && !p.alcohol && !p.spot);
    const n = randInt(s, 0, 3);
    for (let i = 0; i < n; i++) {
      const p = pick(s, pool);
      const cost = roundPrice(unitPrice(s, { pid: p.id, edition: null }) * 0.4);
      if (s.cash < cost) break;
      addCash(s, -cost, `買取カウンター: ${p.name}`);
      addUnits(s, p.id, 1, cost);
      bought++;
    }
  }
  if (sold) addExp(s, { social: 3, tech: 2 });
  s.shop.last = { visitors, sold, revenue, bought, week: s.week };
  s.shop.total = (s.shop.total || 0) + revenue;
  return s.shop.last;
}

function sellInShop(s, u, price) {
  removeUnit(s, u.uid);
  addCash(s, price, `店頭販売: ${productOf(u.pid).name}`);
  s.stats.revenue += price;
  s.stats.cogs += u.cost;
  s.stats.soldUnits++;
  s.stats.purchasedSold += u.home ? 0 : 1;
  s.cur.revenue += price;
  s.cur.salesProfit += price - u.cost;
  s.cur.sold++;
  s.cur.daysSum += Math.max(0, (s.week - u.week) * 7);
}

// 月末にかかる店の費用（家賃＋スタッフの給料）
export const shopMonthlyCost = (s) => (s.shop ? LOCATIONS[s.shop.loc].rent + (s.shop.staff ? STAFF_COST : 0) : 0);

// 月末：家賃とスタッフの給料
export function shopMonthly(s) {
  if (!s.shop) return [];
  const loc = LOCATIONS[s.shop.loc];
  addExpense(s, loc.rent, `店の家賃（${loc.name}）`);
  if (s.shop.staff) addExpense(s, STAFF_COST, '店のスタッフ');
  return [];
}

export function upgradeShop(s, what) {
  const sh = s.shop;
  if (!sh) return false;
  if (what === 'renov') {
    const cost = RENOVATE_COST(sh.renov);
    if (sh.renov >= 3 || s.cash < cost) return false;
    addExpense(s, cost, '店の改装');
    sh.renov++;
    return true;
  }
  if (what === 'staff') {
    sh.staff = !sh.staff;
    return true;
  }
  if (what === 'counter') {
    if (sh.counter || s.cash < COUNTER_COST) return false;
    addExpense(s, COUNTER_COST, '買取カウンターの設置');
    sh.counter = true;
    return true;
  }
  return false;
}
