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

const renderMd = (md, self) => marked.parse(resolveYt(resolveWiki(md, self)));

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
    <a class="site-name" href="${u('')}">Chocho</a>
    ${link('', 'Home', 'home')}
    ${link('music/', 'Music', 'music')}
    ${link('projects/', 'Music & Sound Projects', 'projects')}
    ${link('artlist/', 'Artlist', 'artlist')}
    ${link('photos/', 'Photos', 'photos')}
    <details ${active.startsWith('note') ? 'open' : ''}><summary>${link('notes/', 'Notes', 'notes')}</summary>${noteTree || '<span class="sub empty">-</span>'}</details>
    ${link('about/', 'About', 'about')}
    <button id="langToggle" class="lang-toggle" aria-label="switch content language">עב</button>
  </nav>`;
}

const langScript = `<script>
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
<title>${esc(title)}${title === 'Chocho' ? '' : ' · Chocho'}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Noto+Sans+Hebrew:wght@400;700;900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${u('style.css')}">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 16'%3E%3Ctext y='13' font-size='14'%3E%E2%9D%80%3C/text%3E%3C/svg%3E">
${extraHead}
</head>
<body>
<button class="menu-btn" onclick="document.body.classList.toggle('nav-open')" aria-label="menu">☰</button>
${nav(active)}
<main>${content}</main>
${langScript}
${extraBody}
</body>
</html>`;
}

/* ---------- cards feed (home) ---------- */
function card({ type, href, title, titleHe, date, lang, sub }) {
  const t = titleHe
    ? `<span class="card-title lang-en i18n i18n-en">${esc(title)}</span><span class="card-title lang-he i18n i18n-he" dir="rtl">${esc(titleHe)}</span>`
    : `<span class="card-title lang-${lang}">${esc(title)}</span>`;
  return `<a class="card" href="${href}" ${lang === 'he' ? 'dir="rtl"' : ''}>
    <span class="card-type">${icons[type]} ${typeLabel[type]}</span>
    ${t}
    ${sub ? `<span class="card-sub">${esc(sub)}</span>` : ''}
    ${date ? `<span class="card-date">${fmtDate(date)}</span>` : ''}
  </a>`;
}

const artlistPage = pages.find((p) => p.slug === 'artlist');

const feed = [
  ...notes.map((n) => ({ type: 'note', href: u(`notes/${n.slug}/`), title: n.title, date: n.date, lang: n.lang })),
  ...projects.map((p) => ({ type: 'project', href: u(`projects/#${p.slug}`), title: p.title, titleHe: p.titleHe, date: p.date, lang: p.lang })),
  ...(artlistPage ? [{ type: 'project', href: u('artlist/'), title: artlistPage.title, date: artlistPage.date, lang: 'en' }] : []),
  ...(photos.length ? [{ type: 'photo', href: u('photos/'), title: 'Photos', sub: `${photos.length} pictures`, date: photos[0].date, lang: 'en' }] : []),
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

/* ---------- projects: one scrollable page, custom order, bilingual ---------- */
write('projects/index.html', layout({
  title: 'Music & Sound Projects', active: 'projects',
  content: `<h1 class="lang-en">Music &amp; Sound Projects</h1>
  <nav class="project-toc">${projects.map((p) => `<a href="#${p.slug}">${esc(p.title)}</a>`).join('')}</nav>
  ${projects.map((p) => `<article id="${p.slug}" class="project-block">
    ${renderTitle(p, 'h2')}
    ${renderBody(p)}
  </article>`).join('')}`,
}));

/* ---------- artlist ---------- */
if (artlistPage) {
  write('artlist/index.html', layout({
    title: artlistPage.title, active: 'artlist',
    content: `<article>${renderTitle(artlistPage)}${renderBody(artlistPage)}</article>`,
  }));
}

/* ---------- music: player with beat cards + productions ---------- */
const tracksJson = JSON.stringify(beats.tracks.map((t) => ({ title: t.title, file: u(t.file), dur: t.dur, cover: t.cover ? u(t.cover) : null })));
const producedHtml = produced ? `
  <section class="productions">
    <h2 class="lang-en">Productions</h2>
    <p class="dim i18n i18n-en">Songs I produced for other artists · <a href="${produced.playlist}">full playlist on Spotify</a></p>
    <p class="dim i18n i18n-he" dir="rtl">שירים שהפקתי לאמנים אחרים · <a href="${produced.playlist}">הפלייליסט המלא בספוטיפיי</a></p>
    <div class="artists">
    ${produced.artists.map((a) => `<div class="artist-block" dir="rtl">
      <h3 class="lang-he">${esc(a.name)}</h3>
      <ul>${a.tracks.map((t) => `<li><span>${esc(t.title)}</span><span class="dim mono">${esc(t.dur)}</span></li>`).join('')}</ul>
    </div>`).join('')}
    </div>
  </section>` : '';

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
  <div class="beat-grid" id="beatGrid"></div>
  ${producedHtml}`,
  extraBody: `<script>
