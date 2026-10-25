# AccèsCheck — design

## Purpose

Help someone compare declared access information before a medical appointment, then communicate during the visit. Keep the name **AccèsCheck**. Write interface text in French, using direct sentences that explain the next action.

## Visual language

The main reference is Minimal Mind: restrained typography, few controls and deliberate whitespace. Legora and Mistral inform the quiet, central writing interface. Apply this language to the homepage, results and consultation rather than introducing a separate dashboard style.

| Element    | Rule                                                                                                                                                                                                      |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Font       | `Helvetica Neue`, Helvetica, Arial, sans-serif. Body 14–15 px; helper text 12–13 px. Keep editable mobile text at least 16 px to avoid input zoom.                                                        |
| Color      | White `#fff`, ink `#171717`, muted `#626262`, border `#e3e3e3`, surface `#f6f6f6`. Red `#bd292e` for the asterisk and focus/error accents.                                                                |
| Header     | Fixed top left: AccèsCheck with a sharp red, six-arm asterisk. Translucent rectangle, white at 56%, Gaussian backdrop blur 8 px, subtle border and 3 px radius. Keep the mark sharp. Menu sits top right. |
| Components | Thin borders, small corner radii, restrained shadows. Prefer native buttons, details and dialogs. Interactive targets at least 44 px tall.                                                                |
| Spacing    | Use 4 px increments. Space separates tasks; it must not push essential actions out of reach.                                                                                                              |
| Motion     | Short, responsive transitions. Respect reduced motion and the animation pause control.                                                                                                                    |

Do not add decorative gradients, large rounded cards, extra accent colors, oversized headings or promotional filler. Keep warnings and privacy explanations where the user needs them.

## Page behavior

### Home and search

- Start with the hospital photo and a brief pitch. The fixed glass header stays visible while scrolling toward the writing field.
- Below the photo, use a central needs field with its submit action. Keep optional settings collapsed initially.
- After interpretation, show selected criteria first. Put other criteria behind disclosure. Show width only when relevant; never assume a wheelchair width.
- Keep review, confirmation and search close together for a simple request. Put location, specialty and remote AI options behind the optional settings.
- Require explicit review before searching. Put validation errors beside the relevant controls and bring the error or invalid field into view.
- Results distinguish declared matches, unknowns and known obstacles. Show evidence provenance and qualify straight-line distance. Open consultation in a new tab and name that behavior accessibly, retaining the original search in memory.

### Consultation

- The initial workspace contains the conversation and reply actions. Aim for no document scrolling at normal portrait desktop/mobile sizes; allow internal conversation/notes scrolling. On very short screens or enlarged content, allow document scrolling rather than clipping controls.
- Keep microphone state, consent and start/pause actions readable. Capture starts only after user action and consent.
- Put connection, voice and developer controls in Settings. Keep the selected practice visible outside Settings.
- Keep the reply composer available from Conversation and Mon récapitulatif. Displaying a reply must reveal Conversation and the new message.
- Make session clearing available from both tabs. Warn before leaving nonempty work; offer a clear way to remain. Do not silently save health text.
- Dialogs must have a title, cancellation and predictable focus restoration. After correction, focus returns to the edited message's control.

## ASCII motion

Use the existing Canvas flow trail. It follows the mouse and drifts when idle, only in the area after the photo. It may pass behind the translucent header. Fade it near protected content; do not introduce hard rectangular cuts. Pause during typing, when the tab is hidden, when requested, and for reduced motion. Decoration must never intercept pointer or keyboard input.

## Finish check

Inspect the real page at 320, 390, 768 and 1440 px. Check long French labels, empty/error states, keyboard focus under the fixed header, dialogs, content overflow and reduced motion. Compare home and consultation for consistent type, border, spacing and header treatment. Take screenshots and run the affected Playwright journeys before claiming the interface works.
