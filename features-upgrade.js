/**
 * IELTS Studio — Feature Upgrade Module
 * ========================================
 * Adds to the existing app:
 *  1. Exam countdown + date setting (biggest motivational feature)
 *  2. Gemini AI provider (free tier, CORS-enabled)
 *  3. API connection tester
 *  4. Band 9 model answers (toggle per writing task)
 *  5. Essay export (copy to clipboard / download .txt)
 *  6. Skill gap widget on dashboard
 *  7. Grammar highlight (pattern-based, inline essay warning)
 *  8. Mobile bottom navigation
 *  9. "Focus area" smart recommendation
 * 10. Writing task timer (countdown during practice)
 */

/* ═══════════════════════════════════════════════════════════
   1. EXAM COUNTDOWN
═══════════════════════════════════════════════════════════ */
const ExamCountdown = (() => {
  let _timer = null;

  function getExamDate() {
    const raw = (typeof appState !== 'undefined' && appState.examDate) || localStorage.getItem('ielts_exam_date');
    return raw ? new Date(raw) : null;
  }

  function setExamDate(dateStr) {
    if (typeof appState !== 'undefined') { appState.examDate = dateStr; }
    localStorage.setItem('ielts_exam_date', dateStr);
    if (typeof saveState === 'function') saveState();
    render();
    window.Toast?.show('📅 Exam date saved! Good luck with your preparation.', 'success', 3000);
  }

  function render() {
    const el = document.getElementById('examCountdownWidget');
    if (!el) return;

    const examDate = getExamDate();
    if (!examDate || isNaN(examDate)) {
      el.innerHTML = `
        <div class="ecw-no-date">
          <span class="ecw-icon">📅</span>
          <div>
            <p class="ecw-label">Set your exam date to see a countdown</p>
            <input type="date" class="ecw-date-input" id="ecwDateInput"
              min="${new Date().toISOString().split('T')[0]}"
              onchange="ExamCountdown.setExamDate(this.value)">
          </div>
        </div>`;
      return;
    }

    const now  = new Date();
    const diff = examDate - now;

    if (diff <= 0) {
      el.innerHTML = `<div class="ecw-done"><span class="ecw-icon">🎓</span><p>Your exam date has passed — we hope it went brilliantly!</p><button class="ecw-clear" onclick="ExamCountdown.clear()">Set new date</button></div>`;
      return;
    }

    const days  = Math.floor(diff / 86400000);
    const hours = Math.floor((diff % 86400000) / 3600000);
    const mins  = Math.floor((diff % 3600000)  / 60000);

    const urgency = days <= 7 ? 'ecw-urgent' : days <= 30 ? 'ecw-soon' : '';
    const msg     = days <= 7  ? '🔥 Final sprint — focus on weak areas!' :
                    days <= 14 ? '⚡ Two weeks left — review and practise daily!' :
                    days <= 30 ? '📚 Stay consistent — daily practice is key.' :
                                 '🌱 Great planning ahead — build solid foundations.';

    el.innerHTML = `
      <div class="ecw-body ${urgency}">
        <div class="ecw-units">
          <div class="ecw-unit"><span class="ecw-num">${days}</span><span class="ecw-lbl">days</span></div>
          <span class="ecw-sep">:</span>
          <div class="ecw-unit"><span class="ecw-num">${String(hours).padStart(2,'0')}</span><span class="ecw-lbl">hrs</span></div>
          <span class="ecw-sep">:</span>
          <div class="ecw-unit"><span class="ecw-num">${String(mins).padStart(2,'0')}</span><span class="ecw-lbl">min</span></div>
        </div>
        <p class="ecw-msg">${msg}</p>
        <div class="ecw-foot">
          <span>Exam: ${examDate.toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'})}</span>
          <button class="ecw-clear" onclick="ExamCountdown.clear()">Change</button>
        </div>
      </div>`;
  }

  function clear() {
    if (typeof appState !== 'undefined') delete appState.examDate;
    localStorage.removeItem('ielts_exam_date');
    if (typeof saveState === 'function') saveState();
    render();
  }

  function start() {
    render();
    clearInterval(_timer);
    _timer = setInterval(render, 60000); // update every minute
  }

  return { start, render, setExamDate, clear, getExamDate };
})();

window.ExamCountdown = ExamCountdown;


