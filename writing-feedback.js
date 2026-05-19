/* Strict IELTS evaluator — lib/evaluation/essay-validator.mjs + ielts-evaluator.mjs (npm run build:evaluator) */
/**
 * Pre-scoring essay validation — detects invalid, fake, copied, or low-quality submissions
 * before band evaluation runs.
 */

const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with', 'by',
  'from', 'as', 'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'will', 'would', 'could', 'should', 'may', 'might', 'must', 'can',
  'that', 'this', 'these', 'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you',
  'your', 'i', 'my', 'he', 'she', 'his', 'her', 'not', 'no', 'so', 'if', 'when', 'while',
  'than', 'then', 'also', 'very', 'more', 'most', 'some', 'any', 'all', 'both', 'each',
  'such', 'into', 'about', 'over', 'under', 'between', 'through', 'during', 'before', 'after',
  'there', 'here', 'what', 'which', 'who', 'whom', 'how', 'why', 'where', 'because', 'although',
  'however', 'therefore', 'thus', 'hence', 'whereas', 'whether', 'though', 'even',
  'much', 'many', 'few', 'one', 'ones', 'other', 'others', 'another', 'same',
  'just', 'only', 'own', 'up', 'out', 'off', 'down', 'away', 'back', 'well', 'now', 'today',
]);

const TEMPLATE_PHRASES = [
  'in this day and age',
  'in today\'s world',
  'in the modern world',
  'with the advent of technology',
  'this essay will discuss',
  'this essay will examine',
  'there are both advantages and disadvantages',
  'it is undeniable that',
  'it is irrefutable that',
  'plays a vital role',
  'plays an important role',
  'a double-edged sword',
  'last but not least',
  'in conclusion, i believe',
  'to sum up, i believe',
  'needless to say',
  'as far as i am concerned',
  'from my point of view',
  'in my opinion, i think',
  'every coin has two sides',
  'a hot topic',
  'a burning issue',
  'shed light on',
  'a plethora of',
  'myriad of',
];

