// 攻略ガイドブックを作る：node tools/guide/build.mjs
// ゲームのデータ（src/）を直接読み、guide/index.html を書き出す。画像はゲームと同じ assets/ と、guide/img/ のスクリーンショット
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import '../../src/engine/turn.js'; // 読みこむ順番をゲームと同じにする（循環 import のため）
import { A, chapter, esc, expChips, img, man, phone, pill, shots, table, tip, wide, yen } from './lib.mjs';
import { CAST, portraitOf } from '../../src/data/cast.js';
import { PRODUCTS, productImage, SIZE_INFO } from '../../src/data/products.js';
import { ROUTES, ROUTE_MAP, SKILLS, SKILL_MAP, TREE_NODES, nodePos, CAPSTONE_NEED, ROUTE_LEVELS } from '../../src/data/skills.js';
import { TERMS } from '../../src/data/glossary.js';
import { CAREERS, AUDIENCES } from '../../src/data/careers.js';
import { COMPANIONS, SECRETS } from '../../src/data/companions.js';
import { LIVE_EVENTS } from '../../src/data/live.js';
import { REGIMES } from '../../src/data/regimes.js';
import { COMMANDS, CARD_TIERS, NIGHT_COMMANDS, NIGHT_EXTRA_STAMINA, TREATMENTS, AUCTION_WEEK } from '../../src/engine/commands.js';
import { ABILITIES, ABILITY_MAX, abilityCost, CONVERT_RATE, EXP_TYPES, rankOf as abRank, OFF_ROUTE_RATE } from '../../src/engine/abilities.js';
import { abilityEffects } from '../../src/engine/abilityfx.js';
import { routePerkText } from '../../src/engine/perks.js';
import { ENDINGS, KIND_TITLES, RANKS } from '../../src/engine/ending.js';
import { VISIONS } from '../../src/engine/visions.js';
import { ACHIEVEMENTS } from '../../src/engine/achievements.js';
import { DIFFICULTIES, MAX_DELINQUENCY } from '../../src/engine/finance.js';
import { STAGES, LIVING_COST, CORP_SOCIAL, CORP_SETUP } from '../../src/engine/career.js';
import { STYLES, SPECIALTIES, ORG_WAGE } from '../../src/engine/style.js';
import { COURSES } from '../../src/engine/courses.js';
import { LIFESTYLES } from '../../src/engine/lifestyle.js';
import { COINS, CRYPTO_CASH, CRYPTO_STAGE } from '../../src/engine/crypto.js';
import { SPOTS } from '../../src/engine/pioneer.js';
import { RIVALS, EXCLUSIVE_WEEKS } from '../../src/engine/rivals.js';
import { ANNALS, ANNALS_FROM_YEAR } from '../../src/engine/annals.js';
import { DEPT_RANKS, PIECES, MUSEUM_COST, MUSEUM_UPKEEP, MUSEUM_STAGE, SERIES_BONUS, RARITY_NAME, DEPT_STAGE } from '../../src/engine/collection.js';
import { LOCATIONS, STAFF_COST } from '../../src/engine/mystore.js';
import { STAFF_KINDS } from '../../src/engine/staff.js';
import { KUJI_PRICE, KUJI_PRIZES, LAST_ONE, KUJI_WEEKS } from '../../src/engine/kuji.js';
import { QUESTS, MAX_ACTIVE, QUEST_WEEKS } from '../../src/engine/quests.js';
import { MISSIONS } from '../../src/engine/tutorial.js';
import { KPI_DEFS } from '../../src/engine/kpi.js';
import { MOOD_LABELS, MOOD_MULT } from '../../src/engine/effects.js';
import { HABITS, REGIONS, LEARN_VISITS } from '../../src/engine/storemap.js';
import { JUNK_STATES, CHECK_STAMINA } from '../../src/engine/junk.js';
import { REGS, CLAIM_BUYERS, TAKEDOWN_RATE } from '../../src/engine/regulated.js';
import { IMPORT_WEEKS, DUTY_RATE } from '../../src/engine/importer.js';
import { PLATFORMS, ROOM_CAPACITY } from '../../src/engine/inventory.js';
import { sellChance } from '../../src/engine/sales.js';
import { createGame } from '../../src/engine/state.js';
import { TOTAL_WEEKS } from '../../src/engine/calendar.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const P = Object.fromEntries(PRODUCTS.map((p) => [p.id, p]));
const pimg = (pid, cls = 'px') => img(productImage(P[pid]), P[pid].name, cls);
const heroImg = (who) => portraitOf(who, 'idle');
const chrisPose = (pose) => CAST.chris.poses[pose] || CAST.chris.poses.idle;

// ======================================================================
// 01 はじめに
// ======================================================================
const ch01 = chapter('intro', 1, 'INTRODUCTION', 'はじめに：10年で、借金から物販王へ', '仮想通貨で溶かした借金を背負ったクリスが、押し入れの本を1冊売るところから始める10年の転売キャリア。このガイドは、そのすべてを解説する攻略本です。', 'assets/backgrounds/home.jpg', chrisPose('guts'), `
<p class="lead">『10 buy year！』は、My Crypto Heroes の二次創作として作られた<b>転売（せどり）経営シミュレーション</b>です。1ターンは1週間。1年は48週、全部で<b>480週＝10年</b>を走り切ると「最終査定」が行われ、<b>純資産</b>でランクが決まり、歩んだ道によって<b>19種類のエンディング</b>のどれかにたどり着きます。</p>
<div class="grid g3">
  <div class="card"><h4 style="margin-top:0">🎯 目的</h4><p>まずは月末の最低返済を欠かさずに<b>借金を完済</b>。そのあとは仕入れ・販路・仕組みを広げて、10年後の<b>純資産</b>を最大にする。</p></div>
  <div class="card"><h4 style="margin-top:0">⏱ 時間</h4><p>1週に選べる行動は<b>1回</b>（専業になると2回）。ステージ2からは<b>夜</b>にもう1つ軽い作業ができる。体力とお金をどう配るかが勝負。</p></div>
  <div class="card"><h4 style="margin-top:0">🏁 ゴール</h4><p>10年後の査定で <span class="num r-S">S</span>（純資産5,000万円以上）を目指すか、「志」を成し遂げる特別なエンディングを目指すか。正道も魔道も選べる。</p></div>
</div>
<h3>登場人物</h3>
<div class="people">
  <div class="person"><img src="${A(CAST.chris.poses.idle)}" alt="" style="object-fit:contain"><div><h4>クリス<small>主人公</small></h4><p>仮想通貨（$SAOコイン）で大損し、友達にまで借金をした青年。押し入れの不用品を売るところから、転売で人生を立て直す。表情豊かで、結果によってガッツポーズもしょんぼりもする。</p></div></div>
  <div class="person"><img src="${A(CAST.mine.poses.pointer)}" alt="" style="object-fit:contain"><div><h4>マイン<small>ナビゲーター</small></h4><p>クリスのお目付け役。チュートリアル、毎月の目標、ミッションを告げる。言うことはたいてい正しい。このガイドでも「マインのワンポイント」で登場する。</p></div></div>
  <div class="person"><img src="${A(CAST.maycri.poses.wide)}" alt="" style="object-fit:contain"><div><h4>マイクリくん<small>マスコット</small></h4><p>タイトル画面にいるマイクリのマスコット。マイクリ市場（通販モール）やマイクリカードなど、ゲームの中のサービスにも名前が残っている。</p></div></div>
  <div class="person"><img src="${A(heroImg('nobunaga'))}" alt=""><div><h4>偉人たち<small>仲間・ライバル</small></h4><p>伊能忠敬・平賀源内・織田信長・坂本龍馬…。マイクリのヒーローたちが、物販仲間として出会いを重ね、スキルの「コツ」や特別な「奥義」を授けてくれる（<a href="#people">第10章</a>）。</p></div></div>
</div>
${shots(phone('title', 'タイトル画面', '「つづきから」「はじめから」、週替わり・今日のチャレンジ。下にランキングや実績'), phone('first_week', '1年目 4月 第1週', 'ここから10年が始まる。上がHUD、中央がステージ、下が行動カード'))}
${tip('mine', '<p>このゲームの数字は、ほとんどがゲームの中のデータから<b>そのまま</b>載せています。スキルツリーの全パネル、全エンディングの条件、全実績まで網羅しているので、困ったら目次から引いてね。</p>')}
`);

// ======================================================================
// 02 ゲームの基本
// ======================================================================
const flow = [
  ['assets/icons/mch_icon.webp', '週のはじめ', 'お知らせ・ニュース・入金。月初は日めくり。開催週は業者オークションの知らせ'],
  ['assets/icons/gum.webp', '行動を選ぶ', '仕入れ・出品・外出・休む の4分類から1つ（専業は2つ）'],
  [CAST.chris.poses.sparkle, '夜（ステージ2〜）', '電脳せどり・出品作業など軽い作業をもう1つ。体力+5消費'],
  ['assets/extensions/1003.webp', '週末：販売', '出品中の品が売れる。受信トレイで結果を確認して発送'],
  ['assets/icons/emblem.webp', '月末：決算', '純利益の締め・固定費・カード引き落とし・利息・最低返済'],
  ['assets/icons/cp.webp', '年末・年度', '1年のまとめ。2月第3週に確定申告（法人は決算）'],
];
const sizeRows = Object.entries(SIZE_INFO).map(([k, v]) => [pill(`${k}（${v.label}）`), yen(v.ship), `体力 ${v.stamina}`, `${v.space}マス`]);
const ch02 = chapter('basics', 2, 'BASICS', 'ゲームの基本：1週間の流れと画面の見方', '1週間は「週のはじめ → 行動 → 夜 → 週末の販売」。月末に決算と返済。この繰り返しで10年が進む。', 'assets/backgrounds/study.jpg', CAST.mine.poses.pointer, `
<h3>1週間の流れ</h3>
<div class="flow">${flow.map(([icon, t, d]) => `<div><img src="${A(icon)}" alt=""><b>${t}</b><small>${d}</small></div>`).join('')}</div>
<p>行動を1つ選ぶと、その場で仕入れや作業の画面が開き、終わると週末に進みます。売れたかどうかは<b>週末</b>にまとめて決まり、売上金は<b>翌週に入金</b>されます。月の最終週（第4週）の終わりには、月の締めと返済があります。</p>
${shots(phone('wk_flip', '週の日めくり', '月の初めは月の名前を大きく。タップで飛ばせる'), phone('wk_mail', '週末の受信トレイ', '売れた知らせがメールで届き、上に今週の取引のまとめ'), phone('wk_month', '月末の決算カード', '今月の純利益と、ステージの目標の進み具合'))}

<h3>画面の見方（HUD）</h3>
${wide('hud', '画面上部のHUD。数字や項目をタップすると説明が出る')}
<div class="keys">
  <div class="key"><b>日付と残り週</b><small>「4年目 5月 第3週」。全480週のうち残り何週か。横のStageは<a href="#career">キャリアの段階</a>。</small></div>
  <div class="key"><b>所持金・借金</b><small>入金や支払いでカウントアップ・ダウンする。借金が減ると光る。</small></div>
  <div class="key"><b>目標</b><small>いまのステージの昇格条件と進み具合。ステージ5では志または純資産の目標。</small></div>
  <div class="key"><b>体力</b><small>最大100から。行動ごとに減り、休むと回復。少ないまま重い行動をすると体調を崩す。</small></div>
  <div class="key"><b>評価</b><small>取引の評価（初期50）。高いほど買い手が増える（買い手 ×(0.6＋評価÷125)）。発送遅れやトラブルで下がる。</small></div>
  <div class="key"><b>TOKU（徳）</b><small>初期100（0〜200）。正道ルートの条件。0になると裏の人間になる（<a href="#dark">第12章</a>）。</small></div>
  <div class="key"><b>やる気</b><small>${MOOD_LABELS.map((m, i) => `${m}（経験点×${MOOD_MULT[i]}）`).join('・')}。気晴らしで上がる。</small></div>
  <div class="key"><b>警告の帯</b><small>返済日・体調不良・出品停止・滞納・炎上などがあると、HUDに赤い帯や札が出る。</small></div>
</div>
${shots(phone('main_mid', 'ゲームのメイン画面', '右に基礎能力と、ミッション・スキルツリー・在庫・メニュー・能力強化・ログ'), phone('hud_tip', 'HUDの説明', '評価・TOKU・やる気などをタップすると、その場で吹き出し'), phone('cmd_buy', '行動カード', 'カードの下に体力と費用の目安。足りないと赤'))}

<h3>行動の選び方</h3>
<p>行動カードは「仕入れ」「出品」「外出」「休む」の4分類。分類をタップすると中の行動が並び、<b>1回目のタップで予告</b>（体力・お金・増える経験点）、<b>2回目で決定</b>です。設定で「行動を1タップで決める」をONにすると1タップで決まり、長押しで予告だけ見られます。</p>
${shots(phone('cmd_preview', '行動の予告', '選ぶと、右の欄が経験点の予告に切りかわる'))}
<h3>荷物のサイズ</h3>
<p>商品にはS・M・Lのサイズがあり、送料・発送の体力・置き場のマス数が変わります。置き場は最初<b>${ROOM_CAPACITY}マス</b>。満杯を超えると休んだときの回復が半分になり、限界（置き場の1.5倍）を超えては仕入れられません。</p>
${table(['サイズ', '送料（目安）', '発送の体力', '置き場'], sizeRows)}

<h3>便利な操作</h3>
<div class="keys">
  <div class="key"><b>数字キー <kbd>1</kbd>〜<kbd>9</kbd></b><small>PCでは行動カード・選択肢を数字キーで選べる。<kbd>Enter</kbd> <kbd>Space</kbd> <kbd>Z</kbd> で文字送り、<kbd>Esc</kbd> で画面を閉じる。</small></div>
  <div class="key"><b>AUTO（文字送り）</b><small>メッセージ欄右上のAUTOで、タップしなくても話が進む。選択肢では止まる。</small></div>
  <div class="key"><b>戻る操作</b><small>スマホの戻る操作で、いちばん上の画面を閉じる。何も開いていなければタイトルに戻るか確認。</small></div>
  <div class="key"><b>セーブ</b><small>行動が終わるたびと、アプリを切り替えたときに自動セーブ。「つづきから」で前回までのカードが出る。</small></div>
  <div class="key"><b>ホーム画面に追加</b><small>スマホのブラウザで「ホーム画面に追加」すると、アプリのように全画面で遊べる（PWA）。</small></div>
  <div class="key"><b>ログ</b><small>右の「ログ」で、これまでの会話とお知らせを読み返せる。用語には解説付き。</small></div>
</div>
${shots(phone('resume_card', '前回までのカード', '「つづきから」で、所持金・目標・ミッションを確認してから再開'), phone('rv_log', 'ログ', '会話・お知らせをあとから読める'))}
`);

