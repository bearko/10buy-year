// 英語版のための文字列の抽出と、訳の抜けのチェック。
//   node tools/i18n.mjs extract   … src/ の日本語の文字列を src/i18n/strings.json に書き出す
//   node tools/i18n.mjs check     … 訳がない文字列の数をファイルごとに出す
//   node tools/i18n.mjs missing <file>  … そのファイルの訳がない文字列を JSON で出す（翻訳作業用）
// テンプレート文字列 `${a}円` は「{0}円」の形のパターンになる。'a' + x + 'b' の連結も1つのパターンにまとめる。
// TypeScript のパーサーを使う（npm i -g typescript か、npx -p typescript node tools/i18n.mjs）
import { createRequire } from 'node:module';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..');
const require = createRequire(import.meta.url);
let ts;
for (const p of ['typescript', '/opt/node22/lib/node_modules/typescript', '/usr/lib/node_modules/typescript', '/usr/local/lib/node_modules/typescript']) {
  try {
    ts = require(p);
    break;
  } catch {
    /* 次の場所を試す */
  }
}
if (!ts) throw new Error('typescript が見つかりません（npm i -g typescript）');

export const JP = /[぀-ヿ㐀-鿿！-｠]/;

function files(dir) {
  const out = [];
  for (const f of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, f);
    if (statSync(join(ROOT, rel)).isDirectory()) {
      if (rel !== join('src', 'i18n')) out.push(...files(rel));
    } else if (f.endsWith('.js')) out.push(rel);
  }
  return out;
}

// '+' でつながった式を、文字列とそれ以外に分ける
function flattenPlus(node, out = []) {
  if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
    flattenPlus(node.left, out);
    flattenPlus(node.right, out);
  } else if (ts.isParenthesizedExpression(node)) flattenPlus(node.expression, out);
  else out.push(node);
  return out;
}

const isStr = (n) => ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n);

function extractFile(rel) {
  const text = readFileSync(join(ROOT, rel), 'utf8');
  const sf = ts.createSourceFile(rel, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
  const keys = [];
  const add = (k) => {
    if (JP.test(k) && !k.includes('\\')) keys.push(k); // 正規表現の元の文字列は除く
  };
  const visit = (node) => {
    // import 文やプロパティ名の文字列は表示しない
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) return;
    if (ts.isBinaryExpression(node) && node.operatorToken.kind === ts.SyntaxKind.PlusToken) {
      const parts = flattenPlus(node);
      if (parts.some((p) => isStr(p) && JP.test(p.text))) {
        let n = 0;
        add(parts.map((p) => (isStr(p) ? p.text : ts.isTemplateExpression(p) ? templateKey(p, () => n++) : `{${n++}}`)).join(''));
        for (const p of parts) if (!isStr(p)) visit(p);
        return;
      }
    }
    if (isStr(node)) {
      if (ts.isPropertyAssignment(node.parent) && node.parent.name === node) return;
      add(node.text);
      return;
    }
    if (ts.isTemplateExpression(node)) {
      let n = 0;
      add(templateKey(node, () => n++));
      for (const span of node.templateSpans) visit(span.expression);
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return keys;
}

function templateKey(node, next) {
  let k = node.head.text;
  for (const span of node.templateSpans) k += `{${next()}}` + span.literal.text;
  return k;
}

export function extractAll() {
  const map = new Map(); // key → files
  for (const rel of files('src')) {
    for (const k of extractFile(rel)) {
      if (!map.has(k)) map.set(k, new Set());
      map.get(k).add(relative('src', rel));
    }
  }
  return map;
}

async function loadDict() {
  const { EN } = await import(join(ROOT, 'src/i18n/en/index.js'));
  return EN;
}

// 訳をまとめて足す：keys.json（missing の出力）と en.json（同じ順の英語の配列）を並べて、src/i18n/en/<part>.js に書く
async function addPart(part, keysFile, enFile) {
  const keys = JSON.parse(readFileSync(keysFile, 'utf8'));
  const en = JSON.parse(readFileSync(enFile, 'utf8'));
  if (keys.length !== en.length) throw new Error(`数が合わない: keys ${keys.length} / en ${en.length}`);
  const ph = (s) => [...s.matchAll(/\{(\d+)(?::\w+)?\}/g)].map((m) => m[1]).sort().join(',');
  const bad = keys.filter((k, i) => en[i] !== null && ph(k) !== ph(en[i]));
  if (bad.length) throw new Error(`埋めこみ {n} が合わない:\n${bad.map((k) => `${k}\n  → ${en[keys.indexOf(k)]}`).join('\n')}`);
  const jp = en.filter((x) => x !== null && JP.test(x));
  if (jp.length) throw new Error(`英語に日本語が残っている:\n${jp.join('\n')}`);
  const path = join(ROOT, `src/i18n/en/${part}.js`);
  let cur = {};
  try {
    cur = (await import(`${path}?t=${Date.now()}`)).default;
  } catch {
    /* 新しいファイル */
  }
  keys.forEach((k, i) => {
    cur[k] = en[i];
  });
  const body = Object.entries(cur).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`).join('\n');
  writeFileSync(path, `// 英語訳（${part}）。tools/i18n.mjs add で足す。キーは日本語の元の文（{0} は埋めこみ）\nexport default {\n${body}\n};\n`);
  console.log(`${keys.length} 件を src/i18n/en/${part}.js に足した（合計 ${Object.keys(cur).length} 件）`);
}

const cmd = process.argv[2];
if (cmd === 'add') await addPart(process.argv[3], process.argv[4], process.argv[5]);
else if (cmd === 'extract') {
  const map = extractAll();
  const out = [...map].map(([key, fs]) => ({ key, files: [...fs].sort() }));
  writeFileSync(join(ROOT, 'src/i18n/strings.json'), JSON.stringify(out, null, 0).replace(/\},\{/g, '},\n{') + '\n');
  console.log(`${out.length} 件の文字列を src/i18n/strings.json に書き出した`);
} else if (cmd === 'check' || cmd === 'missing') {
  const map = extractAll();
  const EN = await loadDict();
  const byFile = new Map();
  for (const [k, fs] of map) {
    if (EN[k] !== undefined) continue;
    const f = [...fs].sort()[0];
    if (!byFile.has(f)) byFile.set(f, []);
    byFile.get(f).push(k);
  }
  if (cmd === 'check') {
    let total = 0;
    for (const [f, ks] of [...byFile].sort((a, b) => b[1].length - a[1].length)) {
      console.log(`${String(ks.length).padStart(5)}  ${f}`);
      total += ks.length;
    }
    console.log(`訳がない文字列：${total} / ${map.size}`);
  } else {
    const f = process.argv[3];
    console.log(JSON.stringify(byFile.get(f) || [], null, 1));
  }
}
