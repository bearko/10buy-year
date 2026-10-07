// 継承：前の周の転売屋を保存し、次の周で「師匠」として相談できる（12週に1回）。
// 師匠がいちばん伸ばした基礎能力の経験点と、歩んだルートにちなんだ助言がもらえる
import { ROUTE_MAP } from '../data/skills.js';
import { ABILITIES, ABILITY_NAME } from './abilities.js';
import { addExp } from './effects.js';
import { mainRoutes } from './perks.js';
import { gain, narr, talk } from './steps.js';

export const MENTOR_COOL = 12;

const TIPS = {
  store: '店は足で回れ。チラシが出ている店から行くんだ。棚は入口のワゴンから見ろ。',
  online: '夜のスマホは時間との勝負だ。安い出品はすぐ消える。通知から先に開け。',
  vintage: '中古は真贋がすべてだ。刻印と付属品を見ずに買うな。相場は売り切れで確かめろ。',
  sales: '売り先を増やせ。同じ品でも、売る場所で値段が変わる。',
  system: '自分が動かなくても回る仕組みを早めに作れ。体は一つしかない。',
  network: 'トラブルは誠実に返せ。評価は一度落ちると戻すのに時間がかかる。',
  manage: '毎月の数字を見ろ。売れ残りは早めに損切りして、お金を眠らせるな。',
  trade: '徳は見えないが、効いてくる。信用で大きくなる道もある。',
  dark: '……俺の真似はするな。裏の道は、引き返せない。',
};

// エンディングで保存する記録
export function mentorRecord(s, result) {
  return { title: result.title, ending: result.ending.title, netWorth: result.netWorth, route: mainRoutes(s)[0] || null, abilities: { ...s.abilities }, date: new Date().toLocaleDateString('ja-JP') };
}

export const canAskMentor = (s) => !!s.mentor && s.week >= (s.flags?.mentorWeek ?? -MENTOR_COOL) + MENTOR_COOL;

export function mentorSteps(s) {
  const m = s.mentor;
  s.flags.mentorWeek = s.week;
  const top = ABILITIES.slice().sort((a, b) => (m.abilities[b.id] || 0) - (m.abilities[a.id] || 0))[0];
  const amount = 10 + s.stage * 8;
  const exp = Object.fromEntries(Object.entries(top.weights).map(([k, w]) => [k, Math.round(amount * w)]));
  const got = addExp(s, exp);
  const route = m.route && ROUTE_MAP[m.route] ? ROUTE_MAP[m.route] : null;
  return [
    narr(`「${m.title}」と呼ばれた先代の転売屋——前の周のクリスに、電話で相談した。`),
    talk('mentor', `${route ? `俺は「${route.name}」の道を歩いた。` : ''}${TIPS[m.route] || '焦るな。一個ずつ、確実にだ。'}`),
    talk('mentor', `それと……${ABILITY_NAME[top.id]}は俺の得意だった。コツを教えてやる。`),
    gain(got),
  ];
}
