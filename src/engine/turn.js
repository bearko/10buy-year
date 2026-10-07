// 1週間の進行。startWeek →（行動 × actionsPerWeek）→ endWeek → 次の週 …
import { shopWeek } from './mystore.js';
import { productOf } from '../data/products.js';
import { TOTAL_WEEKS, isMonthEnd, isYearEnd, monthOf, weekLabel, weekOfMonth, woy, yearOf } from './calendar.js';
import { addHate, addStamina, flag, hasSkill, record, setFlag, yen } from './effects.js';
import { updateMarket } from './market.js';
import { drawEvents } from './events.js';
import { monthEnd } from './finance.js';
import { resolveLotteries } from './commands.js';
import { checkQuests, questWeek } from './quests.js';
import { lotteryOffer } from './offers.js';
import { resolveSales } from './sales.js';
import { negotiationSteps, troubleSteps } from '../data/troubles.js';
import { decaySaturation, rivalWeek } from './rivals.js';
import { regimeWeek } from './regimes.js';
import { deptWeek } from './collection.js';
import { careerWeek } from './careers.js';
import { annalWeek } from './annals.js';
import { visionWeek } from './visions.js';
import { lifeStaminaBonus, lifestyleWeek } from './lifestyle.js';
import { cryptoWeek } from './crypto.js';
import { overCapacity } from './inventory.js';
import { autoList, autoReprice } from './automation.js';
import { stageOf, yearStart } from './career.js';
import { sumNet } from './kpi.js';
import { info, offers, sfx, talk } from './steps.js';
import { familyWeek } from './family.js';

export function startWeek(s) {
  const steps = [];
  s.mods = { demand: 1, onlinePoints: 1, storeDiscount: 0, queueExtra: [] };
  s.listBoost = false;
  s.actionsLeft = s.actionsPerWeek;
  s.nightLeft = s.stage >= 2 ? 1 : 0;
  if (s.week > 0) s.news = updateMarket(s);
  // 毎月の第1・第3週は、通販モールのポイントアップ週
  if ([1, 3].includes(weekOfMonth(s.week))) {
    s.mods.onlinePoints *= 1.3;
    if (hasSkill(s, 'src_online')) (s.news ||= []).push({ text: '【マイクリ市場】今週はポイントアップ週。電脳せどりのポイント還元が1.3倍', kind: 'info' });
  }
  // 12月は年末商戦：買い手が増え、発送とクレームも増える。年明けは発送が山積み
  if (monthOf(s.week) === 12) {
    s.mods.demand *= 1.25;
    s.mods.troubleMult = 1.3;
    if (weekOfMonth(s.week) === 1 && s.stats.soldUnits > 0) {
      steps.push(talk('mine', '12月は年末商戦よ。プレゼント需要で買い手が増えるぶん、発送もクレームも増えるわ。体力は残しておいてね。', 'pointer'), info('年末商戦', ['12月は買い手が1.25倍', '取引トラブルも1.3倍に増える']));
    }
  }
  if (monthOf(s.week) === 1 && weekOfMonth(s.week) === 1 && s.stats.soldUnits > 0 && s.week > 0) {
    addStamina(s, -10);
    steps.push(talk('narr', '年明けの月曜。年末から休み中に売れた分の発送が、部屋に山積みになっている…。'), talk('chris', '梱包、梱包、梱包…。正月気分が一瞬で吹き飛んだ…。', 'cry'), info('年明けの発送ラッシュ', ['体力 -10']));
  }
  steps.push(...familyWeek(s));
  if (s.week > 0 && woy(s.week) === 0) steps.push(...yearStart(s, yearOf(s.week)));

  // 売上金の入金
  const arrived = s.pending.filter((p) => p.week <= s.week);
  if (arrived.length) {
    const total = arrived.reduce((sum, p) => sum + p.amount, 0);
    s.pending = s.pending.filter((p) => p.week > s.week);
    s.cash += total;
    record(s, `売上金の入金（${arrived.length}件）`, total);
    steps.push(sfx('coin'), info('週明け：先週までの売上金が入金された', [`${arrived.length}件 / ${yen(total)}`], 'good'));
  }

  // 予約品の到着
  const delivered = s.inventory.filter((u) => u.arrive === s.week && u.week < s.week);
  if (delivered.length) steps.push(info('予約品が届いた', [...new Set(delivered.map((u) => productOf(u.pid).name))].map((n) => `「${n}」`)));

  // 生もの（賞味期限切れ）
  const expired = s.inventory.filter((u) => u.expire !== null && u.expire < s.week);
  if (expired.length) {
    s.inventory = s.inventory.filter((u) => !expired.includes(u));
    steps.push(talk('chris', '賞味期限が切れちゃった…。食べ物の転売は時間との勝負だ。', 'sad'), info('廃棄', [`${expired.length}個を廃棄した`], 'bad'));
  }

  // 古物商許可
  const pendingLicense = flag(s, 'licensePending');
  if (pendingLicense !== undefined && s.week >= pendingLicense) {
    delete s.flags.licensePending;
    setFlag(s, 'license');
    steps.push(sfx('hint'), talk('mine', '古物商許可が下りたわ！ スキルツリーの「リサイクルショップ・古本」を解放すれば、中古品を仕入れられるわよ。', 'banzai'), info('古物商許可', ['中古品を仕入れて売れるようになった（スキルツリーで仕入れ先を解放）'], 'good'));
  }

  // 利用制限中の販路からは出品が下がる
  for (const u of s.inventory) {
    if (u.listing?.platform === 'merc' && s.banWeeks > 0) u.listing = null;
    if (u.listing?.platform === 'ama' && s.amaBan > 0) u.listing = null;
  }

  // 仕組み化：価格改定ツールと外注の出品
  const repriced = autoReprice(s);
  const listed = autoList(s);
  if (repriced || listed) steps.push(info('仕組みが動いた', [listed ? `外注が${listed}件を出品した` : '', repriced ? `価格改定ツールが${repriced}件を値下げした` : '']));

  steps.push(...drawEvents(s, 'calendar'));
  steps.push(...drawEvents(s, 'weekStart'));
  steps.push(...regimeWeek(s));
  steps.push(...deptWeek(s));
  steps.push(...careerWeek(s));
  steps.push(...annalWeek(s));
  steps.push(...visionWeek(s));
  steps.push(...lifestyleWeek(s));
  steps.push(...cryptoWeek(s));
  steps.push(...rivalWeek(s));
  if (flag(s, 'arrest')) s.over = 'arrested';
  // ミッション：達成の報酬と、マインからの新しいミッション（engine/quests.js）
  steps.push(...checkQuests(s), ...questWeek(s));
  s.phase = 'command';
  return steps;
}

