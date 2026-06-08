/* =========================================================
   brainbreak.js — PHS Brain Breaks (FULL)
   Requires:
     - styles.css (shared UI)
     - activities.css (modal/editor UI)
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

/* ================= RANDOM PICK ================= */
function enabledPool(){
  return activities.filter(a => a.enabled);
}
function pickRandom(){
  const pool = enabledPool();
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
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
        while (seq.length < n){
          seq.push(seq[seq.length-1] + seq[seq.length-2]);
        }
        return { seq: seq.slice(0,5), next: seq[5], rule: `Add the previous two numbers.` };
      },
      () => {
        const start = randInt(10, 40);
        const seq = [start, start-1, start-3, start-6, start-10]; // subtract 1,2,3,4...
        return { seq, next: start-15, rule: `Subtract 1, then 2, then 3, then 4…` };
      },
      () => {
        const base = randInt(2, 12);
        const seq = [base, base*2, base*3, base*4, base*5];
        return { seq, next: base*6, rule: `Multiples of ${base}.` };
      }
    ];
    const g = generators[Math.floor(Math.random()*generators.length)];
    return g();
  }

  function renderNew(){
    const item = makeOne();
    act.__seqItem = item;
    seqLine.textContent = item.seq.join(", ") + ", ?";
    answer.textContent = "";
  }

  newBtn.addEventListener("click", renderNew);
  revealBtn.addEventListener("click", ()=>{
    const item = act.__seqItem || makeOne();
    answer.textContent = `Next: ${item.next} — Rule: ${item.rule}`;
  });

  btnRow.appendChild(newBtn);
  btnRow.appendChild(revealBtn);

  body.appendChild(seqLine);
  body.appendChild(hint);
  body.appendChild(btnRow);
  body.appendChild(answer);

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);
  openModal(overlay);

  renderNew();
}

/* ================= ACTIVITY LAUNCHERS ================= */
function launchNewTab(act){
  if (!act.url) return;
  window.open(act.url, "_blank", "noopener,noreferrer");
}

function launchIframe(act){
  let url = normalizeUrlForIframe(act.url);
  if (!url) return;

  // Reliability rule: YouTube always opens in a new tab
  if (isYouTubeUrl(url)){
    window.open(url, "_blank", "noopener,noreferrer");
    return;
  }

  const overlay = makeOverlay();

  const card = document.createElement("div");
  card.className = "actModalCard";

  const header = document.createElement("div");
  header.className = "actModalHeader";

  const title = document.createElement("div");
  title.className = "actModalTitle";
  title.textContent = act.name || "Activity";

  const closeBtn = document.createElement("button");
  closeBtn.className = "actModalClose";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeAllOverlays);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "actModalBody";

  const iframe = document.createElement("iframe");
  iframe.src = url;
  iframe.title = act.name || "Activity";
  iframe.loading = "lazy";
  iframe.referrerPolicy = "no-referrer";

  // Permissions (broad, but safe)
  iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share; fullscreen";
  iframe.className = "actIframe";

  body.appendChild(iframe);

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);

  openModal(overlay);
}

async function fetchRandomRiddleFromPage(url){
  // NOTE: Many sites block CORS. We'll try, then fall back.
  const res = await fetch(url, { mode: "cors" });
  if (!res.ok) throw new Error("Fetch failed");
  const html = await res.text();

  const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                   .replace(/<style[\s\S]*?<\/style>/gi, " ")
                   .replace(/<\/?[^>]+>/g, " ")
                   .replace(/\s+/g, " ")
                   .trim();

  const idx = text.toLowerCase().indexOf("answer");
  if (idx > -1){
    const snippet = text.slice(Math.max(0, idx - 300), idx + 300);
    return { riddle: snippet.slice(0, 220).trim(), answer: "Tap reveal (if included on page)." };
  }

  throw new Error("Parse failed");
}

