import test from 'node:test';
import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { createSessionBridge } from '../prototype/session-bridge.mjs';
import { createOpenAIAgent } from '../prototype/openai-agent.mjs';

function setup(fetcher, env = { OPENAI_API_KEY: 'test-secret' }) {
  const bridge = createSessionBridge(),
    browser = bridge.create();
  bridge.browser(browser.session_id, browser.browser_token, 'snapshot', {
    messages: [
      {
        id: 1,
        speaker: 'doctor',
        text: 'Exemple fictif : souhaitez-vous poser une question ?',
        demo: true,
      },
    ],
  });
  const agent = createOpenAIAgent({ bridge, env, fetcher });
  const body = {
    session_id: browser.session_id,
    intent: 'Demander de répéter plus lentement',
    openai_consent: true,
  };
  return { bridge, browser, agent, body };
}
const response = (text) =>
  Response.json({
    status: 'completed',
    output: [{ type: 'message', content: [{ type: 'output_text', text }] }],
  });

test('OpenAI draft uses fictional context and waits for browser speech approval', async () => {
  const { bridge, browser, agent, body } = setup(async (url, options) => {
    assert.equal(url, 'https://api.openai.com/v1/responses');
    assert.equal(options.headers.Authorization, 'Bearer test-secret');
    const input = JSON.parse(options.body);
    assert.equal(input.store, false);
    assert.ok(input.input.includes('Exemple fictif'));
    assert.ok(input.input.includes(body.intent));
    assert.ok(!options.body.includes(browser.browser_token));
    assert.ok(!options.body.includes(body.session_id));
    return response('Pouvez-vous répéter plus lentement ?');
  });
  const result = await agent.propose(body, browser.browser_token);
  assert.equal(result.played, false);
  assert.equal(result.status, 'awaiting_browser_approval');
  assert.ok(!JSON.stringify(result).includes('token'));
  const pending = bridge.browser(browser.session_id, browser.browser_token, 'poll').commands;
  assert.equal(
    pending.find((c) => c.type === 'speak').text,
    'Pouvez-vous répéter plus lentement ?',
  );
});

test('consent, credentials, intent and browser authentication fail before an API call', async () => {
  let calls = 0;
  const { agent, browser, body } = setup(async () => {
    calls++;
    return response('Bonjour');
  });
  for (const input of [
    null,
    [],
    { ...body, openai_consent: false },
    { ...body, intent: '' },
    { ...body, intent: 'x'.repeat(1001) },
  ])
    await assert.rejects(agent.propose(input, browser.browser_token));
  await assert.rejects(agent.propose(body, 'wrong-token'));
  const missing = setup(async () => {
    calls++;
  }, {});
  await assert.rejects(
    missing.agent.propose(missing.body, missing.browser.browser_token),
    /OPENAI_API_KEY/,
  );
  assert.equal(calls, 0);
});

test('provider failures are redacted and never queue speech', async () => {
  for (const fetcher of [
    async () => new Response('test-secret', { status: 401 }),
    async () => new Response('test-secret', { status: 429 }),
    async () => {
      throw new Error('Clé OpenAI test-secret');
    },
    async () => Response.json(null),
    async () => new Response('invalid'),
    async () => response(''),
    async () => response('x'.repeat(1001)),
  ]) {
    const { agent, browser, body, bridge } = setup(fetcher);
    await assert.rejects(
      agent.propose(body, browser.browser_token),
      (e) => !e.message.includes('test-secret'),
    );
    assert.ok(
      !bridge
        .browser(browser.session_id, browser.browser_token, 'poll')
        .commands.some((c) => c.type === 'speak'),
    );
  }
});

test('correction or disconnection during generation prevents a stale proposal', async () => {
  for (const action of ['snapshot', 'end']) {
    const { agent, browser, body, bridge } = setup(async () => {
      bridge.browser(browser.session_id, browser.browser_token, action, {
        messages: [
          { id: 1, speaker: 'doctor', text: 'Correction fictive', demo: true, corrected: true },
        ],
      });
      return response('Pouvez-vous répéter ?');
    });
    await assert.rejects(agent.propose(body, browser.browser_token));
    if (action === 'snapshot')
      assert.ok(
        !bridge
          .browser(browser.session_id, browser.browser_token, 'poll')
          .commands.some((c) => c.type === 'speak'),
      );
  }
});

