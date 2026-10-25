import test from 'node:test';
import assert from 'node:assert/strict';
import { createSessionBridge } from '../prototype/session-bridge.mjs';
function setup() {
  const b = createSessionBridge();
  const browser = b.create();
  const agent = b.call('prepare_consultation', { pairing_code: browser.pairing_code });
  return { b, browser, auth: { session_id: agent.session_id, agent_token: agent.agent_token } };
}
test('pairing code is single-use and does not activate audio', () => {
  const b = createSessionBridge(),
    s = b.create();
  const a = b.call('prepare_consultation', {
    pairing_code: s.pairing_code,
    reading_mode: 'vision',
  });
  assert.equal(a.microphone_started, false);
  assert.throws(() => b.call('prepare_consultation', { pairing_code: s.pairing_code }));
});
test('reads only explicitly shared fictional captions with cursors', () => {
  const { b, browser, auth } = setup();
  b.browser(browser.session_id, browser.browser_token, 'snapshot', {
    messages: [{ id: 1, text: 'Bonjour, prenons le temps.', speaker: 'doctor', demo: true }],
  });
  const first = b.call('get_caption_updates', auth);
  assert.equal(first.events.length, 1);
  assert.equal(first.events[0].text, 'Bonjour, prenons le temps.');
  assert.equal(b.call('get_caption_updates', { ...auth, after: first.cursor }).events.length, 0);
  assert.throws(() =>
    b.browser(browser.session_id, browser.browser_token, 'snapshot', {
      messages: [{ id: 2, text: 'Real message', speaker: 'doctor', demo: false }],
    }),
  );
});
test('session isolation and role separation', () => {
  const { b, browser, auth } = setup();
  const other = b.create();
  assert.throws(() => b.call('get_caption_updates', { ...auth, session_id: other.session_id }));
  assert.throws(() => b.browser(browser.session_id, auth.agent_token, 'poll'));
  assert.throws(() =>
    b.call('get_caption_updates', { ...auth, agent_token: browser.browser_token }),
  );
});
test('speech is a pending request and rejection never reports playback', () => {
  const { b, browser, auth } = setup();
  const r = b.call('speak_patient_message', { ...auth, text: 'Pouvez-vous répéter ?' });
  assert.equal(r.played, false);
  assert.equal(r.status, 'awaiting_browser_approval');
  b.browser(browser.session_id, browser.browser_token, 'ack', {
    id: r.request_id,
    status: 'rejected',
  });
  assert.equal(
    b.call('get_caption_updates', auth).actions.find((c) => c.id === r.request_id).status,
    'rejected',
  );
});
test('notes preserve exact words and require review', () => {
  const { b, browser, auth } = setup();
  const text = 'Je voudrais comprendre cette phrase.';
  b.browser(browser.session_id, browser.browser_token, 'snapshot', {
    messages: [{ id: 1, text, speaker: 'patient', demo: true }],
  });
  const r = b.call('draft_visit_notes', auth);
  assert.ok(r.draft.includes(text));
  assert.ok(r.draft.startsWith('EXEMPLE FICTIF'));
  assert.equal(r.review_required, true);
  assert.equal(r.clinical_summary, false);
});
test('stop clears data and immediately revokes agent access', () => {
  const { b, browser, auth } = setup();
  b.call('stop_session', auth);
  assert.throws(() => b.call('get_caption_updates', auth));
  assert.deepEqual(b.browser(browser.session_id, browser.browser_token, 'poll').commands, []);
  assert.equal(b.browser(browser.session_id, browser.browser_token, 'poll').active, false);
});
test('expires pairing codes and all session data', () => {
  let time = 0;
  const b = createSessionBridge(() => time);
  const s = b.create();
  time = 300001;
  assert.throws(() => b.call('prepare_consultation', { pairing_code: s.pairing_code }));
  time = 900001;
  assert.throws(() => b.browser(s.session_id, s.browser_token, 'poll'));
});
test('rejects unbounded inputs and unknown args', () => {
  const { b, auth } = setup();
  assert.throws(() => b.call('speak_patient_message', { ...auth, text: 'x'.repeat(1001) }));
  assert.throws(() => b.call('get_caption_updates', { ...auth, after: -1 }));
  assert.throws(() => b.call('get_caption_updates', { ...auth, other: true }));
});
