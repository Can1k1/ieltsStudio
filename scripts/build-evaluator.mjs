/**

 * Inlines lib/evaluation/*.mjs into writing-feedback.js (browser bundle).

 */

import { readFileSync, writeFileSync } from 'fs';

import { join, dirname } from 'path';

import { fileURLToPath } from 'url';



const root = join(dirname(fileURLToPath(import.meta.url)), '..');



function stripModuleSyntax(src) {

  return src

    .replace(/^import .+ from ['"].+['"];\s*\n/gm, '')

    .replace(/^export \{[^}]+\} from .+;\s*\n/gm, '')

    .replace(/^export function /gm, 'function ')

    .replace(/^export /gm, '');

}



const validator = stripModuleSyntax(

  readFileSync(join(root, 'lib/evaluation/essay-validator.mjs'), 'utf8')

);

const evaluator = stripModuleSyntax(

  readFileSync(join(root, 'lib/evaluation/ielts-evaluator.mjs'), 'utf8')

);



const uiPath = join(root, 'writing-feedback-ui.js');

let ui = '';

try {

  ui = readFileSync(uiPath, 'utf8');

} catch {

  ui = readFileSync(join(root, 'writing-feedback.js'), 'utf8');

  const start = ui.indexOf('function renderFeedbackUI');

  if (start > 0) {

    writeFileSync(uiPath, ui.slice(start));

    ui = readFileSync(uiPath, 'utf8');

  }

}



const out = [

  '/* Strict IELTS evaluator — lib/evaluation/essay-validator.mjs + ielts-evaluator.mjs (npm run build:evaluator) */',

  validator,

  evaluator,

  '',

  ui,

].join('\n');



writeFileSync(join(root, 'writing-feedback.js'), out);

console.log('Built writing-feedback.js from validator + evaluator + UI');


