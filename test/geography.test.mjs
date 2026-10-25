import test from 'node:test';
import assert from 'node:assert/strict';
import { geocodePlace } from '../src/geography.mjs';
import { createTestDatabase } from './helpers/database.mjs';
const features = {
  lyon: {
    geometry: { coordinates: [4.869577, 45.751578] },
    properties: {
      label: 'Lyon 3e Arrondissement',
      name: 'Lyon 3e Arrondissement',
      city: 'Lyon 3e Arrondissement',
      citycode: '69383',
      postcode: '69003',
      type: 'municipality',
      id: '69383',
      context: '69, Rhône',
    },
  },
  paris: {
    geometry: { coordinates: [2.323026, 48.830108] },
    properties: {
      label: 'Paris 14e Arrondissement',
      name: 'Paris 14e Arrondissement',
      city: 'Paris 14e Arrondissement',
      citycode: '75114',
      postcode: '75014',
      type: 'municipality',
      id: '75114',
      context: '75, Paris',
    },
  },
  marseille: {
    geometry: { coordinates: [5.38, 43.26] },
    properties: {
      label: 'Marseille 8e Arrondissement',
      name: 'Marseille 8e Arrondissement',
      city: 'Marseille 8e Arrondissement',
      citycode: '13208',
      postcode: '13008',
      type: 'municipality',
      id: '13208',
      context: '13, Bouches-du-Rhône',
    },
  },
};
const wrong = {
  geometry: { coordinates: [3.05, 50.63] },
  properties: {
    label: 'Rue de Lyon 59000 Lille',
    city: 'Lille',
    citycode: '59350',
    postcode: '59000',
    type: 'street',
    id: '59350_123',
  },
};
const transport = async (url) => {
  const q = new URL(url).searchParams.get('q').toLowerCase();
  const feature =
    features[q.includes('lyon') ? 'lyon' : q.includes('paris') ? 'paris' : 'marseille'];
  return Response.json({ features: [wrong, feature, { ...feature }] });
};
test('structured IGN retains administrative metadata and rejects out-of-context homonyms and duplicates', async () => {
  for (const [city, district, key] of [
    ['Lyon', 3, 'lyon'],
    ['Paris', 14, 'paris'],
    ['Marseille', 8, 'marseille'],
  ]) {
    const locations = await geocodePlace(
      { query: `${city} ${district}e`, city, district, kind: 'municipality' },
      transport,
    );
    assert.equal(locations.length, 1);
    assert.equal(locations[0].cityCode, features[key].properties.citycode);
    assert.equal(locations[0].postcode, features[key].properties.postcode);
    assert.equal(locations[0].sourceId, features[key].properties.id);
    assert.equal(locations[0].district, district);
  }
});
test('a district query cannot silently broaden to the whole municipality', async () => {
  const lyon = {
    ...features.lyon,
    properties: {
      ...features.lyon.properties,
      name: 'Lyon',
      city: 'Lyon',
      label: 'Lyon',
      citycode: '69123',
      postcode: '69001',
    },
  };
  const result = await geocodePlace(
    { query: 'Lyon 3e', city: 'Lyon', district: 3, kind: 'municipality' },
    async () => Response.json({ features: [lyon, wrong] }),
  );
  assert.deepEqual(result, []);
});
test('ambiguous communes retain distinct commune codes and context for clarification', async () => {
  const records = [
    ['93066', '93200', '93, Seine-Saint-Denis'],
    ['97411', '97400', '974, La Réunion'],
  ].map(([citycode, postcode, context], index) => ({
    geometry: { coordinates: [2 + index, 48] },
    properties: {
      city: 'Saint-Denis',
      name: 'Saint-Denis',
      label: 'Saint-Denis',
      id: citycode,
      citycode,
      postcode,
      context,
      type: 'municipality',
    },
  }));
  const result = await geocodePlace(
    { query: 'Saint-Denis', city: 'Saint-Denis', kind: 'municipality' },
    async () => Response.json({ features: [...records, wrong] }),
  );
  assert.deepEqual(new Set(result.map((place) => place.cityCode)), new Set(['93066', '97411']));
});
test('district-constrained practice search excludes closer records outside that district', async () => {
  const { fixtures } = await import('./helpers/database.mjs');
  const { findPractices } = await import('../src/discovery.mjs');
  const records = fixtures.slice(0, 2).map((record, index) => ({
    ...record,
    postalCode: index ? '69008' : '69003',
    address: `1 Rue Test ${index ? '69008' : '69003'} Lyon`,
    location: { latitude: 45.751578 + (index ? 0 : 0.001), longitude: 4.869577 },
  }));
  const db = await createTestDatabase(records);
  try {
    const origin = (
      await geocodePlace(
        { query: 'Lyon 3e', city: 'Lyon', district: 3, kind: 'municipality' },
        transport,
      )
    )[0];
    const found = await findPractices(db, {
      confirmed: true,
      needs: { keys: [], minWidth: null },
      origin,
      radiusKm: 5,
    });
    assert.deepEqual(
      found.results.map((practice) => practice.id),
      [records[0].id],
    );
    assert.equal(found.counts.outsideGeography, 1);
    assert.equal(found.origin.cityCode, '69383');
  } finally {
    db.close();
  }
});
test('postal-only and commune-code context work without inventing a city name', async () => {
  const { geocode } = await import('../src/geography.mjs');
  const fetcher = async () => Response.json({ features: [features.lyon, wrong] });
  for (const input of [
    { query: '69003', postcode: '69003', kind: 'municipality' },
    { query: '1 rue test', cityCode: '69383', kind: 'address' },
  ]) {
    const places = await geocodePlace(input, fetcher);
    assert.equal(places.length, 1);
    assert.equal(places[0].cityCode, '69383');
  }
  const postal = await geocode('69003', fetcher);
  assert.equal(postal.length, 1);
  assert.equal(postal[0].district, 3);
});
