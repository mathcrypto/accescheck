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
await page.waitForSelector('.card');
assert.equal(await page.locator('.card').count(), 6);
assert.match(await page.locator('#resultTitle').textContent(), /510/);
await page.screenshot({ path: '/tmp/accescheck-desktop.png', fullPage: true });
await page.getByRole('button', { name: 'Voir les preuves' }).first().click();
await page.waitForSelector('dialog[open]');
await page.getByRole('button', { name: 'Préparer ma visite ↗' }).click();
await page.waitForSelector('#copyBrief');
assert.ok((await page.locator('#brief').textContent()).includes('transfert'));
await page.getByRole('button', { name: 'Fermer la fenêtre' }).click();
assert.equal(await page.locator('#demo').count(), 0);
assert.ok(!(await page.locator('#results').innerText()).includes('exemple fictif'));
await page.locator('#needs').fill('Je suis malentendant');
await page.getByRole('button', { name: 'Trouver un cabinet ↗', exact: true }).click();
await page.waitForFunction(
  () => document.querySelector('#summary').textContent === 'Équipement auditif',
);
await page.getByRole('button', { name: 'Activer la lecture agrandie' }).click();
assert.equal(await page.locator('#easy').getAttribute('aria-pressed'), 'true');
await page.locator('#easy').click();
await page.waitForFunction(() =>
  document.querySelector('#resultTitle').textContent.includes('510'),
);
await page.setViewportSize({ width: 390, height: 844 });
await page.screenshot({ path: '/tmp/accescheck-mobile.png', fullPage: true });
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
await page.getByRole('button', { name: 'Effacer mes besoins' }).click();
assert.equal(await page.locator('#needs').inputValue(), '');
assert.equal(await page.locator('.card').count(), 0);
assert.deepEqual(errors, []);
console.log(
  'Browser checks passed: imported-practice search, no fictional practitioner toggle, evidence dialog, briefing, filters, enlarged reading, mobile layout, reset.',
);
await browser.close();