/* ═══════════════════════════════════════════════════════════
   2. GEMINI AI PROVIDER  (free tier — 60 RPM)
═══════════════════════════════════════════════════════════ */
async function fetchGeminiFeedback(text, words, taskType, prompt, ruleBaseline) {
  const key = ((typeof appState !== 'undefined' && appState.geminiKey) || '').trim();
  if (!key) throw new Error('Add your Google Gemini API key in Settings to use Gemini feedback.');

  const systemInstructions = `You are a strict certified IELTS Writing examiner. Use official IELTS public band descriptors. Be conservative; do NOT inflate scores. When uncertain between two bands, choose the LOWER band. Prioritise accuracy over encouragement. List why marks were lost before any praise.`;

  const userContent = [
    `Evaluate this ${taskType === 'task1' ? 'Task 1' : 'Task 2'} IELTS essay.`,
    `QUESTION: ${prompt || '(not provided)'}`,
    `Rule-based caps (do not exceed): TA≤${ruleBaseline.ta} CC≤${ruleBaseline.cc} LR≤${ruleBaseline.lr} GRA≤${ruleBaseline.gra} overall≤${ruleBaseline.overall}`,
    `Flags: ${(ruleBaseline.flags || []).join('; ') || 'none'}`,
    `Respond ONLY with valid JSON — no markdown, no explanation:`,
    `{"ta":n,"cc":n,"lr":n,"gra":n,"overall":n,"strengths":"...","improvements":"...","weaknesses":"...","pointsLost":["...","..."],"tip":"...","vocab":["word1","word2"]}`,
    `Bands: 4.0–9.0 in 0.5 steps. Essay (${words} words):\n${text}`,
  ].join('\n');

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${key}`;

  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: `${systemInstructions}\n\n${userContent}` }] }],
      generationConfig: { temperature: 0.15, maxOutputTokens: 1200 },
    }),
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg  = body?.error?.message || `Gemini HTTP ${res.status}`;
    const err  = Object.assign(new Error(msg), { status: res.status, code: res.status === 429 ? 'RATE_LIMIT' : 'API_ERROR' });
    throw err;
  }

  const data = await res.json();
  const raw  = data.candidates?.[0]?.content?.parts?.[0]?.text || '';

  let llm;
  try { llm = JSON.parse(raw.replace(/```json|```/g, '').trim()); }
  catch { throw Object.assign(new Error('Gemini returned non-JSON response.'), { code: 'PARSE_ERROR', raw }); }

  // Reuse the strict caps from ai-service.js if available
  if (typeof window._applyStrictCaps === 'function') return window._applyStrictCaps(llm, ruleBaseline);
  return { ...ruleBaseline, ...llm };
}

window.fetchGeminiFeedback = fetchGeminiFeedback;


/* ═══════════════════════════════════════════════════════════
   3. API CONNECTION TESTER
═══════════════════════════════════════════════════════════ */
async function testAPIConnection(provider) {
  const btn = document.getElementById('apiTestBtn');
  const out = document.getElementById('apiTestResult');
  if (!btn || !out) return;

  btn.disabled = true;
  btn.textContent = 'Testing…';
  out.className = 'api-test-result testing';
  out.textContent = 'Sending test request…';

  try {
    if (provider === 'openai') {
      const key = ((typeof appState !== 'undefined' && appState.openaiKey) || '').trim();
      if (!key) throw new Error('No OpenAI key entered.');
      const res = await fetch('https://api.openai.com/v1/models', {
        headers: { Authorization: `Bearer ${key}` }
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out.className = 'api-test-result ok';
      out.textContent = '✓ OpenAI connected — key is valid.';
    } else if (provider === 'gemini') {
      const key = ((typeof appState !== 'undefined' && appState.geminiKey) || '').trim();
      if (!key) throw new Error('No Gemini key entered.');
      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${key}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      out.className = 'api-test-result ok';
      out.textContent = '✓ Gemini connected — key is valid.';
    } else {
      out.className = 'api-test-result ok';
      out.textContent = '✓ Offline examiner — no connection needed.';
    }
    window.Toast?.show('✓ API connection successful!', 'success', 2500);
  } catch (err) {
    out.className = 'api-test-result fail';
    out.textContent = `✕ ${err.message}`;
    window.Toast?.show(`✕ API test failed: ${err.message}`, 'error', 4000);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Test connection';
  }
}

window.testAPIConnection = testAPIConnection;


/* ═══════════════════════════════════════════════════════════
   4. BAND 9 MODEL ANSWERS
═══════════════════════════════════════════════════════════ */
const ModelAnswers = {
  wt001: {
    band: 9,
    label: 'Task 2 — Technology and Human Connection',
    answer: `The digital revolution has fundamentally altered the landscape of human interaction, prompting considerable debate about whether technology ultimately enriches or diminishes our social bonds. While I acknowledge that digital platforms have expanded the reach of human communication, I firmly believe that an over-reliance on technology is eroding the depth and authenticity of genuine human connection.

Proponents of technology's social benefits argue convincingly that it has dismantled geographical barriers, allowing individuals to maintain meaningful relationships across continents. A family separated by immigration, for example, can sustain emotional closeness through video calls and instant messaging in ways that were inconceivable a generation ago. Furthermore, social media platforms have enabled marginalised individuals — those with disabilities, social anxieties, or niche interests — to find supportive communities that might not exist within their physical environments.

Nevertheless, there is compelling evidence that this connectivity comes at a significant cost. Psychological research consistently demonstrates that digital communication lacks the nuanced cues — eye contact, tone of voice, physical touch — that are essential for empathy and deep emotional understanding. When people substitute face-to-face conversation with text messages, they often engage at a surface level, accumulating hundreds of online acquaintances while experiencing profound loneliness. This paradox of connection is particularly acute among adolescents, for whom excessive social media use correlates strongly with elevated rates of depression and anxiety.

Moreover, the design of social platforms actively exploits psychological vulnerabilities to maximise engagement rather than meaningful interaction. Algorithms prioritise content that provokes emotional reactions, fostering superficial outrage rather than thoughtful dialogue.

In conclusion, while technology possesses an undeniable capacity to connect people across distances, its current design and widespread misuse are measurably fragmenting the fabric of authentic human relationships. Addressing this requires both individual discipline and systemic reform of how platforms are designed.`,
    wordCount: 278,
    examinerNote: 'Fully addresses both views with a clear position. Sophisticated cohesion, precise vocabulary (eroding, authentic, marginalised, paradox), varied sentence structures throughout. No errors.',
  },
  wt004: {
    band: 9,
    label: 'Task 1 — Renewable Energy Bar Chart',
    answer: `The bar chart illustrates the proportion of electricity generated from renewable sources in five countries — Norway, Germany, the United Kingdom, the United States, and China — in two separate years: 2005 and 2020.

Overall, every country recorded an increase in renewable electricity generation over the 15-year period, with Norway maintaining the highest share throughout and the European nations demonstrating the most dramatic growth.

Norway already led the group considerably in 2005 at 67%, and this figure rose further to 82% by 2020, cementing its position as the clear frontrunner. In stark contrast, the United Kingdom and Germany both began from relatively modest bases — 5% and 10% respectively — yet both achieved remarkable growth, reaching 43% and 46% in 2020, increases of approximately eight and five times their initial values.

China and the United States recorded more moderate but still noteworthy gains. China's renewable share rose from 16% to 28%, while the United States increased from 8% to 21%, more than doubling its 2005 figure.

In summary, while all five nations expanded their renewable capacity significantly, the most notable feature is the transformational growth experienced by Germany and the UK, which narrowed the gap considerably with Norway despite starting from negligible percentages.`,
    wordCount: 197,
    examinerNote: 'Accurate data referencing, clear overview, meaningful comparisons. No personal opinion. Precise range vocabulary (cementing, stark contrast, transformational, negligible).',
  },
  wt005: {
    band: 9,
    label: 'Task 2 — Education and Employment',
    answer: `A growing chorus of voices contends that universities are failing graduates by prioritising theoretical frameworks over the practical competencies demanded by modern employers. While I concede that some reform is warranted, I would argue that a wholesale shift toward vocational training would be deeply misguided and would ultimately impoverish both graduates and society.

The case for practical skills is not without merit. Employers in technology, business, and healthcare frequently lament that graduates arrive without basic professional skills — project management, data literacy, client communication — forcing companies to invest substantially in remedial training. A more skills-oriented curriculum could therefore reduce this burden and improve graduate employability in the short term.

However, universities serve a purpose that transcends the immediate demands of the labour market. A student trained primarily in practical techniques is equipped for the job as it currently exists, not as it will exist in a decade defined by artificial intelligence and automation. By contrast, a graduate who has developed critical thinking, research methodology, and the capacity to synthesise complex information across disciplines is prepared to adapt to roles that do not yet exist. History consistently demonstrates that it is theoretically educated individuals — scientists, philosophers, economists — who generate the innovations that transform industries.

Furthermore, reducing higher education to vocational training would exacerbate inequality. Students from privileged backgrounds, whose families can provide practical mentorship and networking opportunities, benefit disproportionately from theoretical education, while requiring all students to focus on immediate workplace skills risks creating a two-tier system.

In conclusion, while universities should incorporate more practical elements into their programmes, preserving the primacy of academic rigour and critical thinking is essential for long-term individual and societal flourishing.`,
    wordCount: 271,
    examinerNote: 'Nuanced argument acknowledging counter-view before refuting it. Sophisticated lexis (lament, remedial, synthesise, exacerbate). Flawless grammar, logically structured throughout.',
  },
};

window.ModelAnswers = ModelAnswers;

function toggleModelAnswer(taskId) {
  const panel = document.getElementById(`model-answer-${taskId}`);
  const btn   = document.getElementById(`ma-btn-${taskId}`);
  if (!panel || !btn) return;

  const isOpen = panel.classList.contains('ma-open');
  if (isOpen) {
    panel.classList.remove('ma-open');
    btn.textContent = '📋 Show Band 9 Model Answer';
  } else {
    const ma = ModelAnswers[taskId];
    if (!ma) {
      panel.innerHTML = '<p class="ma-none">Model answer not yet available for this task.</p>';
    } else {
      panel.innerHTML = `
        <div class="ma-header">
          <span class="ma-badge">Band ${ma.band}</span>
          <span class="ma-label">${_escMA(ma.label)}</span>
          <span class="ma-wc">${ma.wordCount} words</span>
        </div>
        <div class="ma-text">${_escMA(ma.answer).replace(/\n\n/g, '</p><p>').replace(/\n/g, '<br>')}</div>
        <div class="ma-note"><strong>Examiner note:</strong> ${_escMA(ma.examinerNote)}</div>
      `;
    }
    panel.classList.add('ma-open');
    btn.textContent = '▲ Hide Model Answer';
    panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

function _escMA(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.toggleModelAnswer = toggleModelAnswer;


/* ═══════════════════════════════════════════════════════════
   5. ESSAY EXPORT
═══════════════════════════════════════════════════════════ */
async function exportEssay(taskId) {
  const area = document.getElementById('essayArea');
  const text = area ? area.value.trim() : '';
  if (!text) { window.Toast?.show('Nothing to export — write your essay first.', 'warning', 2500); return; }

  const t = (typeof WRITING_TASKS !== 'undefined') ? WRITING_TASKS.find(x => x.id === taskId) : null;
  const title   = t ? t.title : 'IELTS Essay';
  const prompt  = t ? t.prompt : '';
  const words   = text.split(/\s+/).filter(Boolean).length;
  const dateStr = new Date().toLocaleDateString('en-GB', {day:'numeric',month:'long',year:'numeric'});

  const content = [
    `IELTS Studio — Essay Export`,
    `Date: ${dateStr}`,
    `Task: ${title}`,
    `Words: ${words}`,
    ``,
    `QUESTION:`,
    prompt,
    ``,
    `─────────────────────────────────────────`,
    ``,
    text,
  ].join('\n');

  // Try clipboard first, fall back to download
  try {
    await navigator.clipboard.writeText(content);
    window.Toast?.show('📋 Essay copied to clipboard!', 'success', 2500);
  } catch {
    // Fallback: trigger download
    const blob = new Blob([content], { type: 'text/plain' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = `ielts-essay-${taskId}-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    window.Toast?.show('💾 Essay downloaded as .txt file.', 'success', 2500);
  }
}

