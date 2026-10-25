import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const base = process.env.APP_URL || 'http://127.0.0.1:4180';
const output = 'output/user-journey-fixes';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.CHROME_BIN ? { executablePath: process.env.CHROME_BIN } : {}),
});
const report = { base, checks: [], errors: [] };
async function check(name, run) {
  try {
    await run();
    report.checks.push({ name, passed: true });
  } catch (error) {
    report.checks.push({ name, passed: false, error: error.message });
  }
}
const inView = (node) => {
  const r = node.getBoundingClientRect();
  return r.top >= 72 && r.bottom <= innerHeight && r.height > 0;
};
try {
  for (const [width, height] of [
    [1440, 900],
    [1024, 900],
    [768, 900],
    [390, 844],
    [320, 568],
  ]) {
    const page = await browser.newPage({ viewport: { width, height }, reducedMotion: 'reduce' });
    page.on('pageerror', (error) => report.errors.push(error.message));
    await check(`${width}: compact review and retained search`, async () => {
      await page.goto(base);
      await page.locator('.intro-link').click();
      await page
        .locator('#description')
        .fill('Généraliste sans contrainte géographique, équipement auditif.');
      await page.locator('#description').press('Enter');
      await page.getByRole('button', { name: 'Confirmer et chercher', exact: true }).click();
      const link = page
        .locator('.practice-card')
        .first()
        .getByRole('link', { name: /Préparer l’échange/ });
      await link.waitFor();
      assert.equal(await link.getAttribute('target'), '_blank');
      const popupPromise = page.waitForEvent('popup');
      await link.click();
      const popup = await popupPromise;
      await popup.waitForLoadState();
      await popup.locator('#practiceContext').waitFor();
      await popup.close();
      assert.match(await page.locator('#thread').innerText(), /équipement auditif/);
      assert.ok(await page.locator('.practice-card').count());
    });
    await check(`${width}: missing needs keep the conversation editable`, async () => {
      await page.goto(base + '/#recherche');
      await page.locator('#clear').click();
      await page.locator('#description').fill('Bonjour');
      await page.locator('#local').click();
      await page.locator('.bubble.agent').waitFor();
      assert.equal(await page.locator('.practice-card').count(), 0);
      assert.ok(await page.locator('#description').isEditable());
      assert.ok(await page.locator('#thread').innerText());
    });
    await check(`${width}: correcting needs invalidates previous results`, async () => {
      await page.goto(base + '/#recherche');
      await page.locator('#clear').click();
      await page
        .locator('#description')
        .fill('Généraliste sans contrainte géographique, fauteuil roulant');
      await page.locator('#local').click();
      await page.locator('.bubble.agent').waitFor();
      assert.equal(await page.locator('.practice-card').count(), 0);
      assert.match(await page.locator('#thread').innerText(), /largeur|passage/i);
      await page
        .locator('#description')
        .fill('Généraliste sans contrainte géographique, équipement auditif.');
      await page.locator('#local').click();
      await page.locator('.bubble.agent').nth(1).waitFor();
      assert.ok(await page.locator('#description').isEditable());
    });
    await check(`${width}: consultation actions without page scrolling`, async () => {
      await page.goto(base + '/consultation');
      assert.ok(await page.locator('#showReply').evaluate(inView));
      assert.ok(await page.locator('#startCaptions').evaluate(inView));
      assert.ok(
        await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
      );
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
      assert.ok(
        await page.evaluate(
          () =>
            document.getElementById('captionScroll').getBoundingClientRect().bottom <=
            document.querySelector('.composer').getBoundingClientRect().top,
        ),
        'Conversation and composer must not overlap',
      );
      await page.screenshot({ path: `${output}/${width}-consultation.png` });
    });
    await check(`${width}: keyboard focus stays below fixed header`, async () => {
      await page.goto(base);
      await page.locator('.intro-link').click();
      await page.locator('#description').focus();
      for (let step = 0; step < 3; step++) {
        const focused = page.locator(':focus');
        await focused.scrollIntoViewIfNeeded();
        assert.ok(await focused.evaluate(inView), 'Focused chat control stays below header');
        await page.keyboard.press('Tab');
      }
    });
    await check(`${width}: reply shown from notes and clear available`, async () => {
      await page.goto(base + '/consultation');
      await page.locator('#notesTab').click();
      assert.ok(await page.locator('#clearSession').isVisible());
      await page.locator('#reply').fill('Message fictif à afficher.');
      await page.locator('#showReply').click();
      assert.ok(await page.locator('#conversationPanel').isVisible());
      const message = page.locator('#transcript .message').last();
      assert.match(await message.innerText(), /Message fictif à afficher/);
      assert.ok(await message.locator('p').evaluate(inView));
      assert.ok(
        await message.locator('p').evaluate((text) => {
          const r = text.getBoundingClientRect();
          const pane = document.getElementById('captionScroll').getBoundingClientRect();
          return r.top >= pane.top && r.bottom <= pane.bottom;
        }),
        'The reply text must be visible inside the conversation pane',
      );
      await page.locator('#clearSession').click();
    });
    await check(`${width}: focus restored after correction`, async () => {
      await page.goto(base + '/consultation');
      await page.locator('#manualToggle').click();
      await page.locator('#manualDoctor').fill('Phrase fictive.');
      await page.locator('#addDoctor').click();
      await page.locator('#transcript .edit').last().click();
      await page.locator('#editText').fill('Phrase fictive corrigée.');
      await page.locator('#saveEdit').click();
      assert.ok(await page.evaluate(() => document.activeElement.matches('#transcript .edit')));
      await page.locator('#clearSession').click();
    });
    await check(`${width}: leaving warns and cancellation retains notes`, async () => {
      await page.goto(base + '/consultation');
      await page.locator('#notesTab').click();
      await page.locator('#notes').fill('Notes fictives à ne pas perdre.');
      await page.locator('.brand').click();
      await page.locator('#leaveDialog').waitFor({ timeout: 1500 });
      await page.locator('#cancelLeave').click();
      assert.equal(await page.locator('#notes').inputValue(), 'Notes fictives à ne pas perdre.');
      const warning = page.waitForEvent('dialog');
      await page.evaluate(() => {
        setTimeout(() => location.reload(), 0);
      });
      const dialog = await warning;
      assert.equal(dialog.type(), 'beforeunload');
      await dialog.dismiss();
      assert.equal(await page.locator('#notes').inputValue(), 'Notes fictives à ne pas perdre.');
      await page.locator('#clearSession').click();
    });
    await check(`${width}: confirmed departure clears the session`, async () => {
      await page.goto(base + '/consultation');
      await page.locator('#notesTab').click();
      await page.locator('#notes').fill('Autres notes fictives.');
      await page.locator('.brand').click();
      await page.locator('#confirmLeave').click();
      await page.waitForURL(base + '/');
      await page.goBack();
      assert.equal(await page.locator('#notes').inputValue(), '');
      assert.equal(await page.locator('#transcript .message').count(), 0);
    });
    await page.close();
  }
  assert.deepEqual(report.errors, []);
} finally {
  await browser.close();
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
}
assert.ok(
  report.checks.every((result) => result.passed),
  'User journey regressions; see report',
);
