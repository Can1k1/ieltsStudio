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
export function validateEssay(text, opts = {}) {
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
