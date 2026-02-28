/* =========================================================
   timer.js — PHS Quick Timer (FULL)
   - Presets + nudges
   - Minutes/seconds mode
   - Drift-proof end timestamp
   - Persist running timer across reload/PWA resume
   - Options dialog focus trap + scroll lock
   - Live region announcements
   ========================================================= */

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);

function storageOK() {
  try {
    const k = "__storage_test__";
    localStorage.setItem(k, "1");
    localStorage.removeItem(k);
    return true;
  } catch (e) {
    return false;
  }
}
const CAN_STORE = storageOK();

function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

function mmss(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
function ss(totalSeconds) {
  return `${Math.max(0, totalSeconds)}s`;
}
function formatDisplay(seconds, mode) {
  return mode === "seconds" ? ss(seconds) : mmss(seconds);
}
function announce(msg) {
  const lr = $("liveRegion");
  if (!lr) return;
  lr.textContent = "";               // force SR to re-announce
  setTimeout(() => (lr.textContent = msg), 20);
}

/* ================= OPTIONS MENU (DIALOG) ================= */
const optionsBtn = $("optionsBtn");
const optionsMenu = $("optionsMenu");
const closeMenuBtn = $("closeMenu");
const menuHeader = $("menuHeader");

let lastFocusEl = null;
let dragStartY = null;
let isMenuOpen = false;

function lockScroll(on) {
  document.body.classList.toggle("noScroll", !!on);
}

function focusFirstInMenu() {
  const preferred = $("fullscreenBtn");
  if (preferred) preferred.focus();
  else closeMenuBtn?.focus();
}

function getFocusable(container) {
  const sel = [
    'button:not([disabled])',
    'a[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])'
  ].join(",");
  return Array.from(container.querySelectorAll(sel))
    .filter(el => el.offsetParent !== null);
}

function trapTabKey(e) {
  if (!isMenuOpen || e.key !== "Tab") return;
  const focusables = getFocusable(optionsMenu);
  if (!focusables.length) return;

  const first = focusables[0];
  const last = focusables[focusables.length - 1];
  const active = document.activeElement;

  if (e.shiftKey) {
    if (active === first || !optionsMenu.contains(active)) {
      e.preventDefault();
      last.focus();
    }
  } else {
    if (active === last) {
      e.preventDefault();
      first.focus();
    }
  }
}

function openMenu() {
  if (isMenuOpen) return;
  lastFocusEl = document.activeElement;
  optionsMenu.classList.remove("hidden");
  optionsBtn.setAttribute("aria-expanded", "true");
  isMenuOpen = true;
  lockScroll(true);
  focusFirstInMenu();
}

function closeMenu() {
  if (!isMenuOpen) return;
  optionsMenu.classList.add("hidden");
  optionsBtn.setAttribute("aria-expanded", "false");
  isMenuOpen = false;
  lockScroll(false);
  optionsMenu.style.transform = "";
  if (lastFocusEl && typeof lastFocusEl.focus === "function") lastFocusEl.focus();
}

function toggleMenu() {
  optionsMenu.classList.contains("hidden") ? openMenu() : closeMenu();
}

optionsBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });

["pointerdown", "click"].forEach(evt => {
  closeMenuBtn.addEventListener(evt, (e) => {
    e.preventDefault();
    e.stopPropagation();
    closeMenu();
  });
});

document.addEventListener("pointerdown", (e) => {
  if (!isMenuOpen) return;
  if (!optionsMenu.contains(e.target) && e.target !== optionsBtn) closeMenu();
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && isMenuOpen) closeMenu();
  trapTabKey(e);
});

/* Drag-down to close (with slight follow) */
menuHeader.addEventListener("pointerdown", (e) => {
  dragStartY = e.clientY;
  menuHeader.setPointerCapture(e.pointerId);
});
menuHeader.addEventListener("pointermove", (e) => {
  if (dragStartY === null) return;
  const dy = e.clientY - dragStartY;
  const follow = clamp(dy, 0, 140);
  optionsMenu.style.transform = `translateY(${follow}px)`;
  if (dy > 90) {
    dragStartY = null;
    closeMenu();
  }
});
menuHeader.addEventListener("pointerup", () => { dragStartY = null; optionsMenu.style.transform = ""; });
menuHeader.addEventListener("pointercancel", () => { dragStartY = null; optionsMenu.style.transform = ""; });

