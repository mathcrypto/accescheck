import { openSqlite } from '../storage/sqlite.mjs';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createLiveReload } from '../scripts/live-reload.mjs';
import { createOpenAIAgent } from './openai-agent.mjs';
import worker from '../worker/index.js';
import { createSessionBridge, consultationTools } from './session-bridge.mjs';
const direct = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
const envFile = new URL('../.env', import.meta.url);
if (direct && existsSync(envFile)) process.loadEnvFile(fileURLToPath(envFile));
const bridge = createSessionBridge();
const database = openSqlite(process.env.DATABASE_PATH);
const workerEnv = {
  DB: database,
  DATA_IMPORT_TOKEN: process.env.DATA_IMPORT_TOKEN,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.openai_api_key,
  OPENAI_MODEL: process.env.OPENAI_MODEL || process.env.openai_model,
  OPENAI_REVIEW_MODEL: process.env.OPENAI_REVIEW_MODEL,
  OPENAI_SEARCH_MODEL: process.env.OPENAI_SEARCH_MODEL,
};
const agent = createOpenAIAgent({ bridge });
const live = direct ? await createLiveReload() : null;
const port = Number(process.env.MCP_TEST_PORT || 4180);
const base = 'http://127.0.0.1:' + port;
const assets = new Map([
  ['/mock-call', ['mock-call.html', 'text/html; charset=utf-8']],
  ['/mock-call.css', ['mock-call.css', 'text/css']],
  ['/mock-call.js', ['mock-call.js', 'text/javascript']],
  ['/mock-doctor.wav', ['assets/mock-doctor.wav', 'audio/wav']],
]);
const json = (res, data, status = 200) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
  });
  res.end(JSON.stringify(data));
};
export const server = createServer(async (req, res) => {
  try {
    if (req.headers.host !== '127.0.0.1:' + port) return json(res, { error: 'Invalid host' }, 403);
    const origin = req.headers.origin;
    if (origin && origin !== base)
      return json(res, { error: 'Cross-origin requests blocked' }, 403);
    if (req.headers['sec-fetch-site'] === 'cross-site')
      return json(res, { error: 'Cross-site requests blocked' }, 403);
    if (live?.handle(req, res)) return;
    const url = new URL(req.url, base);
    if (req.method === 'GET' && assets.has(url.pathname)) {
      const [file, type] = assets.get(url.pathname);
      const data = await readFile(new URL(file, import.meta.url));
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-store',
        'Content-Length': data.length,
      });
      return res.end(data);
    }
    const chunks = [];
    let size = 0;
    for await (const c of req) {
      size += c.length;
      if (size > 180000) return json(res, { error: 'Request too large' }, 413);
      chunks.push(c);
    }
    const raw = Buffer.concat(chunks);
    let body = {};
    if (raw.length) {
      try {
        body = JSON.parse(raw);
      } catch {
        return json(res, { error: 'Invalid JSON' }, 400);
      }
    }
    if (req.method === 'GET' && url.pathname === '/bridge/agent-config')
      return json(res, agent.config());
    if (req.method === 'POST' && url.pathname === '/bridge/agent') {
      try {
        return json(
          res,
          await agent.propose(body, req.headers.authorization?.replace(/^Bearer /, '')),
        );
      } catch (error) {
        return json(res, { error: error.message }, 400);
      }
    }
    if (req.method === 'GET' && url.pathname === '/mcp-test/client.js') {
      res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
      return res.end(await readFile(new URL('./client.js', import.meta.url), 'utf8'));
    }
    if (req.method === 'POST' && url.pathname === '/bridge/pair') {
      if (body.fictional_test !== true)
        return json(res, { error: 'Fictional test consent required' }, 400);
      return json(res, bridge.create());
    }
    if (req.method === 'POST' && url.pathname.startsWith('/bridge/')) {
      try {
        return json(
          res,
          bridge.browser(
            body.session_id,
            req.headers.authorization?.replace(/^Bearer /, ''),
            url.pathname.split('/').pop(),
            body,
          ),
        );
      } catch (e) {
        return json(res, { error: e.message }, 403);
      }
    }
    if (req.method === 'POST' && url.pathname === '/mcp') {
      if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string')
        return json(
          res,
          { jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Invalid request' } },
          400,
        );
      if (body.method === 'tools/list') {
        const r = await (live || worker).fetch(
          new Request(base + '/mcp', { method: 'POST', body: JSON.stringify(body) }),
          workerEnv,
        );
        const data = await r.json();
        data.result.tools.push(...consultationTools);
        return json(res, data);
      }
      if (
        body.method === 'tools/call' &&
        consultationTools.some((t) => t.name === body.params?.name)
      ) {
        let result;
        try {
          result = {
            content: [
              {
                type: 'text',
                text: JSON.stringify(bridge.call(body.params.name, body.params.arguments)),
              },
            ],
          };
        } catch (e) {
          result = { isError: true, content: [{ type: 'text', text: e.message }] };
        }
        return json(res, { jsonrpc: '2.0', id: body.id ?? null, result });
      }
    }
    const aborted = new AbortController();
    res.once('close', () => aborted.abort());
    const request = new Request(base + req.url, {
      method: req.method,
      headers: req.headers,
      signal: aborted.signal,
      ...(raw.length ? { body: raw, duplex: 'half' } : {}),
    });
    const r = await (live || worker).fetch(request, workerEnv);
    const headers = Object.fromEntries(r.headers);
    res.writeHead(r.status, headers);
    if (r.headers.get('content-type')?.includes('text/html')) {
      let html = await r.text();
      if (['/consultation', '/consultation/'].includes(url.pathname))
        html = html.replace('</body>', '<script src="/mcp-test/client.js"></script></body>');
      return res.end(live ? live.inject(html) : html);
    }
    for await (const chunk of r.body || []) {
      if (res.destroyed) break;
      res.write(Buffer.from(chunk));
    }
    res.end();
  } catch {
    if (res.headersSent || res.destroyed) {
      res.destroy();
      return;
    }
    json(res, { error: 'Local test request failed' }, 500);
  }
});
const timer = setInterval(() => bridge.sweep(), 60000);
timer.unref();
if (direct)
  server.listen(port, '127.0.0.1', () =>
    console.log(
      'Local MCP test: ' +
        base +
        '/consultation\nMCP endpoint: ' +
        base +
        '/mcp\nOpenAI: ' +
        (agent.config().ready ? 'configured' : 'set OPENAI_API_KEY in .env') +
        '\nFictional sessions only. No audio starts automatically.\nRechargement automatique de l’accueil actif.',
    ),
  );
let closed = false;
export function closePrototype() {
  if (closed) return;
  closed = true;
  clearInterval(timer);
  live?.close();
  bridge.clear();
  database.close();
  if (server.listening) server.close();
}
function shutdown() {
  closePrototype();
  process.exit(0);
}
if (direct) {
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
