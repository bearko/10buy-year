// 店にいる人たち：ヒーローは店員や買い物客、同業者（転売屋）はエネミー。
// 話しかけることはできないが、頭の上の吹き出しで独り言（10文字以内）が見える。
// ときどき頭の上にオレンジの「！」が出て、タップすると出会いのイベントが起きる
// （経験点・仕入れ先の情報・バックヤードの在庫・ミッションの依頼）
import { PRODUCTS, productOf } from '../data/products.js';
import { addExp } from './effects.js';
import { isReleased, priceOf } from './market.js';
import { specialOffer } from './offers.js';
import { nextSpot, PIONEER_ROUTES } from './pioneer.js';
import { acceptQuest, QUESTS, rewardText } from './quests.js';
import { chance, pick, randInt } from './rng.js';

// 店の種類ごとの店員さん
const STAFF = { kaden: ['edison'], drug: ['nightingale'], zakka: ['yohki', 'cleo'], hobby: ['gennai'], used: ['hokusai'], book: ['ikkyu'], luxury: ['marie'], spot: ['ryoma', 'hokusai'] };
const CUSTOMERS = ['ino', 'newton', 'mitsunari', 'nobunaga', 'marie', 'marco', 'yukichi', 'santa', 'satoshi', 'marx', 'cleo', 'nostra', 'ryoma', 'ieyasu'];
const RIVALS = ['nego', 'fakeseller', 'swapper', 'ghost'];
const RIVAL_BOSS = ['rival_cao', 'rival_billy'];

// 独り言（10文字以内）
const STAFF_LINES = ['いらっしゃいませ', '品出し中です', '本日ポイント5倍', '値札を貼り替え中', 'レジどうぞー', '在庫は裏です', 'セール始めます'];
const CUSTOMER_LINES = ['電池どこだっけ', 'これ安いな…', '迷うなぁ', '頼まれ物は…', 'ポイント使おう', 'あと1個ない？', '新作まだかな', '見るだけ見るだけ'];
const RIVAL_LINES = ['ピッ、ピッ…', '全部いただく', '利益出るぞ…', 'ワゴンは俺のだ', '型番メモ…', '先を越された', 'この棚は外れか', '相場より安い！'];
const OWN_LINES = {
  ino: ['通路を測量中', '歩数で測るのだ'], edison: ['この電球は…', '試作品も置きたい'], newton: ['リンゴ売ってる？', '落ちてる値札だ'],
  nightingale: ['包帯の在庫は？', '休憩も大事よ'], marie: ['全部くださる？', 'お菓子はどこ？'], nobunaga: ['楽市楽座じゃ', '是非もなし'],
  ikkyu: ['とんちで値切る', 'このはし…？'], hokusai: ['この壺、良い', '線が生きとる'], mitsunari: ['レシート要る', '帳簿が合わぬ'],
  yukichi: ['万札使えます？', '学問も買い物も'], satoshi: ['仮想通貨可？', 'チャートが…'], marco: ['東方にない品だ', '珍しい香辛料'],
  ryoma: ['船に積めるか', '日本の夜明けぜよ'], gennai: ['うたい文句…', '土用の丑の日！'], nostra: ['値上がり予言', '星がささやく'],
  marx: ['価値とは何か', '剰余価値…'], santa: ['子どもへの贈り物', 'リストは…'], yohki: ['美容液どこ？', '肌が命よ'],
  cleo: ['流行はこれね', '真珠はある？'], ieyasu: ['転売…見張る', '鳴くまで待とう'],
};
const lineOf = (s, who, role) => pick(s, [...(OWN_LINES[who] || []), ...(role === 'staff' ? STAFF_LINES : role === 'rival' ? RIVAL_LINES : CUSTOMER_LINES)]);

// ヒーローが話すと、そのヒーローにちなんだ経験点
const EXP_OF = { ino: 'act', edison: 'tech', newton: 'info', nightingale: 'mind', marie: 'social', nobunaga: 'act', ikkyu: 'mind', hokusai: 'info', mitsunari: 'info', yukichi: 'info', satoshi: 'tech', marco: 'social', ryoma: 'social', gennai: 'tech', nostra: 'info', marx: 'mind', santa: 'social', yohki: 'social', cleo: 'social', ieyasu: 'mind' };
const TIPS = {
  ino: '店は入口から右回りに見ると、見落としが減るぞ。地図は足で描くものじゃ。',
  edison: '型落ちになる前の週、ワゴンに旧型が出るんだ。発売日カレンダーを見ておくといい。',
  newton: '値段も重力と同じさ。上がったものは、いつか落ちる。売り時を逃さないことだね。',
  nightingale: '疲れていると、偽物を見落としますよ。数字は正直です。',
  marie: 'あら、あなたもお買い物？ 高い物ほど、箱と保証書を大事になさいな。',
  nobunaga: '仕入れは速さじゃ。迷うておるうちに、ほかの者に取られるぞ。',
  ikkyu: '「安い」と書いてある札ほど、よく見なされ。一休み、一休み。',
  hokusai: '古い物は、裏の刻印と線を見る。写しは線が死んでおる。',
  mitsunari: '仕入れたら、その日のうちに帳簿に付けよ。あとで泣くのはお主だ。',
  yukichi: '天は人の上に人を造らず。されど、相場を知る者と知らぬ者はおる。',
  satoshi: '…きみ、今日はコインの話はしないよ。ここのワゴン、悪くないね。',
  marco: '東の国では、同じ品が倍の値で売れることもある。海の向こうも見ておくことだ。',
  ryoma: '仕入れ先は一つに頼らんほうがええ。新しい港をいくつも持つんじゃ。',
  gennai: '売れる説明文には「季節」と「限定」を入れるのさ。土用の丑の日みたいにね。',
  nostra: '…星によれば、来月はこの棚が荒れる。たぶん。',
  marx: '労働に見合った利益かね？ 自分の時給も計算したまえ。',
  santa: '12月は贈り物が飛ぶように売れる。早めに仕入れておくといい。',
  yohki: 'コスメは限定色が強いのよ。発売日の朝に並ぶ人も多いわ。',
  cleo: '流行は、つくる人のところに先に来るの。SNSを見ておきなさい。',
  ieyasu: '買い占めは目立つ。目立てば、こちらも手を打たねばならん。ほどほどにな。',
};

