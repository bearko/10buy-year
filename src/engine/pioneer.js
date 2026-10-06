// 仕入れルートの開拓：同じ仕入れルートを回り続けると、新しい仕入れ先が見つかる。
// 開拓した仕入れ先には、そこでしか出会えないシリーズ（商品）が並ぶ。
import { productOf } from '../data/products.js';
import { info, sfx, talk } from './steps.js';

export const PIONEER_ROUTES = { store: '店舗せどり', online: '電脳せどり', auction: '業者オークション', wholesale: '問屋' };

// at：そのルートを何回回ったら見つかるか。ratio：相場に対する仕入れ値。qty：一度に買える数
export const SPOTS = [
  { id: 'toy_shop', route: 'store', at: 8, name: '温泉街のおもちゃ屋', color: '#c2410c', pid: 'kokeshi', ratio: [0.6, 0.77], qty: [2, 5], line: '店舗を回っているうちに、温泉街の古いおもちゃ屋を見つけた。店の奥にこけしがずらり…！' },
  { id: 'craft_street', route: 'store', at: 20, name: '問屋街の工房', color: '#a16207', pid: 'gamaguchi', ratio: [0.65, 0.8], qty: [3, 8], line: '問屋街の裏通りで、がま口を手作りしている工房と知り合った。「まとめてなら安くするよ」' },
  { id: 'flea_market', route: 'store', at: 40, name: '神社の骨董市', color: '#7c2d12', pid: 'ichimatsu', ratio: [0.55, 0.74], qty: [1, 1], line: '毎月第一日曜の骨董市。顔なじみの露店主が「いい人形が入ったよ」と声をかけてきた。', stage: 2 },
  { id: 'old_shop', route: 'store', at: 70, name: '老舗の閉店セール', color: '#57534e', pid: 'bangasa', ratio: [0.5, 0.67], qty: [2, 4], line: '通い続けた商店街の老舗が店を閉めるらしい。店主が「あんたになら」と在庫を見せてくれた。', stage: 2 },
  { id: 'zakka_site', route: 'online', at: 8, name: '海外の雑貨サイト', color: '#db2777', pid: 'cosme_mirror', ratio: [0.65, 0.82], qty: [3, 8], line: 'ネットを巡回していたら、日本未上陸のコスメ雑貨を扱う海外サイトを見つけた。' },
  { id: 'cosme_official', route: 'online', at: 20, name: '限定コスメの会員ストア', color: '#be185d', pid: 'actress_mirror', ratio: [0.85, 0.97], qty: [1, 3], line: 'コスメブランドの会員ストアに登録できた。限定品の先行販売に参加できる。' },
  { id: 'global_auction', route: 'online', at: 40, name: '海外オークション', color: '#1d4ed8', pid: 'monocle', ratio: [0.55, 0.74], qty: [1, 1], line: '英語の説明文にも慣れてきた。海外のオークションサイトで入札できるようになった。', stage: 2 },
  { id: 'members_site', route: 'online', at: 70, name: '会員制の時計サイト', color: '#0f172a', pid: 'rabbit_watch', ratio: [0.65, 0.82], qty: [1, 1], line: '取引実績が認められて、会員制の時計サイトから招待状が届いた。', stage: 3 },
  { id: 'local_market', route: 'auction', at: 6, name: '地方の古物市場', color: '#78350f', pid: 'maiogi', ratio: [0.6, 0.77], qty: [1, 2], line: '業者オークションの常連に誘われて、地方の古物市場にも出入りするようになった。' },
  { id: 'estate', route: 'auction', at: 16, name: '遺品整理業者', color: '#3f3f46', pid: 'sakazuki', ratio: [0.5, 0.67], qty: [1, 2], line: '市場で知り合った遺品整理業者から「査定を手伝ってくれないか」と声がかかった。' },
  { id: 'outlet_warehouse', route: 'wholesale', at: 6, name: 'メーカー直営の倉庫', color: '#334155', pid: 'gentle_umbrella', ratio: [0.65, 0.74], qty: [20, 60], minQty: 10, line: '問屋の担当者の紹介で、メーカー直営の倉庫のB品を卸してもらえることになった。' },
  { id: 'importer', route: 'wholesale', at: 16, name: '輸入代理店', color: '#155e75', pid: 'leather_wallet', ratio: [0.7, 0.78], qty: [20, 50], minQty: 10, line: '取引量が増えて、輸入代理店と直接の取引口座を開けた。' },
];
export const SPOT_MAP = Object.fromEntries(SPOTS.map((x) => [x.id, x]));

export const routeUses = (s, route) => s.routeUse?.[route] || 0;
export const hasSpot = (s, id) => !!s.spots?.includes(id);
export const openSpots = (s, route) => SPOTS.filter((x) => x.route === route && hasSpot(s, x.id));

// 次に見つかる仕入れ先（ステージが足りないものは、そのステージになってから）
export function nextSpot(s, route) {
  const sp = SPOTS.find((x) => x.route === route && !hasSpot(s, x.id));
  if (!sp) return null;
  return { spot: sp, left: Math.max(0, sp.at - routeUses(s, route)), stageLock: (sp.stage || 1) > s.stage };
}

// そのルートを1回回るごとに呼ぶ。新しい仕入れ先が見つかったら、その演出の steps を返す
export function pioneerTick(s, route) {
  s.routeUse = { ...(s.routeUse || {}), [route]: routeUses(s, route) + 1 };
  s.spots ||= [];
  const found = SPOTS.filter((x) => x.route === route && !hasSpot(s, x.id) && routeUses(s, route) >= x.at && s.stage >= (x.stage || 1));
  if (!found.length) return [];
  const sp = found[0]; // 1回に1か所ずつ
  s.spots.push(sp.id);
  const p = productOf(sp.pid);
  return [
    sfx('levelup'),
    talk('chris', sp.line, 'sparkle'),
    info('新しい仕入れ先を開拓！', [`「${sp.name}」で仕入れられるようになった`, `ここでしか出会えない「${p.name}」（${p.genre}）が並ぶ`, `${PIONEER_ROUTES[route]}を${routeUses(s, route)}回`], 'good'),
  ];
}

// 行動を選んだときに出す、開拓の進み具合
export function pioneerLine(s, route) {
  if (!PIONEER_ROUTES[route]) return '';
  const opened = openSpots(s, route).length;
  const total = SPOTS.filter((x) => x.route === route).length;
  const nx = nextSpot(s, route);
  if (!nx) return `開拓 ${opened}/${total}：すべての仕入れ先を開拓した`;
  if (nx.left > 0) return `開拓 ${opened}/${total}：あと${nx.left}回で新しい仕入れ先が見つかりそう`;
  return `開拓 ${opened}/${total}：ステージ${nx.spot.stage}になったら、次の仕入れ先が見つかりそう`;
}
