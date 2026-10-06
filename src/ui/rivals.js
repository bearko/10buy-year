// 仕入れ先と番付：仕入れ先ごとの荒れ具合と独占契約、ライバル転売屋との長者番付
import { portraitOf } from '../data/cast.js';
import { PIONEER_ROUTES, openSpots } from '../engine/pioneer.js';
import {
  EXCLUSIVE_WEEKS, exclusive, exclusiveCost, ranking, RIVAL_MAP, saturation, satNameOf, satPriceMult, signExclusive,
} from '../engine/rivals.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

// 自分が使える仕入れルートと、開拓した仕入れ先
function satKeys(s) {
  const routes = Object.keys(PIONEER_ROUTES).filter((r) => r === 'store' || r === 'online' || (s.routeUse?.[r] || 0) > 0);
  return routes.flatMap((r) => [r, ...openSpots(s, r).map((x) => x.id)]);
}

export function rivalsModal(s, onChange) {
  return openModal('仕入れ先と番付', (body, api) => {
    const sign = (key) => {
      if (!signExclusive(s, key)) return toast('お金か対人の経験点が足りない', 'bad');
      playSe('levelup');
      toast(`${satNameOf(key)}と独占契約を結んだ（${EXCLUSIVE_WEEKS}週）`, 'good');
      api.refresh();
      onChange?.();
    };
    const rows = satKeys(s).map((key) => {
      const v = Math.round(saturation(s, key));
      const ex = exclusive(s, key);
      const c = exclusiveCost(s, key);
      const spot = !PIONEER_ROUTES[key];
      return h('div', { class: `sat-row ${spot ? 'spot' : ''}` },
        h('div', { class: 'sat-top' },
          h('b', {}, satNameOf(key)),
          h('small', {}, ex ? `独占契約 あと${s.exclusive[key] - s.week}週` : v >= 15 ? `仕入れ値 +${Math.round((satPriceMult(s, key) - 1) * 100)}%` : '静か'),
        ),
        h('div', { class: `sat-bar ${v >= 70 ? 'hi' : v >= 40 ? 'mid' : ''}` }, h('i', { style: { width: `${v}%` } })),
        !ex && v >= 20
          ? h('button', { class: 'btn small', onclick: () => sign(key) }, `独占契約（${yenFmt(c.cash)}・対人${c.social}）`)
          : null,
      );
    });
    const rank = ranking(s);
    body.append(
      h('p', { class: 'note' }, '仕入れ先は使うほど荒れて、掘り出し物が減り仕入れ値が上がる。放っておけば落ち着く。ライバルにも荒らされる。荒れたら、新しい仕入れ先を開拓して移ろう。'),
      h('div', { class: 'sub' }, '仕入れ先の荒れ具合'),
      ...rows,
      h('div', { class: 'sub' }, '月の長者番付（純資産）'),
      rank.length > 1
        ? h('div', { class: 'rank-list' }, ...rank.map((r, i) => h('div', { class: `rank-row ${r.id === 'me' ? 'me' : ''}` },
          h('span', { class: 'rank-no' }, `${i + 1}位`),
          h('img', { src: portraitOf(r.cast, 'idle'), alt: '' }),
          h('div', { class: 'rank-name' }, h('b', {}, r.name), r.style ? h('small', {}, RIVAL_MAP[r.id] ? `得意：${r.style}` : '') : null),
          h('b', { class: 'rank-nw' }, yenFmt(r.nw)),
        )))
        : h('p', { class: 'note' }, 'まだライバルはいない。ステージ3（専業）になると、ライバル転売屋が乗り込んでくる。'),
    );
  }).closed;
}
