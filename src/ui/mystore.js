// 自分の店の経営画面（メニューから）。立地・先週の成績・改装・スタッフ・買取カウンター
import { COUNTER_COST, LOCATIONS, RENOVATE_COST, STAFF_COST, upgradeShop } from '../engine/mystore.js';
import { activeUnits } from '../engine/inventory.js';
import { weekLabel } from '../engine/calendar.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

export function myStoreModal(s, onChange) {
  return openModal('自分の店', (body, api) => {
    const sh = s.shop;
    const loc = LOCATIONS[sh.loc];
    const last = sh.last;
    const shelf = activeUnits(s).filter((u) => !u.listing).length;
    const act = (what, msg) => {
      if (!upgradeShop(s, what)) return toast('お金が足りない', 'bad');
      playSe('levelup');
      toast(msg, 'good');
      api.refresh();
      onChange?.();
    };
    body.append(
      h('div', { class: 'stage-box' },
        h('div', { class: 'name' }, `クリス物販 ${loc.name}店`, h('small', {}, `（${weekLabel(sh.opened)}開店）`)),
        h('small', { class: 'desc' }, loc.desc),
        h('div', { class: 'note' }, `家賃 ${yenFmt(loc.rent)}/月・お客さんの値付けの許容 ×${loc.tolerance}`),
      ),
      h('div', { class: 'sub' }, '先週の成績'),
      h('div', { class: 'ledger-grid' },
        row('来客', last ? `${last.visitors}人` : '—'),
        row('売れた数', last ? `${last.sold}点` : '—'),
        row('売上', last ? yenFmt(last.revenue) : '—'),
        row('客単価', last && last.sold ? yenFmt(last.revenue / last.sold) : '—'),
        row('店頭の在庫（出品していない物）', `${shelf}点`),
        row('開店からの売上', yenFmt(sh.total || 0)),
      ),
      h('p', { class: 'note' }, '出品していない在庫が店頭に並ぶ。立地の客層に合う品ほど売れる（手数料・送料なし）。'),
      h('div', { class: 'sub' }, '店づくり'),
      h('div', { class: 'menu-list' },
        h('button', { class: 'btn', disabled: sh.renov >= 3, onclick: () => act('renov', '改装した！ 客足が増える') }, sh.renov >= 3 ? '改装（最大）' : `改装 Lv${sh.renov}→${sh.renov + 1}（${yenFmt(RENOVATE_COST(sh.renov))}・客足+30%）`),
        h('button', { class: `btn ${sh.staff ? 'on' : ''}`, onclick: () => act('staff', sh.staff ? 'スタッフとの契約を終えた' : 'スタッフを雇った') }, sh.staff ? `スタッフを雇っている（月${yenFmt(STAFF_COST)}）→ やめる` : `スタッフを雇う（月${yenFmt(STAFF_COST)}・購買率アップ）`),
        h('button', { class: 'btn', disabled: sh.counter, onclick: () => act('counter', '買取カウンターを置いた') }, sh.counter ? '買取カウンター（設置済み）' : `買取カウンターを置く（${yenFmt(COUNTER_COST)}・持ち込みを相場の4割で買い取る）`),
      ),
    );
  }).closed;
}

function row(label, value) {
  return h('div', { class: 'lg-row' }, h('span', {}, label), h('b', {}, value));
}
