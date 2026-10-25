import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { openSqlite } from '../storage/sqlite.mjs';
import { createPracticeStore } from '../src/practice-store.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const path = resolve(root, '.vercel-data/practices.sqlite');
await mkdir(resolve(root, '.vercel-data'), { recursive: true });
for (const suffix of ['', '-wal', '-shm']) await rm(path + suffix, { force: true });
execFileSync(process.execPath, [resolve(root, 'scripts/sync-practices.mjs')], {
  cwd: root,
  env: { ...process.env, DATABASE_PATH: path },
  stdio: 'inherit',
});

// A single-file snapshot needs no writable WAL sidecars in the deployed Function.
const connection = new DatabaseSync(path);
try {
  connection.exec('PRAGMA wal_checkpoint(TRUNCATE); PRAGMA journal_mode = DELETE;');
  if (connection.prepare('PRAGMA quick_check').get().quick_check !== 'ok')
    throw new Error('The production database failed its integrity check.');
} finally {
  connection.close();
}
const database = openSqlite(path, { readOnly: true });
try {
  const store = createPracticeStore(database);
  const metadata = await store.status();
  const { records } = await store.candidates({});
  if (records.length !== metadata.recordCount || records.length < 100)
    throw new Error('The production database failed its read-only readback.');
  console.log(`Verified ${records.length} public practices in the read-only production snapshot.`);
} finally {
  database.close();
}
execFileSync(process.execPath, [resolve(root, 'scripts/compile.mjs')], {
  cwd: root,
  stdio: 'inherit',
});
await mkdir(resolve(root, 'public'), { recursive: true });
await writeFile(resolve(root, 'public/robots.txt'), 'User-agent: *\nAllow: /\n');
