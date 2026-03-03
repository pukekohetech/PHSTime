/* =========================================================
   whiteboard.js — background as DOM image (no zoom artefacts)

   ADDITIONS (requested):
     ✅ Transform handles on selected objects (scale corners + rotate handle)
     ✅ Shift = uniform scale
     ✅ Shift while rotating = snap to 15° increments
     ✅ Cursor changes when hovering handles
     ✅ Move/Scale/Rotate tools (↔ ⤡ ⟲) act on selection if selected; otherwise background
     ✅ Delete key removes selected object

   Existing:
     + Line/Arrow precision snapping:
       - Default: end point snaps to nearest whole-millimetre LENGTH
       - Ctrl/Cmd: snaps to nearby endpoints/intersections; if none nearby, angle-snaps (0/30/45/60/90 etc.)
     ✅ DPR-safe transforms & pointer mapping using inkCanvas rect

   FIXES (this version):
     ✅ Circles: Ctrl snaps + whole-mm snapping + live size tooltip (and Shift = perfect circle)
     ✅ Arcs: draw CW/CCW, accumulate sweep, snap to full circle, show radius + arc length tooltip
     ✅ SVG export: bg image uses href + xlink:href; arcs export with direction; full circle -> <circle>
     ✅ SVG import: if SVG contains <image>, restore it as background (visible)
     ✅ Removed accidental SVG reveal handler from paste() (was using e.key in paste event)
     ✅ New board matches initial zoomed-out view
     ✅ Line/Arrow default snapping changed from "whole-mm grid" to "whole-mm length"
   ========================================================= */

(() => {
  // ---------- DOM ----------
  const stage = document.getElementById("stage");

  // ---------- Measurement tooltip (Line/Rect/Circle/Arc tools) ----------
  const measureTip = document.createElement("div");
  measureTip.id = "measureTip";
  measureTip.style.position = "absolute";
  measureTip.style.zIndex = "50";
  measureTip.style.pointerEvents = "none";
  measureTip.style.padding = "4px 8px";
  measureTip.style.borderRadius = "10px";
  measureTip.style.background = "rgba(0,0,0,0.72)";
  measureTip.style.color = "#fff";
  measureTip.style.font =
    "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  measureTip.style.boxShadow = "0 8px 20px rgba(0,0,0,0.22)";
  measureTip.style.transform = "translate(10px, 10px)";
  measureTip.style.display = "none";
  stage.appendChild(measureTip);

     // ---------- Floating length entry (type while dragging line/arrow) ----------
  const lenBox = document.createElement("div");
  lenBox.id = "lenBox";
  lenBox.style.position = "absolute";
  lenBox.style.zIndex = "60";
  lenBox.style.pointerEvents = "auto";
  lenBox.style.display = "none";
  lenBox.style.padding = "6px 8px";
  lenBox.style.borderRadius = "12px";
  lenBox.style.background = "rgba(0,0,0,0.78)";
  lenBox.style.color = "#fff";
  lenBox.style.boxShadow = "0 10px 26px rgba(0,0,0,0.25)";
  lenBox.style.transform = "translate(12px, 12px)";
  lenBox.style.font = "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";

  const lenInput = document.createElement("input");
  lenInput.type = "text";
  lenInput.inputMode = "decimal";
  lenInput.autocomplete = "off";
  lenInput.placeholder = "mm";
  lenInput.style.width = "92px";
  lenInput.style.border = "0";
  lenInput.style.outline = "0";
  lenInput.style.borderRadius = "10px";
  lenInput.style.padding = "6px 8px";
  lenInput.style.background = "rgba(255,255,255,0.12)";
  lenInput.style.color = "#fff";

  const lenSuffix = document.createElement("span");
  lenSuffix.textContent = "  mm";
  lenSuffix.style.opacity = "0.9";
  lenSuffix.style.marginLeft = "6px";

  lenBox.appendChild(lenInput);
  lenBox.appendChild(lenSuffix);
  stage.appendChild(lenBox);

  const lenEntry = {
    open: false,
    sx: 0,
    sy: 0
  };

  function openLenBoxAt(sx, sy, currentMmText) {
  lenEntry.open = true;
  lenEntry.seedMm = parseMmInput(currentMmText) ?? null;

  lenBox.style.left = Math.round(sx + 12) + "px";
  lenBox.style.top  = Math.round(sy + 12) + "px";
  lenBox.style.display = "block";

  // ✅ Start typing immediately without deleting anything
  lenInput.value = "";
  lenInput.placeholder = String(currentMmText || "");
  lenInput.focus({ preventScroll: true });
}

  function moveLenBoxTo(sx, sy) {
    if (!lenEntry.open) return;
    lenEntry.sx = sx;
    lenEntry.sy = sy;
    lenBox.style.left = sx + "px";
    lenBox.style.top = sy + "px";
  }

  function closeLenBox() {
    lenEntry.open = false;
    lenBox.style.display = "none";
    lenInput.value = "";
  }

 function parseMmInput(v) {
  const s = String(v || "").trim();
  if (!s) return null;

  // allow "120", "120mm", "120.5"
  const n = parseFloat(s.replace(/[^0-9.+-]/g, ""));
  if (!isFinite(n) || n <= 0) return null;

  // keep it sane
  return Math.max(0.1, n);
}

function setActiveLineLengthMm(mm) {
  if (!gesture.activeObj) return false;
  const obj = gesture.activeObj;
  if (!(obj.kind === "line" || obj.kind === "arrow")) return false;

  const ppm = pxPerMm();
  const lenPx = mm * ppm;

  const x1 = obj.x1, y1 = obj.y1;
  let dx = (obj.x2 ?? x1) - x1;
  let dy = (obj.y2 ?? y1) - y1;

  let d = Math.hypot(dx, dy);
  if (!isFinite(d) || d < 1e-6) {
    // if it's basically a point, default direction to the right
    dx = 1; dy = 0; d = 1;
  }

  const ux = dx / d;
  const uy = dy / d;

  obj.x2 = x1 + ux * lenPx;
  obj.y2 = y1 + uy * lenPx;

  redrawAll();
  return true;
}
  // Background DOM layer
  const bgLayer = document.getElementById("bgLayer");
  const bgImg = document.getElementById("bgImg");

  // Canvases
  const inkCanvas = document.getElementById("inkCanvas");
  const uiCanvas = document.getElementById("uiCanvas");
  const inkCtx = inkCanvas.getContext("2d");
  const uiCtx = uiCanvas.getContext("2d");

  const toast = document.getElementById("toast");

  // Dock tools
  const dockBtns = Array.from(document.querySelectorAll(".dockBtn[data-tool]"));
  const clearBtn = document.getElementById("clearBtn");

  // Colour popover
  const colorBtn = document.getElementById("colorBtn");
  const colorPop = document.getElementById("colorPop");
  const colorInput = document.getElementById("colorInput");
  const brushSize = document.getElementById("brushSize");
  const brushOut = document.getElementById("brushOut");
  const swatchLive = document.getElementById("swatchLive");

  // Settings panel
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");

  // Panel controls
  const titleInput = document.getElementById("titleInput");
  const applyTitleBtn = document.getElementById("applyTitleBtn");

  const bgFile = document.getElementById("bgFile");
  const clearBgBtn = document.getElementById("clearBgBtn");

  // SVG ink import
  const svgInkFile = document.getElementById("svgInkFile");
  const clearSvgInkBtn = document.getElementById("clearSvgInkBtn");

  const boardSelect = document.getElementById("boardSelect");
  const newBoardBtn = document.getElementById("newBoardBtn");
  const saveBoardBtn = document.getElementById("saveBoardBtn");
  const loadBoardBtn = document.getElementById("loadBoardBtn");

  const exportBtn = document.getElementById("exportBtn");
  const exportSvgBtn = document.getElementById("exportSvgBtn");

  // Scale controls
  const scaleOut = document.getElementById("scaleOut");
  const setScaleBtn = document.getElementById("setScaleBtn");
  const resetScaleBtn = document.getElementById("resetScaleBtn");

  // Board delete controls
  const deleteBoardBtn = document.getElementById("deleteBoardBtn");
  const deleteAllBoardsBtn = document.getElementById("deleteAllBoardsBtn");

  // ---------- State ----------
  const state = {
    tool: "pen",
    color: "#111111",
    size: 5,

    // DPR tracking (CRITICAL for alignment)
    pixelRatio: 1,

    // Camera
    zoom: 1,
    panX: 0,
    panY: 0,

    // UI title
    title: "",

    // Scale (world px per mm)
    pxPerMm: 96 / 25.4,

    // Background (world coords)
    bg: {
      src: "",
      natW: 0,
      natH: 0,
      x: 0,
      y: 0,
      scale: 1,
      rot: 0
    },

    // Ink objects (world coords)
    objects: [],

    // Undo/redo
    undo: [],
    redo: [],

    selectionIndex: -1,

    viewW: 0,
    viewH: 0
  };

  // SVG step-reveal (ArrowRight reveal, ArrowLeft hide)
  const svgReveal = {
    active: false,
    groupId: null,
    partIndices: [],
    revealed: 0
  };

  // Handle geometry cached each redraw (screen coords)
  const uiHandles = {
    visible: false,
    box: null, // {x,y,w,h}
    rotate: null, // {x,y,r}
    corners: null // [{name,x,y,s}]
  };

  // ---------- Helpers ----------
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dpr = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));

  function showToast(msg = "Saved") {
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1200);
  }

  // Sizing uses the stage
  function stageRect() {
    return stage.getBoundingClientRect();
  }

function styleMap(el){
  const s = String(el.getAttribute("style") || "");
  const out = {};
  s.split(";").forEach(part=>{
    const [k,v] = part.split(":");
    if(!k || v == null) return;
    out[k.trim().toLowerCase()] = v.trim();
  });
  return out;
}
function attrOrStyle(el, attr, cssName){
  const a = el.getAttribute(attr);
  if (a != null && String(a).trim() !== "") return String(a).trim();
  const st = styleMap(el);
  const v = st[String(cssName || attr).toLowerCase()];
  return (v != null && String(v).trim() !== "") ? String(v).trim() : null;
}


function strokeStr(el){ return attrOrStyle(el, "stroke", "stroke"); }
function fillStr(el){ return attrOrStyle(el, "fill", "fill"); }
function strokeWidthNum(el){
  const raw = attrOrStyle(el, "stroke-width", "stroke-width");
  const n = parseNumberAttr(raw);
  return Math.max(1, n ?? 3);
}


   
  // Pointer mapping MUST use the canvas rect
  function canvasRect() {
    return inkCanvas.getBoundingClientRect();
  }

  // ✅ SINGLE correct clientToScreen
  function clientToScreen(evt) {
    const r = canvasRect();
    return { sx: evt.clientX - r.left, sy: evt.clientY - r.top };
  }

  // ---------- Keyboard size + camera helpers ----------
  function nudgePan(dx, dy) {
    state.panX += dx;
    state.panY += dy;
    redrawAll();
  }

  function setBrushSizeFromHotkey(n) {
    // clamp to sensible range
    const v = clamp(Number(n), 1, 60);
    setBrushSize(v);
    showToast(`Stroke ${v}px`);
  }

  function formatMm(mm) {
    if (!isFinite(mm)) return "0 mm";
    // Show 0 decimals when close to an integer (common with mm snaps); otherwise 1 decimal.
    const nearInt = Math.abs(mm - Math.round(mm)) < 0.05;
    return (nearInt ? Math.round(mm).toString() : mm.toFixed(1)) + " mm";
  }
  // ---------- Precise size entry (Enter while drawing) ----------
  function parseMmPair(input) {
    // Accepts:
    //  "120" -> {a:120,b:null}
    //  "120x45" / "120 × 45" / "120,45" -> {a:120,b:45}
    //  "d=120" / "diam 120" -> {a:120,b:null, mode:"diam"}
    const s = String(input || "").trim().toLowerCase();
    if (!s) return null;

    const isDiam = /\b(d|dia|diam|diameter)\b/.test(s) || s.includes("d=");
    const cleaned = s.replace(/[^\d.+-x×, ]+/g, " ").trim();

    let a = null, b = null;

    // split on x / × / comma
    const parts = cleaned.split(/(?:x|×|,)+/).map(t => t.trim()).filter(Boolean);
    if (parts.length >= 1) a = parseFloat(parts[0]);
    if (parts.length >= 2) b = parseFloat(parts[1]);

    if (!isFinite(a)) return null;
    if (b != null && !isFinite(b)) b = null;

    return { a, b, mode: isDiam ? "diam" : "pair" };
  }

  function unitVecFromDrag(dx, dy) {
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { ux: 1, uy: 0, len: 0 };
    return { ux: dx / len, uy: dy / len, len };
  }

  function applyPreciseToActiveShape() {
    if (!gesture.active) return false;
    if (gesture.mode !== "drawShape") return false;
    const obj = gesture.activeObj;
    if (!obj) return false;

    const k = obj.kind;
    if (!["line", "arrow", "rect", "circle"].includes(k)) return false;

    const start = { x: obj.x1, y: obj.y1 };
    const dx = (obj.x2 ?? obj.x1) - obj.x1;
    const dy = (obj.y2 ?? obj.y1) - obj.y1;
    const { ux, uy } = unitVecFromDrag(dx, dy);

    const ppm = pxPerMm();

    if (k === "line" || k === "arrow") {
      const curMm = Math.max(1, Math.round(Math.hypot(dx, dy) / ppm) || 1);
      const mmStr = prompt("Line length (mm):", String(curMm));
      if (mmStr == null) return true;
      const mm = parseFloat(String(mmStr).replace(/[^0-9.+-]/g, ""));
      if (!isFinite(mm) || mm <= 0) {
        showToast("Invalid mm");
        return true;
      }
      const lenPx = mm * ppm;

      // keep current direction (or default 0°), then re-apply your normal snapping
      const raw = { x: start.x + ux * lenPx, y: start.y + uy * lenPx };
      const snapped = snapToWholeMmLength(start, raw);

      obj.x2 = snapped.x;
      obj.y2 = snapped.y;

      redrawAll();
      return true;
    }

    if (k === "rect") {
      const curW = Math.max(1, Math.round(Math.abs(dx) / ppm) || 1);
      const curH = Math.max(1, Math.round(Math.abs(dy) / ppm) || 1);

      const inStr = prompt('Rect size (mm). Examples: "120x45" or "120":', `${curW}x${curH}`);
      if (inStr == null) return true;
      const p = parseMmPair(inStr);
      if (!p) { showToast("Invalid size"); return true; }

      const wMm = Math.max(1, Math.round(p.a));
      const hMm = Math.max(1, Math.round(p.b ?? p.a)); // single number => square

      const sgnX = dx >= 0 ? 1 : -1;
      const sgnY = dy >= 0 ? 1 : -1;

      const x2 = start.x + sgnX * (wMm * ppm);
      const y2 = start.y + sgnY * (hMm * ppm);

      // keep your normal mm-grid snap for rect endpoint
      const p2 = snapToMmGridWorld({ x: x2, y: y2 });
      obj.x2 = p2.x;
      obj.y2 = p2.y;

      redrawAll();
      return true;
    }

    if (k === "circle") {
      const curW = Math.max(1, Math.round(Math.abs(dx) / ppm) || 1);
      const curH = Math.max(1, Math.round(Math.abs(dy) / ppm) || 1);
      const curD = Math.max(1, Math.round((curW + curH) / 2) || 1);

      const inStr = prompt(
        'Circle size (mm). Examples:\n- "50" (diameter)\n- "80x40" (ellipse)\n- "d=60" (diameter)',
        String(curD)
      );
      if (inStr == null) return true;
      const p = parseMmPair(inStr);
      if (!p) { showToast("Invalid size"); return true; }

      let wMm, hMm;
      if (p.b != null) {
        wMm = Math.max(1, Math.round(p.a));
        hMm = Math.max(1, Math.round(p.b));
      } else {
        // single number => diameter (even if user didn't write "d")
        const dMm = Math.max(1, Math.round(p.a));
        wMm = dMm;
        hMm = dMm;
      }

      const sgnX = dx >= 0 ? 1 : -1;
      const sgnY = dy >= 0 ? 1 : -1;

      const x2 = start.x + sgnX * (wMm * ppm);
      const y2 = start.y + sgnY * (hMm * ppm);

      const p2 = snapToMmGridWorld({ x: x2, y: y2 });
      obj.x2 = p2.x;
      obj.y2 = p2.y;

      redrawAll();
      return true;
    }

    return false;
  }
  function showMeasureTip(sx, sy, text) {
    measureTip.textContent = text;
    measureTip.style.left = sx + "px";
    measureTip.style.top = sy + "px";
    measureTip.style.display = "block";
  }

  function hideMeasureTip() {
    measureTip.style.display = "none";
  }

  // --- Angle snapping helpers (Ctrl/Cmd) ---
  function snapAngleRad(angleRad) {
    const snapsDeg = [
      0, 30, 45, 60, 90, 120, 135, 150,
      -30, -45, -60, -90, -120, -135, -150,
      180
    ];
    const snaps = snapsDeg.map((d) => (d * Math.PI) / 180);

    // Normalize to [-PI, PI)
    const a = Math.atan2(Math.sin(angleRad), Math.cos(angleRad));

    let best = snaps[0];
    let bestDiff = Infinity;

    for (const s of snaps) {
      const diff = Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s)));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    return best;
  }

