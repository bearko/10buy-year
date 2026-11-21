// 週替わりチャレンジ：週ごとに決まるシードで、誰が遊んでも同じ相場・同じ出来事から始まる（難易度ふつう・引き継ぎなし）。
// 結果はオンラインランキング（api/ranking.js）に登録できる。ブラウザとサーバーの両方から使う
import { allEndings, rankOf } from './ending.js';

const JST = 9 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;

// 日本時間の月曜0時で切り替わる週。ISO週番号で「2026-W41」
export function weekKey(now = Date.now()) {
  const d = new Date(now + JST);
  const day = (d.getUTCDay() + 6) % 7; // 月曜=0
  const thursday = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day + 3); // その週の木曜で年を決める
  const year = new Date(thursday).getUTCFullYear();
  const jan4 = Date.UTC(year, 0, 4); // 1月4日を含む週が第1週
  const firstThursday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY + 3 * DAY;
  const week = 1 + Math.round((thursday - firstThursday) / (7 * DAY));
  return `${year}-W${String(week).padStart(2, '0')}`;
}

// その週の月曜（日本時間）の日付。表示用に「10/5〜10/11」
export function weekRange(now = Date.now()) {
  const d = new Date(now + JST);
  const day = (d.getUTCDay() + 6) % 7;
  const mon = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - day));
  const sun = new Date(mon.getTime() + 6 * DAY);
  const md = (x) => `${x.getUTCMonth() + 1}/${x.getUTCDate()}`;
  return `${md(mon)}〜${md(sun)}`;
}

export function weeklySeed(key) {
  let x = 2166136261;
  for (const c of `10buy-weekly:${key}`) {
    x ^= c.charCodeAt(0);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}

// 登録を受けつける週：今週と先週（週をまたいで遊び終えた人のため）
export const openWeeks = (now = Date.now()) => [weekKey(now), weekKey(now - 7 * DAY)];

// ---------------- 登録内容のチェック ----------------
// ブラウザの値はいくらでも書き換えられるので、サーバーではありえない値をはじく（完全な不正対策ではない）
export const NAME_MAX = 12;
const MAX_NET_WORTH = 3e9;
const MAX_REVENUE = 2e10;

export function cleanName(name) {
  return String(name ?? '')
    .normalize('NFKC')
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e<>]/g, '')
    .trim()
    .slice(0, NAME_MAX);
}

const ENDING_TITLES = Object.fromEntries(allEndings().map((e) => [e.id, e.title]));
const BAD_ENDINGS = ['arrested', 'bankrupt', 'vanished'];

// 正しければ { ok: true, entry }（順位表に載せる形）、だめなら { ok: false, error }
export function validateEntry(body, now = Date.now()) {
  const b = body && typeof body === 'object' ? body : {};
  if (!openWeeks(now).includes(b.week)) return { ok: false, error: 'week' };
  const name = cleanName(b.name);
  if (!name) return { ok: false, error: 'name' };
  const player = String(b.player ?? '');
  if (!/^[a-z0-9]{8,32}$/.test(player)) return { ok: false, error: 'player' };
  const netWorth = Number(b.netWorth);
  const revenue = Number(b.revenue);
  if (!Number.isSafeInteger(netWorth) || Math.abs(netWorth) > MAX_NET_WORTH) return { ok: false, error: 'netWorth' };
  if (!Number.isSafeInteger(revenue) || revenue < 0 || revenue > MAX_REVENUE) return { ok: false, error: 'revenue' };
  // 純資産は、売上の2倍＋はじめの持ち物を超えない（事業売却・仮想通貨を入れても届かない上限）
  if (netWorth > revenue * 2 + 5e6) return { ok: false, error: 'netWorth' };
  const endingId = String(b.endingId ?? '');
  if (!ENDING_TITLES[endingId]) return { ok: false, error: 'ending' };
  // ランクは純資産とENDからサーバー側で決める（送られてきた値は使わない）
  const rank = BAD_ENDINGS.includes(endingId) ? 'G' : rankOf(netWorth).rank;
  const short = (x, n) => String(x ?? '').replace(/[<>\u0000-\u001f]/g, '').slice(0, n);
  return {
    ok: true,
    entry: { week: b.week, player, name, netWorth, revenue, rank, endingId, ending: ENDING_TITLES[endingId], title: short(b.title, 24), stage: short(b.stage, 24) },
  };
}
