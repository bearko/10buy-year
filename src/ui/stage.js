// ステージ（背景・立ち絵）とメッセージウィンドウ
import { CAST, portraitOf } from '../data/cast.js';
import { $, clear, h } from './dom.js';

const BG = (name) => `assets/backgrounds/${name}.jpg`;
let textSpeed = 22; // ms / 文字
let blinkTimer = null;
let autoMode = false; // オート進行中はクリック待ちをせずに流す

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
    el.hidden = true;
    return;
  }
  const src = portraitOf(who, pose);
  if (!src) {
    el.hidden = true;
    return;
  }
  const c = CAST[who];
  el.src = src;
  el.className = `sprite ${c.hero ? 'hero' : c.enemy ? 'enemy' : `orig ${who}`}`;
  el.hidden = false;
}

export function hidePartner() {
  $('#sprite-right').hidden = true;
}

function speakerLabel(who) {
  if (!who || who === 'narr') return '';
  const c = CAST[who];
  if (!c) return who;
  return c.title ? `${c.name}（${c.title}）` : c.name;
}

// クリック／キーで進むまで待つ（オート中は少しだけ見せて進む）
function waitAdvance() {
  if (autoMode) return new Promise((r) => setTimeout(r, 180));
  return new Promise((resolve) => {
    const box = $('#message');
    const done = (e) => {
      if (e.type === 'keydown' && !['Enter', ' ', 'z', 'Z'].includes(e.key)) return;
      if (e.type === 'keydown') e.preventDefault();
      box.removeEventListener('click', done);
      window.removeEventListener('keydown', done);
      resolve();
    };
    box.addEventListener('click', done);
    window.addEventListener('keydown', done);
  });
}

export async function say(who, text, pose) {
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
  const onSkip = () => {
    skip = true;
  };
  $('#message').addEventListener('click', onSkip, { once: true });
  for (let i = 0; i < text.length; i++) {
    if (skip) break;
    el.textContent = text.slice(0, i + 1);
    await new Promise((r) => setTimeout(r, textSpeed));
  }
  $('#message').removeEventListener('click', onSkip);
  el.textContent = text;
  await new Promise((r) => setTimeout(r, 60));
}

export async function showInfo(title, lines, tone = 'normal') {
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
            resolve(i);
          },
        }, h('span', {}, o.label), o.sub ? h('small', {}, o.sub) : null),
      );
    });
  });
}

export function setMessage(speaker, text) {
  $('#speaker').textContent = speaker;
  $('#text').textContent = text;
}
