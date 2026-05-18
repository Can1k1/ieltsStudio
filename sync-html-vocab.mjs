/**
 * Embeds data/vocab-band8plus.json into HTML for offline file:// support.
 * Also enables fetch('data/vocab-band8plus.json') when served over HTTP.
 */
import { readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const htmlPath = join(root, 'IELTS Studio (2).html');
const vocabPath = join(root, 'data', 'vocab-band8plus.json');

const vocab = JSON.parse(readFileSync(vocabPath, 'utf8'));
const embed = JSON.stringify({ entries: vocab.entries });
// Prevent </script> breaking HTML if ever present in content
const safeEmbed = embed.replace(/<\/script/gi, '<\\/script');

let html = readFileSync(htmlPath, 'utf8');

const embedBlock = `<script type="application/json" id="vocab-embed">${safeEmbed}</script>\n`;

// Remove previous embed if re-running
html = html.replace(/<script type="application\/json" id="vocab-embed">[\s\S]*?<\/script>\n?/g, '');

const vocabArrayRe = /const VOCAB = \[[\s\S]*?\];\s*\n/;
if (!vocabArrayRe.test(html)) {
  console.error('Could not find const VOCAB = [...] in HTML');
  process.exit(1);
}

html = html.replace(vocabArrayRe, 'let VOCAB = []; // populated by loadVocab() — source: data/vocab-band8plus.json\n');

const scriptInsert = html.indexOf('<script>\n// ============================================================\n// 1. STATE');
if (scriptInsert === -1) {
  console.error('Could not find main script block');
  process.exit(1);
}

html = html.slice(0, scriptInsert) + embedBlock + html.slice(scriptInsert);

writeFileSync(htmlPath, html);
console.log(`Synced ${vocab.entries.length} words into HTML embed (${(safeEmbed.length / 1024).toFixed(0)} KB)`);
