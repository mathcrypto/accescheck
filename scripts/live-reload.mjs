import { watch } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';

const exec = promisify(execFile);
const client = await readFile(new URL('./live-reload-client.js', import.meta.url), 'utf8');

export async function createLiveReload(root = fileURLToPath(new URL('..', import.meta.url))) {
  let worker,
    version = Date.now(),
    timer,
    building = false,
    queued = false,
    closed = false;
  const clients = new Set();
  const build = async () => {
    await exec(process.execPath, [join(root, 'scripts/compile.mjs')], { cwd: root });
    const next = await import(
      pathToFileURL(join(root, 'worker/index.js')).href + '?dev=' + ++version
    );
    worker = next.default;
  };
  await build();
  const rebuild = async () => {
    if (building) {
      queued = true;
      return;
    }
    building = true;
    try {
      await build();
      for (const res of clients) res.write('data: ' + version + '\n\n');
    } catch (error) {
      console.error('Compilation locale échouée :', error.stderr || error.message);
    } finally {
      building = false;
      if (queued && !closed) {
        queued = false;
        rebuild();
      }
    }
  };
  const schedule = () => {
    clearTimeout(timer);
    timer = setTimeout(rebuild, 150);
  };
  const watchers = ['src', 'data', 'prototype'].map((dir) =>
    watch(join(root, dir), { recursive: true }, (_event, file) => {
      if (dir !== 'prototype' || /^(client\.js|mock-call\.|assets\/)/.test(String(file)))
        schedule();
    }),
  );
  for (const watcher of watchers)
    watcher.on('error', (error) => console.error('Surveillance locale :', error.message));
  return {
    fetch: (...args) => worker.fetch(...args),
    inject: (html) =>
      html.replace('</body>', '<script src="/__dev/client.js?v=' + version + '"></script></body>'),
    handle(req, res) {
      if (req.method !== 'GET') return false;
      const path = req.url.split('?')[0];
      if (path === '/__dev/client.js') {
        res.writeHead(200, { 'Content-Type': 'text/javascript', 'Cache-Control': 'no-store' });
        res.end(client);
        return true;
      }
      if (path !== '/__dev/events') return false;
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-store',
        Connection: 'keep-alive',
        'X-Accel-Buffering': 'no',
      });
      res.write('data: ' + version + '\n\n');
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return true;
    },
    close() {
      closed = true;
      clearTimeout(timer);
      for (const watcher of watchers) watcher.close();
      for (const res of clients) res.end?.();
      clients.clear();
    },
  };
}
