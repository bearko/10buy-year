// SNSのタイムライン。毎週、世の中の空気をいくつか投稿にする。
// 品薄の限定品があると「転売ヤー許さん」と「近くに売ってなくて助かった」が並び、炎上度が高いとクリスが名指しされる
import { PRODUCTS } from '../data/products.js';
import { isReleased } from './market.js';
import { RIVALS } from './rivals.js';
import { chance, pick } from './rng.js';

const ANGRY = ['@teika_de_kaitai', '@genkai_otaku', '@kodomo_no_tame', '@shinkansen_mama'];
const THANKS = ['@inaka_gurashi', '@yakin_ake', '@tantou_kaigai', '@ikuji_isogashii'];
const PEOPLE = ['@puchipuchi_love', '@sedori_nikki', '@koukou_sei_k', '@okane_benkyou', '@hobby_mama'];

// 品薄の限定品（相場が定価を大きく上回っている品）
function hotItems(s) {
  return PRODUCTS.filter((p) => ['hype', 'boom'].includes(p.kind) && isReleased(s, p) && s.market[p.id] && s.market[p.id].p >= 1.4);
}

export function snsWeek(s) {
  const out = [];
  const post = (who, text, kind) => out.push({ who, text, kind, week: s.week });
  // 同じ品の話題が続かないように、最近投稿していない品を選ぶ
  const recent = new Set((s.sns || []).slice(0, 6).map((x) => x.pid).filter(Boolean));
  const hot = hotItems(s).filter((p) => !recent.has(p.id));
  if (hot.length && chance(s, 0.55)) {
    const p = pick(s, hot);
    const wanted = p.alcohol ? `「${p.name}」、酒屋を何軒回っても買えなかった` : pick(s, [`子どもが欲しがってた「${p.name}」、どこにもない`, `「${p.name}」、朝から並んだのに買えなかった`]);
    out.push({ who: pick(s, ANGRY), text: pick(s, [`${wanted}。フリマには倍の値段で山ほど出てる。転売ヤー許さん`, `${wanted}。転売ヤーのせいで定価で買えないの本当につらい`, `${wanted}。メーカーは本気で転売対策してほしい`]), kind: 'angry', week: s.week, pid: p.id });
    out.push({ who: pick(s, THANKS), text: pick(s, [`近くに売ってる店がないから、「${p.name}」をプンシーで買えて助かった。少し高いけど交通費よりは安い`, `平日は仕事で並べないので、「${p.name}」を出品してくれる人がいてありがたい…`, `地方だと「${p.name}」なんて入荷すらしない。ネットで買えるだけマシ`]), kind: 'thanks', week: s.week, pid: p.id });
  }
  const news = (s.news || []).find((n) => n.pid && ['up', 'event'].includes(n.kind));
  if (news) {
    const p = PRODUCTS.find((x) => x.id === news.pid);
    if (p) post(pick(s, PEOPLE), pick(s, [`「${p.name}」、急に話題になってない？`, `TLが「${p.name}」の話ばっかり`, `「${p.name}」ってそんなにいいの？ 気になってきた`]), 'trend');
  }
  // 炎上度が高いと名指しされる
  if (s.hate >= 40 && chance(s, Math.min(0.9, s.hate / 80))) {
    post(pick(s, ANGRY), pick(s, ['「クリス」って出品者、限定品ばっかり定価の倍で出してる。通報した', '例の転売屋クリス、また行列の先頭にいたらしい', 'クリスって人の出品、評価は高いけど値段がえぐい']), 'angry');
  }
  // ライバル転売屋の自慢
  const rivals = RIVALS.filter((r) => s.rivals?.[r.id]);
  if (rivals.length && chance(s, 0.5)) {
    const r = pick(s, rivals);
    post(`@${r.id}_ghost`, pick(s, ['今月も利益が過去最高。仕組み化こそ正義', '店の棚、今日も全部いただきました', '情報商材、残り3席です（リンクはプロフ）', '素人が増えて相場が荒れてる。早めに撤退した者勝ち']), 'rival');
  }
  // なにもない週の、ふつうのつぶやき
  if (out.length < 2) {
    post(pick(s, PEOPLE), pick(s, ['フリマで値下げ交渉したら、即ブロックされた', '押し入れから昔のフィギュア出てきた。売れるかな', '梱包材ってどこで買うのが安いの？', '今月のポイント還元、地味にうれしい', 'プチプチを潰すのがやめられない']), 'plain');
  }
  s.sns = [...out, ...(s.sns || [])].slice(0, 40);
  return out;
}
