/**
 * Strict IELTS Writing evaluator — conservative, descriptor-aligned.
 * Does not inflate scores. Band 7+ blocked when coherence, lexis, grammar, or task response are weak.
 */

import { validateEssay } from './essay-validator.mjs';

export { validateEssay } from './essay-validator.mjs';

// Shared with essay-validator.mjs when bundled for the browser (STOP, tokenize, TEMPLATE_PHRASES, etc.)

const BOILERPLATE = [
  'many people believe',
  'some people think',
  'it is important to',
  'it is essential to',
  'in recent years',
  'in conclusion',
  'to conclude',
  'on the one hand',
  'on the other hand',
  'firstly',
  'secondly',
  'thirdly',
  'overall',
  'society',
  'people',
  'important',
  'significant',
  'various',
  'numerous',
  'several',
];

const CONNECTORS = [
  'furthermore', 'however', 'therefore', 'in contrast', 'moreover', 'nevertheless',
  'consequently', 'on the other hand', 'in addition', 'whereas', 'thus', 'hence',
  'although', 'while', 'because', 'accordingly', 'conversely', 'admittedly',
];

const GRAMMAR_PATTERNS = [
  { re: /\bpeople is\b/gi, msg: 'Subject–verb agreement: "people" takes "are".' },
  { re: /\bgovernment are\b/gi, msg: 'Subject–verb agreement: "government" (singular) takes "is".' },
  { re: /\beveryone are\b/gi, msg: 'Subject–verb agreement: "everyone" takes "is".' },
  { re: /\bthe the\b/gi, msg: 'Repeated article.' },
  { re: /\ba a\b/gi, msg: 'Repeated article.' },
  { re: /\bis are\b/gi, msg: 'Conflicting verb forms.' },
  { re: /\bhave has\b/gi, msg: 'Conflicting verb forms.' },
  { re: /\bdont\b/gi, msg: 'Missing apostrophe in "don\'t".' },
  { re: /\bcant\b/gi, msg: 'Missing apostrophe in "can\'t".' },
  { re: /\bits a\b/gi, msg: 'Possible confusion of "its" vs "it\'s".' },
  { re: /\balot\b/gi, msg: '"a lot" is two words.' },
  { re: /\bmore better\b/gi, msg: 'Double comparative.' },
  { re: /\bmore easier\b/gi, msg: 'Double comparative.' },
  { re: /\bless easier\b/gi, msg: 'Conflicting comparison forms.' },
  { re: /\bin nowadays\b/gi, msg: 'Redundant: "nowadays" does not need "in".' },
  { re: /\bdue to the fact that\b/gi, msg: 'Wordy phrase; weak control of style.' },
  { re: /\bPeoples\b/g, msg: 'Incorrect plural: use "people".' },
  { re: /\bpeoples\b/g, msg: 'Incorrect form: use "people".' },
  { re: /\bpeoples is\b/gi, msg: 'Subject–verb agreement with "people".' },
  { re: /\bcompanies wants\b/gi, msg: 'Subject–verb agreement.' },
  { re: /\bcompany need\b/gi, msg: 'Subject–verb agreement.' },
  { re: /\buniversity teach\b/gi, msg: 'Subject–verb agreement.' },
  { re: /\ba IT\b/gi, msg: 'Article error: use "an" before vowel sounds.' },
  { re: /\bcan coding\b/gi, msg: 'Verb form error.' },
  { re: /\bThis are\b/g, msg: 'Subject–verb agreement.' },
  { re: /\btheory are\b/gi, msg: 'Subject–verb agreement.' },
  { re: /\btheory is sometimes not\b/gi, msg: 'Awkward / inaccurate collocation.' },
  { re: /\bgraduate can\b/gi, msg: 'Possible missing plural: "graduates can".' },
  { re: /\bthey dont\b/gi, msg: 'Missing apostrophe in "don\'t".' },
];

export function clampBand(x) {
  return Math.max(4, Math.min(9, Math.round(x * 2) / 2));
}

/** Conservative overall: favour lower half-step on borderline. */
export function overallBandConservative(ta, cc, lr, gra) {
  const raw = (ta + cc + lr + gra) / 4;
  const floor = Math.floor(raw * 2) / 2;
  const remainder = raw - floor;
  if (remainder < 0.2) return floor;
  if (remainder > 0.35) return floor + 0.5;
  return floor;
}

