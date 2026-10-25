import test from 'node:test';
import assert from 'node:assert/strict';
import { speechConfig, generateSpeech } from '../src/speech.mjs';
import { safeCallUrl, supportsCallAudio } from '../src/companion-core.mjs';
import worker from '../worker/index.js';
test('only accepts expected video platform HTTPS links', () => {
  assert.equal(
    safeCallUrl('https://us02web.zoom.us/j/123?pwd=secret', 'zoom'),
    'https://us02web.zoom.us/j/123?pwd=secret',
  );
  assert.ok(safeCallUrl('https://www.doctolib.fr/account/appointments', 'doctolib'));
  for (const u of [
    'javascript:alert(1)',
    'http://zoom.us/j/1',
    'https://zoom.us.evil.com',
    'https://zoom.us@evil.com',
    'https://evil.com/zoom.us',
    'https://www.doctolib.fr:8443/foo',
  ])
    assert.equal(safeCallUrl(u, 'zoom'), null);
  assert.equal(safeCallUrl('https://zoom.us/j/1', 'doctolib'), null);
});
test('limits track recognition to documented desktop Chromium versions', () => {
  assert.equal(supportsCallAudio('Mozilla Chrome/135.0.0 Safari/537', true), true);
  assert.equal(supportsCallAudio('Mozilla Chrome/134.0.0 Safari/537', true), false);
  assert.equal(supportsCallAudio('Mozilla Chrome/145.0.0 Mobile', true), false);
  assert.equal(supportsCallAudio('Mozilla Version/18 Safari/600', true), false);
  assert.equal(supportsCallAudio('Mozilla Chrome/145.0', false), false);
});
test('voice config exposes Edge only', () => {
  const c = speechConfig({ EDGE_TTS_VOICE: 'fr-FR-HenriNeural' });
  assert.equal(c.edgeAvailable, true);
  assert.equal(c.provider, 'edge');
  assert.equal(c.edgeVoice, 'fr-FR-HenriNeural');
  assert.equal(speechConfig().edgeVoice, 'fr-FR-DeniseNeural');
});
test('requires explicit consent before Edge synthesis', async () => {
  let edgeCalls = 0;
  for (const body of [
    { text: 'Bonjour' },
    { text: 'Bonjour', consent: false },
    { text: 'a'.repeat(4001), consent: true },
    { text: 'Bonjour', consent: true, rate: 5 },
  ]) {
    const r = await generateSpeech(body, {}, fetch, async () => {
      edgeCalls++;
      return Buffer.from([1]);
    });
    assert.equal(r.status, 400);
  }
  assert.equal(edgeCalls, 0);
});
test('uses Microsoft Edge TTS with consent', async () => {
  let edgeText = '';
  const r = await generateSpeech(
    { text: 'Bonjour, pouvez-vous répéter ?', consent: true },
    {},
    fetch,
    async (text, options) => {
      edgeText = text;
      assert.equal(options.voice, 'fr-FR-DeniseNeural');
      return Buffer.from([255, 251, 0]);
    },
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-type'), 'audio/mpeg');
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.equal(edgeText, 'Bonjour, pouvez-vous répéter ?');
  assert.equal((await r.arrayBuffer()).byteLength, 3);
});
test('does not leak provider errors', async () => {
  const r = await generateSpeech({ text: 'Bonjour', consent: true }, {}, fetch, async () => {
    throw new Error('secret-detail');
  });
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes('secret-detail'));
});
test('speech HTTP endpoint enforces same-origin', async () => {
  const req = (origin) =>
    new Request('https://example.com/api/speech', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Bonjour', consent: true }),
    });
  assert.equal((await worker.fetch(req('https://evil.example'))).status, 403);
  const r = await worker.fetch(new Request('https://example.com/api/voice-config'));
  const d = await r.json();
  assert.equal(d.edgeAvailable, true);
  assert.equal(d.provider, 'edge');
});
