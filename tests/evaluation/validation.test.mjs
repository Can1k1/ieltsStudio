import { validateEssay } from '../../lib/evaluation/essay-validator.mjs';
import { evaluateIeltsWriting } from '../../lib/evaluation/ielts-evaluator.mjs';

const PROMPT =
  'Many young people today struggle to find employment after graduating from university. Some argue that universities should focus more on practical skills and less on academic theory. To what extent do you agree with this view?';

let passed = 0;
let failed = 0;

function assert(cond, msg) {
  if (cond) passed++;
  else {
    failed++;
    console.error('FAIL:', msg);
  }
}

const lorem = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. '.repeat(20);
const loremV = validateEssay(lorem, { taskType: 'task2', minWords: 250, prompt: PROMPT });
assert(loremV.issues.some(i => i.id === 'lorem_ipsum'), 'lorem ipsum detected');
assert(loremV.skipScoring, 'lorem skips scoring');

const copyPrompt = PROMPT + '\n\n' + PROMPT + ' I think universities should change.';
const copyV = validateEssay(copyPrompt, { taskType: 'task2', minWords: 250, prompt: PROMPT });
assert(copyV.issues.some(i => i.category === 'prompt_copy'), 'prompt copy detected');

const short = 'hello world test asdf qwerty';
const shortV = validateEssay(short, { taskType: 'task2', minWords: 250, prompt: PROMPT });
assert(shortV.issues.some(i => i.id === 'extremely_short'), 'short essay flagged');
assert(shortV.qualityGate.blockBand7Plus, 'short blocks band 7');

const stuffed = (
  'In this day and age technology is important. Furthermore people use phones. ' +
  'This essay will discuss advantages and disadvantages. It is undeniable that society changes. '
).repeat(15);
const stuffedV = validateEssay(stuffed, { taskType: 'task2', minWords: 250, prompt: PROMPT });
assert(stuffedV.issues.some(i => i.category === 'template_abuse'), 'template abuse');

const offTopic = (
  'Climate change affects polar bears in the Arctic. Ice melts every summer. ' +
  'Governments should protect wildlife habitats and reduce carbon from factories. '
).repeat(12);
const offV = validateEssay(offTopic, { taskType: 'task2', minWords: 250, prompt: PROMPT });
assert(offV.issues.some(i => i.category === 'off_topic'), 'off-topic detected');

const blockedEval = evaluateIeltsWriting('test test test hello', {
  taskType: 'task2',
  minWords: 250,
  prompt: PROMPT,
});
assert(blockedEval.validationBlocked === true, 'critical essay blocks scoring');
assert(blockedEval.overall < 7, 'blocked essay never band 7+');

const goodish = `Many graduates struggle to find employment after university. I largely agree that universities should emphasise practical skills alongside theory.

Firstly, employers often complain that graduates lack workplace-ready abilities. For example, a 2019 survey in the UK found that over forty percent of employers wanted stronger communication and project skills. Universities that offer internships and applied modules can bridge this gap.

Secondly, academic theory remains valuable because it develops critical thinking. Students who only memorise procedures may struggle when industries change. A balanced curriculum can teach both conceptual understanding and hands-on practice.

In conclusion, while theory should not disappear, universities ought to redesign courses so graduates leave with demonstrable practical competence. This would better match labour-market needs without abandoning intellectual depth.`;
const goodV = validateEssay(goodish, { taskType: 'task2', minWords: 250, prompt: PROMPT });
assert(goodV.passed || goodV.severity === 'low' || goodV.severity === 'medium', 'reasonable essay passes or mild flags only');

const goodEval = evaluateIeltsWriting(goodish, { taskType: 'task2', minWords: 250, prompt: PROMPT });
assert(goodEval.validation && Array.isArray(goodEval.validation.issues), 'evaluation includes validation');
assert(
  goodEval.ta < 7 || goodEval.validation.qualityGate.blockBand7Plus === false,
  'band 7 gate respected'
);

console.log(`\nValidation tests: ${passed} passed, ${failed} failed`);
process.exit(failed > 0 ? 1 : 0);
