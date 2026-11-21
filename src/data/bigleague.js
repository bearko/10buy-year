// ステージ4〜5のイベント：スタッフの採用と育成、税務調査、事業売却の打診。
// 個人の小商いから「会社」になったあとに起きること
import { addCash, addExp, addHate, addMood, addRating, addToku, hasSkill, yen } from '../engine/effects.js';
import { addExpense, recentMonths, sumNet } from '../engine/kpi.js';
import { chance } from '../engine/rng.js';
import { TOTAL_WEEKS, YEAR_WEEKS } from '../engine/calendar.js';
import { hireStaff, STAFF_KINDS } from '../engine/staff.js';
import { choice, gain, info, narr, sfx, talk } from '../engine/steps.js';

const exp = (s, g) => gain(addExp(s, g));
const yearNet = (s) => sumNet(recentMonths(s, 12));
// 帳簿がしっかりしているか（三成の奥義・中級以上の帳簿・会計の外注）
const goodBooks = (s) => hasSkill(s, 'ledger') || hasSkill(s, 'kpi_mid') || hasSkill(s, 'kpi_adv');

export const BIGLEAGUE_EVENTS = [
  // ================= スタッフの採用と育成 =================
  {
    id: 'staff_hire',
    trigger: 'weekStart',
    chance: 0.25,
    cond: (s) => s.stage >= 4 && !s.staff && !hasSkill(s, 'out_ship') && !s.underworld,
    play: (s) => [
      narr('出していた求人に、2人から応募が来た。'),
      talk('mine', '梱包と発送を任せられる人がいれば、あなたは仕入れと値付けに集中できるわ。どっちを雇う？', 'pointer'),
      choice([
        {
          label: `経験者を雇う（月${yen(STAFF_KINDS.pro.wage)}）`,
          sub: '最初から仕事が正確',
          run: () => {
            hireStaff(s, 'pro');
            return [talk('chris', '物流倉庫で働いていた人だ。梱包が速い…！', 'sparkle'), info('スタッフを雇った', ['売れた品の発送をスタッフがする（体力を使わない）', `人件費 月${yen(STAFF_KINDS.pro.wage)}`], 'good')];
          },
        },
        {
          label: `未経験の学生を雇って育てる（月${yen(STAFF_KINDS.rookie.wage)}）`,
          sub: '最初はミスが多いが、育つ',
          run: () => {
            hireStaff(s, 'rookie');
            return [talk('chris', 'やる気はある。あとは、教える僕しだいだ。', 'guts'), info('スタッフを雇った', ['売れた品の発送をスタッフがする（体力を使わない）', '最初は配送破損が多いが、毎月うまくなる', `人件費 月${yen(STAFF_KINDS.rookie.wage)}`], 'good')];
          },
        },
        { label: '今は雇わない', run: () => [talk('chris', 'もう少し、自分の手でやってみよう。', 'arms')] },
      ]),
    ],
  },
  {
    id: 'staff_mistake',
    trigger: 'weekStart',
    chance: 0.3,
    once: false,
    cond: (s) => !!s.staff && s.staff.skill < 55 && s.week - s.staff.since >= 3 && s.week - (s.flags.staffMistake ?? -99) >= 10,
    play: (s) => {
      s.flags.staffMistake = s.week;
      s.staff.mistakes = (s.staff.mistakes || 0) + 1;
      addRating(s, -3);
      return [
        sfx('trouble'),
        narr('買い手から「違う商品が届いた」と連絡。スタッフが、似た箱を取り違えて発送していた。'),
        talk('chris', '（どう伝えよう…）', 'arms'),
        choice([
          {
            label: '強く注意する',
            run: () => {
              s.staff.skill += 3;
              addMood(s, -1);
              return [talk('chris', '確認を二重にしてください。お客さんの信用がかかってるんです。'), narr('スタッフは小さくうなずいた。少し空気が重い。'), info('取り違え', ['評価 -3', 'スタッフの腕が少し上がった'], 'bad')];
            },
          },
          {
            label: '一緒に手順書をつくる',
            sub: '時間はかかるが、仕組みで防ぐ',
            run: () => {
              s.staff.skill += 15;
              return [talk('chris', '箱に番号シールを貼って、出荷前に写真を撮る。手順にしよう。', 'smile'), talk('mine', '人を責めるより、ミスが起きない仕組みをつくる。それが経営よ。', 'wink'), info('手順書', ['評価 -3', 'スタッフの腕が大きく上がった'], 'good'), exp(s, { social: 30, mind: 20 })];
            },
          },
        ]),
      ];
    },
  },
  {
    id: 'staff_grown',
    trigger: 'weekStart',
    chance: 0.5,
    cond: (s) => s.staff?.kind === 'rookie' && s.staff.skill >= 70,
    play: (s) => [
      narr('朝、作業場に行くと、スタッフが自分で考えた梱包の工夫を見せてくれた。'),
      talk('chris', '……最初は箱を取り違えてたのに。人って、育つんだな。', 'cheer'),
      info('スタッフが一人前になった', ['発送のミスがほとんどなくなった'], 'good'),
      exp(s, { social: 50, mind: 30 }),
    ],
  },

  // ================= 税務調査 =================
  {
    id: 'biz_audit',
    trigger: 'weekStart',
    chance: 0.06,
    cond: (s) => s.stage >= 4 && yearNet(s) >= 3000000 && s.week >= 150,
    play: (s) => {
      const base = Math.max(0, Math.round(yearNet(s) * 0.08));
      if (goodBooks(s)) {
        return [
          sfx('trouble'),
          narr('税務署から電話。「来週、帳簿と領収書を拝見しに伺います」'),
          talk('mitsunari', '慌てるな。おぬしの帳簿は、わしが見ても文句がない。'),
          narr('3日間の調査。仕入れの記録、在庫の数、売上の入金。すべての数字がつながっていた。'),
          info('税務調査：指摘なし', ['帳簿が整っていたので、追加の税金はなかった'], 'good'),
          exp(s, { info: 40, mind: 40 }),
        ];
      }
      return [
        sfx('trouble'),
        narr('税務署から電話。「来週、帳簿と領収書を拝見しに伺います」'),
        talk('chris', '領収書…段ボールのどこかに…。', 'wail'),
        narr('調査官は、売上の入金と仕入れの記録が合わないところを、静かに指さしていった。'),
        choice([
          {
            label: '記録の漏れを素直に認める',
            run: () => {
              addExpense(s, base, '追徴課税（申告漏れ）');
              addToku(s, 2);
              return [info('追徴課税', [`申告漏れ ${yen(base)} を納めた`, '帳簿をつけ直すことにした'], 'bad'), talk('mine', '痛いけど、ここで正直にしておけば、次はないわ。帳簿は「スキルツリーの経営」で強くできるわよ。', 'arms')];
            },
          },
          {
            label: '「全部、経費です」と言い張る',
            sub: '通れば追徴なし。通らなければ重加算税',
            run: () => {
              if (chance(s, 0.25)) return [talk('chris', '（なんとか…通った…？）', 'arms'), info('税務調査：おとがめなし', ['今回は追加の税金を払わずに済んだ'], 'good')];
              const fine = Math.round(base * 1.4);
              addExpense(s, fine, '追徴課税（重加算税）');
              addHate(s, 3, false);
              addToku(s, -3);
              return [sfx('trouble'), talk('chris', '……はい。すみません。', 'wail'), info('重加算税', [`追徴と重加算税で ${yen(fine)}`, '仮装・隠ぺいとみなされた'], 'bad')];
            },
          },
        ]),
      ];
    },
  },

  // ================= 事業売却の打診 =================
  {
    id: 'acquisition',
    trigger: 'weekStart',
    chance: 0.12,
    cond: (s) => s.stage >= 5 && yearNet(s) >= 10000000 && s.week <= TOTAL_WEEKS - YEAR_WEEKS,
    play: (s) => {
      // 買値：残りの年数ぶんの利益の9割（最大3年分）。遅くなるほど安くなる
      const yearsLeft = Math.max(0, (TOTAL_WEEKS - s.week) / YEAR_WEEKS);
      const offer = Math.round((yearNet(s) * Math.min(3, yearsLeft * 0.9)) / 100000) * 100000;
      return [
        narr('物販会社の買収を手がけるファンドの担当者から、面談の申し込みが届いた。'),
        talk('mine', `あなたの事業を、${yen(offer)}で買いたいそうよ。年間の利益のおよそ${(offer / Math.max(1, yearNet(s))).toFixed(1)}年分。`, 'shock'),
        talk('chris', '自分で一から作った商売に、値段がついた…。', 'sparkle'),
        choice([
          {
            label: `事業を売却して引退する（${yen(offer)}）`,
            sub: 'ここでゲームが終わる（イグジットEND）。残りの年の稼ぎはなくなる',
            run: () => {
              addCash(s, offer, '事業の売却');
              s.shop = null;
              s.staff = null;
              s.flags.soldBusiness = s.week;
              s.over = 'exit';
              return [sfx('stageup'), info('事業を売却した', [`${yen(offer)}を受け取った`, '外注・自分の店・スタッフは、新しい持ち主に引き継いだ'], 'good'), talk('chris', '10年を待たずに、ここで一区切り。借金じゃなくて、お金がある。', 'smile')];
            },
          },
          {
            label: '業務提携だけ受ける（一部の権利を売る）',
            sub: `${yen(Math.round(offer / 3 / 100000) * 100000)}を受け取り、事業は続ける`,
            run: () => {
              addCash(s, Math.round(offer / 3 / 100000) * 100000, '業務提携（一部の権利の売却）');
              s.flags.partnership = s.week;
              return [info('業務提携', ['事業は手放さずに、資金だけ受け取った'], 'good'), exp(s, { social: 60 })];
            },
          },
          {
            label: '断る',
            run: () => {
              addMood(s, 1);
              return [talk('chris', 'まだ、自分の手で育てたいんです。', 'guts'), talk('mine', 'いい顔してるわ。', 'wink'), exp(s, { mind: 60 })];
            },
          },
        ]),
      ];
    },
  },
];
