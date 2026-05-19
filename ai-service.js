/**
 * ai-service.js — Production AI Feedback Architecture for IELTS Studio
 *
 * KURULUM (3 adım):
 *   1. Bu dosyayı projeye koy:  ieltsStudio-main/ai-service.js
 *   2. index.html içindeki <script> bloğunun BAŞINA şunu ekle (</script> kapanmadan önce değil, açılış scriptin en üstüne):
 *        // ---> writing-feedback.js içindeki şu fonksiyonları SİL:
 *        //      clampBand, generateLocalFeedback, renderFeedbackUI,
 *        //      fetchOpenAIFeedback, getAIFeedback
 *        //      (Yaklaşık satır 1344–1487 arası)
 *   3. index.html'de </body> kapanmadan hemen önce şunu ekle:
 *        <script src="ai-service.js"></script>
 *
 * ORTAM DEĞİŞKENLERİ (opsiyonel — GitHub Pages / Netlify için):
 *   Eğer API anahtarını kodda gömmek istemiyorsan, bir .env dosyası veya
 *   Netlify/Vercel Environment Variables panelinden yönetebilirsin.
 *   Bu dosyada AI_CONFIG.ANTHROPIC_KEY alanını "" bırakırsan,
 *   kullanıcının Settings panelindeki "API Key" alanından okur.
 *
 * GITHUB'DA ÇALIŞIR MI?
 *   ✅ GitHub Pages: Evet — static HTML, build adımı yok.
 *   ✅ Netlify / Vercel: Evet — drag-drop veya git push yeterli.
 *   ✅ Yerel: npx serve . -p 3456  (mevcut package.json "serve" komutu)
 *   ❌ Doğrudan file:// ile açmak: CORS hatası alırsın (API çağrısı için
 *      localhost veya HTTPS gerekli). npx serve kullan.
 */

// ─── Konfigürasyon ────────────────────────────────────────────────────────────
const AI_CONFIG = {
  // Anthropic API — Claude Sonnet (ücretsiz tier yok, kendi key'ini ekle)
  ANTHROPIC_URL:  'https://api.anthropic.com/v1/messages',
  ANTHROPIC_MODEL: 'claude-sonnet-4-20250514',
  ANTHROPIC_KEY:  '',   // Buraya yazarsan Settings'e gerek yok; boş bırakırsan Settings'ten okur

  // Retry & Rate Limit
  RETRY_ATTEMPTS:    3,
  RETRY_BASE_MS:  1000,   // 1s → 2s → 4s (exponential backoff)
  RATE_LIMIT_MAX:    5,   // dakikada max istek
  RATE_LIMIT_MS: 60000,

  MAX_TOKENS: 900,
};

// ─── Rate Limiter ─────────────────────────────────────────────────────────────
const _rateLimiter = {
  calls: [],
  check() {
    const now = Date.now();
    this.calls = this.calls.filter(t => now - t < AI_CONFIG.RATE_LIMIT_MS);
    if (this.calls.length >= AI_CONFIG.RATE_LIMIT_MAX) {
      const waitMs = AI_CONFIG.RATE_LIMIT_MS - (now - this.calls[0]);
      return { allowed: false, waitMs };
    }
    this.calls.push(now);
    return { allowed: true, waitMs: 0 };
  }
};

// ─── Toast bildirimleri ───────────────────────────────────────────────────────
(function injectToastStyles() {
  if (document.getElementById('ai-toast-styles')) return;
  const s = document.createElement('style');
  s.id = 'ai-toast-styles';
  s.textContent = `
    #ai-toast-container{position:fixed;bottom:24px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;}
    .ai-toast{display:flex;align-items:flex-start;gap:10px;padding:12px 16px;border-radius:12px;font-size:13px;line-height:1.5;max-width:340px;pointer-events:auto;animation:ai-toast-in .25s cubic-bezier(.4,0,.2,1);box-shadow:0 4px 20px rgba(0,0,0,.45);}
    .ai-toast.info   {background:#1e3a5f;border:1px solid #3b82f6;color:rgba(255,255,255,.9);}
    .ai-toast.success{background:#14532d;border:1px solid #22c55e;color:rgba(255,255,255,.9);}
    .ai-toast.warning{background:#451a03;border:1px solid #f59e0b;color:rgba(255,255,255,.9);}
    .ai-toast.error  {background:#450a0a;border:1px solid #ef4444;color:rgba(255,255,255,.9);}
    .ai-toast-icon   {flex-shrink:0;font-size:15px;margin-top:1px;}
    .ai-toast-close  {margin-left:auto;background:none;border:none;color:rgba(255,255,255,.35);cursor:pointer;font-size:15px;padding:0;line-height:1;flex-shrink:0;}
    @keyframes ai-toast-in{from{opacity:0;transform:translateX(20px)}to{opacity:1;transform:translateX(0)}}
  `;
  document.head.appendChild(s);
})();

