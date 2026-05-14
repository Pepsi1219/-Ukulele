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
  adminSelectedId: null,
  metroLoop: null,
  metroSynth: null,
  userScrolling: false,
  userScrollTimer: null
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

  // Dance character
  danceCharWrap: document.getElementById("danceCharWrap"),

  // Admin
  openAdminBtn:    document.getElementById("openAdminBtn"),
  closeAdminBtn:   document.getElementById("closeAdminBtn"),
  adminModal:      document.getElementById("adminModal"),
  adminSongList:   document.getElementById("adminSongList"),
  newSongBtn:      document.getElementById("newSongBtn"),
  saveSongBtn:     document.getElementById("saveSongBtn"),
  deleteSongBtn:   document.getElementById("deleteSongBtn"),
  exportJsonBtn:   document.getElementById("exportJsonBtn"),
  adminError:      document.getElementById("adminError"),
  adminId:         document.getElementById("adminId"),
  adminTitleInput: document.getElementById("adminTitleInput"),
  adminMp3:        document.getElementById("adminMp3"),
  adminBpm:        document.getElementById("adminBpm"),
  adminLyrics:     document.getElementById("adminLyrics"),
  adminChords:     document.getElementById("adminChords")
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
  dom.themeIcon.className = `fa-solid ${theme === "dark" ? "fa-moon" : "fa-sun"}`;
  localStorage.setItem("ukulele-theme", theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute("data-theme");
  applyTheme(current === "dark" ? "light" : "dark");
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
  dom.danceCharWrap.classList.toggle("is-playing", playing);
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
  renderAdminSongList();
  if (state.songs.length > 0) selectSong(state.songs[0].id);
}

function renderSongSelect() {
  dom.songSelect.innerHTML = "";
  if (!state.songs.length) {
    dom.songSelect.innerHTML = `<option value="">ไม่มีเพลง</option>`;
    return;
  }
  state.songs.forEach(song => {
    const option = document.createElement("option");
    option.value = song.id;
    option.textContent = song.title;
    dom.songSelect.appendChild(option);
  });
}

