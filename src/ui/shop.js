// 仕入れ画面。フリマ・通販サイト・店舗の売り場のように商品を並べ、タップで商品ページを開く。
// 偽物かどうかは書かない。出品者・写真・説明文・付属品・質問への対応・細部から自分で見抜く。
import { productImage, productOf, SIZE_INFO } from '../data/products.js';
import { weekLabel } from '../engine/calendar.js';
import { flag, hasSkill } from '../engine/effects.js';
import { buy, capacity, cardAvailable, spaceUsed } from '../engine/inventory.js';
import { askSeller, catInfo, siteOf, visibleChecks } from '../engine/listing.js';
import { confidenceLabel } from '../engine/market.js';
import { playSe } from './audio.js';
import { $, clear, h, signYen, yenFmt } from './dom.js';
import { toast } from './modal.js';
import { expectedProfit } from './trade.js';

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
    h('img', { src: productImage(productOf(o.pid)), alt: '', style: { transform: `scale(${shot.scale})`, transformOrigin: `${shot.x}% ${shot.y}%` } }),
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
  const got = []; // この画面で仕入れた商品（閉じたあとステージに並べる）

  const root = h('div', { class: 'shop' });
  const onKey = (e) => {
    if (e.key !== 'Escape') return;
    if (open) back();
    else close();
  };
  function close() {
    root.remove();
    window.removeEventListener('keydown', onKey);
    resolveClosed(got);
  }
  function back() {
    open = null;
    render();
  }
  window.addEventListener('keydown', onKey);
  $('#modal-root').append(root);

  function render() {
    const y = root.querySelector('.shop-body')?.scrollTop || 0;
    clear(root);
    if (open) renderItem(open);
    else renderGrid();
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
    root.append(h('header', { class: 'shop-head', style: { '--site': sites.length > 1 ? '#39406b' : first.color } },
      h('button', { class: 'shop-x', onclick: close, 'aria-label': '閉じる' }, '×'),
      h('b', { class: 'shop-logo' }, title),
      h('span', { class: 'shop-sub' }, sites.length > 1 ? '' : step.title),
    ));
    const body = h('div', { class: 'shop-body' });
    root.append(body);
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
    body.append(grid, h('button', { class: 'btn primary shop-done', onclick: close }, '仕入れを終える'));
  }

  function gridItem(o) {
    const p = productOf(o.pid);
    const site = siteOf(o);
    const sold = o.maxQty < (o.minQty || 1);
    const store = site.kind === 'store' || site.kind === 'pro';
    const profit = expectedProfit(s, o.pid, o.est, o.price) + Math.round(o.price * (o.points || 0));
    return h('button', { class: `sh-item ${store ? 'store' : ''} ${sold ? 'sold' : ''}`, onclick: () => { open = o; shot = 0; render(); } },
      h('div', { class: 'sh-img' },
        photo(o, catInfo(o.pid).photos[0], { stock: o.listing?.stockPhoto }),
        store
          ? h('span', { class: 'sh-tag' }, h('small', {}, o.label), yen(o.price))
          : h('span', { class: 'sh-price' }, yen(o.price)),
        o.points ? h('span', { class: 'sh-badge pt' }, `${Math.round(o.points * 100)}%還元`) : null,
        o.upcoming ? h('span', { class: 'sh-badge' }, '予約') : null,
        sold ? h('span', { class: 'sh-sold' }, 'SOLD') : null,
      ),
      h('div', { class: 'sh-name' }, p.name),
      h('div', { class: 'sh-meta' },
        sites.length > 1 ? h('span', { class: 'sh-site', style: { '--site': site.color } }, site.name) : null,
        o.listing?.likes ? h('span', {}, `♡${o.listing.likes}`) : null,
        o.maxQty > 1 ? h('span', {}, `残り${o.maxQty}`) : null,
      ),
      h('div', { class: 'sh-memo' }, `相場 ${yen(o.est)}`, canCalc(s) ? h('b', { class: profit >= 0 ? 'pos' : 'neg' }, ` ${signYen(profit)}`) : null),
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

    root.append(h('header', { class: 'shop-head', style: { '--site': site.color } },
      h('button', { class: 'shop-x', onclick: back, 'aria-label': '戻る' }, '‹'),
      h('b', { class: 'shop-logo' }, site.name),
    ));
    const body = h('div', { class: 'shop-body item' });
    root.append(body);

    body.append(
      h('div', { class: 'gallery' },
        photo(o, cur, { big: true, stock }),
        photos.length > 1 ? h('div', { class: 'thumbs' }, ...photos.map((part, i) => h('button', { class: i === shot ? 'on' : '', onclick: () => { shot = i; render(); } }, photo(o, part, { stock: L.stockPhoto && part !== L.qa?.addPhoto })))) : null,
      ),
      h('div', { class: 'it-sec' },
        h('h2', { class: 'it-title' }, `${p.name}　${p.genre}`),
        h('div', { class: 'it-price' }, yen(o.price), h('small', {}, store ? '（税込）' : site.kind === 'mall' ? '（税込）送料無料' : '（税込）送料込み')),
        h('div', { class: 'it-badges' },
          store ? h('span', { class: 'it-deal' }, o.label) : null,
          o.points ? h('span', { class: 'it-pt' }, `ポイント${Math.round(o.points * 100)}%還元`) : null,
          L.likes ? h('span', {}, `♡ ${L.likes}`) : null,
          L.qa ? h('span', {}, `💬 ${L.qa.asked ? 2 : 0}`) : null,
        ),
      ),
    );

    if (L.description) body.append(section('商品の説明', h('p', { class: 'it-desc' }, L.description)));
    body.append(section('商品の情報', h('table', { class: 'it-info' }, ...(L.info || []).map(([k, v]) => h('tr', {}, h('th', {}, k), h('td', {}, v))))));
    if (L.seller) body.append(section('出品者', sellerCard(L.seller)));
    if (L.qa) body.append(section(o.source === 'used' ? '店員さんに聞く' : 'コメント', qaBlock(o)));
    body.append(section('自分のメモ', memo(o), 'memo'));
    root.append(buyBar(o));
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
      return h('button', { class: 'qa-ask', onclick: () => { askSeller(o); if (qa.addPhoto) shot = o.listing.photos.length; render(); } }, `質問する：${qa.question}`);
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
      h('div', { class: 'mm-row' }, h('span', {}, hasSkill(s, 'eye_market') ? '推定相場' : '相場（ざっくり）'), h('b', {}, `${yen(o.est)}`), h('small', {}, `確度${confidenceLabel(s)}`)),
      h('div', { class: 'mm-row' }, h('span', {}, '相場との比較'), h('b', {}, `${ratio}%`)),
      h('div', { class: 'mm-row' }, h('span', {}, '見込み利益'), canCalc(s) ? h('b', { class: profit >= 0 ? 'pos' : 'neg' }, `${signYen(profit)}/個`) : h('b', {}, '？')),
      h('div', { class: 'mm-tags' },
        h('span', {}, `サイズ${SIZE_INFO[p.size].label}`),
        o.upcoming ? h('span', {}, '発売前（予想相場）') : null,
        o.arriveWeek > s.week ? h('span', {}, `${weekLabel(o.arriveWeek)}着`) : null,
        o.minQty ? h('span', {}, `最低${o.minQty}個`) : null,
        p.used && !flag(s, 'license') ? h('span', { class: 'bad' }, '要古物商') : null,
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

  function doBuy(o, q, method) {
    const p = productOf(o.pid);
    if (p.used && !flag(s, 'license')) {
      toast('中古品の仕入れには古物商許可が必要だ', 'bad');
      return;
    }
    const res = buy(s, o, q, method);
    toast(res.msg, res.ok ? 'good' : 'bad');
    if (res.ok) {
      playSe('buy');
      got.push({ pid: o.pid, qty: q });
    }
    render();
    onChange?.();
  }

  render();
  return closed;
}
