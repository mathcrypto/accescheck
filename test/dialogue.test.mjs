import test from 'node:test';
import assert from 'node:assert/strict';
import { runDialogue } from '../src/agents/dialogue.mjs';
import { createTestDatabase } from './helpers/database.mjs';
const db = await createTestDatabase();
test.after(() => db.close());
const env = { DB: db };
const location = { label: 'Lyon 69001', latitude: 45.767, longitude: 4.835, approximate: true };
let calls = 0;
const transport = async (url) => {
  calls++;
  assert.equal(new URL(url).hostname, 'data.geopf.fr');
  return Response.json({
    features: [
      {
        geometry: { coordinates: [location.longitude, location.latitude] },
        properties: { label: location.label, postcode: '69001', type: 'municipality' },
      },
    ],
  });
};
const ask = (body, config = env, fetcher = transport) => runDialogue(body, config, fetcher);
const answer = (previous, value) =>
  ask({ state: previous.state, answer: { field: previous.question.id, value } });

test('known profession/place/access are not asked again; IGN location needs confirmation', async () => {
  const result = await ask({
    message: 'Je cherche un généraliste à Lyon, je me déplace en fauteuil.',
  });
  assert.equal(result.state.specialty, 'Médecin généraliste');
  assert.deepEqual(result.state.needs.keys, ['stepFree', 'route', 'width']);
  assert.equal(result.question.id, 'location');
  assert.equal(result.results, null);
  const located = await answer(result, '0');
  assert.equal(located.question.id, 'radius');
  const radius = await answer(located, '3');
  assert.equal(radius.question.id, 'width');
  const width = await answer(radius, '__unknown__');
  assert.equal(width.question, null);
  assert.equal(width.state.needs.minWidth, null);
  assert.equal(width.state.radiusKm, 3);
  assert.ok(width.actions.some((action) => action.id === 'confirm'));
});
test('unknown answers terminate without invented criteria or geographic constraints', async () => {
  let result = await ask({ message: 'Bonjour' });
  for (const field of ['specialty', 'place', 'access']) {
    assert.equal(result.question.id, field);
    assert.ok(result.question.options.some((option) => option.value === '__unknown__'));
    result = await answer(result, '__unknown__');
  }
  assert.equal(result.question, null);
  assert.deepEqual(result.state.needs.keys, []);
  assert.equal(result.state.origin, null);
  assert.match(result.summary, /non précisé|inconnu/i);
  const found = await ask({ action: 'confirm', state: result.state });
  assert.ok(found.results.total > 0);
});
test('free text, width units and corrections preserve unrelated details', async () => {
  let result = await ask({
    message: 'Généraliste sans marche, passage de 0,9 m, sans contrainte géographique.',
  });
  assert.equal(result.question, null);
  assert.equal(result.state.needs.minWidth, 90);
  result = await ask({ message: 'Finalement passage de 100 cm', state: result.state });
  assert.equal(result.state.needs.minWidth, 100);
  assert.equal(result.state.specialty, 'Médecin généraliste');
  assert.ok(result.state.needs.keys.includes('stepFree'));
  assert.equal(result.results, null);
});
test('unsupported needs become explicit cabinet questions instead of false matches', async () => {
  const result = await ask({
    message: 'Généraliste sans contrainte géographique, aide au transfert.',
  });
  assert.equal(result.question, null);
  assert.ok(result.state.notes.some((note) => /transfert/i.test(note)));
  assert.match(result.summary, /confirmer auprès du cabinet/);
});
test('unknown hearing needs ask the desired accommodation, not medical diagnosis', async () => {
  let result = await ask({
    message: 'Généraliste sans contrainte géographique, je suis malentendant.',
  });
  assert.equal(result.question.id, 'communication');
  result = await answer(result, 'communication');
  assert.deepEqual(result.state.needs.keys, ['communication']);
  assert.equal(result.question, null);
});
test('invalid width, state, answer and early confirmation fail before external work', async () => {
  const before = calls;
  for (const body of [
    { state: { needs: { keys: ['bogus'], minWidth: null } }, message: 'Bonjour' },
    { action: 'confirm' },
    { message: 'Passage 20 cm' },
    { message: 'x'.repeat(2001) },
    { answer: { field: 'radius', value: '5' } },
    { message: 'Bonjour', secret: 'unexpected' },
  ])
    await assert.rejects(ask(body));
  assert.equal(calls, before);
});
test('no consent means no provider request, and provider failure falls back visibly', async () => {
  const requests = [];
  const fetcher = async (url) => {
    requests.push(url);
    return new Response('secret', { status: 429 });
  };
  const local = await ask(
    { message: 'Généraliste sans contrainte géographique, malentendant.' },
    { ...env, OPENAI_API_KEY: 'secret' },
    fetcher,
  );
  assert.equal(requests.length, 0);
  const fallback = await ask(
    { message: 'Généraliste sans contrainte géographique, malentendant.', consent: true },
    { ...env, OPENAI_API_KEY: 'secret' },
    fetcher,
  );
  assert.equal(requests.length, 1);
  assert.equal(fallback.state.source, 'local');
  assert.match(fallback.notice, /locales/);
  assert.ok(!JSON.stringify(fallback).includes('secret'));
  assert.deepEqual(local.state.needs.keys, fallback.state.needs.keys);
});
test('explicitly removing access constraints cancels pending accommodation questions', async () => {
  const first = await ask({ message: 'Généraliste sans contrainte géographique, malentendant.' });
  const changed = await ask({
    state: first.state,
    message: 'Finalement, pas de contrainte particulière.',
  });
  assert.equal(changed.question, null);
  assert.deepEqual(changed.state.needs.keys, []);
});
test('free-text accommodation replaces the broad hearing suggestion', async () => {
  const first = await ask({ message: 'Généraliste sans contrainte géographique, malentendant.' });
  const changed = await ask({ state: first.state, message: 'Je souhaite un échange écrit.' });
  assert.deepEqual(changed.state.needs.keys, ['communication']);
  assert.equal(changed.question, null);
});
test('free-text multiword locations retain the whole query', async () => {
  const first = await ask({ message: 'Généraliste, équipement auditif.' });
  assert.equal(first.question.id, 'place');
  let query = '';
  await ask({ state: first.state, message: 'Saint Étienne' }, env, async (url) => {
    query = new URL(url).searchParams.get('q');
    return Response.json({ features: [] });
  });
  assert.match(query, /saint.*[eé]tienne/i);
});
test('adding hearing needs preserves confirmed mobility requirements', async () => {
  const first = await ask({
    message: 'Généraliste sans contrainte géographique, fauteuil roulant, passage 90 cm.',
  });
  const added = await ask({ state: first.state, message: 'Je suis malentendant.' });
  assert.deepEqual(added.state.needs.keys, ['stepFree', 'route', 'width', 'hearing']);
  assert.equal(added.state.needs.minWidth, 90);
});
test('unknown accommodations remove inferred filters without removing explicit access needs', async () => {
  const first = await ask({
    message: 'Généraliste sans contrainte géographique, sans marche, malentendant.',
  });
  const unknown = await answer(first, '__unknown__');
  assert.deepEqual(unknown.state.needs.keys, ['stepFree', 'route']);
  const blind = await ask({ message: 'Généraliste sans contrainte géographique, canne blanche.' });
  assert.deepEqual((await answer(blind, '__unknown__')).state.needs.keys, []);
});
test('explicit written or LSF accommodation is not asked again', async () => {
  for (const message of [
    'Généraliste sans contrainte géographique, malentendant, je souhaite un échange écrit.',
    'Généraliste sans contrainte géographique, sourd, je communique en LSF.',
  ]) {
    const result = await ask({ message });
    assert.equal(result.question, null);
    assert.ok(!result.state.needs.keys.includes('hearing'));
  }
});
test('explicit negation removes only the affected group', async () => {
  const first = await ask({
    message:
      'Généraliste sans contrainte géographique, fauteuil, passage 90 cm, équipement auditif.',
  });
  const corrected = await ask({ state: first.state, message: 'Je ne suis plus en fauteuil.' });
  assert.deepEqual(corrected.state.needs.keys, ['hearing']);
});
test('phrase aliases preserve other needs from the same message', async () => {
  for (const text of ['fauteuil roulant et échange écrit', 'sans marche et passage large']) {
    const result = await ask({ message: 'Généraliste sans contrainte géographique, ' + text });
    assert.ok(result.state.needs.keys.includes('stepFree'));
    assert.ok(result.state.needs.keys.includes('route'));
    assert.ok(result.state.needs.keys.includes('width'));
    if (text.includes('écrit')) assert.ok(result.state.needs.keys.includes('communication'));
  }
});
