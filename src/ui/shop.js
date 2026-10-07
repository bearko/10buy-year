// 仕入れ画面。フリマ・通販サイト・店舗の売り場のように商品を並べ、タップで商品ページを開く。
// 偽物かどうかは書かない。出品者・写真・説明文・付属品・質問への対応・細部から自分で見抜く。
// 店舗せどりは「店舗巡り」（ui/storerun.js）、電脳せどりは「夜のスマホ」（ui/phone.js）のモードで包む。
// モードは一覧（list）・商品ページの下のバー（itemBar）・追加の欄（itemExtras）・外枠（wrap）を差しかえられる
import { productImage, productOf, SIZE_INFO } from '../data/products.js';
import { weekLabel } from '../engine/calendar.js';
import { flag, hasSkill, tired } from '../engine/effects.js';
import { buy, capacity, cardAvailable, spaceUsed } from '../engine/inventory.js';
import { askSeller, catInfo, siteOf, visibleChecks } from '../engine/listing.js';
import { confidenceLabel } from '../engine/market.js';
import { soldMedian } from '../engine/sourcing.js';
import { playSe } from './audio.js';
import { $, clear, h, signYen, yenFmt } from './dom.js';
import { toast } from './modal.js';
import { expectedProfit } from './trade.js';
import { phoneMode } from './phone.js';
import { storeMode } from './storerun.js';

const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
const canCalc = (s) => hasSkill(s, 'eye_calc');

// 同じ画像を寄り・引きで見せて「別アングルの写真」に見立てる
const SHOT = [
  { scale: 1, x: 50, y: 50 },
  { scale: 2.2, x: 50, y: 88 },
  { scale: 2.4, x: 30, y: 40 },
  { scale: 2.6, x: 72, y: 62 },
  { scale: 2.2, x: 50, y: 20 },
];

function photo(o, part, { big = false, stock = false } = {}) {
  const parts = catInfo(o.pid).photos;
  const shot = SHOT[Math.max(0, parts.indexOf(part)) % SHOT.length];
  return h('div', { class: `ph ${big ? 'big' : ''}` },
    h('img', { src: productImage(productOf(o.pid), o.rep), alt: '', style: { transform: `scale(${shot.scale})`, transformOrigin: `${shot.x}% ${shot.y}%` } }),
    stock ? h('span', { class: 'ph-stock' }, 'SAMPLE') : null,
    big ? h('span', { class: 'ph-label' }, part) : null,
  );
}

