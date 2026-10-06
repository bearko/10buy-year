// 飽和とライバル転売屋。
// 仕入れ先は使うほど荒れて（飽和度）、掘り出し物が減り仕入れ値が上がる。ライバルも乗り込んでくる。
// 古い仕入れ先が荒れたら、新しい仕入れ先を開拓して移る（engine/pioneer.js）
import { productOf } from '../data/products.js';
import { chance, pick, randInt, randRange } from './rng.js';
import { addExp, yen } from './effects.js';
import { addExpense } from './kpi.js';
import { PIONEER_ROUTES, SPOT_MAP, openSpots } from './pioneer.js';
import { roundPrice } from './market.js';
import { netWorth } from './ending.js';
import { info, sfx, talk } from './steps.js';

// ---------------- 飽和度 ----------------
// 仕入れ先ごとの key：ルート（store / online / auction / wholesale）か、開拓した仕入れ先の id
export const SAT_MAX = 100;
const SOURCE_ROUTE = { store: 'store', used: 'store', luxury: 'store', online: 'online', preorder: 'online', flea: 'online', shady: 'online', auction: 'auction', wholesale: 'wholesale' };
export const satKeyOf = (source) => (SPOT_MAP[source] ? source : SOURCE_ROUTE[source] || null);
export const satNameOf = (key) => SPOT_MAP[key]?.name || PIONEER_ROUTES[key] || key;

export const saturation = (s, key) => s.saturation?.[key] || 0;
export const exclusive = (s, key) => (s.exclusive?.[key] || -1) > s.week;

export function addSaturation(s, key, n, { rival = false } = {}) {
  if (!key) return;
  if (n > 0 && exclusive(s, key)) n = rival ? 0 : n * 0.5; // 独占契約中はライバルが入れない
  s.saturation = { ...(s.saturation || {}), [key]: Math.max(0, Math.min(SAT_MAX, saturation(s, key) + n)) };
}

// 仕入れ値の倍率と、仕入れ候補の数の倍率
export const satPriceMult = (s, key) => 1 + saturation(s, key) / 250;
export const satCountMult = (s, key) => 1 - saturation(s, key) / 200;

// 自分が回ると荒れる（1回 +2.5、夜は +1.25）。開拓した仕入れ先は、そこで買うたびに荒れる
export const SAT_PER_TRIP = 2.5;
export const SAT_PER_SPOT_BUY = 2;

// 週ごと：放っておけば落ち着く（使った週 -2.5、使わなかった週 -4）。週1回のペースなら荒れない
export function decaySaturation(s) {
  const used = s.satUsed || {};
  for (const key of Object.keys(s.saturation || {})) addSaturation(s, key, used[key] === s.week ? -2.5 : -4);
}
export const markSatUsed = (s, key) => { s.satUsed = { ...(s.satUsed || {}), [key]: s.week }; };

// 仕入れ候補に飽和度を反映する：定価で買う品薄品（抽選・行列・在庫復活）は除き、値上げして数を減らす
export function applySaturation(s, offers, route) {
  const keep = Math.max(2, Math.ceil(offers.length * satCountMult(s, route)));
  const out = offers.slice(0, keep);
  for (const o of out) {
    if (o.scarce || !o.price || o.unknown) continue;
    const key = satKeyOf(o.source) || route;
    o.price = roundPrice(o.price * satPriceMult(s, key));
    if (saturation(s, key) >= 30) o.sat = Math.round(saturation(s, key));
  }
  return out;
}

// 荒れ具合のひとこと（行動を選んだときの説明・仕入れ先の画面）
export function satLine(s, route) {
  const v = Math.round(saturation(s, route));
  if (v < 15) return '';
  const word = v >= 70 ? 'かなり荒れている' : v >= 40 ? '荒れてきた' : '少し人が増えた';
  return `荒れ具合 ${v}%（${word}・仕入れ値+${Math.round((satPriceMult(s, route) - 1) * 100)}%）`;
}

// ---------------- 独占契約 ----------------
export const EXCLUSIVE_WEEKS = 24;
export const exclusiveCost = (s, key) => ({ cash: (SPOT_MAP[key] ? 200000 : 400000) * Math.max(1, s.stage - 1), social: 120 });

