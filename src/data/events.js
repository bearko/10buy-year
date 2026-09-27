// イベント定義。パワプロのサクセスでいう「仲間イベント」「ランダムイベント」「カレンダーイベント」。
//
// trigger:
//   calendar  … 週の頭に、cond を満たせば必ず起きる（日付固定イベント）
//   weekStart … 週の頭のランダムイベント。候補から最大1つ
//   command   … コマンド実行後。cmd が一致する候補から最大1つ（仲間との出会いはここ）
//   sick      … 体調を崩したとき
// once を false にしない限り、1周につき1回だけ起きる。
import { PRODUCTS, productOf } from './products.js';
import { SKILL_MAP } from './skills.js';
import { weekAt } from '../engine/calendar.js';
import { chance, pick, randInt } from '../engine/rng.js';
import {
  addAffinity, addCash, addExp, addHate, addMood, addRating, addStamina, affinity, flag, giveHint, giveSkill, hasSkill, setFlag, yen,
} from '../engine/effects.js';
import { applyShock, inBoom, isReleased, priceOf } from '../engine/market.js';
import { addUnits, spaceUsed, ROOM_CAPACITY } from '../engine/inventory.js';
import { choice, gain, info, narr, sfx, talk } from '../engine/steps.js';

const hold = (s, pid) => s.inventory.filter((u) => u.pid === pid && u.arrive <= s.week);
const profit = (s) => s.stats.revenue - s.stats.fees - s.stats.shipping - s.stats.cogs;
const hint = (s, id, lv, heroName) => {
  giveHint(s, id, lv);
  return [sfx('hint'), info('コツを掴んだ！', [`${heroName}から「${SKILL_MAP[id].name}」のコツ Lv${s.hints[id]} を教わった`, '（能力画面で習得できる）'], 'good')];
};
const expStep = (s, gains) => gain(addExp(s, gains));