function countMatches(text, list) {
  const lower = text.toLowerCase();
  return list.filter(p => lower.includes(p)).length;
}

function findRepeatedWords(content, wordCount) {
  const freq = new Map();
  for (const w of content) freq.set(w, (freq.get(w) || 0) + 1);
  const repeated = [...freq.entries()]
    .filter(([, n]) => n >= 5 || (wordCount > 0 && n / wordCount > 0.025))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([word, count]) => ({ word, count }));
  return repeated;
}

function findGrammarIssues(text) {
  const issues = [];
  for (const { re, msg } of GRAMMAR_PATTERNS) {
    const m = text.match(re);
    if (m) issues.push({ msg, count: m.length });
  }
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 5);
  const fragments = sentences.filter(s => s.trim().split(/\s+/).length < 6).length;
  if (fragments >= 3 && sentences.length >= 5) {
    issues.push({ msg: 'Several very short sentence fragments.', count: fragments });
  }
  return issues;
}

function hasClearPosition(intro, taskType) {
  const p = intro.toLowerCase();
  if (taskType === 'task1') return /overall|in summary|clearly|main trend|most noticeable/i.test(intro);
  return /\b(i (strongly )?(believe|agree|disagree|think)|in my view|this essay (argues|contends)|while .+ (i|my) (believe|argue))\b/i.test(p)
    || /\b(to a (large|great) extent|largely agree|largely disagree)\b/i.test(p);
}

function countSpecificSupport(text) {
  let n = 0;
  if (/\b(for example|for instance|such as|e\.g\.)\b/i.test(text)) n += 1;
  if (/\b\d{2,4}\b/.test(text)) n += 1;
  if (/\b(in|since) (19|20)\d{2}\b/.test(text)) n += 1;
  if (/\b(percent|%|million|billion)\b/i.test(text)) n += 1;
  const proper = text.match(/\b[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/g) || [];
  const filtered = proper.filter(p => !['I', 'In', 'On', 'The', 'This', 'However', 'Furthermore', 'Moreover', 'Therefore', 'Firstly', 'Secondly'].includes(p));
  if (filtered.length >= 2) n += 1;
  return n;
}

/**
 * @param {string} text
 * @param {{ taskType: 'task1'|'task2', minWords: number, prompt?: string }} opts
 */
export function analyzeEssay(text, opts = {}) {
  const { taskType = 'task2', minWords = 250, prompt = '' } = opts;
  const words = tokenize(text);
  const wordCount = words.length;
  const lower = text.toLowerCase();
  const content = contentTokens(words);
  const uniqueContent = new Set(content).size;
  const ttr = content.length ? uniqueContent / content.length : 0;
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 8);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const intro = paragraphs[0] || text.slice(0, 400);
  const promptKeywords = extractPromptKeywords(prompt);
  const promptHits = promptKeywords.filter(k => lower.includes(k)).length;
  const promptCoverage = promptKeywords.length
    ? promptHits / promptKeywords.length
    : 0.5;
  const templateHits = countMatches(text, TEMPLATE_PHRASES);
  const boilerplateHits = countMatches(text, BOILERPLATE);
  const connectorHits = CONNECTORS.filter(c => lower.includes(c));
  const repeatedWords = findRepeatedWords(content, wordCount);
  const grammarIssues = findGrammarIssues(text);
  const grammarErrorCount = grammarIssues.reduce((a, i) => a + i.count, 0);
  const errorPerSentence = sentences.length ? grammarErrorCount / sentences.length : grammarErrorCount;
  const specificSupport = countSpecificSupport(text);
  const subordinates = (text.match(/\b(which|who|whom|whose|although|whereas|while|unless|if|when|because|since|despite|even though)\b/gi) || []).length;
  const simpleDominant = sentences.length >= 6 && subordinates < 2;
  const mechanicalCc = connectorHits.length >= 4 && ttr < 0.48;
  const offTopic = promptKeywords.length >= 3 && promptCoverage < 0.22;
  const underLength = wordCount < minWords * 0.75;
  const severelyUnderLength = wordCount < minWords * 0.5;
  const repetitiveVocabulary = repeatedWords.length >= 2
    || repeatedWords.some(r => r.count >= 6)
    || ttr < 0.42;
  const shallowTask = specificSupport < 2
    && (boilerplateHits >= 4 || severelyUnderLength || wordCount < minWords * 0.45);
  const templateStyle = templateHits >= 2 || (/\bfirstly\b/i.test(text) && /\bsecondly\b/i.test(text) && /\bin conclusion\b/i.test(text));
  const weakCoherence = paragraphs.length < 3 || (taskType === 'task2' && paragraphs.length < 4) || mechanicalCc;
  const weakGrammar = errorPerSentence >= 0.28 || grammarErrorCount >= 4
    || (grammarErrorCount >= 2 && underLength);
  const clearPosition = hasClearPosition(intro, taskType);
  const task1Overview = taskType === 'task1' && /\b(overall|in summary|main trend|most significant)\b/i.test(text);

  return {
    wordCount,
    minWords,
    taskType,
    sentences: sentences.length,
    paragraphs: paragraphs.length,
    ttr,
    promptCoverage,
    promptHits,
    promptKeywordCount: promptKeywords.length,
    templateHits,
    boilerplateHits,
    connectorHits,
    connectorCount: connectorHits.length,
    repeatedWords,
    grammarIssues,
    grammarErrorCount,
    errorPerSentence,
    specificSupport,
    subordinates,
    simpleDominant,
    mechanicalCc,
    offTopic,
    repetitiveVocabulary,
    shallowTask,
    templateStyle,
    weakCoherence,
    weakGrammar,
    underLength,
    severelyUnderLength,
    clearPosition,
    task1Overview,
  };
}

