// 仕入れの「現場」。店舗せどりは時間内に店を回って棚ごとに品定めし、電脳せどりは夜のスマホでアプリを渡り歩く。
// 候補（オファー）の中身は offers.js が作り、ここでは「どの店のどの棚にあるか」「いつ売れてしまうか」と時計を決める。
// UI はこの情報で店舗巡り・スマホ画面を演出する。オート（ルーティン・外注・テストのボット）は autoVisible で
// 「ふつうに回ったら見つかる分」だけを見る
import { PRODUCTS, productOf } from '../data/products.js';
import { knowsGenre } from './courses.js';
import { specialOffer } from './offers.js';
import { hasSkill } from './effects.js';
import { hasCar } from './lifestyle.js';
import { isReleased, priceOf, roundPrice } from './market.js';
import { SPOT_MAP } from './pioneer.js';
import { chance, pick, randInt, randRange, weightedPick } from './rng.js';
import { HABITS, habitKey } from './storemap.js';
import { nodeLv } from './abilities.js';

// ---------------- 時計 ----------------
export const hhmm = (m) => {
  const t = Math.floor(m);
  return `${Math.floor(t / 60) % 24}:${String(t % 60).padStart(2, '0')}`;
};

// 店舗巡り：昼は12時に出て20時の閉店まで。夜は18時半から22時まで。遠征は朝8時に出て、着くのは10時
export function storeClock(s, night = false, { trip = false } = {}) {
  const travel = 50 * (hasSkill(s, 'ino_map') ? 0.7 : 1) * (hasCar(s) ? 0.6 : 1);
  const search = 35 * (1 - Math.min(0.4, s.abilities.buy / 250)) * (hasSkill(s, 'eye_ai') ? 0.6 : 1);
  const start = trip ? 10 * 60 : night ? 18 * 60 + 30 : 12 * 60;
  return { start, close: night ? 22 * 60 : 20 * 60, travel: Math.round(travel), search: Math.max(8, Math.round(search)), checkout: 5, research: 3 };
}
export const ROUTE_LEN = 8;
const AVG_SECTIONS = 2.7;

// ふつうに回ったら（どの店も距離は平均、棚は全部見る）何か所の棚を見られるか
export function expectedSections(clock) {
  let now = clock.start;
  let n = 0;
  for (let st = 0; st < ROUTE_LEN; st++) {
    now += clock.travel;
    for (let i = 0; i < AVG_SECTIONS; i++) {
      if (now + clock.search > clock.close) return n;
      now += clock.search;
      n += 1;
    }
  }
  return n;
}
// 棚が全部でいくつあるか（ルート全体）。見つかる品の総数は「ふつうに回ったときに今までどおりの数」になるよう配る
export const totalOffersFor = (n, clock) => Math.max(n, Math.round((n * ROUTE_LEN * AVG_SECTIONS) / Math.max(1, expectedSections(clock))));

