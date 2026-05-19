/**
 * IELTS Studio — Essay Session Management + Toast System
 * ========================================================
 * Provides:
 *  - Isolated essay attempts (no state leaks between evaluations)
 *  - Start New Attempt / Clear Essay / Reset Evaluation actions
 *  - Toast notification manager (success, error, warning, info)
 *  - Loading-state orchestration
 *  - Fresh AI context for every submission
 */

/* ─────────────────────────────────────────────────────────────
   1.  TOAST MANAGER
───────────────────────────────────────────────────────────── */
const Toast = (() => {
  let _container = null;
  let _idCounter  = 0;
  const _timers   = new Map();

  function _ensureContainer() {
    if (_container && document.body.contains(_container)) return _container;
    _container = document.createElement('div');
    _container.id = 'toast-container';
    _container.setAttribute('aria-live', 'polite');
    _container.setAttribute('aria-atomic', 'false');
    document.body.appendChild(_container);
    return _container;
  }

  /**
   * Show a toast notification.
   * @param {string} message      - text content
   * @param {'success'|'error'|'warning'|'info'} type
   * @param {number} duration     - ms before auto-dismiss (0 = manual only)
   * @returns {string}            toastId
   */
  function show(message, type = 'info', duration = 3500) {
    const container = _ensureContainer();
    const id   = `toast-${++_idCounter}`;
    const icon = { success: '✓', error: '✕', warning: '⚠', info: 'ℹ' }[type] || 'ℹ';

    const el = document.createElement('div');
    el.className = `toast toast-${type}`;
    el.id = id;
    el.setAttribute('role', 'alert');
    el.innerHTML = `
      <span class="toast-icon">${icon}</span>
      <span class="toast-msg">${_esc(message)}</span>
      <button class="toast-close" aria-label="Dismiss" onclick="Toast.dismiss('${id}')">×</button>
    `;

    container.appendChild(el);
    // Trigger enter animation
    requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('toast-show')); });

    if (duration > 0) {
      const timer = setTimeout(() => dismiss(id), duration);
      _timers.set(id, timer);
    }
    return id;
  }

  function dismiss(id) {
    const el = document.getElementById(id);
    if (!el) return;
    el.classList.remove('toast-show');
    el.classList.add('toast-hide');
    clearTimeout(_timers.get(id));
    _timers.delete(id);
    el.addEventListener('transitionend', () => el.remove(), { once: true });
    // Safety removal in case transition doesn't fire
    setTimeout(() => el.remove(), 600);
  }

  function dismissAll() {
    document.querySelectorAll('.toast').forEach(el => dismiss(el.id));
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { show, dismiss, dismissAll };
})();

window.Toast = Toast;


