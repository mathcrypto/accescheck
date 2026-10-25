import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openSqlite } from '../storage/sqlite.mjs';
import { createPracticeStore } from '../src/practice-store.mjs';
import { fixtures, metadataFor } from './helpers/database.mjs';
import { createVercelHandler } from '../api/index.js';

const directory = await mkdtemp(join(tmpdir(), 'accescompanion-vercel-'));
const path = join(directory, 'practices.sqlite');
const writer = openSqlite(path);
const store = createPracticeStore(writer);
const records = fixtures.map((record, index) => ({
  ...record,
  location: { latitude: 48.86 + index * 0.001, longitude: 2.34 },
}));
const imported = await store.begin(metadataFor(records));
await store.append(
  imported.id,
  records.map((record) => ({ record, sourceFields: { id: record.id } })),
);
await store.activate(imported.id);
writer.close();
const database = openSqlite(path, { readOnly: true });
const app = createVercelHandler(database);
const origin = 'https://accescheck.example';
const request = (path, body, init = {}) =>
  app.fetch(
    new Request(
      origin + path,
      body === undefined
        ? { ...init }
        : {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: origin },
            body: JSON.stringify(body),
            ...init,
          },
    ),
  );
test.after(async () => {
  database.close();
  await rm(directory, { recursive: true, force: true });
});

test('Vercel serves patient pages and database-backed catalog and distance search', async () => {
  for (const path of ['/', '/consultation']) {
    const response = await request(path);
    assert.equal(response.status, 200, path);
    const html = await response.text();
    assert.ok(!html.includes('/__dev/'));
    assert.ok(!html.includes('/mcp-test/client.js'));
  }
  const catalog = await request('/api/catalog');
  assert.equal(catalog.status, 200);
  assert.equal((await catalog.json()).count, records.length);
  const result = await request('/api/discover', {
    confirmed: true,
    needs: { keys: ['hearing'], minWidth: null },
    origin: { label: 'Point de départ de test', latitude: 48.86, longitude: 2.34 },
  });
  assert.equal(result.status, 200);
  const data = await result.json();
  assert.ok(data.results.length > 0);
  assert.ok(
    data.results.every(
      (record) => record.distanceKind === 'straight_line' && Number.isFinite(record.distanceKm),
    ),
  );
  assert.equal(
    (await request('/api/search', { needs: 'fauteuil roulant', mode: 'real' })).status,
    200,
  );
});

test('the deployed database refuses writes and keeps the imported records', async () => {
  await assert.rejects(database.prepare('DELETE FROM practices').run(), /readonly/i);
  assert.equal((await createPracticeStore(database).catalog()).count, records.length);
});

test('Vercel exposes no local bridge, development client, import token or paid API configuration', async () => {
  for (const path of [
    '/__dev/events',
    '/__dev/client.js',
    '/bridge/agent-config',
    '/mcp-test/client.js',
  ])
    assert.notEqual((await request(path)).status, 200, path);
  assert.equal((await request('/internal/import/start', {})).status, 403);
  assert.equal((await (await request('/api/voice-config')).json()).elevenlabsAvailable, false);
  assert.equal((await (await request('/api/ai-config')).json()).available, false);
  assert.equal(
    (
      await app.fetch(
        new Request(origin + '/api/catalog', { headers: { Origin: 'https://other.example' } }),
      )
    ).status,
    403,
  );
});