// ---------------- 店 ----------------
// 店名はすべて架空
export const STORE_TYPES = {
  kaden: { label: '家電量販店', names: ['デンキの大魔王', 'エレキ館 駅前店', 'でんでん電機', 'ボルト電気 郊外店'], color: '#d33a2c',
    sections: ['入口の処分ワゴン', '値札POP「展示品限り」', '棚の最下段・エンド棚'], tags: ['staple', 'hype'], enter: '自動ドアが開くと、店内放送とまぶしい照明。まずは入口のワゴンからだ。' },
  drug: { label: 'ドラッグストア', names: ['ドラッグ薬師堂', 'ハッピードラッグ', 'くすりの源内'], color: '#1f8f5f',
    sections: ['特価ワゴン', '季節コーナー', '棚の奥（旧パッケージ）'], tags: ['staple', 'niche', 'seasonal'], enter: '「本日ポイント5倍」ののぼり。棚の奥に旧パッケージが眠っていないか…' },
  zakka: { label: '雑貨屋', names: ['雑貨のトリトン', 'くらしの道具箱', 'ポップン雑貨'], color: '#c0602a',
    sections: ['季節コーナー', 'レジ横の新入荷', '在庫処分ワゴン'], tags: ['boom', 'seasonal', 'niche'], enter: 'BGMはやけに陽気だ。流行りものは、たいていレジ横にある。' },
  hobby: { label: 'ホビーショップ', names: ['ホビーの王国', '英雄堂ホビー', 'トイ・キャッスル'], color: '#6d3fc0',
    sections: ['新作の棚', 'ガラスのショーケース', '値下げワゴン'], tags: ['hype', 'staple'], enter: '新作の棚の前には、同業者らしき人影がもう一人…。' },
  used: { label: 'リサイクルショップ', names: ['おさがり市場', 'リサイクル館 もったいない', 'セカンドハンズ'], color: '#2b8a6e',
    sections: ['中古の棚', 'ガラスのショーケース', 'ジャンクかご'], tags: ['used'], enter: '値札の色で入荷日がわかる店だ。今日は何色が多いかな。' },
  book: { label: '古本屋', names: ['古書いろは堂', '本の森', 'ぶっくまーと'], color: '#7a5a2e',
    sections: ['110円の均一棚', '専門書の棚'], tags: ['book'], enter: '紙のにおい。均一棚には、たまにとんでもない本が紛れている。' },
  luxury: { label: 'ブランド正規店', names: ['メゾン・ド・ロワ', 'ラ・クロンヌ銀座'], color: '#222',
    sections: ['ショーケース'], tags: ['luxury'], enter: 'ドアマンに会釈される。場違いな気がして背筋が伸びる…。' },
};
const COMMON = ['kaden', 'drug', 'zakka', 'hobby'];
const TAG_TYPES = { staple: ['kaden', 'drug', 'hobby'], hype: ['hobby', 'kaden'], boom: ['zakka'], seasonal: ['zakka', 'drug'], niche: ['drug', 'zakka'], used: ['used'], book: ['book'], luxury: ['luxury'] };
// 品のジャンルごとに、置いていそうな店（腕時計やイヤホンは家電量販店、コスメとお酒はドラッグストア…）
const GENRE_TYPES = {
  定番ウォッチ: ['kaden'], ワイヤレスイヤホン: ['kaden'], スマートプロジェクター: ['kaden'], 新型VRゲーム機: ['kaden', 'hobby'],
  プチプラコスメのセット: ['drug'], デパコスの限定コフレ: ['drug'], 地酒: ['drug'], プレミアウイスキー: ['drug'],
  'トレカBOX（定番）': ['hobby'], 人気トレカ新弾BOX: ['hobby'], 限定フィギュア: ['hobby'],
  定番スニーカー: ['zakka'], コラボスニーカー: ['zakka'], 超限定スニーカー: ['zakka'], ブランドスカーフ: ['zakka'], 苔玉の盆栽: ['zakka'],
  家庭用ロボット: ['kaden', 'hobby'], 電子キーボード: ['kaden'],
  '五月人形（兜飾り）': ['zakka'], 母の日の限定ネックレス: ['zakka'], お中元のゼリー詰め合わせ: ['drug', 'zakka'], 'ネッククーラー（冷感グッズ）': ['zakka', 'drug'],
  ハロウィンのコスプレ衣装: ['zakka', 'hobby'], '大学入試の過去問（赤本）': ['book'], 新生活の小型家電: ['kaden'],
  クリスマス限定ぬいぐるみ: ['zakka', 'hobby'], 雛人形: ['zakka'], ブラインドボックスぬいぐるみ: ['zakka', 'hobby'],
};
const BOOKS = ['novice_book', 'tsumi'];
const FLYERS = {
  kaden: ['型落ち家電の処分セール', '展示品限りの値下げ'], drug: ['ポイント5倍デー', '季節品の在庫一掃'], zakka: ['在庫処分ワゴン増量中', '季節雑貨のセール'],
  hobby: ['値下げワゴン追加', '週末の入荷情報'], used: ['週末の値下げ', 'ジャンク大放出'], book: ['均一棚の入れ替え'],
};
// その品が並んでいそうな店の種類
export function storeTypesOf(p) {
  if (BOOKS.includes(p.id)) return ['book'];
  if (p.kind === 'luxury' || p.genre.includes('ブランドジュエリー')) return ['luxury'];
  if (p.kind === 'collect') return p.genre.includes('本') ? ['book'] : ['used'];
  if (p.kind === 'home' || p.used) return ['used'];
  if (p.kind === 'perishable') return ['zakka'];
  return GENRE_TYPES[p.genre] || TAG_TYPES[p.niche ? 'niche' : p.kind] || COMMON;
}
// 店で見つかる品の種類。ジャンルで店が決まる品は、その店にだけ置く
const typesFor = (o, tag) => {
  if (tag === 'any' || SPOT_MAP[tag]) return null;
  if (['used', 'book', 'luxury'].includes(tag)) return TAG_TYPES[tag];
  return GENRE_TYPES[productOf(o.pid).genre] || TAG_TYPES[tag];
};

