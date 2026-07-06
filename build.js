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
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(Math.round(s) % 60).padStart(2, '0')}`;

/* ---------- load content ---------- */
function loadCollection(dir, type) {
  return listMd(dir).map((f) => {
    const { data, content } = matter(read(path.join(dir, f)));
    return {
      type,
      slug: data.slug || slugOf(f),
      title: data.title || path.basename(f, '.md'),
      date: data.date || null,
      lang: data.lang || 'en',
      publish: data.publish !== false,
      tags: data.tags || [],
      body: content,
    };
  }).filter((n) => n.publish);
}

const notes = loadCollection('content/notes', 'note');
const projects = loadCollection('content/projects', 'project');
const pages = loadCollection('content/pages', 'page');
const beats = exists('content/beats/beats.json') ? JSON.parse(read('content/beats/beats.json')) : { date: null, tracks: [] };

/* ---------- wiki-links + backlinks ---------- */
const linkables = [...notes, ...projects].reduce((m, item) => {
  m.set(item.slug.toLowerCase(), item);
  m.set(item.title.toLowerCase(), item);
  return m;
}, new Map());
const urlFor = (item) => item.type === 'note' ? u(`notes/${item.slug}/`) : u(`projects/${item.slug}/`);
const backlinks = new Map(); // slug -> [items]

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

// {{yt VIDEOID}} -> embedded player
const resolveYt = (md) => md.replace(/\{\{yt\s+([\w-]+)\}\}/g,
  (_, id) => `<div class="yt"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="video" loading="lazy" allowfullscreen frameborder="0"></iframe></div>`);

const render = (item) => marked.parse(resolveYt(resolveWiki(item.body, item)));

// first pass to populate backlinks
[...notes, ...projects].forEach((i) => resolveWiki(i.body, i));

/* ---------- layout ---------- */
const icons = {
  note: '<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M3 1h7l3 3v11H3V1zm7 1v3h3M5 8h6M5 11h6" stroke="currentColor" stroke-width="1" fill="none"/></svg>',
  beat: '<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M6 2v8.2A2.5 2.5 0 1 0 7 12V5l6-1.5V2L6 2z"/></svg>',
  photo: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="1.5" y="2.5" width="13" height="11" fill="none" stroke="currentColor"/><circle cx="5.5" cy="6" r="1.3" fill="currentColor"/><path d="M2 12l4-4 3 3 2.5-2.5L14 12" fill="none" stroke="currentColor"/></svg>',
  project: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="2" y="4.5" width="12" height="9" fill="none" stroke="currentColor"/><path d="M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5" fill="none" stroke="currentColor"/></svg>',
};
const typeLabel = { note: 'note', beat: 'beat', photo: 'photos', project: 'project' };

function nav(active) {
  const link = (href, label, key, cls = '') =>
    `<a href="${u(href)}" class="${cls}${active === key ? ' active' : ''}">${label}</a>`;
  const projTree = projects.map((p) => link(`projects/${p.slug}/`, esc(p.title), `project:${p.slug}`, 'sub')).join('');
  const noteTree = notes.map((n) => link(`notes/${n.slug}/`, esc(n.title), `note:${n.slug}`, 'sub')).join('');
  return `
  <nav class="sidebar" id="sidebar">
    <a class="site-name" href="${u('')}">Chocho</a>
    ${link('', 'Home', 'home')}
    ${link('music/', 'Music', 'music')}
    <details ${active.startsWith('project') ? 'open' : ''}><summary>${link('projects/', 'Projects', 'projects')}</summary>${projTree}</details>
    ${link('photos/', 'Photos', 'photos')}
    <details ${active.startsWith('note') ? 'open' : ''}><summary>${link('notes/', 'Notes', 'notes')}</summary>${noteTree || '<span class="sub empty">empty</span>'}</details>
    ${link('about/', 'About', 'about')}
  </nav>`;
}

function layout({ title, active = '', lang = 'en', content }) {
  return `<!doctype html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}${title === 'Chocho' ? '' : ' · Chocho'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${u('style.css')}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='13' font-size='14'%3E%E2%9D%80%3C/text%3E%3C/svg%3E">
</head>
<body>
<button class="menu-btn" onclick="document.body.classList.toggle('nav-open')" aria-label="menu">☰</button>
${nav(active)}
<main>${content}</main>
</body>
</html>`;
}

/* ---------- cards feed (home) ---------- */
function card({ type, href, title, date, lang, sub }) {
  return `<a class="card" href="${href}" ${lang === 'he' ? 'dir="rtl"' : ''}>
    <span class="card-type">${icons[type]} ${typeLabel[type]}</span>
    <span class="card-title lang-${lang}">${esc(title)}</span>
    ${sub ? `<span class="card-sub">${esc(sub)}</span>` : ''}
    ${date ? `<span class="card-date">${fmtDate(date)}</span>` : ''}
  </a>`;
}

const feed = [
  ...notes.map((n) => ({ type: 'note', href: urlFor(n), title: n.title, date: n.date, lang: n.lang })),
  ...projects.map((p) => ({ type: 'project', href: urlFor(p), title: p.title, date: p.date, lang: p.lang })),
  { type: 'beat', href: u('music/'), title: 'The player', sub: `${beats.tracks.length} beats`, date: beats.date || null, lang: 'en' },
].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

write('index.html', layout({
  title: 'Chocho', active: 'home',
  content: `
  <p class="intro">Chocho Isac Olmer - music producer and audio branding, Tel-Aviv.</p>
  <div class="cards">${feed.map(card).join('')}</div>`,
}));

/* ---------- notes ---------- */
write('notes/index.html', layout({
  title: 'Notes', active: 'notes',
  content: `<h1 class="lang-en">Notes</h1>
  ${notes.length ? `<ul class="index-list">${notes.map((n) => `<li ${n.lang === 'he' ? 'dir="rtl"' : ''}><a href="${urlFor(n)}" class="lang-${n.lang}">${esc(n.title)}</a> <span class="dim">${fmtDate(n.date)}</span></li>`).join('')}</ul>` : '<p class="dim">Nothing planted yet.</p>'}`,
}));

for (const n of notes) {
  const bl = backlinks.get(n.slug) || [];
  write(`notes/${n.slug}/index.html`, layout({
    title: n.title, active: `note:${n.slug}`, lang: n.lang,
    content: `<article ${n.lang === 'he' ? 'dir="rtl"' : ''}>
      <h1 class="lang-${n.lang}">${esc(n.title)}</h1>
      ${n.date ? `<p class="dim">last tended ${fmtDate(n.date)}</p>` : ''}
      ${render(n)}
      ${bl.length ? `<section class="backlinks"><h2>Linked from</h2><ul>${bl.map((b) => `<li><a href="${urlFor(b)}">${esc(b.title)}</a></li>`).join('')}</ul></section>` : ''}
    </article>`,
  }));
}

/* ---------- projects ---------- */
write('projects/index.html', layout({
  title: 'Projects', active: 'projects',
  content: `<h1 class="lang-en">Projects</h1>
  <ul class="index-list">${projects.map((p) => `<li><a href="${urlFor(p)}" class="lang-${p.lang}">${esc(p.title)}</a> <span class="dim">${fmtDate(p.date)}</span></li>`).join('')}</ul>`,
}));

for (const p of projects) {
  const bl = backlinks.get(p.slug) || [];
  write(`projects/${p.slug}/index.html`, layout({
    title: p.title, active: `project:${p.slug}`, lang: p.lang,
    content: `<article ${p.lang === 'he' ? 'dir="rtl"' : ''}>
      <h1 class="lang-${p.lang}">${esc(p.title)}</h1>
      ${render(p)}
      ${bl.length ? `<section class="backlinks"><h2>Linked from</h2><ul>${bl.map((b) => `<li><a href="${urlFor(b)}">${esc(b.title)}</a></li>`).join('')}</ul></section>` : ''}
    </article>`,
  }));
}

/* ---------- music (phase-1 plain list; restyled player lands in phase 2) ---------- */
write('music/index.html', layout({
  title: 'Music', active: 'music',
  content: `<h1 class="lang-en">Music</h1>
  <ul class="tracklist">
  ${beats.tracks.map((t) => `<li>
    <div class="track-head"><span class="lang-en track-title">${esc(t.title)}</span><span class="dim">${fmtDur(t.dur)}</span></div>
    <audio controls preload="none" src="${u(t.file)}"></audio>
  </li>`).join('')}
  </ul>`,
}));

/* ---------- photos ---------- */
const photos = exists('content/photos/photos.json') ? JSON.parse(read('content/photos/photos.json')) : [];
const allTags = [...new Set(photos.flatMap((p) => p.tags || []))].sort();

function photosPage(sel) {
  const list = sel ? photos.filter((p) => (p.tags || []).includes(sel)) : photos;
  const tagBar = allTags.length ? `<div class="photo-tags">
    <a href="${u('photos/')}" class="${sel ? '' : 'on'}">all</a>
    ${allTags.map((t) => `<a href="${u(`photos/tag/${t.toLowerCase()}/`)}" class="${sel === t ? 'on' : ''}">#${esc(t)}</a>`).join('')}
  </div>` : '';
  return layout({
    title: sel ? `#${sel}` : 'Photos', active: 'photos',
    content: `<h1 class="lang-en">Photos</h1>${tagBar}
    ${list.length ? `<div class="photo-stream">
      ${list.map((p) => `<a href="${u(`photos/img/${p.file}`)}" title="${esc((p.tags || []).map((t) => '#' + t).join(' '))}"><img src="${u(`photos/img/thumb-${p.file}`)}" alt="${esc(p.alt || '')}" loading="lazy"></a>`).join('')}
    </div>` : '<p class="dim">Nothing developed yet.</p>'}`,
  });
}