test('concurrent generation is rejected without a second API charge', async () => {
  let release,
    calls = 0;
  const { agent, browser, body } = setup(async () => {
    calls++;
    await new Promise((r) => (release = r));
    return response('Pouvez-vous répéter ?');
  });
  const first = agent.propose(body, browser.browser_token);
  await assert.rejects(agent.propose(body, browser.browser_token), /cours/);
  release();
  await first;
  assert.equal(calls, 1);
});

test('built-in agent does not take over an externally paired MCP session', async () => {
  const { agent, browser, body, bridge } = setup(async () => assert.fail('No API call expected'));
  bridge.call('prepare_consultation', { pairing_code: browser.pairing_code });
  await assert.rejects(agent.propose(body, browser.browser_token), /MCP/);
});

test('local HTTP routes authenticate generation, queue approval and clear the session', async () => {
  const originalKey = process.env.OPENAI_API_KEY,
    originalDatabase = process.env.DATABASE_PATH,
    originalFetch = globalThis.fetch;
  process.env.DATABASE_PATH = ':memory:';
  let closePrototype;
  process.env.OPENAI_API_KEY = 'test-route-secret';
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return response('Pouvez-vous répéter plus lentement ?');
  };
  try {
    const prototype = await import('../prototype/server.mjs');
    const { server } = prototype;
    closePrototype = prototype.closePrototype;
    assert.equal(server.listening, false);
    const host = '127.0.0.1:' + (process.env.MCP_TEST_PORT || 4180);
    const request = (path, body, headers = {}) =>
      new Promise((resolve) => {
        const req = Readable.from(body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
        Object.assign(req, {
          url: path,
          method: body === undefined ? 'GET' : 'POST',
          headers: { host, ...headers },
        });
        const result = { headers: {} };
        server.emit('request', req, {
          setHeader(key, value) {
            result.headers[key] = value;
          },
          writeHead(status, values) {
            result.status = status;
            Object.assign(result.headers, values);
          },
          end(data) {
            result.body = data?.toString() || '';
            resolve(result);
          },
        });
      });
    const config = await request('/bridge/agent-config');
    assert.equal(config.status, 200);
    assert.equal(JSON.parse(config.body).ready, true);
    assert.ok(!config.body.includes('test-route-secret'));
    assert.equal(
      (await request('/bridge/agent-config', undefined, { origin: 'https://example.com' })).status,
      403,
    );
    assert.equal(
      (await request('/bridge/agent-config', undefined, { host: 'example.com' })).status,
      403,
    );
    assert.equal(
      (await request('/bridge/agent-config', undefined, { 'sec-fetch-site': 'cross-site' })).status,
      403,
    );
    const page = await request('/consultation');
    assert.equal(page.status, 200);
    assert.ok(page.body.includes('/mcp-test/client.js'));
    const browser = JSON.parse((await request('/bridge/pair', { fictional_test: true })).body);
    const headers = { authorization: 'Bearer ' + browser.browser_token };
    const auth = { session_id: browser.session_id };
    await request(
      '/bridge/snapshot',
      {
        ...auth,
        messages: [{ id: 1, speaker: 'doctor', text: 'Exemple fictif : bonjour', demo: true }],
      },
      headers,
    );
    const body = { ...auth, openai_consent: true, intent: 'Demander de répéter' };
    assert.equal((await request('/bridge/agent', body)).status, 400);
    assert.equal(
      (await request('/bridge/agent', { ...body, openai_consent: false }, headers)).status,
      400,
    );
    assert.equal(calls, 0);
    const proposed = await request('/bridge/agent', body, headers);
    assert.equal(proposed.status, 200);
    assert.equal(JSON.parse(proposed.body).played, false);
    assert.equal(calls, 1);
    assert.ok(!proposed.body.includes('token'));
    const state = JSON.parse((await request('/bridge/poll', auth, headers)).body);
    const speech = state.commands.find((c) => c.type === 'speak');
    assert.equal(speech.status, 'pending');
    assert.equal(
      (await request('/bridge/ack', { ...auth, id: speech.id, status: 'rejected' }, headers))
        .status,
      200,
    );
    assert.equal((await request('/bridge/end', auth, headers)).status, 200);
    assert.equal((await request('/bridge/agent', body, headers)).status, 400);
    assert.equal(calls, 1);
  } finally {
    closePrototype?.();
    globalThis.fetch = originalFetch;
    if (originalDatabase === undefined) delete process.env.DATABASE_PATH;
    else process.env.DATABASE_PATH = originalDatabase;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
  }
});
