/* brainbreak.js — FULL
   - Brain break timer for timed items
   - Activity launcher (iframe/newtab/riddle/rps)
   - Teacher editor (add/edit/delete)
   - Save to localStorage
   - Export/import activities JSON
   - Upload/download activities.css (stored locally and injected)
*/

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);

const STORE_KEYS = {
  ACTIVITIES: "phs_brain_activities_v1",
  INCLUDE: "phs_brain_include_v2",
  ENDSOUND: "phs_brain_endsound_v1",
  AUTOSTART: "phs_brain_autostart_v1",
  PROGRESS: "phs_brain_progress_v1",
  CSS_TEXT: "phs_brain_activities_css_v1"
};

function storageOK(){
  try{
    const k="__storage_test__";
    localStorage.setItem(k,"1");
    localStorage.removeItem(k);
    return true;
  }catch(e){ return false; }
}
const CAN_STORE = storageOK();

function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }
function mmss(totalSeconds){
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2,"0")}`;
}
function uid(prefix="a"){
  return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`;
}
function safeJsonParse(raw, fallback){
  try{ return JSON.parse(raw); }catch(e){ return fallback; }
}

/* download helper */
function downloadText(filename, text, mime="text/plain"){
  const blob = new Blob([text], {type: mime});
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/* ================= OPTIONS MENU ================= */
const optionsBtn = $("optionsBtn");
const optionsMenu = $("optionsMenu");
const closeMenuBtn = $("closeMenu");
const menuHeader = $("menuHeader");

function openMenu(){
  optionsMenu.classList.remove("hidden");
  optionsBtn.setAttribute("aria-expanded", "true");
}
function closeMenu(){
  optionsMenu.classList.add("hidden");
  optionsBtn.setAttribute("aria-expanded", "false");
}
function toggleMenu(){ optionsMenu.classList.contains("hidden") ? openMenu() : closeMenu(); }

optionsBtn.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
["pointerdown","click"].forEach(evt => {
  closeMenuBtn.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); closeMenu(); });
});
document.addEventListener("pointerdown", (e) => {
  if (optionsMenu.classList.contains("hidden")) return;
  if (!optionsMenu.contains(e.target) && e.target !== optionsBtn) closeMenu();
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

let dragStartY = null;
menuHeader.addEventListener("pointerdown", (e) => { dragStartY = e.clientY; menuHeader.setPointerCapture(e.pointerId); });
menuHeader.addEventListener("pointermove", (e) => {
  if (dragStartY === null) return;
  const dy = e.clientY - dragStartY;
  if (dy > 70) { dragStartY = null; closeMenu(); }
});
menuHeader.addEventListener("pointerup", () => dragStartY = null);
menuHeader.addEventListener("pointercancel", () => dragStartY = null);

/* ================= FULLSCREEN ================= */
$("fullscreenBtn").addEventListener("click", async ()=>{
  try{
    if (!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
      $("fullscreenBtn").textContent = "Exit full screen";
    } else {
      await document.exitFullscreen();
      $("fullscreenBtn").textContent = "Full screen";
    }
  } catch (e) { alert("Fullscreen blocked by the browser. Try pressing F11."); }
});
document.addEventListener("fullscreenchange", ()=>{
  $("fullscreenBtn").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
});

/* ================= AUDIO (optional end sound) ================= */
let audioCtx = null;
function ensureAudio(){
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === "suspended") audioCtx.resume();
}
function beep(freq=880, durationMs=220, type="sine", gain=0.25){
  ensureAudio();
  const t0 = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  const g = audioCtx.createGain();
  osc.type = type;
  osc.frequency.value = freq;

  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.linearRampToValueAtTime(0.0001, t0 + durationMs/1000);

  osc.connect(g);
  g.connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + durationMs/1000 + 0.05);
}
function finishChime(){
  beep(660, 140, "sine", 0.35);
  setTimeout(()=>beep(880, 160, "sine", 0.35), 120);
  setTimeout(()=>beep(990, 180, "sine", 0.35), 250);
}

