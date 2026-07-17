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

## Current state (2026-07-18)
- Live on https://chocho.lol with https enforced; publish → live in ~1 min
- Publish app tabs: Beat / Photo / Note / Covers / Titles / Edit (+ Site settings via content/site.json)
- Content: ~29 beats, 63 photos, projects, "Building with AI" section (incl. Manhattan Math calculator)
- Homepage: ChoHog hero ("Hey, I'm Chocho...") — editable via content/site.json (name, hero, description) in the publish Edit tab
- Parked: `player-preview-assets` branch — 7 tracks hosted, player preview not wired into the site yet

## Incidents & lessons
- 2026-07-18: a parallel chat session overwrote `site/style.css` with a stale pre-ChoHog copy ("AI card styles" commit) → design reverted live. Fixed by restoring ChoHog css + re-appending the .ai-* block. LESSON: multiple sessions push to main — always `git fetch` and diff against `origin/main` before pushing, especially for `site/style.css` and `build.js`.

## Decisions
- 2026-07-17: moved off the dark design baseline for this project — ChoHog uses a cream/olive light palette on purpose
- GitHub auth on this Mac goes through the `gh` CLI (logged in as Chocho88, set up 2026-07-17); `gh auth setup-git` wired it into git
