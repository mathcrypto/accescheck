import test, { after, before } from 'node:test';
import assert from 'node:assert/strict';
import { createTestDatabase, fixtures } from './helpers/database.mjs';
import {
  extractPlaceQuery,
  geocodeQueryFor,
  matchSpecialty,
  runFinder,
  targetPostcodes,
} from '../src/agents/finder.mjs';

// The finder tests must not depend on a synced local database or on the live IGN
// geocoder, so they use in-memory practices and a canned address response.
const [template] = fixtures;
function practice(id, name, specialty, postalCode, street, location, evidence = {}) {
  return {
    ...template,
    id,
    name,
    specialty,
    postalCode,
    address: `${street} ${postalCode} Paris`,
    sourceUrl: `https://acceslibre.beta.gouv.fr/app/75-paris/a/test/erp/${id}/`,
    location,
    evidence: {
      ...template.evidence,
      ...Object.fromEntries(
        Object.entries(evidence).map(([key, value]) => [
          key,
          { value, status: 'declared', date: null, source: 'Accès Libre · déclaration publique' },
        ]),
      ),
    },
  };
}
const generalist = 'Médecin généraliste';
const finderRecords = [
  ...fixtures,
  practice(
    't-bastille-1',
    'Cabinet Bastille',
    generalist,
    '75011',
    '5 Rue de la Roquette',
    {
      latitude: 48.8545,
      longitude: 2.369,
    },
    { stepFree: true, route: true, width: 95, hearing: true, signage: true },
  ),
  practice(
    't-bastille-2',
    'Cabinet Faidherbe',
    generalist,
    '75011',
    '12 Rue Faidherbe',
    {
      latitude: 48.8509,
      longitude: 2.3841,
    },
    { stepFree: true, route: null, width: null, hearing: false },
  ),
  practice(
    't-denfert-1',
    'Cabinet Denfert',
    generalist,
    '75014',
    '3 Avenue du Général Leclerc',
    {
      latitude: 48.8335,
      longitude: 2.3315,
    },
    { stepFree: true, route: true, width: 92, hearing: true },
  ),
  practice(
    't-paris15-1',
    'Cabinet Convention',
    generalist,
    '75015',
    '40 Rue de la Convention',
    {
      latitude: 48.8418,
      longitude: 2.2965,
    },
    { stepFree: true, route: true, width: 90, hearing: true },
  ),
  practice(
    't-dentist-1',
    'Cabinet dentaire Bastille',
    'Dentiste, chirurgien dentiste',
    '75011',
    '8 Rue de Charonne',
    {
      latitude: 48.8527,
      longitude: 2.3735,
    },
    { stepFree: true },
  ),
];

const places = [
  [/denfert/i, 'Place Denfert-Rochereau 75014 Paris', '75014', 2.3326, 48.8338],
  [/bastille/i, 'Place de la Bastille 75011 Paris', '75011', 2.3692, 48.8531],
  [/15e/i, 'Paris 15e Arrondissement 75015 Paris', '75015', 2.2999, 48.8421],
];
const realFetch = globalThis.fetch;
before(() => {
  globalThis.fetch = async (url) => {
    assert.equal(new URL(url).hostname, 'data.geopf.fr', 'Finder must only call IGN');
    const query = new URL(url).searchParams.get('q') || '';
    const place = /paris/i.test(query) ? places.find(([pattern]) => pattern.test(query)) : null;
    const municipality = new URL(url).searchParams.get('type') === 'municipality';
    const scoped = /\d{1,2}(?:e|eme)\b/.test(query);
    const municipalityLabel = scoped
      ? `Paris ${Number(place?.[2].slice(-2))}e Arrondissement`
      : 'Paris';
    const features = place
      ? [
          {
            geometry: { coordinates: [place[3], place[4]] },
            properties: {
              label: municipality
                ? `Paris ${Number(place[2].slice(-2))}e Arrondissement`
                : place[1],
              name: municipality ? municipalityLabel : place[1],
              city: 'Paris',
              postcode: place[2],
              citycode: municipality && !scoped ? '75056' : '751' + place[2].slice(-2),
              id: 'test-' + place[2] + (municipality ? '-city' : '-place'),
              type: municipality ? 'municipality' : 'street',
            },
          },
        ]
      : [];
    return new Response(JSON.stringify({ features }));
  };
});
after(() => {
  globalThis.fetch = realFetch;
});

