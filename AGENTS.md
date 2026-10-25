# AccèsCheck

These instructions apply to this repository. It is a separate application from the hardware projects elsewhere in the workspace.

## Before changing code

1. Read the affected source and locate callers with `rg` before editing shared behavior.
2. For interface, copy, layout, or animation work, read [DESIGN.MD](DESIGN.MD).
3. Keep the change within the user's request. Reuse existing code and browser primitives; do not add a framework or dependency for a small fix.

For chat-only search, contextual questions, or review reputation work, read [CAPABILITY-MAP.md](CAPABILITY-MAP.md) for confirmed decisions, proposed module boundaries and open points.

## Source and boundaries

- Edit `src/`, not generated `worker/` or `dist/`. `scripts/compile.mjs` bundles page templates, styles and browser scripts.
- Shared visual tokens and header styles live in `src/ui.css`; shared navigation and the red asterisk live in `src/header.html`. Change these sources rather than copying their markup or styles into individual pages.
- Home and `/assistant` share `src/assistant.js`; changes must work on both. Shared need parsing belongs in `src/core.mjs`.
- Consultation behavior belongs in `src/companion.js`, markup in `src/consultation.html`, styles in `src/consultation.css`. Preserve consent, audio cleanup, session clearing and the local bridge interface.
- `src/handler.mjs` serves HTTP routes. `storage/` and `db/` manage public practice data. The Vercel function receives a read-only snapshot; see [docs/vercel.md](docs/vercel.md) when changing deployment or data loading.
- `prototype/` and `mcp/` implement the local fictional agent workflow. Keep its controls in consultation settings and keep real patient messages outside that bridge.

## Repository and parallel work

- Keep one canonical repository in `dev-day/accescheck`, containing the frontend, backend, database tooling and MCP code together.
- Each feature or bug fix gets its own branch from up-to-date `main`. Commit and push that branch, review the change, integrate the latest `main` and run the relevant checks before merging it back with a merge commit. Verify CI after publishing the merge. Keep `main` for reviewed integrations.
- For parallel work, use a Git worktree and a dedicated branch per task under `dev-day/.worktrees/accescheck/<task>`. Use a separate preview port and local database for each active worktree. Keep the main preview on port 4180.
- Before removing a finished worktree, verify that its branch is merged into `main`, its tracked and untracked source changes are saved, and its useful ignored artifacts are preserved in the canonical repository. Stop only that worktree's server, then use `git worktree remove` to clean up its directory and Git metadata.
- Keep credentials in the canonical local configuration; create each worktree's required configuration deliberately without copying or committing secrets. Keep temporary worktrees only while their tasks are active.

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
