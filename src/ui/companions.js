// 仲間（偉人）の一覧：出会いの段階と、授かった奥義（data/companions.js）
import { CAST, portraitOf } from '../data/cast.js';
import { COMPANIONS, companionStage, SECRETS } from '../data/companions.js';
import { SKILL_MAP } from '../data/skills.js';
import { h } from './dom.js';
import { openModal } from './modal.js';

export function companionsModal(s) {
  return openModal('仲間', (body) => {
    const met = COMPANIONS.filter((c) => companionStage(s, c) > 0).length;
    body.append(h('p', { class: 'note' }, `出会った偉人 ${met}/${COMPANIONS.length}人。出会いを重ねると、最後に「奥義」やコツを授かる。偉人はそれぞれ、決まった行動のあとに現れる。`));
    for (const c of COMPANIONS) {
      const n = companionStage(s, c);
      const cast = CAST[c.who];
      const reward = c.secret ? SECRETS[c.secret].name : c.gold ? SKILL_MAP[c.gold].name : null;
      const got = c.secret ? !!s.secrets?.includes(c.secret) : c.gold ? (s.hints?.[c.gold] || 0) > 0 || s.skills.includes(c.gold) : n >= c.chain.length;
      body.append(h('div', { class: `card row comp ${n ? '' : 'unmet'}` },
        h('img', { class: 'comp-face', src: portraitOf(c.who, 'idle'), alt: '' }),
        h('div', { class: 'grow' },
          h('div', { class: 'name' }, n ? cast.name : '？？？', n && cast.title ? h('small', {}, ` ${cast.title}`) : null),
          h('div', { class: 'comp-dots' }, ...c.chain.map((_, i) => h('i', { class: i < n ? 'on' : '' }))),
          reward ? h('div', { class: `comp-reward ${got ? 'got' : ''}` }, got ? `${c.secret ? '奥義' : 'コツ'}：${reward}${c.secret ? `（${SECRETS[c.secret].desc}）` : ''}` : `${c.secret ? '奥義' : 'コツ'}：？？？`) : null,
        )));
    }
  });
}
