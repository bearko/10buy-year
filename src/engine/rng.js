// 乱数はセーブデータに状態を持たせ、同じシードなら同じ展開になるようにする（mulberry32）。

export function nextRandom(state) {
  let t = (state.rng = (state.rng + 0x6d2b79f5) >>> 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export const rand = (s) => nextRandom(s);
export const chance = (s, p) => nextRandom(s) < p;
export const randInt = (s, min, max) => min + Math.floor(nextRandom(s) * (max - min + 1));
export const randRange = (s, min, max) => min + nextRandom(s) * (max - min);
export const pick = (s, arr) => arr[Math.floor(nextRandom(s) * arr.length)];

export function weightedPick(s, items, weightOf = (x) => x.weight) {
  const total = items.reduce((sum, x) => sum + Math.max(0, weightOf(x)), 0);
  if (total <= 0) return null;
  let r = nextRandom(s) * total;
  for (const x of items) {
    r -= Math.max(0, weightOf(x));
    if (r < 0) return x;
  }
  return items[items.length - 1];
}

export function gauss(s) {
  const u = Math.max(1e-9, nextRandom(s));
  const v = nextRandom(s);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function poisson(s, lambda) {
  if (lambda <= 0) return 0;
  const l = Math.exp(-lambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= nextRandom(s);
  } while (p > l && k < 50);
  return k - 1;
}

// 状態を進めない決定的ノイズ。相場推定の誤差など「同じ週に何度見ても同じ値」にしたいもの用。
export function hashNoise(...nums) {
  let h = 2166136261;
  for (const n of nums) {
    h ^= n | 0;
    h = Math.imul(h, 16777619);
    h ^= h >>> 13;
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507);
  h = Math.imul(h ^ (h >>> 13), 3266489909);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}
