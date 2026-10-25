import { defaultEdgeVoice, synthesizeEdgeSpeech } from './edge-tts.mjs';

export function speechConfig(env = {}) {
  return {
    edgeAvailable: true,
    provider: 'edge',
    edgeVoice: env.EDGE_TTS_VOICE || defaultEdgeVoice,
  };
}

export async function generateSpeech(
  body,
  env = {},
  _transport = fetch,
  edgeSynthesize = synthesizeEdgeSpeech,
) {
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
    return fail('Texte requis (4 000 caractères maximum) et accord pour la lecture vocale.', 400);
  if (
    body.rate !== undefined &&
    (!Number.isFinite(body.rate) || body.rate < 0.7 || body.rate > 1.2)
  )
    return fail('Vitesse de lecture invalide.', 400);

  try {
    const audio = await edgeSynthesize(body.text.trim(), {
      voice: speechConfig(env).edgeVoice,
      lang: 'fr-FR',
    });
    return new Response(audio, {
      headers: {
        'Content-Type': 'audio/mpeg',
        'Cache-Control': 'no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return fail('La lecture vocale Microsoft est indisponible. Réessayez dans un instant.', 502);
  }
}
