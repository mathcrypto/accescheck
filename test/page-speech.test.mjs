import test from 'node:test';
import assert from 'node:assert/strict';
import { stopSpeechPlayback } from '../src/page-speech.js';

test('stopSpeechPlayback tolerates a missing speech engine', () => {
  assert.doesNotThrow(() => stopSpeechPlayback());
});
