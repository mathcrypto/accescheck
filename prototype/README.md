# Local MCP consultation test

A local, in-memory prototype proving that an MCP client can exchange commands with the browser companion. The production site is unchanged: its hosted MCP still exposes the original three search/preparation tools.

Run from the project root with Node 20+:

```sh
node prototype/server.mjs
```

Open http://127.0.0.1:4180/consultation. Click **Partager l’exemple et lier un agent**. Only the labeled fictional conversation is shared. This prototype refuses real messages. It never starts a microphone or joins a call.

MCP endpoint: http://127.0.0.1:4180/mcp. Supports initialization, discovery, and tools/list/tools/call; it adds these five tools to the original three:

1. `prepare_consultation({pairing_code,reading_mode?})`: single-use code, valid 5 minutes. Returns session_id and agent_token. Store these in client memory, not a file.
2. `get_caption_updates({session_id,agent_token,after?})`: fictional caption and correction events plus command statuses.
3. `speak_patient_message({session_id,agent_token,text})`: requests playback. The user must approve it in the browser; the tool itself never plays audio. A successful browser speech request is not proof that the sound was audible.
4. `draft_visit_notes({session_id,agent_token})`: verbatim fictional draft, no clinical inference. Browser review is required, and existing notes are not overwritten.
5. `stop_session({session_id,agent_token})`: clears server data, revokes the token, and requests browser cleanup.

The server binds only to 127.0.0.1, rejects unexpected hosts and cross-origin/cross-site requests, separates browser and agent tokens, and expires sessions after 15 minutes. Pairing and transcript data remain in process memory only; no database or disk writes. Stopped sessions retain only a short-lived empty tombstone so the browser can receive the cleanup signal. Closing or clearing the browser requests deletion; expiry is the fallback.

`prototype/rpc.mjs` accepts one JSON-RPC request through hidden stdin for manual local calls; do not put tokens in shell arguments. This is a protocol-level test, not a configured native chat plugin or an extension. It does not provide production-grade multi-user remote access or a standards-complete generic MCP client/server SDK implementation.

## Verification

```sh
node --test test/*.test.mjs
node prototype/check-end-to-end.mjs
```

The browser test needs Playwright and Chrome. Optional environment variables: PLAYWRIGHT_MODULE and CHROME_BIN. It makes real HTTP JSON-RPC calls to the running server and checks actual UI changes; only browser speech output is mocked. It writes a sanitized report to output/mcp-test-report.json.

The test covers pairing, discovery of eight tools, browser-shared fictional captions, rejected and approved replies, reviewable notes, cleanup, and token revocation. Unit tests additionally cover isolation, real-message rejection, expiry, and input limits.

For a production agent connection, session transport, identity, explicit patient permissions, interruption behavior, and browser pairing need a separate implementation review. No Doctolib or Zoom meeting, real health data, API key, or paid voice service is used here.
