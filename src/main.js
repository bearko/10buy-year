// エントリーポイント。タイトル → プロローグ → 週ループ（10年）→ エンディング
import { prologue } from './data/story.js';
import { CAST } from './data/cast.js';
import { productOf } from './data/products.js';
import { availableCommands, availableNightCommands, COMMAND_MAP, commandPreview, GROUPS, performCommand, sickRisk, staminaCost } from './engine/commands.js';
import { hasSkill, MOOD_MULT } from './engine/effects.js';
import { finalResult } from './engine/ending.js';
import { activeUnits, listedUnits } from './engine/inventory.js';
import { autoBuy } from './engine/automation.js';
import { clearSave, loadGame, loadRanking, pushRanking, saveGame } from './engine/save.js';
import { createGame } from './engine/state.js';
import { endWeek, startWeek } from './engine/turn.js';
import { checkTutorial, tutorialDone } from './engine/tutorial.js';
import { playBgm, playSe } from './ui/audio.js';
import { $, clear, h, wait, yenFmt } from './ui/dom.js';
import { renderHud, renderParams, renderTicker, setPreview } from './ui/hud.js';
import { openModal, toast } from './ui/modal.js';
import { choose, hidePartner, isAuto, say, setAuto, setBackground, setMessage, setTextSpeed, showChris, showInfo } from './ui/stage.js';
import { bizModal, menuModal } from './ui/status.js';
import { openTree } from './ui/tree.js';
import { inventoryModal, marketModal, offersModal, salesModal } from './ui/trade.js';

const AUTO_WEEKS = 4;
let state = null;
let busy = false;
let speed = 22;
let autoWeeks = 0;
let autoCmd = null;
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

