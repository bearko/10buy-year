import { weekLabel, TOTAL_WEEKS } from '../engine/calendar.js';
import { MOOD_LABELS } from '../engine/effects.js';
import { MIN_PAYMENT } from '../engine/finance.js';
import { $, clear, h, yenFmt } from './dom.js';

const MOOD_CLASS = ['m0', 'm1', 'm2', 'm3', 'm4'];

export function renderHud(s) {
  const el = clear($('#hud'));
  const pct = Math.round((s.stamina / s.maxStamina) * 100);
  const weeksLeft = TOTAL_WEEKS - s.week;
  const rows = [
    h('div', { class: 'hud-row top' },
      h('div', { class: 'date' }, h('b', {}, weekLabel(Math.min(s.week, TOTAL_WEEKS - 1))), h('small', {}, ` 残り${weeksLeft}週`)),
      h('div', { class: `mood ${MOOD_CLASS[s.mood]}`, title: 'やる気' }, `やる気: ${MOOD_LABELS[s.mood]}`),
    ),
    h('div', { class: 'hud-row money' },
      h('div', { class: 'cash' }, h('img', { src: 'assets/icons/gum.png', alt: '' }), h('span', { class: s.cash < 0 ? 'neg' : '' }, yenFmt(s.cash))),
      h('div', { class: 'debt' }, '借金 ', h('b', {}, yenFmt(s.debt))),
    ),
    h('div', { class: 'hud-row bars' },
      h('div', { class: 'stamina', title: '体力' },
        h('img', { src: 'assets/icons/hp.png', alt: '' }),
        h('div', { class: `bar ${pct < 30 ? 'low' : ''}` }, h('i', { style: { width: `${pct}%` } })),
        h('span', {}, `${s.stamina}/${s.maxStamina}`),
      ),
      h('div', { class: 'chips' },
        h('span', { class: 'chip', title: 'セラー評価' }, `評価 ${Math.round(s.rating)}`),
        h('span', { class: `chip ${s.hate >= 50 ? 'warn' : ''}`, title: '炎上度' }, `炎上 ${Math.round(s.hate)}`),
        s.sick > 0 ? h('span', { class: 'chip warn' }, '体調不良') : null,
        s.banWeeks > 0 ? h('span', { class: 'chip warn' }, `メルクリ停止${s.banWeeks}週`) : null,
        s.delinquency > 0 ? h('span', { class: 'chip warn' }, `滞納${s.delinquency}`) : null,
      ),
    ),
    s.week % 4 === 3 && s.debt > 0 ? h('div', { class: 'hud-alert' }, `今週末は返済日！ 最低 ${yenFmt(Math.min(MIN_PAYMENT, s.debt))}${s.card.due ? ` ＋カード ${yenFmt(s.card.due)}` : ''}`) : null,
  ];
  el.append(...rows.filter(Boolean));
}

export function renderTicker(s) {
  const el = clear($('#news-ticker'));
  if (!s.news?.length) return;
  const item = s.news[0];
  el.append(h('span', { class: `news ${item.kind}` }, item.text));
  if (s.news.length > 1) el.append(h('small', {}, ` ほか${s.news.length - 1}件（相場画面で確認）`));
}
