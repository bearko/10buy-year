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
