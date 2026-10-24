// 志（こころざし）。ステージ4（法人化）で、この先の10年で目指すものを1つ選ぶ。
// 志ごとに3段の目標があり、達成度（0〜3）でエンディングが分かれる。純資産は最終査定に残る
import { addExp, addMood } from './effects.js';
import { careerOf, hasCareer } from './careers.js';
import { completeSeries, PIECES } from './collection.js';
import { netWorth } from './ending.js';
import { activeRivals } from './rivals.js';
import { celebrate, choice, info, sfx, talk } from './steps.js';

const trCount = (s) => s.skills.filter((id) => id.startsWith('tr_') || id === 'cap_trade').length;
const kol = (s) => careerOf(s, 'kol') || {};
const ap = (s) => careerOf(s, 'appraiser') || {};
const rivalsBeaten = (s) => activeRivals(s).filter((r) => s.rivals[r.id].passed).length;

export const VISIONS = {
  trade: {
    name: '総合商社', mentor: 'ryoma', desc: '正道ルートを極め、信用で大きくなる。TOKUが高くないと進めない',
    milestones: [
      { title: '正道のパネルを3枚', value: trCount, target: 3, unit: '枚' },
      { title: 'パネル「業界の信頼」', value: (s) => (s.skills.includes('tr_trust') ? 1 : 0), target: 1, unit: '' },
      { title: 'パネル「総合商社」', value: (s) => (s.skills.includes('cap_trade') ? 1 : 0), target: 1, unit: '' },
    ],
    full: { title: '総合商社END', lines: ['合同会社クリス物販は、メーカーの正規代理店を束ねる商社になった。', '「転売ヤー」と呼ばれた男の名刺には、いま「代表取締役社長」とある。', '龍馬は笑った。「海援隊の続きを、おまんがやってくれたぜよ」'], pose: 'cheer' },
  },
  kol: {
    name: '配信の女王', mentor: 'yohki', career: 'kol', desc: 'ライブコマースで「この人から買いたい」と思われる存在になる',
    milestones: [
      { title: 'フォロワー3,000人', value: (s) => kol(s).followers || 0, target: 3000, unit: '人' },
      { title: '1回の配信で売上50万円', value: (s) => kol(s).bestStream || 0, target: 500000, unit: '円' },
      { title: 'フォロワー1万人', value: (s) => kol(s).followers || 0, target: 10000, unit: '人' },
    ],
    full: { title: '配信の女王END', lines: ['スマホ1台で始めた配信は、毎晩1万人が集まる番組になった。', '「クリスさんが勧めるなら」――その一言で、品物が売り切れる。', '楊貴妃は言った。「美しさは、伝える人がいて初めて届くのよ」'], pose: 'sparkle' },
  },
  appraiser: {
    name: '目利きの館', mentor: 'hokusai', career: 'appraiser', desc: '鑑定士として、真贋と価値を見極める館を開く',
    milestones: [
      { title: '鑑定100件', value: (s) => ap(s).jobs || 0, target: 100, unit: '件' },
      { title: '鑑定士としての信用90', value: (s) => ap(s).trust || 0, target: 90, unit: '' },
      { title: '委託販売の取り分 累計300万円', value: (s) => ap(s).consignIncome || 0, target: 3000000, unit: '円' },
    ],
    full: { title: '目利きの館END', lines: ['「クリス鑑定館」には、今日も古い品が持ち込まれる。', '本物には正しい値を、偽物には正直な言葉を。', '北斎は筆を置いた。「おぬしの眼は、もう誰にも曇らせられんな」'], pose: 'smile' },
  },
  museum: {
    name: '私設美術館', mentor: 'marie', desc: '売らずに集める。図鑑を完成させ、人を招く美術館をつくる',
    milestones: [
      { title: `コレクション${Math.round(PIECES.length * 0.3)}点`, value: (s) => (s.collection || []).length, target: Math.round(PIECES.length * 0.3), unit: '点' },
      { title: '美術館を開き、シリーズを3つそろえる', value: (s) => (s.museum ? completeSeries(s).length : 0), target: 3, unit: 'シリーズ' },
      { title: `コレクション${Math.round(PIECES.length * 0.9)}点`, value: (s) => (s.collection || []).length, target: Math.round(PIECES.length * 0.9), unit: '点' },
    ],
    full: { title: '私設美術館END', lines: ['転売で稼いだお金は、売らない品に変わった。', '「クリス美術館」の展示室には、10年かけて集めた品が並ぶ。', 'マリーは目を細めた。「お金は、使い方で品が出ますのね」'], pose: 'sparkle' },
  },
  tycoon: {
    name: '物販王', mentor: 'nobunaga', desc: '純資産で天下を取る。ライバル転売屋をすべて抜き去る',
    milestones: [
      { title: '純資産5,000万円', value: netWorth, target: 50000000, unit: '円' },
      { title: '純資産1億円', value: netWorth, target: 100000000, unit: '円' },
      { title: '長者番付でライバル全員を抜く', value: rivalsBeaten, target: 4, unit: '人' },
    ],
    full: { title: '物販王END', lines: ['長者番付の一番上に、クリスの名前があった。', '亡霊たちは、もう誰も追いついてこない。', '信長は言った。「天下を取ったな。……次は、何を取る？」'], pose: 'cheer' },
  },
};

