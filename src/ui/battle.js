// 取引トラブルを「交渉バトル」として見せる（マイクリのバトル演出：VSのカットイン、スキル発動のカットイン、攻撃エフェクト、勝敗の表示）。
// 中身は今までどおり troubles.js の会話と選択肢。選んだ対応が「スキル」になり、結果の良し悪しで「交渉成立／決裂」になる
import { CAST, portraitOf } from '../data/cast.js';
import { playSe } from './audio.js';
import { $, h } from './dom.js';

const wait = (ms) => new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
let cur = null; // { el, gauge, resolved }

export const inBattle = () => !!cur;

export async function battleStart(enemy, title) {
  battleEnd();
  const stage = $('#stage');
  const c = CAST[enemy] || {};
  const gauge = h('i', {});
  const el = h('div', { class: 'bt' },
    h('div', { class: 'bt-hud' },
      h('span', { class: 'bt-me' }, 'クリス'),
      h('b', {}, 'VS'),
      h('span', { class: 'bt-foe' }, c.name || '相手', h('div', { class: 'bt-gauge' }, gauge), h('small', {}, '相手の不満')),
    ));
  stage.append(el);
  cur = { el, gauge, resolved: false, hp: 100 };
  // 対戦開始のカットイン（相手の顔と名前）
  const cut = h('div', { class: 'mch-cutin foe' }, h('i', { class: 'mch-cutin-shine' }), h('img', { src: portraitOf(enemy, 'idle'), alt: '' }), h('div', {}, h('small', {}, '取引トラブル発生'), h('b', {}, title || c.name || '')));
  el.append(cut);
  playSe('trouble');
  await wait(1100);
  cut.remove();
}

// 選んだ対応を「スキル」として発動：味方のカットイン → 相手に攻撃エフェクト → 不満ゲージが減る
export async function battleSkill(label) {
  if (!cur) return;
  const cut = h('div', { class: 'mch-cutin ally' }, h('i', { class: 'mch-cutin-shine' }), h('img', { src: portraitOf('chris', 'guts'), alt: '' }), h('div', {}, h('small', {}, '交渉スキル発動'), h('b', {}, label)));
  cur.el.append(cut);
  playSe('hint');
  await wait(800);
  cut.remove();
  const fx = h('i', { class: 'bt-fx' });
  cur.el.append(fx);
  playSe('hit');
  // 9×9コマ（100px）のスプライトを順に送る
  for (let i = 0; i < 81; i += 3) {
    fx.style.backgroundPosition = `${-(i % 9) * 100}px ${-Math.floor(i / 9) * 100}px`;
    await wait(16);
  }
  fx.remove();
  cur.hp = Math.max(25, cur.hp - 45);
  cur.gauge.style.width = `${cur.hp}%`;
}

// 結果：good なら交渉成立（不満ゲージ0）、bad なら決裂
export async function battleResult(tone) {
  if (!cur || cur.resolved || !['good', 'bad'].includes(tone)) return;
  cur.resolved = true;
  const win = tone === 'good';
  if (win) {
    cur.hp = 0;
    cur.gauge.style.width = '0%';
  }
  const label = h('div', { class: `mch-result ${win ? 'win' : 'lose'}` }, h('p', {}, win ? '交渉成立！' : '交渉決裂…'));
  cur.el.append(label);
  playSe(win ? 'win' : 'lose');
  await wait(1200);
  label.remove();
}

export function battleEnd() {
  cur?.el.remove();
  cur = null;
}
