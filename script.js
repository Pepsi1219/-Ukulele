"use strict";

/* =========================
   State
========================= */
const MANIFEST_JSON_PATH = "manifest.json";
const LYRICS_DIR  = "Lyrics";
const CHORDS_DIR  = "Chords";

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
  metroLoop: null,
  metroSynth: null,
  userScrolling: false,
  userScrollTimer: null,
  audioMode: null,        // "song" | "vocal" | null — must be set before audio loads
  autoScrollEnabled: true,// master toggle for lyric auto-scroll
  dancerEnabled: true,    // master toggle for dancing character visibility
  panelsSwapped: false    // false: Chord centre, Lyrics right | true: Lyrics centre, Chord right
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
  metroStateText:    document.getElementById("metroStateText"),
  chordDisplay:      document.getElementById("chordDisplay"),
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

  // Layout swap (Chord ↔ Lyrics)
  swapPanelsBtn:   document.getElementById("swapPanelsBtn"),
  mainGrid:        document.querySelector(".main-grid")
};

/* =========================
   Utility Functions
========================= */
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function createUUID() {
  if (crypto && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const r = Math.random() * 16 | 0;
    return (char === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });
}

function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;").replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;").replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

// Builds the final song object from a manifest entry + its lyrics & chords arrays
function buildSong(meta, lyricsArr, chordsArr) {
  const lyrics = Array.isArray(lyricsArr) ? lyricsArr : [];
  const explicit = Array.isArray(chordsArr) ? chordsArr : null;

  const chords = explicit
    ? explicit
        .map(c => ({ time: Number(c.time), chord: String(c.chord || "") }))
        .filter(c => Number.isFinite(c.time) && c.chord)
        .sort((a, b) => a.time - b.time)
    : buildChordsFromLyrics(lyrics);

  return {
    id:    meta.id || createUUID(),
    title: meta.title || "Untitled Song",
    mp3:   meta.mp3 || "",
    bpm:   Number(meta.bpm) || 100,
    lyrics,
    chords
  };
}

// Fallback ONLY — used when a song has no entry in chords.json.
// Takes the first chord-bearing segment of each lyric line.
// For precise mid-line chord changes, define them in chords.json instead.
function buildChordsFromLyrics(lyrics) {
  const chords = [];
  lyrics.forEach(entry => {
    if (!Array.isArray(entry.line)) return;
    const firstSeg = entry.line.find(seg => seg.chord);
    if (firstSeg) {
      chords.push({ time: Number(entry.time), chord: firstSeg.chord });
    }
  });
  return chords.sort((a, b) => a.time - b.time);
}

