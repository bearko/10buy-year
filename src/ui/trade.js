// 仕入れ・販売まわりの画面（オファー、週の売上、在庫と出品、相場）
import { priceCap } from '../engine/regimes.js';
import { productImage, productOf, shipFor, shippingCost } from '../data/products.js';
import { weekLabel, yearOf } from '../engine/calendar.js';
import { flag, hasSkill } from '../engine/effects.js';
import {
  abroadMult, activeUnits, buybackQuote, capacity, feeRate, groupInventory, platformMult, platformOpen, hardCapacity, listedUnits, listingCap, listUnits, platformFee, platformsFor, PLATFORMS, sellToBuyer, spaceUsed, unlistUnits,
} from '../engine/inventory.js';
import { confidenceLabel, estimateAt, estimateUnit, isReleased, roundPrice, visibleProducts } from '../engine/market.js';
import { openLotteries } from '../engine/offers.js';
import { currentMission } from '../engine/tutorial.js';
import { heldDays, kpiLevel } from '../engine/kpi.js';
import { playSe } from './audio.js';
import { h, signYen, yenFmt } from './dom.js';
import { confirmBox, openModal, toast } from './modal.js';

const KIND_LABEL = {
  staple: '定番', hype: '限定', collect: 'コレクター', seasonal: '季節', perishable: '生もの', boom: 'ブーム', luxury: '高級', home: '家の不用品',
};

const itemIcon = (pid) => h('img', { class: 'item-icon', src: productImage(productOf(pid)), alt: '' });
const canCalc = (s) => hasSkill(s, 'eye_calc');
const estLabel = (s) => (hasSkill(s, 'eye_market') ? '推定相場' : '相場（ざっくり）');

// 手数料と送料を引いた見込み利益（1個あたり）
export function expectedProfit(s, pid, sellPrice, cost, platform = 'merc') {
  const ship = shipFor(platform, productOf(pid));
  return Math.round(sellPrice - platformFee(s, platform, sellPrice) - ship - cost);
}

const profitText = (s, v) => (canCalc(s) ? h('span', { class: v >= 0 ? 'pos' : 'neg' }, `見込み ${signYen(v)}/個`) : h('span', { class: 'muted' }, '見込み利益 ？'));

function editionTag(s, u) {
  if (productOf(u.pid).kind !== 'hype' || !u.edition) return null;
  const cur = s.market[u.pid].edition;
  if (cur && u.edition < cur) return h('span', { class: 'tag bad' }, `${u.edition}年目モデル（旧型）`);
  return yearOf(s.week) > 1 ? h('span', { class: 'tag' }, `${u.edition}年目モデル`) : null;
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
    for (const x of step.authFailed || []) {
      body.append(h('div', { class: 'card row muted' }, itemIcon(x.pid), h('div', { class: 'grow' }, `${productOf(x.pid).name}（ホンモノ堂）…鑑定で偽物と判定され、送り返されてきた`)));
    }
    for (const x of step.auctionsUnsold) {
      body.append(h('div', { class: 'card row muted' }, itemIcon(x.pid), h('div', { class: 'grow' }, `${productOf(x.pid).name}（ミィーム）…${x.bidders ? '最低落札価格に届かず' : '入札なし'}で流札`)));
    }
    if (step.sold.length) {
      body.append(
        h('div', { class: 'summary' },
          h('span', {}, `${step.sold.length > 1 ? '合計の' : ''}売上金 ${yenFmt(totalNet)}（週明けに入金）`),
          canCalc(s) && step.sold.length > 1 ? h('span', { class: totalProfit >= 0 ? 'pos' : 'neg' }, `合計の利益 ${signYen(totalProfit)}`) : null,
          step.staminaUsed ? h('span', {}, `梱包・発送で体力 -${step.staminaUsed}`) : null,
          step.outsourced ? h('span', {}, `外注が${step.outsourced}件発送`) : null,
        ),
      );
    }
  }, { closeLabel: 'OK' });
  return modal.closed;
}

// ---------------- 在庫と出品 ----------------
// 操作を最小に：上のタブで売り先を選び、商品ごとにスライダーで値付けと個数を決めて、ボタン1つで出品／即決買取
let market = 'merc'; // 前回選んだ売り先を覚えておく
const feelOf = (ratio) => (ratio <= 0.92 ? 'すぐ売れそう' : ratio <= 1.05 ? '相場どおり' : ratio <= 1.2 ? 'やや強気' : '売れにくそう');
const banned = (s, id) => (id === 'merc' && s.banWeeks > 0) || (id === 'ama' && s.amaBan > 0);