function snapLinePreferEndpointsThenMm(start, rawPt, ctrlHeld) {
  // ✅ Always prefer endpoints/intersections if close enough
  const hit = snapPointWithCtrl(rawPt);
  if (hit) return hit;

  // Otherwise keep your existing behaviour:
  // Ctrl/Cmd mode -> angle snap then whole-mm length
  if (ctrlHeld) return snapLinePointWithCtrlOrAngle(start, rawPt);

  // Default -> whole-mm length
  return snapToWholeMmLength(start, rawPt);
}
   
  function snapEndpointToAngles(x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 0.0001) return { x2, y2 };

    const ang = Math.atan2(dy, dx);
    const snapped = snapAngleRad(ang);

    return {
      x2: x1 + Math.cos(snapped) * len,
      y2: y1 + Math.sin(snapped) * len
    };
  }

  // --- Precision snapping + scale ---
  // World units are in CSS pixels at zoom=1.
  // Default approximation: 96dpi => 96px per inch => 96/25.4 px per mm.
  const DEFAULT_PX_PER_MM = 96 / 25.4; // ≈3.7795 px per mm
  const SNAP_RADIUS_PX = 12; // screen-space radius to grab endpoints/intersections

  function pxPerMm() {
    const v = Number(state.pxPerMm);
    return isFinite(v) && v > 0 ? v : DEFAULT_PX_PER_MM;
  }

  function mmStepWorld() {
    // 1 mm in world space
    return pxPerMm();
  }

  function snapToMmGridWorld(pt) {
    const step = mmStepWorld();
    return {
      x: Math.round(pt.x / step) * step,
      y: Math.round(pt.y / step) * step
    };
  }

  // ✅ NEW: snap endpoint so the *LENGTH* (from start) is whole-mm, direction preserved
  function snapToWholeMmLength(start, rawPt) {
    const dx = rawPt.x - start.x;
    const dy = rawPt.y - start.y;
    const lenPx = Math.hypot(dx, dy);
    if (!isFinite(lenPx) || lenPx < 1e-6) return { x: rawPt.x, y: rawPt.y };

    const mm = lenPx / pxPerMm();
    const mmInt = Math.max(1, Math.round(mm));
    const newLenPx = mmInt * pxPerMm();

    const ux = dx / lenPx;
    const uy = dy / lenPx;

    return {
      x: start.x + ux * newLenPx,
      y: start.y + uy * newLenPx
    };
  }

  function segIntersection(a, b) {
    // Segment intersection (including touching endpoints).
    const x1 = a.x1,
      y1 = a.y1,
      x2 = a.x2,
      y2 = a.y2;
    const x3 = b.x1,
      y3 = b.y1,
      x4 = b.x2,
      y4 = b.y2;

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-12) return null; // parallel/collinear

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;

    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;

    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }

  function rotateAround(x, y, cx, cy, ang) {
    const dx = x - cx,
      dy = y - cy;
    const c = Math.cos(ang),
      s = Math.sin(ang);
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  // --- Arc helpers ---
  function normAngle(a) {
    let x = a % (Math.PI * 2);
    if (x < 0) x += Math.PI * 2;
    return x;
  }
  function arcDelta(a1, a2) {
    let d = normAngle(a2) - normAngle(a1);
    if (d < 0) d += Math.PI * 2;
    return d;
  }
  function pointOnArc(obj, which) {
    const a = which === "start" ? obj.a1 : obj.a2;
    return { x: obj.cx + Math.cos(a) * obj.r, y: obj.cy + Math.sin(a) * obj.r };
  }
  function isAngleOnArc(a, a1, a2) {
    const aa = normAngle(a);
    const s = normAngle(a1);
    const e = normAngle(a2);
    if (s <= e) return aa >= s && aa <= e;
    return aa >= s || aa <= e; // wrap
  }
  function arcBounds(obj) {
    const pts = [];
    const steps = 48;
    const d = arcDelta(obj.a1, obj.a2);
    const n = Math.max(6, Math.min(steps, Math.ceil(steps * (d / (Math.PI * 2)))));
    for (let i = 0; i <= n; i++) {
      const t = obj.a1 + d * (i / n);
      pts.push({ x: obj.cx + Math.cos(t) * obj.r, y: obj.cy + Math.sin(t) * obj.r });
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }
    const pad = (obj.size || 4) * 1.0;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  function rectEdges(obj) {
    const x1 = obj.x1,
      y1 = obj.y1,
      x2 = obj.x2,
      y2 = obj.y2;
    const cx = (x1 + x2) / 2,
      cy = (y1 + y2) / 2;
    const w = Math.abs(x2 - x1),
      h = Math.abs(y2 - y1);
    const ang = obj.rot || 0;

    const pts = [
      { x: cx - w / 2, y: cy - h / 2 }, // nw
      { x: cx + w / 2, y: cy - h / 2 }, // ne
      { x: cx + w / 2, y: cy + h / 2 }, // se
      { x: cx - w / 2, y: cy + h / 2 } // sw
    ].map((p) => (ang ? rotateAround(p.x, p.y, cx, cy, ang) : p));

    return [
      { x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y },
      { x1: pts[1].x, y1: pts[1].y, x2: pts[2].x, y2: pts[2].y },
      { x1: pts[2].x, y1: pts[2].y, x2: pts[3].x, y2: pts[3].y },
      { x1: pts[3].x, y1: pts[3].y, x2: pts[0].x, y2: pts[0].y }
    ];
  }

  function collectSnapEndpoints() {
    const pts = [];

    for (const obj of state.objects) {
      if (!obj || obj.hidden) continue;

      if (obj.kind === "line" || obj.kind === "arrow") {
        pts.push({ x: obj.x1, y: obj.y1 });
        pts.push({ x: obj.x2, y: obj.y2 });
        continue;
      }

      if (obj.kind === "arc") {
        const s = pointOnArc(obj, "start");
        const e = pointOnArc(obj, "end");
        pts.push(s, e);
        continue;
      }

      if (obj.kind === "rect") {
        const edges = rectEdges(obj);
        for (const e of edges) pts.push({ x: e.x1, y: e.y1 });
        continue;
      }

      if (obj.kind === "stroke" || obj.kind === "erase") {
        const p = obj.points || [];
        if (p.length) {
          pts.push({ x: p[0].x, y: p[0].y });
          pts.push({ x: p[p.length - 1].x, y: p[p.length - 1].y });
        }
        continue;
      }

      if (obj.kind === "text") {
        const m = textMetrics(obj);
        const cx = obj.x + m.w / 2,
          cy = obj.y + m.h / 2;
        const ang = obj.rot || 0;
        const corners = [
          { x: obj.x, y: obj.y },
          { x: obj.x + m.w, y: obj.y },
          { x: obj.x + m.w, y: obj.y + m.h },
          { x: obj.x, y: obj.y + m.h }
        ].map((p) => (ang ? rotateAround(p.x, p.y, cx, cy, ang) : p));
        pts.push(...corners);
        continue;
      }
    }

    return pts;
  }

  function collectSnapSegments(maxSegs = 240) {
    const segs = [];

    for (const obj of state.objects) {
      if (!obj || obj.hidden) continue;

      if (obj.kind === "line" || obj.kind === "arrow") {
        segs.push({ x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 });
      } else if (obj.kind === "arc") {
        const d = arcDelta(obj.a1, obj.a2);
        const steps = Math.max(6, Math.min(36, Math.ceil(36 * (d / (Math.PI * 2)))));
        let prev = { x: obj.cx + Math.cos(obj.a1) * obj.r, y: obj.cy + Math.sin(obj.a1) * obj.r };
        for (let i = 1; i <= steps; i++) {
          const t = obj.a1 + d * (i / steps);
          const cur = { x: obj.cx + Math.cos(t) * obj.r, y: obj.cy + Math.sin(t) * obj.r };
          segs.push({ x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y });
          prev = cur;
          if (segs.length >= maxSegs) return segs;
        }
      } else if (obj.kind === "rect") {
        segs.push(...rectEdges(obj));
      } else if (obj.kind === "stroke" || obj.kind === "erase") {
        const pts = obj.points || [];
        const stride = Math.max(1, Math.floor(pts.length / 60));
        for (let i = stride; i < pts.length; i += stride) {
          const p0 = pts[i - stride];
          const p1 = pts[i];
          if (p0 && p1) segs.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y });
          if (segs.length >= maxSegs) return segs;
        }
      }

      if (segs.length >= maxSegs) return segs;
    }

    return segs;
  }

  function collectSnapIntersections(maxPairs = 6000) {
    const segs = collectSnapSegments();
    const pts = [];
    let pairs = 0;

    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        pairs++;
        if (pairs > maxPairs) return pts;

        const p = segIntersection(segs[i], segs[j]);
        if (p) pts.push(p);
      }
    }
    return pts;
  }

  function snapToNearest(pt, candidates, radiusWorld) {
    let best = null;
    let bestD = radiusWorld;

    for (const c of candidates) {
      const d = Math.hypot(pt.x - c.x, pt.y - c.y);
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }
    return best ? { x: best.x, y: best.y } : null;
  }

  function snapPointWithCtrl(pt) {
    const radiusWorld = SNAP_RADIUS_PX / (state.zoom || 1);

    const endpoints = collectSnapEndpoints();
    const intersections = collectSnapIntersections();

    const hit1 = snapToNearest(pt, endpoints, radiusWorld);
    const hit2 = snapToNearest(pt, intersections, radiusWorld);

    if (!hit1) return hit2;
    if (!hit2) return hit1;

    const d1 = Math.hypot(pt.x - hit1.x, pt.y - hit1.y);
    const d2 = Math.hypot(pt.x - hit2.x, pt.y - hit2.y);
    return d2 < d1 ? hit2 : hit1;
  }

  // Ctrl/Cmd snapping (rect/circle/etc): prefer endpoint/intersection; otherwise constrain to common angles then snap to mm GRID.
  function snapPointWithCtrlOrAngle(start, rawPt) {
    const hit = snapPointWithCtrl(rawPt);
    if (hit) return hit;

    const s = snapEndpointToAngles(start.x, start.y, rawPt.x, rawPt.y);
    return snapToMmGridWorld({ x: s.x2, y: s.y2 });
  }

  // ✅ NEW: Ctrl/Cmd snapping for LINE/ARROW: prefer endpoint/intersection; otherwise angle-snap THEN whole-mm LENGTH
  function snapLinePointWithCtrlOrAngle(start, rawPt) {
    const hit = snapPointWithCtrl(rawPt);
    if (hit) return hit;

    const s = snapEndpointToAngles(start.x, start.y, rawPt.x, rawPt.y);
    return snapToWholeMmLength(start, { x: s.x2, y: s.y2 });
  }

  function updateSwatch() {
    swatchLive.style.background = state.color;
  }

  function setColor(hex) {
    state.color = hex;
    colorInput.value = hex;
    updateSwatch();
    updateScaleOut();
  }

  function setBrushSize(n) {
    state.size = Number(n);
    brushSize.value = String(state.size);
    brushOut.textContent = String(state.size);
  }

  function updateScaleOut() {
    if (!scaleOut) return;
    scaleOut.textContent = `1 mm = ${pxPerMm().toFixed(3)} px`;
  }