function scoreTA(s, deductions, improvements) {
  let band = 5.0;
  const reasons = [];
  const weak = [];

  if (s.severelyUnderLength) {
    band = 4.0;
    reasons.push('Response is far below the minimum word count; task barely addressed.');
    weak.push('Insufficient length to develop ideas.');
  } else if (s.underLength) {
    band -= 1;
    reasons.push('Word count is under 75% of the requirement — Task Achievement is limited.');
    weak.push('Essay is too short for full task coverage.');
  } else if (s.wordCount >= s.minWords) {
    band += 0.5;
  }

  if (s.offTopic) {
    band = Math.min(band, 4.5);
    reasons.push('Low relevance to the question prompt — parts of the task are not addressed.');
    weak.push('Content does not align closely enough with the question.');
  } else if (s.promptCoverage >= 0.55) {
    band += 0.5;
  } else if (s.promptCoverage < 0.35) {
    band -= 0.5;
    reasons.push('Several key ideas from the prompt are missing or only implied.');
    weak.push('Partial coverage of the task.');
  }

  if (s.taskType === 'task2' && !s.clearPosition) {
    band -= 0.5;
    reasons.push('No clear, consistent position in the introduction (Band 7 requires a clear position throughout).');
    weak.push('Thesis / stance is unclear or absent.');
  }

  if (s.taskType === 'task1' && !s.task1Overview) {
    band -= 0.5;
    reasons.push('No clear overview of main trends (required for Band 6+ in Task 1).');
    weak.push('Missing overview sentence.');
  }

  if (s.shallowTask) {
    band -= 1;
    reasons.push('Main ideas are not extended; limited specific support (examples, data, concrete cases).');
    weak.push('Shallow argument development — lists points without explaining or exemplifying.');
  } else if (s.specificSupport >= 3) {
    band += 0.5;
  } else if (s.specificSupport >= 1) {
    band += 0.25;
  }

  if (s.wordCount >= s.minWords * 0.8 && s.specificSupport >= 3 && s.clearPosition) {
    band += 0.5;
    reasons.push('Ideas are relevant and supported, though length is slightly under the target.');
  }

  if (s.templateStyle) {
    band -= 0.5;
    reasons.push('Template-style phrasing suggests memorised structure rather than genuine task response.');
    weak.push('Over-reliance on stock phrases.');
  }

  band = clampBand(band);
  if (s.offTopic) band = Math.min(band, 4.5);
  if (s.shallowTask) band = Math.min(band, 6.0);

  deductions.push(...reasons);
  return { band, reasons, weaknesses: weak, improvements: buildTAImprovements(s, weak) };
}

