import test from 'node:test';
import assert from 'node:assert/strict';
import { collectReviewSources, safeReviewUrl } from '../src/agents/review-sources.mjs';
import { createTestDatabase, fixtures } from './helpers/database.mjs';
import { reviewSource, reviewResponse } from './helpers/reviews.mjs';
const db = await createTestDatabase();
test.after(() => db.close());
const env = { DB: db, OPENAI_API_KEY: 'private-test-key' };
const body = { practiceId: fixtures[0].id, consent: true };
test('bounded web search uses only the stored public identity and returns clickable actual sources', async () => {
  let request;
  const result = await collectReviewSources(body, env, async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    request = JSON.parse(options.body);
    return reviewResponse([
      reviewSource(fixtures[0]),
      reviewSource(fixtures[0], { url: 'https://avis.autre.fr/cabinet', title: 'Autre source' }),
    ]);
  });
  assert.deepEqual(JSON.parse(request.input), {
    name: fixtures[0].name,
    address: fixtures[0].address,
    entityType: 'establishment',
  });
  assert.equal(request.store, false);
  assert.equal(request.max_tool_calls, 2);
  assert.equal(request.tools[0].type, 'web_search');
  assert.ok(request.max_output_tokens <= 4000);
  assert.deepEqual(request.include, ['web_search_call.action.sources']);
  assert.equal(result.sources.length, 2);
  assert.ok(result.sources.every((source) => source.match === 'matched'));
  assert.equal(result.coverage.distinctSites, 2);
  assert.ok(!JSON.stringify(result).includes('private-test-key'));
});
test('consent, unexpected private fields, disabled provider and unknown records fail before provider work', async () => {
  let called = false;
  const transport = async () => {
    called = true;
    throw new Error('Unexpected');
  };
  for (const input of [
    { ...body, consent: false },
    { ...body, needs: 'PRIVATE HEALTH' },
    { ...body, name: 'FORGED' },
    { ...body, practiceId: 'missing' },
  ])
    await assert.rejects(collectReviewSources(input, env, transport));
  await assert.rejects(collectReviewSources(body, { DB: db }, transport));
  assert.equal(called, false);
});
test('doctor reviews, homonyms and wrong addresses are never attributed to the establishment', async () => {
  const sources = [
    reviewSource(fixtures[0], { entityType: 'practitioner' }),
    reviewSource(fixtures[0], { url: 'https://autre.exemple.fr/avis', ambiguous: true }),
    reviewSource(fixtures[0], {
      url: 'https://trois.exemple.fr/avis',
      entityAddress: '99 Rue Autre 69001 Lyon',
    }),
  ];
  const result = await collectReviewSources(body, env, async () => reviewResponse(sources));
  assert.deepEqual(
    result.sources.map((source) => source.match),
    ['different_scope', 'ambiguous', 'unconfirmed'],
  );
  assert.ok(
    result.sources.every(
      (source) =>
        source.rating === null && source.reviewCount === null && !source.observations.length,
    ),
  );
});
test('model-invented links, unsafe URLs, duplicate source pages and invalid ratings are rejected or withheld', async () => {
  for (const url of [
    'javascript:alert(1)',
    'http://example.fr/',
    'https://user:pass@example.fr/',
    'https://127.0.0.1/',
    'https://localhost/',
    'https://evil.local/',
    'https://[::1]/',
  ])
    assert.equal(safeReviewUrl(url), null);
  const source = reviewSource(fixtures[0]);
  const result = await collectReviewSources(body, env, async () =>
    reviewResponse(
      [source, { ...source }, { ...source, url: 'https://invented.exemple.fr/' }],
      [source.url],
    ),
  );
  assert.equal(result.sources.length, 1);
  const invalid = await collectReviewSources(body, env, async () =>
    reviewResponse([{ ...source, rating: 9, ratingScale: 5 }]),
  );
  assert.equal(invalid.sources[0].rating, null);
});
test('provider errors, incomplete responses and malformed output do not expose secrets', async () => {
  for (const response of [
    new Response('private-test-key', { status: 429 }),
    Response.json({ status: 'incomplete' }),
    Response.json({ status: 'completed', output: [] }),
  ])
    await assert.rejects(
      collectReviewSources(body, env, async () => response),
      (error) => !error.message.includes('private-test-key'),
    );
});
