import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import worker from '../worker/index.js';
import { createTestDatabase, fixtures } from '../test/helpers/database.mjs';
import { reviewSource, reviewResponse } from '../test/helpers/reviews.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const records = Array.from({ length: 15 }, (_, index) => ({
  ...fixtures[0],
  id: 'review-browser-' + index,
  name: 'Cabinet de test ' + String(index).padStart(2, '0'),
  address: `${index + 1} Rue Test 75001 Paris`,
  evidence: { ...fixtures[0].evidence, hearing: { value: true, status: 'declared', date: null } },
}));
const database = await createTestDatabase(records);
const original = globalThis.fetch;
const provider = [],
  requests = [];
let fail = false;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(options.body);
  provider.push(body);
  if (fail) {
    fail = false;
    return new Response('provider-secret', { status: 429 });
  }
  const identity = JSON.parse(body.input);
  return reviewResponse([
    reviewSource(identity, {
      title: '<img src=x onerror=alert(1)>',
      url: 'https://avis.exemple.fr/' + encodeURIComponent(identity.name),
    }),
    reviewSource(identity, {
      title: 'Avis du médecin · non attribué',
      url: 'https://avis.autre.fr/medecin',
      entityType: 'practitioner',
    }),
  ]);
};
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (req.url === '/api/reviews') requests.push(JSON.parse(raw.toString()));
  const abort = new AbortController();
  res.once('close', () => abort.abort());
  const response = await worker.fetch(
    new Request('http://' + req.headers.host + req.url, {
      method: req.method,
      headers: req.headers,
      signal: abort.signal,
      ...(raw.length ? { body: raw, duplex: 'half' } : {}),
    }),
    { DB: database, OPENAI_API_KEY: 'controlled-browser-key' },
  );
  res.writeHead(response.status, Object.fromEntries(response.headers));
  try {
    for await (const chunk of response.body || []) {
      if (res.destroyed) break;
      res.write(Buffer.from(chunk));
    }
    res.end();
  } catch {
    res.destroy();
  }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const page = await browser.newPage({
  viewport: { width: 390, height: 844 },
  reducedMotion: 'reduce',
});
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const base = 'http://127.0.0.1:' + server.address().port;
try {
  await page.goto(base + '/#recherche');
  assert.equal(provider.length, 0);
  await page.locator('.ai-option>summary').click();
  await page.locator('#reviewConsent').check();
  await page.locator('#description').fill('Sans contrainte géographique, équipement auditif.');
  await page.locator('#local').click();
  await page.getByRole('button', { name: 'Consulter l’annuaire public', exact: true }).click();
  await page.waitForFunction(
    () =>
      document.querySelectorAll('.review-content a').length >= 6 &&
      document.getElementById('agentActivity').hidden,
  );
  assert.equal(requests.length, 3);
  assert.equal(
    await page.locator('#agentActivity').evaluate((el) => el.parentElement.id),
    'resultStatus',
    'Review activity stays with the results while the conversation is folded',
  );
  assert.equal(provider.length, 3);
  assert.ok(requests.every((body) => Object.keys(body).sort().join(',') === 'consent,practiceId'));
  assert.ok(
    provider.every(
      (body) => Object.keys(JSON.parse(body.input)).sort().join(',') === 'address,entityType,name',
    ),
  );
  assert.equal(await page.locator('.review-content img').count(), 0);
  assert.match(
    await page.locator('.review-content').first().innerText(),
    /non attribué au cabinet/,
  );
  await page.getByRole('button', { name: 'Résultats suivants →', exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById('thread').getAttribute('aria-busy') === 'false',
  );
  assert.equal(requests.length, 3, 'Following result pages require an explicit reviews request');
  fail = true;
  await page.locator('.review-button').first().click();
  await page.getByRole('button', { name: 'Réessayer les avis', exact: true }).waitFor();
  assert.equal(await page.locator('.practice-card').count(), 3);
  assert.ok(!(await page.locator('.review-info').first().innerText()).includes('provider-secret'));
  await page.getByRole('button', { name: 'Réessayer les avis', exact: true }).click();
  await page.waitForFunction(() => document.querySelector('.review-content a'));
  assert.equal(requests.length, 5);
  await page.locator('#clear').click();
  assert.equal(await page.locator('.practice-card').count(), 0);
  assert.equal(await page.locator('#reviewConsent').isChecked(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(
    'Review sources passed: explicit consent, only first3 auto, manual following pages, public identity only, safe citations, entity separation, API errors/retry and mobile reset. Provider controlled; no paid call.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  database.close();
  globalThis.fetch = original;
}