function scoreCC(s, deductions, improvements) {
  let band = 5.0;
  const reasons = [];
  const weak = [];

  if (s.paragraphs < 2) {
    band -= 1;
    reasons.push('Little paragraphing — organisation is difficult to follow.');
    weak.push('Break text into clear paragraphs.');
  } else if (s.taskType === 'task2' && s.paragraphs < 4) {
    band -= 0.5;
    reasons.push('Fewer than four paragraphs for Task 2 — progression is limited (intro, two bodies, conclusion expected).');
    weak.push('Use a four-paragraph (or more) structure.');
  } else if (s.paragraphs >= 4) {
    band += 0.5;
  }

  if (s.weakCoherence || s.mechanicalCc) {
    band -= 0.5;
    reasons.push('Cohesive devices are mechanical or progression between ideas is weak.');
    weak.push('Link ideas with reference (this, these, such policies) not only adverbs.');
  }

  if (s.connectorCount < 2) {
    band -= 0.5;
    reasons.push('Insufficient cohesive devices — ideas may not connect clearly.');
    weak.push('Add logical links (however, therefore, in contrast) where appropriate.');
  } else if (s.connectorCount >= 3 && !s.mechanicalCc) {
    band += 0.5;
  }

  if (s.templateStyle) {
    band -= 0.5;
    reasons.push('Rigid template structure (Firstly… Secondly… In conclusion) limits natural cohesion.');
    weak.push('Avoid exam-template paragraph openers.');
  }

  band = clampBand(band);
  if (s.weakCoherence) band = Math.min(band, 6.0);

  deductions.push(...reasons);
  return { band, reasons, weaknesses: weak, improvements: buildCCImprovements(s, weak) };
}

function scoreLR(s, deductions, improvements) {
  let band = 5.0;
  const reasons = [];
  const weak = [];

  if (s.repetitiveVocabulary) {
    band -= 1;
    const top = s.repeatedWords.slice(0, 3).map(r => `"${r.word}" (${r.count}×)`).join(', ');
    reasons.push(`Repetitive vocabulary reduces lexical resource — e.g. ${top || 'high-frequency words repeated'}.`);
    weak.push('Replace repeated nouns/verbs with synonyms or paraphrase the question.');
  } else if (s.ttr >= 0.7) {
    band += 1;
    reasons.push('Good lexical variety for the topic.');
  } else if (s.ttr >= 0.55) {
    band += 0.5;
  } else if (s.ttr >= 0.48) {
    band += 0.25;
  } else {
    band -= 0.5;
    reasons.push('Limited lexical variety (type–token ratio below Band 6 expectations).');
    weak.push('Widen vocabulary; avoid repeating "people", "society", "important".');
  }

  if (s.boilerplateHits >= 6) {
    band -= 0.5;
    reasons.push('Heavy use of vague, high-frequency wording (Band 5–6 lexis).');
    weak.push('Use more precise, topic-specific vocabulary.');
  }

  if (s.templateHits >= 2) {
    band -= 0.5;
    reasons.push('Memorised / formulaic chunks detected — not flexible lexical use.');
    weak.push('Replace stock phrases with precise, context-specific wording.');
  }

  band = clampBand(band);
  if (s.repetitiveVocabulary) band = Math.min(band, 5.5);

  deductions.push(...reasons);
  return { band, reasons, weaknesses: weak, improvements: buildLRImprovements(s, weak) };
}

function scoreGRA(s, deductions, improvements) {
  let band = 5.0;
  const reasons = [];
  const weak = [];

  if (s.weakGrammar || s.grammarErrorCount >= 4) {
    const n = Math.min(1.5, 0.5 + s.errorPerSentence * 0.8);
    band -= n;
    const samples = s.grammarIssues.slice(0, 3).map(i => i.msg).join(' ');
    reasons.push(`Frequent grammar / accuracy issues${samples ? ': ' + samples : '.'}`);
    weak.push('Proofread for agreement, articles, and sentence boundaries.');
  } else if (s.grammarErrorCount === 0 && s.sentences >= 10) {
    band += 1;
    reasons.push('Wide range with mostly accurate structures.');
  } else if (s.grammarErrorCount <= 1 && s.sentences >= 8) {
    band += 0.5;
  }

  if (s.simpleDominant) {
    band -= 0.5;
    reasons.push('Limited grammatical range — mostly simple structures; few subordinate clauses.');
    weak.push('Use a mix of complex sentences (although, which, whereas, if).');
  } else if (s.subordinates >= 4) {
    band += 0.5;
  }

  if (s.errorPerSentence >= 0.7) {
    band = Math.min(band, 5.0);
    reasons.push('Errors may impede meaning at sentence level (Band 5 GRA).');
  }

  band = clampBand(band);
  if (s.weakGrammar) band = Math.min(band, 6.0);

  deductions.push(...reasons);
  return { band, reasons, weaknesses: weak, improvements: buildGRAImprovements(s, weak) };
}

