import { weekAt, YEAR_WEEKS } from '../engine/calendar.js';

// 商品マスタ。画像はマイクリのエクステンション（ext = エクステンションID）。
// 名前はエクステンション名そのままに、「現実の転売ジャンル」を genre として割り当てている。
//
// kind（相場の動き方）
//   staple     定番品。相場は定価の少し下で安定。値引き・ポイントで利ざやを取る
//   hype       新作限定品。発売直後がピークで、時間とともに下がる。再販で暴落する
//   collect    絶版・ヴィンテージ。ゆっくり値上がりするが買い手が少ない
//   seasonal   季節もの。ピークの週を過ぎると一気に値崩れする
//   perishable 限定スイーツ。催事の週にしか手に入らず、賞味期限がある
//   boom       謎のブーム。突然バズって暴騰し、ある日突然終わる
//   luxury     高級品。正規店でまれに定価で買える
//   home       家にある不用品。仕入れはできず「家の中を探す」で見つかる（自分の物なので許可不要）
// size: S/M/L（送料・梱包の手間・部屋の占有スペースに影響）
// used: true の商品は中古でしか流通しない（仕入れには古物商許可が必要）
// fakeRisk: 怪しいルートで仕入れたときに偽物をつかむ基本確率

// ---- シリーズの世代交代 ----
// 同じ系統のエクステンション（レアリティ違い）を世代に見立てる。2年ごとに新世代が出て、前の世代は型落ち（相場が下がり、買い手が減る）
const W = (year, month, nth) => (year - 1) * YEAR_WEEKS + weekAt(month, nth);
export const SERIES = [
  {
    id: 'golem', genre: '家庭用ロボット', type: 107, size: 'M', demand: 2.2,
    gens: [
      { name: 'ゴーレムくん', retail: 19800, launch: 0 },
      { name: 'ゴーレムくん2', retail: 24800, launch: W(3, 10, 1) },
      { name: 'ゴーレムくん3', retail: 29800, launch: W(5, 10, 1) },
      { name: 'ゴーレムくん4', retail: 39800, launch: W(7, 10, 1) },
      { name: 'ゴーレムくん5 ゴールド', retail: 49800, launch: W(9, 10, 1) },
    ],
  },
  {
    id: 'organ', genre: '電子キーボード', type: 68, size: 'L', demand: 1.6,
    gens: [
      { name: 'オルガネット', retail: 15800, launch: 0 },
      { name: 'オルガネット II', retail: 19800, launch: W(2, 4, 2) },
      { name: 'オルガネット III', retail: 24800, launch: W(4, 4, 2) },
      { name: 'オルガネット IV', retail: 29800, launch: W(6, 4, 2) },
      { name: 'オルガネット V', retail: 36800, launch: W(8, 4, 2) },
    ],
  },
];
function seriesProducts(sr) {
  return sr.gens.map((g, i) => ({
    id: `${sr.id}${i + 1}`, name: g.name, genre: sr.genre, ext: (i + 1) * 1000 + sr.type, kind: 'staple', retail: g.retail, size: sr.size, demand: sr.demand, base: 1.03, fakeRisk: 0.05,
    series: sr.id, gen: i + 1, launch: g.launch, retire: sr.gens[i + 1]?.launch ?? null,
  }));
}

