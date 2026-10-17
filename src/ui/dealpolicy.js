// 取引の対応（値下げ交渉・クレーム・返品・すり替え）の「いつもの答え」を決める。ルーティンの設定とメニューから開く
import { DEAL_POLICIES, dealCfg, setDeal } from '../engine/dealpolicy.js';
import { h } from './dom.js';
import { openModal } from './modal.js';

export function dealControls(s, refresh) {
  const cfg = dealCfg(s);
  const seg = (key, options) => h('div', { class: 'seg rt-seg' }, ...options.map(([v, label]) => h('button', { class: `btn small ${cfg[key] === v ? 'on' : ''}`, onclick: () => { setDeal(s, key, v); refresh(); } }, label)));
  const rows = [
    h('small', { class: 'rt-l' }, '決めた答えを使うとき'),
    seg('scope', [['routine', 'ルーティン中だけ'], ['always', 'いつも']]),
  ];
  for (const [key, p] of Object.entries(DEAL_POLICIES)) {
    rows.push(h('small', { class: 'rt-l' }, p.name), seg(key, p.options));
    if (key === 'nego' && cfg.nego === 'rule') {
      rows.push(h('small', { class: 'rt-l' }, '提示額が出品価格のこの割合以上なら売る（未満は断る）'), h('div', { class: 'rt-line' },
        h('input', { type: 'range', min: '0.75', max: '0.95', step: '0.01', value: String(cfg.negoMin), oninput: (e) => { setDeal(s, 'negoMin', Number(e.target.value)); e.target.nextSibling.textContent = negoLabel(e.target.value); } }),
        h('b', {}, negoLabel(cfg.negoMin))));
    }
  }
  rows.push(h('p', { class: 'note' }, '「毎回決める」にした取引は、ルーティン中でもそこで止まって選ぶ。値下げ交渉の提示額は出品価格の8〜9割。'));
  return rows;
}

const negoLabel = (v) => `${Math.round(Number(v) * 100)}%以上`;

export function dealPolicyModal(s) {
  return openModal('取引の対応', (body, m) => {
    body.append(h('p', { class: 'note' }, '値下げ交渉やトラブルに、いつもの答えを決めておく。'), ...dealControls(s, () => m.refresh()));
  }).closed;
}