// ======================================================================
// 03 序盤
// ======================================================================
const diffCards = Object.entries(DIFFICULTIES).map(([id, d]) => `<div class="card"><h4 style="margin-top:0">${d.name}${id === 'normal' ? ' ' + pill('おすすめ', 'gold') : ''}</h4><p class="num" style="font-size:20px;margin:4px 0">借金 ${man(d.debt)}</p><p style="margin:2px 0">最低返済 月${man(d.minPay)}・年利${Math.round(d.rate * 100)}%</p><small class="muted">${esc(d.note)}</small></div>`).join('');
const ch03 = chapter('start', 3, 'GETTING STARTED', '序盤の進め方：チュートリアルと最初の1年', '難易度を選び、押し入れの本を売るところから。チュートリアルの9つのミッションで、仕入れ→出品→販売の流れをひと通り覚える。', 'assets/backgrounds/home.jpg', chrisPose('wave'), `
<h3>難易度</h3>
<p>はじめからを選ぶと、最初に難易度を選びます。<b>始めたあとは変えられません</b>。最初の資金はどれも<b>現金10万円</b>、カードの利用枠10万円です。</p>
<div class="grid g3">${diffCards}</div>
${shots(phone('difficulty', '難易度を選ぶ', '2周目以降は、引き継ぎ・キャリアの型も選べる'), phone('prologue2', 'プロローグ', '一度見たら、次からはスキップできる'), phone('goal_popup', '最初の目標', 'ステージ1の目標は「月の純利益5万円を2か月連続」'))}

<h3>チュートリアルの9ミッション</h3>
<p>マインの指示に従っていけば自然にクリアできます。チュートリアル中は値下げ交渉・取引トラブル・偉人との出会いが起きず、ニュースの帯も止まります。</p>
<div class="steps">${MISSIONS.map((m) => `<div><b>${esc(m.title)}</b><span class="muted">${esc(m.hint)}</span></div>`).join('')}</div>
${tip('mine', '<p>最初に持っている<b>ノービスブック×3・ハット・グラス</b>は仕入れ値0円。まずは全部出品して最初の売上を立てましょう。「スキルツリー」の中心<b>「押し入れの宝の山」</b>はコスト0で解放できるわ。</p>')}

<h3>最初の1年の動き方</h3>
<div class="timeline">
  <div><b>1〜2か月目<small>家の不用品で最初の売上</small></b><ul><li>家の物を出品し、「家の中を探す」で残りを見つける（見つかる物は限られている）</li><li>スキルツリーで「近所の店のワゴン」（行動10）を取って店舗せどりを開く</li></ul></div>
  <div><b>2〜6か月目<small>店舗せどりの型を作る</small></b><ul><li>店舗せどりで「見立て（推定相場）＞値段」の品だけ買う。商品ページの帯の<b>見込み利益</b>を見る</li><li>体力が30を切ったら休む。月末の最低返済分の現金は必ず残す</li><li>チュートリアルを終えると、販路の「ミィーム」（技術20・情報10）と経営の「利益計算」（情報10）が取れるようになる。利益計算は最優先</li></ul></div>
  <div><b>6〜12か月目<small>ステージ2へ</small></b><ul><li>月の純利益5万円を2か月続けるとステージ2（副業安定）。夜の行動が増える</li><li>電脳せどり（累計5点仕入れ）・相場チェック（累計8点販売）・物販仲間（累計12点販売）が順に開く</li><li>カード増枠を申請して仕入れの幅を広げる。ただし引き落としは月末</li></ul></div>
</div>
${shots(phone('rv_quests', 'ミッション', 'マインや店の人からの小さな目標。報酬は経験点や新しい仕入れ先'), phone('unlock_popup', 'ステージ到達', '増えた行動・夜の行動・メニューをまとめて見せる'))}
<h3>ミッション（全${Object.keys(QUESTS).length}種）</h3>
<p>お金の目標とは別の小さな目標です。同時に${MAX_ACTIVE}つまで、${QUEST_WEEKS}週以内が目安。マインが告げるもの（ステージごと）と、店で「！」の人から頼まれるもの（偉人）があります。報酬はまとまった経験点か、<b>新しい仕入れ先</b>。</p>
${table(['ミッション', '内容', '報酬', '出る時期'], Object.entries(QUESTS).map(([id, q]) => [`<b>${esc(q.title)}</b>`, `<small>${esc(q.desc)}</small>`, q.reward?.spot ? pill('新しい仕入れ先', 'gold') : expChips(q.reward?.exp), q.stage ? `ステージ${q.stage}〜` : pill('店で頼まれる', 'info')]))}
`);

// ======================================================================
// 04 仕入れ
// ======================================================================
const GROUP_NAME = { buy: '仕入れ', sell: '出品', out: '外出', rest: '休む' };
const CMD_COND = {
  home_search: '最初から（家の物が残っている間）', store: '「近所の店のワゴン」', expedition: '店舗せどり10回から', online: '「ポイント通販」', lottery: '「抽選・予約」', queue: '「行列に並ぶ」',
  auction: `「業者オークション」（ステージ3）・毎月第${AUCTION_WEEK}週だけ`, wholesale: '「問屋・メーカー直取引」（ステージ4）', import: 'ステージ2から・「ポイント通販」', kuji: '「近所の店のワゴン」・くじの開催中（年4回）', oem: 'エジソンの奥義「メンロパークの研究所」',
  listing: '最初から', meetup: '「物販仲間」', study: '最初から', parttime: '副業のあいだ（専業で消える）', play: '最初から', rest: '最初から', clinic: 'ケガ・体調不良のとき', course: 'ステージ2から', open_shop: '資格「店舗経営講座」（ステージ4）',
  donate: 'ステージ2から', dept: 'ステージ3から', live: 'キャリア「ライブコマースKOL」', tour: 'キャリア「インバウンド」', buying: 'キャリア「セレクトショップ」', appraise_job: 'キャリア「鑑定士」', review: 'キャリア「レビューメディア」', mentor: '2周目以降・師匠がいるとき（12週に1回）', card_up: '利用枠の次の段階があるとき（8週に1回）', license: '「古物商許可の取り方」',
};
const cmdRows = COMMANDS.map((c) => [{ cls: 'ic', html: img(c.icon, c.name) }, `<b>${esc(c.name)}</b><br><small>${esc(c.desc)}</small>`, pill(GROUP_NAME[c.group] || c.group), c.heal ? `<span class="good">+${c.heal}</span>` : c.stamina < 0 ? `<span class="good">+${-c.stamina}</span>` : c.stamina, [c.cost ? `<span class="bad">-${yen(c.cost)}</span>` : '', c.pay ? `<span class="good">+${yen(c.pay)}</span>` : ''].join(''), expChips(c.exp), NIGHT_COMMANDS.includes(c.id) ? pill('夜OK', 'info') : '', `<small>${esc(CMD_COND[c.id] || '')}</small>`]);
const habitRows = Object.values(HABITS).map((h) => [`<b>${esc(h.name)}</b>`, esc(h.desc)]);
const spotRows = SPOTS.map((s) => [{ cls: 'ic', html: pimg(s.pid) }, `<b>${esc(s.name)}</b><br><small>${esc(s.line)}</small>`, esc({ store: '店舗せどり', online: '電脳せどり', auction: '業者オークション', wholesale: '問屋' }[s.route]), `${s.at}回目`, esc(P[s.pid].name), `相場の${Math.round(s.ratio[0] * 100)}〜${Math.round(s.ratio[1] * 100)}%`, s.stage ? `ステージ${s.stage}〜` : '']);
const kujiRows = [...KUJI_PRIZES.map((k) => [{ cls: 'ic', html: pimg(k.pid) }, `<b>${k.tier}賞</b> ${esc(P[k.pid].name)}`, `${k.n}本`, yen(P[k.pid].retail)]), [{ cls: 'ic', html: pimg(LAST_ONE) }, `<b>ラストワン賞</b> ${esc(P[LAST_ONE].name)}`, '最後の1枚', yen(P[LAST_ONE].retail)]];
const ch04 = chapter('sourcing', 4, 'SOURCING', '仕入れ：どこで、何を、いくらで買うか', '店舗・電脳・抽選・行列・業者オークション・問屋・輸入・くじ。仕入れ先ごとのクセと、利益が出る品の見分け方。', 'assets/backgrounds/store.jpg', chrisPose('sparkle'), `
<h3>行動の一覧（全${COMMANDS.length}種）</h3>
<p>体力は1回あたりの消費（緑は回復）、経験点はやる気「普通」のときの値です。解放条件の「」はスキルツリーのパネル名。</p>
${table(['', '行動', '分類', '体力', 'お金', '経験点', '夜', '使えるようになる条件'], cmdRows)}

<h3>店舗せどり：閉店までに店を回る</h3>
<p>昼12時に家を出て、閉店の20時までに回れるだけ店を回ります（夜の行動では18時半〜22時、遠征は朝8時出発）。次に行く店は2つから選び、店の中では<b>売り場をタップして品定め</b>。見つけた品は「カゴ」に入れて、レジで<b>現金かカード</b>で払います。</p>
${shots(phone('store_route', '次の店を選ぶ', '移動時間・売り場の数・チラシ・店のクセを見て選ぶ'), phone('store_floor', '店の中の見取り図', '売り場をタップすると時間を使って品定め。「！」の人に話しかけられる'), phone('store_items', '見つけた品', '「＋カゴ」で商品ページを開かずにカゴへ。残りの売り場は「全部見る」でまとめて'))}
${shots(phone('item_page', '商品ページ', '値段の下の帯に「見立て・値段の割合・見込み利益」'), phone('item_sold', '売れた値段を調べる', 'スマホでフリマの売り切れ相場を確認（時間を使う）'), phone('store_cart', 'レジ', '売り場を全部見たら「払って次へ」で次の店選びへ'))}
<h4>店のクセ（同じ店に${LEARN_VISITS}回通うと覚える）</h4>
<p>店ごとに決まったクセがあり、<b>覚える前から効いています</b>。覚えると店を選ぶ画面と「店の地図」に表示され、ルートを組み立てやすくなります。</p>
${table(['クセ', '効果'], habitRows)}
<h4>遠征</h4>
<p>店舗せどりを10回したあとに開く行動。交通費6,000円と体力30を使いますが、朝から回れて荒らされていない店が多く、掘り出し物が増えます。遠征先は ${REGIONS.map(esc).join('・')}。遠征先ごとに店のクセは別です。</p>
${tip('mine', '<p>判断の基本は<b>見込み利益＝見立て −（手数料＋送料＋仕入れ値）</b>。でも見立ては目利きの腕でぶれるわ。高い買い物の前は「売れた値段を調べる」で本当の相場を確かめて。</p>')}

<h3>電脳せどり：夜のスマホ</h3>
<p>21時から寝るまでの時間で、通販モール・フリマ・オークションのアプリを渡り歩きます。ポイント還元（第1・第3週は通販モールのポイントアップ週）、在庫復活の通知、フリマの安値、オークションの終了間際がねらい目。フリマでは<b>コメントで値下げ交渉</b>、オークションは上限額を決めて入札します。</p>
${shots(phone('phone_home', '夜のスマホ（ホーム）', '通知・キャンペーン・アプリ。寝るまでの時間が減っていく'), phone('phone_app', 'オークションアプリ', '終了間際の品は狙い目'))}

<h3>抽選・予約・行列：限定品を定価で</h3>
<p>発売前の限定品は「抽選に応募」（結果は翌週）や電脳せどりの予約で<b>定価</b>で買えます。発売日には「行列に並ぶ」（体力28）。限定品は相場が定価を大きく上回る<b>品薄</b>の間がもうけどきですが、<b>受注生産・公式リセール・転売禁止の対象拡大</b>などの対策が入ると一気に値崩れします（<a href="#world">第11章</a>）。</p>

<h3>業者オークション：月に一度の古物市場</h3>
<p>ステージ3で「業者オークション」（会費 月1万円・目利き50以上）を取ると、<b>毎月第${AUCTION_WEEK}週だけ</b>参加できます。開催週のはじめにクリスが「今週は業者オークションだ」とつぶやき、仕入れのカードに金色の札が付きます。会場ではまず<b>競り</b>（手を挙げ続けた人が落とす）、そのあと相場の5〜7割の出品物の一覧。真贋チェック済みが多く、偽物の心配が少ないのも魅力です。</p>
${shots(phone('auction_cmd', '開催週の仕入れ', 'いちばん上に金色の枠と「今週開催」'), phone('seri_1', '会場の競り', 'ロットが流れ、札が上がらないまま3拍たつと決まる'), phone('seri_2', '手を挙げる', '相手が降りるまで競る。熱くなった相手は相場以上まで来ることも'))}
${tip('mine', '<p>月に一度だから、<b>第3週に向けて現金とカードの枠を空けておく</b>のがコツよ。競りで落としたら、出品物の一覧からも狙いましょう。</p>')}

<h3>問屋・中国輸入・くじ</h3>
<div class="grid g3">
  <div class="card"><h4 style="margin-top:0">問屋と商談</h4><p>ステージ4〜。定番品を<b>最低ロット</b>で卸値（定価の6〜7割）仕入れ。見積書の掛け率とロットは交渉で動かせる。量をさばく販路（アマクリ・自分の店）と相性がよい。</p></div>
  <div class="card"><h4 style="margin-top:0">中国輸入</h4><p>ステージ2〜。ノーブランド品をロットで輸入。為替で仕入れ値が変わり（円安で高い）、届くのは<b>${IMPORT_WEEKS}週後</b>。税関で止まる・検品不良・関税（${Math.round(DUTY_RATE * 100)}%）などは届くまでわからない。</p></div>
  <div class="card"><h4 style="margin-top:0">くじ</h4><p>年4回、ホビーショップでくじが始まる（${KUJI_WEEKS}週間）。1回${KUJI_PRICE}円。<b>A賞とラストワン賞</b>が狙い目、下位賞はダブついて売れ残りやすい。箱の残りは毎週ほかの客が引いて減っていく。</p></div>
</div>
${table(['', '賞', '本数（1箱80枚）', '定価'], kujiRows)}

<h3>新しい仕入れ先の開拓</h3>
<p>同じ仕入れルートを回り続けると、<b>新しい仕入れ先</b>が見つかります。そこでしか出会えない品が並び、仕入れ先ごとに荒れ具合が別なので、古いルートが荒れたら移るのが中盤以降の基本です。開拓した仕入れ先には<b>出資</b>（品ぞろえが増え、荒れにくくなり、毎月配当）もできます。</p>
${table(['', '仕入れ先', 'ルート', '見つかる回数', '並ぶ品', '仕入れ値', '条件'], spotRows)}
<h4>荒れ具合（飽和度）と独占契約</h4>
<p>仕入れ先は使うほど<b>荒れて</b>（1回+2.5、夜は半分）、掘り出し物が減り仕入れ値が上がります。使わなければ週ごとに落ち着きます（使った週-2.5、使わなかった週-4）。<b>週1回のペースなら荒れません</b>。ライバル転売屋に荒らされたら、メニュー「業界の動き」で<b>独占契約</b>（${EXCLUSIVE_WEEKS}週・対人120と現金）を結ぶと、ライバルが入れなくなります。</p>
${shots(phone('rv_rivals', '業界の動き', '年表・規制・仕入れ先の荒れ具合・独占契約・出資・長者番付'))}

<h3>偽物の見分け方</h3>
<p>偽物かどうかは画面に直接は書かれません。仕入れルート・価格（安すぎないか）・出品者・写真・説明文・付属品・質問への対応、そして<b>実物の細部</b>（刻印・縫製・シュリンクなど）で見抜きます。見られる細部の数と見誤りにくさは<b>目利き</b>で決まり、「真贋の知識」「鑑定士」、ダ・ビンチの奥義、商材特化などで増えます。偽物は売れても返品されたり、評価を大きく落とします。</p>
${tip('warn', '<p>出所の言えない品（石川五右衛門の卸）は、相場の2割でも<b>絶対に買わない</b>こと。盗品は2週後に警察が来て没収、違法行為の前歴が付きます。前歴があるのにもう一度買うと…<a href="#endings">御用END</a>です。</p>')}
`);

