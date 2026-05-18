import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'IELTS Studio (2).html'), 'utf8');
const m = html.match(/id="vocab-embed">([\s\S]*?)<\/script>/);
const data = JSON.parse(m[1]);
console.log('embed entries:', data.entries.length);
console.log('loadVocab:', html.includes('async function loadVocab'));
console.log('bootApp:', html.includes('bootApp()'));
console.log('opinion filter:', html.includes("filterCards('opinion'"));
console.log('broken tags:', (html.match(/<\/motion>/g) || []).length);
