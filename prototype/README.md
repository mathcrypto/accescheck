# Local MCP consultation test

An in-memory developer prototype for exchanging fictional conversation text and commands with the browser companion. It does not deploy the Site or add consultation tools to the patient app's standard MCP endpoint.

## Run

With Node.js 24 LTS, from the repository root:

```sh
npm ci
npm run build
npm run dev:companion
```

Open http://127.0.0.1:4180/consultation and click **Partager l’exemple et lier un agent**. The page loads labeled fictional messages and displays a single-use pairing code. A real conversation must be cleared before this test starts. The prerecorded `/mock-call` is a separate audio fixture.

Pairing never starts a microphone or joins a call. Only labeled fictional messages are shared with the local bridge. Use the [official-SDK stdio adapter](../mcp/README.md) to connect an AI client; the client supplies the language model.

## Tools and session lifecycle

The local `/mcp` endpoint retains the three search/preparation tools and adds six:

1. `prepare_consultation({pairing_code,reading_mode?})`: consumes a single-use code valid for five minutes. Returns a session ID and agent token without starting audio.
2. `get_consultation_context({session_id,agent_token})`: current fictional messages, reading mode, cursor, action statuses, and communication limits.
3. `get_caption_updates({session_id,agent_token,after?})`: fictional caption/correction events and proposal statuses after a cursor.
4. `speak_patient_message({session_id,agent_token,text,expected_cursor?})`: queues a proposal for browser approval. A matching pending proposal at the same cursor reuses its action ID. Corrected captions expire pending proposals; a stale expected cursor is rejected.
5. `draft_visit_notes({session_id,agent_token})`: sends an exact transcript draft for review. Existing browser notes are not overwritten, and no clinical summary or automatic reading is generated.
6. `stop_session({session_id,agent_token})`: revokes agent access, clears shared data, and requests browser cleanup.

Tokens belong in client memory, not files or shell arguments. Approved playback means the browser speech API was invoked; it does not prove that audio was audible or that a doctor heard it.

The server binds only to `127.0.0.1`, validates the Host header, rejects cross-origin/cross-site requests, and separates browser and agent credentials. Sessions expire after 15 minutes. Messages, commands, and tokens remain in process memory. Stopping retains only an empty one-minute tombstone so the browser can receive its cleanup signal. Clearing the browser requests deletion; expiry is the fallback.

The stdio server uses the official MCP SDK. This local HTTP bridge is a development protocol adapter, with no production identity system or multi-user remote access. Its clinical and platform limits are unchanged by connecting an AI host.

## Checks

With the local bridge running:

```sh
node scripts/check-mcp-bridge.mjs
node prototype/check-end-to-end.mjs
```

The first check uses an official MCP client over stdio, reads fictional context through the real HTTP bridge, rejects a proposal without speech, and verifies session revocation. The second checks browser pairing, nine-tool discovery, approval/rejection, notes, and cleanup. It requires Playwright/Chrome; `PLAYWRIGHT_MODULE` and `CHROME_BIN` select external installations. `MCP_TEST_URL` selects another bridge address for the browser check. Speech output is simulated, and its sanitized report goes to ignored `output/mcp-test-report.json`.

`npm test` additionally checks isolation, real-message rejection, expiry, cursors, and the stdio transport. No live doctor call, model generation, paid voice API, or real health data is used in these checks. `prototype/rpc.mjs` accepts a manual JSON-RPC request through stdin; avoid putting tokens in command arguments.