export function endWeek(s) {
  const steps = [];
  const sales = resolveSales(s);
  steps.push({
    t: 'sales',
    week: weekLabel(s.week),
    sold: sales.sold.map((x) => ({ pid: x.pid, price: x.price, platform: x.platform, net: x.net, profit: x.profit, delayed: !!x.delayed })),
    auctionsUnsold: sales.auctionsUnsold.map((x) => ({ pid: x.pid, bidders: x.bidders })),
    staminaUsed: sales.staminaUsed || 0,
    outsourced: sales.outsourced || 0,
    delayed: sales.delayed,
  });
  if (sales.sold.length) steps.unshift(sfx('sale'));
  for (const n of sales.negotiations) steps.push(...negotiationSteps(s, n));
  for (const t of sales.troubles) steps.push(...troubleSteps(s, t));

  const shop = shopWeek(s);
  if (shop) steps.push(info('自分の店', [`来客 ${shop.visitors}人・${shop.sold}点売れた（${yen(shop.revenue)}）`, shop.bought ? `買取カウンターで${shop.bought}点を買い取った` : ''], shop.sold ? 'good' : 'normal'));

  const lot = resolveLotteries(s);
  steps.push(...lot.steps);
  // 抽選の結果はメールで届く
  if (lot.wins.length || lot.losses.length) {
    const ms = [
      ...lot.wins.map((w) => ({ from: '公式抽選 事務局', subject: `【当選のお知らせ】${productOf(w.pid).name}`, body: `厳正なる抽選の結果、ご当選されました（${w.n}点）。購入手続きをお願いします。期限を過ぎると当選は無効になります。`, tone: 'good' })),
      ...lot.losses.map((pid) => ({ from: '公式抽選 事務局', subject: `抽選結果のお知らせ：${productOf(pid).name}`, body: '厳正なる抽選の結果、誠に残念ながら今回はご用意できませんでした。またのご応募をお待ちしております。', tone: 'bad' })),
    ];
    steps.push({ t: 'mail', mails: ms });
    if (!lot.wins.length) steps.push(talk('chris', '……「誠に残念ながら」。この一文、もう見飽きたよ。', 'sad'));
  }
  if (lot.wins.length) {
    steps.push(sfx('win'), talk('chris', '当選メールきた！！', 'cheer'));
    steps.push(offers(lot.wins.map((w) => ({ ...lotteryOffer(s, w.pid), maxQty: w.n })), '抽選に当選！', '購入しないと当選辞退になる'));
  }

  // 週の締めは、交渉やトラブルの選択肢をすべて解決してから行う（UI が defer を順番に実行する）
  steps.push({ t: 'defer', run: () => closeWeek(s) });
  return steps;
}

function closeWeek(s) {
  const steps = [];
  addStamina(s, (overCapacity(s) ? 3 : 6) + lifeStaminaBonus(s)); // 暮らしを上げると回復が増える
  addHate(s, -2, false);
  decaySaturation(s);
  if (s.banWeeks > 0) s.banWeeks--;
  if (s.amaBan > 0) s.amaBan--;
  if (isMonthEnd(s.week)) steps.push(...monthEnd(s));
  if (isYearEnd(s.week)) steps.push(yearReport(s));
  // 月末・年末の演出を今週の日付のまま見せてから、週を進める
  steps.push({ t: 'defer', run: () => advanceWeek(s) });
  return steps;
}

function yearReport(s) {
  const y = yearOf(s.week);
  const months = s.monthly.filter((m) => m.year === y);
  const revenue = months.reduce((a, m) => a + m.revenue, 0);
  const sold = months.reduce((a, m) => a + m.sold, 0);
  const st = stageOf(s);
  return info(`${y}年目のまとめ`, [
    `年間の純利益 ${yen(sumNet(months))}`,
    `売上 ${yen(revenue)}・販売 ${sold}個`,
    `ステージ${st.id}：${st.name}（次の目安：${st.next}）`,
    s.debt > 0 ? `残りの借金 ${yen(s.debt)}` : '借金なし',
  ], 'good');
}

function advanceWeek(s) {
  s.week++;
  s.phase = 'weekStart';
  if (s.week >= TOTAL_WEEKS && !s.over) s.over = 'timeup';
  return [];
}
