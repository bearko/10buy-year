// bearko.games 共通基盤（総合スコア）に送る成績
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scoreMetrics, reportScore } from '../src/platform.js';

test('10 年遊び切ったら years は 10、途中で終わったら終えた年数', () => {
  assert.equal(scoreMetrics({ over: 'timeup', week: 480, difficulty: 'hard' }, 5e7).years, 10);
  assert.deepEqual(scoreMetrics({ over: 'bankrupt', week: 150 }, -2e6), { years: 3, netWorth: -2000000, difficulty: 'normal', ending: 'bankrupt', daily: null, weekly: null });
});

test('SDK がなくても例外を出さない', () => {
  assert.doesNotThrow(() => reportScore(scoreMetrics({ over: 'timeup', week: 480 }, 1)));
});
