// 転売屋スキルツリー。中心の「押し入れの宝の山」から7つのルートが放射状に伸びる。
// どの方向に伸ばすかで、転売屋としての「目指すルート」（称号・得意分野）が決まっていく。
//
// route  : store / online / vintage / sales / system / network / manage（null は画面に出ない初期ノード）
// parent : ツリー上の親。親を解放すると見えるようになる
// depth  : 中心からの段数 / lane: 横方向のずれ（-1 = 左、+1 = 右）
// kind:
//   root      中心（最初から持っている）
//   initial   最初から持っている（画面には出さない）
//   starter   チュートリアルで無料でもらえる
//   unlock    新しい行動・販路・画面が使えるようになる
//   perk      常時効果
//   repeat    何度も強化できる（max まで）
//   gold      偉人の奥義。偉人のイベントでコツをもらうと解放できる
//   record    記録パネル（丸）。累計の記録が条件に届くと無料で解放できる
//   capstone  ルートの到達点。そのルートのノードを一定数そろえると解放できる
//   red       マイナス（イベントで付く。経験点で治す。ツリーには出さない）
// req: 親以外に必要なノード / stage: 必要なキャリアステージ / flag: 必要なフラグ / monthly: 維持費（毎月末）

export const ROUTES = [
  { id: 'store', name: '店舗せどり', title: '店舗の鬼', color: '#22C55E', angle: -90, desc: '足で稼ぐ。ワゴン、行列、店ごとのクセ' },
  { id: 'online', name: '電脳・ポイ活', title: '電脳の覇者', color: '#06B6D4', angle: -38.57, desc: 'ネットとポイントで利益を作る。予約と抽選' },
  { id: 'vintage', name: '古物・目利き', title: '鑑定士', color: '#A78BFA', angle: 12.86, desc: '中古・ヴィンテージ・真贋。相場を読む目' },
  { id: 'sales', name: '販路・出品', title: '売れっ子セラー', color: '#EC4899', angle: 64.29, desc: '売り先を増やし、高く早く売る' },
  { id: 'system', name: '仕組み化', title: '物販会社', color: '#4A8FE8', angle: 115.71, desc: 'ツール・倉庫・外注。自分が動かなくても回る' },
  { id: 'network', name: '人脈・発信', title: '業界の顔', color: '#F97316', angle: 167.14, desc: '仲間・評価・トラブル対応。そして発信する側へ' },
  { id: 'manage', name: '経営', title: '経営者', color: '#EAB308', angle: 218.57, desc: '数字を読む。KPI・税金・事業化' },
];
export const ROUTE_MAP = Object.fromEntries(ROUTES.map((r) => [r.id, r]));

// ルートの熟練度：そのルートのノードを何個持っているか
export const ROUTE_LEVELS = [3, 6];
export const CAPSTONE_NEED = 5;

const E = (id) => `assets/extensions/${id}.png`;
const I = (name) => `assets/icons/${name}`;
const H = (id) => `assets/heroes/${id}.png`;

