// 仕入れ・販売まわりの画面（オファー、週の売上、在庫と出品、相場）
import { priceCap } from '../engine/regimes.js';
import { productImage, productOf, shipFor, shippingCost } from '../data/products.js';
import { weekLabel, yearOf } from '../engine/calendar.js';
import { flag, hasSkill } from '../engine/effects.js';
import {
  abroadMult, activeUnits, buybackQuote, capacity, feeRate, groupInventory, platformMult, platformOpen, hardCapacity, listedUnits, listingCap, listUnits, platformFee, platformsFor, PLATFORMS, sellToBuyer, unlistUnits, overCapacity, roomUsed, incomingSpace,
} from '../engine/inventory.js';
import { sizeLabel, sizeMult } from '../engine/shoes.js';
import { CLAIM_BUYERS, claimable, regOf, TAKEDOWN_RATE, unsellable } from '../engine/regulated.js';
import { CHECK_STAMINA, junkLabel, repairCost, repairRate, workOnJunk } from '../engine/junk.js';
import { confidenceLabel, estimateAt, estimateUnit, isReleased, isRetired, roundPrice, visibleProducts } from '../engine/market.js';
import { openLotteries } from '../engine/offers.js';
import { currentMission } from '../engine/tutorial.js';
import { heldDays, kpiLevel } from '../engine/kpi.js';
import { playSe } from './audio.js';
import { h, signYen, yenFmt } from './dom.js';
import { confirmBox, openModal, toast } from './modal.js';

const KIND_LABEL = {
  staple: '定番', hype: '限定', collect: 'コレクター', seasonal: '季節', perishable: '生もの', boom: 'ブーム', luxury: '高級', home: '家の不用品', kuji: 'くじ',
};

const itemIcon = (pid, rep = false) => h('img', { class: 'item-icon', src: productImage(productOf(pid), rep), alt: '' });
const canCalc = (s) => hasSkill(s, 'eye_calc');
const estLabel = (s) => (hasSkill(s, 'eye_market') ? '推定相場' : '相場（ざっくり）');

// 手数料と送料を引いた見込み利益（1個あたり）
export function expectedProfit(s, pid, sellPrice, cost, platform = 'merc') {
  const ship = shipFor(platform, productOf(pid));
  return Math.round(sellPrice - platformFee(s, platform, sellPrice) - ship - cost);
}

const profitText = (s, v) => (canCalc(s) ? h('span', { class: v >= 0 ? 'pos' : 'neg' }, `見込み ${signYen(v)}/個`) : h('span', { class: 'muted' }, '見込み利益 ？'));

function editionTag(s, u) {
  const p = productOf(u.pid);
  if (p.series) return isRetired(s, p) ? h('span', { class: 'tag bad' }, `第${p.gen}世代（型落ち）`) : h('span', { class: 'tag' }, `第${p.gen}世代`);
  if (p.kind !== 'hype' || !u.edition) return null;
  const cur = s.market[u.pid].edition;
  if (cur && u.edition < cur) return h('span', { class: 'tag bad' }, `${u.edition}年目モデル（旧型）`);
  return yearOf(s.week) > 1 ? h('span', { class: 'tag' }, `${u.edition}年目モデル`) : null;
}

