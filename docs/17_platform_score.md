# 17. bearko.games 共通基盤の総合スコアとトロフィー

bearko.games の総合スコア（[bearko/mycryptoportfolio の SPEC-002](https://github.com/bearko/mycryptoportfolio/blob/claude/game-portfolio-page-4afqbc/docs/specs/SPEC-002-total-score.md) 3.8）と、トロフィー（SPEC-001 9.4）に参加する。

- エンディング（`showEnding`）で 1 回だけ、成績を共通基盤の SDK で送る。点の計算は共通基盤のサーバー
- 送る成績：`years`（遊び切った年数。10 年なら 10）、`netWorth`（純資産）、`difficulty`（easy / normal / hard）、`ending`・`daily`・`weekly`（将来の難易度ごとのレギュレーション用。今は点に効かない）、`legacy`（前の周から継承したスキルの ID。なければ `null`）・`mentor`（師匠がついたか）
- 継承の扱い（作者の決定 2026-10-17）：**今は記録だけ**。継承スキル・師匠つきの周も同じ計算式で点にする。成績が集まったら、係数を下げるか別のレギュレーションにするかを決める（SPEC-002 3.8）
- 点：10 年遊び切ると 1,000 ＋ 純資産 ÷ 5,555 × 難易度の係数（やさしい 0.7 ／ ふつう 1.0 ／ きびしい 1.4）。途中で終わったら年数 × 100
- SDK（`https://bearko.games/sdk/v1.js`）が読めない・通信に失敗しても何もしない（`src/platform.js`）。自己ベスト更新の通知とログインの案内は SDK が出す
- 週替わりチャレンジを共通基盤の「同じ条件で競う」レギュレーションにする案は SPEC-002 6.1（未実装。ゲームの `/api/ranking` はそのまま）

## トロフィー（SPEC-001 9.4）

| ID | 名前（由来） | 条件 | 送るとき |
|---|---|---|---|
| `10buy.debtfree` | 解放の一矢（ウィリアム・テル） | 借金を返し終える | 週のはじめ |
| `10buy.sold1000` | 千客万来（エクステンション「バッタ商人」） | 累計 1,000 個売る | 週のはじめ |
| `10buy.stage5` | 頂点の覇気（エクステンション「チャンピオンベルト」） | ステージ 5 に上がる | 週のはじめ |
| `10buy.clear` | うさぎとかめ（イソップ） | 10 年を走り切る（事業売却での引退も含む。クリア） | エンディング |
| `10buy.rank_s` | 功名立志伝（豊臣秀吉） | S ランク（純資産 5,000 万円以上）で 10 年を終える | エンディング |

- 判定は `earnedTrophies`、送るのは `reportTrophies`（`src/platform.js`）。週のはじめ（セーブの前）とエンディングで呼ぶ
- 継承の周・難易度・デイリー／週替わりチャレンジで区別しない（作者の決定 2026-10-17）
- 送ったものはセーブ（`s.trophies`）に覚えて、同じプレイでは送り直さない。通信に失敗したら次の週に送り直す。通知は SDK が出す
- 定義（名前・説明）は共通基盤の `platform/trophies.js`。ID は変えない

## 総合ランキングへの導線（MyCryptoPortfolio#29）

- ランキングの画面（`rankingModal`）のいちばん上に「bearko.games の総合ランキング ↗」と添え書き。行き先は `https://bearko.games/score/?game=10buy`（共通基盤のタイトル別ランキング）
- 新しいタブで開く。週替わりのオンラインランキング・この端末の記録はそのまま

## テスト

`npm test`（`test/platform.test.js`）
