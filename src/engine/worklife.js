// 作業の手ざわり：撮影（背景・光・枚数で売れ行きが変わる）と、梱包（品に合う箱を選ぶ）。
// どちらも画面で選ぶ演出で、オート（ルーティン・ボット）のときは標準の値を使う
import { productOf } from '../data/products.js';
import { addStamina, hasSkill } from './effects.js';
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
export const BOXES = [
  { id: 60, name: '60サイズ', fits: 'S' },
  { id: 80, name: '80サイズ', fits: 'M' },
  { id: 100, name: '100サイズ', fits: 'L' },
];
const ORDER = { S: 0, M: 1, L: 2 };
// 箱が大きすぎると、1段階ごとに送料が上がる
export const OVERSIZE_FEE = 180;

// 'ok'：ぴったり / 'big'：入るが送料が上がる / 'small'：入らない
export function boxFit(pid, boxId) {
  const need = ORDER[productOf(pid).size];
  const have = BOXES.findIndex((b) => b.id === boxId);
  return have < need ? 'small' : have === need ? 'ok' : 'big';
}
export const oversizeCost = (pid, boxId) => Math.max(0, BOXES.findIndex((b) => b.id === boxId) - ORDER[productOf(pid).size]) * OVERSIZE_FEE;

// 自分で発送する品（倉庫・外注・手渡しは除く）。梱包の達人なら箱選びはいらない
export function packTargets(s, sold) {
  if (hasSkill(s, 'pack_master') || hasSkill(s, 'out_ship')) return [];
  return sold.filter((x) => !['ama', 'black'].includes(x.platform));
}

export function chargeOversize(s, picks) {
  const total = picks.reduce((a, x) => a + oversizeCost(x.pid, x.box), 0);
  if (total) addExpense(s, total, `送料の追加（箱が大きすぎた ${picks.filter((x) => oversizeCost(x.pid, x.box)).length}件）`);
  return total;
}
