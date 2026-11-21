// 「つづきから」のときに見せる、前回までのカード：いまの週・お金・目標の進み具合・進行中のミッション・在庫
import { TOTAL_WEEKS, weekLabel } from '../engine/calendar.js';
import { goalOf, stageOf } from '../engine/career.js';
import { activeUnits } from '../engine/inventory.js';
import { questRows } from '../engine/quests.js';
import { currentMission } from '../engine/tutorial.js';
import { $, h, yenFmt } from './dom.js';

const man = (v) => (Math.abs(v) >= 10000 ? `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万` : `${Math.round(v).toLocaleString('ja-JP')}`);

export function resumeCard(s) {
  const g = goalOf(s);
  const st = stageOf(s);
  const pct = Math.max(0, Math.min(100, (g.value / g.target) * 100));
  const tut = currentMission(s);
  const quests = questRows(s).slice(0, 3);
  const units = activeUnits(s);
  const listed = units.filter((u) => u.listing).length;
  return new Promise((resolve) => {
    const close = () => {
      root.remove();
      window.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e) => {
      if (['Escape', 'Enter', ' '].includes(e.key)) close();
    };
    const root = h('div', { class: 'goal-pop resume-pop', onclick: (e) => { if (e.target === root) close(); } },
      h('div', { class: 'gp-card rs-card' },
        h('div', { class: 'gp-kicker' }, '前回まで'),
        h('div', { class: 'rs-date' }, h('b', {}, weekLabel(Math.min(s.week, TOTAL_WEEKS - 1))), h('small', {}, ` 残り${TOTAL_WEEKS - s.week}週・ステージ${st.id}「${st.name}」`)),
        h('div', { class: 'rs-money' },
          h('div', {}, h('small', {}, '所持金'), h('b', {}, yenFmt(s.cash))),
          s.debt > 0 ? h('div', {}, h('small', {}, '借金'), h('b', { class: 'neg' }, yenFmt(s.debt))) : h('div', {}, h('small', {}, '借金'), h('b', { class: 'pos' }, '完済'))),
        h('div', { class: 'mc-goal' },
          h('div', { class: 'mc-goal-top' }, h('small', {}, `目標 ${g.short}`), h('b', {}, `${man(g.value)}/${man(g.target)}`)),
          h('div', { class: `goal-bar ${pct >= 100 ? 'done' : ''}` }, h('i', { style: { width: `${pct}%` } })),
          h('small', { class: 'mc-note' }, g.note)),
        h('ul', { class: 'rs-list' },
          tut ? h('li', {}, h('small', {}, 'いまの目標'), tut.title) : null,
          ...quests.map((q) => h("li", {}, h("small", {}, "ミッション"), `${q.def.title}（${q.now}/${q.target}）`)),
          h('li', {}, h('small', {}, '在庫'), `${units.length}点（出品中 ${listed}点）`)),
        h('button', { class: 'btn primary big gp-go', onclick: close }, 'つづける')));
    window.addEventListener('keydown', onKey);
    $('#modal-root').append(root);
  });
}
