import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { PRODUCTS, productImage } from '../src/data/products.js';
import { CAST, portraitOf } from '../src/data/cast.js';
import { EVENTS } from '../src/data/events.js';
import { SKILLS, SKILL_MAP } from '../src/data/skills.js';
import { COMMANDS } from '../src/engine/commands.js';
import { createGame } from '../src/engine/state.js';
import { abilityCost, raiseAbility } from '../src/engine/abilities.js';
import { buy, cardAvailable, hardCapacity, listUnits, sellToBuyer, spaceUsed } from '../src/engine/inventory.js';
import { availableCommands, performCommand } from '../src/engine/commands.js';
import { learnSkill, nodeState, nodeVisible, OFF_ROUTE_RATE, skillCost } from '../src/engine/abilities.js';
import { ROUTES, ROUTE_MAP, SKILLS as TREE_SKILLS, TREE_NODES, nodePos } from '../src/data/skills.js';
import { perk, routeLevel } from '../src/engine/perks.js';
import { titleOf } from '../src/engine/ending.js';
import { checkTutorial, MISSIONS } from '../src/engine/tutorial.js';
import { checkPromotion } from '../src/engine/career.js';
import { kpiLevel } from '../src/engine/kpi.js';
import { taxFor } from '../src/engine/finance.js';
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

