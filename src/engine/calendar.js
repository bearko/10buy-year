// 1ターン = 1週。1年 = 48週（4月第1週〜翌年3月第4週）。10年で1周。
export const YEAR_WEEKS = 48;
export const TOTAL_YEARS = 10;
export const TOTAL_WEEKS = YEAR_WEEKS * TOTAL_YEARS;
const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

export const yearOf = (week) => Math.floor(week / YEAR_WEEKS) + 1;
// 年の中での週（0〜47）。季節・発売日などの年周期イベントはこれで判定する
export const woy = (week) => ((week % YEAR_WEEKS) + YEAR_WEEKS) % YEAR_WEEKS;
export const monthOf = (week) => MONTHS[Math.floor(woy(week) / 4)];
export const weekOfMonth = (week) => (week % 4) + 1;
export const isMonthEnd = (week) => week % 4 === 3;
export const isYearEnd = (week) => woy(week) === YEAR_WEEKS - 1;
export const weekLabel = (week) => `${yearOf(week)}年目 ${monthOf(week)}月 第${weekOfMonth(week)}週`;
export const shortLabel = (week) => `${monthOf(week)}月${weekOfMonth(week)}週`;

// 「○月第△週」から年の中での週番号へ。データ定義を読みやすくするためのヘルパー。
export function weekAt(month, nth) {
  const idx = MONTHS.indexOf(month);
  if (idx < 0) throw new Error(`invalid month ${month}`);
  return idx * 4 + (nth - 1);
}
