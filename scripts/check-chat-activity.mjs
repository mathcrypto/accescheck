import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import worker from '../worker/index.js';
import { createTestDatabase } from '../test/helpers/database.mjs';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const database = await createTestDatabase();
const original = globalThis.fetch;
let pause = true;
let release,
  aborted = 0,
  fail = false;
globalThis.fetch = async (url, options) => {
  assert.equal(new URL(url).hostname, 'data.geopf.fr');
  if (!pause) return Response.json({ features: [] });
  return new Promise((resolve, reject) => {
    const stop = () => {
      aborted++;
      reject(options.signal.reason);
    };
    options.signal.addEventListener('abort', stop, { once: true });
    release = () => {
      pause = false;
      options.signal.removeEventListener('abort', stop);
      resolve(
        Response.json({
          features: [
            {
              geometry: { coordinates: [4.835, 45.767] },
              properties: {
                label: 'Lyon 69001',
                name: 'Lyon',
                city: 'Lyon',
                citycode: '69123',
                postcode: '69001',
                type: 'municipality',
              },
            },
          ],
        }),
      );
    };
  });
};
const server = createServer(async (req, res) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks);
  if (fail && req.url === '/api/chat') {
    fail = false;
    res.writeHead(503, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Indisponibilité de test' }));
    return;
  }
  const abort = new AbortController();
  res.once('close', () => abort.abort());
  const response = await worker.fetch(
    new Request('http://' + req.headers.host + req.url, {
      method: req.method,
      headers: req.headers,
      signal: abort.signal,
      ...(raw.length ? { body: raw, duplex: 'half' } : {}),
    }),
    { DB: database },
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
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const idle = () =>
  page.waitForFunction(
    () => document.getElementById('thread').getAttribute('aria-busy') !== 'true',
  );
async function send(text) {
  await page.locator('#description').fill(text);
  await page.locator('#local').click();
}
try {
  await page.goto(base + '/#recherche');
  await send('Généraliste à Lyon, équipement auditif.');
  await page.getByText('Je recherche le lieu auprès d’IGN', { exact: true }).waitFor();
  assert.equal(await page.locator('#agentActivity').isVisible(), true);
  assert.equal(
    await page.locator('.agent-mark svg path').getAttribute('d'),
    await page.locator('.brand-mark svg path').getAttribute('d'),
  );
  assert.equal(
    await page
      .locator('.agent-mark')
      .evaluate((mark) =>
        mark.getAnimations().some((animation) => animation.playState === 'running'),
      ),
    true,
  );
  assert.ok(
    await page
      .locator('#description')
      .evaluate((input) => input.getBoundingClientRect().bottom <= innerHeight),
  );
  await mkdir('output/chat-activity', { recursive: true });
  await page.screenshot({ path: 'output/chat-activity/loading-mobile.png' });
  release();
  await idle();
  assert.equal(await page.locator('#agentActivity').isHidden(), true);
  assert.equal(
    await page.locator('.bubble.agent').last().getAttribute('data-question'),
    'location',
  );
  await page.emulateMedia({ reducedMotion: 'reduce' });
  pause = true;
  await send('Finalement généraliste à Paris, équipement auditif.');
  await page.getByText('Je recherche le lieu auprès d’IGN', { exact: true }).waitFor();
  assert.equal(
    await page.locator('.agent-mark').evaluate((mark) => getComputedStyle(mark).animationName),
    'none',
  );
  await page.locator('#stopSearch').click();
  await idle();
  assert.equal(await page.locator('#agentActivity').isHidden(), true);
  assert.match(await page.locator('#chatStatus').innerText(), /interrompue/);
  assert.equal(await page.evaluate(() => document.activeElement.id), 'description');
  await page.waitForTimeout(50);
  assert.ok(aborted > 0, 'Stopping the chat cancels IGN, not only the UI');
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await page.getByText('Je recherche le lieu auprès d’IGN', { exact: true }).waitFor();
  release();
  await idle();
  await page.locator('#clear').click();
  fail = true;
  await send('Bonjour');
  await idle();
  assert.match(await page.locator('#chatStatus').innerText(), /Indisponibilité de test/);
  await page.getByRole('button', { name: 'Réessayer', exact: true }).click();
  await idle();
  assert.equal(
    await page.locator('.bubble.agent').last().getAttribute('data-question'),
    'specialty',
  );
  assert.equal(await page.locator('#agentActivity').isHidden(), true);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
  assert.deepEqual(errors, []);
  console.log(
    'Activity passed: real streamed IGN status, shared animated mark, visible mobile composer, reduced motion, upstream cancellation, retry and error recovery. No paid API used.',
  );
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  database.close();
  globalThis.fetch = original;
}
