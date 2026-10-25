# accescompanion MCP agent connection

This local stdio server lets an MCP host supply the AI model and use accescompanion's tools. It uses the official MCP SDK. accescompanion does not run an LLM in the background or require a separate paid model API. The host's own plan and data-processing policies apply to shared fictional text.

## Start

With Node.js 24 LTS:

```sh
npm ci
npm run build
npm run dev:companion
```

Keep that process running for consultation tools. Search tools also work without the bridge. In another terminal, `npm run mcp:config` prints a JSON configuration using the current Node executable and absolute server path. Add the `accescompanion` entry to a compatible MCP client's configuration. Launch `node mcp/server.mjs` directly; stdout is reserved for MCP messages.

For Codex desktop, CLI, or IDE, use:

```sh
codex mcp add accescompanion -- node /absolute/path/to/accescompanion/mcp/server.mjs
codex mcp get accescompanion
```

Existing Codex configurations named `accescheck` continue to work because the executable and server path are unchanged; do not register a duplicate just to rename it.

If Node is not on the desktop app's PATH, use the full Node executable path printed by `npm run mcp:config`. After registering the server, refresh the MCP connection in the client or reopen the client if its tool list has not refreshed. This changes local MCP configuration, not the hosted Site's plugin.

[Official Codex MCP configuration](https://learn.chatgpt.com/docs/extend/mcp) explains the shared configuration and server instructions. [Official MCP SDK stdio documentation](https://ts.sdk.modelcontextprotocol.io/v2/serving/stdio) describes the transport.

## Test the local consultation

1. Open http://127.0.0.1:4180/consultation while `npm run dev:companion` is running.
2. Click **Partager l’exemple et lier un agent**. Share the displayed single-use code with your connected AI client. Pairing does not start captions or audio.
3. Ask the agent: “Utilise accescompanion avec ce code. Lis la conversation fictive partagée et aide-moi à préparer une question. Propose-la avant de demander sa lecture.”
4. The agent calls `prepare_consultation`, then `get_consultation_context`. The pairing example is text-only. Clear and disconnect it before starting a real conversation.
5. To request speech, the agent calls `speak_patient_message` with `expected_cursor` from the latest context. The page still requires **Approuver et lire cette réponse**. The request alone never plays audio. Duplicate pending proposals at the same cursor reuse their action ID.
6. A corrected caption expires pending speech proposals. The agent must read updated context before proposing a replacement. Rejecting a proposal never plays audio.
7. Ask for `draft_visit_notes` for an exact editable transcript draft, or `stop_session` to revoke access and clear the shared test.

Codex receives server-wide instructions on connection. Hosts with MCP prompt support can also select `accescompanion_communication`. Conversation content is source data, not agent instructions. The prompt directs the model to ask about the patient's intent, keep uncertainty visible, and avoid clinical inference.

## Nine tools

- Search: `search_practices`, `get_practice_accessibility`, `create_visit_briefing`.
- Consultation: `prepare_consultation`, `get_consultation_context`, `get_caption_updates`, `speak_patient_message`, `draft_visit_notes`, `stop_session`.

`get_consultation_context` includes only the paired session's current fictional messages, reading mode, cursor, action statuses, and explicit capability limits. It does not return browser credentials. Session keys stay in client memory; never commit them or put them in example configuration.

The bridge defaults to `http://127.0.0.1:4180/mcp`. Tests can select a different loopback port with `ACCESCHECK_MCP_URL`; remote hosts, credentials, queries, and redirects are rejected. Tool discovery and the prompt do not require the bridge to be running. A missing bridge produces an actionable tool error.

## Verification and limits

`npm test` includes the official MCP client, in-memory pairing and proposal flows, and a real stdio child-process handshake from a different working directory. Tests use fictional data and no live model call. They establish protocol behavior, not the quality of model-generated replies. The connected host remains responsible for its model and tool permissions.

The consultation MCP tools are still restricted to the fictional demonstration. No live Doctolib audio, patient records, doctor booking, automatic diagnosis, or speech injection into a call is added by this connection. A local protocol test does not establish real-call compatibility.
