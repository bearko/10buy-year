// 月末の決算カード：今月の純利益（カウントアップ）・先月との差・ステージの目標のゲージ（貯まっていく）。
// お知らせの「◯月の締め」と同じ内容を、1枚のカードで見せる。タップ1回で閉じる（オート中は少し見せて進む）
import { goalOf } from '../engine/career.js';
import { $, h, signYen, yenFmt } from './dom.js';
import { isAuto, logEntry } from './stage.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const man = (v) => (Math.abs(v) >= 10000 ? `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万` : `${Math.round(v).toLocaleString('ja-JP')}`);

// ステージ1は「その月の」純利益で判断する（goalOf は締めたあとの新しい月を見るので、ここで作る）
function goalFor(s, st) {
  if (st.stage !== 1) return goalOf(s);
  let streak = 0;
  for (const m of s.monthly.slice(-2).reverse()) {
    if (m.net >= 50000) streak++;
    else break;
  }
  return { short: '月の純利益', value: st.net, target: 50000, note: `連続 ${streak}/2か月` };
}

function countUp(el, to, ms) {
  if (reduced()) {
    el.textContent = signYen(to);
    return;
  }
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    el.textContent = signYen(Math.round(to * (1 - (1 - k) ** 3)));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export function monthCard(s, st) {
  logEntry({ who: st.title, text: st.lines.filter(Boolean).join('\n'), kind: 'info', tone: st.tone });
  const g = goalFor(s, st);
  const pct = Math.max(0, Math.min(100, (g.value / g.target) * 100));
  const net = h('b', { class: `mc-net ${st.net >= 0 ? 'pos' : 'neg'}` }, signYen(0));
  const bar = h('i', { style: { width: '0%' } });
  const diff = st.prevNet == null ? null : st.net - st.prevNet;
  return new Promise((resolve) => {
    const close = () => {
      root.remove();
      window.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e) => {
      if (['Escape', 'Enter', ' '].includes(e.key)) close();
    };
    const root = h('div', { class: 'goal-pop month-pop', onclick: (e) => { if (e.target === root) close(); } },
      h('div', { class: `gp-card mc-card ${st.net >= 0 ? '' : 'red'}` },
        h('div', { class: 'gp-kicker' }, st.title),
        h('small', { class: 'mc-label' }, '今月の純利益'),
        net,
        h('div', { class: 'mc-sub' },
          h('span', {}, `売上 ${yenFmt(st.revenue)}・${st.sold}個`),
          diff == null ? null : h('span', { class: diff >= 0 ? 'pos' : 'neg' }, `先月より ${signYen(diff)}`)),
        h('div', { class: 'mc-goal' },
          h('div', { class: 'mc-goal-top' }, h('small', {}, `目標 ${g.short}`), h('b', {}, `${man(g.value)}/${man(g.target)}`)),
          h('div', { class: `goal-bar ${pct >= 100 ? 'done' : ''}` }, bar),
          h('small', { class: 'mc-note' }, g.note)),
        st.lines.length > 1 ? h('div', { class: 'mc-lines' }, ...st.lines.slice(1).map((l) => h('div', {}, l))) : null,
        h('button', { class: 'btn primary big gp-go', onclick: close }, 'OK')));
    window.addEventListener('keydown', onKey);
    $('#modal-root').append(root);
    countUp(net, st.net, 700);
    requestAnimationFrame(() => requestAnimationFrame(() => { bar.style.width = `${pct}%`; }));
    if (isAuto()) setTimeout(close, 700);
  });
}
