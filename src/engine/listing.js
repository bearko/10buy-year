// 仕入れ候補を「出品ページ」として見せるための情報。
// 偽物かどうかは画面に直接書かない。実際のせどりで偽物をつかむときの手がかり
// （仕入れルート・価格・出品者・写真・説明文・付属品・質問への対応・実物の細部）で匂わせる。
// 本物にも怪しい要素は混じるし、巧妙な偽物は見た目では分からない。細部を見抜けるかは目利き次第。
import { productOf } from '../data/products.js';
import { chance, pick, randInt } from './rng.js';
import { hasSkill, tired } from './effects.js';
import { perk } from './perks.js';
import { SPOTS } from './pioneer.js';
import { sizeLabel } from './shoes.js';
import { regNote } from './regulated.js';

// ---------------- 商品ジャンルごとの「写真」と「細部チェック」 ----------------
const CAT_OF = {
  boots: 'sneaker', western_boots: 'sneaker', golden_boots: 'sneaker',
  pocket_watch: 'watch', queen_watch: 'watch',
  scroll: 'tcg', heiho: 'tcg', taito: 'tcg', packs: 'tcg',
  sylph: 'figure', winter: 'figure', kaeru: 'figure', old_figure: 'figure',
  sake: 'liquor', nectar: 'liquor',
  photon: 'device',
  jewel: 'jewel',
  violin: 'instrument', old_violin: 'instrument',
  novice_book: 'book', tsumi: 'book',
};
export const catOf = (pid) => CAT_OF[pid] || 'other';