window.exportEssay = exportEssay;


/* ═══════════════════════════════════════════════════════════
   6. SKILL GAP WIDGET (dashboard)
═══════════════════════════════════════════════════════════ */
function renderSkillGap() {
  const el = document.getElementById('skillGapWidget');
  if (!el) return;

  const state = (typeof appState !== 'undefined') ? appState : {};
  const target = parseFloat(state.targetBand || 7.0);

  // Compute averages from history
  const bands = (state.bandHistory || []).slice(-10); // last 10 essays
  const avgTA  = bands.length ? bands.reduce((s,b) => s + (b.ta  || b.band || 0), 0) / bands.length : 0;
  const avgCC  = bands.length ? bands.reduce((s,b) => s + (b.cc  || b.band || 0), 0) / bands.length : 0;
  const avgLR  = bands.length ? bands.reduce((s,b) => s + (b.lr  || b.band || 0), 0) / bands.length : 0;
  const avgGRA = bands.length ? bands.reduce((s,b) => s + (b.gra || b.band || 0), 0) / bands.length : 0;

  const vocabMastery = (() => {
    if (typeof VOCAB === 'undefined' || !VOCAB.length) return 0;
    const srs = (() => { try { return JSON.parse(localStorage.getItem('ielts_srs_v2')) || {}; } catch { return {}; } })();
    const mastered = VOCAB.filter(w => (srs[w.id]?.reps || 0) >= 3).length;
    return Math.round((mastered / VOCAB.length) * 9); // scale to 9
  })();

  const readingAcc = (() => {
    const rs = state.readingStats || [];
    if (!rs.length) return 0;
    const total   = rs.reduce((s,r) => s + (r.total   || 0), 0);
    const correct = rs.reduce((s,r) => s + (r.correct || 0), 0);
    return total ? (correct / total * 9) : 0;
  })();

  const skills = [
    { label: 'Task Achievement', score: avgTA,      icon: '🎯' },
    { label: 'Coherence',        score: avgCC,      icon: '🔗' },
    { label: 'Lexical Resource', score: avgLR,      icon: '📚' },
    { label: 'Grammar',          score: avgGRA,     icon: '✏️' },
    { label: 'Vocabulary',       score: vocabMastery,icon: '🗂️' },
    { label: 'Reading',          score: readingAcc, icon: '📖' },
  ];

  const hasData = bands.length > 0 || vocabMastery > 0 || readingAcc > 0;

  if (!hasData) {
    el.innerHTML = `<div class="sg-empty">Complete some exercises to see your skill gap analysis.</div>`;
    return;
  }

  // Find weakest skill
  const weakest = [...skills].filter(s=>s.score>0).sort((a,b)=>a.score-b.score)[0];
  const focusTip = weakest ? _focusTip(weakest.label) : '';

  el.innerHTML = `
    ${weakest ? `<div class="sg-focus-tip"><span class="sg-focus-icon">💡</span> <strong>Focus area:</strong> ${focusTip}</div>` : ''}
    <div class="sg-bars">
      ${skills.map(s => {
        const pct = Math.min(100, (s.score / 9) * 100);
        const gap = target - s.score;
        const gapLabel = s.score > 0 ? (gap > 0 ? `${gap.toFixed(1)} below target` : '✓ On target') : 'No data';
        const barClass = s.score === 0 ? 'sg-bar-empty' : gap <= 0 ? 'sg-bar-ok' : gap > 1.5 ? 'sg-bar-crit' : 'sg-bar-warn';
        return `
          <div class="sg-row">
            <span class="sg-icon">${s.icon}</span>
            <span class="sg-label">${s.label}</span>
            <div class="sg-track">
              <div class="sg-fill ${barClass}" style="width:${pct}%"></div>
              <div class="sg-target-line" style="left:${(target/9)*100}%"></div>
            </div>
            <span class="sg-score">${s.score > 0 ? s.score.toFixed(1) : '—'}</span>
            <span class="sg-gap ${barClass}">${gapLabel}</span>
          </div>`;
      }).join('')}
    </div>
    <div class="sg-legend">
      <span class="sg-lbl-ok">■ On/above target</span>
      <span class="sg-lbl-warn">■ Close</span>
      <span class="sg-lbl-crit">■ Needs work</span>
      <span>Target line: Band ${target}</span>
    </div>`;
}

