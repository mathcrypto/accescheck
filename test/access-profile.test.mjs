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
import { createHandler } from '../src/handler.mjs';
import { getTranslator } from '../src/i18n-core.mjs';

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
test('profile reuse uses semantic keys and interpolates the confirmed width', () => {
  const values = {
    'profile.reuse.intro': 'My access needs:',
    'criteria.stepFree': 'Step-free entrance',
    'criteria.width': 'Entrance door width',
    'profile.reuse.width': 'At least 90 cm.',
    'profile.reuse.askLocation': 'Ask for the profession and location.',
  };
  const description = profileDescription(needs, (key, parameters) => {
    if (key === 'profile.reuse.width') assert.equal(parameters.width, 90);
    assert.ok(Object.hasOwn(values, key), key);
    return values[key];
  });
  assert.equal(
    description,
    'My access needs:\nStep-free entrance\nEntrance door width\nAt least 90 cm.\nAsk for the profession and location.',
  );
});
test('the saved profile creates a fully English request without changing its criteria', () => {
  const description = profileDescription(needs, getTranslator('en'));
  assert.match(description, /^For my search/);
  assert.match(description, /Step-free entrance\nEntrance door width/);
  assert.match(description, /Clear width of at least 90 cm/);
  assert.match(description, /profession and location/);
  assert.match(
    profileDescription({ ...needs, fictional: true }, getTranslator('en')),
    /^Fictional example for testing, not my real needs/,
  );
  assert.deepEqual(needs, { keys: ['stepFree', 'width'], minWidth: 90 });
});
test('profile management is read-only and the separate extraction endpoint does not exist', async () => {
  const handler = createHandler({
    home: 'home',
    consultationPage: 'visit',
    profilePage: 'profile',
  });
  for (const path of ['/profil', '/profil/']) {
    const page = await handler.fetch(new Request('http://localhost' + path));
    assert.equal(await page.text(), 'profile');
    assert.equal(page.headers.get('cache-control'), 'no-store');
  }
  const obsolete = await handler.fetch(
    new Request('http://localhost/api/profile-extract', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Sans marche', consent: true }),
    }),
  );
  assert.equal(obsolete.status, 404);
});
