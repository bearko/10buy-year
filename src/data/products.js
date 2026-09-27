import { weekAt } from '../engine/calendar.js';

// 商品マスタ。画像はマイクリのエクステンション（ext = エクステンションID）。
// 名前はエクステンション名そのままに、「現実の転売ジャンル」を genre として割り当てている。
//
// kind（相場の動き方）
//   staple     定番品。相場は定価の少し下で安定。値引き・ポイントで利ざやを取る
//   hype       新作限定品。発売直後がピークで、時間とともに下がる。再販で暴落する
//   collect    絶版・ヴィンテージ。ゆっくり値上がりするが買い手が少ない
//   seasonal   季節もの。ピークの週を過ぎると一気に値崩れする
//   perishable 限定スイーツ。催事の週にしか手に入らず、賞味期限がある
//   boom       謎のブーム。突然バズって暴騰し、ある日突然終わる
//   luxury     高級品。正規店でまれに定価で買える
//   home       家にある不用品。仕入れはできず「家の中を探す」で見つかる（自分の物なので許可不要）
// size: S/M/L（送料・梱包の手間・部屋の占有スペースに影響）
// used: true の商品は中古でしか流通しない（仕入れには古物商許可が必要）
// fakeRisk: 怪しいルートで仕入れたときに偽物をつかむ基本確率

