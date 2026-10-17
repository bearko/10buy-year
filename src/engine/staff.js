// スタッフ（ステージ4〜）：梱包・発送をまかせる人を雇い、育てる。
// 経験者は最初からうまいが時給が高い。未経験者は安いが、ミスをしながら育っていく（毎月の育ち＋手順書で一気に）
import { addExpense } from './kpi.js';

export const STAFF_KINDS = {
  pro: { name: '経験者', wage: 64000, skill: 75 },
  rookie: { name: '未経験の学生', wage: 44000, skill: 30 },
};
export const STAFF_MAX_SKILL = 90;

export const hasStaff = (s) => !!s.staff;
export function hireStaff(s, kind) {
  const k = STAFF_KINDS[kind];
  s.staff = { kind, skill: k.skill, wage: k.wage, since: s.week, mistakes: 0 };
  return s.staff;
}

// 月末：人件費を払い、未経験者は少しずつ育つ
export function staffMonth(s) {
  if (!s.staff) return [];
  addExpense(s, s.staff.wage, `スタッフの人件費（${STAFF_KINDS[s.staff.kind].name}）`);
  if (s.staff.skill < STAFF_MAX_SKILL) s.staff.skill = Math.min(STAFF_MAX_SKILL, s.staff.skill + (s.staff.kind === 'rookie' ? 5 : 1));
  return [`スタッフの人件費 ${s.staff.wage.toLocaleString()}円`];
}

// 発送をスタッフがするとき：体力は使わない。腕が低いと配送破損が起きやすい
export const staffDamageRate = (s) => (s.staff ? Math.max(0, 0.05 * (1 - s.staff.skill / 80)) : null);
