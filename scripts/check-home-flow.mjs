import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import worker from '../worker/index.js';
import { createTestDatabase, fixtures } from '../test/helpers/database.mjs';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = {
  label: '99 Rue de Rivoli 75001 Paris',
  latitude: 48.86,
  longitude: 2.34,
  approximate: false,
};
const records = fixtures.map((record, index) => ({
  ...record,
  location: { latitude: origin.latitude + index * 0.001, longitude: origin.longitude },
  evidence: {
    ...record.evidence,
    hearing: {
      value: index === 0 ? true : index === 1 ? null : false,
      status: index === 1 ? 'unknown' : 'declared',
      date: null,
    },
  },
}));
const database = await createTestDatabase(records);
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  const result = await worker.fetch(
    new Request('http://' + request.headers.host + request.url, {
      method: request.method,
      headers: request.headers,
      ...(body.length ? { body, duplex: 'half' } : {}),
    }),
    { DB: database },
  );
  response.writeHead(result.status, Object.fromEntries(result.headers));
  response.end(Buffer.from(await result.arrayBuffer()));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  reducedMotion: 'no-preference',
});
const errors = [],
  discoveries = [],
  interpretations = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {
  if (request.url().endsWith('/api/discover')) discoveries.push(request.postDataJSON());
});
await page.route('**/api/ai-config', (route) =>
  route.fulfill({ json: { available: true, model: 'test-only' } }),
);
await page.route('**/api/interpret', (route) => {
  const body = route.request().postDataJSON();
  interpretations.push(body);
  assert.deepEqual(Object.keys(body).sort(), ['consent', 'description']);
  assert.equal(body.consent, true);
  return route.fulfill({
    json: {
      keys: ['hearing'],
      minWidth: null,
      questions: [],
      parser: 'Proposition IA simulée',
      requiresConfirmation: true,
    },
  });
});
await page.route('**/api/locations', (route) => {
  assert.deepEqual(route.request().postDataJSON(), { query: '99 Rue de Rivoli' });
  return route.fulfill({ json: { locations: [origin] } });
});
try {
  await page.goto(base);
  await page.locator('.intro-photo img').evaluate((image) => image.decode());
  await page.waitForFunction(() =>
    document.querySelector('#aiStatus').textContent.includes('OpenAI propose'),
  );
  assert.equal(await page.locator('#advancedSearch').getAttribute('open'), null);
  assert.equal(await page.locator('#resultsSection').isHidden(), true);
  assert.equal(discoveries.length, 0);
  assert.equal(interpretations.length, 0);
  await page.locator('.intro-link').click();
  assert.equal(
    await page
      .locator('.brand-mark')
      .evaluate((element) =>
        element.getAnimations().some((animation) => animation.playState === 'running'),
      ),
    true,
  );
  await page.locator('#description').fill('Je suis malentendant.');
  await page.locator('#description').press('Enter');
  await page.locator('#review').waitFor({ state: 'visible' });
  assert.equal(await page.locator('#criteria input[value="hearing"]').isChecked(), true);
  assert.equal(interpretations.length, 0);
  assert.equal(discoveries.length, 0);
  await page.locator('#search').click();
  assert.equal(discoveries.length, 0);
  await page.locator('#advancedSearch>summary').click();
  await page.locator('#location').fill('99 Rue de Rivoli');
  await page.locator('#findLocation').click();
  await page.getByRole('button', { name: origin.label, exact: true }).click();
  await page.locator('#radius').selectOption('5');
  await page.locator('#confirmed').check();
  await page.locator('#search').click();
  await page.waitForFunction(() => document.querySelectorAll('.practice-card').length === 2);
  await page.waitForFunction(
    () => document.querySelector('#resultsTitle').getBoundingClientRect().top < 200,
  );
  assert.deepEqual(discoveries[0].needs.keys, ['hearing']);
  assert.equal(discoveries[0].confirmed, true);
  assert.equal(discoveries[0].radiusKm, 5);
  assert.equal(discoveries[0].origin.label, origin.label);
  assert.equal('description' in discoveries[0], false);
  assert.match(await page.locator('.distance').first().textContent(), /km à vol d’oiseau/);
  await page.locator('#criteria input[value="hearing"]').uncheck();
  assert.equal(await page.locator('#confirmed').isChecked(), false);
  assert.equal(await page.locator('#resultsSection').isHidden(), true);
  await page.locator('#clear').click();
  await page.locator('#description').fill('Je suis malentendant.');
  await page.locator('#advancedSearch>summary').click();
  await page.locator('.ai-option>summary').click();
  await page.locator('#translate').click();
  assert.equal(interpretations.length, 0);
  await page.locator('#consent').check();
  await page.locator('#translate').click();
  await page.waitForFunction(() =>
    document.querySelector('#proposalSource').textContent.includes('simulée'),
  );
  assert.equal(interpretations.length, 1);
  assert.equal(discoveries.length, 1);
  await page.locator('#clear').click();
  await page.locator('#advancedSearch>summary').click();
  await page.locator('#manual').click();
  assert.equal(await page.locator('#criteria input:checked').count(), 0);
  await page.locator('#clear').click();
  await mkdir('output/home-flow', { recursive: true });
  for (const width of [320, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.goto(base);
    await page.locator('.intro-photo img').evaluate((image) => image.decode());
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `output/home-flow/intro-${width}.png` });
    await page.locator('.intro-link').click();
    await page.waitForFunction(
      () => Math.abs(document.querySelector('#recherche').getBoundingClientRect().top) < 2,
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `output/home-flow/search-${width}.png` });
  }
  assert.deepEqual(errors, []);
  console.log(
    'Homepage passed: no automatic search or AI, local/manual review, consent-gated AI, confirmed distance search, invalidation, logo rotation and four responsive widths.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  database.close();
}
