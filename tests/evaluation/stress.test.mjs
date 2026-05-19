import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { evaluateIeltsWriting, analyzeEssay } from '../../lib/evaluation/ielts-evaluator.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(
  readFileSync(join(root, 'tests/evaluation/dataset/manifest.json'), 'utf8')
);

const PROMPT_WT005 =
  'Many young people today struggle to find employment after graduating from university. Some argue that universities should focus more on practical skills and less on academic theory. To what extent do you agree with this view?';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) {
    passed++;
  } else {
    failed++;
    console.error('FAIL:', msg);
  }
}

function inRange(val, [lo, hi]) {
  return val >= lo && val <= hi;
}

for (const item of manifest.cases) {
  const essayPath = join(root, 'tests/evaluation/dataset/essays', item.file);
  const essay = readFileSync(essayPath, 'utf8');
  const prompt = item.prompt || PROMPT_WT005;
  const r = evaluateIeltsWriting(essay, {
    taskType: item.taskType || 'task2',
    minWords: item.minWords || 250,
    prompt,
  });

  assert(
    inRange(r.overall, item.expected.overall),
    `${item.id}: overall ${r.overall} not in ${item.expected.overall}`
  );
  if (item.expected.ta) {
    assert(inRange(r.ta, item.expected.ta), `${item.id}: ta ${r.ta}`);
  }
  if (item.maxOverall !== undefined) {
    assert(r.overall <= item.maxOverall, `${item.id}: overall ${r.overall} > max ${item.maxOverall}`);
  }
  if (item.minOverall !== undefined) {
    assert(r.overall >= item.minOverall, `${item.id}: overall ${r.overall} < min ${item.minOverall}`);
  }
  for (const flag of item.mustFlags || []) {
    const has = r.flagMap && r.flagMap[flag];
    assert(has, `${item.id}: expected flag ${flag}`);
  }
  if (item.neverBand7Plus) {
    assert(
      r.overall < 7 && r.ta < 7 && r.cc < 7 && r.lr < 7 && r.gra < 7,
      `${item.id}: Band 7+ not allowed (got ${r.ta}/${r.cc}/${r.lr}/${r.gra}/${r.overall})`
    );
  }
}

// Stress: connector stuffing + vocab should not reach 7+
const stuffed = `
In this day and age, technology is very important. Furthermore, people use phones. However, society changes.
Moreover, technology is significant. Therefore, people are connected. In contrast, some people are isolated.
Furthermore, technology plays a vital role. However, relationships change. Moreover, society is different.
Therefore, we must think. In conclusion, technology has both advantages and disadvantages.
`.repeat(8);
const stuffedR = evaluateIeltsWriting(stuffed, { taskType: 'task2', minWords: 250, prompt: PROMPT_WT005 });
assert(stuffedR.overall < 7, `stuffed essay overall ${stuffedR.overall} must be < 7`);

// Empty edge
const emptyR = evaluateIeltsWriting('hello world', { taskType: 'task2', minWords: 250, prompt: PROMPT_WT005 });
assert(emptyR.overall <= 5, `tiny essay overall ${emptyR.overall}`);

console.log(`\nStress tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