function _focusTip(skill) {
  const tips = {
    'Task Achievement': 'Answer all parts of the question directly. Use clear topic sentences and make your position obvious from the start.',
    'Coherence': 'Use more linking devices (however, furthermore, consequently). Each paragraph should have one clear central idea.',
    'Lexical Resource': 'Practise your Band 8+ vocabulary flashcards daily. Avoid repeating the same words — use synonyms and collocations.',
    'Grammar': 'Focus on complex sentence structures: relative clauses, conditionals, and passive voice. Proofread for article and tense errors.',
    'Vocabulary': 'Review your due flashcards every day — consistency is more important than volume. Add words you encounter in reading.',
    'Reading': 'Practise skimming for gist and scanning for specific information. Don\'t re-read — trust your first instinct on True/False.',
  };
  return tips[skill] || 'Keep practising consistently to improve this skill.';
}

window.renderSkillGap = renderSkillGap;


/* ═══════════════════════════════════════════════════════════
   7. GRAMMAR HIGHLIGHT  (pattern-based, inline essay warnings)
═══════════════════════════════════════════════════════════ */
const GrammarHighlight = (() => {
  // Common IELTS grammar error patterns (heuristic, not NLP)
  const patterns = [
    { re: /\b(informations?|advices?|evidences?|knowledges?|furnitures?|equipments?|luggage|researches)\b/gi,
      msg: 'Possible uncountable noun error (information, advice, evidence, knowledge are uncountable)' },
    { re: /\b(since|for) (many|several|a few|two|three|[0-9]+) (years?|months?|decades?|centuries?)\b.{0,20}(is|are|has|have|was|were)\b/gi,
      msg: 'Possible tense error with "since/for" — consider present perfect' },
    { re: /\b(alot|alot of)\b/gi,     msg: '"Alot" → "a lot"' },
    { re: /\bweather\b.{0,30}\bwether\b|\bwether\b.{0,30}\bweather\b/gi, msg: 'Check "whether" vs "weather"' },
    { re: /\b(in my opinion|i think|i believe|i feel that).{0,30}(in my opinion|i think|i believe)/gi,
      msg: 'Redundant hedging — "in my opinion, I think" is repetitive; use one phrase' },
    { re: /\b(very very|really very|very really)\b/gi, msg: 'Double intensifier — use a stronger adjective instead' },
    { re: /\b(firstly|first of all).{0,300}(firstly|first of all)\b/gi, msg: 'Repeated sequence marker — vary with "second", "furthermore", etc.' },
    { re: /\b(in conclusion|to conclude|to sum up).{0,300}(in conclusion|to conclude|to sum up)\b/gi,
      msg: 'Use only one concluding phrase' },
    { re: /[^.!?]\s+(however|furthermore|moreover|therefore|consequently),/gi,
      msg: 'Connective after comma without full stop — may be a run-on sentence' },
  ];

  function analyse(text) {
    const issues = [];
    patterns.forEach(({ re, msg }) => {
      let m;
      re.lastIndex = 0;
      while ((m = re.exec(text)) !== null) {
        issues.push({ index: m.index, length: m[0].length, match: m[0], msg });
        if (issues.length > 10) break;
      }
    });
    return issues;
  }

  function renderWarnings(taskId) {
    const area = document.getElementById('essayArea');
    const text = area ? area.value : '';
    const container = document.getElementById(`grammar-warnings-${taskId}`);
    if (!container || !text.trim()) return;

    const issues = analyse(text);
    if (!issues.length) {
      container.innerHTML = '<p class="gw-clean">✓ No common grammar patterns flagged.</p>';
      container.style.display = 'block';
      return;
    }

    container.innerHTML = `
      <div class="gw-title">⚠ ${issues.length} potential grammar note${issues.length > 1 ? 's' : ''}</div>
      <ul class="gw-list">
        ${issues.map(i => `<li><code class="gw-match">${_escGW(i.match)}</code> — ${_escGW(i.msg)}</li>`).join('')}
      </ul>
      <p class="gw-note">Pattern-based hints only — verify manually before final submission.</p>`;
    container.style.display = 'block';
  }

  function _escGW(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  return { analyse, renderWarnings };
})();

window.GrammarHighlight = GrammarHighlight;
window.checkGrammar = (id) => GrammarHighlight.renderWarnings(id);


/* ═══════════════════════════════════════════════════════════
   8. WRITING TASK TIMER
═══════════════════════════════════════════════════════════ */
const WritingTimer = (() => {
  let _interval = null;
  let _secs = 0;
  let _running = false;
  let _totalSecs = 0;
  let _taskId = null;

  function start(taskId, timeLimitMins) {
    _taskId    = taskId;
    _totalSecs = timeLimitMins * 60;
    _secs      = _totalSecs;
    _running   = true;
    _render();
    clearInterval(_interval);
    _interval = setInterval(() => {
      if (!_running) return;
      _secs--;
      _render();
      if (_secs <= 300 && _secs % 60 === 0) { // warn every minute in last 5 min
        window.Toast?.show(`⏱ ${Math.ceil(_secs/60)} minute${_secs>60?'s':''} remaining`, 'warning', 2000);
      }
      if (_secs <= 0) { clearInterval(_interval); _secs = 0; _render(); window.Toast?.show('⏰ Time is up!', 'error', 0); }
    }, 1000);
  }

  function pause() {
    _running = !_running;
    _render();
  }

  function reset(timeLimitMins) {
    clearInterval(_interval);
    _secs = (timeLimitMins || _totalSecs/60) * 60;
    _totalSecs = _secs;
    _running = false;
    _render();
  }

  function _render() {
    const el = document.getElementById('writingTimerDisplay');
    if (!el) return;
    const m  = Math.floor(_secs / 60);
    const s  = _secs % 60;
    const pct = _totalSecs > 0 ? (_secs / _totalSecs) * 100 : 100;
    const urgent = _secs <= 300;
    el.innerHTML = `
      <div class="wt-timer ${urgent ? 'wt-urgent' : ''} ${!_running ? 'wt-paused' : ''}">
        <span class="wt-time">${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}</span>
        <div class="wt-bar-track"><div class="wt-bar-fill" style="width:${pct}%"></div></div>
        <div class="wt-btns">
          <button onclick="WritingTimer.pause()" class="btn-session">${_running ? '⏸' : '▶'}</button>
        </div>
      </div>`;
  }

  return { start, pause, reset };
})();

window.WritingTimer = WritingTimer;


/* ═══════════════════════════════════════════════════════════
   9. MOBILE BOTTOM NAVIGATION
═══════════════════════════════════════════════════════════ */
function initMobileNav() {
  const existing = document.getElementById('mobileBottomNav');
  if (existing) return;

  const nav = document.createElement('nav');
  nav.id = 'mobileBottomNav';
  nav.setAttribute('aria-label', 'Mobile navigation');
  nav.innerHTML = `
    <button class="mbn-btn active" data-page="home"     aria-label="Home">🏠<span>Home</span></button>
    <button class="mbn-btn" data-page="flashcards" aria-label="Vocab">🃏<span>Vocab</span></button>
    <button class="mbn-btn" data-page="reading"    aria-label="Reading">📖<span>Reading</span></button>
    <button class="mbn-btn" data-page="writing"    aria-label="Writing">✍️<span>Writing</span></button>
    <button class="mbn-btn" data-page="speaking"   aria-label="Speaking">🎙️<span>Speaking</span></button>
    <button class="mbn-btn" data-page="dashboard"  aria-label="Progress">📊<span>Progress</span></button>
  `;
  document.body.appendChild(nav);

  // Sync with existing page navigation
  nav.querySelectorAll('.mbn-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const page = btn.dataset.page;
      // Reuse existing showPage or navTab click
      const existingTab = document.querySelector(`.nav-tab[data-page="${page}"]`);
      if (existingTab) existingTab.click();
      nav.querySelectorAll('.mbn-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Keep mobile nav in sync with top nav clicks
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const page = tab.dataset.page;
      nav.querySelectorAll('.mbn-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.page === page);
      });
    });
  });
}


