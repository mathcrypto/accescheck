import test from 'node:test';
import assert from 'node:assert/strict';
import {
  aiConfiguration,
  interpretNeeds,
  validateDescription,
  validateExtraction,
} from '../src/agents/needs-agent.mjs';

const proposal = { keys: ['hearing'], minWidth: null, questions: [] };
const completed = (value = proposal) =>
  new Response(
    JSON.stringify({
      status: 'completed',
      output: [
        { type: 'message', content: [{ type: 'output_text', text: JSON.stringify(value) }] },
      ],
    }),
  );
test('the model receives only a consented description and a fixed output schema, without tools or storage', async () => {
  let request;
  const result = await interpretNeeds(
    { description: 'Je suis malentendant.', consent: true },
    {
      OPENAI_API_KEY: 'test-key',
      OPENAI_MODEL: 'test-model',
      DB: { patientName: 'PRIVATE PERSON', address: 'PRIVATE ADDRESS' },
    },
    async (url, options) => {
      assert.equal(url, 'https://api.openai.com/v1/responses');
      request = JSON.parse(options.body);
      return completed();
    },
  );
  assert.deepEqual(request.input, [
    { role: 'user', content: [{ type: 'input_text', text: 'Je suis malentendant.' }] },
  ]);
  assert.equal(request.store, false);
  assert.equal(request.tools, undefined);
  assert.equal(request.text.format.strict, true);
  assert.ok(!JSON.stringify(request).includes('PRIVATE'));
  assert.ok(!JSON.stringify(result).includes('test-key'));
  assert.equal(result.requiresConfirmation, true);
  assert.deepEqual(result.keys, ['hearing']);
});
test('consent, extra identity fields, and common contact/address patterns fail before any upstream request', async () => {
  let called = false;
  for (const body of [
    { description: 'fauteuil', consent: false },
    { description: 'fauteuil', consent: true, name: 'Alice' },
    { description: 'fauteuil', consent: true, address: '99 Rue de Rivoli' },
    { description: 'Je m’appelle Alice et je suis malentendante', consent: true },
    { description: 'Fauteuil au 99 rue de Rivoli 75001 Paris', consent: true },
    { description: 'Contact alice@example.com', consent: true },
  ])
    await assert.rejects(
      interpretNeeds(body, { OPENAI_API_KEY: 'test' }, async () => {
        called = true;
        return completed();
      }),
    );
  assert.equal(called, false);
  assert.equal(
    validateDescription({ description: 'Il me faut une porte de 0,9 m.', consent: true }),
    'Il me faut une porte de 0,9 m.',
  );
});
test('unsupported criteria, guessed widths without a width criterion, duplicates and malformed outputs are rejected', async () => {
  for (const value of [
    { ...proposal, keys: ['overallAccessible'] },
    { ...proposal, keys: ['hearing', 'hearing'] },
    { ...proposal, minWidth: 90 },
    { ...proposal, keys: ['width'], minWidth: 250 },
    { ...proposal, questions: ['x'.repeat(301)] },
  ])
    assert.throws(() => validateExtraction(value));
  await assert.rejects(
    interpretNeeds(
      { description: 'fauteuil', consent: true },
      { OPENAI_API_KEY: 'secret-test' },
      async () => new Response(JSON.stringify({ status: 'incomplete', secret: 'secret-test' })),
    ),
    /proposition IA/,
  );
});
test('provider failures and disabled AI are explicit and never expose provider payloads or secrets', async () => {
  assert.equal(aiConfiguration({ OPENAI_API_KEY: 'secret-test' }).available, true);
  assert.ok(
    !JSON.stringify(aiConfiguration({ OPENAI_API_KEY: 'secret-test' })).includes('secret-test'),
  );
  await assert.rejects(
    interpretNeeds({ description: 'fauteuil', consent: true }),
    (error) => error.status === 503,
  );
  for (const code of [401, 403, 429, 500]) {
    await assert.rejects(
      interpretNeeds(
        { description: 'fauteuil', consent: true },
        { OPENAI_API_KEY: 'secret-test' },
        async () => new Response('secret-test provider detail', { status: code }),
      ),
      (error) => error.providerStatus === code && !error.message.includes('secret-test'),
    );
  }
});
