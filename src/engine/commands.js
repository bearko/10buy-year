// 週に1〜2回選ぶ「行動」。育成シミュレーションの「練習メニュー」にあたる。
import { productOf } from '../data/products.js';
import { chance, pick, randInt } from './rng.js';
import { addCash, addExp, addHate, addMood, addStamina, addToku, clamp, flag, hasSkill, removeSkill, setFlag, yen } from './effects.js';
import { auctionOffers, lotteryEntries, lotteryWinRate, onlineOffers, openLotteries, queueOffer, queueSuccessRate, queueTargets, storeOfferCount, storeOffers, wholesaleOffers, importOffers } from './offers.js';
import { importOpen, INSPECT_FEE } from './importer.js';
import { buildPhoneRun, buildStoreRun, phoneFillers, storeClock, totalOffersFor } from './sourcing.js';
import { addExpense, addHours } from './kpi.js';
import { perk } from './perks.js';
import { woy } from './calendar.js';
import { inBoom, priceOf } from './market.js';
import { addUnits, overCapacity } from './inventory.js';
import { drawEvents } from './events.js';
import { addFamily } from './family.js';
import { canAskMentor, mentorSteps } from './mentor.js';
import { attendCourse, courseAvailable } from './courses.js';
import { openShopSteps } from './mystore.js';
import { pioneerTick } from './pioneer.js';
import { meetupLeak, satNameOf, tripSaturation } from './rivals.js';
import { namesBanned, queueLimited } from './regimes.js';
import { DEPT_STAGE, deptSteps } from './collection.js';
import { appraiseSteps, buyingSteps, hasCareer, liveSteps, reviewSteps, tourSteps } from './careers.js';
import { bg, choice, gain, info, items, narr, offers, sfx, talk } from './steps.js';

const E = (id) => `assets/extensions/${id}.png`;
const I = (name) => `assets/icons/${name}`;

// 行動カードの分類。トップ画面には分類だけを並べ、タップで中身を開く
export const GROUPS = [
  { id: 'buy', name: '仕入れ', icon: I('gum.png') },
  { id: 'sell', name: '出品', icon: E(1003) },
  { id: 'out', name: '外出', icon: E(1031) },
  { id: 'rest', name: '休む', icon: I('sleep.png') },
];

