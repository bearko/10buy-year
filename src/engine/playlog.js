// プレイログの中身をそろえる（ブラウザの送信と、ボットの模擬データの両方で使う）。
// engine/telemetry.js は記録点だけ。ここは状態を読んで、月末の様子・ゲームの条件・エンディングを短い形にする。
import { ABILITIES, EXP_TYPES } from './abilities.js';
import { netWorth } from './ending.js';
import { routeCounts } from './perks.js';
import { TREE_NODES } from '../data/skills.js';

export const PLAYLOG_VERSION = 1;

// プレイごとの匿名ID（セーブに入る）
export const newTid = () => Array.from({ length: 12 }, () => '0123456789abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 36)]).join('');

const TREE_IDS = new Set(TREE_NODES.map((n) => n.id));

// 月末の様子：お金・ステージ・基礎能力・使っていない経験点・ツリー・体の具合・在庫
export function snapshot(s) {
  return {
    cash: Math.round(s.cash),
    debt: Math.round(s.debt),
    nw: netWorth(s),
    st: s.stage,
    ab: ABILITIES.map((a) => s.abilities[a.id]),
    ex: EXP_TYPES.map((e) => Math.round(s.exp[e.id] || 0)), // 使わずに残っている経験点（貯めこみの度合い）
    sk: s.skills.filter((id) => TREE_IDS.has(id)).length + Object.values(s.nodeLv || {}).filter((v) => v > 0).length,
    rt: routeCounts(s),
    sta: Math.round(s.stamina),
    mood: s.mood,
    toku: Math.round(s.toku ?? 100),
    rate: Math.round(s.rating),
    inv: s.inventory.length,
    lst: s.inventory.filter((u) => u.listing).length,
    del: s.delinquency || 0,
    ...(s.underworld ? { uw: 1 } : {}),
  };
}

// ゲームの条件：難易度・キャリアの型・チャレンジ・引き継ぎ・師匠
export function gameMeta(s) {
  return {
    diff: s.difficulty || 'normal',
    style: s.style?.type || 'normal',
    ...(s.style?.cat ? { cat: s.style.cat } : {}),
    mode: s.weekly ? 'weekly' : s.daily ? 'daily' : 'normal',
    ...(s.legacy ? { legacy: s.legacy } : {}),
    ...(s.mentor ? { mentor: 1 } : {}),
  };
}

// エンディング（finalResult の結果から）
export function endingData(s, r) {
  return {
    id: r.ending.id,
    rank: r.rank,
    nw: r.netWorth,
    title: r.title,
    st: s.stage,
    ...(s.over && s.over !== 'done' ? { over: s.over } : {}),
    ...(s.vision ? { vision: s.vision.id } : {}),
  };
}
