// セリフの中で色を変える言葉。
// game：このゲームの中の名前（販路・仕入れ先・画面の名前など）
// term：転売・物販の専門用語。ログでは、その言葉が出たセリフの下に解説を出す
// 金額（〇〇円・〇万円・¥〇〇）は形で見分けて色を変える（ui/markup.js）
export const GAME_WORDS = [
  'プンシー', 'ミィーム', 'アマクリ', 'ホンモノ堂', '海外EC', '裏市場', 'マイクリ市場', 'GLOBAL☆DEAL', 'ロンロン卸', '提携工場',
  'マイクリカード', 'TOKU', 'スキルツリー', 'ミッション', '奥義', '店の地図', '業界の動き', 'ルビーくじ', 'イグジット',
];

// 英語版で同じ役目をする言葉（並びは GAME_WORDS と同じ）
export const GAME_WORDS_EN = [
  'Punsea', 'Meeme', 'Amacri', 'Honmono-do', 'Overseas EC', 'Black Market', 'MCH Market', 'GLOBAL☆DEAL', 'Ronron Wholesale', 'Partner Factory',
  'MCH Card', 'TOKU', 'Skill Tree', 'Missions', 'Secret Art', 'Store Map', 'Industry Watch', 'Ruby Lottery', 'Exit',
];

