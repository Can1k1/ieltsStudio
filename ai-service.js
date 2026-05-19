/**
 * IELTS Studio — Production-grade AI Service
 * ============================================
 * Modular AI evaluation service with:
 *  - Retry mechanism (exponential back-off + jitter)
 *  - Rate-limit detection & cooldown
 *  - Streaming response simulation (token-by-token reveal)
 *  - Fallback mock responses when API fails
 *  - Environment variable / settings support for API keys
 *  - Fully async/await, no dangling promises
 */

/* ─────────────────────────────────────────────────────────────
   1.  CONFIGURATION
───────────────────────────────────────────────────────────── */
const AIConfig = (() => {
  const defaults = {
    openaiEndpoint: 'https://api.openai.com/v1/chat/completions',
    openaiModel:    'gpt-4o-mini',
    maxRetries:     3,
    baseDelayMs:    800,
    maxDelayMs:     12_000,
    rateLimitWindow: 60_000,   // 1 minute
    rateLimitMax:    10,       // max requests per window
    streamChunkMs:   18,       // ms between streaming tokens
    fallbackEnabled: true,
  };

  /** Read API key from: (1) appState, (2) env meta-tag, (3) empty */
  function getKey() {
    if (typeof appState !== 'undefined' && appState.openaiKey) return appState.openaiKey.trim();
    const meta = document.querySelector('meta[name="openai-key"]');
    if (meta) return meta.content.trim();
    return '';
  }

  return { ...defaults, getKey };
})();


/* ─────────────────────────────────────────────────────────────
   2.  RATE LIMITER
───────────────────────────────────────────────────────────── */
const RateLimiter = (() => {
  const timestamps = [];

  function isAllowed() {
    const now = Date.now();
    // Purge timestamps older than the window
    while (timestamps.length && now - timestamps[0] > AIConfig.rateLimitWindow) {
      timestamps.shift();
    }
    return timestamps.length < AIConfig.rateLimitMax;
  }

  function record() { timestamps.push(Date.now()); }

  /** Returns milliseconds until the oldest request expires — 0 if allowed now */
  function msUntilAllowed() {
    if (isAllowed()) return 0;
    const oldest = timestamps[0];
    return Math.max(0, AIConfig.rateLimitWindow - (Date.now() - oldest));
  }

  return { isAllowed, record, msUntilAllowed };
})();


/* ─────────────────────────────────────────────────────────────
   3.  RETRY HANDLER  (exponential back-off + full jitter)
───────────────────────────────────────────────────────────── */
async function withRetry(fn, { maxRetries = AIConfig.maxRetries, baseDelay = AIConfig.baseDelayMs, signal } = {}) {
  let attempt = 0;
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      const isRateLimit = err.status === 429 || (err.message || '').includes('429');
      const retryAfter  = err.retryAfter || null;

      if (attempt > maxRetries) throw err;
      if (signal?.aborted)      throw new DOMException('Aborted', 'AbortError');

      // Respect Retry-After header when server provides it
      const serverDelay = retryAfter ? retryAfter * 1000 : 0;
      // Full-jitter exponential: random(0 … min(cap, base * 2^attempt))
      const expDelay    = Math.min(AIConfig.maxDelayMs, baseDelay * Math.pow(2, attempt - 1));
      const jitter      = Math.random() * expDelay;
      const waitMs      = Math.max(serverDelay, jitter);

      const label = isRateLimit ? `rate-limited — retrying in ${(waitMs / 1000).toFixed(1)}s` : `error (attempt ${attempt}/${maxRetries}) — retrying in ${(waitMs / 1000).toFixed(1)}s`;
      console.warn(`[AIService] ${label}`, err.message || err);

      window.Toast?.show(`⏳ ${isRateLimit ? 'Rate limited' : 'Request failed'} — retrying (${attempt}/${maxRetries})…`, 'warning', waitMs + 500);
      await sleep(waitMs);
    }
  }
}


/* ─────────────────────────────────────────────────────────────
   4.  STREAM SIMULATOR  (typing-effect reveal)
───────────────────────────────────────────────────────────── */

/**
 * Progressively reveals `feedbackObj` text fields into `container`
 * using a fake streaming animation while the real result is already available.
 *
 * @param {HTMLElement} container  - target DOM element
 * @param {object}      result     - final feedback object (bands, text, etc.)
 * @param {Function}    renderFn   - renderFeedbackUI(container, result, label, cls)
 * @param {string}      label      - AI provider label
 * @param {string}      cls        - CSS class for AI badge
 */
