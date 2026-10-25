# Working on accescompanion

## Readable source

- Keep authored JavaScript, HTML, CSS, JSON, and Markdown formatted with the checked-in Prettier configuration. Use descriptive names and named functions for distinct tasks.
- Use two-space indentation for JavaScript and markup, and four spaces for Python. Keep one statement per line; do not minify source files.
- Separate DOM rendering, network requests, and lifecycle handling. The local MCP client uses the explicit `window.accescompanionSession` interface rather than reaching into another script's variables or replacing its event handlers.
- The current compiler embeds browser helpers and worker data into one deployable artifact. The narrowly scoped globals in `eslint.config.mjs` document that composition; avoid adding implicit dependencies to it.
- Edit `src/`, `mcp/`, and `prototype/`, then rebuild. `worker/index.js`, `dist/`, and the lockfile are generated. They are excluded from manual formatting.
- Render conversation or agent text with `textContent`. Keep pairing credentials in memory and out of logs, reports, examples, and screenshots.

## Before pushing

```sh
npm ci
npm run format
npm run check
python3 -m unittest discover -s test -p 'test_*.py'
```

`npm run check` checks formatting, runs ESLint's recommended rules plus the project's additional rules, runs tests, builds the worker, and validates the deployment artifact. CI runs these checks and the Python importer tests. ESLint warnings fail the build.

For browser changes, run the applicable scripts listed in [README.md](README.md). These require Playwright and Chrome; `APP_TEST_URL` and `MCP_TEST_URL` allow isolated preview servers. Microphone, tab capture, and speech are simulated in automated browser checks. Real-call compatibility needs a separate acceptance test.

## Imported practitioners

The application dataset must contain only selected records from the Accès Libre export. Do not add fictional practitioners, guessed accessibility values, or synthetic records to `data/practices.json`. Unit-test inputs belong in tests and must never be published as practice results.

`scripts/import-data.py` preserves unknown fields and conflicting entrance declarations. Update its source/date metadata when importing a different export, run the importer tests, then format the resulting JSON. See [data/provenance.json](data/provenance.json) for the current import.