/* ================= ACTIVITIES DATA ================= */
function getDefaultActivities(){
  const defaults = (window.PHS_ACTIVITIES_DEFAULTS && Array.isArray(window.PHS_ACTIVITIES_DEFAULTS.activities))
    ? window.PHS_ACTIVITIES_DEFAULTS.activities
    : [];
  // enforce required fields
  return defaults.map(a => ({
    id: a.id || uid("a"),
    name: a.name || "Untitled",
    type: a.type || "quick",
    url: a.url || "",
    enabled: (a.enabled !== false),
    autoOpen: !!a.autoOpen,
    seconds: (typeof a.seconds === "number" ? a.seconds : null),
    steps: Array.isArray(a.steps) ? a.steps : []
  }));
}

function loadActivities(){
  if (!CAN_STORE) return getDefaultActivities();
  const raw = localStorage.getItem(STORE_KEYS.ACTIVITIES);
  if (!raw) return getDefaultActivities();
  const parsed = safeJsonParse(raw, null);
  if (!parsed || !Array.isArray(parsed.activities)) return getDefaultActivities();
  return parsed.activities.map(a => ({
    id: a.id || uid("a"),
    name: a.name || "Untitled",
    type: a.type || "quick",
    url: a.url || "",
    enabled: (a.enabled !== false),
    autoOpen: !!a.autoOpen,
    seconds: (typeof a.seconds === "number" ? a.seconds : null),
    steps: Array.isArray(a.steps) ? a.steps : []
  }));
}

function saveActivities(list){
  if (!CAN_STORE) return;
  localStorage.setItem(STORE_KEYS.ACTIVITIES, JSON.stringify({ activities: list }, null, 2));
}

/* ================= INCLUDE PREFS (toggle list) ================= */
function loadIncludePrefs(activities){
  if (!CAN_STORE) return;
  const raw = localStorage.getItem(STORE_KEYS.INCLUDE);
  if (!raw) return;
  const inc = safeJsonParse(raw, {});
  activities.forEach(a=>{
    if (inc[a.id] !== undefined) a.enabled = !!inc[a.id];
  });
}
function saveIncludePrefs(activities){
  if (!CAN_STORE) return;
  const inc = {};
  activities.forEach(a => inc[a.id] = !!a.enabled);
  localStorage.setItem(STORE_KEYS.INCLUDE, JSON.stringify(inc));
}

/* ================= CSS OVERRIDE (upload/download) ================= */
function applyStoredActivitiesCss(){
  if (!CAN_STORE) return;
  const cssText = localStorage.getItem(STORE_KEYS.CSS_TEXT);
  if (!cssText) return;
  let styleTag = document.getElementById("activitiesCssOverride");
  if (!styleTag){
    styleTag = document.createElement("style");
    styleTag.id = "activitiesCssOverride";
    document.head.appendChild(styleTag);
  }
  styleTag.textContent = cssText;
}
function saveActivitiesCssText(cssText){
  if (!CAN_STORE) return;
  localStorage.setItem(STORE_KEYS.CSS_TEXT, cssText);
  applyStoredActivitiesCss();
}
function clearActivitiesCssText(){
  if (!CAN_STORE) return;
  localStorage.removeItem(STORE_KEYS.CSS_TEXT);
  const styleTag = document.getElementById("activitiesCssOverride");
  if (styleTag) styleTag.remove();
}

/* ================= APP STATE ================= */
let ACTIVITIES = loadActivities();
loadIncludePrefs(ACTIVITIES);
applyStoredActivitiesCss();

let current = null;
let durationSec = 0;
let remainingSec = 0;
let running = false;
let rafId = null;
let lastTickMs = 0;

/* ================= UI HELPERS ================= */
function setProgressVisible(on){
  const el = $("progressTrack");
  el.classList.toggle("hidden", !on);
  el.setAttribute("aria-hidden", on ? "false" : "true");
}

function setBg(){
  if (!current || (!running && remainingSec === durationSec)){
    document.body.style.backgroundColor = "var(--bgGrey)";
    return;
  }
  if (!running && remainingSec === 0 && durationSec){
    document.body.style.backgroundColor = "var(--bgGreen)";
    return;
  }
  if (!running){
    document.body.style.backgroundColor = "var(--bgOrange)";
    return;
  }
  if (durationSec && remainingSec <= 10) document.body.style.backgroundColor = "var(--bgRed)";
  else document.body.style.backgroundColor = "var(--bgOrange)";
}

