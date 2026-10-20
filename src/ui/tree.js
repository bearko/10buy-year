// 転売屋スキルツリー画面。中心から7つのルートが放射状に伸びる。ドラッグで移動、ホイール／ピンチで拡大縮小。
import { CAPSTONE_NEED, ROUTES, ROUTE_MAP, ROUTE_LEVELS, SKILL_MAP, SKILLS, TREE_NODES, nodePos } from '../data/skills.js';
import {
  bulkCandidates, canAfford, EXP_NAME, EXP_TYPES, isOffRoute, learnBulk, learnSkill, nodeBlockers, nodeLv, nodeState, nodeTeaser, nodeVisible, claimableNodes, recordValue, repeatAffordable, skillCost,
} from '../engine/abilities.js';
import { mainRoutes, routeCounts, routeLevel, routePerkText } from '../engine/perks.js';
import { openAbilities } from './abilities.js';
import { currentBgm, playBgm, playSe } from './audio.js';
import { isEn, tr } from '../i18n/index.js';

// 英語版のルートの小札（日本語は名前の頭2文字）
const SHORT_EN = { store: 'Store', online: 'Web', vintage: 'Used', sales: 'Sell', system: 'Sys', network: 'Net', manage: 'Biz', trade: 'Trade', dark: 'Dark' };
import { $, clear, h } from './dom.js';
import { toast } from './modal.js';
import { blockChat, unblockChat } from '../platform.js';

const UNIT = 108; // 1マスのピクセル
const RING_R = 2.6 + 0.9; // 中心から1段目と、その先の「？」が収まる距離（マス）
const SVGNS = 'http://www.w3.org/2000/svg';
const KIND_LABEL = { root: 'はじまり', starter: '解放', unlock: '解放', perk: '常時', repeat: '強化', gold: '偉人の奥義', record: '記録', capstone: '到達点' };

const svg = (tag, attrs = {}) => {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
};
const owns = (s, id) => s.skills.includes(id) || nodeLv(s, id) > 0;
const shown = (s, id) => nodeVisible(s, id) || nodeTeaser(s, id);
const costText = (cost) => Object.entries(cost).map(([k, v]) => h('span', { class: `cost-chip x ${k}` }, `${EXP_NAME[k]} ${v}`));

// まとめて解放の設定（この端末に覚える）：使わない経験点の種類と、目指すルートだけにするか
const BULK_KEY = '10buy-year:treeBulk';
function loadBulk() {
  try {
    const v = JSON.parse(window.localStorage.getItem(BULK_KEY) || '{}');
    return { skip: Array.isArray(v.skip) ? v.skip : [], mainOnly: v.mainOnly !== false };
  } catch {
    return { skip: [], mainOnly: true };
  }
}
function saveBulk(v) {
  try {
    window.localStorage.setItem(BULK_KEY, JSON.stringify(v));
  } catch {
    /* noop */
  }
}

function levelText(s, sk) {
  if (sk.kind === 'root') return '';
  if (sk.kind === 'repeat') return `${nodeLv(s, sk.id)}/${sk.max}`;
  return owns(s, sk.id) ? '1/1' : '0/1';
}