// 店ごとの人たち（2〜3人）。ときどき1人に「！」
export function storeFolk(s, store) {
  const folk = [];
  const staff = pick(s, STAFF[store.type] || ['edison']);
  folk.push({ who: staff, role: 'staff' });
  folk.push({ who: pick(s, CUSTOMERS.filter((x) => x !== staff)), role: 'customer' });
  if (chance(s, 0.6)) folk.push({ who: pick(s, s.stage >= 3 && Object.keys(s.rivals || {}).length ? [...RIVALS, ...RIVAL_BOSS] : RIVALS), role: 'rival' });
  for (const f of folk) f.line = lineOf(s, f.who, f.role);
  if (chance(s, 0.4)) pick(s, folk).bang = true;
  return folk;
}

// 「！」を押したとき。UI は lines を吹き出しで見せ、result を結果として出す。offer があれば今いる店の棚に加える
export function folkEvent(s, f, store) {
  f.bang = false;
  s.stats.storeTalks = (s.stats.storeTalks || 0) + 1;
  const name = f.who;
  // 店員さん：バックヤードの在庫
  if (f.role === 'staff' && chance(s, 0.45)) {
    const cands = PRODUCTS.filter((p) => ['staple', 'seasonal', 'boom'].includes(p.kind) && isReleased(s, p) && p.retail < 100000);
    const p = pick(s, cands);
    const price = Math.max(10, Math.round((Math.min(p.retail, priceOf(s, p.id)) * (0.5 + randInt(s, 0, 15) / 100)) / 10) * 10);
    const o = specialOffer(s, p.id, { source: 'store', label: 'バックヤードの在庫（店員さんのおすすめ）', price, maxQty: randInt(s, 2, 4) });
    return { who: name, lines: ['実は、裏に少しだけ在庫があるんです。お出ししましょうか？'], result: [`「${productOf(p.id).name}」が売り場に出てきた`], offer: o, tone: 'good' };
  }
  // 同業者：仕入れ先のうわさ（開拓が進む）
  if (f.role === 'rival') {
    const route = pick(s, ['store', 'online']);
    s.routeUse = { ...(s.routeUse || {}), [route]: (s.routeUse?.[route] || 0) + 3 };
    const nx = nextSpot(s, route);
    addExp(s, { info: 10 + s.stage * 5 });
    return {
      who: name,
      lines: [pick(s, ['……お前も転売屋か。ここはもう荒れてるぜ。', 'ちっ、同業か。いい店、知ってるんだろうな？', 'ここだけの話だぞ。']), `${PIONEER_ROUTES[route]}なら、まだ誰も行ってない仕入れ先があるらしい。`],
      result: [`${PIONEER_ROUTES[route]}の開拓が3回分すすんだ`, nx && !nx.stageLock && nx.left > 0 ? `あと${nx.left}回で見つかりそう` : '', `情報 +${10 + s.stage * 5}`].filter(Boolean),
      tone: 'good',
    };
  }
  // ヒーロー：ミッションの依頼（その人の頼みごとがあれば）
  const qid = Object.keys(QUESTS).find((k) => QUESTS[k].from === name);
  if (qid && chance(s, 0.5) && acceptQuest(s, qid)) {
    const d = QUESTS[qid];
    return { who: name, lines: [d.pitch], result: [`ミッション：${d.title}`, `報酬：${rewardText(d)}`], quest: qid, tone: 'good' };
  }
  // ヒーロー：ひとこと助言と経験点
  const k = EXP_OF[name] || 'info';
  const v = 15 + s.stage * 10;
  addExp(s, { [k]: v });
  const names = { info: '情報', act: '行動', tech: '技術', social: '対人', mind: '精神' };
  return { who: name, lines: [TIPS[name] || 'いい店だね。また来るよ。'], result: [`${names[k]} +${v}`], tone: 'good' };
}
