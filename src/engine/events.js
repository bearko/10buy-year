// イベントの抽選と再生
import { EVENTS } from '../data/events.js';
import { chance, weightedPick } from './rng.js';
import { yearOf } from './calendar.js';

// yearly: true のイベントは毎年1回、それ以外は once:false でない限り1周に1回
const seenKey = (s, ev) => (ev.yearly ? `${ev.id}@${yearOf(s.week)}` : ev.id);

function eligible(s, ev, trigger, ctx) {
  if (ev.trigger !== trigger) return false;
  if (ev.cmd && ev.cmd !== ctx?.cmd) return false;
  if (ev.once !== false && s.eventsSeen[seenKey(s, ev)]) return false;
  return ev.cond ? !!ev.cond(s, ctx) : true;
}

function play(s, ev, ctx) {
  const key = seenKey(s, ev);
  s.eventsSeen[key] = (s.eventsSeen[key] || 0) + 1;
  if (ev.yearly) s.eventsSeen[ev.id] = (s.eventsSeen[ev.id] || 0) + 1;
  return ev.play(s, ctx);
}

// calendar は条件を満たすものを全部、それ以外は chance を通ったものから1つ
export function drawEvents(s, trigger, ctx = {}) {
  const cands = EVENTS.filter((ev) => eligible(s, ev, trigger, ctx));
  if (trigger === 'calendar') return cands.flatMap((ev) => play(s, ev, ctx));
  const passed = cands.filter((ev) => chance(s, ev.chance ?? 1));
  if (!passed.length) return [];
  const ev = weightedPick(s, passed, (e) => e.weight ?? 1);
  return play(s, ev, ctx);
}