// node: その行動を解放するスキルツリーのノード / hours: 作業時間（時間単価の計算に使う）
export const COMMANDS = [
  { id: 'home_search', group: 'buy', icon: E(1059), name: '家の中を探す', desc: '押し入れから売れそうな物を探す', stamina: 5, exp: { info: 4, tech: 3 }, hours: 3, bg: 'home' },
  { id: 'store', group: 'buy', icon: E(2125), node: 'src_store', name: '店舗せどり', desc: 'ワゴンや値札ミスの掘り出し物を探す', stamina: 15, exp: { act: 12, info: 5, social: 2 }, hours: 10, bg: 'store' },
  { id: 'online', group: 'buy', icon: E(5075), node: 'src_online', name: '電脳せどり', desc: 'ポイント還元・予約・フリマの安値', stamina: 8, exp: { info: 13, tech: 4, mind: 2 }, hours: 5, bg: 'online' },
  { id: 'lottery', group: 'buy', icon: E(1016), node: 'src_lottery', name: '抽選に応募', desc: '限定品の抽選。結果は翌週', stamina: 5, exp: { info: 6, mind: 6 }, hours: 2, bg: 'online' },
  { id: 'queue', group: 'buy', icon: E(5531), node: 'src_queue', name: '行列に並ぶ', desc: '発売日に始発で並ぶ', stamina: 28, exp: { act: 15, mind: 10 }, hours: 8, bg: 'queue' },
  { id: 'auction', group: 'buy', icon: E(5509), node: 'src_auction', name: '業者オークション', desc: '古物商だけの市場。相場の5〜7割', stamina: 10, exp: { info: 10, social: 8 }, hours: 6, bg: 'event' },
  { id: 'wholesale', group: 'buy', icon: E(1058), node: 'src_wholesale', name: '問屋と商談', desc: '定番品をロットで卸値仕入れ', stamina: 8, exp: { social: 14, info: 6 }, hours: 5, bg: 'event' },
  { id: 'import', group: 'buy', icon: E(1009), name: '中国輸入', desc: '海外の卸サイトからノーブランド品をロットで輸入。届くのは3週後（ステージ2から）', stamina: 6, exp: { info: 8, tech: 5, social: 2 }, hours: 4, bg: 'online' },
  { id: 'listing', group: 'sell', icon: I('buf_agi.png'), name: '撮影・出品作業', desc: '今週の売れ行き1.25倍', stamina: 12, exp: { tech: 14, info: 4 }, hours: 6, bg: 'home' },
  { id: 'meetup', group: 'out', icon: E(3112), node: 'net_meetup', name: '物販交流会', desc: 'せどり仲間と情報交換', stamina: 10, exp: { social: 14, info: 6 }, cost: 3000, hours: 4, bg: 'event' },
  { id: 'study', group: 'out', icon: E(4008), name: '図書館で勉強', desc: '相場・法律・税金を学ぶ', stamina: 4, exp: { info: 9, mind: 7, tech: 2 }, hours: 3, bg: 'study' },
  { id: 'parttime', group: 'out', icon: I('phy.png'), name: '日雇いバイト', desc: '倉庫で働いて確実に稼ぐ', stamina: 25, exp: { act: 4, mind: 5 }, pay: 22000, hours: 0, bg: 'warehouse' },
  { id: 'play', group: 'out', icon: E(3055), name: '気晴らし', desc: 'やる気と体力が回復', stamina: -15, exp: { mind: 3 }, cost: 8000, hours: 0, bg: 'park' },
  { id: 'rest', group: 'rest', icon: I('sleep.png'), name: '休む', desc: '一日中寝る', stamina: 0, heal: 45, exp: {}, hours: 0, bg: 'home' },
  { id: 'clinic', group: 'out', icon: I('resurrection.png'), name: '通院・治療', desc: '病院・整骨院でケガや体調不良を治す（治療費あり）', stamina: -10, exp: { mind: 2 }, hours: 3, bg: 'study' },
  { id: 'course', group: 'out', icon: E(4016), name: '資格講座に通う', desc: '受講料を払って通い、資格を取る（ステージ2から）', stamina: 12, exp: { act: 8, mind: 10, info: 6 }, hours: 4, bg: 'study' },
  { id: 'open_shop', group: 'out', icon: E(3170), name: '店を開く', desc: '立地を選んで自分の店を開く（店舗経営講座の修了が必要）', stamina: 10, exp: { social: 10, info: 6 }, hours: 6, bg: 'event' },
  { id: 'donate', group: 'out', icon: I('resurrection.png'), name: '寄付・地域の手伝い', desc: '寄付や地域のイベントの手伝いで徳を積む（TOKUが上がる・ステージ2から）', stamina: 8, exp: { social: 6, mind: 4 }, hours: 4, bg: 'event' },
  { id: 'dept', group: 'out', icon: E(5009), name: '百貨店で買い物', desc: '自分のための買い物。美術画廊でコレクションを集め、年間の購入額で外商のランクが上がる（ステージ3から）', stamina: 6, exp: { social: 6, mind: 6 }, hours: 3, bg: 'event' },
  // キャリア（顧客層が育つと誘いが来る。engine/careers.js）
  { id: 'live', group: 'sell', icon: E(2174), career: 'kol', name: 'ライブ配信', desc: '出品中の美容品を配信でまとめて売る（対人30）', stamina: 10, exp: { tech: 4 }, hours: 3, bg: 'home' },
  { id: 'tour', group: 'sell', icon: E(2163), career: 'inbound', name: '訪日客の買い物ツアー', desc: '出品していない和雑貨・工芸を相場の1.3倍で直接売る（対人20）', stamina: 14, exp: { act: 6 }, hours: 6, bg: 'park' },
  { id: 'buying', group: 'buy', icon: E(2172), career: 'select', name: '海外買い付け', desc: 'ファッションの品を卸値で買い付ける（技術25）', stamina: 16, exp: { act: 6, info: 4 }, hours: 8, bg: 'event' },
  { id: 'appraise_job', group: 'out', icon: E(3102), career: 'appraiser', name: '鑑定の依頼', desc: '持ち込まれた品を鑑定して手数料を稼ぐ（情報20・精神10）', stamina: 8, exp: { mind: 4 }, hours: 4, bg: 'study' },
  { id: 'review', group: 'out', icon: E(1158), career: 'media', name: 'レビュー記事を書く', desc: '読者を増やす。読者が多いほど毎月の紹介料（情報30）', stamina: 8, exp: { tech: 6 }, hours: 4, bg: 'home' },
  { id: 'mentor', group: 'out', icon: 'assets/characters/chris_01_arms_crossed.png', name: '師匠に相談', desc: '前の周の転売屋に電話で相談する（12週に1回）', stamina: 0, exp: {}, hours: 1, bg: 'home' },
  { id: 'card_up', group: 'out', icon: I('cp.png'), name: 'カード増枠の申請', desc: 'カード会社に利用枠の引き上げを申し込む。審査あり', stamina: 3, exp: { mind: 2 }, hours: 1, bg: 'study' },
  { id: 'license', group: 'out', icon: E(4016), node: 'license', name: '古物商許可を申請', desc: '警察署へ。許可まで約6週間', stamina: 8, exp: { info: 5, mind: 3 }, cost: 19000, hours: 3, bg: 'study' },
];
export const COMMAND_MAP = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

