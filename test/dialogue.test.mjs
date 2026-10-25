import test from 'node:test';
import assert from 'node:assert/strict';
import { runSearchAgent } from '../src/agents/search-agent.mjs';
const env = { OPENAI_API_KEY: 'controlled-key' };
for (const body of [
  { message: 'x'.repeat(2001) },
  { message: 'Bonjour', unexpected: true },
  { action: 'fake' },
  { answer: { field: 'lieu', value: 'forged' }, state: { signature: 'forged' }, consent: true },
  { message: 'Bonjour', state: { signature: 'forged' }, consent: true },
])
  test(
    'invalid input/state is rejected without external work: ' + Object.keys(body).join(','),
    async () => {
      let calls = 0;
      await assert.rejects(
        runSearchAgent(body, env, async () => {
          calls++;
          throw Error('External call');
        }),
      );
      assert.equal(calls, 0);
    },
  );
