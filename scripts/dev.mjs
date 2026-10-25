import { createServer } from 'node:http';
import { openSqlite } from '../storage/sqlite.mjs';
import { createLiveReload } from './live-reload.mjs';
const live = await createLiveReload();
const database = openSqlite(process.env.DATABASE_PATH);
const port = Number(process.env.PORT || 4173);
const server = createServer(async (request, response) => {
  try {
    const base = 'http://127.0.0.1:' + port;
    if (
      request.headers.host !== '127.0.0.1:' + port ||
      (request.headers.origin && request.headers.origin !== base) ||
      request.headers['sec-fetch-site'] === 'cross-site'
    ) {
      response.writeHead(403);
      response.end('Invalid local origin');
      return;
    }
    if (live.handle(request, response)) return;
    const chunks = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 1500000) {
        response.writeHead(413);
        response.end('Request too large');
        return;
      }
      chunks.push(chunk);
    }
    const body = Buffer.concat(chunks);
    const aborted = new AbortController();
    response.once('close', () => aborted.abort());
    const result = await live.fetch(
      new Request('http://' + request.headers.host + request.url, {
        method: request.method,
        headers: request.headers,
        signal: aborted.signal,
        ...(body.length ? { body, duplex: 'half' } : {}),
      }),
      {
        DB: database,
        DATA_IMPORT_TOKEN: process.env.DATA_IMPORT_TOKEN,
        EDGE_TTS_VOICE: process.env.EDGE_TTS_VOICE,
        OPENAI_API_KEY: process.env.OPENAI_API_KEY || process.env.openai_api_key,
        OPENAI_MODEL: process.env.OPENAI_MODEL || process.env.openai_model,
        OPENAI_REVIEW_MODEL: process.env.OPENAI_REVIEW_MODEL,
        OPENAI_SEARCH_MODEL: process.env.OPENAI_SEARCH_MODEL,
      },
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    if (result.headers.get('content-type')?.includes('text/html'))
      response.end(live.inject(await result.text()));
    else {
      for await (const chunk of result.body || []) {
        if (response.destroyed) break;
        response.write(Buffer.from(chunk));
      }
      response.end();
    }
  } catch {
    if (response.headersSent || response.destroyed) {
      response.destroy();
      return;
    }
    response.writeHead(500);
    response.end('Preview unavailable');
  }
});
server.listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + port));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    live.close();
    server.close(() => {
      database.close();
      process.exit();
    });
  });
