// 月末の支払い（カードの引き落とし・借金の返済）
import { UNDERWORLD_LIVING } from './underworld.js';
import { shopMonthly, shopMonthlyCost } from './mystore.js';
import { rivalsMonthly } from './rivals.js';
import { regimeMonthly } from './regimes.js';
import { collectionMonthly, museumIncome } from './collection.js';
import { mediaIncome } from './careers.js';
import { visionMonthly } from './visions.js';
import { dividend, lifestyleMonthly } from './lifestyle.js';
import { addCash, addExp, addHate, addMood, addToku, hasSkill, record, setFlag, yen } from './effects.js';
import { celebrate, info, sfx, talk } from './steps.js';
import { monthlyNodeFees } from './abilities.js';
import { addExpense, closeMonth, heldDays, inventoryStats } from './kpi.js';
import { checkPromotion, CORP_SOCIAL, LIVING_COST } from './career.js';
// 専業の生活費（フランクリンの奥義「1ペニーの節約は1ペニーの稼ぎ」で2割安い）
export const livingCost = (s) => Math.round(LIVING_COST * (s.secrets?.includes('penny') ? 0.8 : 1));
import { yearOf } from './calendar.js';
import { ORG_WAGE } from './style.js';
import { chance } from './rng.js';

// 難易度：借金の額・毎月の最低返済・金利
export const DIFFICULTIES = {
  easy: { name: 'やさしい', debt: 800000, minPay: 20000, rate: 0.1, desc: '借金80万円・最低返済 月2万円・年利10%。まずは転売の流れを楽しみたい人に' },
  normal: { name: 'ふつう', debt: 1500000, minPay: 30000, rate: 0.15, desc: '借金150万円・最低返済 月3万円・年利15%。おすすめ' },
  hard: { name: 'きびしい', debt: 2500000, minPay: 40000, rate: 0.18, desc: '借金250万円・最低返済 月4万円・年利18%。序盤の資金繰りがきつい' },
};
export const difficultyOf = (s) => DIFFICULTIES[s.difficulty] || DIFFICULTIES.normal;
export const minPayment = (s) => difficultyOf(s).minPay;
export const MAX_DELINQUENCY = 3;

