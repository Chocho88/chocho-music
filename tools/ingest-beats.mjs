// Bulk-import a folder of audio files into the garden.
// Usage: node tools/ingest-beats.mjs /path/to/folder [--dry]
// - copies files into the repo root (slugified names)
// - reads duration + year from the file's own metadata (Spotlight/mdls)
// - prepends entries to content/beats/beats.json (edit titles/genre/mood/year
//   later in the publish app's Beats tab)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const src = process.argv[2];
const dry = process.argv.includes('--dry');
if (!src || !fs.existsSync(src)) {
  console.error('usage: node tools/ingest-beats.mjs /path/to/folder [--dry]');
  process.exit(1);
}

const AUDIO = /\.(mp3|m4a|wav|aiff?)$/i;
const beatsPath = 'content/beats/beats.json';
const beats = JSON.parse(fs.readFileSync(beatsPath, 'utf8'));
const have = new Set(beats.tracks.map((t) => t.file));

const slugify = (s) => s.toLowerCase().trim()
  .replace(/\.[^.]+$/, '')
  .replace(/[^\w֐-׿]+/g, '-')
  .replace(/^-+|-+$/g, '') || 'beat';

const titleize = (s) => s.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim();

function mdls(file, attr) {
  try {
    const out = execFileSync('mdls', ['-raw', '-name', attr, file], { encoding: 'utf8' }).trim();
    return out === '(null)' ? null : out;
  } catch { return null; }
}

function yearOf(file) {
  const rec = mdls(file, 'kMDItemRecordingYear');
  if (rec && +rec > 1990) return +rec;
  // fall back to the file's own creation date (survives if files came off a backup)
  try {
    const birth = execFileSync('stat', ['-f', '%B', file], { encoding: 'utf8' }).trim();
    const y = new Date(+birth * 1000).getFullYear();
    return y > 1990 ? y : null;
  } catch { return null; }
}

const files = fs.readdirSync(src).filter((f) => AUDIO.test(f)).sort();
if (!files.length) { console.error('no audio files found in ' + src); process.exit(1); }

const added = [], skipped = [];
for (const f of files) {
  const full = path.join(src, f);
  const lossless = /\.(wav|aiff?)$/i.test(f);
  // wav/aiff get converted to AAC (m4a) - a fraction of the size, streams instantly
  const dest = slugify(f) + (lossless ? '.m4a' : path.extname(f).toLowerCase());
  if (have.has(dest) || fs.existsSync(dest)) { skipped.push(dest); continue; }
  let dur = Math.round(+(mdls(full, 'kMDItemDurationSeconds') || 0));
  if (!dur) { // Spotlight may not have indexed the folder - afinfo reads the file directly
    try {
      const out = execFileSync('afinfo', [full], { encoding: 'utf8' });
      const m = out.match(/estimated duration: ([\d.]+)/);
      if (m) dur = Math.round(+m[1]);
    } catch {}
  }
  const year = yearOf(full);
  const entry = { title: titleize(f), file: dest, dur, cover: null };
  if (year) entry.year = year;
  if (!dry) {
    if (lossless) execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac', '-b', '256000', full, dest]);
    else fs.copyFileSync(full, dest);
  }
  added.push(entry);
  console.log(`+ ${dest}  "${entry.title}"  ${Math.floor(dur / 60)}:${String(dur % 60).padStart(2, '0')}  ${year || 'year?'}`);
}

if (skipped.length) console.log(`skipped (already exist): ${skipped.join(', ')}`);
if (!dry && added.length) {
  beats.tracks = [...added, ...beats.tracks];
  beats.date = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(beatsPath, JSON.stringify(beats, null, 2));
}
console.log(`\n${dry ? '[dry run] would add' : 'added'} ${added.length} beats (${skipped.length} skipped). Total: ${beats.tracks.length + (dry ? added.length : 0)}`);