// 夜の作業（ステージ2から）：軽い作業だけできる。睡眠を削るので体力を余計に使う
export const NIGHT_COMMANDS = ['online', 'lottery', 'listing', 'study', 'live', 'review'];
export const NIGHT_EXTRA_STAMINA = 5;
export const hasNightSlot = (s) => s.stage >= 2;

export function availableNightCommands(s) {
  if (s.sick > 0) return [];
  return availableCommands(s).filter((c) => NIGHT_COMMANDS.includes(c.id));
}

export function availableCommands(s) {
  if (s.sick > 0) return [COMMAND_MAP.rest, COMMAND_MAP.clinic];
  return COMMANDS.filter((c) => {
    if (c.node && !hasSkill(s, c.node)) return false;
    if (c.career) return hasCareer(s, c.career) && !s.underworld;
    if (c.id === 'license') return !flag(s, 'license') && flag(s, 'licensePending') === undefined;
    if (c.id === 'home_search') return s.homePool.length > 0;
    if (c.id === 'parttime') return !s.fulltime;
    if (c.id === 'clinic') return ailments(s).length > 0;
    if (c.id === 'course') return courseAvailable(s);
    if (c.id === 'open_shop') return !s.shop && !!s.certs?.includes('store_mgmt') && !s.underworld;
    if (c.id === 'donate') return s.stage >= 2 && !s.underworld;
    if (c.id === 'dept') return s.stage >= DEPT_STAGE && !s.underworld;
    if (c.id === 'mentor') return canAskMentor(s);
    if (c.id === 'import') return importOpen(s);
    if (c.id === 'card_up') return nextCardTier(s) !== null && s.week >= (flag(s, 'cardApplied') ?? -99) + 8;
    return true;
  });
}

// 病院で治せるケガ・体調不良と治療費
export const TREATMENTS = [
  { id: 'sick', name: '体調不良', where: '内科', fee: 3000, has: (s) => s.sick > 0 },
  { id: 'tendon', name: '腱鞘炎', where: '整形外科', fee: 6000, has: (s) => hasSkill(s, 'tendon') },
  { id: 'backpain', name: '腰痛', where: '整骨院', fee: 8000, has: (s) => hasSkill(s, 'backpain') },
  { id: 'insomnia', name: '寝不足', where: '睡眠外来', fee: 5000, has: (s) => hasSkill(s, 'insomnia') },
];
export const ailments = (s) => TREATMENTS.filter((x) => x.has(s));

// カードの利用枠の段階と、引き上げの審査基準（直近3か月の平均売上・ステージ）
export const CARD_TIERS = [
  { limit: 100000 },
  { limit: 300000, revenue: 50000 },
  { limit: 500000, revenue: 200000 },
  { limit: 1000000, revenue: 500000, stage: 2 },
  { limit: 3000000, revenue: 1500000, stage: 3 },
  { limit: 5000000, revenue: 3000000, stage: 4 },
];
export function nextCardTier(s) {
  return CARD_TIERS.find((t) => t.limit > s.card.limit) || null;
}
const recentRevenue = (s) => {
  const last = s.monthly.slice(-3);
  return last.length ? Math.round(last.reduce((a, m) => a + (m.revenue || 0), 0) / last.length) : 0;
};

export function staminaCost(s, cmd) {
  let cost = cmd.stamina;
  if (cmd.id === 'store' && hasSkill(s, 'ino_map')) cost = Math.round(cost * 0.7);
  if (cmd.id === 'store' && hasSkill(s, 'backpain')) cost = Math.round(cost * 1.3);
  if (cmd.id === 'store') cost = Math.round(cost * perk(s, 'storeStamina'));
  if (['store', 'auction', 'wholesale'].includes(cmd.id) && (s.lifestyle || 0) >= 2) cost = Math.round(cost * 0.85); // 車がある
  if (cmd.group === 'buy' && s.style?.type === 'org') cost = Math.round(cost * 0.7); // 組織型：足を使うのはスタッフ
  return cost;
}

