/**
 * Replaces inline writing feedback block in index.html with writing-feedback.js
 */
import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'index.html');
const fbPath = join(root, 'writing-feedback.js');

let html = readFileSync(htmlPath, 'utf8');
const fb = readFileSync(fbPath, 'utf8');

const endMark = 'function closeWriting()';
const saveDraftEnd = html.indexOf('function saveDraft(id)');
if (saveDraftEnd < 0) {
  console.error('Could not find saveDraft in index.html');
  process.exit(1);
}
const blockEnd = html.indexOf('\n', html.indexOf('}', html.indexOf('setTimeout', saveDraftEnd)));
const end = html.indexOf(endMark, blockEnd);
if (blockEnd < 0 || end < 0) {
  console.error('Could not find feedback block in index.html');
  process.exit(1);
}

html = html.slice(0, blockEnd + 1) + '\n' + fb + '\n\n' + html.slice(end);
writeFileSync(htmlPath, html);
console.log('Synced writing-feedback.js into index.html');
