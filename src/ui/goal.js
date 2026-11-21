// 目標の演出。達成したら紙吹雪（My Crypto Heroes の confetti.js）と大きな帯、
// 新しい目標が決まったら大きなポップアップで目指す金額を見せる
import confetti from '../../assets/vendor/confetti.js';
import { goalOf, STAGES } from '../engine/career.js';
import { CAST } from '../data/cast.js';
import { playSe } from './audio.js';
import { $, h, wait } from './dom.js';

const man = (v) => (Math.abs(v) >= 10000 ? `${(Math.round(v / 1000) / 10).toLocaleString('ja-JP')}万円` : `${Math.round(v).toLocaleString('ja-JP')}円`);

export async function celebrate(text, { quick = false } = {}) {
  confetti.start(2600, 120, 200);
  const band = h('div', { class: 'celebrate' }, h('div', { class: 'cel-band' }, h('small', {}, 'ACHIEVEMENT'), h('b', {}, text)));
  $('#modal-root').append(band);
  await wait(quick ? 900 : 2000);
  band.classList.add('out');
  await wait(300);
  band.remove();
}

export function goalPopup(s, { quick = false } = {}) {
  const g = goalOf(s);
  return new Promise((resolve) => {
    const amount = h('b', { class: 'gp-amount' }, man(0));
    const root = h('div', { class: 'goal-pop' },
      h('div', { class: 'gp-card' },
        h('div', { class: 'gp-kicker' }, `STAGE ${g.stage} の目標`),
        h('div', { class: 'gp-title' }, g.short),
        amount,
        h('p', { class: 'gp-cond' }, g.title),
        h('div', { class: 'gp-mine' }, h('img', { src: CAST.mine.poses.pointer, alt: '' }), h('span', {}, g.mine)),
        h('button', { class: 'btn primary big gp-go', onclick: () => { root.remove(); resolve(); } }, 'これを目指す！'),
      ),
    );
    $('#modal-root').append(root);
    playSe('levelup');
    // 金額を0からカウントアップ
    const t0 = performance.now();
    const dur = quick ? 200 : 800;
    const tick = (now) => {
      const k = Math.min(1, (now - t0) / dur);
      amount.textContent = man(g.target * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    if (quick) setTimeout(() => { root.remove(); resolve(); }, 700);
  });
}

// ステージ到達：できるようになったことを、アイコンつきで並べる（行動・夜の行動・メニュー）
export function unlockedPopup(stage, items) {
  const st = STAGES[stage - 1];
  return new Promise((resolve) => {
    const close = () => {
      root.remove();
      window.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e) => {
      if (['Escape', 'Enter', ' '].includes(e.key)) close();
    };
    const root = h('div', { class: 'goal-pop' },
      h('div', { class: 'gp-card unlock-card' },
        h('div', { class: 'gp-kicker' }, `STAGE ${stage}`),
        h('div', { class: 'gp-title' }, st ? st.name : ''),
        h('small', { class: 'mc-label' }, 'できるようになったこと'),
        items.length
          ? h('div', { class: 'ul-list' }, ...items.map((x, i) => h('div', { class: 'ul-item', style: { animationDelay: `${0.15 + i * 0.08}s` } },
            x.icon ? h('img', { src: x.icon, alt: '' }) : h('span', { class: 'ul-dot' }, '★'),
            h('b', {}, x.label),
            h('small', {}, x.kind))))
          : null,
        h('p', { class: 'ul-tree' }, 'スキルツリーに、このステージの新しいパネルが並んだ'),
        h('button', { class: 'btn primary big gp-go', onclick: close }, 'OK'),
      ),
    );
    window.addEventListener('keydown', onKey);
    $('#modal-root').append(root);
    playSe('stageup');
    confetti.start(1600, 80, 160);
  });
}

export { man as manYen };
