import { TOTAL_WEEKS, weekLabel } from '../engine/calendar.js';
import { ABILITIES, ABILITY_MAX, abilityCost, canAfford, EXP_TYPES, rankOf } from '../engine/abilities.js';
import { MOOD_LABELS } from '../engine/effects.js';
import { minPayment } from '../engine/finance.js';
import { goalOf, stageOf } from '../engine/career.js';
import { currentMission } from '../engine/tutorial.js';
import { $, clear, h, yenFmt } from './dom.js';
import { openModal } from './modal.js';
import { isEn } from '../i18n/index.js';

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
    h('img', { src: 'assets/icons/hp.webp', alt: '' }),
    h('div', { class: `bar ${after / max < 0.3 ? 'low' : ''}` },
      h('i', { style: { width: pct(low) } }),
      d ? h('i', { class: `ghost ${d < 0 ? 'lose' : 'gain'}`, style: { left: pct(low), width: pct(Math.abs(after - now)) } }) : null,
    ),
    d
      ? h('span', { class: `st-num ${d < 0 ? 'lose' : 'gain'}` }, `${now}→${after}`, risk > 0 ? h('b', { class: `risk ${risk >= 0.3 ? 'high' : ''}` }, ` ⚠${Math.round(risk * 100)}%`) : null)
      : h('span', { class: 'st-num' }, `${now}/${max}`),
  );
}

// 右上の「ステージの目標」欄（借金完済後も役割を持ち続ける）
const man = (v) => (Math.abs(v) >= 10000 ? `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万` : `${Math.round(v).toLocaleString('ja-JP')}`);
function goalBox(s) {
  const g = goalOf(s);
  const pct = Math.max(0, Math.min(100, (g.value / g.target) * 100));
  return h('div', { class: `goal ${pct >= 100 && !g.warn ? 'done' : ''} ${g.warn ? 'warn' : ''}`, title: `${g.title}（${g.note}）` },
    h('div', { class: 'goal-top' }, h('small', {}, `目標 ${g.short}`), h('b', {}, `${man(g.value)}/${man(g.target)}`)),
    h('div', { class: 'goal-bar' }, h('i', { style: { width: `${pct}%` } })),
    h('small', { class: 'goal-note' }, g.note),
  );
}