/* ═══════════════════════════════════════════════════════════
   10. PATCH openWriting — add timer + grammar check + export + model answer
═══════════════════════════════════════════════════════════ */
const _origOpenWriting = window.openWriting;
window.openWriting = function(id) {
  if (_origOpenWriting) _origOpenWriting(id);

  // Give the DOM time to render, then inject extra controls
  setTimeout(() => {
    const actions = document.querySelector('.writing-actions');
    if (!actions || document.getElementById(`export-btn-${id}`)) return;

    const t = (typeof WRITING_TASKS !== 'undefined') ? WRITING_TASKS.find(x => x.id === id) : null;

    // Add timer display after session-bar
    const sessionBar = document.getElementById(`session-bar-${id}`);
    if (sessionBar && t && !document.getElementById('writingTimerDisplay')) {
      const timerDiv = document.createElement('div');
      timerDiv.id = 'writingTimerDisplay';
      sessionBar.after(timerDiv);
      WritingTimer.start(id, t.timeLimit || 40);
    }

    // Extra action buttons
    const exportBtn = document.createElement('button');
    exportBtn.id = `export-btn-${id}`;
    exportBtn.className = 'btn-session';
    exportBtn.title = 'Copy essay to clipboard';
    exportBtn.innerHTML = '📋 Export';
    exportBtn.onclick = () => exportEssay(id);

    const grammarBtn = document.createElement('button');
    grammarBtn.className = 'btn-session';
    grammarBtn.title = 'Check for common grammar patterns';
    grammarBtn.innerHTML = '🔍 Grammar check';
    grammarBtn.onclick = () => checkGrammar(id);

    actions.appendChild(exportBtn);
    actions.appendChild(grammarBtn);

    // Grammar warnings container
    const fbBox = document.getElementById(`feedback-${id}`);
    if (fbBox && !document.getElementById(`grammar-warnings-${id}`)) {
      const gwDiv = document.createElement('div');
      gwDiv.id = `grammar-warnings-${id}`;
      gwDiv.className = 'grammar-warnings';
      gwDiv.style.display = 'none';
      fbBox.before(gwDiv);
    }

    // Model answer button + panel
    const maBtn = document.createElement('button');
    maBtn.id = `ma-btn-${id}`;
    maBtn.className = 'btn-model-answer';
    maBtn.innerHTML = '📋 Show Band 9 Model Answer';
    maBtn.onclick = () => toggleModelAnswer(id);

    const maPanel = document.createElement('div');
    maPanel.id = `model-answer-${id}`;
    maPanel.className = 'model-answer-panel';

    if (fbBox) {
      fbBox.after(maPanel);
      fbBox.after(maBtn);
    }
  }, 100);
};