export function restHeal(s) {
  let heal = COMMAND_MAP.rest.heal;
  if (hasSkill(s, 'insomnia')) heal *= 0.6;
  if (overCapacity(s)) heal *= 0.5;
  return Math.round(heal);
}

// 行動したときの体力・所持金の増減（画面の予告表示に使う）
export function commandPreview(s, cmd, { night = false } = {}) {
  const stamina = cmd.heal ? restHeal(s) : -(staminaCost(s, cmd) + (night ? NIGHT_EXTRA_STAMINA : 0));
  const fee = cmd.id === 'clinic' ? ailments(s).reduce((a, x) => a + x.fee, 0) : 0;
  return { stamina, cash: (cmd.pay || 0) - (cmd.cost || 0) - fee, risk: sickRisk(s, cmd) };
}

// 体調不良率（体力が低いまま重い行動をすると上がる）
export function sickRisk(s, cmd) {
  const cost = staminaCost(s, cmd);
  if (cost < 10) return 0;
  const after = s.stamina - cost;
  return clamp((25 - after) * 2.4, 0, 70) / 100;
}

export function performCommand(s, cmdId, { night = false } = {}) {
  const cmd = COMMAND_MAP[cmdId];
  const steps = [bg(cmd.bg)];
  if (cmd.cost && s.cash < cmd.cost) return [talk('chris', `お金が足りない…（${yen(cmd.cost)}必要）`, 'sad')];
  if (night) {
    steps.push(narr('夜。家族が寝静まったあと、もうひと仕事。'));
    s.flags.nightWork = (s.flags.nightWork || 0) + 1;
  }

  const cost = staminaCost(s, cmd) + (night ? NIGHT_EXTRA_STAMINA : 0);
  const risk = sickRisk(s, cmd);
  addStamina(s, -cost);
  if (cmd.cost) {
    if (['meetup', 'license'].includes(cmdId)) addExpense(s, cmd.cost, cmd.name);
    else addCash(s, -cmd.cost, cmd.name);
  }
  addHours(s, cmd.hours || 0);
  s.lastCommand = cmdId;

  if (risk > 0 && chance(s, risk)) {
    s.sick = 2;
    addMood(s, -1);
    steps.push(sfx('damage'), talk('chris', 'う…頭がくらくらする…。', 'sad'), narr('無理がたたって、クリスは体調を崩してしまった。'), info('体調不良', ['2週間は休むことしかできない', '売れた商品の発送も遅れてしまう…'], 'bad'));
    steps.push(...drawEvents(s, 'sick'));
    return steps;
  }

  const handler = HANDLERS[cmdId];
  steps.push(...handler(s, cmd, { night }));
  const applied = addExp(s, cmd.exp, { mood: true });
  if (Object.keys(applied).length) steps.push(gain(applied, cost > 0 ? [`体力 -${cost}`] : cost < 0 ? [`体力 +${-cost}`] : []));
  steps.push(...drawEvents(s, 'command', { cmd: cmdId }));
  return steps;
}