// 値札の文句に合う売り場（ワゴンセールはワゴンに、季節ものは季節コーナーに）
const SECTION_HINTS = [['ワゴン', ['ワゴン']], ['見切り', ['ワゴン']], ['処分', ['ワゴン']], ['季節', ['季節']], ['シーズン', ['季節', 'ワゴン']], ['値札ミス', ['棚']], ['型落ち', ['展示品', 'ワゴン']], ['入荷', ['新入荷', '新作', '季節']], ['店頭在庫', ['新作', '棚', 'ショーケース']], ['閉店', ['ワゴン']]];
const fitsSection = (o, name) => {
  const hint = SECTION_HINTS.find(([k]) => o.label?.includes(k));
  return !hint || hint[1].some((w) => name.includes(w));
};
function pickSection(s, st, o) {
  const m = st.sections.filter((sec) => fitsSection(o, sec.name));
  return pick(s, m.length ? m : st.sections);
}

// オファーがどんな店にありそうか
export function storeTag(o) {
  if (o.unknown) return 'any';
  if (SPOT_MAP[o.source]) return o.source;
  if (o.source === 'used') return ['novice_book', 'tsumi'].includes(o.pid) ? 'book' : 'used';
  if (o.source === 'luxury') return 'luxury';
  const p = productOf(o.pid);
  if (p.niche) return 'niche';
  return TAG_TYPES[p.kind] ? p.kind : 'staple';
}

