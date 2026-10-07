// 発送の演出：部屋に積んであった売れた品が、開いた段ボールに上から入り、フタを閉じてガムテープを貼って送り出される。
// 操作はなく、テンポよく流す（タップで早送り）。売上の金額も1つずつ積み上がり、在庫が部屋から減っていくのが見える
import { productImage, productOf } from '../data/products.js';
import { shipTargets } from '../engine/worklife.js';
import { playSe } from './audio.js';
import { $, h, yenFmt } from './dom.js';
import { roomLayer, setBackground } from './stage.js';

const PER_BOX = 4;

export async function shipScene(sold) {
  const items = shipTargets(sold);
  if (!items.length) return;
  setBackground('home');
  const stage = $('#stage');
  const room = roomLayer();
  room.hidden = false;
  let skip = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const speed = items.length > 8 ? 0.6 : 1;
  const ms = (t) => (skip ? 0 : t * speed);
  const wait = (t) => new Promise((r) => setTimeout(r, ms(t)));
  let total = 0;
  const sum = h('div', { class: 'ship-sum' }, h('small', {}, '発送'), h('b', {}, `0/${items.length}件`), h('span', {}, yenFmt(0)));
  const layer = h('div', { class: 'ship', onclick: () => { skip = true; } }, sum, h('small', { class: 'ship-skip' }, 'タップで早送り'));
  stage.append(layer);
  const S = () => stage.getBoundingClientRect();
  let done = 0;

  for (let k = 0; k < items.length; k += PER_BOX) {
    const chunk = items.slice(k, k + PER_BOX);
    const box = h('div', { class: 'ship-box' }, h('i', { class: 'flap l' }), h('i', { class: 'flap r' }), h('i', { class: 'tape' }), h('b', { class: 'ship-stamp' }, '発送！'));
    layer.append(box);
    box.animate([{ transform: 'translate(-50%, 60px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: ms(220), easing: 'ease-out', fill: 'both' });
    await wait(220);
    for (const x of chunk) {
      const st = S();
      const b = box.getBoundingClientRect();
      // 部屋に置いてあったその品（なければ、部屋のどこかから）
      const src = room.querySelector(`img[data-uid="${x.uid}"]`) || room.querySelector(`img[data-pid="${x.pid}"]`);
      const r = src?.getBoundingClientRect() || { left: st.left + st.width * (0.1 + Math.random() * 0.8), top: st.bottom - 70, width: 64, height: 64 };
      src?.remove();
      const fly = h('img', { class: 'ship-fly', src: productImage(productOf(x.pid)), alt: '' });
      fly.style.left = `${r.left - st.left}px`;
      fly.style.top = `${r.top - st.top}px`;
      layer.append(fly);
      const dx = b.left + b.width / 2 - 32 - r.left;
      const topY = b.top - 70 - r.top;
      const inY = b.top - 10 - r.top;
      fly.animate([
        { transform: 'translate(0, 0) rotate(0deg)', opacity: 1 },
        { transform: `translate(${dx}px, ${topY}px) rotate(-8deg)`, opacity: 1, offset: 0.6 },
        { transform: `translate(${dx}px, ${inY}px) scale(0.7)`, opacity: 0 },
      ], { duration: ms(420), easing: 'ease-in-out', fill: 'forwards' });
      setTimeout(() => fly.remove(), ms(440));
      await wait(300);
      done++;
      total += x.net || 0;
      sum.children[1].textContent = `${done}/${items.length}件`;
      sum.children[2].textContent = yenFmt(total);
      const net = x.net || 0;
      const pop = h('span', { class: `ship-yen ${net < 0 ? 'neg' : ''}` }, `${net >= 0 ? '+' : ''}${yenFmt(net)}`);
      pop.style.left = `${b.left - st.left + b.width / 2}px`;
      pop.style.top = `${b.top - st.top - 20}px`;
      layer.append(pop);
      pop.animate([{ transform: 'translate(-50%, 0)', opacity: 1 }, { transform: 'translate(-50%, -36px)', opacity: 0 }], { duration: ms(700), easing: 'ease-out', fill: 'forwards' });
      setTimeout(() => pop.remove(), ms(720));
      if (!skip) playSe('coin');
    }
    await wait(160);
    box.classList.add('closed'); // フタを閉じる
    await wait(200);
    box.classList.add('taped'); // ガムテープ
    await wait(260);
    box.classList.add('sent'); // 発送！
    if (!skip) playSe('hint');
    box.animate([{ transform: 'translate(-50%, 0)' }, { transform: 'translate(-50%, 0) rotate(-3deg)', offset: 0.3 }, { transform: 'translate(160%, 0) rotate(4deg)' }], { duration: ms(420), easing: 'ease-in', fill: 'forwards' });
    await wait(420);
    box.remove();
  }
  await wait(250);
  layer.remove();
}
