import { TOTAL_WEEKS, weekLabel } from '../engine/calendar.js';
import { EXP_TYPES } from '../engine/abilities.js';
import { MOOD_LABELS } from '../engine/effects.js';
import { MIN_PAYMENT } from '../engine/finance.js';
import { stageOf } from '../engine/career.js';
import { currentMission } from '../engine/tutorial.js';
import { $, clear, h, yenFmt } from './dom.js';

const MOOD_CLASS = ['m0', 'm1', 'm2', 'm3', 'm4'];

// 行動を選んでいる間の予告（体力・所持金・経験点の増減）
let preview = null;
export function setPreview(p) {
  preview = p;
}

function staminaBar(s) {
  const max = s.maxStamina;
  const now = s.stamina;
  const d = preview?.stamina || 0;
  const after = Math.max(0, Math.min(max, now + d));
  const pct = (v) => `${(v / max) * 100}%`;
  const low = Math.min(now, after);
  const risk = preview?.risk || 0;
  return h('div', { class: 'stamina', title: '体力' },
    h('img', { src: 'assets/icons/hp.png', alt: '' }),
    h('div', { class: `bar ${after / max < 0.3 ? 'low' : ''}` },
      h('i', { style: { width: pct(low) } }),
      d ? h('i', { class: `ghost ${d < 0 ? 'lose' : 'gain'}`, style: { left: pct(low), width: pct(Math.abs(after - now)) } }) : null,
    ),
    d
      ? h('span', { class: `st-num ${d < 0 ? 'lose' : 'gain'}` }, `${now}→${after}`, risk > 0 ? h('b', { class: `risk ${risk >= 0.3 ? 'high' : ''}` }, ` ⚠${Math.round(risk * 100)}%`) : null)
      : h('span', { class: 'st-num' }, `${now}/${max}`),
  );
}

export function renderHud(s) {
  const el = clear($('#hud'));
  const weeksLeft = TOTAL_WEEKS - s.week;
  const st = stageOf(s);
  const mission = currentMission(s);
  const rows = [
    h('div', { class: 'hud-row top' },
      h('div', { class: 'date' }, h('b', {}, weekLabel(Math.min(s.week, TOTAL_WEEKS - 1))), h('small', {}, ` 残り${weeksLeft}週`)),
      h('div', { class: `mood ${MOOD_CLASS[s.mood]}`, title: 'やる気' }, `やる気: ${MOOD_LABELS[s.mood]}`),
    ),
    h('div', { class: 'hud-row money' },
      h('div', { class: 'cash' }, h('img', { src: 'assets/icons/gum.png', alt: '' }), h('span', { class: s.cash < 0 ? 'neg' : '' }, yenFmt(s.cash)),
        preview?.cash ? h('small', { class: `cash-d ${preview.cash < 0 ? 'lose' : 'gain'}` }, `${preview.cash > 0 ? '+' : '−'}${Math.abs(preview.cash).toLocaleString('ja-JP')}`) : null),
      s.debt > 0 ? h('div', { class: 'debt' }, '借金 ', h('b', {}, yenFmt(s.debt))) : h('div', { class: 'debt clear' }, '借金なし'),
    ),
    h('div', { class: 'hud-row bars' },
      staminaBar(s),
      h('div', { class: 'chips' },
        h('span', { class: 'chip stage', title: st.goal }, `ステージ${st.id} ${st.name}`),
        h('span', { class: 'chip', title: 'セラー評価' }, `評価 ${Math.round(s.rating)}`),
        h('span', { class: `chip ${s.hate >= 50 ? 'warn' : ''}`, title: '炎上度' }, `炎上 ${Math.round(s.hate)}`),
        s.sick > 0 ? h('span', { class: 'chip warn' }, '体調不良') : null,
        s.banWeeks > 0 ? h('span', { class: 'chip warn' }, `プンシー停止${s.banWeeks}週`) : null,
        s.delinquency > 0 ? h('span', { class: 'chip warn' }, `滞納${s.delinquency}`) : null,
      ),
    ),
    mission ? h('div', { class: 'hud-mission' }, h('b', {}, `目標：${mission.title}`), h('small', {}, mission.hint)) : null,
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

// ステージ右側の経験点パネル。予告中は増える量、獲得時は光らせる
export function renderParams(s, { gains = null } = {}) {
  const el = clear($('#params'));
  const d = gains || preview?.exp || {};
  for (const e of EXP_TYPES) {
    const v = d[e.id] || 0;
    el.append(h('div', { class: `pr ${e.id} ${v ? (gains ? 'up' : 'pre') : ''}` },
      h('span', { class: 'pn' }, e.name),
      h('b', {}, Math.floor(s.exp[e.id])),
      h('i', {}, v ? `+${v}` : ''),
    ));
  }
}
