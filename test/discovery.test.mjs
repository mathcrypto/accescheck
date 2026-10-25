import test from 'node:test';
import assert from 'node:assert/strict';
import { distanceKm, coordinates, findPractices, geocode } from '../src/discovery.mjs';
import { createTestDatabase, fixtures } from './helpers/database.mjs';
import worker from '../worker/index.js';

const origin = { label: 'Point de départ de test', latitude: 48.86, longitude: 2.34 };
test('straight-line distances preserve missing locations and do not imply a route', () => {
  assert.equal(distanceKm(origin, origin), 0);
  assert.ok(distanceKm(origin, { ...origin, latitude: 48.87 }) > 1.1);
  assert.equal(distanceKm(origin, null), null);
  assert.equal(coordinates({ latitude: 100, longitude: 2 }), null);
});
test('IGN geocode covers France and prefers municipality matches', async () => {
  let calls = 0;
  const locations = await geocode('Grenoble', async (url, options) => {
    calls += 1;
    const query = new URL(url);
    assert.equal(query.origin, 'https://data.geopf.fr');
    assert.equal(query.searchParams.get('q'), 'Grenoble');
    assert.equal(query.searchParams.get('depcode'), null);
    assert.equal(options.body, undefined);
    return new Response(
      JSON.stringify({
        features: [
          {
            geometry: { coordinates: [5.724387, 45.188529] },
            properties: {
              label: 'Grenoble',
              name: 'Grenoble',
              city: 'Grenoble',
              postcode: '38000',
              type: 'municipality',
            },
          },
        ],
      }),
    );
  });
  assert.ok(calls >= 1);
  assert.equal(locations[0].latitude, 45.188529);
  assert.equal(locations[0].approximate, true);
});
test('confirmed criteria drive deterministic ranking: declarations remain visible, unknowns remain unknown, accessibility precedes proximity', async () => {
  const records = fixtures.map((record, index) => ({
    ...record,
    location: { ...origin, latitude: origin.latitude + (2 - index) * 0.01 },
    evidence: {
      ...record.evidence,
      hearing: {
        value: index === 0 ? true : index === 1 ? null : false,
        status: index === 1 ? 'unknown' : 'declared',
        date: null,
      },
    },
  }));
  const db = await createTestDatabase(records);
  try {
    const input = {
      confirmed: true,
      needs: { keys: ['hearing'], minWidth: null },
      origin,
      radiusKm: null,
    };
    const result = await findPractices(db, input);
    assert.equal(result.results.length, 2);
    assert.equal(result.results[0].id, records[0].id);
    assert.equal(result.results[0].checks[0].state, 'declared');
    assert.equal(result.results[0].checks[0].fit, 'met');
    assert.equal(result.results[0].needsConfirmation, false);
    assert.equal(result.results[1].checks[0].fit, 'unknown');
    assert.equal(result.results[1].needsConfirmation, true);
    assert.equal(result.results[0].distanceKind, 'straight_line');
    assert.equal(result.results[0].administrative.registration, null);
    assert.equal(result.results[0].reputation, undefined);
    assert.equal(result.counts.knownObstaclesExcluded, 1);
    await assert.rejects(findPractices(db, { ...input, confirmed: false }), /Confirmez/);
    await assert.rejects(
      findPractices(db, { ...input, needs: { keys: ['invented'], minWidth: null } }),
    );
    await assert.rejects(
      findPractices(db, { ...input, origin: null, radiusKm: 5 }),
      /point de départ/,
    );
    const nearby = await findPractices(db, { ...input, radiusKm: 1.5 });
    assert.equal(nearby.results.length, 1);
    assert.equal(nearby.results[0].id, records[1].id);
    const unsupported = await findPractices(db, {
      ...input,
      needs: { keys: ['signLanguage'], minWidth: null },
    });
    assert.ok(
      unsupported.results.every(
        (practice) => practice.needsConfirmation && practice.checks[0].fit === 'unknown',
      ),
    );
  } finally {
    db.close();
  }
});
test('HTTP discovery rejects unconfirmed searches and does not need or call AI', async () => {
  const db = await createTestDatabase();
  try {
    const request = (body) =>
      new Request('https://example.com/api/discover', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.com' },
        body: JSON.stringify(body),
      });
    const input = { confirmed: true, needs: { keys: ['hearing'], minWidth: null } };
    assert.equal(
      (await worker.fetch(request({ ...input, confirmed: false }), { DB: db })).status,
      400,
    );
    const response = await worker.fetch(request(input), { DB: db });
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.ok(data.results.every((practice) => practice.distanceKm === null));
  } finally {
    db.close();
  }
});