// 店舗巡りのルートを作り、オファーを店と棚に配る
export function buildStoreRun(s, list, clock, n = 0, { region = null } = {}) {
  const firstOid = list.find((o) => o.first)?.oid;
  const tags = list.map(storeTag);
  const types = list.map((o, i) => typesFor(o, tags[i]));
  const need = [];
  for (const t of new Set(tags)) if (SPOT_MAP[t]) need.push({ spot: t });
  for (const ts of new Set(types.filter(Boolean).map((x) => x.join()))) need.push({ type: pick(s, ts.split(',')) });
  const route = [];
  const usedTypes = new Set();
  for (const x of need) if (x.spot || !usedTypes.has(x.type)) { route.push(x); if (x.type) usedTypes.add(x.type); }
  while (route.length < ROUTE_LEN) route.push({ type: pick(s, COMMON) });
  // ならべかえ（最初の仕入れでは、ワゴンのある家電量販店から）
  for (let i = route.length - 1; i > 0; i--) {
    const j = randInt(s, 0, i);
    [route[i], route[j]] = [route[j], route[i]];
  }
  // 開拓した仕入れ先は、ルートの前のほうに組み込む（自分で見つけた店を中心に回るのがふつう）
  route.forEach((x, i) => {
    if (x.spot && i > 1) {
      const j = randInt(s, 0, 1);
      [route[i], route[j]] = [route[j], route[i]];
    }
  });
  if (firstOid) {
    const k = route.findIndex((x) => x.type === 'kaden');
    if (k > 0) [route[0], route[k]] = [route[k], route[0]];
    else if (k < 0) route[0] = { type: 'kaden' };
  }
  const names = new Map();
  const stores = route.slice(0, Math.max(ROUTE_LEN, route.length)).map((x, i) => {
    if (x.spot) {
      const sp = SPOT_MAP[x.spot];
      return { id: i, spot: x.spot, type: 'spot', name: sp.name, label: '開拓した仕入れ先', color: sp.color || '#8a6d1f', dist: randRange(s, 0.8, 1.4), enter: 'ここは自分で見つけた仕入れ先だ。ほかの転売屋はまだ知らない…はず。', sections: [{ name: '売り場', oids: [] }] };
    }
    const t = STORE_TYPES[x.type];
    const used = names.get(x.type) || [];
    const base = pick(s, t.names.filter((n) => !used.includes(n)).length ? t.names.filter((n) => !used.includes(n)) : t.names);
    names.set(x.type, [...used, base]);
    const name = region ? `${region}・${base}` : base;
    const habit = habitKey(s, name); // 店のクセ（engine/storemap.js）
    return { id: i, type: x.type, name, region, habit, label: t.label, color: t.color, dist: randRange(s, 0.6, 1.5) * (HABITS[habit].dist || 1) * (region ? 1.3 : 1), enter: t.enter, sections: t.sections.map((nm) => ({ name: nm, oids: [] })) };
  });
  // 配る
  list.forEach((o, i) => {
    let cands;
    if (o.oid === firstOid) cands = [stores[0]];
    else if (tags[i] === 'any') cands = stores.filter((x) => x.type !== 'spot' && x.type !== 'luxury');
    else if (SPOT_MAP[tags[i]]) cands = stores.filter((x) => x.spot === tags[i]);
    else cands = stores.filter((x) => types[i].includes(x.type));
    if (!cands.length) cands = stores.filter((x) => x.type !== 'spot');
    const st = weightedPick(s, cands.map((x) => ({ x, weight: HABITS[x.habit]?.weight || 1 }))).x; // ワゴンが宝の山の店には品が集まる
    const sec = o.oid === firstOid ? st.sections[0] : pickSection(s, st, o);
    sec.oids.push(o.oid);
  });
  const run = { kind: 'store', clock, stores, n, region };
  if (n) balanceRoute(s, run, list, tags, types, n);
  // 店のクセ：棚の奥の旧品は安く、転売に厳しい店は1人2個まで
  const byId = new Map(list.map((o) => [o.oid, o]));
  for (const st of run.stores) {
    const hb = HABITS[st.habit];
    if (!hb || !(hb.disc || hb.cap)) continue;
    for (const o of st.sections.flatMap((sec) => sec.oids.map((id) => byId.get(id)))) {
      if (!o || o.scarce) continue;
      if (hb.disc) o.price = Math.max(10, Math.round((o.price * (1 - hb.disc)) / 10) * 10);
      if (hb.cap) o.maxQty = Math.min(o.maxQty, hb.cap);
    }
  }
  // セールのチラシ：品のある店はたいてい何か載せている（品のない店がチラシを出していることもある）
  for (const st of run.stores) {
    const fl = FLYERS[st.type];
    const has = st.sections.some((sec) => sec.oids.length);
    if (fl && chance(s, (has ? 0.7 : 0.15) + (HABITS[st.habit]?.flyer || 0))) st.flyer = pick(s, fl);
  }
  return run;
}

