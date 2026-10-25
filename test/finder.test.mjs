import test from 'node:test';
import assert from 'node:assert/strict';
import worker from '../worker/index.js';
test('the former deterministic finder endpoint is retired explicitly', async () => {
  const response = await worker.fetch(
    new Request('https://example.test/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'Un dentiste à Lyon 3e' }),
    }),
  );
  assert.equal(response.status, 410);
  assert.match((await response.json()).error, /api\/chat/);
});
