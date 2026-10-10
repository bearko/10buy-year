// 業界の年表：5年目から毎年、その年の大事件が1つ起きる。
// 年の初めにノストラダムスが予告 → 春（13週目）に始まる → 年末（47週目）にミッションの結果。
// 事件はプレイヤーの稼ぎ方に応じて選ぶ（いちばん稼いでいる商材・販路に関係する事件が出やすい）
import { addExp, addMood, addToku } from './effects.js';
import { pick, weightedPick } from './rng.js';
import { woy, yearOf } from './calendar.js';
import { forceRegime } from './regimes.js';
import { addSaturation } from './rivals.js';
import { info, sfx, talk } from './steps.js';

export const ANNALS_FROM_YEAR = 5;
const START_WOY = 12;
const END_WOY = 46;

const tally = (s) => s.tally || { aud: {}, plat: {}, rev: {} };
const diff = (s, a, kind, key) => (tally(s)[kind][key] || 0) - (a.base?.[kind]?.[key] || 0);
const yearNet = (s, y) => s.monthly.filter((m) => m.year === y).reduce((x, m) => x + m.net, 0);
const revShare = (s, plat) => {
  const r = tally(s).rev;
  const total = Object.values(r).reduce((x, v) => x + v, 0);
  return total ? (r[plat] || 0) / total : 0;
};

export const ANNALS = {
  regime_year: {
    name: '転売対策元年',
    weight: (s) => 1 + (s.heat?.lottery || 0) / 50 + (s.heat?.queue || 0) / 50,
    announce: '大手メーカーが一斉に転売対策に乗り出す年になるでしょう。抽選も行列も、今までどおりとはいきません',
    start: (s) => { forceRegime(s, 'lottery_id') || forceRegime(s, 'buy_limit'); return ['大手メーカーが一斉に転売対策を発表した（抽選の本人確認・購入制限）']; },
    mission: { title: '規制の年も、年間の純利益を去年の8割以上に保つ', check: (s, a) => yearNet(s, a.year) >= yearNet(s, a.year - 1) * 0.8 },
  },
  rivals_invade: {
    name: 'せどり四天王の上京',
    weight: (s) => 1 + Object.keys(s.rivals || {}).length * 0.5,
    announce: '地方で名を上げた転売屋たちが、あなたの街に乗り込んでくるでしょう',
    start: (s) => { addSaturation(s, 'store', 30, { rival: true }); addSaturation(s, 'online', 30, { rival: true }); return ['ライバル転売屋がいっせいに乗り込んできた', '店舗せどり・電脳せどりが大きく荒れた']; },
    mission: { title: '今年、新しい仕入れ先を開拓するか、独占契約を結ぶ', check: (s, a) => (s.spots || []).length > (a.base.spots || 0) || Object.values(s.exclusive || {}).some((w) => w > a.startWeek) },
  },
  live_bubble: {
    name: 'ライブコマースバブル',
    weight: (s) => 1 + (s.audience?.beauty || 0) / 300,
    announce: '配信で物が売れる年になるでしょう。美容の品は、画面の向こうで飛ぶように売れます',
    start: (s) => { s.annalFx = { aud: 'beauty', mult: 1.25, until: yearEndWeek(s) }; return ['美容の品の相場が 25% 上がった（年末まで）']; },
    mission: { title: '今年、美容の品を40点売る', check: (s, a) => diff(s, a, 'aud', 'beauty') >= 40 },
  },
  yen_shock: {
    name: '円安ショック',
    weight: (s) => (s.certs?.includes('export') ? 1.5 + revShare(s, 'exp') * 10 : 0.3),
    announce: '円が大きく売られる年になるでしょう。海外に売る人には追い風、海外から買う人には向かい風です',
    start: (s) => { s.fxBias = { bias: 0.2, until: yearEndWeek(s) }; return ['為替が円安に振れた（海外ECの売値が上がる・年末まで）']; },
    mission: { title: '今年、海外ECで20点売る', check: (s, a) => diff(s, a, 'plat', 'exp') >= 20 },
  },
  fleamarket_ipo: {
    name: 'フリマ大手の上場',
    weight: (s) => 1 + revShare(s, 'merc') * 3,
    announce: 'フリマ大手が上場する年になるでしょう。株主のために、手数料は上がります',
    start: (s) => (forceRegime(s, 'fee_hike') ? ['プンシーが手数料の改定を発表した'] : ['プンシーが上場した。……手数料はすでに上がっている']),
    mission: { title: '今年の売上の半分以上を、プンシー以外の販路で', check: (s, a) => { const merc = diff(s, a, 'rev', 'merc'); const all = Object.keys(tally(s).rev).reduce((x, k) => x + diff(s, a, 'rev', k), 0); return all > 0 && merc / all < 0.5; } },
  },
  inbound_boom: {
    name: '訪日客ブーム',
    weight: (s) => 1 + (s.audience?.inbound || 0) / 300,
    announce: '海外からのお客さまが過去最高になる年でしょう。和の品が見直されます',
    start: (s) => { s.annalFx = { aud: 'inbound', mult: 1.25, until: yearEndWeek(s) }; return ['和雑貨・工芸の相場が 25% 上がった（年末まで）']; },
    mission: { title: '今年、和雑貨・工芸を40点売る', check: (s, a) => diff(s, a, 'aud', 'inbound') >= 40 },
  },
  collector_boom: {
    name: 'アートバブル',
    weight: (s) => 0.6 + (s.collection || []).length / 10 + (s.audience?.collector || 0) / 600,
    announce: '美術品と骨董の値が跳ねる年になるでしょう。持っている人は笑い、これから集める人は泣きます',
    start: (s) => { for (const c of s.collection || []) c.value = Math.round(c.value * 1.2); s.annalFx = { aud: 'collector', mult: 1.15, until: yearEndWeek(s) }; return ['コレクションの評価額が 20% 上がった', 'コレクター品の相場が 15% 上がった（年末まで）']; },
    mission: { title: '今年、コレクションを5点増やす', check: (s, a) => (s.collection || []).length - (a.base.collection || 0) >= 5 },
  },
};

