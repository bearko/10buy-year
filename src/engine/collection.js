// 儲けを消費するルート：百貨店と外商、コレクション（私設美術館）。
// 使ったお金が、外商の優先案内・コレクションの値上がり・美術館の入館料として返ってくる（ただし遅く、不確実）
import { COLLECTION_SERIES } from '../data/collection.js';
import { PRODUCTS, productOf } from '../data/products.js';
import { chance, pick, randInt, randRange } from './rng.js';
import { addCash, addExp, addMood, addToku } from './effects.js';
import { addExpense } from './kpi.js';
import { yearOf } from './calendar.js';
import { isReleased, priceOf } from './market.js';
import { info, offers, sfx, talk } from './steps.js';
import { specialOffer } from './offers.js';

// ---------------- 図鑑 ----------------
export const RARITY = ['C', 'U', 'R', 'E', 'L'];
export const RARITY_NAME = { C: 'コモン', U: 'アンコモン', R: 'レア', E: 'エピック', L: 'レジェンド' };
const BASE_PRICE = { C: 30000, U: 80000, R: 250000, E: 800000, L: 3000000 };
const DRIFT = { C: 0, U: 0.001, R: 0.003, E: 0.005, L: 0.007 }; // 月あたりの値上がり
const FEE = { C: 1000, U: 2500, R: 7500, E: 20000, L: 60000 }; // 美術館の入館料（月・1点あたり）
export const SERIES_BONUS = 50000; // シリーズを5点そろえると、月の入館料に上乗せ

export const PIECES = COLLECTION_SERIES.flatMap((sr) => sr.items.map(([ext, name]) => ({ ext, name, series: sr.id, seriesName: sr.name, rarity: RARITY[Math.floor(ext / 1000) - 1] })));
export const PIECE_MAP = Object.fromEntries(PIECES.map((p) => [p.ext, p]));
export const pieceImage = (ext) => `assets/extensions/${ext}.webp`;

export const owned = (s, ext) => (s.collection || []).some((c) => c.ext === ext);
export const collectionValue = (s) => (s.collection || []).reduce((a, c) => a + c.value, 0);
export const completeSeries = (s) => COLLECTION_SERIES.filter((sr) => sr.items.every(([ext]) => owned(s, ext)));

// ---------------- 百貨店の顧客ランク ----------------
// 年間の購入額（今年と去年の多いほう）でランクが決まる。外商の評判が落ちると1段下がる
export const DEPT_RANKS = [
  { name: '一般', need: 0 },
  { name: '会員', need: 1000000, perk: '催事の先行案内（限定スイーツなどを定価で）' },
  { name: '外商顧客', need: 5000000, perk: '外商の担当がつき、品薄の限定品を定価で優先案内（年に数回）' },
  { name: '特選顧客', need: 20000000, perk: '正規店の高級時計・宝飾品の購入枠と、招待制の催事' },
];
const dept = (s) => (s.dept ||= { spent: {}, rep: 50 });
export const deptSpentYear = (s, y = yearOf(s.week)) => dept(s).spent[y] || 0;
export function deptRank(s) {
  const d = dept(s);
  const y = yearOf(s.week);
  const spent = Math.max(d.spent[y] || 0, d.spent[y - 1] || 0);
  let r = DEPT_RANKS.reduce((acc, x, i) => (spent >= x.need ? i : acc), 0);
  if (d.rep < 30) r = Math.max(0, r - 1);
  return r;
}
export function deptSpend(s, amount) {
  const d = dept(s);
  const y = yearOf(s.week);
  d.spent[y] = (d.spent[y] || 0) + amount;
  if (amount >= 300000) d.rep = Math.min(100, d.rep + 2);
}

// ---------------- 百貨店で買い物（外出）----------------
export const DEPT_STAGE = 3;
export function deptSteps(s) {
  const rank = deptRank(s);
  const steps = [talk('chris', rank >= 2 ? '「いつもありがとうございます、クリス様」……外商の担当さんに案内されて、特別なサロンへ。' : '百貨店の美術画廊をのぞいてみよう。売るためじゃなく、自分のために。', rank >= 2 ? 'sparkle' : 'smile')];
  // 催事の先行案内（会員から）
  if (rank >= 1) {
    const p = pick(s, PRODUCTS.filter((x) => ['perishable', 'seasonal'].includes(x.kind) && isReleased(s, x)));
    if (p) steps.push(offers([deptOffer(s, p.id, { label: '催事の先行案内（会員さま限定）', maxQty: randInt(s, 2, 4) })], '百貨店の催事', '会員さまへの先行案内'));
  }
  steps.push({ t: 'gallery', items: galleryItems(s), rank });
  return steps;
}

// 美術画廊に並ぶ品：まだ持っていない品から。ランクが上がるほど上の希少度まで並ぶ
export function galleryItems(s) {
  const top = ['R', 'E', 'L', 'L'][deptRank(s)]; // 一般はレアまで、会員からエピック、外商顧客からレジェンド
  const pool = PIECES.filter((p) => !owned(s, p.ext) && RARITY.indexOf(p.rarity) <= RARITY.indexOf(top));
  const n = Math.min(pool.length, 4 + deptRank(s));
  const out = [];
  const left = [...pool];
  for (let i = 0; i < n; i++) {
    const p = left.splice(randInt(s, 0, left.length - 1), 1)[0];
    out.push({ ext: p.ext, price: Math.round((BASE_PRICE[p.rarity] * randRange(s, 0.85, 1.25)) / 1000) * 1000 });
  }
  return out;
}