function setUI(){
  $("breakName").textContent = current ? current.name : "Tap to pick a break";
  $("breakAssist").textContent = current ? (current.steps || []).join("\n") : "Click here or press “Next”";

  $("timeLeft").textContent = (current && current.seconds) ? mmss(remainingSec) : "--:--";

  let chip = "READY";
  if (!current) chip = "READY";
  else if (running) chip = "RUNNING";
  else if (current.seconds && remainingSec === 0) chip = "DONE";
  else if (current.seconds && remainingSec !== durationSec) chip = "PAUSED";
  else chip = (current.seconds ? "READY" : "QUICK");

  $("stateChip").textContent = chip;

  $("startPauseBtn").disabled = !current || !current.seconds;
  $("startPauseBtn").textContent = running ? "Pause" : (current && current.seconds && remainingSec === 0 ? "Restart" : "Start");

  const pctDone = durationSec ? (1 - (remainingSec / durationSec)) : 0;
  $("progressFill").style.width = `${clamp(pctDone * 100, 0, 100)}%`;

  // Open button only for non-timed “openable” activities
  const openable = current && ["iframe","newtab","riddle","rps"].includes(current.type);
  $("openBtn").classList.toggle("hidden", !openable);

  $("modeHint").textContent = current
    ? (current.seconds ? "Timed" : (openable ? "Activity" : "Quick"))
    : "Any";

  setBg();
}

function stopLoop(){
  if (rafId) cancelAnimationFrame(rafId);
  rafId = null;
}

function tickLoop(nowMs){
  if (!running) return;

  if (!lastTickMs) lastTickMs = nowMs;
  const dt = (nowMs - lastTickMs) / 1000;

  if (dt >= 0.2){
    const drop = Math.floor(dt);
    remainingSec = Math.max(0, remainingSec - drop);
    lastTickMs += drop * 1000;
    setUI();

    if (remainingSec === 0){
      running = false;
      stopLoop();
      setUI();
      if ($("endSoundOn").checked) finishChime();
      return;
    }
  }

  rafId = requestAnimationFrame(tickLoop);
}

function start(){
  if (!current || !current.seconds) return;
  if (remainingSec === 0) remainingSec = durationSec;
  if (running) return;
  running = true;
  lastTickMs = 0;
  setUI();
  stopLoop();
  rafId = requestAnimationFrame(tickLoop);
}

function pause(){
  running = false;
  stopLoop();
  setUI();
}

function toggleStartPause(){
  running ? pause() : start();
}

function resetTimer(){
  pause();
  if (current && current.seconds){
    remainingSec = durationSec;
  } else {
    remainingSec = 0;
    durationSec = 0;
  }
  setUI();
}

function pickRandom(){
  const pool = ACTIVITIES.filter(a => a.enabled !== false);
  if (!pool.length){
    alert("No items enabled. Turn some back on in Options.");
    return null;
  }
  return pool[Math.floor(Math.random() * pool.length)];
}

function setBreak(b){
  current = b;
  running = false;
  stopLoop();

  durationSec = b.seconds ? b.seconds : 0;
  remainingSec = durationSec;

  setUI();

  if (b.seconds && $("autoStartOn").checked){
    start();
  }

  // auto-open (activities only)
  if (b.autoOpen && ["iframe","newtab","riddle","rps"].includes(b.type)){
    openCurrent();
  }
}

function nextBreak(){
  const b = pickRandom();
  if (!b) return;
  setBreak(b);
}

/* ================= MODALS ================= */
function clearModalHost(){
  $("modalHost").innerHTML = "";
}

function openModal(title, bodyNode, footerButtons){
  clearModalHost();

  const overlay = document.createElement("div");
  overlay.className = "actModalOverlay";
  overlay.role = "dialog";
  overlay.ariaModal = "true";

  const card = document.createElement("div");
  card.className = "actModalCard";

  const header = document.createElement("div");
  header.className = "actModalHeader";

  const hTitle = document.createElement("div");
  hTitle.className = "actModalTitle";
  hTitle.textContent = title;

  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.title = "Close";
  closeBtn.addEventListener("click", ()=> closeModal());

  header.appendChild(hTitle);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "actModalBody";
  body.appendChild(bodyNode);

  const footer = document.createElement("div");
  footer.className = "actModalFooter";
  (footerButtons || []).forEach(btn => footer.appendChild(btn));

  card.appendChild(header);
  card.appendChild(body);
  card.appendChild(footer);

  overlay.appendChild(card);

  overlay.addEventListener("pointerdown", (e)=>{
    if (e.target === overlay) closeModal();
  });

  $("modalHost").appendChild(overlay);

  document.addEventListener("keydown", escCloseModal, { once:false });
  function escCloseModal(e){
    if (e.key === "Escape"){
      closeModal();
    }
  }
}

