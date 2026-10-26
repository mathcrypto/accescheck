/** Microsoft Edge online neural TTS (no API key). Text is sent to Microsoft. */

import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';

export const defaultEdgeVoice = 'fr-FR-DeniseNeural';

async function loadEdgeTTS() {
  // Resolve from the project root so live-reload imports of worker/index.js?dev=
  // (or other query-busted URLs) still find the package.
  const require = createRequire(process.cwd() + '/package.json');
  return import(pathToFileURL(require.resolve('node-edge-tts')).href);
}

async function synthesizeOnce(value, { voice, lang, timeout }) {
  const { EdgeTTS } = await loadEdgeTTS();
  const tts = new EdgeTTS({
    voice,
    lang,
    outputFormat: 'audio-24khz-48kbitrate-mono-mp3',
    timeout,
  });
  const chunks = [];
  for await (const chunk of tts.streamAudio(value)) {
    if (Buffer.isBuffer(chunk) && chunk.length) chunks.push(chunk);
  }
  if (!chunks.length) throw new Error('Microsoft Edge TTS n’a renvoyé aucun son.');
  return Buffer.concat(chunks);
}

export async function synthesizeEdgeSpeech(
  text,
  { voice = defaultEdgeVoice, lang = 'fr-FR', timeout = 20000 } = {},
) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Texte requis pour la lecture vocale.');
  if (value.length > 4000) throw new Error('Limitez ce texte à 4 000 caractères.');
  try {
    return await synthesizeOnce(value, { voice, lang, timeout });
  } catch {
    // Microsoft Edge TTS can fail transiently over the public endpoint.
    return synthesizeOnce(value, { voice, lang, timeout });
  }
}
