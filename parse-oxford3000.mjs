/**
 * Oxford 3000 PDF → data/vocab-oxford3000.json
 *
 * Expected line format (Oxford 3000 word list):
 *   word POS CEFR
 *   act v. A2, n. B1   (multi POS/CEFR — merged to lowest CEFR + senses[])
 *
 * Usage:
 *   node scripts/parse-oxford3000.mjs path/to/oxford-3000.txt
 *   node scripts/parse-oxford3000.mjs path/to/extracted-lines.txt
 *
 * Place Oxford 3000 PDF text export in project root or pass path.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const CEFR_ORDER = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2'];

function cefrMin(a, b) {
  return CEFR_ORDER.indexOf(a) <= CEFR_ORDER.indexOf(b) ? a : b;
}

function parseLine(line) {
  const trimmed = line.trim();
  if (!trimmed || /^#/.test(trimmed)) return null;

  // Multi: "act v. A2, n. B1"
  const multi = trimmed.match(/^(.+?)\s+((?:[a-z]+\.\s*[A-C][12](?:\s*,\s*)?)+)$/i);
  if (multi) {
    const word = multi[1].trim().toLowerCase();
    const senseParts = [...multi[2].matchAll(/([a-z]+)\.\s*([A-C][12])/gi)];
    const senses = senseParts.map((m) => ({
      pos: m[1].toLowerCase().replace(/\.$/, ''),
      cefr: m[2].toUpperCase(),
    }));
    const primaryCefr = senses.reduce((min, s) => cefrMin(min, s.cefr), senses[0].cefr);
    return { word, primaryCefr, senses };
  }

  // Simple: "ability n. B1"
  const simple = trimmed.match(/^(.+?)\s+([a-z]+)\.\s*([A-C][12])$/i);
  if (simple) {
    const word = simple[1].trim().toLowerCase();
    const pos = simple[2].toLowerCase();
    const cefr = simple[3].toUpperCase();
    return { word, primaryCefr: cefr, senses: [{ pos, cefr }] };
  }
  return null;
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Usage: node scripts/parse-oxford3000.mjs <oxford-3000-lines.txt>');
  process.exit(1);
}

const lines = readFileSync(inputPath, 'utf8').split(/\r?\n/);
const byWord = new Map();

for (const line of lines) {
  const parsed = parseLine(line);
  if (!parsed) continue;
  const existing = byWord.get(parsed.word);
  if (!existing) {
    byWord.set(parsed.word, parsed);
  } else {
    const senses = [...existing.senses];
    for (const s of parsed.senses) {
      if (!senses.some((x) => x.pos === s.pos && x.cefr === s.cefr)) senses.push(s);
    }
    existing.senses = senses;
    existing.primaryCefr = senses.reduce((min, s) => cefrMin(min, s.cefr), senses[0].cefr);
  }
}

const entries = [...byWord.entries()]
  .sort(([a], [b]) => a.localeCompare(b))
  .map(([word, data], i) => ({
    id: `ox-${String(i + 1).padStart(4, '0')}`,
    word,
    primaryCefr: data.primaryCefr,
    senses: data.senses,
  }));

const dataDir = join(__dirname, '..', 'data');
mkdirSync(dataDir, { recursive: true });
const out = {
  meta: {
    name: 'Oxford 3000',
    entryCount: entries.length,
    parser: 'parse-oxford3000.mjs',
    enrichment: 'client-side (dictionaryapi.dev + localStorage)',
  },
  entries,
};

writeFileSync(join(dataDir, 'vocab-oxford3000.json'), JSON.stringify(out, null, 2));
console.log(`Parsed ${entries.length} unique words → data/vocab-oxford3000.json`);
