// 登場人物。クリス・マイン・マイクリくんはオリジナルキャラ（ドット絵）、
// それ以外はマイクリのヒーロー／エネミー画像を使う。
const C = (file) => `assets/characters/${file}.png`;

export const CAST = {
  chris: {
    name: 'クリス',
    poses: {
      idle: C('chris_00_idle'), arms: C('chris_01_arms_crossed'), wave: C('chris_02_wave'), cheer: C('chris_03_cheer'),
      guts: C('chris_04_guts_pose'), smile: C('chris_05_smile'), laugh: C('chris_06_laugh'), sparkle: C('chris_07_sparkle'),
      sad: C('chris_08_sad'), talk: C('chris_speak_00_talk'), cry: C('chris_cry_01_cry'), wail: C('chris_cry_02_wail'),
    },
    blink: [C('chris_09_idle'), C('chris_10_blink'), C('chris_11_blink')],
  },
  mine: {
    name: 'マイン',
    poses: {
      idle: C('navi_ain_11_idle'), pointer: C('navi_ain_00_pointer_up'), arms: C('navi_ain_01_arms_crossed'), banzai: C('navi_ain_02_both_arms_up'),
      wave: C('navi_ain_03_wave'), shock: C('navi_ain_04_hands_to_face'), wink: C('navi_ain_05_wink'), smile: C('navi_ain_06_smile'),
      talk: C('navi_ain_07_talk'), sparkle: C('navi_ain_08_sparkle'), cry: C('navi_ain_09_cry'), teary: C('navi_ain_10_teary'),
    },
  },
  maycri: {
    name: 'マイクリくん',
    poses: { idle: C('maycri_00_eyes_blank'), small: C('maycri_01_eyes_small'), wide: C('maycri_02_eyes_wide'), thin: C('maycri_03_eyes_thin') },
  },

  // マイクリのヒーロー
  ino: { name: '伊能忠敬', hero: 1005, title: '足で稼ぐ測量家' },
  gennai: { name: '平賀源内', hero: 3003, title: '江戸のコピーライター' },
  newton: { name: 'ニュートン', hero: 3043, title: 'バブルで大損した天才' },
  mitsunari: { name: '石田三成', hero: 2012, title: '帳簿の鬼' },
  ikkyu: { name: '一休', hero: 2029, title: 'とんちの和尚' },
  nostra: { name: 'ノストラダムス', hero: 3008, title: '相場大予言サロン主宰' },
  goemon: { name: '石川五右衛門', hero: 3013, title: '出所不明の卸業者' },
  marx: { name: 'マルクス', hero: 4011, title: '公園の経済学者' },
  satoshi: { name: 'サトシ・ナカモト', hero: 2025, title: '謎のクリプト仙人' },
  nobunaga: { name: '織田信長', hero: 5001, title: '楽市楽座の覇王' },
  santa: { name: 'サンタクロース', hero: 2007, title: '12月の依頼人' },
  nightingale: { name: 'ナイチンゲール', hero: 4002, title: '統計と看護の天使' },
  yukichi: { name: '福沢諭吉', hero: 10004, title: '一万円の人' },
  marie: { name: 'マリー・アントワネット', hero: 4014, title: '爆買いの王妃' },
  ryoma: { name: '坂本龍馬', hero: 5008, title: '海援隊（日本初の商社）' },
  marco: { name: 'マルコ・ポーロ', hero: 4008, title: '東方の相場を知る男' },

  // マイクリのエネミー（トラブルの化身）
  claimer: { name: 'クレーマー', enemy: 101 },
  swapper: { name: 'すり替え詐欺師', enemy: 161 },
  nego: { name: '値下げ交渉の民', enemy: 398 },
  fakeseller: { name: '怪しい業者', enemy: 410 },
  ghost: { name: '音信不通の購入者', enemy: 423 },
  collector: { name: '督促状の化身', enemy: 1190 },

  ieyasu: { name: '徳川家康', hero: 3044, title: '規制の番人（鳴くまで待とう）' },

  // ライバル転売屋（金に取り憑かれた偉人の亡霊）
  rival_cao: { name: 'ゴースト・曹操', enemy: 467, title: '店舗の買い占め' },
  rival_edison: { name: 'ゴースト・エジソン', enemy: 491, title: '転売ボット' },
  rival_gogh: { name: 'ゴースト・ゴッホ', enemy: 424, title: 'アート・競り' },
  rival_billy: { name: 'ゴースト・ビリー・ザ・キッド', enemy: 487, title: '価格破壊' },
};

export function portraitOf(who, pose) {
  const c = CAST[who];
  if (!c) return null;
  if (c.poses) return c.poses[pose] || c.poses.idle;
  if (c.hero) return `assets/heroes/${c.hero}.png`;
  if (c.enemy) return `assets/enemies/${c.enemy}.png`;
  return null;
}
