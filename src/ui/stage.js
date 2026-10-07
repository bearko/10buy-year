// ステージ（背景・立ち絵）とメッセージウィンドウ
import { CAST, portraitOf } from '../data/cast.js';
import { productImage, productOf } from '../data/products.js';
import { $, clear, h } from './dom.js';

const BG = (name) => `assets/backgrounds/${name}.jpg`;
let textSpeed = 22; // ms / 文字
let blinkTimer = null;
let autoMode = false; // オート進行中はクリック待ちをせずに流す

// 会話ログ：表示したメッセージを記録する先（main.js が設定する）
let logger = null;
export function setLogger(fn) {
  logger = fn;
}
const log = (entry) => logger?.(entry);

export function setAuto(v) {
  autoMode = v;
  document.body.classList.toggle('auto', v);
}
export const isAuto = () => autoMode;

export function setTextSpeed(ms) {
  textSpeed = ms;
}

// ドット絵（64×64など）は、元の大きさの整数倍で描く。CSS の割合で決まる高さに一番近い倍率へそろえ、
// ニアレストネイバーで拡大しても点の大きさが不ぞろいにならないようにする
export function snapPixels(el) {
  const n = el.naturalHeight;
  if (!n || el.hidden) return;
  const key = `${n}:${el.className}:${el.parentElement?.clientHeight}`;
  if (el.dataset.snap === key) return;
  el.style.height = '';
  el.style.width = '';
  const want = el.getBoundingClientRect().height;
  if (want <= 0) return;
  const k = Math.max(1, Math.floor(want / n + 0.2));
  el.style.height = `${n * k}px`;
  el.style.width = `${el.naturalWidth * k}px`;
  el.dataset.snap = key;
}
document.addEventListener('load', (e) => {
  if (e.target instanceof HTMLImageElement && e.target.classList.contains('sprite')) snapPixels(e.target);
}, true);
window.addEventListener('resize', () => document.querySelectorAll('img.sprite').forEach((el) => { delete el.dataset.snap; snapPixels(el); }));

let bgName = null;
export function setBackground(name) {
  const img = $('#stage-bg');
  const src = BG(name);
  if (img.getAttribute('src') !== src) img.src = src;
  bgName = name;
  const boxes = $('#stage-boxes');
  if (boxes) boxes.hidden = name !== 'home';
}

// 部屋に積み上がる在庫：仕入れた品そのもののアイコンを床に積む。家の背景のときだけ見える。
// 品ごとに置き場所（スロット）を覚えておき、売れて出ていった品だけが消える（ほかの品は動かない）
const STACKS = [3, 89, 14, 78, 25, 67, 36, 56];
const ROWS = 4;
export const ROOM_MAX = STACKS.length * ROWS;
const slotOf = new Map(); // uid -> スロット番号
export const roomLayer = () => {
  let el = $('#stage-boxes');
  if (!el) {
    el = document.createElement('div');
    el.id = 'stage-boxes';
    $('#stage-bg').after(el);
  }
  return el;
};
export const slotPos = (i) => ({ left: STACKS[i % STACKS.length] + ((Math.floor(i / STACKS.length) * 3) % 5) - 2, bottom: Math.floor(i / STACKS.length) * 13 });

// 週末の販売〜発送の演出が終わるまでは、売れた品を部屋に残しておく（箱に詰めて送り出す様子を見せるため）
let roomHeld = false;
export const holdRoom = (v) => {
  roomHeld = v;
};