function closeModal(){
  clearModalHost();
}

/* ================= RPS (hard-coded + animation) ================= */
const RPS = [
  { name:"Rock", emoji:"🪨" },
  { name:"Paper", emoji:"📄" },
  { name:"Scissors", emoji:"✂️" }
];

function openRps(){
  const wrap = document.createElement("div");
  wrap.className = "rpsStage";

  const emoji = document.createElement("div");
  emoji.className = "rpsEmoji";
  emoji.textContent = "🪨";

  const label = document.createElement("div");
  label.className = "rpsLabel";
  label.textContent = "Rock";

  const note = document.createElement("div");
  note.className = "smallNote";
  note.textContent = "Click Roll together on “...shoot!”";

  wrap.appendChild(emoji);
  wrap.appendChild(label);
  wrap.appendChild(note);

  const roll = document.createElement("button");
  roll.type = "button";
  roll.textContent = "Roll";

  const rollAgain = document.createElement("button");
  rollAgain.type = "button";
  rollAgain.textContent = "Roll again";

  function doRoll(){
    // little shuffle animation between rolls
    emoji.classList.remove("rpsAnim");
    // force reflow to restart animation
    void emoji.offsetWidth;
    emoji.classList.add("rpsAnim");

    // quick randomization “shuffle”
    const shuffleMs = 320;
    const endMs = 420;
    const t0 = Date.now();

    const iv = setInterval(()=>{
      const pick = RPS[Math.floor(Math.random() * RPS.length)];
      emoji.textContent = pick.emoji;
      label.textContent = pick.name;
      if (Date.now() - t0 > shuffleMs) clearInterval(iv);
    }, 70);

    setTimeout(()=>{
      const pick = RPS[Math.floor(Math.random() * RPS.length)];
      emoji.textContent = pick.emoji;
      label.textContent = pick.name;
    }, endMs);
  }

  roll.addEventListener("click", doRoll);
  rollAgain.addEventListener("click", doRoll);

  // roll once on open
  doRoll();

  openModal("Rock • Paper • Scissors", wrap, [roll, rollAgain]);
}

/* ================= RIDDLE (best effort) =================
   NOTE: Many sites block scraping via CORS.
   We try to fetch and parse. If blocked, we open the site in an iframe/new tab.
*/
async function openRiddle(activity){
  const box = document.createElement("div");
  box.className = "actRiddleBox";

  const q = document.createElement("p");
  q.className = "actRiddleQ";
  q.textContent = "Loading a random riddle…";

  const aWrap = document.createElement("div");
  aWrap.className = "actRiddleA";

  const aTitle = document.createElement("div");
  aTitle.className = "miniLabel";
  aTitle.textContent = "Answer";

  const aText = document.createElement("div");
  aText.style.fontWeight = "900";

  aWrap.appendChild(aTitle);
  aWrap.appendChild(aText);

  const btnReveal = document.createElement("button");
  btnReveal.type = "button";
  btnReveal.textContent = "Reveal answer";
  btnReveal.disabled = true;

  const btnNew = document.createElement("button");
  btnNew.type = "button";
  btnNew.textContent = "New riddle";

  const btnOpenSite = document.createElement("button");
  btnOpenSite.type = "button";
  btnOpenSite.textContent = "Open site";

  btnOpenSite.addEventListener("click", ()=>{
    // safest fallback if parsing fails
    window.open(activity.url, "_blank", "noopener,noreferrer");
  });

  box.appendChild(q);
  box.appendChild(aWrap);

  btnReveal.addEventListener("click", ()=>{
    aWrap.classList.add("show");
  });

  async function loadOne(){
    aWrap.classList.remove("show");
    q.textContent = "Loading a random riddle…";
    aText.textContent = "";
    btnReveal.disabled = true;

    try{
      const res = await fetch(activity.url, { mode: "cors" });
      if (!res.ok) throw new Error("Fetch blocked");
      const html = await res.text();

      // Heuristic parsing: look for common “Question/Answer” patterns.
      // If the site changes, we might not find it -> fallback.
      const doc = new DOMParser().parseFromString(html, "text/html");
      const text = doc.body ? doc.body.innerText : "";

      // Try to find "Answer:" block
      const answerMatch = text.match(/Answer\s*[:\-]\s*(.+)/i);
      // Try to find a question area near "Riddle"
      // We'll pick a chunk before "Answer:"
      if (answerMatch){
        const ans = answerMatch[1].split("\n")[0].trim();
        const before = text.split(answerMatch[0])[0];
        // pick last ~300 chars as question-ish
        const qRaw = before.trim().slice(-500);
        // take last line that looks non-empty
        const qLines = qRaw.split("\n").map(s=>s.trim()).filter(Boolean);
        const qGuess = qLines[qLines.length - 1] || "Riddle loaded (question text unavailable).";

        q.textContent = qGuess;
        aText.textContent = ans || "(Answer not found)";
        btnReveal.disabled = false;
        return;
      }

      // Fallback: no answer found
      throw new Error("Could not parse riddle/answer");
    }catch(e){
      q.textContent = "Couldn’t load a riddle directly (site blocks it). Use “Open site” to view the generator.";
      aText.textContent = "";
      btnReveal.disabled = true;
    }
  }

  btnNew.addEventListener("click", loadOne);

  openModal(activity.name || "Random Riddle", box, [btnOpenSite, btnNew, btnReveal]);
  loadOne();
}

