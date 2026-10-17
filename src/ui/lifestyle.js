// 暮らし：生活水準を上げる・下げる。上げると体力・やる気に効くが毎月の出費が増え、下げるとやる気が大きく落ちる
import { familyLabel, familyOf } from '../engine/family.js';
import { canRaiseLife, lifeCost, lifeLevel, LIFESTYLES, lowerLife, nextLifestyle, raiseLife } from '../engine/lifestyle.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { confirmBox, openModal, toast } from './modal.js';

export function lifestyleModal(s, onChange) {
  return openModal('暮らし', (body, api) => {
    const lv = lifeLevel(s);
    const nx = nextLifestyle(s);
    const raise = () => {
      if (!canRaiseLife(s)) return toast(s.week < (s.flags.lifeCool || 0) ? `あと${s.flags.lifeCool - s.week}週は上げられない` : `直近3か月の純利益の平均が${yenFmt(nx.need)}を超えたら`, 'bad');
      raiseLife(s);
      playSe('levelup');
      api.refresh();
      onChange?.();
    };
    const lower = async () => {
      const r = await confirmBox({ title: '暮らしを下げる', lines: [`「${LIFESTYLES[lv].name}」をやめます。`, 'やる気が大きく下がり、24週は暮らしを上げられない。'], okLabel: '下げる', danger: true });
      if (!r.ok) return;
      lowerLife(s);
      playSe('debuff');
      api.refresh();
      onChange?.();
    };
    body.append(
      h('div', { class: 'ledger-grid' },
        h('div', { class: 'lg-row' }, h('span', {}, 'いまの暮らし'), h('b', {}, LIFESTYLES[lv].name)),
        h('div', { class: 'lg-row' }, h('span', {}, '毎月の暮らしの出費'), h('b', {}, yenFmt(lifeCost(s)))),
        h('div', { class: 'lg-row' }, h('span', {}, '家族の信頼'), h('b', { class: familyOf(s) <= 30 ? 'neg' : familyOf(s) >= 80 ? 'pos' : '' }, `${familyOf(s)}（${familyLabel(familyOf(s))}）`)),
      ),
      h('p', { class: 'note' }, '家族の信頼は、部屋が段ボールで埋まる・働きすぎ・夜更かしで下がり、休む・気晴らし・家族と過ごすと戻る。下がりすぎると家族会議、高いと梱包を手伝ってくれる。'),
      h('p', { class: 'note' }, '稼げるようになると、暮らしを上げる誘いが来る。上げると体力やる気に効くが、出費は毎月かかる。一度上げた暮らしを下げると、やる気が大きく下がる。'),
      ...LIFESTYLES.slice(1).map((x, i) => h('div', { class: `career-row life-row ${i + 1 <= lv ? 'on' : ''}` },
        h('span', { class: 'life-lv' }, i + 1 <= lv ? '★' : `${i + 1}`),
        h('div', {}, h('b', {}, x.name), h('small', {}, x.perk), h('small', { class: 'reg-rule' }, `毎月 +${yenFmt(x.cost)}・直近3か月の純利益の平均 ${yenFmt(x.need)} から`)),
      )),
      h('div', { class: 'menu-list' },
        nx ? h('button', { class: 'btn', onclick: raise }, `暮らしを上げる：${nx.name}（毎月 +${yenFmt(nx.cost)}）`) : '',
        lv ? h('button', { class: 'btn danger', onclick: lower }, `暮らしを下げる（${LIFESTYLES[lv].name}をやめる）`) : '',
      ),
    );
  }).closed;
}
