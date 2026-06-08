/* =========================================================
   brainbreak.js — PHS Brain Breaks (FULL)
   Requires:
     - styles.css (shared UI)
     - styles.css includes Brain Break modal/editor/picker UI
     - activities.js (defines window.PHS_ACTIVITIES_DEFAULTS)
     - brainbreak.html (has required IDs)

   What this does:
     - Loads activities from:
         1) localStorage (teacher saved)
         2) window.PHS_ACTIVITIES_DEFAULTS (fallback)
     - Renders:
         - Include list (enable/disable in random picker)
         - Teacher editor (add/edit/delete/reorder, import/export JSON)
         - Optional teacher CSS loader + upload/download
     - Supports activity types:
         - "timed" (simple timer)
         - "quick" (no timer, text steps)
         - "iframe" (opens in modal iframe)
         - "newtab" (opens URL in a new tab)
         - "riddle" (fetches random riddle from a page, or fallback)
         - "rps" (hard-coded Rock Paper Scissors modal with animation)
         - "sequence" (built-in “guess the next number” generator)

   Notes:
     ✅ Teachers can paste any YouTube link into URL.
        YouTube ALWAYS opens in a NEW TAB (reliable), and we do NOT rewrite the URL.
     ✅ When adding a new activity, the default type is "iframe".
   ========================================================= */

/* ================= HELPERS ================= */
const $ = (id) => document.getElementById(id);

const STORAGE = {
  ACTIVITIES: "phs_brain_activities_v5",
  UI_PREFS: "phs_brain_prefs_v5",
  TEACHER_CSS_TEXT: "phs_teacher_css_text_v5",
  TEACHER_CSS_ENABLED: "phs_teacher_css_enabled_v5",
};

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

