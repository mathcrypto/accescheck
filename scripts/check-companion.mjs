import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = (process.env.APP_TEST_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1050 } });
  const errors = [],
    requests = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('request', (r) => {
    if (r.method() === 'POST') requests.push(r.url());
  });
  await page.addInitScript(() => {
    window.__availability = 'available';
    window.__started = 0;
    window.__spoken = [];
    window.__cancelled = 0;
    class MockRecognition {
      constructor() {
        this.processLocally = false;
        window.__recognition = this;
      }
      static async available() {
        return window.__availability;
      }
      static async install() {
        window.__availability = 'available';
        return true;
      }
      start() {
        window.__started++;
        this.onstart?.();
      }
      abort() {
        this.aborted = true;
        this.onend?.();
      }
    }
    Object.defineProperty(window, 'SpeechRecognition', {
      value: MockRecognition,
      configurable: true,
    });
    Object.defineProperty(window, 'speechSynthesis', {
      configurable: true,
      value: {
        getVoices: () => [
          { name: 'Français local test', lang: 'fr-FR', localService: true },
          { name: 'Remote', lang: 'fr-FR', localService: false },
        ],
        addEventListener() {},
        cancel() {
          window.__cancelled++;
        },
        speak(u) {
          window.__spoken.push(u.text);
          window.__utterance = u;
        },
      },
    });
    Object.defineProperty(window, 'SpeechSynthesisUtterance', {
      configurable: true,
      value: class {
        constructor(text) {
          this.text = text;
        }
      },
    });
    window.__emit = (text, final = true) => {
      const result = [{ transcript: text }];
      result.isFinal = final;
      window.__recognition.onresult({ resultIndex: 0, results: [result] });
    };
  });
  await page.goto(base + '/consultation');
  assert.equal(await page.evaluate(() => window.__started), 0);
  assert.equal(await page.locator('#speakReply').isDisabled(), false);
  assert.equal(await page.locator('#voice').count(), 0);
  await page.locator('#startCaptions').click();
  assert.match(await page.locator('#status').textContent(), /Confirmez l’accord/);
  assert.equal(await page.evaluate(() => window.__started), 0);
  await page.locator('#consent').check();
  await page.locator('#startCaptions').click();
  assert.equal(await page.evaluate(() => window.__recognition.processLocally), true);
  assert.match(await page.locator('#micText').textContent(), /actif/);
  await page.evaluate(() => window.__emit('Prenez le temps de poser vos questions.'));
  assert.equal(await page.locator('.message').count(), 1);
  assert.match(await page.locator('.message .meta').textContent(), /locuteur non identifié/);
  await page.evaluate(() => window.__emit('Parole provisoire', false));
  assert.equal(await page.locator('#interim').textContent(), 'Parole provisoire');
  await page.locator('#reply').fill('Je voudrais une explication.');
  await page.locator('#speakReply').click();
  assert.equal(await page.evaluate(() => window.__recognition.aborted), true);
  assert.equal(await page.locator('#interim').textContent(), '');
  assert.equal(await page.evaluate(() => window.__spoken.at(-1)), 'Je voudrais une explication.');
  await page.locator('#notesTab').click();
  await page.locator('#draftNotes').click();
  assert.match(await page.locator('#notes').inputValue(), /Prenez le temps/);
  assert.equal(await page.locator('#readNotes').isDisabled(), true);
  await page.locator('#reviewed').check();
  await page.locator('#readNotes').click();
  assert.match(await page.evaluate(() => window.__spoken.at(-1)), /BROUILLON/);
  await page.locator('#notes').fill('Notes corrigées avec le soignant.');
  assert.equal(await page.locator('#reviewed').isChecked(), false);
  assert.equal(await page.locator('#readNotes').isDisabled(), true);
  await page.locator('#draftNotes').click();
  assert.equal(await page.locator('#replaceDialog').isVisible(), true);
  await page.locator('#cancelDraft').click();
  assert.equal(await page.locator('#notes').inputValue(), 'Notes corrigées avec le soignant.');
  await page.locator('#conversationTab').click();
  await page.locator('.edit').first().click();
  await page.locator('#editText').fill('<img src=x onerror=alert(1)>');
  await page.locator('#saveEdit').click();
  assert.equal(await page.locator('#transcript img').count(), 0);
  assert.match(await page.locator('.message p').first().textContent(), /<img/);
  await page.locator('#moreOptions').evaluate((el) => (el.open = true));
  await page.locator('#recognitionMode').selectOption('browser');
  await page.locator('#startCaptions').click();
  assert.match(await page.locator('#status').textContent(), /explicitement/);
  await page.locator('#remoteConsent').check();
  await page.locator('#startCaptions').click();
  assert.equal(await page.evaluate(() => window.__recognition.processLocally), false);
  await page.locator('#consent').uncheck();
  assert.match(await page.locator('#micText').textContent(), /coupé/);
  await page.locator('#recognitionMode').selectOption('local');
  await page.locator('#consent').check();
  await page.evaluate(() => (window.__availability = 'downloadable'));
  await page.locator('#startCaptions').click();
  assert.equal(await page.locator('#installLanguage').isVisible(), true);
  assert.match(await page.locator('#micText').textContent(), /coupé/);
  await page.locator('#installLanguage').click();
  await page.locator('#startCaptions').click();
  await page.evaluate(() => window.__recognition.onerror({ error: 'not-allowed' }));
  assert.match(await page.locator('#status').textContent(), /refusé/);
  await page.locator('#clearSession').click();
  assert.equal(await page.locator('.message').count(), 0);
  assert.equal(await page.locator('#notes').inputValue(), '');
  assert.equal(await page.locator('#consent').isChecked(), false);
  await page.locator('#loadDemo').click();
  assert.equal(await page.locator('.message').count(), 3);
  assert.match(await page.locator('#demoLabel').textContent(), /FICTIF/);
  await page.locator('#startCaptions').click();
  assert.match(await page.locator('#status').textContent(), /Effacez l’exemple/);
  await page.screenshot({ path: '/tmp/accescheck-consultation-desktop.png', fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  await page.screenshot({ path: '/tmp/accescheck-consultation-mobile.png', fullPage: true });
  assert.deepEqual(requests, []);
  assert.deepEqual(errors, []);
  const fallback = await browser.newPage();
  await fallback.addInitScript(() => {
    Object.defineProperty(window, 'SpeechRecognition', { value: undefined, configurable: true });
    Object.defineProperty(window, 'webkitSpeechRecognition', {
      value: undefined,
      configurable: true,
    });
  });
  await fallback.goto(base + '/consultation');
  assert.equal(await fallback.locator('#startCaptions').isDisabled(), true);
  await fallback.locator('#reply').fill('Communication écrite disponible.');
  await fallback.locator('#showReply').click();
  assert.equal(await fallback.locator('.message').count(), 1);
  await fallback.locator('#manualToggle').click();
  await fallback.locator('#manualDoctor').fill('Oui, nous pouvons échanger par écrit.');
  await fallback.locator('#addDoctor').click();
  assert.equal(await fallback.locator('.message').count(), 2);
  console.log(
    'Companion checks passed: consent, local/remote selection, captions, interim text, correction/XSS, speech stopping mic, notes review, overwrite protection, errors, pack install, clear, demo isolation, unsupported-browser fallback, mobile, no POST traffic. Speech and mic events simulated; actual recognition accuracy and sound not assessed.',
  );
} finally {
  await browser.close();
}
