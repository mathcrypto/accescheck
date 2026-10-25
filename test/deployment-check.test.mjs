import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

test(
  'public verification waits for an alias that initially serves the previous homepage',
  { timeout: 15000 },
  async () => {
    let visits = 0;
    const server = createServer((request, response) => {
      const json = (value) => {
        response.setHeader('Content-Type', 'application/json');
        response.end(JSON.stringify(value));
      };
      if (request.url === '/')
        return response.end(
          ++visits === 1 ? '<body>Previous deployment</body>' : '<canvas id="asciiFlow"></canvas>',
        );
      if (request.url === '/consultation')
        return response.end('<button id="startCaptions"></button>');
      if (request.url === '/api/catalog') return json({ count: 510 });
      if (request.url === '/api/discover')
        return json({ results: [{ id: 'test-only' }], dataset: { checksum: 'test-checksum' } });
      response.writeHead(404);
      response.end();
    });
    await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
    try {
      const script = fileURLToPath(
        new URL('../scripts/check-public-deployment.mjs', import.meta.url),
      );
      const result = await promisify(execFile)(process.execPath, [
        script,
        'http://127.0.0.1:' + server.address().port,
      ]);
      assert.equal(visits, 2);
      assert.match(result.stdout, /Public deployment verified/);
    } finally {
      await new Promise((resolve) => server.close(resolve));
    }
  },
);
