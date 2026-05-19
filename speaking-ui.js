/**
 * Speaking practice UI — topic sets, Part 2 prep + speak timers, Part 3 discussion.
 */
let spTimer = null;
let spRunning = false;
let spTimerSlot = 'main';
let spCurrentSet = null;
let spActivePart = 'part2';

let spTimerPrepTotal = 60;
let spTimerSpeakTotal = 120;
let spTimerPrepSecs = 60;
let spTimerSpeakSecs = 120;
let spTimerMainTotal = 270;
let spTimerMainSecs = 270;

function renderSpeakingList() {
  const grid = document.getElementById('speakingGrid');
  if (!grid || typeof SPEAKING_TOPIC_SETS === 'undefined') return;
  grid.innerHTML = SPEAKING_TOPIC_SETS.map((set) => `
    <div class="speaking-card" onclick="openSpeakingSet('${set.id}')">
      <div class="sp-badge-row">
        <span class="sp-badge new">NEW</span>
        <span class="sp-badge num">Topic ${set.number}</span>
        <span class="sp-badge season">${set.season}</span>
      </div>
      <div class="sp-theme">${set.theme}</div>
      <div class="sp-parts">Part 2: ${set.part2.subtitle}<br>Part 3: ${set.part3.subtitle}</div>
      <div class="sp-time">⏱ Part 2 + Part 3 practice</div>
    </div>
  `).join('');
}

function openSpeakingSet(setId) {
  const set = SPEAKING_TOPIC_SETS.find((s) => s.id === setId);
  if (!set) return;
  spCurrentSet = set;
  spActivePart = 'part2';
  stopSpTimer();
  document.getElementById('speakingList').style.display = 'none';
  document.getElementById('speakingDetail').classList.add('active');
  renderSpeakingSetView();
  if (typeof logActivity === 'function') {
    logActivity('speaking', `Topic ${set.number}: ${set.theme}`, { setId });
  }
}

function renderSpeakingSetView() {
  const set = spCurrentSet;
  if (!set) return;
  const el = document.getElementById('speakingContent');
  if (!el) return;

  el.innerHTML = `
    <div class="sp-badge-row" style="margin-bottom:12px">
      <span class="sp-badge num">Topic ${set.number}</span>
      <span class="sp-badge season">${set.season}</span>
    </div>
    <div class="sp-detail-topic">${set.theme}</div>
    <div class="sp-set-nav">
      <button type="button" class="sp-set-tab ${spActivePart === 'part2' ? 'active' : ''}" onclick="switchSpeakingPart('part2')">Part 2 — Cue card</button>
      <button type="button" class="sp-set-tab ${spActivePart === 'part3' ? 'active' : ''}" onclick="switchSpeakingPart('part3')">Part 3 — Discussion</button>
    </div>
    <div id="speakingPartBody"></div>
  `;
  renderSpeakingPartBody();
}

function switchSpeakingPart(part) {
  spActivePart = part;
  stopSpTimer();
  document.querySelectorAll('.sp-set-tab').forEach((btn, i) => {
    btn.classList.toggle('active', (part === 'part2' && i === 0) || (part === 'part3' && i === 1));
  });
  renderSpeakingPartBody();
}

function renderSpeakingPartBody() {
  const body = document.getElementById('speakingPartBody');
  const set = spCurrentSet;
  if (!body || !set) return;
  const part = spActivePart === 'part3' ? set.part3 : set.part2;

  if (spActivePart === 'part2') {
    const prep = part.prepSeconds || 60;
    const speak = part.timeSeconds || 120;
    body.innerHTML = `
      <div class="sp-detail-part">${part.part} · ${part.label}</div>
      <div style="font-size:14px;color:var(--muted);margin-bottom:14px">${part.subtitle}</div>
      <div class="sp-main-prompt"><strong>Describe:</strong> ${part.mainPrompt}</div>
      <div class="cue-card">
        <h4>📋 You should say:</h4>
        <ul class="sp-checklist">${part.cues.map((c) => `<li>${c}</li>`).join('')}</ul>
      </div>
      <div class="timer-row">
        <div class="timer-box">
          <div class="timer-label">1 min — Preparation</div>
          <div class="timer-display" id="timerPrep">${fmtTime(prep)}</div>
          <div class="timer-actions">
            <button type="button" class="timer-btn start" id="timerPrepBtn" onclick="toggleSpTimer('prep')">Start prep</button>
            <button type="button" class="timer-btn reset" onclick="resetSpTimer('prep')">Reset</button>
          </div>
        </div>
        <div class="timer-box">
          <div class="timer-label">2 min — Speak</div>
          <div class="timer-display" id="timerSpeak">${fmtTime(speak)}</div>
          <div class="timer-actions">
            <button type="button" class="timer-btn start" id="timerSpeakBtn" onclick="toggleSpTimer('speak')">Start speaking</button>
            <button type="button" class="timer-btn reset" onclick="resetSpTimer('speak')">Reset</button>
          </div>
        </div>
      </div>
      ${renderTips(part.tips)}
    `;
    spTimerPrepTotal = prep;
    spTimerSpeakTotal = speak;
    spTimerPrepSecs = prep;
    spTimerSpeakSecs = speak;
    return;
  }

  const soonNote = part.comingSoon
    ? '<p class="sp-soon-note">ℹ️ Resmi Part 3 soruları henüz paylaşılmadı — aşağıdaki sorularla pratik yapabilirsin.</p>'
    : '';

  body.innerHTML = `
    <div class="sp-detail-part">${part.part} · ${part.label}</div>
    <div style="font-size:14px;color:var(--muted);margin-bottom:14px">${part.subtitle}</div>
    ${soonNote}
    <div class="timer-box">
      <div class="timer-label">Discussion · ${part.time || '4–5 min'}</div>
      <div class="timer-display" id="timerMain">${fmtTime(part.timeSeconds || 270)}</div>
      <div class="timer-actions">
        <button type="button" class="timer-btn start" id="timerMainBtn" onclick="toggleSpTimer('main')">Start</button>
        <button type="button" class="timer-btn reset" onclick="resetSpTimer('main')">Reset</button>
      </div>
    </div>
    <div class="questions-box">
      <h4>💬 Discussion questions</h4>
      <ol style="padding-left:20px;margin:0">${part.questions.map((q) => `<li style="margin-bottom:10px;font-size:14px;line-height:1.6">${q}</li>`).join('')}</ol>
    </div>
    ${renderTips(part.tips)}
  `;
  spTimerMainTotal = part.timeSeconds || 270;
  spTimerMainSecs = spTimerMainTotal;
}