export function renderHud(s) {
  const el = clear($('#hud'));
  const weeksLeft = TOTAL_WEEKS - s.week;
  const st = stageOf(s);
  const mission = currentMission(s);
  const rows = [
    h('div', { class: 'hud-row top' },
      h('div', { class: 'date' },
        h('b', {}, weekLabel(Math.min(s.week, TOTAL_WEEKS - 1))),
        h('small', {}, ` 残り${weeksLeft}週`),
        h('span', { class: 'chip stage', title: `${st.name}：${st.goal}` }, `Stage${st.id}`),
      ),
      h('div', { class: `mood ${MOOD_CLASS[s.mood]}`, title: 'やる気' }, `やる気: ${MOOD_LABELS[s.mood]}`),
    ),
    h('div', { class: 'hud-row money' },
      // 出費の予告は所持金の下の行に出す（横に並べると行が折り返して、下の行動カードの位置がずれる）
      h('div', { class: 'cash' },
        h('div', { class: 'cash-main' }, h('img', { src: 'assets/icons/gum.webp', alt: '' }), h('span', { class: s.cash < 0 ? 'neg' : '' }, yenFmt(s.cash))),
        // 借金は所持金の下に置き、右の目標欄と高さをそろえる
        // 出費の予告も同じ行に並べて、予告が出ても行の高さが変わらないようにする
        s.debt > 0 || preview?.cash
          ? h('div', { class: 'cash-sub' },
            s.debt > 0 ? h('span', { class: 'debt-line' }, '借金 ', h('b', {}, yenFmt(s.debt))) : null,
            preview?.cash ? h('small', { class: `cash-d ${preview.cash < 0 ? 'lose' : 'gain'}` }, `${preview.cash > 0 ? '+' : '−'}${Math.abs(preview.cash).toLocaleString('ja-JP')}`) : null)
          : null),
      goalBox(s),
    ),
    h('div', { class: 'hud-row bars' },
      staminaBar(s),
      h('div', { class: 'chips' },
        h('span', { class: 'chip', title: 'セラー評価' }, `評価 ${Math.round(s.rating)}`),
        s.underworld
          ? h('span', { class: 'chip toku dark', title: '裏の人間（TOKU のゲージは消えた）' }, '裏')
          : h('span', { class: `chip toku ${s.toku >= 120 ? 'high' : s.toku < 80 ? 'low' : ''}`, title: 'TOKU（徳）基準100。高いと正道、低いと魔道のパネルが開く' }, `TOKU ${Math.round(s.toku ?? 100)}`),
      ),
    ),
    s.sick > 0 || s.banWeeks > 0 || s.delinquency > 0 || s.hate >= 50 || s.probation > 0
      ? h('div', { class: 'hud-row chips warn-row' },
        s.hate >= 50 ? h('span', { class: 'chip warn' }, `炎上中 ${Math.round(s.hate)}`) : null,
        s.probation > 0 ? h('span', { class: 'chip warn' }, `保護観察 あと${s.probation}週`) : null,
        s.sick > 0 ? h('span', { class: 'chip warn' }, '体調不良') : null,
        s.banWeeks > 0 ? h('span', { class: 'chip warn' }, `プンシー停止${s.banWeeks}週`) : null,
        s.delinquency > 0 ? h('span', { class: 'chip warn' }, `滞納${s.delinquency}`) : null,
      )
      : null,
    mission ? h('div', { class: 'hud-mission' }, h('b', {}, `目標：${mission.title}`), h('small', {}, mission.hint)) : null,
    s.week % 4 === 3 && s.debt > 0 ? h('div', { class: 'hud-alert' }, `今週末は返済日！ 最低 ${yenFmt(Math.min(minPayment(s), s.debt))}${s.card.due ? ` ＋カード ${yenFmt(s.card.due)}` : ''}`) : null,
  ];
  el.append(...rows.filter(Boolean));
}

// ニュースとSNS。7秒ごとに今週のニュースとSNSの投稿を順に流し、はみ出すときは横にスクロールさせる。
// タップすると、ニュースとSNSのタイムラインを開く
let tickerItems = [];
let tickerKey = '';
let tickerIdx = 0;
let tickerTimer = null;
let tickerState = null;

function tickerList(s) {
  const posts = (s.sns || []).filter((p) => p.week === s.week);
  return [
    ...(s.news || []).map((n) => ({ text: n.text, cls: `news ${n.kind}` })),
    ...posts.map((p) => ({ who: p.who, text: p.text, cls: `sns ${p.kind}` })),
  ];
}

function drawTicker() {
  const el = $('#news-ticker');
  clear(el);
  el.classList.remove('scroll');
  const item = tickerItems[tickerIdx % Math.max(1, tickerItems.length)];
  if (!item) return;
  const inner = h('div', { class: 'ticker-inner' },
    item.who ? h('b', { class: 'tk-who' }, item.who) : null,
    h('span', { class: item.cls }, item.text),
    tickerItems.length > 1 ? h('small', {}, ` ${(tickerIdx % tickerItems.length) + 1}/${tickerItems.length}`) : null);
  el.append(inner);
  requestAnimationFrame(() => {
    const over = inner.scrollWidth - el.clientWidth;
    if (over <= 4) return;
    el.style.setProperty('--dist', `${-over - 16}px`);
    el.style.setProperty('--dur', `${Math.max(6, (over + 16) / 30 + 3)}s`);
    el.classList.add('scroll');
  });
}

