/* =========================================================
   PHS Classroom Tools — brainbreak.js (FULL)
   ---------------------------------------------------------
   Requires in brainbreak.html (order matters):
     <link rel="stylesheet" href="styles.css">
     <link rel="stylesheet" href="activities.css"> (optional if loaded by activities.js)
     <script src="activities.js"></script>
     <script src="brainbreak.js"></script>

   Expects HTML IDs/classes from your existing brainbreak page:
     - optionsBtn, optionsMenu, closeMenu, menuHeader
     - fullscreenBtn, resetAllBtn
     - endSoundOn, autoStartOn, progressOn
     - includeList
     - breakBtn, breakName, breakAssist
     - progressTrack, progressFill
     - pickBtn, startPauseBtn, nextBtn, resetBtn
     - stateChip, timeLeft, modeHint

   Adds dynamically (if not present):
     - Activity modal (iframe/newtab/riddle/rps)
     - Teacher Activities editor (inside Options menu)
   ========================================================= */

(() => {
  "use strict";

  /* ================= HELPERS ================= */
  const $ = (id) => document.getElementById(id);
  const el = (tag, props = {}, children = []) => {
    const node = document.createElement(tag);
    Object.assign(node, props);
    children.forEach((c) => node.appendChild(typeof c === "string" ? document.createTextNode(c) : c));
    return node;
  };

  function clamp(n, lo, hi){ return Math.max(lo, Math.min(hi, n)); }

  function storageOK(){
    try{
      const k="__storage_test__";
      localStorage.setItem(k,"1");
      localStorage.removeItem(k);
      return true;
    } catch(e){
      return false;
    }
  }
  const CAN_STORE = storageOK();

  function safeJsonParse(raw, fallback){
    try{ return JSON.parse(raw); } catch(e){ return fallback; }
  }

  function uid(prefix="a_"){
    return prefix + Math.random().toString(16).slice(2) + Date.now().toString(16);
  }

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

  /* ================= PREFS (localStorage) ================= */
  const PREF = {
    INCLUDE: "phs_brain_include_v2",
    ENDSOUND: "phs_brain_endsound_v2",
    AUTOSTART: "phs_brain_autostart_v2",
    PROGRESS: "phs_brain_progress_v2",
    ACTIVITIES: "phs_brain_activities_v2",
    AUTOPEN: "phs_brain_autoopen_v2"
  };

  /* ================= DEFAULT BREAKS (timed/quick) ================= */
  const DEFAULT_BREAKS = [
    { id:"stretch2", name:"2-min stretch break", seconds: 120, steps:[
      "Stand up.",
      "Reach arms up for 10s.",
      "Shoulder rolls x10.",
      "Neck: look left/right (slow) x5.",
      "Shake out hands • sit back down."
    ]},
    { id:"walk3", name:"3-min walk + water", seconds: 180, steps:[
      "Stand up and push chair in.",
      "Walk calmly to the door/window and back.",
      "Grab a sip of water.",
      "Return to seat • ready to learn."
    ]},
    { id:"doodle2", name:"Quick doodle challenge (2 mins)", seconds: 120, steps:[
      "Draw: a robot cat / lava lamp / flying toaster (pick 1).",
      "Add 3 details (buttons, wheels, antenna, patterns).",
      "Show a neighbour (optional)."
    ]},
    { id:"wyr", name:"Would you rather (1 question)", seconds: null, steps:[
      "Teacher picks a quick question:",
      "Would you rather… have invisibility OR super speed?",
      "Point left/right to vote (no calling out).",
      "One student explains why (10 seconds)."
    ]},
    { id:"tidy90", name:"Desk tidy sprint (90s)", seconds: 90, steps:[
      "Clear rubbish.",
      "Stack books/papers.",
      "Put devices where they belong.",
      "Ready for the next task."
    ]},
    { id:"breathe60", name:"Breathing reset (60s)", seconds: 60, steps:[
      "Sit tall, feet on floor.",
      "Inhale 4… hold 2… exhale 6…",
      "Repeat until the timer ends."
    ]}
  ];

  /* ================= ACTIVITIES CONFIG (from activities.js + overrides) ================= */
  const BASE_CONFIG = window.PHS_ACTIVITIES || { cssUrl:"", activities:[] };

  function loadActivities(){
    // start from activities.js
    let acts = Array.isArray(BASE_CONFIG.activities) ? structuredClone(BASE_CONFIG.activities) : [];

    // teacher overrides (stored)
    if (CAN_STORE){
      const raw = localStorage.getItem(PREF.ACTIVITIES);
      if (raw){
        const saved = safeJsonParse(raw, null);
        if (saved && Array.isArray(saved.activities)){
          // Replace full list with teacher saved list
          acts = saved.activities;
        }
      }
    }

    // Normalize
    acts = acts.map(a => normalizeActivity(a)).filter(Boolean);

    // Ensure RPS exists (hard-coded option always available if teacher deletes it)
    if (!acts.some(a => a.id === "rps")){
      acts.push(normalizeActivity({ id:"rps", name:"Rock Paper Scissors", type:"rps", tag:"Quick Game", autoOpen:false }));
    }

    return acts;
  }

  function normalizeActivity(a){
    if (!a || typeof a !== "object") return null;
    const type = (a.type || a.mode || "").toLowerCase() || "iframe";

    // map legacy "mode"
    let finalType = type;
    if (finalType === "newtab") finalType = "newtab";
    if (finalType === "iframe") finalType = "iframe";
    if (finalType === "riddle") finalType = "riddle";
    if (finalType === "rps") finalType = "rps";

    // fallback: if unknown, default to newtab when url exists
    if (!["iframe","newtab","riddle","rps"].includes(finalType)){
      finalType = a.url ? "newtab" : "iframe";
    }

    return {
      id: String(a.id || uid("a_")),
      name: String(a.name || "Untitled Activity"),
      type: finalType,
      url: a.url ? String(a.url) : "",
      tag: a.tag ? String(a.tag) : "",
      steps: Array.isArray(a.steps) ? a.steps.map(String) : [],
      autoOpen: !!a.autoOpen,
      height: Number.isFinite(a.height) ? a.height : 720,
      cssUrl: a.cssUrl ? String(a.cssUrl) : ""
    };
  }

  function saveActivities(activities){
    if (!CAN_STORE) return;
    const payload = { cssUrl: BASE_CONFIG.cssUrl || "activities.css", activities };
    localStorage.setItem(PREF.ACTIVITIES, JSON.stringify(payload));
  }

  function ensureActivityCss(activity){
    // activities.js provides helper; use it if present
    if (typeof window.ensureActivityCss === "function"){
      window.ensureActivityCss(activity);
      return;
    }
    // simple fallback loader
    const url = activity && activity.cssUrl ? activity.cssUrl : "";
    if (!url) return;
    const existing = document.querySelector(`link[data-activity-css="${url}"]`);
    if (existing) return;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = url;
    link.dataset.activityCss = url;
    document.head.appendChild(link);
  }

  /* ================= BREAK LIST (includes activities) ================= */
  // We'll render BOTH:
  // - timed/quick breaks (DEFAULT_BREAKS)
  // - activities (ACTS) as selectable items in the same picker
  // Their "seconds" determines timer availability; activities are quick (no timer).
  let BREAKS = [];
  let ACTS = [];

  function buildBreaks(){
    ACTS = loadActivities();

    const activityBreaks = ACTS.map(a => ({
      id: `act_${a.id}`,
      name: a.name,
      seconds: null,
      steps: [
        a.tag ? `Tag: ${a.tag}` : "Activity",
        a.type === "iframe" ? "Opens inside the page." :
        a.type === "newtab" ? "Opens in a new tab." :
        a.type === "riddle" ? "Shows a random riddle." :
        a.type === "rps" ? "Opens the RPS game." : "Opens activity.",
        "Use the Open button."
      ],
      activityId: a.id
    }));

    BREAKS = [...DEFAULT_BREAKS, ...activityBreaks];

    // Load include prefs
    loadIncludePrefs();
  }

  /* ================= INCLUDE PREFS ================= */
  function loadIncludePrefs(){
    BREAKS.forEach(b => b.enabled = true);

    if (!CAN_STORE) return;
    const rawInc = localStorage.getItem(PREF.INCLUDE);
    if (!rawInc) return;

    const inc = safeJsonParse(rawInc, null);
    if (!inc || typeof inc !== "object") return;

    BREAKS.forEach(b => {
      if (inc[b.id] !== undefined) b.enabled = !!inc[b.id];
    });
  }

  function saveIncludePrefs(){
    if (!CAN_STORE) return;
    const inc = {};
    BREAKS.forEach(b => inc[b.id] = !!b.enabled);
    localStorage.setItem(PREF.INCLUDE, JSON.stringify(inc));
  }

  /* ================= OPTIONS MENU (existing wiring) ================= */
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

  optionsBtn?.addEventListener("click", (e) => { e.stopPropagation(); toggleMenu(); });
  ["pointerdown","click"].forEach(evt => {
    closeMenuBtn?.addEventListener(evt, (e) => { e.preventDefault(); e.stopPropagation(); closeMenu(); });
  });

  document.addEventListener("pointerdown", (e) => {
    if (!optionsMenu || optionsMenu.classList.contains("hidden")) return;
    if (!optionsMenu.contains(e.target) && e.target !== optionsBtn) closeMenu();
  });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMenu(); });

  let dragStartY = null;
  menuHeader?.addEventListener("pointerdown", (e) => { dragStartY = e.clientY; menuHeader.setPointerCapture(e.pointerId); });
  menuHeader?.addEventListener("pointermove", (e) => {
    if (dragStartY === null) return;
    const dy = e.clientY - dragStartY;
    if (dy > 70) { dragStartY = null; closeMenu(); }
  });
  menuHeader?.addEventListener("pointerup", () => dragStartY = null);
  menuHeader?.addEventListener("pointercancel", () => dragStartY = null);

  /* ================= FULLSCREEN ================= */
  $("fullscreenBtn")?.addEventListener("click", async ()=>{
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
    if ($("fullscreenBtn")) $("fullscreenBtn").textContent = document.fullscreenElement ? "Exit full screen" : "Full screen";
  });

  /* ================= UI STATE (timer assistant) ================= */
  let current = null;
  let durationSec = 0;
  let remainingSec = 0;
  let running = false;
  let rafId = null;
  let lastTickMs = 0;

  function mmss(totalSeconds){
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${String(s).padStart(2,"0")}`;
  }

  function setProgressVisible(on){
    const el = $("progressTrack");
    if (!el) return;
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

  function isActivityBreak(b){
    return !!(b && b.activityId);
  }

  function setUI(){
    $("breakName").textContent = current ? current.name : "Tap to pick a break";
    $("breakAssist").textContent = current ? current.steps.join("\n") : "Click here or press “Next”";

    $("timeLeft").textContent = (current && current.seconds) ? mmss(remainingSec) : "--:--";

    let chip = "READY";
    if (!current) chip = "READY";
    else if (isActivityBreak(current)) chip = "ACTIVITY";
    else if (running) chip = "RUNNING";
    else if (current.seconds && remainingSec === 0) chip = "DONE";
    else if (current.seconds && remainingSec !== durationSec) chip = "PAUSED";
    else chip = (current.seconds ? "READY" : "NO TIMER");

    $("stateChip").textContent = chip;

    $("startPauseBtn").disabled = !current || !current.seconds || isActivityBreak(current);
    $("startPauseBtn").textContent = running ? "Pause" : (current && current.seconds && remainingSec === 0 ? "Restart" : "Start");

    const pctDone = durationSec ? (1 - (remainingSec / durationSec)) : 0;
    $("progressFill").style.width = `${clamp(pctDone * 100, 0, 100)}%`;

    // mode hint
    const mh = $("modeHint");
    if (mh){
      mh.textContent = !current ? "Any"
        : isActivityBreak(current) ? "Activity"
        : current.seconds ? "Timed" : "Quick";
    }

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
        if ($("endSoundOn")?.checked) finishChime();
        return;
      }
    }

    rafId = requestAnimationFrame(tickLoop);
  }

  function start(){
    if (!current || !current.seconds || isActivityBreak(current)) return;
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
    const pool = BREAKS.filter(b => b.enabled !== false);
    if (!pool.length){
      alert("No breaks enabled. Turn some back on in Options.");
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

    if (b.seconds && $("autoStartOn")?.checked){
      start();
    }

    // If this is an activity & autoOpen is on, open it immediately
    if (isActivityBreak(b)){
      const act = getActivityById(b.activityId);
      if (act && act.autoOpen){
        openActivity(act);
      }
    }
  }

  function nextBreak(){
    const b = pickRandom();
    if (!b) return;
    setBreak(b);
  }

  /* ================= INCLUDE LIST UI ================= */
  function renderIncludeList(){
    const wrap = $("includeList");
    if (!wrap) return;

    wrap.innerHTML = "";

    // group: breaks vs activities
    const breaks = BREAKS.filter(b => !isActivityBreak(b));
    const acts = BREAKS.filter(b => isActivityBreak(b));

    const group = (title, items) => {
      const d = el("details", { open: true });
      const s = el("summary", {}, [title]);
      const inner = el("div", { className: "u-grid u-gap-8 u-mt-8" });

      items.forEach(b=>{
        const row = el("span", { className: "pillBtn", title: "Include in random picker" });
        const cb = el("input", { type:"checkbox", id:`inc_${b.id}` });
        cb.checked = b.enabled !== false;

        const lab = el("label", { htmlFor: cb.id }, [b.name]);

        cb.addEventListener("change", ()=>{
          b.enabled = cb.checked;
          saveIncludePrefs();
        });

        row.appendChild(cb);
        row.appendChild(lab);
        inner.appendChild(row);
      });

      d.appendChild(s);
      d.appendChild(el("div", { className: "u-h-10" }));
      d.appendChild(inner);
      return d;
    };

    wrap.appendChild(group("Breaks", breaks));
    wrap.appendChild(el("div", { className: "u-h-10" }));
    wrap.appendChild(group("Activities", acts));
  }

  /* ================= ACTIVITY MODAL (iframe/newtab/riddle/rps) ================= */
  function ensureActivityModal(){
    if ($("activityModal")) return;

    const modal = el("div", {
      id: "activityModal",
      className: "modalOverlay hidden",
      role: "dialog",
      ariaModal: "true",
      ariaLabelledby: "activityTitle"
    });

    const card = el("div", { className: "modalCard" });
    const header = el("div", { className: "modalHeader" });

    const title = el("div", { className: "modalTitle", id: "activityTitle", textContent: "Activity" });
    const close = el("button", { id:"activityClose", type:"button", title:"Close", textContent:"✕" });

    header.appendChild(title);
    header.appendChild(close);

    const body = el("div", { className: "modalBody", id: "activityBody" });
    const actions = el("div", { className: "modalActions", id: "activityActions" });

    card.appendChild(header);
    card.appendChild(body);
    card.appendChild(actions);

    modal.appendChild(card);
    document.body.appendChild(modal);

    // close wiring
    close.addEventListener("click", closeActivityModal);
    modal.addEventListener("pointerdown", (e)=>{ if (e.target === modal) closeActivityModal(); });
  }

  function closeActivityModal(){
    const modal = $("activityModal");
    if (!modal) return;
    modal.classList.add("hidden");

    // stop any iframe content by clearing it
    const body = $("activityBody");
    if (body) body.innerHTML = "";

    const actions = $("activityActions");
    if (actions) actions.innerHTML = "";
  }

  function openActivityModal(titleText){
    ensureActivityModal();
    $("activityTitle").textContent = titleText || "Activity";
    $("activityModal").classList.remove("hidden");
  }

  function getActivityById(id){
    return ACTS.find(a => a.id === id) || (typeof window.getActivityById === "function" ? window.getActivityById(id) : null);
  }

  async function openActivity(activity){
    if (!activity) return;

    ensureActivityCss(activity);
    openActivityModal(activity.name);

    const body = $("activityBody");
    const actions = $("activityActions");
    body.innerHTML = "";
    actions.innerHTML = "";

    if (activity.type === "newtab"){
      // open immediately
      if (activity.url) window.open(activity.url, "_blank", "noopener,noreferrer");
      body.appendChild(el("div", { className:"smallNote", textContent:"Opened in a new tab. You can close this panel." }));
      actions.appendChild(el("button", { type:"button", textContent:"Open again" }));
      actions.lastChild.addEventListener("click", ()=> activity.url && window.open(activity.url, "_blank", "noopener,noreferrer"));
      actions.appendChild(el("button", { type:"button", textContent:"Close" }));
      actions.lastChild.addEventListener("click", closeActivityModal);
      return;
    }

    if (activity.type === "iframe"){
      const frame = el("iframe", {
        className: "activityFrame",
        src: activity.url || "about:blank",
        title: activity.name,
        loading: "lazy",
        referrerPolicy: "no-referrer"
      });
      if (activity.height){
        frame.style.height = `min(78vh, ${activity.height}px)`;
      }
      body.appendChild(frame);

      actions.appendChild(el("button", { type:"button", textContent:"Open in new tab" }));
      actions.lastChild.addEventListener("click", ()=> activity.url && window.open(activity.url, "_blank", "noopener,noreferrer"));
      actions.appendChild(el("button", { type:"button", textContent:"Close" }));
      actions.lastChild.addEventListener("click", closeActivityModal);
      return;
    }

    if (activity.type === "rps"){
      renderRps(body, actions);
      return;
    }

    if (activity.type === "riddle"){
      renderRiddle(activity, body, actions);
      return;
    }

    body.appendChild(el("div", { className:"smallNote", textContent:"Unknown activity type." }));
    actions.appendChild(el("button", { type:"button", textContent:"Close" }));
    actions.lastChild.addEventListener("click", closeActivityModal);
  }

  /* ================= RPS (with simple animation between rolls) ================= */
  const RPS_CHOICES = [
    { name:"Rock", emoji:"🪨" },
    { name:"Paper", emoji:"📄" },
    { name:"Scissors", emoji:"✂️" }
  ];

  function renderRps(body, actions){
    const stage = el("div", { className:"rpsStage" });
    const big = el("div", { className:"rpsBig", id:"rpsBig", textContent:"🪨" });
    const label = el("p", { className:"rpsLabel", id:"rpsLabel", textContent:"Rock" });
    const note = el("div", { className:"smallNote", textContent:"Click Roll on “shoot!” (Space rolls too)." });

    stage.appendChild(big);
    stage.appendChild(label);
    stage.appendChild(note);
    body.appendChild(stage);

    const btnRoll = el("button", { type:"button", textContent:"Roll" });
    const btnAgain = el("button", { type:"button", textContent:"Roll again" });
    const btnClose = el("button", { type:"button", textContent:"Close" });

    actions.appendChild(btnRoll);
    actions.appendChild(btnAgain);
    actions.appendChild(btnClose);

    btnClose.addEventListener("click", closeActivityModal);

    let rolling = false;

    const doRoll = () => {
      if (rolling) return;
      rolling = true;

      // animate by rapidly swapping emojis for ~650ms
      big.classList.add("isRolling");
      const start = performance.now();
      const interval = setInterval(()=>{
        const pick = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)];
        big.textContent = pick.emoji;
        label.textContent = pick.name;
      }, 80);

      setTimeout(()=>{
        clearInterval(interval);
        big.classList.remove("isRolling");

        const final = RPS_CHOICES[Math.floor(Math.random() * RPS_CHOICES.length)];
        big.textContent = final.emoji;
        label.textContent = final.name;

        // little pop
        big.classList.add("isPop");
        setTimeout(()=> big.classList.remove("isPop"), 200);

        rolling = false;
      }, 680);
    };

    btnRoll.addEventListener("click", doRoll);
    btnAgain.addEventListener("click", doRoll);

    // roll once on open
    doRoll();

    // Space rolls while modal open
    const onKey = (e) => {
      if ($("activityModal")?.classList.contains("hidden")) return;
      if (e.key === " "){
        e.preventDefault();
        doRoll();
      }
    };
    document.addEventListener("keydown", onKey);

    // clean up listener on close
    const originalClose = closeActivityModal;
    const wrappedClose = () => {
      document.removeEventListener("keydown", onKey);
      originalClose();
      // restore original
      closeActivityModal = originalClose;
    };

    // temporarily override close handler for cleanup
    closeActivityModal = wrappedClose;
  }

  /* ================= RIDDLE (best-effort) =================
     IMPORTANT:
     Many sites block cross-origin fetching (CORS).
     If fetch fails, we open the page in a tab and show a message.
  ========================================================= */
  async function renderRiddle(activity, body, actions){
    const wrap = el("div", { className:"riddleWrap" });
    const q = el("p", { className:"riddleQuestion", textContent:"Loading a riddle…" });
    const div = el("div", { className:"riddleDivider" });
    const a = el("p", { className:"riddleAnswer isHidden", id:"riddleAnswer", textContent:"" });

    wrap.appendChild(q);
    wrap.appendChild(div);
    wrap.appendChild(a);
    body.appendChild(wrap);

    const btnNew = el("button", { type:"button", textContent:"New riddle" });
    const btnShow = el("button", { type:"button", textContent:"Show answer" });
    const btnOpen = el("button", { type:"button", textContent:"Open source page" });
    const btnClose = el("button", { type:"button", textContent:"Close" });

    actions.appendChild(btnNew);
    actions.appendChild(btnShow);
    actions.appendChild(btnOpen);
    actions.appendChild(btnClose);

    btnClose.addEventListener("click", closeActivityModal);
    btnOpen.addEventListener("click", ()=> activity.url && window.open(activity.url, "_blank", "noopener,noreferrer"));

    btnShow.addEventListener("click", ()=>{
      a.classList.toggle("isHidden");
      btnShow.textContent = a.classList.contains("isHidden") ? "Show answer" : "Hide answer";
    });

    async function loadOne(){
      q.textContent = "Loading a riddle…";
      a.textContent = "";
      a.classList.add("isHidden");
      btnShow.textContent = "Show answer";

      // Best-effort fetch. If blocked by CORS, fall back.
      try{
        const resp = await fetch(activity.url, { method:"GET", mode:"cors", credentials:"omit" });
        if (!resp.ok) throw new Error("HTTP " + resp.status);
        const html = await resp.text();

        // naive parsing heuristics (site may change)
        // Try to locate common “Riddle:” and “Answer:” areas.
        const text = html.replace(/<script[\s\S]*?<\/script>/gi, " ")
                         .replace(/<style[\s\S]*?<\/style>/gi, " ")
                         .replace(/<\/?[^>]+>/g, " ")
                         .replace(/\s+/g, " ")
                         .trim();

        // Attempt to extract by keywords
        const idxR = text.toLowerCase().indexOf("riddle");
        const idxA = text.toLowerCase().indexOf("answer");

        if (idxR === -1){
          q.textContent = "Couldn’t extract a riddle (site layout changed).";
          a.textContent = "Open the source page to use the riddle.";
          a.classList.remove("isHidden");
          return;
        }

        // Take a slice around “riddle”
        const slice = text.slice(idxR, idxR + 600);

        // Crude split
        let riddle = slice;
        let answer = "";

        const ai = slice.toLowerCase().indexOf("answer");
        if (ai !== -1){
          riddle = slice.slice(0, ai);
          answer = slice.slice(ai);
        }

        // Clean labels
        riddle = riddle.replace(/riddle[:\s]*/i, "").trim();
        answer = answer.replace(/answer[:\s]*/i, "").trim();

        // Keep tidy lengths
        riddle = riddle.slice(0, 260);
        answer = answer.slice(0, 260);

        q.textContent = riddle || "Riddle loaded (but text was empty).";
        a.textContent = answer || "Answer not found on page text. Open source page.";
      } catch (e){
        // CORS / blocked etc.
        q.textContent = "This site won’t allow embedding the riddle directly (blocked by browser security).";
        a.textContent = "Use “Open source page” to get a random riddle.";
        a.classList.remove("isHidden");
      }
    }

    btnNew.addEventListener("click", loadOne);

    await loadOne();
  }

  /* ================= TEACHER ACTIVITY EDITOR (in Options) ================= */
  function ensureTeacherEditor(){
    const menuBody = optionsMenu?.querySelector(".menuBody");
    if (!menuBody) return;
    if ($("teacherActivitiesSection")) return;

    const section = el("details", { id:"teacherActivitiesSection", open:false });
    const sum = el("summary", {}, ["Teacher: Activities"]);
    section.appendChild(sum);

    const pad = el("div", { className:"u-h-10" });
    section.appendChild(pad);

    const note = el("div", { className:"smallNote", textContent:
      "Add/edit activities here. These save on this device (localStorage). " +
      "Use Export to download a JSON you can keep as a backup."
    });
    section.appendChild(note);

    section.appendChild(el("div", { className:"u-h-10" }));

    const list = el("div", { id:"activitiesEditorList", className:"activityList" });
    section.appendChild(list);

    section.appendChild(el("div", { className:"u-h-10" }));

    const row = el("div", { className:"menuRow" });
    const btnAdd = el("button", { type:"button", textContent:"Add activity" });
    const btnExport = el("button", { type:"button", textContent:"Export JSON" });
    const btnImport = el("button", { type:"button", textContent:"Import JSON" });
    row.appendChild(btnAdd);
    row.appendChild(btnExport);
    row.appendChild(btnImport);
    section.appendChild(row);

    const importHint = el("div", { className:"smallNote", textContent:
      "Import replaces your current activities list. Keep a backup via Export."
    });
    section.appendChild(importHint);

    // hidden file input
    const fileIn = el("input", { type:"file", accept:"application/json", className:"hidden", id:"importFile" });
    section.appendChild(fileIn);

    // Add section into menu body (near bottom)
    menuBody.appendChild(el("div", { className:"divider" }));
    menuBody.appendChild(section);

    function renderEditor(){
      list.innerHTML = "";

      ACTS.forEach((a, idx)=>{
        const item = el("div", { className:"activityItem" });

        const top = el("div", { className:"activityItemTop" });
        top.appendChild(el("div", { className:"activityItemTitle", textContent: a.name }));

        const btns = el("div", { className:"inlineToggles" });
        const del = el("button", { type:"button", textContent:"Delete", className:"danger" });
        btns.appendChild(del);
        top.appendChild(btns);

        item.appendChild(top);

        const fields = el("div", { className:"activityFields" });

        // name
        fields.appendChild(fieldText("Name", a.name, (v)=>{ a.name = v; sync(); }));

        // type
        fields.appendChild(fieldSelect("Type", a.type, ["iframe","newtab","riddle","rps"], (v)=>{
          a.type = v;
          if (v === "rps") a.url = "";
          sync();
        }));

        // url
        fields.appendChild(fieldText("URL", a.url, (v)=>{ a.url = v; sync(); }, a.type === "rps"));

        // tag
        fields.appendChild(fieldText("Tag", a.tag, (v)=>{ a.tag = v; sync(); }));

        // autoOpen
        fields.appendChild(fieldCheckbox("Auto-open", a.autoOpen, (v)=>{ a.autoOpen = v; sync(); }));

        // height
        fields.appendChild(fieldNumber("Iframe height (px)", a.height || 720, (v)=>{ a.height = v; sync(); }, a.type !== "iframe"));

        item.appendChild(fields);

        del.addEventListener("click", ()=>{
          // don't let teacher delete rps fully; we will re-add on reload, but let them hide it by include toggles
          ACTS.splice(idx, 1);
          if (!ACTS.some(x => x.id === "rps")){
            ACTS.push(normalizeActivity({ id:"rps", name:"Rock Paper Scissors", type:"rps", tag:"Quick Game", autoOpen:false }));
          }
          sync(true);
        });

        list.appendChild(item);
      });
    }

    function fieldText(label, value, onChange, disabled=false){
      const wrap = el("div");
      wrap.appendChild(el("div", { className:"miniLabel", textContent: label }));
      const input = el("input", { type:"text", value: value || "", disabled });
      input.addEventListener("input", ()=> onChange(input.value));
      wrap.appendChild(input);
      return wrap;
    }

    function fieldNumber(label, value, onChange, disabled=false){
      const wrap = el("div");
      wrap.appendChild(el("div", { className:"miniLabel", textContent: label }));
      const input = el("input", { type:"text", value: String(value ?? ""), disabled });
      input.addEventListener("input", ()=>{
        const n = parseInt(input.value, 10);
        if (Number.isFinite(n)) onChange(n);
      });
      wrap.appendChild(input);
      return wrap;
    }

    function fieldSelect(label, value, options, onChange){
      const wrap = el("div");
      wrap.appendChild(el("div", { className:"miniLabel", textContent: label }));
      const sel = el("select");
      options.forEach(o=>{
        const op = el("option", { value:o, textContent:o.toUpperCase() });
        if (o === value) op.selected = true;
        sel.appendChild(op);
      });
      sel.addEventListener("change", ()=> onChange(sel.value));
      wrap.appendChild(sel);
      return wrap;
    }

    function fieldCheckbox(label, value, onChange){
      const wrap = el("div");
      wrap.appendChild(el("div", { className:"miniLabel", textContent: label }));
      const row = el("span", { className:"pillBtn" });
      const cb = el("input", { type:"checkbox", checked: !!value });
      const lab = el("label", { textContent: "Enabled" });
      cb.addEventListener("change", ()=> onChange(cb.checked));
      row.appendChild(cb);
      row.appendChild(lab);
      wrap.appendChild(row);
      return wrap;
    }

    function sync(rebuild=false){
      // Save activities list
      saveActivities(ACTS);

      // Rebuild breaks list and include list (so activity names update)
      buildBreaks();
      renderIncludeList();
      setUI();

      if (rebuild) renderEditor();
    }

    btnAdd.addEventListener("click", ()=>{
      ACTS.unshift(normalizeActivity({
        id: uid("a_"),
        name: "New Activity",
        type: "iframe",
        url: "",
        tag: "",
        autoOpen: false,
        height: 720
      }));
      sync(true);
    });

    btnExport.addEventListener("click", ()=>{
      const payload = {
        cssUrl: BASE_CONFIG.cssUrl || "activities.css",
        activities: ACTS
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type:"application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "activities-export.json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
    });

    btnImport.addEventListener("click", ()=> fileIn.click());

    fileIn.addEventListener("change", async ()=>{
      const f = fileIn.files && fileIn.files[0];
      if (!f) return;
      try{
        const txt = await f.text();
        const data = safeJsonParse(txt, null);
        if (!data || !Array.isArray(data.activities)) throw new Error("Invalid JSON");
        ACTS = data.activities.map(normalizeActivity).filter(Boolean);
        // Ensure rps
        if (!ACTS.some(a=>a.id==="rps")){
          ACTS.push(normalizeActivity({ id:"rps", name:"Rock Paper Scissors", type:"rps", tag:"Quick Game", autoOpen:false }));
        }
        saveActivities(ACTS);
        buildBreaks();
        renderIncludeList();
        setUI();
        renderEditor();
      } catch(e){
        alert("Import failed. Make sure you selected a valid activities JSON export.");
      } finally{
        fileIn.value = "";
      }
    });

    renderEditor();
  }

  /* ================= WIRING for existing options toggles ================= */
  function loadBasicPrefs(){
    if (!CAN_STORE) return;

    const end = localStorage.getItem(PREF.ENDSOUND);
    if ($("endSoundOn")) $("endSoundOn").checked = (end === "1");

    const as = localStorage.getItem(PREF.AUTOSTART);
    if ($("autoStartOn")) $("autoStartOn").checked = (as === null) ? true : (as === "1");

    const pr = localStorage.getItem(PREF.PROGRESS);
    if ($("progressOn")) $("progressOn").checked = (pr === null) ? true : (pr === "1");
  }

  function saveBasicPrefs(){
    if (!CAN_STORE) return;
    localStorage.setItem(PREF.ENDSOUND, $("endSoundOn")?.checked ? "1" : "0");
    localStorage.setItem(PREF.AUTOSTART, $("autoStartOn")?.checked ? "1" : "0");
    localStorage.setItem(PREF.PROGRESS, $("progressOn")?.checked ? "1" : "0");
  }

  $("progressOn")?.addEventListener("change", ()=>{
    setProgressVisible($("progressOn").checked);
    saveBasicPrefs();
    setUI();
  });
  $("endSoundOn")?.addEventListener("change", ()=>{
    saveBasicPrefs();
    if ($("endSoundOn").checked) ensureAudio();
  });
  $("autoStartOn")?.addEventListener("change", saveBasicPrefs);

  /* ================= Buttons ================= */
  $("pickBtn")?.addEventListener("click", nextBreak);
  $("nextBtn")?.addEventListener("click", nextBreak);
  $("breakBtn")?.addEventListener("click", nextBreak);

  $("startPauseBtn")?.addEventListener("click", ()=>{
    if ($("endSoundOn")?.checked) ensureAudio();
    toggleStartPause();
  });

  $("resetBtn")?.addEventListener("click", resetTimer);

  /* Add/Open Activity button (shown for activity picks) */
  function ensureOpenActivityButton(){
    if ($("openActivityBtn")) return;
    const row = document.querySelector(".controlRow");
    if (!row) return;

    const btn = el("button", { id:"openActivityBtn", type:"button", textContent:"Open", className:"hidden" });
    row.insertBefore(btn, $("nextBtn") || null);

    btn.addEventListener("click", (e)=>{
      e.preventDefault();
      if (!current || !isActivityBreak(current)) return;
      const act = getActivityById(current.activityId);
      if (act) openActivity(act);
    });
  }

  function updateOpenActivityButton(){
    const btn = $("openActivityBtn");
    if (!btn) return;
    const show = current && isActivityBreak(current);
    btn.classList.toggle("hidden", !show);
  }

  /* Wrap setUI to also update Open button */
  const _setUI = setUI;
  setUI = function(){
    _setUI();
    updateOpenActivityButton();
  };

  /* Reset All */
  $("resetAllBtn")?.addEventListener("click", ()=>{
    if (CAN_STORE){
      localStorage.removeItem(PREF.INCLUDE);
      localStorage.removeItem(PREF.ENDSOUND);
      localStorage.removeItem(PREF.AUTOSTART);
      localStorage.removeItem(PREF.PROGRESS);
      // NOTE: We do NOT delete activities overrides by default, because teachers may want them preserved.
      // If you want to reset activities too, uncomment:
      // localStorage.removeItem(PREF.ACTIVITIES);
    }

    if ($("endSoundOn")) $("endSoundOn").checked = false;
    if ($("autoStartOn")) $("autoStartOn").checked = true;
    if ($("progressOn")) $("progressOn").checked = true;

    BREAKS.forEach(b => b.enabled = true);
    saveIncludePrefs();
    renderIncludeList();

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

    closeActivityModal();
    closeMenu();
  });

  /* Keyboard shortcuts */
  document.addEventListener("keydown", (e)=>{
    const tag = (e.target && e.target.tagName) ? e.target.tagName.toLowerCase() : "";
    if (tag === "input" || tag === "textarea" || tag === "select") return;

    if (e.key === " "){
      // if activity modal open and it’s RPS, that handler already intercepts
      if (!$("activityModal")?.classList.contains("hidden")) return;
      e.preventDefault();
      toggleStartPause();
    }
    if (e.key.toLowerCase() === "n"){ e.preventDefault(); nextBreak(); }
    if (e.key.toLowerCase() === "r"){ e.preventDefault(); resetTimer(); }
    if (e.key.toLowerCase() === "o"){
      // open activity quickly
      if (current && isActivityBreak(current)){
        e.preventDefault();
        const act = getActivityById(current.activityId);
        if (act) openActivity(act);
      }
    }
  });

  // prime audio on first interaction (if enabled)
  document.addEventListener("pointerdown", ()=>{
    if ($("endSoundOn")?.checked) ensureAudio();
  }, { once:true });

  /* ================= INIT ================= */
  function init(){
    loadBasicPrefs();
    ensureTeacherEditor();
    ensureActivityModal();
    ensureOpenActivityButton();

    buildBreaks();
    renderIncludeList();

    setProgressVisible($("progressOn")?.checked ?? true);
    setUI();
  }

  init();
})();