export const SKILLS = [
  // ---- 中心 ----
  { id: 'src_home', route: null, kind: 'root', name: '押し入れの宝の山', desc: '家の物を売って最初の売上を立てたら、コスト0で解放できる。すべてはここから始まる', gate: [{ key: 'soldUnits', target: 1, label: '売上を立てた件数' }], icon: E(1008) },
  { id: 'ch_punsea', route: null, kind: 'initial', name: 'プンシー', desc: 'フリマ。手数料10%' },
  { id: 'kpi_basic', route: null, kind: 'initial', name: '帳簿', desc: '売上・利益・販売個数を記録する' },

  // ---- 店舗せどり ----
  { id: 'src_store', route: 'store', parent: 'src_home', depth: 1, lane: 0, kind: 'starter', name: '近所の店のワゴン', desc: '「店舗せどり」が解放。量販店やドラッグストアの値引き品を仕入れる', cost: { act: 10 }, icon: E(1031) },
  { id: 'src_queue', route: 'store', parent: 'src_store', depth: 2, lane: 0, kind: 'unlock', name: '行列に並ぶ', desc: '「行列に並ぶ」が解放。発売日・再販日に早朝から並ぶ', cost: { act: 60, mind: 30 }, icon: I('sleep.png') },
  { id: 'bargain', route: 'store', parent: 'src_store', depth: 2, lane: -1, kind: 'perk', name: '値切り上手', desc: '店舗仕入れの価格がさらに5%安くなる', cost: { social: 40, act: 10 }, icon: I('gum.png') },
  { id: 'rec_walker', route: 'store', parent: 'st_legs', depth: 4, lane: 1, kind: 'record', name: '足で稼ぐ', desc: '店舗せどりの体力消費-10%', record: { key: 'storeTrips', target: 40, label: '店舗せどりをした回数' }, icon: I('hp.png') },
  { id: 'early_bird', route: 'store', parent: 'src_queue', depth: 3, lane: 0, kind: 'perk', name: '早起き', desc: '行列の成功率が大きく上がる', cost: { act: 40, mind: 20 }, icon: I('buf_agi.png') },
  { id: 'ino_map', route: 'store', parent: 'bargain', depth: 3, lane: -1, kind: 'gold', hero: 'ino', name: '大日本沿海輿地全図', desc: '店舗仕入れの候補+2、店舗巡りの体力消費-30%', cost: { act: 90, info: 40 }, icon: H(1005) },
  { id: 'st_goods', route: 'store', parent: 'src_store', depth: 2, lane: 1, kind: 'repeat', max: 3, name: '品ぞろえの目', desc: '店舗せどりで見つかる商品が+1（レベルごと）', cost: { act: 25, info: 10 }, perLv: [{ key: 'storeOffers', add: 1 }], icon: E(2125) },
  { id: 'st_legs', route: 'store', parent: 'st_goods', depth: 3, lane: 1, kind: 'repeat', max: 5, name: '健脚', desc: '体力の上限+5（レベルごと）', cost: { act: 30, mind: 10 }, grant: { maxStamina: 5 }, icon: E(1031) },
  { id: 'cap_store', route: 'store', parent: 'early_bird', depth: 4, lane: 0, kind: 'capstone', name: '店舗の鬼', desc: '店舗の仕入れ候補+2、ワゴンの値引き+5%、店舗巡りの体力消費-20%', cost: { act: 150, info: 80 }, need: { buy: 60 }, icon: E(5531) },

  // ---- 電脳・ポイ活 ----
  { id: 'src_online', route: 'online', parent: 'src_home', depth: 1, lane: 0, kind: 'unlock', name: 'ポイント通販', desc: '「電脳せどり」が解放。ポイント還元を利益に変える', cost: { info: 40, tech: 15 }, gate: [{ flag: 'tutorialDone', label: 'チュートリアルを終える' }, { key: 'purchases', target: 5, label: '累計の仕入れ数' }], icon: I('cp.png') },
  { id: 'src_lottery', route: 'online', parent: 'src_online', depth: 2, lane: 0, kind: 'unlock', name: '抽選・予約', desc: '「抽選に応募」と、電脳せどりでの予約・在庫復活が解放', cost: { info: 60, mind: 30 }, icon: E(4016) },
  { id: 'poikatsu', route: 'online', parent: 'src_online', depth: 2, lane: -1, kind: 'perk', name: 'ポイ活の鬼', desc: '電脳のポイント還元+40%、カード還元が2%に', cost: { info: 40, tech: 10 }, icon: I('ce.png') },
  { id: 'rec_points', route: 'online', parent: 'on_buy', depth: 4, lane: 1, kind: 'record', name: 'ポイント長者', desc: 'ポイント還元+10%', record: { key: 'pointsEarned', target: 100000, label: '獲得したポイント' }, icon: I('cp.png') },
  { id: 'lottery_nose', route: 'online', parent: 'src_lottery', depth: 3, lane: 0, kind: 'perk', name: '限定の嗅覚', desc: '抽選の当選率が1.3倍', cost: { info: 35, mind: 25 }, icon: I('buf_int.png') },
  { id: 'eye_ai', route: 'online', parent: 'poikatsu', depth: 3, lane: -1, kind: 'perk', name: 'AIリサーチツール', desc: '在庫切れ商品の逆引きなど。仕入れ候補+2、推定誤差-30%（月額9,800円）', cost: { info: 60, tech: 30 }, stage: 3, monthly: 9800, icon: E(5075) },
  { id: 'on_search', route: 'online', parent: 'src_online', depth: 2, lane: 1, kind: 'repeat', max: 3, name: '検索ワード帳', desc: '電脳せどりで見つかる商品が+1（レベルごと）', cost: { info: 30, tech: 10 }, perLv: [{ key: 'onlineOffers', add: 1 }], icon: I('int.png') },
  { id: 'on_buy', route: 'online', parent: 'on_search', depth: 3, lane: 1, kind: 'repeat', max: 5, name: '仕入れの勘', desc: '基礎能力「仕入れ」+3（レベルごと）', cost: { info: 25, act: 10 }, grant: { abilities: { buy: 3 } }, icon: I('buf_int.png') },
  { id: 'on_bulk', route: 'online', parent: 'eye_ai', depth: 4, lane: -1, kind: 'repeat', max: 3, name: 'まとめ買い', desc: '仕入れ候補を買える数+1（レベルごと。限定品・一点物を除く）', cost: { info: 40, act: 20 }, perLv: [{ key: 'offerQty', add: 1 }], icon: E(1058) },
  { id: 'cap_online', route: 'online', parent: 'lottery_nose', depth: 4, lane: 0, kind: 'capstone', name: '電脳の覇者', desc: '電脳の仕入れ候補+2、ポイント還元+30%、抽選の当選率1.2倍', cost: { info: 150, tech: 80 }, need: { buy: 60 }, icon: E(5016) },

  // ---- 古物・目利き ----
  { id: 'eye_market', route: 'vintage', parent: 'src_home', depth: 1, lane: 0, kind: 'unlock', name: '相場チェック', desc: '「相場」画面が解放。売り切れ価格を調べる習慣で、推定相場の誤差が25%減る', cost: { info: 15 }, gate: [{ flag: 'tutorialDone', label: 'チュートリアルを終える' }, { key: 'soldUnits', target: 8, label: '累計の販売数' }], icon: I('int.png') },
  { id: 'license', route: 'vintage', parent: 'eye_market', depth: 2, lane: 0, kind: 'unlock', name: '古物商許可の取り方', desc: '「古物商許可を申請」が解放。中古を仕入れて売るなら必須', cost: { info: 40, mind: 20 }, icon: E(1016) },
  { id: 'eye_fake', route: 'vintage', parent: 'eye_market', depth: 2, lane: 1, kind: 'perk', name: '真贋の知識', desc: '刻印・縫製・シュリンクなどの細部をもう1か所見られて、見誤りにくくなる', cost: { info: 40, mind: 20 }, need: { eye: 30 }, icon: I('confused.png') },
  { id: 'crowd_madness', route: 'vintage', parent: 'eye_market', depth: 2, lane: -1, kind: 'gold', hero: 'newton', name: '群衆の狂気', desc: '相場推定の誤差が半分に。ブームの天井を察知できる', cost: { info: 80, mind: 50 }, icon: H(3043) },
  { id: 'src_used', route: 'vintage', parent: 'license', depth: 3, lane: 0, kind: 'unlock', name: 'リサイクルショップ・古本', desc: '店舗せどりで中古品・古本が仕入れられる（古物商許可が必要）', cost: { act: 50, info: 30 }, flag: 'license', icon: E(1008) },
  { id: 'serial_memo', route: 'vintage', parent: 'eye_fake', depth: 3, lane: 1, kind: 'perk', name: 'シリアル控え', desc: '発送前に写真とシリアルを記録。すり替え詐欺を撃退できる', cost: { tech: 25, info: 25 }, icon: E(1003) },
  { id: 'src_flea', route: 'vintage', parent: 'src_used', depth: 4, lane: -1, kind: 'unlock', name: 'フリマ仕入れ', desc: '電脳せどりで、フリマの相場より安い出品を仕入れられる（電脳せどりが必要）', cost: { info: 70, tech: 30 }, req: ['src_online'], icon: E(1112) },
  { id: 'src_auction', route: 'vintage', parent: 'src_used', depth: 4, lane: 0, kind: 'unlock', name: '業者オークション', desc: '「業者オークション」が解放。古物商だけが入れる市場。真贋リスクが低い（会費 月1万円）', cost: { info: 120, social: 60 }, stage: 3, monthly: 10000, need: { eye: 50 }, icon: E(4069) },
  { id: 'rec_appraiser', route: 'vintage', parent: 'serial_memo', depth: 4, lane: 1, kind: 'record', name: '古物の目', desc: '推定相場の誤差-10%', record: { key: 'usedSold', target: 30, label: '中古・コレクター品を売った数' }, icon: E(4008) },
  { id: 'vi_eye', route: 'vintage', parent: 'license', depth: 3, lane: -1, kind: 'repeat', max: 5, name: '目利きの修行', desc: '基礎能力「目利き」+3（レベルごと）', cost: { info: 20, mind: 10 }, grant: { abilities: { eye: 3 } }, icon: I('ce.png') },
  { id: 'vi_note', route: 'vintage', parent: 'src_flea', depth: 5, lane: -1, kind: 'repeat', max: 3, name: '相場ノート', desc: '推定相場の誤差-5%（レベルごと）', cost: { info: 35, mind: 15 }, perLv: [{ key: 'estErr', mul: 0.95 }], icon: E(4008) },
  { id: 'cap_vintage', route: 'vintage', parent: 'src_auction', depth: 5, lane: 0, kind: 'capstone', name: '鑑定士', desc: '鑑定眼：仕入れ候補の真贋が「目利き×1%」の確率でひと目で分かる（最大95%）。中古・業者オークションの仕入れ値-8%', cost: { info: 150, mind: 80 }, need: { eye: 60 }, icon: E(5509) },

  // ---- 販路・出品 ----
  { id: 'ch_miime', route: 'sales', parent: 'src_home', depth: 1, lane: 0, kind: 'starter', name: 'ミィーム', desc: 'オークション。手数料10%。コレクター品は競り上がりやすい', cost: { tech: 20, info: 10 }, gate: [{ flag: 'tutorialDone', label: 'チュートリアルを終える' }], icon: E(1111) },
  { id: 'ch_amacri', route: 'sales', parent: 'ch_miime', depth: 2, lane: 0, kind: 'unlock', name: 'アマクリ', desc: '大手EC・倉庫委託。手数料15%＋納品料。新品がよく売れ、発送の手間がない（月額4,900円）', cost: { tech: 90, info: 60 }, stage: 2, monthly: 4900, need: { list: 50 }, icon: I('mch_icon.png') },
  { id: 'photogenic', route: 'sales', parent: 'ch_miime', depth: 2, lane: -1, kind: 'perk', name: '写真映え', desc: '少し高めの値付けでも売れやすくなる', cost: { tech: 45, info: 15 }, icon: E(1075) },
  { id: 'slots', route: 'sales', parent: 'ch_miime', depth: 2, lane: 1, kind: 'repeat', max: 5, name: '出品枠の拡張', desc: '同時に出品できる数が+3（レベルごと）', cost: { tech: 20, info: 10 }, icon: I('buf_phy.png') },
  { id: 'ch_shops', route: 'sales', parent: 'ch_amacri', depth: 3, lane: 0, kind: 'perk', name: 'プンシーShops', desc: '事業者向けショップに移行。プンシーの買い手1.3倍、出品枠+5', cost: { tech: 50, social: 30 }, stage: 3, icon: E(1059) },
  { id: 'doyou', route: 'sales', parent: 'photogenic', depth: 3, lane: -1, kind: 'gold', hero: 'gennai', name: '土用の丑の日', desc: 'コピー一発で売れ行きが激変。高値でも売れやすい', cost: { tech: 90, info: 40 }, icon: H(3003) },
  { id: 'rec_seller', route: 'sales', parent: 'sa_list', depth: 4, lane: 1, kind: 'record', name: '常連さん', desc: 'すべての販路で買い手+10%', record: { key: 'soldUnits', target: 300, label: '売った商品の数' }, icon: E(3055) },
  { id: 'sa_list', route: 'sales', parent: 'slots', depth: 3, lane: 1, kind: 'repeat', max: 5, name: '出品の腕', desc: '基礎能力「出品」+3（レベルごと）', cost: { tech: 20, info: 10 }, grant: { abilities: { list: 3 } }, icon: I('buf_agi.png') },
  { id: 'sa_fans', route: 'sales', parent: 'ch_shops', depth: 4, lane: -1, kind: 'repeat', max: 3, name: '固定ファン', desc: 'すべての販路で買い手+5%（レベルごと）', cost: { tech: 35, social: 15 }, perLv: [{ key: 'buyers', mul: 1.05 }], icon: E(3112) },
  { id: 'cap_sales', route: 'sales', parent: 'ch_shops', depth: 4, lane: 0, kind: 'capstone', name: '売れっ子セラー', desc: '高めの値付けでもさらに売れやすく、すべての販路で買い手+20%', cost: { tech: 150, social: 80 }, need: { list: 60 }, icon: E(3112) },

  // ---- 仕組み化 ----
  { id: 'pack_master', route: 'system', parent: 'src_home', depth: 1, lane: 0, kind: 'perk', name: '梱包職人', desc: '発送の体力消費が半分になり、配送破損がなくなる', cost: { tech: 30, act: 30 }, gate: [{ flag: 'tutorialDone', label: 'チュートリアルを終える' }, { key: 'soldUnits', target: 20, label: '累計の販売数' }], icon: I('decoy.png') },
  { id: 'price_tool', route: 'system', parent: 'pack_master', depth: 2, lane: 0, kind: 'perk', name: '価格改定ツール', desc: '売れ残った出品を毎週自動で値下げ・相場に追従させる（月額5,000円）', cost: { tech: 40, info: 30 }, stage: 2, monthly: 5000, icon: I('dbf_agi.png') },
  { id: 'warehouse', route: 'system', parent: 'pack_master', depth: 2, lane: -1, kind: 'perk', name: 'レンタル倉庫', desc: '在庫スペース+60（月額2万円）', cost: { act: 40, info: 20 }, stage: 2, monthly: 20000, icon: E(5127) },
  { id: 'routine', route: 'system', parent: 'pack_master', depth: 2, lane: 1, kind: 'unlock', name: 'ルーティン化', desc: '「ルーティン」が解放。仕入れ→出品→売却→値下げのサイクルを、決めたルールで何週も回す', cost: { mind: 60, info: 30 }, stage: 2, icon: I('resurrection.png') },
  { id: 'out_ship', route: 'system', parent: 'price_tool', depth: 3, lane: 0, kind: 'perk', name: '外注：梱包・発送', desc: '発送の体力消費がゼロに（1件400円）', cost: { social: 60, act: 40 }, stage: 3, icon: E(2125) },
  { id: 'warehouse2', route: 'system', parent: 'warehouse', depth: 3, lane: -1, kind: 'perk', name: '物流倉庫', desc: '在庫スペース+300（月額8万円）', cost: { act: 80, social: 40 }, stage: 4, monthly: 80000, icon: E(5058) },
  { id: 'rec_post', route: 'system', parent: 'sy_pack', depth: 4, lane: 1, kind: 'record', name: '発送の達人', desc: '発送の体力消費-15%', record: { key: 'selfShipped', target: 200, label: '自分で発送した件数' }, icon: I('phy.png') },
  { id: 'out_list', route: 'system', parent: 'out_ship', depth: 4, lane: 0, kind: 'perk', name: '外注：撮影・出品', desc: '仕入れた商品を毎週自動で相場価格で出品（月額4万円）', cost: { social: 60, tech: 40 }, stage: 3, monthly: 40000, need: { list: 40 }, icon: E(1126) },
  { id: 'src_wholesale', route: 'system', parent: 'warehouse2', depth: 4, lane: -1, kind: 'unlock', name: '問屋・メーカー直取引', desc: '「問屋と商談」が解放。定番品をまとめて卸値で仕入れる', cost: { social: 160, info: 100 }, stage: 4, need: { talk: 60 }, icon: E(1058) },
  { id: 'out_buy', route: 'system', parent: 'out_list', depth: 5, lane: 0, kind: 'perk', name: '外注：リサーチ・仕入れ', desc: '仕入れ候補から利益率15%以上のものを自動で仕入れる（月額12万円）', cost: { social: 100, info: 80 }, stage: 4, monthly: 120000, icon: I('buf_int.png') },
  { id: 'div_buyback', route: 'system', parent: 'src_wholesale', depth: 5, lane: -1, kind: 'perk', name: '買取事業', desc: '店舗を構えて買い取る側へ。毎月、在庫規模に応じた利益', cost: { social: 150, act: 100 }, stage: 5, icon: E(5111) },
  { id: 'sy_pack', route: 'system', parent: 'routine', depth: 3, lane: 1, kind: 'repeat', max: 5, name: '梱包の手際', desc: '基礎能力「梱包」+3（レベルごと）', cost: { act: 20, tech: 10 }, grant: { abilities: { pack: 3 } }, icon: I('phy.png') },
  { id: 'sy_space', route: 'system', parent: 'out_list', depth: 5, lane: 1, kind: 'repeat', max: 3, name: '整理整頓', desc: '在庫スペース+10（レベルごと）', cost: { act: 25, mind: 10 }, perLv: [{ key: 'capacityAdd', add: 10 }], icon: E(1075) },
  { id: 'cap_system', route: 'system', parent: 'out_buy', depth: 6, lane: 0, kind: 'capstone', name: '物流センター', desc: 'ツール・外注・倉庫の月額-40%、外注の発送料半額、在庫スペース+100', cost: { social: 150, act: 100 }, need: { pack: 60 }, icon: I('mch_icon.png') },

  // ---- 人脈・発信 ----
  { id: 'net_meetup', route: 'network', parent: 'src_home', depth: 1, lane: 0, kind: 'unlock', name: '物販仲間', desc: '「物販交流会」が解放。情報交換と偉人との出会い', cost: { social: 40 }, gate: [{ flag: 'tutorialDone', label: 'チュートリアルを終える' }, { key: 'soldUnits', target: 12, label: '累計の販売数' }], icon: H(4008) },
  { id: 'quick_reply', route: 'network', parent: 'net_meetup', depth: 2, lane: 0, kind: 'perk', name: '即レス', desc: '評価が上がりやすく、トラブルが少し減る', cost: { social: 35, mind: 15 }, icon: I('buf_agi.png') },
  { id: 'profile', route: 'network', parent: 'net_meetup', depth: 2, lane: -1, kind: 'perk', name: 'プロフ必読', desc: '取引トラブルが30%減る', cost: { info: 20, social: 30 }, icon: E(1003) },
  { id: 'tenka', route: 'network', parent: 'net_meetup', depth: 2, lane: 1, kind: 'gold', hero: 'nobunaga', name: '天下布武', desc: '楽市楽座の精神。販売手数料-3%、仕入れ候補+1', cost: { social: 70, act: 70 }, icon: H(5001) },
  { id: 'iron_mental', route: 'network', parent: 'quick_reply', depth: 3, lane: 0, kind: 'perk', name: '鋼のメンタル', desc: 'やる気が下がる出来事を半分の確率で受け流す', cost: { mind: 60 }, icon: I('buf_phy.png') },
  { id: 'tonchi', route: 'network', parent: 'profile', depth: 3, lane: -1, kind: 'gold', hero: 'ikkyu', name: 'このはし渡るべからず', desc: 'トラブル対応の判定が大幅に有利になる', cost: { social: 80, mind: 40 }, icon: H(2029) },
  { id: 'rec_network', route: 'network', parent: 'tenka', depth: 3, lane: 1, kind: 'record', name: 'クレーム慣れ', desc: '取引トラブル-10%', record: { key: 'troubles', target: 10, label: '乗り越えた取引トラブル' }, icon: 'assets/enemies/101.png' },
  { id: 'ne_talk', route: 'network', parent: 'iron_mental', depth: 4, lane: -1, kind: 'repeat', max: 5, name: '交渉術', desc: '基礎能力「交渉」+3（レベルごと）', cost: { social: 20, mind: 10 }, grant: { abilities: { talk: 3 } }, icon: I('cp.png') },
  { id: 'ne_manner', route: 'network', parent: 'ne_talk', depth: 5, lane: -1, kind: 'repeat', max: 3, name: '丁寧な取引', desc: '取引トラブル-5%（レベルごと）', cost: { social: 30, mind: 15 }, perLv: [{ key: 'trouble', mul: 0.95 }], icon: I('resurrection.png') },
  { id: 'cap_network', route: 'network', parent: 'iron_mental', depth: 4, lane: 0, kind: 'capstone', name: '業界の顔', desc: '取引トラブル半減、交渉判定+20%', cost: { social: 150, mind: 80 }, need: { talk: 60 }, icon: H(5008) },
  { id: 'div_consult', route: 'network', parent: 'rec_network', depth: 4, lane: 1, kind: 'perk', name: '情報発信・コンサル', desc: '経験を売る。毎月安定した収入。ただし炎上しやすい', cost: { social: 120, info: 100 }, stage: 5, icon: H(3008) },

  // ---- 経営 ----
  { id: 'eye_calc', route: 'manage', parent: 'src_home', depth: 1, lane: 0, kind: 'starter', name: '利益計算', desc: '仕入れ・出品の画面に「手数料と送料を引いた見込み利益」が出る', cost: { info: 10 }, gate: [{ flag: 'tutorialDone', label: 'チュートリアルを終える' }], icon: I('gum.png') },
  { id: 'kpi_mid', route: 'manage', parent: 'eye_calc', depth: 2, lane: 0, kind: 'unlock', name: '利益率と回転', desc: '経営画面に利益率・回転日数・滞留在庫が出る', cost: { info: 40, mind: 20 }, icon: I('int.png') },
  { id: 'cashflow', route: 'manage', parent: 'eye_calc', depth: 2, lane: -1, kind: 'unlock', stage: 2, name: '資金繰り表', desc: '月末の支払いを先読みして現金を回す。カードの利用枠+30万円、税額-5%', cost: { info: 50, mind: 20 }, icon: I('buf_int.png') },
  { id: 'rec_manage', route: 'manage', parent: 'ma_learn', depth: 3, lane: 1, kind: 'record', name: '決算の勘', desc: '獲得する経験点+10%', record: { key: 'netTotal', target: 3000000, label: '累計の純利益（円）' }, icon: I('emblem.webp') },
  { id: 'kpi_pro', route: 'manage', parent: 'kpi_mid', depth: 3, lane: 0, kind: 'unlock', name: '資金効率と時間単価', desc: '経営画面にROI・時間単価・90日超在庫・損切り率が出る', cost: { info: 80, mind: 40 }, stage: 3, icon: I('ce.png') },
  { id: 'ledger', route: 'manage', parent: 'kpi_mid', depth: 3, lane: -1, kind: 'gold', hero: 'mitsunari', name: '大一大万大吉', desc: '帳簿が完璧。確定申告の税額-30%、カード払いがリボにならない', cost: { info: 60, mind: 60 }, icon: H(2012) },
  { id: 'ma_learn', route: 'manage', parent: 'eye_calc', depth: 2, lane: 1, kind: 'repeat', max: 5, name: '学びの習慣', desc: '獲得する経験点+4%（レベルごと）', cost: { info: 20, mind: 15 }, perLv: [{ key: 'expGain', mul: 1.04 }], icon: E(1016) },
  { id: 'ma_tax', route: 'manage', parent: 'kpi_pro', depth: 4, lane: -1, kind: 'repeat', max: 3, name: '節税の知恵', desc: '税額-3%（レベルごと）', cost: { info: 40, mind: 20 }, perLv: [{ key: 'taxMult', mul: 0.97 }], icon: I('gum.png') },
  { id: 'cap_manage', route: 'manage', parent: 'kpi_pro', depth: 4, lane: 0, kind: 'capstone', name: '経営者の眼', desc: '税額-15%、カードの利用枠+100万円、獲得する経験点+10%', cost: { info: 150, mind: 60 }, need: { talk: 50 }, icon: E(4016) },
  { id: 'div_brand', route: 'manage', parent: 'kpi_pro', depth: 4, lane: 1, kind: 'perk', name: '自社ブランド', desc: 'せどりで掴んだ売れ筋をもとにOEM商品を作る。毎月、評価に応じた利益', cost: { info: 150, tech: 80 }, stage: 4, icon: E(3112) },

  // ---- 不調（マイナス。ツリーには出さない） ----
  { id: 'optimist', route: null, kind: 'red', name: '楽観主義', desc: '相場を1割高く見積もってしまう', cost: { mind: 30 } },
  { id: 'tendon', route: null, kind: 'red', name: '腱鞘炎', desc: '発送の体力消費が1.5倍', cost: { act: 20, mind: 20 } },
  { id: 'backpain', route: null, kind: 'red', name: '腰痛', desc: '店舗巡りの体力消費が1.3倍', cost: { act: 30, mind: 20 } },
  { id: 'insomnia', route: null, kind: 'red', name: '寝不足', desc: '休んでも体力が戻りにくい', cost: { mind: 30 } },
  { id: 'burned', route: null, kind: 'red', name: '炎上体質', desc: '炎上度が上がりやすい', cost: { social: 30, mind: 20 } },
];

export const SKILL_MAP = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const INITIAL_SKILLS = SKILLS.filter((s) => s.kind === 'initial').map((s) => s.id);
// 画面に出すノード（中心＋ルート上のもの）
export const TREE_NODES = SKILLS.filter((s) => s.kind === 'root' || s.route);

// 画面上の座標（1 = 1マス）。中心から各ルートの角度方向に段数ぶん伸ばし、lane で横にずらす
const RING = 1.7;
const STEP = 1.6;
const LANE = 0.98;
export function nodePos(sk) {
  if (sk.kind === 'root') return { x: 0, y: 0 };
  const a = (ROUTE_MAP[sk.route].angle * Math.PI) / 180;
  const r = RING + (sk.depth - 1) * STEP;
  const px = -Math.sin(a);
  const py = Math.cos(a);
  return { x: Math.cos(a) * r + px * sk.lane * LANE, y: Math.sin(a) * r + py * sk.lane * LANE };
}
