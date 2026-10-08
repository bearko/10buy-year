// ステージ（背景・立ち絵）とメッセージウィンドウ
import { CAST, portraitOf } from '../data/cast.js';
import { fitPixel, pixelSrc } from './pixel.js';
import { tierOf } from './battle.js';
import { productImage, productOf } from '../data/products.js';
import { marked, typeTarget } from './markup.js';
import { $, clear, h } from './dom.js';
import { tr } from '../i18n/index.js';

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
export const logEntry = log; // 画面の外で見せたお知らせもログに残す

export function setAuto(v) {
  autoMode = v;
  document.body.classList.toggle('auto', v);
}
export const isAuto = () => autoMode;

export function setTextSpeed(ms) {
  textSpeed = ms;
}

// ドット絵を、1ドットが端末の画素の整数倍になる大きさで出す（ui/pixel.js。読みこみ・画面の大きさの変化にも追従する）
export const snapPixels = (el) => fitPixel(el);

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
  el.src = pixelSrc(src);
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
const OWN_CONTROLS = 'button, a, input, select, textarea, #choices, #modal-root, .modal, .tree-screen, #hud [data-tip], .hud-tip';
const isAdvanceTap = (e) => !(e.target instanceof Element && e.target.closest(OWN_CONTROLS));

// 文字送りの「AUTO」：タップしなくても、読み終わるくらいの時間で次へ進む（選択肢では止まる）。メッセージ欄の右上で切りかえる
const AUTO_KEY = '10buy-year:autoRead';
let autoRead = false;
try {
  autoRead = window.localStorage.getItem(AUTO_KEY) === '1';
} catch {
  /* noop */
}
const autoBtn = h('button', { class: 'auto-read', 'aria-pressed': String(autoRead), title: 'タップしなくても話を進める' }, 'AUTO');
autoBtn.classList.toggle('on', autoRead);
autoBtn.onclick = (e) => {
  e.stopPropagation();
  autoRead = !autoRead;
  autoBtn.classList.toggle('on', autoRead);
  autoBtn.setAttribute('aria-pressed', String(autoRead));
  try {
    window.localStorage.setItem(AUTO_KEY, autoRead ? '1' : '0');
  } catch {
    /* noop */
  }
  autoNudge?.();
};
$('#message')?.append(autoBtn);
let autoNudge = null; // AUTO に切りかえたとき、いま待っているぶんを進める

// タップ／キーで進むまで待つ（オート中は少しだけ見せて進む）
function waitAdvance() {
  if (autoMode) return new Promise((r) => setTimeout(r, 180));
  if (autoRead) {
    // 文字数に合わせて待つ（1.2秒＋1文字40ms、最長5秒）。タップすればすぐ進む
    const len = ($('#text')?.textContent || '').length;
    return Promise.race([tapAdvance(), new Promise((r) => setTimeout(r, Math.min(5000, 1200 + len * 40)))]);
  }
  return Promise.race([tapAdvance(), new Promise((r) => { autoNudge = () => { autoNudge = null; if (autoRead) setTimeout(r, 600); }; })]);
}

function tapAdvance() {
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
  // 枠に収まらない長さなら、文の切れ目で分けて1枚ずつ出す（メッセージ欄はスクロールさせない）
  for (const part of pagesOf(text)) {
    const stopMouth = who === 'chris' && CALM.includes(pose || 'talk') && textSpeed > 0 && !autoMode ? startMouth(pose || 'talk') : null;
    await typewrite(part);
    stopMouth?.();
    box.classList.add('waiting');
    await waitAdvance();
    box.classList.remove('waiting');
  }
}

// ---------- メッセージを枠に収める ----------
// メッセージ欄は高さが決まっている（選択肢のないとき）。あふれたら次の1枚に送る
const fits = () => {
  const box = $('#message');
  return box.scrollHeight <= box.clientHeight + 1;
};

// 文章を、枠に収まる分ずつに分ける（改行・句点の後で切る。1文でも入らないときは読点・空白でも切る）
function pagesOf(text) {
  const full = tr(text);
  const el = $('#text');
  $('#message').classList.remove('tight', 'tighter');
  const fitsText = (s) => {
    typeTarget(el, s).finish();
    return fits();
  };
  if (fitsText(full)) return [full];
  const pieces = (s, re) => s.split(re).filter((x) => x !== '');
  let units = pieces(full, /(?<=[。！？!?」\n]|\. )/);
  units = units.flatMap((u) => (fitsText(u) ? [u] : pieces(u, /(?<=[、，,]|\s)/)));
  const pages = [];
  let cur = '';
  for (const u of units) {
    const next = cur + u;
    if (!cur || fitsText(next.replace(/^\s+/, ''))) cur = next;
    else {
      pages.push(cur.trim());
      cur = u;
    }
  }
  if (cur.trim()) pages.push(cur.trim());
  el.textContent = '';
  return pages;
}