// items：[{ uid, pid }]（古い順）。over：置き場を超えている
export function setClutter(items, { over = false } = {}) {
  const el = roomLayer();
  el.hidden = bgName !== 'home';
  el.classList.toggle('over', over);
  if (roomHeld) items = [...items, ...[...el.children].filter((img) => !items.some((x) => String(x.uid) === img.dataset.uid)).map((img) => ({ uid: Number(img.dataset.uid), pid: img.dataset.pid }))];
  const keep = new Set(items.map((x) => x.uid));
  for (const [uid] of slotOf) if (!keep.has(uid)) slotOf.delete(uid);
  const used = new Set(slotOf.values());
  for (const x of items) {
    if (slotOf.has(x.uid)) continue;
    let i = 0;
    while (used.has(i) && i < ROOM_MAX) i++;
    if (i >= ROOM_MAX) continue; // 置ききれない分は見せない（部屋はもう品でいっぱい）
    slotOf.set(x.uid, i);
    used.add(i);
  }
  const want = new Map(items.filter((x) => slotOf.has(x.uid)).map((x) => [String(x.uid), x]));
  for (const img of [...el.children]) if (!want.has(img.dataset.uid)) img.remove();
  const have = new Set([...el.children].map((img) => img.dataset.uid));
  for (const [uid, x] of want) {
    if (have.has(uid)) continue;
    const i = slotOf.get(x.uid);
    const p = slotPos(i);
    const img = document.createElement('img');
    img.className = 'room-item';
    img.alt = '';
    img.src = productImage(productOf(x.pid));
    img.dataset.uid = uid;
    img.dataset.pid = x.pid;
    img.style.left = `${p.left}%`;
    img.style.bottom = `${p.bottom}%`;
    img.style.zIndex = String(ROWS - Math.floor(i / STACKS.length));
    el.append(img);
  }
}

// 左は常にクリス、右は話し相手
export function showChris(pose = 'idle') {
  const el = $('#sprite-left');
  el.src = CAST.chris.poses[pose] || CAST.chris.poses.idle;
  el.dataset.pose = pose;
  el.hidden = false;
  if (el.complete) snapPixels(el);
  startBlink(pose);
  startLoop(pose);
}

const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

// 泣き顔はコマを切り替え続ける（しゃくり上げる）
let loopTimer = null;
function startLoop(pose) {
  clearInterval(loopTimer);
  const frames = CAST.chris.loops?.[pose];
  if (!frames || reducedMotion()) return;
  const el = $('#sprite-left');
  let i = 0;
  loopTimer = setInterval(() => {
    if (el.dataset.pose !== pose) return clearInterval(loopTimer);
    el.src = frames[++i % frames.length];
  }, pose === 'wail' ? 260 : 520);
}

// 口パク：落ち着いた表情の台詞は、文字が出ている間だけ口のコマを切り替え、言い終えたらその表情になる
const CALM = ['talk', 'sad', 'arms', 'smile', 'idle'];
function startMouth(pose) {
  const el = $('#sprite-left');
  const frames = CAST.chris.speak;
  if (!frames || reducedMotion()) return null;
  el.dataset.pose = 'talk';
  clearInterval(blinkTimer);
  let i = 0;
  const t = setInterval(() => {
    if (el.dataset.pose !== 'talk') return clearInterval(t);
    el.src = frames[i++ % frames.length];
  }, 90);
  return () => {
    clearInterval(t);
    if (el.dataset.pose === 'talk') showChris(pose);
  };
}

function startBlink(pose) {
  clearInterval(blinkTimer);
  if (pose !== 'idle') return;
  const el = $('#sprite-left');
  blinkTimer = setInterval(() => {
    if (el.dataset.pose !== 'idle') return;
    el.src = CAST.chris.blink[1];
    setTimeout(() => {
      if (el.dataset.pose === 'idle') el.src = CAST.chris.poses.idle;
    }, 140);
  }, 3200);
}

export function showPartner(who, pose) {
  const el = $('#sprite-right');
  if (!who || who === 'chris' || who === 'narr') {
    hidePartner();
    return;
  }
  const src = portraitOf(who, pose);
  if (!src) {
    hidePartner();
    return;
  }
  const c = CAST[who];
  el.src = src;
  el.className = `sprite ${c.hero ? 'hero' : c.enemy ? 'enemy' : `orig ${who}`}`;
  el.hidden = false;
  if (el.complete) snapPixels(el);
  // 右側のパラメータ欄と相手の立ち絵が重ならないように、相手がいる間は隠す
  document.body.classList.add('partner-on');
}

export function hidePartner() {
  $('#sprite-right').hidden = true;
  document.body.classList.remove('partner-on');
}

function speakerLabel(who) {
  if (!who || who === 'narr') return '';
  const c = CAST[who];
  if (!c) return who;
  return c.title ? `${c.name}（${c.title}）` : c.name;
}

// 画面のどこをタップしても進む。ボタン・選択肢・モーダル・ツリーなど、それ自体を操作する場所は除く
const OWN_CONTROLS = 'button, a, input, select, textarea, #choices, #modal-root, .modal, .tree-screen';
const isAdvanceTap = (e) => !(e.target instanceof Element && e.target.closest(OWN_CONTROLS));