(function(){
  var TRACKS=${tracksJson};
  var NOTE='<svg viewBox="0 0 24 24" width="26" height="26"><path fill="currentColor" d="M12 3v10.55A4 4 0 1 0 14 17V7h4V3h-6z"/></svg>';
  var audio=new Audio(); audio.preload='none';
  var cur=0, shuffle=true, repeat='none', order=[];
  var $=function(id){return document.getElementById(id);};
  var fmt=function(s){s=Math.max(0,Math.round(s||0));return Math.floor(s/60)+':'+String(s%60).padStart(2,'0');};
  function buildOrder(){ order=TRACKS.map(function(_,i){return i;});
    if(shuffle){ for(var i=order.length-1;i>0;i--){ var j=Math.floor(Math.random()*(i+1)); var t=order[i];order[i]=order[j];order[j]=t; } } }
  var grid=$('beatGrid');
  TRACKS.forEach(function(t,i){
    var el=document.createElement('button');
    el.className='beat-card';
    el.innerHTML='<span class="bc-cover">'+(t.cover?'<img loading="lazy" alt="" src="'+t.cover+'">':NOTE)+'<span class="bc-play"><svg viewBox="0 0 24 24" width="22" height="22"><path fill="currentColor" d="M8 5v14l11-7z"/></svg></span></span>'+
      '<span class="bc-title lang-en"></span><span class="bc-dur dim mono">'+fmt(t.dur)+'</span>';
    el.querySelector('.bc-title').textContent=t.title;
    el.addEventListener('click',function(){ load(i); play(); });
    grid.appendChild(el);
  });
  function load(i){ cur=i; var t=TRACKS[i];
    audio.src=t.file;
    $('npTitle').textContent=t.title;
    $('npCover').innerHTML = t.cover ? '<img alt="" src="'+t.cover+'">' : NOTE;
    $('npDur').textContent=fmt(t.dur); $('npCur').textContent='0:00';
    $('npFill').style.width='0%';
    $('btnDl').href=t.file;
    [].forEach.call(grid.children,function(c,j){ c.classList.toggle('active', j===i); });
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
  audio.addEventListener('timeupdate',function(){ $('npCur').textContent=fmt(audio.currentTime);
    if(audio.duration) $('npFill').style.width=(audio.currentTime/audio.duration*100)+'%'; });
  audio.addEventListener('ended',function(){ if(repeat==='track'){ audio.currentTime=0; play(); } else step(1); });
  audio.addEventListener('play',function(){ $('icoPlay').style.display='none'; $('icoPause').style.display=''; });
  audio.addEventListener('pause',function(){ $('icoPlay').style.display=''; $('icoPause').style.display='none'; });
  buildOrder();
  var start=order[0];
  try{ var s=parseInt(localStorage.getItem('gardenTrack')); if(!isNaN(s)&&TRACKS[s]) start=s; }catch(e){}
  load(start);
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
    ${list.length ? `<div class="photo-stream">
      ${list.map((p) => `<a href="${u(`photos/img/${p.file}`)}"><img src="${u(`photos/img/thumb-${p.file}`)}" alt="${esc(p.alt || '')}" loading="lazy"></a>`).join('')}
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

/* ---------- publish (admin, not in nav) ---------- */
if (exists('site/publish.html')) {
  write('publish/index.html', read('site/publish.html').replaceAll('{{PREFIX}}', PREFIX));
}

/* ---------- 404 ---------- */
write('404.html', layout({ title: 'Not found', content: '<h1 class="lang-en">404</h1><p>Nothing grows here.</p>' }));

/* ---------- static assets + media ---------- */
fs.cpSync('site/fonts', path.join(OUT, 'fonts'), { recursive: true });
fs.copyFileSync('site/style.css', path.join(OUT, 'style.css'));
if (exists('covers')) fs.cpSync('covers', path.join(OUT, 'covers'), { recursive: true });
for (const f of fs.readdirSync('.')) {
  if (/\.(mp3|png|jpe?g|webp)$/i.test(f)) fs.copyFileSync(f, path.join(OUT, f));
}

console.log('built ok:', fs.readdirSync(OUT).length, 'entries in _site');
