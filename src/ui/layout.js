// ゲーム画面の縦の割りふり：上の情報・ステージ・メッセージ欄・行動カードの欄。
// スマホのブラウザはアドレスバーの分だけ画面が短く、上の情報（返済日の帯など）や行動カードの段数も変わるので、
// 実際の高さを測って合わせる。行動カードの欄は「一度出た最大の高さ」で固定し（端末に覚えておく）、
// 行動を選んだり分類を切り替えたりしても、ステージとメッセージ欄の高さ・位置が動かないようにする
import { fitAll } from './pixel.js';

const MIN = 236; // これより低いと右の欄（能力・ボタン）が収まらない
const MAX = 400;
const CMD_FLOOR = 196; // 行動カード2段分の目安（最初の週から縮まないように）
const KEY = '10buy-year:cmdReserve';
let reserve = 0;
let lastW = 0;

function loadReserve(w) {
  try {
    return Number(JSON.parse(window.localStorage.getItem(KEY) || '{}')[w]) || 0;
  } catch {
    return 0;
  }
}
function saveReserve(w, v) {
  try {
    const all = JSON.parse(window.localStorage.getItem(KEY) || '{}');
    all[w] = v;
    window.localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* noop */
  }
}
let raf = 0;

function fit() {
  raf = 0;
  const screen = document.getElementById('game-screen');
  const stage = document.getElementById('stage');
  if (!screen || screen.hidden || !stage) return;
  const vh = window.visualViewport?.height || window.innerHeight;
  if (window.innerWidth !== lastW) {
    lastW = window.innerWidth;
    reserve = loadReserve(lastW); // 横幅が変わったら（回転など）その幅で覚えている高さから
  }
  const cmds = document.getElementById('commands');
  if (cmds && cmds.offsetHeight) {
    // 欄の固定を外して、中身の高さを測る
    const fixed = cmds.style.minHeight;
    cmds.style.minHeight = '';
    const natural = Math.ceil(cmds.offsetHeight);
    cmds.style.minHeight = fixed;
    if (natural > reserve) {
      reserve = natural;
      saveReserve(lastW, reserve);
    }
  }
  const msg = document.getElementById('message');
  const msgH = msg ? parseFloat(getComputedStyle(msg).minHeight) + parseFloat(getComputedStyle(msg).marginTop) : 120;
  const hud = document.getElementById('hud')?.offsetHeight || 0;
  const cmdH = Math.max(reserve, CMD_FLOOR);
  const h = Math.round(Math.max(MIN, Math.min(MAX, vh - hud - msgH - cmdH)));
  document.body.classList.toggle('stage-s', h < 330);
  document.body.classList.toggle('stage-xs', h < 260);
  // 行動カードの欄は、残りの高さいっぱい（カードは欄の上から並ぶ）
  if (cmds) cmds.style.minHeight = `${Math.max(cmdH, Math.floor(vh - hud - msgH - h))}px`;
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