function findCurrentTimedIndex(items, currentSeconds) {
  let index = -1;
  for (let i = 0; i < items.length; i++) {
    if (currentSeconds >= Number(items[i].time)) index = i;
    else break;
  }
  return index;
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
  if (dom.autoScrollToggle) {
    dom.autoScrollToggle.classList.toggle("is-on",  state.autoScrollEnabled);
    dom.autoScrollToggle.classList.toggle("is-off", !state.autoScrollEnabled);
    dom.autoScrollToggle.setAttribute("aria-pressed", String(state.autoScrollEnabled));
  }
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
   Beat tempo (drives character dance speed)
========================= */
function setBeatTempo(bpm) {
  const beatSec = (60 / Math.max(bpm, 30)).toFixed(4);
  document.documentElement.style.setProperty("--beat-duration", `${beatSec}s`);
}

/* =========================
   Character Dance State
========================= */
function setCharPlaying(playing) {
  if (dom.danceCharWrap) {
    dom.danceCharWrap.classList.toggle("is-playing", playing);
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

    // For each song in manifest, fetch its lyrics + chords files in parallel.
    // Missing files are tolerated — that song just gets empty data.
    const songs = await Promise.all(manifest.songs.map(async meta => {
      const id = meta.id;
      const [lyricsArr, chordsArr] = await Promise.all([
        fetchJson(`${LYRICS_DIR}/${id}.json`).catch(err => {
          console.warn(`Lyrics/${id}.json not loaded:`, err.message);
          return [];
        }),
        fetchJson(`${CHORDS_DIR}/${id}.json`).catch(err => {
          console.warn(`Chords/${id}.json not loaded:`, err.message);
          return null;
        })
      ]);
      return buildSong(meta, lyricsArr, chordsArr);
    }));

    state.songs = songs;
    dom.loadStatus.textContent = "โหลดสำเร็จ";
  } catch (error) {
    console.error(error);
    // Fallback to embedded demo data
    state.songs = (fallbackSongs.songs || []).map(s =>
      buildSong(s, s.lyrics, null)
    );
    dom.loadStatus.textContent = "ใช้ข้อมูลตัวอย่าง";
  }

  renderSongSelect();
  // Default state: empty until user picks audio mode AND a song
  showIdleState();
}

function renderSongSelect() {
  dom.songSelect.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = state.songs.length ? "— เลือกเพลง —" : "ไม่มีเพลง";
  dom.songSelect.appendChild(placeholder);

  state.songs.forEach(song => {
    const option = document.createElement("option");
    option.value = song.id;
    option.textContent = song.title;
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

// Map a song's `mp3` field to the actual path for the current audio mode.
// "song"  → original `songs/<file>` path
// "vocal" → swap prefix to `vocal/<file>` (same filename)
function getMp3PathFor(song) {
  if (state.audioMode === "vocal") {
    if (!/^songs\//i.test(song.mp3)) {
      console.warn(`getMp3PathFor: "${song.mp3}" doesn't start with "songs/" — vocal swap skipped`);
      return song.mp3;
    }
    return song.mp3.replace(/^songs\//i, "vocal/");
  }
  return song.mp3;
}

/* =========================
   Idle / Empty State
========================= */
function showIdleState() {
  stopSong();
  unloadSound();
  state.currentLyricIndex = -1;
  state.currentChordIndex = -1;
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

  // Only proceed to load audio + render content if BOTH mode and song are picked
  if (state.audioMode) {
    loadSongAudio(song);
  } else {
    showIdleState();
  }
}

function loadSongAudio(song) {
  stopSong();
  unloadSound();

  state.currentLyricIndex = -1;
  state.currentChordIndex = -1;
  state.duration = 0;

  dom.currentSongTitle.textContent = song.title;
  dom.bpmSlider.value = String(song.bpm);
  dom.bpmValue.textContent = String(song.bpm);
  setBeatTempo(song.bpm);

  renderLyrics(song.lyrics);
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
      applyPreservePitch();
    },

    onloaderror: (_, error) => {
      console.error("MP3 load error:", error);
      dom.loadStatus.textContent = "โหลด MP3 ไม่สำเร็จ";
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
    },

    onpause: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
      setCharPlaying(false);
    },

    onstop: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
      resetProgress();
      updateTimedDisplays(0);
      setCharPlaying(false);
    },

    onend: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
      resetProgress();
      setCharPlaying(false);
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
  setCharPlaying(false);
}

function updatePlayPauseIcon() {
  dom.playPauseBtn.innerHTML = `<i class="fa-solid ${state.isPlaying ? "fa-pause" : "fa-play"}"></i>`;
}

// Seek by a relative offset in seconds (negative = backward, positive = forward)
function seekBy(deltaSeconds) {
  if (!state.sound || !state.duration) return;
  const current = Number(state.sound.seek()) || 0;
  const target  = Math.min(Math.max(current + deltaSeconds, 0), state.duration);
  state.sound.seek(target);
  updateProgress(target);
  updateTimedDisplays(target);
}

function setSpeed(speed) {
  state.speed = Number(speed);
  document.querySelectorAll(".chip[data-speed]").forEach(btn => {
    btn.classList.toggle("active", Number(btn.dataset.speed) === state.speed);
  });
  if (state.sound) { state.sound.rate(state.speed); applyPreservePitch(); }
}

function resetProgress() {
  dom.currentTime.textContent = "00:00";
  dom.progressFill.style.width = "0%";
  dom.progressThumb.style.left = "0%";
}

function seekFromPointer(clientX) {
  if (!state.sound || !state.duration) return;
  const rect = dom.progressTrack.getBoundingClientRect();
  const ratio = Math.min(Math.max((clientX - rect.left) / rect.width, 0), 1);
  const targetTime = ratio * state.duration;
  state.sound.seek(targetTime);
  updateProgress(targetTime);
  updateTimedDisplays(targetTime);
}

/* =========================
   Animation Loop
========================= */
function startAnimationLoop() {
  stopAnimationLoop();
  const tick = () => {
    if (!state.sound || !state.isPlaying) return;
    const t = Number(state.sound.seek()) || 0;
    updateProgress(t);
    updateTimedDisplays(t);
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
}

function updateTimedDisplays(currentSeconds) {
  if (!state.selectedSong) return;
  updateCurrentLyric(currentSeconds);
  updateCurrentChord(currentSeconds);
}

/* =========================
   Lyrics Functions
========================= */
function renderLyrics(lyrics) {
  dom.lyricsContainer.innerHTML = "";
  if (!lyrics || !lyrics.length) {
    dom.lyricsContainer.innerHTML = `<p class="empty-state">ไม่มีเนื้อเพลง</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();
  let lineIndex = 0;

  lyrics.forEach(entry => {
    if (entry.section) {
      const label = document.createElement("div");
      label.className = "lyric-section-label";
      label.textContent = `[ ${entry.section} ]`;
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
}

function getLyricLineEntries(lyrics) {
  return lyrics.filter(e => Array.isArray(e.line));
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
      current.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  state.currentLyricIndex = nextIndex;
}

/* =========================
   Chord Functions
========================= */
function setChordDisplay(chord) {
  dom.chordDisplay.innerHTML = "";
  if (!chord) {
    dom.chordDisplay.innerHTML = `<span class="empty-state">รอคอร์ดแรก...</span>`;
    dom.currentChordLabel.textContent = "-";
    return;
  }
  const badge = document.createElement("div");
  badge.className = "chord-badge";
  badge.textContent = chord;
  dom.chordDisplay.appendChild(badge);
  dom.currentChordLabel.textContent = chord;
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

/* =========================
   Metronome Functions
========================= */
function setupMetronome() {
  state.metroSynth = new Tone.MembraneSynth({
    pitchDecay: 0.015, octaves: 3,
    oscillator: { type: "sine" },
    envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 }
  }).toDestination();

  state.metroLoop = new Tone.Loop(time => {
    state.metroSynth.triggerAttackRelease("C5", "16n", time);
    Tone.Draw.schedule(() => { flashMetronome(); }, time);
  }, "4n");

  Tone.Transport.bpm.value = Number(dom.bpmSlider.value);
}

async function toggleMetronome() {
  if (!state.metroLoop || !state.metroSynth) setupMetronome();
  await Tone.start();
  state.metronomeOn = !state.metronomeOn;

  if (state.metronomeOn) {
    Tone.Transport.bpm.value = Number(dom.bpmSlider.value);
    state.metroLoop.start(0);
    Tone.Transport.start();
    dom.metroToggleBtn.innerHTML = `<i class="fa-solid fa-pause"></i> ปิด`;
    dom.metroStateText.textContent = "Metronome เปิดอยู่";
  } else {
    state.metroLoop.stop();
    Tone.Transport.stop();
    dom.metroToggleBtn.innerHTML = `<i class="fa-solid fa-play"></i> เปิด`;
    dom.metroStateText.textContent = "Metronome ปิดอยู่";
  }
}

function updateBpm(value) {
  const bpm = Math.min(Math.max(Number(value), 30), 200);
  dom.bpmSlider.value    = String(bpm);
  dom.bpmValue.textContent = String(bpm);
  if (Tone.Transport) Tone.Transport.bpm.rampTo(bpm, 0.05);
  setBeatTempo(bpm);
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

  bindEvents();
  updateBpm(dom.bpmSlider.value);
  await loadSongs();
}

initApp();
