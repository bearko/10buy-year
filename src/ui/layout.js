// ゲーム画面の縦の割りふり：ステージの高さを「画面の高さ − 上の情報 − メッセージ欄 − 行動カード」から決める。
// スマホのブラウザはアドレスバーの分だけ画面が短く、上の情報（返済日の帯など）や行動カードの段数も変わるので、
// 実際の高さを測って合わせる。行動カードの分は一度出た最大の高さを取っておき、カードの段数が変わるたびにステージが伸び縮みしないようにする
// （余った高さはメッセージ欄が受け持つ）
import { fitAll } from './pixel.js';

const MIN = 236; // これより低いと右の欄（能力・ボタン）が収まらない
const MAX = 400;
const CMD_FLOOR = 196; // 行動カード2段分の目安（最初の週から縮まないように）
let reserve = 0;
let lastW = 0;
let raf = 0;

function fit() {
  raf = 0;
  const screen = document.getElementById('game-screen');
  const stage = document.getElementById('stage');
  if (!screen || screen.hidden || !stage) return;
  const vh = window.visualViewport?.height || window.innerHeight;
  if (window.innerWidth !== lastW) {
    lastW = window.innerWidth;
    reserve = 0; // 横幅が変わったら（回転など）測り直す
  }
  const cmds = document.getElementById('commands');
  if (cmds && cmds.offsetHeight) reserve = Math.max(reserve, cmds.offsetHeight);
  const msg = document.getElementById('message');
  const msgH = msg ? parseFloat(getComputedStyle(msg).minHeight) + parseFloat(getComputedStyle(msg).marginTop) : 120;
  const hud = document.getElementById('hud')?.offsetHeight || 0;
  const free = vh - hud - msgH - Math.max(reserve, CMD_FLOOR);
  const h = Math.round(Math.max(MIN, Math.min(MAX, free)));
  document.body.classList.toggle('stage-s', h < 330);
  document.body.classList.toggle('stage-xs', h < 260);
  if (stage.style.height === `${h}px`) return;
  stage.style.height = `${h}px`;
  fitAll(stage); // ドット絵を新しい高さに合わせ直す
}

const later = () => {
  if (!raf) raf = requestAnimationFrame(fit);
};

export function initLayout() {
  const ro = new ResizeObserver(later);
  for (const id of ['hud', 'commands', 'game-screen']) {
    const el = document.getElementById(id);
    if (el) ro.observe(el);
  }
  window.addEventListener('resize', later);
  window.visualViewport?.addEventListener('resize', later);
  later();
}
