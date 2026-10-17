// bearko.games 共通基盤への窓口（総合スコアとトロフィー。bearko/mycryptoportfolio の SPEC-002 3.8・SPEC-001 9.4）
// SDK（https://bearko.games/sdk/v1.js）が読めない・通信に失敗しても何もしない。ゲームの進行は止めない。
import { YEAR_WEEKS, TOTAL_YEARS } from './engine/calendar.js';

const sdk = () => (typeof window !== 'undefined' ? window.BearkoGames : undefined);

/** 終わったプレイの成績（共通基盤に送る形）。純関数（test/platform.test.js） */
export function scoreMetrics(s, netWorth) {
  const years = s.over === 'timeup' ? TOTAL_YEARS : Math.min(TOTAL_YEARS, Math.floor((s.week || 0) / YEAR_WEEKS));
  return {
    years,
    netWorth: Math.round(netWorth || 0),
    difficulty: s.difficulty || 'normal',
    // 将来の難易度ごとのレギュレーション用（今は点に効かない）
    ending: s.over || null,
    daily: s.daily || null,
    weekly: s.weekly || null,
    // 前の周からの継承：継承スキルの ID と、師匠がついたか（今は記録だけ。点に効かない）
    legacy: s.legacy || null,
    mentor: !!s.mentor,
  };
}

/** いま取れているトロフィー（共通基盤の platform/trophies.js の 10buy.*）。r はエンディングの最終査定。純関数 */
export function earnedTrophies(s, r = null) {
  const ids = [];
  if (s.flags?.debtFree !== undefined) ids.push('10buy.debtfree');
  if ((s.stats?.soldUnits || 0) >= 1000) ids.push('10buy.sold1000');
  if (s.stage >= 5) ids.push('10buy.stage5');
  // 10 年を走り切った（事業売却での引退も含む）
  if (r && (s.over === 'timeup' || s.over === 'exit')) {
    ids.push('10buy.clear');
    if (r.rank === 'S') ids.push('10buy.rank_s');
  }
  return ids;
}

export function initPlatform(version) {
  const bg = sdk();
  if (!bg) return;
  try {
    // 全体チャット（共通基盤 SPEC-004）：右下の 💬 は出さず、横のボタンの列の「チャット」から窓を開く（SDK 1.6.1 の button: false）
    Promise.resolve(bg.init({ game: '10buy', version, chat: { button: false, position: 'bottom-right' } }))
      .then(() => applyChatVisible())
      .catch((e) => console.warn('[platform] init', e));
  } catch (e) {
    console.warn('[platform] init', e);
  }
}

// ---------------------------------------------------------------- 全体チャット（共通基盤 SPEC-004。SDK 1.6.1 から）
// 窓は SDK が描く。ここでは「開ける」「出す・隠す」だけ。スキルツリーとモーダルの最中は隠す（開いていた窓も閉じる）
let chatWanted = true;

/** 横のボタンに「チャット」を出せるか（SDK が読めて、窓を開ける版のとき） */
export function isChatAvailable() {
  const bg = sdk();
  return !!(bg && bg.chat && typeof bg.chat.open === 'function');
}

/** 窓を開く（横のボタンから） */
export function openChat() {
  const bg = sdk();
  if (!bg || !bg.chat || typeof bg.chat.open !== 'function') return;
  try { bg.chat.open(); } catch (e) { console.warn('[platform] chat', e); }
}

function applyChatVisible() {
  const bg = sdk();
  if (!bg || !bg.chat || typeof bg.chat.setVisible !== 'function') return;
  try { bg.chat.setVisible(chatWanted); } catch (e) { console.warn('[platform] chat', e); }
}

/** 窓を出せる（true）／隠す（false。開いていれば閉じる）。SDK がない・古いときは覚えておいて、読めたときにそろえる */
export function setChatVisible(on) {
  chatWanted = !!on;
  applyChatVisible();
}

/** bearko.games 共通のアイコンを選ぶ窓（SDK 1.7.0）。SDK がない・古いときは false */
export function canPickAvatar() {
  const bg = sdk();
  return !!(bg && typeof bg.openAvatarPicker === 'function');
}
export function openAvatarPicker() {
  const bg = sdk();
  if (!bg || typeof bg.openAvatarPicker !== 'function') return false;
  try { bg.openAvatarPicker(); } catch (e) { console.warn('[platform] avatar', e); }
  return true;
}

// モーダルやスキルツリーは重なって開くので、数えて 0 に戻ったときだけ出す
let chatBlockers = 0;
export function blockChat() { chatBlockers++; setChatVisible(false); }
export function unblockChat() { chatBlockers = Math.max(0, chatBlockers - 1); if (chatBlockers === 0) setChatVisible(true); }

/** エンディングで 1 回送る */
export function reportScore(metrics) {
  const bg = sdk();
  if (!bg || typeof bg.submitScore !== 'function') return;
  try {
    Promise.resolve(bg.submitScore(metrics))
      .then((r) => { if (!r || !r.ok) console.warn('[platform] score', r && r.error); })
      .catch((e) => console.warn('[platform] score', e));
  } catch (e) {
    console.warn('[platform] score', e);
  }
}

/** 取れたトロフィーを送る（週のはじめとエンディング）。送ったものは s.trophies に覚えて、同じプレイで送り直さない。失敗したら次の機会に送り直す */
export function reportTrophies(s, r = null) {
  const bg = sdk();
  if (!bg || typeof bg.unlockTrophy !== 'function') return;
  const sent = (s.trophies ||= []);
  const retry = (id, e) => {
    console.warn('[platform] trophy', id, e);
    const i = sent.indexOf(id);
    if (i >= 0) sent.splice(i, 1);
  };
  for (const id of earnedTrophies(s, r)) {
    if (sent.includes(id)) continue;
    sent.push(id);
    try {
      Promise.resolve(bg.unlockTrophy(id))
        .then((x) => { if (!x || !x.ok) retry(id, x && x.error); })
        .catch((e) => retry(id, e));
    } catch (e) {
      retry(id, e);
    }
  }
}
