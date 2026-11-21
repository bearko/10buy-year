// 店のクセを覚える「地図」。同じ店に何度か通うと、その店のクセ（品の集まり方・値付け・店員の厳しさ）がわかる。
// クセは覚える前から効いている。覚えると店を選ぶ画面と地図に出て、ルートを組み立てられるようになる
import { pick } from './rng.js';

export const LEARN_VISITS = 3;

export const HABITS = {
  wagon: { name: 'ワゴンが宝の山', desc: '品が集まりやすい', weight: 2 },
  deep: { name: '棚の奥に旧品', desc: 'ここの品は5%安い', disc: 0.05 },
  rival: { name: '同業者がよく来る', desc: '品が残っていないことが多い', weight: 0.4 },
  strict: { name: '店員が転売に厳しい', desc: '1人2個まで', cap: 2 },
  near: { name: '駅から近い', desc: '移動が3割短い', dist: 0.7 },
  flyer: { name: '値札の貼り替えが多い', desc: 'セールのチラシが出やすい', flyer: 0.35 },
};
const KEYS = Object.keys(HABITS);

// 遠征先（店の名前の前につく。遠征先ごとに、店のクセは別）
export const REGIONS = ['湯けむり市', '港町みなと', '城下町ささやま', 'ニュータウン若葉'];

// 店ごとのクセは、その周のシードと店の名前で決まる（何度行っても同じ）
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
export const habitKey = (s, name) => KEYS[hash(`${s.seed}:${name}`) % KEYS.length];
export const habitOf = (s, name) => HABITS[habitKey(s, name)];

export const visitsOf = (s, name) => s.storeMap?.[name]?.visits || 0;
export const knownHabit = (s, name) => (visitsOf(s, name) >= LEARN_VISITS ? habitOf(s, name) : null);

// 店に入ったときに呼ぶ。ちょうど覚えたら、そのクセを返す
export function visitStore(s, st) {
  if (st.spot) return null; // 開拓した仕入れ先は地図の外
  s.storeMap ||= {};
  const m = (s.storeMap[st.name] ||= { visits: 0, label: st.label, region: st.region || null });
  m.visits++;
  m.last = s.week;
  return m.visits === LEARN_VISITS ? habitOf(s, st.name) : null;
}

// 地図に載せる店（よく行く順）
export function mapEntries(s) {
  return Object.entries(s.storeMap || {})
    .map(([name, m]) => ({ name, ...m, habit: m.visits >= LEARN_VISITS ? habitOf(s, name) : null }))
    .sort((a, b) => b.visits - a.visits);
}

export const pickRegion = (s) => pick(s, REGIONS);
