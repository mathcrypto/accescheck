import test from 'node:test';
import assert from 'node:assert/strict';
import {
  profileKey,
  profileLifetime,
  accessProfile,
  saveProfile,
  readProfile,
  profileDescription,
} from '../src/profile-core.mjs';
import { extractAccessProfile } from '../src/agents/profile-extract.mjs';
import { createHandler } from '../src/handler.mjs';

const needs = { keys: ['stepFree', 'width'], minWidth: 90 };
const storage = () => {
  const values = new Map();
  return {
    getItem: (key) => values.get(key) || null,
    setItem: (key, value) => values.set(key, value),
    removeItem: (key) => values.delete(key),
  };
};
test('only explicitly approved structured needs persist and expire after 30 days', () => {
  const local = storage(),
    now = Date.now();
  assert.throws(() => saveProfile(local, needs, false, now), /accord/);
  assert.equal(local.getItem(profileKey), null);
  saveProfile(local, needs, true, now);
  assert.deepEqual(readProfile(local, now).keys, needs.keys);
  assert.equal(readProfile(local, now).expiresAt, now + profileLifetime);
  assert.equal(readProfile(local, now + profileLifetime), null);
  assert.equal(local.getItem(profileKey), null);
});
test('free text, addresses, signed state and unrecognised fields cannot be saved', () => {
  for (const extra of ['description', 'notes', 'address', 'state', 'signature', 'name'])
    assert.throws(() => accessProfile({ ...needs, [extra]: 'private content' }));
  for (const value of [
    { keys: [], minWidth: null },
    { keys: ['diagnosis'], minWidth: null },
    { keys: ['width'], minWidth: 39 },
    { keys: ['stepFree'], minWidth: 90 },
  ])
    assert.throws(() => accessProfile(value));
});
test('corrupt and overlong records are removed; unavailable storage remains an explicit error', () => {
  const local = storage();
  for (const raw of [
    'not json',
    'null',
    JSON.stringify({ ...needs, version: 1, savedAt: 1, expiresAt: 2, notes: 'private' }),
    'x'.repeat(2001),
  ]) {
    local.setItem(profileKey, raw);
    assert.equal(readProfile(local), null);
    assert.equal(local.getItem(profileKey), null);
  }
  assert.throws(
    () =>
      saveProfile(
        {
          setItem() {
            throw new Error('Blocked');
          },
        },
        needs,
        true,
      ),
    /Blocked/,
  );
});
test('fictional profiles stay fictional and reuse contains no private conversation or location', () => {
  assert.match(profileDescription({ ...needs, fictional: true }), /fictif/);
  assert.match(profileDescription(needs), /90 cm/);
  assert.match(profileDescription(needs), /profession et le lieu/);
});
test('extraction reuses the agent but returns no questions, conversation, diagnosis or provider secrets', async () => {
  let calls = 0;
  const provider = async (_url, options) => {
    calls++;
    const sent = JSON.parse(options.body);
    assert.equal(sent.store, false);
    return Response.json({
      status: 'completed',
      output: [
        {
          content: [
            {
              type: 'output_text',
              text: JSON.stringify({
                ...needs,
                questions: ['Information libre à ne pas conserver'],
              }),
            },
          ],
        },
      ],
    });
  };
  await assert.rejects(
    extractAccessProfile(
      { description: 'Sans marche', consent: false },
      { OPENAI_API_KEY: 'secret' },
      provider,
    ),
  );
  assert.equal(calls, 0);
  const result = await extractAccessProfile(
    { description: 'Une entrée sans marche et 90 cm de passage', consent: true },
    { OPENAI_API_KEY: 'secret' },
    provider,
  );
  assert.deepEqual(result, { ...needs, requiresConfirmation: true });
  assert.doesNotMatch(JSON.stringify(result), /Information libre|secret/);
});

test('profile routes preserve origin checks, body bounds and explicit consent', async () => {
  const handler = createHandler({
    home: 'home',
    consultationPage: 'visit',
    profilePage: 'profile',
  });
  const page = await handler.fetch(new Request('http://localhost/profil'));
  assert.equal(await page.text(), 'profile');
  assert.equal(page.headers.get('cache-control'), 'no-store');
  const request = (body, origin) =>
    new Request('http://localhost/api/profile-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...(origin ? { Origin: origin } : {}) },
      body: JSON.stringify(body),
    });
  assert.equal(
    (
      await handler.fetch(request({ description: 'Sans marche', consent: false }), {
        OPENAI_API_KEY: 'not-used',
      })
    ).status,
    400,
  );
  assert.equal(
    (
      await handler.fetch(
        request({ description: 'Sans marche', consent: true }, 'https://other.example'),
      )
    ).status,
    403,
  );
  assert.equal(
    (await handler.fetch(request({ description: 'x'.repeat(12000), consent: true }))).status,
    413,
  );
});