async function streamReveal(container, result, renderFn, label, cls) {
  // Phase 1: score grid animates in immediately
  renderFn(container, result, label, cls);

  // Phase 2: highlight the feedback-text section with a "typing" shimmer
  const textEl = container.querySelector('.feedback-text');
  if (!textEl) return;

  // Collect all text nodes inside feedback-text
  const walker = document.createTreeWalker(textEl, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);

  // Store originals, blank them
  const originals = textNodes.map(n => n.nodeValue);
  textNodes.forEach(n => { n.nodeValue = ''; });

  textEl.classList.add('streaming');

  for (let i = 0; i < textNodes.length; i++) {
    const full = originals[i];
    let revealed = '';
    // Reveal token by token (word-level is smooth enough)
    const tokens = full.split(/(\s+)/);
    for (const tok of tokens) {
      revealed += tok;
      textNodes[i].nodeValue = revealed;
      await sleep(AIConfig.streamChunkMs + Math.random() * 10);
    }
  }

  textEl.classList.remove('streaming');
  container.querySelector('.criteria-detail')?.classList.add('stream-in');
}


/* ─────────────────────────────────────────────────────────────
   5.  MOCK / FALLBACK RESPONSE GENERATOR
───────────────────────────────────────────────────────────── */
function generateMockFallback(ruleResult, reason = 'API unavailable') {
  // Use the local rule-based result as the canonical answer, but decorate it
  const mock = { ...ruleResult };
  mock._isMock   = true;
  mock._mockReason = reason;
  // Slightly soften the disclaimer to explain we're offline
  mock.disclaimer = `[Offline mode — ${reason}] ${mock.disclaimer || ''}`.trim();
  return mock;
}


/* ─────────────────────────────────────────────────────────────
   6.  OPENAI FETCH  (production-grade, with full error surface)
───────────────────────────────────────────────────────────── */
async function _openAIRequest(text, words, taskType, prompt, ruleBaseline, signal) {
  const key = AIConfig.getKey();
  if (!key) throw Object.assign(new Error('No OpenAI API key — add it in Settings.'), { code: 'NO_KEY' });

  const systemPrompt = [
    'You are a strict certified IELTS Writing examiner.',
    'Use official IELTS public band descriptors. Be conservative; do NOT inflate scores.',
    'If coherence is weak, vocabulary repetitive, grammar faulty, or task response shallow, NO criterion may be Band 7+.',
    'When uncertain between two bands, choose the LOWER band.',
    'Prioritise accuracy over encouragement. List why marks were lost before any praise.',
  ].join(' ');

  const userPrompt = [
    `Evaluate this ${taskType === 'task1' ? 'Task 1' : 'Task 2'} essay.`,
    `QUESTION: ${prompt || '(not provided)'}`,
    `Rule-based caps (do not exceed): TA≤${ruleBaseline.ta} CC≤${ruleBaseline.cc} LR≤${ruleBaseline.lr} GRA≤${ruleBaseline.gra} overall≤${ruleBaseline.overall}`,
    `Flags: ${(ruleBaseline.flags || []).join('; ')}`,
    'Respond ONLY with valid JSON:',
    '{"ta":n,"cc":n,"lr":n,"gra":n,"overall":n,"strengths":"...","improvements":"...","weaknesses":"...","pointsLost":["..."],"tip":"...","vocab":["w1","w2"]}',
    `Bands 4.0–9.0 in 0.5 steps. Essay (${words} words):\n${text}`,
  ].join('\n');

  const res = await fetch(AIConfig.openaiEndpoint, {
    method: 'POST',
    signal,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model:       AIConfig.openaiModel,
      messages:    [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
      max_tokens:  1400,
      temperature: 0.15,
    }),
  });

  // Surface HTTP errors as structured exceptions
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg  = body?.error?.message || `OpenAI HTTP ${res.status}`;
    const retryAfter = res.headers.get('Retry-After') ? Number(res.headers.get('Retry-After')) : null;
    const err = Object.assign(new Error(msg), { status: res.status, retryAfter, code: res.status === 429 ? 'RATE_LIMIT' : 'API_ERROR' });
    throw err;
  }

  const data = await res.json();
  const raw  = data.choices?.[0]?.message?.content || '';

  let llm;
  try {
    llm = JSON.parse(raw.replace(/```json|```/g, '').trim());
  } catch {
    throw Object.assign(new Error('OpenAI returned non-JSON response.'), { code: 'PARSE_ERROR', raw });
  }

  return llm;
}