const yearEndWeek = (s) => (yearOf(s.week) - 1) * 48 + 48;

export const currentAnnal = (s) => (s.annals || []).find((a) => a.year === yearOf(s.week));

// 週のはじめ
export function annalWeek(s) {
  if (s.underworld) return [];
  const y = yearOf(s.week);
  const w = woy(s.week);
  const a = currentAnnal(s);
  // 年の初め：予告
  if (!a && y >= ANNALS_FROM_YEAR && w <= 2) {
    const used = new Set((s.annals || []).map((x) => x.id));
    const pool = Object.entries(ANNALS).filter(([id]) => !used.has(id)).map(([id, d]) => ({ id, weight: Math.max(0.1, d.weight(s)) }));
    const pickd = pool.length ? weightedPick(s, pool) : { id: pick(s, Object.keys(ANNALS)) };
    const d = ANNALS[pickd.id];
    (s.annals ||= []).push({ id: pickd.id, year: y, phase: 'announced' });
    return [sfx('hint'), talk('nostra', `「${y}年目の予言じゃ。……${d.announce}」`), info(`今年の業界：${d.name}`, [d.announce, `春（${START_WOY + 1}週目）から始まる`, `今年のミッション：${d.mission.title}`])];
  }
  if (!a) return [];
  const d = ANNALS[a.id];
  // 春：始まる
  if (a.phase === 'announced' && w >= START_WOY) {
    a.phase = 'started';
    a.startWeek = s.week;
    a.base = { aud: { ...tally(s).aud }, plat: { ...tally(s).plat }, rev: { ...tally(s).rev }, spots: (s.spots || []).length, collection: (s.collection || []).length };
    return [sfx('trouble'), info(`${d.name}が始まった`, [...d.start(s), `ミッション：${d.mission.title}（年末まで）`], 'bad')];
  }
  // 年末：ミッションの結果
  if (a.phase === 'started' && w >= END_WOY) {
    a.phase = 'done';
    a.result = d.mission.check(s, a) ? 'clear' : 'fail';
    if (a.result === 'clear') {
      addExp(s, { info: 80, social: 80, mind: 40 });
      addToku(s, 3);
      addMood(s, 1);
      return [sfx('stageup'), talk('nostra', '「予言を越えたか。……おぬしは、時代に呑まれぬ商人じゃな」'), info(`${d.name}：ミッション達成`, [d.mission.title, '情報・対人 +80、精神 +40、TOKU +3、やる気が上がった'], 'good')];
    }
    return [talk('nostra', '「時代の波に、今年は呑まれたようじゃな。……来年もまた、何かが起きる」'), info(`${d.name}：ミッション失敗`, [d.mission.title, '（ペナルティはない）'])];
  }
  return [];
}
