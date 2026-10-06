// 店舗巡り：閉店までの時間で店を回り、棚ごとに品定めして、カゴに入れた品をレジで買う。
// 一覧ですべてを見比べるのではなく、その店・その棚の前で「買うか、買わないか」を決める。
// 移動と棚を見る時間はスキル・目利き・車で短くなり、回れる店が増えていく（engine/sourcing.js）
import { hhmm, soldHistory } from '../engine/sourcing.js';
import { productOf } from '../data/products.js';
import { portraitOf } from '../data/cast.js';
import { cardAvailable } from '../engine/inventory.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { toast } from './modal.js';

const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
const wait = (ms) => new Promise((r) => setTimeout(r, matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : ms));

export function storeMode(ctx) {
  const { s, step } = ctx;
  const run = step.run;
  const { clock } = run;
  const byId = new Map(step.offers.map((o) => [o.oid, o]));
  let now = clock.start;
  let at = null; // いまいる店
  let phase = 'route'; // route：次の店を選ぶ / store：店の中 / done：帰る
  const visited = [];
  const searched = new Set();
  const cart = new Map(); // oid -> 個数
  let receipt = null;
  let busy = null; // 移動中・棚を見ている最中の演出
  const bought = { n: 0, yen: 0 };

  const left = () => clock.close - now;
  const travelOf = (st) => Math.round(clock.travel * st.dist);
  const next = () => run.stores.filter((st) => !visited.includes(st)).slice(0, 2);
  const canReach = (st) => now + travelOf(st) + clock.search <= clock.close;
  const cartTotal = () => [...cart].reduce((a, [id, q]) => a + byId.get(id).price * q, 0);
  const cartCount = () => [...cart.values()].reduce((a, q) => a + q, 0);

  // ---- 時計と、回った店の道のり ----
  function bar() {
    const pct = Math.max(0, Math.min(100, ((now - clock.start) / (clock.close - clock.start)) * 100));
    return h('div', { class: 'sr-bar' },
      h('div', { class: 'sr-clock' }, h('b', {}, hhmm(now)), h('small', {}, ` 閉店 ${hhmm(clock.close)}`), h('span', { class: `sr-left ${left() < 60 ? 'low' : ''}` }, `のこり ${Math.max(0, left())}分`)),
      h('div', { class: 'sr-time' }, h('i', { style: { width: `${pct}%` } })),
      h('div', { class: 'sr-route' },
        h('span', { class: 'sr-home' }, '家'),
        ...visited.map((st) => h('span', { class: `sr-dot ${st === at ? 'here' : ''}`, style: { '--c': st.color }, title: st.name }, st.label.slice(0, 2))),
        phase !== 'done' && next().length ? h('span', { class: 'sr-dot next' }, '？') : null,
      ),
    );
  }

  function head(title, sub, color = '#39406b') {
    return h('header', { class: 'shop-head', style: { '--site': color } },
      h('button', { class: 'shop-x', onclick: () => leave(), 'aria-label': '仕入れを終える' }, '×'),
      h('b', { class: 'shop-logo' }, title),
      sub ? h('span', { class: 'shop-sub' }, sub) : null,
    );
  }

  // ---- 次の店を選ぶ ----
  function routeView() {
    const body = h('div', { class: 'shop-body sr-body' });
    body.append(bar(), ctx.wallet());
    const cands = next();
    const first = !visited.length;
    body.append(h('div', { class: 'sr-say' },
      h('img', { src: portraitOf('chris', 'idle'), alt: '' }),
      h('p', {}, first
        ? `${hhmm(now)}、出発。閉店の${hhmm(clock.close)}までに、回れるだけ回ろう。`
        : cands.some(canReach) ? 'さて、次はどっちに行こう？' : 'どの店も、着くころには閉店だ…。'),
    ));
    if (cands.length) {
      body.append(h('div', { class: 'sr-choices' }, ...cands.map((st) => {
        const ok = canReach(st);
        return h('button', { class: 'sr-store-card', style: { '--c': st.color }, disabled: !ok, onclick: () => go(st) },
          h('div', { class: 'sr-sign' }, h('small', {}, st.label), h('b', {}, st.name)),
          h('div', { class: 'sr-meta' },
            h('span', {}, `移動 ${travelOf(st)}分`),
            h('span', {}, `売り場 ${st.sections.length}か所`),
            ok ? h('span', {}, `着くのは ${hhmm(now + travelOf(st))}`) : h('span', { class: 'bad' }, '閉店に間に合わない')),
        );
      })));
    }
    return [head('店舗巡り', step.title === '店舗巡り' ? '' : step.title), body,
      h('div', { class: 'shop-footer' }, h('button', { class: 'btn shop-done', onclick: () => finish() }, visited.length ? '今日はここまでにして帰る' : 'やっぱりやめて帰る'))];
  }

  async function go(st) {
    const t = travelOf(st);
    busy = { kind: 'travel', st, t };
    ctx.render();
    await wait(900);
    now += t;
    at = st;
    visited.push(st);
    phase = 'store';
    busy = null;
    playSe('hint');
    ctx.render();
  }

  // ---- 店の中 ----
  function storeView() {
    const st = at;
    const body = h('div', { class: 'shop-body sr-body' });
    body.append(bar(), h('div', { class: 'sr-front', style: { '--c': st.color } },
      h('div', { class: 'sr-front-sign' }, h('small', {}, st.label), h('b', {}, st.name)),
      h('p', {}, st.enter),
    ));
    if (receipt) body.append(receiptView());
    st.sections.forEach((sec, i) => body.append(sectionView(st, sec, i)));
    return [head(st.name, st.label, st.color), body, storeFooter()];
  }

  function sectionView(st, sec, i) {
    const key = `${st.id}:${i}`;
    const done = searched.has(key);
    if (!done) {
      const ok = now + clock.search <= clock.close;
      return h('button', { class: 'sr-sec closed', disabled: !ok || !!busy, onclick: () => search(key) },
        h('b', {}, sec.name),
        h('small', {}, ok ? `品定めする（${clock.search}分）` : '閉店まで時間がない'));
    }
    const items = sec.oids.map((id) => byId.get(id)).filter(Boolean);
    return h('div', { class: 'sr-sec open' },
      h('div', { class: 'sr-sec-h' }, h('b', {}, sec.name), h('small', {}, items.length ? `${items.length}点 目に留まった` : '')),
      items.length
        ? h('div', { class: 'shop-grid sr-grid' }, ...items.map((o) => {
          const el = ctx.gridItem(o);
          if (cart.has(o.oid)) el.classList.add('in-cart');
          return el;
        }))
        : h('p', { class: 'sr-none' }, '目ぼしい物はなかった…'),
    );
  }

  async function search(key) {
    busy = { kind: 'search', key };
    ctx.render();
    await wait(650);
    now += clock.search;
    searched.add(key);
    busy = null;
    ctx.render();
  }

  function storeFooter() {
    if (cart.size) {
      const total = cartTotal();
      return h('div', { class: 'shop-footer sr-foot' },
        h('div', { class: 'sr-cart' }, h('span', {}, `カゴ ${cartCount()}点`), h('b', {}, yen(total)), h('button', { class: 'btn small', onclick: () => { cart.clear(); ctx.render(); } }, '棚に戻す')),
        h('div', { class: 'sr-pay' },
          h('button', { class: 'btn bb-card', disabled: total > cardAvailable(s) + s.points, onclick: () => checkout('card') }, 'カードで払う'),
          h('button', { class: 'btn bb-cash', disabled: total > s.cash + s.points, onclick: () => checkout('cash') }, `レジで現金払い（${clock.checkout}分）`)),
      );
    }
    return h('div', { class: 'shop-footer sr-foot' },
      h('div', { class: 'sr-pay' },
        h('button', { class: 'btn', onclick: () => finish() }, '帰る'),
        h('button', { class: 'btn primary', onclick: () => { phase = 'route'; receipt = null; ctx.render(); } }, next().some(canReach) ? '次の店へ' : '店を出る')),
    );
  }

  function checkout(method) {
    const lines = [];
    for (const [id, q] of cart) {
      const o = byId.get(id);
      const price = o.price;
      const res = ctx.doBuy(o, q, method, { quiet: true });
      lines.push({ name: productOf(o.pid).name, q, price, ok: res.ok, msg: res.msg });
      if (res.ok) {
        bought.n += q;
        bought.yen += price * q;
      }
    }
    cart.clear();
    now += clock.checkout;
    receipt = { store: at.name, method, lines };
    playSe(lines.some((x) => x.ok) ? 'coin' : 'lose');
    ctx.render();
  }

  function receiptView() {
    const ok = receipt.lines.filter((x) => x.ok);
    const ng = receipt.lines.filter((x) => !x.ok);
    return h('div', { class: 'receipt' },
      h('div', { class: 'rc-h' }, h('b', {}, receipt.store), h('small', {}, `${hhmm(now)}　${receipt.method === 'card' ? 'クレジット' : '現金'}`)),
      ...ok.map((x) => h('div', { class: 'rc-row' }, h('span', {}, `${x.name} ×${x.q}`), h('span', {}, yen(x.price * x.q)))),
      h('div', { class: 'rc-total' }, h('span', {}, '合計'), h('b', {}, yen(ok.reduce((a, x) => a + x.price * x.q, 0)))),
      ...ng.map((x) => h('div', { class: 'rc-ng' }, `買えなかった：${x.name}（${x.msg}）`)),
    );
  }

  // ---- 帰る ----
  function finish() {
    if (cart.size) {
      toast('カゴの品をレジに通すか、棚に戻してから帰ろう', 'bad');
      return;
    }
    phase = 'done';
    ctx.render();
  }
  function leave() {
    if (phase === 'done') return ctx.close();
    finish();
  }

  function doneView() {
    const body = h('div', { class: 'shop-body sr-body' });
    body.append(bar(), h('div', { class: 'sr-done' },
      h('b', {}, `今日の店舗巡り：${visited.length}店舗`),
      h('div', {}, visited.length ? visited.map((st) => st.name).join(' → ') : 'どこにも寄らなかった'),
      h('div', { class: 'sr-done-sum' }, `仕入れ ${bought.n}点　${yenFmt(bought.yen)}`),
      h('small', {}, '店を回る時間は、スキル（地図・AIリサーチ）・仕入れの能力・車で短くなる'),
    ));
    return [head('店舗巡り', '帰宅'), body, h('div', { class: 'shop-footer' }, h('button', { class: 'btn primary shop-done', onclick: () => ctx.close() }, '家に帰る'))];
  }

  function busyLayer() {
    if (!busy) return null;
    if (busy.kind === 'travel') {
      return h('div', { class: 'sr-busy' },
        h('div', { class: 'sr-road' }, h('i', { class: 'sr-car' }, s.lifestyle >= 2 ? '🚗' : '🚶')),
        h('b', {}, `${busy.st.label}へ移動中…`),
        h('small', {}, `${busy.t}分（${hhmm(now)} → ${hhmm(now + busy.t)}）`));
    }
    return h('div', { class: 'sr-busy search' }, h('b', {}, 'ガサゴソ…'), h('small', {}, '値札と棚の奥を見ていく'));
  }

  return {
    cls: 'sr',
    list() {
      const parts = phase === 'done' ? doneView() : phase === 'store' && at ? storeView() : routeView();
      return [...parts, busyLayer()];
    },
    escape() {
      leave();
      return true;
    },
    itemTitle: () => at?.name,
    itemColor: () => at?.color,
    // 店では、スマホで売り切れ相場を調べられる（少し時間を使う）
    itemExtras(o) {
      if (o.unknown) return [];
      return [ctx.section('スマホで相場を調べる', o.soldHist
        ? soldList(o)
        : h('button', { class: 'qa-ask', onclick: () => { o.soldHist = soldHistory(s, o.pid); now += clock.research; ctx.render(); } }, `フリマの売り切れ価格を検索する（${clock.research}分）`))];
    },
    itemBar(o) {
      const minQ = o.minQty || 1;
      if (o.maxQty < minQ) return h('div', { class: 'buy-bar' }, h('div', { class: 'sold-out' }, '購入済み'));
      const inCart = cart.get(o.oid);
      const q = Math.max(minQ, Math.min(ctx.qty.get(o.oid), Math.max(1, o.maxQty)));
      if (inCart) {
        return h('div', { class: 'buy-bar' },
          h('span', { class: 'bb-note' }, `カゴに ${inCart}個`),
          h('button', { class: 'btn bb-card', onclick: () => { cart.delete(o.oid); ctx.render(); } }, '棚に戻す'),
          h('button', { class: 'btn bb-cash', onclick: () => ctx.back() }, '売り場にもどる'));
      }
      return h('div', { class: 'buy-bar' },
        o.maxQty > minQ
          ? h('div', { class: 'stepper' },
            h('button', { class: 'btn small', onclick: () => { ctx.qty.set(o.oid, Math.max(minQ, q - 1)); ctx.render(); } }, '−'),
            h('span', {}, `${q}`),
            h('button', { class: 'btn small', onclick: () => { ctx.qty.set(o.oid, Math.min(o.maxQty, q + 1)); ctx.render(); } }, '＋'))
          : null,
        h('button', { class: 'btn bb-cash', onclick: () => { cart.set(o.oid, q); playSe('buy'); ctx.back(); } }, `カゴに入れる ${yen(o.price * q)}`));
    },
  };
}

export function soldList(o) {
  return h('div', { class: 'sold-list' },
    ...o.soldHist.map((x) => h('div', { class: 'sold-row' }, h('span', { class: 'sold-tag' }, 'SOLD'), h('span', {}, x.ago), h('b', {}, yen(x.price)))),
  );
}
