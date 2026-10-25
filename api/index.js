import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
import { openSqlite } from '../storage/sqlite.mjs';

export function createVercelHandler(database) {
  return {
    fetch(request) {
      return worker.fetch(request, { DB: database });
    },
  };
}

let application;
export default {
  fetch(request) {
    application ||= createVercelHandler(
      openSqlite(fileURLToPath(new URL('../.vercel-data/practices.sqlite', import.meta.url)), {
        readOnly: true,
      }),
    );
    return application.fetch(request);
  },
};
