// 週に1〜2回選ぶ「行動」。育成シミュレーションの「練習メニュー」にあたる。
import { productOf } from '../data/products.js';
import { chance, pick, randInt } from './rng.js';
import { addCash, addExp, addHate, addMood, addStamina, clamp, flag, hasSkill, setFlag, yen } from './effects.js';
import { auctionOffers, lotteryEntries, lotteryWinRate, onlineOffers, openLotteries, queueOffer, queueSuccessRate, queueTargets, storeOffers, wholesaleOffers } from './offers.js';
import { addExpense, addHours } from './kpi.js';
import { perk } from './perks.js';
import { woy } from './calendar.js';
import { inBoom, priceOf } from './market.js';
import { addUnits, overCapacity } from './inventory.js';
import { drawEvents } from './events.js';
import { bg, choice, gain, info, narr, offers, talk } from './steps.js';

// node: その行動を解放するスキルツリーのノード / hours: 作業時間（時間単価の計算に使う）
export const COMMANDS = [
  { id: 'home_search', node: 'src_home', name: '家の中を探す', desc: '押し入れやクローゼットから、売れそうな不用品を探す', stamina: 5, exp: { info: 4, tech: 3 }, hours: 3, bg: 'home' },
  { id: 'store', node: 'src_store', name: '店舗せどり', desc: '近所の店を回って、ワゴンや値札ミスの掘り出し物を探す', stamina: 15, exp: { act: 12, info: 5, social: 2 }, hours: 10, bg: 'store' },
  { id: 'online', node: 'src_online', name: '電脳せどり', desc: '通販のポイント還元・予約・フリマの安値を探す', stamina: 8, exp: { info: 13, tech: 4 }, hours: 5, bg: 'online' },
  { id: 'lottery', node: 'src_lottery', name: '抽選に応募', desc: '受付中の限定品の抽選にまとめて応募する（結果は翌週）', stamina: 5, exp: { info: 6, mind: 6 }, hours: 2, bg: 'online' },
  { id: 'queue', node: 'src_queue', name: '行列に並ぶ', desc: '発売日・再販日に早朝から並ぶ。キツいが確実性は高い', stamina: 28, exp: { act: 15, mind: 10 }, hours: 8, bg: 'queue' },
  { id: 'auction', node: 'src_auction', name: '業者オークション', desc: '古物商だけの市場で、中古・コレクター品を相場の5〜7割で仕入れる', stamina: 10, exp: { info: 10, social: 8 }, hours: 6, bg: 'event' },
  { id: 'wholesale', node: 'src_wholesale', name: '問屋と商談', desc: '定番品をロット単位で卸値仕入れ。数が多いぶん販路と在庫スペースが要る', stamina: 8, exp: { social: 14, info: 6 }, hours: 5, bg: 'event' },
  { id: 'listing', name: '撮影・出品作業', desc: '写真を撮り直し説明文を磨く。今週の売れ行きが1.25倍に', stamina: 12, exp: { tech: 14, info: 4 }, hours: 6, bg: 'home' },
  { id: 'meetup', node: 'net_meetup', name: '物販交流会', desc: 'せどり仲間と情報交換（参加費3,000円）', stamina: 10, exp: { social: 14, info: 6 }, cost: 3000, hours: 4, bg: 'event' },
  { id: 'study', name: '勉強する', desc: '本や動画で相場・法律・税金を学ぶ', stamina: 4, exp: { info: 9, mind: 7, tech: 2 }, hours: 3, bg: 'study' },
  { id: 'parttime', name: '日雇いバイト', desc: '倉庫で働いて確実に稼ぐ（+22,000円）', stamina: 25, exp: { act: 4, mind: 5 }, pay: 22000, hours: 0, bg: 'warehouse' },
  { id: 'play', name: '気晴らし', desc: '公園や喫茶店でリフレッシュ（8,000円）。やる気と体力が回復', stamina: -15, exp: { mind: 3 }, cost: 8000, hours: 0, bg: 'park' },
  { id: 'rest', name: '休む', desc: '一日中寝る。体力が大きく回復する', stamina: 0, heal: 45, exp: {}, hours: 0, bg: 'home' },
  { id: 'license', node: 'license', name: '古物商許可を申請', desc: '警察署で申請（19,000円）。約6週間で許可が下りる', stamina: 8, exp: { info: 5, mind: 3 }, cost: 19000, hours: 3, bg: 'study' },
];
export const COMMAND_MAP = Object.fromEntries(COMMANDS.map((c) => [c.id, c]));

