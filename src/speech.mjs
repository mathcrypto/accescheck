export const requestedVoice = 'pFZP5JQG7iQjIQuC4Bku';
export function speechConfig(env = {}) {
  return {
    elevenlabsAvailable: !!env.ELEVENLABS_API_KEY,
    voiceId: env.ELEVENLABS_VOICE_ID || requestedVoice,
  };
}
export async function generateSpeech(body, env = {}, transport = fetch) {
  const headers = {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  };
  const fail = (error, status) => new Response(JSON.stringify({ error }), { status, headers });
  if (
    !body ||
    typeof body !== 'object' ||
    typeof body.text !== 'string' ||
    !body.text.trim() ||
    body.text.length > 4000 ||
    body.consent !== true
  )
    return fail(
      'Texte requis (4 000 caractères maximum) et accord explicite pour ElevenLabs.',
      400,
    );
  if (
    body.rate !== undefined &&
    (!Number.isFinite(body.rate) || body.rate < 0.7 || body.rate > 1.2)
  )
    return fail('Vitesse de lecture invalide.', 400);
  const config = speechConfig(env);
  if (!config.elevenlabsAvailable)
    return fail(
      'La voix ElevenLabs n’est pas activée. Utilisez la voix française de votre appareil.',
      503,
    );
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(config.voiceId))
    return fail('La configuration de la voix doit être corrigée.', 503);
  try {
    const r = await transport(
      'https://api.elevenlabs.io/v1/text-to-speech/' +
        encodeURIComponent(config.voiceId) +
        '?output_format=mp3_44100_128',
      {
        method: 'POST',
        headers: {
          'xi-api-key': env.ELEVENLABS_API_KEY,
          'Content-Type': 'application/json',
          Accept: 'audio/mpeg',
        },
        body: JSON.stringify({
          text: body.text,
          model_id: 'eleven_multilingual_v2',
          voice_settings: { stability: 0.5, similarity_boost: 0.75, speed: body.rate || 1 },
        }),
        signal: AbortSignal.timeout(20000),
      },
    );
    if (!r.ok)
      return fail(
        r.status === 429
          ? 'Quota vocal atteint. Utilisez la voix de votre appareil.'
          : 'La voix ElevenLabs est indisponible. Vérifiez son activation ou choisissez la voix de votre appareil.',
        r.status === 429 ? 429 : 502,
      );
    if (!r.headers.get('content-type')?.startsWith('audio/'))
      return fail('Le service vocal n’a pas renvoyé un son lisible.', 502);
    return new Response(r.body, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return fail('Le service vocal n’a pas répondu. Utilisez la voix de votre appareil.', 502);
  }
}
