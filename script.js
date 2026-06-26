// ── Utility imports (pure functions — also used by unit tests) ──────────────
import { formatTime }               from "./src/utils/formatTime.js";
import { createUUID }               from "./src/utils/createUUID.js";
import { buildChordsFromLyrics,
         findCurrentTimedIndex }    from "./src/utils/chordEngine.js";
import { buildSong }                from "./src/utils/songBuilder.js";
import { getMp3PathFor as _getMp3 } from "./src/utils/playerUtils.js";
import { getNotationImagePath }     from "./src/utils/notationImage.js";
import { parseNotation,
         chordsToNotation }         from "./src/utils/notationModel.js";
import { renderStaff }              from "./src/utils/staffRenderer.js";
import { getChordData,
         renderChordDiagramSVG,
         renderNoteDiagramSVG,
         getRootNoteName,
         pickNotePosition }         from "./src/utils/chordDiagram.js";
import { findSectionBounds,
         normalizeABRange,
         shouldSeekBack,
         calcLoopMarkerPercents }   from "./src/utils/loopEngine.js";
import { STRUM_PATTERNS,
         getPatternById,
         calcCurrentBeat }         from "./src/utils/strumEngine.js";
import { buildEditorRows,
         applyStamp,
         shiftTime,
         exportToLyricsJson,
         countStamped,
         updateSegment,
         addSegment,
         removeSegment,
         insertLineRow,
         removeRow,
         insertSectionRow,
         updateSectionName }       from "./src/utils/timestampEditor.js";
import { toggleFavoriteId,
         filterFavorites,
         addSession,
         aggregateBySong,
         recentSessions,
         totalSecInDays,
         formatLogDuration }        from "./src/utils/practiceLog.js";
import { buildChordRows,
         applyChordStamp,
         shiftChordTime,
         updateChordName,
         insertChordRow,
         removeChordRow,
         exportToChordJson,
         countChordStamped,
         importChordsFromLyrics,
         buildLyricContext,
         findLyricContextAt }      from "./src/utils/chordEditor.js";
import { buildNotationConfig,
         buildNoteRows,
         buildNotationTimeline,
         updateNoteField,
         stampNoteTime,
         shiftNoteTime,
         insertNoteRow,
         removeNoteRow,
         updateConfigField,
         countNotationStamped,
         countNotationStampable,
         findNextNotationFocusIndex,
         exportToNotationJson,
         computeMeasureMap }       from "./src/utils/notationEditor.js";

/* =========================
   Metronome Sound Definitions
========================= */
const METRO_SOUNDS = [
  { id: "wood",  label: "Wood" },
  { id: "kick",  label: "Kick" },
  { id: "hihat", label: "Hi-Hat" },
  { id: "bell",  label: "Bell" },
];

/* =========================
   State
========================= */
const MANIFEST_JSON_PATH = "manifest.json";
const LYRICS_DIR   = "Lyrics";
const CHORDS_DIR   = "Chords";
const NOTATION_DIR = "Notation";

const fallbackSongs = {
  songs: [
    {
      id: "176e8a9b-1234-5678-9abc-def012345678",
      title: "Ukulele Practice Demo",
      mp3: "songs/demo.mp3",
      bpm: 100,
      lyrics: [
        { time: 0,  line: [{ chord: "C",  lyric: "ค่อย ๆ ฟังเสียงและเปลี่ยนคอร์ดให้ทัน" }] },
        { time: 5,  line: [{ chord: "G",  lyric: "รักษาจังหวะมือขวาให้สม่ำเสมอ" }] },
        { time: 10, line: [{ chord: "Am", lyric: "ซ้อมช้า ๆ ก่อน " }, { chord: "F", lyric: "แล้วค่อยเพิ่มความเร็ว" }] }
      ]
    }
  ]
};

const state = {
  songs: [],
  selectedSong: null,
  sound: null,
  isPlaying: false,
  duration: 0,
  speed: 1,
  currentLyricIndex: -1,
  currentChordIndex: -1,
  rafId: null,
  metronomeOn: false,
  metroSoundId: "wood",    // current metronome sound: wood | kick | hihat | bell
  metroLoop: null,
  metroSynth: null,
  userScrolling: false,
  userScrollTimer: null,
  audioMode: null,        // "song" | "vocal" | null — must be set before audio loads
  autoScrollEnabled: true,// master toggle for lyric auto-scroll
  dancerEnabled: true,    // master toggle for dancing character visibility
  panelsSwapped: false,   // false: Chord centre, Lyrics right | true: Lyrics centre, Chord right
  lottieIdle: null,       // Lottie instance — idle/relax animation
  lottiePlaying: null,    // Lottie instance — playing/wave-sound animation
  strumPatternId: "island", // currently selected strumming pattern id
  editorOpen:      false,   // true when Timestamp Editor is visible
  editorTab:            "lyrics",// "lyrics" | "chords" | "notation"
  editorRows:           [],      // current lyrics editor row objects
  editorFocusIdx:       -1,      // focused lyrics row index (-1 = none)
  chordRows:            [],      // current chord editor row objects
  chordFocusIdx:        -1,      // focused chord row index (-1 = none)
  notationRows:         [],      // current notation editor note rows
  notationConfig:       null,    // current notation editor config object
  notationFocusIdx:     -1,      // focused notation row index (-1 = none)
  notationPlayheadIdx:  -1,      // playback-highlighted notation row index (-1 = none)
  notationTimeline:     [],      // sorted playback times for the active notation rows
  editorBannerLyricIdx: -1,      // cached lyric-row index shown in banner
  chordAutoScroll:      true,    // auto-scroll chord list to active row while playing
  editorActiveChordIdx: -1,      // last chord row index highlighted by auto-scroll
  chordDiagramRotation: 0,       // 0 | 90 | 180 | 270 — current diagram rotation
  chordDiagramMode: "chord",     // "chord" | "note" — full chord shape vs single-note picking view (not persisted)
  notePickMode: "auto",          // "G" | "C" | "E" | "A" | "auto" — which string(s) to use in note-picking mode
  notePickPosition: null,        // { stringIdx, fret } — last shown note position (drives "auto" hand-position memory)
  lyricsFullscreen: false,       // true when lyrics are displayed in fullscreen overlay
  lyricsFsSwapped: false,        // true = chord column on right side in fullscreen
  activeStaffNoteIdx: -1,        // data-idx of the highlighted note in the SVG staff (-1 = none)
  staffNoteTimes: [],            // [{time, idx}] for the current staff — drives highlight sync
  notationMode: "interactive",   // "interactive" | "image" — toggle in renderLyricsEmptyState
  // ── Favorites ──
  favorites:       new Set(),   // Set of song IDs marked as favorites
  favFilterOn:     false,       // true = show only favorite songs in dropdown
  // ── Practice Log ──
  practiceLog:         [],      // array of { songId, songTitle, date, durationSec }
  practiceSessionStart: null,   // Date.now() when play started (null if paused/stopped)
  practiceSessionSec:   0,      // accumulated seconds for the current session
  loop: {
    mode: null,           // null | "ab" | "section"
    sectionLabel: null,   // section name when mode="section"
    startTime: null,      // loop start in seconds
    endTime: null,        // loop end in seconds (null = last section, use duration)
    aMarked: false,       // true when A point is set but B not yet confirmed
  }
};

/* =========================
   DOM References
========================= */
const dom = {
  loadStatus:        document.getElementById("loadStatus"),
  songSelect:        document.getElementById("songSelect"),
  currentSongTitle:  document.getElementById("currentSongTitle"),
  playPauseBtn:      document.getElementById("playPauseBtn"),
  stopBtn:           document.getElementById("stopBtn"),
  seekBackBtn:       document.getElementById("seekBackBtn"),
  seekFwdBtn:        document.getElementById("seekFwdBtn"),
  prevSongBtn:       document.getElementById("prevSongBtn"),
  nextSongBtn:       document.getElementById("nextSongBtn"),
  audioModeToggle:   document.getElementById("audioModeToggle"),
  currentTime:       document.getElementById("currentTime"),
  durationTime:      document.getElementById("durationTime"),
  progressTrack:     document.getElementById("progressTrack"),
  progressFill:      document.getElementById("progressFill"),
  progressThumb:     document.getElementById("progressThumb"),
  speedButtons:      document.getElementById("speedButtons"),
  bpmSlider:         document.getElementById("bpmSlider"),
  bpmValue:          document.getElementById("bpmValue"),
  metroToggleBtn:    document.getElementById("metroToggleBtn"),
  metroVisual:       document.getElementById("metroVisual"),
  metroSoundBtns:    document.getElementById("metroSoundBtns"),
  chordDisplay:      document.getElementById("chordDisplay"),
  chordDiagram:      document.getElementById("chordDiagram"),
  currentChordLabel: document.getElementById("currentChordLabel"),
  lyricsContainer:   document.getElementById("lyricsContainer"),

  // Theme
  themeToggleBtn: document.getElementById("themeToggleBtn"),
  themeIcon:      document.getElementById("themeIcon"),

  // Auto-scroll toggle
  autoScrollToggle: document.getElementById("autoScrollToggle"),

  // Dance character + its toggle
  danceCharWrap:   document.getElementById("danceCharWrap"),
  dancerToggleBtn: document.getElementById("dancerToggleBtn"),
  lottieIdleEl:    document.getElementById("lottieIdle"),
  lottiePlayingEl: document.getElementById("lottiePlaying"),

  // Layout swap (Chord ↔ Lyrics)
  swapPanelsBtn:   document.getElementById("swapPanelsBtn"),
  mainGrid:        document.querySelector(".main-grid"),

  // Timestamp / Chord Editor
  editorTabLyrics:    document.getElementById("editorTabLyrics"),
  editorTabChords:    document.getElementById("editorTabChords"),
  editorTabNotation:  document.getElementById("editorTabNotation"),
  editorNotationConfig: document.getElementById("editorNotationConfig"),
  ntClef:             document.getElementById("ntClef"),
  ntKey:              document.getElementById("ntKey"),
  ntTimeSig:          document.getElementById("ntTimeSig"),
  ntMeasPerRow:       document.getElementById("ntMeasPerRow"),
  ntPickup:           document.getElementById("ntPickup"),
  ntAddNoteBtn:       document.getElementById("ntAddNoteBtn"),
  ntPreview:          document.getElementById("ntPreview"),
  ntSummaryMeasure:   document.getElementById("ntSummaryMeasure"),
  ntSummaryRemaining: document.getElementById("ntSummaryRemaining"),
  editorImportBtn:     document.getElementById("editorImportBtn"),
  editorLyricBanner:   document.getElementById("editorLyricBanner"),
  chordAutoScrollBtn:  document.getElementById("chordAutoScrollBtn"),
  diagramOrientBtn:    document.getElementById("diagramOrientBtn"),
  diagramModeBtn:      document.getElementById("diagramModeBtn"),
  notePickModeTrigger:      document.getElementById("notePickModeTrigger"),
  notePickModeTriggerLabel: document.getElementById("notePickModeTriggerLabel"),
  notePickSheet:            document.getElementById("notePickSheet"),
  notePickSheetBackdrop:    document.getElementById("notePickSheetBackdrop"),
  notePickSheetOptions:     document.getElementById("notePickSheetOptions"),
  // Favorites + History
  favoriteBtn:    document.getElementById("favoriteBtn"),
  favoriteIcon:   document.getElementById("favoriteIcon"),
  favFilterBtn:   document.getElementById("favFilterBtn"),
  historyBtn:     document.getElementById("historyBtn"),
  historyPanel:   document.getElementById("historyPanel"),
  historyContent: document.getElementById("historyContent"),
  historyCloseBtn:document.getElementById("historyCloseBtn"),
  historyClearBtn:document.getElementById("historyClearBtn"),
  editorToggleBtn:    document.getElementById("editorToggleBtn"),
  editorPanel:        document.getElementById("editorPanel"),
  editorCloseBtn:     document.getElementById("editorCloseBtn"),
  editorSongTitle:    document.getElementById("editorSongTitle"),
  editorNowPlaying:   document.getElementById("editorNowPlaying"),
  editorStampCount:   document.getElementById("editorStampCount"),
  editorExportBtn:    document.getElementById("editorExportBtn"),
  editorLinesList:    document.getElementById("editorLinesList"),
  editorPlayPauseBtn: document.getElementById("editorPlayPauseBtn"),
  editorStopBtn:      document.getElementById("editorStopBtn"),
  editorSeekBackBtn:  document.getElementById("editorSeekBackBtn"),
  editorSeekFwdBtn:   document.getElementById("editorSeekFwdBtn"),
  editorCurrentTime:  document.getElementById("editorCurrentTime"),
  editorDurationTime: document.getElementById("editorDurationTime"),
  editorProgressTrack:document.getElementById("editorProgressTrack"),
  editorProgressFill: document.getElementById("editorProgressFill"),

  // Lyrics Fullscreen
  notationToggleBtn:         document.getElementById("notationToggleBtn"),
  lyricsExpandBtn:           document.getElementById("lyricsExpandBtn"),
  lyricsFullscreen:          document.getElementById("lyricsFullscreen"),
  lyricsFullscreenContainer: document.getElementById("lyricsFullscreenContainer"),
  lyricsCollapseBtn:         document.getElementById("lyricsCollapseBtn"),
  lyricsFullscreenAutoScroll:document.getElementById("lyricsFullscreenAutoScroll"),
  lyricsFsMain:              document.getElementById("lyricsFsMain"),
  lyricsFsSwapBtn:           document.getElementById("lyricsFsSwapBtn"),
  lyricsFsChordLabel:        document.getElementById("lyricsFsChordLabel"),
  lyricsFsChordDisplay:      document.getElementById("lyricsFsChordDisplay"),
  lyricsFsChordDiagram:      document.getElementById("lyricsFsChordDiagram"),
  lyricsFsDiagramModeBtn:    document.getElementById("lyricsFsDiagramModeBtn"),
  lyricsFsDiagramOrientBtn:  document.getElementById("lyricsFsDiagramOrientBtn"),
  lyricsFsNotePickTrigger:   document.getElementById("lyricsFsNotePickTrigger"),
  lyricsFsNotePickLabel:     document.getElementById("lyricsFsNotePickLabel"),
  lyricsFsPlayerTitle:       document.getElementById("lyricsFsPlayerTitle"),
  lyricsFsPlayPause:         document.getElementById("lyricsFsPlayPause"),
  lyricsFsPrev:              document.getElementById("lyricsFsPrev"),
  lyricsFsNext:              document.getElementById("lyricsFsNext"),
  lyricsFsStop:              document.getElementById("lyricsFsStop"),
  lyricsFsSeekBack:          document.getElementById("lyricsFsSeekBack"),
  lyricsFsSeekFwd:           document.getElementById("lyricsFsSeekFwd"),
  lyricsFsProgressTrack:     document.getElementById("lyricsFsProgressTrack"),
  lyricsFsProgressFill:      document.getElementById("lyricsFsProgressFill"),
  lyricsFsProgressThumb:     document.getElementById("lyricsFsProgressThumb"),
  lyricsFsCurrentTime:       document.getElementById("lyricsFsCurrentTime"),
  lyricsFsDurationTime:      document.getElementById("lyricsFsDurationTime"),

  // Strumming Pattern Panel (overlay)
  strumBtn:          document.getElementById("strumBtn"),
  strumPanel:        document.getElementById("strumPanel"),
  strumCloseBtn:     document.getElementById("strumCloseBtn"),
  strumPatternBtns:  document.getElementById("strumPatternBtns"),
  strumBeats:        document.getElementById("strumBeats"),

  // Loop controls
  loopABtn:        document.getElementById("loopABtn"),
  loopBBtn:        document.getElementById("loopBBtn"),
  loopClearBtn:    document.getElementById("loopClearBtn"),
  loopStatusText:  document.getElementById("loopStatusText"),
  loopMarkerA:     document.getElementById("loopMarkerA"),
  loopMarkerB:     document.getElementById("loopMarkerB"),
  loopRegion:      document.getElementById("loopRegion"),
};

/* =========================
   Utility Functions
========================= */
// formatTime, createUUID, buildSong, buildChordsFromLyrics,
// findCurrentTimedIndex — all imported from src/utils/ at the top of this file.

// Update the load-status indicator light (green/red/yellow dot in section-title)
// state: "loading" | "success" | "error"
function setLoadStatus(state, label) {
  if (!dom.loadStatus) return;
  dom.loadStatus.className = `load-light load-light--${state}`;
  dom.loadStatus.title = label;
  dom.loadStatus.setAttribute("aria-label", label);
}



/* =========================
   Timestamp Editor
========================= */

