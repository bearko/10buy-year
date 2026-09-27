// 1週間の進行。startWeek → (プレイヤーの行動) → endWeek → week+1 → startWeek …
import { productOf } from '../data/products.js';
import { TOTAL_WEEKS, isMonthEnd, weekLabel } from './calendar.js';
import { addHate, addStamina, flag, record, setFlag, yen } from './effects.js';
import { updateMarket } from './market.js';
import { drawEvents } from './events.js';
import { monthEnd } from './finance.js';
import { resolveLotteries } from './commands.js';
import { lotteryOffer } from './offers.js';
import { resolveSales } from './sales.js';
import { negotiationSteps, troubleSteps } from '../data/troubles.js';
import { ROOM_CAPACITY, spaceUsed } from './inventory.js';
import { info, offers, sfx, talk } from './steps.js';

export function startWeek(s) {
  const steps = [];
  s.mods = { demand: 1, onlinePoints: 1, storeDiscount: 0, queueExtra: [] };
  s.listBoost = false;
  if (s.week > 0) s.news = updateMarket(s);

  // 売上金の入金
  const arrived = s.pending.filter((p) => p.week <= s.week);
  if (arrived.length) {
    const total = arrived.reduce((sum, p) => sum + p.amount, 0);
    s.pending = s.pending.filter((p) => p.week > s.week);
    s.cash += total;
    record(s, `売上金の入金（${arrived.length}件）`, total);
    steps.push(sfx('coin'), info('売上金が入金された', [`${arrived.length}件 / ${yen(total)}`], 'good'));
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
    steps.push(sfx('hint'), talk('mine', '古物商許可が下りたわ！ これで中古品やフリマからの仕入れができるわよ。', 'banzai'), info('古物商許可', ['中古品（古本・楽器・ジュエリー等）とフリマ仕入れが解禁された'], 'good'));
  }

  if (s.banWeeks > 0) {
    s.inventory.forEach((u) => {
      if (u.listing?.platform === 'merc') u.listing = null;
    });
  }

  steps.push(...drawEvents(s, 'calendar'));
  steps.push(...drawEvents(s, 'weekStart'));
  if (flag(s, 'arrest')) s.over = 'arrested';
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
    delayed: sales.delayed,
  });
  if (sales.sold.length) steps.unshift(sfx('sale'));
  for (const n of sales.negotiations) steps.push(...negotiationSteps(s, n));
  for (const t of sales.troubles) steps.push(...troubleSteps(s, t));

  const lot = resolveLotteries(s);
  steps.push(...lot.steps);
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
  const over = spaceUsed(s) > ROOM_CAPACITY;
  addStamina(s, over ? 3 : 6);
  addHate(s, -2);
  if (s.banWeeks > 0) s.banWeeks--;
  if (isMonthEnd(s.week)) steps.push(...monthEnd(s));
  // 月末の演出を今週の日付のまま見せてから、週を進める
  steps.push({ t: 'defer', run: () => advanceWeek(s) });
  return steps;
}

function advanceWeek(s) {
  s.week++;
  s.phase = 'weekStart';
  if (s.week >= TOTAL_WEEKS && !s.over) s.over = 'timeup';
  return [];
}
