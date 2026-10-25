import { practiceTools, runPracticeTool, practiceSummary } from './practice-tools.mjs';
import { createPracticeStore, DataUnavailable } from './practice-store.mjs';
import { speechConfig, generateSpeech } from './speech.mjs';
import { finderConfig, geocodeQueryFor, runFinder } from './agents/finder.mjs';
import { findPractices, geocode } from './discovery.mjs';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers });

async function readJson(request, limit) {
  if (Number(request.headers.get('content-length')) > limit)
    throw new Error('Requête trop volumineuse.');
  const reader = request.body?.getReader();
  if (!reader) throw new Error('JSON invalide.');
  const chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) {
        await reader.cancel();
        throw new Error('Requête trop volumineuse.');
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.length;
    }
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch (error) {
    if (error.message === 'Requête trop volumineuse.') throw error;
    throw new Error('JSON invalide.', { cause: error });
  }
}

async function authorizedImport(request, expected) {
  if (!expected || typeof expected !== 'string') return false;
  const actual = request.headers.get('Authorization')?.replace(/^Bearer /, '') || '';
  const encoder = new TextEncoder();
  const [a, b] = await Promise.all(
    [actual, expected].map((text) => crypto.subtle.digest('SHA-256', encoder.encode(text))),
  );
  return new Uint8Array(a).every((value, index) => value === new Uint8Array(b)[index]);
}

async function importRequest(request, env, path) {
  if (!(await authorizedImport(request, env.DATA_IMPORT_TOKEN)))
    return json({ error: 'Accès à l’import refusé.' }, 403);
  const store = createPracticeStore(env.DB);
  if (request.method === 'GET' && path === '/internal/import/status') {
    try {
      return json(await store.status());
    } catch (error) {
      if (error instanceof DataUnavailable) return json({ empty: true });
      throw error;
    }
  }
  if (request.method !== 'POST') return json({ error: 'Méthode non autorisée.' }, 405);
  const body = await readJson(request, 1500000);
  if (path === '/internal/import/start') return json(await store.begin(body));
  if (path === '/internal/import/batch') return json(await store.append(body.id, body.records));
  if (path === '/internal/import/activate') return json(await store.activate(body.id));
  if (path === '/internal/import/checked') return json(await store.checked(body.checksum));
  return json({ error: 'Route introuvable.' }, 404);
}

export function createHandler({ home, consultationPage }) {
  return {
    async fetch(request, env = {}) {
      const url = new URL(request.url);
      try {
        if (
          request.method === 'GET' &&
          ['/', '/consultation', '/consultation/'].includes(url.pathname)
        )
          return new Response(url.pathname === '/' ? home : consultationPage, {
            headers: {
              'Content-Type': 'text/html; charset=utf-8',
              'Cache-Control': 'no-store',
              'X-Content-Type-Options': 'nosniff',
              'Referrer-Policy': 'no-referrer',
              'Content-Security-Policy':
                "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; media-src 'self' blob:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
            },
          });
        const origin = request.headers.get('Origin');
        if (
          (origin && origin !== url.origin) ||
          request.headers.get('sec-fetch-site') === 'cross-site'
        )
          return json({ error: 'Origine non autorisée.' }, 403);
        if (url.pathname.startsWith('/internal/import/'))
          return await importRequest(request, env, url.pathname);
        if (request.method === 'GET' && url.pathname === '/api/voice-config')
          return json(speechConfig(env));
        if (request.method === 'GET' && url.pathname === '/api/ai-config')
          return json(finderConfig(env));
        if (request.method === 'GET' && url.pathname === '/api/practice') {
          const practice = await practiceSummary(env.DB, url.searchParams.get('id'));
          return practice ? json(practice) : json({ error: 'Établissement introuvable.' }, 404);
        }
        if (request.method === 'GET' && url.pathname === '/api/catalog')
          return json(await createPracticeStore(env.DB).catalog());
        if (request.method === 'GET' && url.pathname === '/api/data-status')
          return json(await createPracticeStore(env.DB).status());
        if (request.method === 'GET' && url.pathname === '/health')
          return json({ ok: true, version: '0.5.0' });
        if (request.method !== 'POST') return json({ error: 'Route introuvable.' }, 404);
        const body = await readJson(request, 12000);
        if (url.pathname === '/api/locations')
          return json({ locations: await geocode(geocodeQueryFor(body.query)) });
        if (url.pathname === '/api/agent') return json(await runFinder(body, env));
        if (url.pathname === '/api/discover') return json(await findPractices(env.DB, body));
        if (url.pathname === '/api/speech') return generateSpeech(body, env);
        if (url.pathname === '/mcp') {
          if (
            !body ||
            body.jsonrpc !== '2.0' ||
            typeof body.method !== 'string' ||
            Array.isArray(body)
          )
            return json(
              { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid Request' } },
              400,
            );
          const id = body.id ?? null;
          let result;
          if (body.method.startsWith('notifications/')) return new Response(null, { status: 202 });
          if (body.method === 'server/discover')
            result = { supportedVersions: ['2026-07-28'], capabilities: { tools: {} } };
          else if (body.method === 'initialize')
            result = {
              protocolVersion: '2025-03-26',
              capabilities: { tools: {} },
              serverInfo: { name: 'accescompanion', version: '0.5.0' },
            };
          else if (body.method === 'ping') result = {};
          else if (body.method === 'tools/list') result = { tools: practiceTools };
          else if (body.method === 'tools/call') {
            try {
              result = {
                content: [
                  {
                    type: 'text',
                    text: JSON.stringify(
                      await runPracticeTool(body.params?.name, body.params?.arguments, env.DB),
                    ),
                  },
                ],
              };
            } catch (error) {
              result = { isError: true, content: [{ type: 'text', text: error.message }] };
            }
          } else
            return json({
              jsonrpc: '2.0',
              id,
              error: { code: -32601, message: 'Method not found' },
            });
          return json({ jsonrpc: '2.0', id, result });
        }
        if (url.pathname === '/api/search')
          return json(await runPracticeTool('search_practices', body, env.DB));
        if (url.pathname === '/api/briefing')
          return json(await runPracticeTool('create_visit_briefing', body, env.DB));
        return json({ error: 'Route introuvable.' }, 404);
      } catch (error) {
        return json(
          { error: error.message },
          error.status || (error.message.includes('volumineuse') ? 413 : 400),
        );
      }
    },
  };
}