// ふつうに回って見つかる数が、これまでの仕入れ候補の数（n）を下回らないようにする。
// 届かない店にある品を、届く店のうち同じ種類の店の棚へ移す（種類の合う店がなければ動かさない）
function balanceRoute(s, run, list, tags, types, n) {
  const reach = reachable(run);
  const seen = new Set(reach.flatMap((x) => x.sec.oids));
  // 値打ちのある品（開拓先・品薄品）から先に、届く棚へ移す
  const rank = ([o, tag]) => (SPOT_MAP[tag] ? 0 : o.scarce ? 1 : 2);
  const away = list.map((o, i) => [o, tags[i], types[i]]).filter(([o]) => !seen.has(o.oid)).sort((a, b) => rank(a) - rank(b));
  let have = seen.size;
  for (const [o, tag, ty] of away) {
    if (have >= n) break;
    const fits = reach.filter((x) => (tag === 'any' ? x.st.type !== 'spot' && x.st.type !== 'luxury' : SPOT_MAP[tag] ? x.st.spot === tag : ty.includes(x.st.type)));
    if (!fits.length) continue;
    for (const st of run.stores) for (const sec of st.sections) sec.oids = sec.oids.filter((id) => id !== o.oid);
    const good = fits.filter((x) => fitsSection(o, x.sec.name));
    pick(s, good.length ? good : fits).sec.oids.push(o.oid);
    have++;
  }
}

// ルートの順に棚を全部見て、閉店までに見られる棚
function reachable(run) {
  const { clock } = run;
  let now = clock.start;
  const out = [];
  for (const st of run.stores) {
    const t = Math.round(clock.travel * st.dist);
    if (now + t + clock.search > clock.close) break;
    now += t;
    for (const sec of st.sections) {
      if (now + clock.search > clock.close) break;
      now += clock.search;
      out.push({ st, sec });
    }
  }
  return out;
}

// オート：ルートの順に、棚を全部見ながら閉店まで回ったら見つかる分
export function autoVisible(step, s = null) {
  const run = step.run;
  if (!run) return step.offers;
  if (run.kind !== 'store') return step.offers.filter((o) => !o.filler); // 相場どおりの出品はオートでは見ない
  // 回る順に見つけた品を、今までの仕入れ候補の数まで（オートの仕入れ量を以前と同じにする）
  const reach = reachable(run);
  if (s) s.stats.maxStores = Math.max(s.stats.maxStores || 0, new Set(reach.map((x) => x.st)).size); // オートでも回った店の数を数える
  const ids = reach.flatMap((x) => x.sec.oids);
  const seen = new Set(run.n ? ids.slice(0, run.n) : ids);
  return step.offers.filter((o) => seen.has(o.oid));
}

// ---------------- 電脳せどり（夜のスマホ） ----------------
// 21時から深夜1時まで。行動ごとに時間がたち、安い出品はほかの人に買われていく
export const PHONE_START = 21 * 60;
export const PHONE_END = 25 * 60;

// 夜のスマホ滞在時間を計算（秒単位）。スキルレベルで延びる
export function getPhoneSessionTime(s) {
  let seconds = 180; // 基本3分
  const onSearchLv = nodeLv(s, 'on_search') || 0;
  seconds += 30 * onSearchLv;
  const onBuyLv = nodeLv(s, 'on_buy') || 0;
  seconds += 30 * onBuyLv;
  if (hasSkill(s, 'eye_ai')) seconds += 120; // AIツール +2分
  return seconds;
}
export const PHONE_COST = { open: 2, research: 5, ask: 15, nego: 20, ad: 5, buy: 2, snipe: 0 };
export const LATE_EXTRA = 60;
export const LATE_STAMINA = 8;

export const appOf = (o) => (o.auction ? 'auction' : o.source === 'flea' ? 'flea' : o.source === 'shady' ? 'shady' : 'mall');
export const APPS = {
  flea: { name: 'プンシー', sub: 'フリマ', color: '#1b8de0' },
  auction: { name: 'ミィーム', sub: 'オークション', color: '#e2a400' },
  mall: { name: 'マイクリ市場', sub: '通販モール', color: '#bf2e2e' },
  shady: { name: 'GLOBAL☆DEAL', sub: '海外通販', color: '#f07b16' },
};

// オークションの入札単位（よくある刻み）
export const bidStep = (v) => (v < 1000 ? 10 : v < 5000 ? 100 : v < 10000 ? 250 : v < 50000 ? 500 : 1000);

