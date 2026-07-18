// chocho.lol garden - static build
// Reads /content, writes /_site. No framework, no magic.
import fs from 'node:fs';
import path from 'node:path';
import { marked } from 'marked';
import matter from 'gray-matter';

const PREFIX = (process.env.PATH_PREFIX || '/').replace(/\/?$/, '/');
const u = (p) => PREFIX + String(p).replace(/^\//, '');
const OUT = '_site';
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const read = (f) => fs.readFileSync(f, 'utf8');
const exists = (f) => fs.existsSync(f);
const listMd = (dir) => exists(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.md')) : [];
const write = (rel, html) => {
  const f = path.join(OUT, rel);
  fs.mkdirSync(path.dirname(f), { recursive: true });
  fs.writeFileSync(f, html);
};
const slugOf = (file) => path.basename(file, '.md').toLowerCase().replace(/[^\w֐-׿-]+/g, '-');
const fmtDate = (d) => d ? new Date(d).toISOString().slice(0, 10) : '';

/* ---------- load content ---------- */
function loadCollection(dir, type) {
  return listMd(dir).map((f) => {
    const { data, content } = matter(read(path.join(dir, f)));
    const [bodyEn, bodyHe] = content.split(/<!--\s*he\s*-->/);
    return {
      type,
      slug: data.slug || slugOf(f),
      title: data.title || path.basename(f, '.md'),
      titleHe: data.title_he || null,
      date: data.date || null,
      order: data.order ?? 999,
      lang: data.lang || 'en',
      publish: data.publish !== false,
      tags: data.tags || [],
      body: bodyEn.trim(),
      bodyHe: bodyHe ? bodyHe.trim() : null,
    };
  }).filter((n) => n.publish);
}

const notes = loadCollection('content/notes', 'note');
const projects = loadCollection('content/projects', 'project')
  .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));
const pages = loadCollection('content/pages', 'page');
const beats = exists('content/beats/beats.json') ? JSON.parse(read('content/beats/beats.json')) : { date: null, tracks: [] };
const produced = exists('content/beats/produced.json') ? JSON.parse(read('content/beats/produced.json')) : null;
const photos = exists('content/photos/photos.json') ? JSON.parse(read('content/photos/photos.json')) : [];
const site = Object.assign({
  name: 'Chocho',
  description: '',
  hero_title: "Hey, I'm Chocho.\nI make music in Tel-Aviv.",
  hero_highlight: 'music',
  hero_sub: "Beats, soundtracks, sonic identities - if it makes a sound, I'm probably into it. This garden grows when I do.",
}, exists('content/site.json') ? JSON.parse(read('content/site.json')) : {});

/* ---------- wiki-links + backlinks ---------- */
const linkables = [...notes, ...projects].reduce((m, item) => {
  m.set(item.slug.toLowerCase(), item);
  m.set(item.title.toLowerCase(), item);
  return m;
}, new Map());
const urlFor = (item) => item.type === 'note' ? u(`notes/${item.slug}/`) : u(`projects/#${item.slug}`);
const backlinks = new Map();

function resolveWiki(md, self) {
  return md.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const item = linkables.get(target.trim().toLowerCase());
    const text = label || target;
    if (!item) return `<span class="broken" title="not planted yet">${esc(text)}</span>`;
    if (self) {
      const arr = backlinks.get(item.slug) || [];
      if (!arr.some((x) => x.slug === self.slug)) arr.push(self);
      backlinks.set(item.slug, arr);
    }
    return `<a href="${urlFor(item)}" class="wiki">${esc(text)}</a>`;
  });
}

const resolveYt = (md) => md.replace(/\{\{yt\s+([\w-]+)\}\}/g,
  (_, id) => `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="video" loading="lazy" allowfullscreen frameborder="0"></iframe></div>`);

// obsidian-style callouts: "> [!tip] Title" blockquotes become styled boxes
const CALLOUT_TYPES = ['tip', 'warning', 'idea', 'note'];
const callouts = (html) => html.replace(
  /<blockquote>\s*<p>\[!(\w+)\]\s*([^<\n]*)\n?([\s\S]*?)<\/blockquote>/g,
  (m, type, title, rest) => {
    type = type.toLowerCase();
    if (!CALLOUT_TYPES.includes(type)) type = 'note';
    rest = rest.replace(/^<\/p>\s*/, '').trim();
    const body = rest ? (rest.startsWith('<') ? rest : `<p>${rest}`) : '';
    return `<div class="callout callout-${type}"><p class="co-title">${title.trim() || type}</p>${body}</div>`;
  });

const renderMd = (md, self) => callouts(marked.parse(resolveYt(resolveWiki(md, self))));

