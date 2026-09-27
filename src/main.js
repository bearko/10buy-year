// エントリーポイント。タイトル → プロローグ → 週ループ → エンディング
import { prologue } from './data/story.js';
import { CAST } from './data/cast.js';
import { productOf } from './data/products.js';
import { EXP_NAME } from './engine/abilities.js';
import { availableCommands, performCommand, sickRisk, staminaCost } from './engine/commands.js';
import { MOOD_MULT } from './engine/effects.js';
import { finalResult } from './engine/ending.js';
import { activeUnits, listedUnits } from './engine/inventory.js';
import { clearSave, loadGame, loadRanking, pushRanking, saveGame } from './engine/save.js';
import { createGame } from './engine/state.js';
import { endWeek, startWeek } from './engine/turn.js';
import { playBgm, playSe } from './ui/audio.js';
import { $, clear, h, yenFmt } from './ui/dom.js';
import { renderHud, renderTicker } from './ui/hud.js';
import { openModal } from './ui/modal.js';
import { choose, hidePartner, say, setBackground, setMessage, setTextSpeed, showChris, showInfo } from './ui/stage.js';
import { abilitiesModal, financeModal, menuModal } from './ui/status.js';
import { inventoryModal, marketModal, offersModal, salesModal } from './ui/trade.js';

let state = null;
let busy = false;
let speed = 22;
try {
  const v = window.localStorage.getItem('10buy-year:speed');
  if (v !== null) speed = Number(v);
} catch {
  /* noop */
}
setTextSpeed(speed);

function showScreen(id) {
  for (const el of document.querySelectorAll('.screen')) el.hidden = el.id !== id;
}

// ---------------- 演出ステップの再生 ----------------
async function playSteps(steps) {
  const queue = [...steps];
  setBusy(true);
  while (queue.length) {
    const st = queue.shift();
    switch (st.t) {
      case 'talk':
        await say(st.who, st.text, st.pose);
        break;
      case 'info':
        await showInfo(st.title, st.lines, st.tone);
        break;
      case 'gain':
        await showInfo('経験点', [Object.entries(st.exp).map(([k, v]) => `${EXP_NAME[k]} +${v}`).join('　'), ...(st.extras || [])], 'good');
        break;
      case 'choice': {
        const idx = await choose(st.options, st.prompt);
        queue.unshift(...(st.options[idx].run() || []));
        break;
      }
      case 'offers':
        await offersModal(state, st, refresh);
        break;
      case 'sales':
        if (st.sold.length || st.auctionsUnsold.length) await salesModal(state, st);
        else if (listedUnits(state).length) await showInfo('今週の取引', ['出品中の商品は1つも売れなかった…', '値付けを見直すか、「撮影・出品作業」で売れやすくしよう'], 'bad');
        break;
      case 'sfx':
        playSe(st.name);
        break;
      case 'bg':
        setBackground(st.name);
        break;
      case 'defer':
        queue.unshift(...(st.run() || []));
        break;
      default:
        break;
    }
    refresh();
  }
  setBusy(false);
}

function setBusy(v) {
  busy = v;
  document.body.classList.toggle('busy', v);
}

function refresh() {
  if (!state) return;
  renderHud(state);
  renderTicker(state);
  renderTabs();
}

// ---------------- コマンド ----------------
function waitForCommand() {
  return new Promise((resolve) => {
    let selected = null;
    const nav = clear($('#commands'));
    const cmds = availableCommands(state);
    const mood = MOOD_MULT[state.mood];
    const describe = (c) => {
      const risk = sickRisk(state, c);
      setMessage(c.name, `${c.desc}${risk > 0 ? `\n体調不良のおそれ ${Math.round(risk * 100)}%` : ''}\n（もう一度押すと決定）`);
    };
    for (const c of cmds) {
      const cost = staminaCost(state, c);
      const risk = sickRisk(state, c);
      const expTags = Object.entries(c.exp).map(([k, v]) => h('i', { class: `x ${k}` }, `${EXP_NAME[k][0]}${Math.round(v * mood)}`));
      const btn = h('button', {
        class: `cmd ${risk >= 0.3 ? 'danger' : risk > 0 ? 'risky' : ''}`,
        onclick: () => {
          if (busy) return;
          if (selected === c.id) {
            clear(nav);
            resolve(c.id);
            return;
          }
          selected = c.id;
          nav.querySelectorAll('.cmd').forEach((b) => b.classList.remove('sel'));
          btn.classList.add('sel');
          describe(c);
        },
      },
      h('b', {}, c.name),
      h('span', { class: 'cost' }, c.heal ? `体力+${c.heal}` : cost > 0 ? `体力-${cost}` : cost < 0 ? `体力+${-cost}` : ''),
      h('span', { class: 'exps' }, ...expTags),
      risk > 0 ? h('span', { class: 'risk' }, `${Math.round(risk * 100)}%`) : null);
      nav.append(btn);
    }
    showChris('idle');
    hidePartner();
    setBackground('home');
    setMessage('', state.sick > 0 ? '体調が悪い…今週は休むしかない。' : '今週は何をしよう？（在庫・相場・能力の確認は下のタブから。行動を選ぶと1週間が進む）');
  });
}

