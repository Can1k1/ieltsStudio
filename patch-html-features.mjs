import { readFileSync, writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const htmlPath = join(root, 'IELTS Studio (2).html');
let html = readFileSync(htmlPath, 'utf8');

if (!html.includes('id="themeToggleBtn"')) {
  html = html.replace(
    `  <motion>  <div class="nav-right">
    <div class="streak-badge" id="streakBadge">🔥 0 day streak</div>
  </div>`,
    `  <div class="nav-right">
    <button type="button" class="nav-icon-btn" id="themeToggleBtn" title="Toggle light / dark mode" aria-label="Toggle theme">🌙</button>
    <button type="button" class="nav-icon-btn" id="settingsOpenBtn" title="Settings" aria-label="Settings">⚙</button>
    <div class="streak-badge" id="streakBadge">🔥 0 day streak</div>
  </div>`
  );
  html = html.replace(
    `  <div class="nav-right">
    <div class="streak-badge" id="streakBadge">🔥 0 day streak</div>
  </div>`,
    `  <div class="nav-right">
    <button type="button" class="nav-icon-btn" id="themeToggleBtn" title="Toggle light / dark mode" aria-label="Toggle theme">🌙</button>
    <button type="button" class="nav-icon-btn" id="settingsOpenBtn" title="Settings" aria-label="Settings">⚙</button>
    <div class="streak-badge" id="streakBadge">🔥 0 day streak</div>
  </div>`
  );
}

if (!html.includes('id="settingsOverlay"')) {
  const settingsHtml = `
<div class="settings-overlay" id="settingsOverlay" aria-hidden="true">
  <div class="settings-panel" id="settingsPanel" role="dialog" aria-labelledby="settingsTitle">
    <div class="sp-head">
      <h2 id="settingsTitle">Settings</h2>
      <button type="button" class="tp-close" id="settingsCloseBtn" aria-label="Close">×</button>
    </div>
    <div class="tp-section">
      <div class="tp-label">Appearance</div>
      <div class="tp-segmented" id="settingsTheme">
        <button type="button" data-val="dark">Dark</button>
        <button type="button" data-val="light">Light</button>
      </motion>
    </div>
    <div class="tp-section">
      <div class="tp-label">Accent colour</div>
      <div class="tp-swatches" id="settingsAccent"></div>
    </div>
    <div class="sp-field">
      <label for="aiProviderSelect">Writing feedback</label>
      <select id="aiProviderSelect">
        <option value="local">Smart coach (free, offline)</option>
        <option value="openai">ChatGPT (OpenAI API key)</option>
      </select>
      <p class="sp-hint">Smart coach works instantly with no account. For ChatGPT, add your key from <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener">platform.openai.com</a>.</p>
    </div>
    <div class="sp-field" id="openaiKeyField">
      <label for="openaiKeyInput">OpenAI API key</label>
      <input type="password" id="openaiKeyInput" placeholder="sk-..." autocomplete="off">
    </div>
    <div class="sp-actions">
      <button type="button" class="btn-danger" id="resetStreakBtn">Reset day streak</button>
    </div>
  </div>
</motion>
</motion>`.replace(/<\/?motion>/g, '');
  html = html.replace(
    '<p class="vocab-load-banner" id="vocabLoadBanner" hidden role="alert"></p>',
    '<p class="vocab-load-banner" id="vocabLoadBanner" hidden role="alert"></p>' + settingsHtml
  );
}

if (!html.includes('id="resourcesGrid"')) {
  const resourcesHtml = `
  <section class="resources-section" aria-labelledby="resourcesHeading">
    <div class="section-title" id="resourcesHeading">Study resources</div>
    <div class="section-sub">Trusted YouTube channels and official links — open in a new tab.</div>
    <div class="resources-grid" id="resourcesGrid"></div>
  </section>`;
  html = html.replace(
    '    <motion>    <div class="qa-arrow">→</div></div>\n  </div>\n\n<!-- DASHBOARD -->',
    '    <div class="qa-arrow">→</div></motion>      </div>' + resourcesHtml + '\n</div>\n\n<!-- DASHBOARD -->'
  );
  html = html.replace(/<\/?motion>/g, '');
  if (!html.includes('id="resourcesGrid"')) {
    html = html.replace(
      '    <div class="qa-arrow">→</div></motion>      </div>\n  </div>\n\n<!-- DASHBOARD -->',
      '    <div class="qa-arrow">→</div></div>' + resourcesHtml + '\n  </div>\n\n<!-- DASHBOARD -->'
    );
  }
  if (!html.includes('id="resourcesGrid"')) {
    html = html.replace(
      '    <div class="qa-arrow">→</div></motion>      </div>\n  </div>\n\n<!-- DASHBOARD -->',
      '    <div class="qa-arrow">→</div></div>\n  </div>' + resourcesHtml + '\n\n<!-- DASHBOARD -->'
    );
  }
  if (!html.includes('id="resourcesGrid"')) {
    html = html.replace(
      '    <div class="qa-arrow">→</div></div>\n  </div>\n\n<!-- DASHBOARD -->',
      '    <div class="qa-arrow">→</div></div>\n  </motion>      </div>' + resourcesHtml + '\n</div>\n\n<!-- DASHBOARD -->'
    );
    html = html.replace(/<\/?motion>/g, '');
  }
  if (!html.includes('id="resourcesGrid"')) {
    html = html.replace(
      '  </div>\n</div>\n\n<!-- DASHBOARD -->',
      resourcesHtml + '\n</div>\n\n<!-- DASHBOARD -->',
      1
    );
  }
}

if (!html.includes('appState.aiProvider')) {
  html = html.replace(
    "appState.density      = appState.density      || 'cozy';",
    `appState.density      = appState.density      || 'cozy';
appState.aiProvider   = appState.aiProvider   || 'local';
appState.openaiKey    = appState.openaiKey    || '';`
  );
}

html = html.replace(/Claude AI/g, 'AI');
html = html.replace(
  'detailed feedback powered by Claude AI.',
  'Smart coach (free) or optional ChatGPT feedback.'
);
html = html.replace(
  'with Claude AI band score feedback',
  'with Smart coach or ChatGPT feedback'
);

if (!html.includes('.ai-tag.openai')) {
  html = html.replace(
    '.ai-tag.local{background:var(--c-mastery-soft);color:var(--c-mastery);}',
    '.ai-tag.local{background:var(--c-mastery-soft);color:var(--c-mastery);}\n.ai-tag.openai{background:var(--c-info-soft);color:var(--c-info);}'
  );
}

const feedbackStart = html.indexOf('async function getAIFeedback');
const feedbackEnd = html.indexOf('function closeWriting()', feedbackStart);
if (feedbackStart > 0 && feedbackEnd > feedbackStart && !html.includes('generateLocalFeedback')) {
  const newBlock = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'writing-feedback.js'), 'utf8');
  html = html.slice(0, feedbackStart) + newBlock + '\n' + html.slice(feedbackEnd);
}

if (!html.includes('function initSettingsPanel')) {
  const featuresJs = readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'app-features.js'), 'utf8');
  html = html.replace('async function bootApp() {', featuresJs + '\nasync function bootApp() {');
  html = html.replace(
    '  updateStreak();\n}\nbootApp();',
    `  updateStreak();
  renderResources();
  initSettingsPanel();
}
bootApp();`
  );
}

if (!html.includes('onclick="resetStreak()"')) {
  html = html.replace(
    `      </select>
    </div>
  </div>

  <div class="dash-stats">`,
    `      </select>
    </div>
    <button type="button" class="btn-danger" onclick="resetStreak()" style="align-self:flex-start;margin-top:4px">Reset streak</button>
  </div>

  <div class="dash-stats">`
  );
}

html = html.replace(/<\/?motion>/g, '');
writeFileSync(htmlPath, html);
console.log('Patched:', {
  themeBtn: html.includes('themeToggleBtn'),
  settings: html.includes('settingsOverlay'),
  resources: html.includes('resourcesGrid'),
  localFB: html.includes('generateLocalFeedback'),
  init: html.includes('initSettingsPanel'),
  broken: (html.match(/<\/?motion>/g) || []).length
});