/** Formats seconds as "MM:SS.d" (one decimal) for the timestamp badges. */
function formatEditorTime(seconds) {
  if (!isFinite(seconds) || seconds < 0) return "00:00.0";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${s.toFixed(1).padStart(4, "0")}`;
}

/** Opens the editor for the currently selected song. */
function openEditor() {
  if (!state.selectedSong || !state.duration) return;
  state.editorOpen     = true;
  state.editorTab      = "lyrics";
  state.editorRows     = buildEditorRows(state.selectedSong.lyrics ?? []);
  state.editorFocusIdx = -1;
  state.chordRows      = buildChordRows(state.selectedSong.chords ?? []);
  state.chordFocusIdx  = -1;
  state.notationRows   = buildNoteRows(state.selectedSong.notation);
  state.notationConfig = buildNotationConfig(state.selectedSong.notation);
  state.notationFocusIdx = -1;

  if (dom.editorSongTitle)    dom.editorSongTitle.textContent    = state.selectedSong.title;
  if (dom.editorDurationTime) dom.editorDurationTime.textContent = formatTime(state.duration);

  // Activate lyrics tab by default
  switchEditorTab("lyrics");
  updateEditorPlayPauseIcon();

  const t = state.sound ? (Number(state.sound.seek()) || 0) : 0;
  updateEditorProgress(t);
  updateNotationNowPlaying(t);
  updateNotationSummary(t);

  if (dom.editorPanel) dom.editorPanel.hidden = false;
  if (dom.mainGrid)    dom.mainGrid.hidden    = true;
}

/** Switches between the "lyrics", "chords" and "notation" editor tabs. */
function switchEditorTab(tab) {
  state.editorTab              = tab;
  state.editorBannerLyricIdx   = -1;  // reset banner cache on every tab switch
  state.editorActiveChordIdx   = -1;  // force highlight re-apply after tab switch

  if (dom.editorTabLyrics)   dom.editorTabLyrics.classList.toggle("active", tab === "lyrics");
  if (dom.editorTabChords)   dom.editorTabChords.classList.toggle("active", tab === "chords");
  if (dom.editorTabNotation) dom.editorTabNotation.classList.toggle("active", tab === "notation");

  // Show/hide per-tab controls
  const onChords   = tab === "chords";
  const onNotation = tab === "notation";
  if (dom.editorImportBtn)       dom.editorImportBtn.hidden       = !onChords;
  if (dom.editorLyricBanner)     dom.editorLyricBanner.hidden     = !onChords;
  if (dom.editorNotationConfig)  dom.editorNotationConfig.hidden  = !onNotation;

  if (tab === "lyrics") {
    state.editorFocusIdx = -1;
    renderEditorLines();
  } else if (tab === "notation") {
    state.notationFocusIdx = -1;
    syncNotationConfigControls();
    renderNotationRows();
    renderNotationPreview();
    updateNotationNowPlaying(getCurrentPlaybackSeconds());
    updateNotationSummary(getCurrentPlaybackSeconds());
  } else {
    state.chordFocusIdx = -1;
    renderChordRows();
    // Immediately populate banner for current playback position
    const t = state.sound ? (Number(state.sound.seek()) || 0) : 0;
    updateEditorLyricBanner(t);
  }
  updateEditorStampCount();
}

/** Closes the editor and returns to the normal view. */
function closeEditor() {
  state.editorOpen = false;
  if (dom.editorPanel) dom.editorPanel.hidden = true;
  if (dom.mainGrid)    dom.mainGrid.hidden    = false;
}

// Detect whether the browser supports field-sizing:content natively.
// If not, we fall back to measuring scrollWidth manually.
const _supportsFieldSizing = CSS.supports("field-sizing", "content");

/**
 * Sizes an <input> to exactly fit its current content.
 * This is a no-op when the browser already handles it via field-sizing:content.
 */
function autoResizeInput(input) {
  if (_supportsFieldSizing) return;          // CSS handles it — nothing to do
  input.style.width = "1px";                 // collapse so scrollWidth = natural content width
  input.style.width = input.scrollWidth + "px";
}

/** Re-renders the editor lines list and resets focus (used after structural changes). */
function reRenderEditorLines() {
  state.editorFocusIdx = -1;
  renderEditorLines();
  updateEditorStampCount();
}

/** Creates a delete-row button for the row at `rowIdx`. */
function makeDelRowBtn(rowIdx) {
  const btn     = document.createElement("button");
  btn.type      = "button";
  btn.className = "editor-del-row-btn icon-btn";
  btn.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
  btn.title     = "ลบบรรทัดนี้";
  btn.addEventListener("click", e => {
    e.stopPropagation();
    state.editorRows = removeRow(state.editorRows, rowIdx);
    reRenderEditorLines();
  });
  return btn;
}

/** Creates an insert-row divider (appears between/before rows with add buttons). */
function makeInsertDivider(afterIdx) {
  const div     = document.createElement("div");
  div.className = "editor-row-divider";

  const addLineBtn     = document.createElement("button");
  addLineBtn.type      = "button";
  addLineBtn.className = "editor-insert-btn";
  addLineBtn.innerHTML = `<i class="fa-solid fa-plus"></i> บรรทัด`;
  addLineBtn.title     = "เพิ่มบรรทัดเนื้อเพลง";
  addLineBtn.addEventListener("click", e => {
    e.stopPropagation();
    state.editorRows = insertLineRow(state.editorRows, afterIdx);
    reRenderEditorLines();
    // Auto-focus the new row's first lyric input
    setTimeout(() => {
      const newIdx = afterIdx + 1;
      const newEl  = dom.editorLinesList.querySelector(`[data-row-index="${newIdx}"] .editor-lyric-input`);
      if (newEl) newEl.focus();
    }, 30);
  });
  div.appendChild(addLineBtn);

  const addSecBtn     = document.createElement("button");
  addSecBtn.type      = "button";
  addSecBtn.className = "editor-insert-btn editor-insert-sec-btn";
  addSecBtn.innerHTML = `<i class="fa-solid fa-layer-group"></i> Section`;
  addSecBtn.title     = "เพิ่ม Section header";
  addSecBtn.addEventListener("click", e => {
    e.stopPropagation();
    state.editorRows = insertSectionRow(state.editorRows, afterIdx, "");
    reRenderEditorLines();
    // Auto-focus the new section name input
    setTimeout(() => {
      const newIdx = afterIdx + 1;
      const newEl  = dom.editorLinesList.querySelector(`[data-row-index="${newIdx}"] .editor-section-input`);
      if (newEl) newEl.focus();
    }, 30);
  });
  div.appendChild(addSecBtn);

  return div;
}

/** Builds and inserts all row elements into the editor lines list. */
function renderEditorLines() {
  if (!dom.editorLinesList) return;
  dom.editorLinesList.innerHTML = "";

  // Top insert divider (before index 0)
  dom.editorLinesList.appendChild(makeInsertDivider(-1));

  state.editorRows.forEach((row, i) => {
    const el = document.createElement("div");
    el.dataset.rowIndex = String(i);

    if (row.type === "section") {
      // ── Section row (now editable) ─────────────────────────────────────
      el.className = "editor-row editor-row-section";

      const nameInput       = document.createElement("input");
      nameInput.type        = "text";
      nameInput.className   = "editor-section-input";
      nameInput.value       = row.sectionName;
      nameInput.placeholder = "ชื่อ Section…";
      nameInput.title       = "แก้ไขชื่อ Section";
      nameInput.addEventListener("input", () => {
        state.editorRows = updateSectionName(state.editorRows, i, nameInput.value);
      });
      el.appendChild(nameInput);

      el.appendChild(makeDelRowBtn(i));

    } else {
      // ── Line row (fully editable) ──────────────────────────────────────
      el.className = "editor-row editor-row-line";
      el.tabIndex  = 0;

      // Time badge + fine-tune buttons
      const timeDiv   = document.createElement("div");
      timeDiv.className = "editor-row-time";

      const badge     = document.createElement("span");
      badge.className = `editor-time-badge ${row.time !== null ? "stamped" : "unstamped"}`;
      badge.textContent = row.time !== null ? formatEditorTime(row.time) : "--:--";
      timeDiv.appendChild(badge);

      const fineBtns  = document.createElement("div");
      fineBtns.className = "editor-fine-btns";
      [-0.1, 0.1].forEach(delta => {
        const btn       = document.createElement("button");
        btn.type        = "button";
        btn.className   = "editor-fine-btn";
        btn.textContent = delta < 0 ? "−" : "+";
        btn.title       = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}s`;
        btn.dataset.rowIndex = String(i);
        btn.dataset.delta    = String(delta);
        btn.addEventListener("click", e => {
          e.stopPropagation();
          const idx = Number(btn.dataset.rowIndex);
          state.editorRows = shiftTime(state.editorRows, idx, Number(btn.dataset.delta));
          refreshEditorRowBadge(idx);
          updateEditorStampCount();
        });
        fineBtns.appendChild(btn);
      });
      timeDiv.appendChild(fineBtns);
      el.appendChild(timeDiv);

      // Content: editable segments
      const content   = document.createElement("div");
      content.className = "editor-row-content";

      (row.originalLine || []).forEach((seg, si) => {
        const segEl       = document.createElement("div");
        segEl.className   = "editor-seg editor-seg-editable";

        // ── Chord row: input + optional remove-segment button ──
        const chordRow    = document.createElement("div");
        chordRow.className = "editor-seg-chord-row";

        const chordInput       = document.createElement("input");
        chordInput.type        = "text";
        chordInput.className   = "editor-chord-input";
        chordInput.value       = seg.chord ?? "";
        chordInput.placeholder = "–";
        chordInput.title       = "คอร์ด (ว่างไว้ได้ถ้าไม่มีคอร์ด)";
        chordInput.addEventListener("input", () => {
          state.editorRows = updateSegment(state.editorRows, i, si, { chord: chordInput.value });
          autoResizeInput(chordInput);
        });
        autoResizeInput(chordInput);   // initial size
        chordRow.appendChild(chordInput);

        // Remove-segment button (only visible when >1 segment in the line)
        if (row.originalLine.length > 1) {
          const rmBtn     = document.createElement("button");
          rmBtn.type      = "button";
          rmBtn.className = "editor-rm-seg-btn";
          rmBtn.innerHTML = `<i class="fa-solid fa-xmark"></i>`;
          rmBtn.title     = "ลบ segment นี้";
          rmBtn.addEventListener("click", e => {
            e.stopPropagation();
            state.editorRows = removeSegment(state.editorRows, i, si);
            reRenderEditorLines();
          });
          chordRow.appendChild(rmBtn);
        }
        segEl.appendChild(chordRow);

        // ── Lyric input ──
        const lyricInput       = document.createElement("input");
        lyricInput.type        = "text";
        lyricInput.className   = "editor-lyric-input";
        lyricInput.value       = seg.lyric ?? "";
        lyricInput.placeholder = "เนื้อเพลง…";
        lyricInput.addEventListener("input", () => {
          state.editorRows = updateSegment(state.editorRows, i, si, { lyric: lyricInput.value });
          autoResizeInput(lyricInput);
        });
        autoResizeInput(lyricInput);   // initial size
        segEl.appendChild(lyricInput);
        content.appendChild(segEl);
      });

      // ── Add-segment button ──
      const addSegBtn     = document.createElement("button");
      addSegBtn.type      = "button";
      addSegBtn.className = "editor-add-seg-btn chip";
      addSegBtn.innerHTML = `<i class="fa-solid fa-plus"></i>`;
      addSegBtn.title     = "เพิ่ม segment (คอร์ด + เนื้อ)";
      addSegBtn.addEventListener("click", e => {
        e.stopPropagation();
        state.editorRows = addSegment(state.editorRows, i);
        reRenderEditorLines();
        // Focus the new chord input in the added segment
        setTimeout(() => {
          const rowEl  = dom.editorLinesList.querySelector(`[data-row-index="${i}"]`);
          const inputs = rowEl ? rowEl.querySelectorAll(".editor-chord-input") : [];
          if (inputs.length) inputs[inputs.length - 1].focus();
        }, 30);
      });
      content.appendChild(addSegBtn);

      el.appendChild(content);

      // Stamp button
      const stampBtn       = document.createElement("button");
      stampBtn.type        = "button";
      stampBtn.className   = "editor-stamp-btn chip";
      stampBtn.innerHTML   = `<i class="fa-solid fa-clock"></i> Stamp`;
      stampBtn.dataset.rowIndex = String(i);
      stampBtn.addEventListener("click", e => {
        e.stopPropagation();
        editorStampRow(Number(stampBtn.dataset.rowIndex));
      });
      el.appendChild(stampBtn);

      // Delete-row button
      el.appendChild(makeDelRowBtn(i));

      // Click row body to focus (skip when clicking inside an input or button)
      el.addEventListener("click", ev => {
        if (ev.target.closest("input, button")) return;
        editorFocusRow(i);
      });
    }

    dom.editorLinesList.appendChild(el);
    // Insert divider after each row
    dom.editorLinesList.appendChild(makeInsertDivider(i));
  });
}

