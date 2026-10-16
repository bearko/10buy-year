# 17. bearko.games 共通基盤の総合スコア

bearko.games の総合スコア（[bearko/mycryptoportfolio の SPEC-002](https://github.com/bearko/mycryptoportfolio/blob/claude/game-portfolio-page-4afqbc/docs/specs/SPEC-002-total-score.md) 3.8）に参加する。

- エンディング（`showEnding`）で 1 回だけ、成績を共通基盤の SDK で送る。点の計算は共通基盤のサーバー
- 送る成績：`years`（遊び切った年数。10 年なら 10）、`netWorth`（純資産）、`difficulty`（easy / normal / hard）、`ending`・`daily`・`weekly`（将来の難易度ごとのレギュレーション用。今は点に効かない）
- 点：10 年遊び切ると 1,000 ＋ 純資産 ÷ 5,555 × 難易度の係数（やさしい 0.7 ／ ふつう 1.0 ／ きびしい 1.4）。途中で終わったら年数 × 100
- SDK（`https://bearko.games/sdk/v1.js`）が読めない・通信に失敗しても何もしない（`src/platform.js`）。自己ベスト更新の通知とログインの案内は SDK が出す
- テスト：`npm test`（`test/platform.test.js`）
