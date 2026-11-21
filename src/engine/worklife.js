// 作業の手ざわり：撮影（背景・光・枚数で売れ行きが変わる）と、発送（部屋の品を箱に詰めて送り出す演出）。
// 撮影は画面で選び、オート（ルーティン・ボット）のときは標準の値を使う
import { addStamina } from './effects.js';
import { addExpense } from './kpi.js';

// ---- 撮影 ----
export const PHOTO = {
  bg: [
    { id: 'floor', name: '床にそのまま', score: 0, color: '#8b7d6b' },
    { id: 'wood', name: '木目の板', score: 1, color: '#b98a55' },
    { id: 'white', name: '白い布', score: 2, color: '#f4f2ee' },
  ],
  light: [
    { id: 'fluor', name: '部屋の蛍光灯', score: 0, bright: 0.85 },
    { id: 'window', name: '窓際の自然光', score: 2, bright: 1.05 },
    { id: 'ring', name: 'リングライト', score: 3, bright: 1.15, need: 'ringLight' },
  ],
  shots: [
    { id: 3, name: '3枚', score: 0 },
    { id: 6, name: '6枚', score: 2 },
    { id: 10, name: '10枚（体力-4）', score: 3, stamina: 4 },
  ],
};
export const RING_LIGHT_PRICE = 4980;
export const DEFAULT_BOOST = 1.25; // オートのとき（標準的に撮れた）

// 写真の出来（0〜8点）と、今週の売れ行きの倍率（1.1〜1.34）
export function photoScore(pick) {
  const g = (k) => PHOTO[k].find((x) => x.id === pick[k])?.score || 0;
  return g('bg') + g('light') + g('shots');
}
export const photoBoost = (score) => Math.round((1.1 + score * 0.03) * 100) / 100;

export function applyPhoto(s, pick) {
  const shots = PHOTO.shots.find((x) => x.id === pick.shots);
  if (shots?.stamina) addStamina(s, -shots.stamina);
  const score = photoScore(pick);
  s.listBoost = photoBoost(score);
  s.flags.photoBest = Math.max(s.flags.photoBest || 0, score);
  return { score, boost: s.listBoost };
}

export function buyRingLight(s) {
  if (s.flags.ringLight || s.cash < RING_LIGHT_PRICE) return false;
  addExpense(s, RING_LIGHT_PRICE, 'リングライト');
  s.flags.ringLight = true;
  return true;
}

// 今週の売れ行きの倍率（true は昔のセーブ・オートの標準）
export const listBoostOf = (s) => (s.listBoost === true ? DEFAULT_BOOST : s.listBoost || 1);

// ---- 梱包 ----
// 部屋から箱に詰めて送り出す品（アマクリは倉庫から出荷されるので、部屋にはない）。
// 梱包は判断のいらない作業なので、操作はさせず演出だけにする（ui/room.js）
export const shipTargets = (sold) => sold.filter((x) => x.platform !== 'ama');