test('finder uses local rules and returns Accès Libre practices without OpenAI', async () => {
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder(
      { message: 'Je me déplace avec une canne blanche.', consent: false },
      { DB: db },
    );
    assert.equal(result.source || result.state.source, 'local');
    assert.deepEqual(result.state.needs.keys, ['signage']);
    assert.match(result.reply, /cabinet/i);
    assert.ok(result.results);
    assert.ok(result.results.total > 0);
    assert.ok(result.steps.some((step) => /Accès Libre/.test(step.label)));
    assert.ok(
      result.results.practices.every(
        (p) => !p.checks?.length || p.checks.every((c) => c.state && c.source !== undefined),
      ),
    );
  } finally {
    db.close();
  }
});

test('finder keeps unknown needs empty instead of inventing criteria', async () => {
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder({ message: 'Bonjour', consent: false }, { DB: db });
    assert.deepEqual(result.state.needs.keys, []);
    assert.equal(result.results, null);
  } finally {
    db.close();
  }
});

test('finder matches short specialty forms and autour-de places', async () => {
  const db = await createTestDatabase(finderRecords);
  try {
    const catalog = await (
      await import('../src/practice-store.mjs')
    )
      .createPracticeStore(db)
      .catalog();
    assert.equal(matchSpecialty('un generaliste', catalog.specialties), 'Médecin généraliste');
    assert.equal(matchSpecialty('dentiste', catalog.specialties), 'Dentiste, chirurgien dentiste');
    assert.match(extractPlaceQuery('autour de Bastille'), /bastille/i);
    assert.match(extractPlaceQuery('près de République'), /republique/i);
    assert.equal(extractPlaceQuery('dans le 11e'), '');
    assert.match(extractPlaceQuery('malentendant grenoble generaliste'), /grenoble/i);
    assert.match(extractPlaceQuery('à Lyon'), /lyon/i);
    assert.equal(extractPlaceQuery('38000'), '38000');
  } finally {
    db.close();
  }
});

test('finder searches immediately for specialty and place', async () => {
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder(
      {
        message:
          'Je me déplace avec une canne blanche. je cherche un generaliste autour de bastille paris',
        consent: false,
      },
      { DB: db },
    );
    assert.equal(result.state.specialty, 'Médecin généraliste');
    assert.match(result.state.placeQuery, /bastille/i);
    assert.ok(result.state.origin);
    assert.ok(result.results);
    assert.equal(result.state.radiusKm, 5);
    assert.ok(result.results.practices.every((p) => p.specialty === 'Médecin généraliste'));
    assert.ok(
      result.results.practices.every(
        (p) => p.distanceKm === null || p.distanceKm === undefined || p.distanceKm <= 5,
      ),
    );
  } finally {
    db.close();
  }
});

test('Paris arrondissement prefers local postcode over banlieue completes', async () => {
  assert.deepEqual(targetPostcodes('Paris 15e'), ['75015']);
  assert.deepEqual(targetPostcodes('bastille'), []);
  assert.equal(geocodeQueryFor('bastille'), 'bastille');
  assert.equal(geocodeQueryFor('Bastille Paris'), 'Bastille Paris');
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder(
      {
        message: 'Je suis malentendant. paris 15eme medecin generaliste',
        consent: false,
      },
      { DB: db },
    );
    assert.equal(result.state.radiusKm, 5);
    assert.ok(result.results?.practices?.length);
    const first = result.results.practices[0];
    assert.match(first.address, /75015/);
    assert.ok(first.distanceKm === null || first.distanceKm === undefined || first.distanceKm <= 5);
    assert.ok(first.sourceUrl?.includes('acceslibre'));
  } finally {
    db.close();
  }
});

