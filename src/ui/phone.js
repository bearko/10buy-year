// 夜のスマホ（電脳せどり）。フリマ・オークション・通販モール・海外通販のアプリを渡り歩いて仕入れる。
// 実際の電脳せどりでよくやる操作を体験できるようにしている：
// ・保存した検索の新着通知や在庫復活の通知から、すぐに商品ページへ飛ぶ（安い出品はすぐ売れる）
// ・「売り切れ」で検索して、最近売れた値段から相場を確かめる
// ・コメントで値下げ交渉する（断られる・ブロックされることも）
// ・オークションは上限額を決めて自動入札。自動延長がなければ、終了間際の入札でライバルを出し抜ける
// 行動するたびに時計が進み、深夜1時を過ぎたら寝る（夜更かしは来週の体力に響く）
import { portraitOf } from '../data/cast.js';
import { productImage, productOf } from '../data/products.js';
import { weekLabel } from '../engine/calendar.js';
import { cardAvailable } from '../engine/inventory.js';
import { addFamily } from '../engine/family.js';
import {
  ADS, APPS, appOf, bidStep, hhmm, LATE_EXTRA, LATE_STAMINA, NEGO_OPTIONS, negotiate, PHONE_COST, settleAuction, soldHistory, getPhoneSessionTime,
} from '../engine/sourcing.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { toast } from './modal.js';
import { soldList } from './storerun.js';

const yen = (n) => `¥${Math.round(n).toLocaleString('ja-JP')}`;
const dur = (x) => {
  const m = Math.max(0, Math.ceil(x));
  return m >= 60 ? `${Math.floor(m / 60)}時間${m % 60}分` : `${m}分`;
};