// ---------------- 今週の売上 ----------------
// 週末レポートの見出し：受信トレイのいちばん上に、今週の取引をまとめて出す（メールと取引結果を1つの画面に）
export function salesSummary(s, step) {
  if (!step.sold.length) return null;
  const totalNet = step.sold.reduce((a, x) => a + x.net, 0);
  const totalProfit = step.sold.reduce((a, x) => a + x.profit, 0);
  const calc = canCalc(s);
  const best = [...step.sold].sort((a, b) => (calc ? b.profit - a.profit : b.price - a.price))[0];
  const late = step.sold.filter((x) => x.delayed).length;
  // 自己ベスト・初めての達成のスタンプ（利益が見えないうちは、利益のスタンプは出さない）
  const stamps = [
    ...(step.weekBest ? [{ label: '週の売上 自己ベスト' }] : []),
    ...step.sold.flatMap((x) => (x.stamps || []).filter((l) => calc || l !== '過去最高益').map((l) => ({ label: l, pid: x.pid }))),
  ].slice(0, 4);
  return h('div', { class: 'wk-sum' },
    h('div', { class: 'wk-head' }, h('small', {}, `${step.week}の取引`), h('span', {}, `${step.sold.length}件 売れた`)),
    h('div', { class: 'wk-main' },
      h('div', {}, h('small', {}, '売上金（週明けに入金）'), h('b', {}, yenFmt(totalNet))),
      calc ? h('div', {}, h('small', {}, '利益'), h('b', { class: totalProfit >= 0 ? 'pos' : 'neg' }, signYen(totalProfit))) : null),
    h('div', { class: 'wk-best' }, itemIcon(best.pid), h('span', {}, !calc ? 'いちばん高く売れた：' : best.profit > 0 ? 'いちばん儲かった：' : 'いちばん損が小さかった：', h('b', {}, productOf(best.pid).name)), h('em', { class: calc && best.profit <= 0 ? 'neg' : '' }, calc ? signYen(best.profit) : yenFmt(best.price))),
    stamps.length ? h('div', { class: 'wk-stamps' }, ...stamps.map((x) => h('div', { class: 'wk-stamp' }, h('b', {}, x.label), x.pid ? h('small', {}, productOf(x.pid).name) : null))) : null,
    h('div', { class: 'wk-notes' },
      step.staminaUsed ? h('span', {}, `梱包・発送で体力 -${step.staminaUsed}`) : null,
      step.outsourced ? h('span', {}, `外注が${step.outsourced}件発送`) : null,
      step.staffShipped ? h('span', {}, `スタッフが${step.staffShipped}件発送`) : null,
      late ? h('span', { class: 'neg' }, `体力が足りず${late}件の発送が遅れた（評価ダウン）`) : null),
  );
}

// ---------------- 在庫と出品 ----------------
// 操作を最小に：上のタブで売り先を選び、商品ごとにスライダーで値付けと個数を決めて、ボタン1つで出品／即決買取
let market = 'merc'; // 前回選んだ売り先を覚えておく
const feelOf = (ratio) => (ratio <= 0.92 ? 'すぐ売れそう' : ratio <= 1.05 ? '相場どおり' : ratio <= 1.2 ? 'やや強気' : '売れにくそう');
const banned = (s, id) => (id === 'merc' && s.banWeeks > 0) || (id === 'ama' && s.amaBan > 0);
// 一覧の絞り込み・並べ替え・表示の詰め方（開き直しても覚えておく）
let invFilter = 'all';
let invSort = 'rec';
const VIEW_KEY = '10buy-year:invView';
const loadView = () => {
  try {
    return window.localStorage.getItem(VIEW_KEY);
  } catch {
    return null;
  }
};
const saveView = (v) => {
  try {
    window.localStorage.setItem(VIEW_KEY, v);
  } catch {
    /* noop */
  }
};
const COMPACT_FROM = 8; // 品がこれ以上あれば、はじめは1行1品で並べる
const SORTS = [['rec', 'おすすめ順'], ['profit', '見込み利益順'], ['days', '在庫日数順'], ['over', '割高な出品順']];

