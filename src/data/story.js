// プロローグ
import { yen } from '../engine/effects.js';
import { MIN_PAYMENT } from '../engine/finance.js';
import { bg, bgm, info, narr, talk } from '../engine/steps.js';

export function prologue(s) {
  return [
    bg('danger'),
    bgm('pvp'),
    talk('chris', 'うそだろ…。$SAOコインが一晩でマイナス95%…？', 'wail'),
    narr('半年前。クリスは「億り人」を夢見て仮想通貨を始めた。最初は順調だった。'),
    narr('調子に乗ってレバレッジをかけ、カードローンで追加入金し、とうとう友達にまで頭を下げてお金を借りた。'),
    narr(`そして昨夜の大暴落。ロスカット。手元に残ったのは、${yen(s.debt)}の借金だけだった。`),
    talk('chris', '毎月の返済、どうしよう…。バイトだけじゃ利息を払うので精一杯だ…。', 'cry'),
    bg('home'),
    bgm('pve'),
    talk('mine', 'ちょっと、いつまで泣いてるの。', 'arms'),
    talk('chris', 'マイン！？ どうしてここに…。', 'sparkle'),
    talk('mine', 'あなたのお母さんに頼まれて、様子を見に来たのよ。……で、借金はいくら？', 'talk'),
    talk('chris', `……${yen(s.debt)}。`, 'sad'),
    talk('mine', '……。', 'shock'),
    talk('mine', 'とりあえず、この部屋の物を売ったら？ 読み終わった本、かぶってない帽子、引き出物のグラス…。', 'pointer'),
    talk('chris', 'え、こんなの売れるの？', 'arms'),
    talk('maycri', '売れるぞー！ フリマの「プンシー」なら、スマホで写真を撮って出品するだけだー！', 'wide'),
    talk('mine', '手数料や送料が引かれるから、思ったほどは残らないけどね。まずは「売る」ところから始めてみましょう。', 'smile'),
    talk('chris', 'よし…。一発逆転じゃなく、一個ずつ、確実に。借金を返してみせる！', 'guts'),
    talk('mine', `毎月末に最低${yen(MIN_PAYMENT)}の返済。3か月続けて払えなかったらアウトよ。経理とナビは私が手伝ってあげる。`, 'wink'),
    info('10 buy year！', ['10年間の転売キャリアが始まる', `まずは借金 ${yen(s.debt)} の完済を目指そう`, '最初の目標：家の不用品を出品する（「在庫」を開く）'], 'good'),
  ];
}
