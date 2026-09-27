// 能力・家計・メニュー画面
import { SKILL_MAP } from '../data/skills.js';
import { productOf } from '../data/products.js';
import { weekLabel } from '../engine/calendar.js';
import {
  ABILITIES, ABILITY_MAX, abilityCost, canAfford, EXP_NAME, EXP_TYPES, learnableSkills, learnSkill, raiseAbility, rankOf, skillCost,
} from '../engine/abilities.js';
import { debtFreeSteps, MIN_PAYMENT, repay } from '../engine/finance.js';
import { grossProfit } from '../engine/state.js';
import { playSe, setSound, soundOn } from './audio.js';
import { h, signYen, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

const costText = (cost) => Object.entries(cost).map(([k, v]) => `${EXP_NAME[k]}${v}`).join(' ');

export function abilitiesModal(s, onChange) {
  return openModal('能力', (body, api) => {
    body.append(
      h('div', { class: 'exp-pool' }, ...EXP_TYPES.map((e) => h('div', { class: `exp ${e.id}` }, h('small', {}, e.name), h('b', {}, s.exp[e.id] || 0)))),
      h('p', { class: 'note' }, '行動で貯めた経験点を使って能力を上げる。能力が高いほど上げるのに経験点が必要になる。'),
    );
    for (const a of ABILITIES) {
      const lv = s.abilities[a.id];
      const cost = abilityCost(a.id, lv);
      const ok = lv < ABILITY_MAX && canAfford(s, cost);
      body.append(
        h('div', { class: 'card ability' },
          h('div', { class: `rank r${rankOf(lv)}` }, rankOf(lv)),
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, a.name, h('small', {}, ` ${lv}`)),
            h('div', { class: 'bar' }, h('i', { style: { width: `${lv}%` } })),
            h('small', { class: 'desc' }, a.desc),
          ),
          h('div', { class: 'col' },
            h('button', { class: 'btn small', disabled: !ok, onclick: () => { raiseAbility(s, a.id, 1); api.refresh(); onChange?.(); } }, '+1'),
            h('button', { class: 'btn small', disabled: !ok, onclick: () => { raiseAbility(s, a.id, 5); api.refresh(); onChange?.(); } }, '+5'),
            h('small', {}, costText(cost)),
          ),
        ),
      );
    }

    body.append(h('div', { class: 'sub' }, '特殊能力'));
    const owned = s.skills.filter((id) => SKILL_MAP[id].kind !== 'red');
    if (owned.length) body.append(h('div', { class: 'skills' }, ...owned.map((id) => h('span', { class: `skill ${SKILL_MAP[id].kind}`, title: SKILL_MAP[id].desc }, SKILL_MAP[id].name))));
    for (const sk of learnableSkills(s)) {
      const cost = skillCost(s, sk.id);
      const hint = s.hints[sk.id] || 0;
      body.append(
        h('div', { class: `card skill-row ${sk.kind}` },
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, sk.name, sk.kind === 'red' ? h('small', { class: 'neg' }, ' マイナス能力') : null, hint ? h('small', { class: 'pos' }, ` コツLv${hint}`) : null),
            h('small', { class: 'desc' }, sk.desc),
          ),
          h('div', { class: 'col' },
            h('button', {
              class: 'btn small',
              disabled: !canAfford(s, cost),
              onclick: () => {
                if (learnSkill(s, sk.id)) {
                  playSe('hint');
                  toast(sk.kind === 'red' ? `「${sk.name}」を克服した！` : `「${sk.name}」を習得した！`, 'good');
                }
                api.refresh();
                onChange?.();
              },
            }, sk.kind === 'red' ? '治す' : '習得'),
            h('small', {}, costText(cost)),
          ),
        ),
      );
    }
    const lockedGold = Object.values(SKILL_MAP).filter((sk) => sk.kind === 'gold' && !s.skills.includes(sk.id) && !(s.hints[sk.id] > 0));
    if (lockedGold.length) body.append(h('p', { class: 'note' }, `？？？ … 仲間キャラとのイベントで習得できる特殊能力があと${lockedGold.length}つある`));
  }).closed;
}

