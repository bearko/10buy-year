import { CAPSTONE_NEED, SKILLS, SKILL_MAP, TREE_NODES } from '../data/skills.js';
import { mainRoutes, perk, routeCounts } from './perks.js';
import { giveSkill, removeSkill } from './effects.js';

export const EXP_TYPES = [
  { id: 'info', name: '情報' },
  { id: 'act', name: '行動' },
  { id: 'tech', name: '技術' },
  { id: 'social', name: '対人' },
  { id: 'mind', name: '精神' },
];
export const EXP_NAME = Object.fromEntries(EXP_TYPES.map((e) => [e.id, e.name]));

// 基礎能力。行動で貯めた経験点（情報・行動・技術・対人・精神）を組み合わせて上げる。
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

// ---------------- スキルツリー ----------------
export const nodeLv = (s, id) => (s.nodeLv?.[id] || 0);
const owns = (s, id) => s.skills.includes(id) || nodeLv(s, id) > 0;

// 記録パネル（丸）の現在値
export function recordValue(s, key) {
  if (key === 'netTotal') return s.monthly.reduce((a, m) => a + m.net, 0);
  return s.stats[key] || 0;
}

// 専門外コスト：ルートのノードを4個以上持ったら、上位2ルート以外のノードは25%高くなる
export const OFF_ROUTE_RATE = 1.25;
export function isOffRoute(s, skillId) {
  const sk = SKILL_MAP[skillId];
  if (!sk.route || ['starter', 'record', 'red'].includes(sk.kind)) return false;
  const counts = routeCounts(s);
  const total = Object.values(counts).reduce((a, n) => a + n, 0);
  if (total < 4) return false;
  return !mainRoutes(s).slice(0, 2).includes(sk.route);
}

// 解放コスト。金ノードはコツLvで安くなり、repeat はレベルごとに高くなり、専門外は高くなる
export function skillCost(s, skillId) {
  const sk = SKILL_MAP[skillId];
  if (sk.kind === 'record') return {};
  let rate = 1;
  if (sk.kind === 'gold' || sk.kind === 'perk') {
    const hint = s.hints[skillId] || 0;
    rate = 1 - Math.min(0.6, hint * 0.12 + (hint > 0 ? 0.08 : 0));
  }
  if (sk.kind === 'repeat') rate = 1 + nodeLv(s, skillId);
  if (isOffRoute(s, skillId)) rate *= OFF_ROUTE_RATE;
  const cost = {};
  for (const [k, v] of Object.entries(sk.cost || {})) cost[k] = Math.ceil(v * rate);
  return cost;
}

// 解放できない理由の一覧（空なら解放できる状態）
export function nodeBlockers(s, skillId) {
  const sk = SKILL_MAP[skillId];
  const out = [];
  if (sk.parent && !owns(s, sk.parent)) out.push(`「${SKILL_MAP[sk.parent].name}」の先`);
  for (const r of sk.req || []) if (!owns(s, r)) out.push(`「${SKILL_MAP[r].name}」が必要`);
  if (sk.stage && s.stage < sk.stage) out.push(`ステージ${sk.stage}から`);
  if (sk.flag && !s.flags[sk.flag]) out.push(sk.flag === 'license' ? '古物商許可が必要' : '条件未達');
  if (sk.kind === 'gold' && !(s.hints[skillId] > 0)) out.push('偉人からコツを教わる必要がある');
  if (sk.kind === 'record' && recordValue(s, sk.record.key) < sk.record.target) out.push(`${sk.record.label}：${Math.floor(recordValue(s, sk.record.key)).toLocaleString()} / ${sk.record.target.toLocaleString()}`);
  if (sk.kind === 'capstone') {
    const n = routeCounts(s)[sk.route] || 0;
    if (n < CAPSTONE_NEED) out.push(`このルートのノードを${CAPSTONE_NEED}個（いま${n}個）`);
  }
  return out;
}

export function nodeState(s, skillId) {
  const sk = SKILL_MAP[skillId];
  if (sk.kind === 'repeat') {
    if (nodeLv(s, skillId) >= sk.max) return 'owned';
  } else if (s.skills.includes(skillId)) {
    return sk.kind === 'red' ? 'red' : 'owned';
  }
  if (sk.kind === 'red') return 'none';
  return nodeBlockers(s, skillId).length ? 'locked' : 'available';
}

// ツリーに表示するか：中心、持っているノード、親を持っているノード
export function nodeVisible(s, skillId) {
  const sk = SKILL_MAP[skillId];
  if (sk.kind === 'root') return true;
  if (!sk.route) return false;
  return owns(s, skillId) || owns(s, sk.parent);
}

export function learnableSkills(s) {
  return SKILLS.filter((sk) => ['available', 'red'].includes(nodeState(s, sk.id)));
}

// イベントやチュートリアルで無料で解放する
export function grantSkill(s, skillId) {
  const sk = SKILL_MAP[skillId];
  if (sk.kind === 'repeat') {
    s.nodeLv[skillId] = Math.min(sk.max, nodeLv(s, skillId) + 1);
    return;
  }
  giveSkill(s, skillId);
}

export function learnSkill(s, skillId) {
  const sk = SKILL_MAP[skillId];
  const state = nodeState(s, skillId);
  if (state !== 'available' && state !== 'red') return false;
  const cost = skillCost(s, skillId);
  if (!canAfford(s, cost)) return false;
  pay(s, cost);
  if (sk.kind === 'red') removeSkill(s, skillId);
  else grantSkill(s, skillId);
  return true;
}

// 所有ノードの月額維持費（仕組み化ルートの熟練度・物流センターで安くなる）
export function monthlyNodeFees(s) {
  const mult = perk(s, 'monthlyFees');
  return SKILLS.filter((sk) => sk.monthly && s.skills.includes(sk.id)).map((sk) => ({ name: sk.name, amount: Math.round(sk.monthly * mult) }));
}

// いま自分の手で解放できるパネル（経験点が足りるもの・条件を満たした記録パネル）
export function claimableNodes(s) {
  return TREE_NODES.filter((n) => nodeVisible(s, n.id) && nodeState(s, n.id) === 'available' && canAfford(s, skillCost(s, n.id)));
}
