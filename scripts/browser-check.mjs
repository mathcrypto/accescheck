import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = (process.env.APP_TEST_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
try {
  for (const [width, height] of [
    [320, 568],
    [390, 844],
    [768, 900],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto(base + '/#recherche');
    assert.match(await page.title(), /AccèsCheck/);
    const design = await page.evaluate(() => ({
      background: getComputedStyle(document.body).backgroundColor,
      font: getComputedStyle(document.body).fontFamily,
      blur: getComputedStyle(document.querySelector('.brand')).backdropFilter,
      overflow: document.documentElement.scrollWidth > innerWidth,
    }));
    assert.equal(design.background, 'rgb(255, 255, 255)');
    assert.match(design.font, /Helvetica/);
    assert.equal(design.blur, 'blur(8px)');
    assert.equal(design.overflow, false);
    await page
      .locator('#description')
      .fill('Je ne suis pas en fauteuil, mais je suis malentendant.');
    await page.locator('#local').click();
    assert.deepEqual(
      await page
        .locator('#criteria input:checked')
        .evaluateAll((inputs) => inputs.map((input) => input.value)),
      ['hearing'],
    );
    await page.locator('#confirmed').check();
    await page.locator('#search').click();
    await page.locator('.practice-card').first().waitFor();
    const popupPromise = page.waitForEvent('popup');
    await page
      .locator('.practice-card')
      .first()
      .getByRole('link', { name: /Préparer l’échange/ })
      .click();
    const popup = await popupPromise;
    await popup.locator('#practiceContext').waitFor();
    await popup.close();
    await page.screenshot({ path: `/tmp/accescheck-home-${width}.png`, fullPage: true });
    await page.locator('#clear').click();
    assert.equal(await page.locator('.practice-card').count(), 0);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Homepage search passed: AccèsCheck design, local agent review, retained results, consultation handoff, reset and four responsive widths. No paid API or real audio used.',
  );
} finally {
  await browser.close();
}
