// 顧客層とキャリアパス。売った商材のジャンルごとに顧客層が育ち、一定を超えるとヒーローがその道に誘う。
// 受けると専用のコマンドが開く。コマンドは経験点（余りがちな情報・対人）を使う
import { AUD_OF, AUDIENCES, CAREER_STAGE, CAREERS } from '../data/careers.js';
import { PRODUCTS, productOf } from '../data/products.js';
import { chance, pick, randInt, randRange } from './rng.js';
import { addCash, addHate, addToku, yen } from './effects.js';
import { activeUnits, addUnits, removeUnit } from './inventory.js';
import { priceOf, roundPrice, unitPrice } from './market.js';
import { sellInShop } from './mystore.js';
import { specialOffer } from './offers.js';
import { choice, info, narr, offers, sfx, talk } from './steps.js';

export const audOf = (pid) => AUD_OF[pid] || null;
export const audience = (s, aud) => s.audience?.[aud] || 0;
export const hasCareer = (s, id) => !!s.careers?.[id];
export const careerOf = (s, id) => s.careers?.[id];

// 売れたとき：その商材の顧客層が育つ（評価が高いほど伸びる）
export function audienceFromSale(s, sale) {
  const aud = audOf(sale.pid);
  if (!aud) return;
  s.audience = { ...(s.audience || {}), [aud]: audience(s, aud) + Math.max(0.3, s.rating / 100) };
}

// 経験点が足りるか・使う
export const canPay = (s, cost) => Object.entries(cost).every(([k, v]) => (s.exp[k] || 0) >= v);
const pay = (s, cost) => { for (const [k, v] of Object.entries(cost)) s.exp[k] -= v; };
const costText = (cost) => Object.entries(cost).map(([k, v]) => `${{ info: '情報', act: '行動', tech: '技術', social: '対人', mind: '精神' }[k]}${v}`).join('・');
const short = (s, id) => [talk('chris', `準備が足りない…（経験点 ${costText(CAREERS[id].cost)} が必要）`, 'sad')];

// ---------------- 誘い（週のはじめ）----------------
export function careerWeek(s) {
  if (s.underworld || s.stage < CAREER_STAGE) return [];
  const steps = [];
  s.careerInvite ||= {};
  const next = Object.entries(CAREERS).find(([id, c]) => !hasCareer(s, id) && audience(s, c.aud) >= c.need && s.week >= (s.careerInvite[id] || 0));
  if (next) {
    const [id, c] = next;
    steps.push(
      sfx('hint'),
      talk(c.hero, c.invite[0]),
      info(`キャリアの誘い：${c.name}`, [`${AUDIENCES[c.aud].name}のお客さんが ${Math.floor(audience(s, c.aud))} 人に育った`, c.perk, `コマンドには経験点（${costText(c.cost)}）を使う`], 'good'),
      choice([
        { label: '引き受ける', run: () => { (s.careers ||= {})[id] = { since: s.week, ...INITIAL[id], ...(id === 'kol' ? { followers: Math.round(audience(s, 'beauty') / 2) } : {}), ...(id === 'media' ? { readers: Math.round(audience(s, 'gadget')) } : {}) }; return [sfx('stageup'), info(`${c.name}になった`, [c.perk, 'メニュー「キャリア」で顧客層と実績を見られる'], 'good')]; } },
        { label: '今はやめておく', run: () => { s.careerInvite[id] = s.week + 24; return [talk(c.hero, '「気が変わったら、いつでも」')]; } },
      ]),
    );
    return steps;
  }
  // レビューメディア：メーカーから提供品が届く
  const media = careerOf(s, 'media');
  if (media && s.week >= (media.supplyCool || 0) && chance(s, 0.08)) steps.push(...supplySteps(s, media));
  return steps;
}
const INITIAL = { kol: { followers: 100 }, appraiser: { trust: 60, jobs: 0 }, media: { readers: 200 }, select: { trips: 0 }, inbound: { tours: 0 } };

function supplySteps(s, media) {
  const p = pick(s, PRODUCTS.filter((x) => audOf(x.id) === 'gadget' && !x.spot));
  const n = randInt(s, 1, 2);
  addUnits(s, p.id, n, 0);
  return [
    talk('edison', `「メーカーから『${p.name}』の提供品が届いたぞ。……で、レビューはどう書く？」`),
    choice([
      { label: '正直に書く（辛口も）', sub: '読者+60・TOKU+2。しばらく提供が止まる', run: () => { media.readers += 60; media.supplyCool = s.week + 12; addToku(s, 2); return [info('正直なレビュー', ['読者に信頼された（読者+60・TOKU+2）', 'メーカーは少しむっとしたようだ'], 'good')]; } },
      { label: '褒めちぎる', sub: '読者+10・TOKU-2。提供は続く', run: () => { media.readers += 10; addToku(s, -2); return [info('提灯記事', ['メーカーは喜んだ（提供は続く）', '読者は少し離れた気がする（TOKU-2）'], 'bad')]; } },
    ]),
    info('提供品', [`「${p.name}」×${n} が在庫に入った（仕入れ値0円）`]),
  ];
}

