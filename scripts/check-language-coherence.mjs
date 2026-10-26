import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4195';
const output = 'output/language-coherence';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const report = { base, checks: [], errors: [], posts: [] };
const profileKey = 'accescheck.access-profile.v1';
const raw = 'Vous avez dit Oui. Entrée sans marche : Non.';
async function context(options = {}, controlledChat = true) {
  const value = await browser.newContext({ reducedMotion: 'reduce', ...options });
  value.on('page', (page) => {
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() === 'POST') report.posts.push(new URL(request.url()).pathname);
    });
  });
  await value.route('**/api/ai-config', (route) =>
    route.fulfill({ json: { available: controlledChat } }),
  );
  if (controlledChat)
    await value.route('**/api/chat', (route) => {
      assert.equal(route.request().postDataJSON().lang, 'en');
      return route.fulfill({
        contentType: 'application/x-ndjson',
        body:
          JSON.stringify({
            type: 'result',
            value: {
              mode: 'agent',
              reply: 'Vérifiez ces critères.',
              summary: 'Entrée sans marche',
              state: { proposal: { needs: { keys: ['stepFree', 'width'], minWidth: 95 } } },
              actions: [],
              question: null,
              results: null,
            },
          }) + '\n',
      });
    });
  return value;
}
async function menu(page) {
  if (!(await page.locator('.menu').evaluate((node) => node.open)))
    await page.locator('.menu > summary').click();
}
try {
  let sharedIcon;
  for (const language of ['fr', 'en']) {
    const ctx = await context();
    const page = await ctx.newPage();
    for (const [path, current] of [
      ['/', '/'],
      ['/profil', '/profil'],
      ['/consultation', '/consultation'],
    ]) {
      await page.goto(`${base}${path}?lang=${language}`);
      await page.locator('html').waitFor({ state: 'attached' });
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      assert.equal(await page.locator('a[aria-current="page"]').count(), 1);
      assert.equal(
        new URL(await page.locator('a[aria-current="page"]').getAttribute('href'), base).pathname,
        current,
      );
      const icon = await page.locator('link[rel="icon"]').getAttribute('href');
      sharedIcon ||= icon;
      assert.equal(icon, sharedIcon, 'All pages share the brand favicon');
      await menu(page);
      assert.equal(
        await page.locator('#langSwitch').innerText(),
        language === 'en' ? 'Français' : 'English',
      );
      assert.equal(
        await page.locator('.menu nav a').nth(3).innerText(),
        language === 'en' ? 'My access profile' : 'Mon profil d’accès',
      );
      await page.locator('.menu > summary').click();
      if (language === 'en') {
        assert.doesNotMatch(await page.title(), /L’échange|Mon profil|Préparer/);
        const html = await page.locator('body').innerText();
        assert.doesNotMatch(
          html,
          /Variante 04|Votre profil|Microphone coupé|Vos besoins sont|Effacer la session/,
        );
      }
      for (const width of [320, 390, 768, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        assert.equal(
          await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
          false,
          `${path} ${language} ${width}: overflow`,
        );
        await page.screenshot({
          path: `${output}/${language}-${path.replaceAll('/', '') || 'home'}-${width}.png`,
        });
      }
      report.checks.push(
        `${language} ${path}: shared navigation, title, favicon and four responsive widths`,
      );
    }
    await ctx.close();
  }

  const ctx = await context();
  const page = await ctx.newPage();
  await page.goto(base + '/?lang=en#recherche');
  await page.locator('.ai-option > summary').click();
  await page.locator('#consent').check();
  await page.locator('#description').fill(raw);
  await page.locator('#description').press('Enter');
  await page.locator('#profileOffer').waitFor();
  assert.equal(await page.locator('.bubble.user .say').innerText(), raw);
  assert.match(
    await page.locator('#profileOfferSummary').innerText(),
    /Step-free entrance.*Clear width ≥ 95 cm/,
  );
  await page.locator('#profileInlineConsent').check();
  await page.locator('#saveInlineProfile').click();
  await page.reload();
  await page.locator('#reuseProfile').click();
  assert.match(
    await page.locator('#description').inputValue(),
    /For my search.*check: Step-free entrance Entrance door width/,
  );
  assert.equal(await page.locator('#consent').isChecked(), false);
  assert.equal(report.posts.length, 1, 'Reusing a profile never sends a request');
  await page.locator('#profileSaved a').click();
  await page.waitForLoadState();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.match(await page.locator('#savedProfileFacts').innerText(), /Step-free entrance/);
  assert.match(
    await page.locator('#savedProfileWidth').innerText(),
    /Confirmed minimum width: 95 cm/,
  );
  assert.match(await page.locator('#profileExpiry').innerText(), /^Reusable in this browser until/);
  await page.locator('#deleteProfile').click();
  assert.equal(
    await page.locator('#profileStatus').innerText(),
    'Profile deleted from this device.',
  );
  assert.equal(await page.evaluate((key) => localStorage.getItem(key), profileKey), null);
  report.checks.push(
    'English extraction/save/reload/reuse/management/delete, raw request unchanged, no automatic send or consent',
  );

  await menu(page);
  await page.locator('.menu a').filter({ hasText: 'During the visit' }).click();
  await page.waitForLoadState();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.locator('[data-phrase]').first().click();
  assert.equal(await page.locator('#reply').inputValue(), 'Could you repeat that, please?');
  await page.locator('#reply').fill(raw);
  await page.locator('#showReply').click();
  assert.equal(await page.locator('#transcript .say').last().innerText(), raw);
  await page.locator('#manualToggle').click();
  assert.equal(await page.locator('#manualTitle').innerText(), 'The clinician’s words');
  await page.locator('#manualDoctor').fill(raw);
  await page.locator('#addDoctor').click();
  assert.equal(await page.locator('#transcript .say').last().innerText(), raw);
  await page.locator('#notesTab').click();
  await page.locator('#draftNotes').click();
  const notes = await page.locator('#notes').inputValue();
  assert.match(notes, /^CONVERSATION DRAFT/);
  assert.ok(notes.includes(raw));
  assert.match(await page.locator('#notes').getAttribute('placeholder'), /discussed|confirmed/i);
  await menu(page);
  await page.locator('#langSwitch').click();
  await page.locator('#leaveDialog').waitFor();
  assert.equal(await page.locator('#leaveTitle').innerText(), 'Leave the conversation?');
  await page.locator('#cancelLeave').click();
  assert.equal(await page.locator('#notes').inputValue(), notes);
  await menu(page);
  await page.locator('#langSwitch').click();
  await page.locator('#confirmLeave').click();
  await page.waitForURL('**/consultation?lang=fr');
  assert.equal(await page.locator('html').getAttribute('lang'), 'fr');
  assert.equal(await page.locator('#transcript .say').count(), 0);
  report.checks.push(
    'English consultation, suggestions, dialogs and generated notes; verbatim messages preserved; language change respects leave/cancel/clear',
  );
  await ctx.close();

  const refused = await context();
  await refused.addInitScript(() => {
    Storage.prototype.getItem = Storage.prototype.setItem = () => {
      throw new Error('Storage refused');
    };
  });
  const blocked = await refused.newPage();
  await blocked.goto(base + '/?lang=en');
  assert.equal(await blocked.locator('html').getAttribute('lang'), 'en');
  await menu(blocked);
  await blocked.locator('.menu a').filter({ hasText: 'My access profile' }).click();
  await blocked.waitForLoadState();
  assert.equal(await blocked.locator('html').getAttribute('lang'), 'en');
  assert.match(
    await blocked.locator('#profileStatus').innerText(),
    /^Browser storage is unavailable/,
  );
  await refused.close();
  report.checks.push(
    'Explicit English and internal navigation remain English when browser storage is refused',
  );

  const directory = await context({}, false);
  const search = await directory.newPage();
  await search.goto(base + '/?lang=en#recherche');
  assert.equal(await search.locator('#consent').isChecked(), false);
  assert.equal(await search.locator('#reviewConsent').isChecked(), false);
  await search.locator('#description').fill('Généraliste, équipement auditif, partout en France.');
  await search.locator('#description').press('Enter');
  await search.getByRole('button', { name: 'Open the public directory', exact: true }).waitFor();
  const notice = await search.locator('.bubble.agent .say').last().innerText();
  assert.match(notice, /The OpenAI agent is unavailable|Your consent is needed/);
  assert.doesNotMatch(notice, /L’agent|Votre accord|Évitez/);
  await search.getByRole('button', { name: 'Open the public directory', exact: true }).click();
  const card = search.locator('.practice-card').first();
  await card.waitFor();
  const practiceName = await card.locator('h3').innerText();
  const handoff = card.getByRole('link', { name: /Prepare the conversation/ });
  assert.equal(new URL(await handoff.getAttribute('href'), base).searchParams.get('lang'), 'en');
  const popupPromise = search.waitForEvent('popup');
  await handoff.click();
  const popup = await popupPromise;
  await popup.locator('#practiceContext').waitFor();
  assert.equal(await popup.locator('html').getAttribute('lang'), 'en');
  assert.equal(await popup.locator('#practiceName').innerText(), practiceName);
  assert.equal(await popup.locator('#notesTab').innerText(), 'My notes');
  await popup.close();
  assert.match(await search.locator('#resultsTitle').innerText(), /Information for your visit/);
  assert.match(
    await search.locator('#resultsSummary').innerText(),
    /Public directory: no needs or location have been interpreted\./,
  );
  assert.match(
    await search.locator('#resultsSummary').innerText(),
    /Fallback mode without an agent\./,
  );
  for (const width of [320, 390, 768, 1440]) {
    await search.setViewportSize({ width, height: 900 });
    assert.equal(
      await search.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await search.screenshot({ path: `${output}/en-results-${width}.png` });
  }
  await directory.close();
  report.checks.push(
    'English public-directory results and new-tab consultation retain language, practice identity and search; no AI consent',
  );
  const fixture = await context();
  const response = await fixture.request.post(base + '/api/discover', {
    data: { confirmed: true, needs: { keys: [], minWidth: null } },
  });
  assert.equal(response.status(), 200);
  const result = await response.json();
  const name = 'Cabinet Oui · exemple fictif';
  result.results = [
    { ...result.results[0], name, sourceUrl: 'https://acceslibre.beta.gouv.fr/test-fictionnel/' },
  ];
  result.total = 1;
  await fixture.route('**/api/chat', (route) =>
    route.fulfill({
      contentType: 'application/x-ndjson',
      body:
        JSON.stringify({
          type: 'result',
          value: {
            mode: 'agent',
            reply: 'Résultats de la recherche confirmée.',
            state: { notes: ['Demander un échange écrit.'] },
            results: result,
            actions: [],
            question: null,
          },
        }) + '\n',
    }),
  );
  const extra = await fixture.newPage();
  await extra.goto(base + '/?lang=en#recherche');
  await extra.locator('.ai-option > summary').click();
  await extra.locator('#reviewConsent').uncheck();
  await extra.locator('#description').fill('Exemple fictif contrôlé.');
  await extra.locator('#description').press('Enter');
  const extraCard = extra.locator('.practice-card').first();
  await extraCard.waitFor();
  assert.equal(
    await extraCard.locator('summary').first().innerText(),
    'Details · needs to confirm',
  );
  assert.equal(await extraCard.getAttribute('aria-label'), name);
  assert.equal(await extraCard.locator('h3').innerText(), name);
  assert.equal(
    await extraCard.locator('a').filter({ hasText: 'Accès Libre ↗' }).getAttribute('aria-label'),
    'Accès Libre card ↗ (new tab)',
  );
  assert.match(
    await extra.locator('#resultsSummary').innerText(),
    /Results for the confirmed search\./,
  );
  await fixture.close();
  report.checks.push(
    'Controlled additional-needs card and accessible source label are English; practice identity stays verbatim in visible and accessible names',
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.posts, ['/api/chat', '/api/chat', '/api/chat', '/api/chat']);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
