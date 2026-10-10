// 仲間（偉人）の連続イベント。20人それぞれに3段階以上の出会いがあり、最後に「奥義」か大きな見返りがある。
// 既存の仲間（events.js）の続きと、新しい仲間（エジソン・家康・ダ・ビンチ・ナポレオン・ナイチンゲール・フランクリン・ダーウィン）。
// 新しい仲間の奥義はスキルツリーの外にある特別な力（s.secrets）
import { productOf } from './products.js';
import { addAffinity, addExp, addMood, addStamina, addToku, affinity, giveHint } from '../engine/effects.js';
import { gain, info, narr, sfx, talk } from '../engine/steps.js';
import { SKILL_MAP } from './skills.js';

// ---- 奥義（スキルツリーの外の特別な力） ----
export const SECRETS = {
  menlo: { hero: 'edison', name: 'メンロパークの研究所', desc: '自社製品をつくれる（仕入れ「自社製品をつくる」）。競合のいない自分のブランド' },
  nakumade: { hero: 'ieyasu', name: '鳴かぬなら鳴くまで待とう', desc: '半年以上持っているコレクター品・高級品・限定品の相場が1割高くなる' },
  vitruvian: { hero: 'davinci', name: '万能人の目', desc: '仕入れのとき、細部を3か所多く確かめられる（偽物に気づきやすい）' },
  logistics: { hero: 'napoleon', name: '兵站の天才', desc: '在庫の置き場+40、発送の体力-30%' },
  lamp: { hero: 'nightingale', name: 'ランプの貴婦人', desc: '無理をしても体調を崩しにくい（体調不良の確率が半分）' },
  penny: { hero: 'franklin', name: '1ペニーの節約は1ペニーの稼ぎ', desc: '専業になってからの毎月の生活費が2割安い' },
  evolution: { hero: 'darwin', name: '種の起源', desc: '相場の見立てのぶれが3割小さくなる' },
};
export const hasSecret = (s, id) => !!s.secrets?.includes(id);
function grantSecret(s, id) {
  s.secrets ||= [];
  if (!s.secrets.includes(id)) s.secrets.push(id);
  const d = SECRETS[id];
  return [sfx('stageup'), info('偉人の奥義を授かった！', [`「${d.name}」`, d.desc], 'good')];
}

const exp = (s, g) => gain(addExp(s, g));
const hint = (s, id, lv, heroName) => {
  giveHint(s, id, lv);
  return [sfx('hint'), info('コツを掴んだ！', [`${heroName}から「${SKILL_MAP[id].name}」のコツ Lv${s.hints[id]} を教わった`, '（スキルツリーで習得しやすくなる）'], 'good')];
};
const seen = (s, id) => !!s.eventsSeen?.[id];
const toku = (s, n) => {
  addToku(s, n);
  return info('徳を積んだ', [`TOKU +${n}`], 'good');
};

