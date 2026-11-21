// 撮影の画面（engine/worklife.js）。発送は操作のない演出（ui/room.js）
import { productImage, productOf } from '../data/products.js';
import { activeUnits } from '../engine/inventory.js';
import { applyPhoto, buyRingLight, PHOTO, photoBoost, photoScore, RING_LIGHT_PRICE } from '../engine/worklife.js';
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
