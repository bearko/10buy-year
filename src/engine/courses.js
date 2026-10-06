// 資格講座（図書館で勉強の上位）。受講料を払って何回か通うと資格が取れる。
// 行動・精神の経験点が多めに入るので、問屋取引などで偏りがちな経験点を補える
import { addExpense } from './kpi.js';
import { yen } from './effects.js';
import { choice, info, narr, sfx, talk } from './steps.js';

const GENRES = [
  ['watch', '時計'], ['jewel', 'ジュエリー'], ['instrument', '楽器'], ['sneaker', 'スニーカー'], ['tcg', 'トレカ'], ['figure', 'フィギュア'],
];

export const COURSES = [
  { id: 'liquor', name: '酒類販売業免許', desc: '通信販売酒類小売業免許。お酒（サケ・ネクタール）を継続して出品できる', fee: 30000, sessions: 4, stage: 2 },
  { id: 'boki', name: '簿記3級', desc: '経営画面の指標が1段増え、税額-3%', fee: 10000, sessions: 3, stage: 2 },
  ...GENRES.map(([cat, name]) => ({ id: `appraise_${cat}`, cat, name: `${name}の目利き講座`, desc: `${name}の推定相場の誤差-20%、偽物の細部チェック+1か所`, fee: 20000, sessions: 3, stage: 2 })),
];
// ステージ3以降の新ジャンル。知識がないと仕入れ候補に出てこない
export const KNOW_GENRES = [['art', 'アート・美術品'], ['game', 'レトロゲーム・PC'], ['antique', 'アンティーク'], ['fashion', 'ブランド小物']];
COURSES.push(
  ...KNOW_GENRES.map(([g, name]) => ({ id: `know_${g}`, know: g, name: `${name}の基礎講座`, desc: `${name}のジャンルを仕入れられるようになる`, fee: 40000, sessions: 3, stage: 3 })),
  { id: 'export', name: '輸出入の基礎', desc: '海外の販路「海外EC」が使える。円安の週は高く売れる', fee: 50000, sessions: 4, stage: 3 },
  // 輸出規制（いたちごっこ）が予告されたら出てくる
  { id: 'trade_practice', name: '貿易実務', desc: '輸出規制のあとも、海外ECで限定品を売れる', fee: 60000, sessions: 4, stage: 3, cond: (s) => (s.regimes || []).some((r) => r.id === 'export_rule') },
  { id: 'store_mgmt', name: '店舗経営講座', desc: '自分の店を開ける（外出「店を開く」）', fee: 100000, sessions: 5, stage: 4 },
);
export const knowsGenre = (s, p) => !p.know || (s.stage >= (p.stage || 3) && !!s.certs?.includes(`know_${p.know}`));
// まだ知らない新ジャンルがあるか（仕入れ画面に「未知のジャンル」を出す）
export const unknownGenres = (s) => (s.stage >= 3 ? KNOW_GENRES.filter(([g]) => !s.certs?.includes(`know_${g}`)) : []);

export const COURSE_MAP = Object.fromEntries(COURSES.map((c) => [c.id, c]));

export const hasCert = (s, id) => !!s.certs?.includes(id);
export const hasGenreCert = (s, cat) => hasCert(s, `appraise_${cat}`);
export const openCourses = (s) => COURSES.filter((c) => !hasCert(s, c.id) && s.stage >= c.stage && (!c.cond || c.cond(s)));
export const courseAvailable = (s) => s.stage >= 2 && (!!s.course || openCourses(s).length > 0);

function finish(s, c) {
  (s.certs ||= []).push(c.id);
  s.course = null;
  const lines = [sfx('clear'), info('資格を取った', [c.name, c.desc], 'good')];
  if (c.id === 'liquor') {
    delete s.flags.noAlcohol;
    lines.push(talk('mine', '免許の番号を出品ページに書いておくのよ。これで堂々とお酒を扱えるわ。', 'wink'));
  }
  return lines;
}

function session(s) {
  const c = COURSE_MAP[s.course.id];
  s.course.done++;
  const lines = [narr(`「${c.name}」の講座に通った。（${s.course.done}/${c.sessions}回目）`)];
  if (s.course.done >= c.sessions) lines.push(...finish(s, c));
  return lines;
}

// 行動「資格講座に通う」
export function attendCourse(s) {
  if (s.course) return session(s);
  const list = openCourses(s);
  return [
    talk('chris', 'どの講座に通おうかな…。', 'arms'),
    choice(list.map((c) => ({
      label: `${c.name}（${yen(c.fee)}・${c.sessions}回）`,
      sub: c.desc,
      run: () => {
        if (s.cash < c.fee) return [talk('chris', `受講料が足りない…（${yen(c.fee)}必要）`, 'sad')];
        addExpense(s, c.fee, `受講料：${c.name}`);
        s.course = { id: c.id, done: 0 };
        return session(s);
      },
    }))),
  ];
}