export function inventoryModal(s, onChange) {
  const pick = new Map(); // グループごとの { mult, qty }
  const selected = new Set(); // まとめて操作する商品（グループのキー）
  let selecting = false;
  let showInfo = false;
  // 停止中の売り先は避けて開く
  const open = Object.values(PLATFORMS).filter((pf) => platformOpen(s, pf) && !banned(s, pf.id));
  if (banned(s, market) && open.length) market = open[0].id;
  const askConfirm = () => s.settings.confirmBuyback !== false;

  return openModal('在庫・出品', (body, api) => {
    const markets = Object.values(PLATFORMS).filter((pf) => platformOpen(s, pf));
    if (!markets.some((pf) => pf.id === market)) market = markets[0]?.id || 'merc';
    const pf = PLATFORMS[market];
    const cap = listingCap(s);
    // チュートリアルの「出品しよう」の間は、最初に押す出品ボタンを指し示す
    const tut = currentMission(s)?.id;
    let pointed = false;
    const done = (msg, tone = 'good') => {
      toast(msg, tone);
      api.refresh();
      onChange?.();
    };
    const groups = groupInventory(s);
    groups.sort((x, y) => (x.listing ? 1 : 0) - (y.listing ? 1 : 0)); // 出品していない物を上に
    for (const key of [...selected]) if (!groups.some((g) => g.key === key)) selected.delete(key);

    // 商品ごとの値付け・個数と、そこから決まる金額
    function plan(g) {
      const u0 = g.units[0];
      const platform = g.listing ? g.listing.platform : market;
      // 販路の倍率（海外ECの為替・裏市場）を推定相場にかけて見せる
      const est = Math.round(estimateUnit(s, u0) * platformMult(s, platform, u0));
      const cur = pick.get(g.key) || { mult: g.listing ? g.listing.price / Math.max(1, est) : 1, qty: g.units.length };
      pick.set(g.key, cur);
      const p = productOf(g.pid);
      return {
        est,
        cur,
        platform,
        price: Math.min(priceCap(s, g.pid, platform), Math.max(100, roundPrice(est * cur.mult))),
        cap: priceCap(s, g.pid, platform),
        quote: buybackQuote(s, u0),
        uids: g.units.slice(0, cur.qty).map((u) => u.uid),
        waiting: g.arrive > s.week,
        blocked: p.alcohol && flag(s, 'noAlcohol'),
        authFail: g.authFail,
        canHere: platformsFor(s, u0).some((m) => m.id === platform) && !banned(s, platform),
      };
    }

    // 即決買取（設定で確認をはさむ。「次回から表示しない」で設定を切る）
    async function sellBack(entries) {
      const units = entries.reduce((a, e) => a + e.uids.length, 0);
      const total = entries.reduce((a, e) => a + e.quote * e.uids.length, 0);
      if (askConfirm()) {
        const r = await confirmBox({
          title: '即決買取',
          lines: [`${units}個を買取業者に売ります。`, `受け取り ${yenFmt(total)}（相場の半分以下）`],
          okLabel: '買い取ってもらう',
          danger: true,
          dontAsk: true,
        });
        if (!r.ok) return;
        if (r.dontAsk) s.settings.confirmBuyback = false;
      }
      let n = 0;
      let sum = 0;
      for (const e of entries) {
        const r = sellToBuyer(s, e.uids);
        n += r.n;
        sum += r.total;
      }
      playSe('coin');
      selected.clear();
      selecting = false;
      done(`${n}個を${yenFmt(sum)}で買い取ってもらった`);
    }

    function toggle(key) {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      selecting = selected.size > 0;
      api.refresh();
    }

    const selectable = groups.filter((g) => g.arrive <= s.week);
    body.append(...[
      h('div', { class: 'mk-tabs' },
        ...markets.map((m) => h('button', { class: `mk-tab ${m.id === market ? 'on' : ''} ${banned(s, m.id) ? 'ban' : ''}`, onclick: () => { market = m.id; api.refresh(); } }, m.name, banned(s, m.id) ? h('small', {}, '停止中') : null)),
        h('button', { class: `mk-info-btn ${showInfo ? 'on' : ''}`, onclick: () => { showInfo = !showInfo; api.refresh(); } }, 'ⓘ 情報'),
      ),
      showInfo
        ? h('div', { class: 'mk-info' },
          h('b', {}, pf.name),
          h('p', {}, pf.desc),
          h('div', { class: 'nums' },
            h('span', {}, `手数料 ${Math.round(feeRate(s, market) * 100)}%${pf.perUnit ? `＋${pf.perUnit}円/個` : ''}`),
            h('span', {}, market === 'ama' ? '送料：倉庫から出荷（不要）' : market === 'exp' ? `送料：3倍／為替 ×${(s.fx || 1).toFixed(2)}` : market === 'black' ? '送料：手渡し（不要）' : market === 'spec' ? '送料：鑑定センターへ（出品者負担）／相場×1.1で売れる' : '送料：出品者負担'),
            market === 'auc' ? h('span', {}, '価格は最低落札価格') : null,
          ),
        )
        : null,
      h('div', { class: 'wallet' },
        h('span', {}, `出品枠 ${listedUnits(s).length}/${cap}`),
        h('span', { class: spaceUsed(s) > capacity(s) ? 'neg' : '' }, `置き場 ${spaceUsed(s)}/${capacity(s)}（限界${hardCapacity(s)}）`),
        banned(s, market) ? h('span', { class: 'neg' }, `${pf.name}は停止中（あと${market === 'merc' ? s.banWeeks : s.amaBan}週）`) : null,
      ),
      h('div', { class: 'inv-opts' },
        h('label', { class: 'inv-opt' },
          h('input', { type: 'checkbox', checked: askConfirm(), onchange: (e) => { s.settings.confirmBuyback = e.target.checked; onChange?.(); } }),
          '即決買取で確認をはさむ'),
        selectable.length
          ? h('button', { class: `inv-sel-btn ${selecting ? 'on' : ''}`, onclick: () => { selecting = !selecting; if (!selecting) selected.clear(); api.refresh(); } }, selecting ? '選択をやめる' : '☑ 選択')
          : null,
      ),
    ].filter(Boolean));

    // ワンタップの一括操作：未出品を相場で出品／出品中を5%値下げ／90日以上の在庫を買取
    if (!selecting && groups.length) {
      const ready = (g) => { const x = plan(g); return !x.waiting && !x.blocked && x.canHere; };
      const unlisted = groups.filter((g) => !g.listing && ready(g));
      const listed = groups.filter((g) => g.listing);
      const stale = groups.filter((g) => g.arrive <= s.week && heldDays(s, g.units[0]) >= 90);
      const quick = (label, n, onclick, cls = '') => (n ? h('button', { class: `btn small ${cls}`, onclick }, `${label}（${n}）`) : null);
      const row = [
        quick('未出品を相場で出品', unlisted.length, () => {
          let n = 0;
          for (const g of unlisted) {
            const x = plan(g);
            n += listUnits(s, g.units.map((u) => u.uid), x.platform, Math.min(x.cap, Math.max(100, roundPrice(x.est))));
          }
          done(n ? `${n}個を相場で出品した` : '出品枠がいっぱいだ', n ? 'good' : 'bad');
        }, 'primary'),
        quick('出品中を5%値下げ', listed.length, () => {
          let n = 0;
          for (const g of listed) n += listUnits(s, g.units.map((u) => u.uid), g.listing.platform, Math.max(100, roundPrice(g.listing.price * 0.95)));
          done(`${n}個を5%値下げした`);
        }),
        quick('90日以上の在庫を買取', stale.length, () => sellBack(stale.map((g) => ({ uids: g.units.map((u) => u.uid), quote: buybackQuote(s, g.units[0]) }))), 'danger'),
      ].filter(Boolean);
      if (row.length) body.append(h('div', { class: 'inv-quick' }, ...row));
    }

    if (!groups.length) body.append(h('p', { class: 'empty' }, s.stats.purchases ? '在庫はない。仕入れに行こう。' : '在庫はない。「家の中を探す」で不用品を探そう。'));
    const bulk = { listLbl: null, buyLbl: null };
    const updateBulk = () => {
      if (!bulk.listLbl) return;
      const sel = groups.filter((g) => selected.has(g.key)).map(plan);
      const listable = sel.filter((x) => !x.waiting && !x.blocked && x.canHere);
      bulk.listLbl.replaceChildren(h('span', {}, 'まとめて出品'), h('small', {}, yenFmt(listable.reduce((a, x) => a + x.price * x.uids.length, 0))));
      bulk.listLbl.disabled = !listable.length;
      bulk.buyLbl.replaceChildren(h('span', {}, 'まとめて即決買取'), h('small', {}, yenFmt(sel.reduce((a, x) => a + x.quote * x.uids.length, 0))));
      bulk.buyLbl.disabled = !sel.length;
    };
    for (const g of groups) body.append(itemRow(g));

    if (selecting) {
      const sel = groups.filter((g) => selected.has(g.key));
      bulk.listLbl = h('button', {
        class: 'btn primary',
        onclick: () => {
          let n = 0;
          let skipped = 0;
          for (const g of sel) {
            const x = plan(g);
            if (x.waiting || x.blocked || !x.canHere) { skipped++; continue; }
            n += listUnits(s, x.uids, x.platform, x.price);
          }
          selected.clear();
          selecting = false;
          done(n ? `${n}個をまとめて出品した${skipped ? `（${skipped}件は出品できない）` : ''}` : '出品できなかった（出品枠・売り先を確認）', n ? 'good' : 'bad');
        },
      });
      bulk.buyLbl = h('button', { class: 'btn danger', onclick: () => sellBack(sel.map((g) => { const x = plan(g); return { uids: x.uids, quote: x.quote }; })) });
      body.append(h('div', { class: 'bulk-bar' },
        h('div', { class: 'bulk-head' },
          h('button', { class: 'bulk-x', 'aria-label': '選択をやめる', onclick: () => { selected.clear(); selecting = false; api.refresh(); } }, '×'),
          h('b', {}, `${selected.size}件を選択中`),
          h('button', { class: 'bulk-all', onclick: () => { for (const g of selectable) selected.add(g.key); api.refresh(); } }, 'すべて選択'),
        ),
        h('div', { class: 'bulk-btns' }, bulk.listLbl, bulk.buyLbl),
      ));
      updateBulk();
    }

    function itemRow(g) {
      const p = productOf(g.pid);
      const u0 = g.units[0];
      const x = plan(g);
      const { est, cur, platform } = x;
      const days = heldDays(s, u0);
      const listedOn = g.listing ? PLATFORMS[g.listing.platform] : null;
      const on = selected.has(g.key);

      const head = h('div', { class: 'grow' },
        h('div', { class: 'name' }, p.name, h('small', {}, ` ×${g.units.length}`)),
        h('div', { class: 'tags' },
          g.home ? h('span', { class: 'tag' }, `家の不用品・${p.genre}`) : null,
          editionTag(s, u0),
          g.damaged ? h('span', { class: 'tag bad' }, '傷あり') : null,
          g.authFail ? h('span', { class: 'tag bad' }, '鑑定NG（偽物）') : null,
          market === 'exp' && !g.listing && abroadMult(s, g.units[0]) >= 1.1 ? h('span', { class: 'tag good' }, `海外なら相場×${abroadMult(s, g.units[0]).toFixed(1)}`) : null,
          g.expire !== null && g.expire !== undefined ? h('span', { class: 'tag bad' }, `賞味期限 ${weekLabel(g.expire)}まで`) : null,
          x.waiting ? h('span', { class: 'tag' }, `${weekLabel(g.arrive)}に届く`) : null,
          !x.waiting && kpiLevel(s) >= 2 ? h('span', { class: `tag ${days >= 90 ? 'bad' : ''}` }, `在庫${days}日`) : null,
          listedOn ? h('span', { class: 'tag good' }, `${listedOn.name}に出品中 ${yenFmt(g.listing.price)}`) : null,
        ),
        h('div', { class: 'nums' },
          h('span', {}, g.home ? '仕入れ 0円' : `仕入れ ${yenFmt(g.cost)}`),
          h('span', {}, `${estLabel(s)} ${yenFmt(est)}`),
        ),
      );
      const iconBox = h('div', { class: 'inv-icon' },
        itemIcon(g.pid),
        x.waiting ? null : h('button', { class: `sel-dot ${on ? 'on' : ''}`, 'aria-label': on ? '選択を外す' : '選択', onclick: (e) => { e.stopPropagation(); toggle(g.key); } }, '✓'),
      );
      const card = h('div', { class: `card inv ${g.listing ? 'listed' : ''} ${on ? 'selected' : ''} ${selecting ? 'selecting' : ''}` }, iconBox, head);
      if (x.waiting) return card;

      // 長押しで選択を始める。選択中はカードのタップで選択を切り替える
      let timer = null;
      let fired = false;
      const cancel = () => clearTimeout(timer);
      card.addEventListener('pointerdown', (e) => {
        if (e.target.closest('button, input')) return;
        fired = false;
        timer = setTimeout(() => { fired = true; toggle(g.key); }, 450);
      });
      for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) card.addEventListener(ev, cancel);
      card.addEventListener('click', (e) => {
        if (fired) { fired = false; return; }
        if (selecting && !e.target.closest('button, input')) toggle(g.key);
      });

      if (x.blocked) {
        head.append(h('div', { class: 'warn' }, '酒類は出品できない（免許なし）'));
        if (!selecting) head.append(h('div', { class: 'buy-row' }, h('button', { class: 'btn danger inv-buy', onclick: () => sellBack([{ uids: g.units.map((u) => u.uid), quote: x.quote }]) }, `即決買取（${yenFmt(x.quote * g.units.length)}）`)));
        return card;
      }

      // 値付けと個数のスライダー（動かしている間は表示だけ書き換える）
      const priceLbl = h('b', {});
      const feelLbl = h('span', { class: 'feel' });
      const profitLbl = h('span', {});
      const qtyLbl = h('b', {});
      const listBtn = h('button', { class: 'btn primary inv-list', disabled: !x.canHere });
      if (!pointed && !g.listing && x.canHere && ((tut === 'list_home' && g.home) || (tut === 'list_bought' && !g.home))) {
        listBtn.classList.add('tut-point');
        pointed = true;
      }
      const buyBtn = h('button', { class: 'btn danger inv-buy' });
      const update = () => {
        const y = plan(g);
        priceLbl.textContent = yenFmt(y.price);
        feelLbl.textContent = feelOf(y.price / Math.max(1, est));
        const profit = expectedProfit(s, g.pid, y.price, g.cost, platform);
        profitLbl.className = canCalc(s) ? (profit >= 0 ? 'pos' : 'neg') : 'muted';
        profitLbl.textContent = canCalc(s) ? `利益 ${signYen(profit)}/個` : '';
        qtyLbl.textContent = `${cur.qty}個`;
        // 出品と即決買取の金額を、同じ「1個の値段×個数」で比べられるようにする
        const per = (v) => (cur.qty > 1 ? `${yenFmt(v)}×${cur.qty}` : yenFmt(v));
        listBtn.textContent = g.listing ? `価格変更（${per(y.price)}）` : `出品（${per(y.price)}）`;
        buyBtn.textContent = `即決買取（${per(y.quote)}）`;
        updateBulk();
      };
      const slider = (min, max, step, value, onInput) => h('input', { type: 'range', class: 'inv-range', min, max, step, value: String(value), oninput: (e) => { onInput(Number(e.target.value)); update(); } });
      listBtn.onclick = () => {
        const y = plan(g);
        const n = listUnits(s, y.uids, platform, y.price);
        pick.delete(g.key);
        done(n ? `${n}個を${PLATFORMS[platform].name}に${g.listing ? '出し直した' : '出品した'}` : '出品枠がいっぱいだ', n ? 'good' : 'bad');
      };
      buyBtn.onclick = () => {
        const y = plan(g);
        sellBack([{ uids: y.uids, quote: y.quote }]);
      };

      head.append(...[
        h('div', { class: 'inv-ctl' },
          h('div', { class: 'inv-line' }, h('span', {}, '値付け'), slider(0.5, 2, 0.05, cur.mult.toFixed(2), (v) => { cur.mult = v; }), priceLbl),
          h('div', { class: 'inv-sub' }, feelLbl, profitLbl),
          g.units.length > 1 ? h('div', { class: 'inv-line' }, h('span', {}, '個数'), slider(1, g.units.length, 1, cur.qty, (v) => { cur.qty = v; }), qtyLbl) : null,
          x.cap < Infinity ? h('div', { class: 'warn' }, `規制により、この販路では${yenFmt(x.cap)}までしか出品できない`) : null,
          !x.canHere ? h('div', { class: 'warn' }, banned(s, platform) ? `${PLATFORMS[platform].name}は停止中` : `${PLATFORMS[platform].name}には出品できない（${PLATFORMS[platform].cats ? (x.authFail ? '鑑定NGの品' : 'スニーカー・トレカだけ') : platform === 'exp' ? '輸出規制' : '新品だけ'}）`) : null,
        ),
        selecting
          ? null
          : h('div', { class: 'buy-row' },
            listBtn,
            buyBtn,
            g.listing ? h('button', { class: 'btn small', onclick: () => { unlistUnits(s, g.units.map((u) => u.uid)); done('取り下げた'); } }, '取り下げ') : null,
          ),
      ].filter(Boolean));
      update();
      return card;
    }
  }, { closeLabel: '閉じる' }).closed;
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
