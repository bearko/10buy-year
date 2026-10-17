// ガイドブックの HTML 部品
export const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// ゲームのアセット（リポジトリの assets/）へのパス。ガイドは guide/ に置くので1つ上
export const A = (path) => (path ? `../${path}` : '');
export const yen = (n) => `${Math.round(n).toLocaleString('ja-JP')}円`;
export const man = (n) => (Math.abs(n) >= 10000 ? `${(n / 10000).toLocaleString('ja-JP', { maximumFractionDigits: 1 })}万円` : yen(n));

export const EXP_LABEL = { info: '情報', act: '行動', tech: '技術', social: '対人', mind: '精神' };
export const expChips = (cost = {}) => Object.entries(cost).map(([k, v]) => `<span class="x ${k}">${EXP_LABEL[k]} ${v}</span>`).join(' ');
export const pill = (text, cls = '') => `<span class="pill ${cls}">${esc(text)}</span>`;

export function img(path, alt = '', cls = 'px', extra = '') {
  return `<img src="${A(path)}" alt="${esc(alt)}" class="${cls}" loading="lazy" ${extra}>`;
}

// スクリーンショット（スマホの枠）
export function phone(file, title, caption = '', cls = '') {
  return `<figure class="phone ${cls}"><div class="frame"><img src="img/${file}.webp" alt="${esc(title)}" loading="lazy"></div><figcaption><b>${esc(title)}</b>${caption}</figcaption></figure>`;
}
export const shots = (...items) => `<div class="shots">${items.join('')}</div>`;
export const wide = (file, caption) => `<figure class="shot-wide"><img src="img/${file}.webp" alt="${esc(caption)}" loading="lazy"><figcaption>${caption}</figcaption></figure>`;

// 吹き出し（マイン・クリス・注意）
const WHO = {
  mine: { name: 'マインのワンポイント', src: 'assets/characters/navi_ain_00_pointer_up.webp' },
  chris: { name: 'クリスのメモ', src: 'assets/characters/chris_05_smile.webp' },
  warn: { name: 'ここに注意', src: 'assets/characters/chris_08_sad.webp' },
};
export function tip(who, html, src) {
  const w = WHO[who] || WHO.mine;
  return `<div class="tip ${who}"><img src="${A(src || w.src)}" alt=""><div class="bubble"><b class="who">${w.name}</b>${html}</div></div>`;
}

export function table(headers, rows, cls = '') {
  return `<div class="tbl"><table class="${cls}"><thead><tr>${headers.map((h) => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c) => (typeof c === 'object' && c !== null ? `<td class="${c.cls || ''}">${c.html}</td>` : `<td>${c ?? ''}</td>`)).join('')}</tr>`).join('')}</tbody></table></div>`;
}

export function chapter(id, no, kicker, title, lead, bg, sprite, body) {
  return `<section class="chapter" id="${id}">
  <header class="ch-head"><div class="ch-bg" style="background-image:url('${A(bg)}')"></div><span class="ch-num">${String(no).padStart(2, '0')}</span>
    <div class="ch-text"><small>${esc(kicker)}</small><h2>${esc(title)}</h2><p>${lead}</p></div>${sprite ? `<img class="ch-sprite" src="${A(sprite)}" alt="">` : ''}
  </header>
  ${body}
</section>`;
}
