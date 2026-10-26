import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4196';
const routes = (process.env.ROUTES || '/,/profil,/consultation').split(',');
const output = 'output/refresh-language';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const report = { base, checks: [], errors: [], posts: [], cache: {} };
function observe(context) {
  context.on('page', (page) => {
    page.on('pageerror', (error) => report.errors.push(error.message));
    page.on('request', (request) => {
      if (request.method() === 'POST') report.posts.push(new URL(request.url()).pathname);
    });
  });
}
try {
  for (const language of ['fr', 'en']) {
    const context = await browser.newContext({
      javaScriptEnabled: false,
      ignoreHTTPSErrors: true,
      viewport: { width: 390, height: 900 },
    });
    observe(context);
    const page = await context.newPage();
    for (const path of routes) {
      await page.goto(base + path + '?lang=' + language);
      assert.equal(await page.locator('html').getAttribute('lang'), language);
      assert.ok((await page.locator('h1').innerText()).trim());
      assert.doesNotMatch(await page.locator('body').innerText(), /\{\{[^{}]+\}\}/);
      await page.reload();
      assert.equal(await page.locator('html').getAttribute('lang'), language);
    }
    await context.close();
    report.checks.push(
      `${language}: all ${routes.length} routes are localized before JavaScript, including reload`,
    );
  }

  const context = await browser.newContext({
    ignoreHTTPSErrors: true,
    viewport: { width: 390, height: 900 },
    deviceScaleFactor: 2,
  });
  observe(context);
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.emulateNetworkConditions', {
    offline: false,
    latency: 100,
    downloadThroughput: 120000,
    uploadThroughput: 60000,
  });
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  const navigating = page.goto(base + '/?lang=en', { waitUntil: 'load' });
  await page.locator('#introTitle').waitFor();
  assert.equal(
    await page.locator('#introTitle').innerText(),
    'Find a practice that fits your needs.',
  );
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.screenshot({ path: `${output}/slow-first-content.png` });
  await navigating;
  const image = page.locator('.intro-photo img');
  assert.match(await image.getAttribute('src'), /^\/assets\/hospital-[a-f0-9]+\.jpg$/);
  await page.waitForFunction(() => {
    const photo = document.querySelector('.intro-photo img');
    return photo.complete && photo.naturalWidth > 0;
  });
  report.cache.cold = await image.evaluate((photo) => ({
    width: photo.naturalWidth,
    transfer: performance.getEntriesByName(photo.currentSrc).at(-1)?.transferSize,
  }));
  await page.reload();
  await page.waitForFunction(() => {
    const photo = document.querySelector('.intro-photo img');
    return photo.complete && photo.naturalWidth > 0;
  });
  report.cache.reload = await image.evaluate((photo) => ({
    width: photo.naturalWidth,
    transfer: performance.getEntriesByName(photo.currentSrc).at(-1)?.transferSize,
  }));
  assert.equal(
    report.cache.reload.transfer,
    0,
    'The unchanged photo is served from browser cache on ordinary refresh',
  );
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await page.screenshot({ path: `${output}/slow-warm-refresh.png` });
  const hard = page.waitForNavigation({ waitUntil: 'load' });
  await cdp.send('Page.reload', { ignoreCache: true });
  await hard;
  await page.waitForFunction(() => {
    const photo = document.querySelector('.intro-photo img');
    return photo.complete && photo.naturalWidth > 0;
  });
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  report.cache.hard = await image.evaluate((photo) => ({
    width: photo.naturalWidth,
    transfer: performance.getEntriesByName(photo.currentSrc).at(-1)?.transferSize,
  }));
  await context.close();
  report.checks.push(
    'Slow mobile: first heading already English; cold, cached and forced refresh keep a valid photo and English',
  );

  const legacy = await browser.newContext({ ignoreHTTPSErrors: true });
  observe(legacy);
  await legacy.addInitScript((origin) => {
    if (location.origin === origin && !localStorage.getItem('lang'))
      localStorage.setItem('lang', 'en');
  }, new URL(base).origin);
  const old = await legacy.newPage();
  await old.goto(base + '/', { waitUntil: 'commit' });
  await old.waitForURL('**/?lang=en');
  await old.waitForLoadState();
  assert.equal(await old.locator('html').getAttribute('lang'), 'en');
  const response = await legacy.request.get(base + '/');
  assert.match(await response.text(), /<html lang="en">/);
  await old.goto(base + '/profil');
  await old.waitForLoadState();
  assert.equal(await old.locator('html').getAttribute('lang'), 'en');
  await old.goBack();
  assert.equal(await old.locator('html').getAttribute('lang'), 'en');
  await old.goForward();
  assert.equal(await old.locator('html').getAttribute('lang'), 'en');
  await legacy.close();
  report.checks.push(
    'Old local preference migrates before content; server preference, bare links, back and forward remain English',
  );
  assert.deepEqual(report.errors, []);
  assert.deepEqual(report.posts, []);
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
