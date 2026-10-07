// 一番くじ風のくじ引き。年に4回、ホビーショップでくじが始まる（4週間）。
// 1回750円。A賞とラストワン賞（最後の1枚を引いた人がもらえる）が狙い目だが、下位賞はダブついて売れ残る。
// 箱の残りは週ごとにほかの客が引いて減っていく
import { productOf } from '../data/products.js';
import { woy } from './calendar.js';
import { addUnits } from './inventory.js';
import { nextRandom, randInt } from './rng.js';

export const KUJI_PRICE = 750;
export const KUJI_WEEKS = 4;
// 賞と本数（1箱80枚）
export const KUJI_PRIZES = [
  { tier: 'A', pid: 'kuji_a', n: 1 },
  { tier: 'B', pid: 'kuji_b', n: 2 },
  { tier: 'C', pid: 'kuji_c', n: 5 },
  { tier: 'D', pid: 'kuji_d', n: 12 },
  { tier: 'E', pid: 'kuji_e', n: 20 },
  { tier: 'F', pid: 'kuji_f', n: 40 },
];
export const LAST_ONE = 'kuji_last';
const START_WOY = [2, 14, 26, 38]; // 年に4回

export const kujiOpen = (s) => !!s.kuji && s.week < s.kuji.end && kujiLeft(s) > 0;
export const kujiLeft = (s) => (s.kuji ? Object.values(s.kuji.box).reduce((a, n) => a + n, 0) : 0);

// 箱から1枚引く（残りの本数に比例して当たる）
function drawOne(s) {
  const box = s.kuji.box;
  let r = Math.floor(nextRandom(s) * kujiLeft(s));
  for (const p of KUJI_PRIZES) {
    if (r < box[p.tier]) {
      box[p.tier]--;
      return p;
    }
    r -= box[p.tier];
  }
  return null;
}

// 週のはじめ：くじの開始・ほかの客が引いて減る
export function kujiWeek(s) {
  if (START_WOY.includes(woy(s.week)) && s.week > 0) {
    s.kuji = { start: s.week, end: s.week + KUJI_WEEKS, box: Object.fromEntries(KUJI_PRIZES.map((p) => [p.tier, p.n])), lastTaken: false };
    return [{ pid: 'kuji_a', text: `【くじ】ホビーショップで「ルビーくじ」が始まった（1回${KUJI_PRICE}円・${KUJI_WEEKS}週間）。A賞は「${productOf('kuji_a').name}」`, kind: 'event' }];
  }
  if (s.kuji && s.week > s.kuji.start && s.week < s.kuji.end) {
    // ほかの客が引いていく（最後の1枚はだれかがロット買いしていく）
    const n = Math.min(kujiLeft(s), randInt(s, 8, 22));
    for (let i = 0; i < n; i++) drawOne(s);
    if (kujiLeft(s) === 0) s.kuji.lastTaken = true;
  }
  return [];
}

// プレイヤーが n 回引く。最後の1枚を引いたらラストワン賞もつく
export function drawKuji(s, n) {
  n = Math.min(n, kujiLeft(s));
  const cost = n * KUJI_PRICE;
  if (n <= 0) return { ok: false, msg: 'もう残っていない' };
  if (s.cash < cost) return { ok: false, msg: 'お金が足りない…' };
  const got = [];
  for (let i = 0; i < n; i++) got.push(drawOne(s));
  s.cash -= cost;
  s.stats.spent += cost;
  s.cur.spent += cost;
  s.ledger.push({ week: s.week, text: `くじ ${n}回`, amount: -cost });
  const count = {};
  for (const p of got) count[p.pid] = (count[p.pid] || 0) + 1;
  for (const [pid, q] of Object.entries(count)) addUnits(s, pid, q, KUJI_PRICE);
  const last = kujiLeft(s) === 0;
  if (last) {
    addUnits(s, LAST_ONE, 1, 0);
    s.kuji.lastTaken = true;
  }
  s.stats.kujiDrawn = (s.stats.kujiDrawn || 0) + n;
  if (count.kuji_a) s.stats.kujiA = (s.stats.kujiA || 0) + 1;
  return { ok: true, got: got.map((p) => p.tier), count, last, cost };
}
