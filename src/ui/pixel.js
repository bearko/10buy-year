// ドット絵をにじませず、ドットの大きさをそろえて表示する。
// 1ドットが「端末の画素」の整数倍になる大きさに直す（CSSのピクセルではなく）。
// 例：devicePixelRatio 2.75 のスマホで 64×64 を CSS 192px にすると 1ドット 8.25 画素になり、8画素と9画素のドットが混ざって崩れて見える。
// → 1ドット 8 画素（CSS 186.2px）か 9 画素にそろえる。縦横比は元の絵のまま。
const PIXEL_ART = /\/assets\/(heroes|extensions|enemies|characters|icons|effects)\//;

const dpr = () => window.devicePixelRatio || 1;

// 絵の端までドットがある画像は、変形で拡大すると外側に端末の1画素ぶんのにじみが出る（Chromium）。
// そういう画像だけ、透明な縁を1ドット足したもの（その場で作る）に差し替えてから拡大する。ドットそのものは変えない
const padded = new Map(); // 元の URL → 縁つきの URL（端に届いていない絵は null）
const origOf = new Map(); // 縁つきの URL → 元の URL

// 縁つきがもう作ってあれば、そちらを使う（舞台で絵を切り替えるとき用。元の絵が一瞬出ないように）
export const pixelSrc = (src) => padded.get(new URL(src, location.href).href) || src;

function paddedOf(img) {
  const src = img.src;
  if (padded.has(src)) return padded.get(src);
  let url = null;
  try {
    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const c = document.createElement('canvas');
    c.width = w + 2;
    c.height = h + 2;
    const g = c.getContext('2d');
    g.drawImage(img, 1, 1);
    const a = g.getImageData(1, 1, w, h).data;
    const opaque = (x, y) => a[(y * w + x) * 4 + 3] > 0;
    let edge = false;
    for (let x = 0; x < w && !edge; x++) edge = opaque(x, 0) || opaque(x, h - 1);
    for (let y = 0; y < h && !edge; y++) edge = opaque(0, y) || opaque(w - 1, y);
    if (edge) {
      url = c.toDataURL('image/png');
      origOf.set(url, src);
    }
  } catch {
    url = null;
  }
  padded.set(src, url);
  return url;
}

// img の大きさを、CSS で決めた枠にいちばん近い「整数倍」に直す
export function fitPixel(img) {
  if (!(img instanceof HTMLImageElement) || img.closest('[data-no-snap]')) return;
  const src = origOf.get(img.src) || img.src;
  if (!PIXEL_ART.test(src)) return;
  const pad = src === img.src ? 0 : 1; // 縁つきに差し替えてあるか
  const nw = img.naturalWidth - pad * 2; // 元の絵の大きさ
  const nh = img.naturalHeight - pad * 2;
  if (nw <= 0 || nh <= 0 || img.hidden) return;
  const r = dpr();
  const key = `${src}|${pad}|${r}|${img.className}|${img.parentElement?.clientWidth}x${img.parentElement?.clientHeight}`;
  if (img.dataset.px === key) return;
  // object-fit: cover（顔の切り出しなど）は枠に合わせて切るので、そのまま
  if (getComputedStyle(img).objectFit === 'cover') return;
  img.style.width = '';
  img.style.height = '';
  // 変形（登場アニメなど）の影響を受けない、レイアウト上の大きさで測る
  const bw = img.offsetWidth;
  const bh = img.offsetHeight;
  if (!bw || !bh) return;
  const scale = Math.min(bw / nw, bh / nh); // 枠に収まる倍率（contain）
  // 元より小さく縮めて出す画像（340px のアイコンを 18px で出すなど）は、ドットをそろえようがないので CSS の大きさのまま
  if (scale * r < 1) {
    img.dataset.px = key;
    return;
  }
  const k = Math.max(1, Math.round(scale * r)); // 1ドットあたりの端末の画素数
  // 小さく出すアイコン（38px に 64px の絵など）は、整数倍にすると大きさが2割以上変わってしまう。見た目の大きさを優先して、そのまま
  if (Math.abs(k - scale * r) / (scale * r) > 0.12) {
    img.dataset.px = key;
    return;
  }
  const w = nw + pad * 2;
  const h = nh + pad * 2;
  img.style.width = `${(w * k) / r}px`;
  img.style.height = `${(h * k) / r}px`;
  img.dataset.px = key;
  // 舞台のキャラは大きく出すので、端数まで合わせる（下の alignStage）
  if (img.closest('#stage')) alignStage(img, w * k, h * k, !pad);
}

// CSS の長さは 1/64px 単位に丸められるので、たとえば 512 画素にしたくても 511.97 画素になり、どこか1列だけドットが細る・太る。
// そのときは、元の絵と同じ大きさ（CSS px。端数が出ない）で置き、変形で k/dpr 倍に広げて、左上を端末の画素の格子に合わせる。
// 見た目の位置は、広げた大きさで置いたときと同じにする。
// （大きいまま置いて scale で微調整したり、will-change で別の層にしたりすると、Chromium では途中でドットの境目がずれることがあった）
// ちょうどの大きさで置けているとき（整数倍率の端末など）は、ブラウザが画素に合わせてくれるので変形しない。
// 自分で transform を使っている要素（アニメーション中など）には手を出さない
function alignStage(img, devW, devH, canPad) {
  img.style.scale = '';
  img.style.translate = '';
  img.style.transformOrigin = '';
  if (getComputedStyle(img).transform !== 'none') return;
  const r = dpr();
  const b = img.getBoundingClientRect();
  if (!b.width || !b.height) return;
  if (Math.abs(b.width * r - devW) < 0.001 && Math.abs(b.height * r - devH) < 0.001) return;
  // 端までドットがある絵は、縁つきに差し替える（読みこみ終わったら、もう一度ここへ来る）
  const url = canPad && paddedOf(img);
  if (url) {
    img.src = url;
    return;
  }
  const nw = img.naturalWidth;
  const nh = img.naturalHeight;
  img.style.width = `${nw}px`;
  img.style.height = `${nh}px`;
  const s = img.getBoundingClientRect();
  img.style.transformOrigin = '0 0';
  img.style.scale = `${devW / (nw * r)} ${devH / (nh * r)}`;
  img.style.translate = `${Math.round(b.left * r) / r - s.left}px ${Math.round(b.top * r) / r - s.top}px`;
}

function fitAll(root = document) {
  for (const img of root.querySelectorAll ? root.querySelectorAll('img') : []) if (img.complete) fitPixel(img);
}

export function initPixelArt() {
  // 読みこみ終わったとき
  document.addEventListener('load', (e) => fitPixel(e.target), true);
  // 画面に入ったとき（読みこみ済みの画像は load が来ないことがある）
  new MutationObserver((records) => {
    for (const rec of records) {
      for (const n of rec.addedNodes) {
        if (n instanceof HTMLImageElement) {
          if (n.complete) fitPixel(n);
        } else if (n.nodeType === 1) fitAll(n);
      }
    }
  }).observe(document.body, { childList: true, subtree: true });
  // 画面の大きさや拡大率が変わったとき
  let t = null;
  window.addEventListener('resize', () => {
    clearTimeout(t);
    t = setTimeout(() => {
      document.querySelectorAll('img[data-px]').forEach((img) => delete img.dataset.px);
      fitAll();
    }, 100);
  });
}