export function offersModal(s, step, onChange) {
  let resolveClosed;
  const closed = new Promise((r) => (resolveClosed = r));
  const qty = new Map(step.offers.map((o) => [o.oid, o.minQty || 1]));
  const sites = [...new Set(step.offers.map((o) => o.source))];
  let filter = null;
  let open = null; // 開いている商品ページ
  let shot = 0;
  let tab = 'info'; // 商品ページのタブ
  const got = []; // この画面で仕入れた商品（閉じたあとステージに並べる）

  const root = h('div', { class: 'shop' });
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (open) back();
    else if (!mode.escape?.()) close();
  };
  function close() {
    mode.onClose?.();
    root.remove();
    window.removeEventListener('keydown', onKey);
    resolveClosed(got);
  }
  function back() {
    open = null;
    render();
  }
  function openItem(o) {
    open = o;
    shot = 0;
    tab = 'info';
    render();
  }
  window.addEventListener('keydown', onKey);
  $('#modal-root').append(root);

  const ctx = { s, step, root, got, qty, onChange, render: () => render(), openItem, back, close, wallet, gridItem, section, doBuy, isOpen: () => open, setTab: (x) => { tab = x; } };
  const mode = step.run?.kind === 'store' ? storeMode(ctx) : step.run?.kind === 'online' ? phoneMode(ctx) : {};

  function render() {
    const y = root.querySelector('.shop-body')?.scrollTop || 0;
    clear(root);
    root.className = `shop ${mode.cls || ''}`;
    const parts = open ? renderItem(open) : mode.list ? mode.list() : renderGrid();
    root.append(...(mode.wrap ? mode.wrap(parts) : parts).filter(Boolean));
    const body = root.querySelector('.shop-body');
    if (body && !open) body.scrollTop = y;
  }

  function wallet() {
    return h('div', { class: 'shop-wallet' },
      h('span', {}, `現金 ${yenFmt(s.cash)}`),
      h('span', {}, `カード残枠 ${yenFmt(cardAvailable(s))}`),
      s.points ? h('span', {}, `${s.points.toLocaleString()}pt`) : null,
      h('span', { class: spaceUsed(s) > capacity(s) ? 'neg' : '' }, `置き場 ${spaceUsed(s)}/${capacity(s)}`),
    );
  }

  // ---------------- 一覧 ----------------
  function renderGrid() {
    const first = siteOf(step.offers[0] || { source: 'store' });
    const title = sites.length > 1 ? step.title : first.name;
    const head = h('header', { class: 'shop-head', style: { '--site': sites.length > 1 ? '#39406b' : first.color } },
      h('button', { class: 'shop-x', onclick: close, 'aria-label': '閉じる' }, '×'),
      h('b', { class: 'shop-logo' }, title),
      h('span', { class: 'shop-sub' }, sites.length > 1 ? '' : step.title),
    );
    const body = h('div', { class: 'shop-body' });
    body.append(wallet());
    if (sites.length > 1) {
      body.append(h('div', { class: 'shop-tabs' },
        h('button', { class: filter ? '' : 'on', onclick: () => { filter = null; render(); } }, 'すべて'),
        ...sites.map((id) => h('button', { class: filter === id ? 'on' : '', style: { '--site': siteOf({ source: id }).color }, onclick: () => { filter = id; render(); } }, siteOf({ source: id }).name)),
      ));
    }
    if (step.autoBought?.length) body.append(h('div', { class: 'shop-auto' }, h('b', {}, '外注が自動で仕入れた'), ...step.autoBought.map((m) => h('div', {}, m))));
    const list = step.offers.filter((o) => !filter || o.source === filter);
    if (!list.length) body.append(h('p', { class: 'empty' }, '目ぼしい商品は見つからなかった…'));
    const grid = h('div', { class: 'shop-grid' });
    for (const o of list) grid.append(gridItem(o));
    body.append(grid);
    // 片手で押しやすいよう、画面下に固定
    return [head, body, h('div', { class: 'shop-footer' }, h('button', { class: 'btn primary shop-done', onclick: close }, '仕入れを終える'))];
  }

  function gridItem(o, { onOpen } = {}) {
    // 知識のないジャンル：何かがあることだけ見せる
    if (o.unknown) {
      return h('button', { class: 'sh-item unknown', onclick: () => toast(`「${o.genreName}の基礎講座」（資格講座）で学ぶと仕入れられる`, 'bad') },
        h('div', { class: 'sh-img' }, h('div', { class: 'sh-q' }, '？')),
        h('div', { class: 'sh-name' }, '未知のジャンル'),
        h('div', { class: 'sh-meta' }, h('span', {}, '？？？')),
        h('div', { class: 'sh-memo' }, '目利きできない'));
    }
    const p = productOf(o.pid);
    const site = siteOf(o);
    const sold = o.maxQty < (o.minQty || 1);
    const store = site.kind === 'store' || site.kind === 'pro';
    // 売り切れを調べたら、見立てではなく売れた値段の真ん中で見る
    const ref = o.soldHist ? soldMedian(o.soldHist) : o.est;
    const profit = expectedProfit(s, o.pid, ref, o.price) + Math.round(o.price * (o.points || 0));
    return h('button', { class: `sh-item ${store ? 'store' : ''} ${sold ? 'sold' : ''}`, onclick: () => (onOpen ? onOpen(o) : openItem(o)) },
      h('div', { class: 'sh-img' },
        photo(o, catInfo(o.pid).photos[0], { stock: o.listing?.stockPhoto }),
        store
          ? h('span', { class: 'sh-tag' }, h('small', {}, o.label), yen(o.price))
          : h('span', { class: 'sh-price' }, yen(o.price)),
        o.points ? h('span', { class: 'sh-badge pt' }, `${Math.round(o.points * 100)}%還元`) : null,
        o.upcoming ? h('span', { class: 'sh-badge' }, '予約') : null,
        o.rep ? h('span', { class: 'sh-badge rep' }, '再販版') : null,
        sold ? h('span', { class: 'sh-sold' }, 'SOLD') : null,
      ),
      h('div', { class: 'sh-name' }, p.name, o.shoe ? h('small', { class: 'sh-size' }, ` ${o.shoe.toFixed(1)}cm`) : null),
      h('div', { class: 'sh-meta' },
        sites.length > 1 ? h('span', { class: 'sh-site', style: { '--site': site.color } }, site.name) : null,
        o.listing?.likes ? h('span', {}, `♡${o.listing.likes}`) : null,
        o.maxQty > 1 ? h('span', {}, `残り${o.maxQty}`) : null,
      ),
      h('div', { class: 'sh-memo' }, o.soldHist ? `売り切れ ${yen(ref)}` : `見立て ${yen(o.est)}`, canCalc(s) ? h('b', { class: profit >= 0 ? 'pos' : 'neg' }, ` ${signYen(profit)}`) : null),
    );
  }

  // ---------------- 商品ページ ----------------
  function renderItem(o) {
    const p = productOf(o.pid);
    const site = siteOf(o);
    const L = o.listing || {};
    const store = site.kind === 'store' || site.kind === 'pro';
    const photos = L.qa?.asked && L.qa.addPhoto ? [...L.photos, L.qa.addPhoto] : L.photos || catInfo(o.pid).photos;
    const cur = photos[Math.min(shot, photos.length - 1)];
    const stock = L.stockPhoto && cur !== L.qa?.addPhoto;

    const head = h('header', { class: 'shop-head', style: { '--site': mode.itemColor?.(o) || site.color } },
      h('button', { class: 'shop-x', onclick: back, 'aria-label': '戻る' }, '‹'),
      h('b', { class: 'shop-logo' }, mode.itemTitle?.(o) || site.name),
    );
    // スクロールしなくても見られるように、写真と値段を上に小さくまとめ、詳しい情報はタブで切りかえる
    const top = h('div', { class: 'it-top' },
      h('div', { class: 'gallery' },
        photo(o, cur, { big: true, stock }),
        photos.length > 1 ? h('div', { class: 'thumbs' }, ...photos.map((part, i) => h('button', { class: i === shot ? 'on' : '', onclick: () => { shot = i; render(); } }, photo(o, part, { stock: L.stockPhoto && part !== L.qa?.addPhoto })))) : null,
      ),
      h('div', { class: 'it-head' },
        h('h2', { class: 'it-title' }, p.name, h('small', {}, p.genre)),
        mode.itemPrice?.(o) || h('div', { class: 'it-price' }, yen(o.price), h('small', {}, store ? '（税込）' : site.kind === 'mall' ? '（税込）送料無料' : '（税込）送料込み')),
        h('div', { class: 'it-badges' },
          store ? h('span', { class: 'it-deal' }, o.label) : null,
          o.points ? h('span', { class: 'it-pt' }, `ポイント${Math.round(o.points * 100)}%還元`) : null,
          L.likes ? h('span', {}, `♡ ${L.likes}`) : null,
          L.qa ? h('span', {}, `💬 ${L.qa.asked ? 2 : 0}`) : null,
        ),
      ),
    );
    const extras = (mode.itemExtras?.(o) || []).filter(Boolean);
    const tabs = [
      ['info', '商品の情報', () => [
        L.description ? section('商品の説明', h('p', { class: 'it-desc' }, L.description)) : null,
        section('商品の情報', h('table', { class: 'it-info' }, ...(L.info || []).map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))),
        L.seller ? section('出品者', sellerCard(L.seller)) : null,
        L.qa ? section(o.source === 'used' ? '店員さんに聞く' : 'コメント', qaBlock(o)) : null,
      ]],
      extras.length ? ['extra', mode.extrasLabel?.(o) || '相場を調べる', () => extras] : null,
      ['memo', '自分のメモ', () => [section('自分のメモ', memo(o), 'memo')]],
    ].filter(Boolean);
    if (!tabs.some(([id]) => id === tab)) tab = tabs[0][0];
    const pane = h('div', { class: 'it-pane' }, ...tabs.find(([id]) => id === tab)[2]().filter(Boolean));
    const body = h('div', { class: 'shop-body item tabbed' },
      top,
      h('div', { class: 'it-tabs' }, ...tabs.map(([id, label]) => h('button', { class: tab === id ? 'on' : '', onclick: () => { tab = id; render(); } }, label))),
      pane);
    return [head, body, mode.itemBar?.(o) || buyBar(o)];
  }

  function section(title, content, cls = '') {
    return h('section', { class: `it-sec ${cls}` }, h('h3', {}, title), content);
  }

  function sellerCard(sl) {
    const stars = sl.ratings ? '★★★★★'.slice(0, Math.max(1, Math.round((sl.good - 50) / 10))) : '';
    return h('div', { class: 'seller' },
      h('img', { src: sl.avatar, alt: '' }),
      h('div', {},
        h('b', {}, sl.name),
        h('div', { class: 'sl-rate' }, sl.ratings ? `${stars} ${sl.ratings}件（良い ${sl.good}%）` : '評価はまだありません'),
        h('div', { class: 'sl-meta' },
          h('span', { class: sl.verified ? 'ok' : '' }, sl.verified ? '本人確認済み' : '本人確認なし'),
          h('span', {}, sl.months ? `登録${sl.months}か月` : '今月登録'),
          sl.sameItem ? h('span', {}, `同じ商品を${sl.sameItem}点出品中`) : null,
        ),
        sl.badReview ? h('div', { class: 'sl-review' }, `最近の評価「${sl.badReview}」`) : null,
      ),
    );
  }

  function qaBlock(o) {
    const qa = o.listing.qa;
    if (!qa.asked) {
      return h('button', { class: 'qa-ask', onclick: () => { if (mode.onAsk && !mode.onAsk(o)) return; askSeller(o); if (qa.addPhoto) shot = o.listing.photos.length; render(); } }, `質問する：${qa.question}${mode.askNote ? mode.askNote : ''}`);
    }
    return h('div', { class: 'qa' },
      h('div', { class: 'q' }, h('b', {}, 'クリス'), qa.question),
      h('div', { class: 'a' }, h('b', {}, o.source === 'used' ? '店員' : '出品者'), qa.answer),
    );
  }

  function memo(o) {
    const p = productOf(o.pid);
    const L = o.listing || {};
    const ratio = o.est ? Math.round((o.price / o.est) * 100) : 0;
    const profit = expectedProfit(s, o.pid, o.est, o.price) + Math.round(o.price * (o.points || 0));
    const checks = visibleChecks(o);
    const touchable = !['flea', 'shady'].includes(siteOf(o).kind);
    return h('div', {},
      tired(s) ? h('div', { class: 'warn' }, '疲れていて、相場の見立てがぶれやすく、細かいところを見落としやすい（体力30未満）') : null,
      h('div', { class: 'mm-row' }, h('span', {}, hasSkill(s, 'eye_market') ? '推定相場' : '相場（ざっくり）'), h('b', {}, `${yen(o.est)}`), h('small', {}, `確度${confidenceLabel(s)}`)),
      o.soldHist ? h('div', { class: 'mm-row' }, h('span', {}, '売り切れ相場'), h('b', {}, yen(soldMedian(o.soldHist))), h('small', {}, '最近売れた値段の真ん中')) : null,
      h('div', { class: 'mm-row' }, h('span', {}, '相場との比較'), h('b', {}, `${ratio}%`)),
      h('div', { class: 'mm-row' }, h('span', {}, '見込み利益'), canCalc(s) ? h('b', { class: profit >= 0 ? 'pos' : 'neg' }, `${signYen(profit)}/個`) : h('b', {}, '？')),
      h('div', { class: 'mm-tags' },
        h('span', {}, `サイズ${SIZE_INFO[p.size].label}`),
        o.upcoming ? h('span', {}, '発売前（予想相場）') : null,
        o.arriveWeek > s.week ? h('span', {}, `${weekLabel(o.arriveWeek)}着`) : null,
        o.minQty ? h('span', {}, `最低${o.minQty}個`) : null,
        p.used && !o.brandNew && !flag(s, 'license') ? h('span', { class: 'bad' }, '要古物商') : null,
        p.alcohol && flag(s, 'noAlcohol') ? h('span', { class: 'bad' }, '酒類：出品不可') : null,
      ),
      checks.length ? h('div', { class: 'mm-checks' },
        h('div', { class: 'mm-h' }, touchable ? '手に取って見る' : '写真を拡大して見る'),
        ...checks.map((c) => (c.known
          ? h('div', { class: `ck ${c.bad ? 'ng' : 'ok'}` }, h('i', {}, c.bad ? '✗' : '✓'), `${c.name}：${c.bad ? c.ng : c.ok}`)
          : h('div', { class: 'ck unk' }, h('i', {}, '？'), `${c.name}${touchable || (L.qa?.asked && L.qa.addPhoto === c.part) || L.photos.includes(c.part) ? '' : '（写真がない）'}`))),
      ) : null,
      L.verdict ? h('div', { class: `mm-verdict ${o.fake ? 'ng' : 'ok'}` }, o.fake ? '鑑定眼：これは偽物だ' : '鑑定眼：本物で間違いない') : null,
    );
  }

  function buyBar(o) {
    const minQ = o.minQty || 1;
    const sold = o.maxQty < minQ;
    const q = Math.max(minQ, Math.min(qty.get(o.oid), Math.max(1, o.maxQty)));
    if (sold) return h('div', { class: 'buy-bar' }, h('div', { class: 'sold-out' }, '購入済み'));
    const stepN = o.minQty ? 10 : 1;
    return h('div', { class: 'buy-bar' },
      o.maxQty > minQ
        ? h('div', { class: 'stepper' },
          h('button', { class: 'btn small', onclick: () => { qty.set(o.oid, Math.max(minQ, q - stepN)); render(); } }, '−'),
          h('span', {}, `${q}`),
          h('button', { class: 'btn small', onclick: () => { qty.set(o.oid, Math.min(o.maxQty, q + stepN)); render(); } }, '＋'),
        )
        : null,
      h('button', { class: 'btn bb-card', onclick: () => doBuy(o, q, 'card') }, 'カード'),
      h('button', { class: 'btn bb-cash', onclick: () => doBuy(o, q, 'cash') }, `購入する ${yen(o.price * q)}`),
    );
  }

  function doBuy(o, q, method, { quiet = false } = {}) {
    const p = productOf(o.pid);
    if (o.maxQty < (o.minQty || 1)) return { ok: false, msg: '売り切れ' };
    if (p.used && !o.brandNew && !flag(s, 'license')) {
      if (!quiet) toast('中古品の仕入れには古物商許可が必要だ', 'bad');
      return { ok: false, msg: '古物商許可が必要' };
    }
    const res = buy(s, o, q, method);
    if (!quiet) toast(res.msg, res.ok ? 'good' : 'bad');
    if (res.ok) {
      if (!quiet) playSe('hint');
      got.push({ pid: o.pid, qty: q });
      mode.afterBuy?.(o, q);
    }
    if (!quiet) render();
    onChange?.();
    return res;
  }

  render();
  return closed;
}
