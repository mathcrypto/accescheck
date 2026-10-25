import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { createTestDatabase } from './helpers/database.mjs';
const database = await createTestDatabase();
test.after(() => database.close());
const request = (path, body, extra = {}) =>
  worker.fetch(
    new Request('https://example.com' + path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...extra },
      body: JSON.stringify(body),
    }),
    { DB: database },
  );
test('serves app with privacy headers', async () => {
  const r = await worker.fetch(new Request('https://example.com/'));
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(await r.text(), /lang="fr"/);
});
test('search API returns actual provenance', async () => {
  const r = await request('/api/search', { needs: 'fauteuil roulant', mode: 'real' });
  const d = await r.json();
  assert.equal(d.results.length, 3);
  assert.equal(d.results[0].mode, 'real');
  assert.ok(d.results[0].sourceUrl.startsWith('https://acceslibre.beta.gouv.fr/'));
});
test('MCP discovery, listing, and search round trip', async () => {
  for (const method of ['server/discover', 'tools/list']) {
    const d = await (await request('/mcp', { jsonrpc: '2.0', id: 1, method })).json();
    assert.ok(d.result);
  }
  const d = await (
    await request('/mcp', {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'search_practices', arguments: { needs: 'malentendant' } },
    })
  ).json();
  assert.equal(JSON.parse(d.result.content[0].text).results.length, 3);
});
test('MCP invalid tools and params return isError', async () => {
  for (const params of [
    { name: 'delete_all', arguments: {} },
    { name: 'search_practices', arguments: { needs: 'fauteuil', mode: 'demo' } },
    { name: 'search_practices', arguments: { needs: 'ok', unexpected: 'x' } },
    { name: 'get_practice_accessibility', arguments: { id: 123 } },
  ]) {
    const d = await (
      await request('/mcp', { jsonrpc: '2.0', id: 3, method: 'tools/call', params })
    ).json();
    assert.equal(d.result.isError, true);
  }
});
test('visit briefing includes unknowns as questions', async () => {
  const r = await request('/api/briefing', {
    id: '1106c473-4bbc-4db2-a289-a82488c03226',
    needs: 'fauteuil et malentendant',
    width: 90,
  });
  const d = await r.json();
  assert.ok(d.questions.some((q) => q.includes('boucle')));
  assert.ok(d.obstacles.includes('Largeur de la porte d’entrée'));
  assert.equal(d.doctolibUrl, null);
});
test('rejects cross-origin requests', async () =>
  assert.equal(
    (await request('/api/search', { needs: 'ok' }, { Origin: 'https://evil.example' })).status,
    403,
  ));
test('rejects malformed JSON', async () => {
  const r = await worker.fetch(
    new Request('https://example.com/api/search', { method: 'POST', body: '{' }),
  );
  assert.equal(r.status, 400);
});
test('rejects oversized request', async () =>
  assert.equal((await request('/api/search', { needs: 'x'.repeat(13000) })).status, 413));

test('search rejects fictional mode and removed practitioner IDs', async () => {
  const response = await request('/api/search', { needs: 'fauteuil', mode: 'demo' });
  assert.equal(response.status, 400);
  const briefing = await request('/api/briefing', { id: 'demo-2', needs: 'fauteuil' });
  assert.equal(briefing.status, 400);
});