function launchRiddle(act){
  const overlay = makeOverlay();

  const card = document.createElement("div");
  card.className = "actModalCard";

  const header = document.createElement("div");
  header.className = "actModalHeader";

  const title = document.createElement("div");
  title.className = "actModalTitle";
  title.textContent = act.name || "Random Riddle";

  const closeBtn = document.createElement("button");
  closeBtn.className = "actModalClose";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeAllOverlays);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "actModalBody";

  const box = document.createElement("div");
  box.className = "riddleBox";

  const q = document.createElement("div");
  q.className = "riddleQ";
  q.textContent = "Loading a riddle…";

  const a = document.createElement("div");
  a.className = "riddleA hidden";
  a.textContent = "";

  const btnRow = document.createElement("div");
  btnRow.className = "riddleBtns";

  const newBtn = document.createElement("button");
  newBtn.type = "button";
  newBtn.textContent = "New riddle";

  const revealBtn = document.createElement("button");
  revealBtn.type = "button";
  revealBtn.textContent = "Reveal answer";

  function setFallback(){
    const FALLBACK = [
      { r:"What has to be broken before you can use it?", a:"An egg." },
      { r:"I’m tall when I’m young, and I’m short when I’m old. What am I?", a:"A candle." },
      { r:"What has hands but can’t clap?", a:"A clock." },
      { r:"What gets wetter as it dries?", a:"A towel." },
      { r:"What can you catch but not throw?", a:"A cold." }
    ];
    const pick = FALLBACK[Math.floor(Math.random()*FALLBACK.length)];
    q.textContent = pick.r;
    a.textContent = pick.a;
    a.classList.add("hidden");
  }

  async function loadRiddle(){
    a.classList.add("hidden");
    q.textContent = "Loading a riddle…";
    try{
      if (act.url){
        const parsed = await fetchRandomRiddleFromPage(act.url);
        q.textContent = parsed.riddle || "Riddle loaded (could not parse clearly).";
        a.textContent = parsed.answer || "Answer not available from this source.";
      } else {
        setFallback();
      }
    } catch(e){
      setFallback();
    }
  }

  revealBtn.addEventListener("click", ()=>{
    a.classList.toggle("hidden");
  });
  newBtn.addEventListener("click", loadRiddle);

  btnRow.appendChild(newBtn);
  btnRow.appendChild(revealBtn);

  box.appendChild(q);
  box.appendChild(a);
  box.appendChild(btnRow);

  body.appendChild(box);

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);

  openModal(overlay);
  loadRiddle();
}

/* ================= RPS (hard-coded + animation) ================= */
const RPS_ITEMS = [
  { name:"Rock", emoji:"🪨" },
  { name:"Paper", emoji:"📄" },
  { name:"Scissors", emoji:"✂️" }
];

function launchRPS(){
  const overlay = makeOverlay();

  const card = document.createElement("div");
  card.className = "actModalCard rpsCard";

  const header = document.createElement("div");
  header.className = "actModalHeader";

  const title = document.createElement("div");
  title.className = "actModalTitle";
  title.textContent = "Rock • Paper • Scissors";

  const closeBtn = document.createElement("button");
  closeBtn.className = "actModalClose";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeAllOverlays);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "actModalBody";

  const big = document.createElement("div");
  big.className = "rpsBig";
  big.textContent = "🪨";

  const label = document.createElement("div");
  label.className = "rpsLabel";
  label.textContent = "Rock";

  const hint = document.createElement("div");
  hint.className = "smallNote";
  hint.textContent = "Roll at the same time as your partner says “Rock, Paper, Scissors… shoot!”";

  const btnRow = document.createElement("div");
  btnRow.className = "riddleBtns";

  const rollBtn = document.createElement("button");
  rollBtn.type = "button";
  rollBtn.textContent = "Roll";

  const againBtn = document.createElement("button");
  againBtn.type = "button";
  againBtn.textContent = "Roll again";

  let rolling = false;
  async function animateRoll(){
    if (rolling) return;
    rolling = true;

    const spins = 10 + Math.floor(Math.random()*6);
    for (let i=0; i<spins; i++){
      const pick = RPS_ITEMS[i % RPS_ITEMS.length];
      big.textContent = pick.emoji;
      label.textContent = pick.name;
      big.classList.add("rpsPulse");
      big.style.transform = `translateY(${(i%2? -2:2)}px) rotate(${(i%3-1)*3}deg)`;
      await new Promise(r => setTimeout(r, 60));
      big.classList.remove("rpsPulse");
    }

    const final = RPS_ITEMS[Math.floor(Math.random()*RPS_ITEMS.length)];
    big.textContent = final.emoji;
    label.textContent = final.name;
    big.style.transform = "translateY(0) rotate(0deg)";
    big.classList.add("rpsPop");
    setTimeout(()=>big.classList.remove("rpsPop"), 220);

    rolling = false;
  }

  rollBtn.addEventListener("click", animateRoll);
  againBtn.addEventListener("click", animateRoll);

  btnRow.appendChild(rollBtn);
  btnRow.appendChild(againBtn);

  body.appendChild(big);
  body.appendChild(label);
  body.appendChild(btnRow);
  body.appendChild(hint);

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);

  openModal(overlay);
  animateRoll();
}