export function openTree(s, onChange, { focus = null } = {}) {
  return new Promise((resolve) => {
    let selected = null;
    let panel = null; // 'red'
    const view = { x: 0, y: 0, scale: window.innerWidth < 560 ? 0.62 : 0.85 };

    // ---- ワールド座標の範囲 ----
    const pts = TREE_NODES.map(nodePos);
    const pad = 2.2;
    const minX = Math.min(...pts.map((p) => p.x)) - pad;
    const minY = Math.min(...pts.map((p) => p.y)) - pad;
    const W = (Math.max(...pts.map((p) => p.x)) + pad - minX) * UNIT;
    const H = (Math.max(...pts.map((p) => p.y)) + pad - minY) * UNIT;
    const px = (p) => ({ x: (p.x - minX) * UNIT, y: (p.y - minY) * UNIT });

    const root = h('div', { class: 'tree-screen', role: 'dialog', 'aria-label': 'スキルツリー' });
    const head = h('header', { class: 'tree-head' });
    const routeBar = h('div', { class: 'tree-routebar' });
    const viewport = h('div', { class: 'tree-viewport' });
    const world = h('div', { class: 'tree-world', style: { width: `${W}px`, height: `${H}px` } });
    const links = svg('svg', { class: 'tree-links', width: W, height: H, viewBox: `0 0 ${W} ${H}` });
    const nodeLayer = h('div', { class: 'tree-nodes' });
    const sheet = h('footer', { class: 'tree-sheet' });
    const expSide = h('div', { class: 'tree-expside' }); // 経験点（トップ画面と同じく右側に縦に並べる）
    const tip = h('div', { class: 'tnode-tip', role: 'tooltip', hidden: true }); // パネルの詳細（マウスを乗せる・タップ）
    world.append(links, nodeLayer);
    viewport.append(world, expSide, tip);
    root.append(head, routeBar, viewport, sheet);
    $('#modal-root').append(root);
    blockChat();   // 全体チャット（共通基盤 SPEC-004）：スキルツリーの最中は隠す

    const prevBgm = currentBgm();
    playBgm('craft');
    const close = () => {
      if (!root.isConnected) return;   // 2 度閉じても数を狂わせない
      if (prevBgm) playBgm(prevBgm);
      root.remove();
      window.removeEventListener('keydown', onKey);
      unblockChat();
      resolve();
    };
    const onKey = (e) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('keydown', onKey);

    // ---- 表示位置 ----
    const applyView = () => {
      world.style.transform = `translate(${view.x}px, ${view.y}px) scale(${view.scale})`;
    };
    const centerOn = (id, animate = false) => {
      const p = px(nodePos(SKILL_MAP[id]));
      const rect = viewport.getBoundingClientRect();
      // 右側の経験点パネルに隠れないよう、狭い画面では少し左に寄せる
      const side = rect.width < 560 ? expSide.offsetWidth + 8 : 0;
      view.x = (rect.width - side) / 2 - p.x * view.scale;
      view.y = rect.height / 2 - p.y * view.scale;
      world.classList.toggle('glide', animate);
      applyView();
      if (animate) setTimeout(() => world.classList.remove('glide'), 450);
    };

    // ---- 描画 ----
    function renderHead() {
      clear(head).append(
        h('button', { class: 'tree-back', 'aria-label': '戻る', onclick: close }, '←'),
        h('div', { class: 'tree-title' }, h('b', {}, 'スキルツリー'), h('small', {}, 'RESELLER SKILL TREE')),
      );
      renderExp();
    }

    // 経験点。選んだパネルのコストぶんを「−10」と並べ、足りない分は赤くする
    function renderExp() {
      const sk = selected ? SKILL_MAP[selected] : null;
      const cost = sk && nodeVisible(s, sk.id) && nodeState(s, sk.id) === 'available' ? skillCost(s, sk.id) : {}; // 段階強化のパネルは Lv1 以上でも次のレベルのコストを出す
      clear(expSide).append(
        h('div', { class: 'tes-h' }, '経験点'),
        ...EXP_TYPES.map((e) => {
          const need = cost[e.id] || 0;
          const have = s.exp[e.id] || 0;
          return h('div', { class: `tes-row x ${e.id} ${need ? (have >= need ? 'ok' : 'ng') : ''}` },
            h('span', { class: 'pn' }, e.name),
            h('b', {}, have.toLocaleString()),
            h('i', {}, need ? `−${need}` : ''));
        }),
        // トップ画面に戻る（ツリーのドラッグに取られないよう、押した瞬間の伝播を止める）
        h('button', { class: 'tes-back', onpointerdown: (e) => e.stopPropagation(), onclick: close }, '◀ トップに戻る'),
      );
    }

    function renderRouteBar() {
      const counts = routeCounts(s);
      const main = mainRoutes(s);
      const top = main[0] && counts[main[0]] >= 2 ? ROUTE_MAP[main[0]] : null;
      clear(routeBar).append(
        h('div', { class: 'route-goal' },
          h('small', {}, '目指す'),
          top ? h('b', { style: { color: top.color } }, `${top.title}`) : h('b', { class: 'muted' }, '未定'),
        ),
        h('div', { class: 'route-pips' }, ...ROUTES.map((r) => {
          const n = counts[r.id] || 0;
          const lv = routeLevel(s, r.id);
          return h('button', {
            class: `route-pip ${main.slice(0, 2).includes(r.id) ? 'main' : ''}`,
            style: { '--c': r.color },
            title: `${r.name}：${n}個（熟練度Lv${lv}）`,
            onclick: () => {
              const first = TREE_NODES.find((x) => x.route === r.id && x.depth === 1);
              centerOn(first.id, true);
            },
          }, h('span', {}, isEn() ? SHORT_EN[r.id] || tr(r.name).split(' ')[0] : r.name.slice(0, 2)), h('em', {}, lv ? `Lv${lv}` : `${n}`));
        })),
      );
    }

    function linkPath(a, b) {
      const pa = px(nodePos(a));
      const pb = px(nodePos(b));
      // 少し曲げて「神経」のような線にする
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const dx = pb.x - pa.x;
      const dy = pb.y - pa.y;
      const bend = 0.12;
      return `M${pa.x},${pa.y} Q${mx - dy * bend},${my + dx * bend} ${pb.x},${pb.y}`;
    }

    function renderLinks(fresh, burst = false) {
      clear(links);
      const defs = svg('defs');
      const glow = svg('filter', { id: 'glow', x: '-50%', y: '-50%', width: '200%', height: '200%' });
      glow.append(svg('feGaussianBlur', { stdDeviation: '3', result: 'b' }));
      const merge = svg('feMerge');
      merge.append(svg('feMergeNode', { in: 'b' }), svg('feMergeNode', { in: 'SourceGraphic' }));
      glow.append(merge);
      defs.append(glow);
      links.append(defs);
      // ルート名のラベル（各ルートの先）
      for (const r of ROUTES) {
        const depth = Math.max(...TREE_NODES.filter((n) => n.route === r.id).map((n) => n.depth));
        const a = (r.angle * Math.PI) / 180;
        const p = px({ x: Math.cos(a) * (2.6 + depth * 1.7), y: Math.sin(a) * (2.6 + depth * 1.7) });
        const t = svg('text', { x: p.x, y: p.y, class: 'route-label', fill: r.color, 'text-anchor': 'middle' });
        t.textContent = r.name;
        links.append(t);
      }
      for (const n of TREE_NODES) {
        if (n.kind === 'root' || !shown(s, n.id)) continue;
        const parent = SKILL_MAP[n.parent];
        const teaser = !nodeVisible(s, n.id);
        const color = teaser ? '#3D4656' : ROUTE_MAP[n.route].color;
        const on = owns(s, n.id);
        const d = linkPath(parent, n);
        const base = svg('path', { d, class: `link ${on ? 'on' : ''} ${teaser ? 'teaser' : ''}`, stroke: color });
        links.append(base);
        if (on) links.append(svg('path', { d, class: 'link-flow', stroke: color, filter: 'url(#glow)' }));
        if (fresh.has(n.id)) {
          const len = base.getTotalLength?.() || 200;
          base.style.strokeDasharray = `${len}`;
          base.style.strokeDashoffset = `${len}`;
          base.classList.add('grow');
          base.style.animationDelay = `${fresh.get(n.id) * (burst ? 70 : 110)}ms`;
        }
      }
    }

    function nodeClass(sk) {
      if (!nodeVisible(s, sk.id)) return 'teaser';
      const st = nodeState(s, sk.id);
      if (sk.kind === 'root') return owns(s, sk.id) ? 'owned' : st === 'available' ? 'can' : 'locked';
      if (st === 'owned') return sk.kind === 'repeat' || sk.kind === 'capstone' ? 'max' : 'owned';
      // 強化の途中のパネルも、次のレベルが取れる＝緑、足りない＝赤
      if (st === 'available') return canAfford(s, skillCost(s, sk.id)) ? 'can' : 'short';
      if (owns(s, sk.id)) return 'owned';
      return 'locked';
    }

    function renderNodes(fresh, burst = false) {
      clear(nodeLayer);
      const keep = tipFor;
      if (keep) requestAnimationFrame(() => { if (tipFor === keep) showTip(keep); }); // 描き直したら、出ていた詳細を新しいパネルの位置に
      const center = px(nodePos(SKILL_MAP.src_home));
      for (const sk of TREE_NODES) {
        if (!shown(s, sk.id)) continue;
        const p = px(nodePos(sk));
        const cls = nodeClass(sk);
        const color = sk.route ? ROUTE_MAP[sk.route].color : '#F5C542';
        const hiddenGold = cls === 'teaser' || (sk.kind === 'gold' && !owns(s, sk.id) && !(s.hints[sk.id] > 0));
        const lvl = levelText(s, sk);
        const inner = [];
        if (sk.kind === 'record') {
          const v = Math.min(1, recordValue(s, sk.record.key) / sk.record.target);
          const ring = svg('svg', { class: 'rec-ring', viewBox: '0 0 64 64' });
          ring.append(svg('circle', { cx: 32, cy: 32, r: 29, class: 'rec-bg' }), svg('circle', { cx: 32, cy: 32, r: 29, class: 'rec-arc', 'stroke-dasharray': `${v * 182.2} 182.2` }));
          inner.push(ring);
        }
        inner.push(hiddenGold ? h('span', { class: 'tnode-q' }, '？') : h('img', { src: sk.icon, alt: '', draggable: 'false' }));
        const btn = h('button', {
          class: `tnode k-${cls === 'teaser' ? 'teaser' : sk.kind} ${cls} ${selected === sk.id ? 'sel' : ''} ${fresh.has(sk.id) ? (burst && sk.kind !== 'root' ? 'burst' : 'pop') : ''} ${sk.id === focus && !owns(s, sk.id) ? 'guide' : ''}`,
          style: {
            left: `${p.x}px`,
            top: `${p.y}px`,
            '--c': color,
            // 中心から飛び出してくる距離
            '--fx': `${center.x - p.x}px`,
            '--fy': `${center.y - p.y}px`,
            animationDelay: fresh.has(sk.id) ? `${fresh.get(sk.id) * (burst ? 70 : 110) + (burst ? 250 : 380)}ms` : null,
          },
          'data-id': sk.id,
          'aria-label': sk.name,
        },
        sk.stage && cls !== 'teaser' && !owns(s, sk.id) && s.stage < sk.stage ? h('span', { class: 'tnode-stage' }, `ST${sk.stage}`) : null,
        h('span', { class: 'tnode-panel' }, ...inner),
        lvl && cls !== 'teaser' ? h('span', { class: 'tnode-lv' }, cls === 'max' ? 'MAX' : lvl) : null,
        h('span', { class: 'tnode-name' }, hiddenGold ? '？？？' : sk.name));
        nodeLayer.append(btn);
      }
    }

    // null を除いて追加する（DOM の append は null を文字列にしてしまう）
    const add = (...xs) => sheet.append(...xs.flat().filter(Boolean));

    function renderSheet() {
      clear(sheet);
      if (panel === 'red') return renderRed();
      if (!selected) return renderIdle();
      const sk = SKILL_MAP[selected];
      if (!nodeVisible(s, sk.id)) {
        add(
          h('div', { class: 'sheet-top' },
            h('div', {}, h('div', { class: 'sheet-name' }, '？？？'), h('div', { class: 'sheet-meta' }, h('span', { class: 'route-tag', style: { '--c': ROUTE_MAP[sk.route].color } }, ROUTE_MAP[sk.route].name))),
            h('button', { class: 'sheet-x', 'aria-label': '閉じる', onclick: () => { selected = null; renderAll(); } }, '×'),
          ),
          h('p', { class: 'sheet-desc' }, `「${SKILL_MAP[sk.parent].name}」を解放すると、この先が見える。`),
          h('button', { class: 'tree-btn', onclick: () => select(sk.parent, true) }, `「${SKILL_MAP[sk.parent].name}」へ`),
        );
        return;
      }
      const st = nodeState(s, sk.id);
      const route = sk.route ? ROUTE_MAP[sk.route] : null;
      const hiddenGold = sk.kind === 'gold' && !owns(s, sk.id) && !(s.hints[sk.id] > 0);
      const cost = skillCost(s, sk.id);
      const blockers = nodeBlockers(s, sk.id);
      const afford = canAfford(s, cost);
      const off = isOffRoute(s, sk.id);
      let action;
      if (sk.kind === 'root' && owns(s, sk.id)) action = h('button', { class: 'tree-btn', disabled: true }, 'すべてはここから');
      else if (sk.kind === 'root') action = h('button', { class: 'tree-btn gold', disabled: st !== 'available', onclick: () => unlock(sk) }, st === 'available' ? '解放する（コスト0）' : 'まだ解放できない');
      else if (st === 'owned') action = h('button', { class: 'tree-btn', disabled: true }, sk.kind === 'repeat' ? '最大レベル' : '解放済み');
      else if (st === 'available') {
        const free = sk.kind === 'record';
        action = h('button', {
          class: `tree-btn gold ${free ? 'free' : ''}`,
          disabled: !afford,
          onclick: () => unlock(sk),
        }, free ? '条件達成！ 解放する' : sk.kind === 'repeat' && nodeLv(s, sk.id) > 0 ? '強化する' : '解放する', free ? null : h('span', { class: 'cost-row' }, ...costText(cost)));
      } else action = h('button', { class: 'tree-btn', disabled: true }, 'まだ解放できない');
      // 段階強化：いまの経験点で続けて上げられるだけ（MyCryptoWorkshop の「まとめて Lv+n」）
      const more = sk.kind === 'repeat' ? repeatAffordable(s, sk.id) : { n: 0 };
      const moreBtn = more.n >= 2 ? h('button', {
        class: 'tree-btn sub tb-bulk-lv',
        onclick: () => {
          const lvBefore = routeLevel(s, sk.route);
          let n = 0;
          while (n < more.n && learnSkill(s, sk.id)) n++;
          if (!n) return;
          playSe('unlock');
          toast(`「${sk.name}」を Lv${nodeLv(s, sk.id)} に！`, 'good');
          if (sk.route && routeLevel(s, sk.route) > lvBefore) toast(`${ROUTE_MAP[sk.route].name}の熟練度が Lv${routeLevel(s, sk.route)} に！`, 'good');
          renderAll(new Map([[sk.id, 0]]));
          onChange?.();
        },
      }, `まとめて Lv+${more.n}`, h('span', { class: 'cost-row' }, ...costText(more.cost))) : null;
      add(
        h('div', { class: 'sheet-top' },
          h('div', {},
            h('div', { class: 'sheet-name' }, hiddenGold ? '？？？' : sk.name),
            h('div', { class: 'sheet-meta' },
              route ? h('span', { class: 'route-tag', style: { '--c': route.color } }, route.name) : null,
              h('span', {}, KIND_LABEL[sk.kind] || ''),
              sk.monthly ? h('span', { class: 'warn-t' }, `月額 ${sk.monthly.toLocaleString()}円`) : null,
            ),
          ),
          h('div', { class: 'sheet-lv' }, sk.kind === 'repeat' ? `Lv ${nodeLv(s, sk.id)} / ${sk.max}` : levelText(s, sk)),
          h('button', { class: 'sheet-x', 'aria-label': '閉じる', onclick: () => { selected = null; renderAll(); } }, '×'),
        ),
        h('p', { class: 'sheet-desc' }, hiddenGold ? '偉人とのイベントで「コツ」を教わると、この奥義が現れる。' : sk.desc),
        sk.kind === 'record' ? h('div', { class: 'sheet-rec' }, h('span', {}, sk.record.label), h('b', {}, `${Math.floor(recordValue(s, sk.record.key)).toLocaleString()} / ${sk.record.target.toLocaleString()}`)) : null,
        sk.kind === 'capstone' ? h('p', { class: 'sheet-note' }, `このルートのノードを${CAPSTONE_NEED}個そろえると解放できる。ルートの到達点で、称号にもなる。`) : null,
        blockers.length && st !== 'owned' ? h('p', { class: 'sheet-block' }, blockers.join('／')) : null,
        st === 'available' && !afford ? h('p', { class: 'sheet-block' }, `経験点が足りない：${Object.entries(cost).filter(([k, v]) => (s.exp[k] || 0) < v).map(([k, v]) => `${EXP_NAME[k]} あと${v - (s.exp[k] || 0)}`).join('／')}`) : null,
        off && st === 'available' ? h('p', { class: 'sheet-note' }, '専門外：いま伸ばしている上位2ルート以外なので、コストが25%高い') : null,
        action,
        moreBtn,
      );
    }

    function renderIdle() {
      const counts = routeCounts(s);
      const claimable = claimableNodes(s);
      const nextRecord = TREE_NODES.filter((n) => n.kind === 'record' && !owns(s, n.id) && nodeVisible(s, n.id))
        .map((n) => ({ n, v: recordValue(s, n.record.key) / n.record.target }))
        .sort((a, b) => b.v - a.v)[0];
      const main = mainRoutes(s)[0];
      add(
        renderBulk(),
        claimable.length
          ? h('button', { class: 'sheet-go ok', onclick: () => select(claimable[0].id, true) }, `▶ 解放できます：${claimable[0].name}${claimable.length > 1 ? ` ほか${claimable.length - 1}` : ''}（タップで移動）`)
          : nextRecord
            ? h('button', { class: 'sheet-go', onclick: () => select(nextRecord.n.id, true) }, `もうすぐ：${nextRecord.n.name}（${Math.floor(nextRecord.v * 100)}%）`)
            : null,
        main
          ? h('div', { class: 'sheet-perks' },
            h('small', {}, `${ROUTE_MAP[main].name}の熟練度（${counts[main] || 0}個）`),
            ...routePerkText(main).map((p) => h('span', { class: routeLevel(s, main) >= p.lv ? 'on' : '' }, `${ROUTE_LEVELS[p.lv - 1]}個：${p.text}`)),
          )
          : h('p', { class: 'sheet-note' }, '伸ばした方向で「目指すルート」が決まる。3個・6個で熟練度ボーナス、5個そろえると到達点が開く。'),
        h('div', { class: 'sheet-btns' },
          h('button', { class: 'tree-btn sub', onclick: async () => { await openAbilities(s, onChange); renderAll(); } }, '基礎能力'),
          h('button', { class: 'tree-btn sub', onclick: () => { panel = 'red'; renderSheet(); } }, `不調${s.skills.some((id) => SKILL_MAP[id]?.kind === 'red') ? ' !' : ''}`),
          h('button', { class: 'tree-btn sub', onclick: () => centerOn('src_home', true) }, '中心へ'),
        ),
      );
    }

    // いま解放できるパネル（安い順）と「安い順にまとめて解放」。余った経験点を一度に使う
    function renderBulk() {
      const opts = loadBulk();
      const cands = bulkCandidates(s, opts);
      if (!claimableNodes(s).length) return null;
      const set = (patch) => {
        saveBulk({ ...opts, ...patch });
        renderSheet();
      };
      const bulk = () => {
        const before = new Set(TREE_NODES.filter((n) => shown(s, n.id)).map((n) => n.id));
        const lvBefore = Object.fromEntries(ROUTES.map((r) => [r.id, routeLevel(s, r.id)]));
        const ids = learnBulk(s, opts);
        if (!ids.length) return toast('まとめて解放できるパネルがない', 'bad');
        playSe('unlock');
        const names = [...new Set(ids)].map((id) => SKILL_MAP[id].name);
        toast(`${ids.length}個まとめて解放！ ${names.slice(0, 3).join('・')}${names.length > 3 ? ` ほか${names.length - 3}` : ''}`, 'good');
        for (const r of ROUTES) if (routeLevel(s, r.id) > lvBefore[r.id]) toast(`${r.name}の熟練度が Lv${routeLevel(s, r.id)} に！`, 'good');
        const fresh = new Map();
        let i = 0;
        for (const id of ids) if (!fresh.has(id)) fresh.set(id, i++);
        for (const n of TREE_NODES) if (shown(s, n.id) && !before.has(n.id) && !fresh.has(n.id)) fresh.set(n.id, i++);
        selected = null;
        renderAll(fresh);
        onChange?.();
      };
      return h('div', { class: 'tb-bulk' },
        h('div', { class: 'tb-bulk-h' }, `いま解放できるパネル（${cands.length}）`, h('small', {}, '安い順')),
        cands.length
          ? h('div', { class: 'tb-bulk-list' }, ...cands.slice(0, 8).map(({ node: n, cost }) => h('button', {
            class: 'tb-bulk-item',
            style: { '--c': n.route ? ROUTE_MAP[n.route].color : '#F5C542' },
            onclick: () => select(n.id, true),
          }, h('img', { src: n.icon, alt: '' }), h('span', { class: 'tb-bulk-nm' }, n.name, n.kind === 'repeat' ? h('small', {}, ` Lv${nodeLv(s, n.id) + 1}`) : null), h('span', { class: 'cost-row' }, ...costText(cost)))))
          : h('p', { class: 'sheet-note' }, '下の設定に合うパネルがない（使う経験点・ルートを広げると出てくる）'),
        h('div', { class: 'tb-bulk-opts' },
          h('small', {}, 'まとめて使う：'),
          ...EXP_TYPES.map((e) => h('label', { class: `tb-bulk-x x ${e.id}` },
            h('input', { type: 'checkbox', checked: !opts.skip.includes(e.id), onchange: (ev) => set({ skip: ev.target.checked ? opts.skip.filter((k) => k !== e.id) : [...opts.skip, e.id] }) }),
            h('span', { class: 'pn' }, e.name))),
          h('label', { class: 'tb-bulk-x' }, h('input', { type: 'checkbox', checked: opts.mainOnly, onchange: (ev) => set({ mainOnly: ev.target.checked }) }), h('span', {}, '目指すルート（上位2つ）だけ')),
        ),
        h('button', { class: 'tree-btn gold tb-bulk-go', disabled: !cands.length, onclick: bulk }, '安い順にまとめて解放'),
        h('p', { class: 'tb-bulk-note' }, '月額のかかるパネル・TOKU が動くパネル・魔道は入れない（1つずつ選んで解放する）'),
      );
    }

    // ---- パネルの詳細（マウスを乗せたとき・タップしたとき）----
    function tipBody(sk) {
      if (!nodeVisible(s, sk.id)) {
        const parent = SKILL_MAP[sk.parent];
        return [h('b', { class: 'tt-nm' }, '？？？'), h('p', { class: 'tt-ds' }, `「${parent.name}」を解放すると、この先が見える。`)];
      }
      const st = nodeState(s, sk.id);
      const route = sk.route ? ROUTE_MAP[sk.route] : null;
      const hiddenGold = sk.kind === 'gold' && !owns(s, sk.id) && !(s.hints[sk.id] > 0);
      const cost = skillCost(s, sk.id);
      const blockers = nodeBlockers(s, sk.id);
      let status;
      if (st === 'owned') status = h('p', { class: 'tt-st ok' }, sk.kind === 'repeat' ? '最大レベル' : '解放済み');
      else if (st === 'available' && canAfford(s, cost)) status = h('p', { class: 'tt-st ok' }, sk.kind === 'record' ? '条件達成！ 解放できる' : '解放できる（ダブルクリック・ダブルタップでそのまま解放）');
      else if (st === 'available') status = h('p', { class: 'tt-st ng' }, `経験点が足りない：${Object.entries(cost).filter(([k, v]) => (s.exp[k] || 0) < v).map(([k, v]) => `${EXP_NAME[k]} あと${v - (s.exp[k] || 0)}`).join('／')}`);
      else status = blockers.length ? h('p', { class: 'tt-st ng' }, blockers.slice(0, 2).join('／')) : null;
      return [
        h('div', { class: 'tt-top' },
          h('b', { class: 'tt-nm' }, hiddenGold ? '？？？' : sk.name),
          h('span', { class: 'tt-lv' }, sk.kind === 'repeat' ? `Lv ${nodeLv(s, sk.id)} / ${sk.max}` : levelText(s, sk) || '')),
        h('div', { class: 'tt-meta' },
          route ? h('span', { class: 'route-tag', style: { '--c': route.color } }, route.name) : null,
          h('span', {}, KIND_LABEL[sk.kind] || ''),
          sk.monthly ? h('span', { class: 'warn-t' }, `月額 ${sk.monthly.toLocaleString()}円`) : null),
        h('p', { class: 'tt-ds' }, hiddenGold ? '偉人とのイベントで「コツ」を教わると、この奥義が現れる。' : sk.desc),
        st !== 'owned' && Object.keys(cost).length ? h('div', { class: 'tt-cost' }, ...Object.entries(cost).map(([k, v]) => h('span', { class: `cost-chip x ${k} ${(s.exp[k] || 0) >= v ? 'ok' : 'ng'}` }, `${EXP_NAME[k]} ${v}`))) : null,
        st !== 'owned' && isOffRoute(s, sk.id) ? h('p', { class: 'tt-note' }, '専門外：コストが25%高い') : null,
        status,
      ].filter(Boolean);
    }
    let tipFor = null;
    let tipTimer = null;
    function showTip(id, { autoHide = false } = {}) {
      const el = nodeLayer.querySelector(`.tnode[data-id="${id}"]`);
      if (!el) return hideTip();
      tipFor = id;
      clear(tip).append(...tipBody(SKILL_MAP[id]));
      tip.hidden = false;
      const r = el.getBoundingClientRect();
      const vr = viewport.getBoundingClientRect();
      const w = tip.offsetWidth;
      const hgt = tip.offsetHeight;
      const left = Math.max(8, Math.min(vr.width - w - 8, r.left - vr.left + r.width / 2 - w / 2));
      // 上に入らなければ下に出す
      const above = r.top - vr.top - hgt - 10;
      tip.style.left = `${left}px`;
      tip.style.top = `${above >= 8 ? above : Math.min(vr.height - hgt - 8, r.bottom - vr.top + 10)}px`;
      clearTimeout(tipTimer);
      if (autoHide) tipTimer = setTimeout(hideTip, 5000);
    }
    function hideTip() {
      tipFor = null;
      tip.hidden = true;
      clearTimeout(tipTimer);
    }
    nodeLayer.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse' || drag?.moved > 6) return;
      const el = e.target.closest('.tnode');
      if (el && el.dataset.id !== tipFor) showTip(el.dataset.id);
    });
    nodeLayer.addEventListener('pointerout', (e) => {
      if (e.pointerType !== 'mouse') return;
      const el = e.target.closest('.tnode');
      if (el && !el.contains(e.relatedTarget)) hideTip();
    });

    function renderRed() {
      const reds = SKILLS.filter((x) => x.kind === 'red' && s.skills.includes(x.id));
      add(
        h('div', { class: 'sheet-top' }, h('div', { class: 'sheet-name' }, '不調'), h('button', { class: 'sheet-x', onclick: () => { panel = null; renderSheet(); } }, '×')),
        reds.length ? null : h('p', { class: 'sheet-note' }, 'いまは不調はない。無理をすると腱鞘炎・腰痛・寝不足などが付く。'),
        ...reds.map((x) => {
          const cost = skillCost(s, x.id);
          return h('div', { class: 'ab-row' },
            h('div', { class: 'ab-main' }, h('b', { class: 'neg' }, x.name), h('small', {}, x.desc)),
            h('div', { class: 'ab-btns' }, h('button', { class: 'tree-btn mini', disabled: !canAfford(s, cost), onclick: () => { if (learnSkill(s, x.id)) toast(`「${x.name}」を克服した！`, 'good'); changed(); } }, '治す'), h('small', { class: 'cost-row' }, ...costText(cost))),
          );
        }),
      );
    }

    // ---- 操作 ----
    function select(id, move = false) {
      selected = id;
      panel = null;
      renderNodes(new Map());
      renderExp();
      renderSheet();
      if (move) centerOn(id, true);
    }

    function unlock(sk) {
      const before = new Set(TREE_NODES.filter((n) => shown(s, n.id)).map((n) => n.id));
      const lvBefore = routeLevel(s, sk.route);
      if (!learnSkill(s, sk.id)) return;
      const burst = sk.kind === 'root';
      playSe('unlock'); // tooldev
      toast(`「${sk.name}」を解放！`, 'good');
      const fresh = new Map();
      let i = 0;
      // 中心から近い順に、枝が広がっていく
      const order = TREE_NODES.filter((n) => shown(s, n.id) && !before.has(n.id)).sort((a, b) => (a.depth || 0) - (b.depth || 0) || (ROUTE_MAP[a.route]?.angle ?? 0) - (ROUTE_MAP[b.route]?.angle ?? 0));
      for (const n of order) fresh.set(n.id, i++);
      fresh.set(sk.id, 0);
      if (sk.route && routeLevel(s, sk.route) > lvBefore) {
        toast(`${ROUTE_MAP[sk.route].name}の熟練度が Lv${routeLevel(s, sk.route)} に！`, 'good');
      }
      if (burst) {
        selected = null;
        shockwave();
        zoomToFit();
      }
      renderAll(fresh, burst);
      onChange?.();
    }

    // 中心から光の輪が広がる
    function shockwave() {
      const c = px(nodePos(SKILL_MAP.src_home));
      for (let k = 0; k < 3; k++) {
        const ring = h('div', { class: 'tree-shock', style: { left: `${c.x}px`, top: `${c.y}px`, animationDelay: `${k * 180}ms` } });
        world.append(ring);
        setTimeout(() => ring.remove(), 1600 + k * 180);
      }
    }

    // 新しく見えた枝がおさまるように少し引く
    function zoomToFit() {
      const rect = viewport.getBoundingClientRect();
      const r = RING_R * UNIT;
      const side = rect.width < 560 ? expSide.offsetWidth + 8 : 0;
      view.scale = Math.max(0.55, Math.min(view.scale, Math.min(rect.width - side, rect.height) / (2 * r)));
      centerOn('src_home', true);
    }

    function changed() {
      renderAll();
      onChange?.();
    }

    function renderAll(fresh = new Map(), burst = false) {
      renderHead();
      renderRouteBar();
      renderLinks(fresh, burst);
      renderNodes(fresh, burst);
      renderSheet();
    }

    // ---- パン・ズーム ----
    const pointers = new Map();
    let drag = null;
    let pinch = null;
    viewport.addEventListener('pointerdown', (e) => {
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      viewport.setPointerCapture(e.pointerId);
      if (pointers.size === 1) drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y, moved: 0, target: e.target.closest('.tnode'), type: e.pointerType };
      if (e.pointerType !== 'mouse') hideTip();
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), scale: view.scale, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, vx: view.x, vy: view.y };
        drag = null;
      }
    });
    viewport.addEventListener('pointermove', (e) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pinch && pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const next = Math.min(1.6, Math.max(0.4, (pinch.scale * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.d));
        zoomAt(next, pinch.cx, pinch.cy, pinch);
      } else if (drag) {
        view.x = drag.vx + e.clientX - drag.x;
        view.y = drag.vy + e.clientY - drag.y;
        drag.moved = Math.max(drag.moved, Math.hypot(e.clientX - drag.x, e.clientY - drag.y));
        if (drag.moved > 6) hideTip();
        applyView();
      }
    });
    // パネルのダブルタップ（ダブルクリック）で、そのまま解放する
    let lastTap = { id: null, at: 0 };
    const tapNode = (id) => {
      const now = performance.now();
      const dbl = lastTap.id === id && now - lastTap.at < 400;
      lastTap = dbl ? { id: null, at: 0 } : { id, at: now };
      if (!dbl) return select(id);
      const sk = SKILL_MAP[id];
      if (!nodeVisible(s, id) || owns(s, id) && sk.kind !== 'repeat') return select(id);
      if (nodeState(s, id) !== 'available') return toast('まだ解放できない', 'bad');
      if (!canAfford(s, skillCost(s, id))) return toast('経験点が足りない', 'bad');
      selected = id;
      unlock(sk);
    };
    const up = (e) => {
      if (drag && drag.moved < 6 && drag.target) {
        const id = drag.target.dataset.id;
        const touch = drag.type !== 'mouse';
        tapNode(id);
        // 指で触る端末では、タップしたパネルの詳細をその場に出す（マウスは乗せたときに出ている）
        if (touch && root.isConnected) requestAnimationFrame(() => showTip(id, { autoHide: true }));
      }
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (!pointers.size) drag = null;
    };
    viewport.addEventListener('pointerup', up);
    viewport.addEventListener('pointercancel', up);
    viewport.addEventListener('wheel', (e) => {
      e.preventDefault();
      const next = Math.min(1.6, Math.max(0.4, view.scale * (e.deltaY < 0 ? 1.1 : 0.9)));
      hideTip();
      zoomAt(next, e.clientX, e.clientY);
    }, { passive: false });

    function zoomAt(next, cx, cy, from) {
      const rect = viewport.getBoundingClientRect();
      const ox = cx - rect.left;
      const oy = cy - rect.top;
      const base = from || { vx: view.x, vy: view.y, scale: view.scale };
      const wx = (ox - base.vx) / base.scale;
      const wy = (oy - base.vy) / base.scale;
      view.scale = next;
      view.x = ox - wx * next;
      view.y = oy - wy * next;
      applyView();
    }

    renderAll();
    // チュートリアルの誘導：目標のパネルを選んだ状態で開く
    const guide = focus && !owns(s, focus) && nodeVisible(s, focus) ? focus : null;
    if (guide) requestAnimationFrame(() => select(guide, true));
    else requestAnimationFrame(() => centerOn('src_home'));
  });
}
