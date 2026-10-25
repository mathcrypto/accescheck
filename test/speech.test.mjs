import test from 'node:test';
import assert from 'node:assert/strict';
import { speechConfig, generateSpeech, requestedVoice } from '../src/speech.mjs';
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
test('voice config never exposes the secret', () => {
  const c = speechConfig({ ELEVENLABS_API_KEY: 'test-secret' });
  assert.equal(c.elevenlabsAvailable, true);
  assert.equal(c.voiceId, requestedVoice);
  assert.ok(!JSON.stringify(c).includes('test-secret'));
});
test('voice ID alone cannot generate audio', async () => {
  let calls = 0;
  const r = await generateSpeech(
    { text: 'Bonjour', consent: true },
    { ELEVENLABS_VOICE_ID: requestedVoice },
    () => {
      calls++;
    },
  );
  assert.equal(r.status, 503);
  assert.equal(calls, 0);
});
test('requires explicit provider consent before any upstream request', async () => {
  let calls = 0;
  for (const body of [
    { text: 'Bonjour' },
    { text: 'Bonjour', consent: false },
    { text: 'a'.repeat(4001), consent: true },
    { text: 'Bonjour', consent: true, rate: 5 },
  ]) {
    const r = await generateSpeech(body, { ELEVENLABS_API_KEY: 'fake' }, () => {
      calls++;
    });
    assert.equal(r.status, 400);
  }
  assert.equal(calls, 0);
});
test('uses requested voice server side and streams audio without caching', async () => {
  let upstream;
  const r = await generateSpeech(
    { text: 'Bonjour, pouvez-vous répéter ?', consent: true, rate: 0.8 },
    { ELEVENLABS_API_KEY: 'test-secret', ELEVENLABS_VOICE_ID: requestedVoice },
    async (url, options) => {
      upstream = { url, options };
      return new Response(new Uint8Array([73, 68, 51]), {
        headers: { 'Content-Type': 'audio/mpeg' },
      });
    },
  );
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.ok(upstream.url.includes(requestedVoice));
  assert.equal(upstream.options.headers['xi-api-key'], 'test-secret');
  assert.equal(JSON.parse(upstream.options.body).model_id, 'eleven_multilingual_v2');
  assert.equal(JSON.parse(upstream.options.body).text, 'Bonjour, pouvez-vous répéter ?');
  assert.equal((await r.arrayBuffer()).byteLength, 3);
});
test('does not leak provider errors or secrets', async () => {
  const r = await generateSpeech(
    { text: 'Bonjour', consent: true },
    { ELEVENLABS_API_KEY: 'test-secret' },
    async () => new Response('test-secret upstream detail', { status: 401 }),
  );
  assert.equal(r.status, 502);
  assert.ok(!(await r.text()).includes('test-secret'));
});
test('rejects invalid voice config and non-audio responses', async () => {
  const bad = await generateSpeech(
    { text: 'Bonjour', consent: true },
    { ELEVENLABS_API_KEY: 'fake', ELEVENLABS_VOICE_ID: '../../other' },
  );
  assert.equal(bad.status, 503);
  const r = await generateSpeech(
    { text: 'Bonjour', consent: true },
    { ELEVENLABS_API_KEY: 'fake' },
    async () => new Response('{}', { headers: { 'content-type': 'application/json' } }),
  );
  assert.equal(r.status, 502);
});
test('speech HTTP endpoint enforces same-origin and readiness', async () => {
  const req = (origin) =>
    new Request('https://example.com/api/speech', {
      method: 'POST',
      headers: { Origin: origin, 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: 'Bonjour', consent: true }),
    });
  assert.equal((await worker.fetch(req('https://evil.example'))).status, 403);
  assert.equal((await worker.fetch(req('https://example.com'))).status, 503);
  const r = await worker.fetch(new Request('https://example.com/api/voice-config'), {
    ELEVENLABS_API_KEY: 'do-not-expose',
  });
  const d = await r.json();
  assert.equal(d.elevenlabsAvailable, true);
  assert.ok(!JSON.stringify(d).includes('do-not-expose'));
});
