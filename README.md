# AccèsCheck

Accessibility evidence for medical practices in Paris, with a French patient interface and an MCP server. This is an initial working vertical slice, not an appointment system.

## Run locally

Requires Node.js 20+; no npm packages or API keys required.

```sh
npm run build
npm test
npm run dev
```

Open http://127.0.0.1:4173. The server provides the app, POST /api/search, POST /api/briefing, GET /api/catalog, and POST /mcp. No database, health profile storage, or application request logging. Production infrastructure may retain operational logs independently of application code.

## Data and evidence

510 Paris medical practices imported from the official Accès Libre export of **2026-10-24**, plus three synthetic examples available only through the explicit demo switch. `data/provenance.json` documents publisher, resource URL, selection, license, import date, and limitations. Attribution: Accès Libre — Ministère de la Transition écologique, Licence Ouverte / Etalab 2.0. Import is a complete selected subset, not a live API connection.

104 source records include a Doctolib URL in their contact or website field. Links are imported from those fields, validated against exact HTTPS hosts, and opened in a new tab. Identity and destination availability are not independently certified. No Doctolib credentials, availability lookup, scraping, or booking. Doctolib integration beyond links requires authorized access.

The CSV omits per-record confirmation dates. All populated fields are therefore marked declared, not photo-verified or patient-confirmed; null remains unknown. Date of export is never treated as date of inspection. Explicit contradictory entrance fields are flagged. This implementation detects that particular conflict, not every possible cross-field contradiction.

Rules translate common French/English need keywords into criteria. This is not LLM understanding; complex phrasing, negation, or unsupported needs may be misunderstood. Users can review extracted criteria. No door width is assumed for a wheelchair. Width is the entrance door width, not all interior passages. The interior route field describes the journey to reception only. Consultation accessibility does not establish transfer suitability. Briefings explicitly ask about transfer and the remaining route.

Ranking: matching documented criteria first; known obstacles last; no distance, travel-time, live availability, or universal accessibility score. Undated declarations may be outdated. When an observation has a date, freshness expires after three calendar years; dates absent from the export remain absent.

## MCP

Hosted endpoint: `/mcp`. Tools: `search_practices`, `get_practice_accessibility`, `create_visit_briefing`. Supports Sites `server/discover` (2026-07-28), tools/list, tools/call, and stateless initialization compatibility. All tools are read-only. Sites enforces private site access before forwarding requests. Local preview is loopback-only and has no authentication.

Example tools/call params:

```json
{"name":"search_practices","arguments":{"needs":"fauteuil électrique et malentendant","width":95,"district":"75011","mode":"real"}}
```

Sites publication with the MCP capability creates a personal plugin. Install/connect the generated plugin in Codex or ChatGPT. For other MCP clients, authenticated remote transport compatibility must be tested; this version has not been verified with all clients.

## Structure and deployment

- `src/core.mjs`: needs, evidence, ranking, briefing, link validation.
- `src/handler.mjs`: HTTP and MCP entry points, validation, no-store responses.
- `src/index.html`: responsive UI, keyboard access, labeled forms, evidence dialog, copyable call preparation, and enlarged reading mode.
- `scripts/compile.mjs`: embeds core, data, UI, and handler in `worker/index.js`.
- `scripts/build.sh`: packages Worker ESM artifact in `dist`.
- `scripts/import-data.py`: reproducible importer, run from project root with source CSV path. Update its dated source metadata when importing another export.
- `test/`: labeled parser cases, full dataset honesty check, trust/ranking tests, API and MCP contract tests.

Recompile after source edits. `worker/index.js` and `dist` are generated; edit `src`. Sites hosting manifest declares the MCP capability. No runtime secrets or external requests are required.

## Current limitations and next steps

Photo analysis/redaction, patient feedback, write-back payload review, multilingual UI, LLM parsing, and direct Doctolib APIs are deferred. No WCAG conformance claim; manually audit with a screen reader before patient deployment. Enlarged reading is not FALC. Only selected medical activities in Paris are included. Do not use demo fixtures for a real visit.

## Three-minute demo

1. 0:00–0:30: Explain the problem: knowing an address is different from knowing whether a visit is possible.
2. 0:30–1:30: Describe wheelchair and hearing needs; set the required door width; compare real practices and inspect evidence.
3. 1:30–2:15: Generate the call briefing, copy unresolved questions, and show a Doctolib link where the source provides one.
4. 2:15–2:40: Show a read-only MCP call returning the same results.
5. 2:40–3:00: Report measured tests with their limits; outline photo verification and authorized platform integration.


## Appointment companion (v0.2)

Open `/consultation`, or “Mon rendez-vous” from search.

- Live French captions via browser SpeechRecognition when supported. Microphone starts only after an explicit action and an agreement checkbox. Default is strictly on-device recognition (`processLocally=true`). Missing support or French language pack is reported without a silent remote fallback. Optional language pack installation requires a separate click.
- An explicit browser-service mode is available with an additional acknowledgment that the browser may send audio to its speech provider. AccèsCheck never receives or uploads audio. Browser-provider processing and retention cannot be guaranteed by this app.
- Recognized speech is labeled as captured speech with an unidentified speaker: no invented diarization. Provisional words appear separately; final phrases can be corrected.
- Patients can display typed messages or speak them using French voices marked local by the browser. Phrases are prepared but never automatically spoken. Speech playback stops recognition to avoid self-transcription; microphone does not restart automatically.
- Enlarged reading mode and spoken interface orientation support low vision and screen-reader use. This does **not** provide camera-based or environmental audio description.
- Notes can be entered manually, or a verbatim conversation draft can be copied into an editable field. This is not LLM summarization or a medical synthesis. Audio playback requires review acknowledgment; edits or new conversation content invalidate the acknowledgment. Copying notes requires an explicit action.
- No transcript, audio, or notes are posted to AccèsCheck, stored in a database, or persisted in browser storage. Page hide clears the session; leaving the foreground stops microphone and playback. Users can explicitly copy notes to their system clipboard.
- No API credentials required. Unsupported speech browsers retain manual two-way communication. Lack of a French local synthesis voice disables audio playback with an explanation.

The companion is a communication aid, not a clinical record or qualified interpreter. Critical instructions should be confirmed by the clinician.

### Companion verification

`node --test test/*.test.mjs` covers serving, pure helpers, exact transcript preservation, and privacy constraints alongside the existing data/API/MCP tests.

`scripts/check-companion.mjs` runs Playwright interaction tests with deterministic simulated speech recognition and synthesis: consent gates, local/remote handling, language pack errors, mic denial, interim/final captions, correction and XSS escaping, playback stopping the mic, notes review invalidation, overwrite protection, demo isolation, unsupported-browser fallback, mobile overflow, and no POST traffic. Set optional `PLAYWRIGHT_MODULE` and `CHROME_BIN` for your environment. Actual microphone transcription accuracy, French pack availability, audible playback quality, and assistive-device behavior require testing on the intended browser/device.

Browser APIs: [on-device speech recognition](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally), [language availability](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/available_static), [speech synthesis](https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesis).