// ---------------- コマンド ----------------
// ライブコマースKOL：出品中の美容品をまとめて売る
export function liveSteps(s) {
  const kol = careerOf(s, 'kol');
  if (!canPay(s, CAREERS.kol.cost)) return short(s, 'kol');
  pay(s, CAREERS.kol.cost);
  const listed = activeUnits(s).filter((u) => u.listing && audOf(u.pid) === 'beauty');
  const cap = 1 + Math.floor((kol.followers / 60) * (0.6 + s.abilities.talk / 200));
  const sold = listed.slice(0, cap);
  let revenue = 0;
  for (const u of sold) {
    const price = u.listing.price;
    removeUnit(s, u.uid);
    addCash(s, Math.round(price * 0.92), `ライブ配信で販売: ${productOf(u.pid).name}`); // 配信アプリの手数料8%
    s.stats.revenue += price;
    s.stats.cogs += u.cost;
    s.stats.soldUnits++;
    s.cur.revenue += price;
    s.cur.salesProfit += Math.round(price * 0.92) - u.cost;
    s.cur.sold++;
    audienceFromSale(s, { pid: u.pid });
    revenue += price;
  }
  const grow = randInt(s, 15, 40) + sold.length * 4 + Math.floor(s.abilities.talk / 8);
  kol.followers += grow;
  kol.streams = (kol.streams || 0) + 1;
  const steps = [
    narr(`スマホを三脚に立てて、ライブ配信スタート。「今日はこのコスメ、実際に使ってみますね」`),
    info('ライブ配信', [sold.length ? `${sold.length}点が売れた（売上 ${yen(revenue)}）` : '出品中の美容品がなかった。トークだけで盛り上げた', `フォロワー +${grow}（${kol.followers}人）`, `経験点 ${costText(CAREERS.kol.cost)} を使った`], sold.length ? 'good' : ''),
  ];
  // 案件配信（フォロワー300人から）：紹介料が入る。案件と表示するかどうか（ステマ）
  if (kol.followers >= 300 && chance(s, 0.5)) {
    const fee = Math.round(kol.followers * 40);
    steps.push(
      talk('yohki', `「コスメブランドから案件よ。紹介料は ${yen(fee)}。……『PR』と表示するかは、あなた次第」`),
      choice([
        { label: '「PR」と表示する', sub: `紹介料 ${yen(Math.round(fee * 0.8))}・TOKU+1`, run: () => { addCash(s, Math.round(fee * 0.8), '案件配信の紹介料'); addToku(s, 1); return [info('案件配信', [`紹介料 ${yen(Math.round(fee * 0.8))}（表示したぶん少し減った）`, 'フォロワーの信頼は守られた'], 'good')]; } },
        {
          label: '表示しない（ステマ）', sub: `紹介料 ${yen(fee)}・バレると炎上`,
          run: () => {
            addCash(s, fee, '案件配信の紹介料');
            if (chance(s, 0.3)) {
              kol.followers = Math.round(kol.followers * 0.75);
              addHate(s, 10);
              addToku(s, -5);
              return [sfx('trouble'), info('ステマがバレた', ['「これ案件じゃん」と拡散された', 'フォロワー -25%、炎上、TOKU-5'], 'bad')];
            }
            return [info('案件配信', [`紹介料 ${yen(fee)}`, '……今回はバレなかった'])];
          },
        },
      ]),
    );
  }
  return steps;
}

// 鑑定士：鑑定の依頼をこなす。外すと信用が落ちる。委託販売の品を預かることも
export function appraiseSteps(s) {
  const ap = careerOf(s, 'appraiser');
  if (!canPay(s, CAREERS.appraiser.cost)) return short(s, 'appraiser');
  pay(s, CAREERS.appraiser.cost);
  const n = 2 + Math.floor(s.abilities.eye / 30);
  const rate = Math.min(0.95, 0.55 + s.abilities.eye / 220);
  let ok = 0;
  for (let i = 0; i < n; i++) {
    if (chance(s, rate)) ok++;
  }
  const miss = n - ok;
  const fee = Math.round((ok * 15000 * s.stage * ap.trust) / 60 / 1000) * 1000;
  ap.trust = Math.max(10, Math.min(100, ap.trust + ok * 2 - miss * 8));
  ap.jobs += n;
  if (fee) addCash(s, fee, '鑑定の手数料');
  const steps = [
    narr('骨董店の奥の座敷で、持ち込まれた品をひとつずつ鑑定した。'),
    info('鑑定の依頼', [`${n}件を鑑定（当たり ${ok}・外れ ${miss}）`, `手数料 ${yen(fee)}`, `信用 ${ap.trust}${miss ? '（外すと信用が落ちる）' : ''}`, `経験点 ${costText(CAREERS.appraiser.cost)} を使った`], miss > ok ? 'bad' : 'good'),
  ];
  // 委託販売：預かった品を売る。売れたら手数料20%（売上金の8割は持ち主へ）
  if (chance(s, 0.35 + ap.trust / 400)) {
    const p = pick(s, PRODUCTS.filter((x) => audOf(x.id) === 'collector' && !x.spot && !x.know && x.retail >= 9000));
    addUnits(s, p.id, 1, 0, { consign: true });
    steps.push(talk('hokusai', `「この『${p.name}』、おぬしの販路で売ってくれと頼まれた。手数料は2割じゃ」`), info('委託販売', [`「${p.name}」を預かった（仕入れ値0円）`, '売れたら売上金の2割が自分の取り分']));
  }
  return steps;
}

