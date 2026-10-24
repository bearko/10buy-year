// 業者オークションの競りと、問屋の見積書（engine/pro.js）
import { portraitOf, CAST } from '../data/cast.js';
import { productImage, productOf } from '../data/products.js';
import { buy, cardAvailable } from '../engine/inventory.js';
import { negotiateQuote, quoteLine, quoteRate, SERI_RIVAL, seriOffer } from '../engine/pro.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

const TICK = 900; // 競りの1拍（ミリ秒）
const COUNT = 3; // 札が上がらないまま、この拍数たつと決まる

// 会場の競り：ロットが順番に流れ、手を挙げ続けた人が落とす
export function seriModal(s, lots) {
  if (!lots?.length) return Promise.resolve();
  let i = 0;
  let lot = null;
  let price = 0;
  let holder = null; // 'me' | 'rival' | null
  let count = COUNT;
  let result = null; // 'won' | 'lost' | 'pass'
  let timer = null;
  const rival = CAST[SERI_RIVAL];
  const budget = () => s.cash + cardAvailable(s);

  function reset() {
    lot = lots[i];
    price = lot.start;
    holder = null;
    count = COUNT + 1;
    result = null;
  }
  function open() {
    reset();
    clearInterval(timer);
    timer = setInterval(tick, TICK);
  }
  reset();
  function settle(r) {
    result = r;
    clearInterval(timer);
    if (r === 'won') {
      const o = seriOffer(s, lot, price);
      const res = buy(s, o, 1, s.cash >= price ? 'cash' : 'card');
      if (res?.ok === false) {
        result = 'lost';
        toast(res.msg, 'bad');
      } else {
        playSe('coin');
        s.stats.seriWins = (s.stats.seriWins || 0) + 1;
      }
    } else playSe(r === 'lost' ? 'damage' : 'hint');
  }
  function tick() {
    if (result) return;
    if (holder === 'me' && price + lot.step <= lot.rivalMax && count <= COUNT - 1) {
      // 相手が札を上げる
      price += lot.step;
      holder = 'rival';
      count = COUNT;
      playSe('hint');
    } else if (holder === null && count <= COUNT - 1 && lot.start <= lot.rivalMax) {
      holder = 'rival'; // だれも手を挙げなければ、相手が最初の札を入れる
      count = COUNT;
    } else {
      count--;
      if (count <= 0) {
        settle(holder === 'me' ? 'won' : holder === 'rival' ? 'lost' : 'pass');
        return modal.refresh();
      }
    }
    update();
  }
  function raise() {
    if (result || holder === 'me') return;
    const next = holder ? price + lot.step : price;
    if (next > budget()) return toast('お金が足りない…', 'bad');
    price = next;
    holder = 'me';
    count = COUNT;
    playSe('coin');
    update();
  }

  // 拍ごとの表示の更新は、作り直さずに中身だけ書き換える（押しかけのボタンが消えないように）
  const ref = {};
  const whoText = () => (result === 'won' ? `落札！ ${yenFmt(price)}で競り落とした` : result === 'lost' ? `${rival.name}が落札した` : result === 'pass' ? '札が入らず、流れた' : holder === 'me' ? 'あなたの札が最高値だ' : holder === 'rival' ? `${rival.name}が札を上げた` : '競りが始まる…');
  function update() {
    if (!ref.box) return;
    ref.box.className = `seri ${holder || ''} ${result || ''}`;
    ref.price.textContent = yenFmt(price);
    ref.count.textContent = result ? '' : '●'.repeat(Math.max(0, Math.min(COUNT, count))) + '○'.repeat(Math.max(0, COUNT - Math.max(0, Math.min(COUNT, count))));
    ref.who.textContent = whoText();
    if (ref.pass) ref.pass.disabled = holder === 'me';
    if (ref.raise) {
      ref.raise.disabled = holder === 'me';
      ref.raise.textContent = holder === 'me' ? '手を挙げている' : `手を挙げる（${yenFmt(holder ? price + lot.step : price)}）`;
    }
  }

  const modal = openModal('会場の競り', (body) => {
    const p = productOf(lot.pid);
    ref.price = h('div', { class: 'seri-price' });
    ref.count = h('div', { class: 'seri-count' });
    ref.who = h('span', {});
    ref.box = h('div', { class: 'seri' },
      h('img', { class: 'seri-img', src: productImage(p), alt: '' }),
      h('div', { class: 'seri-info' },
        h('b', {}, p.name), h('small', {}, p.genre),
        h('div', { class: 'seri-est' }, `見立て ${yenFmt(lot.est)}`),
        ref.price, ref.count,
      ),
    );
    body.append(
      h('p', { class: 'note' }, `ロット ${i + 1}/${lots.length}。手を挙げると、いまの値に札を入れる。だれも札を上げないまま${COUNT}拍たつと決まる。`),
      ref.box,
      h('div', { class: 'seri-who' }, h('img', { src: portraitOf(SERI_RIVAL), alt: '' }), ref.who),
    );
  }, {
    footer: (api) => {
      ref.pass = ref.raise = null;
      const out = result
        ? [h('button', { class: 'btn primary', onclick: () => { i++; if (i >= lots.length) { api.close(); } else { open(); api.refresh(); } } }, i + 1 >= lots.length ? '会場を出る' : '次のロットへ')]
        : [
            (ref.pass = h('button', { class: 'btn', onclick: () => { settle(holder === 'rival' ? 'lost' : 'pass'); api.refresh(); } }, '見送る')),
            (ref.raise = h('button', { class: 'btn primary', onclick: raise })),
          ];
      queueMicrotask(update);
      return out;
    },
  });
  open();
  modal.refresh();
  return modal.closed.then(() => clearInterval(timer));
}

// 問屋の見積書：掛け率と最低ロットを交渉する（それぞれ1回まで）
export function quoteModal(s, offers) {
  const tried = new Set();
  const list = offers.filter((o) => o.source === 'wholesale');
  if (!list.length) return Promise.resolve();
  const modal = openModal('見積書', (body, api) => {
    body.append(
      h('div', { class: 'quote' },
        h('div', { class: 'quote-head' }, h('b', {}, '御見積書'), h('small', {}, '支払い：現金（納品時）')),
        ...list.map((o) => h('div', { class: 'quote-row' }, h('span', {}, quoteLine(s, o)), h('b', {}, `${yenFmt(o.price)}/個`))),
      ),
      h('p', { class: 'note' }, `交渉が通る見込み 約${Math.round(quoteRate(s) * 100)}%（交渉の能力で上がる）`),
      h('div', { class: 'quote-acts' },
        ...[['rate', '掛け率をあと5%下げてもらう'], ['lot', '最低ロットを半分にしてもらう']].map(([k, label]) => h('button', {
          class: 'btn', disabled: tried.has(k),
          onclick: () => {
            tried.add(k);
            const ok = negotiateQuote(s, offers, k);
            playSe(ok ? 'coin' : 'damage');
            toast(ok ? '「……わかりました、その条件で」' : '「さすがにそれは、ちょっと…」', ok ? 'good' : 'bad');
            api.refresh();
          },
        }, tried.has(k) ? `${label}（交渉ずみ）` : label)),
      ),
    );
  }, { closeLabel: 'この条件で商品を見る' });
  return modal.closed;
}