export function phoneMode(ctx) {
  const { s, step } = ctx;
  const run = step.run;

  // 21:00〜深夜1時を実時間で流す。スキルで実時間が延びる（＝時計がゆっくり進む）
  const rate = (run.end - run.start) / getPhoneSessionTime(s); // ゲーム内の分／実時間の秒

  let now = run.start;
  let late = false;
  let app = 'home';
  let prompt = null; // 'late'：深夜1時の確認
  let done = false;
  let settling = false; // オークションの決着で買うときは、購入の時間を足さない
  let loopId = null;
  let last = 0;
  let notesShown = false; // 通知が落ちてくる演出は最初の1回だけ
  const sort = { flea: 'new', auction: 'end', mall: 'pt', shady: 'new' };
  const bids = new Map(); // oid -> { max, snipe }
  const bidDraft = new Map(); // oid -> 入力中の上限額
  const results = []; // 寝る前に見る今夜のまとめ
  const negoLog = new Map(); // oid -> [{ q, a }]
  const ads = [...ADS].sort(() => Math.random() - 0.5);
  const offers = step.offers;
  const byApp = (a) => offers.filter((o) => (o.unknown ? 'flea' : appOf(o)) === a);
  const limit = () => run.end + (late ? LATE_EXTRA : 0);
  const avail = (o) => !o.gone && !o.unknown && o.maxQty >= (o.minQty || 1) && !(o.auction?.done);

  // 画面は作り直さず、時計まわりの文字だけ書き換える。品切れ・落札など中身が変わったときだけ描き直す
  function loop() {
    const t = performance.now();
    const dt = Math.min(1, (t - last) / 1000); // バックグラウンドから戻っても一気に進めない
    last = t;
    if (done || prompt || document.hidden) return;
    now += dt * rate;
    if (app === 'home' && !ctx.isOpen()) slideBanner(dt);
    const changed = tick();
    const o = ctx.isOpen();
    // 商品ページを開いている間は、その商品が変わったときだけ描き直す（入力中の上限額などを消さない）
    if (changed && (!o || changed.has(o) || prompt || done)) ctx.render();
    else updateClock();
  }
  function updateClock() {
    const root = ctx.root;
    const set = (sel, text) => { const el = root.querySelector(sel); if (el) el.textContent = text; };
    set('.ph-status b', hhmm(now));
    set('.ph-lock:not(.night) b', hhmm(now));
    const bed = root.querySelector('.ph-bed');
    if (bed && !done) { bed.textContent = `寝るまで ${dur(limit() - now)}`; bed.classList.toggle('low', limit() - now <= 30); }
    set('.ph-batt', `4G ${battery()}%`);
    for (const el of root.querySelectorAll('[data-ends]')) el.textContent = dur(Number(el.dataset.ends) - now);
  }
  const battery = () => Math.max(5, 92 - Math.round((now - run.start) / 4));

  // ---- 時計 ----
  // 状態が変わった商品の集まりを返す（何も変わらなければ null）
  function tick() {
    const changed = new Set();
    for (const o of offers) {
      if (o.life != null && !o.gone && o.maxQty >= (o.minQty || 1) && now - run.start >= o.life) { o.gone = true; changed.add(o); }
      if (o.auction && !o.auction.done && now >= o.auction.endsAt) { settle(o); changed.add(o); }
    }
    if (now >= limit() && !done) {
      if (!late) prompt = 'late';
      else finish();
    }
    return changed.size || prompt || done ? changed : null;
  }
  function spend(min) {
    now += min;
    tick();
  }
  const canAct = () => !done && now < limit();

  // ---- オークションの決着 ----
  function settle(o, { asleep = false } = {}) {
    const a = o.auction;
    const bid = bids.get(o.oid);
    if (!bid || (bid.snipe && asleep)) {
      a.done = 'over';
      if (bid) results.push({ text: `${productOf(o.pid).name}：寝てしまい、終了間際の入札ができなかった`, bad: true });
      return;
    }
    const r = settleAuction(o, bid.max, { snipe: bid.snipe });
    a.cur = r.final;
    if (!r.won) {
      a.done = 'lost';
      results.push({ text: `${productOf(o.pid).name}：${yen(r.final)}で競り負けた`, bad: true });
      return;
    }
    o.price = r.final;
    a.done = 'won'; // 先に決着をつける（買うときに時計が進んでも、二重に落札しないように）
    settling = true;
    const method = s.cash >= r.final ? 'cash' : 'card';
    const res = ctx.doBuy(o, 1, method, { quiet: true });
    settling = false;
    if (!res.ok) a.done = 'unpaid';
    if (res.ok) {
      s.stats.aucWins = (s.stats.aucWins || 0) + 1;
      s.stats.phoneBuys = (s.stats.phoneBuys || 0) + 1;
      results.push({ text: `${productOf(o.pid).name}：${yen(r.final)}で落札！${bid.snipe && !a.extend ? '（終了間際の入札が決まった）' : ''}`, good: true });
      playSe('win');
    } else {
      s.rating = Math.max(0, s.rating - 3);
      results.push({ text: `${productOf(o.pid).name}：落札したのに支払えない（${res.msg}）。評価が下がった`, bad: true });
    }
  }

  function finish() {
    if (done) return;
    clearInterval(loopId);
    // 寝ている間に終わるオークション（ふつうの入札は上限額のまま自動で競る。終了間際の入札はできない）
    for (const o of offers) if (o.auction && !o.auction.done) settle(o, { asleep: true });
    done = true;
    prompt = null;
  }

  // ---- 画面の部品 ----
  function statusBar() {
    return h('div', { class: 'ph-status' },
      h('b', {}, hhmm(now)),
      h('span', { class: `ph-bed ${limit() - now <= 30 ? 'low' : ''}` }, done ? 'おやすみ' : `寝るまで ${dur(limit() - now)}`),
      h('span', { class: 'ph-batt' }, `4G ${battery()}%`),
    );
  }

  function nav() {
    const tab = (id, label, color) => h('button', { class: `ph-tab ${app === id ? 'on' : ''}`, style: { '--c': color }, onclick: () => { app = id; ctx.render(); } },
      h('i', {}, label.slice(0, 1)), h('small', {}, label),
      id !== 'home' && byApp(id).filter(avail).length ? h('em', {}, byApp(id).filter(avail).length) : null);
    return h('nav', { class: 'ph-nav' },
      tab('home', 'ホーム', '#555'),
      ...Object.entries(APPS).filter(([id]) => byApp(id).length).map(([id, a]) => tab(id, a.name, a.color)));
  }

  function wasteAd() {
    if (!canAct()) return;
    spend(PHONE_COST.ad);
    toast(`広告を開いてしまった…（${PHONE_COST.ad}分ムダにした）`, 'bad');
    ctx.render();
  }

  function adBanner(i = 0) {
    const ad = ads[i % ads.length];
    return h('button', { class: 'ph-ad', onclick: wasteAd },
      h('img', { src: portraitOf(ad.who, 'idle'), alt: '' }),
      h('div', {}, h('small', {}, '広告'), h('b', {}, ad.title), h('span', {}, ad.text)));
  }

  // ホームのバナー：今夜の出品から作る。タップでその商品・アプリへ。最後の1枚は広告（開くと時間をムダにする）
  const goApp = (id) => { app = id; ctx.render(); };
  const banners = (() => {
    const out = [];
    const ok = (o) => !o.unknown && !o.filler;
    const pre = offers.find((o) => ok(o) && o.source === 'preorder');
    if (pre) out.push({ app: 'mall', title: '予約受付スタート', text: productOf(pre.pid).name, pid: pre.pid, go: () => open(pre) });
    const back = offers.find((o) => ok(o) && o.label?.includes('在庫復活'));
    if (back) out.push({ app: 'mall', title: '在庫復活・数量限定', text: productOf(back.pid).name, pid: back.pid, go: () => open(back) });
    const pts = Math.max(0, ...byApp('mall').map((o) => o.points || 0));
    if (pts >= 0.05) out.push({ app: 'mall', title: '今夜はポイントアップ', text: `最大${Math.round(pts * 100)}%還元・エントリー不要`, go: () => goApp('mall') });
    const aucs = byApp('auction').filter((o) => !o.auction.done).sort((x, y) => x.auction.endsAt - y.auction.endsAt);
    if (aucs.length) out.push({ app: 'auction', title: 'まもなく終了', text: `${productOf(aucs[0].pid).name}${aucs.length > 1 ? ` ほか${aucs.length - 1}件` : ''}`, pid: aucs[0].pid, go: () => goApp('auction') });
    const flea = byApp('flea').filter(ok);
    if (flea.length) out.push({ app: 'flea', title: '保存した検索に新着', text: `${productOf(flea[0].pid).genre} など${flea.length}件`, pid: flea[0].pid, go: () => goApp('flea') });
    const ad = ads[ads.length - 1];
    out.push({ ad: true, title: ad.title, text: ad.text, who: ad.who, go: wasteAd });
    return out;
  })();
  let bannerIdx = 0;
  let bannerWait = 0; // 自動で次のバナーへ送るまでの秒数

  function bannerView() {
    const track = h('div', { class: 'ph-banners' }, ...banners.map((b) => h('div', { class: 'ph-slide' },
      h('button', { class: `ph-banner ${b.ad ? 'ad' : ''}`, style: { '--c': b.ad ? '#a08020' : APPS[b.app].color }, onclick: b.go },
        h('div', { class: 'ph-banner-t' }, h('small', {}, b.ad ? '広告' : APPS[b.app].name), h('b', {}, b.title), h('span', {}, b.text)),
        b.pid ? h('img', { src: productImage(productOf(b.pid)), alt: '' }) : b.who ? h('img', { src: portraitOf(b.who, 'idle'), alt: '' }) : null))));
    const dots = h('div', { class: 'ph-dots' }, ...banners.map((_, i) => h('i', { class: i === bannerIdx ? 'on' : '' })));
    track.addEventListener('scroll', () => {
      bannerIdx = Math.round(track.scrollLeft / Math.max(1, track.clientWidth));
      [...dots.children].forEach((d, i) => d.classList.toggle('on', i === bannerIdx));
    }, { passive: true });
    track.addEventListener('pointerdown', () => { bannerWait = -4; }); // 指で送ったら、しばらく自動で送らない
    requestAnimationFrame(() => { track.scrollLeft = bannerIdx * track.clientWidth; });
    return h('div', { class: 'ph-carousel' }, track, dots);
  }
  function slideBanner(dt) {
    bannerWait += dt;
    if (bannerWait < 4) return;
    bannerWait = 0;
    const track = ctx.root.querySelector('.ph-banners');
    if (!track) return;
    bannerIdx = (bannerIdx + 1) % banners.length;
    track.scrollTo({ left: bannerIdx * track.clientWidth, behavior: 'smooth' });
  }

  function open(o) {
    if (!canAct()) return;
    spend(PHONE_COST.open);
    ctx.openItem(o);
  }

  // ---- ホーム（ロック画面と通知） ----
  function homeView() {
    const body = h('div', { class: 'shop-body ph-home' });
    body.append(
      h('div', { class: 'ph-lock' }, h('b', {}, hhmm(now)), h('small', {}, `${weekLabel(s.week)}の夜`)),
      ctx.wallet(),
    );

    body.append(bannerView());

    if (step.autoBought?.length) body.append(h('div', { class: 'shop-auto' }, h('b', {}, '外注が自動で仕入れた'), ...step.autoBought.map((m) => h('div', {}, m))));

    const notes = run.notices.map((n) => ({ ...n, o: offers.find((o) => o.oid === n.oid) })).filter((n) => n.o);
    if (notes.length) {
      body.append(h('div', { class: `ph-notes ${notesShown ? 'still' : ''}` }, h('p', { class: 'ph-section-title' }, '新着通知'), ...notes.map((n) => {
        const a = APPS[n.app];
        const gone = !avail(n.o);
        return h('button', { class: `ph-note ${gone ? 'gone' : ''}`, style: { '--c': a.color }, onclick: () => open(n.o) },
          h('div', { class: 'ph-note-h' }, h('i', {}, a.name.slice(0, 1)), h('b', {}, a.name), h('small', {}, gone ? '売り切れ' : `${Math.max(1, (n.o.posted || 5) % 20)}分前`)),
          h('div', {}, n.text));
      })));
      notesShown = true;
    } else body.append(h('p', { class: 'ph-empty' }, '新しい通知はない。アプリを開いて探そう。'));

    body.append(h('p', { class: 'ph-section-title' }, 'アプリ'), h('div', { class: 'ph-apps' },
      ...Object.entries(APPS).filter(([id]) => byApp(id).length).map(([id, a]) =>
        h('button', { class: 'ph-app', style: { '--c': a.color }, onclick: () => { app = id; ctx.render(); } },
          h('i', {}, a.name.slice(0, 1)), h('b', {}, a.name), h('small', {}, a.sub)))));

    body.append(adBanner(0));
    if (results.length) body.append(resultsBox());
    return [body, h('div', { class: 'shop-footer ph-foot' }, h('button', { class: 'btn shop-done', onclick: () => { finish(); ctx.render(); } }, 'スマホを置いて寝る'))];
  }

  function resultsBox() {
    return h('div', { class: 'ph-results' }, h('b', {}, '今夜の結果'), ...results.map((r) => h('div', { class: r.good ? 'pos' : r.bad ? 'neg' : '' }, r.text)));
  }

  // ---- 各アプリの一覧 ----
  function appView() {
    const a = APPS[app];
    const list = byApp(app).slice();
    const key = sort[app];
    if (key === 'cheap') list.sort((x, y) => x.price - y.price);
    else if (key === 'new') list.sort((x, y) => (x.posted || 0) - (y.posted || 0));
    else if (key === 'end') list.sort((x, y) => (x.auction?.endsAt || 0) - (y.auction?.endsAt || 0));
    else if (key === 'pt') list.sort((x, y) => (y.points || 0) - (x.points || 0));
    const sorts = {
      flea: [['new', '新しい順'], ['cheap', '価格の安い順']],
      auction: [['end', '終了が近い順'], ['cheap', '現在価格の安い順']],
      mall: [['pt', 'ポイント還元順'], ['cheap', '価格の安い順']],
      shady: [['new', 'おすすめ'], ['cheap', '激安順']],
    }[app];
    const head = h('header', { class: `ph-apphead ${app}`, style: { '--c': a.color } },
      h('b', {}, a.name),
      h('div', { class: 'ph-search' }, h('span', {}, '🔍'), h('span', {}, app === 'mall' ? 'セール・在庫あり' : app === 'auction' ? 'ウォッチリスト・保存した検索' : '保存した検索・販売中のみ')),
      h('div', { class: 'ph-sorts' }, ...sorts.map(([k, l]) => h('button', { class: key === k ? 'on' : '', onclick: () => { sort[app] = k; ctx.render(); } }, l))));
    const body = h('div', { class: `shop-body ph-list ${app}` });

    // プロモーション表示（アプリごと）
    if (app === 'mall') body.append(h('div', { class: 'ph-promo' }, h('b', {}, '本日ポイントアップ！'), h('span', {}, '最大15%還元・エントリー不要')));
    if (app === 'auction') body.append(h('div', { class: 'ph-promo auction' }, h('b', {}, '終了間際は狙い目'), h('span', {}, '最後の数分で値上がり幅が決まる')));
    if (app === 'shady') body.append(h('div', { class: 'ph-promo shady' }, h('b', {}, '★超激安★全品90%OFF★'), h('span', {}, '本物保証です！安心の取引！')));

    if (!list.length) body.append(h('p', { class: 'ph-empty' }, '該当する商品はありません'));

    // 全アプリ共通：グリッド表示
    const grid = h('div', { class: 'ph-grid' });
    list.forEach((o, i) => {
      if (o.unknown) {
        grid.append(ctx.gridItem(o));
      } else if (app === 'auction') {
        grid.append(aucCard(o));
      } else if (app === 'mall') {
        grid.append(mallCard(o));
      } else {
        grid.append(tile(o));
      }
      if (i === 5) grid.append(adBanner(1));
    });
    body.append(grid);
    return [head, body];
  }

  function tile(o) {
    const p = productOf(o.pid);
    const sold = !avail(o);
    return h('button', { class: `ph-tile ${sold ? 'sold' : ''}`, onclick: () => open(o) },
      h('div', { class: 'ph-img' }, h('img', { src: productImage(p, o.rep), alt: '' }),
        h('span', { class: 'ph-price' }, yen(o.price)),
        sold ? h('span', { class: 'sh-sold' }, 'SOLD') : null,
        o.negotiated === 'ok' ? h('span', { class: 'ph-badge' }, '専用') : null),
      h('div', { class: 'ph-name' }, p.name),
      h('div', { class: 'ph-sub' }, o.listing?.likes ? `♡${o.listing.likes}` : '', ` ${o.posted ? `${o.posted}分前` : ''}`));
  }

  function aucCard(o) {
    const p = productOf(o.pid);
    const a = o.auction;
    const bid = bids.get(o.oid);
    const state = a.done ? { won: '落札', lost: '落札できず', over: '終了', unpaid: '支払えず' }[a.done] : bid ? (bid.snipe ? '終了間際に入札予定' : bid.max > a.rivalMax ? '最高額入札者' : '高値更新された') : '';
    const good = a.done === 'won' || state === '最高額入札者';
    return h('button', { class: `ph-tile auc ${a.done ? 'sold' : ''}`, onclick: () => open(o) },
      h('div', { class: 'ph-img' }, h('img', { src: productImage(p, o.rep), alt: '' }),
        h('span', { class: 'ph-price' }, yen(a.cur)),
        a.done ? h('span', { class: 'sh-sold' }, state) : null),
      h('div', { class: 'ph-name' }, p.name),
      h('div', { class: 'ph-sub' }, `入札${a.bids}・`, a.done ? '終了' : h('em', { class: 'neg' }, '残り', h('span', { 'data-ends': a.endsAt }, dur(a.endsAt - now))), a.extend ? '' : '・延長なし'),
      state && !a.done ? h('div', { class: 'ph-sub' }, h('em', { class: good ? 'pos' : 'neg' }, state)) : null);
  }

  function mallCard(o) {
    const p = productOf(o.pid);
    const sold = !avail(o);
    return h('button', { class: `ph-tile mall ${sold ? 'sold' : ''}`, onclick: () => open(o) },
      h('div', { class: 'ph-img' }, h('img', { src: productImage(p, o.rep), alt: '' }),
        h('span', { class: 'ph-price' }, yen(o.price)),
        o.points ? h('span', { class: 'ph-pt' }, `+${Math.round(o.points * 100)}%`) : null,
        sold ? h('span', { class: 'sh-sold' }, '在庫切れ') : null),
      h('div', { class: 'ph-name' }, p.name),
      h('div', { class: 'ph-sub' }, o.label || 'モール品', o.life != null && !sold ? h('em', { class: 'neg' }, ' 在庫わずか') : null));
  }

  // ---- 深夜1時 ----
  function lateLayer() {
    if (prompt !== 'late') return null;
    return h('div', { class: 'ph-late' },
      h('div', { class: 'ph-late-box' },
        h('b', {}, `もう${hhmm(now)}だ…`),
        h('p', {}, '明日も仕入れと発送がある。そろそろ寝ないと。'),
        h('button', { class: 'btn primary', onclick: () => { finish(); ctx.render(); } }, '寝る'),
        h('button', { class: 'btn', onclick: () => { late = true; prompt = null; s.stamina = Math.max(0, s.stamina - LATE_STAMINA); addFamily(s, -2); toast(`夜更かし…体力 -${LATE_STAMINA}`, 'bad'); ctx.onChange?.(); ctx.render(); } }, `夜更かしする（あと${LATE_EXTRA}分・体力 -${LATE_STAMINA}）`)));
  }

  function doneView() {
    const body = h('div', { class: 'shop-body ph-home' });
    body.append(h('div', { class: 'ph-lock night' }, h('b', {}, hhmm(now)), h('small', {}, 'スマホを置いた。おやすみ…')));
    body.append(results.length ? resultsBox() : h('p', { class: 'ph-empty' }, 'オークションの結果はない'));
    return [body, h('div', { class: 'shop-footer ph-foot' }, h('button', { class: 'btn primary shop-done', onclick: () => ctx.close() }, '寝る'))];
  }

  // ---- 商品ページの追加の欄 ----
  function researchSec(o) {
    return ctx.section('売り切れを検索して相場を調べる', o.soldHist
      ? soldList(o)
      : h('button', { class: 'qa-ask', disabled: !canAct(), onclick: () => { o.soldHist = soldHistory(s, o.pid); s.stats.soldChecks = (s.stats.soldChecks || 0) + 1; spend(PHONE_COST.research); ctx.render(); } }, `「${productOf(o.pid).name}」の売り切れを見る（${PHONE_COST.research}分）`));
  }

  function negoSec(o) {
    const log = negoLog.get(o.oid) || [];
    const can = canAct() && avail(o) && !o.negotiated;
    return ctx.section('コメントで値下げ交渉', h('div', { class: 'qa' },
      ...log.flatMap((x) => [h('div', { class: 'q' }, h('b', {}, 'クリス'), x.q), h('div', { class: 'a' }, h('b', {}, '出品者'), x.a)]),
      can ? h('div', { class: 'nego-btns' }, ...NEGO_OPTIONS.map((cut) => {
        const price = Math.round((o.price * (1 - cut)) / 10) * 10;
        return h('button', { class: 'qa-ask', onclick: () => nego(o, cut, price) }, `${yen(price)}になりませんか？（-${Math.round(cut * 100)}%）`);
      }), h('small', { class: 'nego-note' }, `返事を待つ間に${PHONE_COST.nego}分たつ。大きく値切ると断られ、ブロックされることも`)) : null,
      !log.length && !can && !o.negotiated ? h('small', {}, '交渉できない') : null));
  }

  function nego(o, cut, price) {
    const q = `はじめまして。${yen(price)}でのご購入は可能でしょうか？`;
    spend(PHONE_COST.nego);
    if (o.gone) {
      negoLog.set(o.oid, [{ q, a: '（返事を待っている間に、ほかの人に購入されてしまった）' }]);
      o.negotiated = 'gone';
      playSe('lose');
    } else {
      const r = negotiate(s, o, cut);
      negoLog.set(o.oid, [{ q, a: r.text }]);
      playSe(r.ok ? 'coin' : 'lose');
    }
    ctx.render();
  }

  function auctionSec(o) {
    const a = o.auction;
    const bid = bids.get(o.oid);
    const lines = [
      h('div', { class: 'auc-now' }, h('span', {}, '現在価格'), h('b', {}, yen(a.cur)), h('small', {}, `入札 ${a.bids}件`)),
      h('div', { class: 'auc-meta' }, h('span', {}, a.done ? '終了しました' : h('span', {}, '残り ', h('span', { 'data-ends': a.endsAt }, dur(a.endsAt - now)), `（${hhmm(a.endsAt)}終了）`)), h('span', { class: a.extend ? 'neg' : 'pos' }, a.extend ? '自動延長あり' : '自動延長なし')),
      h('small', { class: 'auc-tip' }, a.extend
        ? '自動延長あり：終了5分前に入札があると延長される。終了間際の入札でも出し抜けない'
        : '自動延長なし：終了間際に入札すれば、ライバルは上げ直せない（その時刻まで起きている必要がある）'),
    ];
    if (bid) lines.push(h('div', { class: `auc-me ${bid.snipe ? '' : bid.max > a.rivalMax ? 'pos' : 'neg'}` }, bid.snipe ? `終了間際に上限 ${yen(bid.max)} で入札する` : bid.max > a.rivalMax ? `上限 ${yen(bid.max)}：いまはあなたが最高額入札者` : `上限 ${yen(bid.max)}：すぐに高値更新された`));
    return ctx.section('オークション', h('div', { class: 'auc' }, ...lines));
  }

  function aucBar(o) {
    const a = o.auction;
    if (a.done) return h('div', { class: 'buy-bar' }, h('div', { class: 'sold-out' }, { won: '落札しました', lost: '落札できませんでした', over: 'オークションは終了しました', unpaid: '支払えなかった' }[a.done]));
    const bid = bids.get(o.oid);
    const minBid = Math.max(a.cur + bidStep(a.cur), bid ? bid.max + bidStep(bid.max) : 0);
    const suggest = Math.max(minBid, Math.round((o.est * 0.75) / bidStep(o.est)) * bidStep(o.est));
    const input = h('input', { type: 'number', class: 'auc-input', min: String(minBid), step: String(bidStep(a.cur)), value: bidDraft.get(o.oid) ?? String(suggest), oninput: (e) => bidDraft.set(o.oid, e.target.value) });
    const money = s.cash + cardAvailable(s);
    const place = (snipe) => {
      const v = Math.round(Number(input.value) || 0);
      if (!canAct()) return;
      if (v < minBid) return toast(`${yen(minBid)}以上で入札しよう`, 'bad');
      if (v > money) return toast('現金とカード残枠を合わせても足りない', 'bad');
      bids.set(o.oid, { max: v, snipe });
      bidDraft.delete(o.oid);
      if (snipe) {
        // 終了の時刻まで起きて待つ
        playSe('hint');
        spend(Math.max(0, a.endsAt - now));
      } else {
        a.bids += 1;
        a.cur = v > a.rivalMax ? Math.min(v, a.rivalMax + bidStep(a.rivalMax)) : Math.min(a.rivalMax, v + bidStep(v));
        if (v <= a.rivalMax) a.bids += 1;
        playSe(v > a.rivalMax ? 'buy' : 'lose');
        spend(PHONE_COST.buy);
      }
      ctx.render();
    };
    return h('div', { class: 'buy-bar auc-bar' },
      h('span', { class: 'bb-note' }, '上限'), input,
      h('button', { class: 'btn bb-card', disabled: !canAct() || a.endsAt - now > limit() - now, onclick: () => place(true) }, '終了間際に入札'),
      h('button', { class: 'btn bb-cash', disabled: !canAct(), onclick: () => place(false) }, '入札する'));
  }

  last = performance.now();
  loopId = setInterval(loop, 250);

  return {
    cls: 'phone',
    // Esc などで寝る前に閉じられても、時計を止めてオークションを決着させる
    onClose() {
      finish();
    },
    list() {
      if (done) return doneView();
      return app === 'home' ? homeView() : appView();
    },
    wrap(parts) {
      return [statusBar(), ...parts, ctx.isOpen() || done ? null : nav(), lateLayer()];
    },
    escape() {
      if (app !== 'home') {
        app = 'home';
        ctx.render();
        return true;
      }
      return false;
    },
    itemPrice: (o) => (o.auction ? h('div', { class: 'it-price' }, h('small', {}, '現在 '), yen(o.auction.cur), h('small', {}, `（入札${o.auction.bids}件・送料込み）`)) : null),
    extrasLabel: (o) => (o.auction ? 'オークション' : o.source === 'flea' ? '交渉・相場' : '相場を調べる'),
    itemTitle: (o) => APPS[o.unknown ? 'flea' : appOf(o)].name,
    itemColor: (o) => APPS[o.unknown ? 'flea' : appOf(o)].color,
    itemExtras(o) {
      if (o.unknown) return [];
      const out = [];
      if (o.auction) out.push(auctionSec(o));
      else if (o.source === 'flea' && (avail(o) || negoLog.has(o.oid))) out.push(negoSec(o));
      out.push(researchSec(o));
      return out;
    },
    itemBar(o) {
      if (o.auction) return aucBar(o);
      if (o.gone) return h('div', { class: 'buy-bar' }, h('div', { class: 'sold-out' }, appOf(o) === 'mall' ? '在庫切れになりました' : '売り切れました（ほかの人が購入）'));
      if (!canAct()) return h('div', { class: 'buy-bar' }, h('div', { class: 'sold-out' }, 'もう寝る時間だ'));
      return null;
    },
    onAsk() {
      if (!canAct()) return false;
      spend(PHONE_COST.ask);
      return true;
    },
    askNote: `（返事まで${PHONE_COST.ask}分）`,
    afterBuy() {
      if (settling) return;
      s.stats.phoneBuys = (s.stats.phoneBuys || 0) + 1;
      now += PHONE_COST.buy;
      tick();
    },
  };
}
