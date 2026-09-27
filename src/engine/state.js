import { initMarket, updateMarket } from './market.js';

export const SAVE_VERSION = 1;

export function createGame(seed = (Date.now() ^ (Math.random() * 1e9)) >>> 0) {
  const s = {
    version: SAVE_VERSION,
    seed,
    rng: seed >>> 0,
    week: 0,
    phase: 'weekStart',
    cash: 100000,
    points: 0,
    cardPoints: 0,
    pending: [],
    debt: 1500000,
    delinquency: 0,
    card: { limit: 500000, current: 0, due: 0 },
    stamina: 100,
    maxStamina: 100,
    mood: 2,
    rating: 50,
    hate: 0,
    sick: 0,
    banWeeks: 0,
    warnings: 0,
    abilities: { eye: 20, buy: 20, list: 20, talk: 20, pack: 20 },
    exp: { info: 20, act: 20, tech: 20, social: 20, mind: 20 },
    skills: [],
    hints: {},
    inventory: [],
    nextUid: 1,
    market: {},
    lotteries: [],
    flags: {},
    affinity: {},
    eventsSeen: {},
    mods: { demand: 1, onlinePoints: 1, storeDiscount: 0, queueExtra: [] },
    listBoost: false,
    news: [],
    ledger: [],
    lastCommand: null,
    over: null,
    stats: {
      revenue: 0, fees: 0, shipping: 0, cogs: 0, spent: 0, expenses: 0, refunds: 0, interest: 0, repaid: 0, taxPaid: 0,
      soldUnits: 0, boughtUnits: 0, scarceBought: 0, troubles: 0, alcoholSold: 0, bestSale: null, byPid: {},
    },
  };
  initMarket(s);
  s.news = updateMarket(s);
  return s;
}

export const grossProfit = (s) => s.stats.revenue - s.stats.fees - s.stats.shipping - s.stats.cogs;