// plain-text excerpt for hover previews + the garden map
function excerptOf(md) {
  return String(md || '')
    .replace(/\{\{yt[^}]*\}\}/g, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, t, l) => l || t)
    .replace(/^>\s*\[!\w+\]\s*/gm, '')
    .replace(/[#>*_`~]/g, '')
    .replace(/\s+/g, ' ')
    .trim().slice(0, 150);
}

// bilingual article body: both languages in the page, toggle shows one
function renderBody(item) {
  const en = `<div class="i18n i18n-en">${renderMd(item.body, item)}</div>`;
  const he = item.bodyHe ? `<div class="i18n i18n-he" dir="rtl" lang="he">${renderMd(item.bodyHe, item)}</div>` : '';
  return en + he;
}
function renderTitle(item, tag = 'h1') {
  const he = item.titleHe
    ? `<${tag} class="i18n i18n-he lang-he" dir="rtl" lang="he">${esc(item.titleHe)}</${tag}>`
    : '';
  return `<${tag} class="lang-en${item.titleHe ? ' i18n i18n-en' : ''}">${esc(item.title)}</${tag}>` + he;
}

[...notes, ...projects].forEach((i) => resolveWiki(i.body, i));

/* ---------- layout ---------- */
const icons = {
  note: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M3 1h7l3 3v11H3V1zm7 1v3h3M5 8h6M5 11h6" stroke="currentColor" stroke-width="1" fill="none"/></svg>',
  beat: '<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M6 2v8.2A2.5 2.5 0 1 0 7 12V5l6-1.5V2L6 2z"/></svg>',
  photo: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="1.5" y="2.5" width="13" height="11" fill="none" stroke="currentColor"/><circle cx="5.5" cy="6" r="1.3" fill="currentColor"/><path d="M2 12l4-4 3 3 2.5-2.5L14 12" fill="none" stroke="currentColor"/></svg>',
  project: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="2" y="4.5" width="12" height="9" fill="none" stroke="currentColor"/><path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" fill="none" stroke="currentColor"/></svg>',
};
const typeLabel = { note: 'note', beat: 'beat', photo: 'photos', project: 'project' };

function nav(active) {
  const link = (href, label, key, cls = '') =>
    `<a href="${u(href)}" class="${cls}${active === key ? ' active' : ''}">${label}</a>`;
  const noteTree = notes.map((n) => `<a href="${u(`notes/${n.slug}/`)}" class="sub${active === `note:${n.slug}` ? ' active' : ''}">${esc(n.title)}</a>`).join('');
  return `
  <nav class="sidebar" id="sidebar">
    <a class="site-name" href="${u('')}">${esc(site.name)}</a>
    ${link('', 'Home', 'home')}
    ${link('music/', 'Music', 'music')}
    ${link('projects/', 'Music & Sound Projects', 'projects')}
    ${link('artlist/', 'Artlist', 'artlist')}
    ${link('ai/', 'Building with AI', 'ai')}
    ${link('photos/', 'Photos', 'photos')}
    <details ${active.startsWith('note') ? 'open' : ''}><summary>${link('notes/', 'Notes', 'notes')}</summary>${noteTree || '<span class="sub empty">-</span>'}</details>
    ${link('garden/', 'Garden Map', 'garden')}
    ${link('about/', 'About', 'about')}
    <button id="langToggle" class="lang-toggle" aria-label="switch content language">עב</button>
  </nav>`;
}

const langScript = `<script data-keep>
(function(){
  var KEY='gardenLang';
  function apply(l){
    document.documentElement.setAttribute('data-lang', l);
    var b=document.getElementById('langToggle'); if(b) b.textContent = l==='he'?'EN':'עב';
  }
  var saved='en'; try{ saved=localStorage.getItem(KEY)||'en'; }catch(e){}
  apply(saved);
  document.addEventListener('click',function(e){
    if(e.target && e.target.id==='langToggle'){
      saved = saved==='he'?'en':'he';
      try{ localStorage.setItem(KEY,saved); }catch(err){}
      apply(saved);
    }
  });
})();
</script>`;

function layout({ title, active = '', lang = 'en', content, extraHead = '', extraBody = '' }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${title === site.name ? '' : ' · ' + esc(site.name)}</title>
${site.description ? `<meta name="description" content="${esc(site.description)}">` : ''}
<link rel="stylesheet" href="${u('style.css')}">
<link rel="preload" href="${u('fonts/Recoleta-Black.woff2')}" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="${u('fonts/OpenSauceSans-Regular.woff2')}" as="font" type="font/woff2" crossorigin>
<script defer src="${u('app.js')}"></script>
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='13' font-size='14'%3E%E2%9D%80%3C/text%3E%3C/svg%3E">
${extraHead}
</head>
<body data-prefix="${PREFIX}">
<button class="menu-btn" onclick="document.body.classList.toggle('nav-open')" aria-label="menu">☰</button>
${nav(active)}
<div class="sb-handle" aria-hidden="true"></div>
<main>${content}</main>
${langScript}
${extraBody ? `<div class="page-extra">${extraBody}</div>` : ''}
</body>
</html>`;
}

/* ---------- cards feed (home) ---------- */
function cardMedia(c) {
  if (c.media && c.media.length) {
    const imgs = c.media.map((m) => `<img src="${m}" alt="" loading="lazy" decoding="async">`).join('');
    const tile = c.accentTile ? `<span class="tile-accent">${icons[c.type]}</span>` : '';
    return `<span class="card-media">${imgs}${tile}</span>`;
  }
  return `<span class="card-media hatch"><span class="stamp">${icons[c.type]}</span></span>`;
}
function card({ type, href, title, titleHe, date, lang, sub, media, accentTile }) {
  const t = titleHe
    ? `<span class="card-title lang-en i18n i18n-en">${esc(title)}</span><span class="card-title lang-he i18n i18n-he" dir="rtl">${esc(titleHe)}</span>`
    : `<span class="card-title lang-${lang}">${esc(title)}</span>`;
  return `<a class="card" href="${href}" ${lang === 'he' ? 'dir="rtl"' : ''}>
    ${cardMedia({ type, media, accentTile })}
    <span class="card-type">${icons[type]} ${typeLabel[type]}</span>
    ${t}
    ${sub ? `<span class="card-sub">${esc(sub)}</span>` : ''}
    ${date ? `<span class="card-date">${fmtDate(date)}</span>` : ''}
  </a>`;
}

const artlistPage = pages.find((p) => p.slug === 'artlist');

// "63 pictures · Kyoto · New York · Tel Aviv" - real places/tags, not a vague count
function photoSub() {
  const top = (get) => {
    const freq = new Map();
    photos.forEach((p) => (get(p) || []).forEach((v) => freq.set(v, (freq.get(v) || 0) + 1)));
    return [...freq.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0]);
  };
  // primary place name only ("japan, kyoto" -> "Kyoto"), title-cased
  const places = top((p) => p.loc ? [p.loc.split(',').pop().trim()] : [])
    .map((l) => l.replace(/\b\w/g, (c) => c.toUpperCase()));
  const bits = places.length ? places : top((p) => p.tags).map((t) => '#' + t);
  return `${photos.length} pictures · ${bits.slice(0, 3).join(' · ')}`;
}

const feed = [
  ...notes.map((n) => ({ type: 'note', href: u(`notes/${n.slug}/`), title: n.title, date: n.date, lang: n.lang })),
  ...projects.map((p) => ({ type: 'project', href: u(`projects/#${p.slug}`), title: p.title, titleHe: p.titleHe, date: p.date, lang: p.lang })),
  ...(artlistPage ? [{ type: 'project', href: u('artlist/'), title: artlistPage.title, date: artlistPage.date, lang: 'en' }] : []),
  ...(photos.length ? [{ type: 'photo', href: u('photos/'), title: 'Photos', sub: photoSub(), date: photos[0].date, lang: 'en', media: photos.slice(0, 3).map((p) => u(`photos/img/thumb-${p.file}`)) }] : []),
  { type: 'beat', href: u('music/'), title: 'The player', sub: `${beats.tracks.length} beats · latest: ${beats.tracks[0] ? beats.tracks[0].title : '-'}`, date: beats.date || null, lang: 'en', media: beats.tracks.filter((t) => t.cover).slice(0, 2).map((t) => u(t.cover)), accentTile: true },
  ...(exists('content/ai/ai.json') ? [{ type: 'project', href: u('ai/'), title: 'Building with AI', sub: `${JSON.parse(read('content/ai/ai.json')).length} experiments`, date: '2026-07-08', lang: 'en', media: exists('content/ai/img') ? fs.readdirSync('content/ai/img').slice(0, 2).map((f) => u(`ai/img/${f}`)) : [] }] : []),
].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

let heroTitle = esc(site.hero_title).replace(/\n/g, '<br>');
// the highlight chip is a mechanical rotating sign - words overridable via site.json hero_words
const heroWords = Array.isArray(site.hero_words) && site.hero_words.length
  ? site.hero_words
  : [site.hero_highlight || 'music', 'beats', 'notes', 'pictures', 'apps', 'sites', 'things']
      .filter((w, i, a) => w && a.indexOf(w) === i);
if (site.hero_highlight) heroTitle = heroTitle.replace(esc(site.hero_highlight),
  `<span class="hero-mark" data-words="${esc(heroWords.join(','))}">${esc(site.hero_highlight)}</span>`);

write('index.html', layout({
  title: site.name, active: 'home',
  content: `
  <div class="hero">
    <h1 class="hero-title lang-en">${heroTitle}</h1>
    <p class="hero-sub">${esc(site.hero_sub)}</p>
    <p class="hero-cta"><a class="btn-primary" href="${u('about/')}">Say hi →</a><a class="btn-ghost" href="${u('music/')}">Hear the beats</a></p>
  </div>
  <div class="micro-label"><span>Freshly planted</span></div>
  <div class="cards">${feed.map(card).join('')}</div>`,
}));

/* ---------- notes ---------- */
write('notes/index.html', layout({
  title: 'Notes', active: 'notes',
  content: `<h1 class="lang-en">Notes</h1>
  ${notes.length ? `<ul class="index-list">${notes.map((n) => `<li ${n.lang === 'he' ? 'dir="rtl"' : ''}><a href="${u(`notes/${n.slug}/`)}" class="lang-${n.lang}">${esc(n.title)}</a> <span class="dim">${fmtDate(n.date)}</span></li>`).join('')}</ul>` : '<p class="dim">Nothing planted yet.</p>'}`,
}));

for (const n of notes) {
  const bl = backlinks.get(n.slug) || [];
  write(`notes/${n.slug}/index.html`, layout({
    title: n.title, active: `note:${n.slug}`, lang: n.lang,
    content: `<article ${n.lang === 'he' ? 'dir="rtl"' : ''}>
      <h1 class="lang-${n.lang}">${esc(n.title)}</h1>
      ${n.date ? `<p class="dim">last tended ${fmtDate(n.date)}</p>` : ''}
      ${renderMd(n.body, n)}
      ${bl.length ? `<section class="backlinks"><h2>Linked from</h2><ul>${bl.map((b) => `<li><a href="${urlFor(b)}">${esc(b.title)}</a></li>`).join('')}</ul></section>` : ''}
    </article>`,
  }));
}

/* ---------- projects: one scrollable page, custom order, bilingual, productions at the end ---------- */
const spotifyEmbed = (id) => `<iframe class="sp-embed" src="https://open.spotify.com/embed/track/${id}" width="100%" height="80" frameborder="0" loading="lazy" allow="encrypted-media"></iframe>`;
const productionsHtml = produced ? `
  <article id="productions" class="project-block productions">
    <h2 class="lang-en i18n i18n-en">Productions</h2>
    <h2 class="lang-he i18n i18n-he" dir="rtl">הפקות</h2>
    <p class="dim i18n i18n-en">Songs I produced for other artists · <a href="${produced.playlist}">full playlist on Spotify</a></p>
    <p class="dim i18n i18n-he" dir="rtl">שירים שהפקתי לאמנים אחרים · <a href="${produced.playlist}">הפלייליסט המלא בספוטיפיי</a></p>
    ${produced.artists.map((a) => `<section class="artist-block" dir="rtl">
      <h3 class="lang-he">${esc(a.name)}</h3>
      ${a.tracks.map((t) => spotifyEmbed(t.id)).join('')}
    </section>`).join('')}
  </article>` : '';

write('projects/index.html', layout({
  title: 'Music & Sound Projects', active: 'projects',
  content: `<h1 class="lang-en">Music &amp; Sound Projects</h1>
  <nav class="project-toc">${projects.map((p) => `<a href="#${p.slug}">${esc(p.title)}</a>`).join('')}<a href="#productions">Productions</a></nav>
  ${projects.map((p) => `<article id="${p.slug}" class="project-block">
    ${renderTitle(p, 'h2')}
    ${renderBody(p)}
  </article>`).join('')}
  ${productionsHtml}`,
}));

/* ---------- artlist ---------- */
if (artlistPage) {
  write('artlist/index.html', layout({
    title: artlistPage.title, active: 'artlist',
    content: `<article>${renderTitle(artlistPage)}${renderBody(artlistPage)}</article>`,
  }));
}

/* ---------- music: player with beat cards + productions ---------- */
const tracksJson = JSON.stringify(beats.tracks.map((t) => ({
  title: t.title, file: u(t.file), dur: t.dur, cover: t.cover ? u(t.cover) : null,
  genre: t.genre || null, mood: t.mood || null, year: t.year || null,
})));

write('music/index.html', layout({
  title: 'Music', active: 'music',
  content: `<h1 class="lang-en">Music</h1>
  <div class="player" id="player">
    <div class="np">
      <div class="np-cover" id="npCover"><svg viewBox="0 0 24 24" width="28" height="28"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg></div>
      <div class="np-info">
        <div class="np-title lang-en" id="npTitle">–</div>
        <div class="np-bar-row">
          <span class="dim mono" id="npCur">0:00</span>
          <div class="np-bar" id="npBar"><div class="np-fill" id="npFill"></div></div>
          <span class="dim mono" id="npDur">0:00</span>
        </div>
      </div>
    </div>
    <div class="np-controls">
      <button id="btnPrev" aria-label="previous"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M6 6h2v12H6zm3.5 6l8.5 6V6z"/></svg></button>
      <button id="btnPlay" class="big" aria-label="play/pause"><svg id="icoPlay" viewBox="0 0 24 24" width="24" height="24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg><svg id="icoPause" viewBox="0 0 24 24" width="24" height="24" style="display:none"><path fill="currentColor" d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg></button>
      <button id="btnNext" aria-label="next"><svg viewBox="0 0 24 24" width="18" height="18"><path fill="currentColor" d="M16 6h2v12h-2zM6 18l8.5-6L6 6z"/></svg></button>
      <span class="np-spacer"></span>
      <button id="btnShuffle" class="on" aria-label="shuffle" title="Shuffle"><svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04L4 18.59 5.41 20 17.96 7.46 20 9.5V4h-5.5zm.33 9.41l-1.41 1.41 3.13 3.13L14.5 20H20v-5.5l-2.04 2.04-3.13-3.13z"/></svg></button>
      <button id="btnRepeat" aria-label="repeat" title="No repeat"><svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z"/></svg></button>
      <a id="btnDl" href="#" download aria-label="download" title="Download"><svg viewBox="0 0 24 24" width="17" height="17"><path fill="currentColor" d="M19 9h-4V3H9v6H5l7 7 7-7zM5 18v2h14v-2H5z"/></svg></a>
    </div>
  </div>
  <div class="beat-tools">
    <span class="seg" role="group" aria-label="view">
      <button id="viewCards" title="Cards" aria-label="card view"><svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M1 1h6v6H1zM9 1h6v6H9zM1 9h6v6H1zM9 9h6v6H9z"/></svg></button><button id="viewList" title="List" aria-label="list view"><svg viewBox="0 0 16 16" width="14" height="14"><path fill="currentColor" d="M1 2h14v2H1zM1 7h14v2H1zM1 12h14v2H1z"/></svg></button>
    </span>
    <select id="sortSel" aria-label="order"></select>
    <select id="filterSel" aria-label="filter" hidden></select>
  </div>
  <div class="size-ctl"><label for="beatSize">Tile size</label><input type="range" id="beatSize" min="110" max="260" step="5" value="150"><span class="hint">pinch / ⌘ scroll</span></div>
  <div class="beat-grid" id="beatGrid"></div>`,
  extraBody: `<script>
(function(){
  var TRACKS=${tracksJson};
  var $=function(id){return document.getElementById(id);};
  var fmt=function(s){s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
  /* ---- unique spinning shape per beat: type/points/rotation/color all from a name hash ---- */
  function ptsStar(n,R,r){var p=[];for(var k=0;k<2*n;k++){var a=Math.PI*k/n-Math.PI/2;var rad=k%2?r:R;p.push((50+rad*Math.cos(a)).toFixed(1)+','+(50+rad*Math.sin(a)).toFixed(1));}return p.join(' ');}
  function ptsPoly(n,R){var p=[];for(var k=0;k<n;k++){var a=2*Math.PI*k/n-Math.PI/2;p.push((50+R*Math.cos(a)).toFixed(1)+','+(50+R*Math.sin(a)).toFixed(1));}return p.join(' ');}
  function hash(s){var h=5381;for(var i=0;i<s.length;i++){h=(((h<<5)+h)+s.charCodeAt(i))>>>0;}return h;}
  var COLS=['var(--accent)','var(--chip-red)','var(--chip-blue)','var(--chip-green)','var(--ink)'];
  var GLYPHS=['*','$','\u266a','\u2726','\u273b','\u00a7','&','\u00bf'];
  function shapeHtml(t,size){
    var h=hash(t.file);
    var col=COLS[(h>>>3)%COLS.length];
    var rot=((h>>>7)%17)-8;
    var kind=h%5;
    if(kind===4){
      var ch=GLYPHS[(h>>>11)%GLYPHS.length];
      return '<span class="beat-shape glyph" style="color:'+col+';transform:rotate('+rot+'deg)'+(ch==='*'?';padding-top:.28em':'')+'">'+ch+'</span>';
    }
    var pts;
    if(kind===0) pts=ptsStar(4+((h>>>13)%5),46,16+((h>>>17)%20));
    else if(kind===1) pts=ptsPoly(3+((h>>>13)%6),46);
    else if(kind===2) pts=ptsStar(8+((h>>>13)%5),46,34+((h>>>17)%8));
    else pts=ptsStar(6+((h>>>13)%4),46,26+((h>>>17)%8));
    return '<span class="beat-shape" style="transform:rotate('+rot+'deg)"><svg viewBox="0 0 100 100" width="'+size+'" height="'+size+'"><polygon points="'+pts+'" fill="'+col+'" stroke="var(--ink)" stroke-width="3.5" stroke-linejoin="round"/></svg></span>';
  }
  var audio=window.gardenAudio||(window.gardenAudio=new Audio()); audio.preload='none';
  var cur=0, shuffle=true, repeat='none', order=[];
  /* ---- view / sort / filter (shuffle stays the default order) ---- */
  var view='cards', sortMode='shuffle', filterVal='';
  try{ view=localStorage.getItem('gardenView')||'cards'; sortMode=localStorage.getItem('gardenSortMode')||'shuffle'; }catch(e){}
  var displayed=[];
  function computeDisplayed(){
    var idx=TRACKS.map(function(_,i){return i;});
    if(filterVal){ var c=filterVal.indexOf(':'); var k=filterVal.slice(0,c), v=filterVal.slice(c+1);
      idx=idx.filter(function(i){ return String(TRACKS[i][k]||'')===v; }); }
    if(sortMode==='shuffle'){ for(var i=idx.length-1;i>0;i--){var j=Math.floor(Math.random()*(i+1));var t=idx[i];idx[i]=idx[j];idx[j]=t;} }
    else if(sortMode==='year'){ idx.sort(function(a,b){ return (TRACKS[b].year||0)-(TRACKS[a].year||0) || TRACKS[a].title.localeCompare(TRACKS[b].title); }); }
    else if(sortMode==='az'){ idx.sort(function(a,b){ return TRACKS[a].title.localeCompare(TRACKS[b].title); }); }
    else if(sortMode==='long'){ idx.sort(function(a,b){ return (TRACKS[b].dur||0)-(TRACKS[a].dur||0); }); }
    displayed=idx;
  }
  var grid=$('beatGrid');
  var PLAY_ICO='<span class="bc-play"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></span>';
  function render(){
    grid.className = view==='list' ? 'beat-list' : 'beat-grid';
    document.body.classList.toggle('beats-list-view', view==='list');
    $('viewCards').classList.toggle('on', view!=='list');
    $('viewList').classList.toggle('on', view==='list');
    grid.innerHTML='';
    displayed.forEach(function(i){ var t=TRACKS[i];
      var el=document.createElement('button');
      el.setAttribute('data-idx', i);
      var meta=[t.genre,t.mood,t.year].filter(Boolean).join(' \u00b7 ');
      if(view==='list'){
        el.className='beat-row';
        el.innerHTML='<span class="br-ico">'+(t.cover?'<img loading="lazy" decoding="async" alt="" src="'+t.cover+'">':shapeHtml(t,24))+'</span>'+
          '<span class="br-title lang-en"></span><span class="br-meta dim mono"></span><span class="br-dur dim mono">'+fmt(t.dur)+'</span>';
        el.querySelector('.br-meta').textContent=meta;
        el.querySelector('.br-title').textContent=t.title;
      } else {
        el.className='beat-card';
        el.innerHTML='<span class="bc-cover">'+(t.cover?'<img loading="lazy" decoding="async" alt="" src="'+t.cover+'">':shapeHtml(t,74))+PLAY_ICO+'</span>'+
          '<span class="bc-title lang-en"></span><span class="bc-dur dim mono"></span>';
        el.querySelector('.bc-title').textContent=t.title;
        el.querySelector('.bc-dur').textContent=[fmt(t.dur),meta].filter(Boolean).join(' \u00b7 ');
      }
      el.classList.toggle('active', i===cur && !!audio.src);
      el.addEventListener('click',function(){ load(i); play(); });
      grid.appendChild(el);
    });
  }
  /* controls: only offer sorts/filters the data can actually answer */
  (function tools(){
    var years=TRACKS.some(function(t){return t.year;});
    var opts=[['shuffle','Shuffle'],['new','Newest']];
    if(years) opts.push(['year','By year']);
    opts.push(['az','A\u2013Z'],['long','Longest']);
    var ss=$('sortSel');
    ss.innerHTML=opts.map(function(o){return '<option value="'+o[0]+'">'+o[1]+'</option>';}).join('');
    if(!opts.some(function(o){return o[0]===sortMode;})) sortMode='shuffle';
    ss.value=sortMode;
    ss.addEventListener('change',function(){ sortMode=ss.value;
      try{ localStorage.setItem('gardenSortMode',sortMode); }catch(e){}
      computeDisplayed(); buildOrder(); render(); });
    var fs=$('filterSel'), groups=[['genre','Genre'],['mood','Mood'],['year','Year']], html='<option value="">All beats</option>', any=false;
    groups.forEach(function(g){
      var vals=[]; TRACKS.forEach(function(t){ var v=t[g[0]]; if(v&&vals.indexOf(String(v))<0) vals.push(String(v)); });
      if(g[0]==='year') vals.sort(function(a,b){return b-a;}); else vals.sort();
      if(vals.length){ any=true;
        html+='<optgroup label="'+g[1]+'">'+vals.map(function(v){return '<option value="'+g[0]+':'+v+'">'+v+'</option>';}).join('')+'</optgroup>'; }
    });
    if(any){ fs.innerHTML=html; fs.hidden=false;
      fs.addEventListener('change',function(){ filterVal=fs.value; computeDisplayed(); buildOrder(); render(); }); }
    $('viewCards').addEventListener('click',function(){ view='cards'; try{localStorage.setItem('gardenView',view);}catch(e){} render(); });
    $('viewList').addEventListener('click',function(){ view='list'; try{localStorage.setItem('gardenView',view);}catch(e){} render(); });
  })();
  function buildOrder(){ order=displayed.slice();
    if(shuffle){ for(var i=order.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=order[i];order[i]=order[j];order[j]=t; } } }
  function sync(i){ cur=i; var t=TRACKS[i];
    window.gardenNow=t.title;
    if(!$('npTitle')) return;
    $('npTitle').textContent=t.title;
    $('npCover').innerHTML = t.cover ? '<img alt="" decoding="async" src="'+t.cover+'">' : shapeHtml(t,38);
    $('npDur').textContent=fmt(t.dur);
    $('btnDl').href=t.file;
    [].forEach.call(grid.children,function(c){ c.classList.toggle('active', +c.getAttribute('data-idx')===i); });
  }
  function load(i){ sync(i); var t=TRACKS[i];
    audio.src=t.file;
    if($('npCur')){ $('npCur').textContent='0:00'; $('npFill').style.width='0%'; }
    try{ localStorage.setItem('gardenTrack', i); }catch(e){}
  }
  function play(){ audio.play().catch(function(){}); }
  function step(d){ var p=order.indexOf(cur), n=p+d;
    if(n>=order.length){ if(repeat==='playlist') n=0; else return audio.pause(); }
    if(n<0) n=order.length-1;
    load(order[n]); play(); }
  $('btnPlay').addEventListener('click',function(){ if(!audio.src){load(order[0]);} audio.paused?play():audio.pause(); });
  $('btnPrev').addEventListener('click',function(){ audio.currentTime>3 ? audio.currentTime=0 : step(-1); });
  $('btnNext').addEventListener('click',function(){ step(1); });
  $('btnShuffle').addEventListener('click',function(){ shuffle=!shuffle; this.classList.toggle('on',shuffle); buildOrder(); });
  $('btnRepeat').addEventListener('click',function(){
    repeat = repeat==='none'?'playlist':repeat==='playlist'?'track':'none';
    this.classList.toggle('on',repeat!=='none');
    this.title = repeat==='none'?'No repeat':repeat==='playlist'?'Repeat playlist':'Repeat track';
  });
  $('npBar').addEventListener('click',function(e){ var r=this.getBoundingClientRect();
    if(audio.duration) audio.currentTime=((e.clientX-r.left)/r.width)*audio.duration; });
  // handlers ASSIGNED (not added): re-visiting the page replaces them instead of stacking
  audio.ontimeupdate=function(){ if(!$('npCur')) return; $('npCur').textContent=fmt(audio.currentTime);
    if(audio.duration) $('npFill').style.width=(audio.currentTime/audio.duration*100)+'%'; };
  audio.onended=function(){ if(repeat==='track'){ audio.currentTime=0; play(); } else step(1); };
  audio.onplay=function(){ if($('icoPlay')){ $('icoPlay').style.display='none'; $('icoPause').style.display=''; } };
  audio.onpause=function(){ if($('icoPlay')){ $('icoPlay').style.display=''; $('icoPause').style.display='none'; } };
  computeDisplayed(); render(); buildOrder();
  // came back while music is loaded? adopt the live track instead of resetting it
  var adopted=-1;
  if(audio.src){ var path=decodeURI(audio.src).replace(location.origin,'');
    for(var k=0;k<TRACKS.length;k++){ if(TRACKS[k].file===path){ adopted=k; break; } } }
  if(adopted>=0){ sync(adopted);
    if($('npCur')){ $('npCur').textContent=fmt(audio.currentTime);
      if(audio.duration) $('npFill').style.width=(audio.currentTime/audio.duration*100)+'%'; }
    if(!audio.paused && $('icoPlay')){ $('icoPlay').style.display='none'; $('icoPause').style.display=''; }
  } else {
    var start=order[0];
    try{ var s=parseInt(localStorage.getItem('gardenTrack')); if(!isNaN(s)&&TRACKS[s]) start=s; }catch(e){}
    load(start);
  }
})();
</script>`,
}));

/* ---------- photos + lightbox ---------- */
const allTags = [...new Set(photos.flatMap((p) => p.tags || []))].sort();
const photosJson = JSON.stringify(photos.map((p) => ({
  full: u(`photos/img/${p.file}`), tags: p.tags || [], date: p.date || '', loc: p.loc || '', alt: p.alt || '',
})));

const lightbox = `
<div class="lb" id="lb" hidden>
  <button class="lb-close" id="lbClose" aria-label="close">×</button>
  <button class="lb-prev" id="lbPrev" aria-label="previous">‹</button>
  <figure><img id="lbImg" alt=""><figcaption id="lbCap"></figcaption></figure>
  <button class="lb-next" id="lbNext" aria-label="next">›</button>
</div>
<script>
(function(){
  var P=${photosJson};
  var idx=0, lb=document.getElementById('lb');
  var img=document.getElementById('lbImg'), cap=document.getElementById('lbCap');
  function show(i){
    idx=(i+P.length)%P.length;
    var p=P[idx];
    img.src=p.full; img.alt=p.alt;
    var bits=[];
    if(p.tags.length) bits.push(p.tags.map(function(t){return '#'+t;}).join(' '));
    if(p.date) bits.push(p.date);
    if(p.loc) bits.push(p.loc);
    cap.textContent=bits.join(' · ');
    lb.hidden=false; document.body.style.overflow='hidden';
  }
  function hide(){ lb.hidden=true; document.body.style.overflow=''; }
  document.querySelectorAll('.photo-stream a').forEach(function(a,i){
    a.addEventListener('click',function(e){ e.preventDefault(); show(i); });
  });
  document.getElementById('lbClose').addEventListener('click',hide);
  document.getElementById('lbPrev').addEventListener('click',function(){show(idx-1);});
  document.getElementById('lbNext').addEventListener('click',function(){show(idx+1);});
  lb.addEventListener('click',function(e){ if(e.target===lb) hide(); });
  document.addEventListener('keydown',function(e){
    if(lb.hidden) return;
    if(e.key==='Escape') hide();
    if(e.key==='ArrowLeft') show(idx-1);
    if(e.key==='ArrowRight') show(idx+1);
  });
})();
</script>`;

function photosPage(sel) {
  const list = sel ? photos.filter((p) => (p.tags || []).includes(sel)) : photos;
  const listJson = JSON.stringify(list.map((p) => ({
    full: u(`photos/img/${p.file}`), tags: p.tags || [], date: p.date || '', loc: p.loc || '', alt: p.alt || '',
  })));
  const tagBar = allTags.length ? `<div class="photo-tags">
    <a href="${u('photos/')}" class="${sel ? '' : 'on'}">all</a>
    ${allTags.map((t) => `<a href="${u(`photos/tag/${t.toLowerCase()}/`)}" class="${sel === t ? 'on' : ''}">#${esc(t)}</a>`).join('')}
  </div>` : '';
  return layout({
    title: sel ? `#${sel}` : 'Photos', active: 'photos',
    content: `<h1 class="lang-en">Photos</h1>${tagBar}
    <div class="size-ctl"><label for="photoSize">Flow</label><input type="range" id="photoSize" min="160" max="420" step="10" value="250"><span class="hint">pinch / ⌘ scroll</span></div>
    ${list.length ? `<div class="photo-stream">
      ${list.map((p) => `<a href="${u(`photos/img/${p.file}`)}"><img src="${u(`photos/img/thumb-${p.file}`)}" alt="${esc(p.alt || '')}" loading="lazy" decoding="async"></a>`).join('')}
    </div>` : '<p class="dim">Nothing developed yet.</p>'}`,
    extraBody: lightbox.replace('${photosJson}', listJson).replace(/var P=.*?;/, `var P=${listJson};`),
  });
}