export function monthEnd(s) {
  const steps = [];

  // 0) 事業の固定費・副収入・生活費、今月の記録を締める
  const fees = monthlyNodeFees(s);
  for (const f of fees) addExpense(s, f.amount, f.name);
  if (s.corp) addExpense(s, CORP_SOCIAL, '社会保険料');
  const passive = passiveIncome(s);
  if (passive.total) {
    s.cash += passive.total;
    s.cur.passive += passive.total;
    record(s, `事業収入（${passive.names.join('・')}）`, passive.total);
    if (hasSkill(s, 'div_consult')) addHate(s, 4, false);
  }
  if (s.fulltime) addCash(s, -livingCost(s), '生活費（家賃・食費・国保・年金）');
  shopMonthly(s);
  collectionMonthly(s); // コレクションの値上がり・美術館の維持費
  lifestyleMonthly(s); // 暮らしの出費
  // 丁寧な取引を続けている（評価が高い）と、少しずつ徳が積まれる
  if (s.rating >= 95) addToku(s, 1);
  if (s.underworld) addCash(s, -UNDERWORLD_LIVING, '裏の暮らし（金銭感覚の麻痺）');
  if (s.probation > 0) s.probation = Math.max(0, s.probation - 4);
  // 組織型：人件費と、複数アカウント運用の規約違反
  if (s.style?.type === 'org') {
    addCash(s, -ORG_WAGE * s.stage, '人件費（並び屋・仕入れスタッフ）');
    if (chance(s, 0.06)) {
      s.banWeeks = Math.max(s.banWeeks || 0, 2);
      addHate(s, 5);
      steps.push(talk('narr', 'スタッフ名義で回していたプンシーのアカウントが、運営に「同一人物の複数アカウント」と判定された。'), info('規約違反', ['プンシーへの出品が2週間止まる', '炎上度が上がった'], 'bad'));
    }
  }
  const rec = closeMonth(s);
  steps.push(monthReport(s, rec, fees, passive));
  steps.push(...staleReport(s));

  // 1) カードの引き落とし（先月利用分）
  const due = s.card.due;
  if (due > 0) {
    if (s.cash >= due) {
      addCash(s, -due, 'カード引き落とし');
      steps.push(info('カード引き落とし', [`先月のカード利用分 ${yen(due)} が引き落とされた`]));
    } else {
      const paid = Math.max(0, s.cash);
      const short = due - paid;
      addCash(s, -paid, 'カード引き落とし（一部）');
      const fee = hasSkill(s, 'ledger') ? 0 : Math.round(short * 0.03);
      s.debt += short + fee;
      record(s, `カード残高不足 → リボ払いへ（${yen(short + fee)}）`, 0);
      if (!hasSkill(s, 'ledger')) addMood(s, -1);
      steps.push(
        sfx('trouble'),
        talk('mine', `カードの引き落としに${yen(short)}足りなかったわ。不足分はリボ払いに回されて、借金に上乗せよ…。`, 'teary'),
        info('リボ払い', [`借金が ${yen(short + fee)} 増えた`], 'bad'),
      );
    }
  }
  s.card.due = s.card.current;
  s.card.current = 0;
  // 利用代金の確定メール（引き落としは来月末）。残高が足りなそうなら、リボの勧誘も届く
  if (s.card.due > 0) {
    const short = s.cash < s.card.due;
    steps.push({ t: 'mail', mails: [
      { from: 'マイクリカード', subject: '【マイクリカード】ご利用代金確定のお知らせ', body: `今月のご利用代金は ${yen(s.card.due)} です。来月末に、ご指定の口座から引き落とします。（現在の口座残高 ${yen(Math.max(0, s.cash))}）`, tone: short ? 'bad' : '' },
      ...(short ? [{ from: 'マイクリカード', subject: '【ご案内】毎月のお支払いを一定に「あとからリボ」', body: 'お支払いが厳しい月も安心！ 毎月の支払額を一定にできます。※手数料は年15%です。残高不足の分は、自動でリボ払いになります。', tone: 'spam' }] : []),
    ] });
  }
  if (s.cardPoints > 0) {
    s.points += s.cardPoints;
    steps.push(info('カードポイント', [`${s.cardPoints.toLocaleString()}pt が付与された`], 'good'));
    s.cardPoints = 0;
  }

  // 2) 利息
  if (s.debt > 0) {
    const { rate } = difficultyOf(s);
    const interest = Math.round((s.debt * rate) / 12);
    s.debt += interest;
    s.stats.interest += interest;
    record(s, `利息（年${Math.round(rate * 100)}%）`, -interest);
  }

  // 3) 最低返済
  if (s.debt > 0) {
    const pay = Math.min(s.debt, minPayment(s));
    if (s.cash >= pay) {
      addCash(s, -pay, '月末返済');
      s.debt -= pay;
      s.delinquency = 0; // 払えれば滞納カウントはリセット（3か月連続の滞納で債務整理）
      s.stats.repaid += pay;
      addExp(s, { mind: 3 }); // 毎月の返済を続けることで、精神が鍛えられる
      steps.push(sfx('coin'), info('月末返済', [`${yen(pay)} を返済した`, `残りの借金: ${yen(s.debt)}`], 'good'));
    } else {
      s.delinquency++;
      s.debt += 5000;
      addMood(s, -1);
      steps.push(
        sfx('lose'),
        talk('collector', `ご返済が確認できておりません。至急 ${yen(pay)} をお支払いください。（遅延損害金 5,000円）`),
        talk('chris', '払えなかった…。', 'wail'),
        info('滞納', [`連続滞納 ${s.delinquency} / ${MAX_DELINQUENCY} か月`, s.delinquency >= MAX_DELINQUENCY - 1 ? '次に滞納したら債務整理になる！' : ''], 'bad'),
      );
      if (s.delinquency >= MAX_DELINQUENCY) s.over = 'bankrupt';
    }
  }
  if (s.debt <= 0 && !s.flags.debtFree) steps.push(...debtFreeSteps(s));
  if (s.cash < -300000 && s.debt <= 0) {
    // 完済後でも、資金ショートが大きければカードローンで補填する
    s.debt += -s.cash;
    record(s, '資金ショート → カードローンで補填', 0);
    steps.push(talk('mine', '現金が大きくマイナスよ…。足りない分はカードローンで借りたことにするわ。', 'teary'));
    s.cash = 0;
  }
  regimeMonthly(s, Object.keys(s.rivals || {}));
  steps.push(...rivalsMonthly(s));
  steps.push(...visionMonthly(s));
  steps.push(...checkPromotion(s));
  return steps;
}

export function repay(s, amount) {
  amount = Math.min(Math.floor(amount), s.debt, s.cash);
  if (amount <= 0) return 0;
  addCash(s, -amount, '繰上げ返済');
  s.debt -= amount;
  s.stats.repaid += amount;
  s.stats.prepaid = (s.stats.prepaid || 0) + amount; // 繰上げ返済（ミッション）
  return amount;
}

export function debtFreeSteps(s) {
  s.debt = 0;
  setFlag(s, 'debtFree', s.week);
  return [
    celebrate('借金完済！'),
    sfx('win'),
    talk('chris', 'か、完済…！ 借金、ゼロになった！！', 'cheer'),
    talk('mine', 'おめでとう、クリス！ ……でも、ここで終わり？ 残りの期間でどこまで稼げるか、見せてちょうだい。', 'banzai'),
    info('完済！', ['借金をすべて返し終えた', '以降は最終資産を積み上げよう'], 'good'),
  ];
}

