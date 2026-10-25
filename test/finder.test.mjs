import test from 'node:test';
import assert from 'node:assert/strict';
import { openSqlite } from '../storage/sqlite.mjs';
import {
  extractPlaceQuery,
  geocodeQueryFor,
  matchSpecialty,
  runFinder,
  targetPostcodes,
} from '../src/agents/finder.mjs';

test('finder uses local rules and returns Accès Libre practices without OpenAI', async () => {
  const db = openSqlite();
  try {
    const result = await runFinder(
      { message: 'Je me déplace avec une canne blanche.', consent: false },
      { DB: db },
    );
    assert.equal(result.source || result.state.source, 'local');
    assert.deepEqual(result.state.needs.keys, ['signage']);
    assert.match(result.reply, /cabinet/i);
    assert.ok(result.results);
    assert.ok(result.results.total >= 0);
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
  const db = openSqlite();
  try {
    const result = await runFinder({ message: 'Bonjour', consent: false }, { DB: db });
    assert.deepEqual(result.state.needs.keys, []);
    assert.equal(result.results, null);
  } finally {
    db.close();
  }
});

test('finder matches short specialty forms and autour-de places', async () => {
  const db = openSqlite();
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
    assert.equal(extractPlaceQuery('dans le 11e'), 'Paris 11e');
    assert.match(extractPlaceQuery('malentendant grenoble generaliste'), /grenoble/i);
    assert.match(extractPlaceQuery('à Lyon'), /lyon/i);
    assert.equal(extractPlaceQuery('38000'), '38000');
  } finally {
    db.close();
  }
});

test('finder searches immediately for specialty and place', async () => {
  const db = openSqlite();
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
  assert.equal(geocodeQueryFor('bastille'), 'bastille Paris');
  assert.equal(geocodeQueryFor('Bastille Paris'), 'Bastille Paris');
  const db = openSqlite();
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

test('Bastille alone resolves in Paris with a 5 km radius', async () => {
  const db = openSqlite();
  try {
    const result = await runFinder(
      {
        message: 'Je me déplace avec une canne blanche. généraliste autour de Bastille',
        consent: false,
      },
      { DB: db },
    );
    assert.match(result.state.placeQuery, /bastille/i);
    assert.match(result.state.origin?.label || '', /bastille/i);
    assert.match(result.state.origin?.label || '', /paris/i);
    assert.doesNotMatch(result.state.origin?.label || '', /saint-thual/i);
    assert.equal(result.state.radiusKm, 5);
  } finally {
    db.close();
  }
});

test('bastille paris keeps Bastille as origin within 5 km', async () => {
  assert.equal(extractPlaceQuery('bastille paris medecin generaliste'), 'bastille paris');
  const db = openSqlite();
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
  const db = openSqlite();
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

test('finder keeps prior needs when a follow-up only adds place or specialty', async () => {
  const db = openSqlite();
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
  const db = openSqlite();
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
