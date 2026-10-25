# AccèsCheck — desktop browser extension

A Chrome/Edge Manifest V3 side panel for captions, typed responses spoken aloud, and reviewable notes alongside a Doctolib page. A prerecorded French mock call is included for testing without an appointment. This is an independent prototype, not an official Doctolib integration.

## Install for a local test

1. Open `chrome://extensions` in desktop Chrome 135+ (or the corresponding Edge extension page).
2. Enable **Developer mode**, choose **Load unpacked**, and select this `extension` directory (the directory containing manifest.json). If using the ZIP, extract it first.
3. Pin AccèsCheck in the browser's Extensions menu.
4. From the project root, run `node prototype/server.mjs`. Open **http://127.0.0.1:4180/mock-call** in that same browser.
5. **Click the AccèsCheck toolbar icon on the mock-call tab.** This opens the native side panel and grants the temporary active-tab permission required by Chrome. The panel's tab selector alone cannot grant capture permission.
6. Click **Activer les sous-titres** to open the setup dialog, confirm this fictional test's consent, and choose recognition mode. Local mode requires a compatible installed French speech pack. The optional browser service may send the fictional audio to the browser provider and requires a separate acknowledgment.
7. Click **Activer les sous-titres**, then **Lire la voix du soignant** on the mock page. Compare the captions with the expected script shown on that page.
8. Type a response and explicitly choose **Afficher** or **Lire à voix haute**. French voices come from your device; no ElevenLabs key or paid voice API is required.

The panel can also be opened on a Doctolib desktop tab using the toolbar icon. Do not assume a booking or completed-appointment page contains call audio. A real live-call compatibility check has not been completed. This extension is not supported inside the iPhone Doctolib app or this chat's in-app browser.

## What works where

- **On the selected Doctolib tab:** native side panel, authorized tab-audio caption path, written replies, local French speech, correction, and reviewable verbatim notes. Browser speech services and language packs vary by device.
- **On the local fictional call:** the same controls plus the in-memory MCP pairing bridge. The six consultation MCP tools remain a local prototype, not the hosted site's tool set.
- **Not implemented:** automatic booking, reading patient records/documents, joining a consultation, injecting speech into Doctolib's outgoing microphone, environmental audio description, or LLM-generated clinical summaries.

Generated replies play on the patient's device. Their delivery to the doctor depends on the platform's audio-sharing or an agreed communication setup; it must be verified with the other participant. Capturing a tab normally suppresses its audio output, so the extension reconnects that audio to the device's speakers to preserve listening. Speaking pauses transcription and does not restart it automatically.

## MCP test

Keep the local server running. In the panel on the **mock-call tab**, expand **Agent de communication**, then click **Relier l’agent au test**. Use the single-use code with `prepare_consultation` at `http://127.0.0.1:4180/mcp`. See `../prototype/README.md` for the six tools and request flow. Replies always require approval in the panel before speech. Pairing, tokens, captions, and commands remain in process memory and expire; no localStorage, database, or disk transcript is used. Real Doctolib captions cannot be shared through this demo MCP path.

## Permissions and lifecycle

- `activeTab`: access only after you invoke the toolbar action on a page.
- `tabCapture`: audio from that explicitly selected tab; microphone capture is never substituted.
- `sidePanel`: Chrome's native panel beside the website.
- `offscreen`: process audio and speech without loading scripts into Doctolib.
- Host access: only `http://127.0.0.1:4180/*`, for the mock and MCP bridge.

There are no content scripts and no cookie, history, storage, debugger, or all-sites permission. The extension neither scrapes nor modifies the Doctolib document. It accepts runtime commands only from its own panel/offscreen documents. The mock server allows cross-origin bridge requests from this extension's stable development ID only; other website and extension origins are rejected. The manifest's `key` is a public development identity, not an API credential.

Stop, session clear, page navigation, closing the source tab, or closing the side panel releases the audio and/or clears the session. The native browser capture indicator and the panel status show whether capture is active. No audio is recorded. Remote recognition, when selected, is governed by the browser provider's processing policy. Transcript errors and all clinical details must be checked with the clinician.

## Tests and limits

Run `node --test test/*.test.mjs` from the project root. Extension runtime tests use mocked Chrome/media services and cover toolbar selection, consent, exact audio-track routing, preserving playback, captions, typed replies, notes review, cleanup, and preventing MCP access on a real Doctolib target.

`prototype/launch-extension.mjs` can launch an isolated Chrome for Testing profile with developer mode enabled for testing; it never uses a personal Chrome profile. It requires Playwright and an official compatible Chrome for Testing executable supplied in `CHROME_BIN`.

`prototype/check-extension-native.mjs` uses Chrome's official `Extensions.triggerAction` test API and checks the actual native side panel/offscreen capture path on prerecorded fictional audio. The resulting `output/extension-native-report.json` records actual transcript output, including when none was recognized; active capture alone is not a passing speech-accuracy test. The French local pack was unavailable in the isolated test profile. With explicit browser-service consent, the real prerecorded French audio produced French captions in the installed extension. This establishes the mock-call path, not clinical accuracy or live Doctolib compatibility.

`prototype/check-extension-mcp.mjs` exercises the installed extension's native runtime against the actual local MCP server with fictional text, a rejected reply, reviewable notes, and cleanup. No real medical appointment is used.

Official API references: [Side Panel](https://developer.chrome.com/docs/extensions/reference/api/sidePanel), [Tab Capture](https://developer.chrome.com/docs/extensions/reference/api/tabCapture), [Speech recognition input tracks](https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/start).


## Conversation interface and subtitle troubleshooting (v0.2.0)

The panel now shows its version, a real audio-level meter, and separate feedback for no incoming audio versus audio received without recognized text. Diagnostic copying excludes transcript text, names, meeting URLs, and MCP tokens. The default local recognition mode is preserved; the settings explicitly identify the browser-service mode used successfully in the fictional test, with its separate audio-processing consent.

If you saw `no-speech` with an **Arrêtés** badge, recognition had already stopped before or during playback. The **Garder les sous-titres actifs pendant les silences** option now keeps recognition available on the same authorized live audio track. It restarts only that recognizer after silence or a normal service end. It never obtains a new stream, switches to the microphone, or silently chooses a remote service. Stop, consent withdrawal, playback, closing the panel, and navigation cancel pending recovery. Network, permission, and other recognition errors still stop capture and stay visible. Uncheck the option for the previous stop-on-silence behavior.

To update an unpacked extension, replace its files with this version and click Reload on its Chrome extensions card, or load the newly extracted v0.2.0 folder. Confirm **v0.2.0** in the panel header. Refresh the mock page, invoke the toolbar icon on that tab again, select the recognition mode and consent, start captions, and then play the fictional doctor recording. The recording is 13.71 seconds long; a test that ends immediately indicates an old/empty audio asset and requires refreshing the mock page.

The v0.2.0 interface uses a compact conversation panel, scrollable live captions, a typed reply composer, and separate notes. Audio processing, consent, voice choices, and tab selection are grouped in the settings dialog. The mock call has a responsive consultation layout with a real playback timer, progress, and a clearly fictional illustrated participant.

## Agent connection (v0.2.1)

Connect the local stdio MCP server to Codex or another AI host using [../mcp/README.md](../mcp/README.md). Corrected captions expire pending agent speech proposals; the panel removes expired proposals and rechecks them before playback. The user still approves each spoken reply. The bridge shares fictional sessions only.
