# accescompanion

Prepare a medical visit and follow the conversation: find documented accessibility information, open a practice's Doctolib link when available, read captions, type a reply, and prepare notes to review with the clinician.

## Run locally

Requires Node.js 24 LTS.

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:4173:

- `/`: introduction and links to the patient journey.
- `/cabinets`: search practices, inspect evidence, and prepare questions for the cabinet.
- `/consultation`: captions, typed/spoken replies, corrections, and editable notes.

After changing `src/`, rebuild and restart the preview. The Chrome extension has been removed; the consultation page runs alongside an appointment website.

## Search and accessibility evidence

The bundled dataset contains 510 Paris medical practices from the official Accès Libre export of **2026-10-24**. See [data/provenance.json](data/provenance.json) for publisher, resource, selection, license, and import details. Attribution: Accès Libre — Ministère de la Transition écologique, Licence Ouverte / Etalab 2.0.

Search sends the submitted needs to the app server for rule-based processing. There is no LLM parsing, patient account, health profile database, or application request logging. Infrastructure may retain operational logs independently of the application.

Common French/English keywords become criteria the user can review. Complex wording, negation, or unsupported needs may be misunderstood. Wheelchair width is never assumed. Matching documented criteria rank first and known obstacles rank last; there is no universal accessibility score, distance calculation, or live availability lookup.

The export omits individual confirmation dates. Populated fields are declared, not photo-verified or patient-confirmed. Missing information stays unknown, and contradictory entrance declarations are flagged. Door width describes the entrance; the documented internal route stops at reception. Transfer suitability, the consultation room, and the rest of the route remain questions for the practice.

104 source records include a validated HTTPS Doctolib link. These links open externally. The app does not log in, read patient records, query appointment slots, book appointments, or join calls. A declared criterion is not a guarantee of access.

## Following the appointment

- **In person:** captions use the device microphone after the user confirms agreement and starts them.
- **Doctolib or Zoom video:** the user opens their own call, selects its browser tab, and explicitly shares tab audio. Connecting the audio then starts captions if the recognition mode and consent checks pass. Video mode never substitutes the microphone for missing tab audio.
- **Recognition:** local French processing is the default and requires browser support and a compatible language pack. The optional browser service requires explicit acknowledgment that its provider may receive audio. Silence can restart recognition within the same authorized session; pause, consent withdrawal, or leaving an in-person page stops it. There is no silent switch to remote recognition.
- **Audio:** desktop Chrome/Edge 135+ is required for the tab-audio recognition path. Screen/window selections and audio-less shares are rejected. The temporary video track is stopped after selection; frames are not displayed or analyzed. A local audio monitor preserves listening to the shared call.
- **Replies:** users can display text, copy it for the call's chat, or play it with a French voice marked local by the device. Speech pauses captions. The doctor hears that voice only if the device is nearby or the user has arranged outgoing audio sharing; the app does not inject speech into Doctolib or Zoom's microphone.
- **Notes:** drafts copy messages verbatim. They do not generate a clinical summary. Edits and new messages invalidate review acknowledgment; spoken notes require review.

Captured speech has no reliable speaker identification. Corrections should be confirmed with the person who spoke. This is not an interpreter, a clinical record, or environmental audio description. Real-call compatibility, transcription accuracy, and assistive-device behavior require acceptance testing.

On the patient pages, conversation text stays in page memory until clear or page close. No audio is recorded, and no transcript or notes are sent to the app backend. The browser provider may process audio when the user selects remote recognition. Copying notes uses the system clipboard only on request. The fictional MCP developer workflow below explicitly shares labeled example text with the local bridge and the connected AI host.

### Retained optional voice API

The patient interface currently uses device voices only. The backend retains `/api/voice-config` and `/api/speech` for optional ElevenLabs use; these endpoints are not wired into the current composer. They require a server-side `ELEVENLABS_API_KEY`, explicit text-transfer consent, and a valid voice configuration. `.env.example` includes the requested public voice ID. Never commit real credentials. Provider processing and account charges apply if the API is enabled; tests use a stubbed provider.

## AI agent and MCP

The standard app exposes three read-only MCP tools at `/mcp`: `search_practices`, `get_practice_accessibility`, and `create_visit_briefing`.

The [local consultation prototype](prototype/README.md) adds six tools for fictional sessions. Start it with `npm run dev:companion`, then open http://127.0.0.1:4180/consultation. The pairing controls and prerecorded `/mock-call` are developer checks, separate from the patient path.

[Connect Codex or another MCP host](mcp/README.md) using `node mcp/server.mjs`. The official SDK adapter exposes all nine tools and the `accescompanion_communication` prompt. The host supplies the model; the website does not run a background LLM. Pairing does not start capture or speech. Spoken proposals require browser approval, and correcting a caption expires pending proposals. Real patient conversations cannot be shared through this prototype.

The hosted Site retains the standard app's three search tools until a separately reviewed deployment changes it. Local code changes do not deploy the Site.

## Checks

```sh
npm run check
python3 -m unittest discover -s test -p 'test_*.py'
```

GitHub Actions runs formatting, lint, tests, importer checks, and build validation with Node 24 and Python 3.12. See [CONTRIBUTING.md](CONTRIBUTING.md) for source conventions. Unit and protocol tests cover search/evidence rules, HTTP handling, speech endpoint validation, session isolation, proposal approval/expiry, and an official MCP client connecting over stdio.

Optional browser checks require Playwright and Chrome/Chromium. With `npm run dev` running:

```sh
node scripts/browser-check.mjs
node scripts/check-companion.mjs
node scripts/check-call-workflow.mjs
```

Set `PLAYWRIGHT_MODULE` to an installed Playwright module and `CHROME_BIN` to a browser executable when they are outside the usual paths. `APP_TEST_URL` selects another preview address. Browser checks simulate speech/capture services; passing them does not establish audible output or real-call transcription quality. See [prototype/README.md](prototype/README.md) for MCP integration checks.

## Source layout and deployment

- `src/core.mjs`: need parsing, evidence rules, ranking, and briefing.
- `src/index.html`, `src/search.html`, `src/search.js`: homepage and practice search.
- `src/consultation.html`, `src/companion.js`: consultation interface and browser speech/capture lifecycle.
- `src/handler.mjs`, `src/speech.mjs`: HTTP/MCP routes and optional voice API.
- `prototype/`: fictional call and local in-memory MCP bridge.
- `mcp/`: official-SDK stdio connection and communication prompt.
- `scripts/compile.mjs`: generates `worker/index.js` from source and data.
- `scripts/build.sh`: packages the generated worker and Sites hosting manifest into `dist/`.

Edit `src/` rather than the generated worker. Build before deployment. Generated reports, local packages, `.env`, and signing keys are excluded from Git. Photo verification, patient feedback, direct Doctolib APIs, and clinical summaries are not implemented. Screen-reader and clinical acceptance audits remain necessary before patient deployment; no WCAG or FALC conformance is claimed.
