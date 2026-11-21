// 基礎能力ごとの効果を、いまの値と上げたあとの値で並べて見せる（画面表示用）
import { estimateError } from './market.js';
import { seenChecks } from './listing.js';
import { listingCap } from './inventory.js';
import { lotteryEntries, queueSuccessRate } from './offers.js';

const pct = (v) => `${Math.round(v * 100)}%`;
const at = (s, id, lv) => ({ ...s, abilities: { ...s.abilities, [id]: lv } });

// 能力 id の値が lv のときの効果。[{ label, value }]
export function abilityEffects(s, id, lv) {
  const t = at(s, id, lv);
  switch (id) {
    case 'eye':
      return [
        { label: '推定相場の誤差', value: `±${pct(estimateError(t))}` },
        { label: '見られる細部', value: `${seenChecks(t)}か所` },
        { label: '細部の見誤り', value: pct(1 - Math.min(0.97, 0.7 + lv / 250)) },
      ];
    case 'buy':
      return [
        { label: '店舗の仕入れ候補', value: `${4 + Math.floor(lv / 25)}件` },
        { label: '電脳の仕入れ候補', value: `${4 + Math.floor(lv / 35)}件` },
        { label: '行列の成功率', value: pct(queueSuccessRate(t)) },
        { label: '抽選の口数', value: `${lotteryEntries(t)}口` },
      ];
    case 'list':
      return [
        { label: '出品枠', value: `${listingCap(t)}件` },
        { label: '高めでも売れる幅', value: `+${(6 + lv / 10).toFixed(1)}%` },
      ];
    case 'talk':
      return [
        { label: '取引トラブル', value: pct(0.07 * (1 - lv / 250)) },
        { label: '交渉・対応の判定', value: `+${Math.round(lv / 2)}%` },
        { label: '問屋の候補', value: `${3 + Math.floor(lv / 30)}件` },
      ];
    case 'pack':
      return [
        { label: '発送の体力', value: `-${Math.round(lv / 2)}%` },
        { label: '配送の破損', value: pct(0.03 * (1 - lv / 120)) },
      ];
    default:
      return [];
  }
}
