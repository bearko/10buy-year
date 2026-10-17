// 仮想通貨の再登場：ステージ4で余裕資金ができると、サトシが「余剰資金での投資」として戻ってくる。
// 受けると、メニュー「仮想通貨」でいつでも売買できる（行動は使わない）。相場は毎週動き、ときどきバブルと暴落が来る。
// 断ると二度と来ない。最後に資産の半分以上が仮想通貨の儲けなら「結局クリプトEND」
import { addExp, addMood, addToku, setFlag } from './effects.js';
import { chance, gauss, pick, randRange } from './rng.js';
import { choice, info, sfx, talk } from './steps.js';

// 銘柄（架空）。vol：毎週の値動きの大きさ、drift：毎週の平均の上がり方。
// $SAO はたいてい沈んでいくが、ときどき月まで飛ぶ（バブル）。ナカモトコインは長い目で見るとゆっくり上がる
export const COINS = {
  jpys: { name: 'ステーブル円', ticker: 'JPYS', vol: 0.0003, drift: 0.0008, start: 1, desc: '円と同じ値を保つコイン。年に4%ほどの利息がつく' },
  nkm: { name: 'ナカモトコイン', ticker: 'NKM', vol: 0.05, drift: 0.001, start: 5000000, desc: '最初の仮想通貨。値動きは大きいが、長い目で見ると上がってきた' },
  sao: { name: '$SAOコイン', ticker: 'SAO', vol: 0.14, drift: -0.009, start: 12, desc: 'クリスが借金を背負った因縁のコイン。一晩で何倍にも、何分の一にもなる' },
};
export const CRYPTO_STAGE = 4;
export const CRYPTO_CASH = 10000000;

const c = (s) => s.crypto;
export const cryptoOpen = (s) => !!s.crypto?.open;
export const price = (s, id) => c(s).prices[id];
export const holding = (s, id) => c(s).hold[id] || { qty: 0, cost: 0 };
export const holdingValue = (s) => (s.crypto?.open ? Object.keys(COINS).reduce((a, id) => a + Math.round((s.crypto.hold[id]?.qty || 0) * s.crypto.prices[id]), 0) : 0);
// 仮想通貨での儲け（売った分の損益＋持っている分の含み損益）
export const cryptoGain = (s) => (s.crypto?.open ? s.crypto.realized + Object.keys(COINS).reduce((a, id) => { const h = s.crypto.hold[id]; return a + (h ? Math.round(h.qty * s.crypto.prices[id]) - h.cost : 0); }, 0) : 0);

function open(s) {
  s.crypto = { open: true, since: s.week, prices: Object.fromEntries(Object.entries(COINS).map(([id, x]) => [id, x.start])), hist: Object.fromEntries(Object.keys(COINS).map((id) => [id, []])), hold: {}, realized: 0 };
}

// 週のはじめ：サトシの再登場と、相場の動き
export function cryptoWeek(s) {
  const steps = [];
  if (!s.crypto && s.flags.cryptoSworn === undefined && !s.underworld && s.stage >= CRYPTO_STAGE && s.cash >= CRYPTO_CASH && s.week >= (s.flags.cryptoAsk || 0)) {
    steps.push(
      talk('satoshi', 'やあ、クリスくん。ずいぶん稼いだようだね。……今度は借金じゃない。「余剰資金での投資」だよ。'),
      talk('mine', '……あなた、それで一度すべてを失ったのよ。', 'arms'),
      choice([
        { label: '余剰資金だけなら…話を聞く', sub: 'メニューに「仮想通貨」が開く', run: () => { open(s); return [talk('satoshi', '賢明だ。チャートは君を待っていたよ。'), info('仮想通貨', ['メニュー「仮想通貨」で、いつでも売買できる（行動は使わない）', 'ステーブル円・ナカモトコイン・$SAOコイン', '資産の半分以上が仮想通貨の儲けになったら……どうなるかな'])]; } },
        { label: '二度と手を出さない', sub: '精神+60・TOKU+5。サトシはもう来ない', run: () => { s.flags.cryptoSworn = s.week; addExp(s, { mind: 60 }); addToku(s, 5); return [sfx('levelup'), talk('chris', '僕はもう、一個ずつ確実に稼ぐって決めたんだ。', 'guts'), talk('mine', '……それでこそ、よ。', 'smile')]; } },
        { label: '今は考えない', run: () => { s.flags.cryptoAsk = s.week + 24; return [talk('satoshi', 'また来るよ。相場は待ってくれないけどね')]; } },
      ]),
    );
    return steps;
  }
  if (!cryptoOpen(s)) return steps;
  const cr = s.crypto;
  for (const [id, x] of Object.entries(COINS)) {
    cr.hist[id].push(cr.prices[id]);
    if (cr.hist[id].length > 24) cr.hist[id].shift();
    cr.prices[id] = Math.max(x.start * 0.01, cr.prices[id] * Math.exp(x.drift + gauss(s) * x.vol));
  }
  // バブルと暴落（ステーブル円以外。週に2%）
  if (chance(s, 0.02)) {
    const id = pick(s, ['nkm', 'sao']);
    const up = chance(s, 0.5);
    const mult = up ? randRange(s, 1.6, id === 'sao' ? 4 : 2) : randRange(s, id === 'sao' ? 0.12 : 0.4, 0.6);
    cr.prices[id] *= mult;
    const held = (cr.hold[id]?.qty || 0) > 0;
    if (held && !up) addMood(s, -1);
    steps.push(sfx(up ? 'win' : 'lose'), talk('satoshi', up ? `「${COINS[id].name}が月まで飛んだよ。……持っていれば、ね」` : `「${COINS[id].name}が暴落した。……チャートは嘘をつかない。読み違えるのは人間だ」`), info(up ? `${COINS[id].name} 急騰` : `${COINS[id].name} 暴落`, [`1週間で ${up ? '+' : ''}${Math.round((mult - 1) * 100)}%`, held ? (up ? '持っていた分が大きく増えた' : '持っていた分が大きく減った。やる気が下がった') : '持っていなかった'], up ? 'good' : 'bad'));
  }
  return steps;
}

// 売買（メニューから）。amount は円
export function buyCoin(s, id, amount) {
  if (!cryptoOpen(s) || amount <= 0 || s.cash < amount) return false;
  const h = (s.crypto.hold[id] ||= { qty: 0, cost: 0 });
  h.qty += amount / s.crypto.prices[id];
  h.cost += amount;
  s.cash -= amount;
  return true;
}
export function sellCoin(s, id, ratio = 1) {
  const h = s.crypto?.hold[id];
  if (!h || h.qty <= 0) return 0;
  const qty = h.qty * ratio;
  const got = Math.round(qty * s.crypto.prices[id]);
  const cost = Math.round(h.cost * ratio);
  h.qty -= qty;
  h.cost -= cost;
  s.cash += got;
  s.crypto.realized += got - cost;
  return got;
}

// 最終査定：資産の半分以上が仮想通貨の儲けなら「結局クリプトEND」
export function cryptoCarried(s, nw) {
  const g = cryptoGain(s);
  if (g > 0 && nw > 0 && g >= nw * 0.5) {
    setFlag(s, 'cryptoWin');
    return true;
  }
  return false;
}
