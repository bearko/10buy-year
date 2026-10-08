// 仕入れのすぐあとに「このまま出品する？」を聞く。相場どおりにまとめて出すか、在庫画面で出品を変更するか、あとにするか。
// 出品枠が足りないときは、出品してから長いものを取り下げて、仕入れた品を優先して出品することもできる
import { productOf } from '../data/products.js';
import { marketListing, quickList, staleListings, swapList } from '../engine/automation.js';
import { listedUnits, listingCap, PLATFORMS } from '../engine/inventory.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';
import { inventoryModal } from './trade.js';

// before：仕入れる前に持っていた在庫の uid。新しく手元に届いた、まだ出品していない品だけを対象にする
export async function listNowPrompt(s, before, onChange) {
  if (s.settings.listNow === false) return;
  const fresh = s.inventory.filter((u) => !before.has(u.uid) && !u.listing && u.arrive <= s.week);
  const plans = fresh.map((u) => ({ u, m: marketListing(s, u) })).filter((x) => x.m);
  if (!plans.length) return;
  const free = Math.max(0, listingCap(s) - listedUnits(s).length);
  const n = Math.min(free, plans.length);
  // 同じ品・同じ販路・同じ値段はまとめて1行に
  const rows = new Map();
  for (const { u, m } of plans) {
    const key = `${u.pid}|${m.platform}|${m.price}|${u.rep ? 'rep' : ''}`;
    if (!rows.has(key)) rows.set(key, { name: productOf(u.pid).name + (u.rep ? '（再販）' : ''), pf: PLATFORMS[m.platform].name, price: m.price, qty: 0 });
    rows.get(key).qty++;
  }
  // 枠が足りない分だけ、古い出品と入れ替えられる
  const short = plans.length - n;
  const stale = staleListings(s, short);
  let choice = null;
  const api = openModal(
    'すぐ出品する？',
    (body) => {
      body.append(
        h('p', { class: 'listnow-lead' }, `仕入れた${plans.length}点を、それぞれ合った売り先に相場の値段で出品できる。`),
        h('ul', { class: 'listnow-rows' }, ...[...rows.values()].map((r) => h('li', {}, h('span', {}, `${r.name}${r.qty > 1 ? ` ×${r.qty}` : ''}`), h('small', {}, r.pf), h('b', {}, yenFmt(r.price))))),
        h('p', { class: 'listnow-note' }, free < plans.length ? `出品枠のあきは${free}件。入りきらない${plans.length - free}点は在庫に残る` : `出品枠のあき ${free}件`),
        stale.length
          ? h('div', { class: 'listnow-swap' },
            h('p', {}, `「入れ替えて出品」なら、出品してから長い${stale.length}件を取り下げて（在庫に戻る）、仕入れた品を優先して出品する：`),
            h('ul', {}, ...staleRows(s, stale).map((r) => h('li', {}, h('span', {}, `${r.name}${r.qty > 1 ? ` ×${r.qty}` : ''}`), h('small', {}, `${r.weeks}週出品中`), h('b', {}, yenFmt(r.price))))),
          )
          : null,
      );
    },
    {
      footer: (a) => [
        h('button', { class: 'btn', onclick: () => { choice = 'later'; a.close(); } }, 'あとで'),
        h('button', { class: 'btn', onclick: () => { choice = 'price'; a.close(); } }, '出品を変更'),
        stale.length ? h('button', { class: 'btn swap', onclick: () => { choice = 'swap'; a.close(); } }, `入れ替えて${n + stale.length}点を出品`) : null,
        h('button', { class: 'btn primary', disabled: !n, onclick: () => { choice = 'list'; a.close(); } }, n ? `${n}点を出品` : '枠がいっぱい'),
      ],
    },
  );
  await api.closed;
  if (choice === 'list') {
    const r = quickList(s, plans.map((x) => x.u.uid));
    playSe('coin');
    toast(`${r.listed}点を出品した（出品額 ${yenFmt(r.total)}）`, 'good');
    onChange?.();
  } else if (choice === 'swap') {
    const r = swapList(s, plans.map((x) => x.u.uid));
    playSe('coin');
    toast(`${r.withdrawn}件を取り下げて、${r.listed}点を出品した（出品額 ${yenFmt(r.total)}）`, 'good');
    onChange?.();
  } else if (choice === 'price') {
    await inventoryModal(s, onChange).closed;
  }
}

// 取り下げる出品を、同じ品・同じ値段ごとにまとめる
function staleRows(s, units) {
  const rows = new Map();
  for (const u of units) {
    const key = `${u.pid}|${u.listing.price}|${u.listing.week}`;
    if (!rows.has(key)) rows.set(key, { name: productOf(u.pid).name + (u.rep ? '（再販）' : ''), price: u.listing.price, weeks: Math.max(0, s.week - u.listing.week), qty: 0 });
    rows.get(key).qty++;
  }
  return [...rows.values()];
}