/** Moves focus (visual highlight) to a line row at `rowIdx`. */
function editorFocusRow(rowIdx) {
  if (rowIdx < 0 || rowIdx >= state.editorRows.length) return;
  if (state.editorRows[rowIdx].type !== "line") return;

  state.editorFocusIdx = rowIdx;

  dom.editorLinesList.querySelectorAll(".editor-row-line.focused").forEach(el => {
    el.classList.remove("focused");
  });
  const el = dom.editorLinesList.querySelector(`.editor-row-line[data-row-index="${rowIdx}"]`);
  if (el) {
    el.classList.add("focused");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/**
 * Stamps the current playback time onto the row at `rowIdx`,
 * then auto-advances focus to the next line row.
 */
function editorStampRow(rowIdx) {
  if (!state.sound) return;
  const t = Number(state.sound.seek()) || 0;
  state.editorRows = applyStamp(state.editorRows, rowIdx, t);
  refreshEditorRowBadge(rowIdx);
  updateEditorStampCount();

  // Auto-advance to next line row
  const nextIdx = state.editorRows.findIndex((r, i) => i > rowIdx && r.type === "line");
  if (nextIdx !== -1) editorFocusRow(nextIdx);
}

/** Refreshes the time badge of a single row without re-rendering the full list. */
function refreshEditorRowBadge(rowIdx) {
  const row = state.editorRows[rowIdx];
  if (!row) return;
  const el = dom.editorLinesList.querySelector(`.editor-row-line[data-row-index="${rowIdx}"]`);
  if (!el) return;
  const badge = el.querySelector(".editor-time-badge");
  if (!badge) return;
  const hasTime = row.time !== null;
  badge.className   = `editor-time-badge ${hasTime ? "stamped" : "unstamped"}`;
  badge.textContent = hasTime ? formatEditorTime(row.time) : "--:--";
}

/* =========================
   Import from Lyrics + Live Banner
========================= */

/**
 * Imports chord entries from the current lyrics editor rows and populates
 * the chord editor. Warns when existing chord data would be overwritten.
 */
function handleEditorImport() {
  if (!state.editorRows.length) {
    alert("ไม่มีข้อมูลเนื้อร้อง — กรุณาสลับไปแท็บเนื้อเพลงแล้วเพิ่มข้อมูลก่อน");
    return;
  }

  const imported = importChordsFromLyrics(state.editorRows);

  if (!imported.length) {
    alert("ไม่พบคอร์ดในเนื้อร้อง — กรุณาใส่คอร์ดในช่องคอร์ดของแท็บเนื้อเพลงก่อน");
    return;
  }

  const unstamped = imported.filter(e => e.time === 0).length;
  const hasOld    = state.chordRows.length > 0;

  let msg = `พบ ${imported.length} คอร์ดจากเนื้อร้อง`;
  if (unstamped > 0)  msg += `\n(${unstamped} คอร์ดยังไม่มีเวลา จะใช้ 0:00 ไว้ก่อน)`;
  if (hasOld)         msg += `\n\n⚠️ ข้อมูลคอร์ดเดิม (${state.chordRows.length} รายการ) จะถูกแทนที่`;
  msg += "\n\nดำเนินการต่อ?";

  if (!confirm(msg)) return;

  state.chordRows = buildChordRows(imported);
  reRenderChordRows();

  // Brief success feedback on the button
  if (dom.editorImportBtn) {
    dom.editorImportBtn.innerHTML = `<i class="fa-solid fa-check"></i> นำเข้า ${imported.length} คอร์ดแล้ว`;
    setTimeout(() => {
      if (dom.editorImportBtn)
        dom.editorImportBtn.innerHTML = `<i class="fa-solid fa-file-import"></i> นำเข้าจากเนื้อร้อง`;
    }, 3000);
  }
}

/**
 * Updates the live lyric banner shown above the chord list.
 * Reads `state.editorRows` to find the lyric line at `currentSeconds`.
 * Skips re-rendering when the active line hasn't changed (cached by index).
 *
 * @param {number} currentSeconds  current playback position
 */
function updateEditorLyricBanner(currentSeconds) {
  if (!dom.editorLyricBanner || dom.editorLyricBanner.hidden) return;

  // Find index of the last lyric-line row whose time ≤ currentSeconds
  const lineRows = state.editorRows.filter(r => r.type === "line" && r.time !== null);
  let activeIdx  = -1;
  for (let i = 0; i < lineRows.length; i++) {
    if (lineRows[i].time <= currentSeconds) activeIdx = i;
    else break;
  }

  // Only re-render when the active line actually changes
  if (activeIdx === state.editorBannerLyricIdx) return;
  state.editorBannerLyricIdx = activeIdx;

  // Update only the dynamic content zone — never touch .editor-banner-actions
  const contentEl = dom.editorLyricBanner.querySelector(".editor-banner-content");
  if (!contentEl) return;
  contentEl.innerHTML = "";

  const label       = document.createElement("span");
  label.className   = "banner-label";
  label.textContent = "เนื้อร้อง";
  contentEl.appendChild(label);

  if (activeIdx < 0) {
    const hint       = document.createElement("span");
    hint.className   = "banner-hint";
    hint.textContent = "—";
    contentEl.appendChild(hint);
    return;
  }

  const row  = lineRows[activeIdx];
  const segs = row.originalLine || [];

  // Chord names (deduplicated, preserving order)
  const seen   = new Set();
  const chords = segs
    .map(s => (s.chord || "").trim())
    .filter(c => c && !seen.has(c) && seen.add(c));

  if (chords.length) {
    const chordEl       = document.createElement("span");
    chordEl.className   = "banner-chord";
    chordEl.textContent = chords.join(" / ");
    contentEl.appendChild(chordEl);
  }

  // Lyric text
  const lyricText = segs.map(s => s.lyric ?? "").join("").trim();
  if (lyricText) {
    const lyricEl       = document.createElement("span");
    lyricEl.className   = "banner-lyric";
    lyricEl.textContent = lyricText;
    contentEl.appendChild(lyricEl);
  }
}

/** Toggles chord-editor auto-scroll on/off and syncs button appearance. */
function applyChordAutoScroll(enabled) {
  state.chordAutoScroll = !!enabled;
  if (dom.chordAutoScrollBtn) {
    dom.chordAutoScrollBtn.classList.toggle("is-on",  state.chordAutoScroll);
    dom.chordAutoScrollBtn.classList.toggle("is-off", !state.chordAutoScroll);
    dom.chordAutoScrollBtn.setAttribute("aria-pressed", String(state.chordAutoScroll));
  }
}

/**
 * Called every RAF tick (via updateEditorProgress).
 * Finds the chord row whose time is ≤ currentSeconds, highlights it,
 * and scrolls it into view when auto-scroll is enabled.
 */
function updateChordAutoScroll(currentSeconds) {
  if (!state.editorOpen || state.editorTab !== "chords") return;
  if (!dom.editorLinesList) return;

  // Find active chord index (last row with time ≤ currentSeconds)
  let activeIdx = -1;
  for (let i = 0; i < state.chordRows.length; i++) {
    const { time } = state.chordRows[i];
    if (time !== null && time <= currentSeconds) activeIdx = i;
  }

  // Update highlight regardless of auto-scroll setting
  if (activeIdx !== state.editorActiveChordIdx) {
    // Remove old highlight
    const prev = dom.editorLinesList.querySelector(".editor-chord-row.playing");
    if (prev) prev.classList.remove("playing");

    state.editorActiveChordIdx = activeIdx;

    // Apply new highlight
    if (activeIdx >= 0) {
      const el = dom.editorLinesList.querySelector(
        `.editor-chord-row[data-chord-index="${activeIdx}"]`
      );
      if (el) {
        el.classList.add("playing");
        if (state.chordAutoScroll) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
        }
      }
    }
  }
}

/* =========================
   Chord Editor Tab
========================= */

/** Re-renders chord rows and resets focus (used after structural changes). */
function reRenderChordRows() {
  state.chordFocusIdx      = -1;
  state.editorActiveChordIdx = -1;  // force highlight re-apply after render
  renderChordRows();
  updateEditorStampCount();
}

/** Creates a delete button for the chord row at `idx`. */
function makeChordDelBtn(idx) {
  const btn     = document.createElement("button");
  btn.type      = "button";
  btn.className = "editor-del-row-btn icon-btn";
  btn.innerHTML = `<i class="fa-solid fa-trash-can"></i>`;
  btn.title     = "ลบคอร์ดนี้";
  btn.addEventListener("click", e => {
    e.stopPropagation();
    state.chordRows = removeChordRow(state.chordRows, idx);
    reRenderChordRows();
  });
  return btn;
}

/** Creates an insert divider with a "+ คอร์ด" button. */
function makeChordInsertDivider(afterIdx) {
  const div     = document.createElement("div");
  div.className = "editor-row-divider";

  const addBtn     = document.createElement("button");
  addBtn.type      = "button";
  addBtn.className = "editor-insert-btn";
  addBtn.innerHTML = `<i class="fa-solid fa-plus"></i> คอร์ด`;
  addBtn.title     = "เพิ่มคอร์ดใหม่";
  addBtn.addEventListener("click", e => {
    e.stopPropagation();
    state.chordRows = insertChordRow(state.chordRows, afterIdx);
    reRenderChordRows();
    setTimeout(() => {
      const newIdx = afterIdx + 1;
      const newEl  = dom.editorLinesList.querySelector(
        `[data-chord-index="${newIdx}"] .editor-chname-input`
      );
      if (newEl) newEl.focus();
    }, 30);
  });
  div.appendChild(addBtn);
  return div;
}

/** Creates a visual-only section header divider for the chord tab. */
function makeChordSectionDivider(name) {
  const el = document.createElement("div");
  el.className = "editor-chord-section";
  el.innerHTML =
    `<span class="chord-sec-line"></span>` +
    `<i class="fa-solid fa-music"></i>` +
    `<span class="chord-sec-name">${name || "(section)"}</span>` +
    `<span class="chord-sec-line"></span>`;
  return el;
}

/** Builds and inserts all chord row elements into the editor lines list. */
function renderChordRows() {
  if (!dom.editorLinesList) return;
  dom.editorLinesList.innerHTML = "";

  // Top insert divider
  dom.editorLinesList.appendChild(makeChordInsertDivider(-1));

  if (!state.chordRows.length) {
    const empty     = document.createElement("p");
    empty.className = "empty-state";
    empty.style.padding = "24px";
    empty.textContent   = "ยังไม่มีข้อมูลคอร์ด — กด + คอร์ด เพื่อเริ่มเพิ่ม";
    dom.editorLinesList.appendChild(empty);
    return;
  }

  // Build lyric context once for section dividers + hints
  const lyricCtx   = buildLyricContext(state.editorRows);
  let   lastSection = undefined;  // undefined = "haven't passed any stamped chord yet"

  state.chordRows.forEach((row, i) => {
    // ── Find lyric context for this chord (only when stamped) ──────────────
    const ctx = row.time !== null ? findLyricContextAt(lyricCtx, row.time) : null;

    // ── Section divider — inject when entering a new named section ──────────
    if (ctx !== null && ctx.sectionName !== null && ctx.sectionName !== lastSection) {
      lastSection = ctx.sectionName;
      dom.editorLinesList.appendChild(makeChordSectionDivider(ctx.sectionName));
    }

    const el      = document.createElement("div");
    el.className  = "editor-row editor-chord-row";
    el.dataset.chordIndex = String(i);
    el.tabIndex   = 0;

    // Time area (same pattern as lyrics rows)
    const timeDiv   = document.createElement("div");
    timeDiv.className = "editor-row-time";

    const badge     = document.createElement("span");
    badge.className = `editor-time-badge ${row.time !== null ? "stamped" : "unstamped"}`;
    badge.textContent = row.time !== null ? formatEditorTime(row.time) : "--:--";
    timeDiv.appendChild(badge);

    const fineBtns  = document.createElement("div");
    fineBtns.className = "editor-fine-btns";
    [-0.1, 0.1].forEach(delta => {
      const btn       = document.createElement("button");
      btn.type        = "button";
      btn.className   = "editor-fine-btn";
      btn.textContent = delta < 0 ? "−" : "+";
      btn.title       = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}s`;
      btn.addEventListener("click", e => {
        e.stopPropagation();
        state.chordRows = shiftChordTime(state.chordRows, i, delta);
        refreshChordRowBadge(i);
        updateEditorStampCount();
      });
      fineBtns.appendChild(btn);
    });
    timeDiv.appendChild(fineBtns);
    el.appendChild(timeDiv);

    // Chord name input (prominent — this IS the main content)
    const chordInput       = document.createElement("input");
    chordInput.type        = "text";
    chordInput.className   = "editor-chname-input";
    chordInput.value       = row.chord;
    chordInput.placeholder = "คอร์ด…";
    chordInput.title       = "ชื่อคอร์ด เช่น Am, G7, Cmaj7/E";
    chordInput.addEventListener("input", () => {
      state.chordRows = updateChordName(state.chordRows, i, chordInput.value);
      autoResizeInput(chordInput);
    });
    autoResizeInput(chordInput);
    el.appendChild(chordInput);

    // Stamp button
    const stampBtn       = document.createElement("button");
    stampBtn.type        = "button";
    stampBtn.className   = "editor-stamp-btn chip";
    stampBtn.innerHTML   = `<i class="fa-solid fa-clock"></i> Stamp`;
    stampBtn.addEventListener("click", e => {
      e.stopPropagation();
      chordStampRow(i);
    });
    el.appendChild(stampBtn);

    // Delete button
    el.appendChild(makeChordDelBtn(i));

    // Click to focus
    el.addEventListener("click", ev => {
      if (ev.target.closest("input, button")) return;
      chordFocusRow(i);
    });

    dom.editorLinesList.appendChild(el);

    // ── Lyric hint — show matching lyric text under the chord row ──────────
    if (ctx && ctx.lyricText) {
      const hint     = document.createElement("div");
      hint.className = "editor-chord-lyric-hint";
      hint.textContent = `↳ ${ctx.lyricText}`;
      dom.editorLinesList.appendChild(hint);
    }

    dom.editorLinesList.appendChild(makeChordInsertDivider(i));
  });
}

/** Sets focus highlight on chord row at `idx`. */
function chordFocusRow(idx) {
  if (idx < 0 || idx >= state.chordRows.length) return;
  state.chordFocusIdx = idx;

  dom.editorLinesList.querySelectorAll(".editor-chord-row.focused").forEach(el => {
    el.classList.remove("focused");
  });
  const el = dom.editorLinesList.querySelector(`.editor-chord-row[data-chord-index="${idx}"]`);
  if (el) {
    el.classList.add("focused");
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }
}

/** Stamps current playback time on chord row `idx`, then advances focus. */
function chordStampRow(idx) {
  if (!state.sound) return;
  const t = Number(state.sound.seek()) || 0;
  state.chordRows = applyChordStamp(state.chordRows, idx, t);
  refreshChordRowBadge(idx);
  updateEditorStampCount();
  if (idx < state.chordRows.length - 1) chordFocusRow(idx + 1);
}

/** Refreshes the time badge of a single chord row in-place. */
function refreshChordRowBadge(idx) {
  const row = state.chordRows[idx];
  if (!row) return;
  const el = dom.editorLinesList.querySelector(`.editor-chord-row[data-chord-index="${idx}"]`);
  if (!el) return;
  const badge = el.querySelector(".editor-time-badge");
  if (!badge) return;
  const hasTime = row.time !== null;
  badge.className   = `editor-time-badge ${hasTime ? "stamped" : "unstamped"}`;
  badge.textContent = hasTime ? formatEditorTime(row.time) : "--:--";
}

/* =========================
   Notation Editor (โน้ต tab)
========================= */

/** Duration options offered in each note row's dropdown. */
const DUR_OPTIONS = [
  { value: "whole",      label: "โน้ตกลม (4)" },
  { value: "half",       label: "ขาว (2)" },
  { value: "quarter",    label: "ดำ (1)" },
  { value: "eighth",     label: "เขบ็ต 1 ชั้น (½)" },
  { value: "sixteenth",  label: "เขบ็ต 2 ชั้น (¼)" },
  { value: "half.",      label: "ขาวประจุด (3)" },
  { value: "quarter.",   label: "ดำประจุด (1½)" },
  { value: "eighth.",    label: "เขบ็ตประจุด (¾)" },
];

/** Sets the config controls to match state.notationConfig. */
function syncNotationConfigControls() {
  const c = state.notationConfig;
  if (!c) return;
  if (dom.ntClef)       dom.ntClef.value       = c.clef;
  if (dom.ntKey)        dom.ntKey.value        = c.key;
  if (dom.ntTimeSig)    dom.ntTimeSig.value    = `${c.timeSignature[0]}/${c.timeSignature[1]}`;
  if (dom.ntMeasPerRow) dom.ntMeasPerRow.value = c.measuresPerRow;
  if (dom.ntPickup)     dom.ntPickup.value     = c.pickupBeats;
}

/** Re-renders the live staff preview from the current config + note rows. */
function renderNotationPreview() {
  if (!dom.ntPreview) return;
  const hasNotes = state.notationRows.some(r => String(r.pitch).trim());
  if (!hasNotes) {
    dom.ntPreview.innerHTML = `<p class="ntcfg-preview-hint">เพิ่มโน้ตเพื่อดูตัวอย่าง…</p>`;
    state.notationTimeline = [];
    state.notationPlayheadIdx = -1;
    updateNotationSummary(getCurrentPlaybackSeconds());
    return;
  }
  const model = parseNotation({ config: state.notationConfig, notes: state.notationRows });
  state.notationTimeline = buildNotationTimeline(state.notationRows);
  dom.ntPreview.innerHTML = renderStaff(model);
  syncNotationPlaybackHighlight(getCurrentPlaybackSeconds(), true);
  updateNotationNowPlaying(getCurrentPlaybackSeconds());
  updateNotationSummary(getCurrentPlaybackSeconds());
}

/** Returns the current playback position in seconds, or 0 when idle. */
function getCurrentPlaybackSeconds() {
  return state.sound ? (Number(state.sound.seek()) || 0) : 0;
}

/**
 * Updates the notation editor's playback highlight using the cached timeline.
 * When `force` is true, the DOM classes are refreshed even if the active row
 * did not change (useful after a re-render).
 */
function syncNotationPlaybackHighlight(currentSeconds, force = false) {
  if (!state.editorOpen || state.editorTab !== "notation") return;

  const timeline = state.notationTimeline || [];
  if (!timeline.length) {
    applyNotationPlaybackHighlight(-1);
    state.notationPlayheadIdx = -1;
    return;
  }

  const pos = findCurrentTimedIndex(timeline, currentSeconds);
  const noteIdx = pos >= 0 ? timeline[pos].idx : -1;
  if (!force && noteIdx === state.notationPlayheadIdx) return;

  state.notationPlayheadIdx = noteIdx;
  applyNotationPlaybackHighlight(noteIdx);

  if (noteIdx >= 0 && state.isPlaying && shouldAutoFollowNotationPlayhead()) {
    notationFocusRow(noteIdx);
  }
}

/** Applies the active playback highlight to the notation row list and preview. */
function applyNotationPlaybackHighlight(idx) {
  if (dom.editorLinesList) {
    dom.editorLinesList.querySelectorAll(".editor-notation-row.playing").forEach(el => {
      el.classList.remove("playing");
    });

    if (idx >= 0) {
      const el = dom.editorLinesList.querySelector(`.editor-notation-row[data-notation-index="${idx}"]`);
      if (el) {
        el.classList.add("playing");
        if (state.isPlaying && !state.userScrolling) {
          el.scrollIntoView({ block: "nearest", behavior: "smooth" });
        }
      }
    }
  }

  _applyStaffHighlight(dom.ntPreview, idx);
  updateNotationNowPlaying(getCurrentPlaybackSeconds());
  updateNotationSummary(getCurrentPlaybackSeconds());
}

/** Returns true when playback can safely auto-follow the active notation row. */
function shouldAutoFollowNotationPlayhead() {
  const active = document.activeElement;
  if (!active) return true;
  if (active.closest?.(".editor-notation-row")) return false;
  if (active.closest?.(".editor-notation-config")) return false;
  return true;
}

/**
 * Updates the topbar label that tells the user which notation row is active.
 */
function updateNotationNowPlaying(currentSeconds) {
  if (!dom.editorNowPlaying) return;
  if (state.editorTab !== "notation") {
    dom.editorNowPlaying.textContent = "Now playing: —";
    return;
  }

  const timeline = state.notationTimeline || [];
  const pos = findCurrentTimedIndex(timeline, currentSeconds);
  if (pos < 0) {
    dom.editorNowPlaying.textContent = "Now playing: —";
    return;
  }

  const row = state.notationRows[timeline[pos].idx];
  if (!row) {
    dom.editorNowPlaying.textContent = "Now playing: —";
    return;
  }

  const pitch = String(row.pitch || "").trim() || "—";
  const dur = String(row.dur || "").trim();
  dom.editorNowPlaying.textContent = dur
    ? `Now playing: ${pitch} • ${dur}`
    : `Now playing: ${pitch}`;
}

/** Updates the small summary bar in the Notation tab. */
function updateNotationSummary(currentSeconds = getCurrentPlaybackSeconds()) {
  if (!dom.ntSummaryMeasure || !dom.ntSummaryRemaining) return;
  if (state.editorTab !== "notation") return;

  const { pending } = countNotationStampable(state.notationRows);
  dom.ntSummaryRemaining.textContent = `${pending} unstamped`;

  const timeline = state.notationTimeline || [];
  const pos = findCurrentTimedIndex(timeline, currentSeconds);
  const activeIdx = pos >= 0 ? timeline[pos].idx : state.notationFocusIdx;
  if (activeIdx < 0) {
    dom.ntSummaryMeasure.textContent = "Measure —";
    return;
  }

  const mmap = computeMeasureMap(state.notationRows, state.notationConfig.timeSignature);
  const active = mmap[activeIdx];
  dom.ntSummaryMeasure.textContent = active ? `Measure ${active.measureIndex + 1}` : "Measure —";
}

/** Insert-a-note divider shown between/around note rows. */
function makeNotationInsertDivider(afterIdx) {
  const div     = document.createElement("div");
  div.className = "editor-row-divider";

  const addBtn     = document.createElement("button");
  addBtn.type      = "button";
  addBtn.className = "editor-insert-btn";
  addBtn.innerHTML = `<i class="fa-solid fa-plus"></i> โน้ต`;
  addBtn.title     = "เพิ่มโน้ตใหม่";
  addBtn.addEventListener("click", e => {
    e.stopPropagation();
    state.notationRows = insertNoteRow(state.notationRows, afterIdx);
    reRenderNotationRows();
    setTimeout(() => {
      const newEl = dom.editorLinesList.querySelector(
        `[data-notation-index="${afterIdx + 1}"] .editor-pitch-input`
      );
      if (newEl) newEl.focus();
    }, 30);
  });
  div.appendChild(addBtn);
  return div;
}

/** Builds and inserts all note row elements into the editor lines list. */
function renderNotationRows() {
  if (!dom.editorLinesList) return;
  dom.editorLinesList.innerHTML = "";
  dom.editorLinesList.appendChild(makeNotationInsertDivider(-1));

  if (!state.notationRows.length) {
    const empty       = document.createElement("p");
    empty.className   = "empty-state";
    empty.style.padding = "24px";
    empty.textContent = "ยังไม่มีโน้ต — กด + โน้ต เพื่อเริ่มเพิ่ม";
    dom.editorLinesList.appendChild(empty);
    return;
  }

  // Running-beat map → drives the "measure complete" dividers + overflow flags.
  const mmap = computeMeasureMap(state.notationRows, state.notationConfig.timeSignature);

  state.notationRows.forEach((row, i) => {
    const el = document.createElement("div");
    el.className = "editor-row editor-notation-row";
    el.dataset.notationIndex = String(i);
    el.tabIndex = 0;
    if (mmap[i] && mmap[i].overflowsBar) el.classList.add("overflow");

    // Time badge + fine-tune buttons
    const timeDiv = document.createElement("div");
    timeDiv.className = "editor-row-time";

    const badge = document.createElement("span");
    badge.className = `editor-time-badge ${row.time !== null ? "stamped" : "unstamped"}`;
    badge.textContent = row.time !== null ? formatEditorTime(row.time) : "--:--";
    timeDiv.appendChild(badge);

    const fineBtns = document.createElement("div");
    fineBtns.className = "editor-fine-btns";
    [-0.1, 0.1].forEach(delta => {
      const btn       = document.createElement("button");
      btn.type        = "button";
      btn.className   = "editor-fine-btn";
      btn.textContent = delta < 0 ? "−" : "+";
      btn.title       = `${delta > 0 ? "+" : ""}${delta.toFixed(1)}s`;
      btn.addEventListener("click", e => {
        e.stopPropagation();
        state.notationRows = shiftNoteTime(state.notationRows, i, delta);
        state.notationTimeline = buildNotationTimeline(state.notationRows);
        refreshNotationRowBadge(i);
        updateEditorStampCount();
        syncNotationPlaybackHighlight(getCurrentPlaybackSeconds(), true);
      });
      fineBtns.appendChild(btn);
    });
    timeDiv.appendChild(fineBtns);
    el.appendChild(timeDiv);

    // Pitch input (e.g. A4, F#4, rest)
    const pitchInput       = document.createElement("input");
    pitchInput.type        = "text";
    pitchInput.className    = "editor-pitch-input";
    pitchInput.value        = row.pitch;
    pitchInput.placeholder  = "A4";
    pitchInput.title        = "ระดับเสียง เช่น A4, F#4, Bb3 หรือ rest";
    pitchInput.addEventListener("input", () => {
      state.notationRows = updateNoteField(state.notationRows, i, { pitch: pitchInput.value });
      renderNotationPreview();
    });
    el.appendChild(pitchInput);

    // Duration dropdown
    const durSelect      = document.createElement("select");
    durSelect.className  = "editor-dur-select";
    durSelect.title      = "ค่าความยาวโน้ต";
    DUR_OPTIONS.forEach(opt => {
      const o = document.createElement("option");
      o.value = opt.value;
      o.textContent = opt.label;
      durSelect.appendChild(o);
    });
    durSelect.value = row.dur;
    durSelect.addEventListener("change", () => {
      state.notationRows = updateNoteField(state.notationRows, i, { dur: durSelect.value });
      reRenderNotationRows();   // re-flow measure dividers as the rhythm changes
    });
    el.appendChild(durSelect);

    // Stamp button
    const stampBtn     = document.createElement("button");
    stampBtn.type      = "button";
    stampBtn.className  = "editor-stamp-btn chip";
    stampBtn.innerHTML = `<i class="fa-solid fa-clock"></i> Stamp &amp; Next`;
    stampBtn.addEventListener("click", e => {
      e.stopPropagation();
      notationStampRow(i, true);
    });
    el.appendChild(stampBtn);

    // Delete button
    const delBtn     = document.createElement("button");
    delBtn.type      = "button";
    delBtn.className  = "editor-del-btn";
    delBtn.innerHTML = `<i class="fa-solid fa-trash"></i>`;
    delBtn.title     = "ลบโน้ตนี้";
    delBtn.addEventListener("click", e => {
      e.stopPropagation();
      state.notationRows = removeNoteRow(state.notationRows, i);
      reRenderNotationRows();
    });
    el.appendChild(delBtn);

    el.addEventListener("click", ev => {
      if (ev.target.closest("input, button, select")) return;
      notationFocusRow(i);
    });

    dom.editorLinesList.appendChild(el);
    if (mmap[i] && mmap[i].completesMeasure) {
      dom.editorLinesList.appendChild(makeMeasureCompleteDivider(mmap[i].measureIndex + 1));
    }
    dom.editorLinesList.appendChild(makeNotationInsertDivider(i));
  });
}

/** A "measure complete" bar-line divider shown after a note that fills a measure. */
function makeMeasureCompleteDivider(measureNum) {
  const div = document.createElement("div");
  div.className = "editor-measure-divider";
  div.innerHTML =
    `<span class="emd-line"></span>` +
    `<span class="emd-label"><i class="fa-solid fa-grip-lines-vertical"></i> จบห้องที่ ${measureNum}</span>` +
    `<span class="emd-line"></span>`;
  return div;
}

/** Sets focus highlight on note row at `idx`. */
function notationFocusRow(idx) {
  if (idx < 0 || idx >= state.notationRows.length) return;
  state.notationFocusIdx = idx;
  dom.editorLinesList.querySelectorAll(".editor-notation-row.focused").forEach(el => {
    el.classList.remove("focused");
  });
  const el = dom.editorLinesList.querySelector(`.editor-notation-row[data-notation-index="${idx}"]`);
  if (el) {
    el.classList.add("focused");
    el.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }
}

/** Stamps the focused note row with the current playback time. */
function notationStampRow(idx, advanceToNext = true) {
  if (!state.sound) return;
  const t = Number(state.sound.seek()) || 0;
  state.notationRows = stampNoteTime(state.notationRows, idx, t);
  state.notationTimeline = buildNotationTimeline(state.notationRows);
  refreshNotationRowBadge(idx);
  updateEditorStampCount();
  syncNotationPlaybackHighlight(t, true);
  updateNotationNowPlaying(t);
  updateNotationSummary(t);
  if (advanceToNext) {
    const nextIdx = findNextNotationFocusIndex(state.notationRows, idx);
    if (nextIdx >= 0) notationFocusRow(nextIdx);
  }
}

/** Refreshes a single note row's time badge in-place. */
function refreshNotationRowBadge(idx) {
  const row = state.notationRows[idx];
  if (!row) return;
  const el = dom.editorLinesList.querySelector(`.editor-notation-row[data-notation-index="${idx}"]`);
  if (!el) return;
  const badge = el.querySelector(".editor-time-badge");
  if (!badge) return;
  const hasTime = row.time !== null;
  badge.className   = `editor-time-badge ${hasTime ? "stamped" : "unstamped"}`;
  badge.textContent = hasTime ? formatEditorTime(row.time) : "--:--";
}

/** Re-renders note rows after a structural change and refreshes the preview. */
function reRenderNotationRows() {
  state.notationFocusIdx = -1;
  renderNotationRows();
  renderNotationPreview();
  updateEditorStampCount();
  updateNotationSummary(getCurrentPlaybackSeconds());
}

/** Applies a config patch and refreshes the live preview. */
function applyNotationConfig(patch) {
  state.notationConfig = updateConfigField(state.notationConfig, patch);
  renderNotationPreview();
  updateNotationSummary(getCurrentPlaybackSeconds());
}

/** Wires the notation config controls + add-note button (once, at init). */
function wireNotationConfigControls() {
  if (dom.ntClef)    dom.ntClef.addEventListener("change", () => applyNotationConfig({ clef: dom.ntClef.value }));
  if (dom.ntKey)     dom.ntKey.addEventListener("change", () => applyNotationConfig({ key: dom.ntKey.value }));
  if (dom.ntTimeSig) dom.ntTimeSig.addEventListener("change", () => {
    const [n, d] = dom.ntTimeSig.value.split("/").map(Number);
    state.notationConfig = updateConfigField(state.notationConfig, { timeSignature: [n, d] });
    reRenderNotationRows();   // measure dividers depend on the time signature
  });
  if (dom.ntMeasPerRow) dom.ntMeasPerRow.addEventListener("change", () =>
    applyNotationConfig({ measuresPerRow: Number(dom.ntMeasPerRow.value) }));
  if (dom.ntPickup) dom.ntPickup.addEventListener("change", () =>
    applyNotationConfig({ pickupBeats: Number(dom.ntPickup.value) }));

  if (dom.ntAddNoteBtn) dom.ntAddNoteBtn.addEventListener("click", () => {
    state.notationRows = insertNoteRow(state.notationRows, state.notationRows.length - 1);
    reRenderNotationRows();
    setTimeout(() => {
      const rows = dom.editorLinesList.querySelectorAll(".editor-pitch-input");
      const last = rows[rows.length - 1];
      if (last) last.focus();
    }, 30);
  });
}

/** Updates the stamp-count badge in the topbar (tab-aware). */
function updateEditorStampCount() {
  if (!dom.editorStampCount) return;
  let stamped, total, unit;
  if (state.editorTab === "chords") {
    ({ stamped, total } = countChordStamped(state.chordRows));
    unit = "คอร์ด";
  } else if (state.editorTab === "notation") {
    ({ stamped, total } = countNotationStamped(state.notationRows));
    unit = "โน้ต";
  } else {
    ({ stamped, total } = countStamped(state.editorRows));
    unit = "บรรทัด";
  }
  dom.editorStampCount.textContent = `${stamped} / ${total} ${unit}`;
  dom.editorStampCount.classList.toggle("all-done", stamped === total && total > 0);
}

/** Updates the editor's mini progress bar and time display. */
function updateEditorProgress(currentSeconds) {
  if (!state.editorOpen) return;
  const duration = state.duration || 0;
  const percent  = duration > 0 ? Math.min((currentSeconds / duration) * 100, 100) : 0;
  if (dom.editorCurrentTime)  dom.editorCurrentTime.textContent  = formatTime(currentSeconds);
  if (dom.editorProgressFill) dom.editorProgressFill.style.width = `${percent}%`;
  updateEditorLyricBanner(currentSeconds);
  updateChordAutoScroll(currentSeconds);
  if (state.editorTab === "notation") {
    syncNotationPlaybackHighlight(currentSeconds);
  }
}

/** Syncs the editor play/pause button icon with current playback state. */
function updateEditorPlayPauseIcon() {
  if (!dom.editorPlayPauseBtn) return;
  dom.editorPlayPauseBtn.innerHTML =
    `<i class="fa-solid ${state.isPlaying ? "fa-pause" : "fa-play"}"></i>`;
}

/** Copies the active tab's data as JSON to the clipboard. */
function handleEditorExport() {
  let rows, json, stamped, total, unit;
  if (state.editorTab === "chords") {
    rows = state.chordRows;
    json = exportToChordJson(state.chordRows);
    ({ stamped, total } = countChordStamped(state.chordRows));
    unit = "คอร์ด";
  } else if (state.editorTab === "notation") {
    rows = state.notationRows;
    json = exportToNotationJson(state.notationConfig, state.notationRows);
    ({ stamped, total } = countNotationStamped(state.notationRows));
    unit = "โน้ต";
  } else {
    rows = state.editorRows;
    json = exportToLyricsJson(state.editorRows);
    ({ stamped, total } = countStamped(state.editorRows));
    unit = "บรรทัด";
  }
  if (!rows.length) return;

  navigator.clipboard.writeText(json)
    .then(() => {
      if (!dom.editorExportBtn) return;
      const unstamped = total - stamped;
      const label = unstamped > 0
        ? `✓ Copied! (${unstamped} ${unit}ยังไม่มีเวลา)`
        : "✓ Copied!";
      dom.editorExportBtn.textContent = label;
      setTimeout(() => {
        if (dom.editorExportBtn) {
          dom.editorExportBtn.innerHTML = `<i class="fa-solid fa-copy"></i> Copy JSON`;
        }
      }, 3000);
    })
    .catch(() => {
      prompt("คัดลอก JSON ด้านล่าง:", json);
    });
}

/**
 * Keyboard handler for the editor panel.
 * Space/Enter = stamp focused row | ↑↓ = move focus | Esc = close
 * Routes to chord handler when chords tab is active.
 */
function handleEditorKeydown(e) {
  if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;

  if (state.editorTab === "notation") {
    // ── Notation tab ────────────────────────────────────────────────────
    switch (e.key) {
      case " ":
        e.preventDefault();
        if (state.notationFocusIdx >= 0) notationStampRow(state.notationFocusIdx, false);
        break;
      case "Enter":
        e.preventDefault();
        if (state.notationFocusIdx >= 0) notationStampRow(state.notationFocusIdx, true);
        break;
      case "ArrowDown":
      case "Tab":
        if (e.key === "Tab") e.preventDefault();
        if (state.notationFocusIdx < state.notationRows.length - 1)
          notationFocusRow(state.notationFocusIdx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (state.notationFocusIdx > 0) notationFocusRow(state.notationFocusIdx - 1);
        break;
      case "Escape":
        closeEditor();
        break;
    }
    return;
  }

  if (state.editorTab === "chords") {
    // ── Chords tab ──────────────────────────────────────────────────────
    switch (e.key) {
      case " ":
      case "Enter":
        e.preventDefault();
        if (state.chordFocusIdx >= 0) chordStampRow(state.chordFocusIdx);
        break;
      case "ArrowDown":
      case "Tab":
        if (e.key === "Tab") e.preventDefault();
        if (state.chordFocusIdx < state.chordRows.length - 1)
          chordFocusRow(state.chordFocusIdx + 1);
        break;
      case "ArrowUp":
        e.preventDefault();
        if (state.chordFocusIdx > 0) chordFocusRow(state.chordFocusIdx - 1);
        break;
      case "Escape":
        closeEditor();
        break;
    }
    return;
  }

  // ── Lyrics tab ────────────────────────────────────────────────────────
  const lineRows   = state.editorRows
    .map((r, i) => ({ r, i }))
    .filter(({ r }) => r.type === "line");
  const currentPos = lineRows.findIndex(({ i }) => i === state.editorFocusIdx);

  switch (e.key) {
    case " ":
    case "Enter":
      e.preventDefault();
      if (state.editorFocusIdx >= 0) editorStampRow(state.editorFocusIdx);
      break;
    case "ArrowDown":
    case "Tab":
      if (e.key === "Tab") e.preventDefault();
      if (currentPos < lineRows.length - 1)
        editorFocusRow(lineRows[currentPos + 1].i);
      break;
    case "ArrowUp":
      e.preventDefault();
      if (currentPos > 0)
        editorFocusRow(lineRows[currentPos - 1].i);
      break;
    case "Escape":
      closeEditor();
      break;
  }
}

/* =========================
   Strumming Pattern Visualizer
========================= */

/**
 * Builds the pattern-selector chips and the initial beat cells.
 * Called once during initApp — the container stays hidden until a song loads.
 */
function initStrumVisualizer() {
  if (!dom.strumPatternBtns) return;

  // Build pattern selector chips
  dom.strumPatternBtns.innerHTML = "";
  STRUM_PATTERNS.forEach(p => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip strum-chip";
    btn.dataset.strumId = p.id;
    btn.title = p.note;
    btn.textContent = p.label;
    btn.classList.toggle("active", p.id === state.strumPatternId);
    btn.addEventListener("click", () => {
      state.strumPatternId = p.id;
      dom.strumPatternBtns.querySelectorAll(".strum-chip").forEach(b => {
        b.classList.toggle("active", b.dataset.strumId === p.id);
      });
      renderStrumBeats();
    });
    dom.strumPatternBtns.appendChild(btn);
  });

  renderStrumBeats();
}

/** Re-renders the beat cells for the currently selected pattern. */
function renderStrumBeats() {
  if (!dom.strumBeats) return;
  const pattern = getPatternById(state.strumPatternId) ?? STRUM_PATTERNS[0];
  dom.strumBeats.innerHTML = "";

  pattern.beats.forEach((beat, i) => {
    const cell = document.createElement("div");
    const typeClass =
      beat === "D" ? "strum-cell-down" :
      beat === "U" ? "strum-cell-up"   : "strum-cell-rest";
    cell.className = `strum-cell ${typeClass}`;
    cell.dataset.beatIndex = String(i);

    const arrow = document.createElement("span");
    arrow.className = "strum-arrow";
    arrow.textContent =
      beat === "D" ? "↓" :
      beat === "U" ? "↑" : "·";
    cell.appendChild(arrow);
    dom.strumBeats.appendChild(cell);
  });
}

/**
 * Highlights the beat cell that matches the current playback position.
 * Called on every animation frame while playing.
 *
 * @param {number} currentSeconds  current playback position
 */
function updateStrumBeat(currentSeconds) {
  if (!dom.strumBeats || !state.selectedSong || !state.isPlaying) return;

  const pattern = getPatternById(state.strumPatternId) ?? STRUM_PATTERNS[0];
  const songBpm     = Number(state.selectedSong.bpm) || 100;
  const effectiveBpm = songBpm * state.speed * pattern.subDiv;

  const beatIdx = calcCurrentBeat(currentSeconds, effectiveBpm, pattern.beats.length);

  dom.strumBeats.querySelectorAll(".strum-cell").forEach((cell, i) => {
    cell.classList.toggle("active", i === beatIdx);
  });
}

/** Removes the active highlight from all beat cells (called on stop/reset). */
function resetStrumBeat() {
  if (!dom.strumBeats) return;
  dom.strumBeats.querySelectorAll(".strum-cell.active").forEach(c => {
    c.classList.remove("active");
  });
}

/* =========================
   Loop Engine
========================= */

/** Resets all loop state and refreshes the UI. */
function clearLoop() {
  state.loop.mode         = null;
  state.loop.sectionLabel = null;
  state.loop.startTime    = null;
  state.loop.endTime      = null;
  state.loop.aMarked      = false;
  updateLoopUI();
}

/** Activates A-B loop with pre-validated (already sorted) start/end times. */
function activateABLoop(startTime, endTime) {
  state.loop.mode         = "ab";
  state.loop.sectionLabel = null;
  state.loop.startTime    = startTime;
  state.loop.endTime      = endTime;
  state.loop.aMarked      = false;
  updateLoopUI();
}

/** Updates all loop-related UI elements to reflect current state.loop. */
function updateLoopUI() {
  const { mode, startTime, endTime, aMarked, sectionLabel } = state.loop;
  const hasFullLoop = mode !== null;
  const aSet = aMarked || hasFullLoop;

  // ── A button visual state ──
  if (dom.loopABtn) {
    dom.loopABtn.classList.toggle("loop-a-set",    aSet && mode !== "ab");
    dom.loopABtn.classList.toggle("loop-ab-active", mode === "ab");
  }
  // ── B button visual state ──
  if (dom.loopBBtn) {
    dom.loopBBtn.classList.toggle("loop-b-set", mode === "ab");
  }
  // ── Clear button ──
  if (dom.loopClearBtn) {
    dom.loopClearBtn.hidden = !aSet;
  }
  // ── Status text ──
  if (dom.loopStatusText) {
    if (!aSet) {
      dom.loopStatusText.textContent = "";
    } else if (aMarked && !hasFullLoop) {
      dom.loopStatusText.textContent =
        `A: ${formatTime(startTime)} — กด B เพื่อตั้ง end point`;
    } else if (mode === "ab") {
      dom.loopStatusText.textContent =
        `Loop: ${formatTime(startTime)} → ${formatTime(endTime)}`;
    } else if (mode === "section") {
      const endLabel = endTime !== null ? formatTime(endTime) : "end";
      dom.loopStatusText.textContent =
        `[ ${sectionLabel} ]  ${formatTime(startTime)} → ${endLabel}`;
    }
  }
  // ── Progress bar markers + region ──
  updateLoopMarkers();
  // ── Section label highlight in lyrics ──
  updateSectionLoopHighlight();
}

/** Positions/shows the loop region overlay and A/B marker lines on the progress bar. */
function updateLoopMarkers() {
  const { mode, startTime, endTime, aMarked } = state.loop;
  const duration = state.duration;

  const showA = (aMarked || mode) && startTime !== null && duration > 0;
  const showBAndRegion = mode !== null && duration > 0;
  const resolvedEnd = (endTime !== null ? endTime : duration) || 0;

  // A marker
  if (dom.loopMarkerA) {
    if (showA) {
      dom.loopMarkerA.style.left = `${Math.min((startTime / duration) * 100, 100)}%`;
      dom.loopMarkerA.hidden = false;
    } else {
      dom.loopMarkerA.hidden = true;
    }
  }

  // B marker + region overlay
  if (showBAndRegion) {
    const { aPercent, bPercent, regionWidth } =
      calcLoopMarkerPercents(duration, startTime, resolvedEnd);

    if (dom.loopMarkerB) {
      dom.loopMarkerB.style.left = `${bPercent}%`;
      dom.loopMarkerB.hidden = false;
    }
    if (dom.loopRegion) {
      dom.loopRegion.style.left  = `${aPercent}%`;
      dom.loopRegion.style.width = `${regionWidth}%`;
      dom.loopRegion.hidden = false;
    }
  } else {
    if (dom.loopMarkerB) dom.loopMarkerB.hidden = true;
    if (dom.loopRegion)  dom.loopRegion.hidden  = true;
  }
}

/** Toggles loop-active highlight on the matching section label in the lyrics panel. */
function updateSectionLoopHighlight() {
  if (!dom.lyricsContainer) return;
  dom.lyricsContainer.querySelectorAll(".lyric-section-label").forEach(el => {
    el.classList.toggle(
      "loop-active",
      state.loop.mode === "section" && el.dataset.section === state.loop.sectionLabel
    );
  });
}

/** Called when the user presses the A button. */
function handleLoopABtn() {
  if (!state.sound || !state.duration) return;
  if (state.loop.aMarked || state.loop.mode) {
    // A already set (pending or full loop active) → cancel everything
    clearLoop();
    return;
  }
  const t = Number(state.sound.seek()) || 0;
  state.loop.aMarked   = true;
  state.loop.startTime = t;
  updateLoopUI();
}

/** Called when the user presses the B button. */
function handleLoopBBtn() {
  if (!state.sound || !state.duration) return;
  if (!state.loop.aMarked) return; // B without A → no-op
  const t = Number(state.sound.seek()) || 0;
  const { startTime, endTime } = normalizeABRange(state.loop.startTime, t);
  activateABLoop(startTime, endTime);
}

/**
 * Activates a Section Loop for the given section name.
 * Clicking an already-active section toggles it off.
 * Seeks playback to the section start immediately.
 */
function handleSectionClick(sectionName) {
  if (!state.selectedSong || !state.duration) return;

  // Toggle off if already looping this section
  if (state.loop.mode === "section" && state.loop.sectionLabel === sectionName) {
    clearLoop();
    return;
  }

  const bounds = findSectionBounds(state.selectedSong.lyrics, sectionName);
  if (!bounds) return;

  state.loop.mode         = "section";
  state.loop.sectionLabel = sectionName;
  state.loop.startTime    = bounds.startTime;
  state.loop.endTime      = bounds.endTime; // null = last section, resolved to duration at play time
  state.loop.aMarked      = false;

  // Seek immediately to section start
  if (state.sound) {
    state.sound.seek(bounds.startTime);
    updateProgress(bounds.startTime);
    updateTimedDisplays(bounds.startTime);
  }

  updateLoopUI();
}

/** Enables or disables the A/B loop buttons (tied to whether audio is loaded). */
function setLoopButtonsEnabled(enabled) {
  if (dom.loopABtn) dom.loopABtn.disabled = !enabled;
  if (dom.loopBBtn) dom.loopBBtn.disabled = !enabled;
}

/* =========================
   Theme
========================= */
function applyTheme(theme) {
  document.documentElement.setAttribute("data-theme", theme);
  if (dom.themeIcon) {
    dom.themeIcon.className = `fa-solid ${theme === "dark" ? "fa-moon" : "fa-sun"}`;
  }
  localStorage.setItem("ukulele-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
}

/* =========================
   Auto-Scroll Toggle (lyrics panel follow)
========================= */
function applyAutoScroll(enabled) {
  state.autoScrollEnabled = !!enabled;
  [dom.autoScrollToggle, dom.lyricsFullscreenAutoScroll].forEach(btn => {
    if (!btn) return;
    btn.classList.toggle("is-on",  state.autoScrollEnabled);
    btn.classList.toggle("is-off", !state.autoScrollEnabled);
    btn.setAttribute("aria-pressed", String(state.autoScrollEnabled));
  });
  localStorage.setItem("ukulele-autoscroll", state.autoScrollEnabled ? "on" : "off");
}

function toggleAutoScroll() {
  applyAutoScroll(!state.autoScrollEnabled);
}

/* =========================
   Dancing Character Toggle (show/hide)
========================= */
function applyDancer(enabled) {
  state.dancerEnabled = !!enabled;
  if (dom.danceCharWrap) {
    dom.danceCharWrap.classList.toggle("hidden", !state.dancerEnabled);
  }
  if (dom.dancerToggleBtn) {
    dom.dancerToggleBtn.setAttribute("aria-pressed", String(state.dancerEnabled));
  }
  localStorage.setItem("ukulele-dancer", state.dancerEnabled ? "on" : "off");
}

function toggleDancer() {
  applyDancer(!state.dancerEnabled);
}

/* =========================
   Panel Layout Swap (Chord ↔ Lyrics)
========================= */
function applyPanelSwap(swapped) {
  state.panelsSwapped = !!swapped;
  if (dom.mainGrid) {
    dom.mainGrid.classList.toggle("panels-swapped", state.panelsSwapped);
  }
  if (dom.swapPanelsBtn) {
    dom.swapPanelsBtn.setAttribute("aria-pressed", String(state.panelsSwapped));
  }
  localStorage.setItem("ukulele-panel-swap", state.panelsSwapped ? "on" : "off");
}

function togglePanelSwap() {
  applyPanelSwap(!state.panelsSwapped);
}

/* =========================
   Lottie Character Animations
========================= */
function initLottieDancer() {
  if (typeof lottie === "undefined") {
    console.warn("lottie library not loaded");
    return;
  }
  if (dom.lottieIdleEl && !state.lottieIdle) {
    state.lottieIdle = lottie.loadAnimation({
      container: dom.lottieIdleEl,
      renderer:  "svg",
      loop:      true,
      autoplay:  true,
      path:      "animation/relax-animation.json"
    });
  }
  if (dom.lottiePlayingEl && !state.lottiePlaying) {
    state.lottiePlaying = lottie.loadAnimation({
      container: dom.lottiePlayingEl,
      renderer:  "svg",
      loop:      true,
      autoplay:  false,
      path:      "animation/wave-sound-animation.json"
    });
  }
}

/* =========================
   Character Dance State — swap between idle/playing Lottie animations
========================= */
function setCharPlaying(playing) {
  if (!dom.lottieIdleEl || !dom.lottiePlayingEl) return;
  if (playing) {
    dom.lottieIdleEl.hidden    = true;
    dom.lottiePlayingEl.hidden = false;
    if (state.lottieIdle)    state.lottieIdle.pause();
    if (state.lottiePlaying) state.lottiePlaying.play();
  } else {
    dom.lottiePlayingEl.hidden = true;
    dom.lottieIdleEl.hidden    = false;
    if (state.lottiePlaying) state.lottiePlaying.pause();
    if (state.lottieIdle)    state.lottieIdle.play();
  }
}

/* =========================
   Load Songs
========================= */
async function fetchJson(path) {
  const res = await fetch(path, { cache: "no-store" });
  if (!res.ok) throw new Error(`โหลด ${path} ไม่สำเร็จ: ${res.status}`);
  return res.json();
}

async function loadSongs() {
  try {
    const manifest = await fetchJson(MANIFEST_JSON_PATH);
    if (!manifest || !Array.isArray(manifest.songs)) {
      throw new Error("manifest.json ต้องมี key ชื่อ songs และเป็น Array");
    }

    // For each song in manifest, fetch its lyrics + chords + notation files in
    // parallel. Missing files are tolerated — that song just gets empty data.
    const songs = await Promise.all(manifest.songs.map(async meta => {
      const id = meta.id;
      const [lyricsArr, chordsArr, notationObj] = await Promise.all([
        fetchJson(`${LYRICS_DIR}/${id}.json`).catch(err => {
          console.warn(`Lyrics/${id}.json not loaded:`, err.message);
          return [];
        }),
        fetchJson(`${CHORDS_DIR}/${id}.json`).catch(err => {
          console.warn(`Chords/${id}.json not loaded:`, err.message);
          return null;
        }),
        fetchJson(`${NOTATION_DIR}/${id}.json`).catch(() => null) // optional, no warning
      ]);
      return buildSong(meta, lyricsArr, chordsArr, notationObj);
    }));

    state.songs = songs;
    setLoadStatus("success", "โหลดสำเร็จ");
  } catch (error) {
    console.error(error);
    // Fallback to embedded demo data
    state.songs = (fallbackSongs.songs || []).map(s =>
      buildSong(s, s.lyrics, null)
    );
    setLoadStatus("error", "โหลดไม่สำเร็จ — ใช้ข้อมูลตัวอย่าง");
  }

  renderSongSelect();
  // Default state: empty until user picks audio mode AND a song
  showIdleState();
}

function renderSongSelect() {
  const visibleSongs = state.favFilterOn
    ? filterFavorites(state.songs, state.favorites)
    : state.songs;

  dom.songSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = visibleSongs.length
    ? "— เลือกเพลง —"
    : state.favFilterOn ? "ไม่มีเพลง Favorite" : "ไม่มีเพลง";
  dom.songSelect.appendChild(placeholder);

  visibleSongs.forEach(song => {
    const option = document.createElement("option");
    option.value = song.id;
    option.textContent = (state.favorites.has(song.id) ? "★ " : "") + song.title;
    if (state.selectedSong && song.id === state.selectedSong.id) option.selected = true;
    dom.songSelect.appendChild(option);
  });
}

/* =========================
   Audio source mode (Song / Vocal)
========================= */
function setAudioMode(mode) {
  state.audioMode = mode;
  // Update toggle button active states
  if (dom.audioModeToggle) {
    dom.audioModeToggle.querySelectorAll(".chip[data-mode]").forEach(btn => {
      btn.classList.toggle("active", btn.dataset.mode === mode);
    });
  }
  // If a song is already selected, reload audio with new path
  if (state.selectedSong) {
    loadSongAudio(state.selectedSong);
  } else {
    showIdleState();
  }
}

// Wrapper: binds the imported pure getMp3PathFor to the current audio mode state.
function getMp3PathFor(song) {
  return _getMp3(song, state.audioMode);
}

/* =========================
   Idle / Empty State
========================= */
function showIdleState() {
  stopSong();
  unloadSound();
  state.currentLyricIndex = -1;
  state.currentChordIndex = -1;
  state.notePickPosition  = null; // new song — forget previous hand position
  state.duration = 0;

  dom.currentSongTitle.textContent = state.selectedSong
    ? state.selectedSong.title
    : "ยังไม่ได้เลือกเพลง";

  const msg = !state.audioMode && !state.selectedSong ? "เลือกแหล่งเสียงและเพลงเพื่อเริ่มต้น"
            : !state.audioMode                        ? "กรุณาเลือกแหล่งเสียง (Song / Vocal)"
            : !state.selectedSong                     ? "กรุณาเลือกเพลง"
            : "";

  dom.lyricsContainer.innerHTML = `<p class="empty-state">${msg}</p>`;
  dom.chordDisplay.innerHTML    = `<span class="empty-state">${msg || "เลือกเพลงแล้วกด Play"}</span>`;
  dom.currentChordLabel.textContent = "-";

  resetProgress();
  dom.durationTime.textContent = "00:00";

  dom.playPauseBtn.disabled = true;
  dom.stopBtn.disabled      = true;
  dom.seekBackBtn.disabled  = true;
  dom.seekFwdBtn.disabled   = true;

  if (state.editorOpen) closeEditor();
  if (dom.editorToggleBtn) dom.editorToggleBtn.disabled = true;
  clearLoop();
  setLoopButtonsEnabled(false);
  resetStrumBeat();
  setCharPlaying(false);
}

/* =========================
   Player Functions
========================= */
function selectSong(songId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;

  state.selectedSong = song;
  dom.songSelect.value = song.id;
  updateFavoriteBtn();

  // Only proceed to load audio + render content if BOTH mode and song are picked
  if (state.audioMode) {
    loadSongAudio(song);
  } else {
    showIdleState();
  }
}

function loadSongAudio(song) {
  if (state.editorOpen) closeEditor();
  stopSong();
  unloadSound();
  clearLoop();
  setLoopButtonsEnabled(false);
  if (dom.editorToggleBtn) dom.editorToggleBtn.disabled = true;

  state.currentLyricIndex = -1;
  state.currentChordIndex = -1;
  state.notePickPosition  = null; // new song — forget previous hand position
  state.duration = 0;

  dom.currentSongTitle.textContent = song.title;
  updateBpm(song.bpm);   // also updates Tone.Transport BPM

  renderLyrics(song.lyrics, song);
  resetProgress();
  setChordDisplay(null);

  state.sound = new Howl({
    src: [getMp3PathFor(song)],
    html5: true,
    preload: true,
    rate: state.speed,

    onload: () => {
      state.duration = state.sound.duration();
      dom.durationTime.textContent = formatTime(state.duration);
      dom.playPauseBtn.disabled = false;
      dom.stopBtn.disabled = false;
      dom.seekBackBtn.disabled = false;
      dom.seekFwdBtn.disabled = false;
      setLoopButtonsEnabled(true);
      if (dom.editorToggleBtn) dom.editorToggleBtn.disabled = false;
      applyPreservePitch();
    },

    onloaderror: (_, error) => {
      console.error("MP3 load error:", error);
      setLoadStatus("error", "โหลด MP3 ไม่สำเร็จ");
      dom.playPauseBtn.disabled = true;
      dom.stopBtn.disabled = true;
      dom.seekBackBtn.disabled = true;
      dom.seekFwdBtn.disabled = true;
      setChordDisplay("MP3?");
    },

    onplay: () => {
      state.isPlaying = true;
      updatePlayPauseIcon();
      startAnimationLoop();
      applyPreservePitch();
      setCharPlaying(true);
      startPracticeTimer();
      // Auto-sync metronome to song beat phase when playback starts
      if (state.metronomeOn) syncMetronomeToSong(Number(state.sound.seek()) || 0);
    },

    onpause: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
      setCharPlaying(false);
      pausePracticeTimer();
      if (state.metronomeOn && state.metroLoop) { state.metroLoop.stop(); Tone.Transport.stop(); }
    },

    onstop: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
      resetProgress();
      updateTimedDisplays(0);
      setCharPlaying(false);
      commitPracticeSession();
      if (state.metronomeOn && state.metroLoop) { state.metroLoop.stop(); Tone.Transport.stop(); }
    },

    onend: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
      resetProgress();
      setCharPlaying(false);
      commitPracticeSession();
      if (state.metronomeOn && state.metroLoop) { state.metroLoop.stop(); Tone.Transport.stop(); }
    }
  });
}

// Cycle to previous/next song in manifest order
function changeSong(delta) {
  if (!state.songs.length) return;
  if (!state.selectedSong) {
    // No song selected yet — just pick the first one
    selectSong(state.songs[0].id);
    return;
  }
  const idx = state.songs.findIndex(s => s.id === state.selectedSong.id);
  const newIdx = (idx + delta + state.songs.length) % state.songs.length;
  selectSong(state.songs[newIdx].id);
}

function applyPreservePitch() {
  if (!state.sound || !state.sound._sounds) return;
  state.sound._sounds.forEach(s => {
    const node = s && s._node;
    if (node) {
      node.preservesPitch      = true;
      node.mozPreservesPitch   = true;
      node.webkitPreservesPitch = true;
      node.playbackRate = state.speed;
    }
  });
}

function unloadSound() {
  if (state.sound) { state.sound.unload(); state.sound = null; }
}

async function togglePlayPause() {
  if (!state.sound) return;
  if (state.isPlaying) { state.sound.pause(); return; }
  state.sound.rate(state.speed);
  applyPreservePitch();
  state.sound.play();
}

function stopSong() {
  if (state.sound) state.sound.stop();
  state.isPlaying = false;
  updatePlayPauseIcon();
  stopAnimationLoop();
  resetProgress();
  resetStrumBeat();
  setCharPlaying(false);
}

function updatePlayPauseIcon() {
  dom.playPauseBtn.innerHTML = `<i class="fa-solid ${state.isPlaying ? "fa-pause" : "fa-play"}"></i>`;
  updateEditorPlayPauseIcon();
  syncFsPlayPauseIcon();
}

// Seek by a relative offset in seconds (negative = backward, positive = forward)
function seekBy(deltaSeconds) {
  if (!state.sound || !state.duration) return;
  const current = Number(state.sound.seek()) || 0;
  const target  = Math.min(Math.max(current + deltaSeconds, 0), state.duration);
  state.sound.seek(target);
  updateProgress(target);
  updateTimedDisplays(target);
  if (state.metronomeOn && state.isPlaying) syncMetronomeToSong(target);
}

function setSpeed(speed) {
  state.speed = Number(speed);
  document.querySelectorAll(".chip[data-speed]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.speed) === state.speed);
  });
  if (state.sound) { state.sound.rate(state.speed); applyPreservePitch(); }
}

function resetProgress() {
  dom.currentTime.textContent  = "00:00";
  dom.progressFill.style.width = "0%";
  dom.progressThumb.style.left = "0%";
  updateEditorProgress(0);
}

function seekFromPointer(clientX) {
  if (!state.sound || !state.duration) return;
  const rect = dom.progressTrack.getBoundingClientRect();
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const targetTime = ratio * state.duration;
  state.sound.seek(targetTime);
  updateProgress(targetTime);
  updateTimedDisplays(targetTime);
  if (state.metronomeOn && state.isPlaying) syncMetronomeToSong(targetTime);
}

/* =========================
   Animation Loop
========================= */
function startAnimationLoop() {
  stopAnimationLoop();
  const tick = () => {
    if (!state.sound || !state.isPlaying) return;
    const t = Number(state.sound.seek()) || 0;

    // ── Loop boundary check ──────────────────────────────────────────────────
    if (state.loop.mode) {
      const loopEnd = state.loop.endTime !== null
        ? state.loop.endTime
        : state.duration;
      if (shouldSeekBack(t, state.loop.startTime, loopEnd)) {
        state.sound.seek(state.loop.startTime);
        state.rafId = requestAnimationFrame(tick);
        return;
      }
    }
    // ────────────────────────────────────────────────────────────────────────

    updateProgress(t);
    updateTimedDisplays(t);
    updateStrumBeat(t);
    updateEditorProgress(t);
    state.rafId = requestAnimationFrame(tick);
  };
  state.rafId = requestAnimationFrame(tick);
}

function stopAnimationLoop() {
  if (state.rafId) { cancelAnimationFrame(state.rafId); state.rafId = null; }
}

function updateProgress(currentSeconds) {
  const duration = state.duration || 0;
  const percent = duration > 0 ? Math.min((currentSeconds / duration) * 100, 100) : 0;
  dom.currentTime.textContent = formatTime(currentSeconds);
  dom.durationTime.textContent = formatTime(duration);
  dom.progressFill.style.width = `${percent}%`;
  dom.progressThumb.style.left = `${percent}%`;
  if (state.lyricsFullscreen) {
    if (dom.lyricsFsProgressFill)  dom.lyricsFsProgressFill.style.width = `${percent}%`;
    if (dom.lyricsFsProgressThumb) dom.lyricsFsProgressThumb.style.left = `${percent}%`;
    if (dom.lyricsFsCurrentTime)   dom.lyricsFsCurrentTime.textContent = formatTime(currentSeconds);
    if (dom.lyricsFsDurationTime)  dom.lyricsFsDurationTime.textContent = formatTime(duration);
  }
}

function updateTimedDisplays(currentSeconds) {
  if (!state.selectedSong) return;
  updateCurrentLyric(currentSeconds);
  updateCurrentChord(currentSeconds);
  updateStaffActiveNote(currentSeconds);
}

/* =========================
   Lyrics Functions
========================= */
function renderLyrics(lyrics, song = null) {
  state.notationMode = "interactive";
  dom.lyricsContainer.classList.remove("has-staff");
  state.activeStaffNoteIdx = -1;
  state.staffNoteTimes = [];
  syncNotationBtns(false, false); // hide notation header buttons for songs with lyrics
  dom.lyricsContainer.innerHTML = "";
  if (!lyrics || !lyrics.length) {
    renderLyricsEmptyState(song);
    return;
  }

  const fragment = document.createDocumentFragment();
  let lineIndex = 0;

  lyrics.forEach(entry => {
    if (entry.section) {
      const label = document.createElement("div");
      label.className = "lyric-section-label";
      label.textContent = `[ ${entry.section} ]`;
      label.dataset.section = entry.section;
      fragment.appendChild(label);

    } else if (Array.isArray(entry.line)) {
      const row = document.createElement("div");
      row.className = "lyric-row";
      row.dataset.index = String(lineIndex);
      row.dataset.time  = String(entry.time);

      entry.line.forEach(seg => {
        const segWrap  = document.createElement("span");
        segWrap.className = "lyric-segment";

        const chordSpan = document.createElement("span");
        chordSpan.className = "inline-chord";
        chordSpan.textContent = seg.chord || "";

        const lyricSpan = document.createElement("span");
        lyricSpan.className = "inline-lyric";
        lyricSpan.textContent = seg.lyric || "";

        segWrap.appendChild(chordSpan);
        segWrap.appendChild(lyricSpan);
        row.appendChild(segWrap);
      });

      fragment.appendChild(row);
      lineIndex++;
    }
  });

  dom.lyricsContainer.appendChild(fragment);

  if (state.lyricsFullscreen) {
    syncFullscreenLyrics();
    syncFsPlayer();
  }
}

/**
 * Renders what the lyrics panel shows when a song has no lyric lines.
 *
 * Most songs without lyrics are pure instrumental "Lesson" exercises that
 * have a matching "Letter Note Notation" reference image (melody written as
 * letter names above a staff) instead of sung lyrics. When one is available
 * for the current song, show that image with a small caption; otherwise fall
 * back to the plain "no lyrics" placeholder. If the image fails to load
 * (e.g. no matching file exists for this song), we gracefully fall back to
 * the placeholder too — this is a static file app with no way to check file
 * existence ahead of time.
 *
 * @param {{ id: string, title: string } | null} song
 */
function syncNotationBtns(hasInteractive, hasImage) {
  const showToggle = hasInteractive && hasImage;
  const btn = dom.notationToggleBtn;
  if (!btn) return;
  btn.hidden = !showToggle;
  const isImage = state.notationMode === "image";
  btn.classList.toggle("is-on", isImage);
  btn.setAttribute("aria-pressed", isImage ? "true" : "false");
  btn.title = isImage
    ? "กดเพื่อกลับไปแบบ Interactive"
    : "กดเพื่อแสดงรูปภาพ Letter Note Notation";
}

function renderLyricsEmptyState(song) {
  const emptyMsg = `<p class="empty-state">ไม่มีเนื้อเพลง</p>`;

  // Interactive staff is available when the song has a Notation/<id>.json file,
  // or (legacy fallback) when it's a lesson whose Chords file holds melody notes.
  const hasNotationFile = !!(song && song.notation);
  const hasLegacyMelody = !hasNotationFile &&
    !!(song && song.id.startsWith("lesson") && song.chords && song.chords.length);
  const hasInteractive  = hasNotationFile || hasLegacyMelody;

  const notationPath   = song ? getNotationImagePath(song.id) : null;
  const hasImage       = !!notationPath;
  const useInteractive = hasInteractive && (!hasImage || state.notationMode === "interactive");

  syncNotationBtns(hasInteractive, hasImage);

  if (useInteractive) {
    dom.lyricsContainer.innerHTML = "";
    dom.lyricsContainer.classList.add("has-staff");
    state.activeStaffNoteIdx = -1;

    const model = hasNotationFile
      ? parseNotation(song.notation)
      : chordsToNotation(song.chords, song.bpm);
    state.staffNoteTimes = buildStaffNoteTimes(model);

    const staffWrap = document.createElement("div");
    staffWrap.className = "staff-scroll";
    staffWrap.innerHTML = renderStaff(model);
    dom.lyricsContainer.appendChild(staffWrap);

    if (state.lyricsFullscreen) { syncFullscreenLyrics(); syncFsPlayer(); }
    return;
  }

  dom.lyricsContainer.innerHTML = "";
  dom.lyricsContainer.classList.remove("has-staff");
  state.activeStaffNoteIdx = -1;
  state.staffNoteTimes = [];

  if (!hasImage) {
    dom.lyricsContainer.innerHTML = emptyMsg;
    if (state.lyricsFullscreen) { syncFullscreenLyrics(); syncFsPlayer(); }
    return;
  }

  const wrap = document.createElement("div");
  wrap.className = "notation-view";

  const img = document.createElement("img");
  img.className = "notation-image";
  img.src = notationPath;
  img.alt = `Letter Note Notation — ${song.title || song.id}`;
  img.loading = "lazy";
  img.addEventListener("error", () => { dom.lyricsContainer.innerHTML = emptyMsg; });

  wrap.appendChild(img);
  dom.lyricsContainer.appendChild(wrap);

  if (state.lyricsFullscreen) { syncFullscreenLyrics(); syncFsPlayer(); }
}

function getLyricLineEntries(lyrics) {
  return lyrics.filter(e => Array.isArray(e.line));
}

/**
 * Scrolls `el` to near the top of `container` without touching the page scroll.
 * Uses container.scrollTo() so only the panel scrolls, not the viewport.
 */
function scrollElIntoContainer(el, container) {
  if (!el || !container) return;
  const containerRect = container.getBoundingClientRect();
  const elRect        = el.getBoundingClientRect();
  const targetTop     = container.scrollTop
                        + (elRect.top - containerRect.top)    // element's current offset inside container
                        - 90;                                  // 80px gap from the top edge
  container.scrollTo({ top: Math.max(0, targetTop), behavior: "smooth" });
}

function updateCurrentLyric(currentSeconds) {
  const lineEntries = getLyricLineEntries(state.selectedSong.lyrics);
  const nextIndex   = findCurrentTimedIndex(lineEntries, currentSeconds);

  if (nextIndex === state.currentLyricIndex) return;

  const prev = dom.lyricsContainer.querySelector(".lyric-row.active");
  if (prev) prev.classList.remove("active");

  const current = dom.lyricsContainer.querySelector(`.lyric-row[data-index="${nextIndex}"]`);
  if (current) {
    current.classList.add("active");
    // Two gates: master toggle (autoScrollEnabled) + short pause after manual scroll
    if (state.autoScrollEnabled && !state.userScrolling) {
      scrollElIntoContainer(current, dom.lyricsContainer);
    }
  }

  state.currentLyricIndex = nextIndex;

  // Mirror highlight into fullscreen container when open
  if (state.lyricsFullscreen) {
    const fsPrev = dom.lyricsFullscreenContainer.querySelector(".lyric-row.active");
    if (fsPrev) fsPrev.classList.remove("active");
    const fsCurrent = dom.lyricsFullscreenContainer.querySelector(`.lyric-row[data-index="${nextIndex}"]`);
    if (fsCurrent) {
      fsCurrent.classList.add("active");
      if (state.autoScrollEnabled && !state.userScrolling) {
        scrollElIntoContainer(fsCurrent, dom.lyricsFullscreenContainer);
      }
    }
  }
}

/* =========================
   Lyrics Fullscreen
========================= */
function openLyricsFullscreen() {
  state.lyricsFullscreen = true;
  dom.lyricsFullscreen.hidden = false;

  // Clone lyrics content into fullscreen container
  syncFullscreenLyrics();

  // Sync chord display
  const chords = state.selectedSong ? state.selectedSong.chords : null;
  const idx = state.currentChordIndex;
  const currentChord = (chords && idx >= 0 && chords[idx]) ? chords[idx].chord : null;
  syncFullscreenChord(currentChord);

  // Sync chord control button states
  syncFsChordControls();

  // Sync mini player state
  syncFsPlayer();
}

function closeLyricsFullscreen() {
  state.lyricsFullscreen = false;
  dom.lyricsFullscreen.hidden = true;
  dom.lyricsFullscreenContainer.innerHTML = "";
}

function syncFullscreenLyrics() {
  dom.lyricsFullscreenContainer.innerHTML = dom.lyricsContainer.innerHTML;

  // Wire up section-label click (loop-to-section) in fullscreen copy
  dom.lyricsFullscreenContainer.querySelectorAll(".lyric-section-label").forEach(el => {
    el.addEventListener("click", () => {
      const label = el.dataset.section;
      if (label) handleSectionClick(label);
    });
  });
}

function syncFsPlayer() {
  const title = state.selectedSong ? state.selectedSong.title : "—";
  dom.lyricsFsPlayerTitle.textContent = title;
  syncFsPlayPauseIcon();
  syncFsProgress();

  // Sync auto-scroll toggle
  const btn = dom.lyricsFullscreenAutoScroll;
  if (btn) {
    btn.classList.toggle("is-on",  state.autoScrollEnabled);
    btn.classList.toggle("is-off", !state.autoScrollEnabled);
    btn.setAttribute("aria-pressed", String(state.autoScrollEnabled));
  }
}

function syncFsPlayPauseIcon() {
  if (!dom.lyricsFsPlayPause) return;
  dom.lyricsFsPlayPause.innerHTML = `<i class="fa-solid ${state.isPlaying ? "fa-pause" : "fa-play"}"></i>`;
}

function syncFsProgress() {
  if (!dom.lyricsFsProgressFill) return;
  const duration = state.duration || 0;
  const current = state.sound ? (Number(state.sound.seek()) || 0) : 0;
  const percent = duration > 0 ? Math.min((current / duration) * 100, 100) : 0;
  dom.lyricsFsProgressFill.style.width = `${percent}%`;
  dom.lyricsFsProgressThumb.style.left = `${percent}%`;
  if (dom.lyricsFsCurrentTime) dom.lyricsFsCurrentTime.textContent = formatTime(current);
  if (dom.lyricsFsDurationTime) dom.lyricsFsDurationTime.textContent = formatTime(duration);
}


function seekFromFsProgress(clientX) {
  if (!state.sound || !state.duration) return;
  const rect = dom.lyricsFsProgressTrack.getBoundingClientRect();
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const targetTime = ratio * state.duration;
  state.sound.seek(targetTime);
  updateProgress(targetTime);
  updateTimedDisplays(targetTime);
  if (state.metronomeOn && state.isPlaying) syncMetronomeToSong(targetTime);
}

/* =========================
   Chord Functions
========================= */
function setChordDisplay(chord) {
  dom.chordDisplay.innerHTML = "";

  if (!chord) {
    dom.chordDisplay.innerHTML = `<span class="empty-state">รอคอร์ดแรก...</span>`;
    dom.currentChordLabel.textContent = "-";
    if (dom.chordDiagram) dom.chordDiagram.hidden = true;
    return;
  }

  // Chord badge
  const badge = document.createElement("div");
  badge.className = "chord-badge";
  badge.textContent = chord;
  dom.chordDisplay.appendChild(badge);
  dom.currentChordLabel.textContent = chord;

  // Chord diagram — show when chord data exists, hide when unknown
  if (dom.chordDiagram) {
    const data = getChordData(chord);
    if (data) {
      dom.chordDiagram.innerHTML = "";
      let svg;
      if (state.chordDiagramMode === "note") {
        const rootName = getRootNoteName(chord);
        const position = rootName
          ? pickNotePosition(rootName, state.notePickMode, state.notePickPosition)
          : null;
        // Remember this position so "auto" mode can keep the hand close by
        // for the next note (only meaningful in fingerstyle/auto mode).
        if (position) state.notePickPosition = position;
        svg = renderNoteDiagramSVG(position, rootName);
      } else {
        svg = renderChordDiagramSVG(data);
      }
      dom.chordDiagram.appendChild(svg);
      dom.chordDiagram.hidden = false;
    } else {
      dom.chordDiagram.hidden = true;
    }
  }

  // Mirror into fullscreen chord area
  if (state.lyricsFullscreen) syncFullscreenChord(chord);
}

function syncFullscreenChord(chord) {
  if (!dom.lyricsFsChordDisplay) return;

  dom.lyricsFsChordLabel.textContent = chord || "-";

  dom.lyricsFsChordDisplay.innerHTML = "";
  if (chord) {
    const badge = document.createElement("div");
    badge.className = "chord-badge";
    badge.textContent = chord;
    dom.lyricsFsChordDisplay.appendChild(badge);
  } else {
    dom.lyricsFsChordDisplay.innerHTML = `<span class="empty-state">รอคอร์ดแรก...</span>`;
  }

  dom.lyricsFsChordDiagram.innerHTML = "";
  dom.lyricsFsChordDiagram.classList.remove("rot-90", "rot-180", "rot-270");
  if (state.chordDiagramRotation) {
    dom.lyricsFsChordDiagram.classList.add(`rot-${state.chordDiagramRotation}`);
  }
  if (chord) {
    const data = getChordData(chord);
    if (data) {
      let svg;
      if (state.chordDiagramMode === "note") {
        const rootName = getRootNoteName(chord);
        const position = rootName
          ? pickNotePosition(rootName, state.notePickMode, state.notePickPosition)
          : null;
        svg = renderNoteDiagramSVG(position, rootName);
      } else {
        svg = renderChordDiagramSVG(data);
      }
      dom.lyricsFsChordDiagram.appendChild(svg);
    }
  }
}

function syncFsChordControls() {
  // Diagram mode button
  if (dom.lyricsFsDiagramModeBtn) {
    const isNote = state.chordDiagramMode === "note";
    dom.lyricsFsDiagramModeBtn.setAttribute("aria-pressed", String(isNote));
  }
  // Diagram orientation button
  if (dom.lyricsFsDiagramOrientBtn) {
    dom.lyricsFsDiagramOrientBtn.setAttribute("aria-pressed", String(state.chordDiagramRotation !== 0));
  }
  // Note-pick trigger visibility + label
  if (dom.lyricsFsNotePickTrigger) {
    dom.lyricsFsNotePickTrigger.hidden = state.chordDiagramMode !== "note";
    if (dom.lyricsFsNotePickLabel) {
      dom.lyricsFsNotePickLabel.textContent = dom.notePickModeTriggerLabel
        ? dom.notePickModeTriggerLabel.textContent
        : "Fingerstyle";
    }
  }
  // Chord diagram rotation class
  if (dom.lyricsFsChordDiagram) {
    dom.lyricsFsChordDiagram.classList.remove("rot-90", "rot-180", "rot-270");
    if (state.chordDiagramRotation) {
      dom.lyricsFsChordDiagram.classList.add(`rot-${state.chordDiagramRotation}`);
    }
  }
  // Swap state
  if (dom.lyricsFsMain) {
    dom.lyricsFsMain.classList.toggle("fs-swapped", state.lyricsFsSwapped);
  }
  if (dom.lyricsFsSwapBtn) {
    dom.lyricsFsSwapBtn.setAttribute("aria-pressed", String(state.lyricsFsSwapped));
  }
}

function toggleFsSwap() {
  state.lyricsFsSwapped = !state.lyricsFsSwapped;
  if (dom.lyricsFsMain) dom.lyricsFsMain.classList.toggle("fs-swapped", state.lyricsFsSwapped);
  if (dom.lyricsFsSwapBtn) dom.lyricsFsSwapBtn.setAttribute("aria-pressed", String(state.lyricsFsSwapped));
}

/**
 * Re-derives the currently displayed chord's name from state and re-runs
 * setChordDisplay — used after switching diagram mode / note-pick mode so
 * the diagram refreshes immediately without waiting for the next chord
 * change. Reads from state.selectedSong.chords rather than the on-screen
 * label, which may still hold the "-" placeholder before playback starts.
 */
function refreshChordDisplay() {
  const idx          = state.currentChordIndex;
  const chords       = state.selectedSong ? state.selectedSong.chords : null;
  const currentChord = (chords && idx >= 0 && chords[idx]) ? chords[idx].chord : null;
  setChordDisplay(currentChord);
}

/**
 * Toggles the chord diagram between two display modes:
 *  - "chord": full finger-position shape (default, for strumming)
 *  - "note":  highlights a single fretboard position for the chord's root
 *             note — for exercises that pick/pluck individual notes.
 *             Reveals the compact string/fingerstyle picker trigger while active.
 * Not persisted — always resets to "chord" mode on reload.
 */
function toggleDiagramMode() {
  state.chordDiagramMode  = state.chordDiagramMode === "note" ? "chord" : "note";
  state.notePickPosition  = null; // reset hand-position memory on mode entry/exit

  const isNoteMode = state.chordDiagramMode === "note";

  if (dom.diagramModeBtn) {
    dom.diagramModeBtn.setAttribute("aria-pressed", String(isNoteMode));
    dom.diagramModeBtn.title = isNoteMode
      ? "โหมดโน้ตเดี่ยว (กดเพื่อกลับไปโหมดคอร์ด)"
      : "สลับโหมดคอร์ด/โน้ต (สำหรับฝึกดีดโน้ต)";
  }
  if (dom.notePickModeTrigger) dom.notePickModeTrigger.hidden = !isNoteMode;
  if (!isNoteMode) closeNotePickSheet();

  if (state.lyricsFullscreen) syncFsChordControls();
  refreshChordDisplay();
}

// String/fingerstyle picker options shown in the note-pick bottom-sheet
const NOTE_PICK_MODES = [
  { id: "G",    label: "สาย G",       icon: "fa-solid fa-music" },
  { id: "C",    label: "สาย C",       icon: "fa-solid fa-music" },
  { id: "E",    label: "สาย E",       icon: "fa-solid fa-music" },
  { id: "A",    label: "สาย A",       icon: "fa-solid fa-music" },
  { id: "auto", label: "Fingerstyle", icon: "fa-solid fa-hand-sparkles" },
];

/** Looks up the display label for the currently-selected note-pick mode. */
function getNotePickModeLabel(modeId) {
  const found = NOTE_PICK_MODES.find(m => m.id === modeId);
  return found ? found.label : modeId;
}

/** Renders the bottom-sheet option list and wires the trigger/backdrop to open/close it. */
function initNotePickSheet() {
  if (dom.notePickModeTriggerLabel) {
    dom.notePickModeTriggerLabel.textContent = getNotePickModeLabel(state.notePickMode);
  }

  if (dom.notePickSheetOptions) {
    dom.notePickSheetOptions.innerHTML = "";

    NOTE_PICK_MODES.forEach(({ id, label, icon }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "note-pick-option";
      btn.dataset.mode = id;
      btn.setAttribute("aria-pressed", String(state.notePickMode === id));
      if (state.notePickMode === id) btn.classList.add("active");

      btn.innerHTML = `
        <i class="${icon}" aria-hidden="true"></i>
        <span>${label}</span>
        <i class="fa-solid fa-check note-pick-option-check" aria-hidden="true"></i>
      `;

      btn.addEventListener("click", () => {
        setNotePickMode(id);
        closeNotePickSheet();
      });
      dom.notePickSheetOptions.appendChild(btn);
    });
  }

  if (dom.notePickModeTrigger) {
    dom.notePickModeTrigger.addEventListener("click", toggleNotePickSheet);
  }
  if (dom.notePickSheetBackdrop) {
    dom.notePickSheetBackdrop.addEventListener("click", closeNotePickSheet);
  }
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && dom.notePickSheet && !dom.notePickSheet.hidden) {
      closeNotePickSheet();
    }
  });
}

/** Opens the bottom-sheet string/fingerstyle picker. */
function openNotePickSheet() {
  if (!dom.notePickSheet) return;
  dom.notePickSheet.hidden = false;
  if (dom.notePickModeTrigger) dom.notePickModeTrigger.setAttribute("aria-expanded", "true");
}

/** Closes the bottom-sheet string/fingerstyle picker. */
function closeNotePickSheet() {
  if (!dom.notePickSheet || dom.notePickSheet.hidden) return;
  dom.notePickSheet.hidden = true;
  if (dom.notePickModeTrigger) dom.notePickModeTrigger.setAttribute("aria-expanded", "false");
}

/** Toggles the bottom-sheet string/fingerstyle picker open/closed. */
function toggleNotePickSheet() {
  if (dom.notePickSheet && dom.notePickSheet.hidden) openNotePickSheet();
  else closeNotePickSheet();
}

/** Switches which string(s) the note-picking diagram targets, then redraws. */
function setNotePickMode(modeId) {
  if (state.notePickMode === modeId) return;
  state.notePickMode     = modeId;
  state.notePickPosition = null; // hand-position memory resets — new string layout

  const label = getNotePickModeLabel(modeId);
  if (dom.notePickModeTriggerLabel) dom.notePickModeTriggerLabel.textContent = label;
  if (dom.lyricsFsNotePickLabel) dom.lyricsFsNotePickLabel.textContent = label;
  if (dom.notePickSheetOptions) {
    dom.notePickSheetOptions.querySelectorAll(".note-pick-option").forEach(btn => {
      const isActive = btn.dataset.mode === modeId;
      btn.classList.toggle("active", isActive);
      btn.setAttribute("aria-pressed", String(isActive));
    });
  }

  refreshChordDisplay();
}

/** Cycles chord diagram through 4 rotations: 0° → 90° → 180° → 270° → 0°. */
function toggleDiagramOrient() {
  state.chordDiagramRotation = (state.chordDiagramRotation + 90) % 360;
  if (dom.chordDiagram) {
    dom.chordDiagram.classList.remove("rot-90", "rot-180", "rot-270");
    if (state.chordDiagramRotation > 0) {
      dom.chordDiagram.classList.add(`rot-${state.chordDiagramRotation}`);
    }
  }
  if (dom.diagramOrientBtn) {
    dom.diagramOrientBtn.setAttribute("aria-pressed", String(state.chordDiagramRotation !== 0));
    dom.diagramOrientBtn.title = `หมุน Chord Diagram (${state.chordDiagramRotation}°)`;
  }
  if (state.lyricsFullscreen) syncFsChordControls();
}

function updateCurrentChord(currentSeconds) {
  const chords    = state.selectedSong.chords;
  const nextIndex = findCurrentTimedIndex(chords, currentSeconds);

  if (nextIndex === state.currentChordIndex) return;

  if (nextIndex >= 0 && chords[nextIndex]) {
    setChordDisplay(chords[nextIndex].chord);
  }

  state.currentChordIndex = nextIndex;
}

/**
 * Builds the time-index used to sync the staff highlight with playback.
 * Only notes that carry a finite `time` participate; each entry keeps the
 * note's `idx` so it maps back to the matching `data-idx` in the SVG.
 *
 * @param {{notes:Array}} model  parsed notation model
 * @returns {Array<{time:number, idx:number}>}  sorted ascending by time
 */
function buildStaffNoteTimes(model) {
  if (!model || !Array.isArray(model.notes)) return [];
  return model.notes
    .filter(n => !n.isRest && Number.isFinite(n.time))
    .map(n => ({ time: n.time, idx: n.idx }))
    .sort((a, b) => a.time - b.time);
}

/** Highlights the staff note matching the current playback time. */
function updateStaffActiveNote(currentSeconds) {
  if (!dom.lyricsContainer.classList.contains("has-staff")) return;
  const times = state.staffNoteTimes;
  if (!times || !times.length) return;

  const pos     = findCurrentTimedIndex(times, currentSeconds);
  const noteIdx = pos >= 0 ? times[pos].idx : -1;
  if (noteIdx === state.activeStaffNoteIdx) return;

  state.activeStaffNoteIdx = noteIdx;
  updateStaffHighlight(noteIdx);
}

function updateStaffHighlight(idx) {
  _applyStaffHighlight(dom.lyricsContainer, idx);
  if (state.lyricsFullscreen) {
    _applyStaffHighlight(dom.lyricsFullscreenContainer, idx);
  }
}

function _applyStaffHighlight(container, idx) {
  const svg = container.querySelector(".note-staff-svg");
  if (!svg) return;

  svg.querySelectorAll(".note-head").forEach(g => g.classList.remove("active", "next"));

  if (idx < 0) return;

  const activeEl = svg.querySelector(`.note-head[data-idx="${idx}"]`);
  if (!activeEl) return;
  activeEl.classList.add("active");

  // Vertical auto-scroll: keep the active note in view inside the lyrics container.
  const activeRect    = activeEl.getBoundingClientRect();
  const containerRect = container.getBoundingClientRect();
  const noteTopRel    = activeRect.top - containerRect.top;
  const noteBotRel    = activeRect.bottom - containerRect.top;

  // Only scroll when the active note is outside the comfortable viewing band
  const margin = container.clientHeight * 0.15;
  if (noteTopRel < margin || noteBotRel > container.clientHeight - margin) {
    const targetTop = activeRect.top - containerRect.top + container.scrollTop
                    - container.clientHeight * 0.3;
    container.scrollTop = Math.max(0, targetTop);
  }
}

/* =========================
   Metronome Functions
========================= */

/**
 * Syncs the metronome Transport to the song's current playback position.
 * Calculates which phase of the beat we're at (0–1) so the click fires
 * exactly on the beat, even when starting mid-bar.
 *
 * @param {number} currentTimeSec  current song position in seconds
 */
async function syncMetronomeToSong(currentTimeSec) {
  if (!state.metroLoop || !state.metroSynth) setupMetronome();
  await Tone.start();
  const bpm          = Number(dom.bpmSlider.value) || 100;
  const beatDuration = 60 / bpm;                            // seconds per beat
  const posInBeat    = currentTimeSec % beatDuration;       // how far into the current beat

  Tone.Transport.bpm.value = bpm;
  state.metroLoop.stop();
  Tone.Transport.stop();
  state.metroLoop.start(0);
  Tone.Transport.start("+0", posInBeat);                    // start Transport from mid-beat
}

/** Creates a new Tone.js synth for the given sound ID. */
function createMetroSynth(soundId) {
  switch (soundId) {
    case "kick":
      return new Tone.MembraneSynth({
        pitchDecay: 0.08, octaves: 7,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.25, sustain: 0, release: 0.1 }
      }).toDestination();
    case "hihat":
      return new Tone.NoiseSynth({
        noise: { type: "white" },
        envelope: { attack: 0.001, decay: 0.06, sustain: 0, release: 0.01 }
      }).toDestination();
    case "bell":
      return new Tone.Synth({
        oscillator: { type: "triangle" },
        envelope: { attack: 0.001, decay: 0.35, sustain: 0, release: 0.1 }
      }).toDestination();
    default: // wood
      return new Tone.MembraneSynth({
        pitchDecay: 0.015, octaves: 3,
        oscillator: { type: "sine" },
        envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 }
      }).toDestination();
  }
}

/** Triggers one beat for the current sound type. */
function triggerMetroSound(time) {
  if (!state.metroSynth) return;
  switch (state.metroSoundId) {
    case "kick":  state.metroSynth.triggerAttackRelease("C1", "16n", time); break;
    case "hihat": state.metroSynth.triggerAttackRelease("16n", time);       break;
    case "bell":  state.metroSynth.triggerAttackRelease("A5", "8n",  time); break;
    default:      state.metroSynth.triggerAttackRelease("C5", "16n", time); break;
  }
}

function setupMetronome() {
  state.metroSynth = createMetroSynth(state.metroSoundId);

  state.metroLoop = new Tone.Loop(time => {
    triggerMetroSound(time);
    Tone.Draw.schedule(() => { flashMetronome(); }, time);
  }, "4n");

  Tone.Transport.bpm.value = Number(dom.bpmSlider.value);
}

/** Switches metronome sound. Restarts synth; loop keeps running if metronome is on. */
function setMetroSound(soundId) {
  state.metroSoundId = soundId;

  // Update chip highlight
  if (dom.metroSoundBtns) {
    dom.metroSoundBtns.querySelectorAll(".chip").forEach(b => {
      b.classList.toggle("active", b.dataset.soundId === soundId);
    });
  }

  // Recreate synth with new sound (dispose old one first)
  if (state.metroSynth) { state.metroSynth.dispose(); state.metroSynth = null; }
  state.metroSynth = createMetroSynth(soundId);
}

/** Initialises the sound-selector chip row. */
function initMetroSoundBtns() {
  if (!dom.metroSoundBtns) return;
  dom.metroSoundBtns.innerHTML = "";
  METRO_SOUNDS.forEach(s => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "chip";
    btn.dataset.soundId = s.id;
    btn.textContent = s.label;
    btn.classList.toggle("active", s.id === state.metroSoundId);
    btn.addEventListener("click", () => setMetroSound(s.id));
    dom.metroSoundBtns.appendChild(btn);
  });
}

async function toggleMetronome() {
  if (!state.metroLoop || !state.metroSynth) setupMetronome();
  await Tone.start();
  state.metronomeOn = !state.metronomeOn;

  if (state.metronomeOn) {
    if (state.isPlaying && state.sound) {
      // Song is playing → sync beat phase to current position
      await syncMetronomeToSong(Number(state.sound.seek()) || 0);
    } else {
      // No song playing → start independently
      Tone.Transport.bpm.value = Number(dom.bpmSlider.value);
      state.metroLoop.start(0);
      Tone.Transport.start();
    }
    dom.metroToggleBtn.innerHTML = `<i class="fa-solid fa-pause"></i> ปิด`;
  } else {
    state.metroLoop.stop();
    Tone.Transport.stop();
    dom.metroToggleBtn.innerHTML = `<i class="fa-solid fa-play"></i> เปิด`;
  }
}

function updateBpm(value) {
  const bpm = Math.min(Math.max(Number(value), 30), 200);
  dom.bpmSlider.value    = String(bpm);
  dom.bpmValue.textContent = String(bpm);
  if (Tone.Transport) Tone.Transport.bpm.rampTo(bpm, 0.05);
}

function flashMetronome() {
  dom.metroVisual.classList.add("active");
  window.setTimeout(() => { dom.metroVisual.classList.remove("active"); }, 90);
}

/* =========================
   Event Binding
========================= */
function bindEvents() {
  dom.songSelect.addEventListener("change", e => {
    if (e.target.value) {
      selectSong(e.target.value);
    } else if (state.selectedSong) {
      // Revert dropdown if user picked the "— เลือกเพลง —" placeholder while a song is loaded.
      // (Prevents UI mismatch where dropdown shows placeholder but state still holds the old song.)
      dom.songSelect.value = state.selectedSong.id;
    }
  });

  // Audio mode toggle (Song / Vocal)
  if (dom.audioModeToggle) {
    dom.audioModeToggle.addEventListener("click", e => {
      const btn = e.target.closest(".chip[data-mode]");
      if (btn) setAudioMode(btn.dataset.mode);
    });
  }

  dom.playPauseBtn.addEventListener("click", togglePlayPause);
  dom.stopBtn.addEventListener("click", stopSong);
  dom.seekBackBtn.addEventListener("click", () => seekBy(-5));
  dom.seekFwdBtn.addEventListener("click",  () => seekBy(5));
  dom.prevSongBtn.addEventListener("click", () => changeSong(-1));
  dom.nextSongBtn.addEventListener("click", () => changeSong(1));

  dom.speedButtons.addEventListener("click", e => {
    const btn = e.target.closest("[data-speed]");
    if (btn) setSpeed(btn.dataset.speed);
  });

  dom.progressTrack.addEventListener("click", e => { seekFromPointer(e.clientX); });

  dom.progressTrack.addEventListener("keydown", e => {
    if (e.key === "ArrowRight") { e.preventDefault(); seekBy(e.shiftKey ? 10 : 5); }
    if (e.key === "ArrowLeft")  { e.preventDefault(); seekBy(e.shiftKey ? -10 : -5); }
  });

  dom.lyricsContainer.addEventListener("scroll", () => {
    state.userScrolling = true;
    clearTimeout(state.userScrollTimer);
    state.userScrollTimer = setTimeout(() => { state.userScrolling = false; }, 3000);
  }, { passive: true });

  // Section label click → Section Loop
  dom.lyricsContainer.addEventListener("click", e => {
    const label = e.target.closest(".lyric-section-label");
    if (label && label.dataset.section) handleSectionClick(label.dataset.section);
  });

  // A/B loop buttons + clear
  if (dom.loopABtn)    dom.loopABtn.addEventListener("click",    handleLoopABtn);
  if (dom.loopBBtn)    dom.loopBBtn.addEventListener("click",    handleLoopBBtn);
  if (dom.loopClearBtn) dom.loopClearBtn.addEventListener("click", clearLoop);

  // ── Timestamp / Chord Editor ──────────────────────────────────────────────
  if (dom.editorToggleBtn) dom.editorToggleBtn.addEventListener("click", openEditor);
  if (dom.editorCloseBtn)  dom.editorCloseBtn.addEventListener("click",  closeEditor);
  if (dom.editorExportBtn) dom.editorExportBtn.addEventListener("click",  handleEditorExport);
  if (dom.editorTabLyrics) dom.editorTabLyrics.addEventListener("click", () => switchEditorTab("lyrics"));
  if (dom.editorTabChords) dom.editorTabChords.addEventListener("click", () => switchEditorTab("chords"));
  if (dom.editorTabNotation) dom.editorTabNotation.addEventListener("click", () => switchEditorTab("notation"));
  wireNotationConfigControls();
  if (dom.editorImportBtn)    dom.editorImportBtn.addEventListener("click", handleEditorImport);
  if (dom.chordAutoScrollBtn) dom.chordAutoScrollBtn.addEventListener("click", () => {
    applyChordAutoScroll(!state.chordAutoScroll);
  });

  // Editor mini transport (delegates to the same functions as the main player)
  if (dom.editorPlayPauseBtn) dom.editorPlayPauseBtn.addEventListener("click", togglePlayPause);
  if (dom.editorStopBtn)      dom.editorStopBtn.addEventListener("click",      stopSong);
  if (dom.editorSeekBackBtn)  dom.editorSeekBackBtn.addEventListener("click",  () => seekBy(-5));
  if (dom.editorSeekFwdBtn)   dom.editorSeekFwdBtn.addEventListener("click",   () => seekBy(5));

  // Editor progress track seek
  if (dom.editorProgressTrack) {
    dom.editorProgressTrack.addEventListener("click", e => {
      if (!state.sound || !state.duration) return;
      const rect  = dom.editorProgressTrack.getBoundingClientRect();
      const ratio = Math.min(Math.max((e.clientX - rect.left) / rect.width, 0), 1);
      const t     = ratio * state.duration;
      state.sound.seek(t);
      updateEditorProgress(t);
      updateProgress(t);
    });
  }

  // Editor keyboard shortcuts (Space, ↑↓, Esc)
  if (dom.editorPanel) {
    dom.editorPanel.addEventListener("keydown", handleEditorKeydown);
  }
  // Also catch Space/Esc globally when editor is open
  document.addEventListener("keydown", e => {
    if (!state.editorOpen) return;
    handleEditorKeydown(e);
  });

  // Chord diagram orientation
  if (dom.diagramOrientBtn) dom.diagramOrientBtn.addEventListener("click", toggleDiagramOrient);
  if (dom.diagramModeBtn) dom.diagramModeBtn.addEventListener("click", toggleDiagramMode);

  // Favorites + History
  if (dom.favoriteBtn)     dom.favoriteBtn.addEventListener("click", toggleFavorite);
  if (dom.favFilterBtn)    dom.favFilterBtn.addEventListener("click", toggleFavFilter);
  if (dom.historyBtn)      dom.historyBtn.addEventListener("click", openHistoryPanel);
  if (dom.historyCloseBtn) dom.historyCloseBtn.addEventListener("click", closeHistoryPanel);
  if (dom.strumBtn)        dom.strumBtn.addEventListener("click", openStrumPanel);
  if (dom.strumCloseBtn)   dom.strumCloseBtn.addEventListener("click", closeStrumPanel);
  if (dom.historyClearBtn) dom.historyClearBtn.addEventListener("click", () => {
    if (!confirm("ล้างประวัติการฝึกทั้งหมด?")) return;
    state.practiceLog = [];
    savePracticeLog();
    renderHistoryPanel();
  });

  dom.bpmSlider.addEventListener("input", e => { updateBpm(e.target.value); });
  dom.metroToggleBtn.addEventListener("click", toggleMetronome);

  dom.themeToggleBtn.addEventListener("click", toggleTheme);

  if (dom.autoScrollToggle) {
    dom.autoScrollToggle.addEventListener("click", toggleAutoScroll);
  }
  if (dom.dancerToggleBtn) {
    dom.dancerToggleBtn.addEventListener("click", toggleDancer);
  }
  if (dom.swapPanelsBtn) {
    dom.swapPanelsBtn.addEventListener("click", togglePanelSwap);
  }

  // ── Notation toggle (header button) ──
  if (dom.notationToggleBtn) {
    dom.notationToggleBtn.addEventListener("click", () => {
      state.notationMode = state.notationMode === "image" ? "interactive" : "image";
      renderLyricsEmptyState(state.selectedSong);
    });
  }

  // ── Lyrics Fullscreen ──
  if (dom.lyricsExpandBtn) dom.lyricsExpandBtn.addEventListener("click", openLyricsFullscreen);
  if (dom.lyricsCollapseBtn) dom.lyricsCollapseBtn.addEventListener("click", closeLyricsFullscreen);
  if (dom.lyricsFsPlayPause)  dom.lyricsFsPlayPause.addEventListener("click", togglePlayPause);
  if (dom.lyricsFsPrev)       dom.lyricsFsPrev.addEventListener("click", () => changeSong(-1));
  if (dom.lyricsFsNext)       dom.lyricsFsNext.addEventListener("click", () => changeSong(1));
  if (dom.lyricsFsStop)       dom.lyricsFsStop.addEventListener("click", stopSong);
  if (dom.lyricsFsSeekBack)   dom.lyricsFsSeekBack.addEventListener("click", () => seekBy(-5));
  if (dom.lyricsFsSeekFwd)    dom.lyricsFsSeekFwd.addEventListener("click", () => seekBy(5));
  if (dom.lyricsFsProgressTrack) {
    dom.lyricsFsProgressTrack.addEventListener("click", e => seekFromFsProgress(e.clientX));
  }
  if (dom.lyricsFullscreenAutoScroll) {
    dom.lyricsFullscreenAutoScroll.addEventListener("click", toggleAutoScroll);
  }
  if (dom.lyricsFullscreenContainer) {
    dom.lyricsFullscreenContainer.addEventListener("scroll", () => {
      state.userScrolling = true;
      clearTimeout(state.userScrollTimer);
      state.userScrollTimer = setTimeout(() => { state.userScrolling = false; }, 3000);
    }, { passive: true });
  }
  // Fullscreen chord controls — delegate to the same toggle functions as main panel
  if (dom.lyricsFsSwapBtn) dom.lyricsFsSwapBtn.addEventListener("click", toggleFsSwap);
  if (dom.lyricsFsDiagramModeBtn) dom.lyricsFsDiagramModeBtn.addEventListener("click", toggleDiagramMode);
  if (dom.lyricsFsDiagramOrientBtn) dom.lyricsFsDiagramOrientBtn.addEventListener("click", toggleDiagramOrient);
  if (dom.lyricsFsNotePickTrigger) dom.lyricsFsNotePickTrigger.addEventListener("click", toggleNotePickSheet);

  // Escape key closes fullscreen lyrics
  document.addEventListener("keydown", e => {
    if (e.key === "Escape" && state.lyricsFullscreen) {
      e.preventDefault();
      closeLyricsFullscreen();
    }
  });

  // ===== Mobile: block pinch zoom & double-tap zoom =====
  // iOS Safari ignores user-scalable=no in meta — handle via JS gesture events.
  ["gesturestart", "gesturechange", "gestureend"].forEach(evt => {
    document.addEventListener(evt, e => e.preventDefault(), { passive: false });
  });
  // Block multi-touch zoom on Android / other browsers
  document.addEventListener("touchmove", e => {
    if (e.touches && e.touches.length > 1) e.preventDefault();
  }, { passive: false });
  // Block double-tap zoom (300ms window)
  let lastTapEnd = 0;
  document.addEventListener("touchend", e => {
    const now = Date.now();
    if (now - lastTapEnd <= 300) e.preventDefault();
    lastTapEnd = now;
  }, { passive: false });
  // (Removed Ctrl+wheel zoom block — it was making mouse scroll feel blocked
  //  because non-passive wheel listeners force the browser to wait before scrolling.)

  window.addEventListener("beforeunload", () => {
    stopAnimationLoop();
    if (state.sound) state.sound.unload();
    if (state.metroLoop) state.metroLoop.dispose();
    if (state.metroSynth) state.metroSynth.dispose();
  });
}

/* =========================
   Favorites
========================= */

/** Loads favorites from localStorage into state.favorites (Set). */
function loadFavorites() {
  try {
    const raw = localStorage.getItem("ukulele-favorites");
    state.favorites = raw ? new Set(JSON.parse(raw)) : new Set();
  } catch { state.favorites = new Set(); }
}

/** Saves state.favorites to localStorage. */
function saveFavorites() {
  localStorage.setItem("ukulele-favorites", JSON.stringify([...state.favorites]));
}

/** Toggles favorite status for the currently selected song. */
function toggleFavorite() {
  if (!state.selectedSong) return;
  state.favorites = toggleFavoriteId(state.favorites, state.selectedSong.id);
  saveFavorites();
  updateFavoriteBtn();
  // If filter is on and we just un-favorited, re-render the select
  if (state.favFilterOn) renderSongSelect();
}

/** Syncs the star button appearance with the current song's favorite state. */
function updateFavoriteBtn() {
  if (!dom.favoriteBtn || !dom.favoriteIcon) return;
  const isFav = state.selectedSong && state.favorites.has(state.selectedSong.id);
  dom.favoriteBtn.hidden = !state.selectedSong;
  dom.favoriteIcon.className = isFav ? "fa-solid fa-star" : "fa-regular fa-star";
  dom.favoriteBtn.classList.toggle("is-favorite", !!isFav);
  dom.favoriteBtn.title = isFav ? "ลบออกจาก Favorites" : "เพิ่มใน Favorites";
}

/** Toggles the favorites-only filter and re-renders the song select. */
function toggleFavFilter() {
  state.favFilterOn = !state.favFilterOn;
  if (dom.favFilterBtn) {
    dom.favFilterBtn.setAttribute("aria-pressed", String(state.favFilterOn));
    dom.favFilterBtn.title = state.favFilterOn
      ? "แสดงทั้งหมด (ปิด filter)"
      : "แสดงเฉพาะ Favorites";
  }
  renderSongSelect();
}

/* =========================
   Practice Log
========================= */

/** Loads practice log from localStorage. */
function loadPracticeLog() {
  try {
    const raw = localStorage.getItem("ukulele-practice-log");
    state.practiceLog = raw ? JSON.parse(raw) : [];
  } catch { state.practiceLog = []; }
}

/** Saves practice log to localStorage. */
function savePracticeLog() {
  localStorage.setItem("ukulele-practice-log", JSON.stringify(state.practiceLog));
}

/** Called when playback starts — records the wall-clock start time. */
function startPracticeTimer() {
  if (!state.practiceSessionStart) {
    state.practiceSessionStart = Date.now();
  }
}

/** Called when playback pauses — accumulates elapsed seconds. */
function pausePracticeTimer() {
  if (state.practiceSessionStart) {
    state.practiceSessionSec += (Date.now() - state.practiceSessionStart) / 1000;
    state.practiceSessionStart = null;
  }
}

/** Saves the current session if it exceeds 10 s, then resets the timer. */
function commitPracticeSession() {
  pausePracticeTimer();
  const MIN_SEC = 10;
  if (state.practiceSessionSec >= MIN_SEC && state.selectedSong) {
    const today = new Date().toISOString().slice(0, 10);
    const session = {
      songId:      state.selectedSong.id,
      songTitle:   state.selectedSong.title,
      date:        today,
      durationSec: Math.round(state.practiceSessionSec),
    };
    state.practiceLog = addSession(state.practiceLog, session);
    savePracticeLog();
  }
  state.practiceSessionStart = null;
  state.practiceSessionSec   = 0;
}

/* =========================
   Practice History Panel
========================= */

function openHistoryPanel() {
  renderHistoryPanel();
  if (dom.historyPanel) dom.historyPanel.hidden = false;
  if (dom.mainGrid)     dom.mainGrid.hidden     = true;
}

function closeHistoryPanel() {
  if (dom.historyPanel) dom.historyPanel.hidden = true;
  if (dom.mainGrid)     dom.mainGrid.hidden     = false;
}

// ─── Strumming Pattern Panel ──────────────────────────────────────────────────

function openStrumPanel() {
  if (dom.strumPanel) dom.strumPanel.hidden = false;
  if (dom.mainGrid)   dom.mainGrid.hidden   = true;
}

function closeStrumPanel() {
  if (dom.strumPanel) dom.strumPanel.hidden = true;
  if (dom.mainGrid)   dom.mainGrid.hidden   = false;
}

function renderHistoryPanel() {
  if (!dom.historyContent) return;
  dom.historyContent.innerHTML = "";

  const today  = new Date().toISOString().slice(0, 10);
  const weekSec = totalSecInDays(state.practiceLog, today, 7);
  const totalSec = state.practiceLog.reduce((s, r) => s + (r.durationSec || 0), 0);
  const songCount = new Set(state.practiceLog.map(r => r.songId)).size;

  // ── Summary cards ─────────────────────────────────────────────────────────
  const summary = document.createElement("div");
  summary.className = "history-summary";

  const cards = [
    { icon: "fa-clock",        label: "รวมทั้งหมด",    value: formatLogDuration(totalSec)  },
    { icon: "fa-music",        label: "เพลงที่ฝึก",    value: `${songCount} เพลง`           },
    { icon: "fa-calendar-week",label: "สัปดาห์นี้",    value: formatLogDuration(weekSec)   },
  ];
  cards.forEach(c => {
    const card       = document.createElement("div");
    card.className   = "history-stat-card";
    card.innerHTML   =
      `<i class="fa-solid ${c.icon}"></i>` +
      `<span class="stat-value">${c.value}</span>` +
      `<span class="stat-label">${c.label}</span>`;
    summary.appendChild(card);
  });
  dom.historyContent.appendChild(summary);

  if (!state.practiceLog.length) {
    const empty       = document.createElement("p");
    empty.className   = "empty-state";
    empty.style.padding = "40px 24px";
    empty.textContent = "ยังไม่มีประวัติการฝึก — กด Play แล้วซ้อมอย่างน้อย 10 วินาที";
    dom.historyContent.appendChild(empty);
    return;
  }

  // ── Per-song aggregation ──────────────────────────────────────────────────
  const agg = aggregateBySong(state.practiceLog);
  const maxSec = agg[0]?.totalSec || 1;

  const songSection = makeHistorySection("เวลาต่อเพลง");
  agg.forEach(entry => {
    const row = document.createElement("div");
    row.className = "history-song-row";
    const pct = Math.round((entry.totalSec / maxSec) * 100);
    const isFav = state.favorites.has(entry.songId);
    row.innerHTML =
      `<span class="history-song-name">${isFav ? "★ " : ""}${entry.songTitle}</span>` +
      `<div class="history-bar-wrap">` +
        `<div class="history-bar" style="width:${pct}%"></div>` +
      `</div>` +
      `<span class="history-song-time">${formatLogDuration(entry.totalSec)}</span>`;
    songSection.list.appendChild(row);
  });
  dom.historyContent.appendChild(songSection.section);

  // ── Recent sessions ───────────────────────────────────────────────────────
  const recent = recentSessions(state.practiceLog, 30);
  const recentSection = makeHistorySection("ประวัติล่าสุด");
  recent.forEach(s => {
    const row = document.createElement("div");
    row.className = "history-session-row";
    const d = s.date || "";
    const displayDate = d
      ? new Intl.DateTimeFormat("th-TH", { day: "numeric", month: "short", year: "numeric" }).format(new Date(d))
      : "—";
    row.innerHTML =
      `<span class="session-date">${displayDate}</span>` +
      `<span class="session-title">${s.songTitle}</span>` +
      `<span class="session-dur">${formatLogDuration(s.durationSec)}</span>`;
    recentSection.list.appendChild(row);
  });
  dom.historyContent.appendChild(recentSection.section);
}

/** Helper: creates a labelled section with a list container. */
function makeHistorySection(title) {
  const section    = document.createElement("div");
  section.className = "history-section";
  const heading    = document.createElement("h3");
  heading.className = "history-section-title";
  heading.textContent = title;
  const list       = document.createElement("div");
  list.className   = "history-section-list";
  section.appendChild(heading);
  section.appendChild(list);
  return { section, list };
}

/* =========================
   Init
========================= */
async function initApp() {
  // Restore saved theme
  const savedTheme = localStorage.getItem("ukulele-theme") || "dark";
  applyTheme(savedTheme);

  // Restore saved Auto-Scroll preference (default: on)
  const savedAutoScroll = localStorage.getItem("ukulele-autoscroll");
  applyAutoScroll(savedAutoScroll === null ? true : savedAutoScroll === "on");

  // Restore saved Dancer preference (default: on)
  const savedDancer = localStorage.getItem("ukulele-dancer");
  applyDancer(savedDancer === null ? true : savedDancer === "on");

  // Restore saved Panel-Swap preference (default: off)
  const savedSwap = localStorage.getItem("ukulele-panel-swap");
  applyPanelSwap(savedSwap === "on");

  // Restore Favorites + Practice Log
  loadFavorites();
  loadPracticeLog();

  bindEvents();
  initLottieDancer();
  initStrumVisualizer();
  initMetroSoundBtns();
  initNotePickSheet();
  updateBpm(dom.bpmSlider.value);
  await loadSongs();

  // Commit any unsaved session when user closes/reloads the page
  window.addEventListener("beforeunload", () => {
    if (state.isPlaying) commitPracticeSession();
  });
}

initApp();