// 夜の作業（ステージ2から）：軽い作業だけできる。睡眠を削るので体力を余計に使う
export const NIGHT_COMMANDS = ['online', 'lottery', 'listing', 'study'];
export const NIGHT_EXTRA_STAMINA = 5;
export const hasNightSlot = (s) => s.stage >= 2;

export function availableNightCommands(s) {
  if (s.sick > 0) return [];
  return availableCommands(s).filter((c) => NIGHT_COMMANDS.includes(c.id));
}

export function availableCommands(s) {
  if (s.sick > 0) return [COMMAND_MAP.rest];
  return COMMANDS.filter((c) => {
    if (c.node && !hasSkill(s, c.node)) return false;
    if (c.id === 'license') return !flag(s, 'license') && flag(s, 'licensePending') === undefined;
    if (c.id === 'home_search') return s.homePool.length > 0;
    if (c.id === 'parttime') return !s.fulltime;
    return true;
  });
}

export function staminaCost(s, cmd) {
  let cost = cmd.stamina;
  if (cmd.id === 'store' && hasSkill(s, 'ino_map')) cost = Math.round(cost * 0.7);
  if (cmd.id === 'store' && hasSkill(s, 'backpain')) cost = Math.round(cost * 1.3);
  if (cmd.id === 'store') cost = Math.round(cost * perk(s, 'storeStamina'));
  return cost;
}

// 体調不良率（体力が低いまま重い行動をすると上がる）
export function sickRisk(s, cmd) {
  const cost = staminaCost(s, cmd);
  if (cost < 10) return 0;
  const after = s.stamina - cost;
  return clamp((25 - after) * 2.4, 0, 70) / 100;
}

export function performCommand(s, cmdId, { night = false } = {}) {
  const cmd = COMMAND_MAP[cmdId];
  const steps = [bg(cmd.bg)];
  if (cmd.cost && s.cash < cmd.cost) return [talk('chris', `お金が足りない…（${yen(cmd.cost)}必要）`, 'sad')];
  if (night) {
    steps.push(narr('夜。家族が寝静まったあと、もうひと仕事。'));
    s.flags.nightWork = (s.flags.nightWork || 0) + 1;
  }

  const cost = staminaCost(s, cmd) + (night ? NIGHT_EXTRA_STAMINA : 0);
  const risk = sickRisk(s, cmd);
  addStamina(s, -cost);
  if (cmd.cost) {
    if (['meetup', 'license'].includes(cmdId)) addExpense(s, cmd.cost, cmd.name);
    else addCash(s, -cmd.cost, cmd.name);
  }
  addHours(s, cmd.hours || 0);
  s.lastCommand = cmdId;

  if (risk > 0 && chance(s, risk)) {
    s.sick = 2;
    addMood(s, -1);
    steps.push(talk('chris', 'う…頭がくらくらする…。', 'sad'), narr('無理がたたって、クリスは体調を崩してしまった。'), info('体調不良', ['2週間は休むことしかできない', '売れた商品の発送も遅れてしまう…'], 'bad'));
    steps.push(...drawEvents(s, 'sick'));
    return steps;
  }

  const handler = HANDLERS[cmdId];
  steps.push(...handler(s, cmd));
  const applied = addExp(s, cmd.exp, { mood: true });
  if (Object.keys(applied).length) steps.push(gain(applied, cost > 0 ? [`体力 -${cost}`] : cost < 0 ? [`体力 +${-cost}`] : []));
  steps.push(...drawEvents(s, 'command', { cmd: cmdId }));
  return steps;
}