test('Bastille alone keeps an unresolved location instead of assuming Paris', async () => {
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder(
      {
        message: 'Je me déplace avec une canne blanche. généraliste autour de Bastille',
        consent: false,
      },
      { DB: db },
    );
    assert.match(result.state.placeQuery, /bastille/i);
    assert.equal(result.state.origin, null);
    assert.equal(result.state.radiusKm, null);
    assert.ok(result.results);
    assert.equal(geocodeQueryFor('Bastille'), 'Bastille');
  } finally {
    db.close();
  }
});

test('bastille paris keeps Bastille as origin within 5 km', async () => {
  assert.equal(extractPlaceQuery('bastille paris medecin generaliste'), 'bastille paris');
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder(
      {
        message:
          'Je me déplace en fauteuil électrique et j’ai besoin d’un passage de 90 cm. bastille paris medecin generaliste',
        consent: false,
      },
      { DB: db },
    );
    assert.equal(result.state.placeQuery, 'bastille paris');
    assert.match(result.state.origin?.label || '', /bastille/i);
    assert.doesNotMatch(result.state.origin?.label || '', /^Paris$/);
    assert.equal(result.state.radiusKm, 5);
    assert.ok(
      result.results.practices.every(
        (p) => p.distanceKm === null || p.distanceKm === undefined || p.distanceKm <= 5,
      ),
    );
  } finally {
    db.close();
  }
});

test('denfert paris 14e keeps Denfert as origin within 5 km', async () => {
  assert.equal(extractPlaceQuery('autour de denfert paris 14eme'), 'denfert paris 14e');
  assert.deepEqual(targetPostcodes('denfert paris 14e'), ['75014']);
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder(
      {
        message:
          'Je me déplace en fauteuil électrique et j’ai besoin d’un passage de 90 cm. je cherche un medecin generaliste autour de denfert paris 14eme',
        consent: false,
      },
      { DB: db },
    );
    assert.equal(result.state.placeQuery, 'denfert paris 14e');
    assert.match(result.state.origin?.label || '', /denfert/i);
    assert.equal(result.state.radiusKm, 5);
    assert.ok(
      result.results.practices.every(
        (p) => p.distanceKm === null || p.distanceKm === undefined || p.distanceKm <= 5,
      ),
    );
  } finally {
    db.close();
  }
});

test('reviewOnly proposes criteria and place without searching', async () => {
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder(
      {
        message:
          'Je me déplace avec une canne blanche. je cherche un generaliste autour de bastille paris',
        consent: false,
        reviewOnly: true,
      },
      { DB: db },
    );
    assert.equal(result.state.specialty, 'Médecin généraliste');
    assert.match(result.state.placeQuery, /bastille/i);
    assert.ok(result.state.origin);
    assert.equal(result.results, null);
    assert.match(result.reply, /Confirmez/);
  } finally {
    db.close();
  }
});

test('finder keeps prior needs when a follow-up only adds place or specialty', async () => {
  const db = await createTestDatabase(finderRecords);
  try {
    const first = await runFinder({ message: 'Je suis malentendant.', consent: false }, { DB: db });
    assert.deepEqual(first.state.needs.keys, ['hearing']);
    assert.ok(first.results);
    const second = await runFinder(
      {
        message: 'plutôt un generaliste autour de Bastille Paris',
        consent: false,
        state: first.state,
      },
      { DB: db },
    );
    assert.deepEqual(second.state.needs.keys, ['hearing']);
    assert.equal(second.state.specialty, 'Médecin généraliste');
    assert.match(second.state.placeQuery, /bastille/i);
    assert.ok(second.results);
  } finally {
    db.close();
  }
});

test('finder fauteuil search no longer requires salle de consultation', async () => {
  const db = await createTestDatabase(finderRecords);
  try {
    const result = await runFinder(
      {
        message: 'fauteuil électrique passage 90 cm autour de Bastille Paris',
        consent: false,
      },
      { DB: db },
    );
    assert.deepEqual(result.state.needs.keys, ['stepFree', 'route', 'width']);
    assert.ok(result.results.total > 0);
    assert.ok(result.results.completeCount > 0);
    assert.ok(!result.reply.includes('Salle de consultation accessible'));
  } finally {
    db.close();
  }
});