export function signExclusive(s, key) {
  const c = exclusiveCost(s, key);
  if (exclusive(s, key) || s.cash < c.cash || (s.exp.social || 0) < c.social) return false;
  addExpense(s, c.cash, `独占契約（${satNameOf(key)}）`);
  s.exp.social -= c.social;
  s.exclusive = { ...(s.exclusive || {}), [key]: s.week + EXCLUSIVE_WEEKS };
  addSaturation(s, key, -25);
  return true;
}

// ---------------- ライバル転売屋 ----------------
// マイクリのエネミー「ゴースト・偉人」＝金に取り憑かれた偉人の亡霊。転売ボットはウイルス系のエネミー
export const RIVALS = [
  {
    id: 'cao', cast: 'rival_cao', name: 'ゴースト・曹操', style: '店舗の買い占め', stage: 3, start: 1.3, growth: 0.024,
    intro: '「この街の棚は、すべて余のものよ。ワゴンの奥まで、根こそぎな」',
    lose: '「……ほう。余を抜くか。だが覇道は長いぞ」',
  },
  {
    id: 'edison', cast: 'rival_edison', name: 'ゴースト・エジソン', style: '転売ボット', stage: 3, start: 1.6, growth: 0.029,
    intro: '「1%のひらめきと、99%のボットだよ。在庫復活？ 君がF5を押す前に、私のボットが買っている」',
    lose: '「私のボットより速い人間がいるとは。……実験は失敗だ」',
  },
  {
    id: 'gogh', cast: 'rival_gogh', name: 'ゴースト・ゴッホ', style: 'アート・競り', stage: 4, start: 1.1, growth: 0.019,
    intro: '「業者オークションで、君が札を入れた品…私も欲しいんだ。いくらでも出すよ」',
    lose: '「生きているうちに一枚も売れなかった私が、また負けた…」',
  },
  {
    id: 'billy', cast: 'rival_billy', name: 'ゴースト・ビリー・ザ・キッド', style: '価格破壊', stage: 4, start: 2.0, growth: 0.03,
    intro: '「同じ品を、お前より1割安く並べてやる。早撃ち勝負だ」',
    lose: '「……弾切れだ。お前の勝ちだよ」',
  },
];
export const RIVAL_MAP = Object.fromEntries(RIVALS.map((r) => [r.id, r]));
export const activeRivals = (s) => RIVALS.filter((r) => s.rivals?.[r.id]);

// ライバルが動く。週のはじめに呼び、演出の steps を返す
export function rivalWeek(s) {
  if (s.underworld) return [];
  const steps = [];
  s.rivals ||= {};
  // 登場：そのステージになったら、1人ずつ乗り込んでくる
  const next = RIVALS.find((r) => !s.rivals[r.id] && s.stage >= r.stage);
  if (next && s.week >= (s.flags.rivalCool || 0)) {
    s.rivals[next.id] = { nw: Math.max(3000000, Math.round(netWorth(s) * next.start)), since: s.week, passed: false };
    s.flags.rivalCool = s.week + 12;
    steps.push(sfx('trouble'), talk(next.cast, next.intro), info('ライバル転売屋', [`${next.name}（${next.style}）があらわれた`, '仕入れ先を荒らし、毎月の長者番付で競ってくる', '「メニュー → 業界の動き」で荒れ具合と番付を確かめられる'], 'bad'));
    return steps;
  }
  // 行動：毎週それぞれ低い確率で仕掛けてくる
  for (const r of activeRivals(s)) {
    if (!chance(s, 0.03 + 0.01 * s.stage)) continue;
    const act = ACTIONS[r.id](s, r);
    if (act.length) {
      steps.push(...act);
      break; // 1週に1人まで
    }
  }
  return steps;
}

// いちばん使っている仕入れ先（ライバルはそこを狙う）
function favoriteKey(s) {
  const keys = ['store', 'online', ...openSpots(s, 'store').map((x) => x.id), ...openSpots(s, 'online').map((x) => x.id)];
  const use = (k) => (SPOT_MAP[k] ? 1 : 0) + (s.routeUse?.[k] || 0) + (s.satUsed?.[k] === s.week - 1 ? 5 : 0);
  return keys.sort((a, b) => use(b) - use(a))[0];
}

