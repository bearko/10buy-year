// 攻略ガイドを1ファイルにまとめる：node tools/guide/bundle.mjs [出力先]（既定は dist/。リポジトリには入れない）
// guide/index.html が参照している画像（assets/ と guide/img/）を data URI にして埋めこむ。ネットにつながっていなくても開ける（フォントだけは外部）
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, extname, join, resolve } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GUIDE = join(ROOT, 'guide');
const out = resolve(process.argv[2] || join(ROOT, 'dist', '10buy-year-guide.html'));
const MIME = { '.webp': 'image/webp', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.svg': 'image/svg+xml', '.gif': 'image/gif' };

const cache = new Map();
function dataUri(ref) {
  if (/^(https?:|data:|#)/.test(ref)) return null;
  const file = resolve(GUIDE, ref);
  const type = MIME[extname(file).toLowerCase()];
  if (!type || !existsSync(file)) return null;
  if (!cache.has(file)) cache.set(file, `data:${type};base64,${readFileSync(file).toString('base64')}`);
  return cache.get(file);
}

let html = readFileSync(join(GUIDE, 'index.html'), 'utf8');
// 何度も出てくる画像は1回だけ埋めこみ、読みこみ時に配る（同じアイコン・背景を何十回も埋めこむと重くなるので）
const REF = /(\s(?:src|href)=")([^"]+)"|url\('([^']+)'\)/g;
const count = new Map();
for (const m of html.matchAll(REF)) {
  const ref = m[2] || m[3];
  if (dataUri(ref)) count.set(ref, (count.get(ref) || 0) + 1);
}
const shared = [...count].filter(([, n]) => n > 1).map(([ref]) => ref);
const key = Object.fromEntries(shared.map((ref, i) => [ref, `i${i}`]));
const BLANK = 'data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==';
html = html.replace(REF, (m, pre, ref1, ref2) => {
  const ref = ref1 || ref2;
  const uri = dataUri(ref);
  if (!uri) return m;
  if (!key[ref]) return ref1 ? `${pre}${uri}"` : `url('${uri}')`;
  // 共有する画像：img/image は空の画像にしておき、data-b で後から差しかえる。背景は CSS 変数で
  return ref1 ? `${pre}${BLANK}" data-b="${key[ref]}"` : `var(--${key[ref]})`;
});
const vars = shared.map((ref) => `--${key[ref]}:url('${dataUri(ref)}')`).join(';');
const table = JSON.stringify(Object.fromEntries(shared.map((ref) => [key[ref], dataUri(ref)])));
html = html.replace('</head>', `<style>:root{${vars}}</style>\n</head>`);
html = html.replace('<body>', `<body>\n<script>window.__B=${table};new MutationObserver((l)=>{for(const r of l)for(const n of r.addedNodes)if(n.nodeType===1)(n.matches('[data-b]')?[n]:[]).concat([...n.querySelectorAll('[data-b]')]).forEach((e)=>{const u=__B[e.dataset.b];e.tagName==='image'?e.setAttribute('href',u):(e.src=u);e.removeAttribute('data-b');});}).observe(document.documentElement,{childList:true,subtree:true});</script>`);
// 1ファイル版では、ゲームへのリンクを公開先に向ける
html = html.replace(/href="\.\.\/"/g, 'href="https://10buy-year.vercel.app/"');
// 1つの画像を何度も使うので、遅延読み込みは外して最初から出す（data URI なので通信はない）
html = html.replace(/ loading="lazy"/g, '');
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, html);
const left = [...html.matchAll(/(?:src|href)="(\.\.\/[^"]+|img\/[^"]+)"/g)].map((m) => m[1]);
console.log(out, `${(html.length / 1024 / 1024).toFixed(1)}MB`, `画像${cache.size}点`, left.length ? `埋めこめなかった参照: ${left.join(', ')}` : '');