export function financeModal(s, onChange, playSteps) {
  let amount = 0;
  return openModal('家計・返済', (body, api) => {
    const pending = s.pending.reduce((a, p) => a + p.amount, 0);
    const st = s.stats;
    body.append(
      h('div', { class: 'ledger-grid' },
        row('現金', yenFmt(s.cash)),
        row('入金待ちの売上金', yenFmt(pending)),
        row('ポイント', `${s.points.toLocaleString()}pt（仕入れ時に自動で使う）`),
        row('借金', yenFmt(s.debt), 'neg'),
        row('毎月の最低返済', `${yenFmt(Math.min(MIN_PAYMENT, s.debt))}（毎月第4週末）`),
        row('利息', '年15%（毎月末に借金に加算）'),
        row('カード 今月の利用', `${yenFmt(s.card.current)}（来月末に引き落とし）`),
        row('カード 今月末の引き落とし', yenFmt(s.card.due)),
        row('カード 利用枠', yenFmt(s.card.limit)),
        row('滞納', `${s.delinquency} / 3 回`, s.delinquency ? 'neg' : ''),
      ),
    );
    if (s.debt > 0) {
      body.append(
        h('div', { class: 'sub' }, '繰上げ返済'),
        h('p', { class: 'note' }, '早く返すほど利息が減る。ただし手元資金が減ると仕入れができなくなる。'),
        h('div', { class: 'price-row' },
          h('input', { type: 'number', min: '0', step: '10000', value: String(amount), onchange: (e) => { amount = Math.max(0, Number(e.target.value) || 0); } }),
          h('span', {}, '円'),
          h('button', {
            class: 'btn primary',
            onclick: async () => {
              const paid = repay(s, amount);
              if (paid > 0) {
                playSe('coin');
                toast(`${yenFmt(paid)}を返済した`, 'good');
                if (s.debt <= 0 && !s.flags.debtFree) {
                  api.close();
                  await playSteps(debtFreeSteps(s));
                  onChange?.();
                  return;
                }
              } else toast('返済できる現金がない', 'bad');
              amount = 0;
              api.refresh();
              onChange?.();
            },
          }, '返済する'),
        ),
      );
    }
    const best = st.bestSale ? `${productOf(st.bestSale.pid).name}（${signYen(st.bestSale.profit)} / ${weekLabel(st.bestSale.week)}）` : 'まだない';
    body.append(
      h('div', { class: 'sub' }, '成績'),
      h('div', { class: 'ledger-grid' },
        row('累計売上', yenFmt(st.revenue)),
        row('販売手数料', yenFmt(st.fees)),
        row('送料', yenFmt(st.shipping)),
        row('売れた商品の仕入れ値', yenFmt(st.cogs)),
        row('粗利益', signYen(grossProfit(s)), grossProfit(s) >= 0 ? 'pos' : 'neg'),
        row('販売数 / 仕入れ数', `${st.soldUnits} / ${st.boughtUnits}`),
        row('取引トラブル', `${st.troubles}件`),
        row('返済済み / 支払った利息', `${yenFmt(st.repaid)} / ${yenFmt(st.interest)}`),
        row('最高の一品', best),
      ),
      h('div', { class: 'sub' }, '収支履歴（新しい順）'),
      h('div', { class: 'ledger' }, ...s.ledger.slice(-40).reverse().map((l) => h('div', { class: 'ledger-row' }, h('small', {}, weekLabel(Math.min(l.week, 47))), h('span', {}, l.text), l.amount ? h('b', { class: l.amount >= 0 ? 'pos' : 'neg' }, signYen(l.amount)) : h('b', {})))),
    );
  }).closed;
}

function row(label, value, cls = '') {
  return h('div', { class: 'lg-row' }, h('span', {}, label), h('b', { class: cls }, value));
}

export function menuModal({ onTitle, onSpeed, speed, onRestart }) {
  return openModal('メニュー', (body, api) => {
    body.append(
      h('div', { class: 'menu-list' },
        h('button', { class: 'btn', onclick: () => { setSound(!soundOn()); api.refresh(); } }, `サウンド: ${soundOn() ? 'ON' : 'OFF'}`),
        h('div', { class: 'seg' }, h('span', {}, '文字送り '), ...[['はやい', 8], ['ふつう', 22], ['おそい', 40], ['一瞬', 0]].map(([label, ms]) => h('button', { class: `btn small ${speed() === ms ? 'on' : ''}`, onclick: () => { onSpeed(ms); api.refresh(); } }, label))),
        h('p', { class: 'note' }, 'ゲームは毎週のはじめに自動でセーブされる。'),
        h('button', { class: 'btn', onclick: () => { api.close(); onTitle(); } }, 'タイトルへ戻る'),
        h('button', { class: 'btn danger', onclick: () => { if (window.confirm('セーブデータを消して最初からやり直しますか？')) { api.close(); onRestart(); } } }, '最初からやり直す'),
      ),
    );
  }).closed;
}