// ステージ5の多角化ノードによる毎月の収入
// 月末に純利益へ加わる分の見込み（事業収入 − 固定費・社会保険料・店の家賃）。HUD の目標の見込みに使う
export function monthEndForecast(s) {
  const fees = monthlyNodeFees(s).reduce((a, f) => a + f.amount, 0);
  return passiveIncome(s).total - fees - (s.corp ? CORP_SOCIAL : 0) - shopMonthlyCost(s);
}

export function passiveIncome(s) {
  const names = [];
  let total = 0;
  if (hasSkill(s, 'div_brand')) {
    total += 300000 + Math.round(s.rating * 6000);
    names.push('自社ブランド');
  }
  if (hasSkill(s, 'div_buyback')) {
    total += 200000 + Math.round(inventoryStats(s).cost * 0.05);
    names.push('買取事業');
  }
  if (hasSkill(s, 'tr_trust')) {
    total += 500000;
    names.push('業界の信頼');
  }
  if (hasSkill(s, 'cap_trade')) {
    total += 1500000;
    names.push('総合商社');
  }
  if (hasSkill(s, 'dk_fakes')) {
    total += 300000;
    names.push('裏の卸');
  }
  if (hasSkill(s, 'cap_dark')) {
    total += 1000000;
    names.push('裏の仕事');
  }
  if (hasSkill(s, 'div_consult')) {
    total += 250000;
    names.push('情報発信');
  }
  const div = dividend(s);
  if (div) {
    total += div;
    names.push('出資の配当');
  }
  const media = mediaIncome(s);
  if (media) {
    total += media;
    names.push('レビューメディア');
  }
  const museum = museumIncome(s);
  if (museum) {
    total += museum;
    names.push('私設美術館');
  }
  return { total, names };
}

// 月の締めのレポート
function monthReport(s, rec, fees, passive) {
  const lines = [`純利益 ${yen(rec.net)}（売上 ${yen(rec.revenue)}・${rec.sold}個）`];
  const feeTotal = fees.reduce((a, f) => a + f.amount, 0) + (s.corp ? CORP_SOCIAL : 0);
  if (feeTotal) lines.push(`固定費 ${yen(feeTotal)}`);
  if (passive.total) lines.push(`事業収入 ${yen(passive.total)}`);
  if (s.fulltime) lines.push(`生活費 ${yen(livingCost(s))}`);
  return info(`${rec.month}月の締め`, lines, rec.net >= 0 ? 'good' : 'bad');
}

// ---------------- 税金 ----------------
// 個人：所得税＋住民税をざっくり累進で。法人：実効税率25%＋均等割7万円（ゲーム用の簡略化）
const BRACKETS = [
  [1950000, 0.15],
  [3300000, 0.2],
  [6950000, 0.3],
  [9000000, 0.33],
  [18000000, 0.43],
  [Infinity, 0.5],
];

export function taxFor(s, income) {
  if (s.corp) return income > 0 ? Math.round(income * 0.25) + 70000 : 70000;
  const taxable = Math.max(0, income - 580000);
  let tax = 0;
  let prev = 0;
  for (const [limit, rate] of BRACKETS) {
    const slice = Math.min(taxable, limit) - prev;
    if (slice <= 0) break;
    tax += slice * rate;
    prev = limit;
  }
  return Math.round(tax);
}

// 今年度（4月〜）の事業所得
export function fiscalIncome(s) {
  const y = yearOf(s.week);
  // 裏の稼ぎは申告しない（足を洗う前の月は数えない）
  const months = s.monthly.filter((m) => m.year === y && m.week > (s.flags.spiderThread ?? -1));
  return months.reduce((a, m) => a + m.net, 0) + (s.cur.salesProfit - s.cur.expenses + s.cur.passive);
}

// 月末の長期在庫レポート：90日以上売れていない在庫がたまってきたら、損切りを促す
export function staleReport(s) {
  const stale = s.inventory.filter((u) => u.arrive <= s.week && heldDays(s, u) >= 90);
  if (stale.length < 3) return [];
  const cost = stale.reduce((a, u) => a + u.cost, 0);
  const total = s.inventory.reduce((a, u) => a + u.cost, 0);
  const share = Math.round((cost / Math.max(1, total)) * 100);
  const steps = [info('長期在庫レポート', [`90日以上売れていない在庫：${stale.length}個（仕入れ額 ${yen(cost)}・在庫の${share}%）`, '値下げして売り切るか、在庫画面の「90日以上の在庫を買取」で現金に戻すのも手'], share >= 30 ? 'bad' : '')];
  if (share >= 30 && !s.flags.staleTalked) {
    setFlag(s, 'staleTalked', s.week);
    steps.unshift(talk('mine', '売れ残りが在庫の3割を超えたわ。仕入れ値にこだわって持ち続けると、お金が眠ったままになるの。「損切り」も立派な判断よ。', 'arms'));
  }
  return steps;
}