function _getToastContainer() {
  let c = document.getElementById('ai-toast-container');
  if (!c) { c = document.createElement('div'); c.id = 'ai-toast-container'; document.body.appendChild(c); }
  return c;
}

function showToast(message, type = 'info', durationMs = 4000) {
  const icons = { info: 'ℹ', success: '✓', warning: '⚠', error: '✕' };
  const el = document.createElement('div');
  el.className = `ai-toast ${type}`;
  el.innerHTML = `
    <span class="ai-toast-icon">${icons[type] || 'ℹ'}</span>
    <span>${message}</span>
    <button class="ai-toast-close" onclick="this.parentElement.remove()">×</button>
  `;
  _getToastContainer().appendChild(el);
  setTimeout(() => el.remove(), durationMs);
}

// ─── Yardımcılar ──────────────────────────────────────────────────────────────
function clampBand(x) {
  return Math.max(4, Math.min(9, Math.round(x * 2) / 2));
}

async function _sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function _withRetry(fn, attempts = AI_CONFIG.RETRY_ATTEMPTS) {
  let lastErr;
  for (let i = 0; i < attempts; i++) {
    try { return await fn(); }
    catch (e) {
      lastErr = e;
      if (e.isRateLimit) throw e;          // rate-limit → direkt yükselt
      if (i < attempts - 1) {
        const delay = AI_CONFIG.RETRY_BASE_MS * Math.pow(2, i);
        await _sleep(delay);
      }
    }
  }
  throw lastErr;
}

// ─── Mock / Offline fallback (orijinal generateLocalFeedback mantığı) ─────────
function generateLocalFeedback(text, taskType, minWords) {
  const words       = text.trim().split(/\s+/).filter(Boolean);
  const wordCount   = words.length;
  const lower       = text.toLowerCase();
  const sentences   = text.split(/[.!?]+/).filter(s => s.trim().length > 8);
  const paragraphs  = text.split(/\n\s*\n/).filter(p => p.trim());
  const connectors  = ['furthermore','however','therefore','in contrast','moreover',
    'nevertheless','consequently','on the other hand','in addition','whereas',
    'thus','hence','although','while','because','accordingly','conversely','admittedly','granted'];
  const foundConnectors = connectors.filter(c => lower.includes(c));

  // VOCAB global'inden oku (index.html'de tanımlı)
  const vocab        = (typeof VOCAB !== 'undefined') ? VOCAB : [];
  const academicHits = vocab.filter(v => lower.includes(v.word.toLowerCase()));

  const uniqueRatio  = wordCount ? new Set(words.map(w => w.toLowerCase())).size / wordCount : 0;
  const avgLen       = wordCount / Math.max(1, sentences.length);
  const complex      = (text.match(/\b(which|who|although|whereas|if|when|while|despite|unless)\b/gi) || []).length;

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
    foundConnectors.length ? `You used linking words (${foundConnectors.slice(0,3).join(', ')}), which helps coherence.` : null,
    academicHits.length ? `You included academic vocabulary such as "${academicHits.slice(0,2).map(w => w.word).join('", "')}"` + '.' : null,
    paragraphs.length >= 4 ? 'The essay has a clear multi-paragraph structure.' : null,
  ].filter(Boolean).join(' ') || 'You addressed the task with a complete response.';

  const improvements = [
    wordCount < minWords ? `Increase length to at least ${minWords} words for a stronger Task Achievement score.` : null,
    foundConnectors.length < 2 ? 'Add more discourse markers (e.g. however, furthermore, in contrast).' : null,
    academicHits.length < 2 ? 'Use more Band 7+ vocabulary from the Vocab section in this app.' : null,
    paragraphs.length < 4 && taskType === 'task2' ? 'Use four clear paragraphs: intro, two body paragraphs, conclusion.' : null,
  ].filter(Boolean).join(' ') || 'Keep developing ideas with specific examples and clearer topic sentences.';

  const tip = taskType === 'task1'
    ? 'Start with an overview sentence covering the main trend before giving details.'
    : 'Make your position clear in the introduction and restate it in the conclusion without new ideas.';

  const vocabUpgrade = academicHits.length
    ? academicHits.slice(0, 3).map(w => w.word)
    : ['mitigate', 'substantial', 'facilitate'].filter(w => !lower.includes(w));

  return { ta, cc, lr, gra, overall, strengths, improvements, tip, vocab: vocabUpgrade, _source: 'local' };
}

