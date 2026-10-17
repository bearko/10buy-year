// 期間限定フェア（data/live.js）をゲームの状態に反映する。
// 現実の日付はエンジンでは読まない（決定性のため）。UI が日付から決めたフェアの id を週のはじめに渡す
import { LIVE_MAP, liveRange } from '../data/live.js';
import { productOf } from '../data/products.js';
import { info, sfx, talk } from './steps.js';

const isChallenge = (s) => !!(s.daily || s.weekly);

// 開いているフェアを切り替えて、知らせの演出を返す
export function syncLive(s, eventId) {
  const id = isChallenge(s) ? null : eventId && LIVE_MAP[eventId] ? eventId : null;
  const cur = s.live?.id || null;
  if (cur === id) return [];
  const steps = [];
  if (cur) {
    s.liveDone = { ...(s.liveDone || {}), [cur]: s.week };
    const p = productOf(LIVE_MAP[cur].pid);
    steps.push(info(`${LIVE_MAP[cur].name}が終わった`, [`「${p.name}」はもう仕入れられない`, p.after >= 1 ? '限定品として、これから値上がりするかもしれない' : '季節外れになり、相場は下がっていきそう'], p.after >= 1 ? 'good' : 'bad'));
  }
  s.live = id ? { id, week: s.week } : null;
  if (id) {
    const ev = LIVE_MAP[id];
    const p = productOf(ev.pid);
    steps.push(
      sfx('hint'),
      info(`期間限定：${ev.name}（${liveRange(ev)}）`, [`限定の「${p.name}」（${p.genre}）が、店とネットに定価で並ぶ`, '現実の季節に合わせたフェア。期間が終わると仕入れられなくなる'], 'good'),
      talk('mine', ev.talk, 'pointer'),
    );
  }
  return steps;
}

// この商品が、このセーブで出回ったことがあるか（フェア中か、終わったあと）
export const liveKnown = (s, p) => p.kind !== 'live' || s.live?.id === p.live || s.liveDone?.[p.live] !== undefined;
export const liveActive = (s, p) => p.kind === 'live' && s.live?.id === p.live;
