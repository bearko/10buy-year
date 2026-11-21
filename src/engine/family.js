// 家族の信頼。部屋が段ボールで埋まる・働きすぎ・夜更かしで下がり、休む・家族と過ごすと戻る。
// 下がりすぎると家族会議、高いと家族が梱包を手伝ってくれる
import { addMood, addStamina, setFlag } from './effects.js';
import { overCapacity } from './inventory.js';
import { chance } from './rng.js';
import { choice, info, narr, talk } from './steps.js';

export const familyOf = (s) => s.family ?? 70;
export function addFamily(s, d) {
  s.family = Math.max(0, Math.min(100, familyOf(s) + d));
  return s.family;
}
export const familyLabel = (v) => (v >= 80 ? '応援してくれている' : v >= 50 ? 'ふつう' : v >= 30 ? '心配されている' : '限界が近い');

// 週のはじめ：先週の暮らしぶりで上下し、出来事が起きることもある
export function familyWeek(s) {
  if (s.week < 4) return [];
  let d = 0;
  const why = [];
  if (overCapacity(s)) { d -= 3; why.push('部屋が段ボールで埋まっている'); }
  if (s.stamina < 25) { d -= 2; why.push('働きすぎ'); }
  if (!d) d = 1;
  const before = familyOf(s);
  const v = addFamily(s, d);
  const steps = [];
  if (before > 30 && v <= 30) steps.push(info('家族の信頼', [`${familyLabel(v)}（${v}）`, ...why], 'bad'));
  // 家族会議：信頼が30以下で、8週に1回まで
  if (v <= 30 && !(s.week - (s.flags.familyTalk ?? -99) < 8) && chance(s, 0.5)) {
    setFlag(s, 'familyTalk', s.week);
    steps.push(
      narr('夕飯のあと、家族に呼び止められた。「ちょっと話があるんだけど」'),
      talk('chris', '（部屋の段ボール、夜中のスマホ、休みのない週末…。言われることは分かっている）', 'sad'),
      choice([
        {
          label: 'しばらく仕事を減らすと約束する',
          run: () => {
            addFamily(s, 25);
            addStamina(s, 20);
            addMood(s, 1);
            return [narr('週末は仕入れに行かず、家族と過ごした。部屋の段ボールも少し片付けた。'), info('家族の信頼', [`+25（${familyOf(s)}）`, '体力 +20、やる気が上がった'], 'good')];
          },
        },
        {
          label: '「いまが踏ん張りどきなんだ」と押し切る',
          run: () => {
            addFamily(s, -5);
            addMood(s, -1);
            return [narr('話はそこで終わった。食卓が、少し静かになった。'), info('家族の信頼', [`-5（${familyOf(s)}）`, 'やる気が下がった'], 'bad')];
          },
        },
      ], '家族会議'),
    );
  } else if (v >= 80 && s.stats.soldUnits > 0 && chance(s, 0.08)) {
    addStamina(s, 10);
    steps.push(narr('「梱包、手伝おうか？」家族がプチプチを巻くのを手伝ってくれた。'), info('家族の手伝い', ['体力 +10'], 'good'));
  }
  return steps;
}