function setActiveTool(tool) {
  hideMeasureTip(); // ✅ smallest fix: clear any leftover tooltip when switching tools
  state.tool = tool;
  dockBtns.forEach((b) => b.classList.toggle("is-active", b.dataset.tool === tool));
  updateCursorFromTool();
  if (tool !== "arc") arcDraft.hasCenter = false;
}

  // Screen <-> World (screen coords are CSS px)
  function screenToWorld(sx, sy) {
    return { x: (sx - state.panX) / state.zoom, y: (sy - state.panY) / state.zoom };
  }
  function worldToScreen(wx, wy) {
    return { x: wx * state.zoom + state.panX, y: wy * state.zoom + state.panY };
  }

  function setZoomTo(newZoom, anchorSX, anchorSY) {
    const z = clamp(newZoom, 0.25, 6);
    const old = state.zoom;

    const worldX = (anchorSX - state.panX) / old;
    const worldY = (anchorSY - state.panY) / old;

    state.zoom = z;
    state.panX = anchorSX - worldX * z;
    state.panY = anchorSY - worldY * z;

    redrawAll();
  }

  // ---------- Undo/Redo ----------
  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function snapshot() {
    return {
      tool: state.tool,
      color: state.color,
      size: state.size,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      title: state.title,
      pxPerMm: pxPerMm(),
      bg: { ...state.bg },
      objects: deepClone(state.objects)
    };
  }

  function applySnapshot(snap) {
    state.tool = snap.tool || "pen";
    setActiveTool(state.tool);

    setColor(snap.color || "#111111");
    setBrushSize(snap.size || 5);

    state.zoom = Number(snap.zoom || 1);
    state.panX = Number(snap.panX || 0);
    state.panY = Number(snap.panY || 0);

    state.title = snap.title || "";
    titleInput.value = state.title;

    state.pxPerMm = Number(snap.pxPerMm || state.pxPerMm || 96 / 25.4);
    updateScaleOut();

    const bg = snap.bg || { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 };
    state.bg = { ...bg };

    state.objects = Array.isArray(snap.objects) ? deepClone(snap.objects) : [];
    state.selectionIndex = -1;

    applyBgTransform();
    redrawAll();
  }

  function pushUndo() {
    state.undo.push(JSON.stringify(snapshot()));
    if (state.undo.length > 120) state.undo.shift();
  }
  function clearRedo() {
    state.redo.length = 0;
  }

  function undo() {
    if (!state.undo.length) return;
    state.redo.push(JSON.stringify(snapshot()));
    applySnapshot(JSON.parse(state.undo.pop()));
  }
  function redo() {
    if (!state.redo.length) return;
    state.undo.push(JSON.stringify(snapshot()));
    applySnapshot(JSON.parse(state.redo.pop()));
  }

  // ---------- Canvas sizing ----------
  function sizeCanvas(canvas, ctx) {
    const r = stageRect();
    state.viewW = Math.floor(r.width);
    state.viewH = Math.floor(r.height);

    const scale = dpr();
    state.pixelRatio = scale;

    canvas.width = Math.max(1, Math.floor(state.viewW * scale));
    canvas.height = Math.max(1, Math.floor(state.viewH * scale));

    // baseline transform = DPR (so 1 unit in code = 1 CSS px)
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function resizeAll() {
    sizeCanvas(inkCanvas, inkCtx);
    sizeCanvas(uiCanvas, uiCtx);
    applyBgTransform();
    redrawAll();
  }

  // ---------- Background CSS transform ----------
  function applyBgTransform() {
    bgLayer.style.transform = `translate(${state.panX}px, ${state.panY}px) scale(${state.zoom})`;

    if (!state.bg.src) {
      bgImg.style.display = "none";
      return;
    }
    bgImg.style.display = "block";

    const natW = state.bg.natW || 0;
    const natH = state.bg.natH || 0;

    const cx = natW / 2;
    const cy = natH / 2;

    bgImg.style.transform =
      `translate(${state.bg.x}px, ${state.bg.y}px) ` +
      `translate(${cx}px, ${cy}px) rotate(${state.bg.rot}rad) scale(${state.bg.scale}) translate(${-cx}px, ${-cy}px)`;
  }

  // ---------- Rendering ----------
  function clearCtx(ctx, canvas) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ✅ Apply DPR first, then camera pan/zoom
  function applyWorldTransform(ctx) {
    const pr = state.pixelRatio || 1;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
  }

  function drawInkObject(obj) {
    inkCtx.save();
    applyWorldTransform(inkCtx);

    inkCtx.lineCap = "round";
    inkCtx.lineJoin = "round";

    if (obj.kind === "stroke") {
      inkCtx.globalCompositeOperation = "source-over";
      inkCtx.strokeStyle = obj.color;
      inkCtx.lineWidth = obj.size;
      inkCtx.beginPath();
      const pts = obj.points || [];
      if (pts.length) {
        inkCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) inkCtx.lineTo(pts[i].x, pts[i].y);
      }
      inkCtx.stroke();
      inkCtx.restore();
      return;
    }

    if (obj.kind === "erase") {
      inkCtx.globalCompositeOperation = "destination-out";
      inkCtx.strokeStyle = "rgba(0,0,0,1)";
      inkCtx.lineWidth = obj.size;
      inkCtx.beginPath();
      const pts = obj.points || [];
      if (pts.length) {
        inkCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) inkCtx.lineTo(pts[i].x, pts[i].y);
      }
      inkCtx.stroke();
      inkCtx.restore();
      return;
    }

    if (obj.kind === "text") {
      inkCtx.globalCompositeOperation = "source-over";
      inkCtx.fillStyle = obj.color;
      inkCtx.textBaseline = "top";

      const m = textMetrics(obj);
      inkCtx.font = `700 ${m.fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;

      // Rotate around the *center* of the text box so it stays inside its bounds.
      const cx = obj.x + m.w / 2;
      const cy = obj.y + m.h / 2;

      inkCtx.save();
      inkCtx.translate(cx, cy);
      if (obj.rot) inkCtx.rotate(obj.rot);
      inkCtx.fillText(obj.text, -m.w / 2, -m.h / 2);
      inkCtx.restore();

      inkCtx.restore();
      return;
    }

    inkCtx.globalCompositeOperation = "source-over";
    inkCtx.strokeStyle = obj.color;
    inkCtx.lineWidth = obj.size;

    const { x1, y1, x2, y2 } = obj;
    const w = x2 - x1;
    const h = y2 - y1;

    if (obj.kind === "line") {
      inkCtx.beginPath();
      inkCtx.moveTo(x1, y1);
      inkCtx.lineTo(x2, y2);
      inkCtx.stroke();
    } else if (obj.kind === "rect") {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rw = Math.abs(w);
      const rh = Math.abs(h);
      const ang = obj.rot || 0;
      inkCtx.save();
      inkCtx.translate(cx, cy);
      if (ang) inkCtx.rotate(ang);
      inkCtx.strokeRect(-rw / 2, -rh / 2, rw, rh);
      inkCtx.restore();
    } else if (obj.kind === "circle") {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(w) / 2;
      const ry = Math.abs(h) / 2;
      const ang = obj.rot || 0;
      inkCtx.save();
      inkCtx.translate(cx, cy);
      inkCtx.beginPath();
      inkCtx.ellipse(0, 0, rx, ry, ang, 0, Math.PI * 2);
      inkCtx.stroke();
      inkCtx.restore();
    } else if (obj.kind === "arc") {
      const { cx, cy, r, a1, a2 } = obj;
      inkCtx.save();
      inkCtx.beginPath();
      inkCtx.arc(cx, cy, Math.max(0.5, r || 0), a1 || 0, a2 || 0, !!obj.ccw);
      inkCtx.stroke();
      inkCtx.restore();
    } else if (obj.kind === "arrow") {
      inkCtx.beginPath();
      inkCtx.moveTo(x1, y1);
      inkCtx.lineTo(x2, y2);
      inkCtx.stroke();
      const ang = Math.atan2(y2 - y1, x2 - x1);
      const headLen = Math.max(10, obj.size * 3);
      const a1 = ang + Math.PI * 0.85;
      const a2 = ang - Math.PI * 0.85;
      inkCtx.beginPath();
      inkCtx.moveTo(x2, y2);
      inkCtx.lineTo(x2 + Math.cos(a1) * headLen, y2 + Math.sin(a1) * headLen);
      inkCtx.moveTo(x2, y2);
      inkCtx.lineTo(x2 + Math.cos(a2) * headLen, y2 + Math.sin(a2) * headLen);
      inkCtx.stroke();
    }

    inkCtx.restore();
  }

  // reuse measuring context for text bounds
  const measureCtx = document.createElement("canvas").getContext("2d");

  function textMetrics(obj) {
    const fontSize = obj.fontSize || 20;
    measureCtx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    const text = obj.text || "";
    const w = measureCtx.measureText(text).width;
    const h = fontSize * 1.25;
    return { w, h, fontSize };
  }

  function objectBounds(obj) {
    // NOTE: bounds are axis-aligned; rotated text will be approximate (good enough for handles)
    if (obj.kind === "text") {
      const m = textMetrics(obj);
      const w = m.w;
      const h = m.h;

      const cx = obj.x + w / 2;
      const cy = obj.y + h / 2;
      const ang = obj.rot || 0;

      const corners = [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 },
        { x: -w / 2, y: h / 2 }
      ].map((p) => {
        const cos = Math.cos(ang),
          sin = Math.sin(ang);
        return { x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos };
      });

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of corners) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      return { minX, minY, maxX, maxY };
    }

    if (obj.kind === "stroke" || obj.kind === "erase") {
      const pts = obj.points || [];
      if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = (obj.size || 6) * 0.8;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }

    if (obj.kind === "rect") {
      const x1 = obj.x1,
        y1 = obj.y1,
        x2 = obj.x2,
        y2 = obj.y2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rw = Math.abs(x2 - x1);
      const rh = Math.abs(y2 - y1);
      const ang = obj.rot || 0;

      const corners = [
        { x: -rw / 2, y: -rh / 2 },
        { x: rw / 2, y: -rh / 2 },
        { x: rw / 2, y: rh / 2 },
        { x: -rw / 2, y: rh / 2 }
      ].map((p) => {
        const cos = Math.cos(ang),
          sin = Math.sin(ang);
        return { x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos };
      });

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      for (const p of corners) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }
      const pad = (obj.size || 4) * 1.0;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }

    if (obj.kind === "circle") {
      const x1 = obj.x1,
        y1 = obj.y1,
        x2 = obj.x2,
        y2 = obj.y2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2;
      const ry = Math.abs(y2 - y1) / 2;
      const ang = obj.rot || 0;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const cosA = Math.cos(ang),
        sinA = Math.sin(ang);
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        const ex = Math.cos(t) * rx;
        const ey = Math.sin(t) * ry;
        const px = cx + ex * cosA - ey * sinA;
        const py = cy + ex * sinA + ey * cosA;
        minX = Math.min(minX, px);
        minY = Math.min(minY, py);
        maxX = Math.max(maxX, px);
        maxY = Math.max(maxY, py);
      }
      const pad = (obj.size || 4) * 1.0;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }

    if (obj.kind === "arc") {
      return arcBounds(obj);
    }

    const minX = Math.min(obj.x1, obj.x2);
    const minY = Math.min(obj.y1, obj.y2);
    const maxX = Math.max(obj.x1, obj.x2);
    const maxY = Math.max(obj.y1, obj.y2);
    const pad = (obj.size || 4) * 1.0;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1,
      dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const tt = clamp(t, 0, 1);
    const cx = x1 + tt * dx;
    const cy = y1 + tt * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function hitObject(obj, wx, wy) {
    const tol = Math.max(8, (obj.size || 4) * 1.5);

    if (obj.kind === "text") {
      const b = objectBounds(obj);
      return wx >= b.minX && wx <= b.maxX && wy >= b.minY && wy <= b.maxY;
    }

    if (obj.kind === "stroke" || obj.kind === "erase") {
      const pts = obj.points || [];
      for (let i = 1; i < pts.length; i++) {
        if (distToSeg(wx, wy, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tol) return true;
      }
      return false;
    }

    if (obj.kind === "line" || obj.kind === "arrow") {
      return distToSeg(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2) <= tol;
    }

    if (obj.kind === "rect") {
      const cx = (obj.x1 + obj.x2) / 2;
      const cy = (obj.y1 + obj.y2) / 2;
      const rw = Math.abs(obj.x2 - obj.x1);
      const rh = Math.abs(obj.y2 - obj.y1);
      const ang = obj.rot || 0;

      const cos = Math.cos(-ang),
        sin = Math.sin(-ang);
      const lx = (wx - cx) * cos - (wy - cy) * sin;
      const ly = (wx - cx) * sin + (wy - cy) * cos;

      return Math.abs(lx) <= rw / 2 && Math.abs(ly) <= rh / 2;
    }

    if (obj.kind === "circle") {
      const cx = (obj.x1 + obj.x2) / 2;
      const cy = (obj.y1 + obj.y2) / 2;
      const rx = Math.abs(obj.x2 - obj.x1) / 2;
      const ry = Math.abs(obj.y2 - obj.y1) / 2;
      if (rx < 1 || ry < 1) return false;

      const ang = obj.rot || 0;
      const cos = Math.cos(-ang),
        sin = Math.sin(-ang);
      const lx = (wx - cx) * cos - (wy - cy) * sin;
      const ly = (wx - cx) * sin + (wy - cy) * cos;

      const nx = lx / rx;
      const ny = ly / ry;
      return nx * nx + ny * ny <= 1.2;
    }

    if (obj.kind === "arc") {
      const tolR = tol;
      const dx = wx - obj.cx;
      const dy = wy - obj.cy;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dist - obj.r) > tolR) return false;
      const a = Math.atan2(dy, dx);
      return isAngleOnArc(a, obj.a1, obj.a2);
    }

    return false;
  }

  function findHit(wx, wy) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (o && !o.hidden && hitObject(o, wx, wy)) return i;
    }
    return -1;
  }

  function moveObject(obj, dx, dy) {
    if (obj.kind === "text") {
      obj.x += dx;
      obj.y += dy;
      return;
    }
    if (obj.kind === "arc") {
      obj.cx += dx;
      obj.cy += dy;
      return;
    }
    if (obj.kind === "stroke" || obj.kind === "erase") {
      (obj.points || []).forEach((p) => {
        p.x += dx;
        p.y += dy;
      });
      return;
    }
    obj.x1 += dx;
    obj.y1 += dy;
    obj.x2 += dx;
    obj.y2 += dy;
  }

  function scaleObjectXY(obj, fx, fy, ax, ay) {
    if (!isFinite(fx)) fx = 1;
    if (!isFinite(fy)) fy = 1;

    fx = clamp(fx, -20, 20);
    fy = clamp(fy, -20, 20);

    if (obj.kind === "text") {
      obj.x = ax + (obj.x - ax) * fx;
      obj.y = ay + (obj.y - ay) * fy;
      const uni = Math.max(0.2, (Math.abs(fx) + Math.abs(fy)) / 2);
      obj.fontSize = Math.max(6, obj.fontSize * uni);
      return;
    }

    if (obj.kind === "stroke" || obj.kind === "erase") {
      (obj.points || []).forEach((p) => {
        p.x = ax + (p.x - ax) * fx;
        p.y = ay + (p.y - ay) * fy;
      });
      return;
    }

    if (obj.kind === "arc") {
      const uni = (Math.abs(fx) + Math.abs(fy)) / 2;
      obj.cx = ax + (obj.cx - ax) * fx;
      obj.cy = ay + (obj.cy - ay) * fy;
      obj.r = Math.max(0.5, (obj.r || 0) * uni);
      return;
    }

    obj.x1 = ax + (obj.x1 - ax) * fx;
    obj.y1 = ay + (obj.y1 - ay) * fy;
    obj.x2 = ax + (obj.x2 - ax) * fx;
    obj.y2 = ay + (obj.y2 - ay) * fy;
  }

  function rotatePoint(px, py, cx, cy, angle) {
    const dx = px - cx;
    const dy = py - cy;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  }

  function rotateObject(obj, angle) {
    const b = objectBounds(obj);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;

    if (obj.kind === "text") {
      obj.rot = (obj.rot || 0) + angle;
      return;
    }

    if (obj.kind === "rect" || obj.kind === "circle") {
      obj.rot = (obj.rot || 0) + angle;
      return;
    }

    if (obj.kind === "arc") {
      obj.a1 = (obj.a1 || 0) + angle;
      obj.a2 = (obj.a2 || 0) + angle;
      return;
    }

    if (obj.kind === "stroke" || obj.kind === "erase") {
      (obj.points || []).forEach((p) => {
        const r = rotatePoint(p.x, p.y, cx, cy, angle);
        p.x = r.x;
        p.y = r.y;
      });
      return;
    }

    const p1 = rotatePoint(obj.x1, obj.y1, cx, cy, angle);
    const p2 = rotatePoint(obj.x2, obj.y2, cx, cy, angle);
    obj.x1 = p1.x;
    obj.y1 = p1.y;
    obj.x2 = p2.x;
    obj.y2 = p2.y;
  }

  function drawInk() {
    clearCtx(inkCtx, inkCanvas);
    for (const obj of state.objects) {
      if (obj && !obj.hidden) drawInkObject(obj);
    }
  }

  function computeHandles() {
    uiHandles.visible = false;
    uiHandles.box = null;
    uiHandles.rotate = null;
    uiHandles.corners = null;
    uiHandles.poly = null;
    uiHandles.center = null;

    if (state.tool !== "select") return;
    if (state.selectionIndex < 0) return;
    const obj = state.objects[state.selectionIndex];
    if (!obj) return;

    const b = objectBounds(obj);

    const hasOwnRot =
      (obj.kind === "rect" || obj.kind === "circle" || obj.kind === "text") && (obj.rot || 0);

    if (hasOwnRot) {
      let w = b.maxX - b.minX;
      let h = b.maxY - b.minY;

      if (obj.kind === "rect" || obj.kind === "circle") {
        w = Math.abs(obj.x2 - obj.x1);
        h = Math.abs(obj.y2 - obj.y1);
      } else if (obj.kind === "text") {
        const m = textMetrics(obj);
        w = m.w;
        h = m.h;
      }

      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      const ang = obj.rot || 0;

      const cornersW = [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 },
        { x: -w / 2, y: h / 2 }
      ].map((p) => {
        const cos = Math.cos(ang),
          sin = Math.sin(ang);
        return { x: cx + p.x * cos - p.y * sin, y: cy + p.x * sin + p.y * cos };
      });

      const cornersS = cornersW.map((p) => worldToScreen(p.x, p.y));

      const topMid = { x: (cornersS[0].x + cornersS[1].x) / 2, y: (cornersS[0].y + cornersS[1].y) / 2 };
      const edge = { x: cornersS[1].x - cornersS[0].x, y: cornersS[1].y - cornersS[0].y };
      const elen = Math.hypot(edge.x, edge.y) || 1;
      const nx = -(edge.y / elen);
      const ny = edge.x / elen;
      const rotatePt = { x: topMid.x + nx * 28, y: topMid.y + ny * 28 };

      const s = 10;
      uiHandles.visible = true;
      uiHandles.poly = cornersS;
      uiHandles.corners = [
        { name: "nw", x: cornersS[0].x, y: cornersS[0].y, s },
        { name: "ne", x: cornersS[1].x, y: cornersS[1].y, s },
        { name: "se", x: cornersS[2].x, y: cornersS[2].y, s },
        { name: "sw", x: cornersS[3].x, y: cornersS[3].y, s }
      ];
      uiHandles.rotate = { x: rotatePt.x, y: rotatePt.y, r: 7 };
      uiHandles.center = {
        x: (cornersS[0].x + cornersS[2].x) / 2,
        y: (cornersS[0].y + cornersS[2].y) / 2
      };
      return;
    }

    const p1 = worldToScreen(b.minX, b.minY);
    const p2 = worldToScreen(b.maxX, b.maxY);

    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);

    const s = 10;
    const cx = x + w / 2;
    const top = y;

    uiHandles.visible = true;
    uiHandles.box = { x, y, w, h };
    uiHandles.corners = [
      { name: "nw", x: x, y: y, s },
      { name: "ne", x: x + w, y: y, s },
      { name: "se", x: x + w, y: y + h, s },
      { name: "sw", x: x, y: y + h, s }
    ];
    uiHandles.rotate = { x: cx, y: top - 22, r: 7 };
  }

  function hitHandle(sx, sy) {
    if (!uiHandles.visible) return null;

    if (uiHandles.rotate) {
      const dx = sx - uiHandles.rotate.x;
      const dy = sy - uiHandles.rotate.y;
      if (Math.hypot(dx, dy) <= uiHandles.rotate.r + 6) return { kind: "rotate" };
    }

    if (uiHandles.corners) {
      for (const c of uiHandles.corners) {
        const half = c.s;
        if (sx >= c.x - half && sx <= c.x + half && sy >= c.y - half && sy <= c.y + half) {
          return { kind: "scale", corner: c.name };
        }
      }
    }

    if (uiHandles.box) {
      const b = uiHandles.box;
      if (sx >= b.x && sx <= b.x + b.w && sy >= b.y && sy <= b.y + b.h) return { kind: "move" };
    }

    if (uiHandles.poly) {
      const poly = uiHandles.poly;
      let inside = false;
      for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const xi = poly[i].x,
          yi = poly[i].y;
        const xj = poly[j].x,
          yj = poly[j].y;
        const intersect = yi > sy !== yj > sy && sx < ((xj - xi) * (sy - yi)) / (yj - yi + 1e-12) + xi;
        if (intersect) inside = !inside;
      }
      if (inside) return { kind: "move" };
    }

    return null;
  }

  function drawUI() {
    clearCtx(uiCtx, uiCanvas);

    const pr = state.pixelRatio || 1;

    // Title (screen space)
    if (state.title) {
      uiCtx.save();
      uiCtx.setTransform(pr, 0, 0, pr, 0, 0);
      uiCtx.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      uiCtx.textBaseline = "top";
      const pad = 14;
      const w = uiCtx.measureText(state.title).width;
      uiCtx.fillStyle = "rgba(255,255,255,0.72)";
      uiCtx.fillRect(pad, pad, Math.min(w + 16, state.viewW - pad * 2), 30);
      uiCtx.fillStyle = "rgba(0,0,0,0.88)";
      uiCtx.fillText(state.title, pad + 8, pad + 5);
      uiCtx.restore();
    }

    // selection box + handles (Select tool only)
    computeHandles();
    if (!uiHandles.visible) return;

    const b = uiHandles.box;
    uiCtx.save();
    uiCtx.setTransform(pr, 0, 0, pr, 0, 0);
    uiCtx.strokeStyle = "rgba(46, 204, 113, 0.95)";
    uiCtx.lineWidth = 2;
    uiCtx.setLineDash([6, 4]);

    if (!uiHandles.poly) {
      uiCtx.strokeRect(b.x, b.y, b.w, b.h);
    } else {
      const p = uiHandles.poly;
      uiCtx.beginPath();
      uiCtx.moveTo(p[0].x, p[0].y);
      for (let i = 1; i < p.length; i++) uiCtx.lineTo(p[i].x, p[i].y);
      uiCtx.closePath();
      uiCtx.stroke();
    }
    uiCtx.setLineDash([]);

    // rotate handle line
    uiCtx.beginPath();
    if (!uiHandles.poly) {
      uiCtx.moveTo(b.x + b.w / 2, b.y);
    } else {
      const p = uiHandles.poly;
      uiCtx.moveTo((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
    }
    uiCtx.lineTo(uiHandles.rotate.x, uiHandles.rotate.y);
    uiCtx.stroke();

    // rotate handle circle
    uiCtx.fillStyle = "rgba(255,255,255,0.95)";
    uiCtx.beginPath();
    uiCtx.arc(uiHandles.rotate.x, uiHandles.rotate.y, uiHandles.rotate.r, 0, Math.PI * 2);
    uiCtx.fill();
    uiCtx.stroke();

    // corner handles
    for (const c of uiHandles.corners) {
      uiCtx.fillStyle = "rgba(255,255,255,0.95)";
      uiCtx.strokeStyle = "rgba(46, 204, 113, 0.95)";
      uiCtx.lineWidth = 2;
      uiCtx.beginPath();
      uiCtx.rect(c.x - c.s, c.y - c.s, c.s * 2, c.s * 2);
      uiCtx.fill();
      uiCtx.stroke();
    }

    uiCtx.restore();
  }

  function redrawAll() {
    applyBgTransform();
    drawInk();
    drawUI();
  }

  // ---------- Gesture state ----------

  // Arc tool draft state (two-stage: pick center, then drag to create arc)
  const arcDraft = { hasCenter: false, cx: 0, cy: 0 };

  const gesture = {
    active: false,
    pointerId: null,
    mode: "none",
    startWorld: null,
    startScreen: null,
    lastWorld: null,
    lastScreen: null,
    activeObj: null,

    // For transform handles (stable, non-accumulating)
    selIndex: -1,
    selStartObj: null,
    selAnchor: null,
    selStartVec: null,
    selStartAngle: 0,

    // Background stable start
    bgStart: null,

    // Arc drawing cached values
    arcCenter: null,
    arcR: 0,
    arcA1: 0,
    arcLastA: 0,
    arcAccum: 0
  };

  let spacePanning = false;

  function hardResetGesture() {
    gesture.active = false;
    gesture.pointerId = null;
    gesture.mode = "none";
    gesture.startWorld = null;
    gesture.startScreen = null;
    gesture.lastWorld = null;
    gesture.lastScreen = null;
    gesture.activeObj = null;
    hideMeasureTip();

    gesture.selIndex = -1;
    gesture.selStartObj = null;
    gesture.selAnchor = null;
    gesture.selStartVec = null;
    gesture.selStartAngle = 0;

    gesture.bgStart = null;
    gesture.arcCenter = null;
    gesture.arcR = 0;
    gesture.arcA1 = 0;
    gesture.arcLastA = 0;
    gesture.arcAccum = 0;

     closeLenBox();     // ✅ add this
  }

  // ---------- Cursor UX ----------
  function updateCursorFromTool() {
    if (
      state.tool === "pen" ||
      state.tool === "line" ||
      state.tool === "rect" ||
      state.tool === "circle" ||
      state.tool === "arc" ||
      state.tool === "arrow"
    ) {
      inkCanvas.style.cursor = "crosshair";
      return;
    }
    if (state.tool === "eraser") {
      inkCanvas.style.cursor = "cell";
      return;
    }
    if (state.tool === "text") {
      inkCanvas.style.cursor = "text";
      return;
    }
    if (state.tool === "select") {
      inkCanvas.style.cursor = "default";
      return;
    }
    if (state.tool === "bgMove") {
      inkCanvas.style.cursor = "grab";
      return;
    }
    if (state.tool === "bgScale") {
      inkCanvas.style.cursor = "nwse-resize";
      return;
    }
    if (state.tool === "bgRotate") {
      inkCanvas.style.cursor = "alias";
      return;
    }
    inkCanvas.style.cursor = "default";
  }

  function updateHoverCursor(sx, sy) {
    if (gesture.active) return;
    if (state.tool !== "select") {
      updateCursorFromTool();
      return;
    }

    const h = hitHandle(sx, sy);
    if (!h) {
      inkCanvas.style.cursor = "default";
      return;
    }

    if (h.kind === "rotate") {
      inkCanvas.style.cursor = "grab";
      return;
    }
    if (h.kind === "move") {
      inkCanvas.style.cursor = "move";
      return;
    }

    if (h.corner === "nw" || h.corner === "se") inkCanvas.style.cursor = "nwse-resize";
    else inkCanvas.style.cursor = "nesw-resize";
  }

  // ---------- Pointer interactions ----------
  function beginSelectionTransform(kind, e, w, sx, sy) {
    const idx = state.selectionIndex;
    if (idx < 0) return false;

    pushUndo();
    clearRedo();

    gesture.selIndex = idx;
    gesture.selStartObj = deepClone(state.objects[idx]);

    const b = objectBounds(state.objects[idx]);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    gesture.selAnchor = { x: cx, y: cy };

    if (kind === "move") {
      gesture.mode = "selMove";
      gesture.startWorld = w;
      return true;
    }

    if (kind === "scale") {
      gesture.mode = "selScale";
      gesture.startWorld = w;
      gesture.selStartVec = { x: w.x - cx, y: w.y - cy };
      return true;
    }

    if (kind === "rotate") {
      gesture.mode = "selRotate";
      gesture.startWorld = w;
      gesture.selStartAngle = Math.atan2(w.y - cy, w.x - cx);
      return true;
    }

    return false;
  }

  function beginBgTransform(mode, w) {
    if (!state.bg.src) return false;
    pushUndo();
    clearRedo();
    gesture.bgStart = { ...state.bg };
    gesture.startWorld = w;
    gesture.mode = mode; // bgMove/bgScale/bgRotate
    return true;
  }

  // Tools ↔ ⤡ ⟲ act on selection if selected; otherwise background
  function beginToolTransformForSelectionOrBg(tool, w) {
    if (state.selectionIndex >= 0) {
      pushUndo();
      clearRedo();
      gesture.selIndex = state.selectionIndex;
      gesture.selStartObj = deepClone(state.objects[state.selectionIndex]);

      const b = objectBounds(state.objects[state.selectionIndex]);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;
      gesture.selAnchor = { x: cx, y: cy };
      gesture.startWorld = w;

      if (tool === "bgMove") gesture.mode = "selMove";
      if (tool === "bgScale") {
        gesture.mode = "selScale";
        gesture.selStartVec = { x: w.x - cx, y: w.y - cy };
      }
      if (tool === "bgRotate") {
        gesture.mode = "selRotate";
        gesture.selStartAngle = Math.atan2(w.y - cy, w.x - cx);
      }
      return true;
    }

    return beginBgTransform(tool, w);
  }

  function onPointerDown(e) {
    if (!inkCanvas.contains(e.target)) return;

    gesture.active = true;
    gesture.pointerId = e.pointerId;
    inkCanvas.setPointerCapture(e.pointerId);

    const { sx, sy } = clientToScreen(e);
    const w = screenToWorld(sx, sy);

    gesture.startScreen = { sx, sy };
    gesture.lastScreen = { sx, sy };
    gesture.startWorld = w;
    gesture.lastWorld = w;
    gesture.activeObj = null;
    hideMeasureTip();

    if (spacePanning) {
      gesture.mode = "pan";
      inkCanvas.style.cursor = "grabbing";
      return;
    }

    // Text tool: click to place, then auto-select
    if (state.tool === "text") {
      gesture.active = false;
      gesture.mode = "none";
      const text = prompt("Enter text:");
      if (!text) return;

      pushUndo();
      clearRedo();
      state.objects.push({
        kind: "text",
        x: w.x,
        y: w.y,
        text: String(text),
        color: state.color,
        fontSize: Math.max(14, Math.round(state.size * 4)),
        rot: 0
      });
      state.selectionIndex = state.objects.length - 1;
      setActiveTool("select");
      redrawAll();
      return;
    }

    // Selection tool: handles + hit test
    if (state.tool === "select") {
      const handle = hitHandle(sx, sy);
      if (handle) {
        if (beginSelectionTransform(handle.kind, e, w, sx, sy)) {
          redrawAll();
          return;
        }
      }

      const hit = findHit(w.x, w.y);
      state.selectionIndex = hit;
      redrawAll();

      if (hit >= 0) {
        beginSelectionTransform("move", e, w, sx, sy);
      } else {
        gesture.mode = "select";
      }
      return;
    }

    // Background/transform tools (act on selection if selected)
    if (state.tool === "bgMove" || state.tool === "bgScale" || state.tool === "bgRotate") {
      beginToolTransformForSelectionOrBg(state.tool, w);
      return;
    }

    // Arc tool (two-stage): click to set center, then click+drag to draw
    if (state.tool === "arc") {
      const ctrlHeld = !e.getModifierState("CapsLock");

      if (!arcDraft.hasCenter) {
        let c = w;
        if (ctrlHeld) {
          const hit = snapPointWithCtrl(c);
          c = hit || snapToMmGridWorld(c);
        } else {
          c = snapToMmGridWorld(c);
        }
        arcDraft.hasCenter = true;
        arcDraft.cx = c.x;
        arcDraft.cy = c.y;

        try {
          inkCanvas.releasePointerCapture(e.pointerId);
        } catch {}
        gesture.active = false;
        gesture.mode = "none";

        showToast("Arc center set");
        showMeasureTip(sx, sy, "Center");
        redrawAll();
        return;
      }

      // start arc
      pushUndo();
      clearRedo();
      state.selectionIndex = -1;

    let p1 = snapShapePoint({ x: arcDraft.cx, y: arcDraft.cy }, w, ctrlHeld);

      const cx = arcDraft.cx;
      const cy = arcDraft.cy;
      const a1 = Math.atan2(p1.y - cy, p1.x - cx);
      let r = Math.hypot(p1.x - cx, p1.y - cy);
      r = Math.max(1, Math.round(r / pxPerMm()) * pxPerMm());

      const obj = { kind: "arc", color: state.color, size: state.size, cx, cy, r, a1, a2: a1, ccw: false };
      state.objects.push(obj);
      gesture.activeObj = obj;
      gesture.mode = "drawArc";
      gesture.arcCenter = { cx, cy };
      gesture.arcR = r;
      gesture.arcA1 = a1;
      gesture.arcLastA = a1;
      gesture.arcAccum = 0;

      showMeasureTip(sx, sy, `R ${Math.round(r / pxPerMm())} mm`);
      redrawAll();
      return;
    }

    // Drawing tools
    pushUndo();
    clearRedo();
    state.selectionIndex = -1;

    if (state.tool === "pen") {
      const obj = { kind: "stroke", color: state.color, size: state.size, points: [w] };
      state.objects.push(obj);
      gesture.activeObj = obj;
      gesture.mode = "drawStroke";
      redrawAll();
      return;
    }

    if (state.tool === "eraser") {
      const obj = { kind: "erase", size: Math.max(10, state.size * 2.2), points: [w] };
      state.objects.push(obj);
      gesture.activeObj = obj;
      gesture.mode = "drawErase";
      redrawAll();
      return;
    }

    if (["line", "rect", "circle", "arrow"].includes(state.tool)) {
    let p0 = w;
const ctrlHeld = !e.getModifierState("CapsLock");

// ✅ start point also prefers endpoints/intersections
{
  const hit = snapPreferEndsOrIntersections(p0);
  if (hit) p0 = hit;
  else p0 = snapToMmGridWorld(p0); // keep your “start point on mm grid” behavior when no hit
}

      const obj = { kind: state.tool, color: state.color, size: state.size, x1: p0.x, y1: p0.y, x2: p0.x, y2: p0.y, rot: 0 };
      state.objects.push(obj);
      gesture.activeObj = obj;
      gesture.mode = "drawShape";
      redrawAll();

      if (obj.kind === "line") {
        showMeasureTip(sx, sy, "0 mm");
      }
      if (obj.kind === "rect") {
        showMeasureTip(sx, sy, "0 × 0 mm");
      }
      if (obj.kind === "circle") {
        showMeasureTip(sx, sy, "Ø 0 mm");
      }
      return;
    }

    gesture.mode = "none";
  }

  function onPointerMove(e) {
    const { sx, sy } = clientToScreen(e);
     if (lenEntry.open) moveLenBoxTo(sx, sy);
    updateHoverCursor(sx, sy);

  // Arc tool: show tip immediately after center is picked (even before dragging)
// Arc tool: live radius tooltip after center is picked (before dragging)
if (state.tool === "arc" && arcDraft.hasCenter && !gesture.active) {
  const ctrlHeld = !e.getModifierState("CapsLock");
  const wPreview = screenToWorld(sx, sy);

  let p = snapShapePoint({ x: arcDraft.cx, y: arcDraft.cy }, wPreview, ctrlHeld);
  if (ctrlHeld) {
    const hit = snapPointWithCtrl(p);
    p = hit || snapPointWithCtrlOrAngle({ x: arcDraft.cx, y: arcDraft.cy }, p);
  } else {
    p = snapToMmGridWorld(p);
  }

  const rMm = Math.hypot(p.x - arcDraft.cx, p.y - arcDraft.cy) / pxPerMm();
  showMeasureTip(sx, sy, `R ${Math.round(rMm)} mm`);

  // ✅ no redrawAll() and no return; keep everything else behaving normally
}

if (!gesture.active) return;

    const w = screenToWorld(sx, sy);

    if (gesture.mode === "pan" && gesture.lastScreen) {
      const dx = sx - gesture.lastScreen.sx;
      const dy = sy - gesture.lastScreen.sy;
      state.panX += dx;
      state.panY += dy;
      gesture.lastScreen = { sx, sy };
      redrawAll();
      return;
    }

    // Selection move (stable from snapshot)
    if (gesture.mode === "selMove" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.startWorld) {
      const dx = w.x - gesture.startWorld.x;
      const dy = w.y - gesture.startWorld.y;
      state.objects[gesture.selIndex] = deepClone(gesture.selStartObj);
      moveObject(state.objects[gesture.selIndex], dx, dy);
      redrawAll();
      return;
    }

    // Selection scale (stable from snapshot)
    if (gesture.mode === "selScale" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.selAnchor && gesture.startWorld) {
      const ax = gesture.selAnchor.x;
      const ay = gesture.selAnchor.y;

      const start = gesture.startWorld;
      const obj0 = gesture.selStartObj;

      const hasOwnRot = (obj0.kind === "rect" || obj0.kind === "circle" || obj0.kind === "text") && (obj0.rot || 0);
      if (hasOwnRot) {
        const ang = obj0.rot || 0;
        const cos = Math.cos(-ang),
          sin = Math.sin(-ang);

        const v0x = (start.x - ax) * cos - (start.y - ay) * sin;
        const v0y = (start.x - ax) * sin + (start.y - ay) * cos;

        const v1x = (w.x - ax) * cos - (w.y - ay) * sin;
        const v1y = (w.x - ax) * sin + (w.y - ay) * cos;

        const fxRaw = Math.abs(v0x) < 0.001 ? 1 : v1x / v0x;
        const fyRaw = Math.abs(v0y) < 0.001 ? 1 : v1y / v0y;

        let fx = fxRaw;
        let fy = fyRaw;

        if (e.shiftKey) {
          const l0 = Math.hypot(v0x, v0y) || 1;
          const l1 = Math.hypot(v1x, v1y) || 1;
          const f = l1 / l0;
          fx = f;
          fy = f;
        }

        state.objects[gesture.selIndex] = deepClone(obj0);
        const obj = state.objects[gesture.selIndex];

        if (obj.kind === "text") {
          const uni = Math.max(0.2, (Math.abs(fx) + Math.abs(fy)) / 2);
          obj.fontSize = Math.max(6, obj0.fontSize * uni);

          const m0 = textMetrics(obj0);
          obj.x = ax - m0.w / 2;
          obj.y = ay - m0.h / 2;
        } else if (obj.kind === "rect" || obj.kind === "circle") {
          const w0 = Math.abs(obj0.x2 - obj0.x1);
          const h0 = Math.abs(obj0.y2 - obj0.y1);
          const w1 = Math.max(1, w0 * fx);
          const h1 = Math.max(1, h0 * fy);
          obj.x1 = ax - w1 / 2;
          obj.x2 = ax + w1 / 2;
          obj.y1 = ay - h1 / 2;
          obj.y2 = ay + h1 / 2;
        }

        redrawAll();
        return;
      }

      const v0 = { x: start.x - ax, y: start.y - ay };
      const v1 = { x: w.x - ax, y: w.y - ay };

      const fxRaw = Math.abs(v0.x) < 0.001 ? 1 : v1.x / v0.x;
      const fyRaw = Math.abs(v0.y) < 0.001 ? 1 : v1.y / v0.y;

      let fx = fxRaw;
      let fy = fyRaw;

      if (e.shiftKey) {
        const l0 = Math.hypot(v0.x, v0.y) || 1;
        const l1 = Math.hypot(v1.x, v1.y) || 1;
        const f = l1 / l0;
        fx = f;
        fy = f;
      }

      state.objects[gesture.selIndex] = deepClone(obj0);
      scaleObjectXY(state.objects[gesture.selIndex], fx, fy, ax, ay);
      redrawAll();
      return;
    }

    // Selection rotate (stable from snapshot)
    if (gesture.mode === "selRotate" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.selAnchor) {
      const ax = gesture.selAnchor.x;
      const ay = gesture.selAnchor.y;

      const a0 = gesture.selStartAngle;
      let a1 = Math.atan2(w.y - ay, w.x - ax);
      let delta = a1 - a0;

      if (e.shiftKey) {
        const step = (15 * Math.PI) / 180;
        delta = Math.round(delta / step) * step;
      }

      state.objects[gesture.selIndex] = deepClone(gesture.selStartObj);
      rotateObject(state.objects[gesture.selIndex], delta);
      redrawAll();
      return;
    }

    // Background transforms (stable from snapshot, CENTER-based)
    if ((gesture.mode === "bgMove" || gesture.mode === "bgScale" || gesture.mode === "bgRotate") && gesture.bgStart && gesture.startWorld) {
      const start = gesture.startWorld;
      const bg0 = gesture.bgStart;

      const cx0 = bg0.x + bg0.natW / 2;
      const cy0 = bg0.y + bg0.natH / 2;

      // Move
      if (gesture.mode === "bgMove") {
        state.bg = { ...bg0 };
        state.bg.x = bg0.x + (w.x - start.x);
        state.bg.y = bg0.y + (w.y - start.y);
        applyBgTransform();
        drawUI();
        drawInk();
        return;
      }

      // Scale from center
      if (gesture.mode === "bgScale") {
        state.bg = { ...bg0 };

        const v0 = { x: start.x - cx0, y: start.y - cy0 };
        const v1 = { x: w.x - cx0, y: w.y - cy0 };

        const l0 = Math.hypot(v0.x, v0.y) || 1;
        const l1 = Math.hypot(v1.x, v1.y) || 1;

        const factor = l1 / l0;
        const newScale = clamp(bg0.scale * factor, 0.05, 10);

        state.bg.scale = newScale;

        state.bg.x = cx0 - bg0.natW / 2;
        state.bg.y = cy0 - bg0.natH / 2;

        applyBgTransform();
        drawUI();
        drawInk();
        return;
      }

      // Rotate from center
      if (gesture.mode === "bgRotate") {
        state.bg = { ...bg0 };

        const a0 = Math.atan2(start.y - cy0, start.x - cx0);
        const a1 = Math.atan2(w.y - cy0, w.x - cx0);
        const delta = a1 - a0;

        state.bg.rot = bg0.rot + delta;

        applyBgTransform();
        drawUI();
        drawInk();
        return;
      }
    }

    // Drawing: Arc (CW/CCW + full circle snap + length indicator)
// Drawing: Arc (CW/CCW + full circle snap + length indicator)
if (gesture.mode === "drawArc" && gesture.activeObj && gesture.arcCenter) {
  const ctrlHeld = !e.getModifierState("CapsLock");

  const cx = gesture.arcCenter.cx;
  const cy = gesture.arcCenter.cy;

  let p = w;

  // ✅ ALWAYS prefer endpoints/intersections over grid/angles
  let snappedHit = null;
  const hit = snapPointWithCtrl(p); // uses SNAP_RADIUS_PX / zoom
  if (hit) {
    snappedHit = hit;
    p = hit;
  } else {
    // no hit -> keep your existing behavior
    p = ctrlHeld
      ? snapPointWithCtrlOrAngle({ x: cx, y: cy }, p) // angle-snap then mm grid
      : snapToMmGridWorld(p);                         // mm grid
  }

  let aNow = Math.atan2(p.y - cy, p.x - cx);
  if (snappedHit) aNow = Math.atan2(snappedHit.y - cy, snappedHit.x - cx);

  const wrapSigned = (a) => Math.atan2(Math.sin(a), Math.cos(a)); // (-pi..pi]
  const step = wrapSigned(aNow - (gesture.arcLastA ?? aNow));
  gesture.arcAccum = (gesture.arcAccum || 0) + step;
  gesture.arcLastA = aNow;

  const rFixed = Math.max(1, gesture.arcR || 1);
  let a2 = (gesture.arcA1 || 0) + (gesture.arcAccum || 0);

  const TWO_PI = Math.PI * 2;
  const spanAbs = Math.abs(gesture.arcAccum || 0);
  const snapTol = (10 * Math.PI) / 180; // 10°
  let isCircle = false;

  if (Math.abs(spanAbs - TWO_PI) <= snapTol) {
    isCircle = true;
    a2 = (gesture.arcA1 || 0) + Math.sign(gesture.arcAccum || 1) * TWO_PI;
  }

  gesture.activeObj.ccw = (gesture.arcAccum || 0) < 0;

  gesture.activeObj.cx = cx;
  gesture.activeObj.cy = cy;
  gesture.activeObj.r = rFixed;
  gesture.activeObj.a1 = gesture.arcA1;
  gesture.activeObj.a2 = a2;

  const rMm = rFixed / pxPerMm();
  const span = Math.abs(a2 - (gesture.arcA1 || 0));
  const lenMm = (span * rFixed) / pxPerMm();

  const label = isCircle
    ? `Circle • R ${Math.round(rMm)} mm`
    : `R ${Math.round(rMm)} mm • L ${Math.round(lenMm)} mm`;

  showMeasureTip(sx, sy, label);
  redrawAll();
  return;
}

    // Drawing: stroke / erase
    if ((gesture.mode === "drawStroke" || gesture.mode === "drawErase") && gesture.activeObj) {
      gesture.activeObj.points.push(w);
      redrawAll();
      return;
    }

    // Drawing: line/rect/circle/arrow
    if (gesture.mode === "drawShape" && gesture.activeObj) {
      let x2 = w.x;
      let y2 = w.y;

      const k = gesture.activeObj.kind;
      const ctrlHeld = !e.getModifierState("CapsLock");

      const startPt = { x: gesture.activeObj.x1, y: gesture.activeObj.y1 };
      const rawPt = { x: x2, y: y2 };

      // ✅ Line/Arrow: default = whole-mm LENGTH.
      // Ctrl/Cmd: endpoint/intersection; else angle snap + whole-mm LENGTH.
if (k === "line" || k === "arrow") {
  const p2 = snapLinePoint(startPt, rawPt, ctrlHeld);
  x2 = p2.x; y2 = p2.y;
}

if (k === "rect" || k === "circle") {
  const p2 = snapShapePoint(startPt, rawPt, ctrlHeld);
  x2 = p2.x; y2 = p2.y;
}

      if (k === "circle") {
        // Shift = perfect circle (uniform)
        if (e.shiftKey) {
          const dx = x2 - gesture.activeObj.x1;
          const dy = y2 - gesture.activeObj.y1;
          const sgnX = dx >= 0 ? 1 : -1;
          const sgnY = dy >= 0 ? 1 : -1;
          const d = Math.max(Math.abs(dx), Math.abs(dy));
          x2 = gesture.activeObj.x1 + sgnX * d;
          y2 = gesture.activeObj.y1 + sgnY * d;

          // Re-snap to mm grid after uniform constraint
          const mm2 = snapToMmGridWorld({ x: x2, y: y2 });
          x2 = mm2.x;
          y2 = mm2.y;
        }
      }

      gesture.activeObj.x2 = x2;
      gesture.activeObj.y2 = y2;

      if (k === "line") {
        const dx = x2 - gesture.activeObj.x1;
        const dy = y2 - gesture.activeObj.y1;
        const lenPx = Math.hypot(dx, dy);
        const lenMm = lenPx / pxPerMm();
        showMeasureTip(sx, sy, formatMm(lenMm));
      }

      if (k === "rect") {
        const wPx = Math.abs(x2 - gesture.activeObj.x1);
        const hPx = Math.abs(y2 - gesture.activeObj.y1);
        const wMm = wPx / pxPerMm();
        const hMm = hPx / pxPerMm();
        showMeasureTip(sx, sy, `${Math.round(wMm)} × ${Math.round(hMm)} mm`);
      }

      if (k === "circle") {
        const wPx = Math.abs(x2 - gesture.activeObj.x1);
        const hPx = Math.abs(y2 - gesture.activeObj.y1);
        const wMm = wPx / pxPerMm();
        const hMm = hPx / pxPerMm();

        if (Math.abs(wMm - hMm) <= 1) {
          const dMm = Math.round((wMm + hMm) / 2);
          showMeasureTip(sx, sy, `Ø ${dMm} mm`);
        } else {
          showMeasureTip(sx, sy, `${Math.round(wMm)} × ${Math.round(hMm)} mm`);
        }
      }

      redrawAll();
      return;
    }
  }

   function onPointerUp() {
    if (!gesture.active) return;
    try {
      inkCanvas.releasePointerCapture(gesture.pointerId);
    } catch {}
    closeLenBox();          // ✅ add this
    hardResetGesture();
    updateCursorFromTool();
  }

  inkCanvas.addEventListener("pointerdown", onPointerDown);
  inkCanvas.addEventListener("pointermove", onPointerMove);
  inkCanvas.addEventListener("pointerup", onPointerUp);
  inkCanvas.addEventListener("pointercancel", onPointerUp);

  inkCanvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const { sx, sy } = clientToScreen(e);
      const dir = Math.sign(e.deltaY);
      const step = dir > 0 ? 0.9 : 1.1;
      setZoomTo(state.zoom * step, sx, sy);
    },
    { passive: false }
  );

  // ---------- Colour popover ----------
  function toggleColorPop(open) {
    const shouldOpen = open ?? colorPop.classList.contains("is-hidden");
    colorPop.classList.toggle("is-hidden", !shouldOpen);
  }

  colorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleColorPop();
  });

  document.addEventListener("pointerdown", (e) => {
    if (colorPop.classList.contains("is-hidden")) return;
    const inside = colorPop.contains(e.target) || colorBtn.contains(e.target);
    if (!inside) toggleColorPop(false);
  });

  colorInput.addEventListener("input", () => setColor(colorInput.value));
  brushSize.addEventListener("input", () => setBrushSize(brushSize.value));

  // ---------- Settings panel ----------
  function openSettings(open) {
    const isOpen = open ?? settingsPanel.classList.contains("is-hidden");
    settingsPanel.classList.toggle("is-hidden", !isOpen);
    settingsBtn.setAttribute("aria-expanded", String(isOpen));
  }

  settingsBtn.addEventListener("click", () => openSettings());
  settingsCloseBtn.addEventListener("click", () => openSettings(false));

  document.addEventListener("pointerdown", (e) => {
    if (settingsPanel.classList.contains("is-hidden")) return;
    const inside = settingsPanel.contains(e.target);
    const onGear = settingsBtn.contains(e.target);
    if (!inside && !onGear) openSettings(false);
  });

  // ---------- Tool buttons ----------
  dockBtns.forEach((b) =>
    b.addEventListener("click", () => {
      const t = b.dataset.tool;

      // ✅ If Arc is already active, clicking it again arms a new center pick
    if (t === "arc" && state.tool === "arc") {
  hideMeasureTip(); // ✅ clear old radius tip when re-arming arc
  arcDraft.hasCenter = false;
  showToast("Click to set arc center");
}

      setActiveTool(t);
    })
  );

  clearBtn.addEventListener("click", () => {
    pushUndo();
    clearRedo();
    hardResetGesture();
    state.objects = [];
    state.selectionIndex = -1;
    setActiveTool("pen");
    redrawAll();
  });

  applyTitleBtn.addEventListener("click", () => {
    pushUndo();
    clearRedo();
    state.title = (titleInput.value || "").trim();
    redrawAll();
  });

  function setBackgroundFromDataURL(dataURL) {
    const img = new Image();
    img.onload = () => {
      pushUndo();
      clearRedo();
      hardResetGesture();

      state.bg.src = String(dataURL || "");
      state.bg.natW = img.naturalWidth;
      state.bg.natH = img.naturalHeight;

      bgImg.src = state.bg.src;

      const viewCenter = screenToWorld(state.viewW / 2, state.viewH / 2);
      const viewW = state.viewW / state.zoom;
      const viewH = state.viewH / state.zoom;

      const fit = Math.min(viewW / img.naturalWidth, viewH / img.naturalHeight);
      state.bg.scale = clamp(fit, 0.05, 10);

      state.bg.x = viewCenter.x - img.naturalWidth / 2;
      state.bg.y = viewCenter.y - img.naturalHeight / 2;
      state.bg.rot = 0;

      applyBgTransform();
      redrawAll();
      showToast("Background loaded");
    };
    img.onerror = () => showToast("Paste failed");
    img.src = String(dataURL || "");
  }

  // Background import
  bgFile.addEventListener("change", () => {
    const file = bgFile.files && bgFile.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        pushUndo();
        clearRedo();
        hardResetGesture();

        state.bg.src = String(reader.result || "");
        state.bg.natW = img.naturalWidth;
        state.bg.natH = img.naturalHeight;

        bgImg.src = state.bg.src;

        const viewCenter = screenToWorld(state.viewW / 2, state.viewH / 2);
        const viewW = state.viewW / state.zoom;
        const viewH = state.viewH / state.zoom;

        const fit = Math.min(viewW / img.naturalWidth, viewH / img.naturalHeight);
        state.bg.scale = clamp(fit, 0.05, 10);

        state.bg.x = viewCenter.x - img.naturalWidth / 2;
        state.bg.y = viewCenter.y - img.naturalHeight / 2;
        state.bg.rot = 0;

        applyBgTransform();
        redrawAll();
        showToast("Background loaded");
      };
      img.src = String(reader.result || "");
    };
    reader.readAsDataURL(file);
    bgFile.value = "";
  });

  clearBgBtn.addEventListener("click", () => {
    pushUndo();
    clearRedo();
    hardResetGesture();
    state.bg = { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 };
    bgImg.removeAttribute("src");
    applyBgTransform();
    redrawAll();
  });

  // ---------- Import SVG as ink (step through elements with arrow keys) ----------
  function parseNumberAttr(v) {
    const n = parseFloat(String(v || "").replace(/px$/, ""));
    return isFinite(n) ? n : null;
  }

  function getSvgRootBox(svgEl) {
    const vb = svgEl.getAttribute("viewBox");
    if (vb) {
      const parts = vb.trim().split(/[\s,]+/).map(Number);
      if (parts.length === 4 && parts.every(isFinite)) {
        return { x: parts[0], y: parts[1], w: parts[2], h: parts[3] };
      }
    }
    const w = parseNumberAttr(svgEl.getAttribute("width")) ?? 1000;
    const h = parseNumberAttr(svgEl.getAttribute("height")) ?? 1000;
    return { x: 0, y: 0, w, h };
  }

  function ensureHiddenSvgHost() {
    let host = document.getElementById("svgInkHost");
    if (host) return host;
    host = document.createElement("div");
    host.id = "svgInkHost";
    host.style.position = "fixed";
    host.style.left = "-99999px";
    host.style.top = "0";
    host.style.width = "1px";
    host.style.height = "1px";
    host.style.overflow = "hidden";
    host.style.pointerEvents = "none";
    document.body.appendChild(host);
    return host;
  }
  function parseCamTransform(transformStr) {
    // Matches: translate(px py) scale(z)
    const s = String(transformStr || "").trim();
    const m = s.match(/translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)\s*scale\(\s*([-\d.]+)\s*\)/i);
    if (!m) return null;
    const panX = parseFloat(m[1]);
    const panY = parseFloat(m[2]);
    const zoom = parseFloat(m[3]);
    if (![panX, panY, zoom].every(Number.isFinite) || zoom === 0) return null;
    return { panX, panY, zoom };
  }

  function invCamPoint(p, cam) {
    // Inverse of: screen = world*zoom + pan
    return { x: (p.x - cam.panX) / cam.zoom, y: (p.y - cam.panY) / cam.zoom };
  }

  function importSvgInkFromText(svgText) {
    const doc = new DOMParser().parseFromString(String(svgText || ""), "image/svg+xml");
    const parsedSvg = doc.querySelector("svg");
    if (!parsedSvg) {
      showToast("SVG not valid");
      return;
    }

    const host = ensureHiddenSvgHost();
    host.innerHTML = "";

    const svg = parsedSvg.cloneNode(true);
    svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    svg.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
    host.appendChild(svg);

    // Detect round-trip export from *this* app: first child <g transform="translate(pan) scale(zoom)">
    const camGroup = svg.querySelector(":scope > g[transform]");
    const cam = camGroup ? parseCamTransform(camGroup.getAttribute("transform")) : null;
    const isRoundTrip = !!cam;

    const rootBox = getSvgRootBox(svg);

    // ---- Background image (DEFER applying until we know the same transform we apply to ink) ----
    let pendingBg = null;
    {
      const imgEl = svg.querySelector("image");
      if (imgEl) {
        const href = imgEl.getAttribute("href") || imgEl.getAttribute("xlink:href") || "";
        const wAttr = parseNumberAttr(imgEl.getAttribute("width"));
        const hAttr = parseNumberAttr(imgEl.getAttribute("height"));
        if (href) {
          // NOTE: exporter writes x/y in the transform string; we preserve those
          const tf = (imgEl.getAttribute("transform") || "").trim();
          let x = 0,
            y = 0,
            rot = 0,
            scale = 1;
          try {
            const m = tf.match(
              /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)\s*translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)\s*rotate\(\s*([-\d.]+)\s*\)\s*scale\(\s*([-\d.]+)\s*\)\s*translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)\s*$/i
            );
            if (m) {
              x = parseFloat(m[1]) || 0;
              y = parseFloat(m[2]) || 0;
              rot = ((parseFloat(m[5]) || 0) * Math.PI) / 180;
              scale = parseFloat(m[6]) || 1;
            }
          } catch {}

          pendingBg = {
            src: String(href),
            natW: wAttr ?? rootBox.w ?? 0,
            natH: hAttr ?? rootBox.h ?? 0,
            x,
            y,
            rot,
            scale
          };
        }
      }
    }

    const els = Array.from(svg.querySelectorAll("path,line,polyline,polygon,rect,circle,ellipse,text"));
    if (!els.length && !pendingBg) {
      showToast("No SVG paths");
      return;
    }

    const rootPt = svg.createSVGPoint ? svg.createSVGPoint() : null;

    const parts = [];
    const boundsPts = [];

    function pushPart(obj, ptsForBounds) {
      parts.push(obj);
      if (ptsForBounds && ptsForBounds.length) boundsPts.push(...ptsForBounds);
    }

    const isNone = (v) => {
      const s = String(v || "").trim().toLowerCase();
      return !s || s === "none" || s === "transparent";
    };

    function strokeOf(el) {
      const stroke = el.getAttribute("stroke");
      if (!isNone(stroke)) return stroke;
      return "#111111";
    }

    function strokeWidthOf(el) {
      const sw = parseNumberAttr(el.getAttribute("stroke-width"));
      return Math.max(1, sw ?? 3);
    }

    function mapCTM(el, x, y) {
      if (rootPt && el.getCTM) {
        const m = el.getCTM();
        rootPt.x = x;
        rootPt.y = y;
        const p = rootPt.matrixTransform(m); // includes cam group if present
        if (isRoundTrip) return invCamPoint({ x: p.x, y: p.y }, cam); // remove camera
        return { x: p.x, y: p.y };
      }
      const p = { x, y };
      if (isRoundTrip) return invCamPoint(p, cam);
      return p;
    }

    // ---- Build ink parts; SKIP fill-only exporter background shapes (the "random box") ----
for (const el of els) {
  const tag = el.tagName.toLowerCase();

  // Background “white rect” killer
  const fillAttr = fillStr(el);
  const fillIsWhiteish = (() => {
    const f = String(fillAttr || "").trim().toLowerCase();
    return f === "white" || f === "#fff" || f === "#ffffff" || f === "rgb(255,255,255)";
  })();

  const strokeAttr = strokeStr(el);
  const strokeIsNone = isNone(strokeAttr);

  // Ignore exporter background rect
  if (tag === "rect" && strokeIsNone && (fillIsWhiteish || !fillAttr)) continue;

  // Only import shapes that actually have a stroke
  if (
    (tag === "rect" ||
      tag === "circle" ||
      tag === "ellipse" ||
      tag === "path" ||
      tag === "line" ||
      tag === "polyline" ||
      tag === "polygon") &&
    strokeIsNone
  ) {
    continue;
  }

  const stroke = !strokeIsNone ? strokeAttr : "#111111";
  const size = strokeWidthNum(el);

  if (tag === "line") {
    const x1 = parseNumberAttr(el.getAttribute("x1")) ?? 0;
    const y1 = parseNumberAttr(el.getAttribute("y1")) ?? 0;
    const x2 = parseNumberAttr(el.getAttribute("x2")) ?? 0;
    const y2 = parseNumberAttr(el.getAttribute("y2")) ?? 0;
    const p1 = mapCTM(el, x1, y1);
    const p2 = mapCTM(el, x2, y2);
    pushPart({ kind: "line", color: stroke, size, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 }, [p1, p2]);
    continue;
  }

  if (tag === "rect") {
    const x = parseNumberAttr(el.getAttribute("x")) ?? 0;
    const y = parseNumberAttr(el.getAttribute("y")) ?? 0;
    const w = parseNumberAttr(el.getAttribute("width")) ?? 0;
    const h = parseNumberAttr(el.getAttribute("height")) ?? 0;
    const p1 = mapCTM(el, x, y);
    const p2 = mapCTM(el, x + w, y + h);
    pushPart({ kind: "rect", color: stroke, size, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 }, [p1, p2]);
    continue;
  }

  if (tag === "circle") {
    const cx = parseNumberAttr(el.getAttribute("cx")) ?? 0;
    const cy = parseNumberAttr(el.getAttribute("cy")) ?? 0;
    const r = parseNumberAttr(el.getAttribute("r")) ?? 0;
    const p1 = mapCTM(el, cx - r, cy - r);
    const p2 = mapCTM(el, cx + r, cy + r);
    pushPart({ kind: "circle", color: stroke, size, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 }, [p1, p2]);
    continue;
  }

  if (tag === "ellipse") {
    const cx = parseNumberAttr(el.getAttribute("cx")) ?? 0;
    const cy = parseNumberAttr(el.getAttribute("cy")) ?? 0;
    const rx = parseNumberAttr(el.getAttribute("rx")) ?? 0;
    const ry = parseNumberAttr(el.getAttribute("ry")) ?? 0;
    const p1 = mapCTM(el, cx - rx, cy - ry);
    const p2 = mapCTM(el, cx + rx, cy + ry);
    pushPart({ kind: "circle", color: stroke, size, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 }, [p1, p2]);
    continue;
  }

  // NOTE: If you want text later, we can add it, BUT you must also handle it in the “recenter/scale” step.
  // For now: skip text so import cannot break.
  if (tag === "text") {
    continue;
  }

  if (tag === "polyline" || tag === "polygon") {
    const ptsAttr = (el.getAttribute("points") || "").trim();
    if (!ptsAttr) continue;
    const nums = ptsAttr.split(/[\s,]+/).map(Number).filter((n) => isFinite(n));
    if (nums.length < 4) continue;

    const pts = [];
    for (let i = 0; i < nums.length - 1; i += 2) pts.push(mapCTM(el, nums[i], nums[i + 1]));
    if (tag === "polygon" && pts.length) pts.push({ ...pts[0] });

    pushPart({ kind: "stroke", color: stroke, size, points: pts }, pts.slice(0, 12));
    continue;
  }

  if (tag === "path") {
    if (!el.getTotalLength) continue;

    let total = 0;
    try { total = el.getTotalLength(); } catch { total = 0; }
    if (!isFinite(total) || total <= 0) continue;

    // Dense sampling makes arc-paths look good
    const steps = Math.max(60, Math.min(420, Math.ceil(total / 3)));

    const pts = [];
    for (let i = 0; i <= steps; i++) {
      const t = (i / steps) * total;
      let p = null;
      try { p = el.getPointAtLength(t); } catch { p = null; }
      if (!p) continue;
      pts.push(mapCTM(el, p.x, p.y));
    }
    if (pts.length < 2) continue;

    pushPart({ kind: "stroke", color: stroke, size, points: pts }, pts.slice(0, 12));
    continue;
  }
}

if (!parts.length && !pendingBg) {
  showToast("No supported SVG shapes");
  return;
}

    // ---- Bounds (for recenter/scale) ----
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    const use = boundsPts.length
      ? boundsPts
      : [
          { x: rootBox.x, y: rootBox.y },
          { x: rootBox.x + rootBox.w, y: rootBox.y + rootBox.h }
        ];
    for (const p of use) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    const bw = Math.max(1, maxX - minX);
    const bh = Math.max(1, maxY - minY);

    let viewCenter = screenToWorld(state.viewW / 2, state.viewH / 2);
    let s = clamp(Math.min(((state.viewW / state.zoom) * 0.9) / bw, ((state.viewH / state.zoom) * 0.9) / bh), 0.02, 50);

    let cx0 = minX + bw / 2;
    let cy0 = minY + bh / 2;

    if (isRoundTrip) {
      // Keep original world coords, no refit/recenter
      viewCenter = { x: 0, y: 0 };
      s = 1;
      cx0 = 0;
      cy0 = 0;
    }

    const groupId = "svg_" + Date.now();

    pushUndo();
    clearRedo();
    hardResetGesture();

    // ---- Apply SAME recenter/scale to background image (so bg + ink align) ----
    if (pendingBg) {
      state.bg.src = pendingBg.src;
      state.bg.natW = pendingBg.natW;
      state.bg.natH = pendingBg.natH;

      state.bg.rot = pendingBg.rot;
      state.bg.scale = pendingBg.scale * s;

      // map the image's top-left (world coords) through the same transform
      state.bg.x = viewCenter.x + (pendingBg.x - cx0) * s;
      state.bg.y = viewCenter.y + (pendingBg.y - cy0) * s;

      bgImg.src = state.bg.src;
      applyBgTransform();
    }

    const startIndex = state.objects.length;

    for (const o of parts) {
      const obj = JSON.parse(JSON.stringify(o));
      obj.svgGroupId = groupId;
      obj.hidden = true;

      if (obj.kind === "stroke" || obj.kind === "erase") {
        obj.points = (obj.points || []).map((p) => ({
          x: viewCenter.x + (p.x - cx0) * s,
          y: viewCenter.y + (p.y - cy0) * s
        }));
      } else {
        obj.x1 = viewCenter.x + (obj.x1 - cx0) * s;
        obj.y1 = viewCenter.y + (obj.y1 - cy0) * s;
        obj.x2 = viewCenter.x + (obj.x2 - cx0) * s;
        obj.y2 = viewCenter.y + (obj.y2 - cy0) * s;
      }

      state.objects.push(obj);
    }

    svgReveal.active = true;
    svgReveal.groupId = groupId;
    svgReveal.partIndices = [];
    svgReveal.revealed = 0;
    for (let i = startIndex; i < state.objects.length; i++) svgReveal.partIndices.push(i);

    state.selectionIndex = -1;
    setActiveTool("select");

    if (isRoundTrip) {
      state.zoom = cam.zoom;
      state.panX = cam.panX;
      state.panY = cam.panY;
    }

    redrawAll();
    showToast(`SVG imported: 0/${svgReveal.partIndices.length} (→ reveal)`);
  }

  function clearImportedSvgInk() {
    if (!svgReveal.active || !svgReveal.groupId) {
      showToast("No SVG ink");
      return;
    }
    pushUndo();
    clearRedo();
    const gid = svgReveal.groupId;
    state.objects = state.objects.filter((o) => !(o && o.svgGroupId === gid));
    svgReveal.active = false;
    svgReveal.groupId = null;
    svgReveal.partIndices = [];
    svgReveal.revealed = 0;
    state.selectionIndex = -1;
    redrawAll();
    showToast("SVG cleared");
  }

  // Wire up UI if present
  if (svgInkFile) {
    svgInkFile.addEventListener("change", () => {
      const file = svgInkFile.files && svgInkFile.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => importSvgInkFromText(String(reader.result || ""));
      reader.readAsText(file);
      svgInkFile.value = "";
    });
  }
  if (clearSvgInkBtn) {
    clearSvgInkBtn.addEventListener("click", () => clearImportedSvgInk());
  }

  // ---------- Clipboard paste images (Ctrl/Cmd+V) ----------
  document.addEventListener("paste", (e) => {
    try {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (typing) return;

      const items = e.clipboardData && e.clipboardData.items ? Array.from(e.clipboardData.items) : [];
      if (!items.length) return;

      const imgItem = items.find((it) => it.type && it.type.startsWith("image/"));
      if (!imgItem) return;

      const file = imgItem.getAsFile();
      if (!file) return;

      e.preventDefault();

      const reader = new FileReader();
      reader.onload = () => setBackgroundFromDataURL(String(reader.result || ""));
      reader.readAsDataURL(file);
    } catch {
      // no-op
    }
  });

  // ---------- Keyboard ----------
document.addEventListener("keydown", (e) => {
  const tag = (document.activeElement && document.activeElement.tagName) || "";
  const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";

  // Escape closes panels + tips + length box
  if (e.key === "Escape") {
    openSettings(false);
    toggleColorPop(false);
    arcDraft.hasCenter = false;
    hideMeasureTip();
    closeLenBox();
    return;
  }

  // ---------- Type-to-set length while dragging LINE/ARROW ----------
  if (
    !typing &&
    gesture.active &&
    gesture.mode === "drawShape" &&
    gesture.activeObj &&
    (gesture.activeObj.kind === "line" || gesture.activeObj.kind === "arrow")
  ) {
    const isDigit = /^[0-9]$/.test(e.key);
    const isDot = e.key === "." || e.key === ",";
    const isBack = e.key === "Backspace";
    const isEnter = e.key === "Enter";
    const isEsc = e.key === "Escape";
    const isMinus = e.key === "-";

    if (isDigit || isDot || isBack || isEnter || isEsc || isMinus) {
      e.preventDefault();

      if (isEsc) {
        closeLenBox();
        return;
      }

if (isEnter) {
  // ✅ If user typed nothing, use placeholder/seed (current length)
  const raw = (lenInput.value || "").trim() || lenInput.placeholder || "";
  let mm = parseMmInput(raw);

  if (mm == null && lenEntry.seedMm != null) mm = lenEntry.seedMm;

  if (mm == null) {
    showToast("Invalid mm");
    return;
  }

  setActiveLineLengthMm(mm);

  closeLenBox();
  try { inkCanvas.releasePointerCapture(gesture.pointerId); } catch {}
  hardResetGesture();
  updateCursorFromTool();
  redrawAll();
  return;
}

      if (isBack) {
        lenInput.value = lenInput.value.slice(0, -1);
        return;
      }

      if (isDigit) lenInput.value += e.key;
      else if (isDot) lenInput.value += ".";
      else if (isMinus) lenInput.value += "-";

      return;
    }
  }

  // Space pan
  if (e.code === "Space") {
    spacePanning = true;
    e.preventDefault();
    if (gesture.active && gesture.mode === "pan") inkCanvas.style.cursor = "grabbing";
    return;
  }

  // SVG reveal controls (when an SVG has been imported as ink)
  if (!typing && svgReveal.active && (e.key === "." || e.key === ",")) {
    e.preventDefault();
    const total = svgReveal.partIndices.length;
    if (!total) return;

    if (e.key === ".") {
      while (svgReveal.revealed < total) {
        const idx = svgReveal.partIndices[svgReveal.revealed];
        const obj = state.objects[idx];
        svgReveal.revealed += 1;
        if (obj) {
          obj.hidden = false;
          break;
        }
      }
      redrawAll();
      showToast(`SVG: ${Math.min(svgReveal.revealed, total)}/${total}`);
      return;
    }

    if (e.key === ",") {
      while (svgReveal.revealed > 0) {
        svgReveal.revealed -= 1;
        const idx = svgReveal.partIndices[svgReveal.revealed];
        const obj = state.objects[idx];
        if (obj) {
          obj.hidden = true;
          break;
        }
      }
      redrawAll();
      showToast(`SVG: ${Math.max(svgReveal.revealed, 0)}/${total}`);
      return;
    }
  }

  // Delete removes selection (when not typing)
  if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
    if (state.selectionIndex >= 0) {
      pushUndo();
      clearRedo();
      state.objects.splice(state.selectionIndex, 1);
      state.selectionIndex = -1;
      redrawAll();
      showToast("Deleted");
      return;
    }
  }

  // Tool hotkeys
  if (!typing) {
    const k = e.key.toLowerCase();
    if (k === "v") setActiveTool("select");
    if (k === "p") setActiveTool("pen");
    if (k === "l") setActiveTool("line");
    if (k === "r") setActiveTool("rect");
    if (k === "c") setActiveTool("circle");
    if (k === "g") setActiveTool("arc");
    if (k === "a") setActiveTool("arrow");
    if (k === "t") setActiveTool("text");
    if (k === "e") setActiveTool("eraser");
  }

  // Undo/redo shortcuts
  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const mod = isMac ? e.metaKey : e.ctrlKey;

  if (mod) {
    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      hardResetGesture();
      undo();
      return;
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      hardResetGesture();
      redo();
      return;
    }
  }

  // ----- Ctrl/Cmd + NUMBER / +/- / ARROWS helpers -----
  if (!typing && (e.getModifierState("CapsLock"))) {
    const digit = /^[0-9]$/.test(e.key) ? Number(e.key) : null;

    if (digit !== null) {
      e.preventDefault();
      const size = digit === 0 ? 13 : digit;
      setBrushSizeFromHotkey(size);
      return;
    }

    if (e.key === "=" || e.key === "+") {
      e.preventDefault();
      setBrushSizeFromHotkey(state.size + (e.shiftKey ? 8 : 16));
      return;
    }
    if (e.key === "-" || e.key === "_") {
      e.preventDefault();
      setBrushSizeFromHotkey(state.size - (e.shiftKey ? 8 : 16));
      return;
    }

    if (e.key === "ArrowUp" || e.key === "ArrowDown" || e.key === "ArrowLeft" || e.key === "ArrowRight") {
      e.preventDefault();
      const step = e.shiftKey ? 160 : 60;
      if (e.key === "ArrowUp") nudgePan(0, step);
      if (e.key === "ArrowDown") nudgePan(0, -step);
      if (e.key === "ArrowLeft") nudgePan(step, 0);
      if (e.key === "ArrowRight") nudgePan(-step, 0);
      return;
    }
  }
});
  // ---------- Boards ----------
  const LS_KEY = "PHS_WHITEBOARD_BOARDS_v8";

  function loadBoardsIndex() {
    try {
      return JSON.parse(localStorage.getItem(LS_KEY) || "{}");
    } catch {
      return {};
    }
  }
  function saveBoardsIndex(index) {
    localStorage.setItem(LS_KEY, JSON.stringify(index));
  }
  function refreshBoardSelect() {
    const index = loadBoardsIndex();
    const names = Object.keys(index).sort((a, b) => a.localeCompare(b));
    boardSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = "";
    opt0.textContent = "— select —";
    boardSelect.appendChild(opt0);
    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name;
      opt.textContent = name;
      boardSelect.appendChild(opt);
    }
  }

  function snapshotBoard() {
    return { v: 8, savedAt: new Date().toISOString(), ...snapshot() };
  }
// ✅ Always prefer endpoints/intersections over anything else
function snapPreferEndsOrIntersections(rawPt) {
  return snapPointWithCtrl(rawPt); // uses SNAP_RADIUS_PX + zoom
}

// ✅ Generic point snap for shapes that use mm GRID (rect/circle, and arc points)
function snapShapePoint(start, rawPt, ctrlHeld) {
  const hit = snapPreferEndsOrIntersections(rawPt);
  if (hit) return hit;

  // no hit -> your existing behavior
  return ctrlHeld
    ? snapPointWithCtrlOrAngle(start, rawPt) // angle-snap then mm grid
    : snapToMmGridWorld(rawPt);              // mm grid
}

// ✅ Line/Arrow endpoint snap: prefer ends/intersections, else preserve your length/angle rules
function snapLinePoint(start, rawPt, ctrlHeld) {
  const hit = snapPreferEndsOrIntersections(rawPt);
  if (hit) return hit;

  // no hit -> your existing behavior
  return ctrlHeld
    ? snapLinePointWithCtrlOrAngle(start, rawPt) // angle-snap then whole-mm LENGTH
    : snapToWholeMmLength(start, rawPt);         // whole-mm LENGTH
}
  async function applyBoard(data) {
    hardResetGesture();
    state.undo = [];
    state.redo = [];
    applySnapshot(data);

    if (state.bg && state.bg.src) bgImg.src = state.bg.src;
    else bgImg.removeAttribute("src");

    applyBgTransform();
    redrawAll();
  }

   function freshBoardSnapshot() {
  return {
    v: 8,
    savedAt: new Date().toISOString(),
    tool: "pen",
    color: state.color || "#111111",
    size: state.size || 5,
    zoom: 0.25,
    panX: (state.viewW / 2),
    panY: (state.viewH / 2),
    title: "",
    pxPerMm: state.pxPerMm || (96/25.4),
    bg: { src:"", natW:0, natH:0, x:0, y:0, scale:1, rot:0 },
    objects: []
  };
}

newBoardBtn?.addEventListener("click", async () => {
  // Ask to save current board first
  const doSave = confirm("Save the current canvas before starting a new one?");
  if (doSave) {
    const name = prompt("Save board as name:", boardSelect.value || "");
    if (name) {
      const index = loadBoardsIndex();
      index[name] = snapshotBoard();
      saveBoardsIndex(index);
      refreshBoardSelect();
      boardSelect.value = name;
      showToast("Board saved");
    }
  }

  // Start a fresh board (blank canvas)
  await applyBoard(freshBoardSnapshot());
  boardSelect.value = "";
  showToast("New board");
});

  saveBoardBtn?.addEventListener("click", () => {
    const name = prompt("Save board as name:", boardSelect.value || "");
    if (!name) return;
    const index = loadBoardsIndex();
    index[name] = snapshotBoard();
    saveBoardsIndex(index);
    refreshBoardSelect();
    boardSelect.value = name;
    showToast("Board saved");
  });

  loadBoardBtn?.addEventListener("click", async () => {
    const name = boardSelect.value;
    if (!name) return;
    const index = loadBoardsIndex();
    if (!index[name]) return;
    await applyBoard(index[name]);
    showToast("Board loaded");
  });

  refreshBoardSelect();

  // ---------- Scale calibration ----------
  function getLineForCalibration() {
    const sel = state.selectionIndex >= 0 ? state.objects[state.selectionIndex] : null;
    if (sel && (sel.kind === "line" || sel.kind === "arrow")) return sel;
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const o = state.objects[i];
      if (o && (o.kind === "line" || o.kind === "arrow")) return o;
    }
    return null;
  }

  setScaleBtn?.addEventListener("click", () => {
    const o = getLineForCalibration();
    if (!o) {
      showToast("Draw/select a line first");
      return;
    }
    const lenPx = Math.hypot(o.x2 - o.x1, o.y2 - o.y1);
    if (!isFinite(lenPx) || lenPx < 1) {
      showToast("Line too short");
      return;
    }
    const mmStr = prompt("Enter the real length of that line (mm):", "100");
    if (mmStr == null) return;
    const mm = parseFloat(String(mmStr).replace(/[^0-9.+-]/g, ""));
    if (!isFinite(mm) || mm <= 0) {
      showToast("Invalid mm");
      return;
    }
    pushUndo();
    clearRedo();
    state.pxPerMm = lenPx / mm;
    updateScaleOut();
    redrawAll();
    showToast("Scale set");
  });

  resetScaleBtn?.addEventListener("click", () => {
    pushUndo();
    clearRedo();
    state.pxPerMm = 96 / 25.4;
    updateScaleOut();
    redrawAll();
    showToast("Scale reset");
  });

  // ---------- Delete saved boards ----------
  deleteBoardBtn?.addEventListener("click", () => {
    const name = boardSelect.value;
    if (!name) {
      showToast("Select a board");
      return;
    }
    if (!confirm(`Delete saved board “${name}”?`)) return;
    const index = loadBoardsIndex();
    if (!index[name]) {
      showToast("Not found");
      return;
    }
    delete index[name];
    saveBoardsIndex(index);
    refreshBoardSelect();
    boardSelect.value = "";
    showToast("Board deleted");
  });

  deleteAllBoardsBtn?.addEventListener("click", () => {
    const index = loadBoardsIndex();
    const names = Object.keys(index);
    if (!names.length) {
      showToast("No saved boards");
      return;
    }
    if (!confirm(`Delete ALL saved boards (${names.length})?`)) return;
    localStorage.removeItem(LS_KEY);
    refreshBoardSelect();
    boardSelect.value = "";
    showToast("All boards deleted");
  });

  // ---------- Export SVG (vector) ----------
  function svgEscape(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function pathFromPoints(pts) {
    if (!pts || pts.length < 2) return "";
    let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
    }
    return d;
  }

  function exportSVG() {
    const W = state.viewW;
    const H = state.viewH;

    const cam = `translate(${state.panX.toFixed(3)} ${state.panY.toFixed(3)}) scale(${state.zoom.toFixed(6)})`;

    let bgMarkup = "";
    if (state.bg.src) {
      const natW = state.bg.natW || 0;
      const natH = state.bg.natH || 0;
      const cx = natW / 2,
        cy = natH / 2;
      const t = [
        `translate(${state.bg.x.toFixed(3)} ${state.bg.y.toFixed(3)})`,
        `translate(${cx.toFixed(3)} ${cy.toFixed(3)})`,
        `rotate(${((state.bg.rot * 180) / Math.PI).toFixed(6)})`,
        `scale(${state.bg.scale.toFixed(6)})`,
        `translate(${(-cx).toFixed(3)} ${(-cy).toFixed(3)})`
      ].join(" ");
      // ✅ include xlink:href for compatibility
      bgMarkup = `<image href="${state.bg.src}" xlink:href="${state.bg.src}" x="0" y="0" width="${natW}" height="${natH}" transform="${t}" />`;
    }

    let defs = "";
    let pastLayer = "";
    let currentLayer = "";
    let maskCount = 0;

    function wrapWithEraseMask(erasePathD, eraseSize) {
      maskCount += 1;
      const id = `m${maskCount}`;
      const strokeW = Math.max(1, eraseSize || 20);

      defs += `
      <mask id="${id}" maskUnits="userSpaceOnUse">
        <rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/>
        <path d="${erasePathD}" fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeW}"/>
      </mask>`;

      const combined = pastLayer + currentLayer;
      pastLayer = `<g mask="url(#${id})">${combined}</g>`;
      currentLayer = "";
    }

    for (const obj of state.objects) {
      if (obj.kind === "erase") {
        const d = pathFromPoints(obj.points || []);
        if (d) wrapWithEraseMask(d, obj.size);
        continue;
      }

      if (obj.kind === "stroke") {
        const d = pathFromPoints(obj.points || []);
        if (!d) continue;
        currentLayer += `<path d="${d}" fill="none" stroke="${obj.color}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${obj.size}"/>`;
        continue;
      }

      if (obj.kind === "text") {
        const m = textMetrics(obj);
        const cx = obj.x + m.w / 2;
        const cy = obj.y + m.h / 2;
        const ang = ((obj.rot || 0) * 180) / Math.PI;
        const t = `translate(${cx.toFixed(3)} ${cy.toFixed(3)}) rotate(${ang.toFixed(6)}) translate(${(-m.w / 2).toFixed(3)} ${(-m.h / 2).toFixed(3)})`;
        currentLayer += `<text x="0" y="0" transform="${t}" fill="${obj.color}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-weight="700" font-size="${m.fontSize}">${svgEscape(obj.text || "")}</text>`;
        continue;
      }

      const x1 = obj.x1,
        y1 = obj.y1,
        x2 = obj.x2,
        y2 = obj.y2;
      const w = x2 - x1,
        h = y2 - y1;

      if (obj.kind === "line") {
        currentLayer += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${obj.color}" stroke-width="${obj.size}" stroke-linecap="round" />`;
        continue;
      }

      if (obj.kind === "arrow") {
        const ang = Math.atan2(y2 - y1, x2 - x1);
        const headLen = Math.max(10, obj.size * 3);
        const a1 = ang + Math.PI * 0.85;
        const a2 = ang - Math.PI * 0.85;
        const hx1 = x2 + Math.cos(a1) * headLen;
        const hy1 = y2 + Math.sin(a1) * headLen;
        const hx2 = x2 + Math.cos(a2) * headLen;
        const hy2 = y2 + Math.sin(a2) * headLen;
        currentLayer += `<path d="M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${hx1} ${hy1} M ${x2} ${y2} L ${hx2} ${hy2}" fill="none" stroke="${obj.color}" stroke-width="${obj.size}" stroke-linecap="round" stroke-linejoin="round" />`;
        continue;
      }

      if (obj.kind === "rect") {
        const cx = (x1 + x2) / 2,
          cy = (y1 + y2) / 2;
        const rw = Math.abs(w),
          rh = Math.abs(h);
        const ang = ((obj.rot || 0) * 180) / Math.PI;
        const t = `translate(${cx} ${cy}) rotate(${ang})`;
        currentLayer += `<rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" transform="${t}" fill="none" stroke="${obj.color}" stroke-width="${obj.size}" />`;
        continue;
      }

      if (obj.kind === "circle") {
        const cx = (x1 + x2) / 2,
          cy = (y1 + y2) / 2;
        const rx = Math.abs(w) / 2,
          ry = Math.abs(h) / 2;
        const ang = ((obj.rot || 0) * 180) / Math.PI;
        const t = `translate(${cx} ${cy}) rotate(${ang})`;
        currentLayer += `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" transform="${t}" fill="none" stroke="${obj.color}" stroke-width="${obj.size}" />`;
        continue;
      }

 if (obj.kind === "arc") {
  const a1 = obj.a1 || 0;
  const a2 = obj.a2 || 0;
  const ccw = !!obj.ccw;

  const TWO_PI = Math.PI * 2;

  // ✅ Full circle detection must use RAW delta (a2 may be a1 ± 2π but arcDelta normalizes to ~0)
  const rawSpanAbs = Math.abs(a2 - a1);
  if (rawSpanAbs >= TWO_PI - 1e-6) {
    currentLayer += `<circle cx="${obj.cx}" cy="${obj.cy}" r="${obj.r}" fill="none" stroke="${obj.color}" stroke-width="${obj.size}" />`;
    continue;
  }

  // Span (positive)
  const span = ccw ? arcDelta(a2, a1) : arcDelta(a1, a2);

  const largeArc = span > Math.PI ? 1 : 0;
  const sweep = ccw ? 0 : 1; // SVG sweep-flag: 1 = CW, 0 = CCW

  const sxp = obj.cx + Math.cos(a1) * obj.r;
  const syp = obj.cy + Math.sin(a1) * obj.r;
  const exp = obj.cx + Math.cos(a2) * obj.r;
  const eyp = obj.cy + Math.sin(a2) * obj.r;

  currentLayer += `<path d="M ${sxp} ${syp} A ${obj.r} ${obj.r} 0 ${largeArc} ${sweep} ${exp} ${eyp}" fill="none" stroke="${obj.color}" stroke-width="${obj.size}" stroke-linecap="round" />`;
  continue;
}
    }
    const inkMarkup = pastLayer + currentLayer;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
 <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}
  </defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>
  <g transform="${cam}">
    ${bgMarkup}
    ${inkMarkup}
  </g>
 </svg>`;

    const blob = new Blob([svg], { type: "image/svg+xml" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.svg`;
    a.href = url;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  // ---------- Export PNG (composite) ----------
  exportSvgBtn?.addEventListener("click", () => {
    exportSVG();
  });

  exportBtn.addEventListener("click", async () => {
    const scale = dpr();
    const out = document.createElement("canvas");
    out.width = Math.floor(state.viewW * scale);
    out.height = Math.floor(state.viewH * scale);
    const octx = out.getContext("2d");
    octx.setTransform(scale, 0, 0, scale, 0, 0);

    if (state.bg.src && state.bg.natW && state.bg.natH) {
      const img = new Image();
      img.src = state.bg.src;
      await new Promise((res) => {
        img.onload = () => res();
        img.onerror = () => res();
      });

      octx.save();
      octx.translate(state.panX, state.panY);
      octx.scale(state.zoom, state.zoom);

      const natW = state.bg.natW;
      const natH = state.bg.natH;
      const cx = natW / 2;
      const cy = natH / 2;

      octx.translate(state.bg.x, state.bg.y);
      octx.translate(cx, cy);
      octx.rotate(state.bg.rot);
      octx.scale(state.bg.scale, state.bg.scale);
      octx.translate(-cx, -cy);

      octx.drawImage(img, 0, 0);
      octx.restore();
    }

    octx.drawImage(inkCanvas, 0, 0, state.viewW, state.viewH);
    octx.drawImage(uiCanvas, 0, 0, state.viewW, state.viewH);

    const a = document.createElement("a");
    a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
  });

  // ---------- Init + resize ----------
  function init() {
    setColor(colorInput.value);
    setBrushSize(brushSize.value);
    setActiveTool("pen");

    applyBgTransform();
    updateSwatch();
    updateScaleOut();

    resizeAll();

    // ✅ start zoomed right out
    requestAnimationFrame(() => {
      resizeAll(); // ensure viewW/viewH are correct
      state.zoom = 0.25; // pick how far out you want (0.25 = 25%)
      state.panX = state.viewW / 2;
      state.panY = state.viewH / 2;
      redrawAll();
    });
  }

  const ro = new ResizeObserver(() => resizeAll());
  ro.observe(stage);
  init();
})();
