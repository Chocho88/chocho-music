# PROJECT.md — chocho-music

## What this is
Music portfolio site ("ChoHog") for chocho.lol. Beats, projects, productions, photos — bilingual content.

## How it works
- Content lives in `content/` (beats, pages, photos, projects), mp3s + covers in the repo root / `covers/`
- `npm run build` (runs `build.js`) generates the site into `_site/`
- Pushing to `main` triggers GitHub Actions (`.github/workflows/build.yml`) which builds and deploys automatically
- Live at **https://chocho.lol** (GitHub Pages custom domain; DNS at Porkbun — 4 A records to GitHub's IPs + www CNAME to chocho88.github.io; https enforced 2026-07-17. If the cert ever gets stuck: remove + re-add the Pages custom domain to retrigger)
- Publish app at /publish.html — token per device (fine-grained PAT, Contents R/W on this repo only)
- `site/publish.html` — in-browser publish/edit app (token-gated)

## ChoHog v2 "the mechanical garden" (2026-07-18 — LIVE on chocho.lol, shipped with user's "ship it")
- Full re-skin: thick ink borders, hard offset shadows, press-down buttons, hover lift, PostHog-style red/blue accent chips, bigger Recoleta titles, mono stamp labels
- Speed: ALL fonts self-hosted (`site/fonts/`, incl. IBM Plex Mono + Noto Sans Hebrew — no Google Fonts requests), instant navigation via `site/app.js` (hover-prefetch + fetch-swap, view transitions), lazy/async images
- `site/app.js` is the engine: instant nav, resizable grids (pinch / ⌘-scroll / sliders, persisted), drag-resizable sidebar, hover link previews (from `garden.json`), now-playing pill
- Music player is shared across pages (window.gardenAudio) — audio keeps playing while browsing; player re-adopts the live track when you return to /music/
- Obsidian features: hover preview popovers, markdown callouts (`> [!tip] Title`), backlinks panel, Garden Map page (/garden/) — draggable canvas graph of all content
- Photos: flowing masonry (thumbs regenerated with natural aspect, publish app now uploads aspect thumbs too)
- Sounds (mechanical clicks) deliberately deferred — user said later
- Hero chip = mechanical rotating sign (music/beats/notes/pictures/apps/sites/things), 1s cadence, the box resizes to each word (`.hm-word { width: max-content }` — without it every word measures as the widest one); words editable via site.json `hero_words`
- Instant nav always revalidates pages (`fetch cache:'no-cache'` + 60s session TTL) so publishes appear on the next click; etag 304s keep it instant
- Mobile: home cards are compact info rows (photos card lists real places, player card shows latest beat); all pages audited zero h-overflow at 390px
- QA: 15 + 18 headless puppeteer tests passed (qa.mjs/qa2.mjs pattern in session scratchpad); light+dark+mobile+RTL screenshotted
- NOTE for future sessions: headless Chrome CLI screenshots clamp window width to 500px and crop — use puppeteer-core with setViewport for honest mobile shots

## The beat vault (2026-07-18 late night — LIVE)
- 112 beats total: bulk-ingested 83 tracks from `~/Desktop/My Music 24/Curated Music` via `tools/ingest-beats.mjs` (wav/aiff auto-convert to m4a via afconvert; durations via mdls→afinfo fallback; year from recording tag→file birth date)
- beats.json tracks now carry optional `genre` / `mood` / `year`; music page shows them on cards/rows
- Music page: cards⇄list view toggle, sort (Shuffle default / Newest / By year / A–Z / Longest), filter select (genre/mood/year, only rendered when data exists), everything persisted in localStorage; play order follows the filtered view
- Every coverless beat gets a unique spinning shape — type/points/rotation/color hashed from filename; palette = sun/red/blue/green/ink (`--chip-green` added)
- Publish app: new **Beats** tab (name/genre/mood/year per beat, "Save all changes" = one commit); upload tab renamed "+ Beat"
- GOTCHA fixed: build.js asset copy regex must include every audio extension — m4a 404'd live until added
- 29 original beats have no year yet — fill in via publish → Beats tab

## Current state (2026-07-18, end of v2 night)
- ChoHog v2 LIVE on https://chocho.lol; `main` == `chohog-v2` (fast-forward pushes via `git push origin chohog-v2:main`)
- Working copies on this Mac: main checkout `~/Desktop/chocho claudet/chocho-music` (sitting on `player-preview-assets`) + git worktree `~/Desktop/chocho claudet/chocho-music-v2` (branch `chohog-v2`) — v2 work happens in the worktree
- Publish app tabs: Beat / Photo / Note / Covers / Titles / Edit (+ Site settings via content/site.json; hero text now ends at "I make music" — user trimmed "in Tel-Aviv")
- Content: ~29 beats, 63 photos, projects, "Building with AI" section (incl. Manhattan Math calculator)
- v2 visual review page (screenshots of every page): https://claude.ai/code/artifact/4918c3e7-21ee-4069-b041-9dbaea62b27d
- Parked: `player-preview-assets` branch — 7 tracks hosted, player preview not wired into the site yet; mechanical click sounds for v2 also parked

## Incidents & lessons
- 2026-07-18: a parallel chat session overwrote `site/style.css` with a stale pre-ChoHog copy ("AI card styles" commit) → design reverted live. Fixed by restoring ChoHog css + re-appending the .ai-* block. LESSON: multiple sessions push to main — always `git fetch` and diff against `origin/main` before pushing, especially for `site/style.css` and `build.js`.
- 2026-07-18 (night): "my publish isn't showing" — publishes WERE live; GitHub Pages sends `cache-control: max-age=600`, so the browser shows a stale copy for up to 10 min. Fix shipped: instant nav revalidates every click, publish app statuses now say "hard refresh — Cmd+Shift+R". Remaining gap: the very first address-bar load can still be stale up to 10 min (can't override from our side). Diagnose with `curl -s "https://chocho.lol/?nc=$(date +%s)"` before assuming a deploy failed.

## Decisions
- 2026-07-17: moved off the dark design baseline for this project — ChoHog uses a cream/olive light palette on purpose
- GitHub auth on this Mac goes through the `gh` CLI (logged in as Chocho88, set up 2026-07-17); `gh auth setup-git` wired it into git
- 2026-07-18: THIS PROJECT ONLY — user granted standing approval to push/deploy directly once QA passes ("stop asking for permissions", "push directly when its ready"). Still fetch + check origin/main first (see incident above). Other projects keep the global ask-before-push rule.
- 2026-07-18: QA pattern for this site = puppeteer-core + system Chrome against a local `_site` server: functional suite (instant nav, cross-page audio, sliders, previews, lightbox, RTL) + overflow audit (scrollWidth vs clientWidth at 390px on every page) + real-viewport screenshots. Headless Chrome CLI (`--screenshot`) clamps window width to 500px and silently crops — never use it for mobile shots.
