// 経営画面のグラフ。月の純利益の推移（黒字は上・赤字は下）と、在庫を持っている日数の分布
import { heldDays } from '../engine/kpi.js';
import { h, signYen, yenFmt } from './dom.js';

// 月の純利益：12本の棒。タップ（ホバー）したら、その月の数字を下に出す
export function profitChart(months) {
  const max = Math.max(1, ...months.map((m) => Math.abs(m.net)));
  const hasLoss = months.some((m) => m.net < 0);
  const hasGain = months.some((m) => m.net > 0);
  const up = hasLoss ? (hasGain ? 0.62 : 0) : 1; // 0の線より上に使う高さの割合
  const label = (m) => `${m.year}年目${m.month}月：純利益 ${signYen(m.net)}・売上 ${yenFmt(m.revenue)}・${m.sold}個`;
  const caption = h('div', { class: 'ch-cap' }, label(months[months.length - 1]));
  const pick = (el, m) => {
    for (const b of el.parentNode.children) b.classList.toggle('on', b === el);
    caption.textContent = label(m);
  };
  const cols = months.map((m, i) => {
    const pct = (Math.abs(m.net) / max) * 100;
    const col = h('button', { class: `ch-col ${i === months.length - 1 ? 'on' : ''}`, 'aria-label': label(m) },
      h('div', { class: 'ch-up', style: { flexBasis: `${up * 100}%` } }, m.net > 0 ? h('i', { class: 'ch-bar gain', style: { height: `${pct}%` } }) : null),
      h('div', { class: 'ch-down', style: { flexBasis: `${(1 - up) * 100}%` } }, m.net < 0 ? h('i', { class: 'ch-bar loss', style: { height: `${pct}%` } }) : null),
      h('small', {}, `${m.month}月`));
    col.addEventListener('pointerenter', () => pick(col, m));
    col.addEventListener('click', () => pick(col, m));
    return col;
  });
  return h('figure', { class: 'ch' },
    h('figcaption', {}, '月の純利益', h('small', {}, `（上が黒字・下が赤字。最大 ${yenFmt(max)}）`)),
    h('div', { class: 'ch-plot' }, ...cols),
    caption);
}

// 在庫を持っている日数：30日ごとの4つの区切りに、何個・いくら分あるか
export function agingChart(s) {
  const bins = [
    { label: '〜30日', n: 0, cost: 0 },
    { label: '31〜60日', n: 0, cost: 0 },
    { label: '61〜90日', n: 0, cost: 0 },
    { label: '91日〜（滞留）', n: 0, cost: 0 },
  ];
  for (const u of s.inventory) {
    if (u.arrive > s.week) continue;
    const d = heldDays(s, u);
    const b = bins[d <= 30 ? 0 : d <= 60 ? 1 : d <= 90 ? 2 : 3];
    b.n++;
    b.cost += u.cost;
  }
  const max = Math.max(1, ...bins.map((b) => b.n));
  return h('figure', { class: 'ch' },
    h('figcaption', {}, '在庫を持っている日数', h('small', {}, '（個数と仕入れ額）')),
    h('div', { class: 'ch-rows' }, ...bins.map((b) => h('div', { class: 'ch-row' },
      h('span', {}, b.label),
      h('div', { class: 'ch-track' }, b.n ? h('i', { style: { width: `${(b.n / max) * 100}%` } }) : null),
      h('b', {}, `${b.n}個`, h('small', {}, yenFmt(b.cost)))))));
}