write('photos/index.html', photosPage(null));
for (const t of allTags) write(`photos/tag/${t.toLowerCase()}/index.html`, photosPage(t));
if (exists('content/photos/img')) fs.cpSync('content/photos/img', path.join(OUT, 'photos/img'), { recursive: true });
if (exists('content/notes/img')) fs.cpSync('content/notes/img', path.join(OUT, 'notes/img'), { recursive: true });

/* ---------- about ---------- */
const about = pages.find((p) => p.slug === 'about');
if (about) {
  write('about/index.html', layout({
    title: 'About', active: 'about',
    content: `<article>${renderTitle(about)}${renderBody(about)}</article>`,
  }));
}

/* ---------- building with AI ---------- */
const aiProjects = exists('content/ai/ai.json') ? JSON.parse(read('content/ai/ai.json')) : [];
if (aiProjects.length) {
  write('ai/index.html', layout({
    title: 'Building with AI', active: 'ai',
    content: `<h1 class="lang-en">Building with AI</h1>
    <p class="dim i18n i18n-en">Things I built by talking to a machine. Prototypes, tools, toys.</p>
    <p class="dim i18n i18n-he" dir="rtl">דברים שבניתי בשיחה עם מכונה. אבות־טיפוס, כלים, צעצועים.</p>
    <div class="ai-grid">
      ${aiProjects.map((p) => `<a class="ai-card" href="${p.internal ? u(p.url) : p.url}" ${p.internal ? '' : 'target="_blank" rel="noopener"'}>
        <span class="ai-shot">${p.img ? `<img src="${u(`ai/img/${p.img}`)}" alt="${esc(p.title)}" loading="lazy" decoding="async">` : '<span class="ai-noshot">' + esc(p.title) + '</span>'}</span>
        <span class="ai-body">
          <span class="ai-title lang-en">${esc(p.title)}</span>
          <span class="ai-desc i18n i18n-en">${esc(p.desc)}</span>
          <span class="ai-desc i18n i18n-he" dir="rtl">${esc(p.desc_he || p.desc)}</span>
          <span class="card-date">${esc(p.date)}</span>
        </span>
      </a>`).join('')}
    </div>`,
  }));
  if (exists('content/ai/img')) fs.cpSync('content/ai/img', path.join(OUT, 'ai/img'), { recursive: true });
}
if (exists('site/tools/nyc-calculator.html')) {
  write('ai/nyc-calculator/index.html', read('site/tools/nyc-calculator.html'));
}

