"use strict";

/**
 * Ukulele Practice App
 * ใช้ Howler.js สำหรับเล่น MP3 และ Tone.js สำหรับ Metronome
 */

/* =========================
   ค่าเริ่มต้นและ State หลัก
========================= */

const SONGS_JSON_PATH = "songs.json";

const fallbackSongs = {
  songs: [
    {
      id: "176e8a9b-1234-5678-9abc-def012345678",
      title: "Ukulele Practice Demo",
      mp3: "songs/demo.mp3",
      bpm: 100,
      lyrics: [
        { time: 0, text: "เริ่มดีดคอร์ดแรกไปพร้อมจังหวะ" },
        { time: 5, text: "ค่อย ๆ ฟังเสียงและเปลี่ยนคอร์ดให้ทัน" },
        { time: 10, text: "รักษาจังหวะมือขวาให้สม่ำเสมอ" },
        { time: 15, text: "ซ้อมช้า ๆ ก่อน แล้วค่อยเพิ่มความเร็ว" }
      ],
      chords: [
        { time: 0, chord: "C" },
        { time: 4, chord: "G" },
        { time: 8, chord: "Am" },
        { time: 12, chord: "F" },
        { time: 16, chord: "C" }
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
  metroSynth: null
};

/* =========================
   DOM References
========================= */

const dom = {
  loadStatus: document.getElementById("loadStatus"),
  songSelect: document.getElementById("songSelect"),
  currentSongTitle: document.getElementById("currentSongTitle"),
  playPauseBtn: document.getElementById("playPauseBtn"),
  stopBtn: document.getElementById("stopBtn"),
  currentTime: document.getElementById("currentTime"),
  durationTime: document.getElementById("durationTime"),
  progressTrack: document.getElementById("progressTrack"),
  progressFill: document.getElementById("progressFill"),
  progressThumb: document.getElementById("progressThumb"),
  speedButtons: document.getElementById("speedButtons"),
  bpmSlider: document.getElementById("bpmSlider"),
  bpmValue: document.getElementById("bpmValue"),
  metroToggleBtn: document.getElementById("metroToggleBtn"),
  metroVisual: document.getElementById("metroVisual"),
  metroStateText: document.getElementById("metroStateText"),
  chordDisplay: document.getElementById("chordDisplay"),
  currentChordLabel: document.getElementById("currentChordLabel"),
  upcomingChords: document.getElementById("upcomingChords"),
  lyricsContainer: document.getElementById("lyricsContainer"),

  openAdminBtn: document.getElementById("openAdminBtn"),
  closeAdminBtn: document.getElementById("closeAdminBtn"),
  adminModal: document.getElementById("adminModal"),
  adminSongList: document.getElementById("adminSongList"),
  newSongBtn: document.getElementById("newSongBtn"),
  saveSongBtn: document.getElementById("saveSongBtn"),
  deleteSongBtn: document.getElementById("deleteSongBtn"),
  exportJsonBtn: document.getElementById("exportJsonBtn"),
  adminError: document.getElementById("adminError"),

  adminId: document.getElementById("adminId"),
  adminTitleInput: document.getElementById("adminTitleInput"),
  adminMp3: document.getElementById("adminMp3"),
  adminBpm: document.getElementById("adminBpm"),
  adminLyrics: document.getElementById("adminLyrics"),
  adminChords: document.getElementById("adminChords")
};

/* =========================
   Utility Functions
========================= */

/**
 * แปลงวินาทีเป็นรูปแบบ mm:ss
 */
function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";

  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);

  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

/**
 * สร้าง UUID สำหรับเพลงใหม่
 */
function createUUID() {
  if (crypto && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, char => {
    const random = Math.random() * 16 | 0;
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * ป้องกัน XSS จากข้อความที่แสดงบนหน้าเว็บ
 */
function escapeHTML(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

/**
 * ตรวจสอบรูปแบบข้อมูลเพลงเบื้องต้น
 */
function normalizeSongsData(data) {
  if (!data || !Array.isArray(data.songs)) {
    throw new Error("songs.json ต้องมี key ชื่อ songs และเป็น Array");
  }

  return data.songs.map(song => ({
    id: song.id || createUUID(),
    title: song.title || "Untitled Song",
    mp3: song.mp3 || "",
    bpm: Number(song.bpm) || 100,
    lyrics: Array.isArray(song.lyrics) ? song.lyrics : [],
    chords: Array.isArray(song.chords) ? song.chords : []
  }));
}

/**
 * หา index ปัจจุบันจาก array ที่มี time
 */
function findCurrentTimedIndex(items, currentSeconds) {
  let index = -1;

  for (let i = 0; i < items.length; i += 1) {
    if (currentSeconds >= Number(items[i].time)) {
      index = i;
    } else {
      break;
    }
  }

  return index;
}

/* =========================
   โหลด songs.json
========================= */

/**
 * โหลดข้อมูลเพลงจาก songs.json
 * ถ้าโหลดไม่ได้ จะใช้ fallback เพื่อให้หน้าเว็บยังทำงานได้
 */
async function loadSongs() {
  try {
    const response = await fetch(SONGS_JSON_PATH, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`โหลด songs.json ไม่สำเร็จ: ${response.status}`);
    }

    const data = await response.json();
    state.songs = normalizeSongsData(data);

    dom.loadStatus.textContent = "โหลดสำเร็จ";
  } catch (error) {
    console.error(error);
    state.songs = normalizeSongsData(fallbackSongs);
    dom.loadStatus.textContent = "ใช้ข้อมูลตัวอย่าง";
  }

  renderSongSelect();
  renderAdminSongList();

  if (state.songs.length > 0) {
    selectSong(state.songs[0].id);
  }
}

/**
 * แสดงรายการเพลงใน select
 */
function renderSongSelect() {
  dom.songSelect.innerHTML = "";

  if (state.songs.length === 0) {
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

/**
 * เลือกเพลงและเตรียม Howl instance
 */
function selectSong(songId) {
  const song = state.songs.find(item => item.id === songId);
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

  renderLyrics(song.lyrics);
  renderUpcomingChords(song.chords);
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
    },

    onpause: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
    },

    onstop: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
      resetProgress();
      updateTimedDisplays(0);
    },

    onend: () => {
      state.isPlaying = false;
      updatePlayPauseIcon();
      stopAnimationLoop();
      resetProgress();
    }
  });
}

/**
 * Howler html5 mode ใช้ audio element
 * browser ส่วนใหญ่รองรับ preservesPitch เพื่อปรับ speed โดย pitch ไม่เปลี่ยน
 */
function applyPreservePitch() {
  if (!state.sound || !state.sound._sounds) return;

  state.sound._sounds.forEach(soundItem => {
    const audioNode = soundItem && soundItem._node;

    if (audioNode) {
      audioNode.preservesPitch = true;
      audioNode.mozPreservesPitch = true;
      audioNode.webkitPreservesPitch = true;
      audioNode.playbackRate = state.speed;
    }
  });
}

/**
 * ลบ Howl instance เดิมออกจาก memory
 */
function unloadSound() {
  if (state.sound) {
    state.sound.unload();
    state.sound = null;
  }
}

/**
 * Play / Pause
 */
async function togglePlayPause() {
  if (!state.sound) return;

  if (state.isPlaying) {
    state.sound.pause();
    return;
  }

  state.sound.rate(state.speed);
  applyPreservePitch();
  state.sound.play();
}

/**
 * Stop เพลง
 */
function stopSong() {
  if (state.sound) {
    state.sound.stop();
  }

  state.isPlaying = false;
  updatePlayPauseIcon();
  stopAnimationLoop();
  resetProgress();
}

/**
 * อัปเดต icon ปุ่ม Play/Pause
 */
function updatePlayPauseIcon() {
  const icon = state.isPlaying ? "fa-pause" : "fa-play";
  dom.playPauseBtn.innerHTML = `<i class="fa-solid ${icon}"></i>`;
}

/**
 * ตั้งค่า speed
 */
function setSpeed(speed) {
  state.speed = Number(speed);

  document.querySelectorAll(".chip[data-speed]").forEach(button => {
    button.classList.toggle("active", Number(button.dataset.speed) === state.speed);
  });

  if (state.sound) {
    state.sound.rate(state.speed);
    applyPreservePitch();
  }
}

/**
 * รีเซ็ต progress bar
 */
function resetProgress() {
  dom.currentTime.textContent = "00:00";
  dom.progressFill.style.width = "0%";
  dom.progressThumb.style.left = "0%";
}

/**
 * Seek ไปยังตำแหน่งที่คลิกบน timeline
 */
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

/**
 * ใช้ requestAnimationFrame เพื่ออัปเดต progress / lyrics / chords
 */
function startAnimationLoop() {
  stopAnimationLoop();

  const tick = () => {
    if (!state.sound || !state.isPlaying) return;

    const currentTime = Number(state.sound.seek()) || 0;
    updateProgress(currentTime);
    updateTimedDisplays(currentTime);

    state.rafId = requestAnimationFrame(tick);
  };

  state.rafId = requestAnimationFrame(tick);
}

/**
 * หยุด animation frame
 */
function stopAnimationLoop() {
  if (state.rafId) {
    cancelAnimationFrame(state.rafId);
    state.rafId = null;
  }
}

/**
 * อัปเดต progress bar
 */
function updateProgress(currentSeconds) {
  const duration = state.duration || 0;
  const percent = duration > 0 ? Math.min((currentSeconds / duration) * 100, 100) : 0;

  dom.currentTime.textContent = formatTime(currentSeconds);
  dom.durationTime.textContent = formatTime(duration);
  dom.progressFill.style.width = `${percent}%`;
  dom.progressThumb.style.left = `${percent}%`;
}

/**
 * อัปเดต lyrics และ chords ตามเวลาปัจจุบัน
 */
function updateTimedDisplays(currentSeconds) {
  if (!state.selectedSong) return;

  updateCurrentLyric(currentSeconds);
  updateCurrentChord(currentSeconds);
}

/* =========================
   Lyrics Functions
========================= */

/**
 * Render เนื้อเพลง
 */
function renderLyrics(lyrics) {
  dom.lyricsContainer.innerHTML = "";

  if (!lyrics.length) {
    dom.lyricsContainer.innerHTML = `<p class="empty-state">ไม่มีเนื้อเพลง</p>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  lyrics.forEach((line, index) => {
    const p = document.createElement("p");
    p.className = "lyric-line";
    p.dataset.index = String(index);
    p.textContent = line.text;
    fragment.appendChild(p);
  });

  dom.lyricsContainer.appendChild(fragment);
}

/**
 * Highlight เนื้อเพลงบรรทัดปัจจุบันและเลื่อนอัตโนมัติ
 */
function updateCurrentLyric(currentSeconds) {
  const lyrics = state.selectedSong.lyrics;
  const nextIndex = findCurrentTimedIndex(lyrics, currentSeconds);

  if (nextIndex === state.currentLyricIndex) return;

  const prev = dom.lyricsContainer.querySelector(".lyric-line.active");
  if (prev) prev.classList.remove("active");

  const current = dom.lyricsContainer.querySelector(`[data-index="${nextIndex}"]`);

  if (current) {
    current.classList.add("active");
    current.scrollIntoView({
      behavior: "smooth",
      block: "center"
    });
  }

  state.currentLyricIndex = nextIndex;
}

/* =========================
   Chord Functions
========================= */

/**
 * แสดงคอร์ดใหญ่ตรงกลาง
 */
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

/**
 * แสดงคอร์ดที่จะมาถึง
 */
function renderUpcomingChords(chords) {
  dom.upcomingChords.innerHTML = "";

  if (!chords.length) {
    dom.upcomingChords.innerHTML = `<span class="empty-state">ไม่มีข้อมูลคอร์ด</span>`;
    return;
  }

  const fragment = document.createDocumentFragment();

  chords.forEach((item, index) => {
    const chip = document.createElement("span");
    chip.className = "upcoming-chip";
    chip.dataset.index = String(index);
    chip.textContent = item.chord;
    fragment.appendChild(chip);
  });

  dom.upcomingChords.appendChild(fragment);
}

/**
 * Highlight คอร์ดปัจจุบันพร้อม animation
 */
function updateCurrentChord(currentSeconds) {
  const chords = state.selectedSong.chords;
  const nextIndex = findCurrentTimedIndex(chords, currentSeconds);

  if (nextIndex === state.currentChordIndex) return;

  const prev = dom.upcomingChords.querySelector(".upcoming-chip.current");
  if (prev) prev.classList.remove("current");

  const currentChip = dom.upcomingChords.querySelector(`[data-index="${nextIndex}"]`);
  if (currentChip) currentChip.classList.add("current");

  if (nextIndex >= 0 && chords[nextIndex]) {
    setChordDisplay(chords[nextIndex].chord);
  }

  state.currentChordIndex = nextIndex;
}

/* =========================
   Metronome Functions
========================= */

/**
 * เตรียม Tone.js metronome
 */
function setupMetronome() {
  state.metroSynth = new Tone.MembraneSynth({
    pitchDecay: 0.015,
    octaves: 3,
    oscillator: { type: "sine" },
    envelope: {
      attack: 0.001,
      decay: 0.12,
      sustain: 0,
      release: 0.05
    }
  }).toDestination();

  state.metroLoop = new Tone.Loop(time => {
    state.metroSynth.triggerAttackRelease("C5", "16n", time);

    Tone.Draw.schedule(() => {
      flashMetronome();
    }, time);
  }, "4n");

  Tone.Transport.bpm.value = Number(dom.bpmSlider.value);
}

/**
 * เปิด/ปิด metronome
 */
async function toggleMetronome() {
  if (!state.metroLoop || !state.metroSynth) {
    setupMetronome();
  }

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

/**
 * อัปเดต BPM
 */
function updateBpm(value) {
  const bpm = Math.min(Math.max(Number(value), 30), 200);

  dom.bpmSlider.value = String(bpm);
  dom.bpmValue.textContent = String(bpm);

  if (Tone.Transport) {
    Tone.Transport.bpm.rampTo(bpm, 0.05);
  }
}

/**
 * ภาพกระพริบตามจังหวะ metronome
 */
function flashMetronome() {
  dom.metroVisual.classList.add("active");

  window.setTimeout(() => {
    dom.metroVisual.classList.remove("active");
  }, 90);
}

/* =========================
   Admin Functions
========================= */

/**
 * เปิด Admin modal
 */
function openAdminModal() {
  dom.adminModal.classList.add("open");
  dom.adminModal.setAttribute("aria-hidden", "false");

  renderAdminSongList();

  if (state.selectedSong) {
    fillAdminForm(state.selectedSong.id);
  }
}

/**
 * ปิด Admin modal
 */
function closeAdminModal() {
  dom.adminModal.classList.remove("open");
  dom.adminModal.setAttribute("aria-hidden", "true");
  clearAdminError();
}

/**
 * Render รายการเพลงใน Admin
 */
function renderAdminSongList() {
  dom.adminSongList.innerHTML = "";

  if (!state.songs.length) {
    dom.adminSongList.innerHTML = `<p class="empty-state">ยังไม่มีเพลง</p>`;
    return;
  }

  state.songs.forEach(song => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "admin-song-item";
    button.dataset.id = song.id;
    button.innerHTML = `
      <strong>${escapeHTML(song.title)}</strong><br>
      <small>${escapeHTML(song.mp3)}</small>
    `;

    if (song.id === state.adminSelectedId) {
      button.classList.add("active");
    }

    button.addEventListener("click", () => fillAdminForm(song.id));
    dom.adminSongList.appendChild(button);
  });
}

/**
 * เติมข้อมูลเพลงลงฟอร์ม Admin
 */
function fillAdminForm(songId) {
  const song = state.songs.find(item => item.id === songId);
  if (!song) return;

  state.adminSelectedId = song.id;

  dom.adminId.value = song.id;
  dom.adminTitleInput.value = song.title;
  dom.adminMp3.value = song.mp3;
  dom.adminBpm.value = String(song.bpm);
  dom.adminLyrics.value = JSON.stringify(song.lyrics, null, 2);
  dom.adminChords.value = JSON.stringify(song.chords, null, 2);

  clearAdminError();
  renderAdminSongList();
}

/**
 * เตรียมฟอร์มสำหรับเพิ่มเพลงใหม่
 */
function prepareNewSong() {
  const newId = createUUID();
  state.adminSelectedId = newId;

  dom.adminId.value = newId;
  dom.adminTitleInput.value = "New Song";
  dom.adminMp3.value = "songs/new-song.mp3";
  dom.adminBpm.value = "100";
  dom.adminLyrics.value = JSON.stringify([{ time: 0, text: "เนื้อเพลงบรรทัดแรก" }], null, 2);
  dom.adminChords.value = JSON.stringify([{ time: 0, chord: "C" }], null, 2);

  clearAdminError();
  renderAdminSongList();
}

/**
 * อ่านข้อมูลจากฟอร์ม Admin และ validate
 */
function getSongFromAdminForm() {
  const id = dom.adminId.value.trim() || createUUID();
  const title = dom.adminTitleInput.value.trim();
  const mp3 = dom.adminMp3.value.trim();
  const bpm = Number(dom.adminBpm.value);

  if (!title) throw new Error("กรุณากรอกชื่อเพลง");
  if (!mp3) throw new Error("กรุณากรอก MP3 Path เช่น songs/song1.mp3");
  if (!Number.isFinite(bpm) || bpm < 30 || bpm > 200) {
    throw new Error("BPM ต้องอยู่ระหว่าง 30-200");
  }

  let lyrics;
  let chords;

  try {
    lyrics = JSON.parse(dom.adminLyrics.value || "[]");
  } catch {
    throw new Error("Lyrics JSON ไม่ถูกต้อง");
  }

  try {
    chords = JSON.parse(dom.adminChords.value || "[]");
  } catch {
    throw new Error("Chords JSON ไม่ถูกต้อง");
  }

  if (!Array.isArray(lyrics)) throw new Error("Lyrics ต้องเป็น Array");
  if (!Array.isArray(chords)) throw new Error("Chords ต้องเป็น Array");

  lyrics.forEach(item => {
    if (typeof item.time !== "number" || typeof item.text !== "string") {
      throw new Error('Lyrics แต่ละรายการต้องเป็น { "time": number, "text": string }');
    }
  });

  chords.forEach(item => {
    if (typeof item.time !== "number" || typeof item.chord !== "string") {
      throw new Error('Chords แต่ละรายการต้องเป็น { "time": number, "chord": string }');
    }
  });

  return {
    id,
    title,
    mp3,
    bpm,
    lyrics: lyrics.sort((a, b) => a.time - b.time),
    chords: chords.sort((a, b) => a.time - b.time)
  };
}

/**
 * บันทึกเพลงจาก Admin form
 */
function saveSongFromAdmin() {
  try {
    const song = getSongFromAdminForm();
    const existingIndex = state.songs.findIndex(item => item.id === song.id);

    if (existingIndex >= 0) {
      state.songs[existingIndex] = song;
    } else {
      state.songs.push(song);
    }

    state.adminSelectedId = song.id;

    renderSongSelect();
    renderAdminSongList();
    selectSong(song.id);
    clearAdminError();
  } catch (error) {
    showAdminError(error.message);
  }
}

/**
 * ลบเพลง
 */
function deleteSongFromAdmin() {
  const id = dom.adminId.value.trim();
  if (!id) return;

  state.songs = state.songs.filter(song => song.id !== id);
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

/**
 * Export songs.json เพื่อดาวน์โหลด
 */
function exportSongsJson() {
  const data = JSON.stringify({ songs: state.songs }, null, 2);
  const blob = new Blob([data], { type: "application/json;charset=utf-8" });
  const url = URL.createObjectURL(blob);

  const link = document.createElement("a");
  link.href = url;
  link.download = "songs.json";
  document.body.appendChild(link);
  link.click();
  link.remove();

  URL.revokeObjectURL(url);
}

/**
 * แสดง error ใน Admin
 */
function showAdminError(message) {
  dom.adminError.hidden = false;
  dom.adminError.textContent = message;
}

/**
 * ล้าง error ใน Admin
 */
function clearAdminError() {
  dom.adminError.hidden = true;
  dom.adminError.textContent = "";
}

/* =========================
   Event Binding
========================= */

function bindEvents() {
  dom.songSelect.addEventListener("change", event => {
    selectSong(event.target.value);
  });

  dom.playPauseBtn.addEventListener("click", togglePlayPause);
  dom.stopBtn.addEventListener("click", stopSong);

  dom.speedButtons.addEventListener("click", event => {
    const button = event.target.closest("[data-speed]");
    if (!button) return;

    setSpeed(button.dataset.speed);
  });

  dom.progressTrack.addEventListener("click", event => {
    seekFromPointer(event.clientX);
  });

  dom.progressTrack.addEventListener("keydown", event => {
    if (!state.sound || !state.duration) return;

    const current = Number(state.sound.seek()) || 0;
    const step = event.shiftKey ? 10 : 5;

    if (event.key === "ArrowRight") {
      event.preventDefault();
      const target = Math.min(current + step, state.duration);
      state.sound.seek(target);
      updateProgress(target);
      updateTimedDisplays(target);
    }

    if (event.key === "ArrowLeft") {
      event.preventDefault();
      const target = Math.max(current - step, 0);
      state.sound.seek(target);
      updateProgress(target);
      updateTimedDisplays(target);
    }
  });

  dom.bpmSlider.addEventListener("input", event => {
    updateBpm(event.target.value);
  });

  dom.metroToggleBtn.addEventListener("click", toggleMetronome);

  dom.openAdminBtn.addEventListener("click", openAdminModal);
  dom.closeAdminBtn.addEventListener("click", closeAdminModal);

  dom.adminModal.addEventListener("click", event => {
    if (event.target === dom.adminModal) {
      closeAdminModal();
    }
  });

  dom.newSongBtn.addEventListener("click", prepareNewSong);
  dom.saveSongBtn.addEventListener("click", saveSongFromAdmin);
  dom.deleteSongBtn.addEventListener("click", deleteSongFromAdmin);
  dom.exportJsonBtn.addEventListener("click", exportSongsJson);

  window.addEventListener("keydown", event => {
    if (event.key === "Escape" && dom.adminModal.classList.contains("open")) {
      closeAdminModal();
    }
  });

  window.addEventListener("beforeunload", () => {
    stopAnimationLoop();

    if (state.sound) {
      state.sound.unload();
    }

    if (state.metroLoop) {
      state.metroLoop.dispose();
    }

    if (state.metroSynth) {
      state.metroSynth.dispose();
    }
  });
}

/* =========================
   Init App
========================= */

async function initApp() {
  bindEvents();
  updateBpm(dom.bpmSlider.value);
  await loadSongs();
}

initApp();
