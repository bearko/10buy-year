// 取引トラブル。現実のフリマ・オークションで「よくある」ものをマイクリのエネミーに擬人化している。
import { productOf } from './products.js';
import { chance } from '../engine/rng.js';
import { addExp, addHate, addMood, addRating, addStamina, addToku, hasSkill, yen } from '../engine/effects.js';
import { cancelSale, finalizeSale, partialRefund, restoreUnit } from '../engine/sales.js';
import { perk } from '../engine/perks.js';
import { choice, gain, info, narr, sfx, talk } from '../engine/steps.js';

// 「取引の対応」で答えを決めておける選択肢（engine/dealpolicy.js）
const tagged = (policy, options, ctx) => ({ ...choice(options), policy, ctx });

// 交渉判定。交渉力と「このはし渡るべからず」で成功率が上がる。
export function talkCheck(s, base = 0.25) {
  const p = base + s.abilities.talk / 200 + (hasSkill(s, 'tonchi') ? 0.3 : 0) + perk(s, 'talkCheck');
  return chance(s, Math.min(0.95, p));
}

export function troubleSteps(s, trouble) {
  const { sale } = trouble;
  const name = productOf(sale.pid).name;
  s.stats.troubles++;
  switch (trouble.kind) {
    case 'ghost': {
      const pend = s.pending.find((x) => x.id === sale.id);
      if (pend) pend.week += 2;
      return [
        sfx('trouble'),
        talk('ghost', `……（「${name}」を購入した人から、受取評価が来ない）`),
        talk('chris', '発送したのに受取評価がつかない…。売上金が入ってこないよ〜！', 'sad'),
        talk('mine', '発送から9日たてば、事務局が取引を自動で完了してくれるわ。待つしかないわね。', 'arms'),
        info('音信不通', [`「${name}」の売上金の入金が2週遅れる`]),
      ];
    }
    case 'swap': {
      const loseLines = () => {
        cancelSale(s, sale);
        addMood(s, -1);
        addExp(s, { mind: 8 });
        return [sfx('trouble'), narr(`返金に応じた。戻ってきた箱の中身は、明らかに別物だった…（${yen(sale.price)}の売上が消えた）`), talk('chris', 'うそだろ…。送ったのは本物だったのに！', 'wail'), gain({ mind: 8 })];
      };
      const intro = [
        sfx('trouble'),
        talk('swapper', `届いた「${name}」、偽物でしたよ？ 返品するんで全額返金してくださいね〜`),
        talk('chris', 'そんなはずない！ ちゃんと本物を送ったのに…！', 'arms'),
      ];
      if (hasSkill(s, 'serial_memo')) {
        addExp(s, { info: 6, mind: 4 });
        return [
          ...intro,
          talk('chris', 'でも発送前にシリアル番号と写真を控えてある。事務局に提出だ！', 'guts'),
          talk('swapper', 'チッ……キャンセルで。'),
          info('撃退成功', ['シリアル控えのおかげで、すり替え返品を防いだ'], 'good'),
          gain({ info: 6, mind: 4 }),
        ];
      }
      return [
        ...intro,
        tagged('swap', [
          {
            key: 'fight',
            label: '事務局に相談して争う',
            sub: '交渉判定',
            run: () => {
              if (talkCheck(s, 0.2)) {
                addExp(s, { social: 10, mind: 6 });
                addStamina(s, -5);
                return [talk('mine', '事務局が購入者側の返品を認めなかったわ。粘り勝ちね！', 'wink'), info('防衛成功', ['返品は認められなかった'], 'good'), gain({ social: 10, mind: 6 })];
              }
              return [talk('mine', '証拠が足りなくて、返品に応じるしかなかったみたい…', 'teary'), ...loseLines()];
            },
          },
          { key: 'refund', label: '揉めたくない。返金に応じる', run: loseLines },
        ]),
      ];
    }
    case 'claimer': {
      return [
        sfx('trouble'),
        talk('claimer', `「${name}」に傷があるんだけど？ 説明文に書いてなかったよね？ 半額返金してくれたら評価は勘弁してあげる`),
        talk('chris', sale.delayed ? '（発送が遅れたせいで、相手はかなりご立腹だ…）' : '（写真ではちゃんと伝えたはずなんだけど…）', 'sad'),
        tagged('claimer', [
          {
            key: 'explain',
            label: '誠実に説明する',
            sub: '交渉判定',
            run: () => {
              if (talkCheck(s, sale.delayed ? 0.1 : 0.3)) {
                addExp(s, { social: 12 });
                addRating(s, 1);
                return [talk('claimer', '……まあ、そこまで言うなら。今回は許してあげる。'), info('円満解決', ['誠実な対応が伝わった'], 'good'), gain({ social: 12 })];
              }
              const refund = Math.floor(sale.price * 0.3);
              partialRefund(s, sale, refund);
              addRating(s, -3);
              addExp(s, { social: 6, mind: 4 });
              return [talk('claimer', 'は？ 言い訳しないでくれる？ 3割返金ね。あと評価は「悪い」で。'), info('一部返金', [`${yen(refund)}を返金し、評価も下がった`], 'bad'), gain({ social: 6, mind: 4 })];
            },
          },
          {
            key: 'half',
            label: '要求どおり半額返金する',
            run: () => {
              partialRefund(s, sale, Math.floor(sale.price * 0.5));
              addExp(s, { mind: 4 });
              return [talk('chris', '……わかりました。半額お返しします。', 'sad'), info('半額返金', [`${yen(Math.floor(sale.price * 0.5))}を返金した`], 'bad')];
            },
          },
          {
            key: 'ignore',
            label: '無視する',
            run: () => {
              addRating(s, -8);
              addHate(s, 4);
              return [talk('claimer', '無視？ いい度胸ね。「悪い」評価と、SNSにも書いとくから。'), info('評価ダウン', ['評価が大きく下がり、炎上度も上がった'], 'bad')];
            },
          },
        ]),
      ];
    }
    case 'return': {
      return [
        talk('nego', `「${name}」、なんか思ってたのと違ったので返品したいです〜`),
        talk('mine', 'いわゆる「イメージ違い」ね。プロフに「返品不可」って書いてても、揉めると事務局の判断次第よ。', 'arms'),
        tagged('return', [
          {
            key: 'accept',
            label: '返品を受け付ける',
            sub: '送料は自腹',
            run: () => {
              cancelSale(s, sale, { restored: true });
              s.cash -= sale.ship;
              restoreUnit(s, sale);
              addRating(s, 1);
              return [info('返品受付', [`「${name}」が戻ってきた。往復の送料 ${yen(sale.ship * 2)} は自腹…`], 'bad')];
            },
          },
          {
            key: 'refuse',
            label: 'ノークレーム・ノーリターンです！',
            run: () => {
              addRating(s, -4);
              addExp(s, { mind: 4 });
              return [talk('nego', 'ケチ〜。評価「普通」にしときますね'), info('評価ダウン', ['返品は断ったが、評価が少し下がった'], 'bad')];
            },
          },
        ]),
      ];
    }
    case 'bad_review': {
      addRating(s, -3);
      const dm = addMood(s, -1);
      return [
        talk('claimer', `評価：普通「梱包が雑でした。プチプチが一重でした」`),
        talk('chris', '一重じゃダメなの…？ プチプチ代だってバカにならないんだけど…', 'sad'),
        info('評価ダウン', ['評価が少し下がった', dm ? 'やる気が下がった' : '（鋼のメンタルで受け流した）'], 'bad'),
      ];
    }
    case 'prank': {
      const idx = s.pending.findIndex((x) => x.id === sale.id);
      if (idx >= 0) s.pending.splice(idx, 1);
      s.stats.revenue -= sale.price;
      s.stats.fees -= sale.fee;
      s.stats.shipping -= sale.ship;
      s.cur.revenue -= sale.price;
      s.cur.salesProfit -= sale.profit;
      restoreUnit(s, sale);
      return [
        talk('ghost', '（購入ボタンだけ押して、支払いをしないまま消えた）'),
        talk('chris', '「購入されました！」の通知で喜んだのに…いたずらだった。', 'sad'),
        info('取引キャンセル', [`「${name}」は在庫に戻った`]),
      ];
    }
    case 'damage': {
      cancelSale(s, sale, { restored: true });
      restoreUnit(s, sale, { damaged: true });
      addExp(s, { tech: 5 });
      return [
        sfx('trouble'),
        talk('claimer', `「${name}」、箱がグシャグシャで届きました。返品・返金でお願いします。`),
        talk('mine', '配送中の破損ね…。梱包をもっと丁寧にすれば防げたかも。', 'teary'),
        info('配送破損', [`「${name}」が傷ありで戻ってきた（価値が半減）`], 'bad'),
        gain({ tech: 5 }),
      ];
    }
    case 'fake': {
      cancelSale(s, sale);
      if (sale.platform === 'ama') {
        s.amaBan = 8;
        addRating(s, -5);
        addMood(s, -1);
        return [
          sfx('trouble'),
          talk('collector', `【アマクリ】「${name}」について購入者から真贋の申告がありました。仕入れ先の請求書を提出してください。`),
          talk('chris', '請求書…？ 出所があやしい仕入れだから、出せない…！', 'wail'),
          talk('mine', '大手ECの真贋調査は厳しいの。正規の請求書が出せないと出品停止よ。', 'arms'),
          info('アマクリ出品停止', ['8週間アマクリで販売できない'], 'bad'),
        ];
      }
      addRating(s, -15);
      // 知らずに売った偽物：炎上は大きいが、徳は少しだけ下がる
      addHate(s, 10, false);
      addToku(s, -3);
      addMood(s, -1);
      s.warnings++;
      const banned = s.warnings >= 2;
      if (banned) s.banWeeks = 4;
      return [
        sfx('trouble'),
        talk('claimer', `鑑定に出したら「${name}」は偽物でした。通報しました。返金してください。`),
        talk('chris', 'えっ…。安く仕入れたアレ、偽物だったの…！？', 'wail'),
        talk('mine', '知らずに売っても、偽物は偽物。知っていて売れば商標法違反の犯罪よ。仕入れ先は慎重に選んで。', 'arms'),
        info(banned ? 'プンシー利用制限' : '事務局から警告', banned ? ['偽物の出品が重なり、プンシーが4週間利用できなくなった', '評価・炎上度も大きく悪化した'] : ['返金し、評価が大きく下がった', '次に同じことがあると利用制限になる'], 'bad'),
      ];
    }
    default:
      return [];
  }
}