function stopAuto() {
  autoWeeks = 0;
  setAuto(false);
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
        await flashGain(st.exp);
        break;
      case 'choice': {
        stopAuto(); // 選択肢はプレイヤーが決める
        const idx = await choose(st.options, st.prompt);
        queue.unshift(...(st.options[idx].run() || []));
        break;
      }
      case 'offers': {
        if (hasSkill(state, 'out_buy') && state.settings.autoBuy) st.autoBought = autoBuy(state, st.offers);
        if (isAuto()) {
          if (st.autoBought?.length) toast(`外注が${st.autoBought.length}件を仕入れた`, 'good');
        } else {
          await offersModal(state, st, refresh);
        }
        break;
      }
      case 'sales':
        if (isAuto()) {
          if (st.sold.length) await showInfo('今週の取引', [`${st.sold.length}件売れた（売上金 ${yenFmt(st.sold.reduce((a, x) => a + x.net, 0))}）`], 'good');
        } else if (st.sold.length || st.auctionsUnsold.length) await salesModal(state, st);
        else if (listedUnits(state).length) await showInfo('今週の取引', ['1つも売れなかった…'], 'bad');
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

const tutorialStep = () => playSteps(checkTutorial(state));

// 経験点の獲得は、ステージ右の経験点パネルを光らせて見せる
async function flashGain(exp) {
  if (!Object.keys(exp).length) return;
  document.body.classList.add('gain-flash');
  renderParams(state, { gains: exp });
  await wait(isAuto() ? 350 : 1100);
  document.body.classList.remove('gain-flash');
  renderParams(state);
}

function setBusy(v) {
  busy = v;
  document.body.classList.toggle('busy', v);
}

function refresh() {
  if (!state) return;
  renderHud(state);
  if (!document.body.classList.contains('gain-flash')) renderParams(state);
  renderTicker(state);
  renderTabs();
}

// ---------------- コマンド ----------------
function nextCommand(mode) {
  if (autoWeeks > 0) {
    if (mode === 'night') return Promise.resolve('sleep');
    const ok = availableCommands(state).some((c) => c.id === autoCmd);
    const cmd = COMMAND_MAP[autoCmd];
    if (ok && state.stamina - staminaCost(state, cmd) >= 25) return Promise.resolve(autoCmd);
    return Promise.resolve(availableCommands(state).some((c) => c.id === 'rest') ? 'rest' : availableCommands(state)[0].id);
  }
  return waitForCommand(mode);
}

const cmdMode = (on) => document.body.classList.toggle('cmd-mode', on);

function waitForCommand(mode) {
  return new Promise((resolve) => {
    const night = mode === 'night';
    const nav = $('#commands');
    const mood = MOOD_MULT[state.mood];
    const cmds = night ? availableNightCommands(state) : availableCommands(state);
    let group = null;
    let selected = null;

    const idleMessage = () => setMessage('', night ? '夜。もうひと仕事？' : state.sick > 0 ? '体調が悪い…休むしかない。' : '今週は何をしよう？');
    const unpreview = () => {
      selected = null;
      setPreview(null);
      refresh();
    };
    const pickCmd = (id) => {
      clear(nav);
      unpreview();
      cmdMode(false);
      resolve(id);
    };
    const select = (c) => {
      if (selected === c.id) return pickCmd(c.id);
      selected = c.id;
      const p = commandPreview(state, c, { night });
      setPreview({ ...p, exp: Object.fromEntries(Object.entries(c.exp).map(([k, v]) => [k, Math.round(v * mood)])) });
      refresh();
      setMessage(c.name, c.desc);
      draw();
    };

    const card = (props, icon, label, extra) => h('button', props, h('img', { class: 'cmd-ic', src: icon, alt: '' }), h('b', {}, label), extra);
    const cmdCard = (c) => {
      const risk = sickRisk(state, c);
      const sel = selected === c.id;
      return card({
        class: `cmd ${sel ? 'sel' : ''} ${risk >= 0.3 ? 'danger' : risk > 0 ? 'risky' : ''}`,
        onclick: () => { if (!busy) select(c); },
      }, c.icon, c.name, sel ? h('span', { class: 'go' }, '決定') : risk > 0 ? h('span', { class: 'risk' }, '⚠') : null);
    };

    function draw() {
      clear(nav);
      nav.classList.toggle('groups', !group && !night);
      const count = state.actionsPerWeek > 1 && !night ? ` ${state.actionsPerWeek - state.actionsLeft + 1}/${state.actionsPerWeek}` : '';
      const head = h('div', { class: 'cmd-header' });
      if (group) {
        head.append(h('button', { class: 'cmd-back', onclick: () => { if (busy) return; group = null; unpreview(); idleMessage(); draw(); } }, `◀ ${GROUPS.find((g) => g.id === group).name}`));
      } else {
        head.append(h('span', {}, night ? '夜' : `今週${count}`));
      }
      if (!night && !group && hasSkill(state, 'routine') && state.lastCommand && cmds.some((c) => c.id === state.lastCommand)) {
        const last = COMMAND_MAP[state.lastCommand];
        head.append(h('button', {
          class: 'cmd-auto',
          title: `「${last.name}」を${AUTO_WEEKS}週くり返す（選択肢で止まる）`,
          onclick: () => {
            if (busy) return;
            autoWeeks = AUTO_WEEKS;
            autoCmd = last.id;
            setAuto(true);
            pickCmd(last.id);
          },
        }, `⟳ ${last.name}×${AUTO_WEEKS}`));
      }
      nav.append(head);

      if (night) {
        cmds.forEach((c) => nav.append(cmdCard(c)));
        nav.append(card({ class: 'cmd sleep', onclick: () => { if (!busy) pickCmd('sleep'); } }, 'assets/icons/sleep.png', '寝る'));
        return;
      }
      if (group) {
        if (group === 'sell') {
          nav.append(card({
            class: 'cmd free',
            onclick: async () => {
              if (busy) return;
              await inventoryModal(state, refresh);
              await tutorialStep();
              refresh();
              draw();
            },
          }, 'assets/extensions/1059.png', '在庫を出品', h('span', { class: 'free-tag' }, '週は進まない')));
        }
        cmds.filter((c) => c.group === group).forEach((c) => nav.append(cmdCard(c)));
        return;
      }
      for (const g of GROUPS) {
        const list = cmds.filter((c) => c.group === g.id);
        const sel = list.length === 1 && selected === list[0].id;
        nav.append(card({
          class: `cmd grp ${list.length ? '' : 'off'} ${sel ? 'sel' : ''}`,
          onclick: () => {
            if (busy || (!list.length && g.id !== 'sell')) return;
            if (g.id === 'rest') return select(list[0]);
            group = g.id;
            unpreview();
            idleMessage();
            draw();
          },
        }, g.icon, g.name, sel ? h('span', { class: 'go' }, '決定') : list.length > 1 ? h('span', { class: 'n' }, list.length) : null));
      }
    }

    showChris('idle');
    hidePartner();
    setBackground('home');
    idleMessage();
    cmdMode(true);
    draw();
    // 体調不良のときは「休む」だけ
    if (state.sick > 0) select(COMMAND_MAP.rest);
  });
}

function renderTabs() {
  const nav = clear($('#tabs'));
  if (!state) return;
  const unlisted = activeUnits(state).filter((u) => !u.listing && !(state.flags.noAlcohol && productOf(u.pid).alcohol)).length;
  const after = async (p) => {
    await p;
    await tutorialStep();
    refresh();
  };
  const tabs = [
    { label: '在庫', open: () => inventoryModal(state, refresh), badge: unlisted ? `${unlisted}` : '' },
    { label: '相場', open: () => marketModal(state), badge: state.news.length ? `${state.news.length}` : '', lock: !hasSkill(state, 'eye_market') && 'スキルツリー「相場チェック」で解放' },
    { label: 'ツリー', open: () => openTree(state, refresh), lock: !tutorialDone(state) && 'チュートリアルを終えると開ける' },
    { label: '経営', open: () => bizModal(state, refresh, playSteps) },
    { label: 'メニュー', open: () => menuModal({ s: state, onTitle: toTitle, onRestart: restart, speed: () => speed, onSpeed: setSpeed, onChange: refresh }) },
  ];
  for (const t of tabs) {
    nav.append(h('button', {
      class: `tab ${t.lock ? 'locked' : ''}`,
      onclick: () => {
        if (busy) return;
        if (t.lock) return toast(t.lock, 'bad');
        after(t.open());
      },
    }, t.lock ? `🔒${t.label}` : t.label, t.badge && !t.lock ? h('span', { class: 'badge' }, t.badge) : null));
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
      await tutorialStep();
      saveGame(state);
      if (state.over) break;
    }
    refresh();
    while (state.actionsLeft > 0 && !state.over) {
      const cmd = await nextCommand('day');
      state.actionsLeft--;
      await playSteps(performCommand(state, cmd));
      await tutorialStep();
    }
    if (state.nightLeft > 0 && state.sick <= 0 && !state.over) {
      const cmd = await nextCommand('night');
      state.nightLeft = 0;
      if (cmd !== 'sleep') {
        await playSteps(performCommand(state, cmd, { night: true }));
        await tutorialStep();
      }
    }
    await playSteps(endWeek(state));
    await tutorialStep();
    if (autoWeeks > 0 && --autoWeeks === 0) setAuto(false);
  }
  stopAuto();
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
      h('h1', {}, '10 buy year！', h('small', {}, 'クリスの転売キャリア10年')),
      h('div', { class: 'title-cast' },
        h('img', { class: 'sprite', src: CAST.chris.poses.guts, alt: 'クリス' }),
        h('img', { class: 'sprite mine', src: CAST.mine.poses.pointer, alt: 'マイン' }),
        h('img', { class: 'sprite maycri', src: CAST.maycri.poses.wide, alt: 'マイクリくん' }),
      ),
      h('p', { class: 'lead' }, '仮想通貨で溶かして、友達にまで借金をした。', h('br'), '押し入れの本を1冊売るところから、10年の転売キャリアが始まる。'),
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
    list.forEach((r, i) => body.append(h('div', { class: 'card row' }, h('div', { class: `rank r${r.rank}` }, r.rank), h('div', { class: 'grow' }, h('div', { class: 'name' }, `${i + 1}位 ${yenFmt(r.netWorth)}`), h('small', {}, `${r.ending}／${r.stage || ''}／${r.title}／売上 ${yenFmt(r.revenue)}／${r.date}`)))));
  });
}

