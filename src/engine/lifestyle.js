// 生活水準と、仕入れ先への出資（儲けを消費するルート）。
// 生活水準：稼ぐと暮らしを上げる誘いが来る。上げると体力・やる気に効くが、毎月の出費が増え、下げるとやる気が大きく落ちる（ラチェット）。
// 出資：開拓した仕入れ先にお金を出すと、品ぞろえが増え、荒れにくくなり、毎月少し配当が入る
import { addCash, addExp, addMood } from './effects.js';
import { addExpense, recentMonths, sumNet } from './kpi.js';
import { SPOT_MAP, hasSpot } from './pioneer.js';
import { choice, info, sfx, talk } from './steps.js';

// ---------------- 生活水準 ----------------
// need：直近3か月の純利益の平均がこれを超えると、次の暮らしの誘いが来る。cost：毎月の出費（積み上がる）
export const LIFESTYLES = [
  { name: '実家の延長のワンルーム', cost: 0, perk: '' },
  { name: '1LDKに引っ越す', need: 300000, cost: 80000, perk: '毎週の体力の回復 +3', pitch: '「部屋が段ボールで埋まってるじゃない。そろそろ、ちゃんとした部屋に住んだら？」', who: 'mine' },
  { name: '車を買う', need: 800000, cost: 120000, perk: '店舗せどり・業者オークション・問屋の体力 -15%、置き場 +20', pitch: '「仕入れに車があれば、郊外の店も回れるし、トランクも倉庫になるわよ」', who: 'mine' },
  { name: '家事代行を頼む', need: 1500000, cost: 150000, perk: '毎週の体力の回復 +5、やる気が下がりにくい', pitch: '「家のことに時間を使うのは、もったいないですわ。お任せになったら？」', who: 'marie' },
  { name: 'タワーマンションに住む', need: 4000000, cost: 400000, perk: '毎月やる気 +1、上の階の住人との付き合い（対人 +20/月）', pitch: '「いい景色じゃろう。成功した者には、成功した者の住む場所がある」', who: 'nobunaga' },
];
export const lifeLevel = (s) => s.lifestyle || 0;
export const lifeCost = (s) => LIFESTYLES.slice(1, lifeLevel(s) + 1).reduce((a, x) => a + x.cost, 0);
export const lifeStaminaBonus = (s) => (lifeLevel(s) >= 1 ? 3 : 0) + (lifeLevel(s) >= 3 ? 5 : 0);
export const hasCar = (s) => lifeLevel(s) >= 2;
const avgNet = (s) => {
  const m = recentMonths(s, 3);
  return m.length === 3 ? sumNet(m) / 3 : 0;
};
export const nextLifestyle = (s) => LIFESTYLES[lifeLevel(s) + 1] || null;
export const canRaiseLife = (s) => !!nextLifestyle(s) && avgNet(s) >= nextLifestyle(s).need && s.week >= (s.flags.lifeCool || 0);

export function raiseLife(s) {
  if (!nextLifestyle(s)) return false;
  s.lifestyle = lifeLevel(s) + 1;
  addMood(s, 1);
  return true;
}
// 下げる：一度上げた暮らしを下げるのはつらい（やる気 -2、24週は上げられない）
export function lowerLife(s) {
  if (!lifeLevel(s)) return false;
  s.lifestyle = lifeLevel(s) - 1;
  addMood(s, -2);
  s.flags.lifeCool = s.week + 24;
  return true;
}

// 週のはじめ：稼げるようになったら、次の暮らしの誘い
export function lifestyleWeek(s) {
  if (s.underworld || !canRaiseLife(s)) return [];
  const nx = nextLifestyle(s);
  return [
    talk(nx.who, nx.pitch),
    info(`暮らしを上げる？：${nx.name}`, [nx.perk, `毎月の出費 +${nx.cost.toLocaleString('ja-JP')}円（いまの暮らしの出費と合わせて ${(lifeCost(s) + nx.cost).toLocaleString('ja-JP')}円）`, '一度上げた暮らしを下げると、やる気が大きく下がる']),
    choice([
      { label: '暮らしを上げる', run: () => { raiseLife(s); return [sfx('levelup'), info(nx.name, [nx.perk, 'やる気が上がった'], 'good')]; } },
      { label: '今のままでいい', run: () => { s.flags.lifeCool = s.week + 24; return [talk('chris', '……まだ贅沢はいいや。お金は仕入れに回そう。', 'arms')]; } },
    ]),
  ];
}

// 月末：暮らしの出費と、タワーマンションの効果
export function lifestyleMonthly(s) {
  const cost = lifeCost(s);
  if (cost) addCash(s, -cost, `暮らしの出費（${LIFESTYLES[lifeLevel(s)].name}まで）`);
  if (lifeLevel(s) >= 4) {
    addMood(s, 1);
    addExp(s, { social: 20 });
  }
}

// ---------------- 仕入れ先への出資 ----------------
export const INVEST_MAX = 2;
export const investLevel = (s, spot) => s.invest?.[spot] || 0;
export const investCost = (spotId, lv) => (['auction', 'wholesale'].includes(SPOT_MAP[spotId].route) ? 2000000 : 1000000) * (lv + 1);

export function investIn(s, spotId) {
  const lv = investLevel(s, spotId);
  if (!hasSpot(s, spotId) || lv >= INVEST_MAX) return false;
  const cost = investCost(spotId, lv);
  if (s.cash < cost) return false;
  addExpense(s, cost, `出資：${SPOT_MAP[spotId].name}`);
  s.invest = { ...(s.invest || {}), [spotId]: lv + 1 };
  s.investTotal = { ...(s.investTotal || {}), [spotId]: (s.investTotal?.[spotId] || 0) + cost };
  return true;
}
// 出資の効果（offers・inventory・rivals が参照）
export const investWeight = (s, spot) => 1 + 0.5 * investLevel(s, spot); // 品ぞろえ
export const investQty = (s, spot) => 1 + 0.5 * investLevel(s, spot); // 一度に買える数
export const investPrice = (s, spot) => (investLevel(s, spot) >= 2 ? 0.95 : 1); // Lv2 は仕入れ値 -5%
export const investSatMult = (s, spot) => (investLevel(s, spot) ? 0.5 : 1); // 買ったときの荒れ方が半分
export const investDecay = (s, spot) => (investLevel(s, spot) ? 2 : 0); // 毎週さらに落ち着く
// 毎月の配当：出資額の0.5%
export const dividend = (s) => Math.round(Object.values(s.investTotal || {}).reduce((a, v) => a + v, 0) * 0.005);