// ======================================================================
// 05 販売
// ======================================================================
const platRows = Object.values(PLATFORMS).map((p) => [`<b class="nw">${esc(p.name)}</b>`, `<span class="nw">${Math.round(p.fee * 100)}%</span>${p.perUnit ? `<br><small class="nw">＋${p.perUnit}円/個</small>` : ''}`, `<small>${esc(p.desc)}</small>`, p.node ? `「${esc(SKILL_MAP[p.node].name)}」${p.node === 'ch_punsea' ? '（最初から）' : ''}` : p.cert ? '資格「輸出入の基礎」' : p.underworld ? '裏の人間のみ' : `ステージ${p.stage}から`]);
// 売れる確率のグラフ（買い手1人あたり）
function sellChart() {
  const W = 640;
  const H = 260;
  const pad = { l: 46, r: 16, t: 14, b: 34 };
  const xs = [];
  for (let r = 0.8; r <= 1.401; r += 0.01) xs.push(+r.toFixed(2));
  const X = (r) => pad.l + ((r - 0.8) / 0.6) * (W - pad.l - pad.r);
  const Y = (v) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const lines = [[20, '#7cc7ff', '出品20（初期）'], [60, '#f5c542', '出品60'], [100, '#ff5bd0', '出品100']].map(([lv, color, label]) => {
    const s = { abilities: { list: lv }, skills: [] };
    const pts = xs.map((r) => `${X(r).toFixed(1)},${Y(sellChance(s, r)).toFixed(1)}`).join(' ');
    return { pts, color, label };
  });
  const grid = [0, 0.25, 0.5, 0.75, 1].map((v) => `<line x1="${pad.l}" x2="${W - pad.r}" y1="${Y(v)}" y2="${Y(v)}" stroke="#ffffff18"/><text x="${pad.l - 8}" y="${Y(v) + 4}" fill="#9aa3c7" font-size="11" text-anchor="end">${Math.round(v * 100)}%</text>`).join('');
  const xt = [0.8, 0.9, 1.0, 1.1, 1.2, 1.3, 1.4].map((r) => `<text x="${X(r)}" y="${H - 12}" fill="#9aa3c7" font-size="11" text-anchor="middle">×${r.toFixed(1)}</text>`).join('');
  return `<figure class="chart"><svg viewBox="0 0 ${W} ${H}" role="img" aria-label="値付けと売れる確率">${grid}${xt}<line x1="${X(1)}" x2="${X(1)}" y1="${pad.t}" y2="${H - pad.b}" stroke="#ffffff40" stroke-dasharray="4 4"/>${lines.map((l) => `<polyline points="${l.pts}" fill="none" stroke="${l.color}" stroke-width="3"/>`).join('')}</svg><div class="legend">${lines.map((l) => `<span><i style="background:${l.color}"></i>${l.label}</span>`).join('')}</div><figcaption>値付け（相場の何倍か）と、買い手1人が買ってくれる確率。売れるかどうかは、この確率×その週の買い手の人数で決まる。「写真映え」「土用の丑の日」「売れっ子セラー」などで曲線は右へずれる</figcaption></figure>`;
}
const troubleRows = [
  ['音信不通', '購入後に連絡が取れない。待つかキャンセルか'],
  ['すり替え疑惑', '「届いた品が偽物」と言われ、本物とすり替えて返品される詐欺。<b>交渉バトル</b>。「シリアル控え」で撃退できる'],
  ['クレーム', '理不尽な要求。<b>交渉バトル</b>。対応しだいで評価が上下する'],
  ['返品の要求', 'イメージと違う等。応じるか断るか'],
  ['サイズ違いの返品', 'スニーカーなど。サイズの合わない品の返品'],
  ['低評価', '評価が下がる。丁寧な対応で取り返せることも'],
  ['いたずら購入', '買ったまま放置。キャンセルで出品し直し'],
  ['配送破損', '梱包が甘いと起きる（梱包の能力・梱包職人で減る）'],
  ['偽物の申告', '仕入れた品が偽物だった場合など'],
];
const junkRows = Object.values(JUNK_STATES).map((j) => [`<b>${esc(j.name)}</b>`, `相場の${Math.round(j.mult * 100)}%`]);
const regRows = Object.values(REGS).map((r) => [`<b>${esc(r.name)}</b>`, esc(r.law), `<small>${esc(r.rule)}</small>`, r.canSell ? pill('出品できる', 'good') : pill('出品できない', 'bad')]);
const ch05 = chapter('selling', 5, 'SELLING', '販売：どこで、いくらで売るか', '販路ごとの手数料と客層、値付けと売れる確率、在庫の管理、発送、値下げ交渉とトラブル。', 'assets/backgrounds/warehouse.jpg', chrisPose('cheer'), `
<h3>販路（売り先）</h3>
${table(['販路', '手数料', '特徴', '使えるようになる条件'], platRows)}
${tip('mine', '<p>新品の量産品は<b>アマクリ</b>（発送の手間なし）、コレクター品は<b>ミィーム</b>（競り上がる）、スニーカー・トレカは<b>ホンモノ堂</b>（相場の1割増し）、型落ちやブームの後は<b>海外EC</b>。販路を1つに頼ると、手数料の改定で痛い目を見るわ。</p>')}

<h3>売れる仕組み</h3>
<p>毎週末、販路ごとに<b>買い手の人数</b>が決まり、安い出品から順に「買うかどうか」が判定されます。1人の買い手が買う確率は、値付けが相場の何倍かで決まります。<b>相場どおり（×1.0）ならかなり売れ、×1.2を超えると急に売れにくく</b>なります。買い手の人数は、評価・季節（12月は1.25倍）・顧客層・スキル・その週の「撮影・出品作業」で増えます。</p>
${sellChart()}
<h3>在庫と出品</h3>
<p>右の「在庫」から、売り先のタブを選び、品ごとに値付けと個数を決めて出品します。品が8つ以上あると1行1品のコンパクト表示になり、<b>絞り込み</b>（未出品・出品中・90日以上）と<b>並べ替え</b>（見込み利益・在庫日数・割高な出品）が使えます。上の「ワンタップ」ボタンで、未出品を相場でまとめて出品・出品中を5%値下げ・90日以上の在庫を即決買取ができます。</p>
${shots(phone('inventory', '在庫（1行表示）', 'タップでカードに広がる'), phone('inventory_card', '在庫（カード）', '値付けのスライダー・個数・出品／即決買取'), phone('listnow', '仕入れ直後の出品', '仕入れたその場で、合った売り先に相場で出品できる'))}
<div class="grid g2">
  <div class="card"><h4 style="margin-top:0">出品枠</h4><p>同時に出品できる数。<b>5＋出品÷10</b>（初期7件）。「出品枠の拡張」（+3×5回）、「プンシーShops」（+5）で増える。</p></div>
  <div class="card"><h4 style="margin-top:0">即決買取</h4><p>買取業者にすぐ売る。受け取りは<b>相場の45%</b>。損切りと現金づくり用。偽物・盗品・医薬品は値がつかない。</p></div>
  <div class="card"><h4 style="margin-top:0">撮影・出品作業</h4><p>行動「撮影・出品作業」で、その週の売れ行きが最大1.34倍。背景・光・枚数を選ぶ（白い背景＋リングライト＋多めの枚数が強い。撮りすぎると疲れる）。</p></div>
  <div class="card"><h4 style="margin-top:0">長期在庫</h4><p>60日・90日を超えた在庫はレポートで知らせが来る。相場は動くので、寝かせても上がるとは限らない（家康の奥義「鳴くまで待とう」は例外）。</p></div>
</div>

<h3>発送</h3>
<p>週末に売れた品は、部屋から箱に詰めて送り出します（演出）。<b>体力</b>を使い、足りないと発送が遅れて評価が下がります。アマクリは倉庫から出荷されるので体力不要。「梱包職人」で半分、外注・スタッフでゼロにできます。</p>
${shots(phone('wk_mail', '週末の取引のまとめ', '売上金・利益・いちばん儲かった品・自己ベストのスタンプ'), phone('wk_ship', '発送', '売れた品が箱に詰められ、出荷されていく'))}

<h3>値下げ交渉と取引トラブル</h3>
<p>プンシーでは値下げ交渉がよく来ます。取引トラブルは<b>${troubleRows.length}種類</b>。「すり替え疑惑」と「クレーム」は<b>交渉バトル</b>になり、上の円ゲージ（交渉成功率）が能力・スキルで最初から貯まった状態で始まります。選択肢ごとに成功率が表示され、スキル（シリアル控え・このはし渡るべからず など）が発動するとゲージが上がります。</p>
${shots(phone('battle_1', '交渉バトル', '上の円が交渉成功率。色は25/50/75%で赤→橙→黄→緑'), phone('battle_2', '対応を選ぶ', '選択肢ごとに成功率'), phone('battle_4', '交渉成立', 'スキルの発動でゲージが上がった'))}
${table(['トラブル', '内容'], troubleRows.map(([a, b]) => [`<b>${a}</b>`, b]))}
${tip('mine', '<p>メニューの「取引の対応」で、値下げ交渉やトラブルに<b>いつもの答え</b>を決めておけるわ。初期設定ではルーティン中だけ自動で答える。トラブルを減らすなら「プロフ必読」（-30%）と交渉の能力ね。</p>')}

<h3>売り方に注意がいる品</h3>
${table(['種類', '法律', 'ルール', ''], regRows)}
<p>化粧品・サプリの説明文で効能をうたうと、買い手は×${CLAIM_BUYERS}になりますが、毎週${Math.round(TAKEDOWN_RATE * 100)}%で削除と警告。警告2回で出品停止です。お酒は資格「酒類販売業免許」がないと続けて出品できません。</p>
<h3>ジャンク品</h3>
<p>リサイクルショップのジャンクかごにある「動作未確認」の電子機器。買って<b>動作確認</b>（体力${CHECK_STAMINA}）するまで状態がわかりません。直せそうなら修理もできます。</p>
${table(['状態', '売れる値段'], junkRows)}
`);

