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

## Current state (2026-07-17)
- ChoHog re-skin shipped: cream/olive palette, sun accent, dot-shaped beat covers
- Edit tab in publish app: full content editor with save/delete
- Latest beats added: Enshitification, WAR AGAIN

## Decisions
- 2026-07-17: moved off the dark design baseline for this project — ChoHog uses a cream/olive light palette on purpose
- GitHub auth on this Mac goes through the `gh` CLI (logged in as Chocho88, set up 2026-07-17); `gh auth setup-git` wired it into git
