import { createHash } from 'node:crypto';
import { createWriteStream, createReadStream } from 'node:fs';
import { mkdir, mkdtemp, rm } from 'node:fs/promises';
import { Transform, Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInterface } from 'node:readline';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openSqlite } from '../storage/sqlite.mjs';
import { createPracticeStore, DataUnavailable, sourceIdentity } from '../src/practice-store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const remote = process.argv.includes('--remote');
const metadataUrl = `https://www.data.gouv.fr/api/1/datasets/${sourceIdentity.datasetId}/`;
const maximumBytes = 1000000000;
const python = process.env.PYTHON_BIN || 'python3';
let database;
let directory;

// Unattended callers can pass secrets over hidden stdin, never command-line arguments.
async function readRuntimeConfiguration() {
  if (!process.argv.includes('--config-stdin')) return;
  if (!remote) throw new Error('--config-stdin requires --remote.');
  const input = process.stdin;
  const raw = input.isTTY;
  if (raw) input.setRawMode(true);
  console.log('Ready for private import configuration on stdin (input is hidden).');
  try {
    const text = await new Promise((resolve, reject) => {
      let value = '';
      const receive = (chunk) => {
        value += chunk.toString('utf8');
        if (value.length > 16000 || value.includes('\u0003')) {
          cleanup();
          reject(new Error('Invalid import configuration.'));
        } else if (value.includes('\n')) {
          cleanup();
          resolve(value.slice(0, value.indexOf('\n')));
        }
      };
      const end = () => {
        cleanup();
        reject(new Error('Import configuration requires one JSON line.'));
      };
      const cleanup = () => {
        input.off('data', receive);
        input.off('end', end);
        input.pause();
      };
      input.on('data', receive);
      input.on('end', end);
      input.resume();
    });
    const values = JSON.parse(text);
    const keys = ['DATA_IMPORT_URL', 'DATA_IMPORT_TOKEN', 'DATA_SITE_ACCESS_TOKEN'];
    if (!values || Object.keys(values).some((key) => !keys.includes(key)))
      throw new Error('Invalid import configuration.');
    for (const key of keys) {
      if (typeof values[key] !== 'string') throw new Error('Invalid import configuration.');
      process.env[key] = values[key];
    }
  } finally {
    if (raw) input.setRawMode(false);
  }
}

function remoteUrl() {
  const value = new URL(process.env.DATA_IMPORT_URL || '');
  if (
    value.protocol !== 'https:' ||
    value.username ||
    value.password ||
    value.search ||
    value.hash ||
    value.pathname !== '/'
  )
    throw new Error('DATA_IMPORT_URL must be the HTTPS root of the destination Site.');
  return value.origin;
}

async function remoteRequest(action, body) {
  if (!process.env.DATA_IMPORT_TOKEN) throw new Error('DATA_IMPORT_TOKEN is required.');
  const headers = {
    Authorization: `Bearer ${process.env.DATA_IMPORT_TOKEN}`,
    'Content-Type': 'application/json',
  };
  if (process.env.DATA_SITE_ACCESS_TOKEN)
    headers['OAI-Sites-Authorization'] = `Bearer ${process.env.DATA_SITE_ACCESS_TOKEN}`;
  const response = await fetch(remoteUrl() + '/internal/import/' + action, {
    method: body === undefined ? 'GET' : 'POST',
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    redirect: 'error',
    signal: AbortSignal.timeout(60000),
  });
  if (!response.ok)
    throw new Error(
      `Import endpoint ${action} failed (${response.status}); previous data is retained.`,
    );
  return response.json();
}

async function destination() {
  if (remote)
    return {
      status: () => remoteRequest('status'),
      begin: (metadata) => remoteRequest('start', metadata),
      append: (id, records) => remoteRequest('batch', { id, records }),
      activate: (id) => remoteRequest('activate', { id }),
      checked: (checksum) => remoteRequest('checked', { checksum }),
    };
  database = openSqlite(process.env.DATABASE_PATH || resolve(root, '.local/practices.sqlite'));
  const store = createPracticeStore(database);
  return {
    ...store,
    async status() {
      try {
        return await store.status();
      } catch (error) {
        if (error instanceof DataUnavailable) return { empty: true };
        throw error;
      }
    },
  };
}