// ======================================================================
// 06 お金
// ======================================================================
const tierRows = CARD_TIERS.map((t, i) => [i === 0 ? '最初' : `${i}段目`, yen(t.limit), t.revenue ? `直近3か月の平均売上 ${yen(t.revenue)}` : '—', t.stage ? `ステージ${t.stage}〜` : '']);
const kpiRows = KPI_DEFS.map((d) => [pill(['', '素人', '中級', '玄人'][d.level], ['', 'info', 'gold', 'pink'][d.level]), `<b>${esc(d.name)}</b>`, `<small>${esc(d.desc || '')}</small>`]);
const ch06 = chapter('money', 6, 'MONEY', 'お金：借金・カード・税金・経営の数字', '最低返済を欠かさないこと。カードは翌月以降に引き落とし。確定申告は2月。そして数字を読めば、伸ばすべきところが見える。', 'assets/backgrounds/event.jpg', chrisPose('arms'), `
<h3>借金と返済</h3>
<p>毎月の<b>第4週末</b>に、利息（年利÷12）が借金に乗り、<b>最低返済額</b>が現金から引かれます。現金が足りないと<b>滞納</b>（遅延損害金5,000円・やる気ダウン）。<b>${MAX_DELINQUENCY}か月連続で滞納すると債務整理END</b>（ゲームオーバー）です。一度でも払えれば連続滞納はリセットされます。</p>
<p>メニュー「経営」からいつでも<b>繰上げ返済</b>ができ、早く返すほど利息が減ります。「全額返済」「手持ちの50%」のワンタップボタンと、金額を決めて返す欄があります。全額返すと滞納の記録も消えます。</p>
${shots(phone('rv_biz', '経営', '10年の道のり・ステージの進み具合・成績の指標・お金・繰上げ返済'), phone('wk_month', '月末の決算カード', '今月の純利益・先月との差・目標のゲージ'))}
${tip('warn', '<p>月末の返済日はHUDに<b>「今週末は返済日！」</b>と赤い帯が出ます。仕入れに使いすぎて最低返済額を割らないように。3か月連続の滞納は即終了よ。</p>')}

<h3>マイクリカード</h3>
<p>仕入れはカードでも払えます。<b>締め日は月の第3週の終わり</b>。第1〜3週の利用分は<b>翌月末</b>、月の最終週の利用分は<b>翌々月末</b>に口座から引き落とされます（どの利用も引き落としまで最低5週）。請求のお知らせメールは引き落としの<b>2週前</b>に届きます。残高が足りないと不足分は<b>リボ払い</b>になり、手数料3%とともに借金に上乗せされます（石田三成の奥義「大一大万大吉」でリボにならない）。カード払いには1%（ポイ活の鬼で2%）のポイントが付きます。</p>
<p>利用枠は外出「カード増枠の申請」で上げます（審査あり・8週に1回）。</p>
${table(['段階', '利用枠', '審査の目安', 'ステージ'], tierRows)}
<h3>固定費・生活費・暮らし</h3>
<ul>
  <li>スキルツリーのツール・倉庫・外注には<b>月額</b>がかかる（ノードの説明に記載）。仕組み化ルートの熟練度・物流センターで安くなる</li>
  <li>専業（ステージ3）になると毎月<b>生活費 ${yen(LIVING_COST)}</b>（フランクリンの奥義で2割引き）</li>
  <li>法人化（ステージ4）すると設立費 ${yen(CORP_SETUP)}、毎月の<b>社会保険 ${yen(CORP_SOCIAL)}</b></li>
  <li>暮らしを上げると毎月の出費が積み上がる（<a href="#career">第9章</a>）</li>
</ul>
<h3>税金（確定申告）</h3>
<p>毎年<b>2月第3週</b>に、その年度（4月〜）の事業所得で確定申告があります。個人は所得税＋住民税の累進（基礎控除58万円）、法人は<b>実効税率25%＋均等割7万円</b>（ゲーム用の簡略化）。「申告しない」も選べますが、税務署はフリマの売上データを見ています。「資金繰り表」「節税の知恵」「経営者の眼」「簿記3級」、三成の奥義（-30%）で税額が下がります。</p>
<h3>経営の数字（KPI）</h3>
<p>経営画面の「成績」に出る指標は、スキルツリーの経営ルートで増えていきます。月ごとの純利益のグラフと、在庫を持っている日数の分布も見られます。</p>
${table(['段階', '指標', '意味'], kpiRows)}
`);

// ======================================================================
// 07 成長（経験点・基礎能力）
// ======================================================================
const effLv = [20, 40, 60, 80, 100];
const gs = createGame(1);
const abRows = ABILITIES.flatMap((a) => {
  const eff = effLv.map((lv) => abilityEffects(gs, a.id, lv));
  return eff[0].map((e, i) => [i === 0 ? `<b>${esc(a.name)}</b><br><small>${esc(a.desc)}</small>` : '', esc(e.label), ...eff.map((x) => `<span class="num">${esc(x[i].value)}</span>`)]);
});
const costRows = [20, 40, 60, 80, 90].map((lv) => [`${lv}→${lv + 1}`, ...ABILITIES.map((a) => expChips(abilityCost(a.id, lv)))]);
const rankScale = [['S', 90], ['A', 80], ['B', 70], ['C', 60], ['D', 50], ['E', 40], ['F', 20], ['G', 0]];
const ch07 = chapter('growth', 7, 'GROWTH', '成長：経験点と基礎能力', '行動で5種類の経験点を貯め、基礎能力（目利き・仕入れ・出品・交渉・梱包）とスキルツリーに使う。', 'assets/backgrounds/park.jpg', chrisPose('guts'), `
<h3>5種類の経験点</h3>
<div class="chips" style="margin:10px 0">${EXP_TYPES.map((e) => `<span class="x ${e.id}" style="font-size:14px;padding:3px 12px">${e.name}</span>`).join('')}</div>
<p>行動ごとに決まった経験点が入り、<b>やる気</b>で倍率がかかります（絶不調×0.6〜絶好調×1.4）。「学びの習慣」「決算の勘」「経営者の眼」などで獲得量が増えます。余った経験点は能力画面の「経験点の振り替え」で、別の種類に<b>半分の値</b>（×${CONVERT_RATE}）で移せます。</p>
<h3>基礎能力</h3>
<p>能力は0〜${ABILITY_MAX}（初期20）。ランクは ${rankScale.map(([r, v]) => `<b class="r-${r}">${r}</b>（${v}〜）`).join('・')}。能力の画面で<b>+1 / +5</b> と上げるほか、下の<b>「自動で割り振る」</b>で、いまの経験点で上げられるだけ<b>低い能力から順に</b>上げられます。スキルツリーの「目利きの修行」など繰り返しパネルでも+3ずつ上がります。</p>
${shots(phone('rv_abilities', '基礎能力の画面', 'いまの効果と+5したときの効果。下に「戻る」と「自動で割り振る」'))}
<h4>能力ごとの効果（値ごと）</h4>
${table(['能力', '効果', ...effLv.map((l) => `${l}`)], abRows)}
<h4>+1 に必要な経験点</h4>
<p>10ごとに1.5ずつ高くなります。</p>
${table(['能力値', ...ABILITIES.map((a) => a.name)], costRows)}
${tip('mine', '<p>序盤は<b>目利き</b>（見立てのぶれが減る）と<b>出品</b>（出品枠と高めでも売れる幅）が効くわ。スキルツリーの上位パネルには「目利き50以上」「出品50以上」などの条件があるから、ルートに合わせて伸ばして。</p>')}
`);

// ======================================================================
// 08 スキルツリー
// ======================================================================
const KIND = { root: ['中心', 'gold'], starter: ['入門（熟練度に数えない）', 'good'], unlock: ['解放', 'info'], perk: ['常時効果', ''], repeat: ['強化（くり返し）', ''], gold: ['偉人の奥義', 'gold'], record: ['記録パネル', 'pink'], capstone: ['到達点', 'gold'] };
function treeMap() {
  const U = 54;
  const nodes = TREE_NODES.map((sk) => ({ sk, ...nodePos(sk) }));
  const xs = nodes.map((n) => n.x);
  const ys = nodes.map((n) => n.y);
  const minX = Math.min(...xs) - 3.6;
  const maxX = Math.max(...xs) + 3.6;
  const minY = Math.min(...ys) - 1.5;
  const maxY = Math.max(...ys) + 1.5;
  const W = (maxX - minX) * U;
  const H = (maxY - minY) * U;
  const X = (x) => (x - minX) * U;
  const Y = (y) => (y - minY) * U;
  const byId = Object.fromEntries(nodes.map((n) => [n.sk.id, n]));
  const edges = nodes.filter((n) => n.sk.parent).map((n) => {
    const p = byId[n.sk.parent];
    const c = ROUTE_MAP[n.sk.route].color;
    return `<line x1="${X(p.x).toFixed(1)}" y1="${Y(p.y).toFixed(1)}" x2="${X(n.x).toFixed(1)}" y2="${Y(n.y).toFixed(1)}" stroke="${c}" stroke-opacity="0.55" stroke-width="3"/>`;
  }).join('');
  const labels = ROUTES.map((r) => {
    const a = (r.angle * Math.PI) / 180;
    const far = Math.max(...nodes.filter((n) => n.sk.route === r.id).map((n) => Math.hypot(n.x, n.y))) + 1.5;
    const lx = Math.max(minX + 1.2, Math.min(maxX - 1.2, Math.cos(a) * far));
    const ly = Math.max(minY + 0.5, Math.min(maxY - 0.5, Math.sin(a) * far));
    return `<text x="${X(lx).toFixed(1)}" y="${Y(ly).toFixed(1)}" fill="${r.color}" font-size="19" font-weight="700" text-anchor="middle" dominant-baseline="middle" paint-order="stroke" stroke="#0a0f22" stroke-width="5">${esc(r.name)}</text>`;
  }).join('');
  const circles = nodes.map(({ sk, x, y }) => {
    const c = sk.route ? ROUTE_MAP[sk.route].color : '#f5c542';
    const r = sk.kind === 'root' ? 24 : sk.kind === 'capstone' ? 20 : 15;
    const dash = sk.kind === 'record' ? ' stroke-dasharray="4 3"' : '';
    const ring = sk.kind === 'gold' ? `<circle cx="${X(x)}" cy="${Y(y)}" r="${r + 5}" fill="none" stroke="#f5c542" stroke-width="2"/>` : sk.kind === 'capstone' ? `<circle cx="${X(x)}" cy="${Y(y)}" r="${r + 6}" fill="none" stroke="${c}" stroke-opacity="0.5" stroke-width="2"/>` : '';
    const ic = sk.icon ? `<image href="${A(sk.icon)}" x="${X(x) - r * 0.78}" y="${Y(y) - r * 0.78}" width="${r * 1.56}" height="${r * 1.56}" style="image-rendering:pixelated"/>` : '';
    return `<g><title>${esc(sk.name)}：${esc(sk.desc)}</title>${ring}<circle cx="${X(x)}" cy="${Y(y)}" r="${r}" fill="#0b1230" stroke="${c}" stroke-width="2.5"${dash}/>${ic}<text x="${X(x)}" y="${Y(y) + r + 12}" fill="#e9ecff" font-size="9.5" text-anchor="middle" paint-order="stroke" stroke="#0a0f22" stroke-width="3">${esc(sk.name)}</text></g>`;
  }).join('');
  return `<div class="tree-map"><div class="hint">← 横にスクロールできます →</div><svg viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}" role="img" aria-label="スキルツリーの全体図">${edges}${labels}${circles}</svg></div>
<div class="legend"><span><i style="background:#0b1230;border:2px solid #fff"></i>パネル</span><span><i style="background:#0b1230;border:2px dashed #fff"></i>記録パネル</span><span><i style="background:#0b1230;border:2px solid #f5c542;box-shadow:0 0 0 2px #f5c54255"></i>偉人の奥義</span><span><i style="background:#0b1230;border:3px double #fff"></i>到達点（大きい円）</span></div>`;
}
const GOLD_HERO = Object.fromEntries(COMPANIONS.filter((c) => c.gold).map((c) => [c.gold, c.who]));
const ABN = Object.fromEntries(ABILITIES.map((a) => [a.id, a.name]));
function nodeCard(sk) {
  const [kname, kcls] = KIND[sk.kind] || [sk.kind, ''];
  const req = [];
  if (sk.parent) req.push(`<span>「${esc(SKILL_MAP[sk.parent].name)}」の先</span>`);
  for (const r of sk.req || []) req.push(`<span>「${esc(SKILL_MAP[r].name)}」が必要</span>`);
  if (sk.stage) req.push(`<span>ステージ${sk.stage}〜</span>`);
  if (sk.flag === 'license') req.push('<span>古物商許可</span>');
  for (const [k, v] of Object.entries(sk.need || {})) req.push(`<span>${ABN[k]}${v}以上</span>`);
  for (const g of sk.gate || []) req.push(`<span>${g.flag ? esc(g.label) : `${esc(g.label)} ${g.target.toLocaleString()}`}</span>`);
  if (sk.toku?.min !== undefined) req.push(`<span>TOKU${sk.toku.min}以上</span>`);
  if (sk.toku?.max !== undefined) req.push(`<span>TOKU${sk.toku.max}未満</span>`);
  if (sk.kind === 'gold') req.push(`<span>${esc(CAST[GOLD_HERO[sk.id] || sk.hero]?.name || '偉人')}からコツを教わる</span>`);
  if (sk.kind === 'capstone') req.push(`<span>このルートのパネル${CAPSTONE_NEED}個</span>`);
  if (sk.kind === 'record') req.push(`<span>${esc(sk.record.label)} ${sk.record.target.toLocaleString()}（無料）</span>`);
  const cost = sk.kind === 'record' ? pill('コスト0', 'good') : sk.kind === 'root' ? pill('コスト0', 'good') : expChips(sk.cost);
  return `<div class="node k-${sk.kind}"><div class="ni">${sk.icon ? img(sk.icon, '') : ''}</div><div><b>${esc(sk.name)}</b><span class="kind">${pill(kname + (sk.max ? ` ×${sk.max}` : ''), kcls)}</span>${sk.monthly ? ` ${pill(`月額${man(sk.monthly)}`, 'bad')}` : ''}${sk.tokuDelta ? ` ${pill(`TOKU${sk.tokuDelta}`, 'bad')}` : ''}<p>${esc(sk.desc)}</p><div class="chips">${cost}</div><div class="req">${req.join('')}</div></div></div>`;
}
const routeSections = ROUTES.map((r) => {
  const list = TREE_NODES.filter((n) => n.route === r.id).sort((a, b) => a.depth - b.depth || a.lane - b.lane);
  let perks = null;
  try { perks = routePerkText(r.id); } catch { /* 熟練度ボーナスのないルート */ }
  const perkHtml = perks ? perks.map((p) => pill(`熟練Lv${p.lv}（${ROUTE_LEVELS[p.lv - 1]}枚）：${p.text}`, 'gold')).join('') : pill('熟練度ボーナスなし（到達点が強力）', '');
  return `<div class="route" style="--rc:${r.color}"><div class="route-head"><div class="badge">${esc(r.name[0])}</div><div><h4>${esc(r.name)} <small class="muted">— 極めると称号「${esc(r.title)}」</small></h4><p>${esc(r.desc)}</p></div></div><div class="route-body"><div class="route-perks">${perkHtml}</div><div class="nodes">${list.map(nodeCard).join('')}</div></div></div>`;
}).join('');
const redRows = SKILLS.filter((s) => s.kind === 'red').map((s) => [`<b>${esc(s.name)}</b>`, esc(s.desc), expChips(s.cost)]);
const ch08 = chapter('tree', 8, 'SKILL TREE', 'スキルツリー全貌：9つのルート・全パネル', `中心「押し入れの宝の山」から9つのルートが放射状に伸びる。全${TREE_NODES.length}パネルの効果・コスト・解放条件。`, 'assets/backgrounds/online.jpg', CAST.mine.poses.sparkle, `
<p class="lead">スキルツリーは、経験点を払ってパネルを解放する成長システムです。どの方向に伸ばしたかで<b>称号</b>（そのルートのパネルを4枚以上）と<b>得意分野</b>が決まります。</p>
${treeMap()}
${shots(phone('rv_tree', 'スキルツリーの画面', '指でドラッグ・ピンチで動かす。光っているパネルが解放できるもの'), phone('tree_detail', 'パネルを選んだところ', '下に効果・コスト・足りない条件'))}
<h3>ルールのまとめ</h3>
<div class="grid g2">
  <div class="card"><h4 style="margin-top:0">見え方</h4><p>親パネルを持っていると子パネルが見える。条件を満たした親の先は「？」で存在だけわかる。</p></div>
  <div class="card"><h4 style="margin-top:0">ルート熟練度</h4><p>同じルートのパネルを<b>${ROUTE_LEVELS.join('枚・')}枚</b>持つと熟練Lv1・Lv2のボーナス（入門パネルは数えない。強化パネルは1回でも取れば1枚）。</p></div>
  <div class="card"><h4 style="margin-top:0">専門外コスト</h4><p>パネルを4枚以上持ったら、<b>上位2ルート以外</b>のパネルはコスト×${OFF_ROUTE_RATE}（入門・記録は対象外）。あれもこれもは高くつく。</p></div>
  <div class="card"><h4 style="margin-top:0">到達点（キャップストーン）</h4><p>そのルートのパネルを<b>${CAPSTONE_NEED}個</b>そろえ、能力条件を満たすと解放。強力で、2周目以降に1つ<b>引き継げる</b>。</p></div>
  <div class="card"><h4 style="margin-top:0">偉人の奥義（金のパネル）</h4><p>偉人のイベントで<b>コツ</b>を教わると解放できる。コツのLvが上がるほど安くなる（最大60%引き）。</p></div>
  <div class="card"><h4 style="margin-top:0">記録パネル（丸）</h4><p>累計の記録（店舗せどりの回数・獲得ポイントなど）が目標に届くと<b>無料</b>で解放できる。</p></div>
  <div class="card"><h4 style="margin-top:0">強化（くり返し）</h4><p>同じパネルを最大回数まで何度も取れる。2回目以降はコストが2倍・3倍…と上がる。</p></div>
  <div class="card"><h4 style="margin-top:0">正道と魔道</h4><p>正道は<b>TOKUが高い</b>と、魔道は<b>TOKUが80未満</b>で取れる。魔道は取るたびにTOKUが15下がる（到達点は-100）。</p></div>
</div>
<h3>ルート別：全パネル</h3>
${routeSections}
<h3>不調パネル（ツリーには出ない）</h3>
<p>イベントで付くマイナスの効果。経験点を払うと治せます。腱鞘炎・腰痛・寝不足は外出「通院・治療」でも治せます（${TREATMENTS.map((t) => `${t.name}：${t.where}${yen(t.fee)}`).join('・')}）。</p>
${table(['不調', '効果', '治すコスト'], redRows)}
`);

