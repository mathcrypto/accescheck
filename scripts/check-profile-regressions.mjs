import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4194';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const failures = [];
const key = 'accescheck.access-profile.v1';
async function setup() {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.route('**/api/ai-config', (route) => route.fulfill({ json: { available: true } }));
  return { context, page };
}
function answer(route) {
  return route.fulfill({
    contentType: 'application/x-ndjson',
    body:
      JSON.stringify({
        type: 'result',
        value: {
          mode: 'agent',
          reply: 'Critères de test contrôlés.',
          summary: 'Passage ≥ 90 cm',
          state: { proposal: { needs: { keys: ['stepFree', 'width'], minWidth: 90 } } },
          question: null,
          actions: [],
          results: null,
        },
      }) + '\n',
  });
}
async function consent(page) {
  if (!(await page.locator('.ai-option').evaluate((element) => element.open)))
    await page.locator('.ai-option > summary').click();
  await page.locator('#consent').check();
}
try {
  const { context, page } = await setup();
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  await page.route('**/api/chat', async (route) => {
    await gate;
    await answer(route);
  });
  await page.goto(base + '/#recherche');
  await consent(page);
  await page.locator('#description').fill('Passage de 90 cm.');
  const request = page.waitForRequest('**/api/chat');
  await page.locator('#description').press('Enter');
  await request;
  await page.locator('#description').fill('Correction : passage de 95 cm.');
  await page.locator('#description').fill('');
  release();
  await page.locator('#agentActivity').waitFor({ state: 'hidden' });
  try {
    assert.equal(
      await page.locator('#profileOffer').isHidden(),
      true,
      'An edited-and-cleared draft must invalidate the pending profile response',
    );
  } catch (error) {
    failures.push(error.message);
  }
  await context.close();

  const second = await setup();
  await second.page.route('**/api/chat', answer);
  await second.context.addInitScript((profileKey) => {
    if (!localStorage.getItem(profileKey)) {
      const now = Date.now();
      localStorage.setItem(
        profileKey,
        JSON.stringify({
          keys: ['stepFree', 'width'],
          minWidth: 90,
          fictional: true,
          version: 1,
          savedAt: now,
          expiresAt: now + 30 * 86400000,
        }),
      );
    }
  }, key);
  await second.page.goto(base + '/#recherche');
  await second.page.locator('#reuseProfile').click();
  await consent(second.page);
  await second.page.locator('#description').press('Enter');
  await second.page.locator('#profileOffer').waitFor();
  await second.page.locator('#profileInlineConsent').check();
  await second.page.locator('#saveInlineProfile').click();
  try {
    assert.equal(
      await second.page.evaluate(
        (profileKey) => JSON.parse(localStorage.getItem(profileKey)).fictional,
        key,
      ),
      true,
      'A reused fictional profile must keep its provenance after the agent response',
    );
  } catch (error) {
    failures.push(error.message);
  }
  await second.page.locator('#clear').click();
  await consent(second.page);
  await second.page.locator('#description').fill('Nouveau besoin réel : 90 cm.');
  await second.page.locator('#description').press('Enter');
  await second.page.locator('#profileOffer').waitFor();
  await second.page.locator('#profileInlineConsent').check();
  await second.page.locator('#saveInlineProfile').click();
  assert.equal(
    await second.page.evaluate(
      (profileKey) => JSON.parse(localStorage.getItem(profileKey)).fictional,
      key,
    ),
    false,
    'Clearing the conversation must reset the fictional context',
  );
  await second.context.close();
  assert.deepEqual(failures, []);
  console.log(
    'Profile regressions passed: delayed draft correction and fictional reuse/reset. No provider called.',
  );
} finally {
  await browser.close();
}
