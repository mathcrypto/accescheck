import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir } from 'node:fs/promises';
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
await mkdir('output/consultation-short', { recursive: true });
try {
  for (const [width, height] of [
    [320, 568],
    [390, 568],
    [390, 844],
    [1440, 900],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));
    await page.goto((process.env.APP_URL || 'http://127.0.0.1:4182') + '/consultation');
    await page.locator('#manualToggle').click();
    await page.locator('#manualDoctor').fill('Phrase fictive.');
    await page.locator('#addDoctor').click();
    assert.ok(
      await page
        .locator('#captionScroll')
        .evaluate((pane) => pane.getBoundingClientRect().height >= 120),
      'Conversation keeps usable height',
    );
    assert.ok(
      await page.evaluate(
        () =>
          document.getElementById('captionScroll').getBoundingClientRect().bottom <=
          document.querySelector('.composer').getBoundingClientRect().top,
      ),
      'Conversation never overlaps response',
    );
    await page.locator('#transcript .edit').last().click();
    await page.locator('#editText').fill('Phrase corrigée.');
    await page.locator('#saveEdit').click();
    assert.ok(await page.evaluate(() => document.activeElement.matches('#transcript .edit')));
    await page.locator('#reply').fill('Réponse fictive.');
    await page.locator('#showReply').click();
    assert.match(await page.locator('#transcript').innerText(), /Réponse fictive/);
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false,
    );
    if (height >= 640)
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
      );
    await page.locator('#clearSession').click();
    await page.screenshot({ path: `output/consultation-short/${width}-${height}.png` });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    'Consultation passed: usable conversation, no overlapping composer, clickable corrections, restored focus, normal-height no-scroll and short-height safe scroll. No audio or paid calls.',
  );
} finally {
  await browser.close();
}