// ─── Claude API çağrısı ───────────────────────────────────────────────────────
async function _fetchClaudeFeedback(text, words, taskType) {
  // Rate limit kontrolü
  const rl = _rateLimiter.check();
  if (!rl.allowed) {
    const secs = Math.ceil(rl.waitMs / 1000);
    const e = new Error(`Rate limit: dakikada en fazla ${AI_CONFIG.RATE_LIMIT_MAX} istek. ${secs} saniye bekle.`);
    e.isRateLimit = true;
    e.waitMs = rl.waitMs;
    throw e;
  }

  // API key: önce config, yoksa appState (Settings paneli)
  const apiKey = (AI_CONFIG.ANTHROPIC_KEY || (typeof appState !== 'undefined' && appState.claudeKey) || '').trim();
  if (!apiKey) {
    const e = new Error('Claude API key bulunamadı. Settings > API Key alanına ekle.');
    e.isConfigError = true;
    throw e;
  }

  const prompt =
    `You are an expert IELTS examiner. Evaluate this ${taskType === 'task1' ? 'Task 1' : 'Task 2'} essay.\n` +
    `Respond ONLY with valid JSON, no markdown:\n` +
    `{"ta":X,"cc":X,"lr":X,"gra":X,"overall":X,"strengths":"...","improvements":"...","tip":"...","vocab":["w1","w2","w3"]}\n` +
    `X = band 4.0–9.0 in 0.5 steps. Keep text fields 1–2 sentences. vocab = 3 academic upgrade words.\n` +
    `Essay (${words} words):\n${text}`;

  const res = await fetch(AI_CONFIG.ANTHROPIC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model:      AI_CONFIG.ANTHROPIC_MODEL,
      max_tokens: AI_CONFIG.MAX_TOKENS,
      messages:   [{ role: 'user', content: prompt }],
    }),
  });

  if (res.status === 429) {
    const e = new Error('Anthropic API rate limit. Otomatik olarak Smart Coach\'a geçiliyor…');
    e.isRateLimit = true;
    throw e;
  }
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error?.message || `API hatası: HTTP ${res.status}`);
  }

  const data = await res.json();
  const raw  = data.content?.[0]?.text || '';
  const parsed = JSON.parse(raw.replace(/```json|```/g, '').trim());
  return { ...parsed, _source: 'claude' };
}

// ─── Streaming simülasyonu (typing efekti) ───────────────────────────────────
async function _streamIntoElement(el, htmlChunks) {
  for (const chunk of htmlChunks) {
    el.innerHTML = chunk;
    await _sleep(22);
  }
}

// ─── Feedback UI render ───────────────────────────────────────────────────────
function renderFeedbackUI(fb, r, providerLabel, providerClass) {
  const sourceClass = r._source === 'claude' ? 'claude' : (r._source === 'local' ? 'local' : providerClass);
  const srcLabel    = r._source === 'claude' ? '✦ Claude AI' : (r._source === 'local' ? '⚡ Smart Coach' : providerLabel);

  fb.innerHTML = [
    `<div class="feedback-header">`,
    `  <h3>Writing feedback</h3>`,
    `  <span class="ai-tag ${sourceClass}">${srcLabel}</span>`,
    `</div>`,
    `<div class="score-grid">`,
    `  <div class="score-item"><div class="sc-val">${r.ta}</div><div class="sc-lbl">Task Achievement</div></div>`,
    `  <div class="score-item"><div class="sc-val">${r.cc}</div><div class="sc-lbl">Coherence</div></div>`,
    `  <div class="score-item"><div class="sc-val">${r.lr}</div><div class="sc-lbl">Lexical Resource</div></div>`,
    `  <div class="score-item"><div class="sc-val">${r.gra}</div><div class="sc-lbl">Grammar</div></div>`,
    `</div>`,
    `<div class="overall-band">Overall: Band ${r.overall}</div>`,
    `<div class="feedback-text">`,
    `  <p><strong>Strengths:</strong> ${r.strengths}</p>`,
    `  <p><strong>To improve:</strong> ${r.improvements}</p>`,
    `  <p><strong>Examiner tip:</strong> ${r.tip}</p>`,
    r.vocab && r.vocab.length
      ? `<p><strong>Vocabulary upgrade:</strong> Try ${r.vocab.map(v => `<em>${v}</em>`).join(', ')} for greater lexical range.</p>`
      : '',
    `</div>`,
  ].join('');
}

