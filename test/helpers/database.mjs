import fixtures from '../fixtures/practices.json' with { type: 'json' };
import { createHash } from 'node:crypto';
import { openSqlite } from '../../storage/sqlite.mjs';
import { createPracticeStore, sourceIdentity } from '../../src/practice-store.mjs';
export { fixtures };
export function metadataFor(records = fixtures, version = '1') {
  return {
    ...sourceIdentity,
    expectedCount: records.length,
    columns: ['id', 'name', 'web_url'],
    checksum: createHash('sha1')
      .update(JSON.stringify(records) + version)
      .digest('hex'),
    checksumType: 'sha1',
    resourceUrl: 'https://static.data.gouv.fr/resources/test/acceslibre-with-web-url.csv',
    exportedAt: '2026-10-24T23:06:09.856Z',
    selection: 'Test records from the public export',
  };
}
export async function createTestDatabase(records = fixtures) {
  const database = openSqlite(':memory:');
  const store = createPracticeStore(database);
  const run = await store.begin(metadataFor(records));
  await store.append(
    run.id,
    records.map((record) => ({
      record,
      sourceFields: { id: record.id, web_url: record.sourceUrl, stationnement_pmr: null },
    })),
  );
  await store.activate(run.id);
  return database;
}
