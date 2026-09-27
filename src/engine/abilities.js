import { SKILLS, SKILL_MAP } from '../data/skills.js';
import { giveSkill, removeSkill } from './effects.js';

export const EXP_TYPES = [
  { id: 'info', name: '情報' },
  { id: 'act', name: '行動' },
  { id: 'tech', name: '技術' },
  { id: 'social', name: '対人' },
  { id: 'mind', name: '精神' },
];
export const EXP_NAME = Object.fromEntries(EXP_TYPES.map((e) => [e.id, e.name]));

// 基礎能力。どの経験点を使って上げるかはパワプロの「筋力・敏捷…」と同じ考え方。
export const ABILITIES = [
  { id: 'eye', name: '目利き', desc: '相場を読む精度と、偽物に気づく力', weights: { info: 1, mind: 0.5 } },
  { id: 'buy', name: '仕入れ', desc: '掘り出し物を見つける力。抽選・行列にも効く', weights: { act: 1, info: 0.5 } },
  { id: 'list', name: '出品', desc: '写真と説明文の上手さ。高く・早く売れる', weights: { tech: 1, info: 0.5 } },
  { id: 'talk', name: '交渉', desc: '値下げ交渉とトラブル対応の上手さ', weights: { social: 1, mind: 0.5 } },
  { id: 'pack', name: '梱包', desc: '梱包・発送の手際。体力消費と破損が減る', weights: { act: 1, tech: 0.5 } },
];
export const ABILITY_NAME = Object.fromEntries(ABILITIES.map((a) => [a.id, a.name]));
export const ABILITY_MAX = 100;

export function rankOf(v) {
  if (v >= 90) return 'S';
  if (v >= 80) return 'A';
  if (v >= 70) return 'B';
  if (v >= 60) return 'C';
  if (v >= 50) return 'D';
  if (v >= 40) return 'E';
  if (v >= 20) return 'F';
  return 'G';
}

// 能力を +1 するのに必要な経験点。高いほど上げにくい。
export function abilityCost(abilityId, level) {
  const ab = ABILITIES.find((a) => a.id === abilityId);
  const unit = 3 + Math.floor(level / 10) * 1.5;
  const cost = {};
  for (const [k, w] of Object.entries(ab.weights)) cost[k] = Math.ceil(unit * w);
  return cost;
}

export const canAfford = (s, cost) => Object.entries(cost).every(([k, v]) => (s.exp[k] || 0) >= v);

function pay(s, cost) {
  for (const [k, v] of Object.entries(cost)) s.exp[k] -= v;
}

export function raiseAbility(s, abilityId, times = 1) {
  let done = 0;
  for (let i = 0; i < times; i++) {
    const lv = s.abilities[abilityId];
    if (lv >= ABILITY_MAX) break;
    const cost = abilityCost(abilityId, lv);
    if (!canAfford(s, cost)) break;
    pay(s, cost);
    s.abilities[abilityId] = lv + 1;
    done++;
  }
  return done;
}

// コツのレベルに応じて特殊能力の習得コストが下がる（Lv1:-20% … Lv5:-60%）。
export function skillCost(s, skillId) {
  const sk = SKILL_MAP[skillId];
  const hint = s.hints[skillId] || 0;
  const rate = sk.kind === 'red' ? 1 : 1 - Math.min(0.6, hint * 0.12 + (hint > 0 ? 0.08 : 0));
  const cost = {};
  for (const [k, v] of Object.entries(sk.cost)) cost[k] = Math.ceil(v * rate);
  return cost;
}

// 習得できる（ボタンを出してよい）特殊能力の一覧
export function learnableSkills(s) {
  return SKILLS.filter((sk) => {
    if (sk.kind === 'red') return s.skills.includes(sk.id);
    if (s.skills.includes(sk.id)) return false;
    if (sk.kind === 'gold') return (s.hints[sk.id] || 0) > 0;
    return true;
  });
}

export function learnSkill(s, skillId) {
  const sk = SKILL_MAP[skillId];
  const cost = skillCost(s, skillId);
  if (!canAfford(s, cost)) return false;
  if (sk.kind === 'gold' && !(s.hints[skillId] > 0)) return false;
  pay(s, cost);
  if (sk.kind === 'red') removeSkill(s, skillId);
  else giveSkill(s, skillId);
  return true;
}