async function sourceResource() {
  const response = await fetch(metadataUrl, {
    headers: {
      'X-Fields': 'id,resources{id,title,format,type,url,last_modified,filesize,checksum}',
    },
    signal: AbortSignal.timeout(30000),
  });
  if (!response.ok) throw new Error('Official dataset metadata is unavailable.');
  const text = await response.text();
  if (text.length > 5000000) throw new Error('Unexpected metadata size.');
  const metadata = JSON.parse(text);
  const resource = metadata.resources?.find(
    (resource) => resource.id === sourceIdentity.resourceId,
  );
  if (
    metadata.id !== sourceIdentity.datasetId ||
    !resource ||
    resource.title !== sourceIdentity.resourceTitle ||
    resource.format !== 'csv' ||
    resource.type !== 'main'
  )
    throw new Error('The expected official CSV resource was not found.');
  const url = new URL(resource.url);
  if (
    url.protocol !== 'https:' ||
    url.hostname !== 'static.data.gouv.fr' ||
    url.username ||
    url.password ||
    !url.pathname.endsWith('/acceslibre-with-web-url.csv')
  )
    throw new Error('Unexpected export download location.');
  if (
    !['sha1', 'sha256'].includes(resource.checksum?.type) ||
    !/^[a-f0-9]{40,64}$/.test(resource.checksum?.value || '') ||
    !Number.isFinite(Date.parse(resource.last_modified)) ||
    !resource.filesize ||
    resource.filesize > maximumBytes
  )
    throw new Error('The source is missing a usable checksum, size, or export date.');
  return resource;
}

async function download(resource, path) {
  const response = await fetch(resource.url, {
    redirect: 'error',
    signal: AbortSignal.timeout(600000),
  });
  if (!response.ok || !response.body) throw new Error('Official export download failed.');
  const checksum = createHash(resource.checksum.type);
  let bytes = 0;
  const verify = new Transform({
    transform(chunk, _encoding, callback) {
      bytes += chunk.length;
      if (bytes > maximumBytes) {
        callback(new Error('Export exceeds the size limit.'));
        return;
      }
      checksum.update(chunk);
      callback(null, chunk);
    },
  });
  await pipeline(Readable.fromWeb(response.body), verify, createWriteStream(path, { mode: 0o600 }));
  if (bytes !== resource.filesize || checksum.digest('hex') !== resource.checksum.value)
    throw new Error('The downloaded export does not match its published size and checksum.');
}

try {
  await readRuntimeConfiguration();
  const store = await destination();
  const resource = await sourceResource();
  const previous = await store.status();
  if (
    previous.checksum === resource.checksum.value &&
    previous.mappingVersion === sourceIdentity.mappingVersion
  ) {
    await store.checked(resource.checksum.value);
    console.log(
      JSON.stringify({
        status: 'unchanged',
        recordCount: previous.recordCount,
        exportedAt: previous.exportedAt,
      }),
    );
  } else {
    await mkdir(resolve(root, '.local/imports'), { recursive: true });
    directory = await mkdtemp(resolve(root, '.local/imports/run-'));
    const csvPath = resolve(directory, 'source.csv');
    const recordPath = resolve(directory, 'records.jsonl');
    await download(resource, csvPath);
    const imported = spawnSync(
      python,
      [
        resolve(root, 'scripts/import-data.py'),
        csvPath,
        recordPath,
        '--exported-at',
        resource.last_modified,
      ],
      { encoding: 'utf8', maxBuffer: 1000000 },
    );
    if (imported.status !== 0)
      throw new Error('The export failed schema/record validation; previous data is retained.');
    const parsed = JSON.parse(imported.stdout);
    if (parsed.count < 100 || parsed.count > 100000)
      throw new Error('Unexpected number of selected practices.');
    const metadata = {
      ...sourceIdentity,
      resourceUrl: resource.url,
      exportedAt: resource.last_modified,
      checksum: resource.checksum.value,
      checksumType: resource.checksum.type,
      expectedCount: parsed.count,
      columns: parsed.columns,
      selection: 'France entière, activités médicales sélectionnées',
    };
    const run = await store.begin(metadata);
    if (!run.unchanged) {
      let batch = [];
      for await (const line of createInterface({
        input: createReadStream(recordPath),
        crlfDelay: Infinity,
      })) {
        batch.push(JSON.parse(line));
        if (batch.length === 20) {
          await store.append(run.id, batch);
          batch = [];
        }
      }
      if (batch.length) await store.append(run.id, batch);
      await store.activate(run.id);
    }
    const verified = await store.status();
    if (verified.checksum !== resource.checksum.value || verified.recordCount !== parsed.count)
      throw new Error('Import readback failed.');
    console.log(
      JSON.stringify({
        status: 'updated',
        recordCount: verified.recordCount,
        exportedAt: verified.exportedAt,
        importedAt: verified.importedAt,
      }),
    );
  }
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  database?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
}
