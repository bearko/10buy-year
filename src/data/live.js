// 期間限定フェア：遊んでいる日の「現実の日付」に合わせて開かれる。セーブデータの中の暦ではなく、本物の季節。
// フェアの間は限定商品（data/products.js の kind: 'live'）が店とネットに定価で並び、相場は高い。
// フェアが終わると仕入れられなくなり、相場は品ごとに「限定品として値上がり」か「季節外れで値崩れ」に分かれる。
// デイリー・週替わりチャレンジでは開かない（同じ条件で競うため）
export const LIVE_EVENTS = [
  {
    id: 'newyear', name: '新春の開運フェア', from: [1, 1], to: [1, 14], pid: 'live_newyear',
    talk: '新年ね。いま街では「新春の開運フェア」をやってるわ。限定の開運置物は、縁起物を集める人があとからも探しに来るの。',
  },
  {
    id: 'valentine', name: 'バレンタインフェア', from: [2, 1], to: [2, 14], pid: 'live_valentine',
    talk: 'いまはバレンタインフェアの時期。限定のチョコ缶は今だけ高く売れるけど、14日を過ぎたら一気に売れなくなるわよ。',
  },
  {
    id: 'sakura', name: '桜の季節の限定フェア', from: [3, 15], to: [4, 10], pid: 'live_sakura',
    talk: '桜が咲く季節ね。今年限りの桜柄タンブラーが出てるわ。毎年柄が変わるから、季節が過ぎても欲しい人はいるの。',
  },
  {
    id: 'summer', name: '夏祭りフェア', from: [7, 20], to: [8, 31], pid: 'live_summer',
    talk: '夏祭りの季節ね。限定の扇子が出てるけど、お祭りが終わったらただの扇子。売り切るなら8月のうちよ。',
  },
  {
    id: 'halloween', name: 'ハロウィンフェア', from: [10, 1], to: [10, 31], pid: 'live_halloween',
    talk: 'ハロウィンの季節ね。限定のコラボ雑貨は今がいちばん高いわ。31日を過ぎると需要が消えるから、抱えすぎないこと。',
  },
  {
    id: 'xmas', name: 'クリスマスフェア', from: [12, 1], to: [12, 25], pid: 'live_xmas',
    talk: 'クリスマスね。限定のオーナメントは「その年だけの品」だから、年が明けてから値上がりすることもあるの。',
  },
];

export const LIVE_MAP = Object.fromEntries(LIVE_EVENTS.map((e) => [e.id, e]));

const md = ([m, d]) => m * 100 + d;

// その日に開かれているフェア（端末の日付で判断する）
export function liveEventOn(date = new Date()) {
  const today = (date.getMonth() + 1) * 100 + date.getDate();
  return LIVE_EVENTS.find((e) => md(e.from) <= today && today <= md(e.to)) || null;
}

// 次に開かれるフェア（タイトルの「次は〜」用）
export function nextLiveEvent(date = new Date()) {
  const today = (date.getMonth() + 1) * 100 + date.getDate();
  return LIVE_EVENTS.find((e) => md(e.from) > today) || LIVE_EVENTS[0];
}

export const liveRange = (e) => `${e.from[0]}/${e.from[1]}〜${e.to[0]}/${e.to[1]}`;
