function clampBand(x) {
  return Math.max(4, Math.min(9, Math.round(x * 2) / 2));
}

function generateLocalFeedback(text, taskType, minWords) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const lower = text.toLowerCase();
  const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 8);
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim());
  const connectors = ['furthermore','however','therefore','in contrast','moreover','nevertheless','consequently','on the other hand','in addition','whereas','thus','hence','although','while','because','accordingly','conversely','admittedly','granted'];
  const foundConnectors = connectors.filter(c => lower.includes(c));
  const academicHits = VOCAB.filter(v => lower.includes(v.word.toLowerCase()));
  const uniqueRatio = wordCount ? new Set(words.map(w => w.toLowerCase())).size / wordCount : 0;
  const avgLen = wordCount / Math.max(1, sentences.length);
  const complex = (text.match(/\b(which|who|although|whereas|if|when|while|despite|unless)\b/gi) || []).length;

  let ta = 6, cc = 6, lr = 6, gra = 6;
  if (wordCount >= minWords) ta += 0.5;
  if (wordCount >= minWords * 1.15) ta += 0.5;
  if (wordCount < minWords * 0.75) ta -= 1;
  if (taskType === 'task2' && paragraphs.length >= 4) ta += 0.5;
  if (taskType === 'task1' && /overall|in summary|clearly/i.test(text)) ta += 0.5;

  if (foundConnectors.length >= 4) cc += 1;
  else if (foundConnectors.length >= 2) cc += 0.5;
  if (paragraphs.length >= 3) cc += 0.5;

  if (academicHits.length >= 4) lr += 1;
  else if (academicHits.length >= 2) lr += 0.5;
  if (uniqueRatio > 0.55) lr += 0.5;

  if (avgLen >= 12 && avgLen <= 28) gra += 0.5;
  if (complex >= 3) gra += 0.5;
  if (sentences.length >= 8) gra += 0.5;

  ta = clampBand(ta); cc = clampBand(cc); lr = clampBand(lr); gra = clampBand(gra);
  const overall = clampBand((ta + cc + lr + gra) / 4);

  const strengths = [
    wordCount >= minWords ? 'You met the word-count target, which supports Task Achievement.' : null,
    foundConnectors.length ? 'You used linking words (' + foundConnectors.slice(0, 3).join(', ') + '), which helps coherence.' : null,
    academicHits.length ? 'You included academic vocabulary such as "' + academicHits.slice(0, 2).map(w => w.word).join('", "') + '".' : null,
    paragraphs.length >= 4 ? 'The essay has a clear multi-paragraph structure.' : null
  ].filter(Boolean).join(' ') || 'You addressed the task with a complete response.';

  const improvements = [
    wordCount < minWords ? 'Increase length to at least ' + minWords + ' words for a stronger Task Achievement score.' : null,
    foundConnectors.length < 2 ? 'Add more discourse markers (e.g. however, furthermore, in contrast).' : null,
    academicHits.length < 2 ? 'Use more Band 7+ vocabulary from the Vocab section in this app.' : null,
    paragraphs.length < 4 && taskType === 'task2' ? 'Use four clear paragraphs: intro, two body paragraphs, conclusion.' : null
  ].filter(Boolean).join(' ') || 'Keep developing ideas with specific examples and clearer topic sentences.';

  const tip = taskType === 'task1'
    ? 'Start with an overview sentence covering the main trend before giving details.'
    : 'Make your position clear in the introduction and restate it in the conclusion without new ideas.';

  const vocab = academicHits.length
    ? academicHits.slice(0, 3).map(w => w.word)
    : ['mitigate', 'substantial', 'facilitate'].filter(w => !lower.includes(w));

  return { ta, cc, lr, gra, overall, strengths, improvements, tip, vocab };
}

function renderFeedbackUI(fb, r, providerLabel, providerClass) {
  fb.innerHTML = [
    '<div class="feedback-header"><h3>Writing feedback</h3><span class="ai-tag ', providerClass, '">', providerLabel, '</span></div>',
    '<div class="score-grid">',
    '<div class="score-item"><div class="sc-val">', r.ta, '</div><div class="sc-lbl">Task Achievement</div></div>',
    '<div class="score-item"><div class="sc-val">', r.cc, '</div><div class="sc-lbl">Coherence</div></div>',
    '<div class="score-item"><div class="sc-val">', r.lr, '</div><div class="sc-lbl">Lexical Resource</div></div>',
    '<div class="score-item"><div class="sc-val">', r.gra, '</div><div class="sc-lbl">Grammar</div></div>',
    '</div>',
    '<div class="overall-band">Overall: Band ', r.overall, '</div>',
    '<div class="feedback-text">',
    '<p><strong>Strengths:</strong> ', r.strengths, '</p>',
    '<p><strong>To improve:</strong> ', r.improvements, '</p>',
    '<p><strong>Examiner tip:</strong> ', r.tip, '</p>',
    r.vocab && r.vocab.length ? '<p><strong>Vocabulary upgrade:</strong> Try ' + r.vocab.map(v => '<em>' + v + '</em>').join(', ') + ' for greater lexical range.</p>' : '',
    '</div>'
  ].join('');
}

async function fetchOpenAIFeedback(text, words, taskType) {
  const key = (appState.openaiKey || '').trim();
  if (!key) throw new Error('Add your OpenAI API key in Settings to use ChatGPT feedback.');
  const prompt = 'You are an expert IELTS examiner. Evaluate this ' + (taskType === 'task1' ? 'Task 1' : 'Task 2') + ' essay. Respond ONLY with valid JSON, no markdown:\n' +
    '{"ta":X,"cc":X,"lr":X,"gra":X,"overall":X,"strengths":"...","improvements":"...","tip":"...","vocab":["w1","w2","w3"]}\n' +
    'X = band 4.0-9.0 in 0.5 steps. Keep text fields to 1-2 sentences. vocab = 3 academic alternatives.\nEssay (' + words + ' words):\n' + text;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + key },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 900,
      temperature: 0.4
    })
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI request failed');
  const raw = data.choices?.[0]?.message?.content || '';
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
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
  const loadingLabel = provider === 'openai' ? 'ChatGPT' : 'Smart coach';
  fb.innerHTML = '<div class="feedback-header"><h3>Writing feedback</h3><span class="ai-tag">' + loadingLabel + '</span></div>' +
    '<div style="display:flex;align-items:center;gap:12px;color:var(--muted);font-size:14px;padding:8px 0">' +
    'Analysing your essay&nbsp;<div class="loading-dots"><span></span><span></span><span></span></div></div>';

  try {
    let r;
    if (provider === 'openai') {
      r = await fetchOpenAIFeedback(text, words, t.type);
      renderFeedbackUI(fb, r, 'ChatGPT', 'openai');
    } else {
      await new Promise(res => setTimeout(res, 600));
      r = generateLocalFeedback(text, t.type, min);
      renderFeedbackUI(fb, r, 'Smart coach', 'local');
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
      '<div style="color:var(--muted);font-size:14px;padding:8px 0;line-height:1.6">' + e.message +
      '<br><br><button type="button" class="btn-secondary" onclick="appState.aiProvider=\'local\';saveState();getAIFeedback(\'' + id + '\',' + min + ')">Try free Smart coach instead</button></div>';
  }
}