/* ═══════════════════════════════════════════════════════════
   11. PATCH getAIFeedback to support Gemini
═══════════════════════════════════════════════════════════ */
const _origGetAIFeedback = window.getAIFeedback;
window.getAIFeedback = async function(id, min) {
  const provider = (typeof appState !== 'undefined' ? appState.aiProvider : 'local') || 'local';
  if (provider !== 'gemini') {
    return _origGetAIFeedback ? _origGetAIFeedback(id, min) : undefined;
  }

  // Gemini path
  const area  = document.getElementById('essayArea');
  const text  = area ? area.value.trim() : '';
  const words = text.split(/\s+/).filter(Boolean).length;
  const fb    = document.getElementById(`feedback-${id}`);
  const t     = (typeof WRITING_TASKS !== 'undefined') ? WRITING_TASKS.find(x => x.id === id) : null;

  if (words < 50) { window.Toast?.show('✏️ Write at least 50 words first.', 'warning', 2500); return; }
  if (!fb || !t)  { window.Toast?.show('Something went wrong — refresh the page.', 'error', 3500); return; }

  if (typeof LoadingState !== 'undefined') LoadingState.show(fb, 'Gemini (strict)');

  try {
    const ruleResult = (typeof generateLocalFeedback === 'function')
      ? generateLocalFeedback(text, t.type, min, t.prompt)
      : null;
    if (!ruleResult) throw new Error('Local evaluator not ready.');

    LoadingState?.update?.('contacting-api');
    const result = await fetchGeminiFeedback(text, words, t.type, t.prompt, ruleResult);
    LoadingState?.update?.('streaming');
    fb.classList.remove('fb-loading');

    if (typeof renderFeedbackUI === 'function') {
      await (typeof AIService !== 'undefined' && AIService.streamReveal
        ? AIService.streamReveal(fb, result, renderFeedbackUI, 'Gemini (strict)', 'gemini')
        : renderFeedbackUI(fb, result, 'Gemini (strict)', 'gemini'));
    }

    if (typeof appState !== 'undefined') {
      if (!appState.essaysDone.includes(id)) appState.essaysDone.push(id);
      appState.bandHistory.push({ ts: Date.now(), band: Number(result.overall), taskId: id, title: t.title });
      appState.studyMins += t.timeLimit || 30;
    }
    if (typeof logActivity   === 'function') logActivity('writing', t.title, { band: result.overall });
    if (typeof saveState     === 'function') saveState();
    if (typeof renderHomeStats === 'function') renderHomeStats();
    if (area) localStorage.setItem(`ielts_essay_${id}`, area.value);

    window.Toast?.show(`✅ Gemini: Band ${result.overall} — ${t.title}`, 'success', 3500);
  } catch (err) {
    if (typeof LoadingState !== 'undefined') LoadingState.showError(fb, err.message, () => getAIFeedback(id, min));
    window.Toast?.show(`✕ Gemini error: ${err.message?.slice(0,80)}`, 'error', 5000);
  }
};