// ======================================================================
// 09 キャリア
// ======================================================================
const STAGE_UP = {
  1: '直近2か月の純利益がどちらも5万円以上',
  2: '直近3か月の純利益の合計90万円以上・赤字の月なし → 専業になるかを選ぶ（断ると12週後に再判定）',
  3: '直近12か月の純利益の合計800万円以上 → 法人化するかを選ぶ（設立費25万円。断ると24週後に再判定）',
  4: '直近12か月の純利益の合計1,800万円以上 ＋ 外注3種（撮影・出品／梱包・発送／リサーチ・仕入れ）',
  5: '最終ステージ。志を決めていれば志の目標、なければ純資産の目標',
};
const STAGE_GET = {
  1: '1週に行動1回。バイトができる',
  2: '夜の行動（週1回・体力+5）。資格講座・寄付・中国輸入。ライバル・業界の動き・暮らし・キャリアのメニュー',
  3: '行動が週2回（バイトは消える）。毎月の生活費。外注・業者オークション・百貨店。顧客層からのキャリアの誘い',
  4: '税金が法人税に。毎月の社会保険。問屋取引・物流倉庫・自分の店・スタッフ。志を選ぶ。仮想通貨（現金1,000万円以上）',
  5: '自社ブランド・買取事業・情報発信。事業売却の打診（直近12か月の純利益1,000万円以上）',
};
const roadHtml = STAGES.map((st) => `<div class="st"><div class="no"><span><small>STAGE</small>${st.id}</span></div><div><h4>${esc(st.name)} <small class="muted">目安 ${esc(st.period)}</small></h4><p style="margin:0">${esc(st.goal)}</p><p style="margin:6px 0 0"><span class="pill info">できるようになること</span> ${esc(STAGE_GET[st.id])}</p><div class="cond"><b class="gold">次へ：</b>${esc(STAGE_UP[st.id])}</div></div></div>`).join('');
const visionCards = Object.entries(VISIONS).map(([id, v]) => `<div class="person"><img src="${A(heroImg(v.mentor))}" alt=""><div><h4>${esc(v.name)}<small>見届け人：${esc(CAST[v.mentor].name)}</small></h4><p style="margin:2px 0;font-size:13px">${esc(v.desc)}</p><ol>${v.milestones.map((m) => `<li>${esc(m.title)}</li>`).join('')}</ol><div class="reward">3つ達成で <b>${esc(v.full.title)}</b>${v.career ? `／キャリア「${esc(CAREERS[v.career].name)}」が必要` : ''}</div></div></div>`).join('');
const careerCards = Object.entries(CAREERS).map(([id, c]) => `<div class="person"><img src="${A(heroImg(c.hero))}" alt=""><div><h4>${esc(c.name)}<small>${esc(CAST[c.hero].name)}が誘う</small></h4><p style="margin:2px 0;font-size:13px">顧客層「${esc(AUDIENCES[c.aud].name)}」が${c.need}を超えると誘いが来る（ステージ3〜）</p><div class="reward">${esc(c.perk)}<br><small class="muted">1回に使う経験点：</small>${expChips(c.cost)}</div></div></div>`).join('');
const courseRows = COURSES.map((c) => [`<b>${esc(c.name)}</b>`, `<small>${esc(c.desc)}</small>`, yen(c.fee), `${c.sessions}回`, `ステージ${c.stage}〜${c.cond ? '（輸出規制のあと）' : ''}`]);
const lifeRows = LIFESTYLES.map((l, i) => [i ? `${i}` : '0', `<b>${esc(l.name)}</b>`, l.need ? `直近3か月の平均純利益 ${man(l.need)}` : '最初', l.cost ? `+${yen(l.cost)}/月` : '—', esc(l.perk || '')]);
const locRows = Object.values(LOCATIONS).map((l) => [`<b>${esc(l.name)}</b>`, `${yen(l.rent)}/月`, `${l.traffic}`, `×${l.tolerance}`, `<small>${esc(l.desc)}</small>`]);
const deptRows = DEPT_RANKS.map((d) => [`<b>${esc(d.name)}</b>`, d.need ? `年間 ${man(d.need)}` : '—', esc(d.perk || '')]);
const coinRows = Object.values(COINS).map((c) => [`<b>${esc(c.name)}</b>`, c.ticker, `<small>${esc(c.desc)}</small>`]);
const ch09 = chapter('career', 9, 'CAREER', 'キャリア：ステージ・志・キャリアパス・暮らし', '副業から専業、法人化、事業化へ。顧客層が育つとキャリアの誘いが来て、会社になったら「志」を掲げる。', 'assets/backgrounds/warehouse.jpg', chrisPose('cheer'), `
<h3>5つのステージ</h3>
<p>昇格の判定は<b>月末</b>。HUDの「目標」に、いまの条件と進み具合が出ます。ステージが上がると、増えた行動・メニューがまとめて表示されます。</p>
<div class="road">${roadHtml}</div>
${tip('mine', '<p>ステージ3（専業）の条件は「3か月で90万円」だけじゃなく<b>赤字の月なし</b>。大きな在庫を抱えた月に赤字を出すと、判定が先に延びるわ。法人化も「純利益」で見るから、売上ではなく手残りを意識して。</p>')}
<p>6年目からは<b>年齢の壁</b>で、毎年体力の最大値が4ずつ下がります（下限60）。自分で動く量を減らす「仕組み化」が効いてきます。</p>

<h3>志（ステージ4〜）</h3>
<p>法人化したあとの週のはじめに、坂本龍馬に「この会社で何を成し遂げたいか」を聞かれます。志ごとに3段の目標があり、<b>3つとも達成</b>すれば志のエンディング、1〜2つなら「志半ばEND」。志は年に一度（${48}週ごと）変えられます。</p>
<div class="people">${visionCards}</div>
${shots(phone('rv_careers', 'キャリア', '志の目標・顧客層の育ち具合・キャリアの誘い'))}

<h3>顧客層とキャリアパス（ステージ3〜）</h3>
<p>商品を売るたびに、その商品の<b>顧客層</b>（${Object.values(AUDIENCES).map((a) => a.name).join('・')}）が育ちます（評価が高いほど伸びる）。一定を超えると偉人が「その道」に誘い、受けると専用の行動が開きます。行動は余りがちな経験点を使います。</p>
<div class="people">${careerCards}</div>

<h3>資格講座（ステージ2〜）</h3>
<p>外出「資格講座に通う」で受講料を払い、何回か通うと資格が取れます。行動・精神の経験点が多めに入るのも利点。</p>
${table(['講座', '効果', '受講料', '回数', '時期'], courseRows)}

<h3>暮らし（生活水準）</h3>
<p>稼げるようになると、次の暮らしへの誘いが来ます。上げると体力・やる気に効きますが、毎月の出費が積み上がり、<b>下げるとやる気-2</b>（24週は上げられない）。</p>
${table(['Lv', '暮らし', '誘いの条件', '毎月の出費', '効果'], lifeRows)}
${shots(phone('rv_life', '暮らし', '家族の信頼と、暮らしの段階'))}

<h3>自分の店（ステージ4〜）</h3>
<p>資格「店舗経営講座」を取ると、外出「店を開く」で立地を選んで出店できます（保証金は家賃3か月）。<b>出品していない在庫が店頭に並び</b>、毎週お客さんが来て買っていきます（手数料・送料なし）。改装・スタッフ（月${yen(STAFF_COST)}）・買取カウンターで強化。</p>
${table(['立地', '家賃', '客足', '値付けの許容', '特徴'], locRows)}
${shots(phone('rv_shop', '自分の店', '先週の成績と、店づくり'))}
<h3>スタッフ（ステージ4〜）</h3>
<p>求人に応募が来ると、梱包・発送を任せるスタッフを雇えます。${Object.values(STAFF_KINDS).map((k) => `<b>${esc(k.name)}</b>（月${yen(k.wage)}）`).join('と')}。未経験は最初ミスが多いですが、育ちます。</p>

<h3>百貨店とコレクション（ステージ${DEPT_STAGE}〜）</h3>
<p>外出「百貨店で買い物」で自分のための買い物をすると、年間の購入額で<b>外商のランク</b>が上がり、品薄の限定品を定価で案内してもらえるようになります。美術画廊ではコレクション（全${PIECES.length}点・${Object.values(RARITY_NAME).join('／')}）を集められ、シリーズをそろえると+${man(SERIES_BONUS)}の評価。ステージ${MUSEUM_STAGE}で${man(MUSEUM_COST)}の<b>私設美術館</b>を開くと入館料が入ります（維持費 月${man(MUSEUM_UPKEEP)}）。コレクションは評価額で純資産に入ります。</p>
${table(['外商のランク', '年間の購入額', '特典'], deptRows)}
${shots(phone('rv_collection', 'コレクション', '刀剣・指輪・首飾りなどのシリーズ'))}

<h3>仮想通貨（ステージ${CRYPTO_STAGE}〜）</h3>
<p>現金が${man(CRYPTO_CASH)}を超えると、サトシが「余剰資金での投資」として戻ってきます。受けるとメニュー「仮想通貨」でいつでも売買（行動は使わない）。断ると二度と来ません（精神+60・TOKU+5）。毎週2%でバブルか暴落が起きます。最後に<b>資産の半分以上が仮想通貨の儲け</b>なら「結局クリプトEND」。</p>
${table(['銘柄', 'ティッカー', '特徴'], coinRows)}
${shots(phone('rv_crypto', '仮想通貨', '3つの銘柄を円で売買'))}

<h3>事業売却（イグジット）</h3>
<p>ステージ5で直近12か月の純利益が1,000万円以上あると、ファンドから<b>事業買収の打診</b>が来ることがあります（最終年を除く）。買値は年間利益×残り年数の9割（最大3年分）。売ればその場でゲームが終わり<b>イグジットEND</b>。遅くなるほど安くなります。</p>
`);

