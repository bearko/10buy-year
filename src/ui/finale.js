// エンディングのふり返り：査定を順番に見せる演出・10年のグラフ・名場面・結果の画像カード
import { STAGES } from '../engine/career.js';
import { weekLabel } from '../engine/calendar.js';
import { productOf } from '../data/products.js';
import { tr } from '../i18n/index.js';
import { playSe } from './audio.js';
import { h, signYen, wait, yenFmt } from './dom.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const man = (v) => (Math.abs(v) >= 10000 ? `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円` : yenFmt(v));

// 年ごとにまとめる（記録は月ごと。最後の年は途中で終わることもある）
function byYear(monthly) {
  const years = [];
  for (const m of monthly) {
    const y = (years[m.year - 1] ||= { year: m.year, net: 0, revenue: 0, sold: 0, months: [] });
    y.net += m.net;
    y.revenue += m.revenue || 0;
    y.sold += m.sold || 0;
    y.months.push(m);
  }
  return years.filter(Boolean);
}

// 10年の月ごとの純利益（棒）と、利益の積み上げ（線）。年をタップすると、その年の数字
export function decadeChart(monthly) {
  if (!monthly.length) return null;
  const n = monthly.length;
  const max = Math.max(1, ...monthly.map((m) => Math.abs(m.net)));
  let acc = 0;
  const cum = monthly.map((m) => (acc += m.net));
  const cMax = Math.max(1, ...cum);
  const cMin = Math.min(0, ...cum);
  const H = 100;
  const hasLoss = monthly.some((m) => m.net < 0);
  const hasGain = monthly.some((m) => m.net > 0);
  const up = hasLoss ? (hasGain ? 0.62 : 0) : 1; // 0の線より上に使う高さの割合（経営画面のグラフと同じ）
  const zero = H * up;
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', `0 0 ${n} ${H}`);
  svg.setAttribute('preserveAspectRatio', 'none');
  svg.setAttribute('class', 'dc-svg');
  svg.setAttribute('aria-hidden', 'true');
  const add = (tag, attrs) => {
    const el = document.createElementNS(ns, tag);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    svg.append(el);
    return el;
  };
  add('line', { x1: 0, x2: n, y1: zero, y2: zero, class: 'dc-zero' });
  monthly.forEach((m, i) => {
    const hgt = (Math.abs(m.net) / max) * H * (m.net >= 0 ? up : 1 - up);
    if (hgt > 0) add('rect', { x: i + 0.15, width: 0.7, y: m.net >= 0 ? zero - hgt : zero, height: hgt, class: m.net >= 0 ? 'dc-gain' : 'dc-loss' });
  });
  const yOf = (v) => H - 4 - ((v - cMin) / (cMax - cMin || 1)) * (H - 8);
  add('polyline', { points: cum.map((v, i) => `${i + 0.5},${yOf(v).toFixed(2)}`).join(' '), class: 'dc-line' });

  const years = byYear(monthly);
  const best = years.reduce((a, y) => (y.net > a.net ? y : a), years[0]);
  const label = (y) => `${y.year}年目：純利益 ${signYen(y.net)}・売上 ${yenFmt(y.revenue)}・${y.sold}個`;
  const caption = h('div', { class: 'ch-cap' }, h('b', {}, 'いちばん稼いだ年'), h('br'), label(best));
  const hits = h('div', { class: 'dc-hits' }, ...years.map((y) => {
    const b = h('button', { class: 'dc-hit', style: { flexGrow: y.months.length }, 'aria-label': label(y) }, h('small', {}, `${y.year}`));
    const pick = () => {
      for (const x of hits.children) x.classList.toggle('on', x === b);
      caption.textContent = label(y);
    };
    b.addEventListener('click', pick);
    b.addEventListener('pointerenter', pick);
    return b;
  }));
  return h('figure', { class: 'ch dc' },
    h('figcaption', {}, '10年の純利益', h('small', {}, `（棒：月ごと・線：積み上げ ${man(cum[cum.length - 1])}）`)),
    h('div', { class: 'dc-plot' }, svg, hits),
    caption);
}