function renderTips(tips) {
  if (!tips || !tips.length) return '';
  return `
    <div class="tips-section">
      <h4>🎯 Band-boosting tips</h4>
      ${tips.map((tip) => `<div class="tip-item"><div class="tip-dot"></div><div class="tip-text">${tip}</div></div>`).join('')}
    </div>
  `;
}

function fmtTime(s) {
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function getSpTimerState(slot) {
  if (slot === 'prep') {
    return {
      secs: () => spTimerPrepSecs,
      total: () => spTimerPrepTotal,
      setSecs: (v) => { spTimerPrepSecs = v; },
      disp: 'timerPrep',
      btn: 'timerPrepBtn',
    };
  }
  if (slot === 'speak') {
    return {
      secs: () => spTimerSpeakSecs,
      total: () => spTimerSpeakTotal,
      setSecs: (v) => { spTimerSpeakSecs = v; },
      disp: 'timerSpeak',
      btn: 'timerSpeakBtn',
    };
  }
  return {
    secs: () => spTimerMainSecs,
    total: () => spTimerMainTotal,
    setSecs: (v) => { spTimerMainSecs = v; },
    disp: 'timerMain',
    btn: 'timerMainBtn',
  };
}

function toggleSpTimer(slot) {
  const st = getSpTimerState(slot);
  const btn = document.getElementById(st.btn);
  const disp = document.getElementById(st.disp);
  if (!btn || !disp) return;

  if (spRunning && spTimerSlot === slot) {
    stopSpTimer();
    btn.textContent = slot === 'prep' ? 'Resume prep' : 'Resume';
    btn.className = 'timer-btn start';
    return;
  }

  stopSpTimer();
  spTimerSlot = slot;
  spRunning = true;
  btn.textContent = 'Pause';
  btn.className = 'timer-btn pause';

  spTimer = setInterval(() => {
    const left = st.secs() - 1;
    st.setSecs(left);
    if (disp) {
      disp.textContent = left <= 0 ? "TIME'S UP!" : fmtTime(left);
      disp.className = 'timer-display' + (left <= 30 && left > 0 ? ' urgent' : '');
    }
    if (left <= 0) {
      stopSpTimer();
      btn.textContent = slot === 'prep' ? 'Start prep' : 'Start';
      btn.className = 'timer-btn start';
    }
  }, 1000);
}

function resetSpTimer(slot) {
  const st = getSpTimerState(slot);
  if (spRunning && spTimerSlot === slot) stopSpTimer();
  st.setSecs(st.total());
  const disp = document.getElementById(st.disp);
  const btn = document.getElementById(st.btn);
  if (disp) {
    disp.textContent = fmtTime(st.total());
    disp.className = 'timer-display';
  }
  if (btn) {
    btn.textContent = slot === 'prep' ? 'Start prep' : 'Start';
    btn.className = 'timer-btn start';
  }
}

function stopSpTimer() {
  clearInterval(spTimer);
  spRunning = false;
}

function openSpeaking(id) {
  const t = typeof SPEAKING_TOPICS !== 'undefined' ? SPEAKING_TOPICS.find((x) => x.id === id) : null;
  if (t && t.setId) {
    openSpeakingSet(t.setId);
    switchSpeakingPart(t.part === 'PART 3' ? 'part3' : 'part2');
  }
}

function closeSpeaking() {
  stopSpTimer();
  spCurrentSet = null;
  document.getElementById('speakingList').style.display = 'block';
  document.getElementById('speakingDetail').classList.remove('active');
}

function toggleTimer() {
  toggleSpTimer(spTimerSlot || 'main');
}

function resetTimer() {
  resetSpTimer(spTimerSlot || 'main');
}
