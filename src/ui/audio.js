// BGM・SE。自動再生制限があるので、ユーザーが音をONにするまで鳴らさない。
const SE = ['sale', 'trouble', 'hint', 'buy', 'coin', 'win', 'lose'];
const settings = { on: false };
let bgm = null;
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
  else playBgm(bgm?.dataset.name || 'pve');
}

export function playBgm(name) {
  if (bgm && bgm.dataset.name === name) {
    if (settings.on && bgm.paused) bgm.play().catch(() => {});
    return;
  }
  bgm?.pause();
  bgm = new Audio(`assets/audio/bgm/${name}.mp3`);
  bgm.dataset.name = name;
  bgm.loop = true;
  bgm.volume = 0.35;
  if (settings.on) bgm.play().catch(() => {});
}

export function playSe(name) {
  if (!settings.on || !SE.includes(name)) return;
  const a = (cache[name] ||= new Audio(`assets/audio/se/${name}.mp3`));
  a.currentTime = 0;
  a.volume = 0.6;
  a.play().catch(() => {});
}
