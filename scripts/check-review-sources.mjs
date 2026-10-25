import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import worker from '../worker/index.js';
import { createTestDatabase, fixtures } from '../test/helpers/database.mjs';
import { reviewSource, reviewResponse } from '../test/helpers/reviews.mjs';
import { controlledSearch, modelAnswer } from '../test/helpers/search-agent.mjs';
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
let expectedFirst = null;
let observedFirst = null;
globalThis.fetch = async (url, options) => {
  assert.equal(url, 'https://api.openai.com/v1/responses');
  const body = JSON.parse(options.body);
  if (Array.isArray(body.input)) {
    if (expectedFirst) {
      const context = JSON.parse(
        body.input.findLast((item) => item.role === 'developer').content,
      ).verifiedContext;
      observedFirst = context.results.practices[0].id;
      return modelAnswer('Je reprends le premier cabinet affiché.');
    }
    return controlledSearch(body);
  }
  provider.push(body);
  if (fail) {
    fail = false;
    return new Response('provider-secret', { status: 429 });
  }
  const identity = JSON.parse(body.input);
  const limited = identity.name.endsWith('02');
  const sentiment = identity.name.endsWith('00') ? 'negative' : 'positive';
  const observation = (id, topic, opinion = sentiment) => ({
    text: 'Retour fictif sur ' + topic + ' ' + id,
    reviewId: id,
    publishedAt: '2026-10-20',
    originalUrl: null,
    themes: [{ topic, sentiment: opinion }],
  });
  return reviewResponse([
    reviewSource(identity, {
      title: '<img src=x onerror=alert(1)>',
      url: 'https://avis.exemple.fr/' + encodeURIComponent(identity.name),
      observations: [observation('a', 'accueil'), observation('b', 'ecoute')],
    }),
    reviewSource(identity, {
      title: 'Avis du médecin · non attribué',
      url: 'https://avis.autre.fr/medecin',
      entityType: 'practitioner',
      observations: [observation('doctor', 'organisation', 'positive')],
    }),
    reviewSource(identity, {
      title: 'Deuxième site du cabinet',
      url: 'https://avis.autre.fr/' + encodeURIComponent(identity.name),
      observations: limited ? [] : [observation('c', 'attente')],
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
  viewport: { width: Number(process.env.BROWSER_WIDTH || 390), height: 844 },
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
  await page.getByRole('button', { name: 'Accepter et poursuivre', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer et chercher', exact: true }).click();
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
  assert.deepEqual(
    await page
      .locator('.practice-card')
      .evaluateAll((cards) => cards.slice(0, 3).map((card) => card.dataset.practice)),
    ['review-browser-1', 'review-browser-0', 'review-browser-2'],
  );
  assert.match(
    await page
      .locator('.practice-card[data-practice="review-browser-1"] .review-content')
      .innerText(),
    /Retours consultés plutôt favorables/,
  );
  assert.match(
    await page
      .locator('.practice-card[data-practice="review-browser-0"] .review-content')
      .innerText(),
    /Difficultés dans les retours consultés/,
  );
  assert.match(
    await page
      .locator('.practice-card[data-practice="review-browser-2"] .review-content')
      .innerText(),
    /Avis insuffisants/,
  );
  await page.getByText('Accueil, écoute, attente et organisation', { exact: true }).first().click();
  await mkdir('output/review-sentiment', { recursive: true });
  await page.locator('.review-content').first().scrollIntoViewIfNeeded();
  await page.screenshot({
    path: `output/review-sentiment/reviews-${process.env.BROWSER_WIDTH || 390}.png`,
  });

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
  await page.getByRole('button', { name: '← Précédent', exact: true }).click();
  await page.waitForFunction(
    () => document.getElementById('thread').getAttribute('aria-busy') === 'false',
  );
  expectedFirst = await page.locator('.practice-card').first().getAttribute('data-practice');
  await page.locator('#description').fill('Explique le premier cabinet affiché');
  await page.locator('#local').click();
  await page.waitForFunction(
    () => document.getElementById('thread').getAttribute('aria-busy') === 'false',
  );
  assert.equal(observedFirst, expectedFirst);
  await page.locator('#clear').click();
  assert.equal(await page.locator('.practice-card').count(), 0);
  assert.equal(await page.locator('#reviewConsent').isChecked(), false);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(
    'Review sources passed: explicit consent, only first3 auto, manual following pages, public identity only, safe citations, entity separation, sourcedthemes/limitedsample, neutralmissingreputation, orderedtie-break, API errors/retry and mobile reset. Provider controlled; no paid call.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  database.close();
  globalThis.fetch = original;
}
