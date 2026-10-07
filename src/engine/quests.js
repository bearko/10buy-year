// ミッション：お金の目標とは別の、小さな目標。マインが告げるものと、店で出会った人から頼まれるものがある。
// 使ったことのない機能・仕入れルートを試すきっかけにする（例：メニューの「経営」から繰上げ返済できる）。
// 報酬はお金ではなく、まとまった経験点か、新しい仕入れ先
import { addExp, flag } from './effects.js';
import { nextSpot, PIONEER_ROUTES, SPOT_MAP } from './pioneer.js';
import { hasLicense } from './offers.js';
import { info, sfx, talk } from './steps.js';

export const MAX_ACTIVE = 3;
export const QUEST_WEEKS = 24; // この週数で期限切れ（できないミッションで詰まらないように）
export const bump = (s, key, n = 1) => {
  s.stats[key] = (s.stats[key] || 0) + n;
};
const stat = (key) => (s) => s.stats[key] || 0;
const can = (s, id) => s.skills.includes(id);

// kind：count（引き受けてからの増えた分）/ max（これまでの最高）/ state（いまの状態）
// guide：ミッション画面の「やってみる」で開く画面（UI 側で解釈）
export const QUESTS = {
  // ---- マインから（ステージ1〜） ----
  q_three_shops: { from: 'mine', stage: 1, title: '1日で3店舗を回る', desc: '店舗せどりで、閉店までに3つの店を回ってみよう。近い店から回るのがコツ。', kind: 'max', value: stat('maxStores'), target: 3, reward: { exp: { act: 40 } }, pitch: '店舗せどりは足が命よ。まずは1日で3店舗、回ってみなさい。', when: (s) => can(s, 'src_store') },
  q_research: { from: 'mine', stage: 1, title: 'スマホで相場を5回調べる', desc: '商品ページの「相場」のタブで、売り切れ価格を調べてみよう。', kind: 'count', value: stat('soldChecks'), target: 5, reward: { exp: { info: 40 } }, pitch: '値札だけ見て買うのは素人よ。買う前に、売り切れの値段を調べる癖をつけなさい。', when: (s) => can(s, 'src_store') },
  q_repay: { from: 'mine', stage: 1, title: '借金を10万円、繰上げ返済する', desc: 'メニューの「経営」から、いつでも繰上げ返済できる。早く返すほど利息が減る。', kind: 'count', value: stat('prepaid'), target: 100000, unit: '円', reward: { exp: { mind: 60 } }, guide: 'biz', pitch: '知ってた？ 借金は月末を待たなくても、メニューの「経営」から返せるのよ。利息がもったいないでしょ。', when: (s) => s.debt >= 150000 && s.cash >= 120000 },
  q_list10: { from: 'mine', stage: 1, title: '10点を出品する', desc: '在庫は寝かせても売れない。「在庫」から出品しよう。', kind: 'count', value: stat('listed'), target: 10, reward: { exp: { tech: 40 } }, guide: 'inv', pitch: '仕入れただけで満足してない？ 売れるのは出品した物だけよ。' },
  q_online_first: { from: 'mine', stage: 1, title: '電脳せどりで1点仕入れる', desc: '夜のスマホで、通知や新着から安い出品を探してみよう。', kind: 'count', value: stat('phoneBuys'), target: 1, reward: { exp: { info: 40 } }, pitch: '夜は電脳せどりの時間よ。通知が来たら、すぐ見に行くこと。', when: (s) => can(s, 'src_online') },
  // ---- ステージ2〜 ----
  q_nego: { from: 'mine', stage: 2, title: 'フリマで値下げ交渉を成功させる', desc: '電脳せどりのフリマで、コメントから値下げをお願いしてみよう。大きく値切ると断られる。', kind: 'count', value: stat('negoWins'), target: 1, reward: { exp: { social: 60 } }, pitch: '欲しい出品があったら、コメントで値下げをお願いするのも手よ。ほどほどにね。', when: (s) => can(s, 'src_flea') && hasLicense(s) },
  q_auction: { from: 'mine', stage: 2, title: 'ネットオークションで落札する', desc: 'ミィームのオークションに上限額で入札。自動延長がなければ、終了間際の入札も効く。', kind: 'count', value: stat('aucWins'), target: 1, reward: { exp: { tech: 60 } }, pitch: 'オークションは上限額を決めて入札するの。熱くなったら負けよ。', when: (s) => can(s, 'src_flea') && hasLicense(s) },
  q_five_shops: { from: 'mine', stage: 2, title: '1日で5店舗を回る', desc: '地図・車・目利きで、店を回る時間を短くしよう。', kind: 'max', value: stat('maxStores'), target: 5, reward: { spot: 'store' }, pitch: '1日で5店舗回れたら一人前ね。そしたら、わたしが知ってる店を教えてあげる。', when: (s) => can(s, 'src_store') },
  q_lottery: { from: 'mine', stage: 2, title: '抽選に応募する', desc: '発売前の限定品は、抽選で定価で買える。結果はメールで届く。', kind: 'count', value: stat('lotteryApplied'), target: 1, reward: { exp: { info: 50 } }, pitch: '限定品は抽選もあるわ。外れて当たり前。応募しないと当たらないのよ。', when: (s) => can(s, 'src_lottery') },
  q_talk: { from: 'mine', stage: 2, title: '店で3人と話す', desc: '店にいる人の頭に「！」が出ていたら、タップして話しかけてみよう。', kind: 'count', value: stat('storeTalks'), target: 3, reward: { exp: { social: 70 } }, pitch: '店には、いろんな人がいるわ。頭に「！」が出ている人は、何か話したそうよ。' },
  // ---- ステージ3〜 ----
  q_exclusive: { from: 'mine', stage: 3, title: '仕入れ先と独占契約を結ぶ', desc: 'メニューの「業界の動き」から、荒れてきた仕入れ先と独占契約を結べる。', kind: 'state', value: (s) => (Object.keys(s.exclusive || {}).length ? 1 : 0), target: 1, reward: { exp: { social: 100 } }, guide: 'rivals', pitch: 'ライバルに荒らされる前に、仕入れ先と独占契約を結ぶのも手よ。メニューの「業界の動き」を見て。' },
  q_policy: { from: 'mine', stage: 3, title: '取引方針を決める', desc: 'メニューの「取引方針」で、値下げ交渉やトラブルへのいつもの対応を決めておける。', kind: 'state', value: (s) => (s.settings?.deal ? 1 : 0), target: 1, reward: { exp: { mind: 80 } }, guide: 'deal', pitch: '値下げ交渉に毎回つきあってたら身がもたないわ。いつもの対応を「取引方針」で決めておきなさい。' },
  q_online_spot: { from: 'mine', stage: 3, title: '電脳せどりを15回する', desc: '夜のスマホを続けていると、新しい仕入れ先が見つかる。', kind: 'count', value: (s) => s.routeUse?.online || 0, target: 15, reward: { spot: 'online' }, pitch: 'ネットの海は広いわ。続けていれば、まだ誰も知らない仕入れ先が見つかるはずよ。', when: (s) => can(s, 'src_online') },
  // ---- ステージ4〜 ----
  q_invest: { from: 'mine', stage: 4, title: '仕入れ先に出資する', desc: 'メニューの「業界の動き」で、開拓した仕入れ先に出資できる。品ぞろえが増えて配当も入る。', kind: 'state', value: (s) => (Object.values(s.investTotal || {}).reduce((a, v) => a + v, 0) > 0 ? 1 : 0), target: 1, reward: { exp: { social: 150, mind: 50 } }, guide: 'rivals', pitch: '余ったお金は、寝かせておくより仕入れ先に出資したら？ 品ぞろえが増えるわよ。', when: (s) => (s.spots || []).length > 0 },
  q_collection: { from: 'mine', stage: 4, title: 'コレクションを1点買う', desc: 'メニューの「コレクション」。売るためじゃない、手元に置く1点。', kind: 'state', value: (s) => ((s.collection || []).length ? 1 : 0), target: 1, reward: { exp: { info: 120, mind: 80 } }, guide: 'collection', pitch: 'たまには、売るためじゃなく自分のために買ってみたら？', when: (s) => !!s.dept },
  // ---- 店で出会った人から ----
  h_ino: { from: 'ino', title: '1日で6店舗を回る', desc: '伊能忠敬「回れたら、わしの地図の写しをやろう」', kind: 'max', value: stat('maxStores'), target: 6, reward: { spot: 'store' }, pitch: '歩けば道はひらける。1日で6つの店を回れたら、わしの地図の写しをやろう。' },
  h_edison: { from: 'edison', title: '相場を10回調べる', desc: 'エジソン「失敗ではない。うまくいかない値段を見つけただけだ」', kind: 'count', value: stat('soldChecks'), target: 10, reward: { exp: { tech: 90 } }, pitch: '買う前に10回、売れた値段を調べてごらん。数字は嘘をつかない。' },
  h_mitsunari: { from: 'mitsunari', title: '在庫を20点売る', desc: '石田三成「帳簿は、売ってこそ締まる」', kind: 'count', value: stat('soldUnits'), target: 20, reward: { exp: { info: 80 } }, pitch: '仕入れの額より、売った数を数えよ。20点売ったら、帳簿の付け方を教えてやる。' },
  h_nobunaga: { from: 'nobunaga', title: '店舗せどりを10回する', desc: '織田信長「天下は足で取るものよ」', kind: 'count', value: stat('storeTrips'), target: 10, reward: { exp: { act: 120 } }, pitch: '是非もなし。10度、店を回ってみせよ。' },
  h_marco: { from: 'marco', title: 'オークションで2回落札する', desc: 'マルコ・ポーロ「東方の品は、競りで手に入れるものだ」', kind: 'count', value: stat('aucWins'), target: 2, reward: { spot: 'online' }, pitch: '競りで2度勝ったら、わたしの知る海の向こうの市場を教えよう。', when: (s) => can(s, 'src_flea') && hasLicense(s) },
  h_nightingale: { from: 'nightingale', title: '気晴らしで休む', desc: 'ナイチンゲール「働きすぎは、数字にも出ますよ」', kind: 'count', value: stat('playCount'), target: 1, reward: { exp: { mind: 70 } }, pitch: '顔色が悪いわ。たまには「気晴らし」で休みなさい。統計的にも、そのほうが稼げます。' },
};