/* ---------- publish (admin, not in nav) ---------- */
if (exists('site/publish.html')) {
  write('publish/index.html', read('site/publish.html').replaceAll('{{PREFIX}}', PREFIX));
}

/* ---------- garden index (hover previews) + garden map ---------- */
const gardenNodes = [
  ...beats.tracks.map((t, i) => ({ id: `beat-${i}`, type: 'beat', title: t.title, url: u('music/'), lang: 'en',
    excerpt: t.dur ? `${Math.floor(t.dur / 60)}:${String(Math.round(t.dur) % 60).padStart(2, '0')}` : '' })),
  ...aiProjects.map((p, i) => ({ id: `ai-${i}`, type: 'ai', title: p.title, url: p.internal ? u(p.url) : p.url, lang: 'en',
    excerpt: excerptOf(p.desc), date: p.date || '' })),
  ...notes.map((n) => ({ id: n.slug, type: 'note', title: n.title, url: u(`notes/${n.slug}/`), lang: n.lang,
    excerpt: excerptOf(n.body), date: fmtDate(n.date) })),
  ...projects.map((p) => ({ id: p.slug, type: 'project', title: p.title, url: u(`projects/#${p.slug}`), lang: p.lang,
    excerpt: excerptOf(p.body), date: fmtDate(p.date) })),
  { id: 'hub-home', type: 'hub', title: site.name, url: u(''), lang: 'en', excerpt: excerptOf(site.hero_sub) },
  { id: 'hub-music', type: 'hub', title: 'Music', url: u('music/'), lang: 'en', excerpt: `${beats.tracks.length} beats in the player` },
  { id: 'hub-projects', type: 'hub', title: 'Projects', url: u('projects/'), lang: 'en', excerpt: `${projects.length} music & sound projects` },
  { id: 'hub-notes', type: 'hub', title: 'Notes', url: u('notes/'), lang: 'en', excerpt: `${notes.length} notes planted` },
  { id: 'hub-photos', type: 'hub', title: 'Photos', url: u('photos/'), lang: 'en', excerpt: `${photos.length} pictures` },
  { id: 'hub-ai', type: 'hub', title: 'Building with AI', url: u('ai/'), lang: 'en', excerpt: `${aiProjects.length} experiments` },
  { id: 'hub-about', type: 'hub', title: 'About', url: u('about/'), lang: 'en', excerpt: '' },
];
const gardenEdges = [
  ...['music', 'projects', 'notes', 'photos', 'ai', 'about'].map((h) => ['hub-home', `hub-${h}`]),
  ...beats.tracks.map((_, i) => ['hub-music', `beat-${i}`]),
  ...aiProjects.map((_, i) => ['hub-ai', `ai-${i}`]),
  ...notes.map((n) => ['hub-notes', n.slug]),
  ...projects.map((p) => ['hub-projects', p.slug]),
];
for (const [target, sources] of backlinks) {
  for (const s of sources) if (s.slug !== target) gardenEdges.push([s.slug, target]);
}
write('garden.json', JSON.stringify({ nodes: gardenNodes, edges: gardenEdges }));