const HANDLERS = {
  home_search(s) {
    const n = Math.min(s.homePool.length, randInt(s, 1, 3));
    const found = [];
    for (let i = 0; i < n; i++) {
      const idx = randInt(s, 0, s.homePool.length - 1);
      const pid = s.homePool.splice(idx, 1)[0];
      addUnits(s, pid, 1, 0, { home: true });
      found.push(productOf(pid));
    }
    return [
      narr(pick(s, ['押し入れの奥から段ボールを引っ張り出した。', 'クローゼットの上の棚を探ってみた。', '実家から送られてきたまま開けていない箱を開けた。'])),
      talk('chris', `${found.map((p) => `「${p.genre}」`).join('、')}が出てきた。売れるかな？`, 'sparkle'),
      info('不用品が見つかった', [...found.map((p) => `${p.genre}（${p.name}）`), s.homePool.length ? `まだ何か眠っていそうだ` : 'もう売れそうな物はなさそうだ']),
    ];
  },
  store(s) {
    s.flags.didStore = true;
    s.stats.storeTrips = (s.stats.storeTrips || 0) + 1;
    const list = storeOffers(s);
    return [
      talk('chris', pick(s, ['よし、今日は駅前から郊外まで5店舗回るぞ！', 'ワゴンの奥に宝が眠ってる…はず！', '値札の貼り替え日を狙って来たんだ。']), 'guts'),
      offers(list, '店舗で見つけた商品', '推定相場と仕入れ値の差が利益の目安。手数料10%と送料も忘れずに'),
    ];
  },
  online(s) {
    const list = onlineOffers(s);
    const steps = [talk('chris', pick(s, ['ポイント還元率、予約ページ、フリマの新着…全部チェックだ。', 'F5連打で在庫復活を狙う！', '通販サイトのセール情報をまとめて確認しよう。']), 'arms')];
    const forecast = forecastLine(s);
    if (forecast) steps.push(info('相場メモ', [forecast]));
    steps.push(offers(list, 'ネットで見つけた商品', '「激安」には理由があるかも…'));
    return steps;
  },
  lottery(s) {
    const open = openLotteries(s);
    if (!open.length) return [talk('chris', '今は受付中の抽選がないみたいだ…。', 'sad'), narr('（応募フォームの入力速度だけは上がった）')];
    const base = lotteryEntries(s);
    const names = open.map((p) => `「${p.name}」`).join('');
    const register = (mode, extra) => {
      for (const p of open) s.lotteries.push({ pid: p.id, entries: base + extra, mode, week: s.week });
      return [info('応募完了', [`${names}に各${base + extra}口ずつ応募した`, `当選確率の目安: 1口あたり約${Math.round(lotteryWinRate(s, open[0]) * 100)}%`, '結果は来週わかる'])];
    };
    return [
      talk('chris', `受付中の抽選は${names}。どうやって応募しよう…。`, 'arms'),
      choice([
        { label: `自分の名義だけで応募（${base}口）`, run: () => register('fair', 0) },
        {
          label: `家族や友人に頼む（+2口・お礼5,000円）`,
          sub: '規約次第ではグレー',
          run: () => {
            if (s.cash < 5000) return [talk('chris', 'お礼を払うお金もない…', 'sad'), ...register('fair', 0)];
            addCash(s, -5000, '抽選のお礼');
            addHate(s, 1);
            return [talk('mine', '名義を借りた応募は、販売元の規約で禁止されていることも多いわよ。', 'arms'), ...register('family', 2)];
          },
        },
        {
          label: '捨てアカを量産して応募（+6口）',
          sub: '規約違反',
          run: () => [talk('mine', '……それ、完全に規約違反よ。バレたら当選取り消しじゃ済まないかも。', 'arms'), ...register('multi', 6)],
        },
      ]),
    ];
  },
  queue(s) {
    const targets = queueTargets(s);
    if (!targets.length) {
      addHate(s, 1);
      return [narr('早朝から家電量販店の開店待ちに並んでみた…が、今日は目玉商品がなかった。'), talk('chris', '情報収集不足だった…。「相場」画面のニュースを見てから並ぶべきだった。', 'sad')];
    }
    const t = targets[0];
    const p = productOf(t.pid);
    const crowd = p.kind === 'perishable' ? 0.9 : inBoom(s, p.id) ? 1.3 : 1.1;
    const rate = queueSuccessRate(s, crowd);
    addHate(s, 3);
    const steps = [narr(`${t.reason}の「${p.name}」を狙って、始発で店へ向かった。すでに長い列ができている…。`)];
    if (chance(s, rate)) {
      const qty = hasSkill(s, 'early_bird') && chance(s, 0.5) ? 2 : 1;
      steps.push(talk('chris', '買えた…！ 整理券、ギリギリだった！', 'cheer'), offers([queueOffer(s, p.id, qty)], '行列の戦利品', `相場は約${Math.round(priceOf(s, p.id) / 1000)}千円（推定は購入画面で）`));
    } else {
      steps.push(talk('chris', '目の前で「本日分は完売です」の札が…。', 'wail'), info('完売', [`成功率は約${Math.round(rate * 100)}%だった`], 'bad'));
    }
    return steps;
  },
  auction(s) {
    return [
      narr('会員証を見せて、業者オークションの会場に入った。プロの目利きが静かに札を入れていく。'),
      offers(auctionOffers(s), '業者オークションの出品物', '真贋チェック済みの出品が多い。ただし相場の5〜7割なので、手数料と送料を引いて利益が出るかよく見て'),
    ];
  },
  wholesale(s) {
    return [
      narr('問屋の担当者と商談。「ロットでまとめていただけるなら、この掛け率で出せます」'),
      offers(wholesaleOffers(s), '問屋の卸値リスト', '最低ロットは20個。売り切れる販路と在庫スペースがあるか確認して'),
    ];
  },
  listing(s) {
    s.listBoost = true;
    return [
      talk('chris', pick(s, ['自然光で撮り直して、箱の角まで写す！', '説明文に「喫煙者・ペットなし」「即日発送」…と。', 'ハッシュタグもつけて検索に引っかかるように！']), 'guts'),
      info('出品作業', ['今週は出品中の商品が売れやすい（1.25倍）', '在庫画面で出品しておくのを忘れずに']),
    ];
  },
  meetup(s) {
    return [narr('せどり仲間の交流会。「今月はトレカが熱い」「あの店は転売対策が厳しくなった」…情報が飛び交う。'), talk('chris', 'ひとりでやってると視野が狭くなるな。', 'smile')];
  },
  study(s) {
    return [narr(pick(s, ['古物営業法、特定商取引法、チケット不正転売禁止法…。知らないと損どころか捕まる。', '手数料と送料を引いた「本当の利益」の計算方法を学んだ。', 'プラットフォームの禁止出品物の一覧を読み込んだ。']))];
  },
  parttime(s, cmd) {
    addCash(s, cmd.pay, '日雇いバイト');
    return [narr('倉庫で一日中ピッキング。腰は痛いが、確実にお金が入る。'), info('バイト代', [`${yen(cmd.pay)}を手に入れた`], 'good')];
  },
  play(s) {
    const d = addMood(s, 1);
    return [narr(pick(s, ['公園でぼーっとした。スマホの通知はオフにした。', '喫茶店で、相場のことを考えずにコーヒーを飲んだ。'])), info('リフレッシュ', ['体力 +15', d ? 'やる気が上がった' : ''], 'good')];
  },
  rest(s) {
    let heal = COMMAND_MAP.rest.heal;
    if (hasSkill(s, 'insomnia')) heal *= 0.6;
    if (overCapacity(s)) heal *= 0.5;
    heal = Math.round(heal);
    addStamina(s, heal);
    const lines = [narr(s.sick > 0 ? '布団から出られない…。' : 'ぐっすり眠った。'), info('休養', [`体力 +${heal}`], 'good')];
    if (s.sick > 0) s.sick--;
    return lines;
  },
  license(s) {
    setFlag(s, 'licensePending', s.week + 6);
    return [
      narr('警察署の生活安全課で、古物商許可を申請した。住民票、身分証明書、略歴書、誓約書…書類が多い。'),
      talk('mine', '中古品を仕入れて売るなら古物商許可は必須よ。個人から買った「未使用品」も古物扱いになるから注意ね。', 'pointer'),
      info('申請完了', ['許可が下りるまで約6週間（標準処理期間は40日程度）']),
    ];
  },
};

