// 業界の動き：規制・販売方式の変化（いたちごっこ）、仕入れ先ごとの荒れ具合と独占契約、ライバル転売屋との長者番付
import { portraitOf } from '../data/cast.js';
import { PIONEER_ROUTES, openSpots } from '../engine/pioneer.js';
import {
  EXCLUSIVE_WEEKS, exclusive, exclusiveCost, ranking, RIVAL_MAP, saturation, satNameOf, satPriceMult, signExclusive,
} from '../engine/rivals.js';
import { hotKeys, regimeRows } from '../engine/regimes.js';
import { ANNALS, ANNALS_FROM_YEAR } from '../engine/annals.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

// 自分が使える仕入れルートと、開拓した仕入れ先
function satKeys(s) {
  const routes = Object.keys(PIONEER_ROUTES).filter((r) => r === 'store' || r === 'online' || (s.routeUse?.[r] || 0) > 0);
  return routes.flatMap((r) => [r, ...openSpots(s, r).map((x) => x.id)]);
}

export function rivalsModal(s, onChange) {
  return openModal('業界の動き', (body, api) => {
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
    const regs = regimeRows(s);
    const hot = hotKeys(s);
    const annals = (s.annals || []).slice().reverse();
    body.append(
      h('div', { class: 'sub' }, '業界の年表'),
      annals.length
        ? h('div', { class: 'reg-list' }, ...annals.map((a) => {
          const d = ANNALS[a.id];
          const state = a.phase === 'announced' ? '春から始まる' : a.phase === 'started' ? '進行中' : a.result === 'clear' ? 'ミッション達成' : 'ミッション失敗';
          return h('div', { class: `reg-row ${a.result === 'clear' ? 'good' : ''} ${a.phase === 'done' ? 'over' : ''}` },
            h('div', { class: 'sat-top' }, h('b', {}, `${a.year}年目：${d.name}`), h('small', {}, state)),
            h('small', { class: 'reg-rule' }, `・ミッション：${d.mission.title}`));
        }))
        : h('p', { class: 'note' }, `${ANNALS_FROM_YEAR}年目から、毎年ひとつ業界の大事件が起きる（年の初めに予告される）。`),
      h('div', { class: 'sub' }, '規制と販売方式'),
      regs.length
        ? h('div', { class: 'reg-list' }, ...regs.map((r) => h('div', { class: `reg-row ${r.positive ? 'good' : ''} ${r.over ? 'over' : ''}` },
          h('div', { class: 'sat-top' }, h('b', {}, r.title), h('small', {}, r.state)),
          ...r.rules.map((l) => h('small', { class: 'reg-rule' }, `・${l}`)))))
        : h('p', { class: 'note' }, 'まだ大きな規制はない。高値の転売や買い占めで目立つと、メーカーや国が手を打ってくる。'),
      hot.length ? h('div', { class: 'heat-list' }, h('small', {}, '目立っているもの（100で対策が予告される）'),
        ...hot.map((x) => h('div', { class: 'heat-row' }, h('span', {}, x.name), h('div', { class: `sat-bar ${x.v >= 70 ? 'hi' : x.v >= 40 ? 'mid' : ''}` }, h('i', { style: { width: `${x.v}%` } })), h('small', {}, `${x.v}`)))) : '',
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
