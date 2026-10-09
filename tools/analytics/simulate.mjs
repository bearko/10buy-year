// プレイログの模擬データ：自動プレイのボット（test/bot.js）に遊ばせて、本物と同じ形の記録を作る。
// 分析レポートの確認用。ボットは画面を開かないので、画面の利用率の欄は空になる。途中でやめる人の分は、週数を打ち切ってまねる。
// 使い方: node tools/analytics/simulate.mjs [プレイ数=40] [出力=analytics-data/sim.jsonl]
import '../../src/engine/turn.js';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { setTelemetryContext, setTelemetrySink } from '../../src/engine/telemetry.js';
import { endingData, gameMeta, PLAYLOG_VERSION, snapshot } from '../../src/engine/playlog.js';
import { availableCommands, availableNightCommands } from '../../src/engine/commands.js';
import { ABILITIES } from '../../src/engine/abilities.js';
import { treeOpen, tutorialDone } from '../../src/engine/tutorial.js';
import { runGame } from '../../test/bot.js';

const N = Number(process.argv[2] || 40);
const OUT = resolve(process.argv[3] || 'analytics-data/sim.jsonl');

let seed = 20261009;
const rand = () => {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 2 ** 32;
};
const id = (n) => Array.from({ length: n }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(rand() * 36)]).join('');
// 何週で遊ぶのをやめるか（序盤で離れる人が多い、という想定の分布）
const stopWeek = () => {
  const r = rand();
  if (r < 0.25) return 1 + Math.floor(rand() * 8);
  if (r < 0.4) return 9 + Math.floor(rand() * 40);
  if (r < 0.55) return 49 + Math.floor(rand() * 190);
  return Infinity;
};

const lines = [];
const start = Date.parse('2026-10-01T20:00:00+09:00') / 1000;
let pid = null;
for (let i = 0; i < N; i++) {
  if (!pid || rand() < 0.6) pid = id(16); // 4割は同じ人の2回目以降
  const tid = id(12);
  let sid = id(10);
  let at = start + Math.floor(rand() * 7 * 86400);
  let batch = [];
  const flush = () => {
    if (batch.length) lines.push(JSON.stringify({ v: PLAYLOG_VERSION, pid, sid, dev: rand() < 0.7 ? 'm-web' : 'd-web', lang: 'ja', ev: batch, rt: at }));
    batch = [];
  };
  const push = (ev) => {
    batch.push({ g: tid, at, ...ev });
    if (batch.length >= 300) flush();
  };
  setTelemetrySink((ev, s) => push(ev.e === 'mon' ? { ...ev, ...snapshot(s) } : ev));
  const seen = new Set();
  let ab = null;
  const opts = {
    tid,
    weeks: stopWeek(),
    route: rand() < 0.15 ? 'dark' : rand() < 0.1 ? 'wash' : 'light',
    difficulty: rand() < 0.2 ? 'easy' : rand() < 0.15 ? 'hard' : 'normal',
    style: rand() < 0.1 ? 'spec:tcg' : undefined,
    onStart: (s) => {
      push({ e: 'new', w: 0, ...gameMeta(s) });
      ab = ABILITIES.map((a) => s.abilities[a.id]);
    },
    onWeek: (s) => {
      // 本物の main.js と同じく、使えるようになった行動・メニューを記録する
      const now = [...availableCommands(s).map((c) => c.id), ...(s.stage >= 2 ? availableNightCommands(s).map((c) => `night:${c.id}`) : []), ...(tutorialDone(s) ? ['ui:quest'] : []), ...(treeOpen(s) ? ['ui:tree', 'ui:ab'] : [])];
      const fresh = now.filter((x) => !seen.has(x));
      fresh.forEach((x) => seen.add(x));
      if (fresh.length) push({ e: 'unl', w: s.week, ids: fresh });
      const cur = ABILITIES.map((a) => s.abilities[a.id]);
      const d = Object.fromEntries(ABILITIES.map((a, j) => [a.id, cur[j] - ab[j]]).filter(([, v]) => v > 0));
      if (Object.keys(d).length) push({ e: 'ab', w: s.week, how: 'bot', d });
      ab = cur;
      // 1週あたり30〜90秒。たまに区切って、別のセッションにする
      at += 30 + Math.floor(rand() * 60);
      if (rand() < 0.08) {
        flush();
        sid = id(10);
        at += 3600 * (2 + Math.floor(rand() * 40));
      }
    },
  };
  const { s, result } = runGame(1000 + i * 7919, undefined, opts);
  if (s.over || s.week >= 480) push({ e: 'end', w: s.week, ...endingData(s, result) });
  flush();
  setTelemetrySink(null);
  setTelemetryContext({ cmd: null, auto: false });
  process.stdout.write(`\r${i + 1}/${N}`);
}
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, `${lines.join('\n')}\n`);
console.log(`\n${OUT} に ${lines.length} 束を書いた`);
