// 月末の支払い（カードの引き落とし・借金の返済）
import { addCash, addMood, hasSkill, record, setFlag, yen } from './effects.js';
import { info, sfx, talk } from './steps.js';

export const MIN_PAYMENT = 30000;
export const MONTHLY_INTEREST = 0.15 / 12;
export const MAX_DELINQUENCY = 3;

export function monthEnd(s) {
  const steps = [];

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
  if (s.cardPoints > 0) {
    s.points += s.cardPoints;
    steps.push(info('カードポイント', [`${s.cardPoints.toLocaleString()}pt が付与された`], 'good'));
    s.cardPoints = 0;
  }

  // 2) 利息
  if (s.debt > 0) {
    const interest = Math.round(s.debt * MONTHLY_INTEREST);
    s.debt += interest;
    s.stats.interest += interest;
    record(s, `利息（年15%）`, -interest);
  }

  // 3) 最低返済
  if (s.debt > 0) {
    const pay = Math.min(s.debt, MIN_PAYMENT);
    if (s.cash >= pay) {
      addCash(s, -pay, '月末返済');
      s.debt -= pay;
      s.stats.repaid += pay;
      steps.push(sfx('coin'), info('月末返済', [`${yen(pay)} を返済した`, `残りの借金: ${yen(s.debt)}`], 'good'));
    } else {
      s.delinquency++;
      s.debt += 5000;
      addMood(s, -1);
      steps.push(
        sfx('lose'),
        talk('collector', `ご返済が確認できておりません。至急 ${yen(pay)} をお支払いください。（遅延損害金 5,000円）`),
        talk('chris', '払えなかった…。', 'wail'),
        info('滞納', [`滞納 ${s.delinquency} / ${MAX_DELINQUENCY} 回`, s.delinquency >= MAX_DELINQUENCY - 1 ? '次に滞納したら債務整理になる！' : ''], 'bad'),
      );
      if (s.delinquency >= MAX_DELINQUENCY) s.over = 'bankrupt';
    }
  }
  if (s.debt <= 0 && !s.flags.debtFree) steps.push(...debtFreeSteps(s));
  return steps;
}

export function repay(s, amount) {
  amount = Math.min(Math.floor(amount), s.debt, s.cash);
  if (amount <= 0) return 0;
  addCash(s, -amount, '繰上げ返済');
  s.debt -= amount;
  s.stats.repaid += amount;
  return amount;
}

export function debtFreeSteps(s) {
  s.debt = 0;
  setFlag(s, 'debtFree', s.week);
  return [
    sfx('win'),
    talk('chris', 'か、完済…！ 借金、ゼロになった！！', 'cheer'),
    talk('mine', 'おめでとう、クリス！ ……でも、ここで終わり？ 残りの期間でどこまで稼げるか、見せてちょうだい。', 'banzai'),
    info('完済！', ['借金をすべて返し終えた', '以降は最終資産を積み上げよう'], 'good'),
  ];
}
