import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

test('old search routes redirect to the single chat without forwarding private query text', async () => {
  for (const path of ['/assistant', '/assistant/', '/cabinets', '/cabinets/']) {
    const response = await worker.fetch(
      new Request('https://example.test' + path + '?needs=private'),
    );
    assert.equal(response.status, 308);
    assert.equal(response.headers.get('location'), '/#recherche');
    assert.equal(response.headers.get('cache-control'), 'no-store');
  }
});
test('home preserves the photo and offers one search composer without parallel forms', async () => {
  const html = await (await worker.fetch(new Request('https://example.test/'))).text();
  assert.ok(html.includes('id="introTitle"'));
  assert.ok(html.includes('id="thread"'));
  assert.ok(html.includes('id="descriptionForm"'));
  assert.ok(!html.includes('id="searchForm"'));
  assert.ok(!html.includes('id="advancedSearch"'));
  assert.ok(!html.includes('Ma recherche accompagnée'));
  assert.ok(html.includes('href="/consultation?lang=fr"'));
});
