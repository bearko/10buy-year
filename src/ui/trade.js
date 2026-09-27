// 仕入れ・販売まわりの画面（オファー、週の売上、在庫と出品、相場）
import { productImage, productOf, shippingCost, SIZE_INFO } from '../data/products.js';
import { weekLabel, yearOf } from '../engine/calendar.js';
import { flag, hasSkill } from '../engine/effects.js';
import {
  activeUnits, buy, buybackQuote, capacity, cardAvailable, groupInventory, hardCapacity, listedUnits, listingCap, listUnits, platformFee, platformsFor, PLATFORMS, sellToBuyer, spaceUsed, unlistUnits,
} from '../engine/inventory.js';
import { confidenceLabel, estimateAt, estimateUnit, isReleased, roundPrice, visibleProducts } from '../engine/market.js';
import { openLotteries } from '../engine/offers.js';
import { heldDays, kpiLevel } from '../engine/kpi.js';
import { playSe } from './audio.js';
import { h, signYen, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

const KIND_LABEL = {
  staple: '定番', hype: '限定', collect: 'コレクター', seasonal: '季節', perishable: '生もの', boom: 'ブーム', luxury: '高級', home: '家の不用品',
};

const itemIcon = (pid) => h('img', { class: 'item-icon', src: productImage(productOf(pid)), alt: '' });
const canCalc = (s) => hasSkill(s, 'eye_calc');
const estLabel = (s) => (hasSkill(s, 'eye_market') ? '推定相場' : '相場（ざっくり）');

// 手数料と送料を引いた見込み利益（1個あたり）
export function expectedProfit(s, pid, sellPrice, cost, platform = 'merc') {
  const ship = platform === 'ama' ? 0 : shippingCost(productOf(pid));
  return Math.round(sellPrice - platformFee(s, platform, sellPrice) - ship - cost);
}

const profitText = (s, v) => (canCalc(s) ? h('span', { class: v >= 0 ? 'pos' : 'neg' }, `見込み ${signYen(v)}/個`) : h('span', { class: 'muted' }, '見込み利益 ？'));

function editionTag(s, u) {
  if (productOf(u.pid).kind !== 'hype' || !u.edition) return null;
  const cur = s.market[u.pid].edition;
  if (cur && u.edition < cur) return h('span', { class: 'tag bad' }, `${u.edition}年目モデル（旧型）`);
  return yearOf(s.week) > 1 ? h('span', { class: 'tag' }, `${u.edition}年目モデル`) : null;
}

// ---------------- 仕入れ（オファー） ----------------
export function offersModal(s, step, onChange) {
  const qty = new Map(step.offers.map((o) => [o.oid, o.minQty || 1]));
  const modal = openModal(step.title || '仕入れ', (body, api) => {
    body.append(
      h('div', { class: 'wallet' },
        h('span', {}, `現金 ${yenFmt(s.cash)}`),
        h('span', {}, `カード残枠 ${yenFmt(cardAvailable(s))}`),
        s.points ? h('span', {}, `${s.points.toLocaleString()}pt`) : null,
        h('span', { class: spaceUsed(s) > capacity(s) ? 'neg' : '' }, `置き場 ${spaceUsed(s)}/${capacity(s)}`),
      ),
      step.note ? h('p', { class: 'note' }, step.note) : null,
      canCalc(s) ? null : h('p', { class: 'note' }, '手数料10%＋送料が引かれる'),
    );
    if (step.autoBought?.length) body.append(h('div', { class: 'news-list' }, h('div', { class: 'sub' }, '外注が自動で仕入れた'), ...step.autoBought.map((m) => h('div', { class: 'news up' }, m))));
    if (!step.offers.length) body.append(h('p', { class: 'empty' }, '目ぼしい商品は見つからなかった…'));
    for (const o of step.offers) {
      const p = productOf(o.pid);
      const minQ = o.minQty || 1;
      const q = Math.max(minQ, Math.min(qty.get(o.oid), Math.max(1, o.maxQty)));
      const profit = expectedProfit(s, o.pid, o.est, o.price) + Math.round(o.price * (o.points || 0));
      const soldOut = o.maxQty < minQ;
      body.append(
        h('div', { class: `card offer ${soldOut ? 'done' : ''}` },
          itemIcon(o.pid),
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, p.name, h('small', {}, ` ${p.genre}`)),
            h('div', { class: 'tags' },
              h('span', { class: 'tag src' }, o.label),
              h('span', { class: 'tag' }, KIND_LABEL[p.kind]),
              h('span', { class: 'tag' }, `サイズ${SIZE_INFO[p.size].label}`),
              o.points ? h('span', { class: 'tag good' }, `${Math.round(o.points * 100)}%pt還元`) : null,
              o.upcoming ? h('span', { class: 'tag' }, '発売前（予想相場）') : null,
              o.arriveWeek > s.week ? h('span', { class: 'tag' }, `${weekLabel(o.arriveWeek)}着`) : null,
              o.minQty ? h('span', { class: 'tag' }, `最低${o.minQty}個`) : null,
              p.used && !flag(s, 'license') ? h('span', { class: 'tag bad' }, '要古物商') : null,
              p.alcohol && flag(s, 'noAlcohol') ? h('span', { class: 'tag bad' }, '酒類：出品不可') : null,
            ),
            h('div', { class: 'nums' },
              h('span', {}, `仕入れ ${yenFmt(o.price)}`),
              h('span', {}, `${estLabel(s)} ${yenFmt(o.est)}`, h('small', {}, `（確度${confidenceLabel(s)}）`)),
              profitText(s, profit),
            ),
            o.warn ? h('div', { class: 'warn' }, `⚠ なんだか怪しい…${o.fakeNote ? `（${o.fakeNote}？）` : '（偽物かも）'}`) : null,
            soldOut
              ? h('div', { class: 'done-label' }, '購入済み')
              : h('div', { class: 'buy-row' },
                o.maxQty > minQ
                  ? h('div', { class: 'stepper' },
                    h('button', { class: 'btn small', onclick: () => { qty.set(o.oid, Math.max(minQ, q - (o.minQty ? 10 : 1))); api.refresh(); } }, '−'),
                    h('span', {}, `${q}個`),
                    h('button', { class: 'btn small', onclick: () => { qty.set(o.oid, Math.min(o.maxQty, q + (o.minQty ? 10 : 1))); api.refresh(); } }, '＋'),
                  )
                  : h('span', { class: 'qty1' }, `${q}個`),
                h('button', { class: 'btn buy', onclick: () => doBuy(o, q, 'cash', api) }, `現金 ${yenFmt(o.price * q)}`),
                h('button', { class: 'btn buy card', onclick: () => doBuy(o, q, 'card', api) }, 'カード'),
              ),
          ),
        ),
      );
    }
  }, { closeLabel: '仕入れを終える' });

  function doBuy(o, q, method, api) {
    const p = productOf(o.pid);
    if (p.used && !flag(s, 'license')) {
      toast('中古品の仕入れには古物商許可が必要だ', 'bad');
      return;
    }
    const res = buy(s, o, q, method);
    toast(res.msg, res.ok ? 'good' : 'bad');
    if (res.ok) playSe('buy');
    api.refresh();
    onChange?.();
  }
  return modal.closed;
}