// 引き受けたときの値を覚えておき、count はそこからの増えた分を数える
function progress(s, q) {
  const d = QUESTS[q.id];
  const v = d.value(s);
  const now = d.kind === 'count' ? v - (q.base || 0) : v;
  return { now: Math.max(0, Math.min(d.target, now)), target: d.target };
}
export const questRows = (s) => (s.quests?.active || []).map((q) => ({ ...q, def: QUESTS[q.id], ...progress(s, q) }));
export const questsDone = (s) => (s.quests?.done || []).length;

const ensure = (s) => (s.quests ||= { active: [], done: [] });
const available = (s, id) => {
  const d = QUESTS[id];
  const qs = ensure(s);
  return d && !qs.done.includes(id) && !qs.active.some((q) => q.id === id) && s.week - (qs.dropped?.[id] ?? -999) >= 24 && (!d.when || d.when(s));
};

export function acceptQuest(s, id) {
  if (!available(s, id) || ensure(s).active.length >= MAX_ACTIVE) return false;
  const d = QUESTS[id];
  s.quests.active.push({ id, base: d.kind === 'count' ? d.value(s) : 0, week: s.week, fresh: true });
  return true;
}

export function rewardText(d) {
  if (d.reward.spot) return `新しい仕入れ先（${PIONEER_ROUTES[d.reward.spot]}）`;
  const names = { info: '情報', act: '行動', tech: '技術', social: '対人', mind: '精神' };
  return `経験点 ${Object.entries(d.reward.exp).map(([k, v]) => `${names[k]}+${v}`).join('・')}`;
}

