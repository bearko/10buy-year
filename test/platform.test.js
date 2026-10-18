// bearko.games 共通基盤（総合スコア）に送る成績
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earnedTrophies, reportScore, reportTrophies, resetTrophiesForTest, rtaAbort, rtaPendingCheckpoints, rtaProgress, rtaStart, scoreMetrics } from '../src/platform.js';

test('10 年遊び切ったら years は 10、途中で終わったら終えた年数', () => {
  assert.equal(scoreMetrics({ over: 'timeup', week: 480, difficulty: 'hard' }, 5e7).years, 10);
  assert.deepEqual(scoreMetrics({ over: 'bankrupt', week: 150 }, -2e6), { years: 3, netWorth: -2000000, difficulty: 'normal', ending: 'bankrupt', daily: null, weekly: null, legacy: null, mentor: false });
});

test('SDK がなくても例外を出さない', () => {
  assert.doesNotThrow(() => reportScore(scoreMetrics({ over: 'timeup', week: 480 }, 1)));
});

test('前の周からの継承（継承スキルと師匠）を記録する', () => {
  const m = scoreMetrics({ over: 'timeup', week: 480, legacy: 'cap_sales', mentor: { name: 'A' } }, 5e7);
  assert.equal(m.legacy, 'cap_sales');
  assert.equal(m.mentor, true);
});

const base = { flags: {}, stats: { soldUnits: 0 }, stage: 1, tutorial: 0 };
test('アチーブメント：はじめは何もない。セーブに残る値から判定する（docs/17）', () => {
  assert.deepEqual(earnedTrophies(base), []);
  assert.deepEqual(earnedTrophies({ ...base, tutorial: 999 }), ['10buy.tutorial'], 'チュートリアルを終えた');
  assert.deepEqual(earnedTrophies({ ...base, flags: { tutorialDone: true } }), ['10buy.tutorial'], '以前のセーブのフラグでも');
  assert.deepEqual(earnedTrophies({ ...base, stats: { soldUnits: 1 } }), ['10buy.firstsale']);
  assert.deepEqual(earnedTrophies({ ...base, quests: { active: [], done: ['a'] } }), ['10buy.quest1']);
  assert.deepEqual(earnedTrophies({ ...base, quests: { active: [], done: Array.from({ length: 10 }, (_, i) => `q${i}`) } }), ['10buy.quest1', '10buy.quest10']);
  assert.deepEqual(earnedTrophies({ ...base, collection: [{ ext: 1 }] }), ['10buy.collection']);
  assert.deepEqual(earnedTrophies({ ...base, stage: 2 }), ['10buy.stage2']);
  assert.deepEqual(earnedTrophies({ ...base, stage: 3 }), ['10buy.stage2', '10buy.stage3']);
  assert.deepEqual(earnedTrophies({ ...base, stage: 4 }), ['10buy.stage2', '10buy.stage3', '10buy.stage4']);
  // 美術館を開いたあとでコレクションを手放していても、コレクションは買ったことがある
  assert.deepEqual(earnedTrophies({ ...base, stage: 5, collection: [], museum: { opened: 300 } }), ['10buy.collection', '10buy.stage2', '10buy.stage3', '10buy.stage4', '10buy.stage5', '10buy.museum']);
  assert.ok(!earnedTrophies({ ...base, stage: 5, stats: { soldUnits: 9999 } }).includes('10buy.visit'), '来訪は SDK が送る');
});

test('アチーブメント：完済・1,000 個・ステージ 5 は遊んでいる途中で、クリアと S ランクはエンディングで', () => {
  assert.deepEqual(earnedTrophies({ flags: { debtFree: 120 }, stats: { soldUnits: 1000 }, stage: 5 }), ['10buy.firstsale', '10buy.stage2', '10buy.debtfree', '10buy.stage3', '10buy.stage4', '10buy.sold1000', '10buy.stage5']);
  assert.deepEqual(earnedTrophies({ ...base, over: 'timeup' }, { rank: 'S' }), ['10buy.clear', '10buy.rank_s']);
  assert.deepEqual(earnedTrophies({ ...base, over: 'exit' }, { rank: 'A' }), ['10buy.clear'], '事業売却での引退もクリア');
  assert.deepEqual(earnedTrophies({ ...base, over: 'bankrupt' }, { rank: 'G' }), [], '途中で終わったらクリアではない');
  assert.deepEqual(earnedTrophies({ ...base, over: 'timeup' }), [], '最終査定がなければクリアは送らない');
});

test('アチーブメントは同じプレイで 1 回だけ送り、失敗したら次の機会に送り直す', async () => {
  resetTrophiesForTest();
  const calls = [];
  let ok = false;
  globalThis.window = { BearkoGames: { unlockTrophy: (id) => { calls.push(id); return Promise.resolve({ ok }); } } };
  try {
    const s = { ...base, flags: { debtFree: 10 } };
    await reportTrophies(s);
    assert.deepEqual(s.trophies, [], '失敗したので覚えない');
    ok = true;
    reportTrophies(s);
    await reportTrophies(s);
    assert.deepEqual(calls, ['10buy.debtfree', '10buy.debtfree']);
    assert.deepEqual(s.trophies, ['10buy.debtfree']);
  } finally {
    delete globalThis.window;
  }
});

