// 経営（KPI）・メニュー画面
import { productOf } from '../data/products.js';
import { TOTAL_WEEKS, TOTAL_YEARS, weekLabel, yearOf } from '../engine/calendar.js';
import { debtFreeSteps, difficultyOf, minPayment, repay } from '../engine/finance.js';
import { agingChart, profitChart } from './charts.js';
import { styleLabel, styleOf } from '../engine/style.js';
import { computeKpis, formatKpi, KPI_DEFS, kpiLevel } from '../engine/kpi.js';
import { STAGES, stageOf, stageProgress } from '../engine/career.js';
import { grossProfit } from '../engine/state.js';
import { buzz, canVibrate, playSe, setSound, setVibrate, setVolume, soundOn, vibrateEnabled, volumeOf } from './audio.js';
import { oneTap, setOneTap } from './prefs.js';
import { FONT_SCALES, fontScale, setFontScale } from './a11y.js';
import { getLang, setLang } from '../i18n/index.js';
import { h, signYen, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';
import { logUi, setTelemetryEnabled, telemetryEnabled } from './telemetry.js';

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
      roadBar(s),
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
        row('カード 今月末の引き落とし', yenFmt(s.card.due)),
        row('カード 今月の利用', `${yenFmt(s.card.current)}（来月末に引き落とし）`),
        s.card.next ? row('カード 締め日のあとの利用', `${yenFmt(s.card.next)}（再来月末に引き落とし）`) : null,
        row('連続滞納', `${s.delinquency} / 3 か月`, s.delinquency ? 'neg' : ''),
      ),
    );
    if (s.debt > 0) {
      const pay = async (want) => {
        const paid = repay(s, want);
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
      };
      const cash = Math.max(0, Math.floor(s.cash));
      const half = Math.min(s.debt, Math.floor(cash / 2));
      body.append(
        h('div', { class: 'sub' }, '繰上げ返済'),
        h('p', { class: 'note' }, `早く返すほど利息（年${Math.round(difficultyOf(s).rate * 100)}%）が減る。ただし手元資金が減ると仕入れができなくなる。`),
        // ワンタップで返す：全額（現金が足りるとき）・手持ちの50%
        h('div', { class: 'repay-quick' },
          h('button', { class: 'btn primary', disabled: cash < s.debt, onclick: () => pay(s.debt) }, '全額返済', h('small', {}, cash >= s.debt ? yenFmt(s.debt) : `あと${yenFmt(s.debt - cash)}足りない`)),
          h('button', { class: 'btn', disabled: half <= 0, onclick: () => pay(half) }, '手持ちの50%', h('small', {}, yenFmt(half)))),
        h('div', { class: 'price-row' },
          h('input', { type: 'number', min: '0', step: '10000', value: String(amount), 'aria-label': '返済する金額', onchange: (e) => { amount = Math.max(0, Number(e.target.value) || 0); } }),
          h('span', {}, '円'),
          h('button', { class: 'btn', onclick: () => pay(amount) }, '金額を決めて返済'),
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

// 10年の道のり：10年の帯に、各ステージに上がった点と、いまの位置
function roadBar(s) {
  const pct = (w) => `${Math.min(100, (w / TOTAL_WEEKS) * 100)}%`;
  const ups = Object.entries(s.stageWeeks || {}).filter(([to]) => Number(to) > 1);
  return h('div', { class: 'road' },
    h('div', { class: 'road-h' }, h('b', {}, '10年の道のり'), h('small', {}, `${yearOf(s.week)}年目・残り${TOTAL_WEEKS - s.week}週`)),
    h('div', { class: 'road-track' },
      h('i', { class: 'road-fill', style: { width: pct(s.week) } }),
      ...Array.from({ length: TOTAL_YEARS - 1 }, (_, i) => h('span', { class: 'road-tick', style: { left: `${((i + 1) / TOTAL_YEARS) * 100}%` } })),
      ...ups.map(([to, w]) => h('span', { class: 'road-st', style: { left: pct(w) }, title: `ステージ${to}：${weekLabel(w)}` }, to)),
      h('span', { class: 'road-me', style: { left: pct(s.week) } }, '▼')),
    h('div', { class: 'road-years' }, ...Array.from({ length: TOTAL_YEARS }, (_, i) => h('small', {}, i + 1))));
}

function row(label, value, cls = '') {
  return h('div', { class: 'lg-row' }, h('span', {}, label), h('b', { class: cls }, value));
}

export function menuModal({ s, onTitle, onSpeed, speed, onRestart, onChange, onMarket, onBiz, onShop, onDeal, onRivals, onCollection, onCareers, onLife, onCrypto, onMap, onCompanions, onGlossary, onGuide, marketLock, newsCount = 0, fresh = () => false, seen = () => {} }) {
  // 途中で開く項目は、開くまで出さない。開いたら NEW（押したら既読）
  const item = (id, show, label, go, extra = null) => (show
    ? h('button', { class: `btn big ${id}-btn ${fresh(id) ? 'fresh' : ''}`, onclick: () => { seen(id); logUi(`menu:${id}`); api.close(); go?.(); } }, label, fresh(id) ? h('span', { class: 'new-tag' }, 'NEW') : extra)
    : null);
  let api;
  let view = 'main'; // main：機能 / settings：設定
  const big = (label, go) => h('button', { class: 'btn big', onclick: () => { logUi(`menu:${label}`); api.close(); go?.(); } }, label);
  const group = (title, ...btns) => {
    const list = btns.filter(Boolean);
    return list.length ? [h('div', { class: 'menu-h' }, title), h('div', { class: 'menu-main' }, ...list)] : [];
  };
  return openModal('メニュー', (body, a) => {
    api = a;
    if (view === 'settings') {
      body.append(
        h('button', { class: 'menu-back', onclick: () => { view = 'main'; api.refresh(); } }, '◀ メニューに戻る'),
        h('div', { class: 'menu-h' }, '画面と音'),
        h('div', { class: 'menu-list' },
          h('button', { class: 'btn', onclick: () => { setSound(!soundOn()); api.refresh(); } }, `サウンド: ${soundOn() ? 'ON' : 'OFF'}`),
          // BGMと効果音の音量を別々に
          ...[['bgm', 'BGM'], ['se', '効果音']].map(([k, label]) => h('div', { class: 'seg' }, h('span', {}, `${label}の音量 `),
            ...[['小', 0.35], ['中', 0.7], ['大', 1]].map(([l, v]) => h('button', { class: `btn small ${Math.abs(volumeOf(k) - v) < 0.01 ? 'on' : ''}`, onclick: () => { setVolume(k, v); if (k === 'se') playSe('coin'); api.refresh(); } }, l)))),
          canVibrate() ? h('button', { class: 'btn', onclick: () => { setVibrate(!vibrateEnabled()); if (vibrateEnabled()) buzz(30); api.refresh(); } }, `振動: ${vibrateEnabled() ? 'ON' : 'OFF'}`) : null,
          h('button', { class: 'btn', onclick: () => { setOneTap(!oneTap()); api.refresh(); } }, `行動を1タップで決める: ${oneTap() ? 'ON（長押しで予告だけ見る）' : 'OFF'}`),
          h('button', { class: 'btn', 'data-no-tr': '', onclick: () => { if (window.confirm(getLang() === 'en' ? 'Switch to Japanese? (The game reloads. Your save is kept.)' : '英語に切りかえますか？（ゲームを読みこみ直します。セーブはそのまま）')) setLang(getLang() === 'en' ? 'ja' : 'en'); } }, getLang() === 'en' ? '日本語 / Japanese' : 'English / 英語'),
          h('div', { class: 'seg' }, h('span', {}, '文字の大きさ '), ...FONT_SCALES.map(([label, v]) => h('button', { class: `btn small ${fontScale() === v ? 'on' : ''}`, 'aria-pressed': String(fontScale() === v), onclick: () => { setFontScale(v); api.refresh(); } }, label))),
          h('div', { class: 'seg' }, h('span', {}, '文字送り '), ...[['はやい', 8], ['ふつう', 22], ['おそい', 40], ['一瞬', 0]].map(([label, ms]) => h('button', { class: `btn small ${speed() === ms ? 'on' : ''}`, onclick: () => { onSpeed(ms); api.refresh(); } }, label))),
        ),
        s ? h('div', { class: 'menu-h' }, '遊び方') : null,
        s ? h('div', { class: 'menu-list' },
          h('button', { class: 'btn', onclick: () => { api.close(); onDeal?.(); } }, '取引の対応（値下げ交渉・トラブル）'),
          h('button', { class: 'btn', onclick: () => { s.settings.warnIdleListing = s.settings.warnIdleListing === false; api.refresh(); } }, `出品枠の空きを知らせる: ${s.settings.warnIdleListing === false ? 'OFF' : 'ON'}`),
          h('button', { class: 'btn', onclick: () => { s.settings.listNow = s.settings.listNow === false; api.refresh(); } }, `仕入れ後に「すぐ出品する？」を聞く: ${s.settings.listNow === false ? 'OFF' : 'ON'}`),
          s.skills.includes('out_buy')
            ? h('button', { class: 'btn', onclick: () => { s.settings.autoBuy = !s.settings.autoBuy; api.refresh(); onChange?.(); } }, `外注の自動仕入れ: ${s.settings.autoBuy ? 'ON' : 'OFF'}`)
            : null,
        ) : null,
        h('div', { class: 'menu-h' }, 'データ'),
        h('div', { class: 'menu-list' },
          h('p', { class: 'note' }, 'ゲームは行動が終わるたびと、アプリを切り替えたときに自動でセーブされる。'),
          // プレイログ：匿名のプレイ記録を送って、ゲームの改善に使う（いつでも止められる）
          h('button', { class: 'btn', onclick: () => { setTelemetryEnabled(!telemetryEnabled()); api.refresh(); } }, `プレイ記録を送って改善に協力する: ${telemetryEnabled() ? 'ON' : 'OFF'}`),
          h('p', { class: 'note' }, '送るのは、使った行動・開いた画面・仕入れと販売の月ごとの集計・進み具合などの匿名の記録だけ。名前やランキングの登録名、端末の情報は送らない。'),
          h('button', { class: 'btn', onclick: () => { api.close(); onTitle(); } }, 'タイトルへ戻る'),
          h('button', { class: 'btn danger', onclick: () => { if (window.confirm('セーブデータを消して最初からやり直しますか？')) { api.close(); onRestart(); } } }, '最初からやり直す'),
        ),
      );
      return;
    }
    // 機能を「お金と事業」「人と世界」に分けて並べる。設定は別の画面に
    body.append(
      ...group('お金と事業',
        item('market', s && !marketLock, '相場', onMarket, newsCount ? h('span', { class: 'badge' }, newsCount) : null),
        big('経営', onBiz),
        item('shop', !!s?.shop, '自分の店', onShop),
        item('crypto', !!s?.crypto?.open, '仮想通貨', onCrypto),
        item('careers', s && s.stage >= 2, 'キャリア', onCareers)),
      ...group('人と世界',
        s ? big('仲間', onCompanions) : null,
        item('rivals', s && s.stage >= 2, '業界の動き', onRivals),
        item('life', s && s.stage >= 2, '暮らし', onLife),
        item('collection', s && (s.stage >= 3 || s.collection?.length), 'コレクション', onCollection),
        item('map', s && Object.keys(s.storeMap || {}).length, '店の地図', onMap)),
      ...group('手引き', big('用語集', onGlossary), big('遊び方', onGuide)),
      h('button', { class: 'btn menu-settings', onclick: () => { view = 'settings'; api.refresh(); } }, '⚙ 設定（音・文字・取引の対応・データ）'),
    );
  }).closed;
}
