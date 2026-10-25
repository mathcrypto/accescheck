import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4197';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
await mkdir('output/chat-layout', { recursive: true });
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [390, 460],
    [768, 1024],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('dialog', async (dialog) => {
      errors.push(dialog.message());
      await dialog.dismiss();
    });
    await page.route('**/__dev/client.js*', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    await page.route('**/api/ai-config', (route) => route.fulfill({ json: { available: false } }));
    let showResults = false;
    let unsafeReply = false;
    await page.route('**/api/chat', (route) =>
      route.fulfill({
        json: {
          state: {},
          summary:
            'Dentiste, chirurgien dentiste\nLyon 3e Arrondissement · 69003\n3 km à vol d’oiseau\nEntrée sans marche\nEntrée sans marche',
          results: showResults
            ? {
                results: [],
                total: 0,
                page: 1,
                pageSize: 12,
                dataset: { exportedAt: '2026-10-25T12:00:00Z' },
                counts: { knownObstaclesExcluded: 0 },
              }
            : null,
          reply: unsafeReply
            ? '### <img src=x onerror=alert(1)>\n\n- **<script>alert(1)</script>** : texte\n\n3. <a href=javascript:alert(1)>Lien</a>'
            : showResults
              ? '### Résultats\n\n- **Entrée** : déclarée\n- **Largeur** : inconnue'
              : '### Informations à préciser\n\n- **Entrée** : sans marche demandée\n- **Largeur** : non précisée\n\n1. Choisissez le lieu.\n2. Confirmez les critères.',
          question:
            showResults || unsafeReply
              ? null
              : {
                  id: 'location',
                  options: [
                    {
                      value: '0',
                      label:
                        'Lyon 3e Arrondissement · 69003 · 69, Rhône, Auvergne-Rhône-Alpes · point approximatif',
                    },
                    { value: '__free__', label: 'Saisir un autre lieu' },
                    { value: '__unknown__', label: 'Je ne sais pas' },
                  ],
                },
        },
      }),
    );
    await page.goto(base + '/#recherche');
    await page
      .locator('#description')
      .fill(
        'Je cherche un dentiste à Lyon 3e, dans un rayon de 3 km, avec une entrée sans marche.',
      );
    const response = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
    await page.locator('#description').press('Enter');
    await response;
    await page.waitForFunction(
      () => document.getElementById('thread').getAttribute('aria-busy') === 'false',
    );
    assert.equal(
      await page.locator('#descriptionForm').evaluate((el) => getComputedStyle(el).position),
      'static',
      'The composer must follow the conversation instead of floating over it',
    );
    const user = page.locator('.bubble.user').last();
    const latest = page.locator('.bubble.agent').last();
    const userBox = await user.boundingBox();
    const agentBox = await latest.boundingBox();
    assert.ok(userBox.x > agentBox.x, 'User messages sit on the right');
    assert.equal(
      await user.evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgb(246, 246, 246)',
    );
    assert.equal(
      await latest.evaluate((el) => getComputedStyle(el).backgroundColor),
      'rgba(0, 0, 0, 0)',
      'Agent replies have no bubble background',
    );
    assert.equal(await latest.locator('.chat-recap').count(), 0);
    assert.equal(await latest.locator('.say ul > li').count(), 2);
    assert.equal(await latest.locator('.say ol > li').count(), 2);
    assert.equal(await latest.locator('.say strong').first().innerText(), 'Entrée');
    assert.equal(await latest.locator('.say h3').innerText(), 'Informations à préciser');
    const bounds = await latest.boundingBox();
    const historyHeight = await page.locator('#chatHistory').evaluate((el) => el.clientHeight);
    await page.screenshot({ path: `output/chat-layout/question-${width}x${height}.png` });
    if (width <= 600 || height <= 600)
      assert.ok(
        historyHeight >= bounds.height,
        `At ${width}x${height}, the ${Math.round(bounds.height)}px question is clipped inside ${historyHeight}px of chat history`,
      );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    for (const choice of await latest.locator('button').all()) {
      await choice.scrollIntoViewIfNeeded();
      const box = await choice.boundingBox();
      assert.ok(box.x >= 0 && box.x + box.width <= width + 1 && box.height >= 44);
    }
    await page.getByRole('button', { name: 'Saisir un autre lieu', exact: true }).click();
    assert.equal(
      await page.locator('#description').evaluate((el) => el === document.activeElement),
      true,
    );
    await page.keyboard.type('Finalement Marseille 8e');
    assert.equal(await page.locator('#description').inputValue(), 'Finalement Marseille 8e');
    showResults = true;
    const resultsResponse = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
    await page.locator('#description').press('Enter');
    await resultsResponse;
    await page.waitForFunction(
      () => document.getElementById('thread').getAttribute('aria-busy') === 'false',
    );
    assert.equal(await page.locator('#resultsCriteria li').count(), 4);
    assert.equal(await page.locator('#resultsSummary ul > li').count(), 2);
    assert.equal(await page.locator('#resultsSummary strong').first().innerText(), 'Entrée');
    await page.locator('#chatFoldSummary').click();
    await page.locator('#descriptionForm').scrollIntoViewIfNeeded();
    const fold = await page.locator('#chatFold').boundingBox();
    const composer = await page.locator('#descriptionForm').boundingBox();
    const results = await page.locator('#resultsSection').boundingBox();
    assert.ok(composer.y >= fold.y + fold.height - 1, 'Composer follows the conversation');
    assert.ok(composer.y + composer.height <= results.y, 'Composer precedes the results');
    assert.equal(
      await page.locator('#descriptionForm').evaluate((el) => getComputedStyle(el).position),
      'static',
      'Results must not pin the composer to the top of the screen',
    );
    await page.screenshot({ path: `output/chat-layout/results-${width}x${height}.png` });
    showResults = false;
    unsafeReply = true;
    await page.locator('#description').fill('Vérifier le rendu du texte');
    const unsafeResponse = page.waitForResponse((r) => r.url().endsWith('/api/chat'));
    await page.locator('#description').press('Enter');
    await unsafeResponse;
    await page.waitForFunction(
      () => document.getElementById('thread').getAttribute('aria-busy') === 'false',
    );
    const unsafe = page.locator('.bubble.agent').last().locator('.say');
    assert.equal(await unsafe.locator('img, script, a').count(), 0);
    assert.equal(await page.locator('.bubble.agent').last().locator('.chat-recap li').count(), 4);
    assert.equal(await unsafe.locator('strong').innerText(), '<script>alert(1)</script>');
    assert.equal(await unsafe.locator('ol li').getAttribute('value'), '3');
    assert.match(await unsafe.innerText(), /onerror=alert/);
    await page.locator('#clear').click();
    assert.equal(await page.locator('.bubble').count(), 0);
    assert.equal(await page.locator('#description').inputValue(), '');
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Chat layout passed: complete mobile questions, long choices, composer below the conversation before/after results, free text focus, reset, no horizontal overflow or JS errors at 320/390/768/1440px and short screens.',
  );
} finally {
  await browser.close();
}
