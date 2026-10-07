// 撮影と梱包の画面（engine/worklife.js）
import { productImage, productOf } from '../data/products.js';
import { activeUnits } from '../engine/inventory.js';
import { applyPhoto, BOXES, boxFit, buyRingLight, chargeOversize, oversizeCost, PHOTO, photoBoost, photoScore, RING_LIGHT_PRICE } from '../engine/worklife.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

// 撮影：背景・光・枚数を選ぶと、写真の出来で今週の売れ行きが変わる
export function photoModal(s) {
  const u = activeUnits(s).find((x) => !x.listing) || activeUnits(s)[0];
  const p = u ? productOf(u.pid) : null;
  // 前回の撮り方を覚えておく（はじめては、ありあわせの撮り方）
  const pick = { bg: 'wood', light: 'window', shots: 3, ...(s.flags.photoPick || {}) };
  if (pick.light === 'ring' && !s.flags.ringLight) pick.light = 'window';
  let done = null;
  const modal = openModal('撮影・出品作業', (body, api) => {
    const bg = PHOTO.bg.find((x) => x.id === pick.bg);
    const light = PHOTO.light.find((x) => x.id === pick.light);
    const score = photoScore(pick);
    body.append(
      h('div', { class: 'pz-shot', style: { background: bg.color, filter: `brightness(${light.bright})` } },
        p ? h('img', { src: productImage(p), alt: p.name }) : null,
        h('span', { class: 'pz-count' }, `${pick.shots}枚`),
        pick.light === 'fluor' ? h('i', { class: 'pz-shadow' }) : null,
      ),
      h('p', { class: 'pz-name' }, p ? `「${p.name}」から撮っていく` : '出品中の品を撮り直す'),
    );
    for (const [key, title] of [['bg', '背景'], ['light', '光'], ['shots', '枚数']]) {
      body.append(h('div', { class: 'pz-row' }, h('b', {}, title),
        ...PHOTO[key].map((x) => {
          const locked = x.need && !s.flags[x.need];
          return h('button', {
            class: `btn small ${pick[key] === x.id ? 'on' : ''} ${locked ? 'locked' : ''}`,
            onclick: () => {
              if (locked) {
                if (!window.confirm(`リングライトを${yenFmt(RING_LIGHT_PRICE)}で買いますか？（一度買えばずっと使える）`)) return;
                if (!buyRingLight(s)) return toast('お金が足りない…', 'bad');
                toast('リングライトを買った', 'good');
              }
              pick[key] = x.id;
              api.refresh();
            },
          }, locked ? `🔒${x.name}（${yenFmt(RING_LIGHT_PRICE)}）` : x.name);
        })));
    }
    body.append(h('div', { class: 'pz-score' },
      h('span', {}, `写真の出来 ${'★'.repeat(Math.round(score / 2))}${'☆'.repeat(4 - Math.round(score / 2))}`),
      h('b', {}, `今週の売れ行き ×${photoBoost(score).toFixed(2)}`)));
    if (done) body.append(h('p', { class: 'good' }, done));
  }, {
    closeLabel: '撮影して出品',
  });
  return modal.closed.then(() => {
    s.flags.photoPick = { ...pick };
    const r = applyPhoto(s, pick);
    playSe('hint');
    toast(`写真の出来 ${r.score}/8：今週の売れ行き ×${r.boost.toFixed(2)}`, r.score >= 6 ? 'good' : r.score <= 2 ? 'bad' : '');
  });
}

// 梱包：売れた品ごとに箱を選ぶ（大きすぎると送料が上がる、小さすぎると入らない）
export function packModal(s, sold) {
  const picks = sold.map((x) => ({ pid: x.pid, box: null, tried: [] }));
  const modal = openModal('朝の梱包ラッシュ', (body, api) => {
    body.append(h('p', { class: 'note' }, '売れた品を箱に詰めて、コンビニに持ち込む。品に合う箱を選ぼう（大きすぎると送料が上がる）。'));
    for (const x of picks) {
      const p = productOf(x.pid);
      body.append(h('div', { class: `card row pk-row ${x.box ? 'done' : ''}` },
        h('img', { class: 'pk-img', src: productImage(p), alt: '' }),
        h('div', { class: 'grow' },
          h('div', { class: 'name' }, p.name),
          h('div', { class: 'pk-boxes' }, ...BOXES.map((b) => h('button', {
            class: `btn small pk-box ${x.box === b.id ? 'on' : ''} ${x.tried.includes(b.id) ? 'ng' : ''}`,
            disabled: !!x.box,
            onclick: () => {
              const fit = boxFit(x.pid, b.id);
              if (fit === 'small') {
                x.tried.push(b.id);
                playSe('damage');
                toast('入らない！ ひとつ上の箱にしよう', 'bad');
              } else {
                x.box = b.id;
                playSe(fit === 'ok' ? 'coin' : 'hint');
                if (fit === 'big') toast(`ぶかぶかだ…（送料 +${yenFmt(oversizeCost(x.pid, b.id))}）`, 'bad');
              }
              api.refresh();
            },
          }, b.name))),
          x.box ? h('small', { class: oversizeCost(x.pid, x.box) ? 'neg' : 'pos' }, oversizeCost(x.pid, x.box) ? `送料 +${yenFmt(oversizeCost(x.pid, x.box))}` : 'ぴったり') : null,
        )));
    }
  }, { closeLabel: 'コンビニに持ち込む' });
  return modal.closed.then(() => {
    // 選ばなかった品は、手近な大きい箱で送った
    for (const x of picks) if (!x.box) x.box = 100;
    const extra = chargeOversize(s, picks);
    if (extra) toast(`箱が大きすぎて、送料が${yenFmt(extra)}増えた`, 'bad');
  });
}
