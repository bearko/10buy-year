// 最終査定とエンディング
import { productOf } from '../data/products.js';
import { flag } from './effects.js';
import { priceOf } from './market.js';
import { grossProfit } from './state.js';

export const INVENTORY_RATE = 0.7;

export function inventoryValue(s) {
  return s.inventory.reduce((sum, u) => {
    if (u.fake || u.stolen) return sum;
    const v = priceOf(s, u.pid) * (u.damaged ? 0.5 : 1);
    return sum + v * INVENTORY_RATE;
  }, 0);
}

export function netWorth(s) {
  const pending = s.pending.reduce((sum, p) => sum + p.amount, 0);
  return Math.round(s.cash + pending + s.points + inventoryValue(s) - s.debt - s.card.current - s.card.due);
}

const RANKS = [
  { rank: 'S', min: 3000000, label: '伝説の転売王' },
  { rank: 'A', min: 1500000, label: '物販のプロ' },
  { rank: 'B', min: 500000, label: '一人前のせどらー' },
  { rank: 'C', min: 0, label: '借金ゼロの男' },
  { rank: 'D', min: -1000000, label: 'もう一息の副業家' },
  { rank: 'E', min: -2000000, label: '返済道半ば' },
  { rank: 'F', min: -3000000, label: '在庫と借金の狭間' },
  { rank: 'G', min: -Infinity, label: 'クリプトの亡霊' },
];

export const rankOf = (nw) => RANKS.find((r) => nw >= r.min);

const KIND_TITLES = {
  staple: 'ワゴンの魔術師', hype: '限定品ハンター', collect: '古物の目利き', boom: 'バブルの申し子',
  luxury: '正規店マラソンランナー', seasonal: '季節商戦の仕掛け人', perishable: '催事の早起き番長',
};

export function titleOf(s) {
  if (s.hate >= 60) return '炎上系セラー';
  if (s.stats.troubles >= 10) return 'トラブルバスター';
  if (s.stats.scarceBought >= 12) return '買い占めの帝王';
  if (s.stats.bestSale) return KIND_TITLES[productOf(s.stats.bestSale.pid).kind];
  return '見習いせどらー';
}

const ENDINGS = {
  arrested: {
    title: '御用END',
    lines: ['二度目の過ちは見逃されなかった。', '「知らなかった」「みんなやってる」――取調室で繰り返した言葉は、誰にも届かなかった。', 'やってはいけない商売は、やってはいけない。'],
    pose: 'wail',
  },
  bankrupt: {
    title: '債務整理END',
    lines: ['3度目の滞納。弁護士に相談し、債務整理の手続きをすることになった。', '部屋に残ったのは、売れ残った段ボールの山。', '「……次は、ちゃんと働こう」'],
    pose: 'cry',
  },
  crypto: {
    title: '結局クリプトEND',
    lines: ['借金は完済した。……半分くらいは、仮想通貨の爆益で。', '「転売で地道に稼いだ日々って、何だったんだろう」', 'マインは何も言わず、そっとチャートアプリを削除した。'],
    pose: 'laugh',
  },
  ceo: {
    title: '物販社長END',
    lines: ['借金を完済したうえに、手元には大きな資金が残った。', 'クリスは法人を設立。仕入れ・検品・出品・発送を仕組み化し、人を雇い始めた。', '「転売ヤー」と呼ばれた男は、いつしか「物販会社の社長」と呼ばれていた。'],
    pose: 'cheer',
  },
  honest: {
    title: 'まっとうな商人END',
    lines: ['借金を完済したクリスは、限定品の転売から少しずつ手を引いた。', 'ワゴンの掘り出し物、絶版本、地方で手に入らない品。「必要な人に届ける」商いを続けている。', '儲けは減った。でも、取引メッセージの「ありがとう」は増えた。'],
    pose: 'smile',
  },
  payoff: {
    title: '完済END',
    lines: ['1年間の転売生活の末、借金を完済した。', '在庫の段ボールを片付けた部屋は、思っていたより広かった。', '「さて、これからどうしようかな」'],
    pose: 'guts',
  },
  continuing: {
    title: '返済はつづくよEND',
    lines: ['1年が経った。借金はまだ残っている。', 'それでも、毎月の返済は一度も欠かさなかった……はずだ。', '「来月も、行列に並ぶか」'],
    pose: 'arms',
  },
};

export function finalResult(s) {
  const nw = netWorth(s);
  let id;
  if (s.over === 'arrested') id = 'arrested';
  else if (s.over === 'bankrupt') id = 'bankrupt';
  else if (s.debt > 0) id = 'continuing';
  else if (flag(s, 'cryptoWin')) id = 'crypto';
  else if (nw >= 3000000) id = 'ceo';
  else if (flag(s, 'santaHelped') && s.hate < 25) id = 'honest';
  else id = 'payoff';
  const rank = ['arrested', 'bankrupt'].includes(id) ? RANKS[RANKS.length - 1] : rankOf(nw);
  return {
    ending: { id, ...ENDINGS[id] },
    netWorth: nw,
    rank: rank.rank,
    rankLabel: rank.label,
    title: titleOf(s),
    revenue: s.stats.revenue,
    profit: grossProfit(s),
    soldUnits: s.stats.soldUnits,
    scarceBought: s.stats.scarceBought,
    troubles: s.stats.troubles,
    debt: s.debt,
    weeks: s.week,
  };
}