/* ================= DISPATCH ================= */
function openCurrentActivity(){
  if (!current) return;

  // Reliability rule: any YouTube URL opens in a new tab, regardless of chosen type.
  if (current.url && isYouTubeUrl(current.url)){
    return launchNewTab(current);
  }

  if (current.type === "newtab") return launchNewTab(current);
  if (current.type === "iframe") return launchIframe(current);
  if (current.type === "riddle") return launchRiddle(current);
  if (current.type === "rps") return launchRPS();
  if (current.type === "sequence") return launchSequence(current);

  // For quick/timed breaks, nothing to open
}

/* ================= OPTIONAL: CHOOSER MODAL =================
   Works if your HTML contains: <button id="chooseBtn">Choose</button>
*/
function openChooserModal(){
  const overlay = makeOverlay();

  const card = document.createElement("div");
  card.className = "actModalCard";

  const header = document.createElement("div");
  header.className = "actModalHeader";

  const title = document.createElement("div");
  title.className = "actModalTitle";
  title.textContent = "Choose a Brain Break";

  const closeBtn = document.createElement("button");
  closeBtn.className = "actModalClose";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeAllOverlays);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "actModalBody";

  const search = document.createElement("input");
  search.type = "text";
  search.placeholder = "Search…";
  search.style.width = "100%";
  search.style.padding = "10px 12px";
  search.style.borderRadius = "12px";
  search.style.border = "1px solid rgba(0,0,0,0.15)";
  search.style.marginBottom = "10px";
  search.autocomplete = "off";

  const list = document.createElement("div");
  list.style.display = "grid";
  list.style.gap = "8px";

  const pool = enabledPool();

  function render(filterText=""){
    list.innerHTML = "";
    const q = filterText.trim().toLowerCase();

    const filtered = pool.filter(a=>{
      const hay = `${a.name} ${a.tag || ""} ${a.type || ""}`.toLowerCase();
      return !q || hay.includes(q);
    });

    if (!filtered.length){
      const empty = document.createElement("div");
      empty.className = "smallNote";
      empty.textContent = "No matches.";
      list.appendChild(empty);
      return;
    }

    filtered.forEach(act=>{
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "pillBtn";
      btn.style.display = "flex";
      btn.style.justifyContent = "space-between";
      btn.style.alignItems = "center";
      btn.style.padding = "12px 14px";

      const left = document.createElement("div");
      left.style.display = "grid";

      const name = document.createElement("div");
      name.style.fontWeight = "900";
      name.textContent = act.name;

      const meta = document.createElement("div");
      meta.className = "smallNote";
      const timerTxt = act.seconds ? ` • ${mmss(act.seconds)}` : "";
      meta.textContent = `${act.type}${timerTxt}${act.tag ? " • " + act.tag : ""}`;

      left.appendChild(name);
      left.appendChild(meta);

      const right = document.createElement("div");
      right.style.fontWeight = "900";
      right.textContent = "Select";

      btn.appendChild(left);
      btn.appendChild(right);

      btn.addEventListener("click", ()=>{
        setCurrent(act);
        closeAllOverlays();
      });

      list.appendChild(btn);
    });
  }

  search.addEventListener("input", ()=>render(search.value));

  body.appendChild(search);
  body.appendChild(list);

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);

  openModal(overlay);
  render("");
  search.focus();
}

