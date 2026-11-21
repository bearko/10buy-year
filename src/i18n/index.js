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
  words = null;
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
    // 「{0}{1}」のように隣り合う埋めこみ：正規表現では切れ目が決まらないので、あとで切れ目を探す
    let adj = -1;
    for (let i = 0, ci = 0; i < parts.length; i++) {
      if (!/^\{\d+\}$/.test(parts[i])) continue;
      if (i + 1 < parts.length && /^\{\d+\}$/.test(parts[i + 1]) && adj < 0) adj = ci;
      ci++;
    }
    const re = new RegExp(`^${parts.map((x) => (/^\{\d+\}$/.test(x) ? '([\\s\\S]*?)' : esc(x))).join('')}$`);
    const score = lits.join('').length;
    // 日本語の文字（かな・漢字）がいくつあるか。「{0}円」「{0}：{1}」のように少ないパターンは、文全体を誤って当てはめやすい
    const lit = lits.join('');
    const jpChars = (lit.match(/[\u3040-\u30ff\u3400-\u9fff]/g) || []).length;
    const weak = jpChars < 2 && !(jpChars >= 1 && lit.includes('：'));
    const longest = lits.reduce((a, b) => (b.length > a.length ? b : a));
    const key = longest.slice(0, 2);
    const pat = { re, order, en, score, longest, weak, adj };
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
    .replace(/([\d,]+(?:\.\d+)?)(万|億)/g, (_, n, u) => `¥${big(Number(n.replace(/,/g, '')) * (u === '万' ? 1e4 : 1e8))}`);
}
const big = (v) => (v >= 1e6 ? `${+(v / 1e6).toFixed(2)}M` : v >= 1e3 ? `${+(v / 1e3).toFixed(1)}k` : String(v));

function matchPattern(text, depth) {
  const seen = new Set();
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
    // 「{0}：{1}」のように文字の少ないパターンは、埋めこみが日本語の文なら使わない（文全体を誤って当てはめないように）
    // 文字の少ないパターンでは、埋めこみが辞書やパターンでそのまま訳せるときだけ使う（言葉の置きかえには頼らない）
    const caps = m.slice(1);
    const fill = (vals) => pat.en.replace(/\{(\d+)(?::(man))?\}/g, (_, n, f) => {
      const v = vals[pat.order.indexOf(Number(n))] ?? '';
      return f === 'man' ? `¥${big(Number(String(v).replace(/,/g, '')) * 1e4)}` : v;
    });
    const vals = caps.map((v) => translate(v, depth + 1, pat.weak));
    if (!vals.some((v) => JP.test(v))) return fill(vals);
    // 隣り合う埋めこみは、切れ目をずらして試す
    if (pat.adj >= 0) {
      const both = caps[pat.adj] + caps[pat.adj + 1];
      for (let k = 1; k < both.length && k < 80; k++) {
        const v2 = [...caps];
        v2[pat.adj] = both.slice(0, k);
        v2[pat.adj + 1] = both.slice(k);
        const tv = v2.map((v) => translate(v, depth + 1, true));
        if (!tv.some((v) => JP.test(v))) return fill(tv);
      }
    }
  }
  return null;
}

// 最後の手段：「」の中の名前と、辞書にある短い言葉を、文の中で置きかえる（組み立てた文で、全体のパターンがないとき）
let words = null;
function patchWords(text, depth) {
  let out = text.replace(/「([^「」]+)」/g, (m, inner) => {
    const v = depth < 6 ? translate(inner, depth + 1) : inner;
    return JP.test(v) ? m : `“${v}”`;
  });
  if (!JP.test(out)) return out;
  if (!words) {
    const keys = [...exact.keys()].filter((k) => k.length >= 2 && k.length <= 12 && JP.test(k) && exact.get(k)).sort((a, b) => b.length - a.length);
    words = keys.length ? new RegExp(keys.map(esc).join('|'), 'g') : null;
  }
  if (!words) return out;
  out = out.replace(words, (m, i, all) => {
    const v = exact.get(m);
    const before = i > 0 && /[A-Za-z0-9)]/.test(all[i - 1]) ? ' ' : '';
    const after = /[A-Za-z0-9(]/.test(all[i + m.length] || '') ? ' ' : '';
    return before + v + after;
  });
  return out;
}

