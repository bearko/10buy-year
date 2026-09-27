// 転売屋スキルツリー。活動で貯めた経験点を使ってノードを解放していく。
//
// branch: src（仕入れ先）/ ch（販路）/ eye（目利き）/ talk（対人）/ ops（作業・仕組み化）/ biz（経営）/ red（不調）
// kind:
//   initial  最初から持っている
//   unlock   新しい行動・販路・画面が使えるようになる
//   perk     常時効果
//   repeat   何度も強化できる（max まで。コストはレベルごとに増える）
//   gold     偉人のイベントで「コツ」をもらわないと解放できない
//   red      マイナス（イベントで付く。経験点で治す）
// req: 前提ノード / stage: 必要なキャリアステージ / flag: 必要なフラグ（古物商許可など）
// monthly: 維持費（毎月末に経費として引かれる）

export const BRANCHES = [
  { id: 'src', name: '仕入れ先', ability: 'buy' },
  { id: 'ch', name: '販路', ability: 'list' },
  { id: 'eye', name: '目利き', ability: 'eye' },
  { id: 'talk', name: '対人', ability: 'talk' },
  { id: 'ops', name: '作業・仕組み化', ability: 'pack' },
  { id: 'biz', name: '経営', ability: null },
];

export const SKILLS = [
  // ---- 仕入れ先 ----
  { id: 'src_home', branch: 'src', kind: 'initial', name: '家の中を探す', desc: '押し入れやクローゼットから売れそうな不用品を探す' },
  { id: 'src_store', branch: 'src', kind: 'unlock', name: '近所の店のワゴン', desc: '「店舗せどり」が解放。量販店やドラッグストアの値引き品を仕入れる', cost: { act: 10 } },
  { id: 'bargain', branch: 'src', kind: 'perk', name: '値切り上手', desc: '店舗仕入れの価格がさらに5%安くなる', cost: { social: 40, act: 10 }, req: ['src_store'] },
  { id: 'src_online', branch: 'src', kind: 'unlock', name: 'ポイント通販', desc: '「電脳せどり」が解放。ポイント還元を利益に変える', cost: { info: 20 }, req: ['src_store'] },
  { id: 'poikatsu', branch: 'src', kind: 'perk', name: 'ポイ活の鬼', desc: '電脳のポイント還元+40%、カード還元が2%に', cost: { info: 40, tech: 10 }, req: ['src_online'] },
  { id: 'src_lottery', branch: 'src', kind: 'unlock', name: '抽選・予約', desc: '「抽選に応募」と、電脳せどりでの予約・在庫復活が解放', cost: { info: 25, mind: 15 }, req: ['src_online'] },
  { id: 'lottery_nose', branch: 'src', kind: 'perk', name: '限定の嗅覚', desc: '抽選の当選率が1.3倍', cost: { info: 35, mind: 25 }, req: ['src_lottery'] },
  { id: 'src_queue', branch: 'src', kind: 'unlock', name: '行列に並ぶ', desc: '「行列に並ぶ」が解放。発売日・再販日に早朝から並ぶ', cost: { act: 30, mind: 20 }, req: ['src_store'] },
  { id: 'early_bird', branch: 'src', kind: 'perk', name: '早起き', desc: '行列の成功率が大きく上がる', cost: { act: 40, mind: 20 }, req: ['src_queue'] },
  { id: 'license', branch: 'src', kind: 'unlock', name: '古物商許可の取り方', desc: '「古物商許可を申請」が解放。中古を仕入れて売るなら必須', cost: { info: 15 }, req: ['src_store'] },
  { id: 'src_used', branch: 'src', kind: 'unlock', name: 'リサイクルショップ・古本', desc: '店舗せどりで中古品・古本が仕入れられる（古物商許可が必要）', cost: { act: 20, info: 10 }, req: ['license'], flag: 'license' },
  { id: 'src_flea', branch: 'src', kind: 'unlock', name: 'フリマ仕入れ', desc: '電脳せどりで、フリマの相場より安い出品を仕入れられる', cost: { info: 35, tech: 10 }, req: ['src_used', 'src_online'] },
  { id: 'src_auction', branch: 'src', kind: 'unlock', name: '業者オークション', desc: '「業者オークション」が解放。古物商だけが入れる市場。真贋リスクが低い（会費 月1万円）', cost: { info: 80, social: 40 }, req: ['src_used'], stage: 3, monthly: 10000 },
  { id: 'src_wholesale', branch: 'src', kind: 'unlock', name: '問屋・メーカー直取引', desc: '「問屋と商談」が解放。定番品をまとめて卸値で仕入れる', cost: { social: 120, info: 80 }, req: ['src_online'], stage: 4 },
  { id: 'ino_map', branch: 'src', kind: 'gold', hero: 'ino', name: '大日本沿海輿地全図', desc: '店舗仕入れの候補+2、店舗巡りの体力消費-30%', cost: { act: 90, info: 40 }, req: ['src_store'] },

  // ---- 販路 ----
  { id: 'ch_punsea', branch: 'ch', kind: 'initial', name: 'プンシー', desc: 'フリマ。手数料10%。値付け次第ですぐ売れるが、値下げ交渉とトラブルが多い' },
  { id: 'ch_miime', branch: 'ch', kind: 'unlock', name: 'ミィーム', desc: 'オークション。手数料10%。コレクター品は競り上がりやすい', cost: { tech: 15, info: 10 } },
  { id: 'photogenic', branch: 'ch', kind: 'perk', name: '写真映え', desc: '少し高めの値付けでも売れやすくなる', cost: { tech: 45, info: 15 } },
  { id: 'slots', branch: 'ch', kind: 'repeat', max: 5, name: '出品枠の拡張', desc: '同時に出品できる数が+3（レベルごと）', cost: { tech: 20, info: 10 } },
  { id: 'ch_amacri', branch: 'ch', kind: 'unlock', name: 'アマクリ', desc: '大手EC・倉庫委託。手数料15%＋納品料。新品がよく売れ、発送の手間がない（月額4,900円）', cost: { tech: 60, info: 40 }, req: ['ch_miime'], stage: 2, monthly: 4900 },
  { id: 'ch_shops', branch: 'ch', kind: 'perk', name: 'プンシーShops', desc: '事業者向けショップに移行。プンシーの買い手1.3倍、出品枠+5', cost: { tech: 50, social: 30 }, stage: 3 },
  { id: 'doyou', branch: 'ch', kind: 'gold', hero: 'gennai', name: '土用の丑の日', desc: 'コピー一発で売れ行きが激変。高値でも売れやすい', cost: { tech: 90, info: 40 } },
  { id: 'tenka', branch: 'ch', kind: 'gold', hero: 'nobunaga', name: '天下布武', desc: '楽市楽座の精神。販売手数料-3%、仕入れ候補+1', cost: { social: 70, act: 70 } },

  // ---- 目利き ----
  { id: 'eye_calc', branch: 'eye', kind: 'unlock', name: '利益計算', desc: '仕入れ・出品の画面に「手数料と送料を引いた見込み利益」が出る', cost: { info: 10 } },
  { id: 'eye_market', branch: 'eye', kind: 'unlock', name: '相場チェック', desc: '「相場」画面が解放。売り切れ価格を調べる習慣で、推定相場の誤差が25%減る', cost: { info: 15 } },
  { id: 'eye_fake', branch: 'eye', kind: 'perk', name: '真贋の知識', desc: '偽物が混じっていそうな仕入れ候補に気づきやすくなる', cost: { info: 40, mind: 20 }, req: ['eye_market'] },
  { id: 'serial_memo', branch: 'eye', kind: 'perk', name: 'シリアル控え', desc: '発送前に写真とシリアルを記録。すり替え詐欺を撃退できる', cost: { tech: 25, info: 25 }, req: ['eye_fake'] },
  { id: 'eye_ai', branch: 'eye', kind: 'perk', name: 'AIリサーチツール', desc: '在庫切れ商品の逆引きなど。仕入れ候補+2、推定誤差-30%（月額9,800円）', cost: { info: 60, tech: 30 }, req: ['eye_market'], stage: 3, monthly: 9800 },
  { id: 'crowd_madness', branch: 'eye', kind: 'gold', hero: 'newton', name: '群衆の狂気', desc: '相場推定の誤差が半分に。ブームの天井を察知できる', cost: { info: 80, mind: 50 } },

  // ---- 対人 ----
  { id: 'net_meetup', branch: 'talk', kind: 'unlock', name: '物販仲間', desc: '「物販交流会」が解放。情報交換と偉人との出会い', cost: { social: 15 } },
  { id: 'profile', branch: 'talk', kind: 'perk', name: 'プロフ必読', desc: '取引トラブルが30%減る', cost: { info: 20, social: 30 } },
  { id: 'quick_reply', branch: 'talk', kind: 'perk', name: '即レス', desc: '評価が上がりやすく、トラブルが少し減る', cost: { social: 35, mind: 15 } },
  { id: 'iron_mental', branch: 'talk', kind: 'perk', name: '鋼のメンタル', desc: 'やる気が下がる出来事を半分の確率で受け流す', cost: { mind: 60 } },
  { id: 'tonchi', branch: 'talk', kind: 'gold', hero: 'ikkyu', name: 'このはし渡るべからず', desc: 'トラブル対応の判定が大幅に有利になる', cost: { social: 80, mind: 40 } },

  // ---- 作業・仕組み化 ----
  { id: 'pack_master', branch: 'ops', kind: 'perk', name: '梱包職人', desc: '発送の体力消費が半分になり、配送破損がなくなる', cost: { tech: 30, act: 30 } },
  { id: 'warehouse', branch: 'ops', kind: 'perk', name: 'レンタル倉庫', desc: '在庫スペース+60（月額2万円）', cost: { act: 40, info: 20 }, stage: 2, monthly: 20000 },
  { id: 'price_tool', branch: 'ops', kind: 'perk', name: '価格改定ツール', desc: '売れ残った出品を毎週自動で値下げ・相場に追従させる（月額5,000円）', cost: { tech: 40, info: 30 }, stage: 2, monthly: 5000 },
  { id: 'routine', branch: 'ops', kind: 'unlock', name: 'ルーティン化', desc: '同じ行動を4週まとめて進める「オート」が解放', cost: { mind: 40, info: 20 }, stage: 2 },
  { id: 'out_ship', branch: 'ops', kind: 'perk', name: '外注：梱包・発送', desc: '発送の体力消費がゼロに（1件400円）', cost: { social: 60, act: 40 }, stage: 3 },
  { id: 'out_list', branch: 'ops', kind: 'perk', name: '外注：撮影・出品', desc: '仕入れた商品を毎週自動で相場価格で出品（月額4万円）', cost: { social: 60, tech: 40 }, stage: 3, monthly: 40000 },
  { id: 'out_buy', branch: 'ops', kind: 'perk', name: '外注：リサーチ・仕入れ', desc: '仕入れ候補から利益率15%以上のものを自動で仕入れる（月額12万円）', cost: { social: 100, info: 80 }, req: ['out_list'], stage: 4, monthly: 120000 },
  { id: 'warehouse2', branch: 'ops', kind: 'perk', name: '物流倉庫', desc: '在庫スペース+300（月額8万円）', cost: { act: 80, social: 40 }, req: ['warehouse'], stage: 4, monthly: 80000 },

  // ---- 経営 ----
  { id: 'kpi_basic', branch: 'biz', kind: 'initial', name: '帳簿', desc: '売上・利益・販売個数を記録する' },
  { id: 'kpi_mid', branch: 'biz', kind: 'unlock', name: '利益率と回転', desc: '経営画面に利益率・回転日数・滞留在庫が出る', cost: { info: 40, mind: 20 } },
  { id: 'kpi_pro', branch: 'biz', kind: 'unlock', name: '資金効率と時間単価', desc: '経営画面にROI・時間単価・キャッシュフロー・損切り率が出る', cost: { info: 80, mind: 40 }, req: ['kpi_mid'], stage: 3 },
  { id: 'ledger', branch: 'biz', kind: 'gold', hero: 'mitsunari', name: '大一大万大吉', desc: '帳簿が完璧。確定申告の税額-30%、カード払いがリボにならない', cost: { info: 60, mind: 60 } },
  { id: 'div_brand', branch: 'biz', kind: 'perk', name: '自社ブランド', desc: 'せどりで掴んだ売れ筋をもとにOEM商品を作る。毎月、評価に応じた利益', cost: { info: 150, tech: 150 }, stage: 5 },
  { id: 'div_buyback', branch: 'biz', kind: 'perk', name: '買取事業', desc: '店舗を構えて買い取る側へ。毎月、在庫規模に応じた利益', cost: { social: 150, act: 100 }, stage: 5 },
  { id: 'div_consult', branch: 'biz', kind: 'perk', name: '情報発信・コンサル', desc: '経験を売る。毎月安定した収入。ただし炎上しやすい', cost: { social: 120, info: 100 }, stage: 5 },

  // ---- 不調（マイナス） ----
  { id: 'optimist', branch: 'red', kind: 'red', name: '楽観主義', desc: '相場を1割高く見積もってしまう', cost: { mind: 30 } },
  { id: 'tendon', branch: 'red', kind: 'red', name: '腱鞘炎', desc: '発送の体力消費が1.5倍', cost: { act: 20, mind: 20 } },
  { id: 'backpain', branch: 'red', kind: 'red', name: '腰痛', desc: '店舗巡りの体力消費が1.3倍', cost: { act: 30, mind: 20 } },
  { id: 'insomnia', branch: 'red', kind: 'red', name: '寝不足', desc: '休んでも体力が戻りにくい', cost: { mind: 30 } },
  { id: 'burned', branch: 'red', kind: 'red', name: '炎上体質', desc: '炎上度が上がりやすい', cost: { social: 30, mind: 20 } },
];

export const SKILL_MAP = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
export const INITIAL_SKILLS = SKILLS.filter((s) => s.kind === 'initial').map((s) => s.id);