export const visionOf = (s) => (s.vision ? VISIONS[s.vision.id] : null);
export const visionAvailable = (s) => Object.entries(VISIONS).filter(([, v]) => !v.career || hasCareer(s, v.career)).map(([id]) => id);
export const visionDone = (s) => (s.vision ? Object.keys(s.vision.done || {}).length : 0);
export const CHANGE_WEEKS = 48;
export const canChangeVision = (s) => !!s.vision && s.week >= s.vision.chosen + CHANGE_WEEKS;

export function chooseVision(s, id) {
  s.vision = { id, chosen: s.week, done: {} };
}

// ステージ4（法人化）のあと、週のはじめに志を選ぶ
export function visionWeek(s) {
  if (s.underworld || s.stage < 4 || s.vision || s.week < (s.flags.visionAsk || 0)) return [];
  return [
    talk('ryoma', '会社になったのう。……クリス、おまんはこの会社で、何を成し遂げたいがじゃ？'),
    talk('mine', '「志」を決めておくと、毎月の目標がはっきりするわ。あとから年に一度だけ変えられる。', 'pointer'),
    choice([
      ...visionAvailable(s).map((id) => ({
        label: VISIONS[id].name,
        sub: VISIONS[id].desc,
        run: () => {
          chooseVision(s, id);
          const v = VISIONS[id];
          return [sfx('stageup'), talk(v.mentor, `「${v.name}か。よかろう、見届けてやる」`), info(`志：${v.name}`, v.milestones.map((m, i) => `${i + 1}. ${m.title}`), 'good')];
        },
      })),
      { label: 'まだ決めない', run: () => { s.flags.visionAsk = s.week + 12; return [talk('ryoma', '急がんでええ。決まったら教えてくれ')]; } },
    ]),
  ];
}

// 月末：目標の達成を確かめる（一度達成した目標は、あとで下回っても達成のまま）
export function visionMonthly(s) {
  const v = visionOf(s);
  if (!v || s.underworld) return [];
  const steps = [];
  v.milestones.forEach((m, i) => {
    if (s.vision.done[i] !== undefined || m.value(s) < m.target) return;
    s.vision.done[i] = s.week;
    addExp(s, { info: 50, social: 50, mind: 50 });
    addMood(s, 1);
    steps.push(celebrate(`志の目標 ${visionDone(s)}/3 達成！`), sfx('stageup'), talk(v.mentor, i === 2 ? '「見事じゃ。志を成し遂げたな」' : '「ほう、やるではないか。次も見せてもらおう」'), info(`志：${v.name}`, [`「${m.title}」を達成した`, '情報・対人・精神 +50、やる気が上がった'], 'good'));
  });
  return steps;
}

// HUD の目標欄（ステージ5で志を決めていれば、次の目標を出す）
export function visionGoal(s) {
  const v = visionOf(s);
  if (!v) return null;
  const i = v.milestones.findIndex((_, k) => s.vision.done[k] === undefined);
  if (i < 0) return { title: `志「${v.name}」を成し遂げた`, short: `志：${v.name}`, value: 1, target: 1, note: '達成 3/3', mine: 'あとは最終査定まで、思いきり稼ぎましょう。' };
  const m = v.milestones[i];
  return { title: m.title, short: `志：${v.name}`, value: m.value(s), target: m.target, note: `達成 ${visionDone(s)}/3`, mine: `志「${v.name}」の次の目標よ。` };
}

// 最終査定：志の達成度でエンディングが分かれる
export function visionEnding(s) {
  const v = visionOf(s);
  if (!v) return null;
  const n = visionDone(s);
  if (n >= 3) return { id: `vision_${s.vision.id}`, ...v.full };
  if (n >= 1) {
    return {
      id: 'vision_half', title: '志半ばEND',
      lines: [`志「${v.name}」を掲げて走った5年だった。`, `目標の${n}つまでは届いた。残りは、まだ先にある。`, '「10年じゃ足りなかったな。……でも、まだ終わりじゃない」'],
      pose: 'guts',
    };
  }
  return null;
}
