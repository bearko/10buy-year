// 英語版：表示の直前に日本語を英語に置きかえる。
// ゲームのコードは日本語のまま書き、訳は src/i18n/en/ に「日本語の元の文 → 英語」で置く（tools/i18n.mjs が元の文を集める）。
// テンプレート文字列 `${n}件` は「{0}件」の形で登録し、埋めこまれた値（商品名・金額など）もそれぞれ訳す。
// DOM に入った文字は MutationObserver で訳すので、画面のコードを1つずつ書きかえなくてよい
export const JP = /[぀-ヿ㐀-鿿！-｠]/;
const LANG_KEY = '10buy-year:lang';

let lang = 'ja';
let exact = new Map();
let buckets = new Map(); // 2文字 → パターン
const cache = new Map();

export const getLang = () => lang;
export const isEn = () => lang === 'en';

export function detectLang() {
  try {
    const q = new URLSearchParams(window.location.search).get('lang');
    if (q === 'en' || q === 'ja') return q;
    const saved = window.localStorage.getItem(LANG_KEY);
    if (saved === 'en' || saved === 'ja') return saved;
  } catch {
    /* noop */
  }
  return /^ja\b/i.test(globalThis.navigator?.language || 'ja') ? 'ja' : 'en';
}

export function setLang(l) {
  try {
    window.localStorage.setItem(LANG_KEY, l);
  } catch {
    /* noop */
  }
  const url = new URL(window.location.href);
  url.searchParams.delete('lang');
  window.location.replace(url.toString());
}

// ---------------- 辞書 ----------------
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

export function loadDict(dict) {
  exact = new Map();
  buckets = new Map();
  cache.clear();
  for (const [ja, en] of Object.entries(dict)) {
    if (en === null) continue; // null：単位の変換だけで済む（「150万円」→「¥1.5M」）
    if (!/\{\d+\}/.test(ja)) {
      exact.set(ja, en);
      continue;
    }
    const parts = ja.split(/(\{\d+\})/).filter((x) => x !== '');
    const lits = parts.filter((x) => !/^\{\d+\}$/.test(x));
    if (!lits.length) continue; // 埋めこみだけのパターンは何にでも当たるので使わない
    const order = parts.filter((x) => /^\{\d+\}$/.test(x)).map((x) => Number(x.slice(1, -1)));
    const re = new RegExp(`^${parts.map((x) => (/^\{\d+\}$/.test(x) ? '([\\s\\S]*?)' : esc(x))).join('')}$`);
    const score = lits.join('').length;
    const longest = lits.reduce((a, b) => (b.length > a.length ? b : a));
    const key = longest.slice(0, 2);
    const pat = { re, order, en, score, longest };
    if (!buckets.has(key)) buckets.set(key, []);
    buckets.get(key).push(pat);
  }
  for (const list of buckets.values()) list.sort((a, b) => b.score - a.score);
}

// 金額・数の単位：「12,000円」→「¥12,000」、「150万円」→「¥1.5M」
function units(text) {
  return text
    .replace(/([+\-−]?)([\d,]+(?:\.\d+)?)(万|億)円/g, (_, sign, n, u) => `${sign}¥${big(Number(n.replace(/,/g, '')) * (u === '万' ? 1e4 : 1e8))}`)
    .replace(/([+\-−]?)([\d,]+)円/g, (_, sign, n) => `${sign}¥${n}`)
    .replace(/([\d.]+)万/g, (_, n) => big(Number(n) * 1e4));
}
const big = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(v));

function matchPattern(text, depth) {
  const seen = new Set();
  let fallback = null;
  const cands = [];
  for (let i = 0; i < text.length; i++) {
    // 2文字の断片と、1文字だけのパターン（「{0}/{1}件」など）
    for (const k of [text.slice(i, i + 2), text[i]]) {
      const list = buckets.get(k);
      if (list) for (const pat of list) if (!seen.has(pat)) {
        seen.add(pat);
        cands.push(pat);
      }
    }
  }
  // 文字の多いパターン（より具体的なもの）から試し、埋めこみまで全部訳せたものを使う
  cands.sort((a, b) => b.score - a.score);
  for (const pat of cands) {
    const m = pat.re.exec(text);
    if (!m) continue;
    const vals = m.slice(1).map((v) => translate(v, depth + 1));
    const out = pat.en.replace(/\{(\d+)\}/g, (_, n) => vals[pat.order.indexOf(Number(n))] ?? '');
    if (!JP.test(out)) return out;
    if (!fallback) fallback = { out, score: pat.score };
  }
  return fallback?.out ?? null;
}

function translate(text, depth = 0) {
  if (!text || !JP.test(text)) return text;
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  if (cache.has(text)) return cache.get(text);
  let out = null;
  if (depth < 6) {
    // 前後の空白・記号は外して探す
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (m[1] || m[3]) {
      const inner = translate(m[2], depth + 1);
      if (!JP.test(inner)) out = m[1] + inner + m[3];
    }
    if (out === null) out = matchPattern(text, depth);
    // 改行・区切りでつながった文は、ばらして訳す
    if (out === null || JP.test(out)) {
      for (const sep of ['\n', '／', ' / ', '、', '・', '　']) {
        if (!text.includes(sep)) continue;
        const joined = text.split(sep).map((x) => translate(x, depth + 1)).join(sep === '、' ? ', ' : sep === '・' ? ' · ' : sep === '／' ? ' / ' : sep === '　' ? ' ' : sep);
        if (!JP.test(joined) || out === null) out = joined;
        if (!JP.test(joined)) break;
      }
    }
  }
  if (out === null) out = units(text);
  else out = units(out);
  if (cache.size > 20000) cache.clear();
  cache.set(text, out);
  return out;
}

export function tr(text) {
  if (lang !== 'en' || typeof text !== 'string') return text;
  return translate(text);
}

// ---------------- 画面への適用 ----------------
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const written = new WeakMap(); // テキストノード → 最後に書いた訳

function translateNode(node) {
  if (node.nodeType === 3) {
    // 自分が書いた値なら何もしない（訳しきれず日本語が残っても、書き直しの無限ループにならないように）
    const v = node.nodeValue;
    if (v === written.get(node) || !JP.test(v) || node.parentElement?.closest('[data-no-tr]')) return;
    const out = translate(v);
    written.set(node, out);
    if (out !== v) node.nodeValue = out;
    return;
  }
  if (node.nodeType !== 1 || node.hasAttribute('data-no-tr')) return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (!v || !JP.test(v)) continue;
    const out = translate(v);
    if (out !== v) node.setAttribute(a, out);
  }
  for (const c of node.childNodes) translateNode(c);
}

export async function initLang() {
  lang = detectLang();
  document.documentElement.lang = lang;
  if (lang !== 'en') return;
  const { EN } = await import('./en/index.js');
  loadDict(EN);
  document.title = '10 buy year!';
  translateNode(document.body);
  new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') translateNode(r.target);
      else if (r.type === 'attributes') translateNode(r.target);
      else for (const n of r.addedNodes) translateNode(n);
    }
  }).observe(document.body, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  const confirm0 = window.confirm.bind(window);
  window.confirm = (m) => confirm0(JP.test(String(m)) ? translate(String(m)) : m);
  const fill = CanvasRenderingContext2D.prototype.fillText;
  CanvasRenderingContext2D.prototype.fillText = function (t, ...rest) {
    return fill.call(this, translate(String(t)), ...rest);
  };
}
