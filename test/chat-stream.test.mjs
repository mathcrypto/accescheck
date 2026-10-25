import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { createTestDatabase } from './helpers/database.mjs';
const db = await createTestDatabase();
test.after(() => db.close());
function request(body) {
  return new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(body),
  });
}
test('chat streams actual local activity and a terminal answer without pretending to call OpenAI', async () => {
  const response = await worker.fetch(
    request({ message: 'Généraliste sans contrainte géographique, équipement auditif.' }),
    { DB: db },
  );
  assert.match(response.headers.get('content-type'), /ndjson/);
  const events = (await response.text())
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
  assert.equal(events[0].type, 'status');
  assert.ok(events.some((event) => event.type === 'reply'));
  assert.equal(events.at(-1).type, 'result');
  assert.ok(!JSON.stringify(events).includes('OpenAI'));
  assert.equal(events.at(-1).value.question, null);
});
test('invalid stream payload still fails before opening the stream', async () => {
  const response = await worker.fetch(request({ message: 'Bonjour', unexpected: true }), {
    DB: db,
  });
  assert.equal(response.status, 400);
  assert.doesNotMatch(response.headers.get('content-type'), /ndjson/);
});
test('closing a response cancels the outstanding IGN request', async () => {
  const original = globalThis.fetch;
  let started, stopped;
  const began = new Promise((resolve) => {
    started = resolve;
  });
  const aborted = new Promise((resolve) => {
    stopped = resolve;
  });
  globalThis.fetch = async (url, options) => {
    assert.equal(new URL(url).hostname, 'data.geopf.fr');
    started();
    return new Promise((_resolve, reject) =>
      options.signal.addEventListener(
        'abort',
        () => {
          stopped();
          reject(options.signal.reason);
        },
        { once: true },
      ),
    );
  };
  try {
    const response = await worker.fetch(request({ message: 'Généraliste à Lyon, fauteuil.' }), {
      DB: db,
    });
    const reader = response.body.getReader();
    await reader.read();
    await began;
    await reader.cancel();
    await Promise.race([
      aborted,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(new Error('IGN was not cancelled')), 1000),
      ),
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
test('provider activity is emitted only when an upstream request actually starts', async () => {
  let calls = 0;
  const original = globalThis.fetch;
  globalThis.fetch = async () => {
    calls++;
    throw new Error('Unexpected provider call');
  };
  try {
    const response = await worker.fetch(
      request({ message: 'Je m’appelle Alice, je suis malentendant.', consent: true }),
      { DB: db, OPENAI_API_KEY: 'test-key' },
    );
    const events = (await response.text())
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    assert.equal(calls, 0);
    assert.ok(!events.some((event) => event.type === 'status' && /OpenAI/.test(event.text)));
  } finally {
    globalThis.fetch = original;
  }
});