// 名場面：初めて売れた日・ステージが上がった日・完済した日・いちばん儲かった取引・いちばん稼いだ月
export function highlights(s) {
  const st = s.stats || {};
  const name = (pid) => productOf(pid)?.name || '';
  const list = [];
  if (st.firstFlip) list.push({ week: st.firstFlip.week, icon: '🛒', title: '初めて仕入れた品が売れた', text: `${name(st.firstFlip.pid)}が${yenFmt(st.firstFlip.price)}で（仕入れ ${yenFmt(st.firstFlip.cost)}）` });
  for (const [to, week] of Object.entries(s.stageWeeks || {})) {
    const stage = STAGES[Number(to) - 1];
    if (stage && Number(to) > 1) list.push({ week, icon: '⬆', title: `ステージ${stage.id}に上がった`, text: stage.name });
  }
  if (s.flags?.debtFree !== undefined) list.push({ week: s.flags.debtFree, icon: '🎉', title: '借金を返し終えた', text: '' });
  if (st.bestSale) list.push({ week: st.bestSale.week, icon: '💰', title: 'いちばん儲かった取引', text: `${name(st.bestSale.pid)}（${yenFmt(st.bestSale.price)}で売って 利益 ${signYen(st.bestSale.profit)}）` });
  const bestMonth = (s.monthly || []).reduce((a, m) => (!a || m.net > a.net ? m : a), null);
  if (bestMonth && bestMonth.net > 0) list.push({ week: bestMonth.week, icon: '📈', title: 'いちばん稼いだ月', text: `純利益 ${signYen(bestMonth.net)}・売上 ${yenFmt(bestMonth.revenue || 0)}` });
  // 週の分からない古い記録は最後に
  return list.sort((a, b) => (a.week ?? 1e9) - (b.week ?? 1e9));
}

export function highlightList(s) {
  const list = highlights(s);
  if (!list.length) return null;
  return h('div', { class: 'hl-list' },
    ...list.map((x) => h('div', { class: 'hl-row' },
      h('span', { class: 'hl-icon', 'aria-hidden': 'true' }, x.icon),
      h('div', { class: 'grow' },
        h('small', {}, x.week === undefined ? '' : weekLabel(x.week)),
        h('b', {}, x.title),
        x.text ? h('div', { class: 'hl-text' }, x.text) : null))));
}

// 金額のカウントアップ（data-count に最終の値）
function countUp(el, ms, skipped) {
  const to = Number(el.dataset.count);
  return new Promise((resolve) => {
    const t0 = performance.now();
    const step = (now) => {
      const k = skipped() ? 1 : Math.min(1, (now - t0) / ms);
      el.textContent = yenFmt(Math.round(to * (1 - (1 - k) ** 3)));
      if (k < 1) requestAnimationFrame(step);
      else resolve();
    };
    requestAnimationFrame(step);
  });
}

// 査定を順番に見せる：.rv の要素を上から1つずつ出す（data-hold：次までの間、ミリ秒）。
// 金額（data-count）はカウントアップ、ランク（.rv-stamp）は、はんこ。画面をタップしたら全部出す
export function revealSequence(root) {
  const items = [...root.querySelectorAll('.rv')];
  let skipped = false;
  const showAll = () => {
    skipped = true;
    items.forEach((el) => el.classList.add('in'));
    root.querySelectorAll('[data-count]').forEach((el) => { el.textContent = yenFmt(Number(el.dataset.count)); });
    root.classList.add('rv-done');
  };
  root.classList.add('rv-on');
  if (reduced()) {
    showAll();
    return;
  }
  root.addEventListener('click', (e) => {
    if (!e.target.closest('button, a, input, select')) showAll();
  });
  (async () => {
    for (const el of items) {
      if (skipped) return;
      el.classList.add('in');
      if (el.classList.contains('rv-stamp')) playSe('stageup');
      const counters = [...el.querySelectorAll('[data-count]')];
      if (counters.length) await Promise.all(counters.map((c) => countUp(c, 1100, () => skipped)));
      const hold = Number(el.dataset.hold || 450);
      for (let t = 0; t < hold && !skipped; t += 50) await wait(50);
    }
    root.classList.add('rv-done');
  })();
}

