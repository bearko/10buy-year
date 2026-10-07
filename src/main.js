// エントリーポイント。タイトル → プロローグ → 週ループ（10年）→ エンディング
import { prologue } from './data/story.js';
import { CAST } from './data/cast.js';
import { productOf } from './data/products.js';
import { availableCommands, availableNightCommands, COMMAND_MAP, commandPreview, GROUPS, performCommand, sickRisk, staminaCost } from './engine/commands.js';
import { claimableNodes } from './engine/abilities.js';
import { hasSkill, MOOD_MULT } from './engine/effects.js';
import { finalResult } from './engine/ending.js';
import { activeUnits, idleListing, listedUnits } from './engine/inventory.js';
import { autoBuy } from './engine/automation.js';
import { clearSave, loadDaily, loadGame, loadLegacy, loadMentors, loadRanking, loadRecords, pushDaily, pushLegacy, pushMentor, pushRanking, pushRecords, saveGame } from './engine/save.js';
import { mentorRecord } from './engine/mentor.js';
import { ACHIEVEMENTS, checkAchievements } from './engine/achievements.js';
import { allEndings } from './engine/ending.js';
import { SKILL_MAP, SKILLS } from './data/skills.js';
import { dailyLabel, dailySeed, todayKey } from './engine/daily.js';
import { SPECIALTIES, STYLES, styleLabel, styleOf } from './engine/style.js';
import { createGame } from './engine/state.js';
import { endWeek, startWeek } from './engine/turn.js';
import { checkTutorial, currentMission, treeOpen, tutorialDone } from './engine/tutorial.js';
import { playBgm, playSe, setSound, soundOn } from './ui/audio.js';
import { $, clear, h, wait, yenFmt } from './ui/dom.js';
import { renderHud, renderParams, renderTicker, setPreview } from './ui/hud.js';
import { confirmBox, openModal, toast } from './ui/modal.js';
import { choose, hidePartner, isAuto, say, setAuto, setBackground, setLogger, setMessage, setTextSpeed, showChris, showInfo } from './ui/stage.js';
import { bizModal, menuModal } from './ui/status.js';
import { openTree } from './ui/tree.js';
import { groupItems, showItems } from './ui/loot.js';
import { celebrate, goalPopup } from './ui/goal.js';
import { logModal, pushLog } from './ui/log.js';
import { offersModal } from './ui/shop.js';
import { autoVisible } from './engine/sourcing.js';
import { mailbox, salesMails } from './ui/mail.js';
import { checkQuests } from './engine/quests.js';
import { DIFFICULTIES, difficultyOf } from './engine/finance.js';
import { questsModal } from './ui/quests.js';
import { queueScene } from './ui/queue.js';
import { myStoreModal } from './ui/mystore.js';
import { routineModal } from './ui/routine.js';
import { autoPick } from './engine/dealpolicy.js';
import { pioneerLine } from './engine/pioneer.js';
import { satLine } from './engine/rivals.js';
import { rivalsModal } from './ui/rivals.js';
import { collectionModal, galleryModal } from './ui/collection.js';
import { careersModal } from './ui/careers.js';
import { lifestyleModal } from './ui/lifestyle.js';
import { cryptoModal } from './ui/crypto.js';
import { dealPolicyModal } from './ui/dealpolicy.js';
import { routineBuy, routineList, routineListStamina, routineStale } from './engine/routine.js';
import { addStamina } from './engine/effects.js';
import { inventoryModal, marketModal, salesModal } from './ui/trade.js';

let state = null;
let busy = false;
let speed = 22;
let autoWeeks = 0;
let autoCmd = null;
// ルーティン実行中の記録（始めたときの成績と、週ごとのまとめ）
let routineRun = null;
try {
  const v = window.localStorage.getItem('10buy-year:speed');
  if (v !== null) speed = Number(v);
} catch {
  /* noop */
}
setTextSpeed(speed);
setLogger((entry) => { if (state) pushLog(state, entry, isAuto()); });