// part: その細部が写っている写真。ネット仕入れでは写真がないと確認できない
const CATS = {
  sneaker: {
    name: 'スニーカー',
    photos: ['全体', 'ソール', 'インソール', '箱ラベル', 'タグ'],
    accessories: ['箱', '替え紐', 'タグ'],
    checks: [
      { part: '箱ラベル', name: '箱ラベルとタグの品番', ok: '一致している', ng: '末尾の番号が違う' },
      { part: '全体', name: 'ステッチ', ok: '左右とも間隔が均一', ng: '左足だけ間隔が不揃い' },
      { part: 'インソール', name: 'インソールのプリント', ok: 'ロゴがシャープ', ng: '文字がにじんでいる' },
      { part: 'ソール', name: 'ソールの刻印', ok: '深く正確', ng: '浅くて粗い' },
    ],
  },
  watch: {
    name: '時計',
    photos: ['全体', '文字盤', '裏蓋の刻印', 'シリアル', '保証書'],
    accessories: ['箱', '保証書', 'コマ'],
    checks: [
      { part: '裏蓋の刻印', name: '裏蓋の刻印', ok: '深くて正確', ng: 'フォントが微妙に違う' },
      { part: '文字盤', name: '文字盤の印字', ok: 'くっきりしている', ng: 'ロゴの位置がわずかにズレている' },
      { part: 'シリアル', name: 'シリアルの書体', ok: '正規の書体と位置', ng: '書体が違う' },
      { part: '全体', name: '重さと金具', ok: 'ずっしり重い', ng: '妙に軽く、メッキがくすんでいる' },
    ],
  },
  tcg: {
    name: 'トレカBOX',
    photos: ['外箱', 'シュリンク', '側面', '底面'],
    accessories: ['シュリンク'],
    checks: [
      { part: 'シュリンク', name: 'シュリンク', ok: 'メーカーロゴ入り', ng: 'ロゴのない再シュリンク' },
      { part: '外箱', name: '箱の印刷', ok: '鮮明', ng: '色が少しくすんでいる' },
      { part: '底面', name: '底面の封', ok: '工場出荷のまま', ng: '一度開けたような跡' },
    ],
  },
  figure: {
    name: 'フィギュア',
    photos: ['全体', '顔アップ', '台座の刻印', '箱'],
    accessories: ['箱', '台座'],
    checks: [
      { part: '顔アップ', name: '目の印刷', ok: '左右対称で鮮明', ng: '左右で大きさが違う' },
      { part: '全体', name: '塗装', ok: 'シャープ', ng: '塗装がはみ出している' },
      { part: '台座の刻印', name: 'メーカー刻印', ok: 'ある', ng: '見当たらない' },
      { part: '箱', name: '箱の印刷とタグ', ok: 'きれい', ng: '文字がにじんでいる' },
    ],
  },
  liquor: {
    name: 'お酒',
    photos: ['ボトル', 'ラベル', '封緘', '箱'],
    accessories: ['箱'],
    checks: [
      { part: 'ラベル', name: 'ラベル', ok: '印刷がシャープ', ng: '紙質が違う' },
      { part: '封緘', name: 'キャップの封', ok: 'きれい', ng: '一度開けたような跡' },
      { part: 'ボトル', name: '液面の高さ', ok: '正常', ng: '妙に低い' },
    ],
  },
  device: {
    name: '家電',
    photos: ['外箱', '箱のシール', 'シリアル', '付属品'],
    accessories: ['箱', '保証書', 'ケーブル'],
    checks: [
      { part: '箱のシール', name: '箱のシール', ok: '未開封', ng: '貼り直した跡' },
      { part: 'シリアル', name: '箱と本体のシリアル', ok: '一致している', ng: '一致しない' },
      { part: '付属品', name: '付属品', ok: '純正品がそろっている', ng: 'ケーブルが純正ではない' },
    ],
  },
  jewel: {
    name: 'ジュエリー',
    photos: ['全体', '刻印', '留め具', 'ギャランティ'],
    accessories: ['箱', 'ギャランティカード', '保存袋'],
    checks: [
      { part: '刻印', name: 'ロゴと刻印', ok: '形も深さも正確', ng: 'ロゴの「O」が正円に近い' },
      { part: '留め具', name: '金具', ok: '重量感がありメッキがきれい', ng: '軽くてくすんでいる' },
      { part: 'ギャランティ', name: 'ギャランティカード', ok: '正規の書式', ng: '書式と紙質が違う' },
    ],
  },
  instrument: {
    name: '楽器',
    photos: ['全体', '内部ラベル', 'ニス', 'ケース'],
    accessories: ['ケース', '弓'],
    checks: [
      { part: '内部ラベル', name: '内部ラベル', ok: '年代相応', ng: '紙が新しすぎる' },
      { part: 'ニス', name: 'ニスの経年', ok: '自然な経年変化', ng: '人工的な汚し' },
      { part: '全体', name: '木の質感', ok: '詰まった良材', ng: '量産品の合板に見える' },
    ],
  },
  book: { name: '本', photos: ['表紙', '奥付', '背'], accessories: ['帯'], checks: [] },
  other: { name: '雑貨', photos: ['全体', '箱'], accessories: ['箱'], checks: [] },
};
export const catInfo = (pid) => CATS[catOf(pid)];

// ---------------- 販売元（サイト・店舗） ----------------
export const SITES = {
  store: { name: '近所の店', kind: 'store', color: '#e0584b' },
  used: { name: 'リサイクルショップ', kind: 'store', color: '#2b8a6e' },
  luxury: { name: '正規店', kind: 'store', color: '#222' },
  online: { name: 'マイクリ市場', kind: 'mall', color: '#bf2e2e' },
  preorder: { name: '公式オンラインストア', kind: 'mall', color: '#2d4fa8' },
  flea: { name: 'プンシー', kind: 'flea', color: '#1b8de0' },
  shady: { name: 'GLOBAL☆DEAL', kind: 'shady', color: '#f07b16' },
  auction: { name: '業者オークション', kind: 'pro', color: '#5b4a2e' },
  wholesale: { name: '問屋', kind: 'pro', color: '#4b5b6e' },
  queue: { name: '店頭', kind: 'store', color: '#e0584b' },
  lottery: { name: '公式抽選', kind: 'mall', color: '#2d4fa8' },
  gift: { name: '入手', kind: 'store', color: '#777' },
  dept: { name: '百貨店', kind: 'store', color: '#7c2d12' },
  gaisho: { name: '外商', kind: 'store', color: '#9d174d' },
  buying: { name: '海外の展示会', kind: 'pro', color: '#1e3a8a' },
  import: { name: 'ロンロン卸', kind: 'pro', color: '#e4393c' },
};
// 開拓した仕入れ先（engine/pioneer.js）も販売元として並べる
const ROUTE_SITE_KIND = { store: 'store', online: 'mall', auction: 'pro', wholesale: 'pro' };
for (const sp of SPOTS) SITES[sp.id] = { name: sp.name, kind: sp.id === 'global_auction' ? 'flea' : ROUTE_SITE_KIND[sp.route], color: sp.color };
export const siteOf = (o) => SITES[o.source] || SITES.gift;

