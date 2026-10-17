// bearko.games 共通基盤（総合スコア）に送る成績
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { earnedTrophies, reportScore, reportTrophies, scoreMetrics } from '../src/platform.js';

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

const base = { flags: {}, stats: { soldUnits: 0 }, stage: 1 };
test('トロフィー：完済・1,000 個・ステージ 5 は遊んでいる途中で、クリアと S ランクはエンディングで', () => {
  assert.deepEqual(earnedTrophies(base), []);
  assert.deepEqual(earnedTrophies({ flags: { debtFree: 120 }, stats: { soldUnits: 1000 }, stage: 5 }), ['10buy.debtfree', '10buy.sold1000', '10buy.stage5']);
  assert.deepEqual(earnedTrophies({ ...base, over: 'timeup' }, { rank: 'S' }), ['10buy.clear', '10buy.rank_s']);
  assert.deepEqual(earnedTrophies({ ...base, over: 'exit' }, { rank: 'A' }), ['10buy.clear'], '事業売却での引退もクリア');
  assert.deepEqual(earnedTrophies({ ...base, over: 'bankrupt' }, { rank: 'G' }), [], '途中で終わったらクリアではない');
});

test('トロフィーは同じプレイで 1 回だけ送り、失敗したら次の機会に送り直す', async () => {
  const calls = [];
  let ok = false;
  globalThis.window = { BearkoGames: { unlockTrophy: (id) => { calls.push(id); return Promise.resolve({ ok }); } } };
  try {
    const s = { ...base, flags: { debtFree: 10 } };
    reportTrophies(s);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(s.trophies, [], '失敗したので覚えない');
    ok = true;
    reportTrophies(s);
    reportTrophies(s);
    await new Promise((r) => setTimeout(r, 0));
    assert.deepEqual(calls, ['10buy.debtfree', '10buy.debtfree']);
    assert.deepEqual(s.trophies, ['10buy.debtfree']);
  } finally {
    delete globalThis.window;
  }
});

test('SDK がなくてもトロフィーで例外を出さない', () => {
  assert.doesNotThrow(() => reportTrophies({ ...base, flags: { debtFree: 1 } }));
});
