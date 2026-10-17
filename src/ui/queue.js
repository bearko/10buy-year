// 行列に並ぶ：始発で店へ → 整理券を受け取る → 開店 → 前から順に売れていき、自分の番号まで在庫がもつか
import { productImage, productOf } from '../data/products.js';
import { playSe } from './audio.js';
import { $, h } from './dom.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function queueScene(st, { quick = false } = {}) {
  return new Promise((resolve) => {
    const p = productOf(st.pid);
    const clock = h('b', { class: 'qs-clock' }, '5:12');
    const say = h('div', { class: 'qs-say' }, '始発で店の前へ。もう30人は並んでいる…');
    const ticket = h('div', { class: 'qs-ticket hidden' },
      h('small', {}, '整理券'),
      h('b', {}, `No.${st.ticket}`),
      h('span', {}, `本日の入荷 ${st.stock}点${st.limited ? '・お一人様1点（会員証の確認あり）' : ''}`));
    const counter = h('div', { class: 'qs-counter hidden' }, h('small', {}, 'いま販売中の番号'), h('b', {}, '0'));
    const left = h('div', { class: 'qs-left hidden' }, `のこり ${st.stock}点`);
    const btn = h('button', { class: 'btn primary qs-ok hidden' }, st.ok ? '購入へ' : 'とぼとぼ帰る');
    const root = h('div', { class: 'qscene' },
      h('div', { class: 'qs-box' },
        h('div', { class: 'qs-sky' }, clock, h('img', { src: productImage(p), alt: '' }), h('div', { class: 'qs-line' }, ...Array.from({ length: 12 }, () => h('i', {})))),
        h('div', { class: 'qs-target' }, `狙い：${p.name}`),
        say, ticket, counter, left, btn));
    const finish = () => {
      root.remove();
      resolve();
    };
    btn.onclick = finish;
    $('#modal-root').append(root);

    (async () => {
      const wait = (ms) => sleep(quick ? 0 : ms);
      await wait(900);
      clock.textContent = '6:30';
      say.textContent = '店員さんが整理券を配りはじめた。';
      ticket.classList.remove('hidden');
      playSe('hint');
      await wait(1200);
      clock.textContent = '10:00';
      say.textContent = '開店。前から順に呼ばれていく…';
      counter.classList.remove('hidden');
      left.classList.remove('hidden');
      const end = Math.min(st.ticket, st.stock);
      const steps = 24;
      for (let i = 1; i <= steps; i++) {
        const n = Math.round((end * i) / steps);
        counter.lastChild.textContent = String(n);
        left.textContent = `のこり ${Math.max(0, st.stock - n)}点`;
        await wait(55);
      }
      if (st.ok) {
        say.textContent = `「整理券${st.ticket}番の方、どうぞ！」`;
        root.classList.add('win');
        playSe('win');
      } else {
        say.textContent = `${st.stock}番で「本日分は完売です」。自分は${st.ticket}番だった…。`;
        root.classList.add('lose');
        playSe('lose');
      }
      btn.classList.remove('hidden');
      if (quick) finish();
    })();
  });
}