// レビューメディア：記事を書いて読者を増やす（読者 × 30円 が毎月の紹介料）
export function reviewSteps(s) {
  const media = careerOf(s, 'media');
  if (!canPay(s, CAREERS.media.cost)) return short(s, 'media');
  pay(s, CAREERS.media.cost);
  const buzz = chance(s, 0.12);
  const grow = Math.round((40 + s.abilities.list / 2) * (buzz ? 3 : 1));
  media.readers += grow;
  media.articles = (media.articles || 0) + 1;
  return [narr(buzz ? 'レビュー記事がバズった！ 通知が鳴りやまない。' : '新作ガジェットのレビュー記事を書いた。写真と比較表を丁寧に。'), info('レビュー記事', [`読者 +${grow}（${media.readers}人）`, `毎月の紹介料の目安 ${yen(mediaIncome(s))}`, `経験点 ${costText(CAREERS.media.cost)} を使った`], buzz ? 'good' : '')];
}
export const mediaIncome = (s) => (careerOf(s, 'media') ? Math.round(careerOf(s, 'media').readers * 30) : 0);

// セレクトショップ：海外買い付け（ファッションの品を卸値で）
export function buyingSteps(s) {
  const sel = careerOf(s, 'select');
  if (!canPay(s, CAREERS.select.cost)) return short(s, 'select');
  pay(s, CAREERS.select.cost);
  sel.trips++;
  const pool = PRODUCTS.filter((p) => audOf(p.id) === 'fashion' && p.kind !== 'luxury' && !p.spot && (p.kind !== 'hype' || s.market[p.id].edition));
  const list = [];
  for (let i = 0; i < 4 + Math.floor(s.abilities.eye / 30); i++) {
    const p = pick(s, pool);
    if (list.some((o) => o.pid === p.id)) continue;
    list.push(specialOffer(s, p.id, { source: 'buying', label: '海外の展示会で買い付け', price: roundPrice(priceOf(s, p.id) * randRange(s, 0.5, 0.68)), maxQty: randInt(s, 2, 6), fakeRate: p.fakeRisk * 0.05 }));
  }
  return [narr('パリの展示会へ。バイヤー証を首にかけて、ブースを一つずつ回る。'), offers(list, '海外買い付け', `経験点 ${costText(CAREERS.select.cost)} を使った`)];
}

// インバウンド：訪日客の買い物ツアー（和雑貨・工芸を相場の1.3倍で直接売る）
export function tourSteps(s) {
  const inb = careerOf(s, 'inbound');
  if (!canPay(s, CAREERS.inbound.cost)) return short(s, 'inbound');
  pay(s, CAREERS.inbound.cost);
  inb.tours++;
  const cap = 3 + Math.floor(s.abilities.talk / 25);
  const units = activeUnits(s).filter((u) => !u.listing && audOf(u.pid) === 'inbound' && !(productOf(u.pid).alcohol && s.flags.noAlcohol)).slice(0, cap);
  let revenue = 0;
  for (const u of units) {
    const price = roundPrice(unitPrice(s, u) * 1.3);
    sellInShop(s, u, price);
    revenue += price;
  }
  return [narr('訪日客のグループを、浅草から下町の工房まで案内した。'), info('買い物ツアー', [units.length ? `${units.length}点が売れた（売上 ${yen(revenue)}・相場の1.3倍）` : '売れる和雑貨・工芸の在庫（出品していないもの）がなかった', `経験点 ${costText(CAREERS.inbound.cost)} を使った`], units.length ? 'good' : '')];
}

// 委託販売の品が売れたとき：売上金の8割は持ち主へ
export function consignPayout(sale) {
  if (!sale.unit?.consign) return;
  const owner = Math.round(sale.net * 0.8);
  sale.net -= owner;
  sale.profit = sale.net;
}

