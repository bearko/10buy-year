// localStorage へのセーブ／ロード。プライベートブラウズなどで使えなくても落ちないようにする。
import { SAVE_VERSION } from './state.js';
import { ensureMarket } from './market.js';

const SAVE_KEY = '10buy-year:save';
const RANK_KEY = '10buy-year:ranking';
const DAILY_KEY = '10buy-year:daily';
const LEGACY_KEY = '10buy-year:legacy';
const MENTOR_KEY = '10buy-year:mentors';

function storage() {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function saveGame(s) {
  try {
    storage()?.setItem(SAVE_KEY, JSON.stringify(s));
    return true;
  } catch {
    return false;
  }
}

export function loadGame() {
  try {
    const raw = storage()?.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (s.version !== SAVE_VERSION) return null;
    if (s.toku === undefined) s.toku = Math.max(1, 100 - Math.round(s.hate || 0)); // 炎上度から TOKU へ
    ensureMarket(s); // あとから追加した商品の相場
    return s;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    storage()?.removeItem(SAVE_KEY);
  } catch {
    /* noop */
  }
}

export function loadRanking() {
  try {
    return JSON.parse(storage()?.getItem(RANK_KEY) || '[]');
  } catch {
    return [];
  }
}

export function pushRanking(entry) {
  const list = loadRanking();
  list.push(entry);
  list.sort((a, b) => b.netWorth - a.netWorth);
  const top = list.slice(0, 10);
  try {
    storage()?.setItem(RANK_KEY, JSON.stringify(top));
  } catch {
    /* noop */
  }
  return top;
}

// デイリーチャレンジの記録（日付ごとに上位5件、直近7日分）
export function loadDaily(key) {
  try {
    return JSON.parse(storage()?.getItem(DAILY_KEY) || '{}')[key] || [];
  } catch {
    return [];
  }
}

export function pushDaily(key, entry) {
  let all = {};
  try {
    all = JSON.parse(storage()?.getItem(DAILY_KEY) || '{}');
  } catch {
    /* noop */
  }
  all[key] = [...(all[key] || []), entry].sort((a, b) => b.netWorth - a.netWorth).slice(0, 5);
  const keep = Object.keys(all).sort().slice(-7);
  try {
    storage()?.setItem(DAILY_KEY, JSON.stringify(Object.fromEntries(keep.map((k) => [k, all[k]]))));
  } catch {
    /* noop */
  }
  return all[key];
}

// 前の周までにたどり着いたルートの到達点（次の周に1つ引き継げる）
export function loadLegacy() {
  try {
    return JSON.parse(storage()?.getItem(LEGACY_KEY) || '[]');
  } catch {
    return [];
  }
}

export function pushLegacy(ids) {
  const all = [...new Set([...loadLegacy(), ...ids])];
  try {
    storage()?.setItem(LEGACY_KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
  return all;
}

// 継承：前の周までの転売屋（新しい順に3人まで）
export function loadMentors() {
  try {
    return JSON.parse(storage()?.getItem(MENTOR_KEY) || '[]');
  } catch {
    return [];
  }
}

export function pushMentor(rec) {
  const list = [rec, ...loadMentors()].slice(0, 3);
  try {
    storage()?.setItem(MENTOR_KEY, JSON.stringify(list));
  } catch {
    /* noop */
  }
  return list;
}