// ─── Ana fonksiyon — index.html'deki getAIFeedback ile birebir aynı imza ──────
async function getAIFeedback(id, min) {
  const area  = document.getElementById('essayArea');
  const text  = area ? area.value.trim() : '';
  const words = text.split(/\s+/).filter(Boolean).length;
  const fb    = document.getElementById('feedback-' + id);
  const t     = (typeof WRITING_TASKS !== 'undefined') ? WRITING_TASKS.find(x => x.id === id) : null;

  if (words < 50) {
    showToast('En az 50 kelime yaz.', 'warning');
    return;
  }

  fb.classList.add('show');
  const provider = (typeof appState !== 'undefined' && appState.aiProvider) ? appState.aiProvider : 'local';

  // ── Loading state ──
  fb.innerHTML = `
    <div class="feedback-header">
      <h3>Writing feedback</h3>
      <span class="ai-tag">${provider === 'claude' ? '✦ Claude AI' : provider === 'openai' ? 'ChatGPT' : '⚡ Smart Coach'}</span>
    </div>
    <div style="display:flex;align-items:center;gap:12px;color:var(--muted);font-size:14px;padding:8px 0">
      Essay analiz ediliyor&nbsp;
      <div class="loading-dots"><span></span><span></span><span></span></div>
    </div>
  `;

  let r;

  try {
    if (provider === 'claude') {
      // ── Claude API + retry ──
      r = await _withRetry(() => _fetchClaudeFeedback(text, words, t ? t.type : 'task2'));
      showToast('Claude AI feedback hazır!', 'success');

    } else if (provider === 'openai') {
      // ── OpenAI (mevcut mantığı koru) ──
      r = await _fetchOpenAICompat(text, words, t ? t.type : 'task2');
      r._source = 'openai';
      showToast('ChatGPT feedback hazır!', 'success');

    } else {
      // ── Smart Coach (offline) ──
      await _sleep(650);   // streaming simülasyonu
      r = generateLocalFeedback(text, t ? t.type : 'task2', min);
      showToast('Smart Coach feedback hazır!', 'success');
    }

    renderFeedbackUI(fb, r, provider === 'openai' ? 'ChatGPT' : 'Smart Coach', provider);

    // Mevcut appState güncellemeleri (index.html ile entegrasyon)
    if (typeof appState !== 'undefined' && t) {
      if (!appState.essaysDone.includes(id)) appState.essaysDone.push(id);
      appState.bandHistory.push({ ts: Date.now(), band: Number(r.overall), taskId: id, title: t.title });
      appState.studyMins += t.timeLimit || 30;
      if (typeof logActivity === 'function') logActivity('writing', t.title, { band: r.overall });
      if (typeof saveState   === 'function') saveState();
      if (typeof renderHomeStats === 'function') renderHomeStats();
      if (area) localStorage.setItem('ielts_essay_' + id, area.value);
    }

  } catch (e) {

    // ── Rate limit → otomatik fallback ──
    if (e.isRateLimit) {
      const secs = Math.ceil((e.waitMs || 60000) / 1000);
      showToast(`Rate limit aktif (${secs}s). Smart Coach'a geçiliyor…`, 'warning', 5000);
      await _sleep(1500);
      await _sleep(650);
      r = generateLocalFeedback(text, t ? t.type : 'task2', min);
      r._source = 'local';
      renderFeedbackUI(fb, r, 'Smart Coach', 'local');
      showToast('Smart Coach fallback tamamlandı.', 'info');
      return;
    }

    // ── Config hatası (key yok) ──
    if (e.isConfigError) {
      showToast(e.message, 'warning');
      fb.innerHTML = `
        <div class="feedback-header"><h3>Writing feedback</h3></div>
        <div style="color:var(--muted);font-size:14px;padding:8px 0;line-height:1.7">
          ${e.message}
          <br><br>
          <button type="button" class="btn-secondary"
            onclick="if(typeof appState!=='undefined'){appState.aiProvider='local';if(typeof saveState!=='undefined')saveState();}getAIFeedback('${id}',${min})">
            ⚡ Smart Coach ile devam et
          </button>
        </div>
      `;
      return;
    }

    // ── Genel API hatası → retry sonrası fallback ──
    showToast(`API hatası: ${e.message}. Smart Coach'a geçiliyor…`, 'error');
    await _sleep(800);
    r = generateLocalFeedback(text, t ? t.type : 'task2', min);
    r._source = 'local';
    renderFeedbackUI(fb, r, 'Smart Coach', 'local');
    showToast('Fallback tamamlandı.', 'info');
  }
}

