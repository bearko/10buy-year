// キャリア：顧客層（誰に売れているか）と、転身したキャリアの実績
import { AUDIENCES, CAREERS } from '../data/careers.js';
import { portraitOf } from '../data/cast.js';
import { audience, careerOf, hasCareer, mediaIncome } from '../engine/careers.js';
import { h, yenFmt } from './dom.js';
import { openModal } from './modal.js';

const COST = { info: '情報', act: '行動', tech: '技術', social: '対人', mind: '精神' };

function stats(s, id) {
  const c = careerOf(s, id);
  if (id === 'kol') return `フォロワー ${c.followers}人・配信 ${c.streams || 0}回`;
  if (id === 'appraiser') return `信用 ${c.trust}・鑑定 ${c.jobs}件`;
  if (id === 'media') return `読者 ${c.readers}人・毎月の紹介料 ${yenFmt(mediaIncome(s))}`;
  if (id === 'select') return `買い付け ${c.trips}回`;
  if (id === 'inbound') return `ツアー ${c.tours}回`;
  return '';
}

export function careersModal(s) {
  return openModal('キャリア', (body) => {
    body.append(
      h('p', { class: 'note' }, '売った商材のジャンルごとに、顧客層（誰に売れているか）が育つ。評価が高いほど伸びる。一定を超えると、その道のキャリアに誘われる（ステージ3から）。'),
      h('div', { class: 'sub' }, '顧客層'),
      ...Object.entries(CAREERS).map(([id, c]) => {
        const v = Math.floor(audience(s, c.aud));
        const pct = Math.min(100, (v / c.need) * 100);
        return h('div', { class: 'heat-row aud-row' },
          h('span', {}, AUDIENCES[c.aud].name),
          h('div', { class: `sat-bar ${pct >= 100 ? '' : 'mid'}` }, h('i', { style: { width: `${pct}%` } })),
          h('small', {}, hasCareer(s, id) ? `${v}` : `${v}/${c.need}`),
        );
      }),
      h('div', { class: 'sub' }, 'キャリア'),
      ...Object.entries(CAREERS).map(([id, c]) => h('div', { class: `career-row ${hasCareer(s, id) ? 'on' : ''}` },
        h('img', { src: portraitOf(c.hero, 'idle'), alt: '' }),
        h('div', {},
          h('b', {}, c.name),
          h('small', {}, hasCareer(s, id) ? stats(s, id) : `${AUDIENCES[c.aud].name}の顧客層が ${c.need} になると誘いが来る`),
          h('small', { class: 'reg-rule' }, `${c.perk}（経験点 ${Object.entries(c.cost).map(([k, n]) => `${COST[k]}${n}`).join('・')}）`),
        ),
      )),
    );
  }).closed;
}