/* ================= FULLSCREEN ================= */
$("fullscreenBtn").addEventListener("click", async () => {
  try {
    if (!document.fullscreenElement) {
      await document.documentElement.requestFullscreen();
      $("fullscreenBtn").textContent = "Exit full screen";
    } else {
      await document.exitFullscreen();
      $("fullscreenBtn").textContent = "Full screen";
    }
  } catch (e) {
    alert("Fullscreen blocked by the browser. Try pressing F11.");
  }
});
document.addEventListener("fullscreenchange", () => {
  $("fullscreenBtn").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
});

/* ================= NAV BUTTON ================= */
$("goPHSTimerBtn").addEventListener("click", () => {
  window.location.href = "index.html";
});

/* ================= AUDIO ================= */
let audioCtx = null;
const VOL_KEY = "trial_timer_volume_v2";

function getVolume() { return Number($("volume").value) / 100; }

function ensureAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}

function beep(freq = 880, durationMs = 220, type = "sine", gain = 0.25) {
  ensureAudio();
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  const vol = gain * getVolume();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(vol, t0 + 0.02);
  g.gain.linearRampToValueAtTime(0.0001, t0 + durationMs / 1000);

  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs / 1000 + 0.05);
}

function playFinishSound(soundType) {
  if (soundType === "beep") {
    beep(880, 240, "sine", 0.35);
    return;
  }
  if (soundType === "double") {
    beep(740, 160, "sine", 0.33);
    setTimeout(() => beep(920, 180, "sine", 0.33), 170);
    return;
  }
  // default chime
  beep(660, 140, "sine", 0.35);
  setTimeout(() => beep(880, 160, "sine", 0.35), 120);
  setTimeout(() => beep(990, 180, "sine", 0.35), 250);
}

function loadVolume() {
  if (!CAN_STORE) return;
  const v = localStorage.getItem(VOL_KEY);
  if (v !== null) $("volume").value = v;
}
$("volume").addEventListener("input", () => {
  if (!CAN_STORE) return;
  localStorage.setItem(VOL_KEY, $("volume").value);
});

/* ================= WAKE LOCK ================= */
let wakeLock = null;

async function setWakeLock(on) {
  if (!("wakeLock" in navigator)) {
    if (on) alert("Wake Lock not supported on this browser/device.");
    $("wakeLockOn").checked = false;
    return;
  }
  try {
    if (on) {
      wakeLock = await navigator.wakeLock.request("screen");
    } else {
      if (wakeLock) await wakeLock.release();
      wakeLock = null;
    }
  } catch (e) {
    $("wakeLockOn").checked = false;
    alert("Couldn't enable Keep awake (permission/device limitation).");
  }
}
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && $("wakeLockOn").checked) {
    setWakeLock(true);
  }
});