function buildTAImprovements(s, weak) {
  const out = [];
  if (s.underLength) out.push(`Write at least ${s.minWords} words with fully developed body paragraphs.`);
  if (!s.clearPosition && s.taskType === 'task2') out.push('State your position explicitly in the introduction.');
  if (s.shallowTask) out.push('Support each main idea with one specific example or piece of evidence.');
  if (s.offTopic) out.push('Re-read the question and answer every part directly.');
  return out.length ? out : ['Extend each main point with explanation and an example.'];
}

function buildCCImprovements(s, weak) {
  const out = [];
  if (s.paragraphs < 4 && s.taskType === 'task2') out.push('Organise: introduction → body 1 → body 2 → conclusion.');
  if (s.connectorCount < 2) out.push('Use cohesive devices to show contrast and cause/effect between ideas.');
  if (s.mechanicalCc) out.push('Avoid listing connectors; tie sentences with pronouns and clear logic.');
  return out.length ? out : ['Ensure each paragraph has one central idea and a clear topic sentence.'];
}

function buildLRImprovements(s, weak) {
  const out = [];
  if (s.repetitiveVocabulary) out.push('Paraphrase the question in the introduction; avoid repeating the same words.');
  out.push('Use precise verbs and topic nouns instead of "important", "good", "bad".');
  return out;
}

function buildGRAImprovements(s, weak) {
  const out = ['Check subject–verb agreement and articles on every edit pass.'];
  if (s.simpleDominant) out.push('Combine short sentences with subordinating conjunctions.');
  return out;
}

function applyBand7Gate(ta, cc, lr, gra, flags, validationGate = null) {
  const block7 = flags.weakCoherence || flags.repetitiveVocabulary || flags.weakGrammar
    || flags.shallowTask || flags.offTopic || flags.templateStyle
    || (validationGate && validationGate.blockBand7Plus);
  if (!block7) return { ta, cc, lr, gra, capped: false };

  const cap = 6.5;
  return {
    ta: Math.min(ta, cap),
    cc: Math.min(cc, cap),
    lr: Math.min(lr, cap),
    gra: Math.min(gra, cap),
    capped: true,
    capReason: validationGate?.blockBand7Plus && !flags.offTopic && !flags.shallowTask
      ? 'Pre-scoring validation: task response or essay quality does not meet Band 7 standards.'
      : 'Band 7+ requires strong task response, cohesion, lexis, and grammar — one or more areas do not meet that standard.',
  };
}

function applyValidationCaps(ta, cc, lr, gra, overall, gate) {
  if (!gate) return { ta, cc, lr, gra, overall };
  const cap = (v, max) => (max == null ? v : Math.min(v, max));
  return {
    ta: cap(ta, gate.maxTA),
    cc: cap(cc, gate.maxCC),
    lr: cap(lr, gate.maxLR),
    gra: cap(gra, gate.maxGRA),
    overall: cap(overall, gate.maxOverall),
  };
}