// ─── OpenAI uyumlu yardımcı (mevcut fetchOpenAIFeedback mantığı) ──────────────
async function _fetchOpenAICompat(text, words, taskType) {
  const key = (typeof appState !== 'undefined' ? appState.openaiKey || '' : '').trim();
  if (!key) throw Object.assign(
    new Error('OpenAI API key gerekli. Settings paneline ekle.'),
    { isConfigError: true }
  );
  const prompt =
    `You are an expert IELTS examiner. Evaluate this ${taskType === 'task1' ? 'Task 1' : 'Task 2'} essay. ` +
    `Respond ONLY with valid JSON, no markdown:\n` +
    `{"ta":X,"cc":X,"lr":X,"gra":X,"overall":X,"strengths":"...","improvements":"...","tip":"...","vocab":["w1","w2","w3"]}\n` +
    `X = band 4.0-9.0 in 0.5 steps. Essay (${words} words):\n${text}`;
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
    body: JSON.stringify({ model: 'gpt-4o-mini', messages: [{ role: 'user', content: prompt }], max_tokens: 900, temperature: 0.4 }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error?.message || 'OpenAI request failed');
  const raw = data.choices?.[0]?.message?.content || '';
  return JSON.parse(raw.replace(/```json|```/g, '').trim());
}

// ─── Settings paneli: "Claude" seçeneğini ekle (opsiyonel) ───────────────────
// index.html'deki aiProviderSelect select elementine yeni seçenek enjekte et
(function patchSettingsPanel() {
  function tryPatch() {
    const select = document.getElementById('aiProviderSelect');
    if (!select) return;
    if (select.querySelector('option[value="claude"]')) return; // zaten var

    const opt = document.createElement('option');
    opt.value = 'claude';
    opt.textContent = 'Claude AI (Anthropic — en iyi)';
    select.appendChild(opt);

    // Claude key alanı — yoksa oluştur
    const keyField = document.getElementById('openaiKeyField');
    if (keyField && !document.getElementById('claudeKeyField')) {
      const wrap = document.createElement('div');
      wrap.className = 'sp-field';
      wrap.id = 'claudeKeyField';
      wrap.style.display = 'none';
      wrap.innerHTML = `
        <label for="claudeKeyInput">Anthropic API key</label>
        <input type="password" id="claudeKeyInput" placeholder="sk-ant-..." autocomplete="off">
        <p class="sp-hint">
          Key'ini <a href="https://console.anthropic.com/keys" target="_blank" rel="noopener">console.anthropic.com</a> adresinden al.
        </p>
      `;
      keyField.parentNode.insertBefore(wrap, keyField.nextSibling);

      document.getElementById('claudeKeyInput')?.addEventListener('change', e => {
        if (typeof appState !== 'undefined') {
          appState.claudeKey = e.target.value.trim();
          if (typeof saveState === 'function') saveState();
        }
      });
    }

    // Provider değişince hangi key alanı görünsün
    select.addEventListener('change', () => {
      const v = select.value;
      if (document.getElementById('openaiKeyField'))
        document.getElementById('openaiKeyField').style.display  = v === 'openai'  ? 'block' : 'none';
      if (document.getElementById('claudeKeyField'))
        document.getElementById('claudeKeyField').style.display  = v === 'claude'  ? 'block' : 'none';
    });
  }

  // DOM hazır olunca veya hemen dene
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', tryPatch);
  else setTimeout(tryPatch, 500); // bootApp()'in bitmesini bekle
})();
