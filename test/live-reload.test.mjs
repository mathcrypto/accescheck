import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createLiveReload } from '../scripts/live-reload.mjs';

test(
  'development changes rebuild the page and notify browsers without restarting sessions',
  { timeout: 10000 },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'accescheck-reload-'));
    let live;
    try {
      for (const dir of ['src', 'data', 'prototype', 'scripts']) await mkdir(join(root, dir));
      await writeFile(join(root, 'src/index.html'), 'first');
      await writeFile(
        join(root, 'scripts/compile.mjs'),
        `import {readFile,writeFile,mkdir} from 'node:fs/promises';const text=await readFile('src/index.html','utf8');await mkdir('worker',{recursive:true});await writeFile('worker/index.js','export default {fetch:()=>new Response('+JSON.stringify(text)+')}');`,
      );
      await writeFile(join(root, 'package.json'), '{"type":"module"}');
      live = await createLiveReload(root);
      assert.equal(await (await live.fetch()).text(), 'first');
      const html = live.inject('<body>Hello</body>');
      assert.match(html, /src="\/__dev\/client.js\?v=/);
      let update;
      const received = new Promise((resolve) => (update = resolve));
      const writes = [];
      const req = { url: '/__dev/events', method: 'GET', headers: {}, on() {} };
      const res = {
        writeHead(status, headers) {
          assert.equal(status, 200);
          assert.match(headers['Content-Type'], /text\/event-stream/);
        },
        write(chunk) {
          writes.push(chunk);
          if (writes.length > 1) update();
        },
      };
      assert.equal(live.handle(req, res), true);
      await writeFile(join(root, 'src/index.html'), 'second');
      await received;
      assert.equal(await (await live.fetch()).text(), 'second');
      assert.notEqual(writes[0], writes[1]);
      assert.equal(live.handle({ url: '/__dev/events', method: 'POST' }, {}), false);
      assert.equal(live.handle({ url: '/api/search', method: 'GET' }, {}), false);
      assert.match(await readFile(join(root, 'worker/index.js'), 'utf8'), /second/);
    } finally {
      live?.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
