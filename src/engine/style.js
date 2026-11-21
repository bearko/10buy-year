// キャリアの型（2周目以降に選べる）。
// 商材特化：得意ジャンルの目利き・仕入れ・売れ行きが突出し、専門外には弱い
import { catOf } from './listing.js';

export const SPECIALTIES = { sneaker: 'スニーカー', tcg: 'トレカ', watch: '時計', figure: 'フィギュア' };

export const STYLES = {
  normal: { name: 'ふつう', desc: '得意も苦手もない、まっさらな転売屋' },
  spec: { name: '商材特化', desc: '1つのジャンルの専門家。相場の見立てと真贋が鋭く、専門の仕入れ先から品が回ってくる。専門外は見立てがぶれる' },
  org: { name: '組織型', desc: '最初から人を使って規模を取る。並び屋の成功率+30%、仕入れ候補+2、仕入れの体力-30%。そのかわり毎月の人件費（1.5万円×ステージ）、炎上しやすさ1.5倍、毎月6%で複数アカウントの規約違反が見つかり2週間の出品停止' },
};
export const isOrg = (s) => s.style?.type === 'org';
export const ORG_WAGE = 15000;

export const styleOf = (s) => s.style?.type || 'normal';
export const specCat = (s) => (s.style?.type === 'spec' ? s.style.cat : null);
export const isSpec = (s, pid) => !!specCat(s) && catOf(pid) === specCat(s);

// 相場の見立てのぶれ：専門は0.4倍、専門外は1.15倍
export const specErr = (s, pid) => (!specCat(s) ? 1 : isSpec(s, pid) ? 0.4 : 1.15);
// 買い手：専門の品は、指名で買いに来るファンがつく
export const specBuyers = (s, pid) => (isSpec(s, pid) ? 1.25 : 1);
// 真贋：専門の品は細部を2か所多く見られる
export const specChecks = (s, pid) => (isSpec(s, pid) ? 2 : 0);

export function styleLabel(s) {
  const t = styleOf(s);
  return t === 'spec' ? `${SPECIALTIES[specCat(s)]}専門` : STYLES[t]?.name || 'ふつう';
}
