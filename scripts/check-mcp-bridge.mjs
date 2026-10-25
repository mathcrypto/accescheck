import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
const base = 'http://127.0.0.1:4180';
let session;
const browser = async (action, extra = {}) => {
  const r = await fetch(base + '/bridge/' + action, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(session ? { Authorization: 'Bearer ' + session.browser_token } : {}),
    },
    body: JSON.stringify({ ...extra, ...(session ? { session_id: session.session_id } : {}) }),
    signal: AbortSignal.timeout(8000),
  });
  assert.ok(r.ok, 'Local bridge request failed');
  return r.json();
};
const client = new Client({ name: 'accescheck-bridge-check', version: '1.0.0' });
const transport = new StdioClientTransport({
  command: process.execPath,
  args: [fileURLToPath(new URL('../mcp/server.mjs', import.meta.url))],
  stderr: 'pipe',
});
const call = async (name, args) => {
  const r = await client.callTool({ name, arguments: args });
  assert.ok(!r.isError, 'MCP tool failed: ' + name);
  return JSON.parse(r.content[0].text);
};
try {
  await client.connect(transport);
  assert.equal((await client.listTools()).tools.length, 9);
  session = await browser('pair', { fictional_test: true });
  const paired = await call('prepare_consultation', { pairing_code: session.pairing_code });
  const auth = { session_id: paired.session_id, agent_token: paired.agent_token };
  await browser('snapshot', {
    messages: [
      {
        id: 1,
        text: 'Exemple fictif : quelle question souhaitez-vous poser ?',
        speaker: 'captured',
        demo: true,
      },
    ],
  });
  const context = await call('get_consultation_context', auth);
  assert.equal(context.messages.length, 1);
  const reply = await call('speak_patient_message', {
    ...auth,
    text: 'Pouvez-vous répéter plus lentement ?',
    expected_cursor: context.cursor,
  });
  assert.equal(reply.played, false);
  const pending = await browser('poll');
  assert.ok(pending.commands.some((c) => c.id === reply.request_id && c.status === 'pending'));
  await browser('ack', { id: reply.request_id, status: 'rejected' });
  const updates = await call('get_caption_updates', auth);
  assert.equal(updates.actions.find((c) => c.id === reply.request_id).status, 'rejected');
  await call('stop_session', auth);
  assert.equal((await browser('poll')).active, false);
  console.log(
    JSON.stringify(
      {
        passed: true,
        transport: 'Official MCP client → stdio server → local HTTP bridge',
        tools: 9,
        context: 'Fictional shared text only',
        reply: 'Queued, rejected; no speech played',
        cleanup: 'Session revoked',
        realDoctolib: false,
      },
      null,
      2,
    ),
  );
} finally {
  if (session) await browser('end').catch(() => {});
  await client.close();
}
