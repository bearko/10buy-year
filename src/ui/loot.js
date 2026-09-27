// 仕入れ・家探しで手に入れた商品を、クリスの右側にカードで見せる。複数あればページ送り
import { productImage, productOf } from '../data/products.js';
import { hasSkill } from '../engine/effects.js';
import { estimate } from '../engine/market.js';
import { $, clear, h, yenFmt } from './dom.js';
import { hidePartner, hold } from './stage.js';

export async function showItems(s, title, list) {
  if (!list.length) return;
  const el = $('#loot');
  let i = 0;
  const draw = () => {
    const it = list[i];
    const p = productOf(it.pid);
    clear(el).append(
      h('div', { class: 'loot-head' },
        h('b', {}, 'GET!'),
        list.length > 1
          ? h('div', { class: 'loot-pager' },
            h('button', { 'aria-label': '前へ', onclick: () => { i = (i + list.length - 1) % list.length; draw(); } }, '◀'),
            h('span', {}, `${i + 1}/${list.length}`),
            h('button', { 'aria-label': '次へ', onclick: () => { i = (i + 1) % list.length; draw(); } }, '▶'),
          )
          : null,
      ),
      h('img', { class: 'loot-ic', src: productImage(p), alt: '' }),
      h('div', { class: 'loot-name' }, p.name, it.qty > 1 ? h('small', {}, ` ×${it.qty}`) : null),
      h('div', { class: 'loot-genre' }, p.genre),
      h('p', { class: 'loot-desc' }, p.desc),
      h('div', { class: 'loot-price' }, h('span', {}, hasSkill(s, 'eye_market') ? '推定相場' : '相場'), h('b', {}, yenFmt(estimate(s, it.pid)))),
    );
  };
  hidePartner();
  draw();
  document.body.classList.add('loot-show');
  const first = productOf(list[0].pid).name;
  const units = list.reduce((a, x) => a + x.qty, 0);
  await hold(title, list.length > 1 ? `「${first}」ほか、全部で${units}個` : `「${first}」${units > 1 ? ` ×${units}` : ''}`);
  document.body.classList.remove('loot-show');
  clear(el);
}

// 同じ商品をまとめる
export function groupItems(pids) {
  const map = new Map();
  for (const x of pids) {
    const pid = typeof x === 'string' ? x : x.pid;
    const qty = typeof x === 'string' ? 1 : x.qty;
    map.set(pid, (map.get(pid) || 0) + qty);
  }
  return [...map].map(([pid, qty]) => ({ pid, qty }));
}
