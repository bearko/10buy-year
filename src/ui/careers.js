// キャリア：顧客層（誰に売れているか）と、転身したキャリアの実績
import { AUDIENCES, CAREERS } from '../data/careers.js';
import { portraitOf } from '../data/cast.js';
import { audience, careerOf, hasCareer, mediaIncome } from '../engine/careers.js';
import { CHANGE_WEEKS, canChangeVision, chooseVision, visionAvailable, visionOf, VISIONS } from '../engine/visions.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

const fmt = (m, v) => (m.unit === '円' ? yenFmt(v) : `${Math.floor(v).toLocaleString('ja-JP')}${m.unit}`);

// 志：いまの志と3段の目標。年に一度だけ変えられる
function visionBox(s, api) {
  const v = visionOf(s);
  if (!v) {
    return h('p', { class: 'note' }, s.stage >= 4 ? 'まだ志を決めていない。次の週のはじめに、龍馬が聞きに来る。' : 'ステージ4（法人化）になると、この先目指す「志」を選ぶ。');
  }
  const change = () => {
    api.close();
    openModal('志を変える', (body, m) => {
      body.append(h('p', { class: 'note' }, `志を変えると、目標の達成はリセットされる。次に変えられるのは${CHANGE_WEEKS}週後。`),
        ...visionAvailable(s).filter((id) => id !== s.vision.id).map((id) => h('button', { class: 'btn vision-pick', onclick: () => { chooseVision(s, id); playSe('levelup'); toast(`志を「${VISIONS[id].name}」に変えた`, 'good'); m.close(); } }, h('b', {}, VISIONS[id].name), h('small', {}, VISIONS[id].desc))));
    });
  };
  return h('div', { class: 'stage-box vision-box' },
    h('div', { class: 'name' }, `志：${v.name}`, h('small', {}, `（達成 ${Object.keys(s.vision.done).length}/3）`)),
    h('small', { class: 'desc' }, v.desc),
    ...v.milestones.map((m, i) => {
      const done = s.vision.done[i] !== undefined;
      const val = m.value(s);
      return h('div', { class: `ms-row ${done ? 'done' : ''}` },
        h('span', {}, done ? '★' : `${i + 1}.`),
        h('div', {}, h('b', {}, m.title), h('div', { class: 'sat-bar' }, h('i', { style: { width: `${Math.min(100, (val / m.target) * 100)}%` } })), h('small', {}, done ? '達成' : `${fmt(m, val)} / ${fmt(m, m.target)}`)),
      );
    }),
    canChangeVision(s)
      ? h('button', { class: 'btn small', onclick: change }, '志を変える')
      : h('small', { class: 'note' }, `志を変えられるのは、決めてから${CHANGE_WEEKS}週後（あと${s.vision.chosen + CHANGE_WEEKS - s.week}週）`),
  );
}

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
  return openModal('キャリア', (body, api) => {
    body.append(
      h('div', { class: 'sub' }, '志'),
      visionBox(s, api),
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