/* ================= TIMER CORE ================= */
const TimerWidget = (() => {
  const KEY_MODE = "trial_timer_mode_v1";
  const KEY_VAL = "trial_timer_value_v1";
  const KEY_ENDSOUND = "trial_timer_end_sound_v3";
  const KEY_REPEAT = "trial_timer_repeat_v1";
  const KEY_PROGRESS = "trial_timer_progress_v2";
  const KEY_WAKE = "trial_timer_wake_v2";
  const KEY_SOUND = "trial_timer_sound_v1";

  const KEY_RUNNING = "trial_timer_running_v1";
  const KEY_ENDAT = "trial_timer_endat_epoch_v1";
  const KEY_DUR = "trial_timer_duration_sec_v1";
  const KEY_REM = "trial_timer_remaining_sec_v1";

  const el = {
    timeDisplay: $("timeDisplay"),
    timeHint: $("timeHint"),
    subLabel: $("subLabel"),
    stateChip: $("stateChip"),
    startPauseBtn: $("startPauseBtn"),
    resetBtn: $("resetBtn"),
    timeBtn: $("timeBtn"),
    progressTrack: $("progressTrack"),
    progressFill: $("progressFill"),
    mainRange: $("mainRange"),
    mainValueLabel: $("mainValueLabel"),
    mainValueUnit: $("mainValueUnit"),
    sliderLabel: $("sliderLabel"),
    presetRow: $("presetRow"),
    presetLabel: $("presetLabel"),
    presetHint: $("presetHint"),

    endSoundOn: $("endSoundOn"),
    repeatChimeOn: $("repeatChimeOn"),
    progressOn: $("progressOn"),
    wakeLockOn: $("wakeLockOn"),
    secondsModeOn: $("secondsModeOn"),
    soundType: $("soundType"),

    minus30Btn: $("minus30Btn"),
    plus30Btn: $("plus30Btn"),
    minus1mBtn: $("minus1mBtn"),
    plus1mBtn: $("plus1mBtn"),
  };

  let mode = "minutes";
  let durationSec = 5 * 60;
  let remainingSec = durationSec;
  let running = false;

  let rafId = null;
  let endAtEpochMs = 0;
  let finishedThisRun = false;
  let repeatInterval = null;

  function stopLoop() {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = null;
  }
  function clearRepeat() {
    if (repeatInterval) clearInterval(repeatInterval);
    repeatInterval = null;
  }

  function setBgByState() {
    if (!running && remainingSec === durationSec) {
      document.body.style.backgroundColor = "var(--bgGrey)";
      return;
    }
    if (!running && remainingSec === 0) {
      document.body.style.backgroundColor = "var(--bgGreen)";
      return;
    }
    const pctLeft = durationSec ? (remainingSec / durationSec) : 0;
    if (pctLeft <= 0.2) document.body.style.backgroundColor = "var(--bgRed)";
    else document.body.style.backgroundColor = "var(--bgOrange)";
  }

  function setProgressVisible(on) {
    el.progressTrack.classList.toggle("hidden", !on);
    el.progressTrack.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function savePrefs() {
    if (!CAN_STORE) return;
    try {
      localStorage.setItem(KEY_MODE, mode);
      localStorage.setItem(KEY_VAL, mode === "minutes" ? String(Math.round(durationSec / 60)) : String(durationSec));
      localStorage.setItem(KEY_ENDSOUND, el.endSoundOn.checked ? "1" : "0");
      localStorage.setItem(KEY_REPEAT, el.repeatChimeOn.checked ? "1" : "0");
      localStorage.setItem(KEY_PROGRESS, el.progressOn.checked ? "1" : "0");
      localStorage.setItem(KEY_WAKE, el.wakeLockOn.checked ? "1" : "0");
      localStorage.setItem(KEY_SOUND, el.soundType.value || "chime");
    } catch (e) {}
  }

  function saveRunState() {
    if (!CAN_STORE) return;
    try {
      localStorage.setItem(KEY_RUNNING, running ? "1" : "0");
      localStorage.setItem(KEY_DUR, String(durationSec));
      localStorage.setItem(KEY_REM, String(remainingSec));
      if (running) localStorage.setItem(KEY_ENDAT, String(endAtEpochMs));
      else localStorage.removeItem(KEY_ENDAT);
    } catch (e) {}
  }

  function loadPrefs() {
    if (!CAN_STORE) return;
    try {
      const m = localStorage.getItem(KEY_MODE);
      if (m === "seconds" || m === "minutes") mode = m;

      const rawVal = localStorage.getItem(KEY_VAL);
      if (rawVal !== null) {
        if (mode === "minutes") {
          const mins = clamp(Number(rawVal) || 5, 1, 15);
          durationSec = mins * 60;
        } else {
          const secs = clamp(Number(rawVal) || 60, 10, 300);
          durationSec = Math.round(secs);
        }
      }

      el.endSoundOn.checked = localStorage.getItem(KEY_ENDSOUND) === "1";
      el.repeatChimeOn.checked = localStorage.getItem(KEY_REPEAT) === "1";

      const progOn = localStorage.getItem(KEY_PROGRESS);
      el.progressOn.checked = (progOn === null) ? true : (progOn === "1");

      el.wakeLockOn.checked = localStorage.getItem(KEY_WAKE) === "1";

      const s = localStorage.getItem(KEY_SOUND);
      el.soundType.value = s || "chime";

      el.secondsModeOn.checked = (mode === "seconds");
    } catch (e) {}
  }

  function loadRunState() {
    if (!CAN_STORE) return;
    try {
      const wasRunning = localStorage.getItem(KEY_RUNNING) === "1";
      const dur = Number(localStorage.getItem(KEY_DUR));
      const rem = Number(localStorage.getItem(KEY_REM));
      const endAt = Number(localStorage.getItem(KEY_ENDAT));

      if (Number.isFinite(dur) && dur > 0) durationSec = dur;
      remainingSec = Number.isFinite(rem) ? clamp(Math.round(rem), 0, 24 * 3600) : durationSec;

      if (wasRunning && Number.isFinite(endAt) && endAt > 0) {
        const now = Date.now();
        remainingSec = Math.max(0, Math.ceil((endAt - now) / 1000));
        endAtEpochMs = endAt;
        running = remainingSec > 0;
        finishedThisRun = false;
      } else {
        running = false;
      }
    } catch (e) {}
  }

  function buildPresets() {
    el.presetRow.innerHTML = "";
    const presets = (mode === "minutes") ? [1, 2, 3, 5, 10, 15] : [10, 20, 30, 45, 60, 90];
    el.presetLabel.textContent = `Presets (${mode === "minutes" ? "minutes" : "seconds"})`;

    presets.forEach((v, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "presetBtn";
      b.textContent = (mode === "minutes") ? `${v}m` : `${v}s`;
      b.dataset.presetIndex = String(i + 1);
      b.addEventListener("click", () => {
        if (mode === "minutes") setDurationMinutes(v, { reset: true });
        else setDurationSeconds(v, { reset: true });
        announce(`Preset set: ${b.textContent}`);
      });
      el.presetRow.appendChild(b);
    });
  }

  function syncSliderToDuration() {
    if (mode === "minutes") {
      const mins = clamp(Math.round(durationSec / 60), 1, 15);
      el.mainRange.min = "1";
      el.mainRange.max = "15";
      el.mainRange.step = "1";
      el.mainRange.value = String(mins);
      el.sliderLabel.textContent = "Minutes";
      el.mainValueLabel.textContent = String(mins);
      el.mainValueUnit.textContent = "min";
    } else {
      const secs = clamp(Math.round(durationSec), 10, 300);
      el.mainRange.min = "10";
      el.mainRange.max = "300";
      el.mainRange.step = "10";
      el.mainRange.value = String(secs);
      el.sliderLabel.textContent = "Seconds";
      el.mainValueLabel.textContent = String(secs);
      el.mainValueUnit.textContent = "sec";
    }
  }

  function setUI() {
    el.timeDisplay.textContent = formatDisplay(remainingSec, mode);

    const pctDone = durationSec ? (1 - (remainingSec / durationSec)) : 1;
    el.progressFill.style.width = `${clamp(pctDone * 100, 0, 100)}%`;

    let chip = "READY";
    if (running) chip = "RUNNING";
    else if (remainingSec === 0) chip = "DONE";
    else if (remainingSec !== durationSec) chip = "PAUSED";
    el.stateChip.textContent = chip;

    const startLabel = running ? "Pause" : (remainingSec === 0 ? "Restart" : "Start");
    el.startPauseBtn.textContent = startLabel;
    el.startPauseBtn.setAttribute("aria-pressed", running ? "true" : "false");

    if (remainingSec === 0) {
      el.timeHint.textContent = "Finished • Reset or Restart";
      el.subLabel.textContent = "TIME'S UP";
    } else if (running) {
      el.timeHint.textContent = "Running… click time to pause";
      el.subLabel.textContent = "CLICK TIME TO START / PAUSE";
    } else {
      el.timeHint.textContent = (remainingSec === durationSec)
        ? "Set time below • then click to start"
        : "Paused • click time to resume";
      el.subLabel.textContent = "CLICK TIME TO START / PAUSE";
    }

    setBgByState();
  }

  function tickLoop() {
    if (!running) return;

    const now = Date.now();
    remainingSec = Math.max(0, Math.ceil((endAtEpochMs - now) / 1000));
    setUI();
    saveRunState();

    if (remainingSec === 0) {
      running = false;
      stopLoop();
      saveRunState();
      setUI();

      if (!finishedThisRun) {
        finishedThisRun = true;
        if (el.endSoundOn.checked) {
          playFinishSound(el.soundType.value || "chime");
        }
        announce("Time's up");
      }

      clearRepeat();
      if (el.repeatChimeOn.checked && el.endSoundOn.checked) {
        repeatInterval = setInterval(() => {
          if (remainingSec !== 0) return;
          playFinishSound(el.soundType.value || "chime");
        }, 10000);
      }

      return;
    }

    rafId = requestAnimationFrame(tickLoop);
  }

  function start() {
    if (remainingSec === 0) remainingSec = durationSec;
    if (running) return;

    finishedThisRun = false;
    clearRepeat();

    running = true;
    endAtEpochMs = Date.now() + remainingSec * 1000;
    saveRunState();
    setUI();
    stopLoop();
    rafId = requestAnimationFrame(tickLoop);
    announce("Running");
  }

  function pause() {
    if (!running) return;
    running = false;
    remainingSec = Math.max(0, Math.ceil((endAtEpochMs - Date.now()) / 1000));
    stopLoop();
    saveRunState();
    setUI();
    announce("Paused");
  }

  function toggleStartPause() {
    running ? pause() : start();
  }

  function reset() {
    pause();
    clearRepeat();
    remainingSec = durationSec;
    finishedThisRun = false;
    saveRunState();
    setUI();
    announce("Reset");
  }

  function setMode(newMode, { reset = true } = {}) {
    mode = (newMode === "seconds") ? "seconds" : "minutes";
    el.secondsModeOn.checked = (mode === "seconds");

    if (mode === "minutes") {
      const mins = clamp(Math.round(durationSec / 60) || 1, 1, 15);
      durationSec = mins * 60;
    } else {
      const secs = clamp(Math.round(durationSec), 10, 300);
      durationSec = Math.round(secs / 10) * 10;
    }

    if (reset || !running) remainingSec = durationSec;

    buildPresets();
    syncSliderToDuration();
    savePrefs();
    saveRunState();
    setUI();
  }

  function setDurationMinutes(mins, { reset = false } = {}) {
    const m = clamp(Number(mins) || 5, 1, 15);
    durationSec = Math.round(m) * 60;
    if (reset || !running) remainingSec = durationSec;
    syncSliderToDuration();
    savePrefs();
    saveRunState();
    setUI();
  }

  function setDurationSeconds(secs, { reset = false } = {}) {
    const s = clamp(Number(secs) || 60, 10, 300);
    durationSec = Math.round(s / 10) * 10;
    if (reset || !running) remainingSec = durationSec;
    syncSliderToDuration();
    savePrefs();
    saveRunState();
    setUI();
  }

  function nudge(deltaSec) {
    const newDur = clamp(durationSec + deltaSec, 1, 24 * 3600);
    const newRem = clamp(remainingSec + deltaSec, 0, newDur);

    durationSec = newDur;
    remainingSec = newRem;

    if (running) endAtEpochMs = endAtEpochMs + deltaSec * 1000;

    if (mode === "minutes") {
      const mins = clamp(Math.round(durationSec / 60), 1, 15);
      durationSec = mins * 60;
      if (!running) remainingSec = clamp(remainingSec, 0, durationSec);
      else endAtEpochMs = Date.now() + remainingSec * 1000;
    } else {
      const secs = clamp(Math.round(durationSec / 10) * 10, 10, 300);
      durationSec = secs;
      if (!running) remainingSec = clamp(remainingSec, 0, durationSec);
      else endAtEpochMs = Date.now() + remainingSec * 1000;
    }

    syncSliderToDuration();
    savePrefs();
    saveRunState();
    setUI();
  }

  function syncFromCheckboxes() {
    setProgressVisible(el.progressOn.checked);
    setUI();
  }

  function wire() {
    el.mainRange.addEventListener("input", () => {
      if (mode === "minutes") setDurationMinutes(el.mainRange.value, { reset: true });
      else setDurationSeconds(el.mainRange.value, { reset: true });
    });

    el.timeBtn.addEventListener("click", () => {
      if (el.endSoundOn.checked) ensureAudio();
      toggleStartPause();
    });
    el.startPauseBtn.addEventListener("click", () => {
      if (el.endSoundOn.checked) ensureAudio();
      toggleStartPause();
    });
    el.resetBtn.addEventListener("click", reset);

    el.minus30Btn.addEventListener("click", () => nudge(-30));
    el.plus30Btn.addEventListener("click", () => nudge(+30));
    el.minus1mBtn.addEventListener("click", () => nudge(-60));
    el.plus1mBtn.addEventListener("click", () => nudge(+60));

    el.endSoundOn.addEventListener("change", () => {
      savePrefs();
      if (el.endSoundOn.checked) ensureAudio();
    });

    el.soundType.addEventListener("change", savePrefs);

    el.repeatChimeOn.addEventListener("change", () => {
      savePrefs();
      if (remainingSec === 0) {
        clearRepeat();
        if (el.repeatChimeOn.checked && el.endSoundOn.checked) {
          repeatInterval = setInterval(() => {
            if (remainingSec !== 0) return;
            playFinishSound(el.soundType.value || "chime");
          }, 10000);
        }
      }
    });

    el.progressOn.addEventListener("change", () => {
      setProgressVisible(el.progressOn.checked);
      savePrefs();
      setUI();
    });

    el.wakeLockOn.addEventListener("change", () => {
      setWakeLock(el.wakeLockOn.checked);
      savePrefs();
    });

    el.secondsModeOn.addEventListener("change", () => {
      setMode(el.secondsModeOn.checked ? "seconds" : "minutes", { reset: true });
      announce(el.secondsModeOn.checked ? "Seconds mode" : "Minutes mode");
    });

    $("resetAllBtn").addEventListener("click", () => {
      if (CAN_STORE) {
        [
          KEY_MODE, KEY_VAL, KEY_ENDSOUND, KEY_REPEAT, KEY_PROGRESS, KEY_WAKE, KEY_SOUND,
          KEY_RUNNING, KEY_ENDAT, KEY_DUR, KEY_REM,
          VOL_KEY
        ].forEach(k => localStorage.removeItem(k));
      }

      $("volume").value = "40";
      el.endSoundOn.checked = false;
      el.repeatChimeOn.checked = false;
      el.progressOn.checked = true;
      el.wakeLockOn.checked = false;
      el.soundType.value = "chime";
      clearRepeat();
      setWakeLock(false);

      running = false;
      stopLoop();

      mode = "minutes";
      el.secondsModeOn.checked = false;

      durationSec = 5 * 60;
      remainingSec = durationSec;

      setProgressVisible(true);
      buildPresets();
      syncSliderToDuration();
      savePrefs();
      saveRunState();
      setUI();
      closeMenu();
      announce("Reset all");
    });

    document.addEventListener("keydown", (e) => {
      const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
      if (tag === "input" || tag === "textarea" || tag === "select") return;

      if (e.key === " ") { e.preventDefault(); toggleStartPause(); }
      if (e.key.toLowerCase() === "r") { reset(); }
      if (e.key.toLowerCase() === "m") {
        el.endSoundOn.checked = !el.endSoundOn.checked;
        savePrefs();
        announce(el.endSoundOn.checked ? "End sound on" : "End sound off");
      }

      if (/^[1-6]$/.test(e.key)) {
        const idx = Number(e.key) - 1;
        const presetButtons = Array.from(el.presetRow.querySelectorAll(".presetBtn"));
        if (presetButtons[idx]) presetButtons[idx].click();
      }
    });

    window.addEventListener("pageshow", syncFromCheckboxes);

    document.addEventListener("pointerdown", () => {
      if (el.endSoundOn.checked) ensureAudio();
    }, { once: true });
  }

  function init() {
    loadPrefs();
    loadRunState();

    setProgressVisible(el.progressOn.checked);
    if (el.wakeLockOn.checked) setWakeLock(true);

    mode = el.secondsModeOn.checked ? "seconds" : "minutes";

    if (mode === "minutes") {
      const mins = clamp(Math.round(durationSec / 60) || 5, 1, 15);
      durationSec = mins * 60;
      if (!running) remainingSec = clamp(remainingSec, 0, durationSec);
    } else {
      const secs = clamp(Math.round(durationSec / 10) * 10 || 60, 10, 300);
      durationSec = secs;
      if (!running) remainingSec = clamp(remainingSec, 0, durationSec);
    }

    buildPresets();
    syncSliderToDuration();

    if (running) {
      stopLoop();
      rafId = requestAnimationFrame(tickLoop);
      announce("Restored running timer");
    }

    wire();
    setUI();
  }

  return { init };
})();

/* ================= INIT ================= */
function init() {
  loadVolume();
  TimerWidget.init();
}
init();
