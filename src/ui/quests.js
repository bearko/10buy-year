// ミッション画面：引き受けているミッションの進み具合と報酬。「やってみる」でその機能の画面へ案内する
import { portraitOf, CAST } from '../data/cast.js';
import { dropQuest, MAX_ACTIVE, questRows, questsDone, QUEST_WEEKS, rewardText } from '../engine/quests.js';
import { h } from './dom.js';
import { openModal } from './modal.js';

const GUIDE_LABEL = { biz: 'メニュー →「経営」を開く', rivals: 'メニュー →「業界の動き」を開く', deal: 'メニュー →「取引の対応」を開く', collection: 'メニュー →「コレクション」を開く', inv: '「在庫」を開く' };

// 閉じたとき、案内先（guide）を選んでいればそれを返す
export function questsModal(s) {
  let go = null;
  for (const q of s.quests?.active || []) q.fresh = false;
  const m = openModal('ミッション', (body, api) => {
    const rows = questRows(s);
    body.append(h('p', { class: 'note' }, `お金の目標とは別の、小さな目標。報酬は経験点や新しい仕入れ先。同時に${MAX_ACTIVE}つまで。`));
    if (!rows.length) {
      body.append(h('p', { class: 'empty' }, 'いまのミッションはない。マインからの次の話を待とう。店で頭に「！」が出ている人に話しかけると、頼みごとをされることもある。'));
    }
    for (const r of rows) {
      const d = r.def;
      const pct = Math.round((r.now / r.target) * 100);
      const unit = d.unit || (d.kind === 'state' ? '' : '');
      body.append(h('div', { class: 'quest-card' },
        h('div', { class: 'quest-top' },
          h('img', { src: portraitOf(d.from, d.from === 'mine' ? 'pointer' : 'idle'), alt: '' }),
          h('div', {},
            h('small', {}, `${CAST[d.from]?.name || ''}から`),
            h('b', {}, d.title))),
        h('p', { class: 'quest-desc' }, d.desc),
        h('div', { class: 'quest-prog' },
          h('div', { class: 'quest-bar' }, h('i', { style: { width: `${pct}%` } })),
          h('span', {}, d.kind === 'state' ? (r.now >= r.target ? 'できた' : 'まだ') : `${r.now.toLocaleString('ja-JP')}${unit} / ${r.target.toLocaleString('ja-JP')}${unit}`)),
        h('div', { class: 'quest-reward' }, `報酬：${rewardText(d)}`, h('small', {}, `あと${Math.max(0, QUEST_WEEKS - (s.week - r.week))}週`)),
        h('div', { class: 'quest-btns' },
          d.guide ? h('button', { class: 'btn small primary', onclick: () => { go = d.guide; api.close(); } }, `やってみる：${GUIDE_LABEL[d.guide] || '開く'}`) : null,
          h('button', { class: 'btn small', onclick: () => { dropQuest(s, r.id); api.refresh(); } }, 'あきらめる')),
      ));
    }
    if (questsDone(s)) body.append(h('p', { class: 'note' }, `これまでに達成したミッション：${questsDone(s)}個`));
  });
  return m.closed.then(() => go);
}
