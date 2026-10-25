import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizeReviews, rankByReputation } from '../src/review-core.mjs';
const observation = (id, topic = 'accueil', sentiment = 'positive', extra = {}) => ({
  text: 'Retour individuel ' + id,
  reviewId: id,
  publishedAt: '2026-10-20',
  originalUrl: null,
  themes: [{ topic, sentiment }],
  ...extra,
});
const source = (url, observations, extra = {}) => ({
  url,
  match: 'matched',
  observations,
  ...extra,
});
const sources = [
  source('https://avis.exemple.fr/cabinet', [observation('a'), observation('b', 'ecoute')]),
  source('https://avis.autre.fr/cabinet', [observation('c', 'attente', 'negative')]),
];
test('three identifiable reviews across two sites yield an explicitly limited sourced synthesis', () => {
  const result = summarizeReviews(sources);
  assert.equal(result.status, 'available');
  assert.equal(result.sampleSize, 3);
  assert.equal(result.distinctSites, 2);
  assert.equal(result.topics.find((topic) => topic.id === 'attente').negative, 1);
  assert.ok(
    result.topics.every((topic) =>
      topic.examples.every((example) => example.url.startsWith('https://')),
    ),
  );
  assert.match(result.label, /favorables/);
});
test('three identifiable reviews from a single site such as Google are enough', () => {
  const result = summarizeReviews([
    source('https://www.google.com/maps/place/cabinet', [
      observation('a'),
      observation('b', 'ecoute'),
      observation('c', 'attente'),
    ]),
  ]);
  assert.equal(result.status, 'available');
  assert.equal(result.distinctSites, 1);
  assert.match(result.label, /favorables/);
});
test('ratings and unattributed doctor reviews cannot stand in for individual establishment evidence', () => {
  const result = summarizeReviews([
    source('https://avis.exemple.fr/cabinet', [], { rating: 5, reviewCount: 100 }),
    ...sources.map((item) => ({ ...item, match: 'different_scope' })),
  ]);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.score, null);
  assert.equal(result.sampleSize, 0);
});
test('contradictory sources remain visible and detectable copies count once', () => {
  const copy = observation('a', 'accueil', 'negative', {
    text: 'Retour individuel a',
    originalUrl: 'https://avis.exemple.fr/cabinet',
  });
  const result = summarizeReviews([
    sources[0],
    source('https://avis.autre.fr/cabinet', [copy, observation('c', 'accueil', 'negative')]),
  ]);
  assert.equal(result.sampleSize, 3);
  const topic = result.topics.find((topic) => topic.id === 'accueil');
  assert.equal(topic.assessment, 'contrasté');
  assert.equal(topic.mixed, 1);
});
test('reviews without a public id count once each, and a copy of the same text counts once', () => {
  const result = summarizeReviews([
    source('https://www.google.com/maps/place/cabinet', [
      observation(null, 'accueil', 'positive', { text: 'Accueil chaleureux' }),
      observation(null, 'attente', 'positive', { text: 'Peu d’attente' }),
      observation(null, 'ecoute', 'positive', { text: 'Très à l’écoute' }),
    ]),
    source('https://annuaire.exemple.fr/cabinet', [
      observation(null, 'accueil', 'positive', { text: 'Accueil chaleureux' }),
    ]),
  ]);
  assert.equal(result.status, 'available');
  assert.equal(result.sampleSize, 3);
});
test('reputation cannot override accessibility, distance or punish missing evidence', () => {
  const rows = [
    { id: 'near', met: 1, needsConfirmation: false, distanceKm: 1 },
    { id: 'low', met: 1, needsConfirmation: false, distanceKm: 2 },
    { id: 'unknown', met: 1, needsConfirmation: false, distanceKm: 2 },
    { id: 'high', met: 1, needsConfirmation: false, distanceKm: 2 },
    { id: 'access-unknown', met: 0, needsConfirmation: true, distanceKm: 0.1 },
  ];
  const cache = new Map([
    ['near', { summary: { score: -1, status: 'available' } }],
    ['low', { summary: { score: -1, status: 'available' } }],
    ['high', { summary: { score: 1, status: 'available' } }],
    ['access-unknown', { summary: { score: 1, status: 'available' } }],
  ]);
  assert.deepEqual(
    rankByReputation(rows, cache).map((row) => row.id),
    ['near', 'high', 'unknown', 'low', 'access-unknown'],
  );
  assert.deepEqual(
    rows.map((row) => row.id),
    ['near', 'low', 'unknown', 'high', 'access-unknown'],
  );
});
test('a later identity/text bridge merges duplicate groups before deciding the sample is sufficient', () => {
  const result = summarizeReviews([
    source('https://avis.alpha.fr/cabinet', [
      observation('a', 'accueil', 'positive', { text: 'Texte X' }),
    ]),
    source('https://avis.beta.fr/cabinet', [
      observation('b', 'accueil', 'positive', { text: 'Texte Y' }),
    ]),
    source('https://avis.gamma.fr/cabinet', [
      observation('a', 'accueil', 'positive', {
        text: 'Texte Y',
        originalUrl: 'https://avis.alpha.fr/cabinet',
      }),
      observation('c', 'ecoute', 'positive', { text: 'Texte Z' }),
    ]),
  ]);
  assert.equal(result.sampleSize, 2);
  assert.equal(result.status, 'insufficient');
  assert.equal(result.score, null);
});
