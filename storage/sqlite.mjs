import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function openSqlite(path) {
  path ||= fileURLToPath(new URL('../.local/practices.sqlite', import.meta.url));
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const connection = new DatabaseSync(path);
  connection.exec(
    'PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL; PRAGMA busy_timeout = 5000;',
  );
  connection.exec('CREATE TABLE IF NOT EXISTS local_migrations (name TEXT PRIMARY KEY)');
  const directory = fileURLToPath(new URL('../drizzle/', import.meta.url));
  for (const name of readdirSync(directory)
    .filter((name) => name.endsWith('.sql'))
    .sort()) {
    if (connection.prepare('SELECT name FROM local_migrations WHERE name = ?').get(name)) continue;
    connection.exec('BEGIN IMMEDIATE');
    try {
      connection.exec(readFileSync(resolve(directory, name), 'utf8'));
      connection.prepare('INSERT INTO local_migrations (name) VALUES (?)').run(name);
      connection.exec('COMMIT');
    } catch (error) {
      connection.exec('ROLLBACK');
      throw error;
    }
  }
  function prepare(sql, parameters = []) {
    return {
      bind: (...values) => prepare(sql, values),
      async all() {
        return { results: connection.prepare(sql).all(...parameters) };
      },
      async first() {
        return connection.prepare(sql).get(...parameters) || null;
      },
      async run() {
        return { success: true, meta: connection.prepare(sql).run(...parameters) };
      },
    };
  }
  return {
    prepare,
    async batch(statements) {
      connection.exec('BEGIN IMMEDIATE');
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        connection.exec('COMMIT');
        return results;
      } catch (error) {
        connection.exec('ROLLBACK');
        throw error;
      }
    },
    close: () => connection.close(),
  };
}