function renderTabs() {
  const nav = clear($('#tabs'));
  if (!state) return;
  const unlisted = activeUnits(state).filter((u) => !u.listing && !(state.flags.noAlcohol && productOf(u.pid).alcohol)).length;
  const tabs = [
    ['在庫', () => inventoryModal(state, refresh), unlisted ? `${unlisted}` : ''],
    ['相場', () => marketModal(state), state.news.length ? `${state.news.length}` : ''],
    ['能力', () => abilitiesModal(state, refresh), ''],
    ['家計', () => financeModal(state, refresh, playSteps), ''],
    ['メニュー', () => menuModal({ onTitle: toTitle, onRestart: restart, speed: () => speed, onSpeed: setSpeed }), ''],
  ];
  for (const [label, fn, badge] of tabs) {
    nav.append(h('button', { class: 'tab', onclick: () => { if (!busy) fn(); } }, label, badge ? h('span', { class: 'badge' }, badge) : null));
  }
}

function setSpeed(ms) {
  speed = ms;
  setTextSpeed(ms);
  try {
    window.localStorage.setItem('10buy-year:speed', String(ms));
  } catch {
    /* noop */
  }
}

// ---------------- ゲームループ ----------------
async function loop() {
  showScreen('game-screen');
  playBgm('pve');
  refresh();
  while (!state.over) {
    if (state.phase === 'weekStart') {
      await playSteps(startWeek(state));
      saveGame(state);
      if (state.over) break;
    }
    refresh();
    const cmd = await waitForCommand();
    await playSteps(performCommand(state, cmd));
    await playSteps(endWeek(state));
  }
  clearSave();
  showEnding();
}

async function newGame() {
  state = createGame();
  clearSave();
  showScreen('game-screen');
  refresh();
  showChris('idle');
  await playSteps(prologue(state));
  await loop();
}

function continueGame() {
  const loaded = loadGame();
  if (!loaded) return newGame();
  state = loaded;
  return loop();
}

function restart() {
  clearSave();
  newGame();
}

function toTitle() {
  saveGame(state);
  window.location.reload();
}

// ---------------- タイトル ----------------
function showTitle() {
  const el = clear($('#title-screen'));
  const hasSave = !!loadGame();
  el.append(
    h('div', { class: 'title-bg' }),
    h('div', { class: 'title-inner' },
      h('p', { class: 'kicker' }, 'My Crypto Heroes 二次創作'),
      h('h1', {}, 'テンバイヤー！', h('small', {}, '〜クリスの借金返済サクセス〜')),
      h('div', { class: 'title-cast' },
        h('img', { class: 'sprite', src: CAST.chris.poses.guts, alt: 'クリス' }),
        h('img', { class: 'sprite mine', src: CAST.mine.poses.pointer, alt: 'マイン' }),
        h('img', { class: 'sprite maycri', src: CAST.maycri.poses.wide, alt: 'マイクリくん' }),
      ),
      h('p', { class: 'lead' }, '仮想通貨で溶かして背負った借金。期限は1年。', h('br'), '仕入れて、売って、学んで――転売で完済を目指せ。'),
      h('div', { class: 'title-buttons' },
        hasSave ? h('button', { class: 'btn primary big', onclick: () => continueGame() }, 'つづきから') : null,
        h('button', { class: `btn big ${hasSave ? '' : 'primary'}`, onclick: () => { if (!hasSave || window.confirm('セーブデータを消して最初から始めますか？')) newGame(); } }, 'はじめから'),
        h('button', { class: 'btn', onclick: () => rankingModal() }, 'ランキング'),
        h('button', { class: 'btn', onclick: () => aboutModal() }, 'このゲームについて'),
      ),
    ),
  );
  showScreen('title-screen');
}

