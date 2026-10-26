import test from 'node:test';
import assert from 'node:assert/strict';
import { summarizePage } from '../src/agents/page-summary.mjs';
const env = { OPENAI_API_KEY: 'test-key' };
const reply = (text, status = 'completed') =>
  Response.json({
    status,
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
  });
test('only the visible text is sent, with consent, and the spoken summary comes back', async () => {
  let sent;
  const result = await summarizePage(
    { text: 'Résultats : 3 fiches.', consent: true },
    env,
    async (url, options) => {
      sent = JSON.parse(options.body);
      return reply('Trois fiches ont été trouvées.');
    },
  );
  assert.equal(result.summary, 'Trois fiches ont été trouvées.');
  assert.equal(sent.store, false);
  assert.equal(sent.input[0].content[0].text, 'Résultats : 3 fiches.');
});
test('missing consent, extra fields or oversize text fail before any provider call', async () => {
  const transport = () => {
    throw Error('No provider call');
  };
  for (const body of [
    { text: 'Page', consent: false },
    { text: 'Page', consent: true, name: 'Jean' },
    { text: 'x'.repeat(4001), consent: true },
  ])
    await assert.rejects(summarizePage(body, env, transport));
});
test('an incomplete or failed provider reply is an error, so the page is read in full', async () => {
  await assert.rejects(
    summarizePage({ text: 'Page', consent: true }, env, async () => reply('', 'incomplete')),
  );
  await assert.rejects(
    summarizePage(
      { text: 'Page', consent: true },
      env,
      async () => new Response('', { status: 500 }),
    ),
  );
});
test('an English page summary is requested in English', async () => {
  let sent;
  await summarizePage({ text: 'Page', consent: true, lang: 'en' }, env, async (url, options) => {
    sent = JSON.parse(options.body);
    return reply('Summary.');
  });
  assert.match(sent.instructions, /anglais/);
  await assert.rejects(summarizePage({ text: 'Page', consent: true, lang: 'de' }, env, () => {}));
});
