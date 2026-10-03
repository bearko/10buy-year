import { $, clear, h } from './dom.js';

// モーダル。render(body, api) で中身を描画し、api.refresh() で再描画できる。
// footer を渡すと、閉じるボタンの代わりにフッターのボタンを並べる（refresh のたびに描き直す）
export function openModal(title, render, { closeLabel = '閉じる', onRefresh, footer: renderFooter } = {}) {
  let resolveClosed;
  const closed = new Promise((r) => (resolveClosed = r));
  const body = h('div', { class: 'modal-body' });
  const footer = h('div', { class: 'modal-footer' });
  const root = h('div', { class: 'modal-backdrop' }, h('div', { class: 'modal', role: 'dialog', 'aria-label': title }, h('div', { class: 'modal-title' }, title), body, footer));
  const api = {
    refresh() {
      const y = body.scrollTop;
      clear(body);
      render(body, api);
      body.scrollTop = y;
      if (renderFooter) {
        clear(footer);
        footer.append(...renderFooter(api));
      }
      onRefresh?.();
    },
    close() {
      root.remove();
      window.removeEventListener('keydown', onKey);
      resolveClosed();
    },
    closed,
  };
  const onKey = (e) => {
    if (e.key === 'Escape') api.close();
  };
  if (!renderFooter) footer.append(h('button', { class: 'btn primary', onclick: () => api.close() }, closeLabel));
  window.addEventListener('keydown', onKey);
  $('#modal-root').append(root);
  api.refresh();
  return api;
}

export function toast(text, tone = '') {
  const el = h('div', { class: `toast ${tone}` }, text);
  $('#modal-root').append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 1800);
}

// ゲーム内の確認ダイアログ。dontAsk を渡すと「次回から表示しない」チェックを出す
export function confirmBox({ title, lines = [], okLabel = 'OK', cancelLabel = 'やめる', danger = false, dontAsk = false }) {
  return new Promise((resolve) => {
    let skip = false;
    const finish = (ok) => {
      root.remove();
      window.removeEventListener('keydown', onKey);
      resolve({ ok, dontAsk: skip });
    };
    const onKey = (e) => {
      if (e.key === 'Escape') finish(false);
    };
    const root = h('div', { class: 'confirm-backdrop' },
      h('div', { class: 'confirm', role: 'alertdialog', 'aria-label': title },
        h('div', { class: 'confirm-title' }, title),
        ...lines.map((l) => h('p', {}, l)),
        dontAsk ? h('label', { class: 'confirm-skip' }, h('input', { type: 'checkbox', onchange: (e) => { skip = e.target.checked; } }), '次回から表示しない') : null,
        h('div', { class: 'confirm-btns' },
          h('button', { class: 'btn', onclick: () => finish(false) }, cancelLabel),
          h('button', { class: `btn ${danger ? 'danger-fill' : 'primary'}`, onclick: () => finish(true) }, okLabel),
        ),
      ),
    );
    window.addEventListener('keydown', onKey);
    $('#modal-root').append(root);
  });
}
