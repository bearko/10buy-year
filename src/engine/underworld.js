// 裏の人間：表のサービスは凍結、裏市場でしか売買できない。金額は表の数倍だが、報復や襲撃の危険がある。
// 「蜘蛛の糸」をつかんで足を洗うと、財産とスキルツリーをすべて失い、基礎能力だけが残る
import { INITIAL_SKILLS } from '../data/skills.js';

export const UNDERWORLD_LIVING = 350000; // 金銭感覚が麻痺した暮らし（毎月）

export function washHands(s) {
  s.underworld = false;
  s.toku = 50;
  s.probation = 24; // 保護観察：表の販路の手数料が高い
  s.cash = 0;
  s.points = 0;
  s.inventory = [];
  s.pending = [];
  s.skills = [...INITIAL_SKILLS, 'src_home', 'src_store'];
  s.nodeLv = {};
  s.card.current = 0;
  s.card.due = 0;
  s.card.next = 0;
  s.card.limit = 100000;
  // 事業もすべて手放す：法人・専業の暮らし・店・通っていた講座・抽選の応募
  s.fulltime = false;
  s.corp = false;
  s.shop = null;
  s.course = null;
  s.lotteries = [];
  s.flags.spiderThread = s.week;
  s.flags.tutorialDone = true;
}
