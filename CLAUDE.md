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

**`script.js`** is the entire application controller (~4000+ lines). It owns all DOM wiring, event handlers, and a single `state` object that holds all runtime state (selected song, playback position, metronome, editor state, etc.). It imports from `src/utils/` and `src/firebase/`.

**`src/firebase/`** — Firebase backend layer (Web SDK v10 via gstatic CDN ESM imports, matching the no-bundler setup). Firestore only — no Storage bucket (avoids requiring the Blaze billing plan):

| File | Purpose |
|---|---|
| `firebase-config.js` | Project config (user fills from Firebase console) |
| `firebase.js` | App bootstrap — exports `db`, `auth` singletons |
| `songStore.js` | `fetchSongData(id)`, `saveSongData(id, kind, json)` |
| `authStore.js` | Google Sign-In + teacher allowlist check (`admins/{uid}` doc) |
| `practiceLogStore.js` | `logSession()`, `fetchAllSessions()`, `prunePracticeLog()`, `clearAllSessions()` |

**Firestore data model:** only the editable payloads live in Firestore, at `songs/{id}/data/{lyrics|chords|notation}` as `{ json: "<stringified>" }` — JSON strings keep byte-exact fidelity with the original file format and sidestep Firestore nested-array limits. Song identity/metadata (`id`, `title`, `mp3`, `bpm`) stays in the local `manifest.json`, and audio/images stay in the local `songs/`, `vocal/`, `Letter Note Notation/` folders, served as static files exactly as before — `loadSongs()` fetches `manifest.json` locally, then fetches each song's lyrics/chords/notation from Firestore by id.

**Auth:** students read without signing in; editing requires Google Sign-In plus an `admins/{uid}` allowlist doc (see `firestore.rules`, deployed by hand via console). The Editor button, the editor's "บันทึกขึ้น Cloud" save button, and the Practice History button are all visible only to teachers.

**Entry Gate:** `#entryGate` is a full-screen overlay shown before `#appShell` (which starts `hidden`) on every page load. Design: dark `#080c14` background with concentric amber ring animations (`.gate-rings` > `.gate-ring` ×4), a guitar icon + tracked wordmark (`.gate-brand`), and two CTA buttons (`.gate-ctas`): **เข้าใช้งาน** (`#entryStudentBtn`, `.gate-cta-primary` — `handleGateStudentEntry()`, no auth) and **ล็อกอินครู** (`#entryTeacherBtn`, `.gate-cta-secondary` + Google icon — `handleGateTeacherLogin()`). The gate does not gate reading; it's just a landing/choice screen. `applyAuthState()` auto-dismisses it whenever `isTeacher` resolves true — this also covers a returning teacher with a persisted Firebase session (no re-login needed), since `observeAuth()` fires on every page load regardless of the gate. Status messages use `#entryGateStatus` (`.gate-status`) — default color is muted, `.is-err` class makes it red for errors; the element uses `[hidden]` with `display: none !important` override to prevent author-CSS conflicts. The student button is always available as a fallback. Escape key also dismisses it (same as every other overlay in the app). A **กลับไปหน้าแรก** (house icon) button in the main app header (`#backToGateBtn` → `showEntryGate()`) reopens it from within the app — the inverse of `dismissEntryGate()`.

**Sign-out:** the gate is the *only* auth control in the app — there is no login/logout button in the main app header anymore (removed; login already happens on the gate). `#entrySignOutBtn` (`.gate-signout`) on the gate shows whenever `state.authUser` is set (via `applyAuthState()`) — it displays "ออกจากระบบ — `<email>`" where the email lives in `#entrySignOutEmail`. Clicking calls `handleGateSignOut()` → `signOutTeacher()`. To sign out, a teacher must go back to the gate first (`#backToGateBtn`). Note: `.gate-signout[hidden]` requires `display: none !important` to prevent author CSS from overriding the `[hidden]` UA rule.

**`state.studentModeOverride`:** set `true` by `handleGateStudentEntry()`. Firebase auth sessions persist across reloads, so a teacher who previously logged in would otherwise still see teacher-only controls (Editor, Save-to-Cloud, Practice History) even after explicitly choosing "เข้าใช้งาน". `updateTeacherOnlyVisibility()` computes `showTeacherUI = state.isTeacher && !state.studentModeOverride` and is the single place that toggles those controls — called from `applyAuthState()` and directly from the gate handlers so the override takes effect immediately without waiting for an auth event. Cleared back to `false` only by an explicit teacher-mode choice: `handleGateTeacherLogin()`.