export const PRODUCTS = [
  { id: 'old_hat', name: 'ハット', genre: '着なくなった帽子', ext: 1059, kind: 'home', retail: 2400, size: 'M', demand: 1.3, base: 1.0, used: true, fakeRisk: 0 },
  { id: 'gift_glass', name: 'グラス', genre: '引き出物のグラス', ext: 1075, kind: 'home', retail: 3000, size: 'M', demand: 1.2, base: 1.0, used: true, fakeRisk: 0 },
  { id: 'old_figure', name: 'モンシロちゃん', genre: '昔集めたフィギュア', ext: 1112, kind: 'home', retail: 5200, size: 'S', demand: 1.1, base: 1.0, used: true, fakeRisk: 0 },
  { id: 'fountain_pen', name: 'ノービスペン', genre: 'もらいものの万年筆', ext: 1003, kind: 'home', retail: 7800, size: 'S', demand: 0.9, base: 1.0, used: true, fakeRisk: 0 },
  { id: 'old_violin', name: 'ヴァイオリン', genre: '子どもの頃のヴァイオリン', ext: 1069, kind: 'home', retail: 14000, size: 'L', demand: 0.6, base: 1.0, used: true, fakeRisk: 0 },

  { id: 'boots', name: 'ブーツ', genre: '定番スニーカー', ext: 1031, kind: 'staple', retail: 12000, size: 'M', demand: 3.0, base: 1.05, fakeRisk: 0.2 },
  { id: 'pocket_watch', name: '懐中時計', genre: '定番ウォッチ', ext: 1111, kind: 'staple', retail: 26000, size: 'S', demand: 1.8, base: 0.98, fakeRisk: 0.3 },
  { id: 'sake', name: 'サケ', genre: '地酒', ext: 1058, kind: 'staple', retail: 3300, size: 'M', demand: 2.0, base: 1.0, alcohol: true, fakeRisk: 0 },
  { id: 'scroll', name: 'スクロール', genre: 'トレカBOX（定番）', ext: 1016, kind: 'staple', retail: 5500, size: 'S', demand: 3.4, base: 1.1, fakeRisk: 0.15 },
  { id: 'packs', name: 'スクロール・パック', genre: 'トレカのバラパック（10パック束）', ext: 14016, kind: 'staple', retail: 2200, size: 'S', demand: 2.8, base: 1.0, fakeRisk: 0.5, fakeNote: 'サーチ済みパック', searchable: true },
  { id: 'novice_book', name: 'ノービスブック', genre: '古本', ext: 1008, kind: 'collect', retail: 900, size: 'S', demand: 2.6, base: 1.0, drift: 0, used: true, fakeRisk: 0 },

  { id: 'heiho', name: '兵法書', genre: '人気トレカ新弾BOX', ext: 4016, kind: 'hype', rep: 17016, retail: 5500, size: 'S', demand: 3.2, release: weekAt(4, 3), peak: 3.0, floor: 1.7, decay: 0.09, restock: 0.07, odds: 0.3, fakeRisk: 0.35, fakeNote: '再シュリンク品' },
  { id: 'western_boots', name: '大西部のブーツ', genre: 'コラボスニーカー', ext: 4031, kind: 'hype', rep: 17031, retail: 22000, size: 'M', demand: 2.6, release: weekAt(5, 2), peak: 2.4, floor: 1.4, decay: 0.07, restock: 0.04, odds: 0.2, fakeRisk: 0.45 },
  { id: 'sylph', name: 'シルフ', genre: '限定フィギュア', ext: 3112, kind: 'hype', rep: 17112, retail: 9800, size: 'M', demand: 2.4, release: weekAt(7, 1), peak: 2.2, floor: 1.3, decay: 0.07, restock: 0.05, odds: 0.22, fakeRisk: 0.3 },
  { id: 'golden_boots', name: 'コボルドの黄金ブーツ', genre: '超限定スニーカー', ext: 5531, kind: 'hype', rep: 16031, retail: 38000, size: 'M', demand: 2.0, release: weekAt(9, 1), peak: 3.2, floor: 1.8, decay: 0.08, restock: 0.02, odds: 0.08, fakeRisk: 0.55 },
  { id: 'nectar', name: 'ネクタール', genre: 'プレミアウイスキー', ext: 5058, kind: 'hype', rep: 17058, retail: 11000, size: 'M', demand: 1.6, release: weekAt(10, 2), peak: 3.6, floor: 3.0, decay: 0.05, restock: 0.01, odds: 0.15, alcohol: true, fakeRisk: 0.25 },
  { id: 'photon', name: 'フォトングラス', genre: '新型VRゲーム機', ext: 5075, kind: 'hype', rep: 17075, retail: 49980, size: 'M', demand: 3.0, release: weekAt(11, 4), peak: 1.8, floor: 1.2, decay: 0.06, restock: 0.12, odds: 0.12, fakeRisk: 0.1 },

  { id: 'tsumi', name: '罪と罰', genre: '絶版本', ext: 4008, kind: 'collect', retail: 9000, size: 'S', demand: 0.7, base: 1.0, drift: 0.006, used: true, fakeRisk: 0 },
  { id: 'taito', name: '大唐西域記', genre: '絶版トレカBOX', ext: 5016, kind: 'collect', retail: 58000, size: 'S', demand: 0.6, base: 1.0, drift: 0.015, used: true, fakeRisk: 0.4, fakeNote: 'シュリンク偽装' },
  { id: 'violin', name: 'イル・カノーネ', genre: 'ヴィンテージ楽器', ext: 4069, kind: 'collect', retail: 180000, size: 'L', demand: 0.35, base: 1.0, drift: 0.004, used: true, fakeRisk: 0.35 },
  { id: 'jewel', name: 'マリーアントワネット・ブルー', genre: 'ブランドジュエリー', ext: 5509, kind: 'collect', retail: 320000, size: 'S', demand: 0.4, base: 1.0, drift: 0.003, used: true, fakeRisk: 0.5 },

  { id: 'winter', name: '冬の甘えんぼ王子ウィンター', genre: 'クリスマス限定ぬいぐるみ', ext: 1126, kind: 'seasonal', retail: 4400, size: 'M', demand: 2.4, release: weekAt(11, 1), peakWeek: weekAt(12, 3), peak: 2.6, base: 1.0, after: 0.45, fakeRisk: 0.2 },
  { id: 'hina', name: '雛人形', genre: '雛人形', ext: 5127, kind: 'seasonal', retail: 48000, size: 'L', demand: 1.2, release: weekAt(1, 2), peakWeek: weekAt(2, 4), peak: 1.35, base: 0.95, after: 0.4, fakeRisk: 0 },
  // 季節の商戦（発売から山の週まで上がり、山を越えると一気に値崩れする）
  { id: 'may_doll', name: '諏訪法性兜', genre: '五月人形（兜飾り）', ext: 4018, kind: 'seasonal', retail: 39800, size: 'L', demand: 1.1, release: weekAt(4, 1), peakWeek: weekAt(4, 4), peak: 1.3, base: 0.95, after: 0.45, fakeRisk: 0 },
  { id: 'mothers', name: 'ウィズダムネックレス', genre: '母の日の限定ネックレス', ext: 3017, kind: 'seasonal', retail: 8800, size: 'S', demand: 2.0, release: weekAt(4, 2), peakWeek: weekAt(5, 2), peak: 1.6, base: 1.0, after: 0.5, fakeRisk: 0.1 },
  { id: 'chugen', name: 'エリートギョク', genre: 'お中元のゼリー詰め合わせ', ext: 2098, kind: 'seasonal', retail: 5400, size: 'M', demand: 1.8, release: weekAt(6, 3), peakWeek: weekAt(7, 2), peak: 1.4, base: 1.0, after: 0.4, fakeRisk: 0 },
  { id: 'cooler', name: 'エリートリング', genre: 'ネッククーラー（冷感グッズ）', ext: 2009, kind: 'seasonal', retail: 2980, size: 'S', demand: 3.0, release: weekAt(5, 4), peakWeek: weekAt(7, 4), peak: 1.7, base: 1.0, after: 0.5, fakeRisk: 0.15 },
  { id: 'halloween', name: 'ブレイブヨロイ', genre: 'ハロウィンのコスプレ衣装', ext: 3081, kind: 'seasonal', retail: 5980, size: 'M', demand: 2.2, release: weekAt(9, 2), peakWeek: weekAt(10, 4), peak: 1.5, base: 1.0, after: 0.3, fakeRisk: 0.1 },
  { id: 'akahon', name: 'ウィズダムリソグラフィー', genre: '大学入試の過去問（赤本）', ext: 3050, kind: 'seasonal', retail: 2600, size: 'S', demand: 2.2, release: weekAt(7, 1), peakWeek: weekAt(12, 2), peak: 1.4, base: 1.0, after: 0.2, fakeRisk: 0 },
  { id: 'newlife', name: 'エリートリソグラフィー', genre: '新生活の小型家電', ext: 2050, kind: 'seasonal', retail: 19800, size: 'L', demand: 1.6, release: weekAt(2, 1), peakWeek: weekAt(3, 4), peak: 1.25, base: 0.95, after: 0.75, fakeRisk: 0 },

  { id: 'choux', name: 'とっておきのシュークリーム', genre: '催事限定スイーツ', ext: 3055, kind: 'perishable', retail: 2800, size: 'S', demand: 2.8, eventWeeks: [weekAt(6, 2), weekAt(10, 3), weekAt(2, 2)], premium: 1.9, shelf: 1, fakeRisk: 0 },

  { id: 'kaeru', name: 'カエルキッズ', genre: 'ブラインドボックスぬいぐるみ', ext: 2125, kind: 'boom', retail: 3500, size: 'S', demand: 3.4, boomFrom: 10, boomTo: 20, peak: 6.0, base: 0.9, fakeRisk: 0.6, fakeNote: 'パチモン「ケロキッズ」' },

  // ---- ステージ3以降の新ジャンル（know：そのジャンルの知識＝目利き講座が必要）----
  { id: 'art_print', name: '神絵師の筆パレ', genre: '人気作家の版画', ext: 3104, kind: 'collect', retail: 120000, size: 'M', demand: 0.5, base: 1.0, drift: 0.005, used: true, fakeRisk: 0.4, know: 'art', stage: 3 },
  { id: 'retro_pc', name: 'APC1984', genre: 'レトロPC', ext: 4159, kind: 'collect', retail: 80000, size: 'M', demand: 0.7, base: 1.0, drift: 0.006, used: true, fakeRisk: 0.15, know: 'game', stage: 3 },
  { id: 'rocking', name: 'ロッキングチェア', genre: 'アンティーク家具', ext: 3170, kind: 'collect', retail: 150000, size: 'L', demand: 0.4, base: 1.0, drift: 0.004, used: true, fakeRisk: 0.2, know: 'antique', stage: 3 },
  { id: 'harp_box', name: 'ハープを弾く貴婦人', genre: 'アンティークオルゴール', ext: 4165, kind: 'collect', retail: 90000, size: 'M', demand: 0.5, base: 1.0, drift: 0.005, used: true, fakeRisk: 0.25, know: 'antique', stage: 3 },
  { id: 'lacquer', name: '華やか二段重箱', genre: '輪島塗の重箱', ext: 4142, kind: 'collect', retail: 60000, size: 'M', demand: 0.6, base: 1.0, drift: 0.004, used: true, fakeRisk: 0.2, know: 'antique', stage: 3 },
  { id: 'scarf', name: '闇色のリボン', genre: 'ブランドスカーフ', ext: 3110, kind: 'staple', retail: 45000, size: 'S', demand: 1.4, base: 0.95, fakeRisk: 0.45, know: 'fashion', stage: 3 },
  { id: 'moai', name: '財宝ゴールデンモアイ', genre: '美術品・彫刻', ext: 5106, kind: 'luxury', retail: 2500000, size: 'L', demand: 0.3, base: 1.4, fakeRisk: 0.4, know: 'art', stage: 4 },
  // ---- 顧客層（engine/careers.js）を育てる商品：美容・ガジェット・インバウンド（niche：一般の品ぞろえとは別枠で、ときどき並ぶ）----
  { id: 'pretty_set', name: 'プリティーセット', genre: 'プチプラコスメのセット', ext: 1174, kind: 'staple', retail: 3800, size: 'S', demand: 2.6, base: 1.06, fakeRisk: 0.1, niche: true, reg: 'claim' },
  { id: 'dream_set', name: 'ドリームセット', genre: 'デパコスの限定コフレ', ext: 2174, kind: 'staple', retail: 8800, size: 'S', demand: 2.0, base: 1.14, fakeRisk: 0.25, niche: true, reg: 'claim' },
  { id: 'cyber_staff', name: 'サイバースタッフ', genre: 'ワイヤレスイヤホン', ext: 1158, kind: 'staple', retail: 19800, size: 'S', demand: 2.4, base: 1.03, fakeRisk: 0.2, niche: true },
  { id: 'star_globe', name: '魔力で動く天球儀', genre: 'スマートプロジェクター', ext: 3143, kind: 'staple', retail: 39800, size: 'M', demand: 1.6, base: 1.05, fakeRisk: 0.1, niche: true },
  { id: 'bonsai', name: '苔玉盆栽', genre: '苔玉の盆栽', ext: 2163, kind: 'staple', retail: 4800, size: 'M', demand: 1.8, base: 1.08, fakeRisk: 0, niche: true },
  { id: 'haori', name: '紋付羽織', genre: '古着の紋付羽織', ext: 2141, kind: 'collect', retail: 28000, size: 'M', demand: 0.8, base: 1.0, drift: 0.004, used: true, fakeRisk: 0.05, niche: true },
  // ---- 開拓した仕入れ先でだけ出会えるシリーズ（spot：開拓先の id。engine/pioneer.js）----
  { id: 'kokeshi', name: 'こけし', genre: '伝統こけし', ext: 1127, kind: 'staple', retail: 6800, size: 'S', demand: 1.6, base: 1.05, fakeRisk: 0, spot: 'toy_shop' },
  { id: 'gamaguchi', name: 'がま口財布', genre: '職人のがま口', ext: 2172, kind: 'staple', retail: 8800, size: 'S', demand: 1.8, base: 1.0, fakeRisk: 0.1, spot: 'craft_street' },
  { id: 'ichimatsu', name: '市松人形', genre: '古い市松人形', ext: 3127, kind: 'collect', retail: 68000, size: 'M', demand: 0.6, base: 1.0, drift: 0.005, used: true, fakeRisk: 0.15, spot: 'flea_market' },
  { id: 'bangasa', name: '番傘', genre: '老舗の和傘', ext: 3190, kind: 'collect', retail: 38000, size: 'L', demand: 0.8, base: 1.0, drift: 0.004, fakeRisk: 0.05, spot: 'old_shop' },
  { id: 'cosme_mirror', name: 'エリート鏡', genre: 'コスメブランドのミラー', ext: 2105, kind: 'staple', retail: 6500, size: 'S', demand: 2.2, base: 1.08, fakeRisk: 0.2, spot: 'zakka_site' },
  { id: 'actress_mirror', name: '女優鏡', genre: '限定コスメのミラー', ext: 3105, kind: 'staple', retail: 14000, size: 'S', demand: 1.8, base: 1.15, fakeRisk: 0.3, spot: 'cosme_official' },
  { id: 'monocle', name: '怪盗紳士の片眼鏡', genre: 'アンティークの片眼鏡', ext: 3102, kind: 'collect', retail: 45000, size: 'S', demand: 0.6, base: 1.0, drift: 0.006, used: true, fakeRisk: 0.3, spot: 'global_auction' },
  { id: 'rabbit_watch', name: '白兎の魔法時計', genre: '機械式の名作時計', ext: 4111, kind: 'collect', retail: 240000, size: 'S', demand: 0.4, base: 1.0, drift: 0.005, used: true, fakeRisk: 0.45, spot: 'members_site' },
  { id: 'maiogi', name: '舞扇', genre: '能楽の舞扇', ext: 4032, kind: 'collect', retail: 88000, size: 'S', demand: 0.5, base: 1.0, drift: 0.005, used: true, fakeRisk: 0.15, spot: 'local_market' },
  { id: 'sakazuki', name: '幸若舞の盃', genre: '蒔絵の盃', ext: 4030, kind: 'collect', retail: 130000, size: 'S', demand: 0.45, base: 1.0, drift: 0.006, used: true, fakeRisk: 0.2, spot: 'estate' },
  { id: 'gentle_umbrella', name: '紳士用傘', genre: '英国製の紳士傘', ext: 2190, kind: 'staple', retail: 9800, size: 'M', demand: 1.6, base: 1.0, fakeRisk: 0, spot: 'outlet_warehouse' },
  { id: 'leather_wallet', name: '合皮財布', genre: '輸入ブランドの財布', ext: 3172, kind: 'staple', retail: 15000, size: 'S', demand: 1.5, base: 1.02, fakeRisk: 0.15, spot: 'importer' },
  // シリーズ（世代交代）：2年ごとに次の世代が出て、前の世代は型落ちになる（下の SERIES）
  ...SERIES.flatMap(seriesProducts),

  // 薬機法に注意がいる商品（engine/regulated.js）。医薬品・カラコンは個人が売れない、サプリは効能をうたえない
  { id: 'kanpo', name: '漢方薬ヴェノムモス', genre: '市販の漢方薬（第2類医薬品）', ext: 3133, kind: 'staple', retail: 2800, size: 'S', demand: 2.0, base: 1.0, fakeRisk: 0, reg: 'med' },
  { id: 'colorcon', name: 'モノクル', genre: 'カラーコンタクト（度なし）', ext: 1102, kind: 'staple', retail: 1980, size: 'S', demand: 2.4, base: 1.0, fakeRisk: 0, reg: 'device' },
  { id: 'supple', name: '熱処理されたモスエッグ', genre: '健康サプリ（栄養補助食品）', ext: 1133, kind: 'staple', retail: 3980, size: 'S', demand: 2.2, base: 1.05, fakeRisk: 0.05, reg: 'claim' },

  // 自社ブランド品（エジソンの奥義「メンロパークの研究所」で、工場に発注してつくる）
  { id: 'own_brand', name: 'ウィズダムギョク', genre: '自社ブランドのスマートライト', ext: 3098, kind: 'staple', retail: 6980, size: 'S', demand: 2.4, base: 1.0, fakeRisk: 0, ownBrand: true },

  // くじの賞品（engine/kuji.js）。くじでしか手に入らない。下位賞ほど買い手が少なく、たくさん出すとダブついて相場が下がる
  { id: 'kuji_a', name: '真夜中のスタールビー', genre: 'くじのA賞（大型フィギュア）', ext: 5046, kind: 'kuji', retail: 18000, size: 'L', demand: 1.4, base: 1.0, fakeRisk: 0 },
  { id: 'kuji_b', name: 'ピジョンブラッド', genre: 'くじのB賞（フィギュア）', ext: 4046, kind: 'kuji', retail: 6000, size: 'M', demand: 1.0, base: 1.0, fakeRisk: 0 },
  { id: 'kuji_c', name: 'ウィズダムルビー', genre: 'くじのC賞（ぬいぐるみ）', ext: 3046, kind: 'kuji', retail: 2500, size: 'M', demand: 0.9, base: 1.0, fakeRisk: 0 },
  { id: 'kuji_d', name: 'エリートルビー', genre: 'くじのD賞（アクリルスタンド）', ext: 2046, kind: 'kuji', retail: 1200, size: 'S', demand: 0.7, base: 1.0, fakeRisk: 0 },
  { id: 'kuji_e', name: 'ルビー', genre: 'くじのE賞（ラバーストラップ）', ext: 1046, kind: 'kuji', retail: 700, size: 'S', demand: 0.6, base: 1.0, fakeRisk: 0 },
  { id: 'kuji_f', name: 'クラウン', genre: 'くじのF賞（タオル・缶バッジ）', ext: 1036, kind: 'kuji', retail: 400, size: 'S', demand: 0.5, base: 1.0, fakeRisk: 0 },
  { id: 'kuji_last', name: '冕冠', genre: 'くじのラストワン賞（特別カラーのフィギュア）', ext: 5036, kind: 'kuji', retail: 15000, size: 'L', demand: 1.2, base: 1.0, fakeRisk: 0 },

  // 中国輸入でしか仕入れられないノーブランド品（engine/importer.js）
  { id: 'imp_band', name: 'ブロンズリング', genre: 'ノーブランドのスマートバンド', ext: 1009, kind: 'staple', retail: 3980, size: 'S', demand: 2.4, base: 1.0, fakeRisk: 0, imported: true },
  { id: 'imp_light', name: '水晶玉', genre: 'LEDのインテリアライト', ext: 1098, kind: 'staple', retail: 2980, size: 'M', demand: 2.0, base: 1.0, fakeRisk: 0, imported: true },
  { id: 'imp_case', name: 'ルーン石板', genre: 'スマホスタンド・小物', ext: 1050, kind: 'staple', retail: 1980, size: 'S', demand: 3.0, base: 1.0, fakeRisk: 0, imported: true },
  { id: 'queen_watch', name: '王妃の黄金時計', genre: '高級腕時計', ext: 5111, kind: 'luxury', retail: 1280000, size: 'S', demand: 0.45, base: 1.35, fakeRisk: 0.5 },

  // 期間限定フェア（現実の季節に合わせる。data/live.js）。フェアの間だけ定価で仕入れられ、相場は peak。
  // フェアが終わると仕入れられなくなり、相場は after に近づく（1より上なら「限定品」として値上がり、下なら売れ残りの値崩れ）
  // ※乱数の並びを変えないよう、商品リストのいちばん最後に置く
  { id: 'live_newyear', name: 'ぴっぴ教 開運招福尊師像', genre: '新春限定の開運置物', ext: 4674, kind: 'live', live: 'newyear', retail: 6600, size: 'M', demand: 1.6, peak: 1.6, after: 1.25, fakeRisk: 0.05 },
  { id: 'live_valentine', name: 'スウィートパンケーキ', genre: 'バレンタイン限定のチョコ缶', ext: 3129, kind: 'live', live: 'valentine', retail: 3240, size: 'S', demand: 2.4, peak: 1.6, after: 0.6, fakeRisk: 0 },
  { id: 'live_sakura', name: '鬼灯ランタン', genre: '桜の季節限定のタンブラー', ext: 3150, kind: 'live', live: 'sakura', retail: 4950, size: 'S', demand: 2.6, peak: 1.8, after: 1.05, fakeRisk: 0.1 },
  { id: 'live_summer', name: 'ウィズダムセンス', genre: '夏祭り限定の扇子', ext: 3032, kind: 'live', live: 'summer', retail: 3300, size: 'S', demand: 1.8, peak: 1.5, after: 0.75, fakeRisk: 0.05 },
  { id: 'live_halloween', name: '魔女のホーキ', genre: 'ハロウィン限定のコラボ雑貨', ext: 3080, kind: 'live', live: 'halloween', retail: 5500, size: 'M', demand: 2.2, peak: 1.9, after: 0.85, fakeRisk: 0.1 },
  { id: 'live_xmas', name: '雪の結晶のタリスマン', genre: 'クリスマス限定のオーナメント', ext: 3173, kind: 'live', live: 'xmas', retail: 7700, size: 'S', demand: 2.0, peak: 1.8, after: 1.3, fakeRisk: 0.15 },
];