// お知らせ（行の集まり）を、枠に収まる分ずつ見せる。blocks：[{ title, tone, lines }]
// wrap：ひとまとまりを囲む要素を作る（まとめのお知らせは項目ごとに枠をつける）
async function pagedLines(blocks, wrap) {
  const el = clear($('#text'));
  const box = $('#message');
  box.classList.remove('tight', 'tighter');
  const open = () => {
    if (!wrap) return el;
    const c = wrap(b0);
    el.append(c);
    return c;
  };
  let b0 = null;
  let onPage = 0;
  const breakPage = async () => {
    box.classList.add('waiting');
    await waitAdvance();
    box.classList.remove('waiting');
    clear(el);
    onPage = 0;
  };
  for (const b of blocks) {
    b0 = b;
    let cont = open();
    for (const l of b.lines.filter(Boolean)) {
      const line = h('div', {}, ...marked(l));
      cont.append(line);
      if (!fits() && onPage > 0) {
        line.remove();
        if (wrap && cont.children.length <= 1) cont.remove(); // 見出しだけ残ったら、見出しごと次の1枚へ
        await breakPage();
        cont = open();
        cont.append(line);
      }
      onPage++;
    }
  }
  box.classList.add('waiting');
  await waitAdvance();
  box.classList.remove('waiting');
}

async function typewrite(text) {
  const el = $('#text');
  // 金額・ゲームの言葉・専門用語に色をつけて、1文字ずつ出す（ui/markup.js）
  const target = typeTarget(el, text);
  if (textSpeed <= 0 || autoMode) {
    target.finish();
    return;
  }
  let skip = false;
  const since = performance.now();
  const onSkip = (e) => {
    if (isAdvanceTap(e) && e.timeStamp >= since) skip = true;
  };
  document.addEventListener('click', onSkip);
  while (!skip && target.step()) await new Promise((r) => setTimeout(r, textSpeed));
  document.removeEventListener('click', onSkip);
  target.finish();
  await new Promise((r) => setTimeout(r, 60));
}

// 続けて届いたお知らせを1枚にまとめて見せる（タップ1回）。1件ならいつものお知らせ
export async function showInfos(list) {
  if (list.length === 1) return showInfo(list[0].title, list[0].lines, list[0].tone);
  for (const x of list) log({ who: x.title, text: x.lines.filter(Boolean).join('\n'), kind: 'info', tone: x.tone });
  const box = $('#message');
  box.classList.remove('narr', 'good', 'bad');
  box.classList.add('info', 'digest');
  $('#speaker').textContent = `お知らせ ${list.length}件`;
  await pagedLines(list, (x) => h('div', { class: `dg-item ${x.tone || ''}` }, h('b', {}, tr(x.title))));
  box.classList.remove('info', 'digest');
}

export async function showInfo(title, lines, tone = 'normal') {
  log({ who: title, text: lines.filter(Boolean).join('\n'), kind: 'info', tone });
  const box = $('#message');
  box.classList.remove('narr');
  box.classList.add('info');
  box.classList.toggle('good', tone === 'good');
  box.classList.toggle('bad', tone === 'bad');
  $('#speaker').textContent = `【${title}】`;
  await pagedLines([{ lines }], null);
  box.classList.remove('info', 'good', 'bad');
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
        }, h('span', {}, o.label), o.sub ? h('small', {}, o.sub) : null, typeof o.chance === 'number' ? h('small', { class: `choice-rate t-${tierOf(o.chance)}` }, `成功率 ${Math.round(o.chance * 100)}%`) : null),
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
  for (const part of pagesOf(text)) {
    $('#text').textContent = part;
    box.classList.add('waiting');
    await waitAdvance();
    box.classList.remove('waiting');
  }
}

// タップを待たない表示（行動の予告など）。枠からあふれるときは、文字を少し小さくして収める
export function setMessage(speaker, text) {
  const box = $('#message');
  $('#speaker').textContent = speaker;
  $('#text').textContent = text;
  box.classList.remove('tight', 'tighter');
  if (fits()) return;
  box.classList.add('tight');
  if (!fits()) box.classList.replace('tight', 'tighter');
}