// 仲間の一覧（メニュー「仲間」で、出会いの段階と奥義を見せる）
export const COMPANIONS = [
  { who: 'ino', chain: ['ino_1', 'ino_2', 'ino_3'], gold: 'ino_map' },
  { who: 'gennai', chain: ['gennai_1', 'gennai_2', 'gennai_3'], gold: 'doyou' },
  { who: 'ikkyu', chain: ['ikkyu_1', 'ikkyu_2', 'ikkyu_3'], gold: 'tonchi' },
  { who: 'mitsunari', chain: ['mitsunari_1', 'mitsunari_2', 'mitsunari_3'], gold: 'ledger' },
  { who: 'newton', chain: ['newton_1', 'newton_2', 'newton_3'], gold: 'crowd_madness' },
  { who: 'nobunaga', chain: ['nobunaga_1', 'nobunaga_2', 'nobunaga_3'], gold: 'tenka' },
  { who: 'marco', chain: ['marco_1', 'marco_2', 'marco_3'] },
  { who: 'marx', chain: ['marx_1', 'marx_2', 'marx_3'] },
  { who: 'satoshi', chain: ['satoshi_1', 'satoshi_2', 'satoshi_3'] },
  { who: 'goemon', chain: ['goemon_1', 'goemon_2', 'goemon_3'] },
  { who: 'nostra', chain: ['nostra_1', 'nostra_2', 'nostra_3'] },
  { who: 'ryoma', chain: ['ryoma_1', 'ryoma_2', 'ryoma_3'] },
  { who: 'yukichi', chain: ['yukichi_1', 'yukichi_2', 'yukichi_3'] },
  { who: 'edison', chain: ['edison_1', 'edison_2', 'edison_3'], secret: 'menlo' },
  { who: 'ieyasu', chain: ['ieyasu_1', 'ieyasu_2', 'ieyasu_3'], secret: 'nakumade' },
  { who: 'davinci', chain: ['davinci_1', 'davinci_2', 'davinci_3'], secret: 'vitruvian' },
  { who: 'napoleon', chain: ['napoleon_1', 'napoleon_2', 'napoleon_3'], secret: 'logistics' },
  { who: 'nightingale', chain: ['nightingale_1', 'nightingale_2', 'nightingale_3'], secret: 'lamp' },
  { who: 'franklin', chain: ['franklin_1', 'franklin_2', 'franklin_3'], secret: 'penny' },
  { who: 'darwin', chain: ['darwin_1', 'darwin_2', 'darwin_3'], secret: 'evolution' },
];
export const companionStage = (s, c) => c.chain.filter((id) => seen(s, id)).length;

const collectHeld = (s) => s.inventory.filter((u) => ['collect', 'luxury', 'hype'].includes(productOf(u.pid).kind) && s.week - u.week >= 12).length;

