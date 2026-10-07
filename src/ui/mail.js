// メールボックス。売れた知らせ・オークションの結果・抽選の結果は、実際の転売と同じようにメールで届く。
// 週のはじめにメールアプリを開くと、新着が1通ずつ落ちてくる。タップすると本文が読める
import { productOf } from '../data/products.js';
import { PLATFORMS } from '../engine/inventory.js';
import { playSe } from './audio.js';
import { $, h, yenFmt } from './dom.js';

const SPAM = [
  { from: 'GUM銀行 セキュリティ', subject: '【重要】あなたのGUMが凍結されました', body: 'こちらのリンクからログインして本人確認を…（どう見ても詐欺メールだ。消しておこう）' },
  { from: '相場大予言サロン', subject: '【残り3席】来月の値上がり品リストを公開します', body: 'ノストラダムス先生の予言は的中率99%（当社比）。月額29,800円。' },
  { from: 'サトシ・ナカモト', subject: 'Re: Re: 例のコインの件', body: '覚えているかい？ チャートは君を待っているよ。' },
  { from: '五右衛門卸', subject: '出所は聞かないで。今週の激安ロット', body: '箱なし・説明書なし・出所なし。ご注文はこのメールに返信で。' },
];

// 今週の取引からメールを組み立てる
export function salesMails(st) {
  const mails = [];
  for (const x of st.sold) {
    const pf = PLATFORMS[x.platform]?.name || '販売サイト';
    const p = productOf(x.pid);
    mails.push({
      from: pf,
      subject: x.platform === 'auc' ? `【${pf}】落札されました：${p.name}` : `【${pf}】商品が購入されました：${p.name}`,
      body: `「${p.name}」が ${yenFmt(x.price)} で${x.platform === 'auc' ? '落札' : '購入'}されました。発送をお願いします。（入金予定 ${yenFmt(x.net)}）`,
      tone: 'good',
    });
  }
  for (const x of st.auctionsUnsold) {
    const p = productOf(x.pid);
    mails.push({ from: 'ミィーム', subject: `【ミィーム】オークションが終了しました：${p.name}`, body: x.bidders ? '最低落札価格に届かず、落札者はいませんでした。' : '入札はありませんでした。再出品できます。', tone: 'bad' });
  }
  if (mails.length && Math.random() < 0.35) mails.splice(Math.floor(Math.random() * (mails.length + 1)), 0, { ...SPAM[Math.floor(Math.random() * SPAM.length)], tone: 'spam' });
  return mails;
}

export function mailbox(mails, { title = '受信トレイ', button = 'まとめて確認する', quick = false } = {}) {
  return new Promise((resolve) => {
    const start = 6 * 60 + 40 + Math.floor(Math.random() * 30);
    let m = start;
    const times = mails.map(() => {
      m += 2 + Math.floor(Math.random() * 25);
      return `${Math.floor(m / 60)}:${String(m % 60).padStart(2, '0')}`;
    });
    const read = new Set();
    const root = h('div', { class: `mailbox ${quick ? 'quick' : ''}` });
    const done = () => {
      root.remove();
      window.removeEventListener('keydown', onKey);
      resolve();
    };
    const onKey = (e) => { if (e.key === 'Escape' || e.key === 'Enter') done(); };
    // 一度だけ組み立てる（読んだときに作り直すと、落ちてくる演出がもう一度始まってしまう）
    const count = h('span', { class: 'mb-count' }, `未読 ${mails.length}件`);
    const rows = mails.map((m, i) => {
      const row = h('button', { class: `mb-row ${m.tone || ''}`, style: { animationDelay: `${quick ? 0 : 0.35 + i * 0.12}s` } },
        h('div', { class: 'mb-top' }, h('span', { class: 'mb-from' }, m.from), h('small', {}, times[i])),
        h('div', { class: 'mb-subj' }, m.subject));
      row.onclick = () => {
        if (read.has(i)) return;
        read.add(i);
        row.classList.add('read');
        row.append(h('div', { class: 'mb-body' }, m.body));
        count.textContent = `未読 ${mails.length - read.size}件`;
      };
      return row;
    });
    root.append(h('div', { class: 'mb-win' },
      h('header', { class: 'mb-head' }, h('b', {}, title), count),
      h('div', { class: 'mb-new' }, h('i', { class: 'mb-env' }, '✉'), `新着メール ${mails.length}件`),
      h('div', { class: 'mb-list' }, ...rows),
      h('div', { class: 'mb-foot' }, h('button', { class: 'btn primary', onclick: done }, button))));
    window.addEventListener('keydown', onKey);
    $('#modal-root').append(root);
    playSe('hint');
  });
}
