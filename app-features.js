const IELTS_RESOURCES = [
  { title: 'E2 IELTS', desc: 'Full test strategies and mock exams', url: 'https://www.youtube.com/@E2IELTS', icon: '▶', tag: 'YouTube' },
  { title: 'IELTS Liz', desc: 'Writing and speaking tips', url: 'https://www.youtube.com/@IELTSLiz', icon: '▶', tag: 'YouTube' },
  { title: 'IELTS Advantage', desc: 'Band 7+ techniques', url: 'https://www.youtube.com/@IELTSAdvantage', icon: '▶', tag: 'YouTube' },
  { title: 'BBC Learning English', desc: 'Grammar and pronunciation', url: 'https://www.youtube.com/@bbclearningenglish', icon: '▶', tag: 'YouTube' },
  { title: 'Official IELTS', desc: 'Registration and test format', url: 'https://www.ielts.org/', icon: '🌐', tag: 'Official' },
  { title: 'British Council', desc: 'Practice tests and preparation', url: 'https://takeielts.britishcouncil.org/', icon: '🌐', tag: 'Official' }
];

function renderResources() {
  const grid = document.getElementById('resourcesGrid');
  if (!grid) return;
  grid.innerHTML = IELTS_RESOURCES.map(r =>
    '<a class="resource-card" href="' + r.url + '" target="_blank" rel="noopener noreferrer">' +
      '<span class="resource-icon">' + r.icon + '</span>' +
      '<div><h4>' + r.title + '</h4><p>' + r.desc + '</p><span class="resource-tag">' + r.tag + '</span></div>' +
    '</a>'
  ).join('');
}

function updateThemeToggleIcon() {
  const btn = document.getElementById('themeToggleBtn');
  if (!btn) return;
  btn.textContent = (appState.theme || 'dark') === 'dark' ? '🌙' : '☀️';
  btn.title = (appState.theme || 'dark') === 'dark' ? 'Switch to light mode' : 'Switch to dark mode';
}

function toggleThemeQuick() {
  appState.theme = (appState.theme || 'dark') === 'dark' ? 'light' : 'dark';
  applyTheme();
  saveState();
  updateThemeToggleIcon();
  syncSettingsUI();
}

function resetStreak() {
  if (!confirm('Reset your day streak to 0? Your study history and band scores stay saved.')) return;
  appState.streakDays = 0;
  appState.streakDate = new Date().toDateString();
  saveState();
  renderHomeStats();
  syncSettingsUI();
}

function syncSettingsUI() {
  const themeSeg = document.getElementById('settingsTheme');
  if (themeSeg) {
    themeSeg.querySelectorAll('button').forEach(b => {
      b.classList.toggle('active', b.dataset.val === (appState.theme || 'dark'));
    });
  }
  const accentWrap = document.getElementById('settingsAccent');
  if (accentWrap && !accentWrap.dataset.built && typeof ACCENTS !== 'undefined') {
    accentWrap.dataset.built = '1';
    Object.entries(ACCENTS).forEach(([k, a]) => {
      const sw = document.createElement('button');
      sw.type = 'button';
      sw.dataset.val = k;
      sw.title = a.label;
      sw.style.setProperty('--sw', a.color);
      if ((appState.accent || 'teal') === k) sw.classList.add('active');
      sw.innerHTML = '<span></span>';
      sw.addEventListener('click', () => {
        appState.accent = k;
        applyTheme();
        saveState();
        accentWrap.querySelectorAll('button').forEach(s => s.classList.remove('active'));
        sw.classList.add('active');
      });
      accentWrap.appendChild(sw);
    });
  }
  const prov = document.getElementById('aiProviderSelect');
  if (prov) prov.value = appState.aiProvider || 'local';
  const keyIn = document.getElementById('openaiKeyInput');
  if (keyIn && document.activeElement !== keyIn) keyIn.value = appState.openaiKey || '';
  const keyField = document.getElementById('openaiKeyField');
  if (keyField) keyField.style.display = (appState.aiProvider || 'local') === 'openai' ? 'block' : 'none';
}

function openSettings() {
  const ov = document.getElementById('settingsOverlay');
  if (!ov) return;
  syncSettingsUI();
  ov.classList.add('open');
  ov.setAttribute('aria-hidden', 'false');
}

function closeSettings() {
  const ov = document.getElementById('settingsOverlay');
  if (!ov) return;
  ov.classList.remove('open');
  ov.setAttribute('aria-hidden', 'true');
}

function initSettingsPanel() {
  document.getElementById('themeToggleBtn')?.addEventListener('click', toggleThemeQuick);
  document.getElementById('settingsOpenBtn')?.addEventListener('click', openSettings);
  document.getElementById('settingsCloseBtn')?.addEventListener('click', closeSettings);
  document.getElementById('settingsOverlay')?.addEventListener('click', e => {
    if (e.target.id === 'settingsOverlay') closeSettings();
  });
  document.getElementById('settingsTheme')?.querySelectorAll('button').forEach(btn => {
    btn.addEventListener('click', () => {
      appState.theme = btn.dataset.val;
      applyTheme();
      saveState();
      updateThemeToggleIcon();
      syncSettingsUI();
    });
  });
  document.getElementById('aiProviderSelect')?.addEventListener('change', e => {
    appState.aiProvider = e.target.value;
    saveState();
    syncSettingsUI();
  });
  document.getElementById('openaiKeyInput')?.addEventListener('change', e => {
    appState.openaiKey = e.target.value.trim();
    saveState();
  });
  document.getElementById('resetStreakBtn')?.addEventListener('click', resetStreak);
  updateThemeToggleIcon();
  syncSettingsUI();
}