// ---------------- 今週の売上 ----------------
export function salesModal(s, step) {
  const totalNet = step.sold.reduce((a, x) => a + x.net, 0);
  const totalProfit = step.sold.reduce((a, x) => a + x.profit, 0);
  const modal = openModal(`${step.week}の取引結果`, (body) => {
    if (!step.sold.length) body.append(h('p', { class: 'empty' }, '今週は1つも売れなかった…'));
    for (const x of step.sold) {
      const p = productOf(x.pid);
      body.append(
        h('div', { class: 'card row' },
          itemIcon(x.pid),
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, p.name, h('small', {}, ` ${PLATFORMS[x.platform].name}`)),
            h('div', { class: 'nums' },
              h('span', {}, `売値 ${yenFmt(x.price)}`),
              h('span', {}, `入金予定 ${yenFmt(x.net)}`),
              canCalc(s) ? h('span', { class: x.profit >= 0 ? 'pos' : 'neg' }, `利益 ${signYen(x.profit)}`) : null,
            ),
            x.delayed ? h('div', { class: 'warn' }, '体力が足りず発送が遅れた（評価ダウン）') : null,
          ),
        ),
      );
    }
    for (const x of step.auctionsUnsold) {
      body.append(h('div', { class: 'card row muted' }, itemIcon(x.pid), h('div', { class: 'grow' }, `${productOf(x.pid).name}（ミィーム）…${x.bidders ? '最低落札価格に届かず' : '入札なし'}で流札`)));
    }
    if (step.sold.length) {
      body.append(
        h('div', { class: 'summary' },
          h('span', {}, `売上金 ${yenFmt(totalNet)}（来週入金）`),
          canCalc(s) ? h('span', { class: totalProfit >= 0 ? 'pos' : 'neg' }, `利益 ${signYen(totalProfit)}`) : null,
          step.staminaUsed ? h('span', {}, `梱包・発送で体力 -${step.staminaUsed}`) : null,
          step.outsourced ? h('span', {}, `外注が${step.outsourced}件発送`) : null,
        ),
      );
    }
  }, { closeLabel: 'OK' });
  return modal.closed;
}

