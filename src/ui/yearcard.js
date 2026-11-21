// 年末の「1年のまとめ」カード：12か月の純利益のグラフ・去年との比較・その年に上がったステージ・借金の残り。
// 文のお知らせ（engine/turn.js の yearReport）と同じ中身を、1枚で見せる。タップ1回で閉じる
import { STAGES } from '../engine/career.js';
import { profitChart } from './charts.js';
import { $, h, signYen, yenFmt } from './dom.js';
import { isAuto, logEntry } from './stage.js';
import { playSe } from './audio.js';

export function yearCard(s, st) {
  logEntry({ who: st.title, text: st.lines.filter(Boolean).join('\n'), kind: 'info', tone: st.tone });
  const months = s.monthly.filter((m) => m.year === st.year);
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
      h('div', { class: 'gp-card mc-card yc-card' },
        h('div', { class: 'gp-kicker' }, `${st.year}年目のまとめ`),
        h('small', { class: 'mc-label' }, '年間の純利益'),
        h('b', { class: `mc-net ${st.net >= 0 ? 'pos' : 'neg'}` }, signYen(st.net)),
        h('div', { class: 'mc-sub' },
          h('span', {}, `売上 ${yenFmt(st.revenue)}・${st.sold}個`),
          diff == null ? null : h('span', { class: diff >= 0 ? 'pos' : 'neg' }, `去年より ${signYen(diff)}`)),
        months.length ? profitChart(months) : null,
        st.stagesUp.length ? h('div', { class: 'yc-up' }, ...st.stagesUp.map((n) => h('span', {}, `⬆ ステージ${n}「${STAGES[n - 1]?.name || ''}」に上がった`))) : null,
        h('div', { class: 'mc-lines' }, ...st.lines.slice(2).map((l) => h('div', {}, l))),
        h('button', { class: 'btn primary big gp-go', onclick: close }, 'OK')));
    window.addEventListener('keydown', onKey);
    $('#modal-root').append(root);
    playSe('levelup');
    if (isAuto()) setTimeout(close, 900);
  });
}
