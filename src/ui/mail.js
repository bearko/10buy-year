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
// 取引メッセージ（購入者とのやりとり）。文面は取引ごとに決まる（ゲームの乱数は使わない）
const BUYERS = ['みかん', 'ねこまる', 'たろう', 'ゆうき', 'ぽんず', 'さくら', 'ハル', 'K.T', 'こむぎ', 'まめ'];
const HELLO = ['購入しました。よろしくお願いします！', 'はじめまして、購入させていただきました。', '即購入失礼します！ よろしくお願いします', 'ずっと探していました。よろしくお願いします'];
const THANKS = ['届きました！ きれいな状態でうれしいです。ありがとうございました', '無事に受け取りました。また機会があればよろしくお願いします', '受け取り評価しました。丁寧な梱包ありがとうございました', '届きました。説明どおりの状態でした'];
function tradeChat(x, i) {
  if (['ama', 'black'].includes(x.platform)) return null; // 倉庫からの出荷・裏の取引にはメッセージがない
  const k = (x.uid || 0) * 7 + i * 13 + x.price;
  const at = (arr, n = 0) => arr[(k + n) % arr.length];
  const buyer = at(BUYERS);
  const chat = [
    { who: buyer, text: x.platform === 'auc' ? '落札しました！ よろしくお願いします' : at(HELLO, 1) },
    { me: true, text: x.delayed ? 'ご購入ありがとうございます。発送まで少しお時間をいただきます。' : 'ご購入ありがとうございます。明日、発送いたします。' },
  ];
  if (x.delayed) chat.push({ who: buyer, text: 'まだ発送されていないようですが、大丈夫でしょうか…？' }, { me: true, text: '大変お待たせして申し訳ありません。本日発送いたしました。' });
  chat.push({ who: buyer, text: at(THANKS, 2) });
  return chat;
}

export function salesMails(st) {
  const mails = [];
  st.sold.forEach((x, i) => {
    const pf = PLATFORMS[x.platform]?.name || '販売サイト';
    const p = productOf(x.pid);
    mails.push({
      from: pf,
      subject: x.platform === 'auc' ? `【${pf}】落札されました：${p.name}` : `【${pf}】商品が購入されました：${p.name}`,
      body: `「${p.name}」が ${yenFmt(x.price)} で${x.platform === 'auc' ? '落札' : '購入'}されました。発送をお願いします。（入金予定 ${yenFmt(x.net)}）`,
      chat: tradeChat(x, i),
      tone: 'good',
    });
  });
  if (st.takedowns?.length) {
    mails.push({ from: 'プンシー', subject: '【プンシー】出品を削除しました（ガイドライン違反）', body: `${st.takedowns.map((x) => `「${productOf(x.pid).name}」`).join('')}の説明文に、効能をうたう表現（薬機法に抵触するおそれ）がありました。出品を削除し、警告としました。繰り返すと出品が停止されます。`, tone: 'bad' });
  }
  for (const x of st.authFailed || []) {
    const p = productOf(x.pid);
    mails.push({ from: 'ホンモノ堂', subject: `【ホンモノ堂】鑑定結果のお知らせ：${p.name}`, body: '鑑定の結果、正規品と確認できませんでした。お品物はご返送いたします。（出品は取り消されました）', tone: 'bad' });
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
        if (m.chat) {
          row.append(h('div', { class: 'mb-chat' },
            h('small', { class: 'mb-chat-h' }, '取引メッセージ'),
            ...m.chat.map((c) => h('div', { class: `mb-msg ${c.me ? 'me' : ''}` }, c.me ? null : h('b', {}, c.who), h('span', {}, c.text)))));
        }
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
