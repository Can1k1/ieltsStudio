/**
 * Parse Victoria University AWL sublist HTML → data/vocab-awl570.json
 * Source: https://www.wgtn.ac.nz/lals/resources/academicwordlist/sublist/
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });

const entries = [];

for (let sublist = 1; sublist <= 10; sublist++) {
  const file = join(__dirname, `sublist${String(sublist).padStart(2, '0')}.html`);
  let html;
  try {
    html = readFileSync(file, 'utf8');
  } catch {
    console.error(`Missing ${file} — run: download sublists from Victoria AWL first`);
    process.exit(1);
  }
  const start = html.indexOf('<h2>The Academic Word List</h2>');
  const chunk = start >= 0 ? html.slice(start) : html;
  const re = /<p>([^<]+)<\/p>/g;
  let m;
  const headwords = [];
  while ((m = re.exec(chunk)) !== null) {
    const w = m[1].trim();
    if (!w || w.length > 40) continue;
    headwords.push(w);
  }
  const expected = sublist === 10 ? 30 : 60;
  if (headwords.length !== expected) {
    console.warn(`Sublist ${sublist}: expected ${expected}, got ${headwords.length}`);
  }
  for (const headword of headwords) {
    entries.push({
      id: `awl-${String(entries.length + 1).padStart(3, '0')}`,
      headword,
      sublist,
      source: 'coxhead-2000',
    });
  }
}

const out = {
  meta: {
    name: 'Academic Word List',
    version: '2000',
    author: 'Averil Coxhead',
    sourceUrl: 'https://www.wgtn.ac.nz/lals/resources/academicwordlist/',
    headwordCount: entries.length,
    sublistSizes: Object.fromEntries(
      [...Array(10)].map((_, i) => [
        i + 1,
        entries.filter((e) => e.sublist === i + 1).length,
      ])
    ),
    note: 'Headwords only; definitions enriched client-side (Free Dictionary API + cache).',
  },
  entries,
};

writeFileSync(join(dataDir, 'vocab-awl570.json'), JSON.stringify(out, null, 2));
console.log(`Wrote ${entries.length} AWL headwords → data/vocab-awl570.json`);
