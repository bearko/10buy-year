// スニーカーのサイズ。売れ筋のサイズ（26.5〜27.0cm）は高く、端のサイズは安い。
// 店のワゴンに残っているのは、たいてい売れ残りのサイズ
import { catOf } from './listing.js';
import { chance, weightedPick } from './rng.js';

export const SHOE_SIZES = [23, 23.5, 24, 24.5, 25, 25.5, 26, 26.5, 27, 27.5, 28, 28.5, 29, 29.5, 30];
// 世の中に出回る数（ふつうの分布）
const SUPPLY = { 23: 1, 23.5: 1, 24: 2, 24.5: 2, 25: 4, 25.5: 5, 26: 8, 26.5: 10, 27: 10, 27.5: 8, 28: 6, 28.5: 3, 29: 2, 29.5: 1, 30: 1 };

export const isSneaker = (pid) => catOf(pid) === 'sneaker';

export function sizeMult(cm) {
  if (cm === undefined) return 1;
  if (cm === 26.5 || cm === 27) return 1.12;
  if (cm >= 26 && cm <= 28) return 1.05;
  if (cm >= 25 && cm <= 28.5) return 0.95;
  return 0.75;
}
export const sizeLabel = (cm) => `${cm.toFixed(1)}cm（${sizeMult(cm) > 1.1 ? '人気' : sizeMult(cm) >= 1 ? 'ふつう' : sizeMult(cm) >= 0.9 ? 'やや不人気' : '不人気'}）`;

// 仕入れ候補のサイズ。leftover：売れ残り（ワゴン・見切り品）は不人気サイズが多い
export function pickSize(s, { leftover = false } = {}) {
  const pool = SHOE_SIZES.map((cm) => ({ cm, weight: SUPPLY[cm] * (leftover && sizeMult(cm) < 1 ? 3 : 1) }));
  return weightedPick(s, pool).cm;
}

// サイズ違いの返品が起きやすいか（スニーカーの取引だけ）
export const sizeReturnWeight = (pid) => (isSneaker(pid) ? 2.5 : 0);

export const leftoverLabel = (label = '') => /ワゴン|処分|見切り|閉店|値札ミス|型落ち/.test(label);
export const rollLeftover = (s, offer) => leftoverLabel(offer.label) || (offer.source === 'flea' && chance(s, 0.3));