export function inventoryModal(s, onChange) {
  const pick = new Map(); // グループごとの { mult, qty }
  const selected = new Set(); // まとめて操作する商品（グループのキー）
  const expanded = new Set(); // 1行表示のうち、カードに広げている商品
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
    const allGroups = groupInventory(s);
    allGroups.sort((x, y) => (x.listing ? 1 : 0) - (y.listing ? 1 : 0)); // 出品していない物を上に
    for (const key of [...selected]) if (!allGroups.some((g) => g.key === key)) selected.delete(key);
    // 絞り込み（未出品・出品中・90日以上）
    const isStale = (g) => g.arrive <= s.week && heldDays(s, g.units[0]) >= 90;
    const FILTERS = [
      ['all', 'すべて', () => true],
      ['unlisted', '未出品', (g) => !g.listing],
      ['listed', '出品中', (g) => !!g.listing],
      ['stale', '90日以上', isStale],
    ];
    if (!FILTERS.some(([id]) => id === invFilter)) invFilter = 'all';
    const groups = allGroups.filter(FILTERS.find(([id]) => id === invFilter)[2]);
    // チュートリアルで出品ボタンを指しているあいだは、いつものカードで見せる
    const tutList = ['list_home', 'list_bought'].includes(currentMission(s)?.id);
    const compact = !tutList && (loadView() || (allGroups.length >= COMPACT_FROM ? 'compact' : 'card')) === 'compact';

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
        blocked: (p.alcohol && flag(s, 'noAlcohol')) || (unsellable(g.pid) && !s.underworld),
        authFail: g.authFail,
        canHere: platformsFor(s, u0).some((m) => m.id === platform) && !banned(s, platform),
      };
    }

    // 並べ替え
    const unitProfit = (g) => { const x = plan(g); return expectedProfit(s, g.pid, g.listing ? g.listing.price : x.est, g.cost, x.platform); };
    const sortKey = {
      profit: (g) => -unitProfit(g) * g.units.length,
      days: (g) => -heldDays(s, g.units[0]),
      over: (g) => (g.listing ? -(g.listing.price / Math.max(1, plan(g).est)) : 0),
    }[invSort];
    if (sortKey) groups.sort((a, b) => sortKey(a) - sortKey(b));

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
        h('span', { class: overCapacity(s) ? 'neg' : '' }, `置き場 ${roomUsed(s)}/${capacity(s)}${incomingSpace(s) ? `（届く予定 +${incomingSpace(s)}）` : ''}（限界${hardCapacity(s)}）`),
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
      // 絞り込みのチップと、並べ替え・表示の切りかえ
      allGroups.length > 1
        ? h('div', { class: 'inv-tools' },
          h('div', { class: 'inv-filters' }, ...FILTERS.map(([id, label, f]) => {
            const n = allGroups.filter(f).length;
            return h('button', { class: `inv-chip ${invFilter === id ? 'on' : ''}`, disabled: !n && id !== 'all', onclick: () => { invFilter = id; api.refresh(); } }, label, h('small', {}, n));
          })),
          h('div', { class: 'inv-tools-r' },
            h('select', { class: 'inv-sort', 'aria-label': '並べ替え', onchange: (e) => { invSort = e.target.value; api.refresh(); } },
              ...SORTS.map(([id, label]) => h('option', { value: id, selected: invSort === id }, label))),
            tutList ? null : h('button', { class: 'inv-view', 'aria-label': compact ? 'カードで表示' : '1行ずつ表示', title: compact ? 'カードで表示' : '1行ずつ表示', onclick: () => { saveView(compact ? 'card' : 'compact'); expanded.clear(); api.refresh(); } }, compact ? '▦' : '☰'),
          ))
        : null,
    ].filter(Boolean));

    // ワンタップの一括操作：未出品を相場で出品／出品中を5%値下げ／90日以上の在庫を買取
    if (!selecting && allGroups.length) {
      const ready = (g) => { const x = plan(g); return !x.waiting && !x.blocked && x.canHere; };
      const unlisted = allGroups.filter((g) => !g.listing && ready(g));
      const listed = allGroups.filter((g) => g.listing);
      const stale = allGroups.filter(isStale);
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

    if (!allGroups.length) body.append(h('p', { class: 'empty' }, s.stats.purchases ? '在庫はない。仕入れに行こう。' : '在庫はない。「家の中を探す」で不用品を探そう。'));
    else if (!groups.length) body.append(h('p', { class: 'empty' }, 'この条件の品はない。'));
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
    for (const g of groups) body.append(compact && !expanded.has(g.key) ? compactRow(g) : itemRow(g));

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

    // 1行1品：絵・名前と個数・状態（出品中の値段／未出品／届く日）・在庫日数・見込み利益。タップでカードに広げる
    function compactRow(g) {
      const p = productOf(g.pid);
      const x = plan(g);
      const days = heldDays(s, g.units[0]);
      const on = selected.has(g.key);
      const status = x.waiting
        ? h('span', { class: 'ir-st wait' }, `${weekLabel(g.arrive)}に届く`)
        : g.listing
          ? h('span', { class: 'ir-st listed' }, `${PLATFORMS[g.listing.platform].name} ${yenFmt(g.listing.price)}`)
          : h('span', { class: 'ir-st' }, x.blocked ? '出品できない' : '未出品');
      const profit = canCalc(s) && !x.waiting ? unitProfit(g) : null;
      const row = h('div', {
        class: `inv-row ${g.listing ? 'listed' : ''} ${on ? 'selected' : ''}`,
        role: 'button',
        tabindex: 0,
        onclick: () => {
          if (selecting) {
            if (!x.waiting) toggle(g.key);
            return;
          }
          expanded.add(g.key);
          api.refresh();
        },
        onkeydown: (e) => { if (e.key === 'Enter') e.currentTarget.click(); },
      },
      itemIcon(g.pid, g.rep),
      h('div', { class: 'ir-main' },
        h('div', { class: 'ir-name' }, p.name, h('small', {}, ` ×${g.units.length}`)),
        h('div', { class: 'ir-sub' }, status, !x.waiting && kpiLevel(s) >= 2 ? h('span', { class: days >= 90 ? 'neg' : '' }, `${days}日`) : null, g.damaged || g.authFail ? h('span', { class: 'neg' }, g.authFail ? '鑑定NG' : '傷あり') : null)),
      h('div', { class: 'ir-r' },
        h('small', {}, x.waiting ? '' : `${estLabel(s) === '推定相場' ? '相場' : '相場≒'} ${yenFmt(x.est)}`),
        profit === null ? null : h('b', { class: profit >= 0 ? 'pos' : 'neg' }, `${signYen(profit)}/個`)),
      selecting && !x.waiting ? h('span', { class: `sel-dot ${on ? 'on' : ''}` }, '✓') : h('span', { class: 'ir-more', 'aria-hidden': 'true' }, '›'));
      return row;
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
          g.rep ? h('span', { class: 'tag' }, '再販版') : null,
          g.listing?.claim ? h('span', { class: 'tag bad' }, '効能をうたって出品中') : null,
          g.junk ? h('span', { class: `tag ${g.junk.checked && g.junk.state === 'works' ? 'good' : 'bad'}` }, junkLabel(g.units[0])) : null,
          g.shoe ? h('span', { class: `tag ${sizeMult(g.shoe) > 1 ? 'good' : sizeMult(g.shoe) < 0.9 ? 'bad' : ''}` }, sizeLabel(g.shoe)) : null,
          market === 'exp' && !g.listing && abroadMult(s, g.units[0]) >= 1.1 ? h('span', { class: 'tag good' }, `海外なら相場×${abroadMult(s, g.units[0]).toFixed(1)}`) : null,
          g.expire !== null && g.expire !== undefined ? h('span', { class: 'tag bad' }, `賞味期限 ${weekLabel(g.expire)}まで`) : null,
          x.waiting ? h('span', { class: 'tag' }, `${u0.imported ? '国際便・' : ''}${weekLabel(g.arrive)}に届く`) : null,
          !x.waiting && kpiLevel(s) >= 2 ? h('span', { class: `tag ${days >= 90 ? 'bad' : ''}` }, `在庫${days}日`) : null,
          listedOn ? h('span', { class: 'tag good' }, `${listedOn.name}に出品中 ${yenFmt(g.listing.price)}`) : null,
        ),
        h('div', { class: 'nums' },
          h('span', {}, g.home ? '仕入れ 0円' : `仕入れ ${yenFmt(g.cost)}`),
          h('span', {}, `${estLabel(s)} ${yenFmt(est)}`),
        ),
      );
      const iconBox = h('div', { class: 'inv-icon' },
        itemIcon(g.pid, g.rep),
        x.waiting ? null : h('button', { class: `sel-dot ${on ? 'on' : ''}`, 'aria-label': on ? '選択を外す' : '選択', onclick: (e) => { e.stopPropagation(); toggle(g.key); } }, '✓'),
      );
      const card = h('div', { class: `card inv ${g.listing ? 'listed' : ''} ${on ? 'selected' : ''} ${selecting ? 'selecting' : ''}` }, iconBox, head,
        compact ? h('button', { class: 'inv-fold', 'aria-label': 'たたむ', onclick: () => { expanded.delete(g.key); api.refresh(); } }, '▲') : null);
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

      // ジャンク品：出品していないものは、動作確認・修理ができる（engine/junk.js）
      if (g.junk && !g.listing && !selecting && (!g.junk.checked || g.junk.state === 'fix')) {
        const label = g.junk.checked ? `修理する（部品代 ${yenFmt(repairCost(g.pid))}・成功率 約${Math.round(repairRate(s) * 100)}%）` : `動作確認する（体力-${CHECK_STAMINA}）`;
        head.append(h('div', { class: 'buy-row' }, h('button', {
          class: 'btn small',
          onclick: () => {
            const r = workOnJunk(s, g.units[0]);
            done(r.msg, r.ok && r.state === 'works' ? 'good' : r.ok && r.state === 'fix' ? '' : 'bad');
          },
        }, label)));
      }
      if (x.blocked) {
        const reg = regOf(g.pid);
        head.append(h('div', { class: 'warn' }, reg ? `${reg.name}は出品できない（${reg.law}）：${reg.rule}` : '酒類は出品できない（免許なし）'));
        if (!selecting) head.append(h('div', { class: 'buy-row' }, h('button', { class: 'btn danger inv-buy', onclick: () => sellBack([{ uids: g.units.map((u) => u.uid), quote: x.quote }]) }, x.quote ? `即決買取（${yenFmt(x.quote * g.units.length)}）` : '処分する（買取 0円）')));
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
        const n = listUnits(s, y.uids, platform, y.price, { claim: !!cur.claim });
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
          // 化粧品・サプリ：説明文で効能をうたうか（薬機法。engine/regulated.js）
          claimable(g.pid) && platform === 'merc'
            ? h('label', { class: 'inv-claim' }, h('input', { type: 'checkbox', checked: !!cur.claim, onchange: (e) => { cur.claim = e.target.checked; } }),
              h('span', {}, '説明文で効能をうたう', h('small', {}, `買い手×${CLAIM_BUYERS}。ただし薬機法違反で、毎週${Math.round(TAKEDOWN_RATE * 100)}%で削除と警告`)))
            : null,
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

// タブ（ニュース／持っている品／すべて）と並べ替え。開き直しても覚えておく
let mkTab = null;
let mkSort = 'rec';
export function marketModal(s) {
  const rows = () => visibleProducts(s).filter((x) => x.kind !== 'home').map((p) => {
    const m = s.market[p.id];
    const n = m.hist.length;
    const series = m.hist.map((v, i) => estimateAt(s, p.id, s.week - (n - 1 - i), v));
    const cur = series[series.length - 1];
    const prev = series[series.length - 2] ?? cur;
    return { p, m, series, cur, diff: cur - prev, pct: prev ? (cur - prev) / prev : 0, held: activeUnits(s).filter((u) => u.pid === p.id).length };
  });
  return openModal('相場・ニュース', (body, api) => {
    const all = rows();
    const heldN = all.filter((r) => r.held).length;
    if (!mkTab) mkTab = heldN ? 'held' : 'all'; // 持っている品の上がり下がりを先に
    const tabs = [['news', `ニュース ${s.news.length}`], ['held', `持っている品 ${heldN}`], ['all', `すべて ${all.length}`]];
    body.append(h('div', { class: 'mk-tabs mkt-tabs' }, ...tabs.map(([id, label]) => h('button', { class: `mk-tab ${mkTab === id ? 'on' : ''}`, onclick: () => { mkTab = id; api.refresh(); } }, label))));
    if (mkTab === 'news') {
      if (s.news.length) body.append(h('div', { class: 'news-list' }, ...s.news.map((x) => h('div', { class: `news ${x.kind}` }, x.text))));
      else body.append(h('p', { class: 'empty' }, '今週のニュースはない。'));
      const lots = hasSkill(s, 'src_lottery') ? openLotteries(s) : [];
      if (lots.length) body.append(h('p', { class: 'note' }, `抽選受付中：${lots.map((p) => `「${p.name}」`).join('')}`));
      return;
    }
    body.append(h('div', { class: 'mkt-bar' },
      h('small', { class: 'note' }, `推定相場の確度：${confidenceLabel(s)}`),
      h('select', { class: 'inv-sort', 'aria-label': '並べ替え', onchange: (e) => { mkSort = e.target.value; api.refresh(); } },
        ...[['rec', '標準'], ['up', '値上がり順'], ['down', '値下がり順']].map(([id, label]) => h('option', { value: id, selected: mkSort === id }, label)))));
    let list = mkTab === 'held' ? all.filter((r) => r.held) : all;
    if (mkSort === 'up') list = [...list].sort((a, b) => b.pct - a.pct);
    if (mkSort === 'down') list = [...list].sort((a, b) => a.pct - b.pct);
    if (!list.length) body.append(h('p', { class: 'empty' }, '持っている品はない。'));
    for (const { p, m, series, cur, diff, held } of list) {
      const released = isReleased(s, p);
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