write('garden/index.html', layout({
  title: 'Garden Map', active: 'garden',
  content: `<h1 class="lang-en">Garden Map</h1>
  <p class="dim i18n i18n-en">Everything planted here, and how it connects. Drag the dots. Click to visit.</p>
  <p class="dim i18n i18n-he" dir="rtl">כל מה ששתול כאן, ואיך הכל מתחבר. גררו את הנקודות. לחצו כדי לבקר.</p>
  <div class="garden-wrap"><canvas id="gardenMap"></canvas><span class="garden-hint">drag · click · it's alive</span></div>
  <div class="garden-legend">
    <span><i style="background:var(--accent)"></i> beats</span>
    <span><i style="background:var(--chip-blue)"></i> notes</span>
    <span><i style="background:var(--chip-red)"></i> projects</span>
    <span><i style="background:var(--surface)"></i> pages</span>
  </div>`,
  extraBody: `<script>
(function(){
  var DATA=${JSON.stringify({ nodes: gardenNodes.map((n) => ({ id: n.id, type: n.type, title: n.title, url: n.url })), edges: gardenEdges })};
  var cv=document.getElementById('gardenMap'); if(!cv) return;
  var wrap=cv.parentElement, ctx=cv.getContext('2d'), dpr=window.devicePixelRatio||1;
  var W=0,H=0;
  function css(v){ return getComputedStyle(document.documentElement).getPropertyValue(v).trim(); }
  var N=DATA.nodes.map(function(n,i){ return Object.assign({}, n, {
    x:0.5+0.42*Math.cos(i*2.399), y:0.5+0.42*Math.sin(i*2.399), vx:0, vy:0,
    r: n.type==='hub' ? (n.id==='hub-home'?17:13) : 7
  });});
  var byId={}; N.forEach(function(n){ byId[n.id]=n; });
  var E=DATA.edges.filter(function(e){ return byId[e[0]]&&byId[e[1]]; })
                  .map(function(e){ return [byId[e[0]], byId[e[1]]]; });
  var deg={}; E.forEach(function(e){ deg[e[0].id]=(deg[e[0].id]||0)+1; deg[e[1].id]=(deg[e[1].id]||0)+1; });
  function size(){ var r=wrap.getBoundingClientRect(); W=r.width; H=r.height;
    cv.width=W*dpr; cv.height=H*dpr; ctx.setTransform(dpr,0,0,dpr,0,0);
    N.forEach(function(n){ if(n.px===undefined){ n.px=n.x*W; n.py=n.y*H; } });
    alpha=Math.max(alpha,0.3); kick();
  }
  var alpha=1, drag=null, hover=null, raf=null;
  function tick(){
    var i,j,a,b,dx,dy,dist,f;
    for(i=0;i<N.length;i++){ a=N[i];
      for(j=i+1;j<N.length;j++){ b=N[j];
        dx=a.px-b.px; dy=a.py-b.py; dist=Math.max(12,Math.hypot(dx,dy));
        if(dist<160){ f=900/(dist*dist); a.vx+=dx/dist*f; a.vy+=dy/dist*f; b.vx-=dx/dist*f; b.vy-=dy/dist*f; }
      }
      a.vx+=(W/2-a.px)*0.0012; a.vy+=(H/2-a.py)*0.0012;
    }
    E.forEach(function(e){ a=e[0]; b=e[1];
      dx=b.px-a.px; dy=b.py-a.py; dist=Math.max(1,Math.hypot(dx,dy));
      var rest=a.type==='hub'&&b.type==='hub'?150: a.type==='hub'||b.type==='hub'?70:110;
      f=(dist-rest)*0.004;
      a.vx+=dx/dist*f*2; a.vy+=dy/dist*f*2; b.vx-=dx/dist*f*2; b.vy-=dy/dist*f*2;
    });
    N.forEach(function(n){
      if(drag&&drag.n===n) return;
      n.vx*=0.86; n.vy*=0.86;
      n.px+=n.vx*alpha*2.2; n.py+=n.vy*alpha*2.2;
      n.px=Math.max(n.r+4,Math.min(W-n.r-4,n.px));
      n.py=Math.max(n.r+4,Math.min(H-n.r-4,n.py));
    });
    alpha*=0.995;
  }
  function draw(){
    var ink=css('--ink'), hair=css('--hair'), surface=css('--surface'), paper=css('--paper');
    var col={beat:css('--accent'), note:css('--chip-blue'), project:css('--chip-red'), ai:css('--chip-red'), hub:surface};
    ctx.clearRect(0,0,W,H);
    ctx.lineWidth=1.5; ctx.strokeStyle=hair;
    E.forEach(function(e){
      ctx.globalAlpha=(hover&&(e[0]===hover||e[1]===hover))?1:0.55;
      if(hover&&(e[0]===hover||e[1]===hover)){ ctx.strokeStyle=ink; ctx.lineWidth=2; } else { ctx.strokeStyle=hair; ctx.lineWidth=1.5; }
      ctx.beginPath(); ctx.moveTo(e[0].px,e[0].py); ctx.lineTo(e[1].px,e[1].py); ctx.stroke();
    });
    ctx.globalAlpha=1;
    N.forEach(function(n){
      var r=n===hover?n.r+2:n.r;
      ctx.beginPath(); ctx.arc(n.px+2.5,n.py+2.5,r,0,7); ctx.fillStyle=ink; ctx.fill(); // hard shadow
      ctx.beginPath(); ctx.arc(n.px,n.py,r,0,7);
      ctx.fillStyle=col[n.type]||surface; ctx.fill();
      ctx.lineWidth=2; ctx.strokeStyle=ink; ctx.stroke();
    });
    ctx.font='600 10px "IBM Plex Mono", monospace'; ctx.textAlign='center';
    N.forEach(function(n){
      if(n.type!=='hub'&&n!==hover) return;
      var label=n.title.length>26?n.title.slice(0,25)+'…':n.title;
      ctx.font=(n.type==='hub'?'700 12px':'600 10.5px')+' "IBM Plex Mono", monospace';
      var w=ctx.measureText(label).width;
      ctx.fillStyle=paper; ctx.globalAlpha=.92;
      ctx.fillRect(n.px-w/2-4,n.py+n.r+5,w+8,16);
      ctx.globalAlpha=1; ctx.fillStyle=ink;
      ctx.fillText(label,n.px,n.py+n.r+17);
    });
  }
  function loop(){ tick(); draw(); if(alpha>0.02||drag||hover){ raf=requestAnimationFrame(loop); } else raf=null; }
  function kick(){ if(!raf) raf=requestAnimationFrame(loop); }
  function at(ev){ var r=cv.getBoundingClientRect();
    var x=(ev.touches?ev.touches[0].clientX:ev.clientX)-r.left, y=(ev.touches?ev.touches[0].clientY:ev.clientY)-r.top;
    var best=null,bd=1e9;
    N.forEach(function(n){ var d=Math.hypot(n.px-x,n.py-y); if(d<n.r+8&&d<bd){ bd=d; best=n; } });
    return {x:x,y:y,n:best};
  }
  cv.addEventListener('pointerdown',function(e){ var h=at(e); if(h.n){ drag={n:h.n,moved:false}; cv.classList.add('grabbing'); cv.setPointerCapture(e.pointerId); alpha=Math.max(alpha,.35); kick(); } });
  cv.addEventListener('pointermove',function(e){
    if(drag){ var r=cv.getBoundingClientRect(); drag.n.px=e.clientX-r.left; drag.n.py=e.clientY-r.top; drag.moved=true; alpha=Math.max(alpha,.3); kick(); }
    else { var h=at(e); if(h.n!==hover){ hover=h.n; cv.style.cursor=h.n?'pointer':'grab'; kick(); } }
  });
  cv.addEventListener('pointerup',function(e){
    cv.classList.remove('grabbing');
    if(drag&&!drag.moved&&drag.n.url){
      var a=document.createElement('a'); a.href=drag.n.url;
      if(/^https?:/.test(drag.n.url)&&a.origin!==location.origin){ a.target='_blank'; a.rel='noopener'; }
      document.body.appendChild(a); a.click(); a.remove();
    }
    drag=null; kick();
  });
  cv.addEventListener('pointerleave',function(){ hover=null; kick(); });
  new ResizeObserver(size).observe(wrap);
  size(); kick();
})();
</script>`,
}));

/* ---------- 404 ---------- */
write('404.html', layout({ title: 'Not found', content: '<h1 class="lang-en">404</h1><p>Nothing grows here.</p>' }));

/* ---------- static assets + media ---------- */
fs.cpSync('site/fonts', path.join(OUT, 'fonts'), { recursive: true });
fs.copyFileSync('site/style.css', path.join(OUT, 'style.css'));
fs.copyFileSync('site/app.js', path.join(OUT, 'app.js'));
if (exists('covers')) fs.cpSync('covers', path.join(OUT, 'covers'), { recursive: true });
for (const f of fs.readdirSync('.')) {
  if (/\.(mp3|m4a|png|jpe?g|webp)$/i.test(f)) fs.copyFileSync(f, path.join(OUT, f));
}

console.log('built ok:', fs.readdirSync(OUT).length, 'entries in _site');
