// セリフの色分け：金額・このゲームの言葉・転売の専門用語（data/glossary.js）。英語版では訳してから色分けする
import { GAME_WORDS, GAME_WORDS_EN, TERMS } from '../data/glossary.js';
import { isEn, tr } from '../i18n/index.js';
import { h } from './dom.js';

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONEY_JA = '[¥￥][\\d,]+|[+\\-−]?[\\d,]+(?:\\.\\d+)?(?:万|億)?円';
const MONEY_EN = '[+\\-−]?[¥￥][\\d,]+(?:\\.\\d+)?(?:k|M)?';

// 言語ごとの、言葉の一覧と正規表現（はじめて使うときに作る）
let tables = null;
function table() {
  const en = isEn();
  if (tables?.en === en) return tables;
  const game = en ? GAME_WORDS_EN : GAME_WORDS;
  const terms = new Map(TERMS.map((t) => (en ? [t.en, { word: t.en, desc: t.enDesc }] : [t.word, { word: t.word, desc: t.desc }])));
  const words = [...game, ...terms.keys()].sort((a, b) => b.length - a.length);
  // 英語は単語の途中で当たらないように、前後に文字がないことを確かめる
  const w = words.map(esc).join('|');
  const re = new RegExp(en ? `(${MONEY_EN})|(?<![A-Za-z])(${w})(?![a-z])` : `(${MONEY_JA})|(${w})`, en ? 'gi' : 'g');
  tables = { en, re, game: new Set(game.map((x) => x.toLowerCase())), terms: new Map([...terms].map(([k, v]) => [k.toLowerCase(), v])) };
  return tables;
}

// 文を「ふつう／金額／ゲームの言葉／専門用語」の区切りに分ける
export function segments(text) {
  const { re, game } = table();
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const kind = m[1] ? 'money' : game.has(m[2].toLowerCase()) ? 'game' : 'term';
    out.push({ text: m[0], kind, word: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const span = (seg) => (seg.kind ? h('span', { class: `hl-${seg.kind}` }, seg.text) : document.createTextNode(seg.text));

// 色分けしたノード（一度に出す）
export const marked = (text) => segments(tr(text)).map(span);

// 文の中に出てきた専門用語（重複なし）
export function termsIn(text) {
  const { terms } = table();
  return [...new Set(segments(tr(text)).filter((x) => x.kind === 'term').map((x) => x.word.toLowerCase()))].map((w) => terms.get(w));
}

// 1文字ずつ出すとき：区切りごとの入れ物を先に作り、そこへ文字を足していく
export function typeTarget(el, text) {
  text = tr(text);
  const segs = segments(text);
  el.textContent = '';
  const nodes = segs.map((seg) => {
    const n = seg.kind ? h('span', { class: `hl-${seg.kind}` }) : document.createTextNode('');
    el.append(n);
    return n;
  });
  let si = 0;
  let ci = 0;
  return {
    total: text.length,
    // 次の1文字を足す。最後まで出したら false
    step() {
      while (si < segs.length && ci >= segs[si].text.length) {
        si++;
        ci = 0;
      }
      if (si >= segs.length) return false;
      ci++;
      nodes[si].textContent = segs[si].text.slice(0, ci);
      return true;
    },
    finish() {
      segs.forEach((seg, i) => {
        nodes[i].textContent = seg.text;
      });
    },
  };
}
