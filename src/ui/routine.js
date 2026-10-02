// ルーティンの設定画面。仕入れ・出品・売れ残りのルールを決めて、何週回すかを選ぶ
import { COMMAND_MAP, availableCommands } from '../engine/commands.js';
import { PLATFORMS } from '../engine/inventory.js';
import { hasSkill } from '../engine/effects.js';
import { DEFAULT_ROUTINE, ROUTINE_CMDS, routineCfg } from '../engine/routine.js';
import { h } from './dom.js';
import { openModal } from './modal.js';

const pct = (v) => `${Math.round(v * 100)}%`;

export function routineModal(s) {
  const cfg = routineCfg(s);
  let started = null;
  const cmds = ROUTINE_CMDS.filter((id) => availableCommands(s).some((c) => c.id === id));
  if (!cmds.includes(cfg.cmd)) cfg.cmd = cmds[0];
  const api = openModal('ルーティン', (body, m) => {
    const seg = (key, options) => h('div', { class: 'seg rt-seg' }, ...options.map(([v, label]) => h('button', { class: `btn small ${cfg[key] === v ? 'on' : ''}`, onclick: () => { cfg[key] = v; m.refresh(); } }, label)));
    const slider = (key, min, max, step, fmt) => h('div', { class: 'rt-line' },
      h('input', { type: 'range', min, max, step, value: String(cfg[key]), oninput: (e) => { cfg[key] = Number(e.target.value); e.target.nextSibling.textContent = fmt(cfg[key]); } }),
      h('b', {}, fmt(cfg[key])));
    const markets = [['auto', 'おまかせ'], ...Object.values(PLATFORMS).filter((p) => hasSkill(s, p.node)).map((p) => [p.id, p.name])];
    body.append(
      h('p', { class: 'note' }, '仕入れ → 出品 → 売却 → 値下げのサイクルを毎週回す。選択肢・トラブルが出たら止まる。'),
      h('div', { class: 'sub' }, '① 仕入れ'),
      seg('cmd', cmds.map((id) => [id, COMMAND_MAP[id].name])),
      h('small', { class: 'rt-l' }, '見込み利益率がこれ以上なら買う'), slider('minMargin', 0.05, 0.4, 0.01, pct),
      h('small', { class: 'rt-l' }, '使うお金（月末の支払いを除いた手元資金の）'), slider('budgetRate', 0.2, 0.8, 0.05, pct),
      h('small', { class: 'rt-l' }, '1商品の最大個数'), slider('maxQty', 1, 10, 1, (v) => `${v}個`),
      h('small', { class: 'rt-l' }, '偽物の手がかりがこの数以上なら避ける'), slider('avoidClues', 1, 5, 1, (v) => `${v}個`),
      h('div', { class: 'sub' }, '② 出品（仕入れたらすぐ）'),
      seg('market', markets),
      h('small', { class: 'rt-l' }, '値付け（推定相場×）'), slider('mult', 0.8, 1.3, 0.01, (v) => `×${v.toFixed(2)}`),
      h('div', { class: 'sub' }, '③ 売れ残り'),
      h('small', { class: 'rt-l' }, 'この週数売れなければ値下げ（推定相場の70%まで）'), slider('cutWeeks', 1, 6, 1, (v) => `${v}週`),
      h('small', { class: 'rt-l' }, '値下げ幅'), slider('cutRate', 0.03, 0.2, 0.01, pct),
      h('small', { class: 'rt-l' }, 'この週数持っていたら即決買取（0＝しない）'), slider('dumpWeeks', 0, 20, 1, (v) => (v ? `${v}週` : 'しない')),
      h('div', { class: 'sub' }, '④ 期間'),
      seg('weeks', [[4, '4週'], [8, '8週'], [12, '12週']]),
      h('div', { class: 'rt-btns' },
        h('button', { class: 'btn', onclick: () => { Object.assign(cfg, DEFAULT_ROUTINE, { cmd: cmds[0] }); m.refresh(); } }, '初期設定に戻す'),
        h('button', { class: 'btn primary big', disabled: !cmds.length, onclick: () => { started = { ...cfg }; m.close(); } }, `${cfg.weeks}週 回す`),
      ),
    );
  }, { closeLabel: 'やめる' });
  return api.closed.then(() => started);
}