const HANDLERS = {
  home_search(s) {
    const n = Math.min(s.homePool.length, randInt(s, 1, 3));
    const found = [];
    for (let i = 0; i < n; i++) {
      const idx = randInt(s, 0, s.homePool.length - 1);
      const pid = s.homePool.splice(idx, 1)[0];
      addUnits(s, pid, 1, 0, { home: true });
      found.push(productOf(pid));
    }
    return [
      narr(pick(s, ['押し入れの奥から段ボールを引っ張り出した。', 'クローゼットの上の棚を探ってみた。', '実家から送られてきたまま開けていない箱を開けた。'])),
      items('見つけた物', found.map((p) => p.id)),
      talk('chris', s.homePool.length ? '売れるかな？ まだ何か眠っていそうだ。' : '売れるかな？ …もう売れそうな物はなさそうだ。', 'sparkle'),
    ];
  },
  store(s, cmd, { night } = {}) {
    s.flags.didStore = true;
    s.stats.storeTrips = (s.stats.storeTrips || 0) + 1;
    const found = pioneerTick(s, 'store');
    tripSaturation(s, 'store', night);
    // 店舗巡り：閉店までに何店舗回れるか。見つかる品はルートの店と棚に散らばっている（engine/sourcing.js）
    const clock = storeClock(s, night);
    const n = storeOfferCount(s);
    const list = storeOffers(s, totalOffersFor(n, clock));
    return [
      ...found,
      talk('chris', pick(s, ['よし、今日は駅前から郊外まで回れるだけ回るぞ！', 'ワゴンの奥に宝が眠ってる…はず！', '値札の貼り替え日を狙って来たんだ。']), 'guts'),
      { ...offers(list, '店舗巡り'), run: buildStoreRun(s, list, clock, n) },
    ];
  },
  online(s, cmd, { night } = {}) {
    const found = pioneerTick(s, 'online');
    tripSaturation(s, 'online', night);
    const list = onlineOffers(s);
    const steps = [...found, talk('chris', pick(s, ['ポイント還元率、予約ページ、フリマの新着…全部チェックだ。', 'F5連打で在庫復活を狙う！', '通販サイトのセール情報をまとめて確認しよう。']), 'arms')];
    const forecast = forecastLine(s);
    if (forecast) steps.push(info('相場メモ', [forecast]));
    // 夜のスマホ：アプリを渡り歩き、通知・売り切れ検索・値下げ交渉・オークションで仕入れる（engine/sourcing.js）
    const feed = [...list, ...phoneFillers(s, list)];
    steps.push({ ...offers(feed, 'ネットで見つけた商品', '「激安」には理由があるかも…'), run: buildPhoneRun(s, feed) });
    return steps;
  },
  lottery(s) {
    const open = openLotteries(s);
    if (!open.length) return [talk('chris', '今は受付中の抽選がないみたいだ…。', 'sad'), narr('（応募フォームの入力速度だけは上がった）')];
    const base = lotteryEntries(s);
    const names = open.map((p) => `「${p.name}」`).join('');
    const register = (mode, extra) => {
      s.stats.lotteryApplied = (s.stats.lotteryApplied || 0) + 1;
      for (const p of open) s.lotteries.push({ pid: p.id, entries: base + extra, mode, week: s.week });
      return [info('応募完了', [`${names}に各${base + extra}口ずつ応募した`, `当選確率の目安: 1口あたり約${Math.round(lotteryWinRate(s, open[0]) * 100)}%`, '結果は来週わかる'])];
    };
    return [
      talk('chris', `受付中の抽選は${names}。どうやって応募しよう…。`, 'arms'),
      // 抽選の本人確認（いたちごっこ）が始まると、名義借り・捨てアカは使えない
      choice(namesBanned(s) ? [
        { label: `自分の名義だけで応募（${base}口）`, sub: `本人確認あり・公式の会員ランク ${s.member || 0}`, run: () => register('fair', 0) },
      ] : [
        { label: `自分の名義だけで応募（${base}口）`, run: () => register('fair', 0) },
        {
          label: `家族や友人に頼む（+2口・お礼5,000円）`,
          sub: '規約次第ではグレー',
          run: () => {
            if (s.cash < 5000) return [talk('chris', 'お礼を払うお金もない…', 'sad'), ...register('fair', 0)];
            addCash(s, -5000, '抽選のお礼');
            addHate(s, 1);
            return [talk('mine', '名義を借りた応募は、販売元の規約で禁止されていることも多いわよ。', 'arms'), ...register('family', 2)];
          },
        },
        {
          label: '捨てアカを量産して応募（+6口）',
          sub: '規約違反',
          run: () => {
            addToku(s, -4);
            return [talk('mine', '……それ、完全に規約違反よ。バレたら当選取り消しじゃ済まないかも。', 'arms'), ...register('multi', 6)];
          },
        },
      ]),
    ];
  },
  queue(s) {
    const targets = queueTargets(s);
    if (!targets.length) {
      addHate(s, 1, false);
      return [narr('早朝から家電量販店の開店待ちに並んでみた…が、今日は目玉商品がなかった。'), talk('chris', '情報収集不足だった…。「相場」画面のニュースを見てから並ぶべきだった。', 'sad')];
    }
    // 並び屋はもう手配してある（魔道）／手間賃が払えない
    if (hasSkill(s, 'dk_crew') || s.cash < CREW_FEE) return queueAttempt(s, targets[0], false);
    return [{
      ...choice([
        { key: 'self', label: '自分で並ぶ', run: () => queueAttempt(s, targets[0], false) },
        { key: 'hire', label: `並び屋を雇う（${yen(CREW_FEE)}）`, sub: '成功しやすく体力も残るが、徳が下がり、バレると炎上', run: () => queueAttempt(s, targets[0], true) },
      ], `始発で自分で並ぶか、お金を払って並び屋に頼むか…`),
      policy: 'crew',
    }];
  },
  auction(s, cmd, { night } = {}) {
    const found = pioneerTick(s, 'auction');
    tripSaturation(s, 'auction', night);
    return [
      ...found,
      narr('会員証を見せて、業者オークションの会場に入った。プロの目利きが静かに札を入れていく。'),
      offers(auctionOffers(s), '業者オークションの出品物', '真贋チェック済みが多い'),
    ];
  },
  import(s) {
    const first = !s.flags.importIntro;
    s.flags.importIntro = true;
    const go = (inspect) => () => {
      s.flags.importInspect = inspect;
      return [offers(importOffers(s), `中国の卸サイト・為替×${(s.fx || 1.1).toFixed(2)}・関税10%は到着時${inspect ? '・検品代行つき' : ''}`)];
    };
    return [
      ...(first
        ? [
            talk('mine', '中国の卸サイトなら、ノーブランドの雑貨やガジェットが定価の2〜3割で仕入れられるわ。そのかわり、届くのは3週後。', 'pointer'),
            talk('mine', '円安だと仕入れ値が上がるし、届いたら関税がかかる。税関で止まることも、開けたら不良品が混じってることもある。それと…人気品の激安品は、たいていコピー品よ。', 'arms'),
          ]
        : [narr('深夜、中国の卸サイトを翻訳ツールで眺める。工場直送の文字が並ぶ。')]),
      choice([
        { label: `検品代行を頼む（1個${INSPECT_FEE}円・不良品が減る）`, run: go(true) },
        { label: '検品代行なしで見る', run: go(false) },
      ], '現地の検品代行を頼む？'),
    ];
  },
  wholesale(s, cmd, { night } = {}) {
    const found = pioneerTick(s, 'wholesale');
    tripSaturation(s, 'wholesale', night);
    return [
      ...found,
      narr('問屋の担当者と商談。「ロットでまとめていただけるなら、この掛け率で出せます」'),
      offers(wholesaleOffers(s), '問屋の卸値リスト', '最低ロット20個'),
    ];
  },
  listing(s) {
    s.listBoost = true;
    return [
      talk('chris', pick(s, ['自然光で撮り直して、箱の角まで写す！', '説明文に「喫煙者・ペットなし」「即日発送」…と。', 'ハッシュタグもつけて検索に引っかかるように！']), 'guts'),
      info('出品作業', ['今週の売れ行き×1.25']),
    ];
  },
  meetup(s) {
    const lines = [narr('せどり仲間の交流会。「今月はトレカが熱い」「あの店は転売対策が厳しくなった」…情報が飛び交う。'), talk('chris', 'ひとりでやってると視野が狭くなるな。', 'smile')];
    // 情報を出すと、自分の仕入れ先にも人が来る
    if (s.stage >= 2) {
      const key = meetupLeak(s);
      lines.push(talk('mine', `……今日、${satNameOf(key)}のこと話してたでしょ。しばらく人が増えるわよ。`, 'arms'));
    }
    return lines;
  },
  study(s) {
    return [narr(pick(s, ['古物営業法、特定商取引法、チケット不正転売禁止法…。知らないと損どころか捕まる。', '手数料と送料を引いた「本当の利益」の計算方法を学んだ。', 'プラットフォームの禁止出品物の一覧を読み込んだ。']))];
  },
  parttime(s, cmd) {
    addCash(s, cmd.pay, '日雇いバイト');
    return [narr('倉庫で一日中ピッキング。腰は痛いが、確実にお金が入る。'), info('バイト代', [`${yen(cmd.pay)}を手に入れた`], 'good')];
  },
  play(s) {
    s.stats.playCount = (s.stats.playCount || 0) + 1;
    addFamily(s, 4);
    const d = addMood(s, 1);
    return [sfx('heal'), narr(pick(s, ['公園でぼーっとした。スマホの通知はオフにした。', '喫茶店で、相場のことを考えずにコーヒーを飲んだ。'])), info('リフレッシュ', ['体力 +15', d ? 'やる気が上がった' : ''], 'good')];
  },
  rest(s) {
    const heal = restHeal(s);
    addFamily(s, 3);
    addStamina(s, heal);
    const lines = [sfx('heal'), narr(s.sick > 0 ? '布団から出られない…。' : 'ぐっすり眠った。'), info('休養', [`体力 +${heal}`], 'good')];
    if (s.sick > 0) s.sick--;
    return lines;
  },
  mentor(s) {
    return mentorSteps(s);
  },
  open_shop(s) {
    return openShopSteps(s);
  },
  course(s) {
    return attendCourse(s);
  },
  dept(s) {
    return deptSteps(s);
  },
  live: (s) => liveSteps(s),
  tour: (s) => tourSteps(s),
  buying: (s) => buyingSteps(s),
  appraise_job: (s) => appraiseSteps(s),
  review: (s) => reviewSteps(s),
  donate(s) {
    const give = (amount, toku, line) => () => {
      if (s.cash < amount) return [talk('chris', `寄付するお金が足りない…（${yen(amount)}必要）`, 'sad')];
      if (amount) addExpense(s, amount, '寄付');
      addToku(s, toku);
      return [narr(line), info('徳を積んだ', [`TOKU +${toku}（いま ${Math.round(s.toku)}）`], 'good')];
    };
    return [
      talk('chris', '稼がせてもらってる分、少しは世の中に返さないとな…。'),
      choice([
        { label: '地域のイベントを手伝う（無料）', sub: 'TOKU +2', run: give(0, 2, '商店街のお祭りで、テントの設営と片付けを手伝った。「助かったよ、兄ちゃん」') },
        { label: `子ども食堂に寄付する（${yen(100000)}）`, sub: 'TOKU +3', run: give(100000, 3, '近所の子ども食堂に寄付をした。お礼の手紙が届いた。') },
        { label: `災害の義援金を送る（${yen(1000000)}）`, sub: 'TOKU +15', run: give(1000000, 15, '被災地へ義援金を送った。名前は出さないでほしいと伝えた。') },
      ]),
    ];
  },
  clinic(s) {
    const list = ailments(s);
    const fee = list.reduce((a, x) => a + x.fee, 0);
    if (s.cash < fee) return [talk('chris', `治療費が足りない…（${yen(fee)}必要）`, 'sad')];
    addExpense(s, fee, `治療費（${list.map((x) => x.name).join('・')}）`);
    for (const x of list) {
      if (x.id === 'sick') s.sick = 0;
      else removeSkill(s, x.id);
    }
    return [
      narr(`${[...new Set(list.map((x) => x.where))].join('と')}で診てもらった。`),
      talk('mine', '体が資本よ。無理を続けると、稼ぐどころじゃなくなるんだから。', 'arms'),
      sfx('heal'),
      info('治療', [`${list.map((x) => x.name).join('・')}が治った`, `治療費 ${yen(fee)}`], 'good'),
    ];
  },
  card_up(s) {
    setFlag(s, 'cardApplied', s.week);
    const tier = nextCardTier(s);
    const rev = recentRevenue(s);
    const reasons = [];
    if (s.delinquency > 0) reasons.push('返済の滞納がある');
    if (tier.stage && s.stage < tier.stage) reasons.push(`ステージ${tier.stage}から`);
    if (rev < tier.revenue) reasons.push(`直近3か月の売上が月平均${yen(tier.revenue)}に届いていない（いま${yen(rev)}）`);
    const lines = [narr('カード会社のサイトから、利用枠の増額を申し込んだ。……数日後、審査の結果が届いた。')];
    if (reasons.length) {
      lines.push(info('審査の結果', ['今回はご希望に添えませんでした', ...reasons, '次に申し込めるのは8週間後'], 'bad'));
      return lines;
    }
    s.card.limit = tier.limit;
    lines.push(sfx('coin'), info('審査の結果', [`利用枠が${yen(tier.limit)}に上がった`], 'good'));
    return lines;
  },
  license(s) {
    setFlag(s, 'licensePending', s.week + 6);
    return [
      narr('警察署の生活安全課で、古物商許可を申請した。住民票、身分証明書、略歴書、誓約書…書類が多い。'),
      talk('mine', '中古品を仕入れて売るなら古物商許可は必須よ。個人から買った「未使用品」も古物扱いになるから注意ね。', 'pointer'),
      info('申請完了', ['許可が下りるまで約6週間（標準処理期間は40日程度）']),
    ];
  },
};