**Practice Log:** a single shared, class-wide log at `practiceLog/{autoId}` — not per-student (students never sign in). Any visitor can log a session (`allow create` is open but shape-validated in `firestore.rules`); only teachers can read, prune, or clear it. Retention runs client-side, opportunistically, each time a teacher opens the History panel (no Cloud Function — this project intentionally stays off the Blaze plan): sessions older than `RETENTION_DAYS` (90) are deleted, and if the collection ever exceeds `MAX_DOCS` (2000) it's wiped entirely rather than trimmed incrementally. See `src/firebase/practiceLogStore.js`.

**Setup / migration:** see `FIREBASE_SETUP.md`. The one-time migration script is `scripts/migrate-to-firebase.mjs` (firebase-admin + service account key; key files are git-ignored) — it uploads `Lyrics/`, `Chords/`, `Notation/` content to Firestore only; it never touches audio/image files.

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

- `manifest.json` — song index (local, unchanged); each entry has `id`, `title`, `mp3`, `bpm`
- **Lyrics** (`songs/{id}/data/lyrics` in Firestore) — array of timed entries, each either `{ section: "name" }` or `{ time: number, line: [{ chord?, lyric }] }`
- **Chords** (`songs/{id}/data/chords` in Firestore) — optional explicit chord timeline `[{ time, chord }]`; when absent, chords are derived from the first chord-bearing segment of each lyrics line
- **Notation** (`songs/{id}/data/notation` in Firestore) — optional melody staff notation (see format below)
- `Letter Note Notation/<id>.png` — static reference image of a lesson's melody (used when no notation data exists), local
- `songs/<id>.mp3` — full-mix audio, local
- `vocal/<id>.mp3` — vocal-only audio (mirrors `songs/` filenames), local
- `animation/` — Lottie JSON files for the dancing character, local

The local `Lyrics/`, `Chords/`, `Notation/` folders remain in the repo only as the migration source for `scripts/migrate-to-firebase.mjs` — the app itself reads lyrics/chords/notation from Firestore, not these folders.

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

**Easiest authoring path:** Editor → **โน้ต** tab → configure + add notes (live staff preview) → **บันทึกขึ้น Cloud** (writes straight to Firestore; teacher login required). Copy JSON remains available as a manual export.

---

## Key UI State & Components

Notable `state` fields and their current behaviour — check these before editing related UI:

