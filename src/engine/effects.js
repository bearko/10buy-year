// ゲーム状態を変更する小さなヘルパー群。イベントスクリプトから呼ばれる。
import { chance } from './rng.js';
import { perk } from './perks.js';

export const MOOD_LABELS = ['絶不調', '不調', '普通', '好調', '絶好調'];
export const MOOD_MULT = [0.6, 0.8, 1.0, 1.2, 1.4];

export const hasSkill = (s, id) => s.skills.includes(id);
export const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
export const yen = (n) => `${Math.round(n).toLocaleString('ja-JP')}円`;

export function record(s, text, amount = 0) {
  s.ledger.push({ week: s.week, text, amount: Math.round(amount) });
  if (s.ledger.length > 300) s.ledger.shift();
}

export function addCash(s, amount, reason) {
  s.cash += Math.round(amount);
  if (reason) record(s, reason, amount);
}

export function addStamina(s, n) {
  s.stamina = clamp(s.stamina + n, 0, s.maxStamina);
}

// やる気を上げ下げする。「鋼のメンタル」は下がる出来事を半分の確率で無効化する。
export function addMood(s, n) {
  if (n < 0 && hasSkill(s, 'iron_mental') && chance(s, 0.5)) return 0;
  if (n < 0 && (s.lifestyle || 0) >= 3 && chance(s, 0.3)) return 0; // 家事代行：やる気が下がりにくい
  const before = s.mood;
  s.mood = clamp(s.mood + n, 0, 4);
  return s.mood - before;
}

export function addRating(s, n) {
  s.rating = clamp(s.rating + n, 0, 100);
}

export function addHate(s, n, toku = true) {
  const mult = n > 0 && hasSkill(s, 'burned') ? 1.5 : 1;
  s.hate = clamp(s.hate + n * mult, 0, 100);
  // 炎上するようなこと（規約違反・偽物…）をすると徳も下がる。逆も同じ。
  // ふだんの商売の炎上（高値の転売・行列・自然に冷める分）は徳には響かない（toku = false）
  if (toku) addToku(s, -n);
}

// TOKU（徳）：基準100（0〜200）。日々の活動への影響は小さいが、キャリアの分かれ道になる。
// 0になると「裏の人間」になり、ゲージそのものが消える（戻るには「蜘蛛の糸」しかない）
export const TOKU_BASE = 100;
export function addToku(s, n) {
  if (s.underworld) return;
  s.toku = clamp((s.toku ?? TOKU_BASE) + n, 0, 200);
  if (s.toku <= 0) fallUnderworld(s);
}

export function fallUnderworld(s) {
  s.underworld = true;
  s.toku = 0;
  s.flags.underworldWeek = s.week;
  // 表のサービスはアカウント凍結。出品は取り下げられる
  for (const u of s.inventory) if (u.listing && u.listing.platform !== 'black') u.listing = null;
}

// 経験点を加算する。やる気補正をかけるかどうかは呼び出し側で選ぶ。
export function addExp(s, gains, { mood = false } = {}) {
  const mult = mood ? MOOD_MULT[s.mood] * perk(s, 'expGain') : 1;
  const applied = {};
  for (const [k, v] of Object.entries(gains)) {
    const n = Math.round(v * mult);
    if (!n) continue;
    s.exp[k] = (s.exp[k] || 0) + n;
    applied[k] = n;
  }
  return applied;
}

export function giveHint(s, skillId, level = 1) {
  s.hints[skillId] = clamp((s.hints[skillId] || 0) + level, 0, 5);
}

export function giveSkill(s, skillId) {
  if (!s.skills.includes(skillId)) s.skills.push(skillId);
}

export function removeSkill(s, skillId) {
  s.skills = s.skills.filter((x) => x !== skillId);
}

export function addAffinity(s, hero, n = 1) {
  s.affinity[hero] = (s.affinity[hero] || 0) + n;
}

export const affinity = (s, hero) => s.affinity[hero] || 0;
export const flag = (s, key) => s.flags[key];
export const setFlag = (s, key, value = true) => {
  s.flags[key] = value;
};
