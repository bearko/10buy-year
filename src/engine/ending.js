// 最終査定とエンディング
import { productOf } from '../data/products.js';
import { flag } from './effects.js';
import { unitPrice } from './market.js';
import { STAGES } from './career.js';
import { mainRoutes, routeCounts } from './perks.js';
import { ROUTE_MAP } from '../data/skills.js';
import { grossProfit } from './state.js';
import { collectionValue } from './collection.js';
import { visionDone, visionEnding, VISIONS } from './visions.js';

export const INVENTORY_RATE = 0.7;

export function inventoryValue(s) {
  return s.inventory.reduce((sum, u) => {
    if (u.fake || u.stolen) return sum;
    return sum + unitPrice(s, u) * INVENTORY_RATE;
  }, 0);
}

export function netWorth(s) {
  const pending = s.pending.reduce((sum, p) => sum + p.amount, 0);
  // コレクション（私設美術館）は評価額で入る
  return Math.round(s.cash + pending + s.points + inventoryValue(s) + collectionValue(s) - s.debt - s.card.current - s.card.due);
}

const RANKS = [
  { rank: 'S', min: 50000000, label: '伝説の物販王' },
  { rank: 'A', min: 20000000, label: '物販事業家' },
  { rank: 'B', min: 8000000, label: '一流のせどらー' },
  { rank: 'C', min: 3000000, label: '食べていけるせどらー' },
  { rank: 'D', min: 1000000, label: '副業せどらー' },
  { rank: 'E', min: 0, label: '借金ゼロの人' },
  { rank: 'F', min: -1500000, label: '返済道半ば' },
  { rank: 'G', min: -Infinity, label: 'クリプトの亡霊' },
];

export const rankOf = (nw) => RANKS.find((r) => nw >= r.min);

const KIND_TITLES = {
  staple: 'ワゴンの魔術師', hype: '限定品ハンター', collect: '古物の目利き', boom: 'バブルの申し子',
  luxury: '正規店マラソンランナー', seasonal: '季節商戦の仕掛け人', perishable: '催事の早起き番長', home: '断捨離の達人',
};

export function titleOf(s) {
  if (s.underworld) return '裏社会の帝王';
  if (s.hate >= 60) return '炎上系セラー';
  const main = mainRoutes(s)[0];
  if (main && (routeCounts(s)[main] || 0) >= 4) return ROUTE_MAP[main].title;
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
    lines: ['10年が経った。資産の半分くらいは、仮想通貨の爆益だった。', '「転売で地道に稼いだ日々って、何だったんだろう」', 'マインは何も言わず、そっとチャートアプリを削除した。'],
    pose: 'laugh',
  },
  tycoon: {
    title: '事業家END',
    lines: ['せどりは通過点だった。', '仕入れで掴んだ「売れる理由」をもとに自社ブランドを立ち上げ、買い取る側・教える側にも回った。', '10年前、押し入れの本を1冊売った日のことを、クリスは今も覚えている。'],
    pose: 'cheer',
  },
  ceo: {
    title: '物販会社社長END',
    lines: ['合同会社クリス物販は、外注と倉庫で回る会社になった。', '「転売ヤー」と呼ばれた男は、いつしか「物販会社の社長」と呼ばれていた。', '次の一手は、せどりの外にあるのかもしれない。'],
    pose: 'guts',
  },
  pro: {
    title: '専業せどらーEND',
    lines: ['10年間、仕入れて、売って、また仕入れた。', '自由だけど不自由。当たりの日はハイで、外れの日は眠れない。', '「店を回るだけ」の毎日に、そろそろ体がついてこなくなってきた。'],
    pose: 'arms',
  },
  honest: {
    title: 'まっとうな商人END',
    lines: ['限定品の転売からは少しずつ手を引いた。', 'ワゴンの掘り出し物、絶版本、地方で手に入らない品。「必要な人に届ける」商いを続けている。', '儲けは減った。でも、取引メッセージの「ありがとう」は増えた。'],
    pose: 'smile',
  },
  side: {
    title: '副業せどらーEND',
    lines: ['本業のかたわら、週末だけ仕入れて売る。', '大きくは稼げなかったけれど、借金は返し終えた。', '押し入れは、いつの間にか空っぽになっていた。'],
    pose: 'smile',
  },
  vanished: {
    title: '闇に消えるEND',
    lines: ['恨みは、金では消えなかった。', 'ある夜を境に、クリスの部屋の明かりは二度とつかなかった。', '残された段ボールの中身が何だったのか、知る者はいない。'],
    pose: 'wail',
  },
  kingpin: {
    title: '裏社会の帝王END',
    lines: ['10年、裏の道を走り切った。', '表の人間が一生かかっても稼げない金を、クリスは数年で動かした。', 'ただ、夜道で背後を振り返る癖だけは、最後まで抜けなかった。'],
    pose: 'laugh',
  },
  spider: {
    title: '蜘蛛の糸END',
    lines: ['一度は闇に堕ちた。すべてを捨てて、糸をつかんだ。', '押し入れの本を1冊売るところから、もう一度やり直した。', '「ありがとう」の取引メッセージが、こんなに重いとは知らなかった。'],
    pose: 'smile',
  },
  continuing: {
    title: '返済はつづくよEND',
    lines: ['10年が経った。借金はまだ残っている。', '売れると思った物が売れ残り、計算ミスで赤字を出し、それでも毎月の返済だけは続けてきた。', '「来月も、店を回るか」'],
    pose: 'arms',
  },
};

export function finalResult(s) {
  const nw = netWorth(s);
  let id;
  if (s.over === 'arrested') id = 'arrested';
  else if (s.over === 'bankrupt') id = 'bankrupt';
  else if (s.over === 'vanished') id = 'vanished';
  else if (s.underworld) id = 'kingpin';
  else if (flag(s, 'spiderThread') !== undefined) id = 'spider';
  else if (s.debt > 0) id = 'continuing';
  else if (flag(s, 'cryptoWin')) id = 'crypto';
  else if (s.stage >= 5) id = 'tycoon';
  else if (s.stage === 4) id = 'ceo';
  else if (flag(s, 'santaHelped') && s.hate < 25) id = 'honest';
  else if (s.stage === 3) id = 'pro';
  else id = 'side';
  // 志を成し遂げた（または途中まで届いた）なら、志のエンディング
  const ve = ['tycoon', 'ceo', 'pro', 'honest', 'side', 'crypto'].includes(id) ? visionEnding(s) : null;
  if (ve) id = ve.id;
  const rank = ['arrested', 'bankrupt', 'vanished'].includes(id) ? RANKS[RANKS.length - 1] : rankOf(nw);
  const st = STAGES[s.stage - 1];
  return {
    ending: ve ? { ...ve } : { id, ...ENDINGS[id] },
    vision: s.vision ? { name: VISIONS[s.vision.id].name, done: visionDone(s) } : null,
    netWorth: nw,
    rank: rank.rank,
    rankLabel: rank.label,
    title: titleOf(s),
    stage: `ステージ${st.id}：${st.name}`,
    revenue: s.stats.revenue,
    profit: grossProfit(s),
    soldUnits: s.stats.soldUnits,
    scarceBought: s.stats.scarceBought,
    troubles: s.stats.troubles,
    debt: s.debt,
    weeks: s.week,
  };
}
