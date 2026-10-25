import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { openSqlite } from '../storage/sqlite.mjs';
import { createPracticeStore, DataUnavailable } from '../src/practice-store.mjs';
import { createTestDatabase, fixtures, metadataFor } from './helpers/database.mjs';
import worker from '../worker/index.js';

const items = (records) =>
  records.map((record) => ({ record, sourceFields: { id: record.id, ascenseur: null } }));
test('empty storage is explicit and the build contains no practitioner list', async () => {
  const database = openSqlite(':memory:');
  try {
    await assert.rejects(createPracticeStore(database).status(), DataUnavailable);
    const response = await worker.fetch(new Request('https://example.com/api/catalog'), {
      DB: database,
    });
    assert.equal(response.status, 503);
    assert.ok(!readFileSync('worker/index.js', 'utf8').includes(fixtures[0].name));
  } finally {
    database.close();
  }
});
test('staging and incomplete imports leave the active version intact', async () => {
  const database = await createTestDatabase();
  try {
    const store = createPracticeStore(database);
    const before = await store.status();
    const run = await store.begin(metadataFor(fixtures, '2'));
    await store.append(run.id, items(fixtures.slice(0, 1)));
    assert.equal((await store.status()).checksum, before.checksum);
    await assert.rejects(store.activate(run.id), /incomplet/);
    assert.equal((await store.catalog()).count, 3);
    await store.append(run.id, items(fixtures.slice(1)));
    await store.activate(run.id);
    assert.notEqual((await store.status()).checksum, before.checksum);
    assert.equal((await store.activate(run.id)).checksum, (await store.status()).checksum);
    assert.equal((await store.catalog()).count, 3);
  } finally {
    database.close();
  }
});
test('older exports cannot replace the active snapshot', async () => {
  const database = await createTestDatabase();
  try {
    const store = createPracticeStore(database);
    const before = await store.status();
    const run = await store.begin({
      ...metadataFor(fixtures, 'old'),
      exportedAt: '2020-01-01T00:00:00Z',
    });
    await store.append(run.id, items(fixtures));
    await assert.rejects(store.activate(run.id), /plus ancien/);
    assert.equal((await store.status()).checksum, before.checksum);
  } finally {
    database.close();
  }
});
test('import validation rejects fictional data and executable widget fields', async () => {
  const database = openSqlite(':memory:');
  try {
    const store = createPracticeStore(database);
    const run = await store.begin(metadataFor());
    await assert.rejects(
      store.append(run.id, [{ record: { ...fixtures[0], mode: 'demo' }, sourceFields: {} }]),
      /invalide/,
    );
    await assert.rejects(
      store.append(run.id, [{ record: fixtures[0], sourceFields: { widget_code: '<script>' } }]),
      /invalides/,
    );
    await assert.rejects(store.activate(run.id), /incomplet/);
  } finally {
    database.close();
  }
});
test('parameterized filters preserve source fields and paginate the same HTTP/MCP results', async () => {
  const database = await createTestDatabase();
  try {
    const store = createPracticeStore(database);
    assert.equal((await store.candidates({ district: "75014' OR 1=1--" })).records.length, 0);
    assert.equal((await store.get(fixtures[0].id)).sourceFields.stationnement_pmr, null);
    const input = { needs: 'sans marche', page: 2, pageSize: 1 };
    const api = await worker
      .fetch(
        new Request('https://example.com/api/search', {
          method: 'POST',
          body: JSON.stringify(input),
        }),
        { DB: database },
      )
      .then((r) => r.json());
    assert.equal(api.results.length, 1);
    assert.equal(api.total, 3);
    assert.equal(api.page, 2);
    const mcp = await worker
      .fetch(
        new Request('https://example.com/mcp', {
          method: 'POST',
          body: JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'tools/call',
            params: { name: 'search_practices', arguments: input },
          }),
        }),
        { DB: database },
      )
      .then((r) => r.json());
    assert.deepEqual(JSON.parse(mcp.result.content[0].text).results, api.results);
    assert.equal(api.dataset.exportedAt, metadataFor().exportedAt);
    assert.ok(api.dataset.importedAt);
    assert.ok(
      api.results.every((practice) =>
        Object.values(practice.evidence).every((field) => field.date === null),
      ),
    );
  } finally {
    database.close();
  }
});
test('import writer requires its own credential and rejects cross-origin requests', async () => {
  const database = await createTestDatabase();
  try {
    const env = { DB: database, DATA_IMPORT_TOKEN: 'test-import-token' };
    const request = (headers) =>
      new Request('https://example.com/internal/import/status', { headers });
    assert.equal((await worker.fetch(request({}), env)).status, 403);
    assert.equal((await worker.fetch(request({ Authorization: 'Bearer wrong' }), env)).status, 403);
    assert.equal(
      (
        await worker.fetch(
          request({ Authorization: 'Bearer test-import-token', Origin: 'https://evil.example' }),
          env,
        )
      ).status,
      403,
    );
    assert.equal(
      (await worker.fetch(request({ Authorization: 'Bearer test-import-token' }), env)).status,
      200,
    );
  } finally {
    database.close();
  }
});
test('unexpected large drops cannot replace the last good snapshot', async () => {
  const database = await createTestDatabase();
  try {
    const store = createPracticeStore(database);
    const before = await store.status();
    const run = await store.begin(metadataFor(fixtures.slice(0, 1), 'small'));
    await store.append(run.id, items(fixtures.slice(0, 1)));
    await assert.rejects(store.activate(run.id), /Baisse inhabituelle/);
    assert.equal((await store.status()).checksum, before.checksum);
  } finally {
    database.close();
  }
});
