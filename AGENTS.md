# AccèsCheck

These instructions apply to this repository. It is a separate application from the hardware projects elsewhere in the workspace.

## Before changing code

1. Read the affected source and locate callers with `rg` before editing shared behavior.
2. For interface, copy, layout, or animation work, read [DESIGN.MD](DESIGN.MD).
3. Keep the change within the user's request. Reuse existing code and browser primitives; do not add a framework or dependency for a small fix.

## Source and boundaries

- Edit `src/`, not generated `worker/` or `dist/`. `scripts/compile.mjs` bundles page templates, styles and browser scripts.
- Home and `/assistant` share `src/assistant.js`; changes must work on both. Shared need parsing belongs in `src/core.mjs`.
- Consultation behavior belongs in `src/companion.js`, markup in `src/consultation.html`, styles in `src/consultation.css`. Preserve consent, audio cleanup, session clearing and the local bridge interface.
- `src/handler.mjs` serves HTTP routes. `storage/` and `db/` manage public practice data. The Vercel function receives a read-only snapshot; see [docs/vercel.md](docs/vercel.md) when changing deployment or data loading.
- `prototype/` and `mcp/` implement the local fictional agent workflow. Keep its controls in consultation settings and keep real patient messages outside that bridge.

## Privacy and evidence

- Never commit or print keys, `.env` contents, tokens or private meeting links.
- Do not persist need descriptions, conversations or notes in browser storage, URLs or server logs. Opening a consultation from results keeps the search tab alive without saving health text.
- Keep explicit consent before remote interpretation or browser speech processing. Never enable microphone capture or paid calls automatically.
- Unknown accessibility stays unknown. Keep source provenance, correction labels and fictional examples visible. A declaration is not a guarantee of access.
- Warn before leaving a consultation containing text. Clear the session and stop audio when the user leaves or explicitly clears it.

## Verification

Use Node.js 24. Commands run from this directory:

```sh
npm run check
python3 -m unittest discover -s test -p 'test_*.py'
```

For behavior fixes, first reproduce the failure with a focused test, then verify the fix. Do not skip tests, remove assertions or suppress lint to pass checks.

For browser changes, run Playwright and inspect screenshots, JavaScript errors, focus and the affected journey. `scripts/check-user-journey.mjs` checks the audit regressions against `APP_URL` (default `http://127.0.0.1:4180`). Set `PLAYWRIGHT_MODULE` and `CHROME_BIN` when installed outside their usual paths. Other browser scripts document their own preview variables.

Verify 320, 390 and 1440 px layouts, keyboard operation, empty/error states and consent boundaries. Simulated audio tests do not prove real microphone, voice or call quality; report what was actually checked.

## Delivery

Review the final diff and run `git diff --check`. Keep generated reports and screenshots under ignored `output/`. Follow the user's existing Git/deployment authorization; a push to `main` triggers Vercel after CI checks. See [docs/ci-cd.md](docs/ci-cd.md) when changing that workflow.