write('photos/index.html', photosPage(null));
for (const t of allTags) write(`photos/tag/${t.toLowerCase()}/index.html`, photosPage(t));
if (exists('content/photos/img')) fs.cpSync('content/photos/img', path.join(OUT, 'photos/img'), { recursive: true });

/* ---------- about ---------- */
const about = pages.find((p) => p.slug === 'about');
if (about) {
  write('about/index.html', layout({
    title: 'About', active: 'about', lang: about.lang,
    content: `<article ${about.lang === 'he' ? 'dir="rtl"' : ''}><h1 class="lang-${about.lang}">${esc(about.title)}</h1>${render(about)}</article>`,
  }));
}

/* ---------- 404 ---------- */
write('404.html', layout({ title: 'Not found', content: '<h1 class="lang-en">404</h1><p>Nothing grows here.</p>' }));

/* ---------- static assets + media ---------- */
fs.cpSync('site/fonts', path.join(OUT, 'fonts'), { recursive: true });
fs.copyFileSync('site/style.css', path.join(OUT, 'style.css'));
for (const f of fs.readdirSync('.')) {
  if (/\.(mp3|png|jpe?g|webp)$/i.test(f)) fs.copyFileSync(f, path.join(OUT, f));
}

console.log('built', fs.readdirSync(OUT).length, 'entries in _site');
