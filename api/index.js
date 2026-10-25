import { fileURLToPath } from 'node:url';
import worker from '../worker/index.js';
import { openSqlite } from '../storage/sqlite.mjs';

export function createVercelHandler(
  database,
  { OPENAI_API_KEY, OPENAI_MODEL, OPENAI_REVIEW_MODEL } = {},
) {
  return {
    fetch(request) {
      return worker.fetch(request, {
        DB: database,
        OPENAI_API_KEY,
        OPENAI_MODEL,
        OPENAI_REVIEW_MODEL,
      });
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
      {
        OPENAI_API_KEY: process.env.OPENAI_API_KEY,
        OPENAI_MODEL: process.env.OPENAI_MODEL,
        OPENAI_REVIEW_MODEL: process.env.OPENAI_REVIEW_MODEL,
      },
    );
    return application.fetch(request);
  },
};