function buildValidationOnlyResult(validation, opts) {
  const gate = validation.qualityGate;
  const band = gate.maxOverall != null ? gate.maxOverall : 4.0;
  const explanations = validation.issues.map(i => i.explanation);
  const suggestions = validation.suggestions;
  const flagMap = {
    validationFailed: true,
    offTopic: validation.issues.some((i) => i.category === 'off_topic'),
    shallowTask: validation.issues.some((i) => i.id === 'shallow_task_response'),
    repetitiveVocabulary: validation.issues.some((i) => i.category === 'repetition'),
    templateStyle: validation.issues.some((i) => i.category === 'template_abuse'),
    weakCoherence: false,
    weakGrammar: false,
    mechanicalCohesion: false,
  };

  return {
    ta: gate.maxTA != null ? gate.maxTA : band,
    cc: band,
    lr: band,
    gra: band,
    overall: clampBand(band),
    strengths: 'No reliable strengths identified — the submission did not pass quality validation.',
    improvements: suggestions.join(' ') || 'Rewrite the essay to address the question with original, developed English.',
    weaknesses: explanations.join(' ') || 'Essay failed pre-scoring validation.',
    pointsLost: explanations,
    tip: 'Fix validation issues first, then request scoring again.',
    vocab: [],
    criteria: {
      ta: { band: gate.maxTA ?? band, pointsLost: explanations, weaknesses: [], improvements: suggestions },
      cc: { band, pointsLost: [], weaknesses: [], improvements: [] },
      lr: { band, pointsLost: [], weaknesses: [], improvements: [] },
      gra: { band, pointsLost: [], weaknesses: [], improvements: [] },
    },
    flags: validation.issues.map(i => i.explanation.slice(0, 60)),
    flagMap,
    validation,
    validationBlocked: true,
    disclaimer: 'Scoring was limited because the essay failed pre-scoring quality checks.',
  };
}

/**
 * Main evaluation entry.
 * @returns {object} Result compatible with UI + extended criteria detail
 */