// ---------------- 在庫と出品 ----------------
export function inventoryModal(s, onChange) {
  const editing = { key: null, platform: 'merc', price: 0, qty: 1 };
  return openModal('在庫・出品', (body, api) => {
    const cap = listingCap(s);
    body.append(
      h('div', { class: 'wallet' },
        h('span', {}, `出品枠 ${listedUnits(s).length}/${cap}`),
        h('span', { class: spaceUsed(s) > capacity(s) ? 'neg' : '' }, `置き場 ${spaceUsed(s)}/${capacity(s)}（限界${hardCapacity(s)}）`),
        h('span', {}, `在庫 ${s.inventory.length}個`),
        s.banWeeks > 0 ? h('span', { class: 'neg' }, `プンシー停止中（あと${s.banWeeks}週）`) : null,
        s.amaBan > 0 ? h('span', { class: 'neg' }, `アマクリ停止中（あと${s.amaBan}週）`) : null,
      ),
      h('p', { class: 'note' }, '週末に売れるか判定。売上金は翌週に入金'),
    );
    const groups = groupInventory(s);
    if (!groups.length) body.append(h('p', { class: 'empty' }, s.stats.purchases ? '在庫はない。仕入れに行こう。' : '在庫はない。「家の中を探す」で不用品を探そう。'));
    for (const g of groups) {
      const p = productOf(g.pid);
      const u0 = g.units[0];
      const est = estimateUnit(s, u0);
      const waiting = g.arrive > s.week;
      const blockedAlcohol = p.alcohol && flag(s, 'noAlcohol');
      const isEditing = editing.key === g.key;
      const quote = buybackQuote(s, u0);
      const days = heldDays(s, u0);
      body.append(h('div', { class: `card ${g.listing ? 'listed' : ''}` },
        itemIcon(g.pid),
        h('div', { class: 'grow' },
          h('div', { class: 'name' }, g.home ? p.genre : p.name, h('small', {}, ` ×${g.units.length}`)),
          h('div', { class: 'tags' },
            h('span', { class: 'tag' }, g.home ? '家の不用品' : p.genre),
            editionTag(s, u0),
            g.damaged ? h('span', { class: 'tag bad' }, '傷あり') : null,
            g.expire !== null && g.expire !== undefined ? h('span', { class: 'tag bad' }, `賞味期限 ${weekLabel(g.expire)}まで`) : null,
            waiting ? h('span', { class: 'tag' }, `${weekLabel(g.arrive)}に届く`) : null,
            !waiting && kpiLevel(s) >= 2 ? h('span', { class: `tag ${days >= 90 ? 'bad' : ''}` }, `在庫${days}日`) : null,
            g.listing ? h('span', { class: 'tag good' }, `${PLATFORMS[g.listing.platform].name}に出品中 ${yenFmt(g.listing.price)}`) : null,
          ),
          h('div', { class: 'nums' },
            h('span', {}, g.home ? '仕入れ 0円（家にあった物）' : `仕入れ ${yenFmt(g.cost)}`),
            h('span', {}, `${estLabel(s)} ${yenFmt(est)}`),
            g.listing ? profitText(s, expectedProfit(s, g.pid, g.listing.price, g.cost, g.listing.platform)) : null,
          ),
          waiting
            ? null
            : h('div', { class: 'buy-row' },
              blockedAlcohol ? h('span', { class: 'warn' }, '酒類は出品できない（免許なし）') : null,
              blockedAlcohol ? null : h('button', { class: 'btn', onclick: () => { Object.assign(editing, { key: g.key, platform: g.listing?.platform || platformsFor(s, u0).find((pf) => !(pf.id === 'merc' && s.banWeeks > 0))?.id || 'merc', price: g.listing?.price || roundPrice(est), qty: g.units.length }); api.refresh(); } }, g.listing ? '価格を変える' : '出品する'),
              g.listing ? h('button', { class: 'btn', onclick: () => { unlistUnits(s, g.units.map((u) => u.uid)); api.refresh(); onChange?.(); } }, '取り下げる') : null,
              h('button', {
                class: 'btn small danger',
                onclick: () => {
                  if (!window.confirm(`${g.units.length}個を買取業者に売りますか？（1個 ${yenFmt(quote)}）`)) return;
                  const r = sellToBuyer(s, g.units.map((u) => u.uid));
                  toast(`${r.n}個を${yenFmt(r.total)}で買い取ってもらった`, 'good');
                  playSe('coin');
                  api.refresh();
                  onChange?.();
                },
              }, `買取に出す（${yenFmt(quote)}）`),
            ),
          isEditing ? listingEditor(s, g, est, editing, api, onChange) : null,
        ),
      ));
    }
  }, { closeLabel: '閉じる' }).closed;
}