test('アチーブメントは 1 つずつ順に送る（前の返事を待ってから次）', async () => {
  resetTrophiesForTest();
  const log = [];
  let inFlight = 0;
  globalThis.window = { BearkoGames: { unlockTrophy: (id) => {
    inFlight++;
    log.push([id, inFlight]);
    return new Promise((res) => setTimeout(() => { inFlight--; res({ ok: true }); }, 2));
  } } };
  try {
    const s = { ...base, stage: 3, stats: { soldUnits: 5 } };
    await reportTrophies(s);
    assert.deepEqual(log.map((x) => x[0]), ['10buy.firstsale', '10buy.stage2', '10buy.stage3']);
    assert.ok(log.every((x) => x[1] === 1), '同時に 2 つ以上送らない');
  } finally {
    delete globalThis.window;
  }
});

test('同じ起動で送れた ID は、別のプレイを始めても送り直さない', async () => {
  resetTrophiesForTest();
  const calls = [];
  globalThis.window = { BearkoGames: { unlockTrophy: (id) => { calls.push(id); return Promise.resolve({ ok: true }); } } };
  try {
    await reportTrophies({ ...base, stats: { soldUnits: 1 } });
    const next = { ...base, stats: { soldUnits: 1 }, stage: 2 };
    await reportTrophies(next);
    assert.deepEqual(calls, ['10buy.firstsale', '10buy.stage2']);
    assert.deepEqual(next.trophies, ['10buy.firstsale', '10buy.stage2'], 'セーブには覚える');
  } finally {
    delete globalThis.window;
  }
});

test('SDK がなくてもアチーブメントで例外を出さない', () => {
  assert.doesNotThrow(() => reportTrophies({ ...base, flags: { debtFree: 1 } }));
});

test('RTA：上がったステージの区切りと、上がった週（SPEC-001 6.18）', () => {
  assert.deepEqual(rtaPendingCheckpoints({ stage: 1, week: 5 }, 1), []);
  assert.deepEqual(rtaPendingCheckpoints({ stage: 2, week: 20, stageWeeks: { 2: 19 } }, 1), [{ id: 'stage2', stage: 2, igtMs: 19 }]);
  assert.deepEqual(rtaPendingCheckpoints({ stage: 2, week: 20, stageWeeks: { 2: 19 } }, 2), [], '送ったものは送らない');
  // 2 つ上がっていたら順に。週の記録がなければいまの週
  assert.deepEqual(rtaPendingCheckpoints({ stage: 5, week: 400, stageWeeks: { 4: 300 } }, 3).map((c) => [c.id, c.igtMs]), [['stage4', 300], ['clear', 400]]);
});

test('RTA：始めて、ステージが上がるたびに送り、ステージ 5 で終わる。別のプレイの state は送らない', async () => {
  const calls = [];
  globalThis.window = { BearkoGames: { rta: {
    start: (o) => { calls.push(['start', o.regulation]); return Promise.resolve({ ok: true, runId: 'r' }); },
    checkpoint: (id, o) => { calls.push([id, o.igtMs]); return Promise.resolve({ ok: true }); },
    abort: () => { calls.push(['abort']); return Promise.resolve({ ok: true }); },
  } } };
  try {
    const s = { stage: 1, week: 0, stageWeeks: {} };
    assert.equal(await rtaStart(s), true);
    rtaProgress(s);
    s.stage = 2; s.stageWeeks[2] = 23; s.week = 24;
    rtaProgress(s);
    rtaProgress(s);
    rtaProgress({ stage: 5, week: 9 }); // ほかのプレイ
    s.stage = 3; s.stageWeeks[3] = 99;
    s.stage = 5; s.stageWeeks[4] = 200; s.stageWeeks[5] = 320;
    rtaProgress(s);
    rtaAbort(); // 終わったあとの中断は送らない
    await new Promise((r) => setTimeout(r, 10));
    assert.deepEqual(calls, [['start', '10buy-stage5'], ['stage2', 23], ['stage3', 99], ['stage4', 200], ['clear', 320]]);

    // ステージ 5 より前に終わったら中断
    calls.length = 0;
    const t = { stage: 1, week: 0 };
    await rtaStart(t);
    rtaAbort();
    rtaProgress({ ...t, stage: 2 });
    assert.deepEqual(calls, [['start', '10buy-stage5'], ['abort']]);
  } finally {
    delete globalThis.window;
  }
});

test('RTA：SDK がない・始められないときは false で、ゲームは止めない', async () => {
  assert.equal(await rtaStart({ stage: 1 }), false);
  globalThis.window = { BearkoGames: { rta: { start: () => Promise.resolve({ ok: false, error: 'network' }) } } };
  try {
    assert.equal(await rtaStart({ stage: 1 }), false);
    assert.doesNotThrow(() => rtaProgress({ stage: 2 }));
  } finally {
    delete globalThis.window;
  }
});