// 電脳のオファーに「いつ出品されたか」「いつ売れてしまうか」「オークション形式か」をつける
export function buildPhoneRun(s, list) {
  const notices = [];
  // フリマの掘り出し物（相場どおりの出品ではないもの）は、少なくとも1つは即決で残す（フリマのタブが相場どおりの出品だけにならないように）
  let fixedLeft = list.filter((o) => o.source === 'flea' && !o.filler && !o.unknown).length;
  for (const o of list) {
    if (o.unknown) continue;
    const site = o.source;
    o.posted = randInt(s, 1, 180); // 何分前の出品か
    if (site === 'flea' || SPOT_MAP[site]?.route === 'online') {
      // 相場より安いほど早く売れる
      const cheap = o.est ? Math.max(0, 1 - o.price / o.est) : 0.1;
      o.life = Math.round(randRange(s, 40, 160) * (1 - Math.min(0.6, cheap * 1.5)));
      // フリマ出品の一部はオークション形式で出ている
      if (site === 'flea' && chance(s, 0.4) && (o.filler || fixedLeft > 1)) {
        if (!o.filler) fixedLeft--;
        const rival = roundPrice(o.price * randRange(s, 0.9, 1.15));
        o.auction = { start: roundPrice(o.price * randRange(s, 0.35, 0.6)), rivalMax: rival, bids: randInt(s, 0, 9), endsAt: PHONE_START + randInt(s, 30, 230), extend: chance(s, 0.6) };
        o.auction.cur = o.auction.bids ? roundPrice(o.auction.start + (rival - o.auction.start) * randRange(s, 0.2, 0.6)) : o.auction.start;
        delete o.life;
      }
    } else if (o.label?.includes('在庫復活')) o.life = randInt(s, 10, 35);
    else if (o.source === 'preorder') o.life = randInt(s, 40, 120);
    // 通知（保存した検索の新着・在庫復活・予約開始）
    if (o.label?.includes('在庫復活')) notices.push({ oid: o.oid, app: 'mall', text: `【在庫復活】${productOf(o.pid).name} が購入できます` });
    else if (o.source === 'preorder') notices.push({ oid: o.oid, app: 'mall', text: `【予約開始】${productOf(o.pid).name} の予約受付が始まりました` });
    else if (o.source === 'flea' && !o.auction && o.posted < 30) notices.push({ oid: o.oid, app: 'flea', text: `保存した検索「${productOf(o.pid).genre}」に新着の出品があります` });
    else if (o.auction && o.auction.endsAt < PHONE_START + 90) notices.push({ oid: o.oid, app: 'auction', text: `ウォッチ中のオークションがまもなく終了：${productOf(o.pid).name}` });
  }
  return { kind: 'online', start: PHONE_START, end: PHONE_END, notices: notices.slice(0, 4) };
}

// 相場どおりの出品（買えるが、利益はほとんど出ない）。電脳せどりは、たくさんの「ふつうの出品」の中から安いものを探す作業
export function phoneFillers(s, list) {
  const out = [];
  const known = PRODUCTS.filter((p) => isReleased(s, p) && !p.spot && !p.niche && (!p.know || knowsGenre(s, p)) && (p.retail < 100000 || s.stage >= 2));
  const flea = list.some((o) => o.source === 'flea');
  if (flea) {
    for (let i = randInt(s, 5, 9); i > 0; i--) {
      const p = pick(s, known.filter((x) => ['hype', 'collect', 'boom', 'staple', 'seasonal'].includes(x.kind)));
      if (p) out.push(specialOffer(s, p.id, { source: 'flea', label: 'フリマの出品', price: roundPrice(priceOf(s, p.id) * randRange(s, 0.98, 1.3)), maxQty: 1, fakeRate: p.fakeRisk * 0.3, filler: true }));
    }
  }
  for (let i = randInt(s, 2, 4); i > 0; i--) {
    const p = pick(s, known.filter((x) => x.kind === 'staple'));
    if (p) out.push(specialOffer(s, p.id, { source: 'online', label: '通常価格', price: p.retail, points: randInt(s, 1, 3) / 100, maxQty: randInt(s, 2, 5), filler: true }));
  }
  return out;
}