function listingEditor(s, g, est, editing, api, onChange) {
  const p = productOf(g.pid);
  const setPrice = (v) => {
    editing.price = Math.max(100, roundPrice(v));
    api.refresh();
  };
  const fee = platformFee(s, editing.platform, editing.price);
  const ship = editing.platform === 'ama' ? 0 : shippingCost(p);
  const profit = expectedProfit(s, g.pid, editing.price, g.cost, editing.platform);
  const ratio = editing.price / Math.max(1, est);
  const feel = ratio <= 0.92 ? 'すぐ売れそう' : ratio <= 1.05 ? '相場どおり' : ratio <= 1.2 ? 'やや強気' : '売れにくそう';
  const maxQty = g.units.length;
  const pfs = platformsFor(s, g.units[0]);
  return h('div', { class: 'editor' },
    h('div', { class: 'sub small' }, '売り先を決める'),
    h('div', { class: 'seg' },
      ...pfs.map((pf) => h('button', {
        class: `btn small ${editing.platform === pf.id ? 'on' : ''}`,
        disabled: (pf.id === 'merc' && s.banWeeks > 0) || (pf.id === 'ama' && s.amaBan > 0),
        onclick: () => { editing.platform = pf.id; api.refresh(); },
      }, pf.name)),
    ),
    h('p', { class: 'note' }, PLATFORMS[editing.platform].desc, editing.platform === 'auc' ? '（価格は最低落札価格）' : ''),
    h('div', { class: 'price-row' },
      h('input', { type: 'number', min: '100', step: '100', value: String(editing.price), onchange: (e) => setPrice(Number(e.target.value) || 0) }),
      h('span', {}, '円'),
    ),
    h('div', { class: 'seg' }, ...[0.9, 1.0, 1.1, 1.2, 1.5].map((m) => h('button', { class: 'btn small', onclick: () => setPrice(est * m) }, `相場×${m}`))),
    h('div', { class: 'nums' },
      h('span', {}, `手数料 ${yenFmt(fee)}`),
      h('span', {}, ship ? `送料 ${yenFmt(ship)}` : '送料 倉庫から出荷'),
      canCalc(s) ? h('span', { class: profit >= 0 ? 'pos' : 'neg' }, `利益 ${signYen(profit)}/個`) : null,
      h('span', {}, `（${feel}）`),
    ),
    maxQty > 1
      ? h('div', { class: 'stepper' },
        h('button', { class: 'btn small', onclick: () => { editing.qty = Math.max(1, editing.qty - 1); api.refresh(); } }, '−'),
        h('span', {}, `${editing.qty}個出品`),
        h('button', { class: 'btn small', onclick: () => { editing.qty = Math.min(maxQty, editing.qty + 1); api.refresh(); } }, '＋'),
      )
      : null,
    h('div', { class: 'buy-row' },
      h('button', {
        class: 'btn primary',
        onclick: () => {
          const uids = g.units.slice(0, editing.qty).map((u) => u.uid);
          const n = listUnits(s, uids, editing.platform, editing.price);
          toast(n ? `${n}個を${PLATFORMS[editing.platform].name}に出品した` : '出品枠がいっぱいだ', n ? 'good' : 'bad');
          editing.key = null;
          api.refresh();
          onChange?.();
        },
      }, 'この内容で出品'),
      h('button', { class: 'btn', onclick: () => { editing.key = null; api.refresh(); } }, 'やめる'),
    ),
  );
}

