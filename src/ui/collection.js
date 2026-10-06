// 百貨店の美術画廊（コレクションを買う）と、コレクション（図鑑・私設美術館）の画面
import { COLLECTION_SERIES } from '../data/collection.js';
import {
  buyPiece, collectionValue, completeSeries, DEPT_RANKS, deptRank, deptSpentYear, MUSEUM_COST, MUSEUM_STAGE, MUSEUM_UPKEEP,
  museumIncome, openMuseum, owned, PIECE_MAP, PIECES, pieceImage, RARITY_NAME, sellPiece, SERIES_BONUS,
} from '../engine/collection.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { confirmBox, openModal, toast } from './modal.js';

// 顧客ランクの表示（いまのランクと、次のランクまで）
function rankBox(s) {
  const r = deptRank(s);
  const next = DEPT_RANKS[r + 1];
  const spent = deptSpentYear(s);
  return h('div', { class: 'stage-box' },
    h('div', { class: 'name' }, `百貨店の顧客ランク：${DEPT_RANKS[r].name}`),
    h('small', { class: 'desc' }, DEPT_RANKS[r].perk || 'まだ特典はない'),
    h('div', { class: 'note' }, next ? `今年の購入額 ${yenFmt(spent)}／「${next.name}」まで ${yenFmt(Math.max(0, next.need - spent))}（${next.perk}）` : `今年の購入額 ${yenFmt(spent)}`),
    s.dept && s.dept.rep < 30 ? h('div', { class: 'warn' }, '外商の評判が落ちていて、ランクが1段下がっている') : null,
  );
}

const pieceCard = (ext, extra, onClick) => {
  const p = PIECE_MAP[ext];
  return h('button', { class: `pc-card r${p.rarity}`, onclick: onClick },
    h('img', { src: pieceImage(ext), alt: '' }),
    h('b', {}, p.name),
    h('small', {}, `${p.seriesName}・${RARITY_NAME[p.rarity]}`),
    extra,
  );
};

export function galleryModal(s, step, onChange) {
  const items = [...step.items];
  return openModal('百貨店の美術画廊', (body, api) => {
    const buy = (it) => {
      if (!buyPiece(s, it)) return toast('お金が足りない', 'bad');
      playSe('buy');
      toast(`「${PIECE_MAP[it.ext].name}」をコレクションに加えた`, 'good');
      items.splice(items.indexOf(it), 1);
      api.refresh();
      onChange?.();
    };
    body.append(
      rankBox(s),
      h('p', { class: 'note' }, '売るためではなく、持っておくための品。コレクションは評価額で純資産に入り、ゆっくり値上がりする。シリーズを5点そろえると、私設美術館の入館料が増える。'),
      items.length
        ? h('div', { class: 'pc-grid' }, ...items.map((it) => pieceCard(it.ext, h('span', { class: 'pc-price' }, yenFmt(it.price)), () => buy(it))))
        : h('p', { class: 'note' }, '今日はこれ以上、気になる品はなかった。'),
      h('small', { class: 'note' }, `現金 ${yenFmt(s.cash)}`),
    );
  }, { closeLabel: '画廊を出る' }).closed;
}

export function collectionModal(s, onChange) {
  return openModal('コレクション', (body, api) => {
    const sell = async (ext) => {
      const c = s.collection.find((x) => x.ext === ext);
      const r = await confirmBox({ title: '手放す', lines: [`「${PIECE_MAP[ext].name}」を画商に売ります。`, `受け取り ${yenFmt(Math.round(c.value * 0.8))}（評価額の8割）`, '外商の評判が下がる'], okLabel: '手放す', danger: true });
      if (!r.ok) return;
      sellPiece(s, ext);
      playSe('coin');
      api.refresh();
      onChange?.();
    };
    const open = () => {
      if (!openMuseum(s)) return toast(s.stage < MUSEUM_STAGE ? `ステージ${MUSEUM_STAGE}から` : (s.collection || []).length < 5 ? 'コレクションが5点以上必要' : 'お金が足りない', 'bad');
      playSe('stageup');
      toast('私設美術館を開いた！', 'good');
      api.refresh();
      onChange?.();
    };
    const have = (s.collection || []).length;
    const done = completeSeries(s).length;
    body.append(
      h('div', { class: 'ledger-grid' },
        row('集めた品', `${have} / ${PIECES.length}点`),
        row('そろったシリーズ', `${done} / ${COLLECTION_SERIES.length}`),
        row('評価額（純資産に入る）', yenFmt(collectionValue(s))),
        row('私設美術館', s.museum ? `月の入館料 ${yenFmt(museumIncome(s))}（維持費 ${yenFmt(MUSEUM_UPKEEP)}）` : '未開館'),
      ),
      s.museum
        ? null
        : h('button', { class: 'btn', onclick: open }, `私設美術館を開く（${yenFmt(MUSEUM_COST)}・ステージ${MUSEUM_STAGE}から・5点以上）`),
      h('p', { class: 'note' }, `美術館を開くと、品の希少度に応じた入館料が毎月入る。シリーズを5点そろえると +${yenFmt(SERIES_BONUS)}/月。品は「外出 → 百貨店で買い物」の美術画廊で手に入る。持っている品をタップすると手放せる。`),
      ...COLLECTION_SERIES.map((sr) => {
        const complete = sr.items.every(([ext]) => owned(s, ext));
        return h('div', { class: `pc-series ${complete ? 'complete' : ''}` },
          h('div', { class: 'sat-top' }, h('b', {}, sr.name), h('small', {}, complete ? 'そろった！' : `${sr.items.filter(([ext]) => owned(s, ext)).length}/5`)),
          h('div', { class: 'pc-row' }, ...sr.items.map(([ext]) => (owned(s, ext)
            ? h('button', { class: `pc-slot r${PIECE_MAP[ext].rarity}`, title: PIECE_MAP[ext].name, onclick: () => sell(ext) }, h('img', { src: pieceImage(ext), alt: PIECE_MAP[ext].name }))
            : h('div', { class: `pc-slot empty r${PIECE_MAP[ext].rarity}` }, h('img', { src: pieceImage(ext), alt: '' }))))),
        );
      }),
    );
  }).closed;
}

function row(label, value) {
  return h('div', { class: 'lg-row' }, h('span', {}, label), h('b', {}, value));
}
