import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PRODUCTS, productImage } from '../src/data/products.js';
import { CAST, portraitOf } from '../src/data/cast.js';
import { EVENTS } from '../src/data/events.js';
import { SKILLS, SKILL_MAP } from '../src/data/skills.js';
import { COMMANDS } from '../src/engine/commands.js';
import { createGame } from '../src/engine/state.js';
import { abilityCost, raiseAbility } from '../src/engine/abilities.js';
import { buy, cardAvailable } from '../src/engine/inventory.js';
import { monthEnd, MIN_PAYMENT } from '../src/engine/finance.js';
import { updateMarket, priceOf } from '../src/engine/market.js';
import { TOTAL_WEEKS } from '../src/engine/calendar.js';
import { runGame } from './bot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const exists = (rel) => existsSync(join(ROOT, rel));

test('すべての商品・キャラ・背景の画像が assets にある', () => {
  for (const p of PRODUCTS) assert.ok(exists(productImage(p)), `missing ${productImage(p)}`);
  for (const [key, c] of Object.entries(CAST)) {
    if (c.poses) for (const src of Object.values(c.poses)) assert.ok(exists(src), `${key}: ${src}`);
    else assert.ok(exists(portraitOf(key)), `${key}: ${portraitOf(key)}`);
  }
  for (const cmd of COMMANDS) assert.ok(exists(`assets/backgrounds/${cmd.bg}.jpg`), cmd.bg);
});

test('イベントIDは重複せず、コツの付与先の特殊能力が存在する', () => {
  const ids = EVENTS.map((e) => e.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const sk of SKILLS) if (sk.kind === 'gold') assert.ok(CAST[sk.hero], `${sk.id} の仲間 ${sk.hero}`);
  assert.ok(SKILL_MAP.tonchi && SKILL_MAP.serial_memo);
});

test('能力は上げるほどコストが増え、経験点が足りなければ上がらない', () => {
  const s = createGame(1);
  assert.ok(abilityCost('eye', 80).info > abilityCost('eye', 20).info);
  s.exp = { info: 0, act: 0, tech: 0, social: 0, mind: 0 };
  assert.equal(raiseAbility(s, 'eye', 1), 0);
  s.exp.info = 100;
  s.exp.mind = 100;
  assert.ok(raiseAbility(s, 'eye', 3) === 3);
  assert.equal(s.abilities.eye, 23);
});

test('仕入れ：現金とカード枠の範囲でしか買えない', () => {
  const s = createGame(2);
  const offer = { oid: 1, pid: 'boots', price: 9000, maxQty: 3, points: 0, fakeRate: 0 };
  assert.equal(buy(s, { ...offer }, 1, 'cash').ok, true);
  assert.equal(s.cash, 100000 - 9000);
  const big = { ...offer, price: 400000, maxQty: 2 };
  assert.equal(buy(s, { ...big }, 1, 'cash').ok, false);
  assert.equal(buy(s, { ...big }, 1, 'card').ok, true);
  assert.equal(cardAvailable(s), 100000);
  assert.equal(buy(s, { ...big }, 1, 'card').ok, false);
});

test('月末：返済できなければ滞納、3回で債務整理', () => {
  const s = createGame(3);
  s.cash = MIN_PAYMENT;
  monthEnd(s);
  assert.equal(s.cash, 0);
  assert.equal(s.delinquency, 0);
  for (let i = 0; i < 3; i++) monthEnd(s);
  assert.equal(s.delinquency, 3);
  assert.equal(s.over, 'bankrupt');
});

test('限定品の相場は発売後に下がり、再販があればさらに下がる', () => {
  const s = createGame(4);
  const heiho = PRODUCTS.find((p) => p.id === 'heiho');
  while (s.week < heiho.release) {
    s.week++;
    updateMarket(s);
  }
  const atRelease = priceOf(s, 'heiho');
  for (let i = 0; i < 15; i++) {
    s.week++;
    updateMarket(s);
  }
  assert.ok(priceOf(s, 'heiho') < atRelease, `${priceOf(s, 'heiho')} < ${atRelease}`);
});

test('同じシードなら同じ結果になる（リプレイ可能）', () => {
  const a = runGame(777).result;
  const b = runGame(777).result;
  assert.deepEqual(a, b);
});

test('自動プレイで48週（またはゲームオーバー）まで破綻なく進む', () => {
  for (let seed = 1; seed <= 12; seed++) {
    const { s, result } = runGame(seed * 104729);
    assert.ok(s.over, `seed ${seed} not finished`);
    assert.ok(s.week <= TOTAL_WEEKS);
    for (const v of [s.cash, s.debt, s.points, s.stamina, s.rating, s.hate, result.netWorth, ...Object.values(s.stats).filter((x) => typeof x === 'number')]) {
      assert.ok(Number.isFinite(v), `seed ${seed}: non-finite value`);
    }
    assert.ok(s.stamina >= 0 && s.stamina <= s.maxStamina);
    assert.ok(s.inventory.every((u) => PRODUCTS.some((p) => p.id === u.pid)));
    assert.ok(result.ending.title);
  }
});
