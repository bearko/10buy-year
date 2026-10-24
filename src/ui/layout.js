// ゲーム画面の割りふり。
// スマホ（1 列）：上の情報・ステージ・メッセージ欄・行動カードの欄を縦に並べる。
//   スマホのブラウザはアドレスバーの分だけ画面が短く、上の情報（返済日の帯など）や行動カードの段数も変わるので、
//   実際の高さを測って合わせる。行動カードの欄は「一度出た最大の高さ」で固定し（端末に覚えておく）、
//   行動を選んだり分類を切り替えたりしても、ステージとメッセージ欄の高さ・位置が動かないようにする
// PC（2 列。docs/19）：ゲームが使える幅（画面の幅 − 右のチャットのドック）が 900px 以上・高さ 600px 以上のとき body.pc。
//   左が演出の列（舞台・メッセージ欄）、右が操作の列（上の情報・能力・行動・ボタン）。高さは CSS の伸び縮みに任せる。
//   能力（#params）・ボタン（#side-btns）・選択肢（#choices）は、PC では操作の列へ移し、スマホに戻ったら元の場所へ戻す
import { fitAll } from './pixel.js';
import { isChatDock, isChatDockOpen, syncChatVisible } from '../platform.js';

const PC_MIN_W = 900; // ゲームが使える幅
const PC_MIN_H = 600;
const DOCK_W = 320; // 共通基盤のチャットのドック（SDK 1.7.0。幅は SDK が決める）
const DOCK_TAB = 34; // 畳んだときに右端に残るつまみ

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

const $id = (id) => document.getElementById(id);
const dockWidth = () => (isChatDock() ? (isChatDockOpen() ? DOCK_W : DOCK_TAB) : 0);
let pcNow = null;
let dockNow = null;
let stageKey = '';

/** いま PC の 2 列か */
export const isPc = () => document.body.classList.contains('pc');

// 能力・ボタン・選択肢を、PC では操作の列へ、スマホでは元の場所（舞台の右上・メッセージ欄の中）へ
function place(pc) {
  const params = $id('params');
  const btns = $id('side-btns');
  const choices = $id('choices');
  if (!params || !btns || !choices) return;
  if (pc) {
    if (params.parentElement !== $id('col-ops')) $id('hud').after(params);
    if (btns.parentElement !== $id('ops-foot')) $id('ops-foot').append(btns);
    if (choices.parentElement !== $id('col-ops')) $id('commands').before(choices);
  } else {
    if (params.parentElement !== $id('side')) $id('side').prepend(params);
    if (btns.parentElement !== $id('side')) $id('side').append(btns);
    if (choices.parentElement !== $id('message')) $id('next-mark').before(choices);
  }
}

// 画面いっぱいに重ねるもの（開く画面・お祝いなど）の範囲。CSS の body.pc で使う
//   --ov-l / --ov-r：操作の列（開く画面）、--st-l / --st-r：演出の列（お祝い）。ゲームの画面でないときは、ドックの左いっぱい
function setOverlayVars(dock, screen) {
  const root = document.documentElement.style;
  const W = window.innerWidth;
  const set = (k, v) => root.setProperty(k, `${Math.max(0, Math.round(v))}px`);
  const ops = screen && $id('col-ops').getBoundingClientRect();
  const st = screen && $id('col-stage').getBoundingClientRect();
  if (ops?.width) {
    set('--ov-l', ops.left - 8);
    set('--ov-r', W - ops.right - 8);
  } else {
    set('--ov-l', 0);
    set('--ov-r', dock);
  }
  if (st?.width) {
    set('--st-l', st.left);
    set('--st-r', W - st.right);
  } else {
    set('--st-l', 0);
    set('--st-r', dock);
  }
}

function fit() {
  raf = 0;
  const vh = window.visualViewport?.height || window.innerHeight;
  const dock = dockWidth();
  const pc = window.innerWidth - dock >= PC_MIN_W && vh >= PC_MIN_H;
  document.documentElement.style.setProperty('--dock', `${dock}px`);
  document.body.classList.toggle('chat-dock', dock > 0); // 右端にドック（かつまみ）がある：1 列のときも、その左に寄せる
  if (pc !== pcNow) {
    pcNow = pc;
    document.body.classList.toggle('pc', pc);
    place(pc);
    stageKey = '';
    window.dispatchEvent(new Event('layout-mode')); // 行動のタブ・ボタンを描き直す（main.js）
  }
  const dockMode = isChatDock();
  if (dockMode !== dockNow) {
    dockNow = dockMode;
    syncChatVisible(); // ドックになった・やめたときに、出す・隠すをそろえる（ドックはモーダルの最中も出したまま）
  }
  const screen = document.getElementById('game-screen');
  const stage = document.getElementById('stage');
  const shown = screen && !screen.hidden && stage;
  if (pc) setOverlayVars(dock, shown ? screen : null);
  if (!shown) return;
  if (pc) {
    const cmds = document.getElementById('commands');
    stage.style.height = '';
    if (cmds) cmds.style.minHeight = '';
    document.body.classList.remove('stage-s', 'stage-xs');
    const key = `${stage.clientWidth}x${stage.clientHeight}`;
    if (key !== stageKey) {
      stageKey = key;
      fitAll(stage); // ドット絵を新しい大きさに合わせ直す
    }
    return;
  }
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
  for (const id of ['hud', 'commands', 'game-screen', 'stage', 'col-ops']) {
    const el = document.getElementById(id);
    if (el) ro.observe(el);
  }
  window.addEventListener('resize', later);
  window.visualViewport?.addEventListener('resize', later);
  window.addEventListener('bg-chat-layout', later); // チャットのドックを畳んだ・広げた（platform.js）
  later();
}
