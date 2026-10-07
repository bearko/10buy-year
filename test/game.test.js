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
import { learnSkill, nodeState, nodeTeaser, nodeVisible, OFF_ROUTE_RATE, skillCost } from '../src/engine/abilities.js';
import { ROUTES, ROUTE_MAP, SKILLS as TREE_SKILLS, TREE_NODES, nodePos } from '../src/data/skills.js';
import { perk, routeLevel } from '../src/engine/perks.js';
import { titleOf } from '../src/engine/ending.js';
import { checkTutorial, MISSIONS, treeOpen } from '../src/engine/tutorial.js';
import { checkPromotion, goalOf, stageProgress } from '../src/engine/career.js';
import { kpiLevel } from '../src/engine/kpi.js';
import { taxFor } from '../src/engine/finance.js';
import { DIFFICULTIES, minPayment, monthEnd } from '../src/engine/finance.js';
import { dailySeed, todayKey } from '../src/engine/daily.js';
import { updateMarket, priceOf } from '../src/engine/market.js';
import { TOTAL_WEEKS } from '../src/engine/calendar.js';
import { runGame } from './bot.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const exists = (rel) => existsSync(join(ROOT, rel));

test('すべての商品・キャラ・背景の画像が assets にある', () => {
  for (const p of PRODUCTS) for (const rep of [false, true]) assert.ok(exists(productImage(p, rep)), `missing ${productImage(p, rep)}`);
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
  // カードの利用枠は10万円から。高額品は枠を上げるまで買えない
  assert.equal(cardAvailable(s), 100000);
  const big = { ...offer, price: 320000, maxQty: 2 };
  assert.equal(buy(s, { ...big }, 1, 'cash').ok, false);
  assert.equal(buy(s, { ...big }, 1, 'card').ok, false);
  const mid = { ...offer, price: 60000, maxQty: 2 };
  assert.equal(buy(s, { ...mid }, 1, 'card').ok, true);
  assert.equal(cardAvailable(s), 40000);
  assert.equal(buy(s, { ...mid }, 1, 'card').ok, false);
});

test('カード増枠の申請：売上とステージで審査され、通れば枠が上がる', () => {
  const s = createGame(23);
  assert.ok(availableCommands(s).some((c) => c.id === 'card_up'));
  s.monthly = [{ revenue: 10000 }];
  performCommand(s, 'card_up');
  assert.equal(s.card.limit, 100000, '売上が足りないと落ちる');
  assert.ok(!availableCommands(s).some((c) => c.id === 'card_up'), '8週間は申し込めない');
  s.week += 8;
  s.monthly = [{ revenue: 80000 }, { revenue: 60000 }];
  performCommand(s, 'card_up');
  assert.equal(s.card.limit, 300000);
});

test('月末：返済できなければ滞納、3回で債務整理', () => {
  const s = createGame(3);
  s.cash = minPayment(s);
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
  assert.ok(!s.skills.includes('src_home'), 'スキルツリーは最初は何も持っていない');
  assert.equal(nodeState(s, 'src_home'), 'locked', '中心は売上を立てるまで解放できない');
  // 1. 家の不用品を出品
  listUnits(s, [s.inventory[0].uid], 'merc', 500);
  checkTutorial(s);
  assert.equal(MISSIONS[s.tutorial].id, 'sell_home');
  // 2. 売れる → ツリーが開き、中心をコスト0で解放できる
  s.stats.soldUnits = 1;
  checkTutorial(s);
  assert.ok(treeOpen(s));
  assert.equal(MISSIONS[s.tutorial].node, 'src_home');
  assert.deepEqual(skillCost(s, 'src_home'), {});
  assert.ok(learnSkill(s, 'src_home'));
  checkTutorial(s);
  // チュートリアル中は店舗せどり以外の入口は開かない
  for (const id of ['ch_miime', 'eye_calc', 'eye_market', 'src_online', 'net_meetup', 'pack_master']) assert.equal(nodeState(s, id), 'locked', id);
  assert.ok(!ids().includes('store'), '販路・仕入れ先は自動で解放されない');
  // 3. 家の物をもっと売る → 行動の経験点をもらい、店舗せどりを目指す
  s.stats.soldUnits = 3;
  checkTutorial(s);
  assert.equal(MISSIONS[s.tutorial].node, 'src_store');
  assert.ok(learnSkill(s, 'src_store'));
  checkTutorial(s);
  assert.ok(ids().includes('store'));
  // 4〜5. 店に行って仕入れる
  performCommand(s, 'store');
  assert.ok(s.flags.didStore);
  buy(s, { oid: 99, pid: 'scroll', price: 3300, maxQty: 1, points: 0, fakeRate: 0 }, 1, 'cash');
  checkTutorial(s);
  // 6〜7. 仕入れた商品を出品して売る → チュートリアル完了、ミィームと利益計算の入口が開く
  const bought = s.inventory.find((u) => !u.home);
  listUnits(s, [bought.uid], 'merc', 4000);
  s.stats.purchasedSold = 1;
  s.stats.firstFlip = { pid: 'scroll', price: 6000, cost: 3300 };
  checkTutorial(s);
  assert.equal(s.tutorial, MISSIONS.length);
  assert.equal(nodeState(s, 'ch_miime'), 'available');
  assert.equal(nodeState(s, 'eye_calc'), 'available');
  assert.equal(nodeState(s, 'src_online'), 'locked', '電脳は仕入れを重ねてから');
});

// 序盤の制限をすべて外す（ツリーの仕組みだけを確かめるテスト用）
function openTree(s, { abilities = 99 } = {}) {
  s.abilities = { eye: abilities, buy: abilities, list: abilities, talk: abilities, pack: abilities };
  s.skills.push('src_home');
  s.flags.tutorialDone = true;
  s.stats.soldUnits = 99;
  s.stats.purchases = 99;
}

test('スキルツリー：親・ステージ・コツが揃わないと解放できない', () => {
  const s = createGame(11);
  openTree(s);
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
  assert.ok(nodeVisible(s, 'src_home'));
  assert.ok(!nodeVisible(s, 'src_store'), '最初は中心だけ');
  s.skills.push('src_home');
  assert.ok(nodeVisible(s, 'src_store'));
  assert.ok(!nodeVisible(s, 'src_queue'));
  assert.ok(nodeTeaser(s, 'src_queue'), '解放できるパネルの1つ先は「？」で見える');
  assert.ok(!nodeTeaser(s, 'src_lottery'), '入口が開いていないルートの先は見えない');
  s.skills.push('src_store');
  assert.ok(nodeVisible(s, 'src_queue'));
});

