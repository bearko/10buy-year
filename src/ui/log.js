// 会話ログ。オート（ルーティン）中に流れた会話やイベントも、あとから読み返せる
import { CAST } from '../data/cast.js';
import { weekLabel } from '../engine/calendar.js';
import { h } from './dom.js';
import { openModal } from './modal.js';

export const LOG_MAX = 300;

export function pushLog(s, entry, auto) {
  (s.log ||= []).push({ week: s.week, auto: !!auto, ...entry });
  if (s.log.length > LOG_MAX) s.log.splice(0, s.log.length - LOG_MAX);
}

const FILTERS = [
  { id: 'all', label: 'すべて', test: () => true },
  { id: 'talk', label: '会話', test: (e) => e.kind === 'talk' || e.kind === 'narr' || e.kind === 'choice' },
  { id: 'info', label: 'お知らせ', test: (e) => e.kind === 'info' },
];

const speaker = (who) => {
  if (!who || who === 'narr') return '';
  const c = CAST[who];
  return c ? c.name : who;
};

export function logModal(s) {
  let filter = 'all';
  return openModal('ログ', (body, api) => {
    const f = FILTERS.find((x) => x.id === filter);
    body.append(h('div', { class: 'log-tabs' }, ...FILTERS.map((x) => h('button', { class: x.id === filter ? 'on' : '', onclick: () => { filter = x.id; api.refresh(); } }, x.label))));
    const list = (s.log || []).filter(f.test);
    if (!list.length) {
      body.append(h('p', { class: 'empty' }, 'まだ記録がない'));
      return;
    }
    // 新しい週を上に。週の中は起きた順
    const weeks = new Map();
    for (const e of list) {
      if (!weeks.has(e.week)) weeks.set(e.week, []);
      weeks.get(e.week).push(e);
    }
    for (const [week, entries] of [...weeks].reverse()) {
      body.append(
        h('div', { class: 'log-week' }, weekLabel(week), entries.some((e) => e.auto) ? h('span', { class: 'log-auto' }, 'AUTO') : null),
        ...entries.map((e) => h('div', { class: `log-row k-${e.kind} ${e.tone || ''}` },
          e.kind === 'info' ? h('b', {}, `【${e.who}】`) : speaker(e.who) ? h('b', {}, speaker(e.who)) : null,
          h('span', {}, e.text))),
      );
    }
    requestAnimationFrame(() => { body.scrollTop = 0; });
  });
}
