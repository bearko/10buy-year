import { INITIAL_SKILLS } from '../data/skills.js';
import { initMarket, updateMarket } from './market.js';
import { addUnits } from './inventory.js';
import { emptyMonth } from './kpi.js';
import { DIFFICULTIES } from './finance.js';

export const SAVE_VERSION = 2;

// 最初から家にある不用品（プロローグで見つける）
export const STARTING_HOME_ITEMS = [
  ['novice_book', 3],
  ['old_hat', 1],
  ['gift_glass', 1],
];
// 「家の中を探す」でこれから見つかる物
export const HOME_POOL = ['novice_book', 'novice_book', 'old_figure', 'fountain_pen', 'old_hat', 'gift_glass', 'old_violin', 'novice_book', 'old_figure', 'gift_glass'];

export function createGame(seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0, difficulty = 'normal') {
  const s = {
    difficulty,
    version: SAVE_VERSION,
    seed,
    rng: seed >>> 0,
    week: 0,
    phase: 'weekStart',
    actionsLeft: 1,
    actionsPerWeek: 1,
    stage: 1,
    fulltime: false,
    corp: false,
    tutorial: 0,
    cash: 100000,
    points: 0,
    cardPoints: 0,
    pending: [],
    debt: (DIFFICULTIES[difficulty] || DIFFICULTIES.normal).debt,
    delinquency: 0,
    card: { limit: 100000, current: 0, due: 0 }, // 利用枠は「カード増枠の申請」で上げていく
    stamina: 100,
    maxStamina: 100,
    mood: 2,
    rating: 50,
    hate: 0,
    toku: 100, // TOKU（徳）
    underworld: false,
    sick: 0,
    banWeeks: 0,
    amaBan: 0,
    warnings: 0,
    abilities: { eye: 20, buy: 20, list: 20, talk: 20, pack: 20 },
    exp: { info: 0, act: 0, tech: 0, social: 0, mind: 0 }, // スキルに使う経験点。序盤は店舗せどりを目指す分だけ貯まる
    skills: [...INITIAL_SKILLS],
    nodeLv: {},
    hints: {},
    inventory: [],
    homePool: [...HOME_POOL],
    nextUid: 1,
    market: {},
    lotteries: [],
    flags: {},
    affinity: {},
    eventsSeen: {},
    mods: { demand: 1, onlinePoints: 1, storeDiscount: 0, queueExtra: [] },
    settings: { autoBuy: true },
    listBoost: false,
    news: [],
    ledger: [],
    lastCommand: null,
    over: null,
    cur: emptyMonth(),
    monthly: [],
    stats: {
      revenue: 0, fees: 0, shipping: 0, cogs: 0, spent: 0, expenses: 0, refunds: 0, interest: 0, repaid: 0, taxPaid: 0,
      soldUnits: 0, boughtUnits: 0, purchases: 0, purchasedSold: 0, scarceBought: 0, troubles: 0, alcoholSold: 0,
      bestSale: null, firstFlip: null, byPid: {}, storeTrips: 0, pointsEarned: 0, usedSold: 0, selfShipped: 0,
    },
  };
  initMarket(s);
  s.news = updateMarket(s);
  for (const [pid, n] of STARTING_HOME_ITEMS) addUnits(s, pid, n, 0, { home: true });
  return s;
}

export const grossProfit = (s) => s.stats.revenue - s.stats.fees - s.stats.shipping - s.stats.cogs;