/* ================= OPEN CURRENT ================= */
function openCurrent(){
  if (!current) return;

  if (current.type === "newtab"){
    if (!current.url) return alert("No URL set for this activity.");
    window.open(current.url, "_blank", "noopener,noreferrer");
    return;
  }

  if (current.type === "iframe"){
    if (!current.url) return alert("No URL set for this activity.");
    const wrap = document.createElement("div");
    const iframe = document.createElement("iframe");
    iframe.className = "actFrame";
    iframe.src = current.url;
    iframe.title = current.name || "Activity";
    iframe.loading = "lazy";
    wrap.appendChild(iframe);

    const openNewTab = document.createElement("button");
    openNewTab.type = "button";
    openNewTab.textContent = "Open in new tab";
    openNewTab.addEventListener("click", ()=>{
      window.open(current.url, "_blank", "noopener,noreferrer");
    });

    openModal(current.name || "Activity", wrap, [openNewTab]);
    return;
  }

  if (current.type === "rps"){
    openRps();
    return;
  }

  if (current.type === "riddle"){
    openRiddle(current);
    return;
  }

  // default: nothing
}

/* ================= INCLUDE LIST UI ================= */
function renderIncludeList(){
  const wrap = $("includeList");
  wrap.innerHTML = "";
  ACTIVITIES.forEach(a=>{
    const row = document.createElement("span");
    row.className = "pillBtn";
    row.title = "Include in random picker";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `inc_${a.id}`;
    cb.checked = a.enabled !== false;

    const lab = document.createElement("label");
    lab.setAttribute("for", cb.id);
    lab.textContent = a.name;

    cb.addEventListener("change", ()=>{
      a.enabled = cb.checked;
      saveIncludePrefs(ACTIVITIES);
    });

    row.appendChild(cb);
    row.appendChild(lab);
    wrap.appendChild(row);
  });
}

