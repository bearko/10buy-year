// プロローグ
import { yen } from '../engine/effects.js';
import { MIN_PAYMENT } from '../engine/finance.js';
import { bg, info, narr, sfx, talk } from '../engine/steps.js';

export function prologue(s) {
  return [
    bg('danger'),
    sfx('lose'),
    talk('chris', 'うそだろ…。$HEROコインが一晩でマイナス95%…？', 'wail'),
    narr('半年前。クリスは「億り人」を夢見て仮想通貨を始めた。最初は順調だった。'),
    narr('調子に乗ってレバレッジをかけ、カードローンで追加入金し、友人からもお金を借りた。'),
    narr(`そして昨夜の大暴落。ロスカット。手元に残ったのは、${yen(s.debt)}の借金だけだった。`),
    talk('chris', '毎月の返済、どうしよう…。バイトだけじゃ利息を払うので精一杯だ…。', 'cry'),
    bg('home'),
    talk('mine', 'ちょっと、いつまで泣いてるの。', 'arms'),
    talk('chris', 'マイン！？ どうしてここに…。', 'sparkle'),
    talk('mine', 'あなたのお母さんに頼まれて、様子を見に来たのよ。……で、借金はいくら？', 'talk'),
    talk('chris', `……${yen(s.debt)}。`, 'sad'),
    talk('mine', '……。', 'shock'),
    talk('maycri', '【速報】限定スニーカー「大西部のブーツ」、フリマアプリで定価の2.4倍で取引中だぞー！', 'wide'),
    talk('chris', '定価の2.4倍…？ 買って、売るだけで…？', 'sparkle'),
    talk('mine', '転売ね。法律で禁止されているもの以外は違法じゃない。でも、甘くないわよ。', 'arms'),
    talk('mine', '仕入れ、相場読み、写真と説明文、梱包と発送、クレーム対応、税金。全部あなたひとりでやるの。', 'pointer'),
    talk('chris', 'やるよ。仮想通貨みたいな一発逆転じゃなく、一個ずつ、確実に。1年で借金を返してみせる！', 'guts'),
    talk('mine', `……いいわ。経理とナビは私が手伝ってあげる。期限は来年の3月末。毎月の返済は最低${yen(MIN_PAYMENT)}。滞納3回でアウトよ。`, 'smile'),
    info('目標', [`来年3月末までに借金 ${yen(s.debt)} を完済する`, `毎月末に最低${yen(MIN_PAYMENT)}を返済（利息は年15%）`, '最終査定の「純資産」がスコアになる'], 'good'),
  ];
}