export function buyPiece(s, item) {
  if (owned(s, item.ext) || s.cash < item.price) return false;
  addCash(s, -item.price, `美術画廊: ${PIECE_MAP[item.ext].name}`);
  (s.collection ||= []).push({ ext: item.ext, cost: item.price, value: item.price, week: s.week });
  deptSpend(s, item.price);
  return true;
}

// 持ち物を手放す（画商に評価額の8割）。外商の評判は下がる
export function sellPiece(s, ext) {
  const c = (s.collection || []).find((x) => x.ext === ext);
  if (!c) return 0;
  const price = Math.round(c.value * 0.8);
  s.collection = s.collection.filter((x) => x !== c);
  addCash(s, price, `コレクションを手放した: ${PIECE_MAP[ext].name}`);
  dept(s).rep = Math.max(0, dept(s).rep - 10);
  return price;
}

function deptOffer(s, pid, extra) {
  return specialOffer(s, pid, { source: 'dept', price: productOf(pid).retail, scarce: true, ...extra });
}

// ---------------- 外商：限定品の優先案内（週のはじめ）----------------
export function deptWeek(s) {
  if (s.underworld || !s.dept) return [];
  const d = s.dept;
  const steps = [];
  // 優先案内の品を転売したのが担当にバレた
  if (d.caught) {
    d.caught = 0;
    d.rep = Math.max(0, d.rep - 25);
    addToku(s, -3);
    steps.push(talk('marie', '「クリス様……。私どもがご案内したお品、フリマに出ておりましたわね。……残念ですわ」'), info('外商の信頼を失った', ['外商の評判が大きく下がった（30未満でランクが1段下がる）', 'TOKU -3'], 'bad'));
  }
  const rank = deptRank(s);
  if (rank >= 2 && chance(s, 0.07)) {
    // いま相場が定価を上回っている限定品から、上位2つのどちらか
    const hot = PRODUCTS.filter((p) => p.kind === 'hype' && isReleased(s, p) && priceOf(s, p.id) > p.retail * 1.15)
      .sort((a, b) => priceOf(s, b.id) / b.retail - priceOf(s, a.id) / a.retail).slice(0, 2);
    const list = [];
    if (hot.length) list.push(deptOffer(s, pick(s, hot).id, { source: 'gaisho', gaisho: true, label: '外商の優先案内（定価）', maxQty: rank >= 3 ? 2 : 1 }));
    if (rank >= 3) {
      const lux = pick(s, ['queen_watch', 'jewel']);
      list.push(deptOffer(s, lux, { source: 'gaisho', gaisho: true, brandNew: true, label: '正規店の購入枠（外商経由・定価）', maxQty: 1 }));
    }
    if (list.length) {
      steps.push(talk('marie', '「クリス様にだけ、特別にご用意いたしましたの。……転売なんて、なさいませんわよね？」'), offers(list, '外商の優先案内', '転売すると担当にバレることがある'));
    }
  }
  // 特選顧客：年に一度の招待制の催事
  if (rank >= 3 && d.invited !== yearOf(s.week) && chance(s, 0.1)) {
    d.invited = yearOf(s.week);
    addExp(s, { social: 40, mind: 20 });
    addMood(s, 1);
    steps.push(sfx('levelup'), talk('marie', '「本日は招待制の催事へようこそ。お客様方とのご歓談をお楽しみくださいませ」'), info('招待制の催事', ['経営者やコレクターと知り合った', '対人+40・精神+20、やる気が上がった'], 'good'));
  }
  return steps;
}

// 売れたとき：外商の優先案内で買った品は、担当にバレることがある
export function onSaleDept(s, unit) {
  if (unit?.gaisho && chance(s, 0.35)) dept(s).caught = 1;
}

// ---------------- 私設美術館 ----------------
export const MUSEUM_COST = 5000000;
export const MUSEUM_UPKEEP = 150000;
export const MUSEUM_STAGE = 4;
export function openMuseum(s) {
  if (s.museum || s.stage < MUSEUM_STAGE || s.cash < MUSEUM_COST || (s.collection || []).length < 5) return false;
  addExpense(s, MUSEUM_COST, '私設美術館の開館');
  s.museum = { opened: s.week, visitors: 0 };
  return true;
}
export function museumIncome(s) {
  if (!s.museum) return 0;
  const pieces = (s.collection || []).reduce((a, c) => a + FEE[PIECE_MAP[c.ext].rarity], 0);
  return pieces + completeSeries(s).length * SERIES_BONUS;
}

// 月末：コレクションの値上がり、美術館の維持費
export function collectionMonthly(s) {
  for (const c of s.collection || []) c.value = Math.round(c.value * (1 + DRIFT[PIECE_MAP[c.ext].rarity] + randRange(s, -0.01, 0.01)));
  if (s.museum) addExpense(s, MUSEUM_UPKEEP, '私設美術館の維持費');
}

