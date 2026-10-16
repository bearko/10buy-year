// bearko.games 共通基盤への窓口（総合スコア。bearko/mycryptoportfolio の SPEC-002 3.8）
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
  };
}

export function initPlatform(version) {
  const bg = sdk();
  if (!bg) return;
  try {
    Promise.resolve(bg.init({ game: '10buy', version })).catch((e) => console.warn('[platform] init', e));
  } catch (e) {
    console.warn('[platform] init', e);
  }
}

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
