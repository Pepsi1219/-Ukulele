# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Commands

```bash
npm test                  # Run all unit tests (vitest --run)
npm run test:watch        # Watch mode
npm run test:coverage     # Run with v8 coverage report
```

There is no build step — this is a no-bundler single-page app served directly as static files. Open `index.html` in a browser or use any static file server (e.g. `npx serve .`).

To run a single test file:
```bash
npx vitest run tests/unit/chordEngine.test.js
```

## Architecture

**Entry point:** `index.html` + `script.js` + `styles.css`. All three are flat files at the repo root — no framework, no bundler.

**`script.js`** is the entire application controller (~2000+ lines). It owns all DOM wiring, event handlers, and a single `state` object that holds all runtime state (selected song, playback position, metronome, editor state, etc.). It imports exclusively from `src/utils/`.

**`src/utils/`** — pure, side-effect-free utility modules. Every function here is unit-testable in Node/vitest without a DOM. Modules:

| File | Purpose |
|---|---|
| `chordEngine.js` | Derive chord timeline from lyrics; find current chord by playback time |
| `songBuilder.js` | Normalise manifest entry + lyrics JSON + chords JSON into a song object |
| `playerUtils.js` | Resolve MP3 path by audio mode (song vs vocal) |
| `loopEngine.js` | A-B loop math: section bounds, normalise range, seek-back check, progress-bar percents |
| `strumEngine.js` | Strumming pattern definitions and beat-position calculator |
| `chordDiagram.js` | SVG chord diagram renderer; imports from `src/data/ukeChords.js` |
| `notationModel.js` | Musical semantics for the staff: parse pitch/duration/key, map pitch→staff position; `parseNotation()` (new format) + `chordsToNotation()` (legacy adapter) |
| `staffLayout.js` | Pure staff geometry: beat→x, measures, multi-row wrapping, bar lines (equal-width, vertically aligned) |
| `staffRenderer.js` | Renders a parsed notation model to an SVG string (clef, key sig, time sig, noteheads, stems, flags, ledger lines, accidentals) |
| `notationImage.js` | Resolves the `Letter Note Notation/<id>.png` reference-image path for lesson songs |
| `timestampEditor.js` | Editor row builder/mutators for the Lyrics tab of the timestamp editor |
| `chordEditor.js` | Editor row builder/mutators for the Chords tab of the timestamp editor |
| `notationEditor.js` | Editor state/mutators + JSON export for the Notation (โน้ต) tab of the editor |
| `practiceLog.js` | Favorites toggle + practice session aggregation/stats |
| `formatTime.js` | `MM:SS` formatter for playback display |
| `createUUID.js` | UUID v4 generator |

**`src/data/ukeChords.js`** — static chord database (GCEA tuning), keyed by chord name. Values are `{ frets: [G, C, E, A] }` arrays (0=open, -1=muted, 1+=fret number).

**Song data format:**
- `manifest.json` — song index; each entry has `id`, `title`, `mp3`, `bpm`
- `Lyrics/<id>.json` — array of timed entries, each either `{ section: "name" }` or `{ time: number, line: [{ chord?, lyric }] }`
- `Chords/<id>.json` — optional explicit chord timeline `[{ time, chord }]`; when absent, chords are derived from the first chord-bearing segment of each lyrics line
- `Notation/<id>.json` — optional melody staff notation: `{ config: { clef, key, timeSignature, measuresPerRow, pickupBeats }, notes: [{ pitch, dur, time? }] }`. `pitch` is scientific notation ("A4", "F#4", "rest"); `dur` is `whole|half|quarter|eighth|sixteenth` (+ `.` for dotted) and drives the *drawn* rhythm; `time` (seconds) is optional and only syncs the highlight with playback. When present, the lyrics panel renders an interactive staff; when absent, lesson songs fall back to the `Letter Note Notation/<id>.png` image (or, legacy, a Chords-derived staff).
- `Letter Note Notation/<id>.png` — static reference image of a lesson's melody (used when no `Notation/` file exists)
- `songs/<id>.mp3` — full-mix audio
- `vocal/<id>.mp3` — vocal-only audio (mirrors `songs/` filenames)
- `animation/` — Lottie JSON files for the dancing character

The Notation/<id>.json file is easiest to author in-app: open the editor → **โน้ต** tab → set config + add notes (with a live staff preview) → **Copy JSON** → paste into `Notation/<id>.json`.

**PWA:** `site.webmanifest` + meta tags in `index.html` enable "Add to Home Screen" on iOS/Android. No service worker.

**Tests:** `tests/unit/` — one test file per utility module, using vitest. Tests run in Node (no DOM). Coverage is collected over `src/utils/**/*.js`.

**CI:** `.github/workflows/test.yml` — runs `npm test` and `npm run test:coverage` on push/PR to `main`.

## Adding a Song

1. Add an entry to `manifest.json` with a unique `id` (slug format, e.g. `artist-song-title`).
2. Create `Lyrics/<id>.json` with the timed lyrics array.
3. Optionally create `Chords/<id>.json` for a separate, more granular chord timeline.
4. Place `songs/<id>.mp3` (and `vocal/<id>.mp3` if available) in the matching folders.