// ======================================================================
// 10 仲間
// ======================================================================
const MEET = {
  ino: ['店舗せどり中（40%）', '2回目：8週目以降', '3回目：18週目以降・仕入れ40以上'],
  gennai: ['撮影・出品作業中（45%）', '2回目：6週目以降', '3回目：出品45以上'],
  ikkyu: ['取引トラブルを1件経験した週のはじめ', '2回目：トラブル4件', '3回目：トラブル10件'],
  mitsunari: ['図書館で勉強中（40%）', '2回目：28週目以降', '3回目：60週目以降'],
  newton: ['物販交流会で（50%）', '2回目：カエルキッズのブームか暴落中', '3回目：80週目以降'],
  nobunaga: ['物販交流会で・16週目以降、評価60以上か粗利30万円以上', '2回目：24週目以降', '3回目：ステージ3以上'],
  marco: ['電脳せどり中・6週目以降', '2回目：撮影・出品作業中（ステージ2・海外未経験）', '3回目：海外ECで5点売る'],
  marx: ['気晴らし中（40%）', '2回目：12週目以降', '3回目：96週目以降'],
  satoshi: ['週のはじめ・14週目以降・現金5万円以上', '2回目：32週目以降・現金10万円以上', '3回目：120週目以降'],
  goemon: ['電脳せどり中・10週目以降', '2回目：40週目以降', '3回目：70週目以降'],
  nostra: ['図書館で勉強中・5週目以降', '2回目：30週目以降', '3回目：100週目以降'],
  ryoma: ['物販交流会で・24週目以降', '2回目：ステージ3以上', '3回目：ステージ4以上'],
  yukichi: ['図書館で勉強中（25%）', '2回目：24週目以降', '3回目：借金を完済したあと'],
  edison: ['撮影・出品作業中・ステージ2以上', '2回目：累計150点販売', '3回目：ステージ3・出品50以上'],
  ieyasu: ['休む・20週目以降', '2回目：12週以上持っているコレクター品・高級品・限定品が3つ', '3回目：150週目以降・ステージ3'],
  davinci: ['店舗せどり中・16週目以降・古物商許可', '2回目：目利き45以上', '3回目：目利き65以上'],
  napoleon: ['撮影・出品作業中・在庫25点以上', '2回目：累計200点販売', '3回目：ステージ3・梱包50以上'],
  nightingale: ['休む・10週目以降・体力50未満', '2回目：通院・治療で', '3回目：100週目以降'],
  franklin: ['図書館で勉強中・12週目以降', '2回目：40週目以降', '3回目：専業になったあと'],
  darwin: ['電脳せどり中・24週目以降', '2回目：規制が1つ以上入ったあと', '3回目：180週目以降'],
};
const EXTRA = {
  marco: '抽選「限定の嗅覚」のコツ。海外ECへの道',
  marx: '「鋼のメンタル」のコツ',
  satoshi: '仮想通貨のささやき（甘い話に注意）',
  goemon: '出所不明品の卸（買うと違法。断るとTOKU+8）',
  nostra: '相場の大予言（5年目からの業界の年表を予告）',
  ryoma: '法人化と志の相談役',
  yukichi: 'お金と学びの話。完済で最後の出会い',
};
const peopleCards = COMPANIONS.map((c) => {
  const cast = CAST[c.who];
  const reward = c.gold ? `スキルツリーの奥義 <b>「${esc(SKILL_MAP[c.gold].name)}」</b>のコツ：${esc(SKILL_MAP[c.gold].desc)}` : c.secret ? `奥義 <b>「${esc(SECRETS[c.secret].name)}」</b>：${esc(SECRETS[c.secret].desc)}` : esc(EXTRA[c.who] || '経験点と助言');
  return `<div class="person"><img src="${A(heroImg(c.who))}" alt=""><div><h4>${esc(cast.name)}<small>${esc(cast.title || '')}</small></h4><ol>${(MEET[c.who] || []).map((m) => `<li>${esc(m)}</li>`).join('')}</ol><div class="reward">${reward}</div></div></div>`;
}).join('');
const ch10 = chapter('people', 10, 'COMPANIONS', '仲間（偉人）：出会い方と奥義', '20人の偉人それぞれに3段階の出会いがあり、最後にスキルの「コツ」や特別な「奥義」を授けてくれる。', 'assets/backgrounds/park.jpg', null, `
<p class="lead">偉人は、特定の行動をしたときや週のはじめに、確率で現れます。出会いは3段階で、段階が進むほど条件が厳しくなります。メニュー「仲間」で、何人に出会い、何段階まで進んだかを確認できます（まだ会っていない人は「？？？」）。</p>
${shots(phone('rv_companions', '仲間', '出会いの段階（●の数）と、教わったコツ'))}
<div class="people">${peopleCards}</div>
${tip('mine', '<p>奥義のコツは<b>同じ人に何度か会うほどLvが上がって</b>、スキルツリーで安く取れるようになるわ。伊能忠敬に会いたいなら店舗せどり、平賀源内なら撮影・出品作業を続けるのが近道ね。</p>')}
<h3>そのほかの人たち</h3>
<div class="people">
  <div class="person"><img src="${A(heroImg('santa'))}" alt=""><div><h4>サンタクロース<small>12月の依頼人</small></h4><p style="font-size:13px;margin:4px 0">12月の第2〜4週、「冬の甘えんぼ王子ウィンター」か「フォトングラス」を持っていると現れ、<b>定価で譲ってほしい</b>と頼まれる。譲るとやる気+2・炎上度-15、そして「まっとうな商人END」への道が開く。</p></div></div>
  <div class="person"><img src="${A(heroImg('ieyasu'))}" alt=""><div><h4>徳川家康<small>規制の番人</small></h4><p style="font-size:13px;margin:4px 0">休むと会える仲間でもあり、規制の時代の語り部でもある。奥義は持っている品の相場を上げる。</p></div></div>
  <div class="person"><img src="${A(CAST.chris.poses.arms)}" alt="" style="object-fit:contain"><div><h4>師匠<small>先代の転売屋</small></h4><p style="font-size:13px;margin:4px 0">2周目以降、前の周のクリスが師匠になる。外出「師匠に相談」（12週に1回）で、いちばん伸ばした能力の経験点と、歩んだルートにちなんだ助言がもらえる。</p></div></div>
</div>
`);

// ======================================================================
// 11 世界の動き
// ======================================================================
const rivalAct = { cao: '仕入れ先に乗り込んで買い占める（荒れ具合+30）', edison: '転売ボットで抽選・在庫復活を8週独占', gogh: '業者オークションで競り合う（荒れ具合+35）', billy: 'あなたが多く出品している品を1割以上安く並べ、相場を下げる' };
const rivalCards = RIVALS.map((r) => `<div class="person"><img src="${A(portraitOf(r.cast))}" alt=""><div><h4>${esc(r.name)}<small>${esc(r.style)}・ステージ${r.stage}〜</small></h4><p style="font-size:13px;margin:4px 0">${esc(r.intro)}</p><div class="reward">仕掛け：${esc(rivalAct[r.id])}</div></div></div>`).join('');
const regimeRows = Object.values(REGIMES).map((g) => [`<b>${esc(g.name)}</b>${g.positive ? ` ${pill('商機', 'good')}` : ''}`, `<small>${g.rules('対象の品').map(esc).join('<br>')}</small>`, `<small>${esc(g.hint)}</small>`]);
const annalRows = Object.values(ANNALS).map((a) => [`<b>${esc(a.name)}</b>`, `<small>${esc(a.announce)}</small>`, esc(a.mission.title)]);
const liveCards = LIVE_EVENTS.map((e) => `<div class="good-card">${pimg(e.pid)}<b>${esc(e.name)}</b><small>${e.from[0]}/${e.from[1]}〜${e.to[0]}/${e.to[1]}</small><small>${esc(P[e.pid].name)}</small></div>`).join('');
const ch11 = chapter('world', 11, 'WORLD', '世界の動き：ライバル・規制・年表・季節', '稼ぐほど目立ち、対策が入り、ライバルが乗り込んでくる。いたちごっこの10年。', 'assets/backgrounds/danger.jpg', chrisPose('arms'), `
<h3>ライバル転売屋（ゴースト・偉人）</h3>
<p>ステージ3から1人ずつ、金に取り憑かれた偉人の亡霊が乗り込んできます。毎月の<b>長者番付</b>（純資産）で競い、抜くと対人+30・精神+30。4人とも抜くと実績「番付の上へ」。</p>
<div class="people">${rivalCards}</div>
<h3>規制と対策（いたちごっこ）</h3>
<p>稼いでいる商材・販路ほど<b>目立ち度</b>が溜まり、100を超えると対策が予告され、<b>8週後に施行</b>されます。高値で売る（定価の1.5倍超）ほど目立ちます。予告の間に売り切るのが鉄則。</p>
${table(['対策', '内容', 'マインの助言'], regimeRows)}
<h3>業界の年表（${ANNALS_FROM_YEAR}年目〜）</h3>
<p>${ANNALS_FROM_YEAR}年目から毎年、業界の大事件が1つ起きます。年の初めにノストラダムスが予告し、春に始まり、年末にミッションの結果が出ます。事件はあなたの稼ぎ方に関係するものが選ばれやすくなります。</p>
${table(['事件', '予告', 'その年のミッション'], annalRows)}
<h3>季節</h3>
<ul>
  <li><b>12月は年末商戦</b>：買い手1.25倍・トラブル1.3倍。年明け第1週は発送ラッシュで体力-10</li>
  <li><b>季節商品</b>：雛人形（3月）・諏訪法性兜（5月）・ウィズダムネックレス（母の日）・エリートギョク（お中元）・ブレイブヨロイ（ハロウィン）など。シーズン後は値崩れするが、海外ECなら定価近くで売れることも</li>
  <li>ステージには季節の演出（春の花びら・夏の光・秋の葉・冬の雪）と、夜の行動では夜の色</li>
</ul>
${shots(phone('season_spring', '春', ''), phone('season_autumn', '秋', ''), phone('season_winter', '冬', ''))}
<h3>期間限定フェア（現実の日付）</h3>
<p>現実のカレンダーに合わせて、期間限定の商品が店と通販に並びます（チュートリアル後）。</p>
<div class="goods">${liveCards}</div>
<h3>暮らしのパラメータ</h3>
<div class="grid g2">
  <div class="card"><h4 style="margin-top:0">体力と体調</h4><p>行動後の体力が25を切るような重い行動は<b>体調不良</b>の危険（行動カードに⚠）。体調を崩すと2週間は休むか通院しかできず、発送も遅れる。毎週+6回復（置き場が満杯だと+3）。体力30未満は疲れて相場の見立てがぶれ、偽物の手がかりを1つ見落とす。</p></div>
  <div class="card"><h4 style="margin-top:0">家族の信頼</h4><p>初期70（0〜100）。部屋が段ボールで埋まる（-3）・働きすぎ（体力25未満で-2）で下がり、何もなければ毎週+1。30以下になると家族会議（向き合えば+25）。80以上だと家族が梱包を手伝ってくれることも（体力+10）。100で10年を終えると実績「家族の応援」。</p></div>
  <div class="card"><h4 style="margin-top:0">炎上度</h4><p>品薄品の買い占め・高値の転売・違法行為で上がる。40以上でSNSで名指しされ、50以上で炎上イベント、80以上でアカウント警告。60以上で終えると称号「炎上系セラー」。</p></div>
  <div class="card"><h4 style="margin-top:0">評価</h4><p>初期50。取引が終わるたびに少しずつ上がり（即レスでさらに）、発送遅れ・トラブルで下がる。買い手の人数に直結する。</p></div>
</div>
`);