function forecastLine(s) {
  const cands = Object.keys(s.market).filter((pid) => {
    const p = productOf(pid);
    return p.kind === 'hype' && s.market[pid].edition > 0 && woy(s.week) !== p.release;
  });
  if (!cands.length || !chance(s, 0.4 + s.abilities.eye / 200)) return null;
  const pid = pick(s, cands);
  const m = s.market[pid];
  const dir = m.p > m.floor * 1.05 ? 'じわじわ下がりそう' : '底値圏で落ち着きそう';
  return `「${productOf(pid).name}」は発売からの熱が冷めて、${dir}だ。`;
}

// 抽選結果（応募の翌週以降の週末に判定）
export function resolveLotteries(s) {
  const steps = [];
  const due = s.lotteries.filter((l) => l.week < s.week);
  s.lotteries = s.lotteries.filter((l) => l.week >= s.week);
  const wins = [];
  const losses = [];
  for (const l of due) {
    const p = productOf(l.pid);
    const rate = lotteryWinRate(s, p);
    let n = 0;
    for (let i = 0; i < l.entries; i++) if (chance(s, rate)) n++;
    const cap = l.mode === 'multi' ? 3 : l.mode === 'family' ? 2 : 1;
    n = Math.min(n, cap);
    if (n > 0 && l.mode === 'multi' && chance(s, 0.3)) {
      addHate(s, 10);
      setFlag(s, 'lotteryPenalty');
      steps.push(talk('collector', `【${p.name} 販売事務局】同一人物による複数アカウントでの応募を確認しました。すべての当選を無効とします。`), info('当選取り消し', ['今後の抽選で当選しにくくなった', '炎上度が上がった'], 'bad'));
      continue;
    }
    if (n > 0) wins.push({ pid: l.pid, n });
    else losses.push(l.pid);
  }
  return { steps, wins, losses };
}

