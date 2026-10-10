// 序盤のチュートリアル。できることを絞り、
// 「家の不用品を売る」→「探す」→「仕入れる」→「在庫を管理する」→「売り先を決める」→「売る」の順に体験させる。
import { productOf, shippingCost } from '../data/products.js';
import { addExp, hasSkill, yen } from './effects.js';
import { feeRate } from './inventory.js';
import { gain, info, sfx, talk } from './steps.js';
import { track } from './telemetry.js';

const bought = (u) => !u.home;

export const MISSIONS = [
  {
    id: 'list_home',
    title: '家の不用品を出品しよう',
    hint: '「出品」→「在庫を出品」',
    done: (s) => s.inventory.some((u) => u.home && u.listing),
    reward: () => [
      talk('mine', '出品できたわね！ あとは売れるのを待つだけ。', 'smile'),
      talk('mine', '待つといっても、時間は勝手には進まないの。行動を1つ選ぶと1週間が進んで、週末に「売れました」のメールが届くわ。', 'pointer'),
    ],
  },
  {
    id: 'sell_home',
    title: '売れるのを待とう',
    hint: '行動を選んで週を進める',
    done: (s) => s.stats.soldUnits >= 1,
    reward: () => [
      sfx('coin'),
      talk('chris', '売れた！ 押し入れで眠ってた物が、お金になった…！', 'cheer'),
      talk('mine', 'でも売値がそのまま入るわけじゃないの。手数料10%と送料が引かれて、残りが翌週に入金されるわ。', 'pointer'),
      talk('mine', '最初の売上、おめでとう。これで「スキルツリー」が開けるようになったわ。真ん中の「押し入れの宝の山」を解放してみて。', 'wink'),
      info('解放', ['「スキルツリー」が開けるようになった'], 'good'),
    ],
  },
  {
    id: 'tree_root',
    title: 'スキルツリーを開こう',
    hint: '「スキルツリー」→「押し入れの宝の山」を解放（コスト0）',
    node: 'src_home',
    done: (s) => hasSkill(s, 'src_home'),
    reward: () => [
      talk('chris', 'うわ、枝が伸びた…！ これ全部、転売のスキルなの？', 'sparkle'),
      talk('mine', '経験点を使って、パネルを自分の手で解放していくの。でも焦らないで。まずは家の物を売って、売上を立てましょう。', 'pointer'),
    ],
  },
  {
    id: 'sell_more',
    title: '家の物をもっと売ろう',
    hint: '「家の中を探す」で見つけて出品。3件売る',
    done: (s) => s.stats.soldUnits >= 3,
    reward: (s) => [
      talk('chris', '家の物、だいぶ減ってきたな…。この先どうしよう。', 'arms'),
      talk('mine', '次は近所のお店よ。ワゴンセールの値引き品を安く仕入れて、高く売るの。それが「店舗せどり」。', 'pointer'),
      talk('mine', 'スキルツリーの「近所の店のワゴン」を解放すれば行けるようになるわ。行動の経験点を10使うの。', 'wink'),
      gain(addExp(s, { act: 10 })),
    ],
  },
  {
    id: 'tree_store',
    title: '店舗せどりを目指そう',
    hint: '「スキルツリー」→「近所の店のワゴン」を解放',
    node: 'src_store',
    done: (s) => hasSkill(s, 'src_store'),
    reward: () => [
      talk('mine', '解放できたわね！ 「仕入れ」に「店舗せどり」が増えたはずよ。新品の値引き品なら許可もいらないわ。', 'smile'),
    ],
  },
  {
    id: 'go_store',
    title: 'お店で仕入れ先を探そう',
    hint: '「仕入れ」→「店舗せどり」',
    done: (s) => !!s.flags.didStore,
    reward: () => [],
  },
  {
    id: 'buy',
    title: '商品を仕入れよう',
    hint: '推定相場 ＞ 仕入れ値 のものを選ぶ',
    done: (s) => s.stats.purchases >= 1,
    reward: () => [
      talk('chris', '初仕入れ！ …なんだかドキドキするな。', 'guts'),
      talk('mine', '仕入れた物は、売れるまで「在庫」。お金が形を変えて部屋に置いてあるだけよ。早く売って現金に戻しましょう。', 'arms'),
    ],
  },
  {
    id: 'list_bought',
    title: '仕入れた商品を出品しよう',
    hint: '「出品」→「在庫を出品」',
    done: (s) => s.inventory.some((u) => bought(u) && u.listing),
    reward: () => [talk('mine', 'あとは売れるのを待つだけ。値付けが高すぎると売れないから、様子を見て下げるのも大事よ。', 'smile')],
  },
  {
    id: 'sell_bought',
    title: '仕入れた商品を売ろう',
    hint: '売れなければ値下げ。「撮影・出品作業」も効く',
    done: (s) => s.stats.purchasedSold >= 1,
    reward: (s) => {
      s.flags.tutorialDone = true;
      const sale = s.stats.firstFlip;
      const lines = [];
      if (sale) {
        const p = productOf(sale.pid);
        const fee = Math.floor(sale.price * feeRate(s));
        const ship = shippingCost(p);
        const profit = sale.price - fee - ship - sale.cost;
        lines.push(
          talk('mine', `今の「${p.name}」、計算してみましょう。売値${yen(sale.price)} − 手数料${yen(fee)} − 送料${yen(ship)} − 仕入れ${yen(sale.cost)}……`, 'pointer'),
          talk('mine', `手元に残ったのは${yen(profit)}。${profit > 0 ? 'ちゃんと利益が出てるわ！' : 'あら、赤字ね。売値だけ見てると、こうなるのよ。'}`, profit > 0 ? 'smile' : 'arms'),
        );
      }
      return [
        ...lines,
        talk('chris', '探す、仕入れる、在庫を持つ、売り先を決める、売る…。これが転売のひと回りなんだ。', 'sparkle'),
        talk('mine', 'ここからはあなた次第。スキルツリーに新しい枝が伸びたわ。売り先を増やす「ミィーム」、見込み利益が分かる「利益計算」…どれから伸ばすかで、どんな転売屋になるかが決まるの。', 'banzai'),
        sfx('clear'),
        info('チュートリアル完了', ['スキルツリーで「ミィーム」「利益計算」が解放できるようになった', '売上・仕入れを重ねると、ほかのルートの入口も開いていく', '目標：月の純利益5万円を2か月連続でステージ2へ'], 'good'),
        gain(addExp(s, { info: 15, tech: 15, act: 10, social: 10, mind: 10 })),
      ];
    },
  },
];

// 「スキルツリー」ボタンは最初の売上が出たあとに開く
export const treeOpen = (s) => s.tutorial >= MISSIONS.findIndex((m) => m.id === 'tree_root');

export const tutorialDone = (s) => s.tutorial >= MISSIONS.length;
export const currentMission = (s) => MISSIONS[s.tutorial] || null;

// 達成したミッションがあれば進めて、演出を返す（連続達成にも対応）
export function checkTutorial(s) {
  const steps = [];
  if (tutorialDone(s)) s.flags.tutorialDone = true; // 以前のセーブデータ向け
  while (!tutorialDone(s) && MISSIONS[s.tutorial].done(s)) {
    const m = MISSIONS[s.tutorial];
    s.tutorial++;
    track(s, 'tut', { i: s.tutorial, id: m.id });
    steps.push(...m.reward(s));
    const next = currentMission(s);
    if (next) steps.push(info('次の目標', [next.title]));
  }
  return steps;
}