// ---------------- 出品者 ----------------
const PERSONAL = ['はるまき', 'mofu', 'Kenta.T', '断捨離中のママ', 'ゆずこ', 'たけのこ', 'nagi_29', 'コツコツ出品', '週末せどらー', 'ぽん太', 'sakura.m', 'みかん箱'];
const SHOPLIKE = ['ブランド王国★', 'LUCKYSTORE88', '即日発送屋', 'SUPER-SALE', '正規品専門店☆彡', 'BEST-BUY-JP', 'トレカ倉庫', 'スニーカー卸直営'];
const AVATARS = ['10004', '1005', '2007', '2012', '2025', '2029', '3003', '3008', '3013', '3043', '4002', '4008', '4011', '4014', '5001', '5008'];

// 偽物（とくに露骨なもの）ほど赤信号が出やすい。本物にも一定の確率で紛れる。巧妙な偽物は本物並み
function flagRate(o, base, fakeRate) {
  if (!o.fake) return base;
  return o.clever ? Math.max(base, fakeRate * 0.4) : fakeRate;
}

function makeSeller(s, o, site) {
  if (site.kind !== 'flea' && site.kind !== 'shady') return null;
  const shady = site.kind === 'shady';
  const shopName = chance(s, flagRate(o, shady ? 0.9 : 0.15, 0.6));
  const newbie = chance(s, flagRate(o, 0.12, 0.55));
  const ratings = newbie ? randInt(s, 0, 9) : randInt(s, 25, 1800);
  const badFake = !newbie && chance(s, flagRate(o, 0.03, 0.3));
  return {
    name: shopName ? pick(s, SHOPLIKE) : pick(s, PERSONAL),
    shoplike: shopName,
    avatar: `assets/heroes/${pick(s, AVATARS)}.png`,
    ratings,
    good: ratings === 0 ? null : badFake ? randInt(s, 82, 93) : randInt(s, 97, 100),
    verified: shady ? false : !chance(s, flagRate(o, 0.2, 0.6)),
    sameItem: chance(s, flagRate(o, 0.08, 0.5)) ? randInt(s, 6, 30) : 0,
    badReview: badFake ? pick(s, ['届いた物が写真と違いました', '偽物でした。返金対応はしてもらえました', 'タグの縫い方が違う気がします']) : null,
    months: newbie ? randInt(s, 0, 1) : randInt(s, 6, 60),
  };
}

// ---------------- 説明文 ----------------
function makeDescription(s, o, site, p, cat, acc) {
  if (site.kind === 'store') return null;
  if (site.kind === 'mall' || site.kind === 'pro') return null;
  if (site.kind === 'shady') {
    return [
      '100%正規品保証！最高品質！',
      pick(s, ['日本国内倉庫から迅速発送します！', '工場直送のため激安価格を実現！', '数量限定のスペシャルプライス！']),
      '※海外からの発送のため、到着まで2〜3週間かかる場合があります。',
    ].join('\n');
  }
  const vague = chance(s, flagRate(o, 0.2, 0.7));
  if (o.fake && !o.clever && chance(s, 0.08)) return `${cat.name}です。${p.genre}「風」のノーブランド品です。気にしない方どうぞ。`;
  if (vague) {
    return [
      pick(s, ['正規品です。美品。', '本物です。', '新品同様です。']),
      pick(s, ['在庫処分のため格安で出品します。', '即決歓迎。', 'ノークレームノーリターンでお願いします。', '他でも出品しているので早い者勝ちです。']),
    ].join('\n');
  }
  const where = pick(s, ['正規店', '公式オンラインストア', '百貨店', '発売日に店頭']);
  const flaw = pick(s, ['目立つ傷や汚れはありません。', '写真の通り、角に小さな擦れがあります。', '一度だけ使用しました。', '開封のみで未使用です。']);
  return [
    `${randInt(s, 1, 3)}年前に${where}で購入しました。`,
    acc.length ? `${acc.join('・')}が付属します。` : '本体のみです。',
    flaw,
    pick(s, ['自宅保管、喫煙者・ペットはいません。', '引っ越しのため手放します。', 'コレクション整理のため出品します。']),
  ].join('\n');
}

