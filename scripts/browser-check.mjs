import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = (process.env.APP_TEST_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(base + '/cabinets');
await page.waitForSelector('#place');
assert.match(await page.locator('h1').textContent(), /cabinet/i);
await page.locator('input[name="need"][value="audition"]').check();
await page.getByRole('button', { name: 'Chercher' }).click();
await page.waitForSelector('.card');
assert.ok(
  (await page.locator('#brief').textContent()).includes('Audition') ||
    (await page.locator('#results').textContent()).length > 20,
);
assert.ok((await page.locator('.card').count()) >= 1);
await page.screenshot({ path: '/tmp/accescheck-desktop.png', fullPage: true });
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: '/tmp/accescheck-mobile.png', fullPage: true });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
await page.getByRole('button', { name: 'Effacer' }).click();
assert.equal(await page.locator('.card').count(), 0);
assert.deepEqual(errors, []);
console.log('Browser checks passed: finder search, hearing results, mobile layout, reset.');
await browser.close();