const ROBOTIC_INTRO_PATTERNS = [
  /^in (this day and age|today'?s world|the modern world)/i,
  /^it is (often |widely )?(said|believed|argued) that/i,
  /^nowadays,?\s/i,
  /^with the (development|advancement|advent) of/i,
  /^this essay (will|shall) (discuss|examine|explore|address)/i,
];

const ROBOTIC_CONCLUSION_PATTERNS = [
  /in conclusion,?\s+(i believe|it is clear|we can see)/i,
  /to (sum up|conclude),?\s+(i believe|it is evident)/i,
  /all in all,?\s+i (believe|think)/i,
  /in summary,?\s+the (advantages|disadvantages) outweigh/i,
];

const SEVERITY_RANK = { low: 1, medium: 2, high: 3, critical: 4 };

function tokenize(text) {
  return text.trim().split(/\s+/).filter(Boolean);
}

function normalize(text) {
  return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

function contentTokens(words) {
  return words
    .map(w => w.toLowerCase().replace(/[^a-z'-]/g, ''))
    .filter(w => w.length > 2 && !STOP.has(w));
}

function extractPromptKeywords(prompt) {
  if (!prompt) return [];
  return [...new Set(
    normalize(prompt).split(/\s+/).filter(w => w.length > 4 && !STOP.has(w))
  )];
}

function ngrams(words, n) {
  const out = [];
  for (let i = 0; i <= words.length - n; i++) {
    out.push(words.slice(i, i + n).join(' '));
  }
  return out;
}

function issue(id, category, severity, explanation, suggestion) {
  return { id, category, severity, explanation, suggestion };
}

/** Longest shared word sequence between prompt and essay (5+ words). */
function detectPromptCopy(text, prompt) {
  const issues = [];
  if (!prompt || prompt.length < 20) return issues;

  const essayNorm = normalize(text);
  const promptNorm = normalize(prompt);
  const promptWords = promptNorm.split(/\s+/).filter(Boolean);

  for (let len = Math.min(12, promptWords.length); len >= 5; len--) {
    for (const phrase of ngrams(promptWords, len)) {
      if (essayNorm.includes(phrase)) {
        issues.push(issue(
          'prompt_direct_copy',
          'prompt_copy',
          len >= 8 ? 'high' : 'medium',
          `A ${len}-word phrase from the question appears verbatim in your essay.`,
          'Paraphrase the task in your own words; do not copy the question wording.'
        ));
        return issues;
      }
    }
  }

  const promptKeys = extractPromptKeywords(prompt);
  if (promptKeys.length < 3) return issues;

  const intro = normalize((text.split(/\n\s*\n/)[0] || text).slice(0, 500));
  const introWords = new Set(intro.split(/\s+/));
  const introHits = promptKeys.filter(k => introWords.has(k)).length;
  const introRatio = introHits / promptKeys.length;

  if (introRatio >= 0.65 && intro.length > 80) {
    issues.push(issue(
      'prompt_paraphrase_copy',
      'prompt_copy',
      'medium',
      'Your introduction closely mirrors the question wording instead of answering it.',
      'Open with your position or main idea, not a restatement of the prompt.'
    ));
  }

  const essayKeys = new Set(contentTokens(tokenize(text)));
  const overlap = promptKeys.filter(k => essayKeys.has(k)).length / promptKeys.length;
  if (overlap >= 0.85 && tokenize(text).length < 120) {
    issues.push(issue(
      'prompt_keyword_padding',
      'prompt_copy',
      'high',
      'The response mostly repeats question vocabulary without developing an argument.',
      'Add your own ideas, examples, and explanations beyond the question words.'
    ));
  }

  return issues;
}

function detectLowEffort(text, wordCount, minWords) {
  const issues = [];
  const lower = text.toLowerCase();
  const words = tokenize(text);
  const content = contentTokens(words);

  if (wordCount < Math.min(80, minWords * 0.32)) {
    issues.push(issue(
      'extremely_short',
      'low_effort',
      'critical',
      `Essay is far too short (${wordCount} words; target ${minWords}+).`,
      `Write a full response of at least ${minWords} words with developed paragraphs.`
    ));
  } else if (wordCount < minWords * 0.5) {
    issues.push(issue(
      'under_length',
      'low_effort',
      'high',
      `Word count (${wordCount}) is well below the ${minWords}-word requirement.`,
      'Expand each body paragraph with explanation and a specific example.'
    ));
  }

  if (/\blorem ipsum\b/i.test(text)) {
    issues.push(issue(
      'lorem_ipsum',
      'low_effort',
      'critical',
      'Placeholder (lorem ipsum) text detected.',
      'Replace placeholder text with a genuine essay that answers the question.'
    ));
  }

  if (/(.)\1{5,}/.test(text.replace(/\s/g, '')) || /[bcdfghjklmnpqrstvwxyz]{6,}/i.test(text)) {
    issues.push(issue(
      'random_characters',
      'low_effort',
      'critical',
      'Random or keyboard-spam character sequences detected.',
      'Write coherent English sentences that address the task.'
    ));
  }

  const alphaRatio = (text.match(/[a-zA-Z]/g) || []).length / Math.max(text.length, 1);
  if (text.length > 40 && alphaRatio < 0.55) {
    issues.push(issue(
      'non_linguistic_content',
      'low_effort',
      'critical',
      'Too many non-letter characters — submission does not read as an essay.',
      'Submit a prose essay in English, not symbols or filler characters.'
    ));
  }

  const gibberishWords = content.filter(w => {
    if (w.length < 4) return false;
    const vowels = (w.match(/[aeiou]/gi) || []).length;
    return vowels / w.length < 0.15;
  });
  if (content.length >= 10 && gibberishWords.length / content.length > 0.35) {
    issues.push(issue(
      'meaningless_text',
      'low_effort',
      'critical',
      'Many words appear nonsensical or not valid English.',
      'Use clear vocabulary and complete sentences that express real ideas.'
    ));
  }

  const uniqueContent = new Set(content).size;
  const ttr = content.length ? uniqueContent / content.length : 0;
  if (wordCount >= 40 && ttr < 0.28) {
    issues.push(issue(
      'low_lexical_variety',
      'low_effort',
      'high',
      'Very low vocabulary variety — text may be spam or repeated filler.',
      'Use varied vocabulary and avoid repeating the same few words.'
    ));
  }

  const sentences = text.split(/[.!?]+/).map(s => s.trim()).filter(s => s.length > 3);
  const normSentences = sentences.map(s => normalize(s)).filter(Boolean);
  const sentFreq = new Map();
  for (const s of normSentences) {
    if (s.length > 15) sentFreq.set(s, (sentFreq.get(s) || 0) + 1);
  }
  const dupSentences = [...sentFreq.entries()].filter(([, n]) => n >= 2);
  if (dupSentences.length >= 1) {
    issues.push(issue(
      'repeated_sentences',
      'low_effort',
      'high',
      'Identical or near-identical sentences are repeated.',
      'Each sentence should add new information; remove copy-pasted lines.'
    ));
  }

  const phraseMap = new Map();
  const contentWords = content;
  for (let len = 4; len <= 6; len++) {
    for (const p of ngrams(contentWords, len)) {
      phraseMap.set(p, (phraseMap.get(p) || 0) + 1);
    }
  }
  const hotPhrases = [...phraseMap.entries()].filter(([, n]) => n >= 3);
  if (hotPhrases.length >= 2) {
    issues.push(issue(
      'repeated_phrases',
      'low_effort',
      'medium',
      'The same multi-word phrases are repeated excessively.',
      'Paraphrase and develop ideas instead of looping the same phrase.'
    ));
  }

  const freq = new Map();
  for (const w of content) freq.set(w, (freq.get(w) || 0) + 1);
  for (const [w, n] of freq.entries()) {
    if (content.length > 0 && n / content.length > 0.12 && n >= 8) {
      issues.push(issue(
        'keyword_stuffing',
        'low_effort',
        'medium',
        `The word "${w}" is overused (${n} times) — possible keyword stuffing.`,
        'Use synonyms and topic-specific vocabulary rather than repeating one word.'
      ));
      break;
    }
  }

  if (/(\btest\b|\bhello\b|\basdf\b|\bqwerty\b|\bxxx+\b)/i.test(lower) && wordCount < 150) {
    issues.push(issue(
      'spam_markers',
      'low_effort',
      'critical',
      'Test or filler words detected with insufficient real content.',
      'Write a complete essay that responds to the question.'
    ));
  }

  const singleWordDominance = words.length > 0
    && Math.max(...[...freq.values()], 0) / words.length > 0.22;
  if (singleWordDominance && wordCount < 200) {
    issues.push(issue(
      'spam_repetition',
      'low_effort',
      'high',
      'One word dominates the text — typical of spam or padding.',
      'Distribute ideas across varied vocabulary and sentence structures.'
    ));
  }

  return issues;
}

function detectOffTopic(text, prompt, wordCount) {
  const issues = [];
  const promptKeys = extractPromptKeywords(prompt);
  if (promptKeys.length < 3) return issues;

  const lower = text.toLowerCase();
  const hits = promptKeys.filter(k => lower.includes(k)).length;
  const coverage = hits / promptKeys.length;

  if (coverage < 0.18 && wordCount >= 60) {
    issues.push(issue(
      'off_topic',
      'off_topic',
      'critical',
      'The essay does not address key ideas from the question.',
      'Re-read the prompt and answer every part directly with relevant arguments.'
    ));
  } else if (coverage < 0.32) {
    issues.push(issue(
      'partially_off_topic',
      'off_topic',
      'high',
      'Several important concepts from the question are missing.',
      'Include vocabulary and ideas from the task so the examiner sees you answered it.'
    ));
  }

  const hasPosition = /\b(i (believe|agree|disagree|think)|in my view|to what extent|while .+ i)\b/i.test(text);
  const hasSupport = /\b(for example|for instance|such as|research|study|percent|%|\d{4})\b/i.test(text);
  if (wordCount >= 100 && coverage >= 0.35 && !hasSupport && !hasPosition) {
    issues.push(issue(
      'shallow_task_response',
      'off_topic',
      'high',
      'The task is touched on but not developed — no clear position or supporting detail.',
      'State your view explicitly and support each main point with an example or reason.'
    ));
  }

  return issues;
}

function detectRepetition(text, words, content) {
  const issues = [];
  const wordCount = words.length;
  const uniqueContent = new Set(content).size;
  const ttr = content.length ? uniqueContent / content.length : 0;

  if (content.length >= 30 && ttr < 0.38) {
    issues.push(issue(
      'low_lexical_diversity',
      'repetition',
      'medium',
      `Lexical diversity is low (TTR ≈ ${ttr.toFixed(2)}).`,
      'Replace repeated nouns and adjectives with precise synonyms.'
    ));
  }

  const freq = new Map();
  for (const w of content) freq.set(w, (freq.get(w) || 0) + 1);
  const overused = [...freq.entries()]
    .filter(([, n]) => n >= 6 || (wordCount > 0 && n / wordCount > 0.028))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);
  if (overused.length >= 2) {
    const list = overused.map(([w, n]) => `"${w}" (${n}×)`).join(', ');
    issues.push(issue(
      'excessive_word_repetition',
      'repetition',
      'medium',
      `Overused words: ${list}.`,
      'Paraphrase key terms after the first mention; use pronouns and synonyms.'
    ));
  }

  const rawSentences = text.split(/[.!?]+/).filter(s => s.trim().length > 10);
  const starts = rawSentences.map(s => {
    const w = tokenize(s).slice(0, 3).join(' ').toLowerCase();
    return w;
  }).filter(Boolean);
  const startFreq = new Map();
  for (const st of starts) startFreq.set(st, (startFreq.get(st) || 0) + 1);
  const repetitiveStarts = [...startFreq.entries()].filter(([, n]) => n >= 3);
  if (repetitiveStarts.length >= 2) {
    issues.push(issue(
      'repetitive_sentence_structure',
      'repetition',
      'medium',
      'Many sentences begin the same way — writing feels mechanical.',
      'Vary sentence openings (adverbials, subordinate clauses, passive voice where appropriate).'
    ));
  }

  const lengths = rawSentences.map(s => tokenize(s).length);
  if (lengths.length >= 6) {
    const buckets = lengths.map(l => (l < 12 ? 'short' : l < 22 ? 'mid' : 'long'));
    const oneBucket = buckets.filter(b => b === buckets[0]).length / buckets.length;
    if (oneBucket >= 0.85) {
      issues.push(issue(
        'uniform_sentence_length',
        'repetition',
        'low',
        'Sentence lengths are unusually uniform.',
        'Mix short and longer sentences for better rhythm and cohesion.'
      ));
    }
  }

  return issues;
}

function detectTemplateAbuse(text) {
  const issues = [];
  const lower = text.toLowerCase();
  const hits = TEMPLATE_PHRASES.filter(p => lower.includes(p));
  if (hits.length >= 3) {
    issues.push(issue(
      'memorised_templates',
      'template_abuse',
      'high',
      `Multiple stock IELTS phrases detected (${hits.length} templates).`,
      'Use natural, task-specific language instead of memorised template sentences.'
    ));
  } else if (hits.length >= 2) {
    issues.push(issue(
      'template_phrases',
      'template_abuse',
      'medium',
      'Memorised template phrases reduce authenticity.',
      'Write introductions and conclusions that respond directly to this question.'
    ));
  }

  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const intro = paragraphs[0] || text.slice(0, 350);
  const conclusion = paragraphs[paragraphs.length - 1] || text.slice(-350);

  if (ROBOTIC_INTRO_PATTERNS.some(re => re.test(intro.trim()))) {
    issues.push(issue(
      'robotic_introduction',
      'template_abuse',
      'medium',
      'Introduction follows a generic, memorised IELTS opener.',
      'Begin with a direct answer or clear thesis linked to the question.'
    ));
  }
  if (ROBOTIC_CONCLUSION_PATTERNS.some(re => re.test(conclusion))) {
    issues.push(issue(
      'robotic_conclusion',
      'template_abuse',
      'medium',
      'Conclusion uses a formulaic template rather than synthesising your argument.',
      'Summarise your main points and restate your position without stock phrases.'
    ));
  }

  if (/\bfirstly\b/i.test(text) && /\bsecondly\b/i.test(text) && /\b(in conclusion|to conclude)\b/i.test(text)) {
    issues.push(issue(
      'formulaic_structure',
      'template_abuse',
      'medium',
      'Rigid firstly/secondly/in conclusion structure suggests a memorised essay skeleton.',
      'Organise by ideas, not by mechanical listing connectors.'
    ));
  }

  return issues;
}

function buildQualityGate(issues, wordCount, minWords) {
  const maxSeverity = issues.reduce((max, i) => {
    const rank = SEVERITY_RANK[i.severity] || 0;
    return rank > max ? rank : max;
  }, 0);

  const severityLabel = ['none', 'low', 'medium', 'high', 'critical'][maxSeverity] || 'none';
  const hasHigh = issues.some(i => i.severity === 'high');
  const offTopic = issues.some(i => i.id === 'off_topic' || i.id === 'partially_off_topic');
  const shallow = issues.some(i => i.id === 'shallow_task_response');
  const lowEffortCritical = issues.some(i => i.category === 'low_effort' && i.severity === 'critical');
  const promptCopyHigh = issues.some(i => i.category === 'prompt_copy' && SEVERITY_RANK[i.severity] >= 3);

  let maxOverall = null;
  let maxTA = null;
  let blockBand7Plus = false;
  let blocked = false;
  let skipScoring = false;

  if (lowEffortCritical) {
    blocked = true;
    skipScoring = true;
    maxOverall = 4.0;
    maxTA = 4.0;
    blockBand7Plus = true;
  } else if (offTopic) {
    maxOverall = 5.0;
    maxTA = 4.5;
    blockBand7Plus = true;
  } else if (hasHigh || shallow || promptCopyHigh) {
    maxOverall = 6.0;
    maxTA = 6.0;
    blockBand7Plus = true;
  } else if (maxSeverity >= 2) {
    maxOverall = 6.5;
    blockBand7Plus = true;
  }

  if (wordCount < minWords * 0.45) {
    blockBand7Plus = true;
    maxTA = maxTA === null ? 5.5 : Math.min(maxTA, 5.5);
    maxOverall = maxOverall === null ? 6.0 : Math.min(maxOverall, 6.0);
  }

  return {
    severity: severityLabel,
    blockBand7Plus,
    blocked,
    skipScoring,
    maxOverall,
    maxTA,
    maxCC: blockBand7Plus ? 6.5 : null,
    maxLR: blockBand7Plus ? 6.5 : null,
    maxGRA: blockBand7Plus ? 6.5 : null,
  };
}

/**
 * Validate essay before scoring.
 * @param {string} text
 * @param {{ taskType?: string, minWords?: number, prompt?: string }} opts
 */
function validateEssay(text, opts = {}) {
  const { taskType = 'task2', minWords = 250, prompt = '' } = opts;
  const trimmed = (text || '').trim();
  const words = tokenize(trimmed);
  const wordCount = words.length;
  const content = contentTokens(words);

  const issues = [
    ...detectPromptCopy(trimmed, prompt),
    ...detectLowEffort(trimmed, wordCount, minWords),
    ...detectOffTopic(trimmed, prompt, wordCount),
    ...detectRepetition(trimmed, words, content),
    ...detectTemplateAbuse(trimmed),
  ];

  const seen = new Set();
  const deduped = issues.filter((i) => {
    if (seen.has(i.id)) return false;
    seen.add(i.id);
    return true;
  });

  const qualityGate = buildQualityGate(deduped, wordCount, minWords);
  const passed = !qualityGate.blocked && qualityGate.severity !== 'critical';

  return {
    passed,
    blocked: qualityGate.blocked,
    skipScoring: qualityGate.skipScoring,
    severity: qualityGate.severity,
    issues: deduped,
    qualityGate,
    metrics: {
      wordCount,
      minWords,
      taskType,
      issueCount: deduped.length,
    },
    suggestions: deduped.map(i => i.suggestion).filter((s, i, a) => a.indexOf(s) === i),
  };
}

/**
 * Strict IELTS Writing evaluator — conservative, descriptor-aligned.
 * Does not inflate scores. Band 7+ blocked when coherence, lexis, grammar, or task response are weak.
 */

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

function clampBand(x) {
  return Math.max(4, Math.min(9, Math.round(x * 2) / 2));
}

/** Conservative overall: favour lower half-step on borderline. */
function overallBandConservative(ta, cc, lr, gra) {
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
function analyzeEssay(text, opts = {}) {
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
function evaluateIeltsWriting(text, opts = {}) {
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
function formatEvaluationForUI(result) {
  return result;
}


function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function generateLocalFeedback(text, taskType, minWords, prompt) {
  return evaluateIeltsWriting(text, { taskType, minWords, prompt: prompt || '' });
}

function renderValidationSection(validation) {
  if (!validation || !validation.issues || !validation.issues.length) return '';
  const severityClass = {
    critical: 'val-sev-critical',
    high: 'val-sev-high',
    medium: 'val-sev-medium',
    low: 'val-sev-low',
    none: 'val-sev-low',
  };
  const items = validation.issues.map((i) => {
    const cls = severityClass[i.severity] || 'val-sev-medium';
    return [
      '<li class="validation-issue ', cls, '">',
      '<span class="validation-severity">', escapeHtml(i.severity), '</span>',
      '<span class="validation-category">', escapeHtml(i.category.replace(/_/g, ' ')), '</span>',
      '<p class="validation-explanation">', escapeHtml(i.explanation), '</p>',
      '<p class="validation-suggestion"><strong>Suggestion:</strong> ', escapeHtml(i.suggestion), '</p>',
      '</li>',
    ].join('');
  }).join('');
  const gateNote = validation.qualityGate && validation.qualityGate.blockBand7Plus
    ? '<p class="validation-gate-note">Quality gate: Band 7+ is not available until these issues are resolved.</p>'
    : '';
  const blockedNote = validation.skipScoring
    ? '<p class="validation-blocked-note">This submission did not pass pre-scoring validation. Full band scoring was not applied.</p>'
    : '';
  return [
    '<div class="validation-panel">',
    '<h4 class="validation-title">Pre-scoring validation</h4>',
    '<p class="validation-summary">Severity: <strong>', escapeHtml(validation.severity), '</strong>',
    ' · ', validation.issues.length, ' issue(s) detected</p>',
    blockedNote,
    gateNote,
    '<ul class="validation-list">', items, '</ul>',
    '</div>',
  ].join('');
}

function renderCriterionBlock(label, c) {
  if (!c) return '';
  const lost = (c.pointsLost || []).map(p => '<li>' + escapeHtml(p) + '</li>').join('');
  const weak = (c.weaknesses || []).map(p => '<li>' + escapeHtml(p) + '</li>').join('');
  const imp = (c.improvements || []).map(p => '<li>' + escapeHtml(p) + '</li>').join('');
  let html = '<div class="criterion-block"><h4>' + escapeHtml(label) + ' — Band ' + c.band + '</h4>';
  if (lost) html += '<p class="crit-label">Score reductions</p><ul class="crit-list">' + lost + '</ul>';
  if (weak) html += '<p class="crit-label">Weaknesses</p><ul class="crit-list">' + weak + '</ul>';
  if (imp) html += '<p class="crit-label">How to improve</p><ul class="crit-list">' + imp + '</ul>';
  return html + '</div>';
}

function renderFeedbackUI(fb, r, providerLabel, providerClass) {
  const flags = (r.flags || []).map(f => '<span class="flag-tag">' + escapeHtml(f) + '</span>').join('');
  const globalLost = (r.pointsLost || []).slice(0, 6).map(p => '<li>' + escapeHtml(p) + '</li>').join('');
  const criteria = r.criteria || {};
  const critHtml = [
    renderCriterionBlock('Task Achievement', criteria.ta || { band: r.ta, pointsLost: [], weaknesses: [], improvements: [] }),
    renderCriterionBlock('Coherence & Cohesion', criteria.cc || { band: r.cc, pointsLost: [], weaknesses: [], improvements: [] }),
    renderCriterionBlock('Lexical Resource', criteria.lr || { band: r.lr, pointsLost: [], weaknesses: [], improvements: [] }),
    renderCriterionBlock('Grammar Range & Accuracy', criteria.gra || { band: r.gra, pointsLost: [], weaknesses: [], improvements: [] }),
  ].join('');

  const validationHtml = renderValidationSection(r.validation);

  fb.innerHTML = [
    '<div class="feedback-header"><h3>Writing feedback</h3><span class="ai-tag ', providerClass, '">', providerLabel, '</span></div>',
    validationHtml,
    '<p class="examiner-note">Strict examiner estimate — realism over encouragement. ', escapeHtml(r.disclaimer || ''), '</p>',
    '<div class="score-grid">',
    '<div class="score-item"><div class="sc-val">', r.ta, '</div><div class="sc-lbl">Task Achievement</div></div>',
    '<div class="score-item"><div class="sc-val">', r.cc, '</div><div class="sc-lbl">Coherence</div></div>',
    '<div class="score-item"><div class="sc-val">', r.lr, '</div><div class="sc-lbl">Lexical Resource</div></div>',
    '<div class="score-item"><div class="sc-val">', r.gra, '</div><div class="sc-lbl">Grammar</div></div>',
    '</div>',
    '<div class="overall-band">Overall: Band ', r.overall, '</div>',
    flags ? '<div class="flag-row">' + flags + '</div>' : '',
    '<div class="feedback-text">',
    globalLost ? '<p class="crit-label">Main reasons marks were lost</p><ul class="crit-list">' + globalLost + '</ul>' : '',
    r.weaknesses ? '<p><strong>Key weaknesses:</strong> ' + escapeHtml(r.weaknesses) + '</p>' : '',
    r.strengths ? '<p><strong>Limited strengths (if any):</strong> ' + escapeHtml(r.strengths) + '</p>' : '',
    '<p><strong>Priority improvements:</strong> ' + escapeHtml(r.improvements) + '</p>',
    '<p><strong>Examiner note:</strong> ' + escapeHtml(r.tip) + '</p>',
    r.vocab && r.vocab.length ? '<p><strong>Vocabulary focus:</strong> ' + r.vocab.map(v => '<em>' + escapeHtml(v) + '</em>').join(', ') + '</p>' : '',
    '</div>',
    '<div class="criteria-detail">', critHtml, '</div>',
  ].join('');
}

function applyStrictCaps(llm, rule) {
  const cap = (a, b) => Math.min(Number(a) || 9, Number(b) || 9);
  const merged = {
    ta: cap(llm.ta, rule.ta),
    cc: cap(llm.cc, rule.cc),
    lr: cap(llm.lr, rule.lr),
    gra: cap(llm.gra, rule.gra),
    strengths: llm.strengths || rule.strengths,
    improvements: [rule.improvements, llm.improvements].filter(Boolean).join(' ').trim(),
    weaknesses: rule.weaknesses || llm.weaknesses,
    pointsLost: [...(rule.pointsLost || []), ...(Array.isArray(llm.pointsLost) ? llm.pointsLost : [])].slice(0, 8),
    tip: llm.tip || rule.tip,
    vocab: llm.vocab || rule.vocab,
    criteria: rule.criteria,
    flags: rule.flags,
    flagMap: rule.flagMap,
    disclaimer: rule.disclaimer,
  };
  merged.overall = overallBandConservative(merged.ta, merged.cc, merged.lr, merged.gra);
  if (rule.validationBlocked) merged.overall = rule.overall;
  else if (rule.flagMap && rule.flagMap.offTopic) merged.overall = Math.min(merged.overall, 5.0);
  else if (rule.flags && rule.flags.length) merged.overall = Math.min(merged.overall, 6.5);
  merged.validation = rule.validation;
  merged.validationBlocked = rule.validationBlocked;
  return merged;
}

async function fetchOpenAIFeedback(text, words, taskType, prompt, ruleBaseline) {
  const key = (appState.openaiKey || '').trim();
  if (!key) throw new Error('Add your OpenAI API key in Settings to use ChatGPT feedback.');
  const system = [
    'You are a strict certified IELTS Writing examiner.',
    'Use official IELTS public band descriptors. Be conservative; do NOT inflate scores.',
    'If coherence is weak, vocabulary repetitive, grammar faulty, or task response shallow, NO criterion may be Band 7+.',
    'When uncertain between two bands, choose the LOWER band.',
    'Prioritise accuracy over encouragement. List why marks were lost before any praise.',
  ].join(' ');
  const user = [
    'Evaluate this ' + (taskType === 'task1' ? 'Task 1' : 'Task 2') + ' essay.',
    'QUESTION: ' + (prompt || '(not provided)'),
    'Rule-based caps (do not exceed): TA≤' + ruleBaseline.ta + ' CC≤' + ruleBaseline.cc,
    ' LR≤' + ruleBaseline.lr + ' GRA≤' + ruleBaseline.gra + ' overall≤' + ruleBaseline.overall,
    ' Flags: ' + (ruleBaseline.flags || []).join('; '),
    'Respond ONLY with valid JSON:',
    '{"ta":n,"cc":n,"lr":n,"gra":n,"overall":n,"strengths":"...","improvements":"...","weaknesses":"...","pointsLost":["..."],"tip":"...","vocab":["w1","w2"]}',
    'Bands 4.0–9.0 in 0.5 steps. Essay (' + words + ' words):\n' + text,
  ].join('\n');
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      max_tokens: 1200,
      temperature: 0.15,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI request failed');
  const raw = data.choices?.[0]?.message?.content || '';
  const llm = JSON.parse(raw.replace(/```json|```/g, '').trim());
  return applyStrictCaps(llm, ruleBaseline);
}

async function getAIFeedback(id, min) {
  const area = document.getElementById('essayArea');
  const text = area ? area.value.trim() : '';
  const words = text.split(/\s+/).filter(Boolean).length;
  const fb = document.getElementById('feedback-' + id);
  const t = WRITING_TASKS.find(x => x.id === id);
  if (words < 50) { alert('Please write at least 50 words first.'); return; }

  fb.classList.add('show');
  const provider = appState.aiProvider || 'local';
  const loadingLabel = provider === 'openai' ? 'ChatGPT (strict)' : 'Strict examiner';
  fb.innerHTML = '<div class="feedback-header"><h3>Writing feedback</h3><span class="ai-tag">' + loadingLabel + '</span></div>' +
    '<div style="display:flex;align-items:center;gap:12px;color:var(--muted);font-size:14px;padding:8px 0">' +
    'Analysing your essay&nbsp;<motion><div class="loading-dots"><span></span><span></span><span></span></div></motion></motion></motion></motion></motion></div>'.replace(/<\/?motion>/g, '');

  try {
    const ruleResult = generateLocalFeedback(text, t.type, min, t.prompt);
    let r;
    if (provider === 'openai' && !ruleResult.validationBlocked) {
      r = await fetchOpenAIFeedback(text, words, t.type, t.prompt, ruleResult);
      r.validation = r.validation || ruleResult.validation;
      renderFeedbackUI(fb, r, 'ChatGPT (strict)', 'openai');
    } else if (provider === 'openai' && ruleResult.validationBlocked) {
      r = ruleResult;
      renderFeedbackUI(fb, r, 'Validation gate', 'local');
    } else {
      await new Promise(res => setTimeout(res, 400));
      r = ruleResult;
      renderFeedbackUI(fb, r, 'Strict examiner', 'local');
    }
    if (!appState.essaysDone.includes(id)) appState.essaysDone.push(id);
    appState.bandHistory.push({ ts: Date.now(), band: Number(r.overall), taskId: id, title: t.title });
    appState.studyMins += t.timeLimit || 30;
    logActivity('writing', t.title, { band: r.overall });
    saveState();
    renderHomeStats();
    if (area) localStorage.setItem('ielts_essay_' + id, area.value);
  } catch (e) {
    fb.innerHTML = '<div class="feedback-header"><h3>Writing feedback</h3></div>' +
      '<div style="color:var(--muted);font-size:14px;padding:8px 0;line-height:1.6">' + escapeHtml(e.message) +
      '<br><br><button type="button" class="btn-secondary" onclick="appState.aiProvider=\'local\';saveState();getAIFeedback(\'' + id + '\',' + min + ')">Try strict offline examiner instead</button></div>';
  }
}