/* ─────────────────────────────────────────────────────────────
   7.  MAIN AI SERVICE  (public API)
───────────────────────────────────────────────────────────── */
const AIService = {
  /** Active AbortController so the user can cancel mid-request */
  _controller: null,

  /**
   * Abort any in-flight request immediately.
   */
  abort() {
    this._controller?.abort();
    this._controller = null;
  },

  /**
   * Primary entry point — evaluates essay text.
   *
   * @param {object} opts
   *   text        {string}   essay content
   *   words       {number}   word count
   *   taskType    {string}   'task1' | 'task2'
   *   prompt      {string}   exam question
   *   ruleResult  {object}   already-computed local baseline
   *   provider    {string}   'openai' | 'local'
   *   sessionId   {string}   unique per-attempt ID (for cache isolation)
   *   onProgress  {Function} (phase: string) => void
   *
   * @returns {Promise<{result: object, source: string, isMock: boolean}>}
   */
  async evaluate({ text, words, taskType, prompt, ruleResult, provider = 'local', sessionId, onProgress } = {}) {
    this.abort(); // Cancel any previous in-flight request
    this._controller = new AbortController();
    const { signal } = this._controller;

    onProgress?.('validating');

    // Always run the local evaluation first — it's our rule-based floor
    if (ruleResult.validationBlocked) {
      onProgress?.('done');
      return { result: ruleResult, source: 'local-validation-gate', isMock: false };
    }

    // Local-only mode
    if (provider !== 'openai') {
      onProgress?.('scoring');
      await sleep(500); // micro-delay for perceived effort
      onProgress?.('done');
      return { result: ruleResult, source: 'local', isMock: false };
    }

    // Rate-limit check (client-side guard)
    const wait = RateLimiter.msUntilAllowed();
    if (wait > 0) {
      const secs = Math.ceil(wait / 1000);
      window.Toast?.show(`🚦 Rate limit reached — please wait ${secs}s before submitting again.`, 'error', wait + 500);
      throw Object.assign(new Error(`Client rate limit — please wait ${secs} seconds.`), { code: 'CLIENT_RATE_LIMIT' });
    }

    // OpenAI path with retry + fallback
    onProgress?.('contacting-api');
    RateLimiter.record();

    try {
      const llm = await withRetry(
        () => _openAIRequest(text, words, taskType, prompt, ruleResult, signal),
        { signal }
      );

      if (signal.aborted) throw new DOMException('Aborted', 'AbortError');

      onProgress?.('merging');
      const merged = _applyStrictCaps(llm, ruleResult);
      merged.validation = merged.validation || ruleResult.validation;

      onProgress?.('done');
      return { result: merged, source: 'openai', isMock: false };

    } catch (err) {
      if (err.name === 'AbortError') throw err; // Re-throw, don't show fallback

      // Fallback to local rule result
      if (AIConfig.fallbackEnabled) {
        const reason = _errorReason(err);
        console.warn('[AIService] Falling back to local evaluation:', reason);
        window.Toast?.show(`⚠️ AI service unavailable (${reason}) — using offline evaluation.`, 'warning', 5000);
        onProgress?.('done');
        return { result: generateMockFallback(ruleResult, reason), source: 'fallback', isMock: true };
      }

      throw err;
    }
  },

  /** Expose stream reveal so the UI can call it */
  streamReveal,
};


/* ─────────────────────────────────────────────────────────────
   8.  HELPERS
───────────────────────────────────────────────────────────── */
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function _errorReason(err) {
  if (err.code === 'NO_KEY')           return 'no API key';
  if (err.code === 'RATE_LIMIT')       return 'OpenAI rate limit (429)';
  if (err.code === 'PARSE_ERROR')      return 'invalid API response';
  if (err.code === 'CLIENT_RATE_LIMIT') return 'too many requests';
  if (err.status >= 500)               return `server error (${err.status})`;
  if (err.status === 401)              return 'invalid API key';
  if (err.message?.includes('Failed to fetch')) return 'network offline';
  return err.message?.slice(0, 60) || 'unknown';
}

function _applyStrictCaps(llm, rule) {
  const cap = (a, b) => Math.min(Number(a) || 9, Number(b) || 9);
  const merged = {
    ta: cap(llm.ta, rule.ta),
    cc: cap(llm.cc, rule.cc),
    lr: cap(llm.lr, rule.lr),
    gra: cap(llm.gra, rule.gra),
    strengths:    llm.strengths   || rule.strengths,
    improvements: [rule.improvements, llm.improvements].filter(Boolean).join(' ').trim(),
    weaknesses:   rule.weaknesses || llm.weaknesses,
    pointsLost:   [...(rule.pointsLost || []), ...(Array.isArray(llm.pointsLost) ? llm.pointsLost : [])].slice(0, 8),
    tip:          llm.tip  || rule.tip,
    vocab:        llm.vocab || rule.vocab,
    criteria:     rule.criteria,
    flags:        rule.flags,
    flagMap:      rule.flagMap,
    disclaimer:   rule.disclaimer,
  };
  merged.overall = (typeof overallBandConservative === 'function')
    ? overallBandConservative(merged.ta, merged.cc, merged.lr, merged.gra)
    : ((merged.ta + merged.cc + merged.lr + merged.gra) / 4).toFixed(1);

  if (rule.validationBlocked)                          merged.overall = rule.overall;
  else if (rule.flagMap && rule.flagMap.offTopic)       merged.overall = Math.min(merged.overall, 5.0);
  else if (rule.flags && rule.flags.length)             merged.overall = Math.min(merged.overall, 6.5);

  merged.validation        = rule.validation;
  merged.validationBlocked = rule.validationBlocked;
  return merged;
}

// Expose globally
window.AIService   = AIService;
window.AIConfig    = AIConfig;
window.RateLimiter = RateLimiter;
