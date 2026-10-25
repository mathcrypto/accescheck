import test from 'node:test';
import assert from 'node:assert/strict';
import { readChatResponse } from '../src/chat-events.mjs';
const stream = (events, slice = 3) => {
  const bytes = new TextEncoder().encode(events);
  return new Response(
    new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += slice) controller.enqueue(bytes.slice(i, i + slice));
        controller.close();
      },
    }),
    { headers: { 'Content-Type': 'application/x-ndjson' } },
  );
};
test('reads split UTF-8 text and multiple progressive events with a terminal result', async () => {
  const events = [];
  const result = await readChatResponse(
    stream(
      '{"type":"status","text":"Recherche"}\n{"type":"reply","delta":"Écoute"}\n{"type":"reply","delta":" adaptée"}\n{"type":"result","value":{"reply":"Écoute adaptée"}}',
    ),
    (event) => events.push(event),
  );
  assert.equal(result.reply, 'Écoute adaptée');
  assert.equal(
    events
      .filter((event) => event.type === 'reply')
      .map((event) => event.delta)
      .join(''),
    result.reply,
  );
});
test('premature EOF, malformed events and terminal errors cannot masquerade as success', async () => {
  for (const text of [
    '{"type":"status","text":"Recherche"}\n',
    '{bad json}\n',
    '{"type":"error","message":"Service indisponible"}\n',
  ])
    await assert.rejects(readChatResponse(stream(text), () => {}));
});
test('supports ordinary JSON errors and legacy JSON responses', async () => {
  assert.deepEqual(await readChatResponse(Response.json({ reply: 'Bonjour' }), () => {}), {
    reply: 'Bonjour',
  });
  await assert.rejects(
    readChatResponse(Response.json({ error: 'Indisponible' }, { status: 503 }), () => {}),
    /Indisponible/,
  );
});
