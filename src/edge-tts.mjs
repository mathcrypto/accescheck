/** Microsoft Edge online neural TTS (no API key). Text is sent to Microsoft. */

export const defaultEdgeVoice = 'fr-FR-DeniseNeural';

export async function synthesizeEdgeSpeech(
  text,
  { voice = defaultEdgeVoice, lang = 'fr-FR', timeout = 20000 } = {},
) {
  const value = String(text || '').trim();
  if (!value) throw new Error('Texte requis pour la lecture vocale.');
  if (value.length > 4000) throw new Error('Limitez ce texte à 4 000 caractères.');
  const { EdgeTTS } = await import('node-edge-tts');
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
