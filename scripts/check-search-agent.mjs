import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import worker from '../worker/index.js';
import { createTestDatabase, fixtures } from '../test/helpers/database.mjs';
import { controlledSearch, controlledGeography } from '../test/helpers/search-agent.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const records = Array.from({ length: 15 }, (_, index) => ({
  ...fixtures[1],
  id: 'lyon-agent-' + index,
  name:
    'Cabinet test ' +
    String(index).padStart(2, '0') +
    (index === 14 ? ' · ' + 'CentreDentaire'.repeat(6) : ''),
  address: `${index + 1} Rue Test 69003 Lyon`,
  postalCode: '69003',
  location: { latitude: 45.751578 + index * 0.0001, longitude: 4.869577 },
}));
const database = await createTestDatabase(records);
const original = globalThis.fetch;
let paused = false,
  fail = false,
  release,
  aborted = 0;
const provider = [];
let signalProviderStart;
const providerStarted = new Promise((resolve) => (signalProviderStart = resolve));
globalThis.fetch = async (url, options) => {
  const hostname = new URL(url).hostname;
  if (hostname === 'data.geopf.fr')
    return process.env.REAL_IGN === '1' ? original(url, options) : controlledGeography(url);
  assert.equal(hostname, 'api.openai.com');
  const body = JSON.parse(options.body);
  provider.push(body);
  if (fail) {
    fail = false;
    return new Response('private-provider-response', { status: 429 });
  }
  if (paused)
    await new Promise((resolve, reject) => {
      release = () => {
        paused = false;
        resolve();
      };
      options.signal.addEventListener(
        'abort',
        () => {
          aborted++;
          reject(options.signal.reason);
        },
        { once: true },
      );
      signalProviderStart();
    });
  return controlledSearch(body, {
    needs: { keys: ['stepFree'], minWidth: null },
    notes: [
      'Utilisateur en fauteuil roulant.',
      'Besoin d’une entrée sans marche.',
      'Largeur de passage nécessaire inconnue ; à confirmer si documentée.',
    ],
  });
};
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
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
const base = 'http://127.0.0.1:' + server.address().port;
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
await mkdir('output/search-agent', { recursive: true });
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({
      viewport: { width, height: width < 600 ? 844 : 1000 },
      reducedMotion: 'reduce',
    });
    const errors = [],
      requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('request', (request) => {
      if (request.url().endsWith('/api/chat')) requests.push(request.postDataJSON());
    });
    const idle = () =>
      page.waitForFunction(
        () => document.getElementById('thread').getAttribute('aria-busy') !== 'true',
      );
    async function send(message) {
      await page.locator('#description').fill(message);
      await page.locator('#description').press('Enter');
      await idle();
    }
    await page.goto(base + '/#recherche');
    const before = provider.length;
    await send('Un dentiste à Lyon 3e avec entrée sans marche');
    assert.equal(provider.length, before, 'No provider work before consent');
    assert.equal(await page.locator('.bubble.agent[data-question]').count(), 0);
    await page.getByRole('button', { name: 'Accepter et poursuivre', exact: true }).click();
    await page.getByRole('button', { name: '3 km', exact: true }).waitFor();
    assert.ok(
      await page
        .getByText('Quel rayon vous conviendrait autour de ce lieu ?', { exact: true })
        .isVisible(),
    );
    await page.getByRole('button', { name: '3 km', exact: true }).click();
    await idle();
    assert.equal(await page.locator('#chatStatus').innerText(), '');
    assert.match(await page.locator('.bubble.agent').last().innerText(), /Lyon 3e Arrondissement/);
    assert.match(await page.locator('.bubble.agent').last().innerText(), /69003/);
    assert.equal(await page.locator('.practice-card').count(), 0);
    await page.getByRole('button', { name: 'Confirmer et chercher', exact: true }).click();
    await idle();
    assert.equal(await page.locator('.practice-card').count(), 12);
    const firstCard = page.locator('.practice-card').first();
    const cardSize = await firstCard.boundingBox();
    await firstCard.screenshot({ path: 'output/search-agent/card-' + width + '.png' });
    assert.ok(
      cardSize.height <= (width < 600 ? 480 : 320),
      'Compact card at ' + width + 'px is too tall: ' + Math.round(cardSize.height) + 'px',
    );
    for (const action of await firstCard.locator('a, button, summary').all()) {
      if (await action.isVisible()) assert.ok((await action.boundingBox()).height >= 44);
    }
    const provenance = firstCard.locator('details').first();
    await provenance.locator('summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await provenance.getAttribute('open'), '');
    assert.match(await provenance.innerText(), /date non renseignée/);
    assert.match(await provenance.locator('summary').innerText(), /besoins à confirmer/);
    assert.match(await provenance.innerText(), /Largeur de passage nécessaire inconnue/);
    assert.doesNotMatch(
      await firstCard.locator('.fact-highlights').innerText(),
      /Utilisateur en fauteuil/,
    );
    await page.keyboard.press('Enter');
    assert.ok(
      (await page.locator('.practice-card .address').allTextContents()).every((text) =>
        text.includes('69003'),
      ),
    );
    assert.ok(await page.locator('#description').isEditable());
    assert.ok(
      await page
        .locator('#description')
        .evaluate((input) => input.getBoundingClientRect().bottom <= innerHeight),
    );
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    await page.screenshot({ path: `output/search-agent/results-${width}.png` });
    const prior = provider.length;
    await page.getByRole('button', { name: 'Résultats suivants →', exact: true }).click();
    await idle();
    assert.equal(provider.length, prior, 'No paid pagination');
    assert.equal(await page.locator('.practice-card').count(), 3);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
      'Long practice names wrap within compact cards',
    );
    const popup = page.waitForEvent('popup');
    await page
      .locator('.practice-card')
      .first()
      .getByRole('link', { name: /Préparer l’échange/ })
      .click();
    const consultation = await popup;
    await consultation.locator('#practiceContext').waitFor();
    await consultation.close();
    await send('Finalement un dentiste à Marseille 8e');
    assert.equal(await page.locator('.practice-card').count(), 0);
    await page.getByRole('button', { name: 'Je ne sais pas', exact: true }).click();
    await idle();
    assert.match(
      await page.locator('.bubble.agent').last().innerText(),
      /Marseille 8e Arrondissement/,
    );
    assert.match(await page.locator('.bubble.agent').last().innerText(), /13008/);
    assert.match(await page.locator('.bubble.agent').last().innerText(), /sans limite/);
    await page.locator('#clear').click();
    assert.equal(await page.locator('#consent').isChecked(), false);
    await send('Bonjour');
    await page.getByRole('button', { name: 'Accepter et poursuivre', exact: true }).click();
    await idle();
    assert.equal(
      await page.locator('.bubble.agent').last().getAttribute('data-question'),
      'profession-libre',
    );
    await page.getByRole('button', { name: 'Saisir ma réponse', exact: true }).click();
    assert.equal(await page.evaluate(() => document.activeElement.id), 'description');
    await page.locator('#clear').click();
    await send('Un dentiste à Lyon 3e avec entrée sans marche');
    await page.getByRole('button', { name: 'Consulter l’annuaire public', exact: true }).click();
    await idle();
    assert.match(await page.locator('#resultsSummary').innerText(), /dégradé/);
    assert.ok(requests.every((body) => !body.reviewConsent));
    assert.deepEqual(errors, []);
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  await page.goto(base + '/#recherche');
  await page.locator('.ai-option>summary').click();
  await page.locator('#consent').check();
  paused = true;
  await page.locator('#description').fill('Un dentiste à Lyon 3e');
  await page.locator('#local').click();
  await page.getByText('L’agent OpenAI examine votre demande', { exact: true }).waitFor();
  assert.equal(await page.locator('#agentActivity').isVisible(), true);
  assert.equal(
    await page.locator('#agentActivity').evaluate((el) => el.parentElement.id),
    'chatHistory',
    'Activity appears at the next response position inside the conversation',
  );
  const { pendingTurn, activity, composer } = await page.evaluate(() => ({
    pendingTurn: document.querySelector('.bubble.user:last-child').getBoundingClientRect().toJSON(),
    activity: document.getElementById('agentActivity').getBoundingClientRect().toJSON(),
    composer: document.getElementById('descriptionForm').getBoundingClientRect().toJSON(),
  }));
  assert.ok(activity.y >= pendingTurn.y + pendingTurn.height - 1);
  assert.ok(activity.y + activity.height <= composer.y);
  await page.screenshot({ path: 'output/search-agent/inline-activity.png' });
  assert.equal(
    await page.locator('.agent-mark svg path').getAttribute('d'),
    await page.locator('.brand-mark svg path').getAttribute('d'),
  );
  assert.ok(
    await page
      .locator('.agent-mark')
      .evaluate((mark) =>
        mark.getAnimations().some((animation) => animation.playState === 'running'),
      ),
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  assert.equal(
    await page.locator('.agent-mark').evaluate((mark) => getComputedStyle(mark).animationName),
    'none',
  );
  await Promise.race([
    providerStarted,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Controlled provider did not start')), 3000),
    ),
  ]);
  await page.locator('#stopSearch').click();
  await page.waitForFunction(() => document.getElementById('agentActivity').hidden);
  await page.waitForTimeout(100);
  assert.ok(aborted > 0);
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.getByText('L’agent OpenAI examine votre demande', { exact: true }).waitFor();
  release();
  await page.getByRole('button', { name: '3 km', exact: true }).waitFor();
  fail = true;
  await page.locator('#description').fill('Corrige ma demande');
  await page.locator('#local').click();
  await page.getByRole('button', { name: 'Réessayer', exact: true }).waitFor();
  assert.match(await page.locator('#chatStatus').innerText(), /Limite OpenAI/);
  assert.ok(!(await page.locator('#thread').innerText()).includes('private-provider-response'));
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.getByRole('button', { name: 'Confirmer et chercher', exact: true }).waitFor();
  await page.close();
  console.log(
    'Search agent Chromium passed: complete Lyon3e, real tool loop, consent, confirmation, district metadata/results, paid-free pagination, correction Marseille8e, unknown/free QCM, explicit degraded directory, consultation, actual activity/cancel/retry/errors, reduced motion and320/390/768/1440px. OpenAI controlled; IGN ' +
      (process.env.REAL_IGN === '1' ? 'live' : 'controlled') +
      '.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  database.close();
  globalThis.fetch = original;
}