export function evaluateIeltsWriting(text, opts = {}) {
  const validation = validateEssay(text, opts);
  if (validation.skipScoring) {
    return buildValidationOnlyResult(validation, opts);
  }

  const s = analyzeEssay(text, opts);
  const validationOffTopic = validation.issues.some((i) => i.category === 'off_topic');
  const validationShallow = validation.issues.some((i) => i.id === 'shallow_task_response');
  const validationRepetition = validation.issues.some((i) => i.category === 'repetition' && SEVERITY_RANK[i.severity] >= 2);
  const validationTemplate = validation.issues.some((i) => i.category === 'template_abuse' && SEVERITY_RANK[i.severity] >= 2);
  const flags = {
    offTopic: s.offTopic || validationOffTopic,
    repetitiveVocabulary: s.repetitiveVocabulary || validationRepetition,
    shallowTask: s.shallowTask || validationShallow,
    templateStyle: s.templateStyle || validationTemplate,
    weakCoherence: s.weakCoherence,
    weakGrammar: s.weakGrammar,
    mechanicalCohesion: s.mechanicalCc,
  };

  const allDeductions = [];
  const taR = scoreTA(s, allDeductions, []);
  const ccR = scoreCC(s, allDeductions, []);
  const lrR = scoreLR(s, allDeductions, []);
  const graR = scoreGRA(s, allDeductions, []);

  let ta = taR.band;
  let cc = ccR.band;
  let lr = lrR.band;
  let gra = graR.band;

  const gated = applyBand7Gate(ta, cc, lr, gra, flags, validation.qualityGate);
  ta = gated.ta;
  cc = gated.cc;
  lr = gated.lr;
  gra = gated.gra;

  let overall = overallBandConservative(ta, cc, lr, gra);
  if (flags.offTopic) overall = Math.min(overall, 5.0);
  if (gated.capped && overall > 6.5) overall = 6.5;

  const capped = applyValidationCaps(ta, cc, lr, gra, overall, validation.qualityGate);
  ta = capped.ta;
  cc = capped.cc;
  lr = capped.lr;
  gra = capped.gra;
  overall = capped.overall;

  const flagLabels = [];
  if (flags.offTopic) flagLabels.push('Off-topic / low prompt relevance');
  if (flags.repetitiveVocabulary) flagLabels.push('Repetitive vocabulary');
  if (flags.shallowTask) flagLabels.push('Shallow task response');
  if (flags.templateStyle) flagLabels.push('Template / memorised style');
  if (flags.weakCoherence) flagLabels.push('Weak coherence');
  if (flags.weakGrammar) flagLabels.push('Grammar accuracy issues');

  const strengths = [];
  if (s.wordCount >= s.minWords && !s.shallowTask) {
    strengths.push('Adequate length to attempt the task.');
  }
  if (s.clearPosition && s.taskType === 'task2') {
    strengths.push('A discernible position is present.');
  }
  if (s.specificSupport >= 2 && !s.shallowTask) {
    strengths.push('Some ideas are supported with examples or specifics.');
  }
  if (s.ttr >= 0.52 && !s.repetitiveVocabulary) {
    strengths.push('Reasonable lexical variety for this level.');
  }
  if (!s.weakGrammar && s.grammarErrorCount <= 2) {
    strengths.push('Grammar does not seriously obscure meaning in most sentences.');
  }

  const improvements = [
    ...taR.improvements.slice(0, 2),
    ...ccR.improvements.slice(0, 1),
    ...lrR.improvements.slice(0, 1),
    ...graR.improvements.slice(0, 1),
  ].filter((v, i, a) => a.indexOf(v) === i);

  const weaknesses = [
    ...taR.weaknesses,
    ...ccR.weaknesses,
    ...lrR.weaknesses,
    ...graR.weaknesses,
  ].filter((v, i, a) => a.indexOf(v) === i);

  const pointsLost = [
    ...taR.reasons,
    ...ccR.reasons,
    ...lrR.reasons,
    ...graR.reasons,
  ];
  if (gated.capped) pointsLost.push(gated.capReason);
  for (const vi of validation.issues.filter(i => SEVERITY_RANK[i.severity] >= 2)) {
    pointsLost.push(`[Validation] ${vi.explanation}`);
  }

  const validationFlags = validation.issues
    .filter(i => i.severity === 'high' || i.severity === 'critical')
    .map(i => {
      const labels = {
        prompt_copy: 'Prompt copying',
        low_effort: 'Low-effort content',
        off_topic: 'Off-topic / shallow task',
        repetition: 'Excessive repetition',
        template_abuse: 'Template abuse',
      };
      return labels[i.category] || i.category;
    });
  for (const vf of validationFlags) {
    if (!flagLabels.includes(vf)) flagLabels.push(vf);
  }

  return {
    ta,
    cc,
    lr,
    gra,
    overall: clampBand(overall),
    strengths: strengths.length
      ? strengths.join(' ')
      : 'Limited strengths at this band — focus on task coverage and accuracy first.',
    improvements: improvements.join(' ') || 'Revise for task relevance, paragraph structure, and error control.',
    weaknesses: weaknesses.join(' ') || 'See score reductions below.',
    pointsLost,
    tip: opts.taskType === 'task1'
      ? 'Task 1: one overview sentence, then data-led comparisons — no opinion.'
      : 'Task 2: answer every part of the question; one idea per paragraph with support.',
    vocab: suggestVocabUpgrades(s, text),
    criteria: {
      ta: { band: ta, pointsLost: taR.reasons, weaknesses: taR.weaknesses, improvements: taR.improvements },
      cc: { band: cc, pointsLost: ccR.reasons, weaknesses: ccR.weaknesses, improvements: ccR.improvements },
      lr: { band: lr, pointsLost: lrR.reasons, weaknesses: lrR.weaknesses, improvements: lrR.improvements },
      gra: { band: gra, pointsLost: graR.reasons, weaknesses: graR.weaknesses, improvements: graR.improvements },
    },
    flags: flagLabels,
    flagMap: flags,
    analysis: s,
    validation,
    validationBlocked: false,
    disclaimer: validation.issues.length
      ? 'Conservative estimate; pre-scoring validation applied caps where needed — not an official IELTS score.'
      : 'Conservative estimate based on public band descriptors — not an official IELTS score.',
  };
}

function suggestVocabUpgrades(s, text) {
  const lower = text.toLowerCase();
  const pool = ['mitigate', 'substantial', 'facilitate', 'predominantly', 'conversely', 'ramification'];
  if (s.repetitiveVocabulary && s.repeatedWords.length) {
    const w = s.repeatedWords[0].word;
    const alt = { people: 'citizens / the public', society: 'communities / the wider population', important: 'crucial / pivotal', think: 'argue / maintain' }[w];
    if (alt) return [alt];
  }
  return pool.filter(w => !lower.includes(w)).slice(0, 3);
}

/** Flatten for legacy UI fields + optional detail */
export function formatEvaluationForUI(result) {
  return result;
}