export const COMPANION_EVENTS = [
  // ================= 既存の仲間の続き =================
  {
    id: 'ikkyu_3',
    trigger: 'weekStart',
    chance: 0.5,
    cond: (s) => affinity(s, 'ikkyu') >= 2 && s.stats.troubles >= 10,
    play: (s) => {
      addAffinity(s, 'ikkyu');
      return [
        talk('ikkyu', 'また揉めたそうじゃな。どうじゃ、相手の言い分の中に、一つくらい本当のことはあったか？'),
        talk('chris', '……梱包が雑だった、っていうのは、本当でした。', 'sad'),
        talk('ikkyu', 'それでよい。言い負かすのが頓智ではない。相手も自分も、橋の真ん中を渡れるようにするのが頓智じゃ。'),
        ...hint(s, 'tonchi', 2, '一休'),
        exp(s, { social: 30, mind: 20 }),
      ];
    },
  },
  {
    id: 'mitsunari_3',
    trigger: 'command',
    cmd: 'study',
    chance: 0.5,
    cond: (s) => affinity(s, 'mitsunari') >= 2 && s.week >= 60,
    play: (s) => {
      addAffinity(s, 'mitsunari');
      return [
        talk('mitsunari', '一年分の帳簿を見せよ。……ふむ。在庫の評価、減価、売れ残りの損切り。ようやく数字が嘘をつかなくなった。'),
        talk('chris', '月末に数字を見るのが、少し楽しみになってきました。', 'smile'),
        talk('mitsunari', '数字は冷たいが、裏切らぬ。人は裏切るがな。……関ヶ原の話はよい。'),
        ...hint(s, 'ledger', 2, '石田三成'),
        exp(s, { info: 40, mind: 20 }),
      ];
    },
  },
  {
    id: 'newton_3',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.6,
    cond: (s) => affinity(s, 'newton') >= 2 && s.week >= 80,
    play: (s) => {
      addAffinity(s, 'newton');
      return [
        talk('newton', '私は天体の動きなら計算できた。だが人間の狂気は計算できなかった。南海泡沫事件で、全財産の大半を失ったよ。'),
        talk('chris', 'あのニュートンでも…。', 'sad'),
        talk('newton', 'だから決めた。熱狂の最中には、手に入れた数式より、自分が決めた「降りる値段」を信じることにした。'),
        ...hint(s, 'crowd_madness', 2, 'ニュートン'),
        exp(s, { info: 40, mind: 30 }),
      ];
    },
  },
  {
    id: 'nobunaga_3',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.5,
    cond: (s) => affinity(s, 'nobunaga') >= 2 && s.stage >= 3,
    play: (s) => {
      addAffinity(s, 'nobunaga');
      return [
        talk('nobunaga', '座の連中が独り占めしていた市を、わしは誰でも商える場にした。楽市楽座よ。'),
        talk('nobunaga', 'おぬしも、仕入れ先と売り場を囲い込むだけでは天下は取れぬ。人が集まる場をつくれ。'),
        talk('chris', '場をつくる…自分の店や、仲間の集まり、ですか。', 'sparkle'),
        ...hint(s, 'tenka', 2, '織田信長'),
        exp(s, { social: 40, act: 30 }),
      ];
    },
  },
  {
    id: 'marco_3',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.35,
    cond: (s) => (seen(s, 'marco_1') || seen(s, 'marco_2')) && (s.flags.abroad || s.certs?.includes('export')) && (s.tally?.plat?.exp || 0) >= 5,
    play: (s) => {
      addAffinity(s, 'marco');
      return [
        talk('marco', '海の向こうで、おぬしの品の評判を聞いたぞ。「日本の商人は箱がきれいだ」とな。'),
        talk('chris', '梱包を褒められるなんて…！', 'cheer'),
        talk('marco', '品だけでなく、信用も海を渡る。わしの旅行記より、おぬしの評価欄のほうがよく読まれておるかもしれん。'),
        exp(s, { social: 50, info: 30 }),
      ];
    },
  },
  {
    id: 'marx_3',
    trigger: 'command',
    cmd: 'play',
    chance: 0.5,
    cond: (s) => affinity(s, 'marx') >= 2 && s.week >= 96,
    play: (s) => {
      addAffinity(s, 'marx');
      return [
        talk('marx', '君の帳簿を見たよ。売上は増えたが、時給はどうかね？ 自分の時間を、安く売ってはいないか。'),
        talk('chris', '……仕組み化して、自分が動かなくても回るようにしたいです。', 'arms'),
        talk('marx', '労働者が、自分の労働を取り戻す。いいじゃないか。ただし、その仕組みで誰かを安く使わないことだ。'),
        toku(s, 3),
        exp(s, { mind: 50 }),
      ];
    },
  },
  {
    id: 'satoshi_3',
    trigger: 'weekStart',
    chance: 0.3,
    cond: (s) => seen(s, 'satoshi_2') && s.week >= 120,
    play: (s) => {
      addAffinity(s, 'satoshi');
      return [
        talk('satoshi', '…きみ、まだ物を売ってるんだね。'),
        talk('chris', 'はい。値動きに賭けるより、自分で値段をつけるほうが性に合ってました。', 'smile'),
        talk('satoshi', 'それがいい。ぼくの論文の最初の一文は「信頼できる第三者なしに」だった。でも、きみの商売は信頼そのものだ。'),
        narr('サトシは名前も告げずに、人混みに消えた。'),
        exp(s, { tech: 40, mind: 40 }),
      ];
    },
  },
  {
    id: 'goemon_2',
    trigger: 'command',
    cmd: 'online',
    chance: 0.25,
    cond: (s) => seen(s, 'goemon_1') && s.week >= 40,
    play: (s) => {
      addAffinity(s, 'goemon');
      const bought = s.flags.goemonBought !== undefined;
      return [
        talk('goemon', bought ? 'よう、お得意さん。この前の品、ちゃんと売れたかい？' : 'よう、堅物の兄ちゃん。まだ真っ当な商売してんのか。'),
        talk('goemon', 'いいこと教えてやる。俺から買うやつは、品じゃなくて「安さ」を買ってんだ。安さには必ず理由がある。'),
        talk('goemon', '型番のシールが剥がしてある、箱だけ新品、相場の半値以下の大量出品。そういうのは、だいたい俺の仲間だ。'),
        talk('chris', '……泥棒が盗品の見分け方を教えてくれるなんて。', 'arms'),
        exp(s, { info: 30, mind: 15 }),
      ];
    },
  },
  {
    id: 'goemon_3',
    trigger: 'weekStart',
    chance: 0.4,
    cond: (s) => seen(s, 'goemon_2') && s.week >= 70,
    play: (s) => {
      addAffinity(s, 'goemon');
      return [
        narr('ニュース：盗品を転売していた男が逮捕された。男は「絶景かな」とだけ話しているという。'),
        talk('chris', '五右衛門さん…。', 'sad'),
        talk('mine', '盗品の売買は、知らなかったでは済まないこともあるわ。仕入れ先の記録を残しておくのは、自分を守るためよ。', 'arms'),
        toku(s, 4),
        exp(s, { mind: 40, info: 20 }),
      ];
    },
  },
  {
    id: 'nostra_2',
    trigger: 'command',
    cmd: 'study',
    chance: 0.35,
    cond: (s) => seen(s, 'nostra_1') && s.week >= 30,
    play: (s) => {
      addAffinity(s, 'nostra');
      return [
        talk('nostra', 'わしの予言はな、わざと曖昧に書いておる。そうすれば、何が起きても「当たった」と言える。'),
        talk('chris', 'それ、ずるくないですか！？', 'sad'),
        talk('nostra', 'ふぉっふぉっ。だから、予言を売る者の言葉を信じるな。信じるなら、数字と自分の足で確かめたことだけにせい。'),
        exp(s, { info: 30, mind: 20 }),
      ];
    },
  },
  {
    id: 'nostra_3',
    trigger: 'command',
    cmd: 'study',
    chance: 0.4,
    cond: (s) => seen(s, 'nostra_2') && s.week >= 100,
    play: (s) => {
      addAffinity(s, 'nostra');
      return [
        talk('nostra', '最後に一つだけ、本物の予言をしてやろう。'),
        talk('nostra', '……おぬしは、10年後も物を売っておる。ただし、今とは違う売り方でな。'),
        talk('chris', 'それ、予言っていうか、当たり前のような…。', 'arms'),
        talk('nostra', '当たり前のことを当てるのが、一番むずかしいのじゃ。'),
        exp(s, { info: 40, mind: 40 }),
      ];
    },
  },
  {
    id: 'ryoma_2',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.35,
    cond: (s) => seen(s, 'ryoma_1') && s.stage >= 3,
    play: (s) => {
      addAffinity(s, 'ryoma');
      return [
        talk('ryoma', 'おまん、人を雇うたか？ 海援隊は、身分も藩も関係なく、腕のある者を集めたぜよ。'),
        talk('chris', '外注さんにお願いするだけでも、伝え方ひとつで仕上がりが全然違うんです。', 'arms'),
        talk('ryoma', 'そうじゃ！ 人に任せるゆうことは、信じて、任せて、責任はこっちで持つことぜよ。'),
        exp(s, { social: 50, act: 20 }),
      ];
    },
  },
  {
    id: 'ryoma_3',
    trigger: 'command',
    cmd: 'meetup',
    chance: 0.4,
    cond: (s) => seen(s, 'ryoma_2') && s.stage >= 4,
    play: (s) => {
      addAffinity(s, 'ryoma');
      return [
        talk('ryoma', '会社にしたか！ ええのう。商いを、自分一人のもんから、みんなのもんにしたがやな。'),
        talk('ryoma', 'わしは志半ばで倒れた。おまんは、最後まで船を漕ぎぃや。日本の夜明けぜよ！'),
        talk('chris', 'はい！ 最後まで。', 'guts'),
        exp(s, { social: 60, mind: 40 }),
      ];
    },
  },
  {
    id: 'yukichi_2',
    trigger: 'command',
    cmd: 'study',
    chance: 0.3,
    cond: (s) => seen(s, 'yukichi_1') && s.week >= 24,
    play: (s) => {
      addAffinity(s, 'yukichi');
      return [
        talk('yukichi', '今日は簿記を教えよう。わしは西洋の帳合いの法を日本に紹介した。商人が学問をする時代なのだ。'),
        talk('chris', '借方、貸方……頭が爆発しそうです。', 'sad'),
        talk('yukichi', '一度身につければ一生の武器になる。独立自尊。自分の商いを、自分の頭で治めることだ。'),
        exp(s, { info: 40 }),
      ];
    },
  },
  {
    id: 'yukichi_3',
    trigger: 'command',
    cmd: 'study',
    chance: 0.35,
    cond: (s) => seen(s, 'yukichi_2') && s.debt <= 0,
    play: (s) => {
      addAffinity(s, 'yukichi');
      return [
        talk('yukichi', '借金を返し終えたそうだな。見事だ。'),
        talk('yukichi', '一身独立して一国独立す。もう誰にも、自分の時間を担保に取られることはない。'),
        talk('chris', '……はい。次は、自分で選んだことに時間を使います。', 'cheer'),
        exp(s, { mind: 60, info: 30 }),
      ];
    },
  },

  // ================= 新しい仲間 =================
  // ---- エジソン：自社製品をつくる（メーカー側に回る） ----
  {
    id: 'edison_1',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.3,
    cond: (s) => s.stage >= 2,
    play: (s) => {
      addAffinity(s, 'edison');
      return [
        talk('edison', 'きみは他人の作った物を売っているんだね。悪くない。だが、私は電球を売る前に、まず1,000回失敗した。'),
        talk('chris', '1,000回…。', 'sparkle'),
        talk('edison', '天才とは1%のひらめきと99%の汗だ。売れ筋の「なぜ売れるか」を、毎日メモしてごらん。'),
        exp(s, { tech: 25, info: 10 }),
      ];
    },
  },
  {
    id: 'edison_2',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.35,
    cond: (s) => affinity(s, 'edison') >= 1 && s.stats.soldUnits >= 150,
    play: (s) => {
      addAffinity(s, 'edison');
      return [
        talk('edison', 'メモは続いているか？ 売れた品のレビューに「ここが不満」と書いてあるだろう。それが次の製品の設計図だ。'),
        talk('chris', '「ケーブルが短い」「色が少ない」…確かに、同じ不満がたくさんあります。', 'arms'),
        talk('edison', 'それを全部直した物を、工場に頼んで作ればいい。転売屋から、メーカーへ。'),
        exp(s, { tech: 35, info: 20 }),
      ];
    },
  },
  {
    id: 'edison_3',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.4,
    cond: (s) => affinity(s, 'edison') >= 2 && s.stage >= 3 && s.abilities.list >= 50,
    play: (s) => {
      addAffinity(s, 'edison');
      return [
        talk('edison', '私の研究所を見せてあげよう。ここでは「発明」を毎週の仕事にしていた。'),
        talk('edison', 'きみも自分のブランドを持つといい。競合のいない品は、値段を自分で決められる。'),
        talk('chris', '自分の名前で、物を世に出す…！', 'cheer'),
        ...grantSecret(s, 'menlo'),
      ];
    },
  },
  // ---- 徳川家康：鳴くまで待つ（長期保有） ----
  {
    id: 'ieyasu_1',
    trigger: 'command',
    cmd: 'rest',
    chance: 0.3,
    cond: (s) => s.week >= 20,
    play: (s) => {
      addAffinity(s, 'ieyasu');
      return [
        talk('ieyasu', '休むのも商いのうち。焦って安く売れば、それまでの我慢が無駄になる。'),
        talk('chris', 'でも、在庫を持っているとそわそわして…。', 'sad'),
        talk('ieyasu', '人の一生は重荷を負うて遠き道を行くがごとし。急ぐべからず。'),
        exp(s, { mind: 25 }),
      ];
    },
  },
  {
    id: 'ieyasu_2',
    trigger: 'command',
    cmd: 'rest',
    chance: 0.35,
    cond: (s) => affinity(s, 'ieyasu') >= 1 && collectHeld(s) >= 3,
    play: (s) => {
      addAffinity(s, 'ieyasu');
      return [
        talk('ieyasu', 'ほう、絶版の品を寝かせておるな。待つ商いは、待つ理由を持つ者にだけ許される。'),
        talk('ieyasu', '「なぜ値が上がるか」を言えぬ在庫は、待っているのではない。ただ放っておるだけじゃ。'),
        talk('chris', '……耳が痛いです。', 'arms'),
        exp(s, { mind: 35, info: 15 }),
      ];
    },
  },
  {
    id: 'ieyasu_3',
    trigger: 'command',
    cmd: 'rest',
    chance: 0.4,
    cond: (s) => affinity(s, 'ieyasu') >= 2 && s.week >= 150 && s.stage >= 3,
    play: (s) => {
      addAffinity(s, 'ieyasu');
      return [
        talk('ieyasu', '信長公が餅をつき、秀吉がこね、わしは座って食うた。そう言われておる。'),
        talk('ieyasu', 'だがな、座っておる間も、天下の動きは一日も見逃さなんだ。待つとは、見続けることよ。'),
        ...grantSecret(s, 'nakumade'),
      ];
    },
  },
  // ---- ダ・ビンチ：真贋鑑定 ----
  {
    id: 'davinci_1',
    trigger: 'command',
    cmd: 'store',
    chance: 0.2,
    cond: (s) => s.week >= 16 && !!s.flags.license,
    play: (s) => {
      addAffinity(s, 'davinci');
      return [
        talk('davinci', 'その品、裏返して見たかね？ 私は人体を描くとき、皮膚の下の骨と筋肉まで描いた。'),
        talk('chris', '表の写真しか見ていませんでした…。', 'sad'),
        talk('davinci', '偽物を作る者は、見えるところしか作らない。見えないところに、真実がある。'),
        exp(s, { info: 25 }),
      ];
    },
  },
  {
    id: 'davinci_2',
    trigger: 'command',
    cmd: 'store',
    chance: 0.3,
    cond: (s) => affinity(s, 'davinci') >= 1 && s.abilities.eye >= 45,
    play: (s) => {
      addAffinity(s, 'davinci');
      return [
        talk('davinci', '私のノートは鏡文字で書いてある。盗み見る者を拒むためだ。本物の職人にも、そういう「癖」がある。'),
        talk('davinci', '縫い目の向き、刻印の深さ、インクのにじみ。癖を知れば、真似した者の手がわかる。'),
        talk('chris', '品物ごとの「癖」…。', 'sparkle'),
        exp(s, { info: 40, tech: 15 }),
      ];
    },
  },
  {
    id: 'davinci_3',
    trigger: 'command',
    cmd: 'store',
    chance: 0.35,
    cond: (s) => affinity(s, 'davinci') >= 2 && s.abilities.eye >= 65,
    play: (s) => {
      addAffinity(s, 'davinci');
      return [
        talk('davinci', '観察とは、見ることではない。知ることだ。きみの目は、もう職人の手を見ている。'),
        talk('chris', '最近、写真を見ただけで「何か変だ」と感じるようになりました。', 'smile'),
        ...grantSecret(s, 'vitruvian'),
      ];
    },
  },
  // ---- ナポレオン：兵站（在庫管理） ----
  {
    id: 'napoleon_1',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.3,
    cond: (s) => s.inventory.length >= 25,
    play: (s) => {
      addAffinity(s, 'napoleon');
      return [
        talk('napoleon', '兵は胃袋で進軍する。補給の続かぬ軍は、どんな名将でも負ける。'),
        talk('napoleon', '君の部屋を見たまえ。どこに何があるか、すぐに言えるか？'),
        talk('chris', '……段ボールの下に何があるか、正直わかりません。', 'sad'),
        exp(s, { act: 20, info: 15 }),
      ];
    },
  },
  {
    id: 'napoleon_2',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.35,
    cond: (s) => affinity(s, 'napoleon') >= 1 && s.stats.soldUnits >= 200,
    play: (s) => {
      addAffinity(s, 'napoleon');
      return [
        talk('napoleon', '棚に番号を振れ。入ってきた順に並べ、古い物から出せ。売れない物は、早めに退却させる。'),
        talk('chris', '先入れ先出し、ですね。', 'arms'),
        talk('napoleon', 'ロシアで私は冬に負けた。在庫の冬は、季節の終わりに来る。'),
        exp(s, { act: 30, info: 20 }),
      ];
    },
  },
  {
    id: 'napoleon_3',
    trigger: 'command',
    cmd: 'listing',
    chance: 0.4,
    cond: (s) => affinity(s, 'napoleon') >= 2 && s.stage >= 3 && s.abilities.pack >= 50,
    play: (s) => {
      addAffinity(s, 'napoleon');
      return [
        talk('napoleon', '見事な陣形だ。棚は整い、発送は流れるようだ。余の辞書に「在庫切れ」の文字はない。'),
        talk('chris', '（それ、「不可能」じゃなかったっけ…）', 'arms'),
        ...grantSecret(s, 'logistics'),
      ];
    },
  },
  // ---- ナイチンゲール：体を守る ----
  {
    id: 'nightingale_1',
    trigger: 'command',
    cmd: 'rest',
    chance: 0.25,
    cond: (s) => s.week >= 10 && s.stamina < 50,
    play: (s) => {
      addAffinity(s, 'nightingale');
      addStamina(s, 10);
      return [
        talk('nightingale', '顔色が悪いわ。昨夜は何時間眠ったの？'),
        talk('chris', '……4時間くらい、です。', 'sad'),
        talk('nightingale', '数字で記録しなさい。睡眠時間、体力、売上。並べてみれば、無理をした週ほど稼げていないとわかるわ。'),
        info('看護', ['体力 +10'], 'good'),
      ];
    },
  },
  {
    id: 'nightingale_2',
    trigger: 'command',
    cmd: 'clinic',
    chance: 0.6,
    cond: (s) => affinity(s, 'nightingale') >= 1,
    play: (s) => {
      addAffinity(s, 'nightingale');
      return [
        talk('nightingale', 'ちゃんと病院に来たのね。えらいわ。'),
        talk('nightingale', 'クリミアで私がしたのは、清潔な寝床と、まともな食事と、記録。それだけで死者は激減した。'),
        talk('chris', '当たり前のことを、当たり前に…。', 'smile'),
        exp(s, { mind: 30 }),
      ];
    },
  },
  {
    id: 'nightingale_3',
    trigger: 'command',
    cmd: 'rest',
    chance: 0.4,
    cond: (s) => affinity(s, 'nightingale') >= 2 && s.week >= 100,
    play: (s) => {
      addAffinity(s, 'nightingale');
      addMood(s, 1);
      return [
        talk('nightingale', 'この一年、あなたは倒れなかった。グラフにしたら、きれいな線になったわ。'),
        talk('nightingale', '夜、ランプを持って見回るのが私の仕事だった。今夜からは、あなたが自分を見回りなさい。'),
        ...grantSecret(s, 'lamp'),
      ];
    },
  },
  // ---- フランクリン：時は金なり（節約） ----
  {
    id: 'franklin_1',
    trigger: 'command',
    cmd: 'study',
    chance: 0.25,
    cond: (s) => s.week >= 12,
    play: (s) => {
      addAffinity(s, 'franklin');
      return [
        talk('franklin', '時は金なり。私が若い商人に書いた手紙の一文だ。'),
        talk('franklin', '一日をなんとなく過ごせば、その日の稼ぎだけでなく、そのお金が生んだはずの利息まで失う。'),
        talk('chris', '借金の利息のこと、言われているみたいです…。', 'sad'),
        exp(s, { info: 20, mind: 10 }),
      ];
    },
  },
  {
    id: 'franklin_2',
    trigger: 'command',
    cmd: 'study',
    chance: 0.3,
    cond: (s) => affinity(s, 'franklin') >= 1 && s.week >= 40,
    play: (s) => {
      addAffinity(s, 'franklin');
      return [
        talk('franklin', '私は毎晩、13の徳目のどれを守れたか表につけていた。節制、沈黙、規律、決断、節約、勤勉……。'),
        talk('franklin', '節約とは、ケチになることではない。無駄を書き出して、一つずつ消すことだ。'),
        talk('chris', '毎月のサブスク、梱包材の買いすぎ、使ってない倉庫…。', 'arms'),
        exp(s, { mind: 30, info: 15 }),
      ];
    },
  },
  {
    id: 'franklin_3',
    trigger: 'command',
    cmd: 'study',
    chance: 0.35,
    cond: (s) => affinity(s, 'franklin') >= 2 && !!s.fulltime,
    play: (s) => {
      addAffinity(s, 'franklin');
      return [
        talk('franklin', '専業になったそうだね。ならば固定費こそが敵だ。毎月、黙って出ていくお金ほど怖いものはない。'),
        talk('franklin', '1ペニーの節約は、1ペニーの稼ぎ。売って稼ぐより、削るほうがずっと確実だ。'),
        ...grantSecret(s, 'penny'),
      ];
    },
  },
  // ---- ダーウィン：変化に適応する ----
  {
    id: 'darwin_1',
    trigger: 'command',
    cmd: 'online',
    chance: 0.2,
    cond: (s) => s.week >= 24,
    play: (s) => {
      addAffinity(s, 'darwin');
      return [
        talk('darwin', '生き残るのは、最も強い種でも、最も賢い種でもない。変化に最もよく適応した種だ。'),
        talk('chris', '……と、よく言われますけど、本当にそう書いたんですか？', 'arms'),
        talk('darwin', 'はっはっは。正確には少し違う。だが、相場の世界ではそのとおりだろう。'),
        exp(s, { info: 25 }),
      ];
    },
  },
  {
    id: 'darwin_2',
    trigger: 'command',
    cmd: 'online',
    chance: 0.3,
    cond: (s) => affinity(s, 'darwin') >= 1 && (s.regimes || []).length >= 1,
    play: (s) => {
      addAffinity(s, 'darwin');
      return [
        talk('darwin', '規制が入ったそうだね。ガラパゴスの鳥は、島ごとにくちばしの形を変えていた。'),
        talk('darwin', '売り場のルールが変われば、売り方を変える。昨日の勝ち方に固執した種から、消えていく。'),
        talk('chris', '同じ品でも、別の売り場、別の売り方…。', 'sparkle'),
        exp(s, { info: 35, mind: 15 }),
      ];
    },
  },
  {
    id: 'darwin_3',
    trigger: 'command',
    cmd: 'online',
    chance: 0.35,
    cond: (s) => affinity(s, 'darwin') >= 2 && s.week >= 180,
    play: (s) => {
      addAffinity(s, 'darwin');
      return [
        talk('darwin', '私は20年かけて『種の起源』を書いた。観察を積み重ねれば、変化の「向き」が見えてくる。'),
        talk('chris', '最近、相場の動きにも「向き」があるように感じます。', 'smile'),
        ...grantSecret(s, 'evolution'),
      ];
    },
  },
];

// 参考：奥義の効果の出どころ（engine 側で hasSecret を見る）
//   menlo → commands.js（自社製品をつくる）／ nakumade → market.js unitPrice ／ vitruvian → listing.js
//   logistics → inventory.js capacity・sales.js shipStaminaMult ／ lamp → commands.js sickRisk
//   penny → finance.js 生活費 ／ evolution → market.js estimateError