// 獲得したときに見せるひとこと説明
const DESC = {
  old_hat: '昔よく被っていた帽子。状態は悪くないが、流行は少し過ぎた。',
  gift_glass: '結婚式の引き出物のグラス。箱に入ったまま眠っていた。',
  old_figure: '子どもの頃に集めたフィギュア。今では手に入りにくいシリーズもある。',
  fountain_pen: 'もらいものの万年筆。書き味はいいのに、使う機会がなかった。',
  old_violin: '子どもの頃に習っていたヴァイオリン。大きくて送料がかかる。',
  boots: 'いつでも売れる定番スニーカー。値引き品を仕入れて利ざやを取る。',
  pocket_watch: '定番の懐中時計。相場は安定しているが、偽物も出回っている。',
  sake: '地酒。安定して売れるが、お酒の出品には規約の縛りがある。',
  scroll: '定番のトレカBOX。再販が多く、相場は定価の少し上で落ち着いている。',
  novice_book: '古本。1冊の利益は小さいが、仕入れ値も小さい。',
  heiho: '人気トレカの新弾BOX。発売直後が相場のピーク。再販が決まると急落する。',
  western_boots: 'コラボスニーカー。毎年新モデルが出て、前のモデルは値下がりする。',
  sylph: '限定フィギュア。予約や抽選で手に入れば利益が大きい。',
  golden_boots: '超限定スニーカー。当たれば大きいが、偽物も多い。',
  nectar: 'プレミアウイスキー。抽選でしか買えず、熟成ブームで高騰中。',
  photon: '新型VRゲーム機。発売日には行列ができる。転売対策も厳しい。',
  tsumi: '絶版本。古本屋の均一棚に紛れていることがある。ゆっくり値上がりする。',
  taito: '絶版トレカBOX。高額なぶん、シュリンクを偽装した偽物に注意。',
  violin: 'ヴィンテージ楽器。買い手は少ないが、1本で大きな利益になる。',
  jewel: 'ブランドジュエリー。高額で偽物が多い。目利きの腕が問われる。',
  winter: 'クリスマス限定のぬいぐるみ。ピークを過ぎると一気に値崩れする。',
  hina: '雛人形。季節もので、3月を過ぎると売れなくなる。',
  choux: '催事限定スイーツ。賞味期限があり、すぐ売らないと傷む。',
  kaeru: '謎のブームで大人気のぬいぐるみ。ブームはある日突然終わる。',
  art_print: '人気作家の限定版画。真贋の見極めが命。ジャンルの知識がないと手が出せない。',
  retro_pc: '往年の名機。動作品はコレクターに高く売れる。',
  rocking: 'アンティークの揺り椅子。大きくて置き場所を取るが、店舗の目玉になる。',
  harp_box: '貴婦人がハープを弾く精巧なオルゴール。状態で値段が大きく変わる。',
  lacquer: '伝統工芸の重箱。外国人観光客に人気がある。',
  scarf: 'ブランドのスカーフ。回転は速いが、偽物も多い。',
  moai: '黄金の彫刻。美術品の世界では、桁がひとつ違う。',
  kokeshi: '温泉地のおもちゃ屋で見つけた伝統こけし。海外のコレクターに根強い人気がある。',
  gamaguchi: '職人が手作りするがま口。問屋街の小さな工房でしか手に入らない。',
  ichimatsu: '骨董市の古い市松人形。状態と作家で値段が大きく変わる。',
  bangasa: '老舗が手放した和傘。大きくて置き場所を取るが、インバウンドに強い。',
  cosme_mirror: 'コスメブランドのノベルティのミラー。美容系のフォロワーに回転よく売れる。',
  actress_mirror: '限定コスメのミラー。発売のたびにSNSで話題になる。',
  monocle: '海外オークションで見つけたアンティークの片眼鏡。偽物も多い。',
  rabbit_watch: '会員制サイトでしか出回らない名作の機械式時計。目利きが試される。',
  maiogi: '地方の古物市場に出てきた能楽の舞扇。業者どうしの目利き勝負。',
  sakazuki: '遺品整理で出てきた蒔絵の盃。ひっそりと良い物が眠っている。',
  gentle_umbrella: 'メーカー直営の倉庫で出会う紳士傘。B品だが品質は確か。',
  leather_wallet: '輸入代理店から卸値で仕入れられるブランドの財布。',
  pretty_set: 'プチプラコスメのセット。美容系のお客さんが何度も買ってくれる。',
  dream_set: 'デパコスの限定コフレ。発売のたびに争奪戦になる。',
  cyber_staff: '人気のワイヤレスイヤホン。ガジェット好きは新しいものに目がない。',
  star_globe: '天井に星空を映すスマートプロジェクター。レビュー次第で売れ行きが変わる。',
  bonsai: '手のひらサイズの苔玉盆栽。訪日客へのお土産に人気。',
  haori: '古着の紋付羽織。海外では日本の美として高く評価される。',
  queen_watch: '高級腕時計。正規店でまれに定価で買える。資産として持つ人も多い。',
  live_newyear: '新春のフェアでしか買えない開運の置物。縁起物は、年が明けてもコレクターが探している。',
  live_valentine: 'バレンタイン限定のチョコ缶。2月14日を過ぎると、とたんに売れなくなる。',
  live_sakura: '桜の季節だけの限定タンブラー。毎年デザインが変わるので、前の年の柄を探す人もいる。',
  live_summer: '夏祭りの限定扇子。お祭りが終わると、季節外れの品になる。',
  live_halloween: 'ハロウィン限定のコラボ雑貨。10月31日を過ぎると需要が蒸発する。',
  live_xmas: 'クリスマス限定のオーナメント。年ごとの限定品として、あとから値上がりすることがある。',
};
for (const p of PRODUCTS) p.desc = DESC[p.id] || p.genre;

export const PRODUCT_MAP = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
export const productOf = (id) => PRODUCT_MAP[id];

export const SIZE_INFO = {
  S: { label: '小', ship: 210, stamina: 2, space: 1 },
  M: { label: '中', ship: 750, stamina: 3, space: 2 },
  L: { label: '大', ship: 1600, stamina: 6, space: 4 },
};

// 高額品は追跡・補償つきで送るので送料が上がる
export function shippingCost(product) {
  const base = SIZE_INFO[product.size].ship;
  return product.retail >= 100000 ? Math.max(base, 1500) : base;
}

// 販路ごとの送料（アマクリは倉庫から・裏市場は手渡しで0、海外ECは3倍）
export function shipFor(platform, product) {
  if (platform === 'ama' || platform === 'black') return 0;
  return shippingCost(product) * (platform === 'exp' ? 3 : 1);
}

// rep：再販版（MCHのRepレアリティの画像）。再販が決まったあとに仕入れた品は再販版になる
export const productImage = (product, rep = false) => `assets/extensions/${rep && product.rep ? product.rep : product.ext}.webp`;