export const PRODUCTS = [
  { id: 'old_hat', name: 'ハット', genre: '着なくなった帽子', ext: 1059, kind: 'home', retail: 2400, size: 'M', demand: 1.3, base: 1.0, used: true, fakeRisk: 0 },
  { id: 'gift_glass', name: 'グラス', genre: '引き出物のグラス', ext: 1075, kind: 'home', retail: 3000, size: 'M', demand: 1.2, base: 1.0, used: true, fakeRisk: 0 },
  { id: 'old_figure', name: 'モンシロちゃん', genre: '昔集めたフィギュア', ext: 1112, kind: 'home', retail: 5200, size: 'S', demand: 1.1, base: 1.0, used: true, fakeRisk: 0 },
  { id: 'fountain_pen', name: 'ノービスペン', genre: 'もらいものの万年筆', ext: 1003, kind: 'home', retail: 7800, size: 'S', demand: 0.9, base: 1.0, used: true, fakeRisk: 0 },
  { id: 'old_violin', name: 'ヴァイオリン', genre: '子どもの頃のヴァイオリン', ext: 1069, kind: 'home', retail: 14000, size: 'L', demand: 0.6, base: 1.0, used: true, fakeRisk: 0 },

  { id: 'boots', name: 'ブーツ', genre: '定番スニーカー', ext: 1031, kind: 'staple', retail: 12000, size: 'M', demand: 3.0, base: 1.05, fakeRisk: 0.2 },
  { id: 'pocket_watch', name: '懐中時計', genre: '定番ウォッチ', ext: 1111, kind: 'staple', retail: 26000, size: 'S', demand: 1.8, base: 0.98, fakeRisk: 0.3 },
  { id: 'sake', name: 'サケ', genre: '地酒', ext: 1058, kind: 'staple', retail: 3300, size: 'M', demand: 2.0, base: 1.0, alcohol: true, fakeRisk: 0 },
  { id: 'scroll', name: 'スクロール', genre: 'トレカBOX（定番）', ext: 1016, kind: 'staple', retail: 5500, size: 'S', demand: 3.4, base: 1.1, fakeRisk: 0.15 },
  { id: 'novice_book', name: 'ノービスブック', genre: '古本', ext: 1008, kind: 'collect', retail: 900, size: 'S', demand: 2.6, base: 1.0, drift: 0, used: true, fakeRisk: 0 },

  { id: 'heiho', name: '兵法書', genre: '人気トレカ新弾BOX', ext: 4016, kind: 'hype', retail: 5500, size: 'S', demand: 3.2, release: weekAt(4, 3), peak: 3.0, floor: 1.7, decay: 0.09, restock: 0.07, odds: 0.3, fakeRisk: 0.35, fakeNote: '再シュリンク品' },
  { id: 'western_boots', name: '大西部のブーツ', genre: 'コラボスニーカー', ext: 4031, kind: 'hype', retail: 22000, size: 'M', demand: 2.6, release: weekAt(5, 2), peak: 2.4, floor: 1.4, decay: 0.07, restock: 0.04, odds: 0.2, fakeRisk: 0.45 },
  { id: 'sylph', name: 'シルフ', genre: '限定フィギュア', ext: 3112, kind: 'hype', retail: 9800, size: 'M', demand: 2.4, release: weekAt(7, 1), peak: 2.2, floor: 1.3, decay: 0.07, restock: 0.05, odds: 0.22, fakeRisk: 0.3 },
  { id: 'golden_boots', name: 'コボルドの黄金ブーツ', genre: '超限定スニーカー', ext: 5531, kind: 'hype', retail: 38000, size: 'M', demand: 2.0, release: weekAt(9, 1), peak: 3.2, floor: 1.8, decay: 0.08, restock: 0.02, odds: 0.08, fakeRisk: 0.55 },
  { id: 'nectar', name: 'ネクタール', genre: 'プレミアウイスキー', ext: 5058, kind: 'hype', retail: 11000, size: 'M', demand: 1.6, release: weekAt(10, 2), peak: 3.6, floor: 3.0, decay: 0.05, restock: 0.01, odds: 0.15, alcohol: true, fakeRisk: 0.25 },
  { id: 'photon', name: 'フォトングラス', genre: '新型VRゲーム機', ext: 5075, kind: 'hype', retail: 49980, size: 'M', demand: 3.0, release: weekAt(11, 4), peak: 1.8, floor: 1.2, decay: 0.06, restock: 0.12, odds: 0.12, fakeRisk: 0.1 },

  { id: 'tsumi', name: '罪と罰', genre: '絶版本', ext: 4008, kind: 'collect', retail: 9000, size: 'S', demand: 0.7, base: 1.0, drift: 0.006, used: true, fakeRisk: 0 },
  { id: 'taito', name: '大唐西域記', genre: '絶版トレカBOX', ext: 5016, kind: 'collect', retail: 58000, size: 'S', demand: 0.6, base: 1.0, drift: 0.015, used: true, fakeRisk: 0.4, fakeNote: 'シュリンク偽装' },
  { id: 'violin', name: 'イル・カノーネ', genre: 'ヴィンテージ楽器', ext: 4069, kind: 'collect', retail: 180000, size: 'L', demand: 0.35, base: 1.0, drift: 0.004, used: true, fakeRisk: 0.35 },
  { id: 'jewel', name: 'マリーアントワネット・ブルー', genre: 'ブランドジュエリー', ext: 5509, kind: 'collect', retail: 320000, size: 'S', demand: 0.4, base: 1.0, drift: 0.003, used: true, fakeRisk: 0.5 },

  { id: 'winter', name: '冬の甘えんぼ王子ウィンター', genre: 'クリスマス限定ぬいぐるみ', ext: 1126, kind: 'seasonal', retail: 4400, size: 'M', demand: 2.4, release: weekAt(11, 1), peakWeek: weekAt(12, 3), peak: 2.6, base: 1.0, after: 0.45, fakeRisk: 0.2 },
  { id: 'hina', name: '雛人形', genre: '雛人形', ext: 5127, kind: 'seasonal', retail: 48000, size: 'L', demand: 1.2, release: weekAt(1, 2), peakWeek: weekAt(2, 4), peak: 1.35, base: 0.95, after: 0.4, fakeRisk: 0 },

  { id: 'choux', name: 'とっておきのシュークリーム', genre: '催事限定スイーツ', ext: 3055, kind: 'perishable', retail: 2800, size: 'S', demand: 2.8, eventWeeks: [weekAt(6, 2), weekAt(10, 3), weekAt(2, 2)], premium: 1.9, shelf: 1, fakeRisk: 0 },

  { id: 'kaeru', name: 'カエルキッズ', genre: 'ブラインドボックスぬいぐるみ', ext: 2125, kind: 'boom', retail: 3500, size: 'S', demand: 3.4, boomFrom: 10, boomTo: 20, peak: 6.0, base: 0.9, fakeRisk: 0.6, fakeNote: 'パチモン「ケロキッズ」' },

  { id: 'queen_watch', name: '王妃の黄金時計', genre: '高級腕時計', ext: 5111, kind: 'luxury', retail: 1280000, size: 'S', demand: 0.45, base: 1.55, fakeRisk: 0.5 },
];

export const PRODUCT_MAP = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const productOf = (id) => PRODUCT_MAP[id];

export const SIZE_INFO = {
  S: { label: '小', ship: 210, stamina: 2, space: 1 },
  M: { label: '中', ship: 750, stamina: 3, space: 2 },
  L: { label: '大', ship: 1600, stamina: 6, space: 4 },
};

// 高額品は追跡・補償つきで送るので送料が上がる
export function shippingCost(product) {
  const base = SIZE_INFO[product.size].ship;
  return product.retail >= 100000 ? Math.max(base, 1500) : base;
}

export const productImage = (product) => `assets/extensions/${product.ext}.png`;