// タップ／キーで進むまで待つ（オート中は少しだけ見せて進む）
function waitAdvance() {
  if (autoMode) return new Promise((r) => setTimeout(r, 180));
  const since = performance.now();
  return new Promise((resolve) => {
    const done = (e) => {
      if (e.type === 'keydown' && !['Enter', ' ', 'z', 'Z'].includes(e.key)) return;
      if (e.type === 'click' && (!isAdvanceTap(e) || e.timeStamp < since)) return;
      if (e.type === 'keydown') e.preventDefault();
      document.removeEventListener('click', done);
      window.removeEventListener('keydown', done);
      resolve();
    };
    document.addEventListener('click', done);
    window.addEventListener('keydown', done);
  });
}

export async function say(who, text, pose) {
  log({ who, text, kind: who === 'narr' ? 'narr' : 'talk' });
  const box = $('#message');
  box.classList.remove('info', 'good', 'bad');
  box.classList.toggle('narr', who === 'narr');
  $('#speaker').textContent = speakerLabel(who);
  if (who === 'chris') showChris(pose || 'talk');
  else {
    showPartner(who, pose);
    if ($('#sprite-left').dataset.pose !== 'idle') showChris('idle');
  }
  const stopMouth = who === 'chris' && CALM.includes(pose || 'talk') && textSpeed > 0 && !autoMode ? startMouth(pose || 'talk') : null;
  await typewrite(text);
  stopMouth?.();
  box.classList.add('waiting');
  await waitAdvance();
  box.classList.remove('waiting');
}

async function typewrite(text) {
  const el = $('#text');
  el.textContent = '';
  if (textSpeed <= 0 || autoMode) {
    el.textContent = text;
    return;
  }
  let skip = false;
  const since = performance.now();
  const onSkip = (e) => {
    if (isAdvanceTap(e) && e.timeStamp >= since) skip = true;
  };
  document.addEventListener('click', onSkip);
  for (let i = 0; i < text.length; i++) {
    if (skip) break;
    el.textContent = text.slice(0, i + 1);
    await new Promise((r) => setTimeout(r, textSpeed));
  }
  document.removeEventListener('click', onSkip);
  el.textContent = text;
  await new Promise((r) => setTimeout(r, 60));
}

export async function showInfo(title, lines, tone = 'normal') {
  log({ who: title, text: lines.filter(Boolean).join('\n'), kind: 'info', tone });
  const box = $('#message');
  box.classList.remove('narr');
  box.classList.add('info');
  box.classList.toggle('good', tone === 'good');
  box.classList.toggle('bad', tone === 'bad');
  $('#speaker').textContent = `【${title}】`;
  const el = clear($('#text'));
  lines.filter(Boolean).forEach((l) => el.append(h('div', {}, l)));
  box.classList.add('waiting');
  await waitAdvance();
  box.classList.remove('waiting', 'info', 'good', 'bad');
}

export function choose(options, prompt) {
  return new Promise((resolve) => {
    const box = $('#message');
    box.classList.remove('info', 'good', 'bad', 'narr');
    if (prompt) $('#text').textContent = prompt;
    const wrap = clear($('#choices'));
    options.forEach((o, i) => {
      wrap.append(
        h('button', {
          class: 'choice',
          onclick: (e) => {
            e.stopPropagation();
            clear(wrap);
            log({ who: 'chris', text: `▶ ${o.label}`, kind: 'choice' });
            resolve(i);
          },
        }, h('span', {}, o.label), o.sub ? h('small', {}, o.sub) : null),
      );
    });
  });
}

// メッセージを出してタップを待つ（ステージ側に何かを見せている間に使う）
export async function hold(speaker, text) {
  log({ who: speaker, text, kind: 'info' });
  const box = $('#message');
  box.classList.remove('info', 'good', 'bad', 'narr');
  $('#speaker').textContent = speaker;
  $('#text').textContent = text;
  box.classList.add('waiting');
  await waitAdvance();
  box.classList.remove('waiting');
}

export function setMessage(speaker, text) {
  $('#speaker').textContent = speaker;
  $('#text').textContent = text;
}
