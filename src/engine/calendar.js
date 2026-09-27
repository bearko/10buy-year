// 1ターン = 1週。4月第1週から翌年3月第4週までの48週で1周。
export const TOTAL_WEEKS = 48;
const MONTHS = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];

export const monthOf = (week) => MONTHS[Math.floor(week / 4)];
export const weekOfMonth = (week) => (week % 4) + 1;
export const isMonthEnd = (week) => week % 4 === 3;
export const weekLabel = (week) => `${monthOf(week)}月 第${weekOfMonth(week)}週`;

// 「○月第△週」から週番号へ。データ定義を読みやすくするためのヘルパー。
export function weekAt(month, nth) {
  const idx = MONTHS.indexOf(month);
  if (idx < 0) throw new Error(`invalid month ${month}`);
  return idx * 4 + (nth - 1);
}