/* ================= TEACHER PANEL ================= */
function renderTeacherPanel(){
  const host = $("teacherPanel");
  host.innerHTML = "";

  const block = document.createElement("div");
  block.className = "teacherBlock";

  // Top buttons
  const topRow = document.createElement("div");
  topRow.className = "teacherRow";

  const btnExportJson = document.createElement("button");
  btnExportJson.type = "button";
  btnExportJson.textContent = "Download activities.json";
  btnExportJson.addEventListener("click", ()=>{
    downloadText("activities.json", JSON.stringify({ activities: ACTIVITIES }, null, 2), "application/json");
  });

  const btnImportJson = document.createElement("button");
  btnImportJson.type = "button";
  btnImportJson.textContent = "Import activities.json";
  const fileJson = document.createElement("input");
  fileJson.type = "file";
  fileJson.accept = "application/json";
  fileJson.className = "hidden";
  btnImportJson.addEventListener("click", ()=> fileJson.click());
  fileJson.addEventListener("change", async ()=>{
    const f = fileJson.files && fileJson.files[0];
    if (!f) return;
    const txt = await f.text();
    const parsed = safeJsonParse(txt, null);
    if (!parsed || !Array.isArray(parsed.activities)){
      alert("That JSON doesn’t look like { activities: [...] }");
      return;
    }
    ACTIVITIES = parsed.activities.map(a => ({
      id: a.id || uid("a"),
      name: a.name || "Untitled",
      type: a.type || "quick",
      url: a.url || "",
      enabled: (a.enabled !== false),
      autoOpen: !!a.autoOpen,
      seconds: (typeof a.seconds === "number" ? a.seconds : null),
      steps: Array.isArray(a.steps) ? a.steps : []
    }));
    saveActivities(ACTIVITIES);
    saveIncludePrefs(ACTIVITIES);
    renderIncludeList();
    renderTeacherPanel();
    // if current item removed, reset
    if (current && !ACTIVITIES.find(x=>x.id===current.id)){
      current = null;
      resetTimer();
    }
  });

  topRow.appendChild(btnExportJson);
  topRow.appendChild(btnImportJson);
  topRow.appendChild(fileJson);

  // CSS tools
  const cssRow = document.createElement("div");
  cssRow.className = "teacherRow";

  const btnCssDownload = document.createElement("button");
  btnCssDownload.type = "button";
  btnCssDownload.textContent = "Download activities.css";
  btnCssDownload.addEventListener("click", async ()=>{
    // Prefer stored override if exists, else fetch current activities.css
    const stored = CAN_STORE ? localStorage.getItem(STORE_KEYS.CSS_TEXT) : null;
    if (stored){
      downloadText("activities.css", stored, "text/css");
      return;
    }
    try{
      const res = await fetch("activities.css", { cache: "no-store" });
      const css = await res.text();
      downloadText("activities.css", css, "text/css");
    }catch(e){
      alert("Couldn’t download activities.css automatically. (Check file path.)");
    }
  });

  const btnCssUpload = document.createElement("button");
  btnCssUpload.type = "button";
  btnCssUpload.textContent = "Upload activities.css";
  const fileCss = document.createElement("input");
  fileCss.type = "file";
  fileCss.accept = "text/css,.css";
  fileCss.className = "hidden";
  btnCssUpload.addEventListener("click", ()=> fileCss.click());
  fileCss.addEventListener("change", async ()=>{
    const f = fileCss.files && fileCss.files[0];
    if (!f) return;
    const txt = await f.text();
    saveActivitiesCssText(txt);
    alert("CSS uploaded and applied (stored locally).");
  });

  const btnCssClear = document.createElement("button");
  btnCssClear.type = "button";
  btnCssClear.textContent = "Clear CSS override";
  btnCssClear.addEventListener("click", ()=>{
    clearActivitiesCssText();
    alert("CSS override cleared. Page will use activities.css on disk.");
  });

  cssRow.appendChild(btnCssDownload);
  cssRow.appendChild(btnCssUpload);
  cssRow.appendChild(btnCssClear);
  cssRow.appendChild(fileCss);

  // Editor grid
  const grid = document.createElement("div");
  grid.className = "teacherGrid";

  // Left: list
  const list = document.createElement("div");
  list.className = "teacherList";

  // Right: form
  const form = document.createElement("div");
  form.className = "teacherForm";

  let selectedId = ACTIVITIES[0] ? ACTIVITIES[0].id : null;

  function renderList(){
    list.innerHTML = "";
    ACTIVITIES.forEach(a=>{
      const item = document.createElement("div");
      item.className = "teacherItem" + (a.id === selectedId ? " active" : "");
      item.textContent = a.name;
      item.addEventListener("click", ()=>{
        selectedId = a.id;
        renderList();
        renderForm();
      });
      list.appendChild(item);
    });

    const addBtn = document.createElement("button");
    addBtn.type = "button";
    addBtn.textContent = "＋ Add activity";
    addBtn.addEventListener("click", ()=>{
      const fresh = {
        id: uid("a"),
        name: "New activity",
        type: "iframe",
        url: "",
        enabled: true,
        autoOpen: false,
        seconds: null,
        steps: []
      };
      ACTIVITIES.push(fresh);
      selectedId = fresh.id;
      saveActivities(ACTIVITIES);
      saveIncludePrefs(ACTIVITIES);
      renderIncludeList();
      renderList();
      renderForm();
    });

    const btnWrap = document.createElement("div");
    btnWrap.style.marginTop = "10px";
    btnWrap.appendChild(addBtn);
    list.appendChild(btnWrap);
  }

  function renderForm(){
    form.innerHTML = "";

    const a = ACTIVITIES.find(x=>x.id===selectedId);
    if (!a){
      form.textContent = "Select an activity to edit.";
      return;
    }

    function field(labelText, inputEl){
      const wrap = document.createElement("div");
      const lab = document.createElement("label");
      lab.textContent = labelText;
      wrap.appendChild(lab);
      wrap.appendChild(inputEl);
      return wrap;
    }

    const name = document.createElement("input");
    name.type = "text";
    name.value = a.name;

    const type = document.createElement("select");
    ["iframe","newtab","riddle","rps","quick"].forEach(t=>{
      const o = document.createElement("option");
      o.value = t;
      o.textContent = t.toUpperCase();
      type.appendChild(o);
    });
    type.value = a.type;

    const url = document.createElement("input");
    url.type = "text";
    url.placeholder = "https://...";
    url.value = a.url || "";

    const seconds = document.createElement("input");
    seconds.type = "text";
    seconds.placeholder = "e.g. 120 (leave blank for none)";
    seconds.value = (typeof a.seconds === "number" ? String(a.seconds) : "");

    const steps = document.createElement("textarea");
    steps.rows = 5;
    steps.value = (a.steps || []).join("\n");

    const row2 = document.createElement("div");
    row2.className = "row2";
    row2.appendChild(field("Type", type));
    row2.appendChild(field("URL (for iframe/newtab/riddle)", url));

    const row2b = document.createElement("div");
    row2b.className = "row2";
    row2b.appendChild(field("Seconds (optional timed)", seconds));

    const toggles = document.createElement("div");
    toggles.className = "menuRow";

    const enabledWrap = document.createElement("span");
    enabledWrap.className = "pillBtn";
    const enabled = document.createElement("input");
    enabled.type = "checkbox";
    enabled.checked = a.enabled !== false;
    const enabledLab = document.createElement("label");
    enabledLab.textContent = "Enabled";
    enabledWrap.appendChild(enabled);
    enabledWrap.appendChild(enabledLab);

    const autoWrap = document.createElement("span");
    autoWrap.className = "pillBtn";
    const autoOpen = document.createElement("input");
    autoOpen.type = "checkbox";
    autoOpen.checked = !!a.autoOpen;
    const autoLab = document.createElement("label");
    autoLab.textContent = "Auto-open";
    autoWrap.appendChild(autoOpen);
    autoWrap.appendChild(autoLab);

    toggles.appendChild(enabledWrap);
    toggles.appendChild(autoWrap);

    const btnRow = document.createElement("div");
    btnRow.className = "teacherRow";

    const btnSave = document.createElement("button");
    btnSave.type = "button";
    btnSave.textContent = "Save";
    btnSave.addEventListener("click", ()=>{
      a.name = name.value.trim() || "Untitled";
      a.type = type.value;
      a.url = url.value.trim();

      const sec = seconds.value.trim();
      a.seconds = sec === "" ? null : (Number.isFinite(Number(sec)) ? Number(sec) : null);

      a.steps = steps.value.split("\n").map(s=>s.trim()).filter(Boolean);
      a.enabled = enabled.checked;
      a.autoOpen = autoOpen.checked;

      saveActivities(ACTIVITIES);
      saveIncludePrefs(ACTIVITIES);
      renderIncludeList();
      renderList();
      setUI();
      alert("Saved.");
    });

    const btnDelete = document.createElement("button");
    btnDelete.type = "button";
    btnDelete.className = "danger";
    btnDelete.textContent = "Delete";
    btnDelete.addEventListener("click", ()=>{
      if (!confirm("Delete this activity?")) return;
      const idx = ACTIVITIES.findIndex(x=>x.id===a.id);
      if (idx >= 0) ACTIVITIES.splice(idx, 1);
      saveActivities(ACTIVITIES);
      saveIncludePrefs(ACTIVITIES);
      renderIncludeList();
      selectedId = ACTIVITIES[0] ? ACTIVITIES[0].id : null;
      renderList();
      renderForm();
      if (current && current.id === a.id){
        current = null;
        resetTimer();
      }
    });

    btnRow.appendChild(btnSave);
    btnRow.appendChild(btnDelete);

    // Guidance for RPS/riddle
    const hint = document.createElement("div");
    hint.className = "smallNote";
    hint.textContent =
      "Notes: RPS is built-in (URL ignored). RIDDLE may be blocked by the website; Open site still works.";

    form.appendChild(field("Name", name));
    form.appendChild(row2);
    form.appendChild(row2b);
    form.appendChild(toggles);
    form.appendChild(field("Steps (one per line)", steps));
    form.appendChild(btnRow);
    form.appendChild(hint);
  }

  renderList();
  renderForm();

  grid.appendChild(list);
  grid.appendChild(form);

  block.appendChild(topRow);
  block.appendChild(cssRow);
  block.appendChild(grid);

  host.appendChild(block);
}

