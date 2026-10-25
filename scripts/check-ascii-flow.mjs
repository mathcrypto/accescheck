import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
const errors = [],
  searchRequests = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('request', (r) => {
  if (r.url().endsWith('/api/search')) searchRequests.push(r.url());
});
const base = process.env.APP_TEST_URL || 'http://127.0.0.1:4173';
await page.setViewportSize({ width: 320, height: 844 });
await page.goto(base);
assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
await page.setViewportSize({ width: 1440, height: 1100 });
await page.locator('.intro-photo img').evaluate((img) => img.decode());
assert.equal(await page.locator('.intro-photo img').evaluate((img) => img.naturalWidth > 0), true);
await page.mouse.move(400, 200);
await page.waitForTimeout(250);
assert.equal(
  await page.locator('#asciiFlow').evaluate((el) => {
    const bottom = document.querySelector('.intro-photo').getBoundingClientRect().bottom,
      scale = el.width / innerWidth;
    return !el
      .getContext('2d')
      .getImageData(0, 0, el.width, Math.floor(bottom * scale))
      .data.some((value, i) => i % 4 === 3 && value > 0);
  }),
  true,
);
await page
  .getByRole('heading', { name: 'Trouvez un cabinet adapté à vos besoins.' })
  .waitFor({ state: 'visible' });
await page.getByRole('link', { name: 'Décrire mes besoins' }).click();
assert.equal(
  await page
    .locator('.brand-mark')
    .evaluate((el) => el.getAnimations().some((a) => a.playState === 'running')),
  true,
);
await page.waitForFunction(
  () => Math.abs(document.querySelector('#recherche').getBoundingClientRect().top) < 2,
);
assert.equal(
  await page.locator('.brand').evaluate((el) => Math.round(el.getBoundingClientRect().top)),
  20,
);
const flow = page.locator('#asciiFlow');
assert.equal(await flow.count(), 1);
assert.equal(
  await flow.evaluate((el) => el.closest('[aria-hidden]')?.getAttribute('aria-hidden')),
  'true',
);
assert.equal(await flow.evaluate((el) => getComputedStyle(el).pointerEvents), 'none');
const frame = async () =>
  createHash('sha256')
    .update(await flow.evaluate((el) => el.toDataURL()))
    .digest('hex');
const before = await frame();
await page.waitForTimeout(350);
assert.notEqual(await frame(), before);
const centre = () =>
  flow.evaluate((el) => {
    const data = el.getContext('2d').getImageData(0, 0, el.width, el.height).data;
    let x = 0,
      y = 0,
      weight = 0;
    for (let i = 3; i < data.length; i += 4) {
      const a = data[i];
      if (a) {
        x += (((i - 3) / 4) % el.width) * a;
        y += Math.floor((i - 3) / 4 / el.width) * a;
        weight += a;
      }
    }
    return { x: x / weight / (el.width / innerWidth), y: y / weight / (el.height / innerHeight) };
  });
const panelClear = () =>
  flow.evaluate((el) => {
    const r = document.querySelector('.search-panel').getBoundingClientRect(),
      scale = el.width / innerWidth;
    const pixels = el
      .getContext('2d')
      .getImageData(
        Math.ceil(r.left * scale),
        Math.ceil(r.top * scale),
        Math.floor(r.width * scale),
        Math.floor(r.height * scale),
      ).data;
    return !pixels.some((value, i) => i % 4 === 3 && value > 0);
  });
assert.equal(await panelClear(), true);
const initial = await centre();
await page.mouse.move(1100, 200);
await page.waitForTimeout(1600);
const followed = await centre();
assert.ok(
  Math.hypot(followed.x - 1100, followed.y - 200) <
    Math.hypot(initial.x - 1100, initial.y - 200) * 0.6,
);
assert.equal(await panelClear(), true);
await page.locator('#description').focus();
await page.waitForTimeout(50);
const frozen = await frame();
await page.waitForTimeout(250);
assert.equal(await frame(), frozen);
await page.evaluate(() => scrollBy(0, 80));
await page.waitForTimeout(100);
assert.equal(await panelClear(), true);
const scrolled = await frame();
await page.waitForTimeout(250);
assert.equal(await frame(), scrolled);
await page.locator('.menu > summary').click();
await page.getByRole('button', { name: 'Mettre les animations en pause' }).click();
assert.equal(await page.locator('#pauseMotion').getAttribute('aria-pressed'), 'true');
const paused = await frame();
await page.waitForTimeout(250);
assert.equal(await frame(), paused);
await page.getByRole('button', { name: 'Relancer les animations' }).click();
await page.locator('.menu > summary').click();
const resumed = await frame();
await page.waitForTimeout(250);
assert.notEqual(await frame(), resumed);
await page.emulateMedia({ reducedMotion: 'reduce' });
await page.waitForTimeout(50);
const reduced = await frame();
await page.waitForTimeout(250);
assert.equal(await frame(), reduced);
await page.getByRole('link', { name: 'Décrire mes besoins' }).click();
assert.equal(await page.locator('.brand-mark').evaluate((el) => el.getAnimations().length), 0);
assert.equal(await page.locator('#pauseMotion').isHidden(), true);
await page.emulateMedia({ reducedMotion: 'no-preference' });
assert.equal(searchRequests.length, 0);
assert.deepEqual(errors, []);
console.log(
  'ASCII flow checks passed: mouse following, photo exclusion, clear input, scrolling while paused, pause/resume and reduced motion.',
);
await browser.close();
