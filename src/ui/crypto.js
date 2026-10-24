// 仮想通貨：銘柄ごとの値動き（小さなチャート）、持っている分と損益、売買。行動は使わない
import { buyCoin, COINS, cryptoGain, holding, holdingValue, price, sellCoin } from '../engine/crypto.js';
import { playSe } from './audio.js';
import { h, yenFmt } from './dom.js';
import { openModal, toast } from './modal.js';

const fmtPrice = (v) => (v >= 1000 ? yenFmt(Math.round(v)) : `${v.toFixed(v < 10 ? 3 : 1)}円`);
const signYen = (v) => `${v >= 0 ? '+' : '−'}${yenFmt(Math.abs(v))}`;

// 直近24週の値動き（SVG の折れ線）
function spark(values, up) {
  if (values.length < 2) return h('span', { class: 'cr-spark' });
  const min = Math.min(...values), max = Math.max(...values), w = 90, hgt = 26;
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * w).toFixed(1)},${(hgt - ((v - min) / (max - min || 1)) * hgt).toFixed(1)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${hgt}`);
  svg.setAttribute('class', `cr-spark ${up ? 'up' : 'down'}`);
  const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
  line.setAttribute('points', pts);
  svg.append(line);
  return svg;
}

export function cryptoModal(s, onChange) {
  return openModal('仮想通貨', (body, api) => {
    const done = (msg, tone) => { toast(msg, tone); api.refresh(); onChange?.(); };
    const buy = (id, amount) => {
      if (!buyCoin(s, id, amount)) return toast('現金が足りない', 'bad');
      playSe('buy');
      done(`${COINS[id].name}を${yenFmt(amount)}ぶん買った`, 'good');
    };
    const sell = (id, ratio) => {
      const got = sellCoin(s, id, ratio);
      if (!got) return toast('持っていない', 'bad');
      playSe('coin');
      done(`${COINS[id].name}を売って${yenFmt(got)}になった`, 'good');
    };
    const gain = cryptoGain(s);
    body.append(
      h('div', { class: 'ledger-grid' },
        h('div', { class: 'lg-row' }, h('span', {}, '持っている仮想通貨（時価）'), h('b', {}, yenFmt(holdingValue(s)))),
        h('div', { class: 'lg-row' }, h('span', {}, '仮想通貨の損益（売った分＋含み）'), h('b', { class: gain >= 0 ? 'pos' : 'neg' }, signYen(gain))),
        h('div', { class: 'lg-row' }, h('span', {}, '現金'), h('b', {}, yenFmt(s.cash))),
      ),
      h('p', { class: 'note' }, '売買は行動を使わない。持っている分は時価で純資産に入る。相場は毎週動き、ときどきバブルと暴落が来る。……最後に資産の半分以上が仮想通貨の儲けだったら、それは「転売の10年」と言えるだろうか。'),
      ...Object.entries(COINS).map(([id, x]) => {
        const p = price(s, id);
        const hist = [...(s.crypto.hist[id] || []), p];
        const prev = hist.length > 1 ? hist[hist.length - 2] : p;
        const ch = (p / prev - 1) * 100;
        const hd = holding(s, id);
        const val = Math.round(hd.qty * p);
        const pl = val - hd.cost;
        return h('div', { class: 'cr-row' },
          h('div', { class: 'sat-top' }, h('b', {}, `${x.name}（${x.ticker}）`), h('small', { class: ch >= 0 ? 'pos' : 'neg' }, `${fmtPrice(p)}（先週比 ${ch >= 0 ? '+' : ''}${ch.toFixed(1)}%）`)),
          h('div', { class: 'cr-mid' }, spark(hist, p >= hist[0]), h('small', {}, x.desc)),
          hd.qty > 0 ? h('small', {}, `持っている分 ${yenFmt(val)}（損益 ${signYen(pl)}）`) : h('small', { class: 'reg-rule' }, '持っていない'),
          h('div', { class: 'cr-btns' },
            ...[1000000, 10000000].map((a) => h('button', { class: 'btn small', disabled: s.cash < a, onclick: () => buy(id, a) }, `${a >= 10000000 ? '1,000万' : '100万'}円買う`)),
            h('button', { class: 'btn small', disabled: hd.qty <= 0, onclick: () => sell(id, 0.5) }, '半分売る'),
            h('button', { class: 'btn small', disabled: hd.qty <= 0, onclick: () => sell(id, 1) }, '全部売る'),
          ),
        );
      }),
    );
  }).closed;
}
