// くじ引きの画面（engine/kuji.js）：残りの賞品の表を見て、何回引くかを決める
import { productImage, productOf } from '../data/products.js';
import { drawKuji, KUJI_PRICE, KUJI_PRIZES, kujiLeft, LAST_ONE } from '../engine/kuji.js';
import { priceOf } from '../engine/market.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

export function kujiModal(s) {
  let result = null;
  const modal = openModal('ルビーくじ', (body, api) => {
    const left = kujiLeft(s);
    body.append(h('p', { class: 'note' }, `1回${yenFmt(KUJI_PRICE)}。残り${left}枚。最後の1枚を引くと「ラストワン賞」ももらえる。下位賞はたくさん売るとダブついて値崩れする。`));
    const rows = [...KUJI_PRIZES.map((p) => ({ ...p, left: s.kuji.box[p.tier] })), { tier: 'ラストワン', pid: LAST_ONE, n: 1, left: s.kuji.lastTaken ? 0 : 1 }];
    body.append(h('div', { class: 'kuji-sheet' }, ...rows.map((r) => {
      const p = productOf(r.pid);
      return h('div', { class: `kuji-row ${r.left ? '' : 'out'}` },
        h('b', { class: 'kuji-tier' }, r.tier.length > 1 ? r.tier : `${r.tier}賞`),
        h('img', { src: productImage(p), alt: '' }),
        h('span', { class: 'kuji-name' }, p.name, h('small', {}, p.genre.replace(/^くじの.+?（(.+)）$/, '$1'))),
        h('span', { class: 'kuji-left' }, `${r.left}/${r.n}`, h('small', {}, `相場 ${yenFmt(priceOf(s, r.pid))}`)));
    })));
    if (result) {
      body.append(h('div', { class: 'kuji-result' },
        h('b', {}, `${result.got.length}回引いた！`),
        h('div', { class: 'kuji-balls' }, ...result.got.map((t) => h('span', { class: `kuji-ball t${t}` }, t))),
        result.last ? h('p', { class: 'good' }, 'ラストワン賞をゲット！') : null));
    }
    const draw = (n) => {
      const r = drawKuji(s, n);
      if (!r.ok) return toast(r.msg, 'bad');
      result = r;
      playSe(r.count.kuji_a || r.last ? 'levelup' : 'coin');
      api.refresh();
    };
    if (left) {
      body.append(h('div', { class: 'kuji-acts' },
        ...[1, 5, 10].filter((n) => n < left).map((n) => h('button', { class: 'btn', onclick: () => draw(n) }, `${n}回（${yenFmt(n * KUJI_PRICE)}）`)),
        h('button', { class: 'btn primary', onclick: () => draw(left) }, `残り全部（${left}回・${yenFmt(left * KUJI_PRICE)}）`)));
    }
  }, { closeLabel: 'くじ売り場を離れる' });
  return modal.closed;
}
