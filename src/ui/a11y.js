// 見やすさの設定：文字の大きさ。CSS の font-size はすべて var(--fs) 倍になっている（styles/main.css）
const KEY = '10buy-year:fontScale';
export const FONT_SCALES = [['ふつう', 1], ['大きい', 1.15], ['とても大きい', 1.3]];

export function fontScale() {
  try {
    const v = Number(window.localStorage.getItem(KEY));
    return FONT_SCALES.some(([, x]) => x === v) ? v : 1;
  } catch {
    return 1;
  }
}

export function setFontScale(v) {
  document.documentElement.style.setProperty('--fs', String(v));
  try {
    window.localStorage.setItem(KEY, String(v));
  } catch {
    // 保存できなくても、この回は反映される
  }
}

export const initFontScale = () => setFontScale(fontScale());
