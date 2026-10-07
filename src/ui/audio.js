// BGM・SE。自動再生制限があるので、ユーザーが音をONにするまで鳴らさない。
// My Crypto Heroes の効果音（tools/assets.json で元ファイルと対応づけている）
const SE = {
  sale: 'sale.mp3', trouble: 'trouble.mp3', hint: 'hint.mp3', buy: 'buy.mp3', coin: 'coin.mp3', win: 'win.mp3', lose: 'lose.mp3',
  unlock: 'unlock.mp3', levelup: 'levelup.mp3', heal: 'heal.mp3', damage: 'damage.mp3', debuff: 'debuff.mp3', stageup: 'stageup.mp3', clear: 'clear.wav', hit: 'hit.mp3',
};
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

export const currentBgm = () => bgm?.dataset.name || null;

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
  if (!settings.on || !SE[name]) return;
  const a = (cache[name] ||= new Audio(`assets/audio/se/${SE[name]}`));
  a.currentTime = 0;
  a.volume = 0.6;
  a.play().catch(() => {});
}
