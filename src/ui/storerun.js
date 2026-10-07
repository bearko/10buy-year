// 店舗巡り：閉店までの時間で店を回り、棚ごとに品定めして、カゴに入れた品をレジで買う。
// 一覧ですべてを見比べるのではなく、その店・その棚の前で「買うか、買わないか」を決める。
// 移動と棚を見る時間はスキル・目利き・車で短くなり、回れる店が増えていく（engine/sourcing.js）
import { hhmm, soldHistory, soldMedian, storeTypesOf } from '../engine/sourcing.js';
import { PRODUCTS, productImage, productOf } from '../data/products.js';
import { CAST } from '../data/cast.js';
import { isReleased } from '../engine/market.js';
import { folkEvent, storeFolk } from '../engine/storefolk.js';
import { portraitOf } from '../data/cast.js';
import { cardAvailable } from '../engine/inventory.js';
import { knownHabit, LEARN_VISITS, visitStore, visitsOf } from '../engine/storemap.js';
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
  let cartOpen = false; // カゴの中身を広げているか
  let talk = null; // 「！」の人との会話
  let me = null; // 店内のクリスの位置（品定め中の売り場）
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
        ? `${hhmm(now)}、出発。閉店の${hhmm(clock.close)}までに、回れるだけ回ろう。${cands.some((st) => st.flyer) ? 'セールのチラシが出ている店は狙い目だ。' : ''}`
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
          st.flyer ? h('div', { class: 'sr-flyer' }, h('small', {}, 'チラシ'), st.flyer) : null,
          habitLine(st),
        );
      })));
    }
    return [head('店舗巡り', step.title === '店舗巡り' ? '' : step.title), body,
      h('div', { class: 'shop-footer' }, h('button', { class: 'btn shop-done', onclick: () => finish() }, visited.length ? '今日はここまでにして帰る' : 'やっぱりやめて帰る'))];
  }

  // 店のクセ（覚えていれば中身、通ったことがあれば「あと何回」）
  function habitLine(st) {
    if (st.spot) return null;
    const hb = knownHabit(s, st.name);
    if (hb) return h('div', { class: 'sr-habit' }, h('small', {}, 'クセ'), `${hb.name}（${hb.desc}）`);
    const v = visitsOf(s, st.name);
    return h('div', { class: 'sr-habit unknown' }, h('small', {}, 'クセ'), v ? `？（あと${LEARN_VISITS - v}回通うとわかる）` : '？（はじめての店）');
  }

  async function go(st) {
    const t = travelOf(st);
    busy = { kind: 'travel', st, t };
    ctx.render();
    await wait(900);
    now += t;
    at = st;
    at.folk ||= storeFolk(s, at);
    const learned = visitStore(s, st); // 店のクセを覚える（3回目）
    if (learned) toast(`「${st.name}」のクセを覚えた：${learned.name}（${learned.desc}）`, 'good');
    me = null;
    visited.push(st);
    s.stats.maxStores = Math.max(s.stats.maxStores || 0, visited.length);
    phase = 'store';
    busy = null;
    playSe('hint');
    ctx.render();
  }

  // ---- 店の中：店内の見取り図。売り場をタップして品定めする ----
  function storeView() {
    const st = at;
    const body = h('div', { class: 'shop-body sr-body' });
    body.append(bar(), floor(st));
    if (receipt) body.append(receiptView());
    const found = st.sections.map((sec, i) => [sec, i]).filter(([, i]) => searched.has(`${st.id}:${i}`));
    if (found.length) body.append(h('div', { class: 'sr-found-h' }, '見つけた品（タップで商品を見る）'), ...found.map(([sec, i]) => sectionView(st, sec, i)));
    else body.append(h('p', { class: 'sr-hint' }, st.enter, h('br'), '見たい売り場をタップしよう。'));
    return [head(st.name, st.label, st.color), body, storeFooter()];
  }

  // 売り場の名前から、店のどのあたりにあるかを決める（セール品のワゴンは入口の近く）
  const SLOTS = {
    back: { x: 3, y: 15, w: 55, h: 21 },
    backR: { x: 61, y: 15, w: 36, h: 21 },
    mid: { x: 57, y: 45, w: 40, h: 17 },
    center: { x: 22, y: 42, w: 32, h: 17 },
    front: { x: 3, y: 66, w: 38, h: 17 },
  };
  const kindOf = (name) => (/ワゴン|かご|均一/.test(name) ? 'front' : /ショーケース/.test(name) ? 'mid' : /コーナー|新入荷|新作|レジ横|おすすめ/.test(name) ? 'backR' : /売り場/.test(name) ? 'center' : 'back');
  function layout(st) {
    if (st.layout) return st.layout;
    const used = new Set();
    st.layout = st.sections.map((sec) => {
      const want = kindOf(sec.name);
      const slot = [want, 'back', 'backR', 'mid', 'center', 'front'].find((k) => !used.has(k)) || want;
      used.add(slot);
      return slot;
    });
    return st.layout;
  }
  // 棚に並んでいる品（飾り）。店と売り場で決まった品を並べる
  const deco = (st, i, n) => {
    const all = PRODUCTS.filter((p) => !p.spot && !p.know && isReleased(s, p));
    const fit = all.filter((p) => storeTypesOf(p).includes(st.type));
    const pool = fit.length ? fit : all;
    return Array.from({ length: n }, (_, k) => pool[(st.id * 7 + i * 13 + k * 5 + st.name.length) % pool.length]);
  };
  // 人が立つ通路（売り場と重ならない場所。avoid の売り場がある店では使わない）
  const NPC_SPOTS = [{ x: 12, y: 55, avoid: 'front' }, { x: 80, y: 80 }, { x: 40, y: 54, avoid: 'center' }, { x: 62, y: 82 }, { x: 30, y: 90 }];

  function floor(st) {
    const slots = layout(st);
    const zones = st.sections.map((sec, i) => {
      const key = `${st.id}:${i}`;
      const done = searched.has(key);
      const ok = now + clock.search <= clock.close;
      const pos = SLOTS[slots[i]] || SLOTS.center;
      const items = sec.oids.map((id) => byId.get(id)).filter(Boolean);
      return h('button', {
        class: `sr-zone ${slots[i]} ${done ? 'done' : ok ? 'open' : 'late'}`,
        style: { left: `${pos.x}%`, top: `${pos.y}%`, width: `${pos.w}%`, height: `${pos.h}%` },
        disabled: !!busy,
        onclick: () => (done ? document.getElementById(`sr-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : ok ? search(key, i) : toast('閉店まで時間がない', 'bad')),
      },
      h('div', { class: 'sr-shelf' }, ...(done && items.length ? items : deco(st, i, slots[i] === 'mid' ? 3 : 5)).map((x) => h('img', { class: done && items.length ? 'hit' : '', src: productImage(x.pid ? productOf(x.pid) : x), alt: '' }))),
      h('span', { class: 'sr-zone-l' }, sec.name, h('em', {}, done ? (items.length ? `✓ ${items.length}点` : '✓ なし') : ok ? `${clock.search}分` : '時間切れ')));
    });
    const spots = NPC_SPOTS.filter((p) => !(p.avoid === 'center' && slots.includes('center')));
    const folk = (st.folk || []).map((f, i) => {
      const pos = spots[i % spots.length];
      const c = CAST[f.who];
      return h('button', {
        class: `sr-npc ${f.role} ${f.bang ? 'bang' : ''}`,
        style: { left: `${pos.x}%`, top: `${pos.y}%` },
        title: c?.name || '',
        onclick: () => (f.bang && !busy ? meet(f) : null),
      },
      f.bang ? h('i', { class: 'sr-bang' }, '!') : h('span', { class: 'sr-bubble' }, f.line),
      h('img', { src: portraitOf(f.who, 'idle'), alt: '' }),
      h('small', {}, f.role === 'staff' ? '店員' : f.role === 'rival' ? '同業者' : '客'));
    });
    const mePos = me != null ? SLOTS[slots[me]] : null;
    return h('div', { class: 'sr-floor', style: { '--c': st.color } },
      h('div', { class: 'sr-wall' }, h('b', {}, st.name)),
      ...zones,
      ...folk,
      h('img', { class: 'sr-me', src: portraitOf('chris', 'idle'), alt: 'クリス', style: mePos ? { left: `${mePos.x + mePos.w / 2 - 6}%`, top: `${mePos.y + mePos.h - 10}%` } : { left: '44%', top: '80%' } }),
      h('div', { class: 'sr-door' }, '入口'));
  }

  function sectionView(st, sec, i) {
    const key = `${st.id}:${i}`;
    const items = sec.oids.map((id) => byId.get(id)).filter(Boolean);
    return h('div', { class: 'sr-sec open', id: `sr-sec-${key}` },
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

  async function search(key, i) {
    me = i;
    busy = { kind: 'search', key };
    ctx.render();
    await wait(750);
    now += clock.search;
    searched.add(key);
    busy = null;
    ctx.render();
    document.getElementById(`sr-sec-${key}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // 「！」の人に話しかける
  function meet(f) {
    const r = folkEvent(s, f, at);
    if (r.offer) {
      step.offers.push(r.offer);
      byId.set(r.offer.oid, r.offer);
      ctx.qty.set(r.offer.oid, 1);
      at.sections.push({ name: '店員さんのおすすめ', oids: [r.offer.oid] });
      at.layout = null; // 売り場が増えたので、見取り図を作り直す
      searched.add(`${at.id}:${at.sections.length - 1}`);
    }
    talk = r;
    playSe('hint');
    ctx.onChange?.();
    ctx.render();
  }

  function talkLayer() {
    if (!talk) return null;
    const c = CAST[talk.who];
    return h('div', { class: 'sr-talk', onclick: (e) => { if (e.target === e.currentTarget) { talk = null; ctx.render(); } } },
      h('div', { class: 'sr-talk-box' },
        h('div', { class: 'sr-talk-who' }, h('img', { src: portraitOf(talk.who, 'idle'), alt: '' }), h('b', {}, c ? (c.title ? `${c.name}（${c.title}）` : c.name) : '')),
        ...talk.lines.map((l) => h('p', {}, `「${l}」`)),
        h('div', { class: `sr-talk-res ${talk.tone || ''}` }, ...talk.result.map((l) => h('div', {}, l))),
        h('button', { class: 'btn primary', onclick: () => { talk = null; ctx.render(); } }, 'OK')));
  }

  function setCart(id, q) {
    const o = byId.get(id);
    const minQ = o.minQty || 1;
    if (q < minQ) cart.delete(id);
    else cart.set(id, Math.min(q, o.maxQty));
    ctx.render();
  }
  const stepper = (id, q) => h('div', { class: 'stepper' },
    h('button', { class: 'btn small', onclick: () => setCart(id, q - 1) }, '−'),
    h('span', {}, `${q}`),
    h('button', { class: 'btn small', disabled: q >= byId.get(id).maxQty, onclick: () => setCart(id, q + 1) }, '＋'));

  function storeFooter() {
    if (cart.size) {
      const total = cartTotal();
      return h('div', { class: 'shop-footer sr-foot' },
        cartOpen ? h('div', { class: 'sr-cart-list' }, ...[...cart].map(([id, q]) => {
          const o = byId.get(id);
          return h('div', { class: 'sr-cart-row' },
            h('img', { src: productImage(productOf(o.pid), o.rep), alt: '' }),
            h('span', { class: 'sr-cart-n' }, productOf(o.pid).name, h('small', {}, `${yen(o.price)} × ${q}（残り${o.maxQty}）`)),
            stepper(id, q));
        })) : null,
        h('div', { class: 'sr-cart' },
          h('button', { class: 'btn small sr-cart-btn', onclick: () => { cartOpen = !cartOpen; ctx.render(); } }, `カゴ ${cartCount()}点 ${cartOpen ? '▼' : '▲'}`),
          h('b', {}, yen(total)),
          h('button', { class: 'btn small', onclick: () => { cart.clear(); cartOpen = false; ctx.render(); } }, '全部棚に戻す')),
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
    cartOpen = false;
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
      return [...parts, busyLayer(), talkLayer()];
    },
    escape() {
      leave();
      return true;
    },
    extrasLabel: () => '売れた値段を調べる',
    itemTitle: () => at?.name,
    itemColor: () => at?.color,
    // 店では、スマホで売り切れ相場を調べられる（少し時間を使う）
    itemExtras(o) {
      if (o.unknown) return [];
      return [ctx.section('スマホで、フリマで実際に売れた値段を調べる', o.soldHist
        ? soldList(o)
        : h('button', { class: 'qa-ask', onclick: () => { o.soldHist = soldHistory(s, o.pid); s.stats.soldChecks = (s.stats.soldChecks || 0) + 1; now += clock.research; ctx.render(); } }, `フリマで売れた値段を調べる（${clock.research}分）`))];
    },
    itemBar(o) {
      const minQ = o.minQty || 1;
      if (o.maxQty < minQ) return h('div', { class: 'buy-bar' }, h('div', { class: 'sold-out' }, '購入済み'));
      const inCart = cart.get(o.oid);
      const q = Math.max(minQ, Math.min(ctx.qty.get(o.oid), Math.max(1, o.maxQty)));
      if (inCart) {
        // カゴに入れたあとも、ここで個数を変えられる
        return h('div', { class: 'buy-bar' },
          h('span', { class: 'bb-note' }, 'カゴに'),
          stepper(o.oid, inCart),
          h('button', { class: 'btn bb-card', onclick: () => { cart.delete(o.oid); ctx.render(); } }, '棚に戻す'),
          h('button', { class: 'btn bb-cash', onclick: () => ctx.back() }, '売り場へ'));
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
  const med = soldMedian(o.soldHist);
  const diff = Math.round((med / Math.max(1, o.est) - 1) * 100);
  return h('div', { class: 'sold-list' },
    ...o.soldHist.map((x) => h('div', { class: 'sold-row' }, h('span', { class: 'sold-tag' }, 'SOLD'), h('span', {}, x.ago), h('b', {}, yen(x.price)))),
    h('div', { class: 'sold-sum' },
      h('span', {}, '売れた値段の真ん中 ', h('b', {}, yen(med))),
      h('small', {}, Math.abs(diff) < 3 ? `自分の見立て ${yen(o.est)} とほぼ同じ` : `自分の見立て ${yen(o.est)} より ${diff > 0 ? '+' : ''}${diff}%。見立ては目利きの経験とスキルで正確になる`)),
  );
}