// 並び屋の手間賃。お金で体力と成功率を買う（徳が下がり、2割ほどの確率でバレて炎上）
export const CREW_FEE = 15000;
function queueAttempt(s, t, hired) {
  const p = productOf(t.pid);
  const crowd = p.kind === 'perishable' ? 0.9 : inBoom(s, p.id) ? 1.3 : 1.1;
  const rate = Math.min(0.95, queueSuccessRate(s, crowd) + (hired ? 0.25 : 0));
  addHate(s, 3, false);
  const steps = [];
  if (hired) {
    addCash(s, -CREW_FEE, '並び屋の手間賃');
    addStamina(s, 20); // 始発で並ぶのは並び屋
    addToku(s, -3);
    steps.push(narr(`${t.reason}の「${p.name}」。始発の列には、雇った並び屋が代わりに並んでいる…。`));
    if (chance(s, 0.2)) {
      addHate(s, 8, false);
      steps.push(talk('narr', '列の写真がSNSに出回った。「転売屋が並び屋を使ってる」と名指しで晒されている…。'), info('炎上', ['並び屋を使ったのがバレた', '炎上度が大きく上がった'], 'bad'));
    }
  } else {
    steps.push(narr(`${t.reason}の「${p.name}」を狙って、始発で店へ向かった。すでに長い列ができている…。`));
  }
  // 整理券と入荷数（UI は始発→整理券→開店→販売の順に見せる。ui/queue.js）
  const won = chance(s, rate);
  const stock = randInt(s, 15, 60);
  const ticket = won ? randInt(s, Math.max(1, Math.round(stock * 0.4)), stock) : stock + randInt(s, 1, 40);
  steps.push({ t: 'queue', pid: p.id, stock, ticket, ok: won, limited: queueLimited(s) });
  if (won) {
    const qty = hasSkill(s, 'early_bird') && chance(s, 0.5) && !queueLimited(s) ? 2 : 1; // 購入制限ならお一人様1点
    steps.push(talk('chris', hired ? '並び屋から連絡が来た。「買えました」…。' : '買えた…！ 整理券、ギリギリだった！', hired ? 'arms' : 'cheer'), offers([queueOffer(s, p.id, qty)], '行列の戦利品', `相場は約${Math.round(priceOf(s, p.id) / 1000)}千円（推定は購入画面で）`));
  } else {
    steps.push(talk('chris', hired ? '並び屋から「完売でした。手間賃はいただきます」と…。' : '目の前で「本日分は完売です」の札が…。', 'wail'), info('完売', [`成功率は約${Math.round(rate * 100)}%だった`], 'bad'));
  }
  return steps;
}
