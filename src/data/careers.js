// 顧客層（オーディエンス）とキャリアパス。売った商材のジャンルごとに顧客層が育ち、一定を超えるとその道の誘いが来る
export const AUDIENCES = {
  beauty: { name: '美容', desc: 'コスメ・美容雑貨のお客さん' },
  gadget: { name: 'ガジェット', desc: '家電・ゲーム機・PCのお客さん' },
  collector: { name: 'コレクター', desc: '絶版本・トレカ・アンティークのお客さん' },
  fashion: { name: 'ファッション', desc: 'スニーカー・小物・時計のお客さん' },
  inbound: { name: 'インバウンド', desc: '和雑貨・工芸を求める訪日客・海外のお客さん' },
};

// 商品 → 顧客層
const AUD = {
  beauty: ['pretty_set', 'dream_set', 'cosme_mirror', 'actress_mirror'],
  gadget: ['cyber_staff', 'star_globe', 'photon', 'retro_pc'],
  collector: ['novice_book', 'tsumi', 'taito', 'violin', 'art_print', 'harp_box', 'rocking', 'heiho', 'scroll', 'sylph', 'ichimatsu', 'monocle', 'rabbit_watch', 'maiogi', 'sakazuki'],
  fashion: ['boots', 'western_boots', 'golden_boots', 'scarf', 'gamaguchi', 'leather_wallet', 'gentle_umbrella', 'pocket_watch', 'jewel', 'queen_watch'],
  inbound: ['kokeshi', 'bangasa', 'lacquer', 'sake', 'nectar', 'hina', 'bonsai', 'haori'],
};
export const AUD_OF = Object.fromEntries(Object.entries(AUD).flatMap(([aud, ids]) => ids.map((id) => [id, aud])));

// キャリア。need：誘いが来る顧客層の大きさ。cost：コマンド1回に使う経験点（余りがちな情報・対人の受け皿）
export const CAREERS = {
  kol: {
    name: 'ライブコマースKOL', aud: 'beauty', need: 500, hero: 'yohki', cmd: 'live', cost: { social: 30 },
    invite: ['「あなたが勧めると、みんな買うのね。……配信をなさってみたら？ 画面の向こうにも、あなたのお客様がいるわ」'],
    perk: '「ライブ配信」（昼・夜）：出品中の美容品をまとめて売る。フォロワーが増えると、紹介料の入る案件配信も',
  },
  appraiser: {
    name: '鑑定士', aud: 'collector', need: 500, hero: 'hokusai', cmd: 'appraise_job', cost: { info: 20, mind: 10 },
    invite: ['「おぬしの眼、本物よ。わしの弟子の鑑定を、手伝ってみんか」'],
    perk: '外出「鑑定の依頼」：目利きで手数料を稼ぐ。預かった品を売る「委託販売」（手数料20%）も来る',
  },
  media: {
    name: 'レビューメディア', aud: 'gadget', need: 250, hero: 'edison', cmd: 'review', cost: { info: 30 },
    invite: ['「発明は、売れてこそだ。君のレビューで、良い道具を世に広めてくれたまえ」'],
    perk: '外出「レビュー記事を書く」：読者が増えると毎月の紹介料（アフィリエイト）。メーカーから提供品も届く',
  },
  select: {
    name: 'セレクトショップ', aud: 'fashion', need: 800, hero: 'cleo', cmd: 'buying', cost: { tech: 25 },
    invite: ['「流行は、追うものではなく、つくるもの。あなたの目で選んだ品を並べる店を持ちなさい」'],
    perk: '仕入れ「海外買い付け」：ファッションの品を卸値で買い付けられる',
  },
  inbound: {
    name: 'インバウンド・越境EC', aud: 'inbound', need: 500, hero: 'marco', cmd: 'tour', cost: { social: 20 },
    invite: ['「東方の品を西へ運べば、値は何倍にもなる。私が見てきたとおりだ。訪日客の案内を手伝ってくれないか」'],
    perk: '出品「訪日客の買い物ツアー」：和雑貨・工芸を相場の1.3倍で直接売る',
  },
};
export const CAREER_STAGE = 3;