// ======================================================================
// 12 正道と魔道
// ======================================================================
const ch12 = chapter('dark', 12, 'LIGHT & DARK', '正道と魔道：TOKUと裏社会', 'TOKU（徳）が高ければ正道・商社へ、低ければ魔道へ。0になれば裏の人間に。戻る道は「蜘蛛の糸」だけ。', 'assets/backgrounds/danger.jpg', chrisPose('sad'), `
<h3>TOKU（徳）</h3>
<p>基準100（0〜200）。日々の活動への影響は小さいですが、<b>キャリアの分かれ道</b>になります。寄付・地域の手伝い（ステージ2〜）、サンタの頼みを聞く、出所不明品を断る、仮想通貨を断るなどで上がり、魔道のパネル・違法行為で下がります。</p>
<div class="grid g2">
  <div class="card" style="border-color:#e5e7eb66"><h4 style="margin-top:0">正道・商社ルート</h4><p>TOKU110以上から。公正な取引→正規代理店・事業の信用→従業員の育成・メーカー直取引→業界の信頼→<b>総合商社</b>（TOKU170・毎月+150万円）。志「総合商社」の土台。</p></div>
  <div class="card" style="border-color:#b91c1c88"><h4 style="margin-top:0">魔道ルート</h4><p>TOKU80未満で取れる。転売ボット・並び屋・名義の大量取得・偽物の卸・盗品の買い取り。<b>安く強い</b>が、取るたびにTOKU-15。到達点「裏社会の帝王」でTOKU-100＝裏の人間に。</p></div>
</div>
<h3>裏の人間</h3>
<p>TOKUが0になると<b>裏の人間</b>になり、TOKUのゲージが消えます。表の販路はアカウント凍結（出品は取り下げ）、<b>裏市場</b>（仲介料20%・表の数倍の値）でしか売れません。毎月の暮らしは35万円。報復（在庫を奪われ2週動けない）や、まれに<b>襲撃</b>（週0.6%）があり、襲撃されると「闇に消えるEND」です。</p>
<h3>蜘蛛の糸</h3>
<p>裏の人間になって24週以上たつと、一休が「地獄にも一本だけ蜘蛛の糸が垂れておる」と現れます（毎週20%）。糸をつかむと<b>財産・在庫・スキルツリー・法人・店をすべて失い、基礎能力だけが残った状態</b>で、TOKU50・保護観察（表の販路の手数料が高い）から再出発。そのまま10年を終えると「蜘蛛の糸END」。</p>
<h3>違法行為と逮捕</h3>
<ul>
  <li>チケットを定価の5倍で売る（50%で書類送検・罰金30万円。逃れても前歴が残る）</li>
  <li>出所不明品（石川五右衛門）を買う → 2週後に警察が来て没収・前歴</li>
  <li><b>前歴がある状態で、もう一度出所不明品を買うと逮捕</b> → 御用END</li>
  <li>確定申告をしないと、あとで追徴課税されることも</li>
</ul>
${tip('warn', '<p>魔道は序盤から強力だけど、ランクは純資産で決まるから<b>捕まったら終わり</b>。裏社会の帝王ENDを狙うなら、ほかのエンディングとは別の周で。</p>')}
`);

// ======================================================================
// 13 エンディング
// ======================================================================
const END_HOW = {
  arrested: '違法行為の前歴があるのに、もう一度出所不明品を買う（その時点でゲーム終了）',
  bankrupt: `月末の最低返済を${MAX_DELINQUENCY}か月連続で滞納する（その時点でゲーム終了）`,
  vanished: '裏の人間でいる間に、襲撃にあう（毎週0.6%。その時点でゲーム終了）',
  exit: 'ステージ5で事業買収の打診を受け、売却する（その時点でゲーム終了）',
  kingpin: '裏の人間のまま10年を終える',
  spider: '裏の人間になったあと、蜘蛛の糸をつかんで足を洗い、10年を終える',
  continuing: '10年を終えた時点で、借金が残っている',
  crypto: '借金を返し終え、仮想通貨の儲けが純資産の半分以上',
  tycoon: '借金を返し終え、ステージ5で10年を終える',
  ceo: '借金を返し終え、ステージ4で10年を終える',
  honest: '借金を返し終え、ステージ3以下で、サンタの頼みを聞いたことがあり、炎上度25未満',
  pro: '借金を返し終え、ステージ3（専業）で10年を終える',
  side: '借金を返し終え、ステージ1〜2で10年を終える',
};
const badIds = new Set(['arrested', 'bankrupt', 'vanished']);
const endCards = Object.entries(ENDINGS).map(([id, e]) => `<div class="ending ${badIds.has(id) ? 'bad' : ['tycoon', 'ceo', 'exit', 'kingpin'].includes(id) ? 'good' : ''}"><img class="pose" src="${A(chrisPose(e.pose))}" alt=""><div><h4>${esc(e.title)}</h4><p class="how">${esc(END_HOW[id])}</p><blockquote>${e.lines.map(esc).join('<br>')}</blockquote></div></div>`).join('');
const visionEndCards = Object.entries(VISIONS).map(([id, v]) => `<div class="ending vision"><img class="pose" src="${A(chrisPose(v.full.pose))}" alt=""><img class="mentor" src="${A(heroImg(v.mentor))}" alt=""><div><h4>${esc(v.full.title)}</h4><p class="how">志「${esc(v.name)}」の3つの目標をすべて達成（志のエンディングは、事業家・物販会社社長・専業・まっとうな商人・副業 の代わりに出る）</p><blockquote>${v.full.lines.map(esc).join('<br>')}</blockquote></div></div>`).join('') + `<div class="ending vision"><img class="pose" src="${A(chrisPose('guts'))}" alt=""><div><h4>志半ばEND</h4><p class="how">志を掲げ、目標の1〜2つまで達成した</p><blockquote>志を掲げて走った5年だった。<br>目標の○つまでは届いた。残りは、まだ先にある。<br>「10年じゃ足りなかったな。……でも、まだ終わりじゃない」</blockquote></div></div>`;
const rankRows = RANKS.map((r) => `<div class="rank-row"><span class="r r-${r.rank}">${r.rank}</span><b>${esc(r.label)}</b><span class="num muted">${r.min === -Infinity ? '−150万円未満' : `${man(r.min)}以上`}</span></div>`).join('');
const titleRows = [
  ['裏社会の帝王', '裏の人間'], ['炎上系セラー', '炎上度60以上'], ...ROUTES.map((r) => [r.title, `「${r.name}」のパネルを4枚以上（いちばん伸ばしたルート）`]),
  ['トラブルバスター', '取引トラブルを10件以上'], ['買い占めの帝王', '品薄品を12個以上確保'],
  ...Object.entries(KIND_TITLES).map(([k, t]) => [t, `いちばん儲かった取引が「${{ staple: '定番', hype: '限定', collect: 'コレクター', boom: 'ブーム', luxury: '高級', seasonal: '季節', perishable: '生もの', home: '家の不用品', kuji: 'くじ' }[k]}」の品`]),
  ['見習いせどらー', 'まだ何も売っていない'],
];
const ch13 = chapter('endings', 13, 'ENDINGS', `エンディング全集：全${Object.keys(ENDINGS).length + Object.keys(VISIONS).length + 1}種`, '10年後の最終査定。純資産でランクが決まり、歩んだ道でエンディングが決まる。条件と判定の順番をすべて公開。', 'assets/backgrounds/title.jpg', chrisPose('sparkle'), `
<h3>最終査定</h3>
<p>480週目を終える（またはゲームオーバーになる）と最終査定。<b>純資産</b>＝現金＋入金待ちの売上金＋ポイント＋在庫の評価額（相場の7割・偽物と盗品は0）＋コレクションの評価額＋仮想通貨の時価 −借金 −カードの未払い。査定は順番に演出され（文 → 純資産のカウントアップ → ランクのはんこ）、10年の純利益のグラフと<b>名場面</b>（初めて売れた日・ステージが上がった日・完済・いちばん儲かった取引・いちばん稼いだ月）が並びます。</p>
${shots(phone('ending_top', '最終査定', 'エンディングの文・純資産・ランク・称号'), phone('ending_long', 'ふり返り', '10年のグラフ・名場面・実績・エンディングの回収数（枠の中をスクロール）', 'long'))}
${wide('result_card', '「結果を画像で保存」「シェアする」で作られる結果カード')}
<h3>ランク</h3>
<div class="ranks">${rankRows}</div>
<p>御用・債務整理・闇に消えるENDは、純資産にかかわらずランク<b class="r-G">G</b>です。</p>
<h3>エンディングの判定の順番</h3>
<div class="steps">
  <div><b>ゲームオーバー</b>御用（逮捕）→ 債務整理（滞納3か月）→ 闇に消える（襲撃）→ イグジット（事業売却）</div>
  <div><b>裏の道</b>裏の人間のまま → 裏社会の帝王END。足を洗った → 蜘蛛の糸END</div>
  <div><b>借金が残っている</b>→ 返済はつづくよEND</div>
  <div><b>仮想通貨</b>儲けが純資産の半分以上 → 結局クリプトEND</div>
  <div><b>ステージ</b>5 → 事業家、4 → 物販会社社長、（サンタ＋炎上度25未満 → まっとうな商人）、3 → 専業せどらー、1〜2 → 副業せどらー</div>
  <div><b>志</b>ステージ系の5つのENDのときだけ、志の目標3つ達成 → 志のEND、1〜2つ → 志半ばEND に置きかわる</div>
</div>
<h3>通常のエンディング（13種）</h3>
<div class="endings">${endCards}</div>
<h3>志のエンディング（6種）</h3>
<div class="endings">${visionEndCards}</div>
<h3>称号</h3>
<p>査定に出る称号は、上から順に最初に当てはまったものです。</p>
${table(['称号', '条件'], titleRows.map(([a, b]) => [`<b>${esc(a)}</b>`, esc(b)]))}
`);

// ======================================================================
// 14 実績
// ======================================================================
const ACH_ICON = ['assets/icons/emblem.webp', 'assets/icons/cp.webp', 'assets/icons/ce.webp', 'assets/icons/gum.webp', 'assets/icons/mch_icon.webp', 'assets/icons/resurrection.webp'];
const ch14 = chapter('achievements', 14, 'ACHIEVEMENTS', `実績：全${ACHIEVEMENTS.length}種`, '10年（またはゲームオーバー）の最後に判定され、この端末に記録される。タイトルの「実績」から確認できる。', 'assets/backgrounds/event.jpg', null, `
<div class="achs">${ACHIEVEMENTS.map((a, i) => `<div class="ach"><div class="medal"><img src="${A(ACH_ICON[i % ACH_ICON.length])}" alt=""></div><div><b>${esc(a.name)}</b><small>${esc(a.desc)}</small></div></div>`).join('')}</div>
${tip('mine', '<p>「10年を終える」系の実績は、事業売却（イグジット）での引退も含むわ。「価格差だけで」（品薄品を一度も買わない）と「整理券の向こう」（品薄品を定価で確保）は<b>同じ周では取れない</b>から、周回で狙ってね。</p>')}
`);

// ======================================================================
// 15 周回
// ======================================================================
const ch15 = chapter('replay', 15, 'NEW GAME+', '周回要素：引き継ぎ・キャリアの型・師匠・チャレンジ', '10年を終えるたびに、次の周が少し有利に、そして少し違う遊び方に。', 'assets/backgrounds/title.jpg', chrisPose('wave'), `
<div class="grid g2">
  <div class="card"><h4 style="margin-top:0">到達点の引き継ぎ</h4><p>これまでの周でたどり着いた<b>ルートの到達点</b>（キャップストーン）から、次の周に<b>1つ</b>を最初から持って始められる。</p></div>
  <div class="card"><h4 style="margin-top:0">師匠</h4><p>前の周のクリスが「師匠」になる（新しい順に3人まで記録）。12週に1回、外出「師匠に相談」で経験点と助言。</p></div>
  <div class="card"><h4 style="margin-top:0">キャリアの型（2周目〜）</h4><p>${Object.entries(STYLES).map(([id, s]) => `<b>${esc(s.name)}</b>：${esc(s.desc)}`).join('<br><br>')}</p><p class="muted" style="font-size:13px">商材特化で選べるジャンル：${Object.values(SPECIALTIES).join('・')}。組織型の人件費は月${man(ORG_WAGE)}×ステージ。</p></div>
  <div class="card"><h4 style="margin-top:0">チャレンジ</h4><p><b>今日のチャレンジ</b>：日付で決まるシード。同じ日に遊ぶ人は同じ相場・同じ出来事から。<br><b>今週のチャレンジ</b>：週ごとのシードで、結果を<b>オンラインランキング</b>に登録できる（難易度ふつう・引き継ぎなし）。<br>この端末のランキングと実績にも記録される。</p></div>
</div>
${shots(phone('ending_top', 'エンディングの回収', '査定画面の下に「エンディング ○/19」と、まだ見ていない数'))}
`);

// ======================================================================
// 16 攻略チャート
// ======================================================================
const ch16 = chapter('strategy', 16, 'STRATEGY', '攻略チャート：Sランクとエンディングの狙い方', 'おすすめの伸ばし方、時期ごとの目標、エンディング別の作戦。', 'assets/backgrounds/queue.jpg', chrisPose('guts'), `
<h3>おすすめの10年（ふつう・Sランク狙い）</h3>
<div class="timeline">
  <div><b>1年目<small>家の物 → 店舗せどり</small></b><ul><li>利益計算（情報10）と近所の店のワゴン（行動10）を最優先。月5万円×2か月でステージ2</li><li>能力は<b>目利き</b>と<b>出品</b>を「自動で割り振る」で底上げ</li><li>月末の最低返済分は必ず残す</li></ul></div>
  <div><b>2〜3年目<small>販路を広げ、専業へ</small></b><ul><li>電脳せどり・抽選・相場チェック。夜は電脳せどりか出品作業</li><li>ミィーム → アマクリ（月4,900円）。出品枠の拡張</li><li>赤字の月を出さずに3か月で90万円 → 専業（行動2回）。借金はこの頃に完済しておくと楽（実績「3年で完済」）</li></ul></div>
  <div><b>3〜5年目<small>仕組み化と業者オークション</small></b><ul><li>古物商許可 → 業者オークション（毎月第3週）。第3週に現金を厚く</li><li>外注（梱包・発送 → 撮影・出品）で体力を仕入れに回す。価格改定ツール</li><li>ライバルに荒らされたら新しい仕入れ先へ。独占契約も</li><li>12か月で800万円 → 法人化</li></ul></div>
  <div><b>5〜8年目<small>法人化・拡大</small></b><ul><li>問屋取引・物流倉庫・外注：リサーチ・仕入れ（12か月で1,800万円＋外注3種でステージ5）</li><li>志を決める。自分の店・スタッフ</li><li>6年目からの年齢の壁に備え、自分で動かなくても回る形に</li></ul></div>
  <div><b>8〜10年目<small>事業化と最終査定</small></b><ul><li>自社ブランド・買取事業・情報発信で毎月の事業収入</li><li>最後の数か月は在庫を売り切るより<b>現金化</b>を意識（在庫は相場の7割でしか評価されない）</li><li>純資産5,000万円でS</li></ul></div>
</div>
<h3>エンディング別の作戦</h3>
${table(['エンディング', '作戦'], [
  ['<b>事業家END</b>', 'ステージ5まで上げる。外注3種（撮影・出品／梱包・発送／リサーチ・仕入れ）と12か月1,800万円を同時に満たす。志を決めると志のENDに置きかわるので、純粋に狙うなら志は「まだ決めない」'],
  ['<b>志のEND</b>', '法人化の直後に志を決める。総合商社はTOKUを高く保つ、配信の女王・目利きの館はキャリアが必要、私設美術館はコレクションとお金、物販王は純資産1億とライバル4人'],
  ['<b>まっとうな商人END</b>', 'ステージ3以下で止め（専業や法人化の誘いを断る）、12月にサンタへ定価で譲り、炎上度を25未満に保つ'],
  ['<b>専業せどらーEND</b>', 'ステージ3で止める（法人化の誘いを断る）'],
  ['<b>副業せどらーEND</b>', '借金だけ返して、専業の誘いを断る'],
  ['<b>結局クリプトEND</b>', 'ステージ4で現金1,000万円を持ってサトシの誘いを受け、バブルで当てる'],
  ['<b>イグジットEND</b>', 'ステージ5で直近12か月1,000万円以上を保ち、打診が来たら売る（早いほど高い）'],
  ['<b>裏社会の帝王END</b>', '魔道パネルでTOKUを下げ、裏の人間のまま10年を走り切る（襲撃に注意）'],
  ['<b>蜘蛛の糸END</b>', '裏の人間になって24週後、一休の蜘蛛の糸をつかむ'],
  ['<b>返済はつづくよEND</b>', '借金を残したまま10年（狙うなら返済だけは続ける）'],
].map(([a, b]) => [a, b]))}
${tip('mine', '<p>ランクを上げる近道は、<b>荒れていない仕入れ先</b>と<b>体力の使い方</b>よ。荒れ具合が高いルートは仕入れ値が上がるし、体力切れの発送遅れは評価を下げて、売れる数そのものを減らすわ。</p>')}
`);

