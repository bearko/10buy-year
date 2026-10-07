// セリフの色分け：金額・このゲームの言葉・転売の専門用語（data/glossary.js）
import { GAME_WORDS, TERM_MAP, TERMS } from '../data/glossary.js';
import { h } from './dom.js';

const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const MONEY = '[¥￥][\\d,]+|[+\\-−]?[\\d,]+(?:\\.\\d+)?(?:万|億)?円';
const WORDS = [...GAME_WORDS, ...TERMS.map((t) => t.word)].sort((a, b) => b.length - a.length);
const RE = new RegExp(`(${MONEY})|(${WORDS.map(esc).join('|')})`, 'g');
const GAME = new Set(GAME_WORDS);

// 文を「ふつう／金額／ゲームの言葉／専門用語」の区切りに分ける
export function segments(text) {
  const out = [];
  let last = 0;
  for (const m of String(text).matchAll(RE)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index) });
    const kind = m[1] ? 'money' : GAME.has(m[2]) ? 'game' : 'term';
    out.push({ text: m[0], kind, word: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last) });
  return out;
}

const span = (seg) => (seg.kind ? h('span', { class: `hl-${seg.kind}` }, seg.text) : document.createTextNode(seg.text));

// 色分けしたノード（一度に出す）
export const marked = (text) => segments(text).map(span);

// 文の中に出てきた専門用語（重複なし）
export const termsIn = (text) => [...new Set(segments(text).filter((x) => x.kind === 'term').map((x) => x.word))].map((w) => TERM_MAP[w]);

// 1文字ずつ出すとき：区切りごとの入れ物を先に作り、そこへ文字を足していく
export function typeTarget(el, text) {
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
      segs.forEach((seg, i) => { nodes[i].textContent = seg.text; });
    },
  };
}
