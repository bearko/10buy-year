// 特殊能力（パワプロの「特殊能力」にあたるもの）。
// blue: 経験点で習得できる。コツ（hint）を持っていると安くなる
// gold: 仲間キャラのイベントでコツをもらわないと習得できない
// red : マイナス能力。イベントで付き、経験点で治せる

export const SKILLS = [
  { id: 'early_bird', name: '早起き', kind: 'blue', desc: '行列の成功率が大きく上がる', cost: { act: 40, mind: 20 } },
  { id: 'poikatsu', name: 'ポイ活の鬼', kind: 'blue', desc: '電脳仕入れのポイント還元+5%、カード還元が2%に', cost: { info: 40, tech: 10 } },
  { id: 'photogenic', name: '写真映え', kind: 'blue', desc: '少し高めの値付けでも売れやすくなる', cost: { tech: 45, info: 15 } },
  { id: 'quick_reply', name: '即レス', kind: 'blue', desc: '評価が上がりやすく、トラブルが少し減る', cost: { social: 35, mind: 15 } },
  { id: 'pack_master', name: '梱包職人', kind: 'blue', desc: '発送の体力消費が半分になり、配送破損がなくなる', cost: { tech: 30, act: 30 } },
  { id: 'profile', name: 'プロフ必読', kind: 'blue', desc: '取引トラブルが30%減る', cost: { info: 20, social: 30 } },
  { id: 'lottery_nose', name: '限定の嗅覚', kind: 'blue', desc: '抽選の当選率が1.3倍', cost: { info: 35, mind: 25 } },
  { id: 'iron_mental', name: '鋼のメンタル', kind: 'blue', desc: 'やる気が下がる出来事を半分の確率で受け流す', cost: { mind: 60 } },
  { id: 'serial_memo', name: 'シリアル控え', kind: 'blue', desc: '発送前に写真とシリアルを記録。すり替え詐欺を撃退できる', cost: { tech: 25, info: 25 } },
  { id: 'bargain', name: '値切り上手', kind: 'blue', desc: '店舗仕入れの価格がさらに5%安くなる', cost: { social: 40, act: 10 } },

  { id: 'ino_map', name: '大日本沿海輿地全図', kind: 'gold', hero: 'ino', desc: '店舗仕入れの候補+2、店舗巡りの体力消費-30%', cost: { act: 90, info: 40 } },
  { id: 'doyou', name: '土用の丑の日', kind: 'gold', hero: 'gennai', desc: 'コピー一発で売れ行きが激変。高値でも売れやすい', cost: { tech: 90, info: 40 } },
  { id: 'crowd_madness', name: '群衆の狂気', kind: 'gold', hero: 'newton', desc: '相場推定の誤差が半分に。ブームの天井を察知できる', cost: { info: 80, mind: 50 } },
  { id: 'ledger', name: '大一大万大吉', kind: 'gold', hero: 'mitsunari', desc: '帳簿が完璧。確定申告の税額-30%、カード払いがリボにならない', cost: { info: 60, mind: 60 } },
  { id: 'tonchi', name: 'このはし渡るべからず', kind: 'gold', hero: 'ikkyu', desc: 'トラブル対応の判定が大幅に有利になる', cost: { social: 80, mind: 40 } },
  { id: 'tenka', name: '天下布武', kind: 'gold', hero: 'nobunaga', desc: '楽市楽座の精神。販売手数料-3%、仕入れ候補+1', cost: { social: 70, act: 70 } },

  { id: 'optimist', name: '楽観主義', kind: 'red', desc: '相場を1割高く見積もってしまう', cost: { mind: 30 } },
  { id: 'tendon', name: '腱鞘炎', kind: 'red', desc: '発送の体力消費が1.5倍', cost: { act: 20, mind: 20 } },
  { id: 'insomnia', name: '寝不足', kind: 'red', desc: '休んでも体力が戻りにくい', cost: { mind: 30 } },
  { id: 'burned', name: '炎上体質', kind: 'red', desc: '炎上度が上がりやすい', cost: { social: 30, mind: 20 } },
];

export const SKILL_MAP = Object.fromEntries(SKILLS.map((s) => [s.id, s]));
