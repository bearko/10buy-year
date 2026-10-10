// ジャンク品：リサイクルショップのジャンクかごにある「動作未確認」の電子機器。
// 動くか・直せるか・完全に壊れているかは、買って動作確認するまでわからない
import { productOf } from '../data/products.js';
import { chance, weightedPick } from './rng.js';
import { addStamina } from './effects.js';
import { addExpense, addHours } from './kpi.js';

// ジャンクで出回る品（電子機器・機械もの）
export const JUNK_PIDS = ['cyber_staff', 'star_globe', 'retro_pc', 'photon', 'golem1', 'golem2', 'golem3', 'organ1', 'organ2', 'organ3', 'harp_box'];
export const JUNK_STATES = {
  works: { name: '動いた', mult: 0.85 }, // 中古として売れる
  fix: { name: '故障（直せそう）', mult: 0.25 },
  dead: { name: '完全に壊れている（部品取り）', mult: 0.08 },
};
export const UNCHECKED_MULT = 0.25; // 動作未確認のまま「ジャンク」として売るとき
export const CHECK_STAMINA = 3;
export const REPAIR_STAMINA = 4;
export const repairCost = (pid) => Math.round(productOf(pid).retail * 0.06 / 10) * 10;
export const repairRate = (s) => Math.min(0.9, 0.45 + s.abilities.pack / 200);

export const rollJunk = (s) => weightedPick(s, [{ k: 'works', weight: 40 }, { k: 'fix', weight: 35 }, { k: 'dead', weight: 25 }]).k;

// 在庫1個のジャンクとしての倍率
export function junkMult(u) {
  if (!u.junk) return 1;
  return u.junk.checked ? JUNK_STATES[u.junk.state].mult : UNCHECKED_MULT;
}
export const junkLabel = (u) => (!u.junk ? '' : u.junk.checked ? `ジャンク：${JUNK_STATES[u.junk.state].name}` : 'ジャンク（動作未確認）');

// 動作確認（未確認なら）と修理（直せそうなら）を1個ずつ。結果の文を返す
export function workOnJunk(s, u) {
  if (!u.junk) return null;
  if (!u.junk.checked) {
    if (s.stamina < CHECK_STAMINA) return { ok: false, msg: '体力が足りない…' };
    addStamina(s, -CHECK_STAMINA);
    addHours(s, 0.5);
    u.junk.checked = true;
    s.stats.junkChecked = (s.stats.junkChecked || 0) + 1;
    return { ok: true, state: u.junk.state, msg: `動作確認：${JUNK_STATES[u.junk.state].name}` };
  }
  if (u.junk.state !== 'fix') return { ok: false, msg: 'これ以上はどうにもならない' };
  const cost = repairCost(u.pid);
  if (s.cash < cost) return { ok: false, msg: 'お金が足りない…' };
  if (s.stamina < REPAIR_STAMINA) return { ok: false, msg: '体力が足りない…' };
  addStamina(s, -REPAIR_STAMINA);
  addHours(s, 1);
  addExpense(s, cost, `修理の部品：${productOf(u.pid).name}`);
  if (chance(s, repairRate(s))) {
    u.junk.state = 'works';
    s.stats.junkFixed = (s.stats.junkFixed || 0) + 1;
    return { ok: true, state: 'works', msg: `修理成功！ 動くようになった（部品代 ${cost.toLocaleString()}円）` };
  }
  return { ok: true, state: 'fix', msg: `修理に失敗…（部品代 ${cost.toLocaleString()}円）。もう一度やってみる？` };
}