function aboutModal() {
  openModal('このゲームについて', (body) => {
    body.append(
      h('p', {}, '「転売」という商いを、家の不用品を売るところから、仕入れ・相場・出品・発送・トラブル・税金、そして専業化・法人化まで、10年のキャリアとして真剣に体験する育成シミュレーションです。転売を奨励するものではなく、その仕組みと生々しさを笑いと一緒に描く社会風刺ゲームです。'),
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
    netWorth: r.netWorth, rank: r.rank, title: r.title, ending: r.ending.title, stage: r.stage, revenue: r.revenue, date: new Date().toLocaleDateString('ja-JP'),
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
          h('div', {}, r.stage),
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
      h('p', { class: 'note' }, r.scarceBought ? `あなたが確保した${r.scarceBought}個の品薄商品。その向こうには、定価で買えなかった誰かがいたかもしれないし、近くの店で買えずにあなたから買えて喜んだ誰かもいたかもしれない。` : '品薄の限定品には手を出さず、価格差で稼ぎきった10年だった。'),
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
  const text = `10 buy year！ 最終査定【${r.rank}】${r.ending.title}\n${r.stage}／称号：${r.title}\n純資産 ${yenFmt(r.netWorth)} / 売上 ${yenFmt(r.revenue)}`;
  navigator.clipboard?.writeText(text).catch(() => {});
}

showTitle();
