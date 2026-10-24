// 取引トラブル・値下げ交渉の演出（テンポ優先の控えめなもの）。
// 上に「クリス VS 相手」と、交渉成功率の円ゲージ（横に％）を出す。ゲージの初期値は能力・スキルで底上げされた分。
// 選んだ対応は「スキル」としてクリスの頭上に名前を出し、そのときゲージが最終的な成功率まで貯まる。
// 成功率は 25/50/75% を境に 赤→オレンジ→黄→緑。初期値が 100%（対策スキルで勝ちが決まっている）なら、貯める演出は省く
import { CAST } from '../data/cast.js';
import { playSe } from './audio.js';
import { $, h } from './dom.js';

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
const wait = (ms) => new Promise((r) => setTimeout(r, reduced() ? 0 : ms));
const SVGNS = 'http://www.w3.org/2000/svg';
let cur = null; // { el, ring, num, value, resolved }

export const inBattle = () => !!cur;

// 成功率（0〜1）の色の段階
export const tierOf = (p) => (p >= 0.75 ? 'g' : p >= 0.5 ? 'y' : p >= 0.25 ? 'o' : 'r');

function svg(tag, attrs) {
  const el = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

// 円ゲージ（円周を100とした SVG の円）
function ringGauge() {
  const box = svg('svg', { class: 'bt-ring', viewBox: '0 0 36 36', 'aria-hidden': 'true' });
  box.append(svg('circle', { class: 'bt-ring-bg', cx: 18, cy: 18, r: 15.915, pathLength: 100 }));
  const fill = svg('circle', { class: 'bt-ring-fill', cx: 18, cy: 18, r: 15.915, pathLength: 100, 'stroke-dasharray': '0 100', transform: 'rotate(-90 18 18)' });
  box.append(fill);
  return { box, fill };
}

function paint(p) {
  if (!cur) return;
  const pct = Math.round(p * 100);
  cur.value = p;
  cur.fill.setAttribute('stroke-dasharray', `${pct} 100`);
  cur.num.textContent = `${pct}%`;
  cur.el.dataset.tier = tierOf(p);
}

// ゲージを from → to へ貯める
async function fillTo(to, ms = 650) {
  if (!cur) return;
  const from = cur.value;
  if (reduced() || to <= from) return paint(to);
  const t0 = performance.now();
  await new Promise((done) => {
    const step = (now) => {
      if (!cur) return done();
      const k = Math.min(1, (now - t0) / ms);
      paint(from + (to - from) * (1 - (1 - k) ** 3));
      if (k < 1) requestAnimationFrame(step);
      else done();
    };
    requestAnimationFrame(step);
  });
}

// 始まり：カットインは出さず、上のバーを出す（効果音は会話の側で鳴る）。start：ゲージの初期値（0〜1）
export async function battleStart(enemy, title, start = 0) {
  battleEnd();
  const c = CAST[enemy] || {};
  const { box, fill } = ringGauge();
  const num = h('b', { class: 'bt-pct' }, '0%');
  const el = h('div', { class: 'bt' },
    h('div', { class: 'bt-hud' },
      h('div', { class: 'bt-names' },
        h('span', { class: 'bt-me' }, 'クリス'),
        h('b', {}, 'VS'),
        h('span', { class: 'bt-foe' }, title ? `${c.name || '相手'}（${title}）` : c.name || '相手'),
      ),
      h('div', { class: 'bt-rate' }, box, h('div', {}, h('small', {}, '交渉成功率'), num)),
    ));
  $('#stage').append(el);
  cur = { el, fill, num, value: 0, resolved: false };
  if (start >= 1) {
    // 勝ちが決まっている：貯める演出なしで満タン
    paint(1);
    el.classList.add('sure');
    el.querySelector('.bt-rate small').textContent = '交渉成功率（確定）';
    return;
  }
  paint(0);
  await wait(150);
  await fillTo(start, 450);
}

// 選んだ対応を「スキル」として発動：クリスの頭上にスキル名 → 成功率のゲージが最終値まで貯まる。
// 交渉判定のない対応（返金に応じる・無視など）は、ゲージを止める
export async function battleSkill(option) {
  if (!cur) return;
  const label = typeof option === 'string' ? option : option.label;
  const p = typeof option === 'object' && typeof option.chance === 'number' ? option.chance : null;
  const stage = $('#stage').getBoundingClientRect();
  const chris = $('#sprite-left');
  const r = chris && !chris.hidden ? chris.getBoundingClientRect() : null;
  const tag = h('div', { class: 'bt-skill' }, h('small', {}, 'スキル'), h('b', {}, label));
  if (r) {
    tag.style.left = `${r.left - stage.left + r.width / 2}px`;
    tag.style.top = `${Math.max(90, r.top - stage.top + 8)}px`;
  }
  cur.el.append(tag);
  playSe('trouble'); // crash.mp3
  if (p === null) {
    cur.el.classList.add('off');
    await wait(700);
  } else {
    await wait(200);
    await fillTo(p);
    cur.el.classList.add('fixed'); // 最終的な成功率が決まった
    await wait(350);
  }
  tag.remove();
}

// 結果：good なら交渉成立、bad なら決裂。上のバーに小さく出すだけ（ジングルは鳴らさない）
export async function battleResult(tone) {
  if (!cur || cur.resolved || !['good', 'bad'].includes(tone)) return;
  cur.resolved = true;
  const win = tone === 'good';
  cur.el.querySelector('.bt-names').append(h('em', { class: `bt-res ${win ? 'win' : 'lose'}` }, win ? '交渉成立' : '交渉決裂'));
  await wait(400);
}

export function battleEnd() {
  cur?.el.remove();
  cur = null;
}
