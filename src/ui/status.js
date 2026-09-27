// スキルツリー・経営（KPI）・メニュー画面
import { BRANCHES, SKILL_MAP, SKILLS } from '../data/skills.js';
import { productOf } from '../data/products.js';
import { weekLabel } from '../engine/calendar.js';
import {
  ABILITIES, ABILITY_MAX, abilityCost, canAfford, EXP_NAME, EXP_TYPES, learnSkill, nodeBlockers, nodeLv, nodeState, raiseAbility, rankOf, skillCost,
} from '../engine/abilities.js';
import { debtFreeSteps, MIN_PAYMENT, repay } from '../engine/finance.js';
import { computeKpis, formatKpi, KPI_DEFS, kpiLevel } from '../engine/kpi.js';
import { STAGES, stageOf } from '../engine/career.js';
import { grossProfit } from '../engine/state.js';
import { playSe, setSound, soundOn } from './audio.js';
import { h, signYen, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

const costText = (cost) => Object.entries(cost).map(([k, v]) => `${EXP_NAME[k]}${v}`).join(' ');
const KIND_BADGE = { unlock: '解放', perk: '常時', repeat: '強化', gold: '偉人の奥義', red: '不調', initial: '初期' };

function expPool(s) {
  return h('div', { class: 'exp-pool' }, ...EXP_TYPES.map((e) => h('div', { class: `exp ${e.id}` }, h('small', {}, e.name), h('b', {}, s.exp[e.id] || 0))));
}

// ノードの深さ（前提ノードの連なり）
function depthOf(id, seen = new Set()) {
  const sk = SKILL_MAP[id];
  if (!sk.req?.length || seen.has(id)) return 0;
  seen.add(id);
  return 1 + Math.max(...sk.req.filter((r) => SKILL_MAP[r].branch === sk.branch).map((r) => depthOf(r, seen)), -1);
}

// ツリー順に並べる：前提ノードの直後に子ノードが来るように
function treeOrder(branch) {
  const nodes = SKILLS.filter((sk) => sk.branch === branch);
  const out = [];
  const visit = (sk) => {
    if (out.includes(sk)) return;
    out.push(sk);
    for (const child of nodes.filter((c) => (c.req || []).includes(sk.id))) visit(child);
  };
  for (const sk of nodes.filter((x) => !(x.req || []).some((r) => SKILL_MAP[r].branch === branch))) visit(sk);
  return out;
}

export function treeModal(s, onChange) {
  let branch = 'src';
  return openModal('転売屋スキルツリー', (body, api) => {
    const owned = SKILLS.filter((sk) => sk.kind !== 'red' && nodeState(s, sk.id) === 'owned').length;
    const total = SKILLS.filter((sk) => sk.kind !== 'red').length;
    body.append(
      expPool(s),
      h('p', { class: 'note' }, `活動で貯めた経験点でノードを解放する。解放 ${owned} / ${total}。ステージが上がると新しいノードが開く。`),
      h('div', { class: 'seg branch-tabs' },
        ...[...BRANCHES, { id: 'red', name: '不調' }].map((b) => h('button', { class: `btn small ${branch === b.id ? 'on' : ''}`, onclick: () => { branch = b.id; api.refresh(); } }, b.name)),
      ),
    );
    const br = BRANCHES.find((b) => b.id === branch);
    if (br?.ability) body.append(abilityCard(s, ABILITIES.find((a) => a.id === br.ability), api, onChange));

    const nodes = branch === 'red' ? SKILLS.filter((sk) => sk.kind === 'red' && s.skills.includes(sk.id)) : treeOrder(branch);
    if (branch === 'red' && !nodes.length) body.append(h('p', { class: 'empty' }, '今は不調はない'));
    for (const sk of nodes) body.append(nodeCard(s, sk, api, onChange));
  }).closed;
}

function abilityCard(s, a, api, onChange) {
  const lv = s.abilities[a.id];
  const cost = abilityCost(a.id, lv);
  const ok = lv < ABILITY_MAX && canAfford(s, cost);
  return h('div', { class: 'card ability root' },
    h('div', { class: `rank r${rankOf(lv)}` }, rankOf(lv)),
    h('div', { class: 'grow' },
      h('div', { class: 'name' }, `基礎能力：${a.name}`, h('small', {}, ` ${lv}`)),
      h('div', { class: 'bar' }, h('i', { style: { width: `${lv}%` } })),
      h('small', { class: 'desc' }, a.desc),
    ),
    h('div', { class: 'col' },
      h('button', { class: 'btn small', disabled: !ok, onclick: () => { raiseAbility(s, a.id, 1); api.refresh(); onChange?.(); } }, '+1'),
      h('button', { class: 'btn small', disabled: !ok, onclick: () => { raiseAbility(s, a.id, 5); api.refresh(); onChange?.(); } }, '+5'),
      h('small', {}, costText(cost)),
    ),
  );
}

function nodeCard(s, sk, api, onChange) {
  const state = nodeState(s, sk.id);
  const cost = skillCost(s, sk.id);
  const blockers = nodeBlockers(s, sk.id);
  const depth = depthOf(sk.id);
  const hint = s.hints[sk.id] || 0;
  const lvText = sk.kind === 'repeat' ? ` Lv${nodeLv(s, sk.id)}/${sk.max}` : '';
  const hidden = sk.kind === 'gold' && state === 'locked' && !hint;
  return h('div', { class: `card node ${state} ${sk.kind}`, style: { marginLeft: `${Math.min(depth, 3) * 14}px` } },
    depth ? h('span', { class: 'branch-line' }, '└') : null,
    h('div', { class: 'grow' },
      h('div', { class: 'name' },
        hidden ? '？？？' : sk.name,
        h('small', { class: 'badge-kind' }, ` ${KIND_BADGE[sk.kind]}${lvText}`),
        hint && sk.kind !== 'red' ? h('small', { class: 'pos' }, ` コツLv${hint}`) : null,
        sk.monthly ? h('small', { class: 'neg' }, ` 月${yenFmt(sk.monthly)}`) : null,
      ),
      h('small', { class: 'desc' }, hidden ? '偉人とのイベントでコツを教わると現れる' : sk.desc),
      state === 'locked' && !hidden ? h('div', { class: 'warn' }, blockers.join('／')) : null,
    ),
    state === 'owned'
      ? h('span', { class: 'owned-mark' }, sk.kind === 'repeat' ? 'MAX' : '✓')
      : state === 'available' || state === 'red'
        ? h('div', { class: 'col' },
          h('button', {
            class: 'btn small primary',
            disabled: !canAfford(s, cost),
            onclick: () => {
              if (learnSkill(s, sk.id)) {
                playSe('hint');
                toast(state === 'red' ? `「${sk.name}」を克服した！` : `「${sk.name}」を解放した！`, 'good');
              }
              api.refresh();
              onChange?.();
            },
          }, state === 'red' ? '治す' : '解放'),
          h('small', {}, costText(cost)),
        )
        : null,
  );
}

// ---------------- 経営（KPI・お金） ----------------
export function bizModal(s, onChange, playSteps) {
  let amount = 0;
  return openModal('経営', (body, api) => {
    const st = stageOf(s);
    const lv = kpiLevel(s);
    const last = s.monthly[s.monthly.length - 1];
    const kNow = computeKpis(s, { ...s.cur, invCost: undefined });
    const kLast = last ? computeKpis(s, last) : null;

    body.append(
      h('div', { class: 'stage-box' },
        h('div', { class: 'stage-steps' }, ...STAGES.map((x) => h('span', { class: `st ${x.id === s.stage ? 'on' : x.id < s.stage ? 'done' : ''}` }, x.id))),
        h('div', { class: 'name' }, `ステージ${st.id}：${st.name}`, h('small', {}, `（目安 ${st.period}）`)),
        h('small', { class: 'desc' }, st.goal),
        h('div', { class: 'note' }, `次のステージ：${st.next}`),
      ),
      h('div', { class: 'sub' }, lv === 1 ? '成績（素人の帳簿）' : lv === 2 ? '成績（中級者の指標）' : '成績（玄人の指標）'),
      h('div', { class: 'kpi-table' },
        h('div', { class: 'kpi-row head' }, h('span', {}, '指標'), h('span', {}, '今月（途中）'), h('span', {}, '先月')),
        ...KPI_DEFS.filter((d) => d.level <= lv).map((d) => h('div', { class: 'kpi-row', title: d.desc || '' }, h('span', {}, d.name), h('b', {}, formatKpi(d, kNow[d.id])), h('b', {}, kLast ? formatKpi(d, kLast[d.id]) : '—'))),
        ...[2, 3].filter((l) => l > lv).map((l) => {
          const n = KPI_DEFS.filter((d) => d.level === l).length;
          return h('div', { class: 'kpi-row locked' }, h('span', {}, `？？？ ×${n}`), h('span', { class: 'note' }, l === 2 ? '中級者の指標：スキルツリー「利益率と回転」で見られる' : '玄人の指標：スキルツリー「資金効率と時間単価」で見られる'));
        }),
      ),
    );

    if (s.monthly.length) {
      body.append(
        h('div', { class: 'sub' }, '月ごとの推移（直近12か月）'),
        h('div', { class: 'ledger' }, ...s.monthly.slice(-12).reverse().map((m) => h('div', { class: 'ledger-row' }, h('small', {}, `${m.year}年目${m.month}月`), h('span', {}, `売上 ${yenFmt(m.revenue)}・${m.sold}個`), h('b', { class: m.net >= 0 ? 'pos' : 'neg' }, signYen(m.net))))),
      );
    }

    const pending = s.pending.reduce((a, p) => a + p.amount, 0);
    body.append(
      h('div', { class: 'sub' }, 'お金'),
      h('div', { class: 'ledger-grid' },
        row('現金', yenFmt(s.cash)),
        row('入金待ちの売上金', yenFmt(pending)),
        row('ポイント', `${s.points.toLocaleString()}pt（仕入れ時に自動で使う）`),
        row('借金', yenFmt(s.debt), s.debt ? 'neg' : ''),
        row('毎月の最低返済', s.debt ? `${yenFmt(Math.min(MIN_PAYMENT, s.debt))}（毎月第4週末）` : 'なし'),
        row('カード 今月の利用', `${yenFmt(s.card.current)}（来月末に引き落とし）`),
        row('カード 今月末の引き落とし', yenFmt(s.card.due)),
        row('連続滞納', `${s.delinquency} / 3 か月`, s.delinquency ? 'neg' : ''),
      ),
    );
    if (s.debt > 0) {
      body.append(
        h('div', { class: 'sub' }, '繰上げ返済'),
        h('p', { class: 'note' }, '早く返すほど利息（年15%）が減る。ただし手元資金が減ると仕入れができなくなる。'),
        h('div', { class: 'price-row' },
          h('input', { type: 'number', min: '0', step: '10000', value: String(amount), onchange: (e) => { amount = Math.max(0, Number(e.target.value) || 0); } }),
          h('span', {}, '円'),
          h('button', {
            class: 'btn primary',
            onclick: async () => {
              const paid = repay(s, amount);
              if (paid > 0) {
                playSe('coin');
                toast(`${yenFmt(paid)}を返済した`, 'good');
                if (s.debt <= 0 && !s.flags.debtFree) {
                  api.close();
                  await playSteps(debtFreeSteps(s));
                  onChange?.();
                  return;
                }
              } else toast('返済できる現金がない', 'bad');
              amount = 0;
              api.refresh();
              onChange?.();
            },
          }, '返済する'),
        ),
      );
    }
    const stt = s.stats;
    const best = stt.bestSale ? `${productOf(stt.bestSale.pid).name}（${signYen(stt.bestSale.profit)} / ${weekLabel(stt.bestSale.week)}）` : 'まだない';
    body.append(
      h('div', { class: 'sub' }, '通算'),
      h('div', { class: 'ledger-grid' },
        row('累計売上', yenFmt(stt.revenue)),
        row('粗利益', signYen(grossProfit(s)), grossProfit(s) >= 0 ? 'pos' : 'neg'),
        row('経費', yenFmt(stt.expenses)),
        row('販売数 / 仕入れ数', `${stt.soldUnits} / ${stt.purchases}`),
        row('取引トラブル', `${stt.troubles}件`),
        row('納めた税金', yenFmt(stt.taxPaid)),
        row('最高の一品', best),
      ),
      h('div', { class: 'sub' }, '収支履歴（新しい順）'),
      h('div', { class: 'ledger' }, ...s.ledger.slice(-40).reverse().map((l) => h('div', { class: 'ledger-row' }, h('small', {}, weekLabel(l.week)), h('span', {}, l.text), l.amount ? h('b', { class: l.amount >= 0 ? 'pos' : 'neg' }, signYen(l.amount)) : h('b', {})))),
    );
  }).closed;
}

function row(label, value, cls = '') {
  return h('div', { class: 'lg-row' }, h('span', {}, label), h('b', { class: cls }, value));
}

export function menuModal({ s, onTitle, onSpeed, speed, onRestart, onChange }) {
  return openModal('メニュー', (body, api) => {
    body.append(
      h('div', { class: 'menu-list' },
        h('button', { class: 'btn', onclick: () => { setSound(!soundOn()); api.refresh(); } }, `サウンド: ${soundOn() ? 'ON' : 'OFF'}`),
        h('div', { class: 'seg' }, h('span', {}, '文字送り '), ...[['はやい', 8], ['ふつう', 22], ['おそい', 40], ['一瞬', 0]].map(([label, ms]) => h('button', { class: `btn small ${speed() === ms ? 'on' : ''}`, onclick: () => { onSpeed(ms); api.refresh(); } }, label))),
        s?.skills.includes('out_buy')
          ? h('button', { class: 'btn', onclick: () => { s.settings.autoBuy = !s.settings.autoBuy; api.refresh(); onChange?.(); } }, `外注の自動仕入れ: ${s.settings.autoBuy ? 'ON' : 'OFF'}`)
          : null,
        h('p', { class: 'note' }, 'ゲームは毎週のはじめに自動でセーブされる。'),
        h('button', { class: 'btn', onclick: () => { api.close(); onTitle(); } }, 'タイトルへ戻る'),
        h('button', { class: 'btn danger', onclick: () => { if (window.confirm('セーブデータを消して最初からやり直しますか？')) { api.close(); onRestart(); } } }, '最初からやり直す'),
      ),
    );
  }).closed;
}
