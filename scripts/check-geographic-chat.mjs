import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4181';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
await mkdir('output/geography', { recursive: true });
try {
  for (const width of [320, 390, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width < 600 ? 844 : 1000 },
      reducedMotion: 'reduce',
    });
    // Freeze development reloads while one browser journey is in progress.
    await page.route('**/__dev/client.js*', (route) =>
      route.fulfill({ contentType: 'text/javascript', body: '' }),
    );
    const errors = [],
      requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().endsWith('/api/chat')) requests.push(request.postDataJSON());
    });
    await page.addInitScript(() => {
      const fetch = window.fetch;
      window.chatResponses = [];
      window.fetch = async (...args) => {
        const response = await fetch(...args);
        if (args[0] === '/api/chat')
          response
            .clone()
            .text()
            .then((text) => window.chatResponses.push(text));
        return response;
      };
    });
    async function perform(action) {
      const index = await page.evaluate(() => window.chatResponses.length);
      await action();
      await page.waitForFunction((index) => window.chatResponses.length > index, index);
      const text = await page.evaluate((index) => window.chatResponses[index], index);
      const events = text
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line));
      const result = events.find((event) => event.type === 'result')?.value;
      assert.ok(result && !result.error, text.slice(0, 300));
      await page.waitForFunction(
        () => document.getElementById('thread').getAttribute('aria-busy') !== 'true',
      );
      return result;
    }
    await page.goto(base + '/#recherche');
    await page.locator('#description').fill('Un dentiste à Lyon 3e');
    const first = await perform(() => page.locator('#description').press('Enter'));
    assert.equal(first.state.placeQuery.toLowerCase(), 'lyon 3e');
    assert.ok(first.state.locationChoices.length > 0);
    assert.ok(
      first.state.locationChoices.every(
        (place) => place.cityCode === '69383' && place.postcode === '69003' && place.district === 3,
      ),
    );
    assert.equal(first.question.id, 'location');
    await perform(() => page.getByRole('button', { name: /Lyon 3e Arrondissement/ }).click());
    await perform(() => page.getByRole('button', { name: '3 km', exact: true }).click());
    await perform(() =>
      page.getByRole('button', { name: 'Pas de contrainte particulière', exact: true }).click(),
    );
    const found = await perform(() =>
      page.getByRole('button', { name: 'Confirmer et chercher', exact: true }).click(),
    );
    assert.ok(found.results.total > 0, 'The public local snapshot contains Lyon 3e dentists');
    assert.ok(found.results.results.every((practice) => practice.postalCode === '69003'));
    assert.ok(
      (await page.locator('.practice-card .address').allTextContents()).every((address) =>
        /69003/.test(address),
      ),
    );
    assert.equal(await page.locator('#description').isEditable(), true);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `output/geography/lyon3e-${width}.png` });
    await page.locator('#description').fill('Finalement un dentiste à Marseille 8e');
    const changed = await perform(() => page.locator('#description').press('Enter'));
    assert.equal(changed.state.origin, null);
    assert.equal(changed.state.placeQuery.toLowerCase(), 'marseille 8e');
    assert.ok(changed.state.locationChoices.length > 0);
    assert.ok(
      changed.state.locationChoices.every(
        (place) => place.cityCode === '13208' && place.postcode === '13008',
      ),
    );
    assert.equal(await page.locator('.practice-card').count(), 0);
    assert.ok(requests.every((body) => body.consent === false));
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Real IGN/browser passed: full Lyon3e prompt, retained69383/69003, district-only dentists, correction to Marseille8e, 320/390/1440px. No paid provider call.',
  );
} finally {
  await browser.close();
}