test('ルート：伸ばした方向が熟練度・到達点・称号になり、専門外は高くなる', () => {
  const s = createGame(17);
  openTree(s);
  s.exp = { info: 9999, act: 9999, tech: 9999, social: 9999, mind: 9999 };
  s.skills.push('src_store');
  for (const id of ['src_queue', 'bargain', 'early_bird']) assert.ok(learnSkill(s, id), id);
  assert.equal(routeLevel(s, 'store'), 1);
  assert.equal(nodeState(s, 'cap_store'), 'locked'); // 5個必要
  assert.ok(learnSkill(s, 'st_goods')); // 段階的に強化するパネルも1個に数える
  assert.equal(nodeState(s, 'st_goods'), 'available', 'レベルが上限まで上げられる');
  s.hints.ino_map = 1;
  assert.ok(learnSkill(s, 'ino_map'));
  assert.equal(nodeState(s, 'cap_store'), 'available');
  assert.ok(learnSkill(s, 'cap_store'));
  assert.equal(routeLevel(s, 'store'), 2);
  assert.ok(perk(s, 'storeOffers') >= 3);
  // 2つめのルートまでは通常価格、3つめ以降は専門外
  assert.ok(learnSkill(s, 'src_online'));
  assert.deepEqual(skillCost(s, 'net_meetup'), { social: Math.ceil(40 * OFF_ROUTE_RATE) });
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

test('専業の判断：合計90万円なら月ごとの波があっても判断に進む。赤字の月があれば理由を説明する', () => {
  const s = createGame(15);
  s.stage = 2;
  // 実際のプレイで起きた形：合計は90万円を超えているが、ひと月だけ少ない
  s.monthly = [{ net: 650000, month: 11 }, { net: 30000, month: 12 }, { net: 645000, month: 1 }];
  assert.ok(checkPromotion(s).some((x) => x.t === 'choice'), '合計90万円・赤字なしなら専業化の選択肢が出る');
  s.monthly = [{ net: 1200000, month: 11 }, { net: -100000, month: 12 }, { net: 230000, month: 1 }];
  const steps = checkPromotion(s);
  assert.ok(!steps.some((x) => x.t === 'choice'), '赤字の月があると判断に進まない');
  assert.ok(steps.some((x) => x.t === 'talk' && x.text.includes('12月が赤字')), '理由をマインが説明する');
  assert.equal(goalOf(s).warn, true, 'HUD でも赤字の月を警告する');
});

test('HUD の目標の見込みは月末の固定費・事業収入を含む', () => {
  const s = createGame(16);
  s.stage = 2;
  s.monthly = [{ net: 400000 }, { net: 400000 }];
  s.cur.salesProfit = 120000;
  assert.equal(goalOf(s).value, 920000);
  s.corp = true; // 社会保険料が月末にかかる
  assert.ok(goalOf(s).value < 920000);
});

test('取引の対応：値下げ交渉・トラブルは決めておいた答えで進む（初期設定はルーティン中だけ）', async () => {
  const { autoPick, setDeal } = await import('../src/engine/dealpolicy.js');
  const { negotiationSteps, troubleSteps } = await import('../src/data/troubles.js');
  const s = createGame(17);
  s.cash = 1_000_000;
  buy(s, { pid: 'novice_book', price: 500, maxQty: 5 }, 2);
  const [u, u2] = s.inventory.filter((x) => x.pid === 'novice_book' && !x.home);
  listUnits(s, [u.uid, u2.uid], 'merc', 1000);
  const nego = (offer) => negotiationSteps(s, { uid: u.uid, pid: u.pid, price: 1000, offer }).find((x) => x.t === 'choice');
  assert.equal(autoPick(s, nego(880), false), -1, '手で遊ぶときは毎回決める');
  assert.equal(nego(880).options[autoPick(s, nego(880), true)].key, 'sell', '出品価格の85%以上なら売る');
  assert.equal(nego(800).options[autoPick(s, nego(800), true)].key, 'firm', '85%未満なら断る');
  setDeal(s, 'scope', 'always');
  assert.ok(autoPick(s, nego(880), false) >= 0, '「いつも」なら手で遊ぶときも');
  setDeal(s, 'nego', 'ask');
  assert.equal(autoPick(s, nego(880), true), -1, '「毎回決める」ならルーティン中でも止まる');
  for (const kind of ['claimer', 'return', 'swap']) {
    const st = troubleSteps(s, { kind, sale: { id: 1, uid: u2.uid, pid: u2.pid, price: 1000, ship: 200, platform: 'merc', unit: u2 } }).find((x) => x.t === 'choice');
    assert.equal(st.policy, kind);
    assert.ok(autoPick(s, st, true) >= 0, `${kind} に答えが決まっている`);
  }
});

test('開拓：同じ仕入れルートを回り続けると、新しい仕入れ先とシリーズが出る', async () => {
  const { SPOTS, pioneerLine } = await import('../src/engine/pioneer.js');
  const { storeOffers } = await import('../src/engine/offers.js');
  const s = createGame(18);
  s.stats.purchases = 1;
  const trip = () => { s.stamina = 100; s.sick = 0; return performCommand(s, 'store'); };
  for (let i = 0; i < 7; i++) trip();
  assert.ok(!s.spots?.includes('toy_shop'));
  assert.match(pioneerLine(s, 'store'), /あと1回/);
  s.routeUse.store = 8;
  assert.match(pioneerLine(s, 'store'), /次に回ったら/);
  s.routeUse.store = 7;
  const steps = trip();
  assert.ok(s.spots.includes('toy_shop'), '8回目で温泉街のおもちゃ屋');
  assert.ok(steps.some((x) => x.t === 'info' && x.title === '新しい仕入れ先を開拓！'));
  let seen = false;
  for (let i = 0; i < 20 && !seen; i++) seen = storeOffers(s).some((o) => o.source === 'toy_shop' && o.pid === 'kokeshi');
  assert.ok(seen, '開拓先のシリーズが並ぶ');
  // 開拓先のシリーズは、ほかの仕入れルートには出てこない
  const t = createGame(19);
  for (let i = 0; i < 40; i++) assert.ok(!storeOffers(t).some((o) => SPOTS.some((sp) => sp.pid === o.pid)));
  // ステージの条件がある仕入れ先は、そのステージまで待つ
  s.routeUse.store = 45;
  trip(); // 20回目の工房が見つかる（1回に1か所ずつ）
  assert.ok(s.spots.includes('craft_street'));
  trip();
  assert.ok(!s.spots.includes('flea_market'), '骨董市はステージ2から');
});

test('経験点の振り替えは半分の値になる', async () => {
  const { convertExp } = await import('../src/engine/abilities.js');
  const s = createGame(20);
  s.exp = { info: 1000, act: 0, tech: 0, social: 0, mind: 0 };
  assert.equal(convertExp(s, 'info', 'act', 500), 250);
  assert.equal(s.exp.info, 500);
  assert.equal(s.exp.act, 250);
  assert.equal(convertExp(s, 'info', 'info', 100), 0, '同じ種類には振り替えない');
  assert.equal(convertExp(s, 'act', 'mind', 9999), 125, '持っている分まで');
});

test('出品枠の空きと、出せる在庫の数', async () => {
  const { idleListing } = await import('../src/engine/inventory.js');
  const s = createGame(21);
  const idle = idleListing(s);
  assert.equal(idle.unlisted, 5, '最初の家の不用品5点');
  assert.ok(idle.free >= 5);
  listUnits(s, s.inventory.map((u) => u.uid), 'merc', 1000);
  assert.equal(idleListing(s).n, 0);
});

test('古いセーブに、あとから追加した商品の相場を足す', async () => {
  const { ensureMarket } = await import('../src/engine/market.js');
  const s = createGame(22);
  delete s.market.kokeshi;
  ensureMarket(s);
  assert.ok(priceOf(s, 'kokeshi') > 0);
});

test('飽和：仕入れ先は使うほど荒れ、仕入れ値が上がり候補が減る。放っておけば落ち着く', async () => {
  const R = await import('../src/engine/rivals.js');
  const { storeOffers } = await import('../src/engine/offers.js');
  const s = createGame(23);
  s.stats.purchases = 1;
  for (let i = 0; i < 4; i++) { s.stamina = 100; performCommand(s, 'store'); }
  assert.equal(R.saturation(s, 'store'), 4 * R.SAT_PER_TRIP, '1回の店舗せどりで +2.5');
  s.saturation.store = 80;
  const before = createGame(23);
  before.stats.purchases = 1;
  const cheap = storeOffers(before);
  const pricey = storeOffers(s);
  assert.ok(pricey.length < cheap.length, '荒れると候補が減る');
  assert.ok(pricey.some((o) => o.sat >= 80), '荒れ具合が候補に付く');
  assert.equal(R.satPriceMult(s, 'store'), 1.32);
  s.satUsed = {};
  R.decaySaturation(s);
  assert.equal(R.saturation(s, 'store'), 76, '使わなかった週は -4');
  assert.match(R.satLine(s, 'store'), /荒れ具合 76%/);
});

test('独占契約：お金と対人の経験点で、ライバルに荒らされなくなる', async () => {
  const R = await import('../src/engine/rivals.js');
  const s = createGame(24);
  s.stage = 3;
  s.cash = 5_000_000;
  s.exp.social = 500;
  s.saturation = { store: 50 };
  assert.ok(R.signExclusive(s, 'store'));
  assert.equal(R.saturation(s, 'store'), 25, '契約で落ち着く');
  assert.ok(!R.signExclusive(s, 'store'), '二重には結べない');
  R.addSaturation(s, 'store', 30, { rival: true });
  assert.equal(R.saturation(s, 'store'), 25, 'ライバルは入れない');
  R.addSaturation(s, 'store', 10);
  assert.equal(R.saturation(s, 'store'), 30, '自分の利用は半分だけ');
});

test('ライバル転売屋：ステージで登場し、仕掛けてきて、長者番付で競う', async () => {
  const R = await import('../src/engine/rivals.js');
  const { lotteryWinRate } = await import('../src/engine/offers.js');
  const { netWorth } = await import('../src/engine/ending.js');
  const s = createGame(25);
  assert.deepEqual(R.rivalWeek(s), [], 'ステージ1ではまだ来ない');
  s.stage = 2;
  assert.deepEqual(R.rivalWeek(s), [], 'ステージ2でもまだ');
  s.stage = 3;
  const steps = R.rivalWeek(s);
  assert.ok(s.rivals.cao, 'ステージ3で曹操');
  assert.ok(steps.some((x) => x.t === 'talk' && x.who === 'rival_cao'));
  assert.ok(R.rivalWeek(s).every((x) => x.who !== 'rival_edison'), '次のライバルは12週あけて');
  // 仕掛け：曹操はいちばん使っている仕入れ先を荒らす
  s.routeUse = { store: 10 };
  const cao = R.RIVAL_MAP.cao;
  let acted = [];
  for (let i = 0; i < 400 && !acted.length; i++) acted = R.rivalWeek(s);
  assert.ok(R.saturation(s, 'store') >= 30);
  // エジソンのボット：抽選の当選率が下がる
  const p = PRODUCTS.find((x) => x.kind === 'hype');
  const base = lotteryWinRate(s, p);
  s.rivalFx = { botUntil: s.week + 8 };
  assert.ok(lotteryWinRate(s, p) < base);
  // 番付：抜くと演出
  s.rivals.cao.nw = netWorth(s) - 1;
  s.rivals.cao.passed = false;
  const m = R.rivalsMonthly(s);
  s.cash += 10_000_000;
  const m2 = R.rivalsMonthly(s);
  assert.ok([...m, ...m2].some((x) => x.t === 'info' && x.title === '長者番付で抜いた！'));
  assert.equal(R.ranking(s)[0].id, 'me');
  assert.ok(cao);
});

test('いたちごっこ：高値の転売で目立つと対策が予告され、8週後に施行される', async () => {
  const G = await import('../src/engine/regimes.js');
  const s = createGame(26);
  s.stage = 3;
  s.cash = 1_000_000;
  const p = PRODUCTS.find((x) => x.kind === 'hype');
  // 定価の2.5倍で10個売る → 目立ち度 100
  for (let i = 0; i < 10; i++) G.heatFromSale(s, { pid: p.id, price: p.retail * 2.5, platform: 'auc' });
  assert.equal(Math.round(G.heat(s, G.productKey(p.id))), 100);
  const ann = G.regimeWeek(s);
  assert.ok(ann.some((x) => x.t === 'info' && x.title.includes('予告：公式リセールの開始')));
  assert.ok(ann.some((x) => x.who === 'ieyasu'));
  assert.equal(G.priceCap(s, p.id, 'merc'), Infinity, '予告の間はまだ効かない');
  // 施行：フリマでは定価の1.5倍まで
  buy(s, { pid: p.id, price: p.retail, maxQty: 2 }, 2);
  const u = s.inventory.find((x) => x.pid === p.id);
  listUnits(s, [u.uid], 'merc', p.retail * 3);
  s.week += G.ANNOUNCE_WEEKS;
  const enf = G.regimeWeek(s);
  assert.ok(enf.some((x) => x.t === 'info' && x.title === '施行：公式リセールの開始'));
  assert.equal(u.listing.price, Math.round(p.retail * 1.5), '出品中の高値は値下げされる');
  assert.equal(G.priceCap(s, p.id, 'auc'), Infinity, 'オークションは対象外');
  const u2 = s.inventory.find((x) => x.pid === p.id && !x.listing);
  listUnits(s, [u2.uid], 'merc', p.retail * 3);
  assert.equal(u2.listing.price, Math.round(p.retail * 1.5), '上限を超える値付けはできない');
  // 次に目立つと、不正転売禁止の対象拡大（どの販路でも1.2倍まで）→ 認定中古市場が開く
  s.flags.regimeCool = 0;
  s.heat[G.productKey(p.id)] = 120;
  G.regimeWeek(s);
  s.week += G.ANNOUNCE_WEEKS;
  G.regimeWeek(s);
  assert.equal(G.priceCap(s, p.id, 'auc'), Math.round(p.retail * 1.2));
  s.week += 16;
  G.regimeWeek(s);
  assert.equal(G.usedRegimeMult(s), 1.15, '規制のあとには認定中古の商機');
});

test('いたちごっこ：抽選の本人確認・購入制限・手数料・受注生産・輸出規制', async () => {
  const G = await import('../src/engine/regimes.js');
  const { lotteryWinRate, queueSuccessRate } = await import('../src/engine/offers.js');
  const { feeRate, platformsFor } = await import('../src/engine/inventory.js');
  const s = createGame(27);
  s.stage = 3;
  const p = PRODUCTS.find((x) => x.kind === 'hype');
  const lot = lotteryWinRate(s, p);
  const q = queueSuccessRate(s);
  const fee = feeRate(s, 'merc');
  const on = (id, extra = {}) => (s.regimes ||= []).push({ id, announced: 0, start: 0, ...extra });
  on('lottery_id');
  on('buy_limit', { end: 144 });
  on('fee_hike');
  assert.ok(lotteryWinRate(s, p) < lot, '抽選の当選率が下がる');
  s.member = 40;
  assert.ok(lotteryWinRate(s, p) > lotteryWinRate({ ...s, member: 0 }, p), '公式の会員ランクで戻る');
  assert.ok(queueSuccessRate(s) < q);
  assert.ok(Math.abs(feeRate(s, 'merc') - fee - 0.03) < 1e-9);
  const lotSteps = performCommand(Object.assign(s, { stamina: 100, skills: [...s.skills, 'src_lottery'], week: 0 }), 'lottery');
  const ch = lotSteps.find((x) => x.t === 'choice');
  if (ch) assert.equal(ch.options.length, 1, '名義借り・捨てアカは選べない');
  s.week = 144;
  assert.ok(!G.queueLimited(s), '購入制限は3年で緩む');
  // 受注生産：相場が定価近くまで下がる
  on('made_to_order', { pid: p.id });
  for (let i = 0; i < 30; i++) { s.week++; updateMarket(s); }
  assert.ok(priceOf(s, p.id) < p.retail * 1.15);
  // 輸出規制：限定品は貿易実務がないと海外ECに出せない
  on('export_rule');
  s.certs = ['export'];
  buy(Object.assign(s, { cash: 1e7 }), { pid: p.id, price: 1, maxQty: 1 }, 1);
  const u = s.inventory.find((x) => x.pid === p.id);
  assert.ok(!platformsFor(s, u).some((x) => x.id === 'exp'));
  s.certs.push('trade_practice');
  assert.ok(platformsFor(s, u).some((x) => x.id === 'exp'));
});

test('百貨店：年間の購入額で顧客ランクが上がり、外商の優先案内が来る。転売するとバレる', async () => {
  const C = await import('../src/engine/collection.js');
  const { netWorth } = await import('../src/engine/ending.js');
  const s = createGame(28);
  s.stage = 3;
  s.cash = 50_000_000;
  assert.ok(availableCommands(s).some((c) => c.id === 'dept'), 'ステージ3から百貨店');
  assert.equal(C.deptRank(s), 0);
  const steps = performCommand(Object.assign(s, { stamina: 100 }), 'dept');
  const gallery = steps.find((x) => x.t === 'gallery');
  assert.ok(gallery.items.length >= 4);
  assert.ok(gallery.items.every((it) => C.PIECE_MAP[it.ext].rarity !== 'L'), '一般客にはレジェンドは並ばない');
  const nw0 = netWorth(s);
  const it = gallery.items[0];
  assert.ok(C.buyPiece(s, it));
  assert.ok(C.owned(s, it.ext));
  assert.equal(netWorth(s), nw0, 'コレクションは評価額で純資産に入る');
  for (let i = 0; i < 60; i++) { s.week++; updateMarket(s); } // 2年目（限定品が出回っている）
  C.deptSpend(s, 6_000_000);
  assert.equal(C.deptRank(s), 2, '年600万円で外商顧客');
  // 外商の優先案内
  let offerStep = null;
  for (let i = 0; i < 300 && !offerStep; i++) offerStep = C.deptWeek(s).find((x) => x.t === 'offers');
  assert.ok(offerStep, '外商の優先案内が来る');
  const o = offerStep.offers[0];
  assert.equal(o.source, 'gaisho');
  buy(s, o, 1);
  const u = s.inventory.find((x) => x.gaisho);
  assert.ok(u, '外商の品には印がつく');
  // 転売がバレると評判が下がる
  s.dept.caught = 1;
  const rep = s.dept.rep;
  const caught = C.deptWeek(s);
  assert.ok(caught.some((x) => x.who === 'marie'));
  assert.equal(s.dept.rep, rep - 25);
});

test('コレクションと私設美術館：シリーズをそろえると入館料が増え、品は値上がりする', async () => {
  const C = await import('../src/engine/collection.js');
  const { COLLECTION_SERIES } = await import('../src/data/collection.js');
  const s = createGame(29);
  s.stage = 4;
  s.cash = 100_000_000;
  const sr = COLLECTION_SERIES[0];
  for (const [ext] of sr.items) assert.ok(C.buyPiece(s, { ext, price: 100000 }));
  assert.equal(C.completeSeries(s).length, 1);
  assert.equal(C.museumIncome(s), 0, '美術館を開くまで入館料はない');
  assert.ok(C.openMuseum(s));
  assert.equal(C.museumIncome(s), 1000 + 2500 + 7500 + 20000 + 60000 + C.SERIES_BONUS);
  const v0 = C.collectionValue(s);
  for (let i = 0; i < 24; i++) C.collectionMonthly(s);
  assert.ok(C.collectionValue(s) > v0, 'レア以上はゆっくり値上がりする');
  const got = C.sellPiece(s, sr.items[4][0]);
  assert.ok(got > 0);
  assert.equal(C.completeSeries(s).length, 0, '手放すとシリーズが欠ける');
});

test('顧客層とキャリア：売るほど顧客層が育ち、ヒーローに誘われて転身する', async () => {
  const K = await import('../src/engine/careers.js');
  const { CAREERS } = await import('../src/data/careers.js');
  const s = createGame(30);
  s.rating = 100;
  for (let i = 0; i < 10; i++) K.audienceFromSale(s, { pid: 'pretty_set' });
  assert.equal(K.audience(s, 'beauty'), 10, '評価100なら1件 +1');
  s.audience.beauty = CAREERS.kol.need;
  assert.deepEqual(K.careerWeek(s), [], 'ステージ3から');
  s.stage = 3;
  const steps = K.careerWeek(s);
  assert.ok(steps.some((x) => x.who === 'yohki'), '楊貴妃が誘う');
  const ch = steps.find((x) => x.t === 'choice');
  ch.options[0].run();
  assert.ok(K.hasCareer(s, 'kol'));
  assert.ok(availableCommands(s).some((c) => c.id === 'live'), 'ライブ配信が開く');
  // 断ると24週は誘われない
  s.audience.gadget = CAREERS.media.need;
  K.careerWeek(s).find((x) => x.t === 'choice').options[1].run();
  assert.deepEqual(K.careerWeek(s).filter((x) => x.t === 'choice'), []);
});

test('キャリアのコマンド：経験点を使い、それぞれの稼ぎ方ができる', async () => {
  const K = await import('../src/engine/careers.js');
  const s = createGame(31);
  s.stage = 3;
  s.cash = 1_000_000;
  s.careers = { kol: { followers: 600 }, appraiser: { trust: 60, jobs: 0 }, media: { readers: 200 }, select: { trips: 0 }, inbound: { tours: 0 } };
  s.exp = { info: 0, act: 0, tech: 0, social: 0, mind: 0 };
  assert.match(K.liveSteps(s)[0].text, /準備が足りない/, '経験点が足りないとできない');
  s.exp = { info: 500, act: 500, tech: 500, social: 500, mind: 500 };
  // ライブ配信：出品中の美容品が売れる
  buy(s, { pid: 'pretty_set', price: 2000, maxQty: 5 }, 5);
  listUnits(s, s.inventory.filter((u) => u.pid === 'pretty_set').map((u) => u.uid), 'merc', 4500);
  const cash = s.cash;
  K.liveSteps(s);
  assert.ok(s.inventory.filter((u) => u.pid === 'pretty_set').length < 5);
  assert.ok(s.cash > cash);
  assert.equal(s.exp.social, 470, '対人30を使う');
  // 鑑定：手数料と信用
  K.appraiseSteps(s);
  assert.ok(s.careers.appraiser.jobs >= 2);
  // 委託販売：売上金の8割は持ち主へ
  const sale = { unit: { consign: true }, net: 10000, profit: 10000 };
  K.consignPayout(s, sale);
  assert.equal(sale.net, 2000);
  // レビュー：読者が増え、毎月の紹介料
  K.reviewSteps(s);
  assert.ok(s.careers.media.readers > 200);
  assert.equal(K.mediaIncome(s), s.careers.media.readers * 30);
  // 海外買い付け：ファッションの品が卸値で並ぶ
  const off = K.buyingSteps(s).find((x) => x.t === 'offers');
  assert.ok(off.offers.length > 0 && off.offers.every((o) => K.audOf(o.pid) === 'fashion' && o.price < priceOf(s, o.pid)));
  // 訪日客ツアー：出品していない和雑貨が相場の1.3倍で売れる
  buy(s, { pid: 'kokeshi', price: 3000, maxQty: 2 }, 2);
  const before = s.cash;
  K.tourSteps(s);
  assert.equal(s.inventory.filter((u) => u.pid === 'kokeshi').length, 0);
  assert.ok(s.cash - before >= Math.round(priceOf(s, 'kokeshi') * 1.3 * 2) - 20);
});

const PIECES18 = () => [1006, 2006, 3006, 4006, 5006, 1009, 2009, 3009, 4009, 5009, 1017, 2017, 3017, 4017, 5017, 1018, 2018, 3018].map((ext) => ({ ext, cost: 1, value: 1, week: 0 }));

test('志：ステージ4で選び、3段の目標を達成するとエンディングが変わる', async () => {
  const V = await import('../src/engine/visions.js');
  const { finalResult } = await import('../src/engine/ending.js');
  const { goalOf } = await import('../src/engine/career.js');
  const s = createGame(32);
  s.debt = 0;
  assert.deepEqual(V.visionWeek(s), [], 'ステージ4まで聞かれない');
  s.stage = 4;
  const steps = V.visionWeek(s);
  assert.ok(steps.some((x) => x.who === 'ryoma'));
  const ch = steps.find((x) => x.t === 'choice');
  assert.ok(!ch.options.some((o) => o.label === '配信の女王'), 'キャリアがないと選べない志もある');
  ch.options.find((o) => o.label === '私設美術館').run();
  assert.equal(s.vision.id, 'museum');
  // 目標：コレクション18点
  s.collection = PIECES18();
  const m = V.visionMonthly(s);
  assert.ok(m.some((x) => x.t === 'celebrate'));
  assert.equal(V.visionDone(s), 1);
  s.stage = 5;
  assert.equal(goalOf(s).short, '志：私設美術館', 'ステージ5の HUD は志の次の目標');
  assert.equal(finalResult(s).ending.id, 'vision_half', '途中まで届けば志半ばEND');
  s.vision.done = { 0: 1, 1: 2, 2: 3 };
  assert.equal(finalResult(s).ending.title, '私設美術館END');
  assert.equal(finalResult(s).vision.done, 3);
  // 志は年に一度だけ変えられる
  assert.ok(!V.canChangeVision(s));
  s.week += V.CHANGE_WEEKS;
  assert.ok(V.canChangeVision(s));
});

test('業界の年表：5年目から毎年、予告 → 春に始まる → 年末にミッションの結果', async () => {
  const A = await import('../src/engine/annals.js');
  const s = createGame(33);
  s.stage = 4;
  s.week = 48 * 3;
  assert.deepEqual(A.annalWeek(s), [], '4年目までは起きない');
  s.week = 48 * 4; // 5年目の1週目
  s.audience = { beauty: 3000 };
  const ann = A.annalWeek(s);
  assert.ok(ann.some((x) => x.who === 'nostra'));
  const a = A.currentAnnal(s);
  assert.equal(a.phase, 'announced');
  s.week = 48 * 4 + 12;
  const st = A.annalWeek(s);
  assert.equal(a.phase, 'started');
  assert.ok(st.some((x) => x.t === 'info'));
  s.week = 48 * 4 + 46;
  const end = A.annalWeek(s);
  assert.equal(a.phase, 'done');
  assert.ok(['clear', 'fail'].includes(a.result));
  assert.ok(end.some((x) => x.t === 'info'));
  // ライブコマースバブル：美容の品の相場が上がる
  const t = createGame(34);
  const base = priceOf(t, 'pretty_set');
  t.annalFx = { aud: 'beauty', mult: 1.25, until: 999 };
  assert.ok(Math.abs(priceOf(t, 'pretty_set') - base * 1.25) <= 1);
});

test('生活水準：稼げると暮らしを上げる誘いが来る。出費が増え、下げるとやる気が大きく落ちる', async () => {
  const L = await import('../src/engine/lifestyle.js');
  const { capacity } = await import('../src/engine/inventory.js');
  const { staminaCost } = await import('../src/engine/commands.js');
  const s = createGame(35);
  s.stage = 3;
  assert.deepEqual(L.lifestyleWeek(s), [], '稼げていないと誘いは来ない');
  s.monthly = [{ net: 900000 }, { net: 900000 }, { net: 900000 }];
  const steps = L.lifestyleWeek(s);
  assert.ok(steps.some((x) => x.t === 'choice'));
  steps.find((x) => x.t === 'choice').options[0].run();
  assert.equal(L.lifeLevel(s), 1);
  L.raiseLife(s); // 車
  assert.equal(L.lifeCost(s), 80000 + 120000);
  assert.equal(capacity(s), capacity({ ...s, lifestyle: 0 }) + 20, '車のトランク');
  assert.ok(staminaCost(s, COMMANDS.find((c) => c.id === 'store')) < staminaCost({ ...s, lifestyle: 0 }, COMMANDS.find((c) => c.id === 'store')));
  const cash = s.cash;
  L.lifestyleMonthly(s);
  assert.equal(s.cash, cash - 200000, '毎月の出費');
  s.mood = 3;
  L.lowerLife(s);
  assert.equal(s.mood, 1, '下げるとやる気 -2');
  assert.ok(!L.canRaiseLife(s), '24週は上げられない');
});

test('出資：開拓した仕入れ先の品ぞろえが増え、荒れにくくなり、配当が入る', async () => {
  const L = await import('../src/engine/lifestyle.js');
  const R = await import('../src/engine/rivals.js');
  const s = createGame(36);
  s.cash = 10_000_000;
  assert.ok(!L.investIn(s, 'toy_shop'), '開拓していない仕入れ先には出資できない');
  s.spots = ['toy_shop'];
  assert.ok(L.investIn(s, 'toy_shop'));
  assert.equal(s.cash, 9_000_000);
  assert.ok(L.investIn(s, 'toy_shop'));
  assert.ok(!L.investIn(s, 'toy_shop'), 'Lv2まで');
  assert.equal(L.investWeight(s, 'toy_shop'), 2);
  assert.equal(L.investPrice(s, 'toy_shop'), 0.95);
  assert.equal(L.dividend(s), Math.round(3_000_000 * 0.005));
  s.saturation = { toy_shop: 50 };
  s.satUsed = {};
  R.decaySaturation(s);
  assert.equal(R.saturation(s, 'toy_shop'), 44, '出資していると毎週さらに落ち着く');
});

test('仮想通貨の再登場：余裕資金でサトシが戻り、売買でき、儲けすぎると結局クリプトEND', async () => {
  const X = await import('../src/engine/crypto.js');
  const { finalResult, netWorth } = await import('../src/engine/ending.js');
  const s = createGame(37);
  s.stage = 4;
  s.debt = 0;
  assert.deepEqual(X.cryptoWeek(s), [], '余裕資金がないと来ない');
  s.cash = 20_000_000;
  const steps = X.cryptoWeek(s);
  assert.ok(steps.some((x) => x.who === 'satoshi'));
  // 断ると二度と来ない
  const t2 = structuredClone(s);
  steps.find((x) => x.t === 'choice').options[1].run.call(null);
  assert.ok(s.flags.cryptoSworn !== undefined);
  assert.deepEqual(X.cryptoWeek(s), []);
  // 受けると売買できる
  const u = Object.assign(createGame(38), { stage: 4, cash: 20_000_000, debt: 0 });
  X.cryptoWeek(u).find((x) => x.t === 'choice').options[0].run();
  assert.ok(X.cryptoOpen(u));
  const nw = netWorth(u);
  assert.ok(X.buyCoin(u, 'nkm', 10_000_000));
  assert.equal(netWorth(u), nw, '買った直後は時価＝買値で純資産は変わらない');
  for (let i = 0; i < 10; i++) X.cryptoWeek(u);
  assert.equal(u.crypto.hist.nkm.length, 10, '毎週値動きを記録');
  // 儲けすぎると結局クリプトEND（志のエンディングより優先）
  u.crypto.prices.nkm *= 20;
  u.vision = { id: 'tycoon', chosen: 0, done: { 0: 1, 1: 2, 2: 3 } };
  assert.equal(finalResult(u).ending.id, 'crypto');
  const got = X.sellCoin(u, 'nkm', 1);
  assert.ok(got > 100_000_000);
  assert.ok(u.crypto.realized > 0);
  assert.ok(t2);
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

test('仕入れ画面：偽物かどうかは直接書かず、手がかりと購入結果が一致する', async () => {
  const { onlineOffers } = await import('../src/engine/offers.js');
  const { grantSkill } = await import('../src/engine/abilities.js');
  const s = createGame(21);
  s.flags.license = 1;
  s.cash = 50_000_000;
  for (const id of ['src_online', 'src_flea']) grantSkill(s, id);
  let fakes = 0;
  for (let i = 0; i < 200; i++) {
    for (const o of onlineOffers(s)) {
      const text = JSON.stringify({ ...o.listing, checks: [] });
      assert.ok(!/偽物かも|怪しい|パチモン/.test(text), text);
      if (o.fake && fakes < 5) {
        fakes++;
        const before = s.inventory.length;
        buy(s, o, 1, 'cash');
        assert.equal(s.inventory.length, before + 1);
        assert.equal(s.inventory[s.inventory.length - 1].fake, true);
      }
    }
  }
  assert.ok(fakes > 0);
});

test('段階的に強化するパネル：レベルごとに効果が重なり、パラメータも上がる', () => {
  const s = createGame(22);
  openTree(s, { abilities: 50 });
  s.exp = { info: 9999, act: 9999, tech: 9999, social: 9999, mind: 9999 };
  s.skills.push('src_store', 'src_online');
  const offers0 = perk(s, 'storeOffers');
  assert.ok(learnSkill(s, 'st_goods'));
  assert.ok(learnSkill(s, 'st_goods'));
  assert.equal(perk(s, 'storeOffers'), offers0 + 2, '店舗で見つかる商品が増える');
  const stamina0 = s.maxStamina;
  assert.ok(learnSkill(s, 'st_legs'));
  assert.equal(s.maxStamina, stamina0 + 5);
  const eye0 = s.abilities.eye;
  s.skills.push('license');
  assert.ok(learnSkill(s, 'vi_eye'));
  assert.equal(s.abilities.eye, eye0 + 3);
  // 記録パネルは親をたどった先。条件を満たせば無料
  s.stats.storeTrips = 40;
  assert.ok(learnSkill(s, 'rec_walker'));
  // コストはレベルごとに上がる
  assert.ok(skillCost(s, 'st_goods').act > SKILL_MAP.st_goods.cost.act);
});

test('通院・治療：ケガや体調不良があるときだけ外出に出て、治療費を払うと治る', () => {
  const s = createGame(24);
  const has = () => availableCommands(s).some((c) => c.id === 'clinic');
  assert.ok(!has(), '元気なときは出ない');
  s.skills.push('backpain', 'tendon');
  s.sick = 2;
  assert.deepEqual(availableCommands(s).map((c) => c.id), ['rest', 'clinic'], '体調不良でも病院には行ける');
  const cash = s.cash;
  performCommand(s, 'clinic');
  assert.equal(s.sick, 0);
  assert.ok(!s.skills.includes('backpain') && !s.skills.includes('tendon'));
  assert.equal(cash - s.cash, 3000 + 8000 + 6000);
  assert.ok(!has());
});

test('法人化の判断は売上ではなく直近12か月の純利益800万円で出る', () => {
  const s = createGame(25);
  s.stage = 3;
  s.monthly = Array.from({ length: 12 }, () => ({ revenue: 1_000_000, net: 300_000 }));
  assert.equal(checkPromotion(s).length, 0, '売上1,200万円・純利益360万円では出ない');
  assert.equal(stageProgress(s).value, 3_600_000);
  s.monthly = Array.from({ length: 12 }, () => ({ revenue: 3_000_000, net: 700_000 }));
  assert.ok(checkPromotion(s).length > 0, '純利益840万円で出る');
});

test('借金を完済したあとは、借金を前提にしたセリフが出ない', () => {
  const s = createGame(26);
  s.debt = 0;
  s.flags.debtFree = 1;
  s.week = 60;
  s.cash = 500000;
  const texts = [];
  const walk = (steps) => {
    for (const st of steps || []) {
      if (st.text) texts.push(st.text);
      if (st.t === 'choice') for (const o of st.options) walk(o.run());
    }
  };
  for (const ev of EVENTS) {
    if (['final_week', 'month1_end'].includes(ev.id)) continue;
    try { walk(ev.play(s, {})); } catch { /* 状態が合わないイベントは飛ばす */ }
  }
  const bad = texts.filter((x) => /借金を返さ|借金なんて|借金してる|借金まみれになった|借金のことは/.test(x));
  assert.deepEqual(bad, []);
  assert.ok(!EVENTS.find((e) => e.id === 'month1_end').cond({ ...s, week: 3 }), '完済していれば返済日の案内は出ない');
});

test('会話ログは最大300件で古いものから消える', async () => {
  const { pushLog, LOG_MAX } = await import('../src/ui/log.js');
  const s = createGame(27);
  for (let i = 0; i < LOG_MAX + 20; i++) pushLog(s, { who: 'mine', text: `#${i}`, kind: 'talk' }, false);
  assert.equal(s.log.length, LOG_MAX);
  assert.equal(s.log[0].text, '#20');
});

test('基礎能力：主要なパネルには能力の前提があり、効果は数値で見える', async () => {
  const { abilityEffects } = await import('../src/engine/abilityfx.js');
  const s = createGame(28);
  openTree(s, { abilities: 20 });
  s.exp = { info: 9999, act: 9999, tech: 9999, social: 9999, mind: 9999 };
  s.skills.push('eye_market');
  assert.equal(nodeState(s, 'eye_fake'), 'locked', '目利き30が必要');
  s.abilities.eye = 30;
  assert.equal(nodeState(s, 'eye_fake'), 'available');
  const lo = abilityEffects(s, 'eye', 20)[0].value;
  const hi = abilityEffects(s, 'eye', 80)[0].value;
  assert.notEqual(lo, hi, '目利きを上げると誤差が変わる');
});

test('ルーティン：ルールに合う候補だけ仕入れ、すぐ出品し、売れ残りは値下げ・即決買取', async () => {
  const { routineBuy, routineList, routineStale, DEFAULT_ROUTINE } = await import('../src/engine/routine.js');
  const s = createGame(29);
  s.cash = 1_000_000;
  const cfg = { ...DEFAULT_ROUTINE, minMargin: 0.15, maxQty: 2, dumpWeeks: 6 };
  const good = { oid: 1, pid: 'boots', price: 6000, est: 12000, maxQty: 5, points: 0, fakeRate: 0 };
  const thin = { oid: 2, pid: 'scroll', price: 5400, est: 5600, maxQty: 5, points: 0, fakeRate: 0 };
  const got = routineBuy(s, [good, thin], cfg);
  assert.deepEqual(got.map((x) => [x.pid, x.qty]), [['boots', 2]], '利益率の低い候補は買わず、最大個数を守る');
  assert.equal(routineList(s, cfg), s.inventory.filter((u) => !u.listing || u.listing).length);
  assert.ok(s.inventory.every((u) => u.listing), 'すぐ出品する');
  const before = s.inventory.find((u) => u.pid === 'boots').listing.price;
  s.week += cfg.cutWeeks;
  const r = routineStale(s, cfg);
  assert.ok(r.cut > 0 && s.inventory.find((u) => u.pid === 'boots').listing.price < before, '売れ残りを値下げ');
  s.week += 10;
  const r2 = routineStale(s, cfg);
  assert.ok(r2.dumped > 0 && !s.inventory.some((u) => u.pid === 'boots'), '長く売れなければ即決買取');
});

test('資格講座：受講料を払って通い、酒類販売業免許でお酒をまた出品できる', () => {
  const s = createGame(30);
  s.stage = 2;
  s.cash = 500_000;
  s.flags.noAlcohol = 1;
  assert.ok(availableCommands(s).some((c) => c.id === 'course'));
  const steps = performCommand(s, 'course');
  const ch = steps.find((x) => x.t === 'choice');
  const idx = ch.options.findIndex((o) => o.label.startsWith('酒類販売業免許'));
  ch.options[idx].run();
  assert.equal(s.course.done, 1);
  for (let i = 0; i < 3; i++) performCommand(s, 'course');
  assert.ok(s.certs.includes('liquor'));
  assert.ok(!s.flags.noAlcohol, 'お酒を出品できる');
  assert.equal(s.course, null);
});

test('TOKU：悪いことで下がり、正道は高く・魔道は低くないと取れない。0で裏の人間に', async () => {
  const { addHate, addToku } = await import('../src/engine/effects.js');
  const { platformsFor } = await import('../src/engine/inventory.js');
  const s = createGame(31);
  openTree(s);
  s.exp = { info: 9999, act: 9999, tech: 9999, social: 9999, mind: 9999 };
  assert.equal(s.toku, 100);
  addHate(s, 10);
  assert.equal(s.toku, 90, '炎上するようなことをすると徳も下がる');
  assert.equal(nodeState(s, 'tr_fair'), 'locked', '正道はTOKU110以上');
  assert.equal(nodeState(s, 'dk_bot'), 'locked', '魔道はTOKU80未満');
  addToku(s, 30);
  assert.ok(learnSkill(s, 'tr_fair'));
  addToku(s, -60);
  assert.ok(learnSkill(s, 'dk_bot'));
  assert.equal(s.toku, 45, '魔道のパネルは取るたびにTOKUが下がる');
  for (const id of ['dk_crew', 'dk_names', 'dk_fakes']) assert.ok(learnSkill(s, id), id);
  assert.ok(s.underworld, 'TOKUが0になると裏の人間に');
  assert.equal(nodeState(s, 'tr_agent'), 'locked', '裏の人間は正道を歩めない');
  const u = s.inventory[0];
  assert.deepEqual(platformsFor(s, u).map((p) => p.id), ['black'], '表の販路は凍結、裏市場だけ');
});

test('TOKU：ふだんの商売の炎上では動かず、寄付で積める', async () => {
  const { addHate } = await import('../src/engine/effects.js');
  const s = createGame(33);
  addHate(s, 3, false);
  addHate(s, -2, false);
  assert.equal(s.toku, 100, '行列・高値の転売・自然に冷める分は徳に響かない');
  s.stage = 2;
  s.cash = 2_000_000;
  assert.ok(availableCommands(s).some((c) => c.id === 'donate'), 'ステージ2から寄付できる');
  const steps = performCommand(s, 'donate');
  const pick = steps.find((x) => x.t === 'choice').options.find((o) => o.label.includes('義援金'));
  pick.run();
  assert.equal(s.toku, 115, '100万円の義援金で TOKU +15');
  assert.ok(s.cash <= 1_000_000);
});

test('蜘蛛の糸：足を洗うと財産とパネルを失い、基礎能力だけ残る', async () => {
  const { washHands } = await import('../src/engine/underworld.js');
  const { fallUnderworld } = await import('../src/engine/effects.js');
  const s = createGame(32);
  s.cash = 9_000_000;
  s.abilities.eye = 77;
  s.skills.push('src_home', 'src_store', 'bargain', 'dk_bot');
  fallUnderworld(s);
  washHands(s);
  assert.equal(s.cash, 0);
  assert.equal(s.inventory.length, 0);
  assert.ok(!s.skills.includes('bargain') && !s.skills.includes('dk_bot'));
  assert.equal(s.abilities.eye, 77);
  assert.equal(s.toku, 50);
  assert.ok(!s.underworld && s.probation > 0);
  const { finalResult } = await import('../src/engine/ending.js');
  assert.equal(finalResult(s).ending.id, 'spider');
});

test('新ジャンルはステージ3以降、講座で知識を得るまで仕入れ候補に出ず「未知のジャンル」で見える', async () => {
  const { storeOffers } = await import('../src/engine/offers.js');
  const s = createGame(33);
  s.stage = 3;
  s.flags.license = 1;
  s.skills.push('src_home', 'src_store', 'src_used');
  const seen = () => { const set = new Set(); let unknown = 0; for (let i = 0; i < 60; i++) for (const o of storeOffers(s)) { set.add(o.pid); if (o.unknown) unknown++; } return { set, unknown }; };
  let r = seen();
  assert.ok(!['art_print', 'retro_pc', 'rocking', 'harp_box', 'lacquer'].some((p) => r.set.has(p)));
  assert.ok(r.unknown > 0);
  s.certs = ['know_antique'];
  r = seen();
  assert.ok(['rocking', 'harp_box', 'lacquer'].some((p) => r.set.has(p)), 'アンティークを学ぶと仕入れられる');
});

test('自分の店：出品していない在庫が店頭で売れ、家賃がかかる', async () => {
  const { shopWeek, shopMonthly } = await import('../src/engine/mystore.js');
  const s = createGame(34);
  s.stage = 4;
  s.shop = { loc: 'station', renov: 0, staff: true, counter: false, opened: 0 };
  s.cash = 1_000_000;
  for (let i = 0; i < 20; i++) buy(s, { oid: 500 + i, pid: 'boots', price: 9000, maxQty: 1, points: 0, fakeRate: 0 }, 1, 'cash');
  let sold = 0;
  for (let w = 0; w < 4; w++) { s.week++; sold += shopWeek(s).sold; }
  assert.ok(sold > 0, '駅前で定番品が売れる');
  const cash = s.cash;
  shopMonthly(s);
  assert.equal(cash - s.cash, 400000 + 250000);
});

// ---------------- 仕入れの現場（店舗巡り・夜のスマホ） ----------------
import { autoVisible, buildPhoneRun, buildStoreRun, expectedSections, phoneFillers, settleAuction, negotiate, storeClock, totalOffersFor } from '../src/engine/sourcing.js';
import { storeOfferCount, storeOffers, onlineOffers } from '../src/engine/offers.js';

test('店舗巡り：すべての品がどこか1つの棚にあり、ふつうに回れば今までの数は見つかる', () => {
  for (const seed of [3, 7, 11, 19]) {
    const s = createGame(seed);
    s.stage = 2;
    s.skills.push('src_store');
    const clock = storeClock(s);
    const n = storeOfferCount(s);
    const list = storeOffers(s, totalOffersFor(n, clock));
    const run = buildStoreRun(s, list, clock, n);
    const ids = run.stores.flatMap((st) => st.sections.flatMap((sec) => sec.oids));
    assert.equal(ids.length, list.length);
    assert.equal(new Set(ids).size, list.length);
    assert.ok(autoVisible({ offers: list, run }).length >= Math.min(n, list.length) - 1, `seed ${seed}: 見つかる数が少なすぎる`);
  }
});

test('店舗巡り：最初は2〜3店舗、地図・AI・車で回れる店が増える', () => {
  const s = createGame(1);
  const per = (c) => expectedSections(c) / 2.7;
  const base = per(storeClock(s));
  assert.ok(base >= 2 && base <= 3.6, `最初の店舗数 ${base}`);
  s.skills.push('ino_map', 'eye_ai');
  s.lifestyle = 2;
  s.abilities.buy = 100;
  assert.ok(per(storeClock(s)) > base + 2);
});

test('夜のスマホ：相場どおりの出品はオートに見せない・オークションは上限額で決まる', () => {
  const s = createGame(5);
  s.flags.license = true;
  s.skills.push('src_online', 'src_flea');
  const list = onlineOffers(s);
  const feed = [...list, ...phoneFillers(s, list)];
  const run = buildPhoneRun(s, feed);
  assert.ok(feed.some((o) => o.filler));
  assert.ok(autoVisible({ offers: feed, run }).every((o) => !o.filler));
  const o = { auction: { rivalMax: 10000, cur: 5000, extend: false } };
  assert.equal(settleAuction(o, 9000).won, false);
  const w = settleAuction(o, 20000);
  assert.ok(w.won && w.final === 10500);
  assert.ok(settleAuction(o, 9500, { snipe: true }).won); // 終了間際ならライバルは上げ直せない
  assert.equal(settleAuction({ auction: { ...o.auction, extend: true } }, 9500, { snipe: true }).won, false); // 自動延長ありでは効かない
  const it = { price: 10000, listing: { seller: {} } };
  let ok = 0;
  for (let i = 0; i < 40; i++) { const x = { ...it }; if (negotiate(s, x, 0.05).ok) { ok++; assert.ok(x.price < 10000); } }
  assert.ok(ok > 15 && ok < 40);
});

// ---------------- ミッションと店の人たち ----------------
import { acceptQuest, checkQuests, dropQuest, QUESTS, questRows } from '../src/engine/quests.js';
import { folkEvent, storeFolk } from '../src/engine/storefolk.js';
import { repay } from '../src/engine/finance.js';

test('ミッション：繰上げ返済で達成し、報酬は経験点（お金ではない）', () => {
  const s = createGame(4);
  s.debt = 500000;
  s.cash = 400000;
  assert.ok(acceptQuest(s, 'q_repay'));
  assert.equal(checkQuests(s).length, 0);
  const cash = s.cash;
  repay(s, 100000);
  const before = s.exp.mind;
  const steps = checkQuests(s);
  assert.ok(steps.some((x) => x.title === 'ミッション達成！'));
  assert.equal(s.cash, cash - 100000);
  assert.ok(s.exp.mind > before);
  assert.ok(s.quests.done.includes('q_repay'));
  assert.ok(!acceptQuest(s, 'q_repay'), '達成したミッションは二度と受けない');
});

test('ミッション：新しい仕入れ先がもらえる・あきらめられる・登場人物は実在する', () => {
  const s = createGame(6);
  s.stage = 3;
  acceptQuest(s, 'h_ino');
  s.stats.maxStores = 6;
  checkQuests(s);
  assert.ok((s.spots || []).length === 1);
  acceptQuest(s, 'h_edison');
  dropQuest(s, 'h_edison');
  assert.equal(questRows(s).length, 0);
  for (const [id, d] of Object.entries(QUESTS)) {
    assert.ok(CAST[d.from], `${id} の依頼主`);
    assert.ok(d.reward.exp || d.reward.spot, `${id} の報酬`);
  }
});

test('店の人たち：独り言は10文字以内、「！」で出会いのイベントが起きる', () => {
  const s = createGame(8);
  s.stage = 2;
  const kinds = new Set();
  for (let i = 0; i < 200; i++) {
    const store = { type: ['kaden', 'drug', 'zakka', 'hobby', 'used', 'book', 'luxury', 'spot'][i % 8] };
    const folk = storeFolk(s, store);
    for (const f of folk) {
      assert.ok([...f.line].length <= 10, `「${f.line}」が長い`);
      assert.ok(CAST[f.who], f.who);
      const r = folkEvent(s, f, store);
      assert.ok(r.lines.length && r.result.length);
      kinds.add(r.offer ? 'offer' : r.quest ? 'quest' : f.role === 'rival' ? 'route' : 'exp');
    }
  }
  assert.deepEqual([...kinds].sort(), ['exp', 'offer', 'quest', 'route']);
});

test('難易度：借金・最低返済・金利が変わり、古いセーブは「ふつう」で遊べる', () => {
  const hard = createGame(5, 'hard');
  assert.equal(hard.debt, DIFFICULTIES.hard.debt);
  hard.cash = 1000000;
  const before = hard.debt;
  monthEnd(hard);
  const interest = Math.round((before * DIFFICULTIES.hard.rate) / 12);
  assert.equal(hard.debt, before + interest - DIFFICULTIES.hard.minPay);
  const easy = createGame(5, 'easy');
  assert.equal(easy.debt, DIFFICULTIES.easy.debt);
  assert.equal(minPayment(easy), DIFFICULTIES.easy.minPay);
  const old = createGame(5);
  delete old.difficulty;
  assert.equal(minPayment(old), DIFFICULTIES.normal.minPay);
});

test('デイリーチャレンジ：同じ日なら同じシード、日が変われば別のシード', () => {
  const key = todayKey(new Date(2026, 9, 7));
  assert.equal(key, '2026-10-07');
  assert.equal(dailySeed(key), dailySeed('2026-10-07'));
  assert.notEqual(dailySeed(key), dailySeed('2026-10-08'));
  const a = createGame(dailySeed(key));
  const b = createGame(dailySeed(key));
  assert.deepEqual(a.market, b.market);
});

test('専門マーケット：スニーカー・トレカだけ、ステージ2から。偽物は鑑定ではじかれ、本物は相場の1割増しで売れる', async () => {
  const { platformsFor, addUnits } = await import('../src/engine/inventory.js');
  const { resolveSales } = await import('../src/engine/sales.js');
  const s = createGame(11);
  s.flags.tutorialDone = true;
  addUnits(s, 'boots', 1, 5000);
  addUnits(s, 'sake', 1, 5000);
  const [boots, sake] = s.inventory.slice(-2);
  assert.ok(!platformsFor(s, boots).some((x) => x.id === 'spec'), 'ステージ1ではまだ使えない');
  s.stage = 2;
  assert.ok(platformsFor(s, boots).some((x) => x.id === 'spec'));
  assert.ok(!platformsFor(s, sake).some((x) => x.id === 'spec'), '専門外のジャンルは出せない');
  const t = createGame(11);
  t.style = { type: 'spec', cat: 'tcg' };
  addUnits(t, 'scroll', 1, 5000);
  assert.ok(platformsFor(t, t.inventory.at(-1)).some((x) => x.id === 'spec'), 'その商材の専門家なら最初から');

  boots.fake = true;
  boots.listing = { platform: 'spec', price: 100, week: s.week };
  const out = resolveSales(s);
  assert.equal(out.authFailed.length, 1);
  assert.ok(!out.sold.some((x) => x.uid === boots.uid));
  assert.ok(boots.authFail && !boots.listing);
  assert.ok(!platformsFor(s, boots).some((x) => x.id === 'spec'), '鑑定NGの品は出し直せない');
});

test('輸出：マルコ・ポーロの紹介で海外ECが開き、国内で値崩れした品は海外で高く売れる', async () => {
  const { abroadMult, platformMult, platformsFor, addUnits } = await import('../src/engine/inventory.js');
  const { EVENTS } = await import('../src/data/events.js');
  const s = createGame(12);
  s.stage = 2;
  s.cash = 100000;
  addUnits(s, 'boots', 1, 5000);
  const u = s.inventory.at(-1);
  assert.ok(!platformsFor(s, u).some((x) => x.id === 'exp'));
  const ev = EVENTS.find((e) => e.id === 'marco_2');
  assert.ok(ev.cond(s));
  const steps = ev.play(s);
  steps.find((x) => x.t === 'choice').options[0].run();
  assert.equal(s.cash, 70000);
  assert.ok(platformsFor(s, u).some((x) => x.id === 'exp'));
  // 型落ちで国内の相場が定価の65%まで下がっても、海外では定価で見てもらえる
  s.market.boots.p = 0.65;
  assert.ok(Math.abs(abroadMult(s, u) - 1 / 0.65) < 0.01);
  s.fx = 1.2;
  assert.ok(Math.abs(platformMult(s, 'exp', u) - 1.2 / 0.65) < 0.01);
  s.market.boots.p = 1.3;
  assert.equal(abroadMult(s, u), 1, '国内のほうが高ければ、倍率は為替だけ');
});

test('中国輸入：3週後に届き、関税・検品不良がある。税関で止まると遅れ、コピー品は没収される', async () => {
  const { buy } = await import('../src/engine/inventory.js');
  const { importOffers } = await import('../src/engine/offers.js');
  const { importWeek, IMPORT_WEEKS, HOLD_WEEKS } = await import('../src/engine/importer.js');
  const s = createGame(21);
  s.stage = 2;
  s.cash = 5000000;
  s.skills.push('warehouse', 'warehouse2'); // ロットが入る置き場
  s.flags.importIntro = true;
  const offs = importOffers(s);
  assert.ok(offs.length > 0 && offs.every((o) => o.import && o.minQty === 10 && o.arriveWeek === s.week + IMPORT_WEEKS));
  const o = offs.find((x) => !x.knockoff);
  assert.equal(buy(s, o, 5).ok, false, '最低10個から');
  assert.notEqual(buy(s, o, 20).ok, false);
  const lot = s.imports.at(-1);
  lot.held = false;
  lot.seized = false;
  lot.defects = 3;
  for (const u of s.inventory.filter((x) => lot.uids.includes(x.uid))) u.arrive = lot.due;
  const cash = s.cash;
  s.week = lot.due;
  const steps = importWeek(s);
  assert.ok(steps.some((x) => x.t === 'info' && /届いた/.test(x.title)));
  assert.equal(s.cash, cash - Math.round(lot.cost * 0.1), '関税10%');
  assert.equal(s.inventory.filter((x) => lot.uids.includes(x.uid) && x.damaged).length, 3);
  assert.equal(s.imports.length, 0);

  // 税関で止まる → 遅れて届く ／ コピー品は没収
  const k = { ...o, knockoff: true, fakeRate: 1, arriveWeek: s.week + IMPORT_WEEKS };
  s.inventory = [];
  assert.notEqual(buy(s, { ...o, arriveWeek: s.week + IMPORT_WEEKS }, 10).ok, false);
  assert.notEqual(buy(s, k, 10).ok, false);
  const [held, seized] = s.imports.slice(-2);
  held.held = true; held.seized = false;
  seized.seized = true; seized.held = false;
  for (const u of s.inventory.filter((x) => held.uids.includes(x.uid))) u.arrive = held.due + HOLD_WEEKS;
  s.week = held.due;
  const st = importWeek(s);
  assert.ok(st.some((x) => x.t === 'info' && /税関で止まった/.test(x.title)));
  assert.ok(st.some((x) => x.t === 'info' && /没収/.test(x.title)));
  assert.equal(s.inventory.filter((x) => seized.uids.includes(x.uid)).length, 0);
  assert.equal(s.inventory.filter((x) => held.uids.includes(x.uid)).length, 10);
  s.week = held.due + HOLD_WEEKS;
  assert.ok(importWeek(s).some((x) => x.t === 'info' && /届いた/.test(x.title)));
});

test('店のクセ：3回通うと覚える。クセは周ごとに決まっていて、店選びと値段・個数に効く。遠征は店舗せどり10回から', async () => {
  const { habitKey, knownHabit, visitStore, mapEntries, HABITS } = await import('../src/engine/storemap.js');
  const { buildStoreRun, storeClock } = await import('../src/engine/sourcing.js');
  const { storeOffers } = await import('../src/engine/offers.js');
  const s = createGame(31);
  assert.equal(habitKey(s, 'デンキの大魔王'), habitKey(createGame(31), 'デンキの大魔王'), '同じ周なら同じクセ');
  const st = { name: 'デンキの大魔王', label: '家電量販店' };
  assert.equal(visitStore(s, st), null);
  visitStore(s, st);
  assert.equal(knownHabit(s, st.name), null);
  assert.equal(visitStore(s, st), HABITS[habitKey(s, st.name)], '3回目で覚える');
  assert.ok(knownHabit(s, st.name));
  assert.equal(mapEntries(s)[0].visits, 3);

  // 転売に厳しい店の品は2個まで、棚の奥に旧品がある店の品は5%安い
  s.stats.purchases = 5;
  const list = storeOffers(s, 30);
  const before = new Map(list.map((o) => [o.oid, o.price]));
  const run = buildStoreRun(s, list, storeClock(s), 6);
  const byId = new Map(list.map((o) => [o.oid, o]));
  for (const x of run.stores) {
    const ids = x.sections.flatMap((sec) => sec.oids);
    if (x.habit === 'strict') for (const id of ids) assert.ok(byId.get(id).maxQty <= 2 || byId.get(id).scarce);
    if (x.habit === 'deep') for (const id of ids) if (!byId.get(id).scarce) assert.ok(byId.get(id).price < before.get(id) || before.get(id) <= 10);
  }

  // 遠征
  s.stage = 1;
  s.skills.push('src_store');
  assert.ok(!availableCommands(s).some((c) => c.id === 'expedition'));
  s.stats.storeTrips = 10;
  s.cash = 100000;
  assert.ok(availableCommands(s).some((c) => c.id === 'expedition'));
  const steps = performCommand(s, 'expedition');
  const of = steps.find((x) => x.t === 'offers');
  assert.ok(of.run.region && of.run.stores.every((x) => x.spot || x.name.startsWith(of.run.region)));
  assert.equal(of.run.clock.start, 600, '朝10時から回れる');
  assert.equal(s.cash, 94000, '交通費');
});

test('撮影の出来で売れ行きが変わり、発送の演出は部屋にある品だけ。カードの利用代金は確定メールが届く', async () => {
  const { applyPhoto, listBoostOf, shipTargets } = await import('../src/engine/worklife.js');
  const s = createGame(41);
  s.listBoost = true;
  assert.equal(listBoostOf(s), 1.25, 'オートは標準の出来');
  assert.equal(applyPhoto(s, { bg: 'floor', light: 'fluor', shots: 3 }).boost, 1.1);
  const st = s.stamina;
  assert.equal(applyPhoto(s, { bg: 'white', light: 'ring', shots: 10 }).boost, 1.34);
  assert.equal(s.stamina, st - 4, '10枚撮ると疲れる');
  assert.equal(shipTargets([{ pid: 'boots', platform: 'ama' }, { pid: 'boots', platform: 'merc' }]).length, 1, 'アマクリは倉庫から出荷');
  s.card.current = 30000;
  s.cash = 1000000;
  const steps = monthEnd(s);
  assert.ok(steps.some((x) => x.t === 'mail' && x.mails[0].subject.includes('ご利用代金確定')));
});

test('業者オークションの競りのロットと、問屋の見積書の交渉', async () => {
  const { seriLots, negotiateQuote } = await import('../src/engine/pro.js');
  const { wholesaleOffers } = await import('../src/engine/offers.js');
  const s = createGame(51);
  s.week = 200;
  s.stage = 3;
  const lots = seriLots(s, 2);
  assert.equal(lots.length, 2);
  for (const l of lots) assert.ok(l.start < l.rivalMax && l.step > 0 && l.start < l.est * 1.2);
  const offs = wholesaleOffers(s);
  const before = offs.map((o) => [o.price, o.minQty]);
  assert.equal(negotiateQuote(s, offs, 'rate', false), false);
  assert.deepEqual(offs.map((o) => [o.price, o.minQty]), before, '断られたら何も変わらない');
  negotiateQuote(s, offs, 'rate', true);
  negotiateQuote(s, offs, 'lot', true);
  offs.forEach((o, i) => {
    if (o.source !== 'wholesale') return;
    assert.ok(o.price < before[i][0]);
    assert.equal(o.minQty, 10);
  });
});

test('シリーズの世代交代：次の世代は発売まで出回らず、出ると前の世代は型落ちで相場と買い手が下がる', async () => {
  const { PRODUCTS } = await import('../src/data/products.js');
  const { isRetired, demandOf, visibleProducts } = await import('../src/engine/market.js');
  const { storeOffers } = await import('../src/engine/offers.js');
  assert.ok(PRODUCTS.length >= 40);
  const g1 = PRODUCTS.find((p) => p.id === 'organ1');
  const g2 = PRODUCTS.find((p) => p.id === 'organ2');
  const s = createGame(61);
  assert.ok(!visibleProducts(s).some((p) => p.id === 'organ2'));
  for (let i = 0; i < 20; i++) assert.ok(!storeOffers(s, 30).some((o) => o.pid === 'organ2'));
  const d0 = demandOf(s, g1);
  while (s.week < g2.launch + 30) {
    s.week++;
    updateMarket(s);
  }
  assert.ok(isRetired(s, g1) && !isRetired(s, g2));
  assert.ok(s.market.organ1.p < 0.75, `型落ちの相場 ${s.market.organ1.p}`);
  assert.ok(demandOf(s, g1) < d0 * 0.6);
  assert.ok(visibleProducts(s).some((p) => p.id === 'organ2'));
});

test('再販版：再販が決まった年のモデルをそのあとに仕入れると再販版（Rep画像・相場は1割安い）', async () => {
  const { productImage, productOf } = await import('../src/data/products.js');
  const { specialOffer } = await import('../src/engine/offers.js');
  const { buy } = await import('../src/engine/inventory.js');
  const { unitPrice } = await import('../src/engine/market.js');
  const s = createGame(71);
  s.cash = 1000000;
  s.market.heiho.edition = 1;
  const before = specialOffer(s, 'heiho', { source: 'store', price: 5500, maxQty: 2 });
  assert.ok(!before.rep);
  s.market.heiho.repEdition = 1; // 再販決定
  const o = specialOffer(s, 'heiho', { source: 'store', price: 5500, maxQty: 2 });
  assert.ok(o.rep);
  assert.ok(productImage(productOf('heiho'), true).endsWith('17016.png'));
  buy(s, before, 1);
  buy(s, o, 1);
  const [a, b] = s.inventory.slice(-2);
  assert.ok(!a.rep && b.rep);
  assert.equal(unitPrice(s, b), Math.round(unitPrice(s, a) * 0.9));
  const next = specialOffer(s, 'heiho', { source: 'store', price: 5500, maxQty: 2, edition: 2 });
  assert.ok(!next.rep, '翌年のモデルは初版');
});

test('季節商品：母の日・五月人形・お中元・冷感グッズ・ハロウィン・赤本・新生活家電は、山の週に高く、過ぎると値崩れする', async () => {
  const { PRODUCTS } = await import('../src/data/products.js');
  const { storeTypesOf } = await import('../src/engine/sourcing.js');
  const ids = ['may_doll', 'mothers', 'chugen', 'cooler', 'halloween', 'akahon', 'newlife'];
  for (const id of ids) {
    const p = PRODUCTS.find((x) => x.id === id);
    assert.ok(p && p.kind === 'seasonal' && p.release < p.peakWeek && p.peakWeek < 48, id);
    assert.ok(storeTypesOf(p).length);
  }
  const s = createGame(81);
  const peaks = {};
  for (s.week = 1; s.week < 48 * 2; s.week++) {
    updateMarket(s);
    for (const id of ids) {
      const p = PRODUCTS.find((x) => x.id === id);
      if (s.week === 48 + p.peakWeek) peaks[id] = s.market[id].p;
      if (s.week === 48 + p.peakWeek + 3) assert.ok(s.market[id].p < peaks[id] * 0.8, `${id} 山を越えると値崩れ`);
    }
  }
  assert.equal(storeTypesOf(PRODUCTS.find((x) => x.id === 'akahon'))[0], 'book');
});

test('スニーカーのサイズ：人気サイズは高く、ワゴンの売れ残りは不人気サイズが多い。サイズ違いの返品がある', async () => {
  const { sizeMult, pickSize } = await import('../src/engine/shoes.js');
  const { specialOffer } = await import('../src/engine/offers.js');
  const { buy } = await import('../src/engine/inventory.js');
  const { unitPrice } = await import('../src/engine/market.js');
  const { troubleSteps } = await import('../src/data/troubles.js');
  assert.ok(sizeMult(27) > sizeMult(25) && sizeMult(25) > sizeMult(23));
  const s = createGame(91);
  let bad = 0, badLeft = 0;
  for (let i = 0; i < 300; i++) {
    if (sizeMult(pickSize(s)) < 0.9) bad++;
    if (sizeMult(pickSize(s, { leftover: true })) < 0.9) badLeft++;
  }
  assert.ok(badLeft > bad * 1.3, `売れ残りは不人気サイズが多い ${bad} / ${badLeft}`);
  s.cash = 1000000;
  const o = specialOffer(s, 'boots', { source: 'store', label: 'ワゴンセール', price: 5000, maxQty: 2 });
  assert.ok(o.shoe >= 23 && o.shoe <= 30);
  assert.ok(o.listing.info.some(([k]) => k === 'サイズ'));
  assert.ok(specialOffer(s, 'sake', { source: 'store', price: 3000, maxQty: 2 }).shoe === undefined);
  buy(s, o, 1);
  const u = s.inventory.at(-1);
  assert.equal(u.shoe, o.shoe);
  const plain = { ...u, shoe: undefined };
  assert.ok(Math.abs(unitPrice(s, u) - unitPrice(s, plain) * sizeMult(u.shoe)) <= 1);
  const steps = troubleSteps(s, { kind: 'size', sale: { pid: 'boots', unit: u, id: 'x', ship: 700, price: 9000, net: 7000 } });
  assert.ok(steps.some((x) => x.t === 'choice'));
});

test('ジャンク品は動作確認・修理で価値が変わる。安すぎるバラパックはサーチ済みで、売るとトラブルになる', async () => {
  const { buy } = await import('../src/engine/inventory.js');
  const { specialOffer } = await import('../src/engine/offers.js');
  const { unitPrice } = await import('../src/engine/market.js');
  const { workOnJunk } = await import('../src/engine/junk.js');
  const { troubleSteps } = await import('../src/data/troubles.js');
  const s = createGame(101);
  s.cash = 1000000;
  s.stamina = 100;
  for (const state of ['works', 'fix', 'dead']) buy(s, specialOffer(s, 'cyber_staff', { source: 'used', label: 'ジャンクかご', price: 2000, maxQty: 1, junk: state }), 1);
  const [w, f, d] = s.inventory.slice(-3);
  const full = unitPrice(s, { ...w, junk: undefined });
  assert.equal(unitPrice(s, w), Math.round(full * 0.25), '未確認はジャンク値');
  workOnJunk(s, w);
  workOnJunk(s, d);
  assert.ok(unitPrice(s, w) > full * 0.8 && unitPrice(s, d) < full * 0.1);
  workOnJunk(s, f);
  s.abilities.pack = 200;
  for (let i = 0; i < 10 && f.junk.state === 'fix'; i++) workOnJunk(s, f);
  assert.equal(f.junk.state, 'works', '直せそうな品は修理で動くようになる');
  const steps = troubleSteps(s, { kind: 'fake', sale: { pid: 'packs', unit: { fake: true }, id: 'z', ship: 200, price: 1500, net: 1200, platform: 'merc' } });
  assert.ok(steps.some((x) => x.t === 'talk' && /サーチ済み/.test(x.text)));
});

test('くじ：年に4回始まり、引いた賞品が在庫に入る。最後の1枚でラストワン賞', async () => {
  const { kujiWeek, drawKuji, kujiLeft, kujiOpen } = await import('../src/engine/kuji.js');
  const s = createGame(111);
  s.cash = 1000000;
  s.week = 2;
  assert.ok(kujiWeek(s).length && kujiOpen(s));
  assert.equal(kujiLeft(s), 80);
  const r = drawKuji(s, 10);
  assert.equal(r.got.length, 10);
  assert.equal(s.cash, 1000000 - 7500);
  assert.equal(s.inventory.filter((u) => u.pid.startsWith('kuji_')).length, 10);
  s.week = 3;
  kujiWeek(s);
  assert.ok(kujiLeft(s) < 70, 'ほかの客も引く');
  const all = drawKuji(s, kujiLeft(s));
  assert.ok(all.last);
  assert.ok(s.inventory.some((u) => u.pid === 'kuji_last'));
  assert.ok(!kujiOpen(s));
});

test('薬機法：医薬品・カラコンは出品も買取もできず、サプリは効能をうたうと売れやすいが削除と警告のおそれ', async () => {
  const { addUnits, platformsFor, buybackQuote, listUnits } = await import('../src/engine/inventory.js');
  const { resolveSales } = await import('../src/engine/sales.js');
  const { specialOffer } = await import('../src/engine/offers.js');
  const s = createGame(121);
  s.flags.tutorialDone = true;
  s.skills.push('ch_miime');
  addUnits(s, 'kanpo', 1, 1000);
  addUnits(s, 'colorcon', 1, 800);
  for (const u of s.inventory.slice(-2)) {
    assert.equal(platformsFor(s, u).length, 0, `${u.pid} は出品できない`);
    assert.equal(buybackQuote(s, u), 0);
  }
  assert.ok(specialOffer(s, 'kanpo', { source: 'store', price: 900, maxQty: 3 }).listing.info.some(([k, v]) => k === '注意' && /薬機法/.test(v)));
  addUnits(s, 'supple', 30, 1500);
  const ids = s.inventory.filter((u) => u.pid === 'supple').map((u) => u.uid);
  assert.equal(listUnits(s, ids.slice(0, 5), 'merc', 99999, { claim: true }), 5);
  assert.ok(s.inventory.filter((u) => u.listing?.claim).length === 5);
  let removed = 0;
  for (let i = 0; i < 20 && !removed; i++) {
    removed = resolveSales(s).takedowns.length;
    s.week++;
  }
  assert.ok(removed > 0, '効能をうたった出品は、いずれ削除される');
  assert.ok(s.warnings >= 1);
});

test('仲間は20人以上、全員3段階以上の連続イベントがあり、新しい仲間の奥義が効く', async () => {
  const { COMPANIONS, SECRETS } = await import('../src/data/companions.js');
  const { EVENT_MAP } = await import('../src/data/events.js');
  const { capacity } = await import('../src/engine/inventory.js');
  const { livingCost } = await import('../src/engine/finance.js');
  const { estimateError } = await import('../src/engine/market.js');
  assert.ok(COMPANIONS.length >= 20);
  for (const c of COMPANIONS) {
    assert.ok(c.chain.length >= 3, c.who);
    for (const id of c.chain) assert.ok(EVENT_MAP[id], `${id} がない`);
    assert.ok(CAST[c.who], c.who);
  }
  const s = createGame(131);
  const cap = capacity(s);
  const live = livingCost(s);
  const err = estimateError(s);
  s.secrets = Object.keys(SECRETS);
  assert.equal(capacity(s), cap + 40);
  assert.equal(livingCost(s), Math.round(live * 0.8));
  assert.ok(Math.abs(estimateError(s) - err * 0.7) < 1e-9);
  assert.ok(availableCommands(s).some((c) => c.id === 'oem'), 'エジソンの奥義で自社製品をつくれる');
  // 最終段の出会いで奥義を授かる
  const t = createGame(132);
  t.affinity.napoleon = 2;
  t.stage = 3;
  t.abilities.pack = 60;
  EVENT_MAP.napoleon_3.play(t);
  assert.ok(t.secrets.includes('logistics'));
});

test('ステージ4〜5：スタッフの採用と育成、税務調査、事業売却の打診', async () => {
  const { EVENT_MAP } = await import('../src/data/events.js');
  const { staffDamageRate } = await import('../src/engine/staff.js');
  const s = createGame(141);
  s.stage = 4;
  assert.ok(EVENT_MAP.staff_hire.cond(s));
  EVENT_MAP.staff_hire.play(s).find((x) => x.t === 'choice').options[1].run();
  assert.equal(s.staff.kind, 'rookie');
  const r0 = staffDamageRate(s);
  const cash = s.cash;
  monthEnd(s);
  assert.ok(s.staff.skill > 30 && staffDamageRate(s) < r0, '毎月育つ');
  // 帳簿が整っていれば税務調査は指摘なし
  s.skills.push('ledger');
  s.monthly = Array.from({ length: 12 }, () => ({ net: 500000 }));
  const before = s.cash;
  EVENT_MAP.biz_audit.play(s);
  assert.equal(s.cash, before);
  // 事業売却：残り年数ぶんの利益の9割（最大3年分）
  s.stage = 5;
  s.week = 200;
  s.monthly = Array.from({ length: 12 }, () => ({ net: 1000000 }));
  s.skills.push('out_ship');
  const c0 = s.cash;
  EVENT_MAP.acquisition.play(s).find((x) => x.t === 'choice').options[0].run();
  assert.equal(s.cash, c0 + 36000000);
  assert.ok(s.over === 'exit' && !s.staff, '売却すると引退（イグジットEND）');
  assert.ok(cash > 0);
});

import { quickList } from '../src/engine/automation.js';
import { listingCap, listedUnits } from '../src/engine/inventory.js';
test('仕入れ後すぐ出品：新しく仕入れた品を相場で出品し、出品枠を超えない', () => {
  const s = createGame(3);
  s.cash = 1e7;
  const before = new Set(s.inventory.map((u) => u.uid));
  assert.equal(buy(s, { oid: 1, pid: 'boots', price: 3000, maxQty: 3, points: 0, fakeRate: 0 }, 3, 'cash').ok, true);
  const fresh = s.inventory.filter((u) => !before.has(u.uid)).map((u) => u.uid);
  const r = quickList(s, fresh);
  assert.ok(r.listed > 0 && r.total > 0);
  assert.ok(listedUnits(s).length <= listingCap(s));
  // 以前から持っていた品は出品されない
  assert.ok(s.inventory.filter((u) => before.has(u.uid)).every((u) => !u.listing));
});