// ---------------- 相場 ----------------
function sparkline(values) {
  const w = 96;
  const hgt = 28;
  if (values.length < 2) return h('span');
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const pts = values.map((v, i) => `${(i / (values.length - 1)) * w},${hgt - 2 - ((v - min) / span) * (hgt - 4)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', 'spark');
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts);
  svg.append(line);
  return svg;
}

export function marketModal(s) {
  return openModal('相場・ニュース', (body) => {
    if (s.news.length) {
      body.append(h('div', { class: 'news-list' }, h('div', { class: 'sub' }, '今週のニュース'), ...s.news.map((n) => h('div', { class: `news ${n.kind}` }, n.text))));
    }
    const lots = hasSkill(s, 'src_lottery') ? openLotteries(s) : [];
    if (lots.length) body.append(h('p', { class: 'note' }, `抽選受付中：${lots.map((p) => `「${p.name}」`).join('')}`));
    body.append(h('p', { class: 'note' }, `推定相場の確度：${confidenceLabel(s)}`));
    for (const p of visibleProducts(s).filter((x) => x.kind !== 'home')) {
      const m = s.market[p.id];
      const n = m.hist.length;
      const series = m.hist.map((v, i) => estimateAt(s, p.id, s.week - (n - 1 - i), v));
      const cur = series[series.length - 1];
      const prev = series[series.length - 2] ?? cur;
      const diff = cur - prev;
      const released = isReleased(s, p);
      const held = activeUnits(s).filter((u) => u.pid === p.id).length;
      body.append(
        h('div', { class: 'card row' },
          itemIcon(p.id),
          h('div', { class: 'grow' },
            h('div', { class: 'name' }, p.name, h('small', {}, ` ${p.genre}`), held ? h('small', { class: 'held' }, ` 在庫${held}`) : null),
            h('div', { class: 'tags' },
              h('span', { class: 'tag' }, KIND_LABEL[p.kind]),
              p.used ? h('span', { class: 'tag' }, '中古') : null,
              !released ? h('span', { class: 'tag' }, '発売前') : null,
              m.phase === 'boom' ? h('span', { class: 'tag good' }, 'ブーム中') : null,
              m.restockWeek >= 0 && s.week - m.restockWeek < 3 ? h('span', { class: 'tag bad' }, '再販あり') : null,
            ),
            h('div', { class: 'nums' },
              h('span', {}, `${p.used ? '参考価格' : '定価'} ${yenFmt(p.retail)}`),
              h('span', {}, `${released ? '推定相場' : '予想相場'} ${yenFmt(cur)}`),
              h('span', { class: diff > 0 ? 'pos' : diff < 0 ? 'neg' : '' }, diff > 0 ? `▲${yenFmt(diff)}` : diff < 0 ? `▼${yenFmt(-diff)}` : '→'),
            ),
          ),
          sparkline(series),
        ),
      );
    }
  }).closed;
}