const ACTIONS = {
  // 曹操：仕入れ先に乗り込んで買い占める
  cao(s, r) {
    const key = favoriteKey(s);
    if (exclusive(s, key)) return [talk(r.cast, `「${satNameOf(key)}が独占契約だと…？ ちっ、次の街へ行く」`), info('独占契約が効いた', [`${satNameOf(key)}は荒らされなかった`], 'good')];
    addSaturation(s, key, 30, { rival: true });
    return [sfx('trouble'), talk(r.cast, `「${satNameOf(key)}の棚、余がいただいた」`), info('仕入れ先が荒らされた', [`${satNameOf(key)}の荒れ具合 ${Math.round(saturation(s, key))}%`, '掘り出し物が減り、仕入れ値が上がる', '新しい仕入れ先を開拓するか、しばらく別のルートへ'], 'bad')];
  },
  // エジソン：ボットで抽選・在庫復活を総取り（8週）
  edison(s, r) {
    if ((s.rivalFx?.botUntil || 0) > s.week) return [];
    s.rivalFx = { ...(s.rivalFx || {}), botUntil: s.week + 8 };
    addSaturation(s, 'online', 15, { rival: true });
    return [sfx('trouble'), talk(r.cast, '「新しいボットを動かした。在庫復活も抽選も、しばらくは私のものだ」'), info('転売ボットが暴れている', ['8週間、抽選の当選率が下がり、在庫復活に気づけない', '電脳せどりの荒れ具合も上がった'], 'bad')];
  },
  // ゴッホ：業者オークションで競り合う（8週、落札価格が上がる）
  gogh(s, r) {
    if (!s.skills.includes('src_auction')) return [];
    addSaturation(s, 'auction', 35, { rival: true });
    return [sfx('trouble'), talk(r.cast, '「その品、私も入札するよ。……ほら、また値が上がった」'), info('オークションの競り合い', [`業者オークションの荒れ具合 ${Math.round(saturation(s, 'auction'))}%`, '落札価格が上がる'], 'bad')];
  },
  // ビリー：同じ品を安く並べる（その商品の相場が下がる）
  billy(s, r) {
    const listed = s.inventory.filter((u) => u.listing);
    if (!listed.length) return [];
    const count = {};
    for (const u of listed) count[u.pid] = (count[u.pid] || 0) + 1;
    const pid = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
    const m = s.market[pid];
    const drop = randRange(s, 0.12, 0.2);
    m.p *= 1 - drop;
    return [sfx('trouble'), talk(r.cast, `「${productOf(pid).name}、お前より安く並べておいたぜ」`), info('値下げ合戦', [`「${productOf(pid).name}」の相場が${Math.round(drop * 100)}%下がった`, '同じ品を追いかけて値下げするか、自分の店・別の販路に逃げるか'], 'bad')];
  },
};

// 転売ボットの影響（offers が参照）
export const botActive = (s) => (s.rivalFx?.botUntil || 0) > s.week;

// 月末：ライバルの資産が増え、長者番付を更新する。抜いたら演出
export function rivalsMonthly(s) {
  const steps = [];
  const mine = netWorth(s);
  for (const r of activeRivals(s)) {
    const st = s.rivals[r.id];
    st.nw = Math.round(st.nw * (1 + r.growth + randRange(s, -0.02, 0.02)) + randInt(s, 100000, 400000));
    if (!st.passed && mine > st.nw) {
      st.passed = true;
      addExp(s, { social: 30, mind: 30 });
      steps.push(sfx('stageup'), talk(r.cast, r.lose), info('長者番付で抜いた！', [`${r.name}を追い抜いた`, '対人+30・精神+30'], 'good'));
    } else if (st.passed && mine < st.nw * 0.9) {
      st.passed = false; // 抜き返された
      steps.push(talk(r.cast, `「番付を見たか？ ${yen(st.nw)}。追い抜いてやったぞ」`));
    }
  }
  return steps;
}

// 長者番付（自分を含めて資産順）
export function ranking(s) {
  const rows = activeRivals(s).map((r) => ({ id: r.id, name: r.name, cast: r.cast, style: r.style, nw: s.rivals[r.id].nw }));
  rows.push({ id: 'me', name: 'クリス（あなた）', cast: 'chris', style: '', nw: netWorth(s) });
  return rows.sort((a, b) => b.nw - a.nw);
}

// 物販交流会：情報を出すと、いちばん使っている仕入れ先が少し荒れる
export function meetupLeak(s) {
  const key = favoriteKey(s);
  addSaturation(s, key, 8);
  return key;
}

// 1回の仕入れで、その仕入れルートが荒れる（夜の軽い作業は半分）
export function tripSaturation(s, route, night = false) {
  addSaturation(s, route, SAT_PER_TRIP * (night ? 0.5 : 1));
  markSatUsed(s, route);
}