function mmss(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.max(0, totalSeconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }
function uid(prefix="a"){ return `${prefix}_${Math.random().toString(16).slice(2)}${Date.now().toString(16)}`; }

function safeJsonParse(str, fallback=null){
  try { return JSON.parse(str); } catch(e){ return fallback; }
}

function isYouTubeUrl(url){
  const u = String(url || "").trim();
  return /(^|\/\/)(www\.)?(youtube\.com|youtu\.be)\//i.test(u) || /youtube\.com/i.test(u) || /youtu\.be/i.test(u);
}

/**
 * For iframe URLs, we now ONLY trim/return the URL.
 * (We intentionally do NOT convert YouTube URLs to embed URLs.)
 */
function normalizeUrlForIframe(url){
  if (!url) return "";
  return String(url).trim();
}

/* ================= OPTIONS MENU (simple) ================= */
const optionsBtn = $("optionsBtn");
const optionsMenu = $("optionsMenu");
const closeMenuBtn = $("closeMenu");

function openMenu(){ optionsMenu.classList.remove("hidden"); }
function closeMenu(){ optionsMenu.classList.add("hidden"); }
function toggleMenu(){ optionsMenu.classList.contains("hidden") ? openMenu() : closeMenu(); }

optionsBtn?.addEventListener("click", (e)=>{ e.stopPropagation(); toggleMenu(); });
closeMenuBtn?.addEventListener("click", (e)=>{ e.preventDefault(); e.stopPropagation(); closeMenu(); });

document.addEventListener("pointerdown", (e)=>{
  if (!optionsMenu || optionsMenu.classList.contains("hidden")) return;
  if (!optionsMenu.contains(e.target) && e.target !== optionsBtn) closeMenu();
});

/* ================= FULLSCREEN ================= */
$("fullscreenBtn")?.addEventListener("click", async ()=>{
  try{
    if (!document.fullscreenElement){
      await document.documentElement.requestFullscreen();
    } else {
      await document.exitFullscreen();
    }
  } catch (e) {
    alert("Fullscreen blocked. Try F11.");
  }
});

/* ================= APP STATE ================= */
let activities = [];
let current = null;

let durationSec = 0;
let remainingSec = 0;
let running = false;
let rafId = null;
let lastTickMs = 0;

/* ================= UI ELEMENTS ================= */
const includeListEl = $("includeList");
const teacherPanelEl = $("teacherPanel");

const breakBtn = $("breakBtn");
const breakName = $("breakName");
const breakAssist = $("breakAssist");
const progressFill = $("progressFill");
const timeLeft = $("timeLeft");
const stateChip = $("stateChip");

const pickBtn = $("pickBtn");
const chooseBtn = $("chooseBtn"); // optional button in HTML
const startPauseBtn = $("startPauseBtn");
const openBtn = $("openBtn");
const resetBtn = $("resetBtn");
const resetAllBtn = $("resetAllBtn");

const modalHost = $("modalHost");

/* ================= TEACHER CSS (in-browser) ================= */
function ensureTeacherCssNode(){
  let node = document.getElementById("teacherCss");
  if (!node){
    node = document.createElement("style");
    node.id = "teacherCss";
    document.head.appendChild(node);
  }
  return node;
}
function applyTeacherCssIfEnabled(){
  if (!CAN_STORE) return;
  const enabled = localStorage.getItem(STORAGE.TEACHER_CSS_ENABLED) === "1";
  const cssText = localStorage.getItem(STORAGE.TEACHER_CSS_TEXT) || "";
  const node = ensureTeacherCssNode();
  node.textContent = enabled ? cssText : "";
}

/* ================= DEFAULT ACTIVITIES ================= */
function defaultActivities(){
  // Expect window.PHS_ACTIVITIES_DEFAULTS from activities.js
  const def = (window.PHS_ACTIVITIES_DEFAULTS && window.PHS_ACTIVITIES_DEFAULTS.activities)
    ? window.PHS_ACTIVITIES_DEFAULTS.activities
    : [];

  // Always ensure RPS exists (hard-coded)
  const hasRps = def.some(a => a.id === "rps");
  const withRps = hasRps ? def : def.concat([{
    id: "rps",
    name: "Rock • Paper • Scissors",
    type: "rps",
    enabled: true,
    autoOpen: false,
    steps: ["Open the game and roll on “shoot!”"]
  }]);

  // Ensure basic fields
  return withRps.map(a => ({
    id: a.id || uid("a"),
    name: a.name || "Untitled",
    // If a default has a URL but no type, assume iframe (teacher-friendly default)
    type: a.type || (a.url ? "iframe" : "quick"),
    url: a.url ? String(a.url) : "",
    mode: a.mode || "", // legacy
    tag: a.tag || "",
    seconds: Number.isFinite(a.seconds) ? a.seconds : (a.type === "timed" ? 60 : null),
    steps: Array.isArray(a.steps) ? a.steps : [],
    autoOpen: !!a.autoOpen,
    enabled: (a.enabled === undefined ? true : !!a.enabled),
  }));
}

/* ================= LOAD / SAVE ACTIVITIES ================= */
function normalizeActivity(a){
  const type = a.type || (a.url ? "iframe" : "quick");
  return {
    id: a.id || uid("a"),
    name: a.name || "Untitled",
    type,
    url: a.url ? String(a.url) : "",
    tag: a.tag || "",
    seconds: Number.isFinite(a.seconds) ? a.seconds : (type === "timed" ? 60 : null),
    steps: Array.isArray(a.steps) ? a.steps : [],
    autoOpen: !!a.autoOpen,
    enabled: (a.enabled === undefined ? true : !!a.enabled),
  };
}

function loadActivities(){
  if (CAN_STORE){
    const raw = localStorage.getItem(STORAGE.ACTIVITIES);
    const parsed = raw ? safeJsonParse(raw, null) : null;
    if (parsed && Array.isArray(parsed.activities)){
      // If teacher previously saved an empty list, fall back to defaults
      if (parsed.activities.length === 0){
        activities = defaultActivities();
        return;
      }

      activities = parsed.activities.map(normalizeActivity);

      // ensure RPS exists
      if (!activities.some(a => a.id === "rps")){
        activities.push({
          id:"rps", name:"Rock • Paper • Scissors", type:"rps", url:"",
          enabled:true, autoOpen:true, seconds:null, tag:"", steps:["Open the game and roll on “shoot!”"]
        });
      }
      return;
    }
  }
  activities = defaultActivities();
}

function saveActivities(){
  if (!CAN_STORE) return;
  localStorage.setItem(STORAGE.ACTIVITIES, JSON.stringify({ activities }, null, 2));
}

/* ================= SELECTION HELPERS ================= */
function enabledPool(){
  return activities.filter(a => a.enabled);
}

function pickFromPool(pool){
  if (!pool || !pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

function pickRandom(){
  return pickFromPool(enabledPool());
}

function activityGroup(act){
  if (!act) return "quick";
  if (act.seconds) return "timed";
  if (["iframe", "newtab"].includes(act.type)) return "opens";
  if (["rps", "sequence", "riddle"].includes(act.type)) return "interactive";
  return "quick";
}

function activityIcon(act){
  const group = activityGroup(act);
  if (group === "timed") return "⏱";
  if (group === "opens") return "↗";
  if (act.type === "rps") return "✊";
  if (act.type === "sequence") return "🔢";
  if (act.type === "riddle") return "❓";
  return "⚡";
}

function activityMeta(act){
  const bits = [];

  if (act.seconds) bits.push(mmss(act.seconds));
  if (act.type === "quick") bits.push("quick");
  if (act.type === "timed") bits.push("timed");
  if (act.type === "iframe") bits.push("opens inside page");
  if (act.type === "newtab") bits.push("opens new tab");
  if (act.type === "riddle") bits.push("riddle");
  if (act.type === "rps") bits.push("partner game");
  if (act.type === "sequence") bits.push("thinking puzzle");
  if (act.tag) bits.push(act.tag);

  return bits.join(" • ");
}

function activityPreview(act){
  const steps = Array.isArray(act.steps) ? act.steps : [];
  if (!steps.length) return "No instructions added yet.";
  return steps.slice(0, 2).join(" ");
}

function makeActivityChoiceCard(act, onPick){
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "activityChoiceCard";

  const icon = document.createElement("div");
  icon.className = "activityChoiceIcon";
  icon.textContent = activityIcon(act);

  const main = document.createElement("div");
  main.className = "activityChoiceMain";

  const name = document.createElement("div");
  name.className = "activityChoiceName";
  name.textContent = act.name;

  const meta = document.createElement("div");
  meta.className = "activityChoiceMeta";
  meta.textContent = activityMeta(act);

  const preview = document.createElement("div");
  preview.className = "activityChoicePreview";
  preview.textContent = activityPreview(act);

  main.appendChild(name);
  main.appendChild(meta);
  main.appendChild(preview);

  const action = document.createElement("div");
  action.className = "activityChoiceAction";
  action.textContent = "Select";

  btn.appendChild(icon);
  btn.appendChild(main);
  btn.appendChild(action);

  btn.addEventListener("click", ()=>{
    onPick(act);
  });

  return btn;
}

/* ================= TIMER LOOP ================= */
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
    durationSec = 0;
    remainingSec = 0;
  }
  setUI();
}

/* ================= MODALS ================= */
function clearModal(){
  modalHost.innerHTML = "";
}

function openModal(contentEl){
  clearModal();
  modalHost.appendChild(contentEl);
}

function makeOverlay(){
  const overlay = document.createElement("div");
  overlay.className = "actModalOverlay";
  overlay.addEventListener("pointerdown", (e)=>{
    if (e.target === overlay) closeAllOverlays();
  });
  return overlay;
}
function closeAllOverlays(){
  clearModal();
}

document.addEventListener("keydown", (e)=>{
  if (e.key === "Escape"){
    closeAllOverlays();
    // also close options
    closeMenu();
  }
});

/* ================= BUILT-IN: SEQUENCE ================= */
function randInt(lo, hi){
  return Math.floor(Math.random()*(hi-lo+1))+lo;
}

function launchSequence(act){
  const overlay = makeOverlay();
  const card = document.createElement("div");
  card.className = "actModalCard";

  const header = document.createElement("div");
  header.className = "actModalHeader";

  const title = document.createElement("div");
  title.className = "actModalTitle";
  title.textContent = act.name || "Sequence";

  const closeBtn = document.createElement("button");
  closeBtn.className = "actModalClose";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeAllOverlays);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "actModalBody";
  body.style.padding = "14px";

  const seqLine = document.createElement("div");
  seqLine.style.fontSize = "22px";
  seqLine.style.fontWeight = "700";
  seqLine.style.marginBottom = "12px";

  const hint = document.createElement("div");
  hint.style.opacity = "0.85";
  hint.style.marginBottom = "12px";
  hint.textContent = "Students: guess the next number. Teacher: click Reveal.";

  const btnRow = document.createElement("div");
  btnRow.style.display = "flex";
  btnRow.style.gap = "10px";
  btnRow.style.flexWrap = "wrap";

  const newBtn = document.createElement("button");
  newBtn.textContent = "New sequence";
  newBtn.type = "button";

  const revealBtn = document.createElement("button");
  revealBtn.textContent = "Reveal";
  revealBtn.type = "button";

  const answer = document.createElement("div");
  answer.style.marginTop = "12px";
  answer.style.fontSize = "16px";
  answer.style.opacity = "0.95";

  function makeOne(){
    const generators = [
      () => {
        const a = randInt(1, 9), d = randInt(1, 9), n = 5;
        const seq = Array.from({length:n}, (_,i)=>a+i*d);
        return { seq, next: a+n*d, rule: `Add ${d} each time.` };
      },
      () => {
        const a = randInt(1, 12), r = randInt(2, 4), n = 5;
        const seq = Array.from({length:n}, (_,i)=>a*(r**i));
        return { seq, next: a*(r**n), rule: `Multiply by ${r} each time.` };
      },
      () => {
        const a = randInt(1, 9), b = randInt(1, 9), n = 6;
        const seq = [a,b];
