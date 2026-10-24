// BGM・SE。自動再生制限があるので、ユーザーが音をONにするまで鳴らさない。
// 音声ファイルは、音がONのときに初めて鳴らす分だけ読み込む（OFFのあいだは通信しない）
// My Crypto Heroes の効果音（tools/assets.json で元ファイルと対応づけている）
const SE = {
  sale: 'sale.mp3', trouble: 'trouble.mp3', hint: 'hint.mp3', buy: 'buy.mp3', coin: 'coin.mp3', win: 'win.mp3', lose: 'lose.mp3',
  unlock: 'unlock.mp3', levelup: 'levelup.mp3', heal: 'heal.mp3', damage: 'damage.mp3', debuff: 'debuff.mp3', stageup: 'stageup.mp3', clear: 'clear.wav', hit: 'damage.mp3',
};
const settings = { on: false };
let bgm = null;
let bgmName = null; // いま流れているはずの曲（OFFのあいだも覚えておく）
const cache = {};

try {
  settings.on = window.localStorage.getItem('10buy-year:sound') === 'on';
} catch {
  /* noop */
}

export const soundOn = () => settings.on;

export function setSound(on) {
  settings.on = on;
  try {
    window.localStorage.setItem('10buy-year:sound', on ? 'on' : 'off');
  } catch {
    /* noop */
  }
  if (!on) bgm?.pause();
  else playBgm(bgmName || 'pve');
}

export const currentBgm = () => bgmName;

// 音量（BGMと効果音を別々に。0〜1）。端末に覚えておく
const VOL_KEY = '10buy-year:volume';
const vol = { bgm: 1, se: 1 };
try {
  Object.assign(vol, JSON.parse(window.localStorage.getItem(VOL_KEY) || '{}'));
} catch {
  /* noop */
}
export const volumeOf = (kind) => vol[kind];
export function setVolume(kind, v) {
  vol[kind] = Math.max(0, Math.min(1, v));
  try {
    window.localStorage.setItem(VOL_KEY, JSON.stringify(vol));
  } catch {
    /* noop */
  }
  if (bgm && kind === 'bgm') bgm.volume = BGM_BASE * vol.bgm;
}
const BGM_BASE = 0.35;
const SE_BASE = 0.6;

// 曲の切りかえは1秒ほどでフェード（前の曲を下げてから、次の曲を上げる）
function fade(a, from, to, ms, done) {
  const t0 = performance.now();
  const step = (now) => {
    const k = Math.min(1, (now - t0) / ms);
    a.volume = Math.max(0, Math.min(1, from + (to - from) * k));
    if (k < 1) requestAnimationFrame(step);
    else done?.();
  };
  requestAnimationFrame(step);
}

// 振動（Android など対応している端末だけ。設定で切れる）
const VIB_KEY = '10buy-year:vibrate';
let vibrateOn = true;
try {
  vibrateOn = window.localStorage.getItem(VIB_KEY) !== 'off';
} catch {
  /* noop */
}
export const vibrateEnabled = () => vibrateOn;
export function setVibrate(on) {
  vibrateOn = on;
  try {
    window.localStorage.setItem(VIB_KEY, on ? 'on' : 'off');
  } catch {
    /* noop */
  }
}
export function buzz(pattern) {
  if (!vibrateOn || !navigator.vibrate) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* noop */
  }
}
export const canVibrate = () => typeof navigator.vibrate === 'function';

export function playBgm(name) {
  bgmName = name;
  if (!settings.on) {
    bgm?.pause();
    return;
  }
  if (bgm && bgm.dataset.name === name) {
    if (bgm.paused) bgm.play().catch(() => {});
    return;
  }
  const old = bgm;
  const target = BGM_BASE * vol.bgm;
  bgm = new Audio(`assets/audio/bgm/${name}.mp3`);
  bgm.dataset.name = name;
  bgm.loop = true;
  if (old && !old.paused && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
    fade(old, old.volume, 0, 500, () => old.pause());
    bgm.volume = 0;
    const next = bgm;
    setTimeout(() => { if (bgm === next) { next.play().catch(() => {}); fade(next, 0, target, 600); } }, 450);
    return;
  }
  old?.pause();
  bgm.volume = target;
  bgm.play().catch(() => {});
}

export function playSe(name) {
  // 売れた・仕入れた・ランクアップのときは、短く振動（音がOFFでも）
  if (name === 'sale' || name === 'buy') buzz(30);
  else if (name === 'stageup' || name === 'levelup') buzz([40, 60, 40]);
  if (!settings.on || !SE[name]) return;
  const a = (cache[name] ||= new Audio(`assets/audio/se/${SE[name]}`));
  a.currentTime = 0;
  a.volume = SE_BASE * vol.se;
  a.play().catch(() => {});
}
