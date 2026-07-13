# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Rules

- **Never run preview servers or browser tests.** The user verifies all changes themselves in real-time — it is faster for them. After finishing code edits, summarize what changed and stop. Do NOT call `preview_start`, `preview_screenshot`, `preview_snapshot`, or any `preview_*` tool.
- **Never git commit or push without explicit user approval.**

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

**`script.js`** is the entire application controller (~2500+ lines). It owns all DOM wiring, event handlers, and a single `state` object that holds all runtime state (selected song, playback position, metronome, editor state, etc.). It imports exclusively from `src/utils/`.

**`src/utils/`** — pure, side-effect-free utility modules. Every function here is unit-testable in Node/vitest without a DOM. Modules:

| File | Purpose |
|---|---|
| `chordEngine.js` | Derive chord timeline from lyrics; find current chord by playback time |
| `songBuilder.js` | Normalise manifest entry + lyrics JSON + chords JSON + notation JSON into a song object |
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

---

## Musical Notation System

The notation system uses a strict 3-module pipeline. **Do not mix responsibilities across modules.**

```
notationModel.js  →  staffLayout.js  →  staffRenderer.js
  (semantics)         (geometry)          (SVG output)
```

### notationModel.js — Musical Semantics

- `parsePitch("F#4")` → `{ step:"F", alter:1, octave:4, label:"F#" }`
- `parseDuration("quarter.")` → `{ beats:1.5, glyph:"quarter", dotted:true, flags:0, filled:true }`
- `staffStepForPitch(pitch, clef)` → diatonic index (0 = bottom staff line, 2 = next, up by half-steps)
- `keySignature("G")` → `{ type:"sharp", steps:[...] }`
- `normalizeConfig(cfg)` — merges with defaults; **always handles `null` input** via `cfg = cfg || {}`
- `parseNotation(obj)` — converts raw `Notation/<id>.json` to `{ config, notes[] }` model
- `chordsToNotation(chords, bpm)` — legacy adapter: derives a melody staff from chords when no Notation file exists

### staffLayout.js — Geometry

Key exported constants (used in renderer too):
```js
LINE_GAP = 14       // pixels between staff lines
STAFF_H  = 56       // height of 5-line staff
MARGIN_T = 42       // space above staff (ledger lines + labels)
MARGIN_B = 34       // space below staff
ROW_WIDTH = 680     // SVG viewBox width per row
HEADER_PAD = 9      // gap between header block and the beat grid
NOTE_INSET = 25     // every note is shifted right from its bar-line grid position
                    // so downbeat notes don't overlap the preceding bar line
```

`layoutStaff(parsed)` returns:
- `beatWidth` — constant for ALL rows (equal-measure-width guarantee)
- `measuresOriginX` — x of the first full-measure bar line on every row
- `rows[r].bars[]` — bar line positions (on grid, no inset)
- `rows[r].notes[]` — note positions (x = grid + NOTE_INSET)

**Equal-width formula:**
```js
beatWidth = (ROW_WIDTH - PAD_R - PAD_L - headerW - HEADER_PAD)
            / (mpr * beatsPerMeasure + pickup)
```
One `beatWidth` covers the pickup lead-zone plus all full measures — this is what makes all measures the same size across every row.

### staffRenderer.js — SVG Output

- `renderStaff(model)` → SVG string; returns `""` for empty/null model
- Each note wrapped in `<g class="note-head {glyph}-note" data-idx="{n.idx}">` for playback highlight
- Bar lines drawn ON the grid (no inset); notes drawn at `x + NOTE_INSET`
- Double bar line (final) = thin + thick, offset 4px apart

---

## Song Data Format

- `manifest.json` — song index; each entry has `id`, `title`, `mp3`, `bpm`
- `Lyrics/<id>.json` — array of timed entries, each either `{ section: "name" }` or `{ time: number, line: [{ chord?, lyric }] }`
- `Chords/<id>.json` — optional explicit chord timeline `[{ time, chord }]`; when absent, chords are derived from the first chord-bearing segment of each lyrics line
- `Notation/<id>.json` — optional melody staff notation (see format below)
- `Letter Note Notation/<id>.png` — static reference image of a lesson's melody (used when no `Notation/` file exists)
- `songs/<id>.mp3` — full-mix audio
- `vocal/<id>.mp3` — vocal-only audio (mirrors `songs/` filenames)
- `animation/` — Lottie JSON files for the dancing character

### Notation/<id>.json Format

