import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4194';
const output = 'output/devday-profile';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const profileKey = 'accescheck.access-profile.v1';
const errors = [],
  posts = [],
  checks = [];
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('request', (request) => {
    if (request.method() === 'POST') posts.push(new URL(request.url()).pathname);
  });
  await page.route('**/api/ai-config', (route) => route.fulfill({ json: { available: true } }));
  let nextWidth = 90;
  const chatRequests = [];
  await page.route('**/api/chat', async (route) => {
    chatRequests.push(route.request().postDataJSON());
    await new Promise((resolve) => setTimeout(resolve, 200));
    const value = {
      mode: 'agent',
      reply: 'Vérifiez ces critères.',
      summary: `Entrée sans marche, passage de ${nextWidth} cm`,
      state: {
        proposal: { needs: { keys: ['stepFree', 'route', 'width'], minWidth: nextWidth } },
        history: ['Conversation privée à ne pas conserver'],
        signature: 'signed-state-not-a-profile',
      },
      question: null,
      actions: [],
      results: null,
    };
    await route.fulfill({
      contentType: 'application/x-ndjson',
      body: JSON.stringify({ type: 'result', value }) + '\n',
    });
  });
  await page.goto(base + '/#recherche');
  await page.locator('details.ai-option > summary').click();
  await page.locator('#consent').check();
  await page
    .locator('#description')
    .fill('Je cherche un dentiste à Lyon. Entrée sans marche et passage de 90 cm.');
  await page.locator('#descriptionForm button[type="submit"]').click();
  await page.locator('#profileOffer').waitFor();
  assert.match(await page.locator('#profileOfferTitle').innerText(), /extrait de votre demande/);
  assert.match(await page.locator('#profileOfferSummary').innerText(), /90 cm/);
  assert.equal(await page.locator('#saveInlineProfile').isDisabled(), true);
  for (const width of [320, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.locator('#profileOffer').scrollIntoViewIfNeeded();
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    const bounds = await page.locator('#profileOffer').boundingBox();
    assert.ok(bounds.x >= 0 && bounds.x + bounds.width <= width + 1);
    await page.screenshot({ path: `${output}/chat-offer-${width}.png` });
  }
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);
  await page.locator('#profileInlineConsent').check();
  await page.locator('#description').fill('Correction : il me faut 95 cm de passage.');
  assert.equal(await page.locator('#profileOffer').isHidden(), true);
  assert.equal(await page.locator('#profileInlineConsent').isChecked(), false);
  nextWidth = 95;
  await page.locator('#descriptionForm button[type="submit"]').click();
  assert.equal(await page.locator('#profileOffer').isHidden(), true);
  await page.locator('#profileOffer').waitFor();
  assert.match(await page.locator('#profileOfferSummary').innerText(), /95 cm/);
  assert.equal(await page.locator('#saveInlineProfile').isDisabled(), true);
  await page.locator('#profileInlineConsent').check();
  await page.locator('#saveInlineProfile').click();
  const stored = await page.evaluate((key) => localStorage.getItem(key), profileKey);
  const profile = JSON.parse(stored);
  assert.deepEqual(Object.keys(profile).sort(), [
    'expiresAt',
    'fictional',
    'keys',
    'minWidth',
    'savedAt',
    'version',
  ]);
  assert.equal(profile.minWidth, 95);
  assert.equal(profile.expiresAt - profile.savedAt, 30 * 24 * 60 * 60 * 1000);
  assert.doesNotMatch(
    stored,
    /dentiste|Lyon|Correction|Conversation|signature|signed-state|history|proposal/,
  );
  assert.equal(chatRequests.length, 2);
  assert.ok(chatRequests.every((request) => request.consent === true));
  checks.push(
    'Normal request creates profile through the existing agent; correction immediately invalidates the old offer and requires fresh confirmation',
  );

  await page.reload();
  await page.locator('#reuseProfile').waitFor();
  assert.equal(await page.locator('#consent').isChecked(), false);
  await page.locator('#description').fill('Mon texte en cours');
  await page.locator('#reuseProfile').click();
  assert.equal(await page.locator('#description').inputValue(), 'Mon texte en cours');
  await page.locator('#description').fill('');
  await page.locator('#reuseProfile').click();
  assert.match(await page.locator('#description').inputValue(), /95 cm/);
  assert.equal(posts.length, 2, 'Reuse cannot send the prepared request');
  assert.equal(await page.locator('#consent').isChecked(), false);
  checks.push(
    'Reload restores the saved criteria; reuse preserves a draft and never sends or accepts AI consent',
  );

  await page.goto(base + '/profil');
  assert.equal(
    await page.locator('textarea, input, form').count(),
    0,
    'Management must not duplicate extraction or manual profiling',
  );
  assert.match(await page.locator('#savedProfileFacts').innerText(), /Entrée sans marche/);
  assert.match(await page.locator('#savedProfileWidth').innerText(), /95 cm/);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
  }
  await page.locator('#deleteProfile').click();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);
  assert.equal(await page.locator('#profileEmpty').isVisible(), true);
  assert.equal(
    await page.locator('#describeNeeds').evaluate((element) => element === document.activeElement),
    true,
  );
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `${output}/empty-${width}.png`, fullPage: true });
  }
  checks.push(
    'Management shows saved criteria without a second form, deletes with predictable keyboard focus, and handles saved/empty layouts at four widths',
  );

  for (const raw of [
    '{bad json',
    JSON.stringify({
      keys: ['stepFree'],
      minWidth: null,
      fictional: false,
      version: 1,
      savedAt: 1,
      expiresAt: 1 + 30 * 24 * 60 * 60 * 1000,
    }),
  ]) {
    await page.evaluate(([key, value]) => localStorage.setItem(key, value), [profileKey, raw]);
    await page.reload();
    assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);
    assert.equal(await page.locator('#profileEmpty').isVisible(), true);
  }
  checks.push('Corrupt and expired records are removed without crashes');

  const blocked = await browser.newContext();
  await blocked.addInitScript(() =>
    Object.defineProperty(window, 'localStorage', {
      get() {
        throw new DOMException('Storage blocked', 'SecurityError');
      },
    }),
  );
  const blockedPage = await blocked.newPage();
  blockedPage.on('pageerror', (error) => errors.push(error.message));
  await blockedPage.goto(base + '/profil');
  assert.match(await blockedPage.locator('#profileStatus').innerText(), /indisponible/);
  assert.equal(await blockedPage.locator('#describeNeeds').isVisible(), true);
  await blocked.close();
  checks.push('Storage refused leaves the ordinary needs-description entry usable');
  assert.deepEqual(errors, []);
  assert.ok(posts.every((path) => path === '/api/chat'));
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ base, checks, errors, posts: posts.length }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, posts: posts.length }));
  await context.close();
} finally {
  await browser.close();
}
