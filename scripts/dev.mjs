import { createServer } from 'node:http';
import { openSqlite } from '../storage/sqlite.mjs';
import worker from '../worker/index.js';
const database = openSqlite(process.env.DATABASE_PATH);
const port = Number(process.env.PORT || 4173);
const server = createServer(async (request, response) => {
  try {
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
    const result = await worker.fetch(
      new Request('http://' + request.headers.host + request.url, {
        method: request.method,
        headers: request.headers,
        ...(body.length ? { body, duplex: 'half' } : {}),
      }),
      {
        DB: database,
        DATA_IMPORT_TOKEN: process.env.DATA_IMPORT_TOKEN,
        ELEVENLABS_API_KEY: process.env.ELEVENLABS_API_KEY,
        ELEVENLABS_VOICE_ID: process.env.ELEVENLABS_VOICE_ID,
      },
    );
    response.writeHead(result.status, Object.fromEntries(result.headers));
    response.end(Buffer.from(await result.arrayBuffer()));
  } catch {
    response.writeHead(500);
    response.end('Preview unavailable');
  }
});
server.listen(port, '127.0.0.1', () => console.log('Local: http://127.0.0.1:' + port));
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      database.close();
      process.exit();
    }),
  );