/* ================= PREFS (sound/autostart/progress) ================= */
function loadPrefs(){
  if (!CAN_STORE) return;
  $("endSoundOn").checked = localStorage.getItem(STORE_KEYS.ENDSOUND) === "1";

  const as = localStorage.getItem(STORE_KEYS.AUTOSTART);
  $("autoStartOn").checked = (as === null) ? true : (as === "1");

  const pr = localStorage.getItem(STORE_KEYS.PROGRESS);
  $("progressOn").checked = (pr === null) ? true : (pr === "1");
}
function savePrefs(){
  if (!CAN_STORE) return;
  localStorage.setItem(STORE_KEYS.ENDSOUND, $("endSoundOn").checked ? "1" : "0");
  localStorage.setItem(STORE_KEYS.AUTOSTART, $("autoStartOn").checked ? "1" : "0");
  localStorage.setItem(STORE_KEYS.PROGRESS, $("progressOn").checked ? "1" : "0");
}

/* ================= WIRING ================= */
$("progressOn").addEventListener("change", ()=>{
  setProgressVisible($("progressOn").checked);
  savePrefs();
  setUI();
});
$("endSoundOn").addEventListener("change", ()=>{
  savePrefs();
  if ($("endSoundOn").checked) ensureAudio();
});
$("autoStartOn").addEventListener("change", savePrefs);

