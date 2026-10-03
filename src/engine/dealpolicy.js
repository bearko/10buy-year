// 取引の対応：値下げ交渉やトラブルに「いつもの答え」を決めておくと、選択肢で止まらずに自動で答える。
// 初期設定ではルーティン中だけ使う（手で遊ぶときは毎回自分で決める）。「いつも使う」にもできる
export const DEAL_POLICIES = {
  nego: {
    name: '値下げ交渉',
    options: [['rule', '金額で決める'], ['sell', 'いつも売る'], ['firm', 'いつも断る'], ['ignore', 'スルー'], ['ask', '毎回決める']],
  },
  claimer: {
    name: 'クレーム（傷がある・半額返金して）',
    options: [['explain', '誠実に説明する'], ['half', '半額返金する'], ['ignore', '無視する'], ['ask', '毎回決める']],
  },
  return: {
    name: '返品の申し出（イメージ違い）',
    options: [['accept', '返品を受け付ける'], ['refuse', '断る'], ['ask', '毎回決める']],
  },
  swap: {
    name: 'すり替え返品',
    options: [['fight', '事務局に相談して争う'], ['refund', '返金に応じる'], ['ask', '毎回決める']],
  },
};

export const DEFAULT_DEAL = { scope: 'routine', nego: 'rule', negoMin: 0.85, claimer: 'explain', return: 'accept', swap: 'fight' };

export const dealCfg = (s) => ({ ...DEFAULT_DEAL, ...(s.settings?.deal || {}) });

export function setDeal(s, key, value) {
  s.settings.deal = { ...dealCfg(s), [key]: value };
}

// 決めておいた答えがあれば、その選択肢の番号を返す（なければ -1）。auto = ルーティン・オートで回している最中か
export function autoPick(s, st, auto) {
  if (!st.policy || !DEAL_POLICIES[st.policy]) return -1;
  const cfg = dealCfg(s);
  if (cfg.scope !== 'always' && !auto) return -1;
  let key = cfg[st.policy];
  if (!key || key === 'ask') return -1;
  if (st.policy === 'nego' && key === 'rule') key = st.ctx && st.ctx.offer >= st.ctx.price * cfg.negoMin ? 'sell' : 'firm';
  return st.options.findIndex((o) => o.key === key);
}