```json
{
  "config": {
    "clef": "treble",
    "key": "C",
    "timeSignature": [4, 4],
    "measuresPerRow": 3,
    "pickupBeats": 0
  },
  "notes": [
    { "pitch": "A4", "dur": "quarter", "time": 2.787 },
    { "pitch": "F#4", "dur": "half.", "time": 3.163 },
    { "pitch": "rest", "dur": "eighth" }
  ]
}
```

- `pitch` — scientific notation (`"C4"`, `"F#4"`, `"Bb3"`, `"rest"`)
- `dur` — `whole | half | quarter | eighth | sixteenth` (append `.` for dotted, e.g. `"quarter."`)
- `time` — seconds into the audio; optional — only needed for playback highlight sync
- Note order = melody order (NOT sorted by time; `parseNotation` reads them as-is)

**Easiest authoring path:** Editor → **โน้ต** tab → configure + add notes (live staff preview) → **Copy JSON** → paste into `Notation/<id>.json`.

---

## Key UI State & Components

Notable `state` fields and their current behaviour — check these before editing related UI:

| Field | Type | Notes |
|---|---|---|
| `state.metroSoundId` | `string` | `"wood"` \| `"kick"` \| `"hihat"` \| `"bell"` \| `"clap"` \| `"rim"` \| `"cowbell"` \| `"clave"` (8 options). Sound selector is a `<select>` dropdown (`#metroSoundSelect`) next to the toggle button — not chips. |
| `state.chordDiagramRotation` | `0\|90\|180\|270` | Default is `90` (head pointing right / horizontal). Applied as `rot-90` class on `#chordDiagram`. Initialised in `initApp()`. |
| `state.notePickMode` | `"auto"` \| `"G"\|"C"\|"E"\|"A"` \| `string[]` | Array mode enables multi-string selection. `resolveStrings(mode)` in `chordDiagram.js` normalises all formats to `string[]`. |
| `state.speed` | `number` | Controlled by a gear button (`#speedGearBtn`) in the A/B loop row (right side). Opens a YouTube-style modal (`#speedModal`) with a range slider, −/+ buttons, and preset chips (1.0–2.0). |

**Dancing character (Lottie):** Lives in `.header-brand` inside `<header>`, absolutely positioned to the right of the h1 so it doesn't affect header height. No toggle button — always visible. Controlled by `initLottieDancer()` / `swapLottie()` in `script.js`.

---

## Adding a Song

1. Add an entry to `manifest.json` with a unique `id` (slug format, e.g. `artist-song-title`).
2. Create `Lyrics/<id>.json` with the timed lyrics array.
3. Optionally create `Chords/<id>.json` for a separate, more granular chord timeline.
4. Place `songs/<id>.mp3` (and `vocal/<id>.mp3` if available) in the matching folders.
5. Optionally create `Notation/<id>.json` for an interactive staff (use the in-app editor).

---

## Adding / Editing Notation for a Lesson

1. Open the app and select the lesson song.
2. Click the **Editor** button → switch to the **โน้ต** tab.
3. Set clef, key, time signature, measures per row, pickup beats.
4. Add notes one by one (pitch + duration). The staff preview updates live.
5. To sync highlights with audio: play the song and press **Stamp** on each note at the right moment.
6. Click **Copy JSON** and paste into `Notation/<id>.json`.

---

## Tests

`tests/unit/` — one file per utility module, vitest, Node (no DOM). Coverage over `src/utils/**/*.js`.

| Test file | Covers |
|---|---|
| `notationModel.test.js` | parsePitch, parseDuration, staffStepForPitch, keySignature, normalizeConfig, parseNotation, chordsToNotation |
| `staffLayout.test.js` | layoutStaff — note x positions, bar line positions, multi-row, pickup, equal measure widths |
| `notationEditor.test.js` | buildNotationConfig, buildNoteRows, updateNoteField, stampNoteTime, computeMeasureMap, exportToNotationJson, etc. |
| `songBuilder.test.js` | buildSong — lyrics, chords, notation integration |

**CI:** `.github/workflows/test.yml` — runs `npm test` and `npm run test:coverage` on push/PR to `main`.

---

## Git Workflow

This project uses a Claude worktree branch (`claude/eloquent-mirzakhani-9f55c3`) that pushes directly to `main`:

```bash
git status                                              # see what changed
git add <file> [<file>...]                              # stage specific files
git commit -m "short description"                       # create commit
git push origin claude/eloquent-mirzakhani-9f55c3:main # push to GitHub main
```

**Rules:**
- Never `git push` without explicit user approval.
- Never amend published commits — always create a new commit.
- Never use `--no-verify` or `--force` unless explicitly instructed.
