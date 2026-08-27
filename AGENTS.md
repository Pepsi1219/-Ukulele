# AGENTS.md

This file provides guidance to Codex (and other coding agents) when working with code in this repository. `CLAUDE.md` in the same directory is the canonical, more detailed reference — prefer it when the two overlap.

## Workflow Rules

- **Never run preview servers or browser tests.** The user verifies changes themselves. Do NOT call preview_*, screenshot, or headless-browser tools.
- **Never `git commit` or `git push` without explicit user approval.**
- **Whole-system impact analysis before every change.** Map every place the change could touch — data model, Firestore rules, editor tabs, playback sync, main panel + fullscreen overlay + mini-player, tests, migration script. If low risk, fix the whole system in one pass (don't patch only the exact spot while leaving mirrors stale). If high risk / cross-cutting, stop and ask.
- Never `git add -A` / `git add .` — stage specific files.
- Never `--no-verify` or `--force`.

## Commands

```bash
npm test                  # Run all unit tests (vitest --run)
npm run test:watch        # Watch mode
npm run test:coverage     # v8 coverage over src/utils/**/*.js
npx vitest run tests/unit/chordEngine.test.js  # single file
```

There is no build step — a no-bundler single-page app served directly as static files. Open `index.html` in a browser or use any static file server (e.g. `npx serve .`).

## Architecture

**Entry point:** `index.html` + `script.js` + `styles.css`. All three flat at the repo root — no framework, no bundler.

**`script.js`** (~4000+ lines) is the whole application controller. It owns every DOM ref (in a single `dom` object), every event handler, and a single `state` object holding all runtime state. It imports from `src/utils/` (pure) and `src/firebase/` (backend layer). Anything module-scoped starts with `_` (e.g. `_lastRenderedSongId`, `_isMobileViewport`).

**`src/firebase/`** — Firebase Web SDK v10, loaded via gstatic CDN ESM imports (matches the no-bundler setup). Firestore only, no Storage bucket (project stays off the Blaze plan).

| File | Purpose |
|---|---|
| `firebase-config.js` | Project config (user fills from Firebase console) |
| `firebase.js` | App bootstrap — exports `db`, `auth` singletons |
| `songStore.js` | `fetchSongData(id)`, `saveSongData(id, kind, json)` — 3 parallel doc reads/writes at `songs/{id}/data/{lyrics|chords|notation}` |
| `authStore.js` | Google Sign-In + teacher allowlist check (`admins/{uid}` doc) with 24h sessionStorage cache to skip repeat Firestore lookups |
| `practiceLogStore.js` | `logSession`, `fetchAllSessions`, `prunePracticeLog`, `clearAllSessions` (client-side retention: 90 days / 2000 rows cap) |

**`src/utils/`** — pure, side-effect-free modules. Every function unit-testable in Node/vitest without a DOM.

| File | Purpose |
|---|---|
| `chordEngine.js` | Derive chord timeline from lyrics; find current chord by playback time |
| `songBuilder.js` | Normalise manifest entry + lyrics + chords + notation JSON into a song object |
| `playerUtils.js` | Resolve MP3 path by audio mode (song vs vocal) |
| `loopEngine.js` | A-B loop math: section bounds, normalise range, seek-back check, progress-bar percents |
| `strumEngine.js` | Strumming pattern definitions and beat-position calculator |
| `chordDiagram.js` | SVG chord diagram renderer; imports from `src/data/ukeChords.js` |
| `notationModel.js` | Pitch/duration/key semantics; `parseNotation` + `chordsToNotation` (legacy adapter) |
| `staffLayout.js` | Pure staff geometry — beat→x, measures, multi-row wrap, bar-line positions (equal width, vertically aligned) |
| `staffRenderer.js` | Staff SVG output; exports `renderStaff`, `renderStaffRowBody`, `staffDrawContext` (the latter two shared with `tabRenderer` for combined view) |
| `notationImage.js` | Resolves the `Letter Note Notation/<id>.png` reference-image path |
| `tabModel.js` | Pitch → (string, fret) for reentrant-tuned ukulele; smart fingering (keeps hand near previous note); per-note `tabString`/`tabFret` override |
| `tabRenderer.js` | `renderTab(model)` standalone 4-line tab; `renderCombined(model, positions?)` staff+tab per row, sharing bar-line x |
| `timestampEditor.js` | Editor row builder/mutators for the Lyrics tab |
| `chordEditor.js` | Editor row builder/mutators for the Chords tab |
| `notationEditor.js` | Editor state/mutators + JSON export for the Notation + Tab editor tab (preserves `tabString`/`tabFret` round-trip) |
| `practiceLog.js` | Favorites toggle + practice session aggregation/stats |
| `formatTime.js` | `MM:SS` formatter |
| `createUUID.js` | UUID v4 generator |

**`src/data/ukeChords.js`** — static chord database (GCEA tuning). `{ frets: [G, C, E, A] }` per chord name (0=open, -1=muted).

## Data model

Local (static files, unchanged):
- `manifest.json` — song index `{id, title, mp3, bpm}`
- `songs/<id>.mp3` full-mix audio, `vocal/<id>.mp3` vocal-only, `animation/*.json` Lottie
- `Letter Note Notation/<id>.png` lesson reference image
- `Lyrics/`, `Chords/`, `Notation/` folders — migration source only (`scripts/migrate-to-firebase.mjs`), the runtime app reads Firestore

Firestore (editable payloads):
- `songs/{id}/data/{lyrics|chords|notation}` — each doc `{ json: "<stringified>" }` (JSON string keeps byte-exact fidelity + sidesteps nested-array limits)
- `admins/{uid}` — teacher allowlist (managed by hand in the Firebase console)
- `practiceLog/{autoId}` — shared class-wide session log; open-create (shape-checked in rules), teacher-only read/delete

`Notation/<id>.json` format includes optional `tabString` (0=G, 1=C, 2=E, 3=A) + `tabFret` (0–15) per note to pin a specific fingering; BOTH must be set for the override to apply.

## Key features (see CLAUDE.md for depth)

- **Entry gate** (`#entryGate`) — student / teacher-login landing. `state.studentModeOverride` blocks teacher-only UI even when a persisted teacher session exists, until the user re-picks teacher mode.
- **Notation view picker** — one modal (`#notationViewModal`) reached from either `#notationToggleBtn` (main) or `#lyricsFsNotationToggleBtn` (fullscreen mirror). Views: `notation | tab | both | image`. Backed by `state.notationView`. Playback highlight applies to BOTH `.note-head[data-idx]` and `.tab-note[data-idx]`.
- **Editor "โน้ต + Tab" tab** — preview renders `renderCombined`. Per-note tab chip opens `#ntTabModal` (fretboard grid) to pin/clear fingering.
- **Panel collapse** (chord + lyrics, independent) — desktop = 44px vertical rail; mobile = accordion. Persisted to `localStorage["ukulele-panel-collapse"]`.
- **Mobile mini-player** (`#miniPlayer`) — Spotify-style floating bar (`z:200`, `≤760px` only). Forwards clicks to the real controls; hidden via `body.no-mini-player` when fullscreen/editor/gate are open.
- **Song loading** — 3-tier cache (in-memory `_dataLoaded` → sessionStorage `uke-song:{id}` → Firestore). MP3 + Firestore fetch run IN PARALLEL from `selectSong()`. Auto-play is a closure param `{autoPlay}` (never a shared state flag).

## XSS safety

`script.js` has an `escHtml(str)` helper — use it whenever inserting Firestore-sourced strings into `innerHTML`. Prefer `textContent` / `document.createElement` for plain text.

## `[hidden]` CSS pitfall

Any author CSS with an explicit `display` value silently overrides `[hidden] { display: none }`. For any element that uses BOTH a display-setting class AND the `hidden` attribute, add:
```css
.my-class[hidden] { display: none !important; }
```

## Adding a Song

1. Add an entry to `manifest.json` with a unique `id` (slug).
2. Place `songs/<id>.mp3` (and `vocal/<id>.mp3` if available); for lesson songs also `Letter Note Notation/<id>.png`.
3. In the app (teacher login) open the Editor to author lyrics/chords/notation → **บันทึกขึ้น Cloud**. Or write `songs/{id}/data/{kind}` docs directly in the Firestore console as `{ json: "<stringified payload>" }`.

## Tests

`tests/unit/` — one file per utility module, vitest, Node. Coverage over `src/utils/**/*.js`. CI: `.github/workflows/test.yml` runs `npm test` + coverage on push/PR to `main`.

## Git

Works directly on `main`. Never `push` without approval, never amend published commits, never use `--force` / `--no-verify`. Stage specific files (never `-A`). Run `npm test` before committing when logic changes.
