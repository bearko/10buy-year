// 実績。10年（またはゲームオーバー）の最後に判定し、この端末に記録する。
// test(s, r)：s はゲームの状態、r は最終査定（finalResult）
import { SKILLS } from '../data/skills.js';

const caps = (s) => SKILLS.filter((x) => x.kind === 'capstone' && s.skills.includes(x.id)).length;
const cleared = (s) => !s.over;

export const ACHIEVEMENTS = [
  { id: 'first_sale', name: 'はじめての売上', desc: '1つ売る', test: (s) => s.stats.soldUnits >= 1 },
  { id: 'sold_100', name: '百個の箱', desc: '累計100個売る', test: (s) => s.stats.soldUnits >= 100 },
  { id: 'sold_1000', name: '千個の箱', desc: '累計1,000個売る', test: (s) => s.stats.soldUnits >= 1000 },
  { id: 'debt_free', name: '完済', desc: '借金を返し終える', test: (s) => s.flags.debtFree !== undefined },
  { id: 'debt_fast', name: '3年で完済', desc: '3年目が終わるまでに借金を返し終える', test: (s) => s.flags.debtFree !== undefined && s.flags.debtFree < 144 },
  { id: 'stage3', name: '専業の顔', desc: 'ステージ3に上がる', test: (s) => s.stage >= 3 },
  { id: 'stage5', name: '物販の頂', desc: 'ステージ5に上がる', test: (s) => s.stage >= 5 },
  { id: 'nw_100m', name: '億り人（転売で）', desc: '純資産1億円で10年を終える', test: (s, r) => cleared(s) && r.netWorth >= 100000000 },
  { id: 'cap_one', name: '道を極める', desc: 'ルートの到達点にたどり着く', test: (s) => caps(s) >= 1 },
  { id: 'cap_three', name: '三つの道', desc: 'ルートの到達点に3つたどり着く', test: (s) => caps(s) >= 3 },
  { id: 'scarce', name: '整理券の向こう', desc: '品薄品を定価で確保する', test: (s) => s.stats.scarceBought >= 1 },
  { id: 'no_scarce', name: '価格差だけで', desc: '品薄品を一度も買わずに10年を終える', test: (s) => cleared(s) && s.stats.scarceBought === 0 },
  { id: 'calm', name: '静かな10年', desc: '炎上度5未満で10年を終える', test: (s) => cleared(s) && s.hate < 5 },
  { id: 'toku', name: '徳の人', desc: 'TOKUが150以上で10年を終える', test: (s) => cleared(s) && (s.toku ?? 100) >= 150 },
  { id: 'dark', name: '裏の帝王', desc: '裏の人間になる', test: (s) => !!s.underworld },
  { id: 'museum', name: '館長', desc: '私設美術館を開く', test: (s) => !!s.museum },
  { id: 'collector', name: '図鑑づくり', desc: 'コレクションを10点そろえる', test: (s) => (s.collection || []).length >= 10 },
  { id: 'rivals', name: '番付の上へ', desc: 'ライバル転売屋を4人とも抜く', test: (s) => Object.values(s.rivals || {}).filter((r) => r.passed).length >= 4 },
  { id: 'family', name: '家族の応援', desc: '家族の信頼100で10年を終える', test: (s) => cleared(s) && (s.family ?? 70) >= 100 },
  { id: 'hard', name: 'きびしい10年', desc: '難易度「きびしい」で借金を返し終える', test: (s) => s.difficulty === 'hard' && s.flags.debtFree !== undefined },
  { id: 'daily', name: '今日の挑戦', desc: 'デイリーチャレンジで10年を終える', test: (s) => cleared(s) && !!s.daily },
  { id: 'spec', name: '専門家', desc: '商材特化でステージ5に上がる', test: (s) => s.style?.type === 'spec' && s.stage >= 5 },
  { id: 'org', name: '物販の組織', desc: '組織型でステージ5に上がる', test: (s) => s.style?.type === 'org' && s.stage >= 5 },
  { id: 'mentor', name: '師弟', desc: '師匠に5回相談する', test: (s) => (s.stats.mentorTalks || 0) >= 5 },
];

export const checkAchievements = (s, r) => ACHIEVEMENTS.filter((a) => a.test(s, r)).map((a) => a.id);