function rankingModal() {
  openModal('ランキング（この端末）', (body) => {
    const list = loadRanking();
    if (!list.length) body.append(h('p', { class: 'empty' }, 'まだ記録がない'));
    list.forEach((r, i) => body.append(h('div', { class: 'card row' }, h('div', { class: `rank r${r.rank}` }, r.rank), h('div', { class: 'grow' }, h('div', { class: 'name' }, `${i + 1}位 ${yenFmt(r.netWorth)}`), h('small', {}, `${r.ending}／${r.title}／売上 ${yenFmt(r.revenue)}／${r.date}`)))));
  });
}

function aboutModal() {
  openModal('このゲームについて', (body) => {
    body.append(
      h('p', {}, '「転売」という商いを、仕入れ・相場・出品・発送・トラブル・税金まで含めて真剣に体験する育成シミュレーションです。転売を奨励するものではなく、その仕組みと生々しさを笑いと一緒に描く社会風刺ゲームです。'),
      h('p', {}, '登場するプラットフォーム・商品・人物はすべてフィクションです。法律や手数料の数値はゲーム用に簡略化しています。'),
      h('div', { class: 'sub' }, 'クレジット'),
      h('p', {}, 'ヒーロー・エクステンション・エネミー・背景・音声：My Crypto Heroes（MCH Co., Ltd.）の二次創作ガイドラインに基づき使用'),
      h('p', {}, 'クリスくん／マインちゃん ドット絵：こじもこ　マイクリくん 原画：こはるさん／ドット絵：こじもこさん'),
    );
  });
}

// ---------------- エンディング ----------------
function showEnding() {
  const r = finalResult(state);
  const ranking = pushRanking({
    netWorth: r.netWorth, rank: r.rank, title: r.title, ending: r.ending.title, revenue: r.revenue, date: new Date().toLocaleDateString('ja-JP'),
  });
  const el = clear($('#ending-screen'));
  playBgm('land');
  playSe(['arrested', 'bankrupt'].includes(r.ending.id) ? 'lose' : 'win');
  el.append(
    h('div', { class: 'ending' },
      h('p', { class: 'kicker' }, '最終査定'),
      h('h2', {}, r.ending.title),
      h('img', { class: 'sprite big', src: CAST.chris.poses[r.ending.pose] || CAST.chris.poses.idle, alt: 'クリス' }),
      ...r.ending.lines.map((l) => h('p', { class: 'ending-line' }, l)),
      h('div', { class: 'result' },
        h('div', { class: `rank huge r${r.rank}` }, r.rank),
        h('div', {},
          h('div', { class: 'rank-label' }, r.rankLabel),
          h('div', {}, `称号：${r.title}`),
        ),
      ),
      h('div', { class: 'ledger-grid' },
        row('純資産（スコア）', yenFmt(r.netWorth)),
        row('残った借金', yenFmt(r.debt)),
        row('累計売上', yenFmt(r.revenue)),
        row('粗利益', yenFmt(r.profit)),
        row('売った商品', `${r.soldUnits}個`),
        row('取引トラブル', `${r.troubles}件`),
        row('定価で確保した品薄商品', `${r.scarceBought}個`),
      ),
      h('p', { class: 'note' }, r.scarceBought ? `あなたが確保した${r.scarceBought}個の品薄商品。その向こうには、定価で買えなかった誰かがいたかもしれないし、近くの店で買えずにあなたから買えて喜んだ誰かもいたかもしれない。` : '品薄の限定品には手を出さず、価格差で稼ぎきった1年だった。'),
      h('div', { class: 'sub' }, 'この端末のランキング'),
      ...ranking.slice(0, 5).map((x, i) => h('div', { class: 'ledger-row' }, h('small', {}, `${i + 1}位`), h('span', {}, `${x.ending}／${x.title}`), h('b', {}, yenFmt(x.netWorth)))),
      h('div', { class: 'title-buttons' },
        h('button', { class: 'btn primary big', onclick: () => window.location.reload() }, 'タイトルへ'),
        h('button', { class: 'btn', onclick: () => copyResult(r) }, '結果をコピー'),
      ),
    ),
  );
  showScreen('ending-screen');
}

function row(label, value) {
  return h('div', { class: 'lg-row' }, h('span', {}, label), h('b', {}, value));
}

function copyResult(r) {
  const text = `テンバイヤー！ 最終査定【${r.rank}】${r.ending.title}\n称号：${r.title}\n純資産 ${yenFmt(r.netWorth)} / 売上 ${yenFmt(r.revenue)}`;
  navigator.clipboard?.writeText(text).catch(() => {});
}

showTitle();