// 次の仕入れ先を、回数を待たずに開拓する（ステージが足りなければ経験点に）
export function grantSpot(s, route) {
  const nx = nextSpot(s, route);
  if (!nx || nx.stageLock) return null;
  s.spots ||= [];
  s.spots.push(nx.spot.id);
  return nx.spot;
}

// 週のはじめ：マインのミッションがなければ、ステージに合うものを1つ告げる
export function questWeek(s) {
  const qs = ensure(s);
  const steps = [];
  for (const q of [...qs.active]) {
    if (s.week - q.week < QUEST_WEEKS) continue;
    dropQuest(s, q.id);
    steps.push(info('ミッションの期限切れ', [`「${QUESTS[q.id].title}」は、またの機会に`]));
  }
  if (s.underworld || s.week < 3 || (!flag(s, 'tutorialDone') && s.week < 8)) return steps;
  if (qs.active.some((q) => QUESTS[q.id].from === 'mine')) return steps;
  if (s.week < (qs.nextMine || 0) || qs.active.length >= MAX_ACTIVE) return steps;
  const id = Object.keys(QUESTS).find((k) => QUESTS[k].from === 'mine' && (QUESTS[k].stage || 1) <= s.stage && available(s, k));
  if (!id) return steps;
  acceptQuest(s, id);
  const d = QUESTS[id];
  return [...steps, talk('mine', d.pitch, 'pointer'), info(`ミッション：${d.title}`, [d.desc, `報酬：${rewardText(d)}`, '画面右の「ミッション」ボタンで確かめられる'])];
}

// あきらめる・期限切れ（あとでまた頼まれることがある）
export function dropQuest(s, id) {
  const qs = ensure(s);
  qs.active = qs.active.filter((q) => q.id !== id);
  if (QUESTS[id]?.from === 'mine') qs.nextMine = s.week + 2;
  qs.dropped = { ...(qs.dropped || {}), [id]: s.week };
}

// 達成したミッションの報酬を渡す
export function checkQuests(s) {
  const qs = ensure(s);
  const steps = [];
  for (const q of [...qs.active]) {
    const p = progress(s, q);
    if (p.now < p.target) continue;
    const d = QUESTS[q.id];
    qs.active = qs.active.filter((x) => x !== q);
    qs.done.push(q.id);
    if (d.from === 'mine') qs.nextMine = s.week + 1;
    const lines = [d.title];
    let spot = null;
    if (d.reward.spot) spot = grantSpot(s, d.reward.spot);
    if (spot) lines.push(`新しい仕入れ先「${spot.name}」を教えてもらった`);
    else {
      const exp = d.reward.exp || { info: 60, act: 60 };
      addExp(s, exp);
      lines.push(rewardText({ reward: { exp } }));
    }
    steps.push(sfx('levelup'), info('ミッション達成！', lines, 'good'));
    if (spot) steps.push(talk('chris', `${SPOT_MAP[spot.id].name}…！ さっそく行ってみよう。`, 'sparkle'));
  }
  return steps;
}
