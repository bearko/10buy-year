// キャリアステージ。副業スタート → 副業安定 → 専業 → 法人化・拡大 → 事業化・多角化
import { addMood, setFlag, yen } from './effects.js';
import { recentMonths, sumNet } from './kpi.js';
import { choice, info, sfx, talk } from './steps.js';

export const STAGES = [
  { id: 1, name: '副業スタート', period: '0〜1年目', goal: '家の不用品を売って、仕入れ→販売の流れをつかむ', next: '月の純利益5万円を2か月連続' },
  { id: 2, name: '副業安定', period: '1〜3年目', goal: 'ジャンルと販路を広げ、専業にできるか見極める', next: '月の純利益30万円を安定して3か月（平均30万円・各月20万円以上）で専業化の判断' },
  { id: 3, name: '専業', period: '3〜5年目', goal: 'バイトを辞めて専業に。外注とツールで仕組み化を始める', next: '直近12か月の純利益800万円（法人化の判断）' },
  { id: 4, name: '法人化・拡大', period: '5〜8年目', goal: '会社にして外注・倉庫・問屋仕入れで規模を広げる', next: '直近12か月の純利益1,800万円＋外注3種（出品・発送・仕入れ）で仕組み化' },
  { id: 5, name: '事業化・多角化', period: '8〜10年目', goal: 'せどりを通過点に、自社ブランド・買取・発信へ', next: '—' },
];
export const stageOf = (s) => STAGES[s.stage - 1];

export const LIVING_COST = 180000; // 専業後の生活費（国保・年金込み）
export const CORP_SOCIAL = 60000; // 法人化後の社会保険料（会社負担分込み）
export const CORP_SETUP = 250000;

// 月末に呼ぶ。昇格イベントがあれば steps を返す
export function checkPromotion(s) {
  const last = (n) => recentMonths(s, n);
  if (s.stage === 1) {
    const m = last(2);
    if (m.length === 2 && m.every((x) => x.net >= 50000)) return promote(s, 2);
  }
  if (s.stage === 2 && s.week >= (s.flags.fulltimeRetry || 0)) {
    // 「月30万円を安定して3か月」：3か月平均30万円以上、かつどの月も20万円以上
    const m = last(3);
    if (m.length === 3 && sumNet(m) >= 900000 && m.every((x) => x.net >= 200000)) return fulltimeChoice(s);
  }
  if (s.stage === 3 && s.week >= (s.flags.corpRetry || 0)) {
    const m = last(12);
    if (m.length >= 12 && sumNet(m) >= 8000000) return corpChoice(s);
  }
  if (s.stage === 4) {
    const m = last(12);
    const systemized = ['out_list', 'out_ship', 'out_buy'].every((id) => s.skills.includes(id));
    if (m.length >= 12 && sumNet(m) >= 18000000 && systemized) return promote(s, 5);
  }
  return [];
}

function setStage(s, to) {
  s.stage = to;
  (s.stageWeeks ||= {})[to] = s.week;
}

function promote(s, to) {
  setStage(s, to);
  const st = STAGES[to - 1];
  const lines = {
    2: [
      talk('mine', '2か月続けて月5万円の利益。もう「お小遣い稼ぎ」じゃないわね。', 'smile'),
      talk('chris', '副業としてはけっこう回ってきた気がする！', 'guts'),
      talk('mine', 'ここからは「何を」「どこで」売るかを絞る段階よ。回転率と利益率も見るようにしましょう。', 'pointer'),
    ],
    5: [
      talk('nobunaga', '市を取ったな。次は天下よ。せどりは貴様の通過点にすぎぬ。'),
      talk('chris', '自分が動かなくても回る仕組みができた…。次は、自分たちの商品を作る番だ。', 'sparkle'),
    ],
  }[to];
  return [sfx('stageup'), ...lines, info(`ステージ${to}：${st.name}`, [st.goal, 'スキルツリーで新しいパネルを解放できるようになった'], 'good')];
}

function fulltimeChoice(s) {
  return [
    talk('mine', '3か月続けて、月30万円前後の利益が安定して出てる。専業の目安とされるラインよ。', 'pointer'),
    talk('mine', `バイトを辞めて専業になる？ 時間は2倍使えるけど、生活費（月${yen(LIVING_COST)}）も全部転売で稼ぐことになるわ。`, 'arms'),
    choice([
      {
        label: '専業になる',
        sub: '行動が週2回に／生活費が毎月かかる',
        run: () => {
          setStage(s, 3);
          s.fulltime = true;
          s.actionsPerWeek = 2;
          setFlag(s, 'fulltimeWeek', s.week);
          return [
            sfx('stageup'),
            talk('chris', '店長、今までありがとうございました…！ 今日から僕は専業せどらーだ！', 'cheer'),
            talk('mine', '自由だけど不自由な毎日の始まりね。体を壊さないように。', 'wink'),
            info('ステージ3：専業', ['行動が週2回になった（バイトは選べない）', `毎月末に生活費 ${yen(LIVING_COST)}`, 'スキルツリーで外注のパネルを解放できるようになった'], 'good'),
          ];
        },
      },
      {
        label: 'まだ副業のままでいい',
        run: () => {
          s.flags.fulltimeRetry = s.week + 12;
          return [talk('chris', 'もう少し安定してからにしよう。会社を辞めた瞬間に売上が落ちる話、よく聞くし…。', 'arms')];
        },
      },
    ]),
  ];
}

function corpChoice(s) {
  return [
    talk('ryoma', '年に800万も稼いどるなら、会社にしたほうがええぜよ！ 税金も、信用も、人を雇うのも、会社のほうが話が早い。'),
    talk('mine', `設立費用に${yen(CORP_SETUP)}、社会保険で毎月${yen(CORP_SOCIAL)}かかるけど、税率は下がるわ。`, 'pointer'),
    choice([
      {
        label: `法人化する（${yen(CORP_SETUP)}）`,
        run: () => {
          if (s.cash < CORP_SETUP) return [talk('chris', '設立費用が足りない…。', 'sad')];
          s.cash -= CORP_SETUP;
          s.stats.expenses += CORP_SETUP;
          setStage(s, 4);
          s.corp = true;
          addMood(s, 1);
          return [
            sfx('stageup'),
            talk('chris', '合同会社クリス物販、設立！ 名刺の肩書きが「代表社員」だって。', 'cheer'),
            info('ステージ4：法人化・拡大', ['税金が法人税（簡易計算で25%）に', `毎月の社会保険 ${yen(CORP_SOCIAL)}`, 'スキルツリーで問屋取引・外注仕入れ・物流倉庫を解放できるようになった'], 'good'),
          ];
        },
      },
      {
        label: 'まだ個人でいい',
        run: () => {
          s.flags.corpRetry = s.week + 24;
          return [talk('ryoma', 'そうか。気が変わったらいつでも言うぜよ。')];
        },
      },
    ]),
  ];
}

// 年の始まり：年齢の壁（6年目以降、体力の最大値が下がっていく）
export function yearStart(s, year) {
  const steps = [];
  if (year >= 6) {
    s.maxStamina = Math.max(60, s.maxStamina - 4);
    s.stamina = Math.min(s.stamina, s.maxStamina);
    steps.push(info('年齢の壁', [`${year}年目。体力の最大値が${s.maxStamina}に下がった`, '自分で動く量を減らす「仕組み化」が効いてくる'], 'bad'));
  }
  return steps;
}
