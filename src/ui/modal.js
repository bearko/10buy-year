import { $, clear, h } from './dom.js';

// モーダル。render(body, api) で中身を描画し、api.refresh() で再描画できる。
export function openModal(title, render, { closeLabel = '閉じる', onRefresh } = {}) {
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
  footer.append(h('button', { class: 'btn primary', onclick: () => api.close() }, closeLabel));
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
