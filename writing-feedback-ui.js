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