// ---------------- 出品ページを組み立てる ----------------
export function buildListing(s, o) {
  const p = productOf(o.pid);
  const site = siteOf(o);
  const cat = catInfo(o.pid);
  const risky = (o.fakeRate || 0) > 0;
  const L = { site: o.source, photos: [], stockPhoto: false, accessories: [], info: [], checks: [], qa: null, likes: 0 };

  // 写真：ネットは出品者が撮った写真だけが手がかり。公式画像の流用や、肝心な部分が写っていないのは要注意
  const online = site.kind === 'flea' || site.kind === 'shady';
  if (online) {
    L.stockPhoto = chance(s, flagRate(o, site.kind === 'shady' ? 0.6 : 0.08, 0.5));
    L.photos = cat.photos.filter((part, i) => i === 0 || (!L.stockPhoto && !chance(s, flagRate(o, 0.2, 0.65))));
    L.likes = randInt(s, 0, 40);
  } else {
    L.photos = cat.photos;
  }
  L.accessories = cat.accessories.filter(() => !chance(s, flagRate(o, 0.2, 0.6)));
  if (!risky) L.accessories = cat.accessories;

  L.seller = makeSeller(s, o, site);
  L.description = makeDescription(s, o, site, p, cat, L.accessories);

  // 商品の情報
  const cond = o.junk
    ? 'ジャンク品（動作未確認・ノークレーム）'
    : o.import
    ? '新品（簡易包装・検品前）'
    : (p.used && !o.brandNew) || site.kind === 'pro' || o.source === 'used'
    ? pick(s, ['目立った傷や汚れなし', 'やや傷や汚れあり', '未使用に近い'])
    : '新品、未使用';
  L.info = [
    ['カテゴリー', p.genre],
    ['商品の状態', online && o.fake && !o.clever && chance(s, 0.4) ? '新品、未使用' : cond],
    ['付属品', L.accessories.length ? L.accessories.join('・') : 'なし'],
    ...(o.shoe ? [['サイズ', sizeLabel(o.shoe)]] : []),
    ...(regNote(o.pid) ? [['注意', regNote(o.pid)]] : []),
  ];
  if (online) {
    L.info.push(['発送元の地域', site.kind === 'shady' ? '海外' : pick(s, ['東京都', '大阪府', '愛知県', '福岡県', '北海道', '未定'])]);
    L.info.push(['発送までの日数', site.kind === 'shady' ? '14〜21日で発送' : pick(s, ['1〜2日で発送', '2〜3日で発送', '4〜7日で発送'])]);
  }
  if (o.source === 'used') L.info.push(['鑑定', chance(s, o.fake ? 0.15 : 0.7) ? '買取時に鑑定済み' : '鑑定なし（現状販売）']);
  if (o.source === 'auction') L.info.push(['出品票', '主催者の真贋チェック済み']);

  // 質問への対応（1回だけ聞ける）。本物の出品者は追加写真を送ってくれることが多い
  if (online || o.source === 'used') {
    const honest = o.fake ? chance(s, o.clever ? 0.45 : 0.15) : chance(s, 0.85);
    const missing = cat.photos.find((part) => !L.photos.includes(part));
    L.qa = {
      question: missing ? `「${missing}」の写真を追加でいただけますか？` : '購入時期と付属品を教えてください。',
      answer: honest
        ? (missing ? `追加しました。よろしくお願いします。` : `${randInt(s, 1, 3)}年前に購入、付属品は写真のとおりです。`)
        : pick(s, ['本物です。ご安心ください。', '（返信がない）', '写真の追加は対応していません。', '他の方も検討中なのでお早めにどうぞ。']),
      addPhoto: honest && missing ? missing : null,
      asked: false,
    };
    if (o.source === 'used') {
      L.qa.question = 'これ、鑑定はされていますか？';
      L.qa.answer = honest ? '買取時に専門スタッフが確認しています。' : '現状販売なので、鑑定まではしていないんです…。';
    }
  }

  // 細部チェック：本物は問題なし。偽物は多くの項目で違和感が出る（巧妙なものは少ない）
  const acc = Math.min(0.97, 0.7 + s.abilities.eye / 250 + (hasSkill(s, 'eye_fake') ? 0.1 : 0));
  L.checks = !risky ? [] : cat.checks.map((c) => {
    let bad = o.fake ? chance(s, o.clever ? 0.45 : 0.8) : false;
    if (!chance(s, acc)) bad = o.fake ? false : chance(s, 0.3); // 目利きが甘いと見誤る（見逃し・思い込み）
    return { ...c, bad };
  });
  if (o.fake && L.checks.length && !L.checks.some((c) => c.bad)) L.checks[randInt(s, 0, L.checks.length - 1)].bad = true;
  if (p.id === 'kaeru' && o.fake) L.checks.unshift({ part: '全体', name: 'タグの商品名', ok: '「カエルキッズ」', ng: '「ケロキッズ」と書いてある', bad: true });
  if (p.id === 'heiho' && o.fake) L.checks.find((c) => c.name === 'シュリンク').bad = true;
  L.seen = seenChecks(s) + (s.certs?.includes(`appraise_${catOf(o.pid)}`) ? 1 : 0) + (s.style?.type === 'spec' && s.style.cat === catOf(o.pid) ? 2 : 0);
  // 鑑定眼は「目利き×1%」の確率（最大95%）。鑑定士を取っても目利きを上げる意味が残る
  L.verdict = perk(s, 'fakeDetect') >= 1 && risky && chance(s, Math.min(0.95, s.abilities.eye / 100));
  return L;
}

