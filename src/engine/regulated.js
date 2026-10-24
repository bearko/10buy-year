// 売ってはいけない・売り方に注意がいる商品（薬機法など）。
// med・device：個人は許可なく売れない（出品も買取もできない。仕入れてしまうと在庫が死ぬ）
// claim：売るのはよいが、説明文で効能をうたうと違反。うたえば売れやすいが、出品の削除と警告のおそれ
import { productOf } from '../data/products.js';
import { chance } from './rng.js';
import { addHate, addRating } from './effects.js';

export const REGS = {
  med: { name: '医薬品', law: '薬機法', rule: '医薬品の販売には「医薬品販売業」の許可が必要。個人はフリマにもオークションにも出品できない', canSell: false },
  device: { name: '高度管理医療機器', law: '薬機法', rule: 'カラーコンタクトは「高度管理医療機器」。販売には都道府県知事の許可が必要で、個人は出品できない', canSell: false },
  claim: { name: '効能をうたえない商品', law: '薬機法', rule: '化粧品・サプリは出品できるが、「シミが消える」「やせる」など効能をうたうと違反（誇大広告）', canSell: true },
};
export const CLAIM_BUYERS = 1.3; // 効能をうたうと買い手が増える
export const TAKEDOWN_RATE = 0.2; // 効能をうたった出品が、1週間で運営に見つかる確率

export const regOf = (pid) => REGS[productOf(pid).reg] || null;
export const unsellable = (pid) => regOf(pid)?.canSell === false;
export const claimable = (pid) => productOf(pid).reg === 'claim';

// 商品情報の「注意」の行
export const regNote = (pid) => (regOf(pid) ? `${regOf(pid).law}：${regOf(pid).rule}` : null);

// 週末：効能をうたった出品が見つかって削除される。警告が2回で出品停止
export function claimTakedowns(s) {
  const out = [];
  for (const u of s.inventory) {
    if (!u.listing?.claim || !chance(s, TAKEDOWN_RATE)) continue;
    u.listing = null;
    out.push({ uid: u.uid, pid: u.pid });
  }
  if (out.length) {
    s.warnings = (s.warnings || 0) + 1;
    addRating(s, -4);
    addHate(s, 2, false);
    if (s.warnings >= 2) s.banWeeks = Math.max(s.banWeeks || 0, 2);
    s.stats.takedowns = (s.stats.takedowns || 0) + out.length;
  }
  return out;
}
