// 取引トラブル・値下げ交渉の演出（テンポ優先の控えめなもの）。
// 上に「クリス VS 相手」と相手の不満ゲージを出し、選んだ対応は「スキル」としてクリスの頭上に名前を出す。
// 中身は今までどおり troubles.js の会話と選択肢。結果の良し悪しで「交渉成立／決裂」を小さく出す
import { CAST } from '../data/cast.js';
import { playSe } from './audio.js';
import { $, h } from './dom.js';

const wait = (ms) => new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));
let cur = null; // { el, gauge, resolved, hp }

export const inBattle = () => !!cur;

// 始まり：カットインは出さず、上のバーを出すだけ（効果音は会話の側で鳴る）
export async function battleStart(enemy, title) {
  battleEnd();
  const c = CAST[enemy] || {};
  const gauge = h('i', {});
  const el = h('div', { class: 'bt' },
    h('div', { class: 'bt-hud' },
      h('span', { class: 'bt-me' }, 'クリス'),
      h('b', {}, 'VS'),
      h('span', { class: 'bt-foe' }, h('span', {}, title ? `${c.name || '相手'}（${title}）` : c.name || '相手'), h('div', { class: 'bt-gauge' }, gauge), h('small', {}, '相手の不満')),
    ));
  $('#stage').append(el);
  cur = { el, gauge, resolved: false, hp: 100 };
  await wait(250);
}

// 選んだ対応を「スキル」として発動：クリスの頭上にスキル名 → 相手に攻撃エフェクト → 不満ゲージが減る
export async function battleSkill(label) {
  if (!cur) return;
  const stage = $('#stage').getBoundingClientRect();
  const chris = $('#sprite-left');
  const r = chris && !chris.hidden ? chris.getBoundingClientRect() : null;
  const tag = h('div', { class: 'bt-skill' }, h('small', {}, 'スキル'), h('b', {}, label));
  if (r) {
    tag.style.left = `${r.left - stage.left + r.width / 2}px`;
    tag.style.top = `${Math.max(64, r.top - stage.top + 8)}px`;
  }
  cur.el.append(tag);
  playSe('trouble'); // crash.mp3
  const fx = h('i', { class: 'bt-fx' });
  cur.el.append(fx);
  // 9×9コマ（100px）のスプライトを順に送る
  for (let i = 0; i < 81; i += 3) {
    fx.style.backgroundPosition = `${-(i % 9) * 100}px ${-Math.floor(i / 9) * 100}px`;
    await wait(16);
  }
  fx.remove();
  cur.hp = Math.max(25, cur.hp - 45);
  cur.gauge.style.width = `${cur.hp}%`;
  await wait(350);
  tag.remove();
}

// 結果：good なら交渉成立（不満ゲージ0）、bad なら決裂。上のバーに小さく出すだけ（ジングルは鳴らさない）
export async function battleResult(tone) {
  if (!cur || cur.resolved || !['good', 'bad'].includes(tone)) return;
  cur.resolved = true;
  const win = tone === 'good';
  if (win) {
    cur.hp = 0;
    cur.gauge.style.width = '0%';
  }
  cur.el.querySelector('.bt-hud').append(h('em', { class: `bt-res ${win ? 'win' : 'lose'}` }, win ? '交渉成立' : '交渉決裂'));
  await wait(400);
}

export function battleEnd() {
  cur?.el.remove();
  cur = null;
}