// 結果の画像カード（1200×630）。シェアに添える・保存する
export async function resultImage(r, s, { url, chris }) {
  const W = 1200;
  const H = 630;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d');
  const font = getComputedStyle(document.body).fontFamily;
  try {
    await document.fonts?.ready;
  } catch {
    /* noop */
  }
  const bg = g.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#1b2350');
  bg.addColorStop(1, '#0d1224');
  g.fillStyle = bg;
  g.fillRect(0, 0, W, H);
  g.strokeStyle = '#f5c54266';
  g.lineWidth = 6;
  g.strokeRect(18, 18, W - 36, H - 36);
  if (chris) {
    const img = await new Promise((res) => {
      const im = new Image();
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = chris;
    });
    if (img) {
      g.imageSmoothingEnabled = false;
      const ih = 360;
      const iw = (img.width / img.height) * ih;
      g.drawImage(img, W - iw - 60, H - ih - 70, iw, ih);
    }
  }
  const text = (t, x, y, size, color, align = 'left') => {
    g.font = `${size}px ${font}`;
    g.fillStyle = color;
    g.textAlign = align;
    g.fillText(tr(t), x, y);
  };
  text('10 buy year！ 最終査定', 60, 90, 34, '#f5c542');
  text(r.ending.title, 60, 160, 56, '#ffffff');
  // ランクのはんこ
  const colors = { S: '#ff5bd0', A: '#ff6b6b', B: '#ff9f40', C: '#ffe066', D: '#b7f05a', E: '#6be58f', F: '#7cc7ff', G: '#9aa3c7' };
  const rc = colors[r.rank] || '#fff';
  g.save();
  g.translate(150, 300);
  g.rotate(-0.12);
  g.strokeStyle = rc;
  g.lineWidth = 8;
  g.strokeRect(-80, -80, 160, 160);
  text(r.rank, 0, 48, 140, rc, 'center');
  g.restore();
  text(r.rankLabel, 270, 260, 38, '#f5c542');
  text(`称号：${r.title}`, 270, 312, 30, '#e8ecff');
  text(r.stage, 270, 360, 28, '#aab3d9');
  text(`純資産 ${yenFmt(r.netWorth)}`, 60, 470, 46, '#ffffff');
  text(`売上 ${yenFmt(r.revenue)}・売った商品 ${r.soldUnits}個`, 60, 525, 28, '#aab3d9');
  // 10年の積み上げを小さな線で
  const monthly = s.monthly || [];
  if (monthly.length > 1) {
    let acc = 0;
    const cum = monthly.map((m) => (acc += m.net));
    const mx = Math.max(1, ...cum);
    const mn = Math.min(0, ...cum);
    const x0 = 60;
    const x1 = 640;
    const y0 = 590;
    const y1 = 545;
    g.strokeStyle = '#6be58f';
    g.lineWidth = 3;
    g.beginPath();
    cum.forEach((v, i) => {
      const x = x0 + ((x1 - x0) * i) / (cum.length - 1);
      const y = y0 - ((v - mn) / (mx - mn || 1)) * (y0 - y1);
      if (i) g.lineTo(x, y);
      else g.moveTo(x, y);
    });
    g.stroke();
  }
  text(url.replace(/^https?:\/\//, '').replace(/\/$/, ''), W - 60, H - 40, 24, '#aab3d9', 'right');
  return new Promise((res) => c.toBlob(res, 'image/png'));
}