/* ================= UI RENDERING ================= */
function setUI(){
  breakName.textContent = current ? current.name : "Tap to pick a break";
  breakAssist.textContent = current
    ? (current.steps && current.steps.length ? current.steps.join("\n") : "No instructions.")
    : "Click “Pick random” or press N";

  const hasTimer = !!(current && current.seconds);
  timeLeft.textContent = hasTimer ? mmss(remainingSec) : "--:--";

  let chip = "READY";
  if (!current) chip = "READY";
  else if (running) chip = "RUNNING";
  else if (hasTimer && remainingSec === 0) chip = "DONE";
  else if (hasTimer && remainingSec !== durationSec) chip = "PAUSED";
  else chip = hasTimer ? "READY" : "OPEN / QUICK";
  stateChip.textContent = chip;

  const pctDone = durationSec ? (1 - (remainingSec / durationSec)) : 0;
  progressFill.style.width = `${clamp(pctDone * 100, 0, 100)}%`;

  startPauseBtn.disabled = !hasTimer;
  startPauseBtn.textContent = running ? "Pause" : (hasTimer && remainingSec === 0 ? "Restart" : "Start");

  const openable = !!current && ["newtab","iframe","riddle","rps","sequence"].includes(current.type);
  openBtn.classList.toggle("hidden", !openable);

  if (!current) {
    document.body.style.backgroundColor = "var(--bgGrey)";
  } else if (running) {
    document.body.style.backgroundColor = "var(--bgOrange)";
  } else if (hasTimer && remainingSec === 0) {
    document.body.style.backgroundColor = "var(--bgGreen)";
  } else {
    document.body.style.backgroundColor = "var(--bgOrange)";
  }
}

function setCurrent(act){
  current = act;
  running = false;
  stopLoop();

  durationSec = act && act.seconds ? act.seconds : 0;
  remainingSec = durationSec;

  setUI();

  // Auto-open support (including newtab + sequence)
  if (act && act.autoOpen && ["iframe","riddle","rps","newtab","sequence"].includes(act.type)){
    openCurrentActivity();
  }
  if (act && act.seconds && act.autoOpen){
    start();
  }
}

function nextRandom(){
  const b = pickRandom();
  if (!b){
    alert("No activities enabled. Open Options and enable some.");
    return;
  }
  setCurrent(b);
}

/* ================= INCLUDE LIST UI ================= */
function renderIncludeList(){
  includeListEl.innerHTML = "";

  const list = document.createElement("div");
  list.className = "includeGrid";

  activities.forEach(act=>{
    const row = document.createElement("span");
    row.className = "pillBtn";
    row.title = "Include in random picker";

    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.id = `inc_${act.id}`;
    cb.checked = !!act.enabled;

    const lab = document.createElement("label");
    lab.setAttribute("for", cb.id);
    lab.textContent = act.name;

    cb.addEventListener("change", ()=>{
      act.enabled = cb.checked;
      saveActivities();
    });

    row.appendChild(cb);
    row.appendChild(lab);
    list.appendChild(row);
  });

  includeListEl.appendChild(list);
}

