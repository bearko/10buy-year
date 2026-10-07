// オンラインランキング（週替わりチャレンジ）のやりとりと画面。サーバーは api/ranking.js
import { NAME_MAX, weekKey, weekRange } from '../engine/weekly.js';
import { h, yenFmt } from './dom.js';
import { toast } from './modal.js';

const API = 'api/ranking';
const PLAYER_KEY = '10buy-year:player';
const NAME_KEY = '10buy-year:playerName';

const store = {
  get: (k) => {
    try {
      return window.localStorage.getItem(k);
    } catch {
      return null;
    }
  },
  set: (k, v) => {
    try {
      window.localStorage.setItem(k, v);
    } catch {
      /* noop */
    }
  },
};

// この端末のプレイヤーID（自己ベストをまとめるため。名前は変えられる）
export function playerId() {
  let id = store.get(PLAYER_KEY);
  if (!/^[a-z0-9]{8,32}$/.test(id || '')) {
    id = Array.from(crypto.getRandomValues(new Uint8Array(12)), (b) => (b % 36).toString(36)).join('');
    store.set(PLAYER_KEY, id);
  }
  return id;
}

export const savedName = () => store.get(NAME_KEY) || '';

const ERRORS = {
  'not-configured': 'オンラインランキングはまだ準備中です',
  week: 'この週のチャレンジは受付が終わりました（今週と先週の分だけ登録できる）',
  name: '名前を入れてください',
  'too-many': '登録が多すぎます。しばらくしてから試してください',
};
const errorText = (code, status, what = '登録') => ERRORS[code] || (status ? `${what}できませんでした（${status}）` : 'サーバーにつながりませんでした');

export async function fetchRanking(week = weekKey()) {
  try {
    const res = await fetch(`${API}?week=${encodeURIComponent(week)}&player=${playerId()}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: errorText(body.error, res.status, 'ランキングを読み込み') };
    return body;
  } catch {
    return { error: errorText() };
  }
}

export async function submitScore(entry) {
  try {
    const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...entry, player: playerId() }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return { error: errorText(body.error, res.status) };
    return body;
  } catch {
    return { error: errorText() };
  }
}

// 順位表（上位50人）。自分の順位も出す
export function rankingList(data) {
  if (data.error) return [h('p', { class: 'empty' }, data.error)];
  const rows = data.entries.length
    ? data.entries.map((r, i) => h('div', { class: 'card row' }, h('div', { class: `rank r${r.rank}` }, r.rank), h('div', { class: 'grow' }, h('div', { class: 'name' }, `${i + 1}位 ${r.name}　${yenFmt(r.netWorth)}`), h('small', {}, `${r.ending}／${r.stage || ''}／${r.title || ''}`))))
    : [h('p', { class: 'empty' }, 'まだ誰も登録していない。一番乗りのチャンス')];
  const me = data.me?.position ? h('p', { class: 'note online-me' }, `あなたの順位：${data.me.position}位／${data.me.total}人（自己ベスト ${yenFmt(data.me.best)}）`) : null;
  return [me, ...rows];
}

// エンディングの「オンラインランキングに登録」欄
export function submitBox(entry) {
  const input = h('input', { class: 'online-name', type: 'text', maxlength: String(NAME_MAX), placeholder: `名前（${NAME_MAX}文字まで）`, value: savedName(), 'aria-label': 'ランキングに出す名前' });
  const out = h('div', { class: 'online-out' });
  const btn = h('button', {
    class: 'btn primary',
    onclick: async () => {
      const name = input.value.trim();
      if (!name) return toast('名前を入れてください', 'bad');
      store.set(NAME_KEY, name);
      btn.disabled = true;
      btn.textContent = '送信中…';
      const r = await submitScore({ ...entry, name });
      btn.disabled = false;
      btn.textContent = '登録する';
      if (r.error) {
        out.replaceChildren(h('p', { class: 'bad' }, r.error));
        return;
      }
      out.replaceChildren(h('p', { class: 'good' }, r.improved ? `登録した！ いま ${r.position}位／${r.total}人` : `自己ベスト（${yenFmt(r.best)}）のほうが上なので、そちらが残っている。いま ${r.position}位／${r.total}人`));
      const data = await fetchRanking(entry.week);
      out.append(...rankingList(data).slice(1, 11));
    },
  }, '登録する');
  return h('div', { class: 'online-box' },
    h('div', { class: 'sub' }, `週替わりチャレンジ（${weekRange()}）オンラインランキング`),
    h('p', { class: 'note' }, '同じ週に遊んだ人は、みんな同じ相場・同じ出来事から始まっている。名前と結果（純資産・END・称号）が公開される。'),
    h('div', { class: 'online-form' }, input, btn),
    out,
  );
}
