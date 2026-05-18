import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const html = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'IELTS Studio (2).html'), 'utf8');
const m = html.match(/<script>([\s\S]*)<\/script>/);
if (!m) throw new Error('no script');
try {
  new Function(m[1]);
  console.log('JS syntax OK');
} catch (e) {
  console.error('JS error:', e.message);
  process.exit(1);
}
console.log('motion tags:', (html.match(/<\/?motion>/g) || []).length);