function translate(text, depth = 0, strict = false) {
  if (!text || !JP.test(text)) return text;
  const hit = exact.get(text);
  if (hit !== undefined) return hit;
  const ck = strict ? `\u0000${text}` : text;
  if (cache.has(ck)) return cache.get(ck);
  let out = null;
  if (depth < 6) {
    // 前後の空白・記号は外して探す
    const m = /^(\s*)([\s\S]*?)(\s*)$/.exec(text);
    if (m[1] || m[3]) {
      const inner = translate(m[2], depth + 1);
      if (!JP.test(inner)) out = m[1] + inner + m[3];
    }
    if (out === null) out = matchPattern(text, depth);
    // 【見出し】（かっこ）で囲まれた文は、中を訳す
    if (out === null) {
      const w = /^([【（「『(])([\s\S]+)([】）」』)])$/.exec(text);
      if (w) {
        const inner = translate(w[2], depth + 1);
        if (!JP.test(inner)) out = w[1] + inner + w[3];
      }
    }
    // 「1. 」「・」などの頭の飾りを外して訳す
    if (out === null) {
      const p = /^(\s*(?:\d+\.\s+|[・▶✓●○]\s*))([\s\S]+)$/.exec(text);
      if (p) {
        const inner = translate(p[2], depth + 1);
        if (!JP.test(inner)) out = p[1] + inner;
      }
    }
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
  if ((out === null || JP.test(out)) && !strict) out = patchWords(out ?? text, depth);
  out = units(out ?? text);
  if (cache.size > 20000) cache.clear();
  cache.set(ck, out);
  return out;
}

// 小さな札の略字：日本語は頭のn文字、英語は訳した最初の単語（1文字なら頭文字）
export function abbr(text, n) {
  if (lang !== 'en') return text.slice(0, n);
  const en = tr(text);
  return n <= 1 ? en.slice(0, 1) : en.split(/[ ·]/)[0];
}

// テスト用：ブラウザなしで英語の辞書を使う
export function useDict(dict) {
  lang = 'en';
  loadDict(dict);
}

// 英語の文に残った全角の記号を、半角に直す
const PUNCT = [[/：/g, ': '], [/（/g, ' ('], [/）/g, ') '], [/、/g, ', '], [/。/g, '. '], [/【/g, '['], [/】/g, '] '], [/〜/g, '–'], [/？/g, '?'], [/！/g, '!'], [/「/g, '“'], [/」/g, '”'], [/／/g, ' / '], [/・/g, ' · '], [/　/g, ' ']];
export function punct(s) {
  if (!/[：（）、。【】〜？！「」／・　]/.test(s)) return s;
  let out = s;
  for (const [re, v] of PUNCT) out = out.replace(re, v);
  return out.replace(/ {2,}/g, ' ').replace(/ ([).,:!?”\]])/g, '$1').replace(/([(“[]) /g, '$1').replace(/^ | $/g, (m, i) => (i === 0 && /^\s/.test(s)) || (i > 0 && /\s$/.test(s)) ? m : '');
}

export function tr(text) {
  if (lang !== 'en' || typeof text !== 'string') return text;
  return tidy(punct(translate(text)));
}

// 二重の空白と、つながったかぎかっこを整える
const tidy = (s) => s.replace(/(\S) {2,}(?=\S)/g, '$1 ').replace(/”“/g, '” “');

// ---------------- 画面への適用 ----------------
const ATTRS = ['title', 'placeholder', 'aria-label', 'alt'];
const written = new WeakMap(); // テキストノード → 最後に書いた訳

function translateNode(node) {
  if (node.nodeType === 3) {
    // 自分が書いた値なら何もしない（訳しきれず日本語が残っても、書き直しの無限ループにならないように）
    const v = node.nodeValue;
    if (v === written.get(node) || !JP.test(v) || node.parentElement?.closest('[data-no-tr]')) return;
    const out = tidy(punct(translate(v)));
    written.set(node, out);
    if (out !== v) node.nodeValue = out;
    return;
  }
  if (node.nodeType !== 1 || node.hasAttribute('data-no-tr')) return;
  for (const a of ATTRS) {
    const v = node.getAttribute(a);
    if (!v || !JP.test(v)) continue;
    const out = tidy(punct(translate(v)));
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
