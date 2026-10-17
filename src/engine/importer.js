// 中国輸入：海外の卸サイトからノーブランド品をロットで輸入する。
// 仕入れ値は為替で変わり（円安で高い）、届くのは3週後。届くまでに、税関で止まる・検品不良・関税がある
import { productOf } from '../data/products.js';
import { chance, randRange } from './rng.js';
import { hasSkill } from './effects.js';
import { addExpense } from './kpi.js';
import { info, sfx, talk } from './steps.js';

export const IMPORT_WEEKS = 3; // 船便で届くまで
export const HOLD_WEEKS = 3; // 税関で止まったときの遅れ
export const DUTY_RATE = 0.1; // 関税・輸入消費税（仕入れ値に対して）
export const INSPECT_FEE = 150; // 現地の検品代行（1個あたり）

export const importOpen = (s) => s.stage >= 2 && hasSkill(s, 'src_online') && !s.underworld;

// 仕入れたロットを登録する。何が起きるかは、この時点で決まっている（届くまでわからない）
export function registerImport(s, offer, units, { inspect = false } = {}) {
  const p = productOf(offer.pid);
  const knock = !!offer.knockoff; // 人気品のコピー品
  const lot = {
    id: `${s.week}-${units[0]?.uid}`,
    pid: offer.pid,
    qty: units.length,
    cost: offer.price * units.length,
    due: s.week + IMPORT_WEEKS,
    inspect,
    // 税関：コピー品はほぼ没収、ふつうの品もときどき書類の不備で止まる
    seized: knock && chance(s, 0.75),
    held: !knock && chance(s, 0.12),
    // 検品不良：検品代行を頼めば大きく減る
    defects: Math.round(units.length * randRange(s, 0.04, 0.22) * (inspect ? 0.25 : 1)),
    uids: units.map((u) => u.uid),
  };
  for (const u of units) {
    u.arrive = lot.due + (lot.held ? HOLD_WEEKS : 0);
    u.imported = true;
  }
  if (inspect) addExpense(s, INSPECT_FEE * units.length, `検品代行：${p.name} ×${units.length}`);
  (s.imports ||= []).push(lot);
  return lot;
}

// 週の頭：税関で止まった知らせと、ロットの到着
export function importWeek(s) {
  const steps = [];
  for (const lot of s.imports || []) {
    const p = productOf(lot.pid);
    if (lot.held && s.week === lot.due) {
      steps.push(sfx('trouble'), info('税関で止まった', [`「${p.name}」×${lot.qty}が税関で止まっている（書類の不備）`, `届くのが${HOLD_WEEKS}週遅れる`], 'bad'));
    }
    const arrive = lot.due + (lot.held ? HOLD_WEEKS : 0);
    if (s.week !== arrive) continue;
    lot.done = true;
    const units = s.inventory.filter((u) => lot.uids.includes(u.uid));
    if (lot.seized) {
      s.inventory = s.inventory.filter((u) => !lot.uids.includes(u.uid));
      s.stats.seized = (s.stats.seized || 0) + units.length;
      steps.push(
        sfx('trouble'),
        talk('chris', `税関から通知…「${p.name}」は商標を侵害するコピー品として、全部没収されたって…。`, 'cry'),
        info('税関で没収', [`「${p.name}」×${lot.qty}を没収された（仕入れ値は戻らない）`, '人気品の激安品は、たいていコピー品だ'], 'bad'),
      );
      continue;
    }
    const duty = Math.round(lot.cost * DUTY_RATE);
    addExpense(s, duty, `関税・輸入消費税：${p.name} ×${lot.qty}`);
    const bad = units.slice(0, Math.min(lot.defects, units.length));
    for (const u of bad) u.damaged = true;
    steps.push(info('国際便が届いた', [
      `「${p.name}」×${units.length}`,
      `関税・輸入消費税 ${duty.toLocaleString()}円`,
      bad.length ? `検品で${bad.length}個が不良品（傷あり・半値でしか売れない）` : '不良品はなかった',
      lot.inspect ? '（現地の検品代行で、不良はかなり減った）' : '',
    ].filter(Boolean), bad.length > lot.qty * 0.15 ? 'bad' : 'good'));
  }
  if (s.imports) s.imports = s.imports.filter((l) => !l.done);
  return steps;
}

// まだ届いていないロット（在庫画面などで見せる）
export const pendingImports = (s) => (s.imports || []).map((l) => ({ ...l, arrive: l.due + (l.held && s.week >= l.due ? HOLD_WEEKS : 0) }));
