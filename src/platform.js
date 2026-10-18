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
    // 事業売却（exit）は遊び切ったのと同じに数える（共通基盤 SPEC-002 3.8 v2）
    ending: s.over || null,
    daily: s.daily || null,
    weekly: s.weekly || null,
    // 前の周からの継承：継承スキルの ID と、師匠がついたか（v2 から点の係数になる。継承なしがいちばん高い）
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

// ---------------------------------------------------------------- RTA（共通基盤 SPEC-001 6.18。レギュレーション 10buy-stage5）
// 今週のチャレンジを「⏱ RTA で挑む」で始めると、ステージ 2〜5 に上がった週を区切りとして送る。
// 順位はステージ 5 に着いた週（IGT）で決まるので、igtMs の欄に週をそのまま入れる。
// 計測はこのページの中だけで持つ（再読み込み・つづきから・タイトルに戻ると消える）
export const RTA_REGULATION = '10buy-stage5';
const RTA_CHECKPOINTS = { 2: 'stage2', 3: 'stage3', 4: 'stage4', 5: 'clear' };

/** 届いたステージのうち、まだ送っていない区切り（sent は送り終えたステージ）。IGT は上がった週。純関数 */
export function rtaPendingCheckpoints(s, sent) {
  const out = [];
  for (let st = Math.max(2, (sent | 0) + 1); st <= Math.min(5, s.stage | 0); st++) {
    const week = s.stageWeeks?.[st] ?? s.week;
    out.push({ id: RTA_CHECKPOINTS[st], stage: st, igtMs: Math.max(0, week | 0) });
  }
  return out;
}

let rtaRun = null; // { s, sent, chain }

/** RTA を始められるか（SDK が読めて、計測の関数があるとき） */
export function canRta() {
  const bg = sdk();
  return !!(bg && bg.rta && typeof bg.rta.start === 'function');
}

export const isRtaRunning = () => !!rtaRun;

/** 計測を始める。s はこれから遊ぶプレイ。始められたら true（失敗してもゲームはふつうに遊べる） */
export async function rtaStart(s, timerOffset = 0) {
  rtaAbort();
  if (!canRta()) return false;
  try {
    const r = await sdk().rta.start({ regulation: RTA_REGULATION, timerOffset });
    if (!r || !r.ok) {
      console.warn('[platform] rta start', r && r.error);
      return false;
    }
    rtaRun = { s, sent: s.stage | 0, chain: Promise.resolve() };
    return true;
  } catch (e) {
    console.warn('[platform] rta start', e);
    return false;
  }
}

/** 週ごとに呼ぶ。上がったステージの区切りを順に送る（前の区切りの返事を待ってから次を送る） */
export function rtaProgress(s) {
  const run = rtaRun;
  if (!run || run.s !== s) return;
  for (const cp of rtaPendingCheckpoints(s, run.sent)) {
    run.sent = cp.stage;
    run.chain = run.chain
      .then(() => sdk().rta.checkpoint(cp.id, { igtMs: cp.igtMs }))
      .then((r) => { if (!r || !r.ok) console.warn('[platform] rta checkpoint', cp.id, r && r.error); })
      .catch((e) => console.warn('[platform] rta checkpoint', cp.id, e));
    if (cp.stage >= 5) rtaRun = null; // 最後の区切りで計測が終わる
  }
}

/** 中断（ステージ 5 より前のゲームオーバー・事業売却、タイトルに戻る、別のプレイを始める） */
export function rtaAbort() {
  if (!rtaRun) return;
  rtaRun = null;
  const bg = sdk();
  try {
    if (bg && bg.rta && typeof bg.rta.abort === 'function') Promise.resolve(bg.rta.abort()).catch((e) => console.warn('[platform] rta abort', e));
  } catch (e) {
    console.warn('[platform] rta abort', e);
  }
}
