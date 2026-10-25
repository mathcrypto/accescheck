import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseNeeds, assess, search, safeDoctolib, evidenceState } from '../src/core.mjs';
const practices = JSON.parse(readFileSync(new URL('./fixtures/practices.json', import.meta.url)));
const cases = [
  ['fauteuil roulant', ['stepFree', 'route', 'width', 'consultation']],
  ['electric wheelchair', ['stepFree', 'route', 'width', 'consultation']],
  [
    'fauteuil électrique et malentendant',
    ['stepFree', 'route', 'width', 'consultation', 'hearing'],
  ],
  ['Je suis sourd', ['hearing']],
  ['hard of hearing', ['hearing']],
  ['malvoyant', ['signage']],
  ['aveugle', ['signage']],
  ['sans marche', ['stepFree', 'route']],
  ['entrée de plain-pied', ['stepFree', 'route']],
  ['sanitaires adaptés', ['toilets']],
  ['toilettes accessibles', ['toilets']],
  ['aide au transfert', ['consultation']],
  ['déambulateur', ['stepFree', 'route', 'width', 'consultation']],
  ['Porte 95 cm', ['width']],
  ['Bonjour', []],
];
for (const [text, keys] of cases)
  test('parses: ' + text, () => assert.deepEqual(parseNeeds(text).keys, keys));
test('does not guess wheelchair width', () => {
  const n = parseNeeds('fauteuil');
  assert.equal(n.minWidth, null);
  assert.ok(n.clarification);
});
test('uses user requested width', () => assert.equal(parseNeeds('fauteuil', 92).minWidth, 92));
test('unknown stays unknown across full real dataset', () => {
  for (const p of practices) {
    for (const c of assess(p, {
      keys: ['stepFree', 'route', 'width', 'hearing', 'toilets', 'consultation', 'signage'],
      minWidth: 90,
    }).checks) {
      if (c.value === null || ['stale', 'contradictory'].includes(c.state))
        assert.equal(c.fit, 'unknown');
    }
  }
});
test('stale evidence cannot count as met', () => {
  const p = { evidence: { stepFree: { value: true, status: 'declared', date: '2020-01-01' } } };
  assert.equal(
    assess(p, { keys: ['stepFree'], minWidth: null }, new Date('2026-10-25')).checks[0].fit,
    'unknown',
  );
});
test('contradictions cannot count as met', () =>
  assert.equal(evidenceState({ value: true, status: 'contradictory' }), 'contradictory'));
test('unmet requirements rank after unresolved requirements', () => {
  const ps = [
    {
      id: 'a',
      name: 'A',
      mode: 'real',
      evidence: { stepFree: { value: false, status: 'declared' } },
    },
    { id: 'b', name: 'B', mode: 'real', evidence: { stepFree: { value: null } } },
  ];
  assert.equal(search(ps, { needs: 'sans marche' }).results[0].id, 'b');
});
test('only imported practices are available and fictional search is rejected', () => {
  assert.equal(practices.length, 3);
  assert.ok(
    practices.every((practice) => practice.mode === 'real' && practice.source === 'Accès Libre'),
  );
  assert.ok(
    practices.every((practice) =>
      practice.sourceUrl.startsWith('https://acceslibre.beta.gouv.fr/'),
    ),
  );
  assert.equal(search(practices, { needs: 'fauteuil' }).results.length, 3);
  assert.throws(() => search(practices, { needs: 'fauteuil', mode: 'demo' }));
});
test('filters exactly by district and specialty', () => {
  const r = search(practices, {
    needs: 'malentendant',
    district: '75011',
    specialty: 'Médecin généraliste',
  });
  assert.ok(
    r.results.every((p) => p.postalCode === '75011' && p.specialty === 'Médecin généraliste'),
  );
});
test('rejects unsafe booking links', () => {
  for (const url of [
    'javascript:alert(1)',
    'https://doctolib.fr.evil.com/a',
    'https://doctolib.fr@evil.com/',
    'http://doctolib.fr/',
  ])
    assert.equal(safeDoctolib(url), null);
  assert.equal(
    safeDoctolib('https://www.doctolib.fr/medecin/paris/name'),
    'https://www.doctolib.fr/medecin/paris/name',
  );
});
test('rejects invalid input', () => {
  for (const args of [
    { needs: 17 },
    { needs: 'x'.repeat(2001) },
    { needs: 'ok', width: -4 },
    { needs: 'ok', mode: 'bogus' },
  ])
    assert.throws(() => search(practices, args));
});
