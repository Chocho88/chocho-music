/* chocho.lol garden engine v2
   - instant navigation: prefetch on hover, fetch-swap <main>, view transitions
   - shared audio: the player survives page changes (now-playing pill)
   - resizable grids: pinch / ctrl+wheel / slider, persisted
   - drag-resizable sidebar
   - hover previews for garden links (garden.json) */
(function () {
  'use strict';
  var d = document, root = d.documentElement;
  var PREFIX = (d.body.getAttribute('data-prefix') || '/');
  var reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* ---------- shared audio + now-playing pill ---------- */
  var audio = window.gardenAudio || (window.gardenAudio = new Audio());
  audio.preload = audio.preload || 'none';
  var pill = d.createElement('a');
  pill.className = 'np-pill';
  pill.href = PREFIX + 'music/';
  pill.innerHTML = '<span class="eq"><i></i><i></i><i></i></span><span class="t"></span>';
  d.body.appendChild(pill);
  function onMusicPage() { return !!d.getElementById('player'); }
  function updatePill() {
    var playing = !audio.paused && audio.src;
    d.body.classList.toggle('is-playing', !!playing);
    pill.querySelector('.t').textContent = window.gardenNow || '';
    pill.classList.toggle('show', !!(playing && !onMusicPage()));
  }
  audio.addEventListener('play', updatePill);
  audio.addEventListener('pause', updatePill);
  audio.addEventListener('ended', updatePill);

  /* ---------- instant navigation ---------- */
  var cache = new Map(); // url -> {t, p:Promise<text>}
  function cacheGet(url) {
    var e = cache.get(url);
    if (e && Date.now() - e.t < 60000) return e.p; // fresh enough for this session
    if (cache.size > 40) cache.delete(cache.keys().next().value);
    // no-cache = always revalidate with the server (etag 304 keeps it instant),
    // so a fresh publish shows up on the next click instead of 10 minutes later
    var p = fetch(url, { credentials: 'same-origin', cache: 'no-cache' }).then(function (r) {
      if (!r.ok) throw new Error(r.status);
      return r.text();
    }).catch(function (err) { cache.delete(url); throw err; });
    cache.set(url, { t: Date.now(), p: p });
    return p;
  }
  function linkFor(el) {
    var a = el && el.closest ? el.closest('a') : null;
    if (!a) return null;
    if (a.target || a.hasAttribute('download')) return null;
    var href = a.getAttribute('href');
    if (!href || href.slice(0, 1) === '#') return null;
    var url;
    try { url = new URL(a.href, location.href); } catch (e) { return null; }
    if (url.origin !== location.origin) return null;
    if (/\.(mp3|jpe?g|png|webp|zip|pdf)$/i.test(url.pathname)) return null;
    return url;
  }
  d.addEventListener('mouseover', function (e) {
    var url = linkFor(e.target);
    if (url && url.pathname !== location.pathname) { try { cacheGet(url.pathname + url.search); } catch (err) {} }
  });
  d.addEventListener('touchstart', function (e) {
    var url = linkFor(e.target);
    if (url && url.pathname !== location.pathname) { try { cacheGet(url.pathname + url.search); } catch (err) {} }
  }, { passive: true });

  function swapDoc(html, url, push) {
    var doc = new DOMParser().parseFromString(html, 'text/html');
    var newMain = doc.querySelector('main');
    var newSide = doc.querySelector('.sidebar');
    if (!newMain || !newSide) { location.assign(url); return; }
    function apply() {
      d.title = doc.title;
      root.lang = doc.documentElement.lang || 'en';
      var oldMain = d.querySelector('main');
      oldMain.replaceWith(d.adoptNode(newMain));
      // sidebar: sync active states + open groups without losing scroll
      var cur = d.querySelector('.sidebar');
      if (cur) {
        var map = {};
        newSide.querySelectorAll('a').forEach(function (a) { map[a.getAttribute('href')] = a.className; });
        cur.querySelectorAll('a').forEach(function (a) {
          var c = map[a.getAttribute('href')]; if (c !== undefined) a.className = c;
        });
        var newDet = newSide.querySelector('details'), curDet = cur.querySelector('details');
        if (newDet && curDet) curDet.open = newDet.open;
      }
      // swap page-scoped extras (lightbox markup, player script...) and run their scripts
      d.querySelectorAll('.page-extra').forEach(function (el) { el.remove(); });
      var extra = doc.querySelector('.page-extra');
      if (extra) {
        var host = d.adoptNode(extra);
        d.body.appendChild(host);
        host.querySelectorAll('script').forEach(function (s) {
          if (s.src || s.hasAttribute('data-keep')) return;
          var el = d.createElement('script');
          el.textContent = s.textContent;
          s.replaceWith(el);
        });
      }
      d.body.classList.remove('nav-open');
      initPage();
      updatePill();
    }
    if (push) history.pushState({ garden: true }, '', url);
    if (!reduceMotion && d.startViewTransition) d.startViewTransition(apply);
    else apply();
  }
  function go(url, push) {
    var key = url.pathname + url.search;
    cacheGet(key).then(function (html) {
      swapDoc(html, key + (url.hash || ''), push);
      if (url.hash) {
        var t = d.getElementById(url.hash.slice(1));
        if (t) t.scrollIntoView(); else window.scrollTo(0, 0);
      } else window.scrollTo(0, 0);
    }).catch(function () { location.assign(url.href); });
  }
  d.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var url = linkFor(e.target);
    if (!url) return;
    if (url.pathname === location.pathname && url.hash) return; // same-page anchor
    if (url.pathname === location.pathname && !url.hash) { e.preventDefault(); window.scrollTo(0, 0); return; }
    e.preventDefault();
    history.replaceState({ garden: true, scroll: window.scrollY }, '');
    go(url, true);
  });
  window.addEventListener('popstate', function (e) {
    var scroll = (e.state && e.state.scroll) || 0;
    var url = new URL(location.href);
    cacheGet(url.pathname + url.search).then(function (html) {
      swapDoc(html, null, false);
      window.scrollTo(0, scroll);
    }).catch(function () { location.reload(); });
  });

  /* ---------- persisted size vars ---------- */
  function setVar(name, val, key) {
    root.style.setProperty(name, val + 'px');
    try { localStorage.setItem(key, val); } catch (e) {}
  }
  function getPref(key, fallback) {
    try { var v = parseInt(localStorage.getItem(key)); return isNaN(v) ? fallback : v; } catch (e) { return fallback; }
  }
  var sizes = {
    beat:  { cssVar: '--beat-min',  key: 'gardenBeatMin',  min: 110, max: 260, val: 0, sel: '.beat-grid',    slider: 'beatSize' },
    photo: { cssVar: '--photo-col', key: 'gardenPhotoCol', min: 160, max: 420, val: 0, sel: '.photo-stream', slider: 'photoSize' },
    sb:    { cssVar: '--sb-w',      key: 'gardenSbW',      min: 170, max: 360, val: 0 }
  };
  sizes.beat.val = getPref(sizes.beat.key, 150);
  sizes.photo.val = getPref(sizes.photo.key, 250);
  sizes.sb.val = getPref(sizes.sb.key, 232);
  Object.keys(sizes).forEach(function (k) { root.style.setProperty(sizes[k].cssVar, sizes[k].val + 'px'); });

  function bump(s, delta) {
    s.val = Math.max(s.min, Math.min(s.max, s.val + delta));
    setVar(s.cssVar, s.val, s.key);
    var el = d.getElementById(s.slider); if (el) el.value = s.val;
  }
  // sliders (re-bound per page via delegation)
  d.addEventListener('input', function (e) {
    var t = e.target;
    if (t.id === 'beatSize') { sizes.beat.val = +t.value; setVar('--beat-min', t.value, sizes.beat.key); }
    if (t.id === 'photoSize') { sizes.photo.val = +t.value; setVar('--photo-col', t.value, sizes.photo.key); }
  });
  // ctrl/cmd + wheel over the grids
  d.addEventListener('wheel', function (e) {
    if (!e.ctrlKey && !e.metaKey) return;
    var over = e.target.closest && (e.target.closest('.beat-grid') ? sizes.beat : e.target.closest('.photo-stream') ? sizes.photo : null);
    if (!over) return;
    e.preventDefault();
    bump(over, e.deltaY < 0 ? 10 : -10);
  }, { passive: false });
  // touch pinch over the grids
  var pinch = null;
  d.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 2) return;
    var s = e.target.closest && (e.target.closest('.beat-grid') ? sizes.beat : e.target.closest('.photo-stream') ? sizes.photo : null);
    if (!s) return;
    pinch = { s: s, dist: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY) };
  }, { passive: true });
  d.addEventListener('touchmove', function (e) {
    if (!pinch || e.touches.length !== 2) return;
    e.preventDefault();
    var nd = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
    var delta = nd - pinch.dist;
    if (Math.abs(delta) > 8) { bump(pinch.s, delta > 0 ? 8 : -8); pinch.dist = nd; }
  }, { passive: false });
  d.addEventListener('touchend', function () { pinch = null; });
  // safari trackpad pinch
  var gestScale = 1;
  d.addEventListener('gesturestart', function (e) {
    var s = e.target.closest && (e.target.closest('.beat-grid') ? sizes.beat : e.target.closest('.photo-stream') ? sizes.photo : null);
    if (!s) return; e.preventDefault(); gestScale = e.scale; pinch = { s: s };
  });
  d.addEventListener('gesturechange', function (e) {
    if (!pinch) return; e.preventDefault();
    var delta = e.scale - gestScale;
    if (Math.abs(delta) > 0.06) { bump(pinch.s, delta > 0 ? 10 : -10); gestScale = e.scale; }
  });
  d.addEventListener('gestureend', function () { pinch = null; });

  /* ---------- sidebar drag resize ---------- */
  var handle = d.querySelector('.sb-handle');
  if (handle) {
    handle.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      handle.classList.add('dragging');
      handle.setPointerCapture(e.pointerId);
      function move(ev) {
        var w = root.dir === 'rtl' ? window.innerWidth - ev.clientX : ev.clientX;
        sizes.sb.val = Math.max(sizes.sb.min, Math.min(sizes.sb.max, w));
        root.style.setProperty('--sb-w', sizes.sb.val + 'px');
      }
      function up() {
        handle.classList.remove('dragging');
        try { localStorage.setItem(sizes.sb.key, sizes.sb.val); } catch (err) {}
        handle.removeEventListener('pointermove', move);
        handle.removeEventListener('pointerup', up);
      }
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
    });
  }

  /* ---------- hover previews (garden.json) ---------- */
  var peek = d.createElement('div');
  peek.className = 'peek';
  d.body.appendChild(peek);
  var gardenIndex = null, gardenLoading = null, peekTimer = null, peekFor = null;
  function loadIndex() {
    if (gardenIndex) return Promise.resolve(gardenIndex);
    if (!gardenLoading) {
      gardenLoading = fetch(PREFIX + 'garden.json').then(function (r) { return r.json(); }).then(function (j) {
        gardenIndex = {};
        j.nodes.forEach(function (n) { gardenIndex[n.url] = n; });
        return gardenIndex;
      });
    }
    return gardenLoading;
  }
  function nodeForLink(a) {
    if (!gardenIndex) return null;
    var url; try { url = new URL(a.href, location.href); } catch (e) { return null; }
    return gardenIndex[url.pathname + url.hash] || gardenIndex[url.pathname] || null;
  }
  function hidePeek() { peek.classList.remove('show'); peekFor = null; clearTimeout(peekTimer); }
  d.addEventListener('mouseover', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (!a || a === peekFor) return;
    if (!(a.classList.contains('wiki') || a.closest('.index-list, .backlinks, .sidebar details, .project-toc'))) return;
    var url; try { url = new URL(a.href, location.href); } catch (err) { return; }
    if (url.origin !== location.origin) return;
    if (url.pathname + url.hash === location.pathname + location.hash) return;
    clearTimeout(peekTimer);
    peekTimer = setTimeout(function () {
      loadIndex().then(function () {
        var n = nodeForLink(a);
        if (!n) return;
        peekFor = a;
        var rtl = n.lang === 'he';
        peek.innerHTML = '<span class="pk-type"></span><span class="pk-title"' + (rtl ? ' dir="rtl"' : '') + '></span>' +
          (n.excerpt ? '<span class="pk-ex"' + (rtl ? ' dir="rtl"' : '') + '></span>' : '') +
          (n.date ? '<span class="pk-date"></span>' : '');
        peek.querySelector('.pk-type').textContent = n.type;
        peek.querySelector('.pk-title').textContent = n.title;
        if (n.excerpt) peek.querySelector('.pk-ex').textContent = n.excerpt;
        if (n.date) peek.querySelector('.pk-date').textContent = n.date;
        var r = a.getBoundingClientRect();
        var x = Math.min(Math.max(8, r.left), window.innerWidth - 316);
        var below = r.bottom + 12;
        peek.style.left = x + 'px';
        if (below + 150 > window.innerHeight) { peek.style.top = ''; peek.style.bottom = (window.innerHeight - r.top + 10) + 'px'; }
        else { peek.style.bottom = ''; peek.style.top = below + 'px'; }
        peek.classList.add('show');
      }).catch(function () {});
    }, 280);
  });
  d.addEventListener('mouseout', function (e) {
    var a = e.target.closest ? e.target.closest('a') : null;
    if (a && (a === peekFor || !peekFor)) hidePeek();
    if (!a) clearTimeout(peekTimer);
  });
  d.addEventListener('scroll', hidePeek, { passive: true, capture: true });
  d.addEventListener('click', hidePeek);

  /* ---------- hero rotating sign (mechanical word flipper) ---------- */
  var rollerTimer = null;
  function initRoller() {
    var mark = d.querySelector('.hero-mark[data-words]');
    if (rollerTimer) { clearInterval(rollerTimer); rollerTimer = null; }
    if (!mark) return;
    var words = mark.getAttribute('data-words').split(',').filter(Boolean);
    if (words.length < 2) return;
    mark.innerHTML = '<span class="hm-win"><span class="hm-roll">' +
      words.map(function (w) { return '<span class="hm-word"></span>'; }).join('') + '</span></span>';
    var roll = mark.querySelector('.hm-roll'), win = mark.querySelector('.hm-win');
    var slots = roll.children;
    for (var i = 0; i < words.length; i++) slots[i].textContent = words[i];
    var idx = 0, h = 0;
    function fit(instant) {
      h = slots[0].offsetHeight;
      var w = Math.ceil(slots[idx].getBoundingClientRect().width);
      if (instant) win.style.transition = 'none';
      win.style.width = w + 'px';
      if (instant) { void win.offsetWidth; win.style.transition = ''; }
      roll.style.transform = 'translateY(' + (-idx * h) + 'px)';
    }
    fit(true);
    rollerTimer = setInterval(function () {
      if (!mark.isConnected) { clearInterval(rollerTimer); rollerTimer = null; return; }
      if (d.hidden) return;
      idx = (idx + 1) % words.length;
      if (reduceMotion) { fit(true); return; }
      mark.classList.add('ticking');           // the mechanism engages...
      setTimeout(function () {
        fit(false);                            // ...the sign rolls...
        setTimeout(function () { mark.classList.remove('ticking'); }, 170); // ...and releases
      }, 110);
    }, 1000);
    window.addEventListener('resize', function () { if (mark.isConnected) fit(true); });
  }

  /* ---------- per-page init ---------- */
  function initPage() {
    var b = d.getElementById('beatSize'); if (b) b.value = sizes.beat.val;
    var p = d.getElementById('photoSize'); if (p) p.value = sizes.photo.val;
    initRoller();
  }
  initPage();
  updatePill();
})();
