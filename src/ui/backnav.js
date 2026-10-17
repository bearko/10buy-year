// スマホの「戻る」（Android の戻るボタン・ジェスチャー、iPhone のスワイプ）で、ページから出てしまわないようにする。
// ゲーム中は履歴を1つ積んでおき、戻られたら積み直してから、いちばん上に開いている画面を閉じる（Esc と同じ扱い）。
// 何も開いていなければ onIdle（行動の分類の中なら一覧へ、それ以外は「タイトルに戻る？」）
let armed = false;
let idle = null;

export function initBackNav({ onIdle }) {
  idle = onIdle;
  if (armed) return;
  armed = true;
  window.history.pushState({ game: true }, '');
  window.addEventListener('popstate', () => {
    window.history.pushState({ game: true }, '');
    backOnce();
  });
}

function backOnce() {
  const root = document.getElementById('modal-root');
  // 通知（トースト・実績の帯）は数えない
  const top = [...root.children].reverse().find((el) => !el.classList.contains('toast') && !el.classList.contains('celebrate'));
  if (!top) {
    idle?.();
    return;
  }
  // ステージの目標は「これを目指す！」で閉じる
  const go = top.querySelector('.gp-go');
  if (go) {
    go.click();
    return;
  }
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
}
