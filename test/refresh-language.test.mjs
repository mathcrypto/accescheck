import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';

test('English pages are already translated before browser JavaScript executes', async () => {
  for (const [path, title] of [
    ['/', 'Find a practice that fits your needs.'],
    ['/profil', 'Your access profile.'],
    ['/consultation', 'The conversation'],
  ]) {
    const response = await worker.fetch(new Request('https://example.com' + path + '?lang=en'));
    const html = await response.text();
    const initial = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');
    assert.match(initial, /<html lang="en">/);
    assert.ok(initial.includes(title), path);
    assert.doesNotMatch(initial, /\{\{[^{}]+\}\}/, path);
    assert.ok(initial.includes('href="/profil?lang=en"'));
  }
});

test('the hospital photo has an independent versioned and cacheable response', async () => {
  const home = await (await worker.fetch(new Request('https://example.com/?lang=en'))).text();
  const path = home.match(/<img\s+src="([^"]+)"/)[1];
  assert.match(path, /^\/assets\/hospital-[a-f0-9]+\.jpg$/);
  for (let index = 0; index < 2; index++) {
    const image = await worker.fetch(new Request('https://example.com' + path));
    assert.equal(image.status, 200);
    assert.equal(image.headers.get('content-type'), 'image/jpeg');
    assert.match(image.headers.get('cache-control'), /immutable/);
    const data = new Uint8Array(await image.arrayBuffer());
    assert.ok(data.length > 100000);
    assert.deepEqual([...data.slice(0, 3)], [255, 216, 255]);
  }
});

test('legacy search redirects keep the explicit English language', async () => {
  const response = await worker.fetch(new Request('https://example.com/assistant?lang=en'));
  assert.equal(response.headers.get('location'), '/?lang=en#recherche');
});
