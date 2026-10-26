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
    if (request.method() === 'POST') posts.push(request.url());
  });
  await page.goto(base + '/profil');
  assert.equal(await page.locator('#saveProfile').isDisabled(), true);
  await page.locator('#profileExample').click();
  assert.equal(posts.length, 0);
  assert.match(await page.locator('#profileMode').innerText(), /FICTIF/);
  await page.locator('#profileSaveConsent').check();
  await page.locator('#saveProfile').click();
  await page.locator('#savedProfile').waitFor();
  const saved = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)), profileKey);
  assert.deepEqual(Object.keys(saved).sort(), [
    'expiresAt',
    'fictional',
    'keys',
    'minWidth',
    'savedAt',
    'version',
  ]);
  assert.equal(saved.fictional, true);
  assert.equal(saved.minWidth, 90);
  assert.equal(saved.expiresAt - saved.savedAt, 30 * 24 * 60 * 60 * 1000);
  assert.equal(await page.locator('#profileRequest').inputValue(), '');
  await page.reload();
  assert.match(await page.locator('#savedProfileSummary').innerText(), /FICTIF/);
  assert.equal(await page.locator('#profileWidth').inputValue(), '90');
  assert.equal(await page.locator('#profileCriteria [value="stepFree"]').isChecked(), true);
  assert.deepEqual(errors, []);
  assert.equal(await page.locator('#profileSaveConsent').isChecked(), false);
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: `${output}/${width}.png`, fullPage: true });
  }
  checks.push(
    'Fictional demonstration without requests; opt-in storage, exact allowlist, 30-day lifetime, reload and four responsive sizes',
  );

  await page.goto(base + '/#recherche');
  await page.locator('#reuseProfile').waitFor();
  await page.locator('#description').fill('Mon message en cours');
  await page.locator('#reuseProfile').click();
  assert.equal(await page.locator('#description').inputValue(), 'Mon message en cours');
  await page.locator('#description').fill('');
  await page.locator('#reuseProfile').click();
  assert.match(await page.locator('#description').inputValue(), /fictif/);
  assert.match(await page.locator('#description').inputValue(), /90 cm/);
  assert.equal(posts.length, 0);
  assert.equal(await page.locator('#consent').isChecked(), false);
  checks.push(
    'Reuse prepares composer without sending or accepting AI consent; existing draft is preserved',
  );

  await page.route('**/api/chat', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        JSON.stringify({
          type: 'result',
          value: {
            mode: 'agent',
            reply: 'Vérifiez ces critères.',
            summary: 'Entrée sans marche',
            state: { proposal: { needs: { keys: ['stepFree', 'route'], minWidth: null } } },
            question: null,
            actions: [],
            results: null,
          },
        }) + '\n',
    }),
  );
  await page.locator('#description').fill('Ma demande privée de test, ne pas conserver');
  await page.locator('#descriptionForm button[type="submit"]').click();
  await page.locator('#profileOffer').waitFor();
  assert.equal(await page.locator('#saveInlineProfile').isDisabled(), true);
  await page.locator('#profileInlineConsent').check();
  await page.locator('#saveInlineProfile').click();
  const inline = await page.evaluate((key) => localStorage.getItem(key), profileKey);
  assert.doesNotMatch(inline, /demande privée|proposal|signature|history|lieu/);
  assert.equal(JSON.parse(inline).fictional, false);
  assert.deepEqual(JSON.parse(inline).keys, ['stepFree', 'route']);
  await page.locator('#clear').click();
  assert.equal(await page.locator('#profileOffer').isHidden(), true);
  await page.reload();
  await page.locator('#reuseProfile').waitFor();
  await page.locator('#reuseProfile').click();
  assert.match(await page.locator('#description').inputValue(), /Entrée sans marche/);
  checks.push(
    'Normal agent query offers a structured profile; save excludes conversation/state; clear invalidates offer but saved profile remains available',
  );

  await page.goto(base + '/profil');
  await page.locator('#deleteProfile').click();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);
  assert.equal(await page.locator('#savedProfile').isHidden(), true);
  await page.evaluate((key) => localStorage.setItem(key, '{bad json'), profileKey);
  await page.reload();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);
  checks.push('Delete and corrupt storage are handled without persisting private content');
  await page.evaluate(
    (key) =>
      localStorage.setItem(
        key,
        JSON.stringify({
          keys: ['stepFree'],
          minWidth: null,
          fictional: false,
          version: 1,
          savedAt: 1,
          expiresAt: 1 + 30 * 24 * 60 * 60 * 1000,
        }),
      ),
    profileKey,
  );
  await page.reload();
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);

  await page.route('**/api/profile-extract', (route) =>
    route.fulfill({ json: { keys: ['hearing'], minWidth: null, requiresConfirmation: true } }),
  );
  await page.locator('#profileRequest').fill('Je suis malentendant');
  assert.equal(await page.locator('#extractProfile').isDisabled(), true);
  await page.locator('#profileAiConsent').check();
  await page.locator('#extractProfile').click();
  await page.waitForFunction(() =>
    document.getElementById('profileStatus').textContent.includes('Proposition prête'),
  );
  assert.equal(await page.locator('#profileCriteria [value="hearing"]').isChecked(), true);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);
  assert.equal(await page.locator('#saveProfile').isDisabled(), true);
  await page.locator('#profileSaveConsent').check();
  await page.locator('#profileCriteria [value="stepFree"]').check();
  assert.equal(await page.locator('#saveProfile').isDisabled(), true);
  checks.push(
    'Controlled agent extraction requires separate AI consent and fresh storage confirmation after edits',
  );
  await page.unroute('**/api/profile-extract');
  await page.route('**/api/profile-extract', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.fulfill({ json: { keys: ['width'], minWidth: 95, requiresConfirmation: true } });
  });
  await page.locator('#extractProfile').click();
  await page.locator('#stopProfile').waitFor();
  assert.equal(await page.locator('#profileCriteria [value="stepFree"]').isDisabled(), true);
  assert.equal(await page.locator('#profileSaveConsent').isDisabled(), true);
  assert.equal(await page.locator('#saveProfile').isDisabled(), true);
  await page.locator('#profileAiConsent').uncheck();
  await page.waitForTimeout(800);
  assert.equal(await page.locator('#profileCriteria [value="stepFree"]').isChecked(), true);
  assert.equal(await page.locator('#profileCriteria [value="width"]').isChecked(), false);
  assert.match(await page.locator('#profileStatus').innerText(), /interrompue/);
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);
  checks.push(
    'Expired records are purged; pending extraction locks edits and save, consent withdrawal ignores its late response',
  );

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
  await blockedPage.locator('#profileExample').click();
  await blockedPage.locator('#profileSaveConsent').check();
  await blockedPage.locator('#saveProfile').click();
  assert.match(await blockedPage.locator('#saveProfileStatus').innerText(), /refuse/);
  await blocked.close();
  checks.push('Unavailable storage reports an error without breaking the page');
  assert.deepEqual(errors, []);
  await writeFile(
    `${output}/report.json`,
    JSON.stringify({ base, checks, errors, posts: posts.length }, null, 2),
  );
  console.log(JSON.stringify({ checks, errors, posts: posts.length }));
  await context.close();
} finally {
  await browser.close();
}
