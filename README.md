# AccèsCheck

Prepare a medical visit and follow the conversation: find documented accessibility information, open a practice's Doctolib link when available, read captions, type a reply, and prepare notes to review with the clinician.

## Run locally

Requires Node.js 24 LTS.

```sh
npm ci
npm run build
npm run dev
```

Open http://127.0.0.1:4173:

- `/`: AccèsCheck homepage and entry to search.
- `/assistant`: accompanied search on the homepage flow.
- `/cabinets`: chat with the finder agent over Accès Libre, then open Doctolib when listed.
- `/consultation`: captions and replies during a visit (separate from finding a cabinet).

The local preview recompiles source changes and reloads an idle homepage. Entered fields and consultation sessions defer automatic refresh to preserve their contents. Restart after changing the server or reload tooling. The Chrome extension has been removed; the consultation page runs alongside an appointment website.

## Search and accessibility evidence

Practice data is imported from the official Accès Libre export into SQLite locally (and a verified read-only snapshot on Vercel). Sync with `npm run data:sync`. The current medical export covers **France** (about **19 750** practices; see [data/source.json](data/source.json) and [Vercel deployment](docs/vercel.md)). Attribution: Accès Libre — Ministère de la Transition écologique, Licence Ouverte / Etalab 2.0. Places use the IGN address API for France. Contact actions prefer a verified [Doctolib](https://www.doctolib.fr/) profile from Accès Libre when present, otherwise the cabinet website/contact page or Accès Libre fiche. The app does not scrape reviews or rank by reputation.

Search and the finder chat send submitted needs to the app server. Local rules are the default; optional OpenAI interpretation requires explicit consent and the patient reviews proposed criteria before searching. The model never receives cabinet records or rankings. No patient account, health profile database or application request logging is created. Infrastructure may retain operational logs independently of the application.

Common French/English needs become criteria the user can review. Wheelchair width is never assumed. Matching documented criteria rank first and known obstacles are excluded from the finder list; unknowns stay visible. There is no universal accessibility score or live availability lookup. Distances use imported coordinates and remain straight-line estimates.

The export omits individual confirmation dates. Populated fields are declared, not photo-verified or patient-confirmed. Missing information stays unknown, and contradictory entrance declarations are flagged. Door width describes the entrance; the documented internal route stops at reception. Transfer suitability, the consultation room, and the rest of the route remain questions for the practice.

Validated HTTPS Doctolib links from Accès Libre open externally when present. The app does not log in, read patient records, query appointment slots, book appointments, or join calls. A declared criterion is not a guarantee of access.

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

## Finder agent

`/cabinets` is one stateful finder (session needs, specialty, place). The UI keeps a single current request: a correction replaces the previous turn; **Nouvelle conversation** clears everything. Simple accessibility phrases search immediately; mixed requests (profession or quartier) ask for confirmation first. Local rules translate the patient’s sentence. Optional OpenAI extraction remains available server-side for other callers, but the patient finder does not send descriptions to OpenAI. Search and ranking stay deterministic on Accès Libre data.

## MCP and consultation tools

The app still exposes three read-only MCP tools at `/mcp`: `search_practices`, `get_practice_accessibility`, and `create_visit_briefing`.

The [local consultation prototype](prototype/README.md) adds fictional session tools for developers. It is separate from the patient finder. Connect a host with `node mcp/server.mjs` if needed.

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
- `src/index.html`, `src/home.js`, `src/assistant.*`: AccèsCheck homepage and accompanied search.
- `src/finder.html`, `src/finder.js`, `src/agents/finder.mjs`: `/cabinets` finder chat over Accès Libre.
- `src/consultation.html`, `src/consultation.css`, `src/companion.js`: consultation interface and browser speech/capture lifecycle.
- `src/handler.mjs`, `src/speech.mjs`: HTTP/MCP routes and optional voice API.
- `prototype/`: fictional call and local in-memory MCP bridge.
- `mcp/`: official-SDK stdio connection and communication prompt.
- `scripts/compile.mjs`: generates `worker/index.js` from source and data.
- `scripts/build.sh`: packages the generated worker and Sites hosting manifest into `dist/`.

Edit `src/` rather than the generated worker. Build before deployment. Generated reports, local packages, `.env`, and signing keys are excluded from Git. Photo verification, patient feedback, direct Doctolib APIs, and clinical summaries are not implemented. Screen-reader and clinical acceptance audits remain necessary before patient deployment; no WCAG or FALC conformance is claimed.

Read [AGENTS.md](AGENTS.md) for code and verification rules, and [DESIGN.MD](DESIGN.MD) before changing the interface. Consultation opens in a new tab so the original search stays in memory. Conversations and notes are cleared on departure; nonempty work triggers a warning before leaving.

`node scripts/check-user-journey.mjs` checks search validation, retained results, consultation layout, keyboard focus, reply visibility and departure warnings at desktop and mobile sizes. It uses `APP_URL` (default `http://127.0.0.1:4180`) and the same `PLAYWRIGHT_MODULE` / `CHROME_BIN` overrides as the other browser checks. It does not activate audio or call paid APIs.

## Vercel and automatic deployment

Public app: **https://accescheck.vercel.app**. A push to `main` triggers formatting, lint, Node tests, Python importer tests, build and artifact validation. After those checks pass, GitHub Actions builds and deploys to Vercel, then verifies the public homepage, consultation and database-backed search. Pull requests and pushes to other branches run checks without publishing. See [CI/CD](docs/ci-cd.md) and [Vercel data snapshot](docs/vercel.md).

The public Function receives only the read-only practices database. The optional OpenAI communication agent remains on the local consultation server; use `npm run dev:companion`, the server-side `.env` key and explicit fictional text-transfer consent. Spoken proposals still require manual approval.
