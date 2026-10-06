// ステージ（背景・立ち絵）とメッセージウィンドウ
import { CAST, portraitOf } from '../data/cast.js';
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

export function setBackground(name) {
  const img = $('#stage-bg');
  const src = BG(name);
  if (img.getAttribute('src') !== src) img.src = src;
}

// 左は常にクリス、右は話し相手
export function showChris(pose = 'idle') {
  const el = $('#sprite-left');
  el.src = CAST.chris.poses[pose] || CAST.chris.poses.idle;
  el.dataset.pose = pose;
  el.hidden = false;
  startBlink(pose);
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
  await typewrite(text);
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