/* ================= TEACHER EDITOR UI ================= */
function renderTeacherPanel(){
  teacherPanelEl.innerHTML = "";

  const wrap = document.createElement("div");
  wrap.className = "teacherWrap";

  const topRow = document.createElement("div");
  topRow.className = "teacherTopRow";

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.textContent = "➕ Add activity";

  const exportBtn = document.createElement("button");
  exportBtn.type = "button";
  exportBtn.textContent = "⬇️ Export JSON";

  const importBtn = document.createElement("button");
  importBtn.type = "button";
  importBtn.textContent = "⬆️ Import JSON";

  const cssEnableWrap = document.createElement("span");
  cssEnableWrap.className = "pillBtn";
  const cssCb = document.createElement("input");
  cssCb.type = "checkbox";
  cssCb.id = "teacherCssEnabled";
  cssCb.checked = CAN_STORE && localStorage.getItem(STORAGE.TEACHER_CSS_ENABLED) === "1";
  const cssLab = document.createElement("label");
  cssLab.setAttribute("for","teacherCssEnabled");
  cssLab.textContent = "Teacher CSS";
  cssEnableWrap.appendChild(cssCb);
  cssEnableWrap.appendChild(cssLab);

  const cssDownloadBtn = document.createElement("button");
  cssDownloadBtn.type = "button";
  cssDownloadBtn.textContent = "⬇️ Download CSS";

  const cssUploadBtn = document.createElement("button");
  cssUploadBtn.type = "button";
  cssUploadBtn.textContent = "⬆️ Upload CSS";

  topRow.appendChild(addBtn);
  topRow.appendChild(exportBtn);
  topRow.appendChild(importBtn);
  topRow.appendChild(cssEnableWrap);
  topRow.appendChild(cssDownloadBtn);
  topRow.appendChild(cssUploadBtn);

  wrap.appendChild(topRow);

  const table = document.createElement("div");
  table.className = "teacherTable";

  activities.forEach((act, idx)=>{
    const row = document.createElement("div");
    row.className = "teacherRow";

    const title = document.createElement("div");
    title.className = "teacherRowTitle";
    title.textContent = act.name;

    const meta = document.createElement("div");
    meta.className = "teacherRowMeta";
    meta.textContent = `${act.type}${act.url ? " • " + act.url : ""}`;

    const btns = document.createElement("div");
    btns.className = "teacherRowBtns";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.textContent = "Edit";

    const upBtn = document.createElement("button");
    upBtn.type = "button";
    upBtn.textContent = "↑";
    upBtn.disabled = idx === 0;

    const downBtn = document.createElement("button");
    downBtn.type = "button";
    downBtn.textContent = "↓";
    downBtn.disabled = idx === activities.length - 1;

    const delBtn = document.createElement("button");
    delBtn.type = "button";
    delBtn.textContent = "Delete";
    delBtn.className = "danger";

    btns.appendChild(editBtn);
    btns.appendChild(upBtn);
    btns.appendChild(downBtn);
    btns.appendChild(delBtn);

    const left = document.createElement("div");
    left.className = "teacherRowLeft";
    left.appendChild(title);
    left.appendChild(meta);

    row.appendChild(left);
    row.appendChild(btns);

    editBtn.addEventListener("click", ()=> openEditModal(act));
    upBtn.addEventListener("click", ()=>{
      const t = activities[idx-1];
      activities[idx-1] = activities[idx];
      activities[idx] = t;
      saveActivities();
      renderAllPanels();
    });
    downBtn.addEventListener("click", ()=>{
      const t = activities[idx+1];
      activities[idx+1] = activities[idx];
      activities[idx] = t;
      saveActivities();
      renderAllPanels();
    });
    delBtn.addEventListener("click", ()=>{
      if (act.id === "rps"){
        alert("RPS is hard-coded and cannot be deleted.");
        return;
      }
      if (!confirm(`Delete "${act.name}"?`)) return;
      activities = activities.filter(a => a.id !== act.id);
      saveActivities();
      renderAllPanels();
      if (current && current.id === act.id){
        current = null;
        resetTimer();
      }
    });

    table.appendChild(row);
  });

  wrap.appendChild(table);

  const note = document.createElement("div");
  note.className = "smallNote";
  note.textContent =
    "Tip: ‘iframe’ opens inside the page. ‘newtab’ opens a new tab. YouTube links always open in a new tab (most reliable). ‘riddle’ always works (has a fallback). ‘sequence’ is built-in. RPS is built-in.";

  wrap.appendChild(note);

  // Wire teacher buttons
  addBtn.addEventListener("click", ()=>{
    const a = {
      id: uid("a"),
      name: "New activity",
      type: "iframe",         // ✅ default to iframe
      url: "",
      seconds: null,
      steps: ["Write instructions here…"],
      autoOpen: false,
      enabled: true,
      tag: ""
    };
    activities.unshift(a);
    saveActivities();
    renderAllPanels();
    openEditModal(a);
  });

  exportBtn.addEventListener("click", ()=>{
    const blob = new Blob([JSON.stringify({ activities }, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "activities.json";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  importBtn.addEventListener("click", ()=>{
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "application/json,.json";
    inp.addEventListener("change", ()=>{
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        const parsed = safeJsonParse(reader.result, null);
        if (!parsed || !Array.isArray(parsed.activities)){
          alert("Invalid JSON. Expected { activities: [...] }");
          return;
        }
        let imported = parsed.activities.map(normalizeActivity);
        if (!imported.some(a => a.id === "rps")){
          imported.push({
            id:"rps", name:"Rock • Paper • Scissors", type:"rps", url:"",
            enabled:true, autoOpen:true, seconds:null, tag:"", steps:["Open the game and roll on “shoot!”"]
          });
        }
        activities = imported;
        saveActivities();
        renderAllPanels();
      };
      reader.readAsText(file);
    });
    inp.click();
  });

  cssCb.addEventListener("change", ()=>{
    if (!CAN_STORE){
      alert("Local storage is blocked in this browser, so teacher settings can’t be saved.");
      cssCb.checked = false;
      return;
    }
    localStorage.setItem(STORAGE.TEACHER_CSS_ENABLED, cssCb.checked ? "1" : "0");
    applyTeacherCssIfEnabled();
  });

  cssDownloadBtn.addEventListener("click", ()=>{
    const cssText = CAN_STORE ? (localStorage.getItem(STORAGE.TEACHER_CSS_TEXT) || "") : "";
    const blob = new Blob([cssText], { type: "text/css" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "teacher.css";
    a.click();
    URL.revokeObjectURL(a.href);
  });

  cssUploadBtn.addEventListener("click", ()=>{
    const inp = document.createElement("input");
    inp.type = "file";
    inp.accept = "text/css,.css";
    inp.addEventListener("change", ()=>{
      const file = inp.files && inp.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = ()=>{
        if (!CAN_STORE){
          alert("Local storage is blocked in this browser, so teacher CSS can’t be saved.");
          return;
        }
        localStorage.setItem(STORAGE.TEACHER_CSS_TEXT, String(reader.result || ""));
        localStorage.setItem(STORAGE.TEACHER_CSS_ENABLED, "1");
        applyTeacherCssIfEnabled();
        renderTeacherPanel();
      };
      reader.readAsText(file);
    });
    inp.click();
  });

  teacherPanelEl.appendChild(wrap);
}

function openEditModal(act){
  const overlay = makeOverlay();

  const card = document.createElement("div");
  card.className = "actModalCard";

  const header = document.createElement("div");
  header.className = "actModalHeader";

  const title = document.createElement("div");
  title.className = "actModalTitle";
  title.textContent = `Edit: ${act.name}`;

  const closeBtn = document.createElement("button");
  closeBtn.className = "actModalClose";
  closeBtn.type = "button";
  closeBtn.textContent = "✕";
  closeBtn.addEventListener("click", closeAllOverlays);

  header.appendChild(title);
  header.appendChild(closeBtn);

  const body = document.createElement("div");
  body.className = "actModalBody";

  const form = document.createElement("div");
  form.className = "editForm";

  const nameIn = makeFieldText("Name", act.name);
  const typeIn = makeFieldSelect("Type", act.type, [
    ["quick","quick (no timer)"],
    ["timed","timed (with seconds)"],
    ["iframe","iframe (open inside page)"],
    ["newtab","newtab (open URL)"],
    ["riddle","riddle (random + fallback)"],
    ["sequence","sequence (guess the next number)"],
    ["rps","rps (built-in game)"]
  ]);
  const urlIn = makeFieldText("URL (for iframe/newtab/riddle)", act.url || "");
  const secondsIn = makeFieldNumber("Seconds (for timed)", act.seconds || 60);
  const autoOpenIn = makeFieldCheckbox("Auto-open when selected", !!act.autoOpen);
  const enabledIn = makeFieldCheckbox("Enabled in random picker", act.enabled !== false);
  const stepsIn = makeFieldTextarea("Steps / instructions (one per line)", (act.steps || []).join("\n"));

  if (act.id === "rps"){
    urlIn.input.disabled = true;
    secondsIn.input.disabled = true;
  }
  if (act.type === "sequence"){
    urlIn.input.disabled = true;
    secondsIn.input.disabled = true;
  }

  function refreshVisibility(){
    const t = typeIn.select.value;
    secondsIn.wrap.classList.toggle("hidden", t !== "timed");
    urlIn.wrap.classList.toggle("hidden", (t === "quick" || t === "timed" || t === "rps" || t === "sequence"));
  }
  typeIn.select.addEventListener("change", refreshVisibility);
  refreshVisibility();

  const btnRow = document.createElement("div");
  btnRow.className = "editBtns";

  const saveBtn = document.createElement("button");
  saveBtn.type = "button";
  saveBtn.textContent = "Save";

  const cancelBtn = document.createElement("button");
  cancelBtn.type = "button";
  cancelBtn.textContent = "Cancel";

  btnRow.appendChild(saveBtn);
  btnRow.appendChild(cancelBtn);

  cancelBtn.addEventListener("click", closeAllOverlays);

  saveBtn.addEventListener("click", ()=>{
    act.name = nameIn.input.value.trim() || "Untitled";
    act.type = typeIn.select.value;

    const rawUrl = urlIn.input.value.trim();
    act.url = rawUrl; // ✅ keep pasted URL as-is (including YouTube)

    act.enabled = enabledIn.input.checked;
    act.autoOpen = autoOpenIn.input.checked;

    if (act.type === "timed"){
      const n = parseInt(secondsIn.input.value, 10);
      act.seconds = Number.isFinite(n) ? clamp(n, 5, 60*60) : 60;
    } else {
      act.seconds = null;
    }

    act.steps = stepsIn.textarea.value
      .split("\n")
      .map(s=>s.trim())
      .filter(Boolean);

    saveActivities();
    renderAllPanels();

    if (current && current.id === act.id){
      setCurrent(act);
    }

    closeAllOverlays();
  });

  form.appendChild(nameIn.wrap);
  form.appendChild(typeIn.wrap);
  form.appendChild(urlIn.wrap);
  form.appendChild(secondsIn.wrap);
  form.appendChild(autoOpenIn.wrap);
  form.appendChild(enabledIn.wrap);
  form.appendChild(stepsIn.wrap);
  form.appendChild(btnRow);

  body.appendChild(form);

  card.appendChild(header);
  card.appendChild(body);
  overlay.appendChild(card);

  openModal(overlay);
}

/* Field builders */
function makeFieldWrap(label){
  const wrap = document.createElement("div");
  wrap.className = "editField";
  const lab = document.createElement("div");
  lab.className = "editLabel";
  lab.textContent = label;
  wrap.appendChild(lab);
  return { wrap };
}
function makeFieldText(label, value){
  const { wrap } = makeFieldWrap(label);
  const input = document.createElement("input");
  input.type = "text";
  input.value = value || "";
  wrap.appendChild(input);
  return { wrap, input };
}
function makeFieldNumber(label, value){
  const { wrap } = makeFieldWrap(label);
  const input = document.createElement("input");
  input.type = "number";
  input.min = "5";
  input.max = "3600";
  input.step = "5";
  input.value = String(value ?? 60);
  wrap.appendChild(input);
  return { wrap, input };
}
function makeFieldTextarea(label, value){
  const { wrap } = makeFieldWrap(label);
  const textarea = document.createElement("textarea");
  textarea.rows = 6;
  textarea.value = value || "";
  wrap.appendChild(textarea);
  return { wrap, textarea };
}
function makeFieldCheckbox(label, checked){
  const { wrap } = makeFieldWrap(label);
  const pill = document.createElement("span");
  pill.className = "pillBtn";
  const input = document.createElement("input");
  input.type = "checkbox";
  input.checked = !!checked;
  const id = uid("cb");
  input.id = id;
  const lab = document.createElement("label");
  lab.setAttribute("for", id);
  lab.textContent = label;
  pill.appendChild(input);
  pill.appendChild(lab);
  wrap.appendChild(pill);
  return { wrap, input };
}
function makeFieldSelect(label, value, options){
  const { wrap } = makeFieldWrap(label);
  const select = document.createElement("select");
  select.className = "editSelect";
  options.forEach(([val, text])=>{
    const o = document.createElement("option");
    o.value = val;
    o.textContent = text;
    if (val === value) o.selected = true;
    select.appendChild(o);
  });
  wrap.appendChild(select);
  return { wrap, select };
}

/* ================= RENDER ALL ================= */
function renderAllPanels(){
  renderIncludeList();
  renderTeacherPanel();
}

/* ================= WIRING ================= */
pickBtn?.addEventListener("click", nextRandom);
chooseBtn?.addEventListener("click", openChooserModal);

breakBtn?.addEventListener("click", ()=> { nextRandom(); });
startPauseBtn?.addEventListener("click", toggleStartPause);
openBtn?.addEventListener("click", ()=>{ openCurrentActivity(); });
resetBtn?.addEventListener("click", resetTimer);

resetAllBtn?.addEventListener("click", ()=>{
  if (!confirm("Reset all saved activities + teacher CSS?")) return;

  if (CAN_STORE){
    localStorage.removeItem(STORAGE.ACTIVITIES);
    localStorage.removeItem(STORAGE.TEACHER_CSS_TEXT);
    localStorage.removeItem(STORAGE.TEACHER_CSS_ENABLED);
  }

  loadActivities();
  applyTeacherCssIfEnabled();

  current = null;
  durationSec = 0;
  remainingSec = 0;
  running = false;
  stopLoop();
  setUI();
  renderAllPanels();
  closeMenu();
});

document.addEventListener("keydown", (e)=>{
  const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
  if (tag === "input" || tag === "textarea" || tag === "select") return;

  if (e.key.toLowerCase() === "n"){
    e.preventDefault();
    nextRandom();
  }
  if (e.key.toLowerCase() === "l"){
    if (chooseBtn){
      e.preventDefault();
      openChooserModal();
    }
  }
  if (e.key === " "){
    const overlay = modalHost.querySelector(".actModalOverlay");
    if (overlay){
      e.preventDefault();
      const roll = modalHost.querySelector(".rpsCard .riddleBtns button");
      if (roll) roll.click();
      return;
    }
    e.preventDefault();
    toggleStartPause();
  }
  if (e.key.toLowerCase() === "o"){
    e.preventDefault();
    openCurrentActivity();
  }
  if (e.key.toLowerCase() === "r"){
    e.preventDefault();
    resetTimer();
  }
});

/* ================= INIT ================= */
function init(){
  applyTeacherCssIfEnabled();
  loadActivities();
  renderAllPanels();

  current = null;
  durationSec = 0;
  remainingSec = 0;
  running = false;
  stopLoop();
  setUI();
}
init();
