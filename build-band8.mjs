/**
 * Merge HTML VOCAB (w001–w055) + band8-additions → data/vocab-band8plus.json
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { BAND8_ADDITIONS } from './band8-additions.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const htmlPath = join(root, 'IELTS Studio (2).html');
const html = readFileSync(htmlPath, 'utf8');

const match = html.match(/const VOCAB = \[([\s\S]*?)\];\s*\n\s*const READING/);
if (!match) {
  console.error('Could not extract VOCAB from HTML');
  process.exit(1);
}

// eslint-disable-next-line no-eval
const existing = eval(`[${match[1]}]`);

const seen = new Set(existing.map((e) => e.word.toLowerCase()));
const merged = [...existing];
for (const entry of BAND8_ADDITIONS) {
  if (seen.has(entry.word.toLowerCase())) {
    console.warn(`Skip duplicate: ${entry.word}`);
    continue;
  }
  seen.add(entry.word.toLowerCase());
  merged.push(entry);
}

const byCat = {};
for (const e of merged) {
  byCat[e.category] = (byCat[e.category] || 0) + 1;
}

const out = {
  meta: {
    name: 'IELTS Band 8+ Curated',
    targetBand: '8+',
    entryCount: merged.length,
    categories: byCat,
    enrichment: 'full (phonetic, definition, collocations, IELTS examples)',
    note: 'Client-side dictionary cache optional for extra senses.',
  },
  entries: merged,
};

const dataDir = join(root, 'data');
mkdirSync(dataDir, { recursive: true });
writeFileSync(join(dataDir, 'vocab-band8plus.json'), JSON.stringify(out, null, 2));
console.log(`Band 8+: ${existing.length} existing + ${merged.length - existing.length} new = ${merged.length} total`);
console.log('Categories:', byCat);