/* ═══════════════════════════════════════════════════════════
   12. BOOT
═══════════════════════════════════════════════════════════ */
function _featuresBoot() {
  ExamCountdown.start();
  renderSkillGap();
  initMobileNav();

  // Re-render skill gap when switching to dashboard
  document.querySelectorAll('.nav-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      if (tab.dataset.page === 'dashboard') {
        setTimeout(renderSkillGap, 100);
      }
    });
  });

  // Sync gemini key input
  const geminiInput = document.getElementById('geminiKeyInput');
  if (geminiInput) {
    geminiInput.addEventListener('change', e => {
      if (typeof appState !== 'undefined') { appState.geminiKey = e.target.value.trim(); }
      if (typeof saveState === 'function') saveState();
    });
    if (typeof appState !== 'undefined' && appState.geminiKey) {
      geminiInput.value = appState.geminiKey;
    }
  }

  // Gemini key field visibility
  const provSel = document.getElementById('aiProviderSelect');
  if (provSel) {
    const syncGeminiField = () => {
      const geminiField = document.getElementById('geminiKeyField');
      const openaiField = document.getElementById('openaiKeyField');
      const v = provSel.value;
      if (geminiField) geminiField.style.display = v === 'gemini' ? 'block' : 'none';
      if (openaiField) openaiField.style.display  = v === 'openai' ? 'block' : 'none';
    };
    provSel.addEventListener('change', syncGeminiField);
    syncGeminiField();
  }
}

// Boot after the main app has loaded
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => setTimeout(_featuresBoot, 300));
} else {
  setTimeout(_featuresBoot, 300);
}