// PCのキーボード操作：数字キーで行動カード・選択肢を選ぶ。Esc／Backspaceで分類の一覧に戻る
window.addEventListener('keydown', (e) => {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('input, textarea, select')) return;
  if ($('#modal-root').children.length) return;
  const n = Number(e.key);
  if (n >= 1 && n <= 9) {
    const choices = [...document.querySelectorAll('#choices button')];
    const list = choices.length ? choices : busy ? [] : [...document.querySelectorAll('#commands button.cmd')];
    const b = list[n - 1];
    if (b && !b.disabled) {
      e.preventDefault();
      b.click();
    }
  } else if ((e.key === 'Escape' || e.key === 'Backspace') && !busy) {
    const back = document.querySelector('#commands .cmd-back');
    if (back) {
      e.preventDefault();
      back.click();
    }
  }
});

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
        // 取引の対応で答えを決めてあれば、止まらずにその答えを選ぶ
        const picked = autoPick(state, st, isAuto() || !!routineRun);
        if (picked >= 0) {
          if (routineRun) routineRun.week.deals = (routineRun.week.deals || 0) + 1;
          queue.unshift({ t: 'talk', who: 'narr', text: `（決めておいた対応：${st.options[picked].label}）` }, ...(st.options[picked].run() || []));
          break;
        }
        if (isAuto()) toast('ルーティンを止めた。それまでの出来事は「ログ」で読み返せる');
        stopAuto(); // 選択肢はプレイヤーが決める
        await endRoutine();
        const idx = await choose(st.options, st.prompt);
        queue.unshift(...(st.options[idx].run() || []));
        break;
      }
      case 'offers': {
        // 外注・ルーティンは「ふつうに回ったら見つかる分」だけを見る（店舗巡りのルート全部ではない）
        if (hasSkill(state, 'out_buy') && state.settings.autoBuy) st.autoBought = autoBuy(state, autoVisible(st));
        if (isAuto()) {
          if (st.autoBought?.length) toast(`外注が${st.autoBought.length}件を仕入れた`, 'good');
          if (routineRun) routineRun.week.bought.push(...routineBuy(state, autoVisible(st, state), routineRun.cfg));
        } else {
          const got = await offersModal(state, st, refresh);
          refresh();
          await showItems(state, '仕入れた商品', groupItems(got || []), { se: false });
        }
        break;
      }
      case 'gallery':
        // 百貨店の美術画廊（ルーティン・オート中は寄らない）
        if (!isAuto()) await galleryModal(state, st, refresh);
        break;
      case 'items':
        await showItems(state, st.title, groupItems(st.list), st.opts || {});
        break;
      case 'sales':
        if (isAuto()) {
          if (st.sold.length) await showInfo('今週の取引', [`${st.sold.length}件売れた（売上金 ${yenFmt(st.sold.reduce((a, x) => a + x.net, 0))}）`], 'good');
        } else if (st.sold.length || st.auctionsUnsold.length) {
          // 売れた知らせはメールで届く。メールアプリを開いてから、まとめて取引結果を見る
          await mailbox(salesMails(st));
          await salesModal(state, st);
        }
        else if (listedUnits(state).length) await showInfo('今週の取引', ['1つも売れなかった…'], 'bad');
        break;
      case 'queue':
        if (!isAuto()) await queueScene(st);
        break;
      case 'mail':
        if (!isAuto()) await mailbox(st.mails, { button: '閉じる' });
        break;
      case 'sfx':
        playSe(st.name);
        if (st.name === 'trouble') playBgm('pvp'); // トラブル・督促の間は緊迫した曲に
        break;
      case 'celebrate':
        await celebrate(st.text, { quick: isAuto() });
        break;
      case 'goal':
        await goalPopup(state, { quick: isAuto() });
        break;
      case 'bgm':
        playBgm(st.name);
        break;
      case 'bg':
        setBackground(st.name);
        if (st.name === 'queue') playBgm('raid'); // 発売日の行列は争奪戦の曲
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

// 行動・画面を閉じたあと：チュートリアルの進み具合と、ミッションの達成を確かめる
const tutorialStep = () => playSteps([...checkTutorial(state), ...checkQuests(state)]);

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

let redrawCommands = null; // 行動を選んでいる間だけ入る
let resumeCommands = null; // 画面を閉じたあと、会話の相手を下げて選択画面に戻す

function refresh() {
  if (!state) return;
  if (redrawCommands && !busy) redrawCommands();
  renderHud(state);
  if (!document.body.classList.contains('gain-flash')) renderParams(state);
  renderTicker(state);
  renderTabs();
}

// ---------------- ルーティン ----------------
const emptyRoutineWeek = () => ({ bought: [], listed: 0, cut: 0, dumped: 0, dumpTotal: 0 });