export function renderTicker(s) {
  tickerState = s;
  const el = $('#news-ticker');
  if (!el.dataset.bound) {
    el.dataset.bound = '1';
    el.addEventListener('click', () => tickerState && timelineModal(tickerState));
  }
  const items = tickerList(s);
  const key = items.map((x) => x.text).join('|');
  if (key === tickerKey) return;
  tickerKey = key;
  tickerItems = items;
  tickerIdx = 0;
  drawTicker();
  clearInterval(tickerTimer);
  if (items.length > 1) {
    tickerTimer = setInterval(() => {
      tickerIdx++;
      drawTicker();
    }, 7000);
  }
}

// ニュースとSNSのタイムライン
function timelineModal(s) {
  openModal('ニュースとSNS', (body) => {
    body.append(h('div', { class: 'sub' }, '今週のニュース'));
    if (!(s.news || []).length) body.append(h('p', { class: 'empty' }, 'ニュースはない'));
    body.append(h('div', { class: 'news-list' }, ...(s.news || []).map((n) => h('div', { class: `news ${n.kind}` }, n.text))));
    body.append(h('div', { class: 'sub' }, 'SNS'), h('p', { class: 'note' }, '「転売ヤー許さん」も「近くに売ってなくて助かった」も、どちらも本当の声。'));
    const posts = (s.sns || []).slice(0, 30);
    if (!posts.length) body.append(h('p', { class: 'empty' }, 'まだ投稿はない'));
    body.append(...posts.map((p) => h('div', { class: `sns-post ${p.kind}` },
      h('div', { class: 'sns-h' }, h('b', {}, p.who), h('small', {}, p.week === s.week ? '今週' : `${s.week - p.week}週前`)),
      h('p', {}, p.text))));
  });
}

// ステージ右側のパネル。基礎能力（ふだん）と経験点を切り替えられる。
// 経験点：予告中は増える量、獲得時は光らせる（獲得の演出のあいだは、基礎能力の表示でも経験点を出す）
const PARAMS_KEY = '10buy-year:params';
let paramsMode = 'ab';
try {
  if (window.localStorage.getItem(PARAMS_KEY) === 'exp') paramsMode = 'exp';
} catch {
  /* noop */
}
// 英語の能力名は、右の細い欄に収まる短い形で
const AB_SHORT_EN = { eye: 'Eye', buy: 'Sourcing', list: 'Listing', talk: 'Nego', pack: 'Packing' };
let paramsOpen = null; // 基礎能力の行を押したときに開く画面（main.js が渡す）
export function setParamsOpen(fn) {
  paramsOpen = fn;
}

export function renderParams(s, { gains = null } = {}) {
  const el = clear($('#params'));
  const mode = gains ? 'exp' : paramsMode;
  const setMode = (m) => {
    paramsMode = m;
    try {
      window.localStorage.setItem(PARAMS_KEY, m);
    } catch {
      /* noop */
    }
    renderParams(s);
  };
  el.setAttribute('aria-label', mode === 'ab' ? '基礎能力' : '経験点');
  el.append(h('div', { class: 'pr-tabs', role: 'tablist' },
    h('button', { class: mode === 'ab' ? 'on' : '', role: 'tab', 'aria-selected': String(mode === 'ab'), onclick: () => setMode('ab') }, isEn() ? 'Abilities' : '基礎能力'),
    h('button', { class: mode === 'exp' ? 'on' : '', role: 'tab', 'aria-selected': String(mode === 'exp'), onclick: () => setMode('exp') }, '経験点'),
  ));
  if (mode === 'ab') {
    // ランクと値。いまの経験点で上げられる能力には ▲
    for (const a of ABILITIES) {
      const lv = s.abilities[a.id];
      const can = lv < ABILITY_MAX && canAfford(s, abilityCost(a.id, lv));
      el.append(h('button', { class: `pr ab ${can ? 'can' : ''}`, title: can ? `${a.name}：いまの経験点で上げられる` : a.name, onclick: () => paramsOpen?.() },
        h('span', { class: 'pn' }, isEn() ? AB_SHORT_EN[a.id] : a.name),
        h('span', { class: `rk r${rankOf(lv)}` }, rankOf(lv)),
        h('b', {}, lv),
        h('i', {}, can ? '▲' : ''),
      ));
    }
    return;
  }
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
