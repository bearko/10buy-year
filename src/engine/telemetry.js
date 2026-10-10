// プレイログ（匿名のプレイ記録）の記録点。エンジンのあちこちから呼ぶので、ここは何も import しない。
// 送り先（sink）がつながっていなければ何もしない（テスト・ガイドの生成・ボットの通常の実行では空振り）。
// 記録するのは s.tid（プレイごとの匿名ID）を持っているゲームだけ。能力のバッジ計算などの「試しの計算」は記録されない。
//
// 出来事の形：{ e: 種類, w: 週, ...中身 }。送り先が、プレイヤーID・時刻などを足して送る。
// 細かく何度も起きるもの（仕入れ・販売）は、月ごとにまとめて月末の 'mon' に入れる。
let sink = null;
const ctx = { cmd: null, auto: false }; // いま実行中の行動と、ルーティン・おまかせで動いているか
let tallies = {};

export function setTelemetrySink(fn) {
  sink = fn;
  tallies = {};
}
export const telemetryOn = () => !!sink;

// いま実行中の行動（仕入れの記録に「どの行動での仕入れか」を付けるため）と、自動で動いているか
export function setTelemetryContext(patch) {
  Object.assign(ctx, patch);
}

export function track(s, e, data = {}) {
  if (!sink || !s?.tid) return;
  try {
    sink({ e, w: s.week, ...(ctx.auto ? { auto: 1 } : {}), ...data }, s);
  } catch {
    /* 記録の失敗でゲームを止めない */
  }
}

// 月ごとの集計に足す：tally(s, 'buy', 'store:store', 個数, 金額)
export function tally(s, kind, key, n = 1, amount = 0) {
  if (!sink || !s?.tid) return;
  const k = ((tallies[s.tid] ||= {})[kind] ||= {});
  const cur = (k[key] ||= [0, 0]);
  cur[0] += n;
  cur[1] += Math.round(amount);
}

// 月末：その月の集計を付けて 'mon' を記録し、集計を空にする
export function trackMonth(s, data = {}) {
  if (!sink || !s?.tid) return;
  const t = tallies[s.tid] || {};
  delete tallies[s.tid];
  track(s, 'mon', { ...data, t });
}

// 行動の実行（engine/commands.js の performCommand から）
export function trackCommand(s, id, night) {
  ctx.cmd = id;
  track(s, 'cmd', { id, ...(night ? { n: 1 } : {}) });
}
export const currentCommand = () => ctx.cmd;
