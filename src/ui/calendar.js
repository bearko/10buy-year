// 時間の流れの演出：週のはじめの日めくり（0.6秒。タップで飛ばせる）と、ステージの季節・夜の色味。
// 画像は増やさず、CSS の色と粒で見せる（動きを減らす設定では粒を止める）
import { monthOf, weekOfMonth, yearOf } from '../engine/calendar.js';
import { $, h } from './dom.js';

const SEASON = { 3: 'spring', 4: 'spring', 5: 'spring', 6: 'summer', 7: 'summer', 8: 'summer', 9: 'autumn', 10: 'autumn', 11: 'autumn', 12: 'winter', 1: 'winter', 2: 'winter' };
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// ステージの季節（4月〜は春…）。refresh のたびに呼ぶ
export function setSeason(week) {
  const stage = $('#stage');
  if (!stage) return;
  const season = SEASON[monthOf(week)];
  if (stage.dataset.season !== season) stage.dataset.season = season;
  if (!$('#stage-fx')) $('#stage-bg')?.after(h('div', { id: 'stage-fx', 'aria-hidden': 'true' }));
}

// 夜の行動のあいだは、ステージを夜の色味に
export const setNight = (on) => document.body.classList.toggle('night-time', on);

// 日めくり：月が変わる週は月の名前を大きく
export function weekFlip(week, { quick = false } = {}) {
  const stage = $('#stage');
  if (!stage || quick) return Promise.resolve();
  const first = weekOfMonth(week) === 1;
  const card = h('div', { class: `wk-flip ${first ? 'month' : ''}` },
    h('small', {}, `${yearOf(week)}年目`),
    h('b', {}, `${monthOf(week)}月`),
    h('span', {}, `第${weekOfMonth(week)}週`));
  stage.append(card);
  return new Promise((resolve) => {
    const done = () => {
      card.remove();
      resolve();
    };
    card.onclick = done;
    setTimeout(done, reduced() ? 350 : first ? 900 : 650);
  });
}
