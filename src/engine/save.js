// localStorage へのセーブ／ロード。プライベートブラウズなどで使えなくても落ちないようにする。
import { SAVE_VERSION } from './state.js';

const SAVE_KEY = '10buy-year:save';
const RANK_KEY = '10buy-year:ranking';

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