test('自動プレイで10年（またはゲームオーバー）まで破綻なく進む', () => {
  for (let seed = 1; seed <= 8; seed++) {
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

test('ゲーム内テキストに実在ゲームの名前を出さない', () => {
  const banned = /パワプロ|パワフルプロ野球|サクセス/;
  const files = [];
  const walk = (dir) => {
    for (const f of readdirSync(join(ROOT, dir))) {
      const rel = join(dir, f);
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel);
      else if (/\.(js|html|css)$/.test(f)) files.push(rel);
    }
  };
  walk('src');
  files.push('index.html');
  for (const f of files) assert.ok(!banned.test(readFileSync(join(ROOT, f), 'utf8')), `${f} に実在ゲーム名がある`);
});

test('序盤は行動が絞られていて、チュートリアルで順に解放される', () => {
  const s = createGame(10);
  const ids = () => availableCommands(s).map((c) => c.id);
  assert.ok(!ids().includes('store') && !ids().includes('online') && !ids().includes('lottery'));
  assert.ok(ids().includes('home_search'));
  assert.ok(s.inventory.every((u) => u.home), '最初の在庫は家の不用品だけ');
  assert.equal(nodeState(s, 'eye_calc'), 'available');
  // 1. 家の不用品を出品
  listUnits(s, [s.inventory[0].uid], 'merc', 500);
  checkTutorial(s);
  assert.equal(MISSIONS[s.tutorial].id, 'sell_home');
  // 2. 売れる → 店舗せどりが解放
  s.stats.soldUnits = 1;
  checkTutorial(s);
  assert.ok(ids().includes('store'));
  // 3〜4. 店に行って仕入れる → ミィームが解放
  performCommand(s, 'store');
  assert.ok(s.flags.didStore);
  buy(s, { oid: 99, pid: 'scroll', price: 3300, maxQty: 1, points: 0, fakeRate: 0 }, 1, 'cash');
  checkTutorial(s);
  assert.ok(s.skills.includes('ch_miime'));
  // 5〜6. 仕入れた商品を出品して売る → 利益計算とツリーが解放
  const bought = s.inventory.find((u) => !u.home);
  listUnits(s, [bought.uid], 'auc', 4000);
  s.stats.purchasedSold = 1;
  s.stats.firstFlip = { pid: 'scroll', price: 6000, cost: 3300 };
  checkTutorial(s);
  assert.equal(s.tutorial, MISSIONS.length);
  assert.ok(s.skills.includes('eye_calc'));
});

test('スキルツリー：親・ステージ・コツが揃わないと解放できない', () => {
  const s = createGame(11);
  s.exp = { info: 999, act: 999, tech: 999, social: 999, mind: 999 };
  assert.equal(nodeState(s, 'src_lottery'), 'locked'); // 親の「ポイント通販」が先
  assert.equal(learnSkill(s, 'src_lottery'), false);
  assert.ok(learnSkill(s, 'src_online'));
  assert.ok(learnSkill(s, 'src_lottery'));
  assert.ok(availableCommands(s).some((c) => c.id === 'lottery'));
  s.skills.push('ch_miime');
  assert.equal(nodeState(s, 'ch_amacri'), 'locked'); // ステージ2から
  s.stage = 2;
  assert.ok(learnSkill(s, 'ch_amacri'));
  assert.ok(learnSkill(s, 'photogenic'));
  assert.equal(nodeState(s, 'doyou'), 'locked'); // 偉人のコツが必要
  s.hints.doyou = 1;
  assert.equal(nodeState(s, 'doyou'), 'available');
});

test('スキルツリーの構造：親があり、中心からたどれて、パネルが重ならない', () => {
  for (const n of TREE_NODES) {
    if (n.kind === 'root') continue;
    assert.ok(SKILL_MAP[n.parent], `${n.id} の親`);
    let cur = n;
    for (let i = 0; i < 20 && cur.kind !== 'root'; i++) cur = SKILL_MAP[cur.parent];
    assert.equal(cur.kind, 'root', `${n.id} が中心につながらない`);
    assert.ok(ROUTE_MAP[n.route], `${n.id} のルート`);
    assert.ok(exists(n.icon), `${n.id} のアイコン ${n.icon}`);
  }
  const ps = TREE_NODES.map(nodePos);
  for (let i = 0; i < ps.length; i++) for (let j = i + 1; j < ps.length; j++) assert.ok(Math.hypot(ps[i].x - ps[j].x, ps[i].y - ps[j].y) >= 0.9, `${TREE_NODES[i].id} と ${TREE_NODES[j].id} が重なる`);
  for (const r of ROUTES) assert.equal(SKILLS.filter((x) => x.route === r.id && x.kind === 'capstone').length, 1, `${r.id} の到達点`);
});

test('スキルツリー：見えるのは中心と、持っているノードの子だけ', () => {
  const s = createGame(16);
  assert.ok(nodeVisible(s, 'src_store'));
  assert.ok(!nodeVisible(s, 'src_queue'));
  s.skills.push('src_store');
  assert.ok(nodeVisible(s, 'src_queue'));
});

test('ルート：伸ばした方向が熟練度・到達点・称号になり、専門外は高くなる', () => {
  const s = createGame(17);
  s.exp = { info: 9999, act: 9999, tech: 9999, social: 9999, mind: 9999 };
  s.skills.push('src_store');
  for (const id of ['src_queue', 'bargain', 'early_bird']) assert.ok(learnSkill(s, id), id);
  assert.equal(routeLevel(s, 'store'), 1);
  assert.equal(nodeState(s, 'cap_store'), 'locked'); // 5個必要
  s.stats.storeTrips = 40;
  assert.ok(learnSkill(s, 'rec_walker')); // 記録パネルは無料
  s.hints.ino_map = 1;
  assert.ok(learnSkill(s, 'ino_map'));
  assert.equal(nodeState(s, 'cap_store'), 'available');
  assert.ok(learnSkill(s, 'cap_store'));
  assert.equal(routeLevel(s, 'store'), 2);
  assert.ok(perk(s, 'storeOffers') >= 3);
  // 2つめのルートまでは通常価格、3つめ以降は専門外
  assert.ok(learnSkill(s, 'src_online'));
  assert.deepEqual(skillCost(s, 'net_meetup'), { social: Math.ceil(15 * OFF_ROUTE_RATE) });
  assert.equal(titleOf(s), '店舗の鬼');
});

test('キャリア：月5万円を2か月でステージ2、月30万円が安定したら専業の判断', () => {
  const s = createGame(12);
  s.monthly = [{ net: 60000 }, { net: 70000 }];
  checkPromotion(s);
  assert.equal(s.stage, 2);
  s.monthly = [{ net: 350000 }, { net: 250000 }, { net: 320000 }];
  const steps = checkPromotion(s);
  const choice = steps.find((x) => x.t === 'choice');
  assert.ok(choice, '専業化の選択肢が出る');
  choice.options[0].run();
  assert.equal(s.stage, 3);
  assert.equal(s.actionsPerWeek, 2);
  assert.ok(s.fulltime);
});

test('KPIの見え方は「利益率と回転」「資金効率と時間単価」で増える', () => {
  const s = createGame(13);
  assert.equal(kpiLevel(s), 1);
  s.skills.push('kpi_mid');
  assert.equal(kpiLevel(s), 2);
  s.skills.push('kpi_pro');
  assert.equal(kpiLevel(s), 3);
});

test('置き場所には限界があり、買取業者ですぐ現金化できる', () => {
  const s = createGame(14);
  s.cash = 10_000_000;
  const big = { oid: 1, pid: 'hina', price: 1000, maxQty: 999, points: 0, fakeRate: 0 };
  assert.equal(buy(s, big, 999, 'cash').ok, false);
  assert.ok(spaceUsed(s) <= hardCapacity(s));
  const before = s.cash;
  const home = s.inventory.filter((u) => u.home).map((u) => u.uid);
  const r = sellToBuyer(s, home);
  assert.equal(r.n, home.length);
  assert.ok(s.cash > before);
});

test('税金：法人化すると高所得での税率が下がる', () => {
  const s = createGame(15);
  const individual = taxFor(s, 12_000_000);
  s.corp = true;
  assert.ok(taxFor(s, 12_000_000) < individual);
});
