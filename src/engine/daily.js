// デイリーチャレンジ：日付から決まるシードで始める。同じ日に遊ぶ人は、同じ相場・同じ出来事から始まる
export const todayKey = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export function dailySeed(key) {
  let x = 2166136261;
  for (const c of `10buy-daily:${key}`) {
    x ^= c.charCodeAt(0);
    x = Math.imul(x, 16777619);
  }
  return x >>> 0;
}

export const dailyLabel = (key) => `${Number(key.slice(5, 7))}/${Number(key.slice(8, 10))}`;