function startRoutine(cfg) {
  const st = state.stats;
  routineRun = { cfg, weeks: 0, start: { sold: st.soldUnits, revenue: st.revenue, bought: st.boughtUnits, spent: st.spent }, week: emptyRoutineWeek() };
}

// 週ごとの1行まとめをログに残す
function logRoutineWeek() {
  const w = routineRun.week;
  if (w.logged) return;
  w.logged = true;
  routineRun.weeks++;
  // 型が崩れたか：条件に合う仕入れが続けて見つからない週を数える
  routineRun.dry = w.bought.length ? 0 : (routineRun.dry || 0) + 1;
  const units = w.bought.reduce((a, x) => a + x.qty, 0);
  const cost = w.bought.reduce((a, x) => a + x.cost, 0);
  const parts = [`${COMMAND_MAP[routineRun.cfg.cmd].name}：${units}点仕入れ ${yenFmt(cost)}`, `出品 ${w.listed}件`];
  if (w.cut) parts.push(`値下げ ${w.cut}件`);
  if (w.deals) parts.push(`取引の対応 ${w.deals}件`);
  if (w.dumped) parts.push(`即決買取 ${w.dumped}点 ${yenFmt(w.dumpTotal)}`);
  pushLog(state, { who: 'ルーティン', text: parts.join('／'), kind: 'info' }, true);
}