// 目利きで見抜ける細部の数
export function seenChecks(s) {
  return Math.max(0, Math.floor(s.abilities.eye / 25) + (hasSkill(s, 'eye_fake') ? 1 : 0) + Math.round(perk(s, 'fakeDetect') * 5) - (tired(s) ? 1 : 0));
}

// 写っていない部分は確認できない（店頭・業者オークションは手に取れる）
export function visibleChecks(o) {
  const L = o.listing;
  if (!L) return [];
  const photos = L.qa?.asked && L.qa.addPhoto ? [...L.photos, L.qa.addPhoto] : L.photos;
  const touchable = !['flea', 'shady'].includes(siteOf(o).kind);
  return L.checks.map((c, i) => ({ ...c, known: i < L.seen && (touchable || photos.includes(c.part)) }));
}

export function askSeller(o) {
  if (o.listing?.qa) o.listing.qa.asked = true;
}

// 外注・自動プレイ用：見えている手がかりから怪しさを点数にする
export function suspicion(s, o) {
  const L = o.listing;
  if (!L || !(o.fakeRate > 0)) return 0;
  if (L.verdict) return o.fake ? 10 : 0;
  let n = 0;
  const sl = L.seller;
  if (sl) {
    if (sl.ratings < 10) n++;
    if (sl.sameItem) n++;
    if (sl.badReview) n += 2;
    if (!sl.verified) n += 0.5;
  }
  if (L.stockPhoto) n++;
  if (siteOf(o).kind === 'shady') n += 2;
  if (o.est && o.price < o.est * 0.55) n++;
  n += visibleChecks(o).filter((c) => c.known && c.bad).length * 2;
  return n;
}