function forecastLine(s) {
  const cands = Object.keys(s.market).filter((pid) => {
    const p = productOf(pid);
    return p.kind === 'hype' && s.market[pid].edition > 0 && woy(s.week) !== p.release;
  });
  if (!cands.length || !chance(s, 0.4 + s.abilities.eye / 200)) return null;
  const pid = pick(s, cands);
  const m = s.market[pid];
  const dir = m.p > m.floor * 1.05 ? 'じわじわ下がりそう' : '底値圏で落ち着きそう';
  return `「${productOf(pid).name}」は発売からの熱が冷めて、${dir}だ。`;
}

// 抽選結果（応募の翌週以降の週末に判定）
export function resolveLotteries(s) {
  const steps = [];
  const due = s.lotteries.filter((l) => l.week < s.week);
  s.lotteries = s.lotteries.filter((l) => l.week >= s.week);
  const wins = [];
  for (const l of due) {
    const p = productOf(l.pid);
    const rate = lotteryWinRate(s, p);
    let n = 0;
    for (let i = 0; i < l.entries; i++) if (chance(s, rate)) n++;
    const cap = l.mode === 'multi' ? 3 : l.mode === 'family' ? 2 : 1;
    n = Math.min(n, cap);
    if (n > 0 && l.mode === 'multi' && chance(s, 0.3)) {
      addHate(s, 10);
      setFlag(s, 'lotteryPenalty');
      steps.push(talk('collector', `【${p.name} 販売事務局】同一人物による複数アカウントでの応募を確認しました。すべての当選を無効とします。`), info('当選取り消し', ['今後の抽選で当選しにくくなった', '炎上度が上がった'], 'bad'));
      continue;
    }
    if (n > 0) wins.push({ pid: l.pid, n });
    else steps.push(info('抽選結果', [`「${p.name}」…落選。`]));
  }
  return { steps, wins };
}
