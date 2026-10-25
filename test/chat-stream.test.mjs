import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
import { createTestDatabase } from './helpers/database.mjs';
const db = await createTestDatabase();
test.after(() => db.close());
const request = (body) =>
  new Request('https://example.test/api/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson' },
    body: JSON.stringify(body),
  });
test('local consent response ends normally and advertises the degraded directory explicitly', async () => {
  const response = await worker.fetch(
    request({ message: 'Un dentiste à Lyon 3e', consent: false }),
    { DB: db },
  );
  const events = (await response.text()).trim().split('\n').map(JSON.parse);
  assert.equal(events.at(-1).type, 'result');
  assert.equal(events.at(-1).value.question, null);
  assert.match(events.at(-1).value.reply, /dégradé/);
  assert.ok(!events.some((event) => event.type === 'status' && /OpenAI/.test(event.text)));
});
test('invalid payload fails before opening a stream', async () => {
  const response = await worker.fetch(request({ message: 'Bonjour', unexpected: true }), {
    DB: db,
  });
  assert.equal(response.status, 400);
  assert.doesNotMatch(response.headers.get('content-type'), /ndjson/);
});
test('actual provider work emits a status and is cancelled when response is closed', async () => {
  const original = globalThis.fetch;
  let started, stopped;
  const began = new Promise((resolve) => (started = resolve)),
    aborted = new Promise((resolve) => (stopped = resolve));
  globalThis.fetch = async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
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
    const response = await worker.fetch(
      request({ message: 'Un dentiste à Lyon 3e', consent: true }),
      { DB: db, OPENAI_API_KEY: 'controlled-key' },
    );
    const reader = response.body.getReader();
    const first = await reader.read();
    assert.match(new TextDecoder().decode(first.value), /OpenAI/);
    await began;
    await reader.cancel();
    await Promise.race([
      aborted,
      new Promise((_resolve, reject) =>
        setTimeout(() => reject(Error('Provider was not cancelled')), 1000),
      ),
    ]);
  } finally {
    globalThis.fetch = original;
  }
});
test('errors remain terminal errors, never a fabricated local agent result', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => new Response('private-provider-body', { status: 429 });
  try {
    const response = await worker.fetch(
      request({ message: 'Un dentiste à Lyon 3e', consent: true }),
      { DB: db, OPENAI_API_KEY: 'controlled-key' },
    );
    const events = (await response.text()).trim().split('\n').map(JSON.parse);
    assert.equal(events.at(-1).type, 'error');
    assert.match(events.at(-1).message, /Limite OpenAI/);
    assert.ok(!events.some((event) => event.type === 'result'));
    assert.ok(!JSON.stringify(events).includes('private-provider-body'));
  } finally {
    globalThis.fetch = original;
  }
});
