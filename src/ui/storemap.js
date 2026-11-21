// 店の地図：通った店と、覚えた店のクセ（engine/storemap.js）
import { HABITS, LEARN_VISITS, mapEntries } from '../engine/storemap.js';
import { weekLabel } from '../engine/calendar.js';
import { h } from './dom.js';
import { openModal } from './modal.js';

export function storeMapModal(s) {
  return openModal('店の地図', (body) => {
    const list = mapEntries(s);
    const known = list.filter((x) => x.habit).length;
    body.append(h('p', { class: 'note' }, `同じ店に${LEARN_VISITS}回通うと、その店のクセがわかる。覚えたクセは、店を選ぶ画面にも出る。（覚えた店 ${known}/${list.length}）`));
    const groups = [['地元', list.filter((x) => !x.region)], ...[...new Set(list.map((x) => x.region).filter(Boolean))].map((r) => [`遠征：${r}`, list.filter((x) => x.region === r)])];
    for (const [title, rows] of groups) {
      if (!rows.length) continue;
      body.append(h('h3', { class: 'map-h' }, title));
      for (const x of rows) {
        body.append(h('div', { class: `card map-row ${x.habit ? '' : 'muted'}` },
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, x.region ? x.name.replace(`${x.region}・`, '') : x.name, h('small', {}, ` ${x.label}`)),
            h('div', { class: 'nums' }, h('span', {}, `${x.visits}回`), x.last !== undefined ? h('span', {}, `最後に行ったのは${weekLabel(x.last)}`) : null),
            x.habit ? h('div', { class: 'map-habit' }, `クセ：${x.habit.name}（${x.habit.desc}）`) : h('div', { class: 'map-habit unknown' }, `クセ：？（あと${LEARN_VISITS - x.visits}回）`),
          ),
        ));
      }
    }
    body.append(h('details', { class: 'map-legend' }, h('summary', {}, 'クセの種類'), ...Object.values(HABITS).map((hb) => h('div', {}, `${hb.name}：${hb.desc}`))));
  });
}