export const EVENTS = [
  // ================= カレンダー（日付固定） =================
  {
    id: 'tutorial_1',
    trigger: 'calendar',
    cond: (s) => s.week === 0,
    play: () => [
      talk('mine', 'さあ、転売生活の始まりよ！ まずは基本を説明するわね。', 'pointer'),
      talk('mine', '1週間に1回、下のメニューから「行動」を選ぶの。店舗を回る、ネットで探す、抽選に応募する、行列に並ぶ…いろいろあるわ。', 'talk'),
      talk('mine', '行動すると経験点がたまる。経験点を使って「目利き」や「仕入れ」の能力を上げていくのよ。パワプロのサクセスと同じね。', 'wink'),
      talk('mine', '仕入れた商品は「在庫」画面から出品してね。値付けは自由。相場より高すぎると売れないし、安すぎると損をする。', 'talk'),
      talk('mine', 'そして大事なのが毎月末の返済。最低10万円。3回滞納したら…わかってるわね？', 'arms'),
      talk('chris', 'う、うん。まずはワゴンセールで安く仕入れて、定価近くで売る「価格差」から始めてみるよ！', 'guts'),
    ],
  },
  {
    id: 'tutorial_2',
    trigger: 'calendar',
    cond: (s) => s.week === 1,
    play: () => [
      talk('maycri', '【速報】人気トレカの新弾「兵法書」が来週発売！ 抽選と予約はもう始まってるぞー！', 'wide'),
      talk('mine', '限定品は「抽選に応募」か、電脳せどりで「予約」を取るのが基本。発売日に「行列に並ぶ」手もあるわ。', 'pointer'),
      talk('mine', '当たれば定価で買えて、発売直後は相場が跳ね上がる。…ただし「再販」が決まると一気に値崩れするから注意ね。', 'talk'),
      talk('chris', '「相場」画面で値動きもチェックできるんだね。目利きが低いうちは推定がブレるのか…。', 'arms'),
    ],
  },
  {
    id: 'month1_end',
    trigger: 'calendar',
    cond: (s) => s.week === 3,
    play: (s) => [
      talk('mine', `今週末は最初の返済日よ。最低返済額は10万円。いまの所持金は${yen(s.cash)}。`, 'arms'),
      talk('chris', s.cash >= 100000 ? 'なんとか払えそう…！' : '足りない…！ 今週は売ることに集中するか、バイトで稼ぐか…', s.cash >= 100000 ? 'smile' : 'sad'),
    ],
  },
  {
    id: 'golden_week',
    trigger: 'calendar',
    cond: (s) => s.week === weekAt(5, 1),
    play: (s) => {
      s.mods.demand *= 1.3;
      return [
        talk('maycri', 'ゴールデンウィーク突入！ みんな暇だからフリマアプリの閲覧数が爆増中だぞー！', 'wide'),
        talk('mine', '連休は「売り時」。出品を増やしておくといいわ。逆に発送が集中するから、体力も残しておいてね。', 'pointer'),
        info('GW', ['今週は買い手が1.3倍']),
      ];
    },
  },
  {
    id: 'amacri_day',
    trigger: 'calendar',
    cond: (s) => s.week === weekAt(7, 2),
    play: (s) => {
      s.mods.onlinePoints *= 2;
      return [
        talk('maycri', '年に一度の「アマクリデー」開催！ 通販サイトのポイント還元が今週だけ2倍だー！', 'wide'),
        talk('mine', 'ポイント還元を利益に変える「ポイ活せどり」の稼ぎ時ね。電脳せどりのチャンスよ。', 'wink'),
        info('アマクリデー', ['今週の電脳せどりはポイント還元2倍']),
      ];
    },
  },
  {
    id: 'summer_fes',
    trigger: 'calendar',
    cond: (s) => s.week === weekAt(8, 2),
    play: (s) => {
      s.mods.queueExtra = ['sylph'];
      return [
        talk('maycri', '夏の祭典「マイクリフェス」が開催！ 会場限定の「シルフ」フィギュアが販売されるぞー！', 'wide'),
        talk('mine', '始発で並ぶ人、徹夜組、そして転売目的の人…。会場限定品は毎年大荒れね。', 'arms'),
        talk('chris', '（「行列に並ぶ」で狙えるかも…）', 'arms'),
        info('マイクリフェス', ['今週は「行列に並ぶ」で限定フィギュアを狙える']),
      ];
    },
  },
  {
    id: 'black_friday',
    trigger: 'calendar',
    cond: (s) => s.week === weekAt(11, 4),
    play: (s) => {
      s.mods.storeDiscount += 0.15;
      return [
        talk('maycri', 'ブラックフライデーだー！ 店舗の値引きがいつもより深いぞー！', 'wide'),
        info('ブラックフライデー', ['今週の店舗せどりは値引き率アップ']),
      ];
    },
  },
  {
    id: 'santa',
    trigger: 'calendar',
    cond: (s) => s.week >= weekAt(12, 2) && s.week <= weekAt(12, 4) && (hold(s, 'winter').length > 0 || hold(s, 'photon').length > 0),
    play: (s) => {
      const pid = hold(s, 'photon').length ? 'photon' : 'winter';
      const p = productOf(pid);
      const u = hold(s, pid)[0];
      const market = priceOf(s, pid);
      return [
        talk('santa', 'ホッホッホ。君がクリスくんかね。ひとつ頼みがあってな。', ),
        talk('santa', `ある子が「${p.name}」を欲しがっておる。どこにも売っていなくてな…。定価の${yen(p.retail)}で譲ってはもらえんかのう。`),
        talk('chris', `（相場は${yen(market)}…。でも、サンタの頼みか…）`, 'arms'),
        choice([
          {
            label: `定価（${yen(p.retail)}）で譲る`,
            run: () => {
              s.inventory = s.inventory.filter((x) => x.uid !== u.uid);
              addCash(s, p.retail, `サンタに譲渡: ${p.name}`);
              s.stats.revenue += p.retail;
              s.stats.cogs += u.cost;
              s.stats.soldUnits++;
              addMood(s, 2);
              addHate(s, -15);
              setFlag(s, 'santaHelped');
              return [talk('santa', 'ありがとう。君の在庫には、今夜ひとつ奇跡が入っておるよ。'), talk('chris', '……なんだろう、この気持ち。損したのに、悪くない。', 'smile'), sfx('hint'), expStep(s, { mind: 25, social: 10 })];
            },
          },
          {
            label: `相場（${yen(market)}）でなら売ります`,
            run: () => {
              addExp(s, { info: 5 });
              return [talk('santa', 'そうか…。商売とはそういうものじゃな。無理を言ってすまなかった。'), narr('サンタは雪の中へ消えていった。')];
            },
          },
        ]),
      ];
    },
  },
  {
    id: 'fukubukuro',
    trigger: 'calendar',
    cond: (s) => s.week === weekAt(1, 1),
    play: (s) => [
      talk('maycri', 'あけましておめでとう！ 初売りの「マイクリ福袋」、1袋1万円だぞー！ 中身は開けてのお楽しみ！', 'wide'),
      talk('mine', '福袋の中身を転売する人も多いわね。…ただ、正直ギャンブルよ。', 'arms'),
      choice([
        {
          label: '福袋を買う（10,000円）',
          run: () => {
            if (s.cash < 10000) return [talk('chris', 'お金が足りない…。', 'sad')];
            addCash(s, -10000, '初売り福袋');
            const roll = randInt(s, 1, 100);
            if (roll <= 12) {
              const jackpot = pick(s, PRODUCTS.filter((p) => p.kind === 'hype' && isReleased(s, p)));
              addUnits(s, jackpot.id, 1, 10000);
              return [sfx('win'), info('大当たり！', [`中から「${jackpot.name}」が出てきた！`], 'good'), talk('chris', 'うおおお！ 新年早々ツイてる！', 'cheer')];
            }
            if (roll <= 45) {
              addUnits(s, 'boots', 1, 5000);
              addUnits(s, 'scroll', 1, 5000);
              return [info('まあまあ', ['「ブーツ」と「スクロール」が入っていた'], 'normal'), talk('chris', 'トントン…ってところかな。', 'arms')];
            }
            addUnits(s, 'sake', 2, 5000);
            return [info('ハズレ', ['「サケ」が2本…（しかも酒は転売しづらい）'], 'bad'), talk('chris', '…お正月だし、飲むか。', 'sad')];
          },
        },
        { label: '買わない', run: () => [talk('chris', 'ギャンブルはもうこりごりだ。仮想通貨で懲りたからね…。', 'arms')] },
      ]),
    ],
  },
  {
    id: 'tax_return',
    trigger: 'calendar',
    cond: (s) => s.week === weekAt(2, 3),
    play: (s) => {
      const income = Math.max(0, profit(s) - s.stats.expenses);
      const deduction = 580000;
      const taxable = Math.max(0, income - deduction);
      let tax = Math.round(taxable * 0.2);
      if (hasSkill(s, 'ledger')) tax = Math.round(tax * 0.7);
      const lines = [
        talk('mine', 'そろそろ確定申告の季節よ。転売の利益も立派な所得。申告しないと大変なことになるわ。', 'pointer'),
        talk('mine', `今年の利益はざっと${yen(income)}。基礎控除などを引くと、税金はおよそ${yen(tax)}ね（ゲーム内の簡易計算よ）。`, 'talk'),
      ];
      if (tax === 0) {
        return [...lines, talk('chris', '控除の範囲に収まってるから、税金はかからないのか。…喜んでいいのかな。', 'arms')];
      }
      return [
        ...lines,
        choice([
          {
            label: `きちんと申告して納税する（${yen(tax)}）`,
            run: () => {
              addCash(s, -tax, '所得税・住民税（概算）');
              s.stats.taxPaid += tax;
              addExp(s, { mind: 10, info: 5 });
              return [talk('chris', '痛いけど…これで堂々と商売できる。', 'guts'), gain({ mind: 10, info: 5 })];
            },
          },
          {
            label: 'バレないでしょ。申告しない',
            run: () => {
              setFlag(s, 'taxEvaded', tax);
              return [talk('mine', '…フリマアプリの売上データ、税務署はちゃんと見てるわよ？', 'arms'), talk('chris', 'だ、大丈夫だって…たぶん。', 'sad')];
            },
          },
        ]),
      ];
    },
  },
  {
    id: 'tax_audit',
    trigger: 'calendar',
    cond: (s) => s.week === weekAt(3, 3) && flag(s, 'taxEvaded'),
    play: (s) => {
      const due = Math.round(flag(s, 'taxEvaded') * 1.4);
      addCash(s, -due, '追徴課税（無申告加算税など）');
      s.stats.taxPaid += due;
      addMood(s, -2);
      return [
        sfx('trouble'),
        talk('collector', '税務署です。プラットフォームの取引記録について、お話を伺いたいのですが。'),
        talk('chris', 'ひいい！ ぜ、全部お支払いします！', 'wail'),
        info('追徴課税', [`本来の税額に加算税・延滞税がついて${yen(due)}を支払った`], 'bad'),
      ];
    },
  },
  {
    id: 'final_week',
    trigger: 'calendar',
    cond: (s) => s.week === weekAt(3, 4),
    play: (s) => [
      talk('mine', 'いよいよ最後の1週間よ。最終査定では、在庫は相場の7割で評価するわ。', 'pointer'),
      talk('chris', s.debt <= 0 ? '借金は返し終わった。あとはどこまで積み上げられるかだ！' : `借金はあと${yen(s.debt)}…。最後まで足掻いてやる！`, 'guts'),
    ],
  },

  // ================= ランダム（週の頭） =================
  {
    id: 'room_full',
    trigger: 'weekStart',
    once: false,
    chance: 0.6,
    cond: (s) => spaceUsed(s) > ROOM_CAPACITY,
    play: (s) => {
      const dm = addMood(s, -1);
      return [
        talk('chris', '部屋が段ボールで埋まって、寝るスペースがない…。', 'sad'),
        talk('mine', '在庫は「売れるまでただの場所ふさぎ」よ。回転を意識して。', 'arms'),
        info('在庫過多', ['部屋が狭く、休んでも体力が回復しにくい', dm ? 'やる気が下がった' : ''], 'bad'),
      ];
    },
  },
  {
    id: 'post_office',
    trigger: 'weekStart',
    chance: 0.5,
    cond: (s) => s.stats.soldUnits >= 15,
    play: (s) => {
      addMood(s, 1);
      return [narr('郵便局の窓口で「いつもありがとうございます」と言われた。完全に顔を覚えられている。'), talk('chris', '常連扱い…ちょっと嬉しい。', 'laugh'), info('やる気アップ', ['やる気が上がった'], 'good')];
    },
  },
  {
    id: 'konbini',
    trigger: 'weekStart',
    chance: 0.4,
    cond: (s) => s.stats.soldUnits >= 5,
    play: () => [
      narr('コンビニで発送手続きを10件まとめてしたら、後ろに行列ができて店員さんに無言で見つめられた。'),
      talk('chris', '（次からは空いてる時間に行こう…）', 'sad'),
    ],
  },
  {
    id: 'family_call',
    trigger: 'weekStart',
    chance: 0.2,
    cond: (s) => s.week >= 6,
    play: (s) => [
      narr('実家の母から電話がかかってきた。「最近なにしてるの？ ちゃんと働いてる？」'),
      choice([
        {
          label: '「物販の仕事をしてる」と正直に言う',
          run: () => {
            addExp(s, { mind: 8 });
            return [narr('「物販？ …よくわからないけど、体だけは壊さないでね」'), talk('chris', '（借金のことは、まだ言えなかった）', 'sad'), gain({ mind: 8 })];
          },
        },
        {
          label: '「IT系でリモートワーク」とごまかす',
          run: () => {
            addMood(s, -1);
            return [narr('「あら、すごいじゃない！ 今度お父さんにも話しておくわね」'), talk('chris', '（胸が痛い…）', 'sad')];
          },
        },
      ]),
    ],
  },
  {
    id: 'midnight_check',
    trigger: 'weekStart',
    once: false,
    chance: 0.08,
    cond: (s) => s.week >= 3,
    play: (s) => {
      addStamina(s, -10);
      s.flags.midnight = (s.flags.midnight || 0) + 1;
      const lines = [narr('深夜3時。気づけば布団の中で相場チェックと抽選結果メールの確認を繰り返していた。'), info('寝不足', ['体力 -10'], 'bad')];
      if (s.flags.midnight >= 3 && !hasSkill(s, 'insomnia')) {
        giveSkill(s, 'insomnia');
        lines.push(info('マイナス能力', ['「寝不足」がついてしまった…'], 'bad'));
      }
      return lines;
    },
  },
  {
    id: 'tendon',
    trigger: 'weekStart',
    chance: 0.15,
    cond: (s) => s.stats.soldUnits >= 25 && !hasSkill(s, 'pack_master'),
    play: (s) => {
      giveSkill(s, 'tendon');
      return [talk('chris', 'いてて…。梱包テープを切りすぎて手首が…。', 'sad'), talk('mine', '腱鞘炎ね。梱包の手際を上げないと、体がもたないわよ。', 'teary'), info('マイナス能力', ['「腱鞘炎」がついた（発送の体力消費1.5倍）'], 'bad')];
    },
  },
  {
    id: 'sarashi',
    trigger: 'weekStart',
    once: false,
    chance: 0.5,
    cond: (s) => s.hate >= 50,
    play: (s) => {
      addMood(s, -1);
      addHate(s, -12);
      return [
        talk('maycri', '【悲報】匿名掲示板に「転売ヤー晒しスレ」が立ってるぞ…。クリスのアカウントも貼られてる…！', 'thin'),
        talk('chris', '行列の写真まで…。目立ちすぎたか…。', 'wail'),
        info('晒された', ['やる気が下がった（炎上度は少し落ち着いた）'], 'bad'),
      ];
    },
  },
  {
    id: 'account_warning',
    trigger: 'weekStart',
    once: false,
    chance: 0.7,
    cond: (s) => s.hate >= 80 && s.banWeeks <= 0,
    play: (s) => {
      s.banWeeks = 2;
      addHate(s, -25);
      return [
        sfx('trouble'),
        talk('collector', '【メルクリ事務局】お客様のアカウントに多数の通報が寄せられています。調査のため一時的に利用を制限します。'),
        talk('chris', '出品が全部止まった…！', 'wail'),
        info('利用制限', ['2週間メルクリが使えない（クリオクは使える）'], 'bad'),
      ];
    },
  },
  {
    id: 'tv_intro',
    trigger: 'weekStart',
    once: false,
    chance: 0.08,
    cond: (s) => s.week >= 4,
    play: (s) => {
      const cands = PRODUCTS.filter((p) => ['staple', 'collect', 'hype'].includes(p.kind) && isReleased(s, p));
      const p = pick(s, cands);
      applyShock(s, p.id, 1.35, null, null);
      s.news.push({ pid: p.id, text: `【テレビ】情報番組で「${p.name}」が紹介され、相場が上昇`, kind: 'up' });
      return [talk('maycri', `【速報】朝の情報番組で「${p.name}」が紹介されたぞ！ 相場が上がってる！`, 'wide'), talk('chris', hold(s, p.id).length ? '在庫がある！ 売り時だ！' : '持ってない…！ テレビの影響ってすごいな。', hold(s, p.id).length ? 'cheer' : 'sad')];
    },
  },
  {
    id: 'thanks_msg',
    trigger: 'weekStart',
    chance: 0.2,
    cond: (s) => s.stats.soldUnits >= 8,
    play: (s) => {
      addMood(s, 1);
      return [
        narr('取引メッセージが届いた。「近くのお店に売っていなくて諦めかけていました。丁寧な梱包ありがとうございました！」'),
        talk('chris', '…必要としてくれる人に届けるのも、商売なんだよな。', 'smile'),
        info('やる気アップ', ['やる気が上がった'], 'good'),
      ];
    },
  },
  {
    id: 'angry_fan',
    trigger: 'weekStart',
    chance: 0.5,
    cond: (s) => s.stats.scarceBought >= 4,
    play: (s) => [
      talk('maycri', 'SNSでこんな投稿がバズってるぞ…「発売日に3時間並んだのに目の前で売り切れ。その日の夜にはフリマに定価の3倍で並んでた」', 'thin'),
      talk('chris', '……。', 'arms'),
      talk('mine', '転売は法律で禁止されているものを除けば違法じゃない。でも、買えなかった人がいるのも事実。どう向き合うかはあなた次第よ。', 'talk'),
      choice([
        { label: 'それでも商売は商売だ', run: () => [gain(addExp(s, { mind: 12 })), talk('chris', '僕にも返さなきゃいけない借金がある。割り切るしかない。', 'guts')] },
        {
          label: 'せめて値付けは控えめにしよう',
          run: () => {
            addHate(s, -10);
            return [gain(addExp(s, { mind: 6, social: 6 })), talk('chris', '儲けすぎない値付けにしよう。…自己満足かもしれないけど。', 'smile')];
          },
        },
      ]),
    ],
  },
  {
    id: 'ticket',
    trigger: 'weekStart',
    chance: 0.2,
    cond: (s) => s.week >= 8,
    play: (s) => [
      narr('友人から連絡。「人気アイドルのライブチケット、2枚余ってるんだけど。お前、転売やってるんだろ？ 高く売ってくれよ」'),
      talk('mine', '待って。チケットの高額転売は「チケット不正転売禁止法」で禁止よ。定価を超える転売は犯罪になるわ。', 'arms'),
      choice([
        {
          label: '公式リセールで定価で出す',
          run: () => {
            addExp(s, { mind: 8, info: 6 });
            return [talk('chris', '公式リセールなら定価で、行きたい人にちゃんと届く。これが正解だ。', 'smile'), gain({ mind: 8, info: 6 })];
          },
        },
        {
          label: '定価の5倍で売っちゃう',
          run: () => {
            if (chance(s, 0.5)) {
              addCash(s, -300000, '罰金（チケット不正転売禁止法違反）');
              addHate(s, 30);
              addMood(s, -2);
              return [sfx('trouble'), talk('collector', '警察です。チケットの不正転売の件で、署までご同行願えますか。'), info('書類送検', ['罰金30万円。ニュースにもなり、炎上度が大きく上がった'], 'bad'), talk('chris', 'やっちゃいけないことは、やっちゃいけないんだ…。', 'wail')];
            }
            addCash(s, 60000, 'チケット転売（違法）');
            addHate(s, 8);
            setFlag(s, 'illegal', (flag(s, 'illegal') || 0) + 1);
            return [narr('運よく（？）何事もなかった。…が、手元に残ったのはお金と後ろめたさだった。'), info('違法行為', ['6万円を得たが、次は無いかもしれない'], 'bad')];
          },
        },
      ]),
    ],
  },
  {
    id: 'alcohol_warning',
    trigger: 'weekStart',
    chance: 1,
    cond: (s) => s.stats.alcoholSold >= 3,
    play: (s) => {
      setFlag(s, 'noAlcohol');
      s.inventory.forEach((u) => {
        if (productOf(u.pid).alcohol) u.listing = null;
      });
      return [
        talk('mine', 'ちょっと待って。お酒を「継続して」売るには、酒類販売業免許が必要なのよ。', 'arms'),
        talk('chris', 'えっ、そうなの！？ 家にあったお酒を1本売るのとは違うのか…。', 'sad'),
        talk('mine', '仕入れて売るのを繰り返したら、それは商売。お酒の出品はここまでにしておきましょう。', 'pointer'),
        info('酒類の出品停止', ['以後、酒類は出品できない（在庫は取り下げた）'], 'bad'),
      ];
    },
  },
  {
    id: 'friend_asks',
    trigger: 'weekStart',
    chance: 0.15,
    cond: (s) => s.week >= 20 && s.stats.soldUnits >= 20,
    play: (s) => [
      narr('昔のバイト仲間から連絡。「転売で稼いでるんだって？ やり方教えてよ」'),
      choice([
        {
          label: '無料で教えてあげる',
          run: () => [talk('chris', '教えるのはいいけど…ライバルが増えるってことでもあるんだよな。', 'arms'), gain(addExp(s, { social: 15, info: 5 }))],
        },
        {
          label: '「転売で月30万稼ぐ方法」を有料noteで売る',
          run: () => {
            addCash(s, 49800, '有料note販売');
            addHate(s, 6);
            return [narr('1冊9,800円の有料noteが5部売れた。'), talk('mine', '……ミイラ取りがミイラ、ね。', 'arms'), talk('chris', '情報商材の気持ちがちょっとわかった気がする…。', 'laugh')];
          },
        },
      ]),
    ],
  },
  {
    id: 'satoshi_1',
    trigger: 'weekStart',
    chance: 0.3,
    cond: (s) => s.week >= 14 && s.cash >= 50000,
    play: (s) => [
      talk('satoshi', 'クリスくん…。$HEROコインが底を打ったらしい。今が最後の買い場だよ。', ),
      talk('chris', '（あの日、全力ロングで溶かしたコイン…。今なら取り返せるかも…？）', 'arms'),
      talk('mine', 'クリス、あなたなんで借金してるか覚えてる？', 'arms'),
      choice([
        {
          label: `手元資金の8割（${yen(s.cash * 0.8)}）を突っ込む`,
          run: () => {
            const bet = Math.floor(s.cash * 0.8);
            addCash(s, -bet, '$HEROコイン購入');
            if (chance(s, 0.2)) {
              addCash(s, bet * 4, '$HEROコイン売却');
              setFlag(s, 'cryptoWin');
              return [sfx('win'), talk('satoshi', '見たまえ、月まで飛んだよ。'), info('爆益', [`${yen(bet)}が${yen(bet * 4)}に…！`], 'good'), talk('chris', 'やっぱりクリプトなんだよなぁ！！（転売の苦労って一体…）', 'cheer')];
            }
            addCash(s, Math.floor(bet * 0.1), '$HEROコイン損切り');
            addMood(s, -2);
            return [sfx('lose'), talk('satoshi', '……チャートは嘘をつかない。君が読み違えただけさ。'), info('大損', [`${yen(bet)}が${yen(bet * 0.1)}になった`], 'bad'), talk('chris', 'また…やってしまった…。', 'wail')];
          },
        },
        {
          label: 'やめておく。今は目の前の商売だ',
          run: () => {
            addMood(s, 1);
            return [talk('chris', 'もう一発逆転は狙わない。一個ずつ、利益を積み上げるんだ。', 'guts'), gain(addExp(s, { mind: 15 }))];
          },
        },
      ]),
    ],
  },
  {
    id: 'marie',
    trigger: 'weekStart',
    chance: 0.4,
    cond: (s) => hold(s, 'jewel').length > 0 || hold(s, 'queen_watch').length > 0 || hold(s, 'golden_boots').length > 0,
    play: (s) => {
      const pid = ['queen_watch', 'jewel', 'golden_boots'].find((x) => hold(s, x).length);
      const u = hold(s, pid)[0];
      const price = Math.round(priceOf(s, pid) * 1.2);
      return [
        talk('marie', `あなたが「${productOf(pid).name}」をお持ちの方？ 相場の2割増し、${yen(price)}で買ってさしあげますわ。`),
        talk('chris', 'ほ、本当に！？ でも、そんな大金どうやって…', 'sparkle'),
        talk('marie', 'お金がないなら、借りればいいじゃない。'),
        talk('chris', '（それで僕は借金まみれになったんだけど…）', 'sad'),
        choice([
          {
            label: `${yen(price)}で売る`,
            run: () => {
              if (u.fake) {
                addRating(s, -5);
                addHate(s, 5);
                s.inventory = s.inventory.filter((x) => x.uid !== u.uid);
                return [talk('marie', '……これ、偽物ではなくて？ 無礼者！'), info('偽物だった', ['商品は没収され、評判が下がった'], 'bad')];
              }
              s.inventory = s.inventory.filter((x) => x.uid !== u.uid);
              addCash(s, price, `王妃に売却: ${productOf(pid).name}`);
              s.stats.revenue += price;
              s.stats.cogs += u.cost;
              s.stats.soldUnits++;
              return [sfx('sale'), info('直接取引', [`${yen(price)}で売れた（手数料なし）`], 'good')];
            },
          },
          { label: 'まだ手放さない', run: () => [talk('marie', 'あら、そう。気が変わったらいつでもどうぞ。')] },
        ]),
      ];
    },
  },
  {
    id: 'ikkyu_1',
    trigger: 'weekStart',
    chance: 0.6,
    cond: (s) => s.stats.troubles >= 1,
    play: (s) => {
      addAffinity(s, 'ikkyu');
      addMood(s, 1);
      return [
        talk('ikkyu', 'これこれ、若いの。取引で揉めて落ち込んでおるのか。'),
        talk('chris', '「偽物だ」って言われて、返品されたら中身がすり替わってて…。', 'sad'),
        talk('ikkyu', '将軍様に「屏風の虎を捕まえよ」と言われたとき、わしは「では虎を屏風から出してくだされ」と返した。無理難題には、筋の通った一言で返すのじゃ。'),
        talk('chris', '筋の通った一言…。「証拠を出してください」とか？', 'arms'),
        talk('ikkyu', 'そうじゃ。そして証拠は、こちらも先に持っておくことじゃ。発送前の写真、シリアル番号…。'),
        ...hint(s, 'tonchi', 1, '一休'),
        ...hint(s, 'serial_memo', 1, '一休'),
      ];
    },
  },
  {
    id: 'ikkyu_2',
    trigger: 'weekStart',
    chance: 0.5,
    cond: (s) => affinity(s, 'ikkyu') >= 1 && s.stats.troubles >= 4,
    play: (s) => {
      addAffinity(s, 'ikkyu');
      return [
        talk('ikkyu', '「このはし渡るべからず」と書いてあれば、真ん中を渡ればよい。規約もクレームも、よく読めば道はある。'),
        talk('chris', '相手の言い分をよく読んで、ルールの範囲で切り返す…。', 'sparkle'),
        ...hint(s, 'tonchi', 2, '一休'),
        expStep(s, { social: 15, mind: 10 }),
      ];
    },
  },
  {
    id: 'satoshi_2',
    trigger: 'weekStart',
    chance: 0.3,
    cond: (s) => s.week >= 32 && s.eventsSeen.satoshi_1 && s.cash >= 100000,
    play: (s) => [
      talk('satoshi', '今度はレバレッジ100倍の先物だ。10万円が1,000万円になる。借金なんて一瞬で消えるよ。'),
      choice([
        {
          label: '10万円だけ…やってみる',
          run: () => {
            addCash(s, -100000, 'レバレッジ取引');
            if (chance(s, 0.1)) {
              addCash(s, 1500000, 'レバレッジ取引の利益');
              setFlag(s, 'cryptoWin');
              return [sfx('win'), info('奇跡', ['10万円が160万円に…！'], 'good'), talk('chris', '……え？ 本当に？', 'sparkle')];
            }
            addMood(s, -2);
            return [sfx('lose'), info('ロスカット', ['数分で10万円が消えた'], 'bad'), talk('chris', '知ってた…知ってたよ…。', 'wail')];
          },
        },
        { label: '断る', run: () => [talk('chris', '僕はもう、地に足のついた商売をするって決めたんだ。', 'guts'), gain(addExp(s, { mind: 20 }))] },
      ]),
    ],
  },
  {
    id: 'goemon_police',
    trigger: 'weekStart',
    chance: 0.8,
    cond: (s) => flag(s, 'goemonBought') !== undefined && s.week >= flag(s, 'goemonBought') + 2,
    play: (s) => {
      const lost = s.inventory.filter((u) => u.stolen);
      s.inventory = s.inventory.filter((u) => !u.stolen);
      delete s.flags.goemonBought;
      setFlag(s, 'illegal', (flag(s, 'illegal') || 0) + 1);
      s.sick = Math.max(s.sick, 1);
      addHate(s, 20);
      addMood(s, -2);
      const lines = [
        sfx('trouble'),
        talk('collector', '警察です。あなたが先日購入した品物が、盗難届の出ている品と一致しました。'),
        talk('chris', 'えっ…。安すぎるとは思ったけど…！', 'wail'),
        info('盗品の押収', [`${lost.length}点が押収された（支払ったお金は戻らない）`, '事情聴取で1週間つぶれる'], 'bad'),
      ];
      if (flag(s, 'license')) {
        lines.push(talk('mine', '古物商は盗品の疑いがある品を扱わないよう、仕入れ先の確認が義務なの。今回は厳重注意で済んだけど…。', 'arms'));
      }
      return lines;
    },
  },
  {
    id: 'nostra_reveal',
    trigger: 'weekStart',
    chance: 1,
    cond: (s) => flag(s, 'salonJoined') !== undefined && s.week >= flag(s, 'salonJoined') + 3,
    play: (s) => {
      delete s.flags.salonJoined;
      addMood(s, -1);
      return [
        talk('nostra', '（サロンの予言：「恐怖の大王が降りてきて、相場はきっと動くであろう」）'),
        talk('chris', '上がるのか下がるのかすら言ってない！ 9万8千円返して！', 'wail'),
        talk('mine', '「必ず儲かる」「月収100万」…そういう情報に大金を払う前に、その人が何で稼いでいるか考えてみて。', 'arms'),
        info('教訓', ['情報商材は解約した'], 'bad'),
        expStep(s, { info: 15, mind: 15 }),
      ];
    },
  },

  // ================= コマンド後（仲間との出会い） =================
  {
    id: 'ino_1',
    trigger: 'command',
    cmd: 'store',
    chance: 0.4,
    play: (s) => {
      addAffinity(s, 'ino');
      return [
        talk('ino', 'おぬし、店の棚をずいぶん熱心に見ておるな。'),
        talk('chris', 'ワゴンセールを探してるんです。借金を返さなきゃいけなくて…。', 'sad'),
        talk('ino', 'わしは商人として財を成したあと、五十で隠居してから日本中を歩いて地図を作った。人生、遅すぎることはない。'),
        talk('ino', '足で稼げ。どの店がいつ値引きするか、どの棚に何が眠っておるか。歩いた者にしか見えぬ地図がある。'),
        expStep(s, { act: 12, mind: 5 }),
      ];
    },
  },
  {
    id: 'ino_2',
    trigger: 'command',
    cmd: 'store',
    chance: 0.4,
    cond: (s) => affinity(s, 'ino') >= 1 && s.week >= 8,
    play: (s) => {
      addAffinity(s, 'ino');
      return [
        talk('ino', 'また会ったな。今日は一緒に回ろう。この店は火曜に値札を貼り替える。あちらは月末に在庫を処分する。'),
        talk('chris', 'メモ、メモ…！ 店ごとの「クセ」があるんですね。', 'sparkle'),
        ...hint(s, 'ino_map', 1, '伊能忠敬'),
        expStep(s, { act: 15, info: 8 }),
      ];
    },
  },
  {
    id: 'ino_3',
    trigger: 'command',
    cmd: 'store',
    chance: 0.5,
    cond: (s) => affinity(s, 'ino') >= 2 && s.week >= 18 && s.abilities.buy >= 40,
    play: (s) => {
      addAffinity(s, 'ino');
      s.maxStamina += 10;
      return [
        talk('ino', 'おぬしの足取りを見ておった。もう立派な測量家じゃ。わしの地図、受け取るがよい。'),
        talk('chris', 'これ…この街の店、全部書いてある…！', 'cheer'),
        ...hint(s, 'ino_map', 3, '伊能忠敬'),
        info('体力の最大値アップ', ['歩き続けた結果、体力の最大値が10上がった'], 'good'),
      ];
    },
  },
  {
    id: 'store_staff',
    trigger: 'command',
    cmd: 'store',
    once: false,
    chance: 0.12,
    play: (s) => {
      addHate(s, 2);
      return [
        narr('レジで店員さんに言われた。「恐れ入りますが、転売目的と思われるお客様へのまとめ買いはお断りしております」'),
        talk('chris', '（…はい。ですよね）', 'sad'),
        gain(addExp(s, { mind: 5 })),
      ];
    },
  },
  {
    id: 'goemon_1',
    trigger: 'command',
    cmd: 'online',
    chance: 0.2,
    cond: (s) => s.week >= 10,
    play: (s) => {
      const pid = pick(s, ['jewel', 'queen_watch', 'golden_boots']);
      const p = productOf(pid);
      const price = Math.round(priceOf(s, pid) * 0.2);
      return [
        talk('goemon', `よう兄ちゃん。「${p.name}」、相場の2割の${yen(price)}で卸してやる。出所？ 聞くんじゃねえよ。`),
        talk('goemon', '絶景かな、絶景かな。世に盗人の種は尽くまじ、ってな。'),
        talk('chris', '（安すぎる…。でも、これが本物なら大儲けだ…）', 'arms'),
        choice([
          {
            label: '買う',
            run: () => {
              if (s.cash < price) return [talk('goemon', 'なんだ、金がねえのか。出直してきな。')];
              addCash(s, -price, `出所不明品: ${p.name}`);
              addUnits(s, pid, 1, price, { stolen: true });
              setFlag(s, 'goemonBought', s.week);
              if ((flag(s, 'illegal') || 0) >= 1) setFlag(s, 'arrest');
              return [narr(`「${p.name}」を手に入れた。……手が少し震えている。`)];
            },
          },
          {
            label: '断る',
            run: () => [talk('chris', '出所の言えない品は扱いません。', 'arms'), talk('goemon', 'ケッ、つまらねえ。'), gain(addExp(s, { mind: 15, info: 5 }))],
          },
        ]),
      ];
    },
  },
  {
    id: 'marco_1',
    trigger: 'command',
    cmd: 'online',
    chance: 0.2,
    cond: (s) => s.week >= 6,
    play: (s) => [
      talk('marco', 'この国では品薄の品が、海の向こうでは山積み。逆もまたしかり。わしは東方で見たものを書き記しただけで大金持ちになった。'),
      talk('chris', '情報そのものが商品になる、ってことか…。', 'sparkle'),
      talk('marco', '相場とは「場所」と「時間」の差じゃ。どこで、いつ売るか。覚えておくがよい。'),
      ...hint(s, 'lottery_nose', 1, 'マルコ・ポーロ'),
      expStep(s, { info: 15 }),
    ],
  },
  {
    id: 'gennai_1',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.45,
    play: (s) => {
      addAffinity(s, 'gennai');
      return [
        talk('gennai', 'なんだその出品文は。「美品です」「即購入OK」…それで誰の心が動く？'),
        talk('chris', 'え、みんなこう書いてますけど…。', 'sad'),
        talk('gennai', 'みんなと同じでは、みんなと同じ値段でしか売れん。自然光で撮れ。箱の角まで写せ。買い手が不安に思うことを先に書け。'),
        ...hint(s, 'photogenic', 1, '平賀源内'),
        expStep(s, { tech: 12, info: 5 }),
      ];
    },
  },
  {
    id: 'gennai_2',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.45,
    cond: (s) => affinity(s, 'gennai') >= 1 && s.week >= 6,
    play: (s) => {
      addAffinity(s, 'gennai');
      return [
        talk('gennai', '夏に鰻が売れんと嘆く鰻屋に、わしは店先に「本日、土用の丑の日」と貼らせた。それだけで行列ができた。'),
        talk('chris', 'たった一言で…！', 'sparkle'),
        talk('gennai', '物の価値は物だけで決まらん。「今、買う理由」を売るのだ。'),
        ...hint(s, 'doyou', 1, '平賀源内'),
        expStep(s, { tech: 15, info: 8 }),
      ];
    },
  },
  {
    id: 'gennai_3',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.5,
    cond: (s) => affinity(s, 'gennai') >= 2 && s.abilities.list >= 45,
    play: (s) => {
      addAffinity(s, 'gennai');
      return [
        talk('gennai', 'ほう、ずいぶん上手くなったではないか。エレキテルの次に面白い見世物だ。'),
        talk('chris', '源内さんの教えのおかげです！', 'cheer'),
        ...hint(s, 'doyou', 2, '平賀源内'),
      ];
    },
  },
  {
    id: 'newton_1',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.5,
    play: (s) => {
      addAffinity(s, 'newton');
      return [
        talk('newton', '君、仮想通貨で大損したそうだね。……実は私もだ。南海会社の株でね、全財産の大半を失った。'),
        talk('chris', 'ニュートンさんほどの天才が！？', 'sparkle'),
        talk('newton', '「天体の動きは計算できても、人々の狂気は計算できない」。熱狂の中では、誰もが自分だけは逃げ切れると思うのさ。'),
        expStep(s, { mind: 12, info: 8 }),
      ];
    },
  },
  {
    id: 'newton_2',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.7,
    cond: (s) => affinity(s, 'newton') >= 1 && (inBoom(s, 'kaeru') || s.market.kaeru.phase === 'crash'),
    play: (s) => {
      addAffinity(s, 'newton');
      return [
        talk('newton', '「カエルキッズ」の騒ぎを見たかい。南海泡沫事件とそっくりだ。価格が上がるから買い、買うから上がる。'),
        talk('newton', '私は一度利確したのに、周りが儲けるのを見て、天井でまた買ってしまった。……同じ轍を踏むなよ。'),
        ...hint(s, 'crowd_madness', 2, 'ニュートン'),
      ];
    },
  },
  {
    id: 'nobunaga_1',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.5,
    cond: (s) => s.week >= 16 && (s.rating >= 60 || profit(s) >= 300000),
    play: (s) => {
      addAffinity(s, 'nobunaga');
      return [
        talk('nobunaga', '貴様が近頃噂の商人か。'),
        talk('nobunaga', 'わしは「座」を潰し、誰でも商いができる「楽市」を開いた。既得権に守られた商人どもは、わしを憎んだものよ。'),
        talk('chris', '誰でも売り買いできる市場…。フリマアプリも、ある意味で楽市楽座ですね。', 'arms'),
        talk('nobunaga', 'ふん。自由な市には、自由な者も、ずる賢い者も集まる。どちらになるかは貴様次第だ。'),
        expStep(s, { social: 15, act: 10 }),
      ];
    },
  },
  {
    id: 'nobunaga_2',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.5,
    cond: (s) => affinity(s, 'nobunaga') >= 1 && s.week >= 24,
    play: (s) => {
      addAffinity(s, 'nobunaga');
      return [
        talk('nobunaga', '是非もなし。貴様の商いぶり、見届けた。天下を取るなら、まず市を取れ。'),
        ...hint(s, 'tenka', 2, '織田信長'),
      ];
    },
  },
  {
    id: 'ryoma_1',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.3,
    cond: (s) => s.week >= 24,
    play: (s) => [
      talk('ryoma', 'おまん、物販で食うちゅうがか！ わしも海援隊ゆう、日本で最初の会社みたいなもんを作ったぜよ。'),
      talk('ryoma', '個人の小商いで終わるか、仕組みにするか。会社にして、人を雇うて、船を出す。日本の夜明けは近いぜよ！'),
      talk('chris', '会社…！ 借金を返したら、その先があるのかもしれない。', 'sparkle'),
      expStep(s, { social: 12, mind: 12 }),
    ],
  },
  {
    id: 'mitsunari_1',
    trigger: 'command',
    cmd: 'study',
    chance: 0.4,
    play: (s) => {
      addAffinity(s, 'mitsunari');
      return [
        talk('mitsunari', 'おぬし、帳簿はつけておるか。'),
        talk('chris', 'え…なんとなく儲かってる気がする、くらいで…。', 'sad'),
        talk('mitsunari', '愚か者。太閤殿下の検地も、まず正しく数えることから始まった。仕入れ値、手数料、送料、梱包材。全部書け。'),
        talk('mitsunari', '売上ではない、利益を見よ。そして利益には税がかかる。領収書は捨てるな。'),
        ...hint(s, 'ledger', 1, '石田三成'),
        expStep(s, { info: 12, mind: 6 }),
      ];
    },
  },
  {
    id: 'mitsunari_2',
    trigger: 'command',
    cmd: 'study',
    chance: 0.5,
    cond: (s) => affinity(s, 'mitsunari') >= 1 && s.week >= 28,
    play: (s) => {
      addAffinity(s, 'mitsunari');
      return [
        talk('mitsunari', '確定申告の備えはできておるか。フリマの取引記録は、税務署も把握できると心得よ。'),
        talk('chris', 'ちゃんと記帳してます！ 三成さんのおかげで、どの商品が本当に儲かってるかも見えてきました。', 'smile'),
        ...hint(s, 'ledger', 2, '石田三成'),
      ];
    },
  },
  {
    id: 'nostra_1',
    trigger: 'command',
    cmd: 'study',
    chance: 0.35,
    cond: (s) => s.week >= 5,
    play: (s) => [
      talk('nostra', '1999年…いや、来月、ある商品の相場が必ず爆上がりする。私のサロンではそれを「予言」しておる。'),
      talk('nostra', '「相場大予言サロン」月額たったの98,000円。会員の9割が月収100万を達成（※個人の感想です）。'),
      talk('chris', '（予言が当たれば借金なんてすぐ返せる…？）', 'arms'),
      choice([
        {
          label: '入会する（98,000円）',
          run: () => {
            if (s.cash < 98000) return [talk('nostra', 'カードでもよいぞ。…なに、枠がない？ ではまた来世で。')];
            addCash(s, -98000, '相場大予言サロン 入会費');
            s.stats.expenses += 98000;
            setFlag(s, 'salonJoined', s.week);
            return [talk('nostra', 'ようこそ。予言は来週から届くであろう。'), narr('クリスはサロンに入会した。')];
          },
        },
        { label: '断る', run: () => [talk('chris', '本当に儲かるなら、人に教えずに自分でやるよね。', 'arms'), gain(addExp(s, { mind: 10, info: 5 }))] },
      ]),
    ],
  },
  {
    id: 'yukichi_1',
    trigger: 'command',
    cmd: 'study',
    chance: 0.25,
    play: (s) => [
      talk('yukichi', '天は人の上に人を造らず、人の下に人を造らず。されど、学ぶ者と学ばざる者の差は大きい。'),
      talk('chris', 'えっ…一万円札がしゃべった！？', 'sparkle'),
      talk('yukichi', '相場も、手数料も、法律も。知っておる者だけが得をする。それが商いというものだ。'),
      expStep(s, { info: 18 }),
    ],
  },
  {
    id: 'marx_1',
    trigger: 'command',
    cmd: 'play',
    chance: 0.4,
    play: (s) => {
      addAffinity(s, 'marx');
      return [
        talk('marx', '君は転売をしているそうだね。素晴らしい、実に興味深い。'),
        talk('chris', 'えっ、怒らないんですか？', 'sparkle'),
        talk('marx', '貨幣（G）で商品（W）を買い、より多くの貨幣（G′）で売る。G–W–G′。私が『資本論』で書いた資本の運動そのものだ。'),
        talk('marx', 'では問おう。その差額 G′−G は、どこから来たのかね？ 君の労働か、それとも誰かの「待てない気持ち」か。'),
        talk('chris', '……考えたこともなかった。', 'arms'),
        expStep(s, { info: 10, mind: 10 }),
      ];
    },
  },
  {
    id: 'marx_2',
    trigger: 'command',
    cmd: 'play',
    chance: 0.5,
    cond: (s) => affinity(s, 'marx') >= 1 && s.week >= 12,
    play: (s) => {
      addAffinity(s, 'marx');
      return [
        talk('marx', '先日の問いの答えは出たかね？'),
        talk('chris', '早朝から並んで、梱包して、クレーム対応して…。少なくとも「労働」はしてると思います。めちゃくちゃ。', 'arms'),
        talk('marx', 'はっはっは！ よろしい。自分の商売を言葉にできる者は強い。何を言われても、心が折れないからね。'),
        ...hint(s, 'iron_mental', 2, 'マルクス'),
      ];
    },
  },
  {
    id: 'warehouse_job',
    trigger: 'command',
    cmd: 'parttime',
    chance: 0.35,
    play: (s) => [
      narr('今日のバイトは大手通販「アマクリ」の倉庫でのピッキング。棚には、どう見ても転売目的の大量在庫が並んでいた。'),
      talk('chris', '（この段ボールの山…誰かの「在庫リスク」なんだよな）', 'arms'),
      expStep(s, { act: 5, info: 5 }),
    ],
  },
  {
    id: 'queue_crew',
    trigger: 'command',
    cmd: 'queue',
    once: false,
    chance: 0.3,
    play: (s) => {
      const r = randInt(s, 1, 3);
      if (r === 1) {
        return [narr('列の前方に、同じ服装の集団が。どうやら「並び屋」を雇った業者らしい。'), talk('chris', '（個人がどうこうできるレベルじゃない…）', 'sad'), gain(addExp(s, { mind: 5 }))];
      }
      if (r === 2) {
        addHate(s, 3);
        return [narr('行列の様子を撮影している人がいる。「転売ヤーの列www」とSNSに上げるらしい。'), talk('chris', '（顔、映ってないよな…？）', 'sad')];
      }
      return [narr('隣に並んだ親子。「息子の誕生日プレゼントなんです」と照れくさそうに笑っていた。'), talk('chris', '（……）', 'arms'), gain(addExp(s, { mind: 6 }))];
    },
  },

  // ================= 体調不良 =================
  {
    id: 'nightingale',
    trigger: 'sick',
    chance: 0.7,
    play: (s) => {
      s.sick = Math.max(0, s.sick - 1);
      addStamina(s, 20);
      return [
        talk('nightingale', '睡眠3時間で行列、深夜まで梱包。統計的に見て、倒れない方がおかしいわ。'),
        talk('nightingale', '私はクリミアで、兵士の死因の多くが戦傷ではなく不衛生だとグラフで示したの。あなたの敵も、相場ではなく生活習慣よ。'),
        talk('chris', 'ぐうの音も出ません…。', 'sad'),
        info('手厚い看護', ['回復が早まった（体力 +20）'], 'good'),
      ];
    },
  },
];

export const EVENT_MAP = Object.fromEntries(EVENTS.map((e) => [e.id, e]));