// 売り切れ検索：最近の売れた値段（本当の相場のまわりに散らばる）
export function soldHistory(s, pid) {
  const p = priceOf(s, pid);
  return Array.from({ length: 5 }, (_, i) => ({ ago: ['今日', '昨日', '2日前', '4日前', '1週間前'][i], price: roundPrice(p * randRange(s, 0.88, 1.1)) }));
}
export const soldMedian = (hist) => {
  const v = hist.map((x) => x.price).sort((a, b) => a - b);
  return v[Math.floor(v.length / 2)];
};

// 値下げ交渉（コメント）。大きく値切るほど断られ、ブロックされることもある
export const NEGO_OPTIONS = [0.05, 0.1, 0.2];
export function negotiate(s, o, cut) {
  const shoplike = !!o.listing?.seller?.shoplike;
  const p = ({ 0.05: 0.75, 0.1: 0.5, 0.2: 0.15 }[cut] ?? 0.3) * (shoplike ? 0.5 : 1) * (hasSkill(s, 'bargain') ? 1.2 : 1);
  if (chance(s, p)) {
    o.price = roundPrice(o.price * (1 - cut));
    o.negotiated = 'ok';
    s.stats.negoWins = (s.stats.negoWins || 0) + 1;
    return { ok: true, text: pick(s, ['いいですよ〜。専用の出品にしますね！', '少しならお値下げできます。価格を変更しました。', 'わかりました、その金額で大丈夫です。']) };
  }
  if (cut >= 0.2 && chance(s, 0.35)) {
    o.negotiated = 'blocked';
    return { ok: false, blocked: true, text: '大幅なお値下げは考えておりません。（ブロックされた）' };
  }
  o.negotiated = 'ng';
  return { ok: false, text: pick(s, ['申し訳ありませんが、お値下げは考えていません。', 'すでに最低価格です。ごめんなさい。', '他にもご検討の方がいるので、このままでお願いします。']) };
}

// オークションの決着。snipe：終了間際に入札（自動延長がなければ、ライバルが上げ直せない）
export function settleAuction(o, myMax, { snipe = false } = {}) {
  const a = o.auction;
  const rival = Math.round(a.rivalMax * (snipe && !a.extend ? 0.9 : 1));
  if (myMax <= rival) return { won: false, final: Math.max(a.cur, roundPrice(myMax + bidStep(myMax))) };
  return { won: true, final: Math.min(myMax, rival + bidStep(rival)) };
}

// ---------------- 世界観の広告 ----------------
export const ADS = [
  { who: 'nostra', title: '相場大予言サロン', text: '来月の値上がり品、教えます。月額29,800円' },
  { who: 'goemon', title: '五右衛門卸', text: '出所は聞かないで。激安ロット、即日発送' },
  { who: 'satoshi', title: 'サトシの投資塾', text: '寝ていても資産10倍。今なら入塾金無料' },
  { who: 'nobunaga', title: '楽市楽座 倉庫レンタル', text: '天下布武の収納力。初月0円' },
  { who: 'gennai', title: '源内の売れる文章講座', text: '「土用の丑」を流行らせた男が教える説明文' },
  { who: 'nightingale', title: '統計で勝つ在庫管理', text: 'グラフで在庫の病を見抜く。無料セミナー' },
  { who: 'marie', title: 'マリーの爆買いツアー', text: 'お菓子がなければ、免税店で買えばいいじゃない' },
  { who: 'newton', title: '万有引力の法則で読む相場', text: '上がったものは、必ず落ちる（※個人の感想です）' },
  { who: 'maycri', title: 'マイクリ英雄ガチャ', text: '今だけレジェンド英雄の排出率2倍！' },
  { who: 'ryoma', title: '海援隊エクスプレス', text: '日本初の商社が運ぶ、海外発送代行' },
];