// 値下げ交渉コメント
export function negotiationSteps(s, nego) {
  const u = s.inventory.find((x) => x.uid === nego.uid);
  if (!u || !u.listing) return [];
  const name = productOf(nego.pid).name;
  const sell = (price) => {
    const out = { troubles: [] };
    const sale = { uid: u.uid, pid: u.pid, price, platform: 'merc', unit: u };
    addStamina(s, -2);
    finalizeSale(s, sale, out);
    return out.troubles.flatMap((t) => troubleSteps(s, t));
  };
  return [
    talk('nego', `はじめまして♪「${name}」、${yen(nego.offer)}になりませんか？ 即決します🙏`),
    tagged('nego', [
      {
        key: 'sell',
        label: `${yen(nego.offer)}で売る`,
        run: () => [sfx('sale'), info('交渉成立', [`「${name}」が${yen(nego.offer)}で売れた`], 'good'), ...sell(nego.offer)],
      },
      {
        key: 'firm',
        label: '「値下げは考えていません」',
        sub: '交渉判定',
        run: () => {
          addExp(s, { social: 4 });
          if (talkCheck(s, 0.05)) return [talk('nego', '……じゃあその値段で買います！'), sfx('sale'), info('強気が通った', [`「${name}」が${yen(nego.price)}で売れた`], 'good'), ...sell(nego.price)];
          return [talk('nego', 'そうですか〜（ブロック）'), narr('（相手は去っていった）')];
        },
      },
      { key: 'ignore', label: 'スルーする', run: () => [narr('（コメントは見なかったことにした）')] },
    ], { offer: nego.offer, price: nego.price }),
  ];
}
