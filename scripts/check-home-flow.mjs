import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import worker from '../worker/index.js';
import { createTestDatabase, fixtures } from '../test/helpers/database.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const origin = { label: 'Lyon 69001', latitude: 45.767, longitude: 4.835, approximate: true };
const records = fixtures.map((record, index) => ({
  ...record,
  location: { latitude: origin.latitude + index * 0.001, longitude: origin.longitude },
}));
const database = await createTestDatabase(records);
const upstream = [];
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, options) => {
  if (new URL(url).hostname === 'data.geopf.fr')
    return Response.json({
      features: [
        {
          geometry: { coordinates: [origin.longitude, origin.latitude] },
          properties: { label: origin.label, postcode: '69001', type: 'municipality' },
        },
      ],
    });
  assert.equal(url, 'https://api.openai.com/v1/responses');
  upstream.push(JSON.parse(options.body));
  return Response.json({
    status: 'completed',
    output: [
      {
        type: 'message',
        content: [
          {
            type: 'output_text',
            text: JSON.stringify({ keys: ['hearing'], minWidth: null, questions: [] }),
          },
        ],
      },
    ],
  });
};
const requests = [];
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const body = Buffer.concat(chunks);
  if (request.url === '/api/chat') requests.push(JSON.parse(body.toString()));
  const result = await worker.fetch(
    new Request('http://' + request.headers.host + request.url, {
      method: request.method,
      headers: request.headers,
      ...(body.length ? { body, duplex: 'half' } : {}),
    }),
    { DB: database, OPENAI_API_KEY: 'browser-test-key' },
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
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const idle = () =>
  page.waitForFunction(
    () => document.getElementById('thread').getAttribute('aria-busy') !== 'true',
  );
async function send(message) {
  await page.locator('#description').fill(message);
  await page.locator('#description').press('Enter');
  await idle();
}
async function choose(name) {
  await page.getByRole('button', { name, exact: true }).last().click();
  await idle();
}
try {
  await page.goto(base);
  await page.locator('.intro-photo img').evaluate((image) => image.decode());
  await page.waitForFunction(() =>
    document.getElementById('aiStatus').textContent.includes('disponible'),
  );
  assert.equal(requests.length, 0);
  assert.equal(upstream.length, 0);
  assert.equal(await page.locator('form').count(), 1);
  await page.locator('.intro-link').click();
  assert.equal(
    await page
      .locator('.brand-mark')
      .evaluate((element) =>
        element.getAnimations().some((animation) => animation.playState === 'running'),
      ),
    true,
  );
  await send('Généraliste à Lyon, fauteuil roulant.');
  assert.equal(
    await page.locator('.bubble.agent').last().getAttribute('data-question'),
    'location',
  );
  assert.equal(await page.getByRole('button', { name: /Confirmer et chercher/ }).count(), 0);
  await choose(origin.label + ' · point approximatif');
  await choose('3 km');
  assert.equal(await page.locator('.bubble.agent').last().getAttribute('data-question'), 'width');
  await send('20 cm');
  assert.match(await page.locator('#chatStatus').innerText(), /40 à 200/);
  await send('0,9 m');
  assert.match(await page.locator('.bubble.agent').last().innerText(), /90 cm/);
  assert.equal(requests.filter((body) => body.action === 'confirm').length, 0);
  await choose('Confirmer et chercher');
  await page.locator('.practice-card').first().waitFor();
  const confirmed = requests.find((body) => body.action === 'confirm');
  assert.equal(confirmed.state.radiusKm, 3);
  assert.equal(confirmed.state.origin.label, origin.label);
  assert.equal(confirmed.state.needs.minWidth, 90);
  assert.equal(confirmed.message, undefined);
  assert.match(await page.locator('.distance').first().innerText(), /km de votre adresse/);
  await send('Finalement, équipement auditif.');
  assert.equal(await page.locator('.practice-card').count(), 0);
  assert.equal(upstream.length, 0);
  await page.locator('#clear').click();
  await send('Bonjour');
  for (let step = 0; step < 3; step++) await choose('Je ne sais pas');
  assert.match(await page.locator('.bubble.agent').last().innerText(), /non précisés/);
  await choose('Confirmer et chercher');
  await page.locator('.practice-card').first().waitFor();
  await page.locator('#clear').click();
  await page.locator('.ai-option>summary').click();
  await page.locator('#consent').check();
  await send('Généraliste sans contrainte géographique, équipement auditif.');
  assert.equal(upstream.length, 1);
  assert.equal(upstream[0].store, false);
  assert.equal(upstream[0].tools, undefined);
  assert.equal(upstream[0].input.length, 1);
  await page.locator('#clear').click();
  assert.equal(await page.locator('#consent').isChecked(), false);
  await mkdir('output/home-flow', { recursive: true });
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: width < 600 ? 844 : 1000 });
    await page.goto(base);
    await page.reload();
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
    'Chat passed: contextual choices/free text/unknown, IGN confirmation, width errors and units, explicit confirmation, correction, consent and five responsive widths. Provider responses controlled; no paid call.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  database.close();
  globalThis.fetch = realFetch;
}