/* ─────────────────────────────────────────────────────────────
   2.  ESSAY SESSION MANAGER
───────────────────────────────────────────────────────────── */
const EssaySession = (() => {
  // Map: taskId → { attemptNumber, sessionId, startedAt, submitted }
  const _sessions = new Map();

  function _makeSessionId() {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Get or create a session for a task.
   * @param {string} taskId
   */
  function getSession(taskId) {
    if (!_sessions.has(taskId)) {
      _sessions.set(taskId, {
        attemptNumber: 1,
        sessionId:     _makeSessionId(),
        startedAt:     Date.now(),
        submitted:     false,
      });
    }
    return _sessions.get(taskId);
  }

  /**
   * Increment attempt counter and generate a fresh session context.
   * Clears localStorage draft, clears textarea, hides feedback panel.
   * @param {string} taskId
   * @param {number} minWords
   */
  function startNewAttempt(taskId, minWords) {
    const current = getSession(taskId);
    const nextNum  = current.attemptNumber + 1;

    // Wipe per-task localStorage draft so it doesn't bleed into next attempt
    localStorage.removeItem(`ielts_essay_${taskId}`);

    // Fresh session object
    _sessions.set(taskId, {
      attemptNumber: nextNum,
      sessionId:     _makeSessionId(),
      startedAt:     Date.now(),
      submitted:     false,
    });

    // Clear textarea
    _clearTextarea(taskId, minWords);

    // Hide + wipe feedback box
    _resetFeedbackBox(taskId);

    // Update session badge
    _updateBadge(taskId);

    Toast.show(`↺ New attempt started — Attempt #${nextNum}`, 'success', 2500);

    // Abort any in-flight AI request for this task
    if (typeof AIService !== 'undefined') AIService.abort();
  }

  /**
   * Clear only the essay text, keep session & attempt number intact.
   * @param {string} taskId
   * @param {number} minWords
   */
  function clearEssay(taskId, minWords) {
    localStorage.removeItem(`ielts_essay_${taskId}`);
    _clearTextarea(taskId, minWords);
    Toast.show('🗑 Essay cleared.', 'info', 2000);
  }

  /**
   * Hide feedback panel and reset evaluation state,
   * without touching the essay text or attempt counter.
   * @param {string} taskId
   */
  function resetEvaluation(taskId) {
    const session = getSession(taskId);
    session.submitted = false;
    _resetFeedbackBox(taskId);
    // Also reset the fresh-session flag so next evaluation is context-clean
    session.sessionId = _makeSessionId();
    Toast.show('✕ Score reset — you can re-submit for fresh feedback.', 'info', 2500);
    if (typeof AIService !== 'undefined') AIService.abort();
  }

  /**
   * Mark this session as submitted (called after successful evaluation).
   * @param {string} taskId
   */
  function markSubmitted(taskId) {
    const s = getSession(taskId);
    s.submitted = true;
    s.submittedAt = Date.now();
  }

  /** Returns the sessionId for the current attempt — used to bust AI context cache. */
  function currentSessionId(taskId) {
    return getSession(taskId).sessionId;
  }

  // ── DOM helpers ──────────────────────────────────────────────

  function _clearTextarea(taskId, minWords) {
    const area = document.getElementById('essayArea');
    if (area) { area.value = ''; area.focus(); }
    const wc = document.getElementById(`wc-${taskId}`);
    if (wc) { wc.textContent = '0 words'; wc.className = 'word-counter short'; }
    if (typeof countWords === 'function') countWords(taskId, minWords);
  }

  function _resetFeedbackBox(taskId) {
    const fb = document.getElementById(`feedback-${taskId}`);
    if (!fb) return;
    fb.classList.remove('show', 'fb-loading', 'fb-streaming', 'fb-error');
    // Fade out smoothly
    fb.style.opacity = '0';
    fb.style.transition = 'opacity 0.25s ease';
    setTimeout(() => {
      fb.innerHTML = '';
      fb.style.opacity = '';
      fb.style.transition = '';
    }, 260);
  }

  function _updateBadge(taskId) {
    const badge = document.getElementById(`session-badge-${taskId}`);
    const ts    = document.getElementById(`session-ts-${taskId}`);
    const s     = getSession(taskId);
    if (badge) badge.textContent = `Attempt #${s.attemptNumber}`;
    if (ts)    ts.textContent    = _formatTime(s.startedAt);
  }

  function _formatTime(ts) {
    return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  return { getSession, startNewAttempt, clearEssay, resetEvaluation, markSubmitted, currentSessionId };
})();

window.EssaySession = EssaySession;

// Expose helpers for inline onclick handlers
window.startNewAttempt  = (id, min) => EssaySession.startNewAttempt(id, min);
window.clearEssay       = (id, min) => EssaySession.clearEssay(id, min);
window.resetEvaluation  = (id)      => EssaySession.resetEvaluation(id);


/* ─────────────────────────────────────────────────────────────
   3.  LOADING STATE MANAGER
───────────────────────────────────────────────────────────── */
const LoadingState = (() => {
  const _phases = {
    'validating':      { label: 'Validating submission…',    pct: 15 },
    'scoring':         { label: 'Scoring with examiner AI…', pct: 40 },
    'contacting-api':  { label: 'Contacting OpenAI…',        pct: 35 },
    'merging':         { label: 'Applying strict caps…',     pct: 75 },
    'streaming':       { label: 'Streaming feedback…',       pct: 90 },
    'done':            { label: 'Complete',                  pct: 100 },
  };

  function show(feedbackEl, providerLabel) {
    feedbackEl.classList.add('show', 'fb-loading');
    feedbackEl.innerHTML = `
      <div class="feedback-header">
        <h3>Writing feedback</h3>
        <span class="ai-tag ai-tag-loading">${_esc(providerLabel)}</span>
      </div>
      <div class="loading-state">
        <div class="loading-progress-track">
          <div class="loading-progress-bar" id="ld-bar" style="width:0%"></div>
        </div>
        <div class="loading-phase" id="ld-phase">Preparing…</div>
        <div class="loading-dots-row">
          <div class="loading-dots"><span></span><span></span><span></span></div>
        </div>
        <p class="loading-never-blank">Analysing your essay — this usually takes a few seconds.</p>
      </div>
    `;
  }

  function update(phase) {
    const info = _phases[phase];
    if (!info) return;
    const bar   = document.getElementById('ld-bar');
    const label = document.getElementById('ld-phase');
    if (bar)   bar.style.width   = `${info.pct}%`;
    if (label) label.textContent = info.label;
  }

  function showError(feedbackEl, message, retryFn) {
    feedbackEl.classList.remove('fb-loading');
    feedbackEl.classList.add('fb-error', 'show');
    feedbackEl.innerHTML = `
      <div class="feedback-header">
        <h3>Writing feedback</h3>
        <span class="ai-tag ai-tag-error">Error</span>
      </div>
      <div class="fb-error-body">
        <div class="fb-error-icon">⚠</div>
        <p class="fb-error-msg">${_esc(message)}</p>
        <div class="fb-error-actions">
          ${retryFn ? `<button class="btn-primary" id="fb-retry-btn">Retry</button>` : ''}
          <button class="btn-secondary" id="fb-offline-btn">Use Offline Examiner</button>
        </div>
      </div>
    `;
    if (retryFn)  document.getElementById('fb-retry-btn')?.addEventListener('click', retryFn);
    document.getElementById('fb-offline-btn')?.addEventListener('click', () => {
      if (typeof appState !== 'undefined') { appState.aiProvider = 'local'; }
      if (typeof saveState === 'function') saveState();
      retryFn?.();
    });
  }

  function _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  return { show, update, showError };
})();

window.LoadingState = LoadingState;


/* ─────────────────────────────────────────────────────────────
   4.  PRODUCTION getAIFeedback — overrides the one in index.html
───────────────────────────────────────────────────────────── */

/**
 * Drop-in replacement for the inline getAIFeedback.
 * Adds: session isolation, loading state, streaming reveal, toasts, retry.
 */
async function getAIFeedback(id, min) {
  const area = document.getElementById('essayArea');
  const text = area ? area.value.trim() : '';
  const words = text.split(/\s+/).filter(Boolean).length;
  const fb = document.getElementById(`feedback-${id}`);
  const t  = (typeof WRITING_TASKS !== 'undefined') ? WRITING_TASKS.find(x => x.id === id) : null;

  // ── Guard: minimum word count ────────────────────────────────
  if (words < 50) {
    Toast.show('✏️ Please write at least 50 words before requesting feedback.', 'warning', 3000);
    area?.focus();
    return;
  }

  if (!fb || !t) {
    Toast.show('Something went wrong — please refresh the page.', 'error', 4000);
    return;
  }

  // ── Guard: already submitted this session? ───────────────────
  const session  = EssaySession.getSession(id);
  const provider = (typeof appState !== 'undefined' ? appState.aiProvider : null) || 'local';
  const label    = provider === 'openai' ? 'ChatGPT (strict)' : 'Strict examiner';

  // ── Show loading UI immediately (never blank screen) ─────────
  LoadingState.show(fb, label);

  const doEvaluate = async () => {
    LoadingState.update('validating');

    try {
      const ruleResult = (typeof generateLocalFeedback === 'function')
        ? generateLocalFeedback(text, t.type, min, t.prompt)
        : null;

      if (!ruleResult) throw new Error('Local evaluator not loaded.');

      const { result, source, isMock } = await AIService.evaluate({
        text, words,
        taskType:   t.type,
        prompt:     t.prompt,
        ruleResult,
        provider,
        sessionId:  EssaySession.currentSessionId(id),
        onProgress: phase => LoadingState.update(phase),
      });

      LoadingState.update('streaming');

      // Determine display label
      const displayLabel = isMock
        ? 'Offline fallback'
        : source === 'openai' ? 'ChatGPT (strict)'
        : source === 'local-validation-gate' ? 'Validation gate'
        : 'Strict examiner';
      const displayCls   = source === 'openai' ? 'openai' : 'local';

      // Remove loading classes before rendering
      fb.classList.remove('fb-loading');

      // Streaming reveal
      if (typeof renderFeedbackUI === 'function') {
        await AIService.streamReveal(fb, result, renderFeedbackUI, displayLabel, displayCls);
      }

      // ── Persist results to appState ─────────────────────────
      EssaySession.markSubmitted(id);

      if (typeof appState !== 'undefined') {
        if (!appState.essaysDone.includes(id)) appState.essaysDone.push(id);
        appState.bandHistory.push({
          ts:       Date.now(),
          band:     Number(result.overall),
          taskId:   id,
          title:    t.title,
          attempt:  session.attemptNumber,
          sessionId: session.sessionId,
        });
        appState.studyMins += t.timeLimit || 30;
      }

      if (typeof logActivity   === 'function') logActivity('writing', t.title, { band: result.overall });
      if (typeof saveState     === 'function') saveState();
      if (typeof renderHomeStats === 'function') renderHomeStats();
      if (area) localStorage.setItem(`ielts_essay_${id}`, area.value);

      // ── Success toast ───────────────────────────────────────
      const bandNum = Number(result.overall);
      const emoji   = bandNum >= 7 ? '🏆' : bandNum >= 6 ? '✅' : '📝';
      Toast.show(`${emoji} Band ${result.overall} — ${t.title}`, 'success', 3500);
      if (isMock) Toast.show('ℹ️ Offline evaluation used — connect to OpenAI for AI-powered feedback.', 'info', 5000);

    } catch (err) {
      if (err.name === 'AbortError') {
        // User cancelled — restore a neutral state
        fb.classList.remove('fb-loading', 'show');
        fb.innerHTML = '';
        return;
      }

      // Graceful error display
      const msg = err.message || 'An unexpected error occurred.';
      LoadingState.showError(fb, msg, doEvaluate);
      Toast.show(`✕ Evaluation failed: ${msg.slice(0, 80)}`, 'error', 5000);
    }
  };

  await doEvaluate();
}

// Override the globally-scoped function defined in index.html
window.getAIFeedback = getAIFeedback;