$("pickBtn").addEventListener("click", nextBreak);
$("nextBtn").addEventListener("click", nextBreak);
$("breakBtn").addEventListener("click", nextBreak);

$("startPauseBtn").addEventListener("click", ()=>{
  if ($("endSoundOn").checked) ensureAudio();
  toggleStartPause();
});

$("openBtn").addEventListener("click", (e)=>{
  e.preventDefault();
  e.stopPropagation();
  openCurrent();
});

$("resetBtn").addEventListener("click", resetTimer);

$("resetAllBtn").addEventListener("click", ()=>{
  if (CAN_STORE){
    localStorage.removeItem(STORE_KEYS.INCLUDE);
    localStorage.removeItem(STORE_KEYS.ENDSOUND);
    localStorage.removeItem(STORE_KEYS.AUTOSTART);
    localStorage.removeItem(STORE_KEYS.PROGRESS);
    localStorage.removeItem(STORE_KEYS.ACTIVITIES);
    // keep CSS override unless you want to nuke it too
  }

  // reload everything from defaults
  ACTIVITIES = getDefaultActivities();
  saveActivities(ACTIVITIES);

  $("endSoundOn").checked = false;
  $("autoStartOn").checked = true;
  $("progressOn").checked = true;

  loadIncludePrefs(ACTIVITIES);
  renderIncludeList();
  renderTeacherPanel();

  current = null;
  durationSec = 0;
  remainingSec = 0;
  running = false;
  stopLoop();

  setProgressVisible(true);
  document.body.style.backgroundColor = "var(--bgGrey)";
  $("stateChip").textContent = "READY";
  $("timeLeft").textContent = "--:--";
  $("breakName").textContent = "Tap to pick a break";
  $("breakAssist").textContent = "Click here or press “Next”";
  $("progressFill").style.width = "0%";
  closeMenu();
});

document.addEventListener("keydown", (e)=>{
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (e.key === " "){
    e.preventDefault();
    toggleStartPause();
  }
  if (e.key.toLowerCase() === "n"){ e.preventDefault(); nextBreak(); }
  if (e.key.toLowerCase() === "r"){ e.preventDefault(); resetTimer(); }
  if (e.key.toLowerCase() === "o"){
    e.preventDefault();
    openCurrent();
  }
});

// prime audio on first interaction (if enabled)
document.addEventListener("pointerdown", ()=>{
  if ($("endSoundOn").checked) ensureAudio();
}, { once:true });

/* ================= INIT ================= */
function init(){
  loadPrefs();
  setProgressVisible($("progressOn").checked);

  renderIncludeList();
  renderTeacherPanel();

  setUI();
}
init();
