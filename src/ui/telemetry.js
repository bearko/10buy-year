// プレイログの送信（ブラウザ側）。どの機能が使われているか・どこで遊ぶのをやめたかを、匿名で集めてゲームの改善に使う。
// 送るもの：ランダムな端末ID・プレイID、遊んだ行動・開いた画面・仕入れと販売の月ごとの集計・月末の様子・エンディング。
// 送らないもの：名前（ランキングの名前も含む）・ランキングのID・端末の情報・IPアドレス（サーバーは保存しない）。
// 設定でいつでも止められる。開発中（localhost）と自動操作のブラウザでは、設定でONにしない限り送らない。
import { setTelemetryContext, setTelemetrySink } from '../engine/telemetry.js';
import { gameMeta, newTid, PLAYLOG_VERSION, snapshot } from '../engine/playlog.js';
import { getLang } from '../i18n/index.js';

const ENDPOINT = '/api/telemetry';
const PREF_KEY = '10buy-year:telemetry'; // 'on' | 'off'（未設定なら既定）
const PID_KEY = '10buy-year:tpid';
const QUEUE_KEY = '10buy-year:tqueue';
const MAX_QUEUE = 800; // 送れないまま溜まったら、古いものから捨てる
const FLUSH_AT = 40;
const FLUSH_MS = 60000;
const BATCH = 300;

const ls = {
  get(k) {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set(k, v) {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* noop */
    }
  },
};
const rid = (n) => Array.from({ length: n }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]).join('');

let queue = [];
let pid = null;
let sid = null;
let current = null; // いま遊んでいるゲーム（タイトル画面では null）
let timer = null;
let sending = false;

const devHost = () => /^(localhost|127\.|0\.0\.0\.0|\[::1\]|192\.168\.|10\.)/.test(window.location.hostname) || window.location.protocol !== 'https:';
export const telemetryDefault = () => !devHost() && !window.navigator.webdriver;
export function telemetryEnabled() {
  const p = ls.get(PREF_KEY);
  return p ? p === 'on' : telemetryDefault();
}
export function setTelemetryEnabled(on) {
  ls.set(PREF_KEY, on ? 'on' : 'off');
  if (!on) {
    queue = [];
    ls.set(QUEUE_KEY, '[]');
  }
  apply();
}

function apply() {
  setTelemetrySink(telemetryEnabled() ? onEvent : null);
}

function push(ev) {
  queue.push(ev);
  if (queue.length > MAX_QUEUE) queue.splice(0, queue.length - MAX_QUEUE);
  ls.set(QUEUE_KEY, JSON.stringify(queue));
  if (queue.length >= FLUSH_AT || ev.e === 'end') flush();
  else if (!timer) timer = setTimeout(() => flush(), FLUSH_MS);
}

function onEvent(ev, s) {
  const out = { g: s.tid, at: Math.round(Date.now() / 1000), ...ev };
  if (ev.e === 'mon') Object.assign(out, snapshot(s));
  push(out);
}

// ゲームに関係しない出来事（タイトル画面で開いた画面など）も送れるように
export function logUi(id, extra = {}) {
  if (!telemetryEnabled() || !id) return;
  push({ g: current?.tid || null, at: Math.round(Date.now() / 1000), e: 'ui', id: String(id).replace(/\d+/g, '#').slice(0, 40), ...(current ? { w: current.week } : {}), ...extra });
}
// ゲームの中の出来事（行動以外の操作：能力の上げ方・ルーティンなど）
export function logGame(s, e, data = {}) {
  if (!telemetryEnabled() || !s?.tid) return;
  onEvent({ e, w: s.week, ...data }, s);
}

const device = () => {
  const m = window.matchMedia;
  return [m('(pointer: coarse)').matches ? 'm' : 'd', m('(display-mode: standalone)').matches || window.navigator.standalone ? 'app' : 'web'].join('-');
};

export function flush(beacon = false) {
  clearTimeout(timer);
  timer = null;
  if (!queue.length || !telemetryEnabled() || (sending && !beacon)) return;
  const batch = queue.slice(0, BATCH);
  const body = JSON.stringify({ v: PLAYLOG_VERSION, pid, sid, dev: device(), lang: getLang(), ev: batch });
  const done = () => {
    queue = queue.slice(batch.length);
    ls.set(QUEUE_KEY, JSON.stringify(queue));
  };
  if (beacon && window.navigator.sendBeacon) {
    if (window.navigator.sendBeacon(ENDPOINT, new Blob([body], { type: 'application/json' }))) done();
    return;
  }
  sending = true;
  fetch(ENDPOINT, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: body.length < 60000 })
    .then((r) => {
      // 受け取られた、または受け取れない形だった（直しても同じなので捨てる）。混雑・未設定なら次の機会に
      if (r.ok || r.status === 400 || r.status === 413) done();
    })
    .catch(() => {})
    .finally(() => {
      sending = false;
      if (queue.length >= FLUSH_AT) setTimeout(() => flush(), 2000);
    });
}

export function initTelemetry() {
  pid = ls.get(PID_KEY);
  if (!pid) {
    pid = rid(16);
    ls.set(PID_KEY, pid);
  }
  sid = rid(10);
  try {
    queue = JSON.parse(ls.get(QUEUE_KEY) || '[]');
    if (!Array.isArray(queue)) queue = [];
  } catch {
    queue = [];
  }
  apply();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush(true);
  });
  window.addEventListener('pagehide', () => flush(true));
  if (queue.length) flush();
}

// ゲームを始めた・再開した。プレイIDがなければ付ける（以前のセーブ）
export function startPlaylog(s, { resumed }) {
  current = s;
  if (!s.tid) s.tid = newTid();
  setTelemetryContext({ cmd: null, auto: false });
  logGame(s, resumed ? 'sess' : 'new', { ...gameMeta(s), ...(resumed ? { resume: 1 } : {}) });
}
export const stopPlaylog = () => {
  current = null;
};
