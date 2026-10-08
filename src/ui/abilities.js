// 基礎能力の画面（全画面）。トップ画面の「能力強化」とスキルツリーの「基礎能力」から開く。
// 上に経験点を常に出し、5つの基礎能力を上げる。経験点の振り替えも、スクロールせずに開けるよう上にボタンを置く
// 下には「戻る」と「自動で割り振る」（低い能力から、いまの経験点で上げられるだけ上げる）を並べる
import { ABILITIES, ABILITY_MAX, abilityCost, autoRaise, canAfford, CONVERT_RATE, convertExp, EXP_NAME, EXP_TYPES, raiseAbility, rankOf } from '../engine/abilities.js';
import { abilityEffects } from '../engine/abilityfx.js';
import { playSe } from './audio.js';
import { $, clear, h } from './dom.js';

const costText = (cost) => Object.entries(cost).map(([k, v]) => h('span', { class: `cost-chip x ${k}` }, `${EXP_NAME[k]} ${v}`));

export function openAbilities(s, onChange) {
  return new Promise((resolve) => {
    const conv = { from: null, to: null, open: false }; // 経験点の振り替え
    const root = h('div', { class: 'tree-screen ab-screen', role: 'dialog', 'aria-label': '基礎能力' });
    const head = h('header', { class: 'ab-head' });
    const body = h('div', { class: 'ab-body' });
    const foot = h('footer', { class: 'ab-foot' });
    root.append(head, body, foot);
    $('#modal-root').append(root);

    const close = () => {
      root.remove();
      window.removeEventListener('keydown', onKey, true);
      resolve();
    };
    // スキルツリーの上に開いたときも、Esc で閉じるのはこの画面だけ
    const onKey = (e) => {
      if (e.key !== 'Escape') return;
      e.stopPropagation();
      close();
    };
    window.addEventListener('keydown', onKey, true);

    const changed = () => {
      render();
      onChange?.();
    };

    function render() {
      clear(head).append(
        h('div', { class: 'ab-title' },
          h('div', { class: 'tree-title' }, h('b', {}, '基礎能力'), h('small', {}, 'ABILITIES')),
          h('button', { class: `ab-cv-toggle ${conv.open ? 'on' : ''}`, onclick: () => { conv.open = !conv.open; render(); } }, '⇄ 経験点の振り替え'),
        ),
        // 経験点は常に見えるように、上に固定
        h('div', { class: 'ab-exp' }, ...EXP_TYPES.map((e) => h('span', { class: `x ${e.id}` }, h('i', {}, e.name), h('b', {}, Math.floor(s.exp[e.id]).toLocaleString())))),
      );
      if (conv.open) head.append(convertBox());
      const canAny = ABILITIES.some((a) => s.abilities[a.id] < ABILITY_MAX && canAfford(s, abilityCost(a.id, s.abilities[a.id])));
      clear(foot).append(
        h('button', { class: 'ab-foot-btn back', onclick: close }, '戻る'),
        h('button', { class: 'ab-foot-btn auto', disabled: !canAny, onclick: autoAll }, '自動で割り振る'),
      );
      clear(body).append(
        h('p', { class: 'ab-lead' }, '行動で貯めた経験点を使って、基礎能力を上げる。能力が上がると、仕入れ・出品・交渉などの結果がよくなる。ランクは G〜S。'),
        ...ABILITIES.map(row),
      );
    }

    function row(a) {
      const lv = s.abilities[a.id];
      const cost = abilityCost(a.id, lv);
      const ok = lv < ABILITY_MAX && canAfford(s, cost);
      // いまの効果と、+5 したときの効果を並べる
      const now = abilityEffects(s, a.id, lv);
      const next = abilityEffects(s, a.id, Math.min(ABILITY_MAX, lv + 5));
      const raise = (n) => {
        const before = rankOf(s.abilities[a.id]);
        if (!raiseAbility(s, a.id, n)) return;
        playSe('levelup');
        const after = rankOf(s.abilities[a.id]);
        if (after !== before) rankUp(a.name, after);
        changed();
      };
      return h('section', { class: `ab-card ${ok ? 'can' : ''}` },
        h('div', { class: 'ab-card-top' },
          h('span', { class: `rank r${rankOf(lv)}` }, rankOf(lv)),
          h('div', { class: 'ab-main' },
            h('b', {}, a.name, h('span', { class: 'ab-lv' }, `${lv}`), h('small', {}, ` / ${ABILITY_MAX}`)),
            h('div', { class: 'bar' }, h('i', { style: { width: `${lv}%` } })),
            h('small', {}, a.desc),
          ),
        ),
        h('div', { class: 'ab-fx' }, ...now.map((e, i) => h('span', {}, `${e.label} `, h('b', {}, e.value), lv < ABILITY_MAX && next[i].value !== e.value ? h('em', {}, ` → ${next[i].value}`) : null))),
        lv >= ABILITY_MAX
          ? h('p', { class: 'ab-max' }, '最大まで上げた')
          : h('div', { class: 'ab-raise' },
            h('div', { class: 'cost-row' }, h('small', {}, '+1 に必要'), ...costText(cost)),
            h('div', { class: 'ab-btns' },
              h('button', { class: 'tree-btn mini gold', disabled: !ok, onclick: () => raise(1) }, '+1'),
              h('button', { class: 'tree-btn mini gold', disabled: !ok, onclick: () => raise(5) }, '+5'),
            ),
          ),
      );
    }

    // 低い能力から、いまの経験点で上げられるだけ上げる。上がった分を下に短く出す
    function autoAll() {
      const before = Object.fromEntries(ABILITIES.map((a) => [a.id, rankOf(s.abilities[a.id])]));
      const done = autoRaise(s);
      const ups = ABILITIES.filter((a) => done[a.id]);
      if (!ups.length) return;
      playSe('levelup');
      changed();
      const ranked = ups.find((a) => rankOf(s.abilities[a.id]) !== before[a.id]);
      if (ranked) rankUp(ranked.name, rankOf(s.abilities[ranked.id]));
      const note = h('div', { class: 'ab-auto-note' }, ups.map((a) => `${a.name} +${done[a.id]}`).join('・'));
      root.append(note);
      setTimeout(() => note.remove(), 2200);
    }

    // 経験点の振り替え（×0.5）。多い種類から少ない種類へ
    function convertBox() {
      const most = [...EXP_TYPES].sort((a, b) => s.exp[b.id] - s.exp[a.id]);
      if (!EXP_TYPES.some((e) => e.id === conv.from)) conv.from = most[0].id;
      if (!EXP_TYPES.some((e) => e.id === conv.to) || conv.to === conv.from) conv.to = most[most.length - 1].id;
      const seg = (key) => h('div', { class: 'seg cv-seg' }, ...EXP_TYPES.map((e) => h('button', { class: `btn small ${conv[key] === e.id ? 'on' : ''}`, disabled: key === 'to' && e.id === conv.from, onclick: () => { conv[key] = e.id; render(); } }, `${e.name} ${Math.floor(s.exp[e.id])}`)));
      const go = (amount) => {
        const got = convertExp(s, conv.from, conv.to, amount);
        if (!got) return;
        playSe('coin');
        changed();
      };
      const have = Math.floor(s.exp[conv.from]);
      return h('div', { class: 'convert ab-convert' },
        h('small', { class: 'note' }, `余った経験点を、別の種類に半分の値（×${CONVERT_RATE}）で移せる`),
        h('small', {}, 'この経験点から'), seg('from'),
        h('small', {}, 'この経験点へ'), seg('to'),
        h('div', { class: 'cv-btns' },
          ...[100, 500].map((n) => h('button', { class: 'tree-btn mini', disabled: have < n, onclick: () => go(n) }, `${n} → ${Math.floor(n * CONVERT_RATE)}`)),
          h('button', { class: 'tree-btn mini', disabled: have < 2, onclick: () => go(have) }, `全部 ${have} → ${Math.floor(have * CONVERT_RATE)}`),
        ),
      );
    }

    // ランクが上がったとき、画面いっぱいにランクの文字を出す
    function rankUp(name, rank) {
      const el = h('div', { class: 'rank-up' }, h('small', {}, `${name} RANK UP`), h('b', { class: `r${rank}` }, rank));
      root.append(el);
      playSe('stageup');
      setTimeout(() => el.remove(), 1500);
    }

    render();
  });
}