// ======================================================================
// 17 商品図鑑
// ======================================================================
const KIND_LABEL = { home: '家の不用品', staple: '定番', collect: 'コレクター・中古', hype: '限定（品薄になりやすい）', seasonal: '季節', perishable: '生もの', boom: 'ブーム', luxury: '高級品', kuji: 'くじの景品', live: '期間限定フェア' };
const KIND_NOTE = {
  home: '最初に家にある物と、「家の中を探す」で見つかる物。仕入れ値0円',
  staple: '定番品。相場が安定していて、ワゴンや値札ミスで安く仕入れて差額を取る。シリーズ物は毎年世代交代し、旧世代は値崩れする',
  collect: '中古・絶版本・アンティークなど。古物商許可がいるものが多く、真贋の見極めが大事。持ち続けると相場が上がることも',
  hype: '発売日に品薄になる限定品。抽選・予約・行列で定価で確保すれば大きな差額。規制と再販に注意',
  seasonal: '季節の商戦の品。シーズン前に仕入れ、シーズン中に売り切る',
  perishable: '賞味期限がある。期限が切れると廃棄',
  boom: 'ブームで急騰し、天井のあと暴落する。ニュートンの「群衆の狂気」で天井を察知',
  luxury: '高級時計・美術品。正規店や外商、業者オークションで。1つで数十万〜数百万の利益',
  kuji: 'くじの景品。A賞とラストワン賞は高値、下位賞はダブつく',
  live: '現実の日付に合わせた期間限定フェアの品',
};
const goodsSections = Object.keys(KIND_LABEL).map((k) => {
  const list = PRODUCTS.filter((p) => p.kind === k);
  if (!list.length) return '';
  return `<h3>${esc(KIND_LABEL[k])}<span class="muted" style="font-size:14px;font-family:var(--body)">（${list.length}種）</span></h3><p>${esc(KIND_NOTE[k])}</p><div class="goods">${list.map((p) => {
    const tags = [p.genre, SIZE_INFO[p.size] ? `サイズ${p.size}` : '', p.used ? '中古' : '', p.series ? `第${p.gen}世代` : '', p.spot ? '開拓した仕入れ先' : '', p.know ? '基礎講座が必要' : '', p.alcohol ? 'お酒' : ''].filter(Boolean);
    return `<div class="good-card">${img(productImage(p), p.name)}<b>${esc(p.name)}</b><span class="price">${p.used ? '参考 ' : '定価 '}${yen(p.retail)}</span><div class="tags">${tags.map((t) => `<span>${esc(t)}</span>`).join('')}</div></div>`;
  }).join('')}</div>`;
}).join('');
const ch17 = chapter('items', 17, 'ITEMS', `商品図鑑：全${PRODUCTS.length}種`, 'ゲームに登場するすべての商品。定価・サイズ・種類。仕入れ値と相場は毎週動く。', 'assets/backgrounds/store.jpg', null, `
<p class="lead">相場は商品ごとに「定価に対する倍率」として毎週動きます。メニューの「相場」で、持っている品の上がり下がりと全商品の推定相場を確認できます（スキル「相場チェック」）。</p>
${shots(phone('rv_market', '相場・ニュース', 'ニュース／持っている品／すべて のタブと、値上がり・値下がり順'))}
${goodsSections}
`);

// ======================================================================
// 18 用語集・Q&A
// ======================================================================
const ch18 = chapter('glossary', 18, 'GLOSSARY & FAQ', '用語集とQ&A', `転売・物販の専門用語（全${TERMS.length}語）と、よくある質問。ゲーム内でも、セリフの色つきの言葉をタップすると解説が出る。`, 'assets/backgrounds/study.jpg', CAST.mine.poses.smile, `
${shots(phone('rv_glossary', '用語集（ゲーム内）', 'メニュー → 手引き → 用語集。言葉で探せる'), phone('rv_guide', '遊び方（ゲーム内）', 'チュートリアルの要点'))}
<h3>用語集</h3>
${table(['用語', '意味'], TERMS.map((t) => [`<b>${esc(t.word)}</b>`, esc(t.desc)]))}
<h3>Q&A</h3>
<div class="grid g2">
  <div class="card"><h4 style="margin-top:0">Q. 売れません</h4><p>値付けが相場の1.1倍を超えていないか確認。評価が低い・出品枠が少ない・その販路の買い手が少ないことも。「撮影・出品作業」で売れ行きが上がり、12月は買い手が増える。</p></div>
  <div class="card"><h4 style="margin-top:0">Q. 現金が足りない</h4><p>即決買取（相場の45%）で現金化、日雇いバイト（2.2万円）、カード払い（翌月以降）。ただしカードの使いすぎはリボ地獄の入口。</p></div>
  <div class="card"><h4 style="margin-top:0">Q. 体調を崩した</h4><p>2週間は休むか通院のみ。ナイチンゲールに会うと体調不良の確率が半分になる奥義をもらえる。体力の残りを見て、⚠の付いた行動を避ける。</p></div>
  <div class="card"><h4 style="margin-top:0">Q. 仕入れ値が上がった</h4><p>そのルートが荒れている。メニュー「業界の動き」で荒れ具合を確認し、別のルートや開拓した仕入れ先に移るか、独占契約を結ぶ。</p></div>
  <div class="card"><h4 style="margin-top:0">Q. 経験点が偏る</h4><p>能力画面の「経験点の振り替え」（半分の値で移す）か、キャリアの行動・資格講座で余った経験点を使う。</p></div>
  <div class="card"><h4 style="margin-top:0">Q. セーブは？</h4><p>行動のたび・アプリを切り替えたときに自動。データはこのブラウザの中にあるので、ブラウザのデータを消すと消える。</p></div>
  <div class="card"><h4 style="margin-top:0">Q. 英語で遊べる？</h4><p>タイトルの「Play in English」で英語版に切りかわる（セーブはそのまま）。</p></div>
  <div class="card"><h4 style="margin-top:0">Q. 何週で何年？</h4><p>1か月＝4週、1年＝48週（4月第1週〜翌年3月第4週）、10年＝${TOTAL_WEEKS}週。</p></div>
</div>
`);

// ======================================================================
// 組み立て
// ======================================================================
const chapters = [
  ['intro', 'はじめに'], ['basics', 'ゲームの基本'], ['start', '序盤の進め方'], ['sourcing', '仕入れ'], ['selling', '販売'], ['money', 'お金'], ['growth', '経験点と基礎能力'], ['tree', 'スキルツリー全貌'],
  ['career', 'キャリア'], ['people', '仲間（偉人）'], ['world', '世界の動き'], ['dark', '正道と魔道'], ['endings', 'エンディング全集'], ['achievements', '実績'], ['replay', '周回要素'], ['strategy', '攻略チャート'], ['items', '商品図鑑'], ['glossary', '用語集とQ&A'],
];
const toc = `<nav class="toc" aria-label="目次"><div class="toc-inner"><details open><summary>目次</summary><h2>CONTENTS</h2><ol>${chapters.map(([id, t], i) => `<li><a href="#${id}"><span>${String(i + 1).padStart(2, '0')}</span>${esc(t)}</a></li>`).join('')}</ol></details></div></nav>`;
const css = readFileSync(join(ROOT, 'tools/guide/style.css'), 'utf8');
const stats = [[TOTAL_WEEKS, '週（10年）'], [COMMANDS.length, '種類の行動'], [TREE_NODES.length, 'スキルパネル'], [Object.keys(ENDINGS).length + Object.keys(VISIONS).length + 1, 'エンディング'], [ACHIEVEMENTS.length, '実績'], [PRODUCTS.length, '商品'], [COMPANIONS.length, '人の偉人']];
const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>10 buy year！ 完全攻略ガイド</title>
<meta name="description" content="『10 buy year！』の完全攻略ガイドブック。ゲームの流れ、仕入れと販売、スキルツリー全パネル、全エンディングの条件、実績、商品図鑑まで。">
<meta property="og:title" content="10 buy year！ 完全攻略ガイド">
<meta property="og:image" content="https://10buy-year.vercel.app/assets/og.jpg">
<link rel="icon" href="../assets/icons/gum.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DotGothic16&family=Orbitron:wght@500;700&family=Zen+Kaku+Gothic+New:wght@500;700&display=swap" rel="stylesheet">
<style>${css}</style>
</head>
<body>
<header class="hero" id="top">
  <div class="hero-bg" style="background-image:url('${A('assets/backgrounds/title.jpg')}')"></div>
  <div class="hero-inner">
    <div class="hero-kicker">Complete Strategy Guide</div>
    <h1>10 buy year！<small>完全攻略ガイドブック</small></h1>
    <div class="hero-cast"><img src="${A(CAST.chris.poses.guts)}" alt="クリス"><img src="${A(CAST.mine.poses.pointer)}" alt="マイン"><img src="${A(CAST.maycri.poses.wide)}" alt="マイクリくん"></div>
    <p class="hero-lead">押し入れの本を1冊売るところから始まる、10年の転売キャリア。<br>仕入れと販売のコツから、スキルツリー全パネル・全エンディングの条件まで、すべてを1冊に。</p>
    <div class="hero-cta"><a class="btn primary" href="#intro">▶ 読みはじめる</a><a class="btn" href="#tree">スキルツリー</a><a class="btn" href="#endings">エンディング全集</a><a class="btn" href="../">ゲームを遊ぶ</a></div>
    <div class="hero-stats">${stats.map(([n, l]) => `<div><b>${n}</b><small>${l}</small></div>`).join('')}</div>
  </div>
</header>
<div class="layout">
${toc}
<main>
${[ch01, ch02, ch03, ch04, ch05, ch06, ch07, ch08, ch09, ch10, ch11, ch12, ch13, ch14, ch15, ch16, ch17, ch18].join('\n')}
<footer><img src="${A(CAST.maycri.poses.small)}" alt=""><p>10 buy year！ 完全攻略ガイド ― ゲームのデータ（src/）から自動で作成（tools/guide/build.mjs）。<br>My Crypto Heroes の二次創作です。画像は My Crypto Heroes のアセットとオリジナルのドット絵を使っています。</p></footer>
</main>
</div>
<a class="back-top" href="#top" aria-label="いちばん上へ">▲</a>
<script>
// 目次：いま読んでいる章を光らせる
const links = [...document.querySelectorAll('.toc a')];
const io = new IntersectionObserver((es) => { for (const e of es) if (e.isIntersecting) links.forEach((a) => a.classList.toggle('on', a.getAttribute('href') === '#' + e.target.id)); }, { rootMargin: '-30% 0px -60% 0px' });
document.querySelectorAll('section.chapter').forEach((s) => io.observe(s));
if (matchMedia('(max-width: 1079px)').matches) document.querySelector('.toc details')?.removeAttribute('open');
// スマホでは、ツリーの全体図を中心から見せる
document.querySelectorAll('.tree-map').forEach((m) => { m.scrollLeft = (m.scrollWidth - m.clientWidth) / 2; });
// スクリーンショットをタップで拡大
document.addEventListener('click', (e) => {
  const im = e.target.closest('.phone img, .shot-wide img');
  if (!im) return;
  const box = document.createElement('div');
  box.className = 'lightbox';
  const big = document.createElement('img');
  big.src = im.currentSrc || im.src;
  big.alt = im.alt;
  if (im.naturalWidth > im.naturalHeight) big.className = 'landscape';
  const cap = document.createElement('p');
  cap.textContent = im.alt + '（タップで閉じる）';
  box.append(big, cap);
  const close = () => { box.remove(); removeEventListener('keydown', onKey); };
  const onKey = (ev) => { if (ev.key === 'Escape') close(); };
  box.addEventListener('click', close);
  addEventListener('keydown', onKey);
  document.body.append(box);
});
</script>
</body>
</html>
`;
writeFileSync(join(ROOT, 'guide/index.html'), html);
console.log('guide/index.html', (html.length / 1024).toFixed(0), 'KB');
