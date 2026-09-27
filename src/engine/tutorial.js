// 序盤のチュートリアル。できることを絞り、
// 「家の不用品を売る」→「探す」→「仕入れる」→「在庫を管理する」→「売り先を決める」→「売る」の順に体験させる。
import { productOf, shippingCost } from '../data/products.js';
import { grantSkill } from './abilities.js';
import { addExp, yen } from './effects.js';
import { feeRate } from './inventory.js';
import { gain, info, sfx, talk } from './steps.js';

const bought = (u) => !u.home;

export const MISSIONS = [
  {
    id: 'list_home',
    title: '家の不用品を出品しよう',
    hint: '「在庫」を開いて、読み終えた本やハットを「出品する」',
    done: (s) => s.inventory.some((u) => u.home && u.listing),
    reward: (s) => [
      talk('mine', '出品できたわね！ 売れたかどうかは週末にわかるわ。', 'smile'),
      talk('mine', '行動を1つ選ぶと1週間が進むの。今週は「家の中を探す」でほかにも売れる物がないか見てみたら？', 'pointer'),
      gain(addExp(s, { tech: 5, info: 5 })),
    ],
  },
  {
    id: 'sell_home',
    title: '売れるのを待とう',
    hint: '行動を選んで週を進める。売れた商品は週末に発送、売上金は翌週に入金',
    done: (s) => s.stats.soldUnits >= 1,
    reward: (s) => {
      grantSkill(s, 'src_store');
      return [
        sfx('coin'),
        talk('chris', '売れた！ 押し入れで眠ってた物が、お金になった…！', 'cheer'),
        talk('mine', 'でも売値がそのまま入るわけじゃないの。手数料10%と送料が引かれて、残りが翌週に入金されるわ。', 'pointer'),
        talk('chris', '家の物はそのうち尽きるよね。…お店で安く買って、高く売れば？', 'sparkle'),
        talk('mine', 'それが「仕入れ」。まずは近所の店のワゴンセールから見てみましょう。新品の値引き品なら許可もいらないわ。', 'wink'),
        info('解放', ['行動「店舗せどり」が使えるようになった'], 'good'),
        gain(addExp(s, { info: 8, mind: 5 })),
      ];
    },
  },
  {
    id: 'go_store',
    title: 'お店で仕入れ先を探そう',
    hint: '行動「店舗せどり」を選ぶ',
    done: (s) => !!s.flags.didStore,
    reward: () => [],
  },
  {
    id: 'buy',
    title: '商品を仕入れよう',
    hint: '推定相場が仕入れ値より高いものを選ぶ。次の店舗せどりでもOK',
    done: (s) => s.stats.purchases >= 1,
    reward: (s) => {
      grantSkill(s, 'ch_miime');
      return [
        talk('chris', '初仕入れ！ …なんだかドキドキするな。', 'guts'),
        talk('mine', '仕入れた物は、売れるまで「在庫」。お金が形を変えて部屋に置いてあるだけよ。', 'arms'),
        talk('mine', '次は売り先を決めましょう。フリマの「プンシー」と、オークションの「ミィーム」。どっちに出すかで売れ方が変わるわ。', 'pointer'),
        info('解放', ['販路「ミィーム」（オークション）が使えるようになった'], 'good'),
      ];
    },
  },
  {
    id: 'list_bought',
    title: '売り先を決めて出品しよう',
    hint: '「在庫」で仕入れた商品を開き、プンシーかミィームを選んで出品',
    done: (s) => s.inventory.some((u) => bought(u) && u.listing),
    reward: (s) => [talk('mine', 'あとは売れるのを待つだけ。値付けが高すぎると売れないから、様子を見て下げるのも大事よ。', 'smile'), gain(addExp(s, { tech: 6 }))],
  },
  {
    id: 'sell_bought',
    title: '仕入れた商品を売ろう',
    hint: '売れなければ価格を見直す。「撮影・出品作業」で売れやすくもなる',
    done: (s) => s.stats.purchasedSold >= 1,
    reward: (s) => {
      grantSkill(s, 'eye_calc');
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
        talk('mine', 'ここからはあなた次第。経験を積んで「スキルツリー」を伸ばせば、仕入れ先も販路も目利きも広がっていくわ。', 'banzai'),
        info('チュートリアル完了', ['「利益計算」を覚えた（見込み利益が表示される）', '「スキルツリー」が開けるようになった', '目標：月の純利益5万円を2か月連続でステージ2へ'], 'good'),
        gain(addExp(s, { info: 15, tech: 10, act: 10, social: 10, mind: 10 })),
      ];
    },
  },
];

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
    if (next) steps.push(info('次の目標', [next.title, next.hint]));
  }
  return steps;
}
