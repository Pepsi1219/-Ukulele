# Ukulele Studio

Web-based ukulele lesson player: audio playback synced to lyrics, chord diagrams, notation staff, and ukulele tab. No-bundler single-page app; static files + Firestore for editable lesson data.

## Quick start

```bash
npm install
npm test                 # unit tests (vitest, ~3s)

# Serve locally
npx serve .              # then open http://localhost:3000
```

Open `index.html` in a browser to run — there is no build step.

## Features

- **4 view modes** per lesson: 5-line staff notation, ukulele tab (4-string reentrant tuning), staff + tab combined, Letter Note Notation reference PNG
- **Playback** — MP3 (song / vocal-only), A/B loop, speed control 0.25×–2×, preserve-pitch, metronome (8 sound options), Lottie animated character
- **Teacher editor** — author lyrics timing, chord timeline, notation + per-note tab fingering; saves straight to Firestore
- **Mobile-first** — collapsible chord/lyrics panels, Spotify-style floating mini-player, fullscreen lyrics overlay, PWA-installable

## Docs

- **[CLAUDE.md](CLAUDE.md)** — full architecture reference (data model, state fields, module pipeline, UI components, workflow rules)
- **[AGENTS.md](AGENTS.md)** — condensed agent-friendly overview
- **[FIREBASE_SETUP.md](FIREBASE_SETUP.md)** — one-time Firebase project setup + teacher-allowlist workflow

## Stack

- Vanilla ES modules — no framework, no bundler
- Firebase Web SDK v10 (Firestore + Auth) via gstatic CDN imports
- Howler.js (audio), Tone.js (metronome), Lottie (character animation)
- vitest for unit tests over `src/utils/**`