/* =========================
   Player Functions
========================= */
function selectSong(songId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;

  stopSong();
  unloadSound();

  state.selectedSong = song;
  state.currentLyricIndex = -1;
  state.currentChordIndex = -1;
  state.duration = 0;

  dom.songSelect.value = song.id;
  dom.currentSongTitle.textContent = song.title;
  dom.bpmSlider.value = String(song.bpm);
  dom.bpmValue.textContent = String(song.bpm);
  setBeatTempo(song.bpm);

  renderLyrics(song.lyrics);
  resetProgress();
  setChordDisplay(null);

  state.sound = new Howl({
    src: [song.mp3],
    html5: true,
    preload: true,
    rate: state.speed,

    onload: () => {
      state.duration = state.sound.duration();
      dom.durationTime.textContent = formatTime(state.duration);
      dom.playPauseBtn.disabled = false;
      dom.stopBtn.disabled = false;
      applyPreservePitch();
    },

    onloaderror: (_, error) => {
      console.error("MP3 load error:", error);
      dom.loadStatus.textContent = "โหลด MP3 ไม่สำเร็จ";
      dom.playPauseBtn.disabled = true;
      dom.stopBtn.disabled = true;
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
    if (!state.userScrolling) {
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
   Admin Functions
========================= */
function openAdminModal() {
  dom.adminModal.classList.add("open");
  dom.adminModal.setAttribute("aria-hidden", "false");
  renderAdminSongList();
  if (state.selectedSong) fillAdminForm(state.selectedSong.id);
}

function closeAdminModal() {
  dom.adminModal.classList.remove("open");
  dom.adminModal.setAttribute("aria-hidden", "true");
  clearAdminError();
}

function renderAdminSongList() {
  dom.adminSongList.innerHTML = "";
  if (!state.songs.length) {
    dom.adminSongList.innerHTML = `<p class="empty-state">ยังไม่มีเพลง</p>`;
    return;
  }
  state.songs.forEach(song => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "admin-song-item";
    btn.dataset.id = song.id;
    btn.innerHTML = `<strong>${escapeHTML(song.title)}</strong><br><small>${escapeHTML(song.mp3)}</small>`;
    if (song.id === state.adminSelectedId) btn.classList.add("active");
    btn.addEventListener("click", () => fillAdminForm(song.id));
    dom.adminSongList.appendChild(btn);
  });
}

function fillAdminForm(songId) {
  const song = state.songs.find(s => s.id === songId);
  if (!song) return;
  state.adminSelectedId = song.id;
  dom.adminId.value       = song.id;
  dom.adminTitleInput.value = song.title;
  dom.adminMp3.value      = song.mp3;
  dom.adminBpm.value      = String(song.bpm);
  dom.adminLyrics.value   = JSON.stringify(song.lyrics, null, 2);
  dom.adminChords.value   = "// Auto-generated from lyrics\n" + JSON.stringify(song.chords, null, 2);
  clearAdminError();
  renderAdminSongList();
}

function prepareNewSong() {
  const newId = createUUID();
  state.adminSelectedId = newId;
  dom.adminId.value       = newId;
  dom.adminTitleInput.value = "New Song";
  dom.adminMp3.value      = "songs/new-song.mp3";
  dom.adminBpm.value      = "100";
  dom.adminLyrics.value   = JSON.stringify([
    { time: 0, section: "Verse" },
    { time: 0, line: [{ chord: "C", lyric: "เนื้อเพลงบรรทัดแรก" }] }
  ], null, 2);
  dom.adminChords.value   = "// Auto-generated from lyrics";
  clearAdminError();
  renderAdminSongList();
}

function getSongFromAdminForm() {
  const id    = dom.adminId.value.trim() || createUUID();
  const title = dom.adminTitleInput.value.trim();
  const mp3   = dom.adminMp3.value.trim();
  const bpm   = Number(dom.adminBpm.value);

  if (!title) throw new Error("กรุณากรอกชื่อเพลง");
  if (!mp3)   throw new Error("กรุณากรอก MP3 Path เช่น songs/song1.mp3");
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 200) throw new Error("BPM ต้องอยู่ระหว่าง 30-200");

  let lyrics;
  try { lyrics = JSON.parse(dom.adminLyrics.value || "[]"); }
  catch { throw new Error("Lyrics JSON ไม่ถูกต้อง"); }

  if (!Array.isArray(lyrics)) throw new Error("Lyrics ต้องเป็น Array");
  lyrics.forEach(entry => {
    if (typeof entry.time !== "number") throw new Error('แต่ละ entry ต้องมี "time": number');
    if (entry.line && !Array.isArray(entry.line)) throw new Error('"line" ต้องเป็น Array');
  });

  const sortedLyrics = lyrics.sort((a, b) => a.time - b.time);
  return { id, title, mp3, bpm, lyrics: sortedLyrics, chords: buildChordsFromLyrics(sortedLyrics) };
}

function saveSongFromAdmin() {
  try {
    const song = getSongFromAdminForm();
    const idx  = state.songs.findIndex(s => s.id === song.id);
    if (idx >= 0) state.songs[idx] = song;
    else state.songs.push(song);
    state.adminSelectedId = song.id;
    renderSongSelect();
    renderAdminSongList();
    selectSong(song.id);
    clearAdminError();
  } catch (error) { showAdminError(error.message); }
}

function deleteSongFromAdmin() {
  const id = dom.adminId.value.trim();
  if (!id) return;
  state.songs = state.songs.filter(s => s.id !== id);
  state.adminSelectedId = null;
  renderSongSelect();
  renderAdminSongList();
  if (state.songs.length > 0) {
    selectSong(state.songs[0].id);
    fillAdminForm(state.songs[0].id);
  } else {
    stopSong();
    unloadSound();
    prepareNewSong();
  }
}

function exportSongsJson() {
  const exportData = {
    songs: state.songs.map(s => ({ id: s.id, title: s.title, mp3: s.mp3, bpm: s.bpm, lyrics: s.lyrics }))
  };
  const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json;charset=utf-8" });
  const url  = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href     = url;
  link.download = "songs.json";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function showAdminError(message) { dom.adminError.hidden = false; dom.adminError.textContent = message; }
function clearAdminError()       { dom.adminError.hidden = true;  dom.adminError.textContent = ""; }

/* =========================
   Event Binding
========================= */
function bindEvents() {
  dom.songSelect.addEventListener("change", e => { selectSong(e.target.value); });
  dom.playPauseBtn.addEventListener("click", togglePlayPause);
  dom.stopBtn.addEventListener("click", stopSong);

  dom.speedButtons.addEventListener("click", e => {
    const btn = e.target.closest("[data-speed]");
    if (btn) setSpeed(btn.dataset.speed);
  });

  dom.progressTrack.addEventListener("click", e => { seekFromPointer(e.clientX); });

  dom.progressTrack.addEventListener("keydown", e => {
    if (!state.sound || !state.duration) return;
    const current = Number(state.sound.seek()) || 0;
    const step = e.shiftKey ? 10 : 5;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      const t = Math.min(current + step, state.duration);
      state.sound.seek(t); updateProgress(t); updateTimedDisplays(t);
    }
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      const t = Math.max(current - step, 0);
      state.sound.seek(t); updateProgress(t); updateTimedDisplays(t);
    }
  });

  dom.lyricsContainer.addEventListener("scroll", () => {
    state.userScrolling = true;
    clearTimeout(state.userScrollTimer);
    state.userScrollTimer = setTimeout(() => { state.userScrolling = false; }, 3000);
  }, { passive: true });

  dom.bpmSlider.addEventListener("input", e => { updateBpm(e.target.value); });
  dom.metroToggleBtn.addEventListener("click", toggleMetronome);

  dom.themeToggleBtn.addEventListener("click", toggleTheme);

  dom.openAdminBtn.addEventListener("click", openAdminModal);
  dom.closeAdminBtn.addEventListener("click", closeAdminModal);
  dom.adminModal.addEventListener("click", e => { if (e.target === dom.adminModal) closeAdminModal(); });

  dom.newSongBtn.addEventListener("click", prepareNewSong);
  dom.saveSongBtn.addEventListener("click", saveSongFromAdmin);
  dom.deleteSongBtn.addEventListener("click", deleteSongFromAdmin);
  dom.exportJsonBtn.addEventListener("click", exportSongsJson);

  window.addEventListener("keydown", e => {
    if (e.key === "Escape" && dom.adminModal.classList.contains("open")) closeAdminModal();
  });

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

  bindEvents();
  updateBpm(dom.bpmSlider.value);
  await loadSongs();
}

initApp();
