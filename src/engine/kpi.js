// 経営指標（KPI）。月ごとに記録を締め、ステージや解放ノードに応じて見える指標が増える。

import { monthOf, yearOf } from './calendar.js';
import { hasSkill } from './effects.js';

export const emptyMonth = () => ({
  revenue: 0, salesProfit: 0, expenses: 0, passive: 0, sold: 0, bought: 0, spent: 0, hours: 0, daysSum: 0, lossCuts: 0, returns: 0,
});

// 経費（仕事のための支出）。生活費や借金の利息は含めない。
export function addExpense(s, amount, label) {
  amount = Math.round(amount);
  if (!amount) return;
  s.cash -= amount;
  s.cur.expenses += amount;
  s.stats.expenses += amount;
  s.ledger.push({ week: s.week, text: `経費: ${label}`, amount: -amount });
}

export const addHours = (s, h) => {
  s.cur.hours += h;
};

export const monthNet = (m) => m.salesProfit - m.expenses + m.passive;

const WEEK_DAYS = 7;
export const heldDays = (s, u) => (s.week - u.week) * WEEK_DAYS;

// 在庫の集計（仕入れ値ベース）
export function inventoryStats(s) {
  let cost = 0;
  let stale60 = 0;
  let stale60Cost = 0;
  let stale90Cost = 0;
  for (const u of s.inventory) {
    if (u.arrive > s.week) continue;
    cost += u.cost;
    const d = heldDays(s, u);
    if (d >= 60) {
      stale60++;
      stale60Cost += u.cost;
    }
    if (d >= 90) stale90Cost += u.cost;
  }
  return { count: s.inventory.length, cost, stale60, stale60Cost, stale90Cost };
}

// 月末に呼んで、今月の記録を締める
export function closeMonth(s) {
  const inv = inventoryStats(s);
  const rec = {
    week: s.week, year: yearOf(s.week), month: monthOf(s.week), ...s.cur, net: monthNet(s.cur),
    invCost: inv.cost, stale90Cost: inv.stale90Cost, cash: s.cash,
  };
  s.monthly.push(rec);
  if (s.monthly.length > 130) s.monthly.shift();
  s.cur = emptyMonth();
  return rec;
}

export const recentMonths = (s, n) => s.monthly.slice(-n);
export const sumNet = (months) => months.reduce((a, m) => a + m.net, 0);

// 見える KPI の段階：1=素人（利益額・売上・個数） 2=中級（利益率・回転・滞留） 3=玄人（資金効率・時間単価…）
export function kpiLevel(s) {
  if (hasSkill(s, 'kpi_pro')) return 3;
  if (hasSkill(s, 'kpi_mid')) return 2;
  return 1;
}

// 指標の計算。m は月の記録（または進行中の s.cur）
export function computeKpis(s, m) {
  const inv = inventoryStats(s);
  const net = monthNet(m);
  const invested = Math.max(1, m.invCost ?? inv.cost);
  return {
    net,
    revenue: m.revenue,
    sold: m.sold,
    perItem: m.sold ? Math.round(m.salesProfit / m.sold) : 0,
    bought: m.bought,
    margin: m.revenue ? net / m.revenue : 0,
    turnoverDays: m.sold ? Math.round(m.daysSum / m.sold) : 0,
    stale60: inv.stale60,
    stale60Cost: inv.stale60Cost,
    roi: net / invested,
    hourly: m.hours ? Math.round(net / m.hours) : 0,
    stale90Ratio: inv.cost ? inv.stale90Cost / inv.cost : 0,
    lossCutRate: m.sold ? m.lossCuts / m.sold : 0,
    returnRate: m.sold ? m.returns / m.sold : 0,
    cash: s.cash,
  };
}

export const KPI_DEFS = [
  { id: 'net', level: 1, name: '純利益（手残り）', fmt: 'yen', desc: '売上 − 仕入れ値 − 手数料 − 送料 − 経費' },
  { id: 'revenue', level: 1, name: '売上', fmt: 'yen', desc: '売れた金額の合計' },
  { id: 'sold', level: 1, name: '売れた個数', fmt: 'count' },
  { id: 'perItem', level: 1, name: '1個あたりの利益', fmt: 'yen' },
  { id: 'margin', level: 2, name: '利益率', fmt: 'pct', desc: '純利益 ÷ 売上。新品で10〜20%、中古で20〜40%が目安' },
  { id: 'turnoverDays', level: 2, name: '平均回転日数', fmt: 'days', desc: '仕入れてから売れるまで。30〜90日以内が理想' },
  { id: 'stale60', level: 2, name: '60日超の滞留在庫', fmt: 'count' },
  { id: 'roi', level: 3, name: '資金効率（ROI）', fmt: 'pct', desc: '純利益 ÷ 在庫に寝ている資金' },
  { id: 'hourly', level: 3, name: '時間単価', fmt: 'yen', desc: '純利益 ÷ 作業時間' },
  { id: 'stale90Ratio', level: 3, name: '90日超在庫の比率', fmt: 'pct', desc: '在庫金額のうち90日以上売れていない割合' },
  { id: 'lossCutRate', level: 3, name: '損切り率', fmt: 'pct' },
  { id: 'returnRate', level: 3, name: '返品・キャンセル率', fmt: 'pct' },
];

export function formatKpi(def, v) {
  if (def.fmt === 'yen') return `${Math.round(v).toLocaleString('ja-JP')}円`;
  if (def.fmt === 'pct') return `${(v * 100).toFixed(1)}%`;
  if (def.fmt === 'days') return `${v}日`;
  return `${v}`;
}

// 売れたときの記録
export function recordSale(s, sale) {
  s.cur.revenue += sale.price;
  s.cur.salesProfit += sale.profit;
  s.cur.sold++;
  s.cur.daysSum += Math.max(0, heldDays(s, sale.unit));
  if (sale.profit < 0) s.cur.lossCuts++;
}