// 終わったら、期間のまとめを見せる
async function endRoutine() {
  if (!routineRun) return;
  logRoutineWeek(); // 途中で止まった週も記録する
  const r = routineRun;
  routineRun = null;
  const st = state.stats;
  await showInfo('ルーティンのまとめ', [
    `${r.weeks}週・${COMMAND_MAP[r.cfg.cmd].name}`,
    `仕入れ ${st.boughtUnits - r.start.bought}点（${yenFmt(st.spent - r.start.spent)}）`,
    `売れた ${st.soldUnits - r.start.sold}点（売上 ${yenFmt(st.revenue - r.start.revenue)}）`,
    '週ごとの記録は「ログ」で見られる',
  ], 'good');
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

// 行動を選んでいないとき（演出中・週の切り替わり）も、4つの分類カードを並べておく
function drawIdleCommands() {
  const nav = clear($('#commands'));
  if (!state) return;
  nav.classList.add('groups');
  nav.append(h('div', { class: 'cmd-header' }, h('span', {}, '今週')));
  for (const g of GROUPS) nav.append(h('button', { class: 'cmd grp', tabindex: -1 }, h('img', { class: 'cmd-ic', src: g.icon, alt: '' }), h('b', {}, g.name)));
}

function waitForCommand(mode) {
  return new Promise((resolve) => {
    const night = mode === 'night';
    const nav = $('#commands');
    const mood = MOOD_MULT[state.mood];
    // スキルツリーなどで途中に解放しても反映されるよう、描くたびに数え直す
    let cmds = [];
    const loadCmds = () => {
      cmds = night ? availableNightCommands(state) : availableCommands(state);
    };
    let group = null;
    let selected = null;
    // まだ見たことのない行動には NEW を付ける（開いた分類の中を見たら既読。この週のあいだは NEW のまま）
    state.seenCmds ||= availableCommands(state).map((c) => c.id);
    const fresh = new Set();
    const isNew = (c) => fresh.has(c.id) || !state.seenCmds.includes(c.id);
    const markSeen = (list) => {
      for (const c of list) {
        if (state.seenCmds.includes(c.id)) continue;
        fresh.add(c.id);
        state.seenCmds.push(c.id);
      }
    };
    const newTag = () => h('span', { class: 'new-tag' }, 'NEW');

    const guide = () => (night || state.sick > 0 ? null : tutorialGuide(group));
    const idleMessage = () => {
      const g = guide();
      if (g) return setMessage('マイン', g.say);
      setMessage('', night ? '夜。もうひと仕事？' : state.sick > 0 ? '体調が悪い…休むか、病院へ行こう。' : '今週は何をしよう？');
    };
    const point = (on) => (on ? ' tut-point' : '');
    const unpreview = () => {
      selected = null;
      setPreview(null);
      refresh();
    };
    let listWarned = false;
    const pickCmd = async (id) => {
      // この行動で週の作業が終わるのに、在庫を出せる出品枠が空いていたら知らせる（売れるのは週末なので）
      const lastOfWeek = night || (state.actionsLeft <= 1 && !(state.nightLeft > 0 && state.sick <= 0));
      const idle = idleListing(state);
      if (lastOfWeek && idle.n > 0 && !listWarned && state.settings.warnIdleListing !== false) {
        listWarned = true;
        const r = await confirmBox({
          title: '出品枠が空いています',
          lines: [`出品していない在庫が${idle.unlisted}点、出品枠が${idle.free}件あいている。`, '売れるのは週末。このまま週を終えると、今週は売れない。'],
          okLabel: '在庫を出品する',
          cancelLabel: 'このまま進む',
          dontAsk: true,
        });
        if (r.dontAsk) state.settings.warnIdleListing = false;
        if (r.ok) {
          await inventoryModal(state, refresh);
          refresh();
          draw();
          return;
        }
      }
      redrawCommands = null;
      resumeCommands = null;
      drawIdleCommands();
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
      const extra = [pioneerLine(state, c.id), satLine(state, c.id)].filter(Boolean);
      setMessage(c.name, [c.desc, ...extra].join('\n'));
      draw();
    };

    const card = (props, icon, label, extra) => h('button', props, h('img', { class: 'cmd-ic', src: icon, alt: '' }), h('b', {}, label), extra);
    const cmdCard = (c) => {
      const risk = sickRisk(state, c);
      const sel = selected === c.id;
      return card({
        class: `cmd ${sel ? 'sel' : ''} ${risk >= 0.3 ? 'danger' : risk > 0 ? 'risky' : ''}${point(!sel && guide()?.cmd === c.id)}`,
        onclick: () => { if (!busy) select(c); },
      }, c.icon, c.name, sel ? h('span', { class: 'go' }, '決定') : isNew(c) ? newTag() : null, risk > 0 && !sel ? h('span', { class: 'risk' }, '⚠') : null);
    };

    function draw() {
      loadCmds();
      clear(nav);
      nav.classList.toggle('groups', !group && !night);
      const count = state.actionsPerWeek > 1 && !night ? ` ${state.actionsPerWeek - state.actionsLeft + 1}/${state.actionsPerWeek}` : '';
      const head = h('div', { class: 'cmd-header' });
      if (group) {
        head.append(h('button', { class: `cmd-back${point(guide()?.group && guide().group !== group)}`, onclick: () => { if (busy) return; group = null; unpreview(); idleMessage(); draw(); } }, `◀ ${GROUPS.find((g) => g.id === group).name}`));
      } else {
        head.append(h('span', {}, night ? '夜' : `今週${count}`));
      }
      if (!night && !group && hasSkill(state, 'routine')) {
        head.append(h('button', {
          class: 'cmd-auto',
          title: '仕入れ→出品→売却→値下げのサイクルを回す',
          onclick: async () => {
            if (busy) return;
            const cfg = await routineModal(state);
            if (!cfg) return;
            state.routine = cfg;
            autoWeeks = cfg.weeks;
            autoCmd = cfg.cmd;
            startRoutine(cfg);
            setAuto(true);
            pickCmd(cmds.some((c) => c.id === cfg.cmd) ? cfg.cmd : 'rest');
          },
        }, '⟳ ルーティン'));
      }
      nav.append(head);

      if (night) {
        cmds.forEach((c) => nav.append(cmdCard(c)));
        markSeen(cmds);
        nav.append(card({ class: 'cmd sleep', onclick: () => { if (!busy) pickCmd('sleep'); } }, 'assets/icons/sleep.png', '寝る'));
        return;
      }
      if (group) {
        if (group === 'sell') {
          nav.append(card({
            class: `cmd free${point(guide()?.cmd === 'list')}`,
            onclick: async () => {
              if (busy) return;
              await inventoryModal(state, refresh);
              await tutorialStep();
              resumeCommands?.();
              refresh();
            },
          }, 'assets/extensions/1059.png', '在庫を出品', h('span', { class: 'free-tag' }, '週は進まない')));
        }
        const inGroup = cmds.filter((c) => c.group === group);
        markSeen(inGroup);
        inGroup.forEach((c) => nav.append(cmdCard(c)));
        return;
      }
      for (const g of GROUPS) {
        const list = cmds.filter((c) => c.group === g.id);
        const sel = list.length === 1 && selected === list[0].id;
        nav.append(card({
          class: `cmd grp ${list.length ? '' : 'off'} ${sel ? 'sel' : ''}${point(!sel && guide()?.group === g.id)}`,
          onclick: () => {
            if (busy || (!list.length && g.id !== 'sell')) return;
            if (g.id === 'rest') return select(list[0]);
            group = g.id;
            unpreview();
            idleMessage();
            draw();
          },
        }, g.icon, g.name, sel ? h('span', { class: 'go' }, '決定') : list.some((c) => !state.seenCmds.includes(c.id)) ? newTag() : list.length > 1 ? h('span', { class: 'n' }, list.length) : null));
      }
    }

    showChris('idle');
    hidePartner();
    setBackground('home');
    playBgm('pve');
    idleMessage();
    cmdMode(true);
    redrawCommands = draw;
    resumeCommands = () => {
      showChris('idle');
      hidePartner();
      setBackground('home');
      idleMessage();
      draw();
    };
    draw();
    // 体調不良のときは「休む」だけ
    if (state.sick > 0) select(COMMAND_MAP.rest);
  });
}

// チュートリアル中に指し示すボタン（group：分類、cmd：行動、side：右のボタン）と、マインの案内
function tutorialGuide(group = null) {
  const m = !tutorialDone(state) && currentMission(state);
  if (!m) return null;
  const wait = '行動を1つ選ぶと1週間が進んで、週末に売れたかどうかがメールで届くわ。';
  switch (m.id) {
    case 'list_home':
    case 'list_bought':
      return { group: 'sell', cmd: 'list', say: group === 'sell' ? '「在庫を出品」を押して、売りたい物の「出品」ボタンを押すの。ここは週が進まないから、ゆっくり選んで。' : `${m.id === 'list_home' ? '家の不用品' : '仕入れた商品'}を売りに出しましょう。まずは「出品」を開いて。` };
    case 'sell_home':
    case 'sell_more':
      return { group: 'buy', cmd: 'home_search', say: `${wait}今週は「仕入れ」→「家の中を探す」で、次の売り物を探しましょう。` };
    case 'tree_root':
    case 'tree_store':
      return { side: 'tree', say: '右の「スキルツリー」を開いて、光っているパネルを解放して。' };
    case 'go_store':
    case 'buy':
      return { group: 'buy', cmd: 'store', say: '「仕入れ」→「店舗せどり」でお店へ。相場より安い物を見つけたら仕入れましょう。' };
    case 'sell_bought':
      return { group: 'buy', say: `${wait}売れなかったら「在庫」から値下げしてもいいわ。` };
    default:
      return null;
  }
}

// 自分の手で解放できるパネルの数（スキルツリーのボタンに出す）
function treeBadge() {
  if (!treeOpen(state)) return '';
  const n = claimableNodes(state).length;
  return n ? `${n}` : '';
}

// ステージ右側のボタン（在庫・スキルツリー・メニュー）。相場と経営はメニューの中
function renderTabs() {
  const nav = clear($('#side-btns'));
  if (!state) return;
  const unlisted = activeUnits(state).filter((u) => !u.listing && !(state.flags.noAlcohol && productOf(u.pid).alcohol)).length;
  const after = async (p) => {
    await p;
    await tutorialStep();
    resumeCommands?.();
    refresh();
  };
  const marketLock = !hasSkill(state, 'eye_market') && 'スキルツリー「相場チェック」で解放';
  const questN = state.quests?.active?.length || 0;
  const questNew = state.quests?.active?.some((q) => q.fresh);
  // ミッションの「やってみる」で開く画面
  const guides = {
    biz: () => bizModal(state, refresh, playSteps),
    rivals: () => rivalsModal(state, refresh),
    deal: () => dealPolicyModal(state),
    collection: () => collectionModal(state, refresh),
    inv: () => inventoryModal(state, refresh),
  };
  const tabs = [
    { id: 'quest', label: 'ミッション', open: async () => { const g = await questsModal(state); if (g && guides[g]) await guides[g](); }, badge: questNew ? '!' : questN ? `${questN}` : '', lock: !tutorialDone(state) && 'チュートリアルを完了すると開ける' },
    { id: 'tree', label: 'スキルツリー', open: () => openTree(state, refresh, { focus: currentMission(state)?.node }), lock: !treeOpen(state) && '最初の売上のあとに開ける', badge: treeBadge() },
    { id: 'inv', label: '在庫', open: () => inventoryModal(state, refresh), badge: unlisted ? `${unlisted}` : '' },
    {
      id: 'menu',
      label: 'メニュー',
      badge: state.news.length > 1 && !marketLock ? '!' : '',
      open: () => menuModal({
        s: state, onTitle: toTitle, onRestart: restart, speed: () => speed, onSpeed: setSpeed, onChange: refresh,
        marketLock,
        newsCount: state.news.length,
        onMarket: () => after(marketModal(state)),
        onBiz: () => after(bizModal(state, refresh, playSteps)),
        onShop: () => after(myStoreModal(state, refresh)),
        onDeal: () => after(dealPolicyModal(state)),
        onRivals: () => after(rivalsModal(state, refresh)),
        onCollection: () => after(collectionModal(state, refresh)),
        onCareers: () => after(careersModal(state)),
        onLife: () => after(lifestyleModal(state, refresh)),
        onCrypto: () => after(cryptoModal(state, refresh)),
      }),
    },
    { id: 'log', label: 'ログ', open: () => logModal(state) },
  ];
  const pointSide = tutorialGuide()?.side;
  for (const t of tabs) {
    nav.append(h('button', {
      class: `side-btn ${t.id} ${t.lock ? 'locked' : ''} ${!t.lock && pointSide === t.id ? 'tut-point' : ''}`,
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
      drawIdleCommands();
      if (routineRun) routineRun.week = { ...emptyRoutineWeek(), ...routineStale(state, routineRun.cfg) };
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
      if (routineRun) {
        const n = routineList(state, routineRun.cfg);
        routineRun.week.listed += n;
        if (n) addStamina(state, -routineListStamina(state, n));
        refresh();
      }
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
    if (routineRun) logRoutineWeek();
    if (routineRun && routineRun.dry >= 3) {
      // 相場や仕入れ先が変わって、決めたルールでは仕入れられなくなった
      stopAuto();
      await say('mine', '3週続けて、ルールに合う品が見つからなかったわ。相場か仕入れ先が変わったのかも。「業界の動き」と仕入れ先の荒れ具合を見て、ルールを見直しましょう。', 'arms');
      await endRoutine();
    }
    if (autoWeeks > 0 && --autoWeeks === 0) {
      setAuto(false);
      await endRoutine();
    }
  }
  stopAuto();
  clearSave();
  showEnding();
}

// 難易度を選ぶ（閉じたら null）
function pickDifficulty() {
  let pick = null;
  const m = openModal('難易度を選ぶ', (body, api) => {
    body.append(h('p', { class: 'note' }, '借金の額と、毎月の最低返済・金利が変わる。始めたあとは変えられない。'));
    for (const [id, d] of Object.entries(DIFFICULTIES)) {
      body.append(h('button', { class: `btn diff-btn ${id === 'normal' ? 'primary' : ''}`, onclick: () => { pick = id; api.close(); } }, h('b', {}, d.name), h('small', {}, d.desc)));
    }
  }, { closeLabel: 'やめる' });
  return m.closed.then(() => pick);
}

// daily：デイリーチャレンジの日付（難易度は「ふつう」で固定）
// 前の周の到達点から1つ選ぶ（引き継がないなら ''、やめたら null）
function pickLegacy(ids) {
  let pick = null;
  const m = openModal('前の周から引き継ぐ', (body, api) => {
    body.append(h('p', { class: 'note' }, '前の周でたどり着いたルートの到達点を、1つだけ最初から持って始められる。'));
    for (const id of ids) {
      const sk = SKILL_MAP[id];
      body.append(h('button', { class: 'btn diff-btn', onclick: () => { pick = id; api.close(); } }, h('b', {}, sk.name), h('small', {}, sk.desc)));
    }
    body.append(h('button', { class: 'btn diff-btn primary', onclick: () => { pick = ''; api.close(); } }, h('b', {}, '引き継がない'), h('small', {}, 'まっさらな状態から始める')));
  }, { closeLabel: 'やめる' });
  return m.closed.then(() => pick);
}

// キャリアの型を選ぶ（10年を一度でも走りきったら選べる）。やめたら null
function pickStyle() {
  let pick = null;
  const m = openModal('キャリアの型', (body, api) => {
    body.append(h('p', { class: 'note' }, '一度10年を走りきった転売屋は、最初から「型」を決めて始められる。'));
    body.append(h('button', { class: 'btn diff-btn primary', onclick: () => { pick = { type: 'normal' }; api.close(); } }, h('b', {}, STYLES.normal.name), h('small', {}, STYLES.normal.desc)));
    body.append(h('div', { class: 'sub' }, `${STYLES.spec.name}`), h('p', { class: 'note' }, STYLES.spec.desc));
    for (const [cat, name] of Object.entries(SPECIALTIES)) {
      body.append(h('button', { class: 'btn diff-btn', onclick: () => { pick = { type: 'spec', cat }; api.close(); } }, h('b', {}, `${name}専門`), h('small', {}, `${name}の見立てのぶれ0.4倍・真贋の細部+2か所・専門の掘り出し物・買い手1.25倍（専門外の見立ては1.15倍ぶれる）`)));
    }
    body.append(h('div', { class: 'sub' }, STYLES.org.name), h('button', { class: 'btn diff-btn', onclick: () => { pick = { type: 'org' }; api.close(); } }, h('b', {}, STYLES.org.name), h('small', {}, STYLES.org.desc)));
  }, { closeLabel: 'やめる' });
  return m.closed.then(() => pick);
}

async function newGame({ daily = null } = {}) {
  const difficulty = daily ? 'normal' : await pickDifficulty();
  if (!difficulty) return;
  // デイリーチャレンジは同じ条件で競うので、引き継ぎはしない
  const legacyIds = daily ? [] : loadLegacy().filter((id) => SKILL_MAP[id]);
  const legacy = legacyIds.length ? await pickLegacy(legacyIds) : '';
  if (legacy === null) return;
  const veteran = !daily && loadRanking().some((r) => !r.daily);
  const style = veteran ? await pickStyle() : { type: 'normal' };
  if (!style) return;
  state = createGame(daily ? dailySeed(daily) : undefined, difficulty);
  state.style = style;
  if (!daily && loadMentors()[0]) state.mentor = loadMentors()[0]; // いちばん新しい前の周の転売屋が師匠になる
  if (daily) state.daily = daily;
  if (legacy) {
    state.skills.push(legacy);
    state.legacy = legacy;
  }
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
  newGame(); // 難易度を選んだところで、前のセーブを消す
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
        h('button', { class: 'btn', onclick: () => { if (!hasSave || window.confirm('セーブデータを消して、今日のチャレンジを始めますか？')) newGame({ daily: todayKey() }); } }, `今日のチャレンジ（${dailyLabel(todayKey())}）`),
        h('button', { class: 'btn', onclick: () => rankingModal() }, 'ランキング'),
        h('button', { class: 'btn', onclick: () => recordsModal() }, '実績'),
        h('button', { class: 'btn', onclick: () => aboutModal() }, 'このゲームについて'),
        h('button', {
          class: 'btn sound-toggle',
          onclick: (e) => {
            setSound(!soundOn());
            if (soundOn()) playBgm('land');
            e.currentTarget.textContent = soundLabel();
          },
        }, soundLabel()),
      ),
    ),
  );
  showScreen('title-screen');
  playBgm('land');
}

const soundLabel = () => (soundOn() ? '🔊 サウンド ON' : '🔇 サウンド OFF');

function rankingModal() {
  openModal('ランキング（この端末）', (body) => {
    const key = todayKey();
    const daily = loadDaily(key);
    body.append(h('div', { class: 'sub' }, `今日のチャレンジ（${dailyLabel(key)}）`), h('p', { class: 'note' }, '今日は誰が遊んでも、同じ相場・同じ出来事から始まる（難易度ふつう）。'));
    if (!daily.length) body.append(h('p', { class: 'empty' }, 'まだ記録がない'));
    daily.forEach((r, i) => body.append(h('div', { class: 'card row' }, h('div', { class: `rank r${r.rank}` }, r.rank), h('div', { class: 'grow' }, h('div', { class: 'name' }, `${i + 1}位 ${yenFmt(r.netWorth)}`), h('small', {}, `${r.ending}／${r.stage || ''}／${r.title}`)))));
    body.append(h('div', { class: 'sub' }, 'これまでの記録'));
    const list = loadRanking();
    if (!list.length) body.append(h('p', { class: 'empty' }, 'まだ記録がない'));
    list.forEach((r, i) => body.append(h('div', { class: 'card row' }, h('div', { class: `rank r${r.rank}` }, r.rank), h('div', { class: 'grow' }, h('div', { class: 'name' }, `${i + 1}位 ${yenFmt(r.netWorth)}`), h('small', {}, `${r.daily ? `チャレンジ ${dailyLabel(r.daily)}／` : ''}${r.style ? `${r.style}／` : ''}${r.difficulty ? `${r.difficulty}／` : ''}${r.ending}／${r.stage || ''}／${r.title}／売上 ${yenFmt(r.revenue)}／${r.date}`)))));
  });
}

// 実績とエンディングの回収
function recordsModal() {
  openModal('実績', (body) => {
    const rec = loadRecords();
    const ends = allEndings();
    const seenEnds = ends.filter((e) => rec.endings[e.id]).length;
    const got = ACHIEVEMENTS.filter((a) => rec.achievements[a.id]).length;
    body.append(
      h('div', { class: 'sub' }, `エンディング ${seenEnds}/${ends.length}（${Math.round((seenEnds / ends.length) * 100)}%）`),
      h('div', { class: 'ach-grid' }, ...ends.map((e) => h('div', { class: `ach ${rec.endings[e.id] ? 'on' : ''}` }, h('b', {}, rec.endings[e.id] ? e.title : '？？？'), rec.endings[e.id] ? h('small', {}, rec.endings[e.id]) : null))),
      h('div', { class: 'sub' }, `実績 ${got}/${ACHIEVEMENTS.length}`),
      ...ACHIEVEMENTS.map((a) => h('div', { class: `ach row ${rec.achievements[a.id] ? 'on' : ''}` }, h('b', {}, a.name), h('small', {}, a.desc), rec.achievements[a.id] ? h('small', { class: 'ach-date' }, rec.achievements[a.id]) : null)),
    );
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
  const entry = {
    netWorth: r.netWorth, rank: r.rank, title: r.title, ending: r.ending.title, stage: r.stage, revenue: r.revenue, difficulty: difficultyOf(state).name, style: styleOf(state) === 'normal' ? null : styleLabel(state), daily: state.daily || null, date: new Date().toLocaleDateString('ja-JP'),
  };
  const ranking = pushRanking(entry);
  if (state.daily) pushDaily(state.daily, entry);
  const before = new Set(loadLegacy());
  const caps = SKILLS.filter((x) => x.kind === 'capstone' && state.skills.includes(x.id)).map((x) => x.id);
  const newCaps = state.daily ? [] : caps.filter((id) => !before.has(id));
  if (!state.daily) {
    pushLegacy(caps);
    pushMentor(mentorRecord(state, r));
  }
  const newAch = pushRecords(checkAchievements(state, r), r.ending.id);
  const el = clear($('#ending-screen'));
  playBgm('land');
  playSe(['arrested', 'bankrupt', 'vanished'].includes(r.ending.id) ? 'lose' : 'win');
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
        r.vision ? row('志', `${r.vision.name}（達成 ${r.vision.done}/3）`) : null,
        row('純資産（スコア）', yenFmt(r.netWorth)),
        row('残った借金', yenFmt(r.debt)),
        row('累計売上', yenFmt(r.revenue)),
        row('粗利益', yenFmt(r.profit)),
        row('売った商品', `${r.soldUnits}個`),
        row('取引トラブル', `${r.troubles}件`),
        row('定価で確保した品薄商品', `${r.scarceBought}個`),
      ),
      newAch.length ? h('div', { class: 'ach-new' }, h('b', {}, '実績を解除'), ...newAch.map((id) => { const a = ACHIEVEMENTS.find((x) => x.id === id); return h('div', {}, `${a.name}（${a.desc}）`); })) : null,
      newCaps.length ? h('p', { class: 'note' }, `次の周に引き継げる到達点が増えた：${newCaps.map((id) => SKILL_MAP[id].name).join('、')}`) : null,
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
  const vision = r.vision ? `\n志：${r.vision.name}（達成 ${r.vision.done}/3）` : '';
  const text = `10 buy year！ 最終査定【${r.rank}】${r.ending.title}\n${r.stage}／称号：${r.title}${vision}\n純資産 ${yenFmt(r.netWorth)} / 売上 ${yenFmt(r.revenue)}`;
  navigator.clipboard?.writeText(text).catch(() => {});
}

showTitle();
