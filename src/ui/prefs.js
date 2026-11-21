// 端末ごとの遊び方の設定（セーブとは別。localStorage に覚えておく）
const ONE_TAP_KEY = '10buy-year:oneTap';
let oneTapOn = false;
try {
  oneTapOn = window.localStorage.getItem(ONE_TAP_KEY) === '1';
} catch {
  /* noop */
}
// 行動を1タップで決める（慣れた人向け。長押しで予告だけ見られる）
export const oneTap = () => oneTapOn;
export function setOneTap(on) {
  oneTapOn = on;
  try {
    window.localStorage.setItem(ONE_TAP_KEY, on ? '1' : '0');
  } catch {
    /* noop */
  }
}
