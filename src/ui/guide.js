// 用語集と遊び方（メニューからいつでも開ける）。用語は data/glossary.js の解説をそのまま使う
import { TERMS } from '../data/glossary.js';
import { getLang } from '../i18n/index.js';
import { h } from './dom.js';
import { openModal } from './modal.js';

export function glossaryModal() {
  let q = '';
  const en = getLang() === 'en';
  const list = TERMS.map((t) => (en ? { word: t.en, desc: t.enDesc } : { word: t.word, desc: t.desc }));
  return openModal('用語集', (body, api) => {
    const input = h('input', { class: 'gl-search', type: 'search', placeholder: '言葉で探す', value: q, oninput: (e) => { q = e.target.value; draw(); } });
    const box = h('div', { class: 'gl-list' });
    const draw = () => {
      const k = q.trim().toLowerCase();
      const hit = list.filter((t) => !k || t.word.toLowerCase().includes(k) || t.desc.toLowerCase().includes(k));
      box.replaceChildren(...(hit.length ? hit.map((t) => h('div', { class: 'gl-row' }, h('b', {}, t.word), h('p', {}, t.desc))) : [h('p', { class: 'empty' }, '見つからない')]));
    };
    body.append(h('p', { class: 'note' }, 'セリフの中の色つきの言葉は、タップするとその場で解説が出る。'), input, box);
    draw();
    void api;
  }).closed;
}

// 遊び方：チュートリアルで教わることの要点
const GUIDE = [
  ['1週の流れ', ['週のはじめにお知らせを読み、行動を選ぶ（ステージ2からは夜にもうひと仕事できる）。', '週末に出品していた品が売れ、受信トレイに届く。売上金は翌週に入金される。', '月末に決算と、借金の最低返済がある。']],
  ['仕入れ', ['「仕入れ」から、家の中を探す・店舗せどり・電脳せどりなどで品を集める。', '値札の下の帯で、見立て（相場の見込み）と値段の割合、見込み利益を見て「買うか、買わないか」を決める。', '店舗せどりでは閉店までの時間で店を回る。「売れた値段を調べる」で本当の相場がわかる。']],
  ['出品と販売', ['在庫画面で売り先と値段を決めて出品する。相場より安いほど早く売れ、高いほど売れにくい。', '出品枠と置き場には限りがある。長く売れない品は値下げするか、即決買取で現金に戻す。', '売れたら梱包・発送で体力を使う。体力が足りないと発送が遅れ、評価が下がる。']],
  ['お金', ['月末に借金の最低返済額を払う。現金が足りないと遅延損害金がかかり、取り立てが来る。', 'カードの締め日は月の第3週の終わり。それまでの利用分は翌月末、月の最終週の利用分は翌々月末に引き落とされる（請求のお知らせは2週前に届く）。足りない分はリボ払いになり、借金に上乗せされる。']],
  ['体力と体調', ['行動ごとに体力を使う。「休む」で回復する。', '体力が少ないまま重い行動をすると体調を崩し、しばらく休むしかなくなる。']],
  ['成長', ['行動すると経験点がたまる。経験点で基礎能力（目利き・仕入れ・出品・交渉・梱包）を上げる。', 'スキルツリーで新しい行動や便利な仕組みを開く。', 'ステージの目標を達成すると、副業→専業→法人化…と10年のキャリアが進む。']],
];
export function guideModal() {
  return openModal('遊び方', (body) => {
    body.append(...GUIDE.map(([title, lines]) => h('section', { class: 'gd-sec' }, h('b', {}, title), h('ul', {}, ...lines.map((l) => h('li', {}, l))))));
  }).closed;
}
