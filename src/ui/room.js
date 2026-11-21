// 発送の演出：部屋に積んであった売れた品が、開いた段ボールに上から入り、フタを閉じてガムテープを貼って送り出される。
// 注文が複数あれば、開始を少しずつずらして並行して梱包する。操作はなく、テンポよく流す（タップで早送り）。売上の金額も1つずつ積み上がり、在庫が部屋から減っていくのが見える
import { productImage, productOf } from '../data/products.js';
import { shipTargets } from '../engine/worklife.js';
import { playSe } from './audio.js';
import { $, h, yenFmt } from './dom.js';
import { roomLayer, setBackground } from './stage.js';

const LANES = 3; // 同時に梱包する段ボールの数（注文ごとに別の段ボール）

export async function shipScene(sold) {
  const items = shipTargets(sold);
  if (!items.length) return;
  setBackground('home');
  const stage = $('#stage');
  const room = roomLayer();
  room.hidden = false;
  let skip = matchMedia('(prefers-reduced-motion: reduce)').matches;
  // 並行して梱包するので、1件ずつのテンポはゆっくりめのまま。注文がとても多いときだけ速める
  const speed = Math.max(0.45, Math.min(1, 9 / items.length));
  const ms = (t) => (skip ? 0 : t * speed);
  const wait = (t) => new Promise((r) => setTimeout(r, ms(t)));
  let total = 0;
  const sum = h('div', { class: 'ship-sum' }, h('small', {}, '発送'), h('b', {}, `0/${items.length}件`), h('span', {}, yenFmt(0)));
  const layer = h('div', { class: 'ship', onclick: () => { skip = true; } }, sum, h('small', { class: 'ship-skip' }, 'タップで早送り'));
  stage.append(layer);
  const S = () => stage.getBoundingClientRect();
  let done = 0;
  const lanes = Math.min(LANES, items.length);
  if (lanes > 1) layer.classList.add(`lanes-${lanes}`);

  // 1件分：段ボールを置く → 品が入る → フタ・ガムテープ → 発送！
  async function pack(x, lane) {
    const box = h('div', { class: 'ship-box' }, h('i', { class: 'flap l' }), h('i', { class: 'flap r' }), h('i', { class: 'tape' }), h('b', { class: 'ship-stamp' }, '発送！'));
    box.style.left = `${((lane + 0.5) / lanes) * 100}%`;
    layer.append(box);
    box.animate([{ transform: 'translate(-50%, 60px)', opacity: 0 }, { transform: 'translate(-50%, 0)', opacity: 1 }], { duration: ms(220), easing: 'ease-out', fill: 'both' });
    await wait(220);
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
    await wait(160);
    box.classList.add('closed'); // フタを閉じる
    await wait(200);
    box.classList.add('taped'); // ガムテープ
    await wait(260);
    box.classList.add('sent'); // 発送！
    if (!skip) playSe('hint');
    // 下へ送り出す（横に流すと、となりで梱包中の箱と重なるので）
    box.animate([{ transform: 'translate(-50%, 0)' }, { transform: 'translate(-50%, -6px) rotate(-3deg)', offset: 0.3 }, { transform: 'translate(-50%, 140%) rotate(2deg)', opacity: 0 }], { duration: ms(420), easing: 'ease-in', fill: 'forwards' });
    await wait(420);
    box.remove();
  }

  // 少しずつ時間をずらして始め、空いた場所から次の段ボールを置く（何件も並行して梱包しているように）
  const free = [...Array(lanes).keys()];
  const running = new Set();
  for (const x of items) {
    while (!free.length) await Promise.race(running);
    const lane = free.shift();
    const job = pack(x, lane).then(() => {
      free.push(lane);
      free.sort((a, c) => a - c);
      running.delete(job);
    });
    running.add(job);
    await wait(380);
  }
  await Promise.all(running);
  await wait(250);
  layer.remove();
}
