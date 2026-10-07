// 経営（KPI）・メニュー画面
import { productOf } from '../data/products.js';
import { weekLabel } from '../engine/calendar.js';
import { debtFreeSteps, difficultyOf, minPayment, repay } from '../engine/finance.js';
import { agingChart, profitChart } from './charts.js';
import { styleLabel, styleOf } from '../engine/style.js';
import { computeKpis, formatKpi, KPI_DEFS, kpiLevel } from '../engine/kpi.js';
import { STAGES, stageOf, stageProgress } from '../engine/career.js';
import { grossProfit } from '../engine/state.js';
import { playSe, setSound, soundOn } from './audio.js';
import { FONT_SCALES, fontScale, setFontScale } from './a11y.js';
import { h, signYen, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

// ---------------- 経営（KPI・お金） ----------------
// 昇格条件の進み具合。売上ではなく純利益（売上 − 仕入れ値 − 手数料 − 送料 − 経費）で判定する
function progressBox(s) {
  const p = stageProgress(s);
  if (!p) return null;
  if (p.items) {
    return h('div', { class: 'stage-prog' }, h('small', {}, p.label),
      ...p.items.map((x, i) => h('div', { class: 'sp-row' }, h('span', {}, `${p.items.length - i}か月前`), h('b', { class: x.v >= x.target ? 'pos' : 'neg' }, signYen(x.v)))));
  }
  const pct = Math.max(0, Math.min(100, (p.value / p.target) * 100));
  return h('div', { class: 'stage-prog' },
    h('small', {}, p.label),
    h('div', { class: 'bar' }, h('i', { style: { width: `${pct}%` } })),
    h('div', { class: 'sp-row' }, h('b', { class: p.value >= p.target ? 'pos' : '' }, `${yenFmt(p.value)} / ${yenFmt(p.target)}`), p.months < p.need ? h('small', {}, `（記録 ${p.months}/${p.need}か月）`) : null),
  );
}

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
        h('div', { class: 'stage-steps' }, ...STAGES.map((x) => h('span', { class: `st ${x.id === s.stage ? 'on' : x.id < s.stage ? 'done' : ''}`, 'aria-current': x.id === s.stage ? 'step' : null }, x.id < s.stage ? `✓${x.id}` : x.id))),
        h('div', { class: 'name' }, `ステージ${st.id}：${st.name}`, h('small', {}, `（目安 ${st.period}）`)),
        h('small', { class: 'desc' }, st.goal),
        h('div', { class: 'note' }, `次のステージ：${st.next}`),
        progressBox(s),
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
        profitChart(s.monthly.slice(-12)),
        h('div', { class: 'ledger' }, ...s.monthly.slice(-12).reverse().map((m) => h('div', { class: 'ledger-row' }, h('small', {}, `${m.year}年目${m.month}月`), h('span', {}, `売上 ${yenFmt(m.revenue)}・${m.sold}個`), h('b', { class: m.net >= 0 ? 'pos' : 'neg' }, signYen(m.net))))),
      );
    }

    if (lv >= 2 && s.inventory.length) body.append(h('div', { class: 'sub' }, '在庫の滞留'), agingChart(s));

    const pending = s.pending.reduce((a, p) => a + p.amount, 0);
    body.append(
      h('div', { class: 'sub' }, 'お金'),
      h('div', { class: 'ledger-grid' },
        row('現金', yenFmt(s.cash)),
        row('入金待ちの売上金', yenFmt(pending)),
        row('ポイント', `${s.points.toLocaleString()}pt（仕入れ時に自動で使う）`),
        row('借金', yenFmt(s.debt), s.debt ? 'neg' : ''),
        row('毎月の最低返済', s.debt ? `${yenFmt(Math.min(minPayment(s), s.debt))}（毎月第4週末）` : 'なし'),
        row('難易度', `${difficultyOf(s).name}（年利${Math.round(difficultyOf(s).rate * 100)}%）${s.daily ? `・${s.daily} のチャレンジ` : ''}`),
        styleOf(s) !== 'normal' ? row('キャリアの型', styleLabel(s)) : null,
        row('カード 今月の利用', `${yenFmt(s.card.current)}（来月末に引き落とし）`),
        row('カード 今月末の引き落とし', yenFmt(s.card.due)),
        row('連続滞納', `${s.delinquency} / 3 か月`, s.delinquency ? 'neg' : ''),
      ),
    );
    if (s.debt > 0) {
      body.append(
        h('div', { class: 'sub' }, '繰上げ返済'),
        h('p', { class: 'note' }, `早く返すほど利息（年${Math.round(difficultyOf(s).rate * 100)}%）が減る。ただし手元資金が減ると仕入れができなくなる。`),
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

export function menuModal({ s, onTitle, onSpeed, speed, onRestart, onChange, onMarket, onBiz, onShop, onDeal, onRivals, onCollection, onCareers, onLife, onCrypto, onMap, onCompanions, marketLock, newsCount = 0 }) {
  return openModal('メニュー', (body, api) => {
    body.append(
      h('div', { class: 'menu-main' },
        h('button', { class: `btn big ${marketLock ? 'locked' : ''}`, onclick: () => { if (marketLock) return toast(marketLock, 'bad'); api.close(); onMarket?.(); } }, marketLock ? '🔒相場' : '相場', !marketLock && newsCount ? h('span', { class: 'badge' }, newsCount) : null),
        h('button', { class: 'btn big', onclick: () => { api.close(); onBiz?.(); } }, '経営'),
        s?.shop ? h('button', { class: 'btn big shop-btn', onclick: () => { api.close(); onShop?.(); } }, '自分の店') : null,
        s && s.stage >= 2 ? h('button', { class: 'btn big', onclick: () => { api.close(); onRivals?.(); } }, '業界の動き') : null,
        s && (s.stage >= 3 || s.collection?.length) ? h('button', { class: 'btn big', onclick: () => { api.close(); onCollection?.(); } }, 'コレクション') : null,
        s && s.stage >= 2 ? h('button', { class: 'btn big', onclick: () => { api.close(); onCareers?.(); } }, 'キャリア') : null,
        s && s.stage >= 2 ? h('button', { class: 'btn big', onclick: () => { api.close(); onLife?.(); } }, '暮らし') : null,
        s?.crypto?.open ? h('button', { class: 'btn big', onclick: () => { api.close(); onCrypto?.(); } }, '仮想通貨') : null,
        s ? h('button', { class: 'btn big', onclick: () => { api.close(); onCompanions?.(); } }, '仲間') : null,
        s && Object.keys(s.storeMap || {}).length ? h('button', { class: 'btn big', onclick: () => { api.close(); onMap?.(); } }, '店の地図') : null,
      ),
      h('div', { class: 'menu-list' },
        h('button', { class: 'btn', onclick: () => { setSound(!soundOn()); api.refresh(); } }, `サウンド: ${soundOn() ? 'ON' : 'OFF'}`),
        h('div', { class: 'seg' }, h('span', {}, '文字の大きさ '), ...FONT_SCALES.map(([label, v]) => h('button', { class: `btn small ${fontScale() === v ? 'on' : ''}`, 'aria-pressed': String(fontScale() === v), onclick: () => { setFontScale(v); api.refresh(); } }, label))),
        h('div', { class: 'seg' }, h('span', {}, '文字送り '), ...[['はやい', 8], ['ふつう', 22], ['おそい', 40], ['一瞬', 0]].map(([label, ms]) => h('button', { class: `btn small ${speed() === ms ? 'on' : ''}`, onclick: () => { onSpeed(ms); api.refresh(); } }, label))),
        s ? h('button', { class: 'btn', onclick: () => { api.close(); onDeal?.(); } }, '取引の対応（値下げ交渉・トラブル）') : null,
        s ? h('button', { class: 'btn', onclick: () => { s.settings.warnIdleListing = s.settings.warnIdleListing === false; api.refresh(); } }, `出品枠の空きを知らせる: ${s.settings.warnIdleListing === false ? 'OFF' : 'ON'}`) : null,
        s ? h('button', { class: 'btn', onclick: () => { s.settings.listNow = s.settings.listNow === false; api.refresh(); } }, `仕入れ後に「すぐ出品する？」を聞く: ${s.settings.listNow === false ? 'OFF' : 'ON'}`) : null,
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