// en / enDesc：英語版の言葉と解説
export const TERMS = [
  { word: 'せどり', desc: '安く仕入れた品を、相場との差で売って利益を出す商売。店で探すのが店舗せどり、ネットで探すのが電脳せどり', en: "sedori", enDesc: "Buying goods cheap and reselling them at market price for the difference. In-store hunting is store sedori; hunting online is online sedori." },
  { word: '転売ヤー', desc: '品薄の人気商品を買い占めて高値で売る人を指す、批判的な呼び方', en: "scalper", enDesc: "A critical name for people who buy up scarce popular items and resell them at high prices." },
  { word: '転売', desc: '買った品を、自分で使わずに売ること。品物によっては法律で禁止・制限されている', en: "reselling", enDesc: "Selling something you bought instead of using it. Some items are banned or restricted from resale by law." },
  { word: '相場', desc: 'その品が、いまだいたいいくらで売り買いされているかという値段の目安', en: "market price", enDesc: "Roughly what an item is currently trading for." },
  { word: '売れた値段', desc: 'フリマで実際に売れた（売り切れた）出品の値段。出品中の値段より、本当の相場に近い', en: "sold price", enDesc: "What listings actually sold for on flea markets. Closer to the real market price than asking prices." },
  { word: '定価', desc: 'メーカーや店が決めた、ふつうの販売価格', en: "retail price", enDesc: "The standard price set by the maker or store." },
  { word: 'プレ値', desc: 'プレミア価格。品薄で、定価より高く取引されている値段', en: "premium price", enDesc: "A price above retail because the item is scarce." },
  { word: '品薄', desc: '欲しい人に対して、売っている数が足りない状態。相場が上がりやすい', en: "short supply", enDesc: "Fewer items for sale than people who want them. Prices tend to rise." },
  { word: '手数料', desc: 'フリマやECで売れたときに、売上から差し引かれるお金', en: "fees", enDesc: "The cut a flea market or online store takes from your sale." },
  { word: '送料', desc: '売れた品を買い手に送るためのお金。出品者が払うことが多い', en: "shipping", enDesc: "The cost of sending a sold item to the buyer. Usually paid by the seller." },
  { word: '利益', desc: '売値から、仕入れ値・手数料・送料などを引いて手元に残るお金', en: "profit", enDesc: "What is left after subtracting cost, fees and shipping from the sale price." },
  { word: '粗利', desc: '売上から仕入れ値だけを引いたもうけ。送料や手数料はまだ引いていない', en: "gross profit", enDesc: "Sales minus purchase cost only, before shipping and fees." },
  { word: '在庫', desc: '仕入れて、まだ売れていない品。持っているだけでお金と場所を使う', en: "inventory", enDesc: "Things you bought and have not sold yet. Holding them ties up money and space." },
  { word: '損切り', desc: '値下がりした品を、損を承知で早めに売ること。お金を眠らせないため', en: "cutting losses", enDesc: "Selling a falling item early at a loss so your money is not stuck." },
  { word: '即決買取', desc: '買取業者が、その場ですぐに買い取ってくれること。早いが相場より安い', en: "instant buyback", enDesc: "A buyback shop pays you on the spot. Fast, but below market price." },
  { word: '型落ち', desc: '新しいモデルが出て、古くなったモデル。値下がりしやすい', en: "previous model", enDesc: "An older model after a new one comes out. Its price tends to fall." },
  { word: 'ワゴン', desc: '店の入口などに置かれる、値引き品をまとめたかご。掘り出し物がある', en: "bargain bin", enDesc: "A cart of discounted items near the store entrance. Sometimes holds hidden gems." },
  { word: '値札ミス', desc: '店がつけ間違えた安い値札。気づいた人だけが安く買える', en: "price tag error", enDesc: "A mistakenly low price tag. Only those who notice get the deal." },
  { word: '抽選', desc: '人気の限定品を、応募した人の中から選んで売る方式', en: "lottery sale", enDesc: "Selling a limited item to winners picked from everyone who applied." },
  { word: '再販', desc: 'メーカーが同じ品をもう一度作って売ること。決まると相場が下がりやすい', en: "restock", enDesc: "The maker produces and sells the same item again. Prices usually drop when it is announced." },
  { word: '値下げ交渉', desc: 'フリマで、買い手がコメントで値下げをお願いすること', en: "haggling", enDesc: "A buyer asking for a lower price in the flea market comments." },
  { word: '受取評価', desc: '買い手が品を受け取ったことを知らせる評価。これで取引が完了し、売上金が入る', en: "receipt rating", enDesc: "The buyer confirms they got the item. The deal completes and you get paid." },
  { word: 'すり替え', desc: '買い手が、届いた本物を偽物や壊れた品と入れ替えて「不良品だった」と返品してくる詐欺', en: "swap scam", enDesc: "A buyer swaps the real item for a fake or broken one and returns it as “defective”." },
  { word: 'ノークレーム・ノーリターン', desc: '「返品・苦情は受けない」という出品者の宣言。フリマの規約では、これだけで返品を断れるとは限らない', en: "no complaints, no returns", enDesc: "A seller saying they accept no returns or complaints. Platform rules do not always let you refuse returns just because of this." },
  { word: '古物商許可', desc: '中古品を仕入れて売る商売に必要な、警察（公安委員会）の許可', en: "secondhand dealer license", enDesc: "Permission from the police (Public Safety Commission) needed to buy and resell used goods in Japan." },
  { word: '薬機法', desc: '医薬品・化粧品・医療機器などのルールを決めた法律。医薬品や高度管理医療機器（カラコンなど）は許可なく売れない。化粧品は認められた範囲を超える効能を、サプリ（健康食品）は病気に効くなどの効能をうたえない', en: "PMD Act", enDesc: "Japan’s law on drugs, cosmetics and medical devices. You cannot sell medicines or controlled devices (like colored contacts) without a license. Cosmetics cannot claim effects beyond what is allowed, and supplements cannot claim to treat disease." },
  { word: '不正転売禁止法', desc: 'チケット不正転売禁止法。転売禁止と明記され、買った人の名前を確認している公演・スポーツのチケットを、商売として定価を超えて転売することを禁じる。1年以下の拘禁刑か100万円以下の罰金（または両方）', en: "Ticket Resale Act", enDesc: "Japan’s law banning resale, as a business and above face value, of event tickets marked non-transferable with the buyer’s name checked. Up to 1 year in prison or a ¥1M fine (or both)." },
  { word: '確定申告', desc: '1年の所得と税金を計算して、税務署に届け出ること。会社員なら副業の所得が年20万円を超えると必要。専業なら所得が基礎控除を超えると必要。20万円以下でも住民税の申告はいる', en: "tax return", enDesc: "Calculating a year’s income and tax and filing it with the tax office. Employees must file if side income exceeds ¥200,000; full-time sellers must file if income exceeds the basic deduction. Residence tax needs a filing even below ¥200,000." },
  { word: '追徴課税', desc: '申告が少なかったとわかったときに、あとから払う税金', en: "back taxes", enDesc: "Extra tax you pay later when your filing turns out to be too low." },
  { word: 'リボ払い', desc: 'カードの支払いを毎月一定額にする払い方。残高に高い手数料がかかり続ける', en: "revolving payment", enDesc: "Paying a card bill in fixed monthly amounts. High interest keeps piling up on the balance." },
  { word: '外注', desc: '作業（撮影・出品・梱包・発送など）を、お金を払って人に任せること', en: "outsourcing", enDesc: "Paying someone else to do work such as photos, listing, packing or shipping." },
  { word: '検品', desc: '届いた品に傷や不良がないか確かめること', en: "inspection", enDesc: "Checking delivered items for scratches or defects." },
  { word: '関税', desc: '海外から品を輸入するときにかかる税金', en: "customs duty", enDesc: "Tax charged when importing goods from abroad." },
  { word: '為替', desc: '円と外国のお金の交換比率。円安だと輸入は高く、輸出は有利になる', en: "exchange rate", enDesc: "The rate between yen and foreign money. A weak yen makes imports expensive and exports profitable." },
  { word: '円安', desc: '円の価値が下がること。海外に売ると多くの円が入り、海外から買うと高くつく', en: "weak yen", enDesc: "The yen losing value. Selling abroad brings in more yen; buying from abroad costs more." },
  { word: '業者オークション', desc: '古物商の許可を持つ業者だけが参加できる、品物の競り市', en: "trade auction", enDesc: "An auction where only licensed secondhand dealers can bid." },
  { word: '問屋', desc: 'メーカーから品をまとめて仕入れ、店に卸す業者', en: "wholesaler", enDesc: "A business that buys in bulk from makers and sells to stores." },
  { word: '卸値', desc: '問屋などが、店に売るときの値段。定価より安い', en: "wholesale price", enDesc: "The price wholesalers charge stores. Lower than retail." },
  { word: '掛け率', desc: '卸値が定価の何割かを表す数字。掛け率60%なら、定価1万円の品を6,000円で仕入れられる', en: "wholesale rate", enDesc: "The wholesale price as a share of retail. At 60%, a ¥10,000 item costs ¥6,000." },
  { word: '最低ロット', desc: '一度に注文しなければならない最低の数', en: "minimum lot", enDesc: "The smallest quantity you must order at once." },
  { word: '鑑定', desc: '品物が本物か偽物かを、専門家が確かめること', en: "authentication", enDesc: "An expert checking whether an item is genuine or fake." },
  { word: 'サーチ済み', desc: 'トレカのパックの重さなどを測って、当たりを抜いた残りのこと', en: "searched packs", enDesc: "Card packs that were weighed or checked so the hits could be pulled; the leftovers." },
  { word: 'ジャンク', desc: '動くかどうか確かめていない、または壊れている品。安いが、使えるかは運しだい', en: "junk", enDesc: "Untested or broken items. Cheap, but whether they work is up to luck." },
  { word: '買い占め', desc: '品薄の品を大量に買って、ほかの人が買えないようにすること。強い批判を受ける', en: "hoarding", enDesc: "Buying up a scarce item so others cannot. Draws strong criticism." },
  { word: 'ステマ', desc: 'ステルスマーケティング。広告なのに、広告であることを隠して宣伝すること。2023年10月から景品表示法で規制されている（責任を問われるのは広告を出した会社）', en: "stealth marketing", enDesc: "Advertising while hiding that it is an ad. Regulated in Japan since October 2023 under the Premiums and Representations Act (the advertiser is held responsible)." },
  { word: '商標法', desc: 'ブランドのロゴや名前を守る法律。偽物と知って売ると、フリマでも買取店でも違反になる', en: "Trademark Act", enDesc: "The law protecting brand logos and names. Knowingly selling a fake breaks it, whether on a flea market or to a buyback shop." },
  { word: '炎上', desc: 'SNSなどで多くの人から批判が集まること', en: "flaming", enDesc: "A flood of criticism on social media." },
  { word: '専業', desc: 'ほかの仕事をせず、物販だけで生活すること', en: "full-time seller", enDesc: "Living on reselling alone with no other job." },
  { word: '法人化', desc: '個人の商売を会社にすること。利益が大きくなると税金で有利になることがある', en: "incorporating", enDesc: "Turning your personal business into a company. Can save tax once profits are large." },
];

// 長い言葉から先に当てる（「店舗せどり」の中の「せどり」より、長い一致を優先するため）
export const TERM_MAP = Object.fromEntries(TERMS.map((t) => [t.word, t]));