| Field | Type | Notes |
|---|---|---|
| `state.metroSoundId` | `string` | `"wood"` \| `"kick"` \| `"hihat"` \| `"bell"` \| `"clap"` \| `"rim"` \| `"cowbell"` \| `"clave"` (8 options). Sound selector is a `<select>` dropdown (`#metroSoundSelect`) next to the toggle button — not chips. |
| `state.chordDiagramRotation` | `0\|90\|180\|270` | Default is `90` (head pointing right / horizontal). Applied as `rot-90` class on `#chordDiagram`. Initialised in `initApp()`. |
| `state.notePickMode` | `"auto"` \| `"G"\|"C"\|"E"\|"A"` \| `string[]` | Array mode enables multi-string selection. `resolveStrings(mode)` in `chordDiagram.js` normalises all formats to `string[]`. |
| `state.speed` | `number` | Controlled by a gear button (`#speedGearBtn`) in the A/B loop row (right side). Opens a YouTube-style modal (`#speedModal`) with a range slider, −/+ buttons, and preset chips (1.0–2.0). |
| `state.lyricsFontScale` | `number` | Multiplier (0.75–3.0, 9-step ladder) for lyrics text size — shared by the normal panel and the fullscreen overlay. **A−**/**A+** buttons appear in both headers; either one calls `adjustLyricsFontScale()`, which sets the `--lyrics-font-scale` CSS variable on `document.documentElement` so both `#lyricsContainer` and `#lyricsFullscreenContainer` pick it up. |
| `state.editorActiveLyricIdx` | `number` | Playback-position highlight for the Lyrics tab of the timestamp editor (`.editor-row-line.playing`) — mirrors the existing chord-tab highlight (`state.editorActiveChordIdx`). Driven by `updateLyricsEditorAutoScroll()` each RAF tick. |

**Notation config modal (`#ntConfigModal` / `.ntcfg-modal-overlay`):** Fixed overlay, `z-index: 450`. Opened by `#ntConfigOpenBtn` (⚙ ตั้งค่า) in the notation tab header. Contains clef, key, time signature, measures-per-row, and pickup-beats fields — changes apply live (preview updates on each `change` event). Save (`#ntConfigSaveBtn`) just closes; Cancel (`#ntConfigCancelBtn`) / Escape / backdrop click reverts `state.notationConfig` to the snapshot taken at open. `wireNotationConfigControls()` wires everything. On mobile (≤ 760px): bottom sheet; on desktop (≥ 761px): centered dialog.

**Fullscreen lyrics overlay (`#lyricsFullscreen` / `.lyrics-fs`):** Fixed overlay, `z-index: 300`, background `#090d18`. Structure: `.lyrics-fs-body` (flex column, fills space) → `.lyrics-fs-header` (glassmorphism, shows `#lyricsFsHeaderTitle` song title + action buttons) → `.lyrics-fs-main` (flex row: chord column + lyrics container) → `.lyrics-fs-player` (glassmorphism player bar at bottom). Chord column (`.lyrics-fs-chord-col`) is `clamp(280px, 28vw, 420px)` — responsive, scales with viewport. Chord badge inside is `clamp(160px, 20vw, 260px)`. Diagram SVG is `clamp(160px, 18vw, 240px)`. Player transport buttons: 36px/46px (secondary/primary). Progress bar in `.lyrics-fs-player-timeline` is overridden to 3px height with amber fill. Active-state button highlights use `var(--accent)` amber (not blue). `syncFsPlayer()` populates both `dom.lyricsFsPlayerTitle` (in player bar) and `dom.lyricsFsHeaderTitle` (in header) with the current song title. A-B loop markers (`dom.lyricsFsLoopMarkerA`, `dom.lyricsFsLoopMarkerB`, `dom.lyricsFsLoopRegion`) mirror the main timeline markers — both sets are updated together by `updateLoopMarkers()`.

**Dancing character (Lottie):** Lives in `.header-brand` inside `<header>`, absolutely positioned to the right of the h1 so it doesn't affect header height. No toggle button — always visible. Controlled by `initLottieDancer()` / `swapLottie()` in `script.js`.

**Layout:** `.panel` (the 3 main cards) uses a **fixed** `height: 720px` on desktop (not `min-height`) so every song's panel is the same size regardless of lyrics/notation length — long content scrolls inside `.lyrics-container` (`overflow-y: auto`) instead of growing the card. Both mobile breakpoints reset this to `height: auto` for natural single-column stacking, and the mobile `.lyrics-container` gets its own smaller `max-height: 480px` cap (the desktop 760px cap is too tall to matter on a phone viewport). `.app-shell` caps overall page width at `min(1800px, 100%)`.

---

## XSS / innerHTML Safety

`script.js` contains an `escHtml(str)` helper (defined just before `renderHistoryPanel()`). Use it whenever inserting Firestore-sourced strings into `innerHTML`. Do **not** interpolate raw Firestore values directly into HTML template literals — song titles and section names are user-controlled.

```js
// Safe
el.innerHTML = `<span>${escHtml(entry.songTitle)}</span>`;
// Unsafe — XSS vector
el.innerHTML = `<span>${entry.songTitle}</span>`;
```

Prefer `textContent` or DOM creation (`document.createElement` + `.textContent`) over `innerHTML` when the content is plain text with no markup — `makeChordSectionDivider()` uses this pattern for section names.

---

## Common CSS Pitfall — `[hidden]` Override

Any author CSS that sets `display` on an element will silently override the browser UA rule `[hidden] { display: none }`, making the element always visible and un-hideable via the `hidden` attribute. Pattern seen on: `.icon-btn`, `.gate-signout`, `.gate-status`.

**Fix:** wherever an element uses both a CSS class with an explicit `display` value AND the `hidden` attribute, add:
```css
.my-class[hidden] { display: none !important; }
```
Do this proactively whenever writing CSS that sets `display: block/flex/inline-flex` on elements that may also receive `hidden`.

---

## Adding a Song

1. Add an entry to `manifest.json` with a unique `id` (slug format, e.g. `artist-song-title`).
2. Place `songs/<id>.mp3` (and `vocal/<id>.mp3` if available) in the matching local folders; for lesson songs also place `Letter Note Notation/<id>.png`.
3. In the app (teacher login) open the Editor to author lyrics/chords/notation and press **บันทึกขึ้น Cloud** — or write `songs/{id}/data/{kind}` docs (`{ json: "<stringified payload>" }`) directly in the Firestore console.

---

## Adding / Editing Notation for a Lesson

1. Open the app, log in as a teacher, and select the lesson song.
2. Click the **Editor** button → switch to the **โน้ต** tab.
3. Press **⚙ ตั้งค่า** to open the config modal — set clef, key, time signature, measures per row, pickup beats. Preview updates live as you change values. Press **บันทึก** to confirm or ✕/Escape to revert.
4. Press **+ เพิ่มโน้ต** to add notes one by one (pitch + duration). The staff preview updates live.
5. To sync highlights with audio: play the song and press **Stamp & Next** on each note at the right moment.
6. Click **บันทึกขึ้น Cloud** to save straight to Firestore.

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
