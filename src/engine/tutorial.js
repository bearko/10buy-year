// 序盤のチュートリアル。できることを絞り、
// 「家の不用品を売る」→「探す」→「仕入れる」→「在庫を管理する」→「売り先を決める」→「売る」の順に体験させる。
import { productOf, shippingCost } from '../data/products.js';
import { addExp, hasSkill, yen } from './effects.js';
import { feeRate } from './inventory.js';
import { gain, info, sfx, talk } from './steps.js';

const bought = (u) => !u.home;

export const MISSIONS = [
  {
    id: 'list_home',
    title: '家の不用品を出品しよう',
    hint: '「出品」→「在庫を出品」',
    done: (s) => s.inventory.some((u) => u.home && u.listing),
    reward: (s) => [
      talk('mine', '出品できたわね！ 売れたかどうかは週末にわかるわ。', 'smile'),
      talk('mine', '行動を1つ選ぶと1週間が進むの。今週は「仕入れ」の「家の中を探す」で、ほかにも売れる物がないか見てみたら？', 'pointer'),
      gain(addExp(s, { tech: 5, info: 5 })),
    ],
  },
  {
    id: 'sell_home',
    title: '売れるのを待とう',
    hint: '行動を選んで週を進める',
    done: (s) => s.stats.soldUnits >= 1,
    reward: (s) => [
      sfx('coin'),
      talk('chris', '売れた！ 押し入れで眠ってた物が、お金になった…！', 'cheer'),
      talk('mine', 'でも売値がそのまま入るわけじゃないの。手数料10%と送料が引かれて、残りが翌週に入金されるわ。', 'pointer'),
      talk('chris', '家の物はそのうち尽きるよね。もっと売上をあげるには…？', 'arms'),
      talk('mine', '仕入れ先を増やして、売り先を広げて、目利きを磨く。そのための力が「スキルツリー」よ。', 'pointer'),
      talk('mine', '活動で貯まった経験点を使って、パネルを自分の手で解放していくの。まずは「近所の店のワゴン」。お店で安く仕入れられるようになるわ。', 'wink'),
      info('解放', ['「スキルツリー」が開けるようになった'], 'good'),
      gain(addExp(s, { act: 10, info: 8, mind: 5 })),
    ],
  },
  {
    id: 'tree_store',
    title: 'スキルツリーで仕入れ先を増やそう',
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
    reward: (s) => [
      talk('chris', '初仕入れ！ …なんだかドキドキするな。', 'guts'),
      talk('mine', '仕入れた物は、売れるまで「在庫」。お金が形を変えて部屋に置いてあるだけよ。', 'arms'),
      talk('mine', '次は売り先。フリマの「プンシー」だけじゃなく、オークションの「ミィーム」も使えると、売れ方の違う販路を選べるわ。', 'pointer'),
      talk('mine', '販路を広げるのもスキルツリーよ。「ミィーム」を解放してみて。', 'wink'),
      gain(addExp(s, { tech: 8, info: 5 })),
    ],
  },
  {
    id: 'tree_miime',
    title: 'スキルツリーで販路を広げよう',
    hint: '「スキルツリー」→「ミィーム」を解放',
    node: 'ch_miime',
    done: (s) => hasSkill(s, 'ch_miime'),
    reward: () => [talk('mine', 'これで出品するときに「ミィーム」も選べるわ。コレクター品はオークションで競り上がりやすいの。', 'smile')],
  },
  {
    id: 'list_bought',
    title: '売り先を決めて出品しよう',
    hint: '「出品」→「在庫を出品」',
    done: (s) => s.inventory.some((u) => bought(u) && u.listing),
    reward: (s) => [talk('mine', 'あとは売れるのを待つだけ。値付けが高すぎると売れないから、様子を見て下げるのも大事よ。', 'smile'), gain(addExp(s, { tech: 6 }))],
  },
  {
    id: 'sell_bought',
    title: '仕入れた商品を売ろう',
    hint: '売れなければ値下げ。「撮影・出品作業」も効く',
    done: (s) => s.stats.purchasedSold >= 1,
    reward: (s) => {
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
        talk('mine', '毎回こうやって計算するのは大変よね。スキルツリーの「利益計算」を覚えれば、仕入れや出品の画面に見込み利益が出るようになるわ。', 'pointer'),
        gain(addExp(s, { info: 8 })),
      ];
    },
  },
  {
    id: 'tree_calc',
    title: 'スキルツリーで利益計算を覚えよう',
    hint: '「スキルツリー」→「利益計算」を解放',
    node: 'eye_calc',
    done: (s) => hasSkill(s, 'eye_calc'),
    reward: (s) => [
      talk('chris', '探す、仕入れる、在庫を持つ、売り先を決める、売る…。これが転売のひと回りなんだ。', 'sparkle'),
      talk('mine', 'ここからはあなた次第。経験点が貯まったらスキルツリーを開いて、どんな転売屋になるか決めていって。条件を満たした丸いパネルも、自分で解放しないと効果は出ないわよ。', 'banzai'),
      sfx('clear'),
      info('チュートリアル完了', ['目標：月の純利益5万円を2か月連続でステージ2へ'], 'good'),
      gain(addExp(s, { info: 15, tech: 10, act: 10, social: 10, mind: 10 })),
    ],
  },
];

// 「スキルツリー」ボタンはチュートリアルで最初の売上が出たあとに開く
export const treeOpen = (s) => s.tutorial >= MISSIONS.findIndex((m) => m.id === 'tree_store');

export const tutorialDone = (s) => s.tutorial >= MISSIONS.length;
export const currentMission = (s) => MISSIONS[s.tutorial] || null;

// 達成したミッションがあれば進めて、演出を返す（連続達成にも対応）
export function checkTutorial(s) {
  const steps = [];
  while (!tutorialDone(s) && MISSIONS[s.tutorial].done(s)) {
    const m = MISSIONS[s.tutorial];
    s.tutorial++;
    steps.push(...m.reward(s));
    const next = currentMission(s);
    if (next) steps.push(info('次の目標', [next.title]));
  }
  return steps;
}
