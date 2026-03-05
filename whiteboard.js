/* ==========================================================
   whiteboard.js — refactor (drop-in replacement)

   GOALS (your request):
   ✅ Add “always prefer endpoints/intersections” (even when not holding Ctrl)
   ✅ Keep EVERY existing feature you listed (tools, snapping rules, SVG import/export,
      bg transforms, handles, boards, scale calibration, undo/redo, tips, len box, etc.)
   ✅ Improve structure + eliminate redundancy
   ✅ Reduce expensive snap recomputation (cache endpoints/segments while drawing)

   ADDITION (Option B you chose):
   ✅ NEW TOOL: Polygon Fill (polyFill)
      - Click to place vertices (snaps to endpoints/intersections first, else mm grid)
      - Ctrl/Cmd temporarily BYPASSES snapping (free placement)
      - Enter or Double-Click to close & commit fill
      - Backspace removes last point, Esc cancels
      - Exports to SVG as <polygon> (already supported)
      - Imports SVG polygons with fill as polyFill (added)

   KEY BEHAVIOUR (unchanged, just cleaned):
   - LINE/ARROW default: snap to whole-mm LENGTH (direction preserved)
   - LINE/ARROW with Ctrl/Cmd: prefer endpoints/intersections; else angle-snap + whole-mm LENGTH
   - RECT/CIRCLE/ARC points: prefer endpoints/intersections; else (Ctrl) angle-snap + mm GRID; else mm GRID
   - Start point for shapes: prefer endpoints/intersections; else mm GRID
   - Shift circle: perfect circle
   - Select tool: move/scale/rotate handles + shift-rotate 15°
   - Bg tools act on selection if selected, else background
   - Arc: 2-stage (pick center, then drag), CW/CCW accumulate, full circle snap, live tip
   - Type-to-set: line length while dragging; arc radius while dragging
   - SVG import: restores background image if present; step reveal with . and ,
   - SVG export: includes bg image, eraser masks, arcs with direction; full circle -> <circle>
   - Boards: save/load/new + delete single/all
   - Scale calibration: set pxPerMm from a line

   NOTE:
   - This file assumes the same DOM IDs/classes as your current app.
   - CapsLock is NOT used as a dependency; Ctrl/Cmd is detected normally.
   ========================================================= */

(() => {
  /* =========================
     DOM
  ========================= */
  const stage = document.getElementById("stage");

  const bgLayer = document.getElementById("bgLayer");
  const bgImg = document.getElementById("bgImg");

  // Cache raster fill canvases by object id (not saved; rebuilt on demand)
  const fillBitmapCache = new Map(); // id -> {src, bitmap, ready}

  const inkCanvas = document.getElementById("inkCanvas");
  const uiCanvas = document.getElementById("uiCanvas");
  const inkCtx = inkCanvas.getContext("2d");
  const uiCtx = uiCanvas.getContext("2d");

  const toast = document.getElementById("toast");

  const dockBtns = Array.from(document.querySelectorAll(".dockBtn[data-tool]"));
  const clearBtn = document.getElementById("clearBtn");

  const colorBtn = document.getElementById("colorBtn");
  const colorPop = document.getElementById("colorPop");
  const colorInput = document.getElementById("colorInput");
  const brushSize = document.getElementById("brushSize");
  const brushOut = document.getElementById("brushOut");
  const swatchLive = document.getElementById("swatchLive");

  const opacityRange = document.getElementById("opacityRange");
  const opacityOut = document.getElementById("opacityOut");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");

  const titleInput = document.getElementById("titleInput");
  const applyTitleBtn = document.getElementById("applyTitleBtn");

  const bgFile = document.getElementById("bgFile");
  const clearBgBtn = document.getElementById("clearBgBtn");

  const svgInkFile = document.getElementById("svgInkFile");
  const clearSvgInkBtn = document.getElementById("clearSvgInkBtn");

  const boardSelect = document.getElementById("boardSelect");
  const newBoardBtn = document.getElementById("newBoardBtn");
  const saveBoardBtn = document.getElementById("saveBoardBtn");
  const loadBoardBtn = document.getElementById("loadBoardBtn");

  const exportBtn = document.getElementById("exportBtn");
  const exportSvgBtn = document.getElementById("exportSvgBtn");

  const scaleOut = document.getElementById("scaleOut");
  const setScaleBtn = document.getElementById("setScaleBtn");
  const resetScaleBtn = document.getElementById("resetScaleBtn");

  const deleteBoardBtn = document.getElementById("deleteBoardBtn");
  const deleteAllBoardsBtn = document.getElementById("deleteAllBoardsBtn");

  /* =========================
     UI overlays: Measure tip + floating len box
  ========================= */
  const measureTip = document.createElement("div");
  measureTip.id = "measureTip";
  Object.assign(measureTip.style, {
    position: "absolute",
    zIndex: "50",
    pointerEvents: "none",
    padding: "4px 8px",
    borderRadius: "10px",
    background: "rgba(0,0,0,0.72)",
    color: "#fff",
    font: "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif",
    boxShadow: "0 8px 20px rgba(0,0,0,0.22)",
    transform: "translate(10px, 10px)",
    display: "none"
  });
  stage.appendChild(measureTip);

  const lenBox = document.createElement("div");
  lenBox.id = "lenBox";
  Object.assign(lenBox.style, {
    position: "absolute",
    zIndex: "60",
    pointerEvents: "auto",
    display: "none",
    padding: "6px 8px",
    borderRadius: "12px",
    background: "rgba(0,0,0,0.78)",
    color: "#fff",
    boxShadow: "0 10px 26px rgba(0,0,0,0.25)",
    transform: "translate(12px, 12px)",
    font: "12px/1.2 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif"
  });

  const lenInput = document.createElement("input");
  lenInput.type = "text";
  lenInput.inputMode = "decimal";
  lenInput.autocomplete = "off";
  lenInput.placeholder = "mm";
  Object.assign(lenInput.style, {
    width: "92px",
    border: "0",
    outline: "0",
    borderRadius: "10px",
    padding: "6px 8px",
    background: "rgba(255,255,255,0.12)",
    color: "#fff"
  });

  const lenSuffix = document.createElement("span");
  lenSuffix.textContent = "  mm";
  Object.assign(lenSuffix.style, { opacity: "0.9", marginLeft: "6px" });

  lenBox.appendChild(lenInput);
  lenBox.appendChild(lenSuffix);
  stage.appendChild(lenBox);

  const lenEntry = { open: false, seedMm: null };

  /* =========================
     State
  ========================= */
  const DEFAULT_PX_PER_MM = 96 / 25.4;
  const SNAP_RADIUS_PX = 12;

  const state = {
    tool: "pen",
    color: "#111111",
    opacity: 1,
    size: 5,

    pixelRatio: 1,

    zoom: 1,
    panX: 0,
    panY: 0,

    title: "",
    pxPerMm: DEFAULT_PX_PER_MM,

    bg: { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 },

    objects: [],
    undo: [],
    redo: [],
    selectionIndex: -1,

    viewW: 0,
    viewH: 0
  };

  // SVG reveal state (uses stable object ids so reveal still works after deletions)
  let _nextObjId = 1;
  const svgReveal = { active: false, groupId: null, partIds: [], revealed: 0 };

  function ensureObjId(o) {
    if (!o) return null;
    if (!o._id) o._id = `o${_nextObjId++}`;
    return o._id;
  }
  function findObjById(id) {
    if (!id) return null;
    return state.objects.find(o => o && o._id === id) || null;
  }

  // Arc draft (two-stage center pick)
  const arcDraft = { hasCenter: false, cx: 0, cy: 0 };

  // PolyFill draft (Option B)
  const polyDraft = { active: false, pts: [], hover: null };

  // Selection handles cache (screen coords)
  const uiHandles = { visible: false, box: null, rotate: null, corners: null, poly: null, center: null };

  // Gesture state
  const gesture = {
    active: false,
    pointerId: null,
    mode: "none",
    startWorld: null,
    startScreen: null,
    lastWorld: null,
    lastScreen: null,
    activeObj: null,

    selIndex: -1,
    selStartObj: null,
    selAnchor: null,
    selStartAngle: 0,

    bgStart: null,

    arcCenter: null,
    arcR: 0,
    arcA1: 0,
    arcLastA: 0,
    arcAccum: 0,

    // snap caches (rebuilt at pointerdown; avoids heavy recompute every move)
    snapCache: null
  };

  let spacePanning = false;

  /* =========================
     Small utilities
  ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dpr = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const isMac = navigator.platform.toUpperCase().includes("MAC");

  function showToast(msg = "Saved") {
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add("show");
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove("show"), 1200);
  }

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function pxPerMm() {
    const v = Number(state.pxPerMm);
    return isFinite(v) && v > 0 ? v : DEFAULT_PX_PER_MM;
  }

  function mmStepWorld() {
    return pxPerMm();
  }

  function formatMm(mm) {
    if (!isFinite(mm)) return "0 mm";
    const nearInt = Math.abs(mm - Math.round(mm)) < 0.05;
    return (nearInt ? Math.round(mm).toString() : mm.toFixed(1)) + " mm";
  }

  function parseMmInput(v) {
    const s = String(v || "").trim();
    if (!s) return null;
    const n = parseFloat(s.replace(/[^0-9.+-]/g, ""));
    if (!isFinite(n) || n <= 0) return null;
    return Math.max(0.1, n);
  }

  function stageRect() {
    return stage.getBoundingClientRect();
  }
  function canvasRect() {
    return inkCanvas.getBoundingClientRect();
  }
  function clientToScreen(evt) {
    const r = canvasRect();
    return { sx: evt.clientX - r.left, sy: evt.clientY - r.top };
  }
  function screenToWorld(sx, sy) {
    return { x: (sx - state.panX) / state.zoom, y: (sy - state.panY) / state.zoom };
  }
  function worldToScreen(wx, wy) {
    return { x: wx * state.zoom + state.panX, y: wy * state.zoom + state.panY };
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

  function openLenBoxAt(sx, sy, currentMmText) {
    lenEntry.open = true;
    lenEntry.seedMm = parseMmInput(currentMmText) ?? null;

    lenBox.style.left = Math.round(sx + 12) + "px";
    lenBox.style.top = Math.round(sy + 12) + "px";
    lenBox.style.display = "block";

    lenInput.value = "";
    lenInput.placeholder = String(currentMmText || "");
    lenInput.focus({ preventScroll: true });
  }
  function moveLenBoxTo(sx, sy) {
    if (!lenEntry.open) return;
    lenBox.style.left = Math.round(sx + 12) + "px";
    lenBox.style.top = Math.round(sy + 12) + "px";
  }
  function closeLenBox() {
    lenEntry.open = false;
    lenEntry.seedMm = null;
    lenBox.style.display = "none";
    lenInput.value = "";
    lenInput.placeholder = "mm";
  }

  function cancelPolyDraft() {
    polyDraft.active = false;
    polyDraft.pts = [];
    polyDraft.hover = null;
  }

  /* =========================
     Camera + canvas sizing
  ========================= */
  function setZoomTo(newZoom, anchorSX, anchorSY) {
    const z = clamp(newZoom, 0.05, 6);
    const old = state.zoom;

    const worldX = (anchorSX - state.panX) / old;
    const worldY = (anchorSY - state.panY) / old;

    state.zoom = z;
    state.panX = anchorSX - worldX * z;
    state.panY = anchorSY - worldY * z;

    redrawAll();
  }

  function sizeCanvas(canvas, ctx) {
    const r = stageRect();
    state.viewW = Math.floor(r.width);
    state.viewH = Math.floor(r.height);

    const scale = dpr();
    state.pixelRatio = scale;

    canvas.width = Math.max(1, Math.floor(state.viewW * scale));
    canvas.height = Math.max(1, Math.floor(state.viewH * scale));

    ctx.setTransform(scale, 0, 0, scale, 0, 0);
  }

  function resizeAll() {
    sizeCanvas(inkCanvas, inkCtx);
    sizeCanvas(uiCanvas, uiCtx);
    applyBgTransform();
    redrawAll();
  }

  /* =========================
     Undo / redo
  ========================= */
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
    if (titleInput) titleInput.value = state.title;

    state.pxPerMm = Number(snap.pxPerMm || state.pxPerMm || DEFAULT_PX_PER_MM);
    updateScaleOut();

    state.bg = { ...(snap.bg || { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 }) };

    state.objects = Array.isArray(snap.objects) ? deepClone(snap.objects) : [];
    state.selectionIndex = -1;

    if (state.bg && state.bg.src) bgImg.src = state.bg.src;
    else bgImg.removeAttribute("src");

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

  /* =========================
     Background transform
  ========================= */
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

  /* =========================
     Rendering
  ========================= */
  function clearCtx(ctx, canvas) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
  function applyWorldTransform(ctx) {
    const pr = state.pixelRatio || 1;
    ctx.setTransform(pr, 0, 0, pr, 0, 0);
    ctx.translate(state.panX, state.panY);
    ctx.scale(state.zoom, state.zoom);
  }

  // text measuring context
  const measureCtx = document.createElement("canvas").getContext("2d");
  function textMetrics(obj) {
    const fontSize = obj.fontSize || 20;
    measureCtx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    const text = obj.text || "";
    const w = measureCtx.measureText(text).width;
    const h = fontSize * 1.25;
    return { w, h, fontSize };
  }

  function drawInkObject(obj) {
    inkCtx.save();
    inkCtx.globalAlpha = (obj.opacity ?? 1);
    applyWorldTransform(inkCtx);
    inkCtx.lineCap = "round";
    inkCtx.lineJoin = "round";

    if (obj.kind === "polyFill") {
      inkCtx.globalCompositeOperation = "source-over";
      inkCtx.globalAlpha = (obj.opacity ?? 1);
      applyWorldTransform(inkCtx);

      const pts = obj.pts || [];
      if (pts.length >= 3) {
        inkCtx.beginPath();
        inkCtx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) inkCtx.lineTo(pts[i].x, pts[i].y);
        inkCtx.closePath();
        inkCtx.fillStyle = obj.fill || obj.color || "#000";
        inkCtx.fill();
      }

      inkCtx.restore();
      return;
    }

    if (obj.kind === "fillBitmap") {
      inkCtx.globalCompositeOperation = "source-over";
      inkCtx.globalAlpha = (obj.opacity ?? 1);
      applyWorldTransform(inkCtx);

      const id = ensureObjId(obj);
      const src = obj.src || "";
      if (!src) {
        inkCtx.restore();
        return;
      }

      let entry = fillBitmapCache.get(id);
      if (!entry || entry.src !== src) {
        entry = { src, bitmap: null, ready: false };
        fillBitmapCache.set(id, entry);

        (async () => {
          try {
            const blob = await (await fetch(src)).blob();
            const bmp = await createImageBitmap(blob);
            entry.bitmap = bmp;
            entry.ready = true;
            redrawAll();
          } catch {
            entry.ready = false;
          }
        })();
      }

      if (entry.ready && entry.bitmap) {
        const ppw = obj.ppw || 1; // pixels per world unit
        const wWorld = (obj.w || 1) / ppw;
        const hWorld = (obj.h || 1) / ppw;
        inkCtx.drawImage(entry.bitmap, obj.x, obj.y, wWorld, hWorld);
      }

      inkCtx.restore();
      return;
    }

    if (obj.kind === "stroke" || obj.kind === "erase") {
      inkCtx.globalCompositeOperation = obj.kind === "erase" ? "destination-out" : "source-over";
      inkCtx.strokeStyle = obj.kind === "erase" ? "rgba(0,0,0,1)" : obj.color;
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
      const cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2;
      const rw = Math.abs(w),
        rh = Math.abs(h);
      const ang = obj.rot || 0;

      inkCtx.save();
      inkCtx.translate(cx, cy);
      if (ang) inkCtx.rotate(ang);

      if (obj.filled) {
        inkCtx.fillStyle = obj.fillColor || obj.color;
        inkCtx.fillRect(-rw / 2, -rh / 2, rw, rh);
      }

      inkCtx.strokeRect(-rw / 2, -rh / 2, rw, rh);
      inkCtx.restore();
    } else if (obj.kind === "circle") {
      const cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2;
      const rx = Math.abs(w) / 2,
        ry = Math.abs(h) / 2;
      const ang = obj.rot || 0;

      inkCtx.save();
      inkCtx.translate(cx, cy);

      inkCtx.beginPath();
      inkCtx.ellipse(0, 0, rx, ry, ang, 0, Math.PI * 2);

      if (obj.filled) {
        inkCtx.fillStyle = obj.fillColor || obj.color;
        inkCtx.fill();
      }

      inkCtx.stroke();
      inkCtx.restore();
    } else if (obj.kind === "arc") {
      const { cx, cy, r, a1, a2 } = obj;
      inkCtx.beginPath();
      inkCtx.arc(cx, cy, Math.max(0.5, r || 0), a1 || 0, a2 || 0, !!obj.ccw);
      inkCtx.stroke();
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

  function drawInk() {
    clearCtx(inkCtx, inkCanvas);
    for (const obj of state.objects) {
      if (obj && !obj.hidden) drawInkObject(obj);
    }
  }

  /* =========================
     Geometry: bounds, hit-tests, transforms
  ========================= */
  function rotateAround(x, y, cx, cy, ang) {
    const dx = x - cx,
      dy = y - cy;
    const c = Math.cos(ang),
      s = Math.sin(ang);
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  function arcDelta(a1, a2) {
    const TWO_PI = Math.PI * 2;
    let d = (a2 - a1) % TWO_PI;
    if (d < 0) d += TWO_PI;
    return d;
  }

  function pointOnArc(obj, which) {
    const a = which === "start" ? obj.a1 : obj.a2;
    return { x: obj.cx + Math.cos(a) * obj.r, y: obj.cy + Math.sin(a) * obj.r };
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
      { x: cx - w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy - h / 2 },
      { x: cx + w / 2, y: cy + h / 2 },
      { x: cx - w / 2, y: cy + h / 2 }
    ].map(p => (ang ? rotateAround(p.x, p.y, cx, cy, ang) : p));

    return [
      { x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y },
      { x1: pts[1].x, y1: pts[1].y, x2: pts[2].x, y2: pts[2].y },
      { x1: pts[2].x, y1: pts[2].y, x2: pts[3].x, y2: pts[3].y },
      { x1: pts[3].x, y1: pts[3].y, x2: pts[0].x, y2: pts[0].y }
    ];
  }

  function polyBounds(pts) {
    if (!pts || !pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
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
    return { minX, minY, maxX, maxY };
  }

  function pointInPoly(px, py, pts) {
    if (!pts || pts.length < 3) return false;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x,
        yi = pts[i].y;
      const xj = pts[j].x,
        yj = pts[j].y;
      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function objectBounds(obj) {
    if (obj.kind === "polyFill") {
      const b = polyBounds(obj.pts || []);
      const pad = 4;
      return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
    }

    if (obj.kind === "text") {
      const m = textMetrics(obj);
      const w = m.w,
        h = m.h;
      const cx = obj.x + w / 2,
        cy = obj.y + h / 2;
      const ang = obj.rot || 0;

      const corners = [
        { x: -w / 2, y: -h / 2 },
        { x: w / 2, y: -h / 2 },
        { x: w / 2, y: h / 2 },
        { x: -w / 2, y: h / 2 }
      ].map(p => ({
        x: cx + p.x * Math.cos(ang) - p.y * Math.sin(ang),
        y: cy + p.x * Math.sin(ang) + p.y * Math.cos(ang)
      }));

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
      const cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2;
      const rw = Math.abs(x2 - x1),
        rh = Math.abs(y2 - y1);
      const ang = obj.rot || 0;

      const corners = [
        { x: -rw / 2, y: -rh / 2 },
        { x: rw / 2, y: -rh / 2 },
        { x: rw / 2, y: rh / 2 },
        { x: -rw / 2, y: rh / 2 }
      ].map(p => ({
        x: cx + p.x * Math.cos(ang) - p.y * Math.sin(ang),
        y: cy + p.x * Math.sin(ang) + p.y * Math.cos(ang)
      }));

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
      const cx = (x1 + x2) / 2,
        cy = (y1 + y2) / 2;
      const rx = Math.abs(x2 - x1) / 2,
        ry = Math.abs(y2 - y1) / 2;
      const ang = obj.rot || 0;

      let minX = Infinity,
        minY = Infinity,
        maxX = -Infinity,
        maxY = -Infinity;
      const cosA = Math.cos(ang),
        sinA = Math.sin(ang);
      for (let i = 0; i < 16; i++) {
        const t = (i / 16) * Math.PI * 2;
        const ex = Math.cos(t) * rx,
          ey = Math.sin(t) * ry;
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
      const pts = [];
      const d = arcDelta(obj.a1, obj.a2);
      const steps = Math.max(6, Math.min(48, Math.ceil(48 * (d / (Math.PI * 2)))));
      for (let i = 0; i <= steps; i++) {
        const t = obj.a1 + d * (i / steps);
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

    // line/arrow fallback
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

  function isAngleOnArc(a, a1, a2) {
    const TWO_PI = Math.PI * 2;
    const norm = v => ((v % TWO_PI) + TWO_PI) % TWO_PI;
    const aa = norm(a),
      s = norm(a1),
      e = norm(a2);
    if (s <= e) return aa >= s && aa <= e;
    return aa >= s || aa <= e;
  }

  function hitObject(obj, wx, wy) {
    const tol = Math.max(8, (obj.size || 4) * 1.5);

    if (obj.kind === "polyFill") {
      return pointInPoly(wx, wy, obj.pts || []);
    }

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
      const cx = (obj.x1 + obj.x2) / 2,
        cy = (obj.y1 + obj.y2) / 2;
      const rw = Math.abs(obj.x2 - obj.x1),
        rh = Math.abs(obj.y2 - obj.y1);
      const ang = obj.rot || 0;
      const cos = Math.cos(-ang),
        sin = Math.sin(-ang);
      const lx = (wx - cx) * cos - (wy - cy) * sin;
      const ly = (wx - cx) * sin + (wy - cy) * cos;
      return Math.abs(lx) <= rw / 2 && Math.abs(ly) <= rh / 2;
    }

    if (obj.kind === "circle") {
      const cx = (obj.x1 + obj.x2) / 2,
        cy = (obj.y1 + obj.y2) / 2;
      const rx = Math.abs(obj.x2 - obj.x1) / 2,
        ry = Math.abs(obj.y2 - obj.y1) / 2;
      if (rx < 1 || ry < 1) return false;
      const ang = obj.rot || 0;
      const cos = Math.cos(-ang),
        sin = Math.sin(-ang);
      const lx = (wx - cx) * cos - (wy - cy) * sin;
      const ly = (wx - cx) * sin + (wy - cy) * cos;
      const nx = lx / rx,
        ny = ly / ry;
      return nx * nx + ny * ny <= 1.2;
    }

    if (obj.kind === "arc") {
      const dx = wx - obj.cx,
        dy = wy - obj.cy;
      const dist = Math.hypot(dx, dy);
      if (Math.abs(dist - obj.r) > tol) return false;
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
    if (obj.kind === "polyFill") {
      (obj.pts || []).forEach(p => {
        p.x += dx;
        p.y += dy;
      });
      return;
    }
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
      (obj.points || []).forEach(p => {
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

  function rotatePoint(px, py, cx, cy, angle) {
    const dx = px - cx,
      dy = py - cy;
    const cos = Math.cos(angle),
      sin = Math.sin(angle);
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  function rotateObject(obj, angle) {
    const b = objectBounds(obj);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;

    if (obj.kind === "polyFill") {
      (obj.pts || []).forEach(p => {
        const r = rotatePoint(p.x, p.y, cx, cy, angle);
        p.x = r.x;
        p.y = r.y;
      });
      return;
    }

    if (obj.kind === "text" || obj.kind === "rect" || obj.kind === "circle") {
      obj.rot = (obj.rot || 0) + angle;
      return;
    }
    if (obj.kind === "arc") {
      obj.a1 = (obj.a1 || 0) + angle;
      obj.a2 = (obj.a2 || 0) + angle;
      return;
    }
    if (obj.kind === "stroke" || obj.kind === "erase") {
      (obj.points || []).forEach(p => {
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

  function scaleObjectXY(obj, fx, fy, ax, ay) {
    fx = clamp(isFinite(fx) ? fx : 1, -20, 20);
    fy = clamp(isFinite(fy) ? fy : 1, -20, 20);

    if (obj.kind === "polyFill") {
      (obj.pts || []).forEach(p => {
        p.x = ax + (p.x - ax) * fx;
        p.y = ay + (p.y - ay) * fy;
      });
      return;
    }

    if (obj.kind === "text") {
      obj.x = ax + (obj.x - ax) * fx;
      obj.y = ay + (obj.y - ay) * fy;
      const uni = Math.max(0.2, (Math.abs(fx) + Math.abs(fy)) / 2);
      obj.fontSize = Math.max(6, obj.fontSize * uni);
      return;
    }
    if (obj.kind === "stroke" || obj.kind === "erase") {
      (obj.points || []).forEach(p => {
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

  /* =========================
     Snapping (refactored, cached)
  ========================= */
  function snapToMmGridWorld(pt) {
    const step = mmStepWorld();
    return { x: Math.round(pt.x / step) * step, y: Math.round(pt.y / step) * step };
  }

  function snapToWholeMmLength(start, rawPt) {
    const dx = rawPt.x - start.x;
    const dy = rawPt.y - start.y;
    const lenPx = Math.hypot(dx, dy);
    if (!isFinite(lenPx) || lenPx < 1e-6) return { x: rawPt.x, y: rawPt.y };

    const mm = lenPx / pxPerMm();
    const mmInt = Math.max(1, Math.round(mm));
    const newLenPx = mmInt * pxPerMm();

    const ux = dx / lenPx,
      uy = dy / lenPx;
    return { x: start.x + ux * newLenPx, y: start.y + uy * newLenPx };
  }

  function snapAngleRad(angleRad) {
    const snapsDeg = [0, 30, 45, 60, 90, 120, 135, 150, -30, -45, -60, -90, -120, -135, -150, 180];
    const snaps = snapsDeg.map(d => (d * Math.PI) / 180);
    const a = Math.atan2(Math.sin(angleRad), Math.cos(angleRad));
    let best = snaps[0],
      bestDiff = Infinity;
    for (const s of snaps) {
      const diff = Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s)));
      if (diff < bestDiff) {
        bestDiff = diff;
        best = s;
      }
    }
    return best;
  }

  function snapEndpointToAngles(x1, y1, x2, y2) {
    const dx = x2 - x1,
      dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    if (len < 1e-6) return { x2, y2 };
    const ang = Math.atan2(dy, dx);
    const snapped = snapAngleRad(ang);
    return { x2: x1 + Math.cos(snapped) * len, y2: y1 + Math.sin(snapped) * len };
  }



  // Intersection helpers
  function segIntersection(a, b) {
    const x1 = a.x1,
      y1 = a.y1,
      x2 = a.x2,
      y2 = a.y2;
    const x3 = b.x1,
      y3 = b.y1,
      x4 = b.x2,
      y4 = b.y2;
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-12) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }

  function buildSnapCache() {
    const endpoints = [];
    const segs = [];

    // Collect endpoints + segments once at pointerdown
    for (const obj of state.objects) {
      if (!obj || obj.hidden) continue;

      if (obj.kind === "polyFill") {
        const pts = obj.pts || [];
        for (const p of pts) endpoints.push({ x: p.x, y: p.y });
        for (let i = 1; i < pts.length; i++) segs.push({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y });
        if (pts.length >= 3) segs.push({ x1: pts[pts.length - 1].x, y1: pts[pts.length - 1].y, x2: pts[0].x, y2: pts[0].y });
        continue;
      }

      if (obj.kind === "line" || obj.kind === "arrow") {
        endpoints.push({ x: obj.x1, y: obj.y1 }, { x: obj.x2, y: obj.y2 });
        segs.push({ x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 });
        continue;
      }

      if (obj.kind === "arc") {
        const s = pointOnArc(obj, "start");
        const e = pointOnArc(obj, "end");
        endpoints.push(s, e);

        const d = arcDelta(obj.a1, obj.a2);
        const steps = Math.max(6, Math.min(36, Math.ceil(36 * (d / (Math.PI * 2)))));
        let prev = { x: obj.cx + Math.cos(obj.a1) * obj.r, y: obj.cy + Math.sin(obj.a1) * obj.r };
        for (let i = 1; i <= steps; i++) {
          const t = obj.a1 + d * (i / steps);
          const cur = { x: obj.cx + Math.cos(t) * obj.r, y: obj.cy + Math.sin(t) * obj.r };
          segs.push({ x1: prev.x, y1: prev.y, x2: cur.x, y2: cur.y });
          prev = cur;
          if (segs.length > 240) break;
        }
        continue;
      }

      if (obj.kind === "rect") {
        const edges = rectEdges(obj);
        for (const e of edges) {
          endpoints.push({ x: e.x1, y: e.y1 });
          segs.push(e);
          if (segs.length > 240) break;
        }
        continue;
      }

      if (obj.kind === "stroke" || obj.kind === "erase") {
        const pts = obj.points || [];
        if (pts.length) endpoints.push({ x: pts[0].x, y: pts[0].y }, { x: pts[pts.length - 1].x, y: pts[pts.length - 1].y });

        const stride = Math.max(1, Math.floor(pts.length / 60));
        for (let i = stride; i < pts.length; i += stride) {
          const p0 = pts[i - stride],
            p1 = pts[i];
          if (p0 && p1) segs.push({ x1: p0.x, y1: p0.y, x2: p1.x, y2: p1.y });
          if (segs.length > 240) break;
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
        ].map(p => (ang ? rotateAround(p.x, p.y, cx, cy, ang) : p));
        endpoints.push(...corners);
        continue;
      }
    }

    // Intersections (bounded)
    const intersections = [];
    let pairs = 0;
    const maxPairs = 6000;
    for (let i = 0; i < segs.length; i++) {
      for (let j = i + 1; j < segs.length; j++) {
        if (++pairs > maxPairs) break;
        const p = segIntersection(segs[i], segs[j]);
        if (p) intersections.push(p);
      }
      if (pairs > maxPairs) break;
    }

    return { endpoints, intersections };
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

  function snapPointPreferEndsIntersections(pt) {
    const radiusWorld = SNAP_RADIUS_PX / (state.zoom || 1);
    const cache = gesture.snapCache || { endpoints: [], intersections: [] };

    const hit1 = snapToNearest(pt, cache.endpoints, radiusWorld);
    const hit2 = snapToNearest(pt, cache.intersections, radiusWorld);

    if (!hit1) return hit2;
    if (!hit2) return hit1;

    const d1 = Math.hypot(pt.x - hit1.x, pt.y - hit1.y);
    const d2 = Math.hypot(pt.x - hit2.x, pt.y - hit2.y);
    return d2 < d1 ? hit2 : hit1;
  }

  // SNAP INVERSION (per your request):
  // - Snapping is ON by default (endpoints/intersections, angle snaps incl. 45°/60°, mm grid / whole-mm length).
  // - Holding Ctrl/Cmd temporarily BYPASSES snapping (free placement).
  //
  // Shape point snap (rect/circle/arc point): prefer ends/intersections; else angle+grid.
  function snapShapePoint(start, rawPt, bypassSnap) {
    if (bypassSnap) return { x: rawPt.x, y: rawPt.y };

    const hit = snapPointPreferEndsIntersections(rawPt);
    if (hit) return hit;

    const s = snapEndpointToAngles(start.x, start.y, rawPt.x, rawPt.y);
    return snapToMmGridWorld({ x: s.x2, y: s.y2 });
  }

  // Line/arrow point snap: prefer ends/intersections; else angle+whole-mm length.
  function snapLinePoint(start, rawPt, bypassSnap) {
    if (bypassSnap) return { x: rawPt.x, y: rawPt.y };

    const hit = snapPointPreferEndsIntersections(rawPt);
    if (hit) return hit;

    const s = snapEndpointToAngles(start.x, start.y, rawPt.x, rawPt.y);
    return snapToWholeMmLength(start, { x: s.x2, y: s.y2 });
  }

  // PolyFill point snap: prefer ends/intersections; else mm grid (no angle snap)
  function snapPolyPoint(rawPt, bypassSnap) {
    if (bypassSnap) return { x: rawPt.x, y: rawPt.y };
    const hit = snapPointPreferEndsIntersections(rawPt);
    if (hit) return hit;
    return snapToMmGridWorld(rawPt);
  }

  /* =========================
     Tools / UI state
  ========================= */
  function updateSwatch() {
    if (swatchLive) swatchLive.style.background = state.color;
  }
  function setColor(hex) {
    state.color = hex;
    if (colorInput) colorInput.value = hex;
    updateSwatch();
    updateScaleOut();
  }
  function setBrushSize(n) {
    state.size = Number(n);
    if (brushSize) brushSize.value = String(state.size);
    if (brushOut) brushOut.textContent = String(state.size);
  }
  function updateScaleOut() {
    if (!scaleOut) return;
    scaleOut.textContent = `1 mm = ${pxPerMm().toFixed(3)} px`;
  }

  function updateCursorFromTool() {
    const t = state.tool;
    if (["pen", "line", "rect", "circle", "arc", "arrow", "polyFill"].includes(t)) {
      inkCanvas.style.cursor = "crosshair";
      return;
    }
    if (t === "eraser") {
      inkCanvas.style.cursor = "cell";
      return;
    }
    if (t === "text") {
      inkCanvas.style.cursor = "text";
      return;
    }
    if (t === "select") {
      inkCanvas.style.cursor = "default";
      return;
    }
    if (t === "bgMove") {
      inkCanvas.style.cursor = "grab";
      return;
    }
    if (t === "bgScale") {
      inkCanvas.style.cursor = "nwse-resize";
      return;
    }
    if (t === "bgRotate") {
      inkCanvas.style.cursor = "alias";
      return;
    }
   
    inkCanvas.style.cursor = "default";
  }

  function setActiveTool(tool) {
    hideMeasureTip();
    state.tool = tool;
    dockBtns.forEach(b => b.classList.toggle("is-active", b.dataset.tool === tool));
    updateCursorFromTool();
    if (tool !== "arc") arcDraft.hasCenter = false;
    if (tool !== "polyFill") cancelPolyDraft();
  }

  function hardResetGesture() {
    gesture.active = false;
    gesture.pointerId = null;
    gesture.mode = "none";
    gesture.startWorld = null;
    gesture.startScreen = null;
    gesture.lastWorld = null;
    gesture.lastScreen = null;
    gesture.activeObj = null;

    gesture.selIndex = -1;
    gesture.selStartObj = null;
    gesture.selAnchor = null;
    gesture.selStartAngle = 0;

    gesture.bgStart = null;

    gesture.arcCenter = null;
    gesture.arcR = 0;
    gesture.arcA1 = 0;
    gesture.arcLastA = 0;
    gesture.arcAccum = 0;

    gesture.snapCache = null;

    hideMeasureTip();
    closeLenBox();
  }

  /* =========================
     Selection handles + UI
  ========================= */
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
    const hasOwnRot = (obj.kind === "rect" || obj.kind === "circle" || obj.kind === "text") && (obj.rot || 0);

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
      ].map(p => ({
        x: cx + p.x * Math.cos(ang) - p.y * Math.sin(ang),
        y: cy + p.x * Math.sin(ang) + p.y * Math.cos(ang)
      }));
      const cornersS = cornersW.map(p => worldToScreen(p.x, p.y));

      const topMid = { x: (cornersS[0].x + cornersS[1].x) / 2, y: (cornersS[0].y + cornersS[1].y) / 2 };
      const edge = { x: cornersS[1].x - cornersS[0].x, y: cornersS[1].y - cornersS[0].y };
      const elen = Math.hypot(edge.x, edge.y) || 1;
      const nx = -(edge.y / elen),
        ny = edge.x / elen;
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
      uiHandles.center = { x: (cornersS[0].x + cornersS[2].x) / 2, y: (cornersS[0].y + cornersS[2].y) / 2 };
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

    // --- PolyFill preview (screen-space) ---
    if (state.tool === "polyFill" && polyDraft.active && polyDraft.pts.length) {
      uiCtx.save();
      uiCtx.setTransform(pr, 0, 0, pr, 0, 0);

      const pts = polyDraft.pts.map(p => worldToScreen(p.x, p.y));
      const hover = polyDraft.hover ? worldToScreen(polyDraft.hover.x, polyDraft.hover.y) : null;

      uiCtx.lineWidth = 2;
      uiCtx.setLineDash([6, 4]);
      uiCtx.strokeStyle = "rgba(0,0,0,0.55)";

      uiCtx.beginPath();
      uiCtx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) uiCtx.lineTo(pts[i].x, pts[i].y);
      if (hover) uiCtx.lineTo(hover.x, hover.y);
      uiCtx.stroke();
      uiCtx.setLineDash([]);

      // point markers
      for (const p of pts) {
        uiCtx.fillStyle = "rgba(255,255,255,0.95)";
        uiCtx.strokeStyle = "rgba(0,0,0,0.55)";
        uiCtx.beginPath();
        uiCtx.arc(p.x, p.y, 5, 0, Math.PI * 2);
        uiCtx.fill();
        uiCtx.stroke();
      }

      uiCtx.restore();
    }

    computeHandles();
    if (!uiHandles.visible) return;

    uiCtx.save();
    uiCtx.setTransform(pr, 0, 0, pr, 0, 0);
    uiCtx.strokeStyle = "rgba(46, 204, 113, 0.95)";
    uiCtx.lineWidth = 2;
    uiCtx.setLineDash([6, 4]);

    if (!uiHandles.poly) {
      const b = uiHandles.box;
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

    // rotate line
    uiCtx.beginPath();
    if (!uiHandles.poly) {
      const b = uiHandles.box;
      uiCtx.moveTo(b.x + b.w / 2, b.y);
    } else {
      const p = uiHandles.poly;
      uiCtx.moveTo((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
    }
    uiCtx.lineTo(uiHandles.rotate.x, uiHandles.rotate.y);
    uiCtx.stroke();

    // rotate circle
    uiCtx.fillStyle = "rgba(255,255,255,0.95)";
    uiCtx.beginPath();
    uiCtx.arc(uiHandles.rotate.x, uiHandles.rotate.y, uiHandles.rotate.r, 0, Math.PI * 2);
    uiCtx.fill();
    uiCtx.stroke();

    // corners
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
    inkCanvas.style.cursor = h.corner === "nw" || h.corner === "se" ? "nwse-resize" : "nesw-resize";
  }

  /* =========================
     Gesture begin helpers
  ========================= */
  function beginSelectionTransform(kind, w) {
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
    gesture.mode = mode;
    return true;
  }

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
      if (tool === "bgScale") gesture.mode = "selScale";
      if (tool === "bgRotate") {
        gesture.mode = "selRotate";
        gesture.selStartAngle = Math.atan2(w.y - cy, w.x - cx);
      }
      return true;
    }
    return beginBgTransform(tool, w);
  }

  /* =========================
     PolyFill commit
  ========================= */
  function commitPolyFill() {
    const pts = polyDraft.pts || [];
    if (pts.length < 3) {
      showToast("Need 3+ points");
      return false;
    }

    pushUndo();
    clearRedo();

    const obj = {
      kind: "polyFill",
      pts: pts.slice(),
      fill: state.color,
      opacity: clamp(state.opacity ?? 1, 0, 1)
    };
    ensureObjId(obj);

    if (svgReveal.active && svgReveal.groupId) {
      obj.svgGroupId = svgReveal.groupId;
      obj.hidden = true;
      svgReveal.partIds.splice(svgReveal.revealed, 0, obj._id);
    }

    // put behind outlines
    state.objects.unshift(obj);

    cancelPolyDraft();
    redrawAll();
    showToast("Poly filled");
    return true;
  }

  /* =========================
     Pointer handlers
  ========================= */
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
    closeLenBox();

    // Build snap cache once per gesture (performance win)
    gesture.snapCache = buildSnapCache();

    if (spacePanning) {
      gesture.mode = "pan";
      inkCanvas.style.cursor = "grabbing";
      return;
    }

    // PolyFill tool (click-to-add points)
    if (state.tool === "polyFill") {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;

      if (!polyDraft.active) {
        polyDraft.active = true;
        polyDraft.pts = [];
        polyDraft.hover = null;
        showToast("PolyFill: click points, Enter/dblclick to finish");
      }

      const p = snapPolyPoint(w, bypassSnap);

      const last = polyDraft.pts[polyDraft.pts.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.01) {
        polyDraft.pts.push(p);
      }

      try {
        inkCanvas.releasePointerCapture(e.pointerId);
      } catch {}
      gesture.active = false;
      gesture.mode = "none";
      redrawAll();
      return;
    }

    // Bucket tool


    // Text tool
    if (state.tool === "text") {
      gesture.active = false;
      gesture.mode = "none";
      const text = prompt("Enter text:");
      if (!text) return;

      pushUndo();
      clearRedo();
      const obj = {
        kind: "text",
        x: w.x,
        y: w.y,
        text: String(text),
        color: state.color,
        fontSize: Math.max(14, Math.round(state.size * 4)),
        rot: 0
      };
      ensureObjId(obj);
      state.objects.push(obj);
      state.selectionIndex = state.objects.length - 1;
      setActiveTool("select");
      redrawAll();
      return;
    }

    // Select tool
    if (state.tool === "select") {
      const handle = hitHandle(sx, sy);
      if (handle) {
        if (beginSelectionTransform(handle.kind, w)) {
          redrawAll();
          return;
        }
      }

      const hit = findHit(w.x, w.y);
      state.selectionIndex = hit;
      redrawAll();

      if (hit >= 0) beginSelectionTransform("move", w);
      else gesture.mode = "select";
      return;
    }

    // Bg tools (or selection)
    if (state.tool === "bgMove" || state.tool === "bgScale" || state.tool === "bgRotate") {
      beginToolTransformForSelectionOrBg(state.tool, w);
      return;
    }

    // Arc tool (2-stage)
    if (state.tool === "arc") {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;

      if (!arcDraft.hasCenter) {
        const c = snapShapePoint(w, w, bypassSnap);
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

      const start = { x: arcDraft.cx, y: arcDraft.cy };
      const p1 = snapShapePoint(start, w, bypassSnap);

      const cx = arcDraft.cx,
        cy = arcDraft.cy;
      const a1 = Math.atan2(p1.y - cy, p1.x - cx);
      let r = Math.hypot(p1.x - cx, p1.y - cy);
      r = Math.max(1, Math.round(r / pxPerMm()) * pxPerMm());

      const obj = { kind: "arc", color: state.color, size: state.size, opacity: state.opacity, cx, cy, r, a1, a2: a1, ccw: false };
      ensureObjId(obj);
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
      const obj = { kind: "stroke", color: state.color, size: state.size, opacity: state.opacity, points: [w] };
      ensureObjId(obj);
      state.objects.push(obj);
      gesture.activeObj = obj;
      gesture.mode = "drawStroke";
      redrawAll();
      return;
    }

    if (state.tool === "eraser") {
      const obj = { kind: "erase", size: Math.max(10, state.size * 2.2), points: [w] };
      ensureObjId(obj);
      state.objects.push(obj);
      gesture.activeObj = obj;
      gesture.mode = "drawErase";
      redrawAll();
      return;
    }

    if (["line", "rect", "circle", "arrow"].includes(state.tool)) {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;

      // start point: prefer endpoints/intersections; else mm grid
      let p0;
      if (bypassSnap) {
        p0 = { x: w.x, y: w.y };
      } else {
        p0 = snapPointPreferEndsIntersections(w);
        if (!p0) p0 = snapToMmGridWorld(w);
      }

      const fillHeld = e.shiftKey;

      const obj = {
        kind: state.tool,
        color: state.color,
        size: state.size,
        opacity: state.opacity,

        // Shift fills rect/circle
        filled: (state.tool === "rect" || state.tool === "circle") && fillHeld,
        fillColor: state.color,

        x1: p0.x,
        y1: p0.y,
        x2: p0.x,
        y2: p0.y,
        rot: 0
      };
      ensureObjId(obj);
      state.objects.push(obj);
      gesture.activeObj = obj;
      gesture.mode = "drawShape";

      if (obj.kind === "line") showMeasureTip(sx, sy, "0 mm");
      if (obj.kind === "rect") showMeasureTip(sx, sy, "0 × 0 mm");
      if (obj.kind === "circle") showMeasureTip(sx, sy, "Ø 0 mm");

      redrawAll();
      return;
    }

    gesture.mode = "none";
  }

  function setActiveLineLengthMm(mm) {
    if (!gesture.activeObj) return false;
    const obj = gesture.activeObj;
    if (!(obj.kind === "line" || obj.kind === "arrow")) return false;

    const ppm = pxPerMm();
    const lenPx = mm * ppm;

    const x1 = obj.x1,
      y1 = obj.y1;
    let dx = (obj.x2 ?? x1) - x1;
    let dy = (obj.y2 ?? y1) - y1;

    let d = Math.hypot(dx, dy);
    if (!isFinite(d) || d < 1e-6) {
      dx = 1;
      dy = 0;
      d = 1;
    }

    const ux = dx / d,
      uy = dy / d;
    obj.x2 = x1 + ux * lenPx;
    obj.y2 = y1 + uy * lenPx;

    // keep whole-mm LENGTH rule after setting
    const snapped = snapToWholeMmLength({ x: x1, y: y1 }, { x: obj.x2, y: obj.y2 });
    obj.x2 = snapped.x;
    obj.y2 = snapped.y;

    redrawAll();
    return true;
  }

  function setActiveArcRadiusMm(mm) {
    if (!gesture.activeObj) return false;
    const obj = gesture.activeObj;
    if (obj.kind !== "arc") return false;

    const ppm = pxPerMm();
    const rPx = Math.max(0.5, mm * ppm);
    obj.r = rPx;
    gesture.arcR = rPx;
    redrawAll();
    return true;
  }

  function onPointerMove(e) {
    const { sx, sy } = clientToScreen(e);
    updateHoverCursor(sx, sy);
    if (lenEntry.open) moveLenBoxTo(sx, sy);

    const w = screenToWorld(sx, sy);
    gesture.lastScreen = { sx, sy };
    gesture.lastWorld = w;

    // PolyFill hover preview
    if (state.tool === "polyFill" && polyDraft.active) {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;
      polyDraft.hover = snapPolyPoint(w, bypassSnap);
      redrawAll();
    }

    // Arc hover radius tip after center set (before drag)
    if (state.tool === "arc" && arcDraft.hasCenter && !gesture.active) {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;
      const start = { x: arcDraft.cx, y: arcDraft.cy };
      const p = snapShapePoint(start, w, bypassSnap);
      const rMm = Math.hypot(p.x - arcDraft.cx, p.y - arcDraft.cy) / pxPerMm();
      showMeasureTip(sx, sy, `R ${Math.round(rMm)} mm`);
    }

    if (!gesture.active) return;

    // pan
    if (gesture.mode === "pan" && gesture.lastScreen) {
      const ddx = sx - (gesture.lastScreenPrev?.sx ?? gesture.startScreen.sx);
      const ddy = sy - (gesture.lastScreenPrev?.sy ?? gesture.startScreen.sy);
      state.panX += ddx;
      state.panY += ddy;
      gesture.lastScreenPrev = { sx, sy };
      redrawAll();
      return;
    }

    // Selection move/scale/rotate
    if (gesture.mode === "selMove" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.startWorld) {
      const dx = w.x - gesture.startWorld.x;
      const dy = w.y - gesture.startWorld.y;
      state.objects[gesture.selIndex] = deepClone(gesture.selStartObj);
      moveObject(state.objects[gesture.selIndex], dx, dy);
      redrawAll();
      return;
    }

    if (gesture.mode === "selScale" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.selAnchor && gesture.startWorld) {
      const ax = gesture.selAnchor.x,
        ay = gesture.selAnchor.y;
      const start = gesture.startWorld;
      const obj0 = gesture.selStartObj;

      const v0 = { x: start.x - ax, y: start.y - ay };
      const v1 = { x: w.x - ax, y: w.y - ay };

      const fxRaw = Math.abs(v0.x) < 0.001 ? 1 : v1.x / v0.x;
      const fyRaw = Math.abs(v0.y) < 0.001 ? 1 : v1.y / v0.y;

      let fx = fxRaw,
        fy = fyRaw;
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

    if (gesture.mode === "selRotate" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.selAnchor) {
      const ax = gesture.selAnchor.x,
        ay = gesture.selAnchor.y;
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

    // Background transforms
    if ((gesture.mode === "bgMove" || gesture.mode === "bgScale" || gesture.mode === "bgRotate") && gesture.bgStart && gesture.startWorld) {
      const start = gesture.startWorld;
      const bg0 = gesture.bgStart;

      const cx0 = bg0.x + bg0.natW / 2;
      const cy0 = bg0.y + bg0.natH / 2;

      if (gesture.mode === "bgMove") {
        state.bg = { ...bg0 };
        state.bg.x = bg0.x + (w.x - start.x);
        state.bg.y = bg0.y + (w.y - start.y);
        redrawAll();
        return;
      }

      if (gesture.mode === "bgScale") {
        state.bg = { ...bg0 };
        const v0 = { x: start.x - cx0, y: start.y - cy0 };
        const v1 = { x: w.x - cx0, y: w.y - cy0 };
        const l0 = Math.hypot(v0.x, v0.y) || 1;
        const l1 = Math.hypot(v1.x, v1.y) || 1;
        const factor = l1 / l0;
        state.bg.scale = clamp(bg0.scale * factor, 0.05, 10);
        state.bg.x = cx0 - bg0.natW / 2;
        state.bg.y = cy0 - bg0.natH / 2;
        redrawAll();
        return;
      }

      if (gesture.mode === "bgRotate") {
        state.bg = { ...bg0 };
        const a0 = Math.atan2(start.y - cy0, start.x - cx0);
        const a1 = Math.atan2(w.y - cy0, w.x - cx0);
        state.bg.rot = bg0.rot + (a1 - a0);
        redrawAll();
        return;
      }
    }

    // Arc drawing
    if (gesture.mode === "drawArc" && gesture.activeObj && gesture.arcCenter) {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;
      const cx = gesture.arcCenter.cx,
        cy = gesture.arcCenter.cy;
      let p = snapShapePoint({ x: cx, y: cy }, w, bypassSnap);

      let aNow = Math.atan2(p.y - cy, p.x - cx);
      const wrapSigned = a => Math.atan2(Math.sin(a), Math.cos(a));
      const step = wrapSigned(aNow - (gesture.arcLastA ?? aNow));
      gesture.arcAccum = (gesture.arcAccum || 0) + step;
      gesture.arcLastA = aNow;

      const rFixed = Math.max(1, gesture.arcR || 1);
      let a2 = (gesture.arcA1 || 0) + (gesture.arcAccum || 0);

      const TWO_PI = Math.PI * 2;
      const spanAbs = Math.abs(gesture.arcAccum || 0);
      const snapTol = (10 * Math.PI) / 180;
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
      showMeasureTip(sx, sy, isCircle ? `Circle • R ${Math.round(rMm)} mm` : `R ${Math.round(rMm)} mm • L ${Math.round(lenMm)} mm`);
      redrawAll();
      return;
    }

    // Stroke / erase
    if ((gesture.mode === "drawStroke" || gesture.mode === "drawErase") && gesture.activeObj) {
      gesture.activeObj.points.push(w);
      redrawAll();
      return;
    }

    // Shape drawing
    if (gesture.mode === "drawShape" && gesture.activeObj) {
      const k = gesture.activeObj.kind;
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;

      const startPt = { x: gesture.activeObj.x1, y: gesture.activeObj.y1 };
      let p2 = { x: w.x, y: w.y };

      if (k === "line" || k === "arrow") p2 = snapLinePoint(startPt, p2, bypassSnap);
      else if (k === "rect" || k === "circle") p2 = snapShapePoint(startPt, p2, bypassSnap);

      // Alt perfect circle (keep your existing behavior)
      if (k === "circle" && e.altKey) {
        const dx = p2.x - startPt.x;
        const dy = p2.y - startPt.y;
        const sgnX = dx >= 0 ? 1 : -1;
        const sgnY = dy >= 0 ? 1 : -1;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        p2 = snapToMmGridWorld({ x: startPt.x + sgnX * d, y: startPt.y + sgnY * d });
      }

      gesture.activeObj.x2 = p2.x;
      gesture.activeObj.y2 = p2.y;

      if (k === "line") {
        const lenMm = Math.hypot(p2.x - startPt.x, p2.y - startPt.y) / pxPerMm();
        showMeasureTip(sx, sy, formatMm(lenMm));
      }
      if (k === "rect") {
        const wMm = Math.abs(p2.x - startPt.x) / pxPerMm();
        const hMm = Math.abs(p2.y - startPt.y) / pxPerMm();
        showMeasureTip(sx, sy, `${Math.round(wMm)} × ${Math.round(hMm)} mm`);
      }
      if (k === "circle") {
        const wMm = Math.abs(p2.x - startPt.x) / pxPerMm();
        const hMm = Math.abs(p2.y - startPt.y) / pxPerMm();
        if (Math.abs(wMm - hMm) <= 1) showMeasureTip(sx, sy, `Ø ${Math.round((wMm + hMm) / 2)} mm`);
        else showMeasureTip(sx, sy, `${Math.round(wMm)} × ${Math.round(hMm)} mm`);
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
    hardResetGesture();
    updateCursorFromTool();
    redrawAll();
  }

  inkCanvas.addEventListener("pointerdown", onPointerDown);
  inkCanvas.addEventListener("pointermove", onPointerMove);
  inkCanvas.addEventListener("pointerup", onPointerUp);
  inkCanvas.addEventListener("pointercancel", onPointerUp);

  // PolyFill double-click commit
  inkCanvas.addEventListener("dblclick", e => {
    if (state.tool !== "polyFill" || !polyDraft.active) return;
    e.preventDefault();
    commitPolyFill();
  });

  inkCanvas.addEventListener(
    "wheel",
    e => {
      e.preventDefault();
      const { sx, sy } = clientToScreen(e);
      const dir = Math.sign(e.deltaY);
      const step = dir > 0 ? 0.9 : 1.1;
      setZoomTo(state.zoom * step, sx, sy);
    },
    { passive: false }
  );

  /* =========================
     Color popover + settings
  ========================= */
  function toggleColorPop(open) {
    const shouldOpen = open ?? colorPop.classList.contains("is-hidden");
    colorPop.classList.toggle("is-hidden", !shouldOpen);
  }
  colorBtn?.addEventListener("click", e => {
    e.stopPropagation();
    toggleColorPop();
  });
  document.addEventListener("pointerdown", e => {
    if (!colorPop || colorPop.classList.contains("is-hidden")) return;
    const inside = colorPop.contains(e.target) || colorBtn.contains(e.target);
    if (!inside) toggleColorPop(false);
  });
  colorInput?.addEventListener("input", () => setColor(colorInput.value));
  brushSize?.addEventListener("input", () => setBrushSize(brushSize.value));

  opacityRange?.addEventListener("input", () => {
    state.opacity = parseFloat(opacityRange.value);
    if (opacityOut) opacityOut.textContent = Math.round(state.opacity * 100) + "%";
  });

  function openSettings(open) {
    const isOpen = open ?? settingsPanel.classList.contains("is-hidden");
    settingsPanel.classList.toggle("is-hidden", !isOpen);
    settingsBtn?.setAttribute("aria-expanded", String(isOpen));
  }
  settingsBtn?.addEventListener("click", () => openSettings());
  settingsCloseBtn?.addEventListener("click", () => openSettings(false));
  document.addEventListener("pointerdown", e => {
    if (!settingsPanel || settingsPanel.classList.contains("is-hidden")) return;
    const inside = settingsPanel.contains(e.target);
    const onGear = settingsBtn?.contains(e.target);
    if (!inside && !onGear) openSettings(false);
  });

  /* =========================
     Tool buttons + clear/title
  ========================= */
  dockBtns.forEach(b =>
    b.addEventListener("click", () => {
      const t = b.dataset.tool;
      if (t === "arc" && state.tool === "arc") {
        hideMeasureTip();
        arcDraft.hasCenter = false;
        showToast("Click to set arc center");
      }
      setActiveTool(t);
    })
  );

  clearBtn?.addEventListener("click", () => {
    pushUndo();
    clearRedo();
    hardResetGesture();
    cancelPolyDraft();
    state.objects = [];
    state.selectionIndex = -1;
    setActiveTool("pen");
    redrawAll();
  });

  applyTitleBtn?.addEventListener("click", () => {
    pushUndo();
    clearRedo();
    state.title = (titleInput?.value || "").trim();
    redrawAll();
  });

  /* =========================
     Background import + paste
  ========================= */
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

      redrawAll();
      showToast("Background loaded");
    };
    img.onerror = () => showToast("Paste failed");
    img.src = String(dataURL || "");
  }

  bgFile?.addEventListener("change", () => {
    const file = bgFile.files && bgFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setBackgroundFromDataURL(String(reader.result || ""));
    reader.readAsDataURL(file);
    bgFile.value = "";
  });

  clearBgBtn?.addEventListener("click", () => {
    pushUndo();
    clearRedo();
    hardResetGesture();
    state.bg = { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 };
    bgImg.removeAttribute("src");
    redrawAll();
  });

  document.addEventListener("paste", e => {
    try {
      const tag = (document.activeElement && document.activeElement.tagName) || "";
      const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
      if (typing) return;

      const items = e.clipboardData?.items ? Array.from(e.clipboardData.items) : [];
      if (!items.length) return;

      const imgItem = items.find(it => it.type && it.type.startsWith("image/"));
      if (!imgItem) return;

      const file = imgItem.getAsFile();
      if (!file) return;

      e.preventDefault();
      const reader = new FileReader();
      reader.onload = () => setBackgroundFromDataURL(String(reader.result || ""));
      reader.readAsDataURL(file);
    } catch {}
  });

  /* =========================
     Keyboard
  ========================= */
  document.addEventListener("keydown", e => {
    const activeEl = document.activeElement;
    const tag = (activeEl && activeEl.tagName) || "";
    const typing = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && activeEl !== lenInput;
    const mod = isMac ? e.metaKey : e.ctrlKey;

    // PolyFill controls
    if (!typing && state.tool === "polyFill" && polyDraft.active) {
      if (e.key === "Escape") {
        e.preventDefault();
        cancelPolyDraft();
        redrawAll();
        showToast("PolyFill cancelled");
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        polyDraft.pts.pop();
        if (!polyDraft.pts.length) cancelPolyDraft();
        redrawAll();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        commitPolyFill();
        return;
      }
    }

    // Escape
    if (e.key === "Escape") {
      openSettings(false);
      toggleColorPop(false);
      arcDraft.hasCenter = false;
      hideMeasureTip();
      closeLenBox();
      return;
    }

    // Space pan
    if (e.code === "Space") {
      spacePanning = true;
      e.preventDefault();
      return;
    }

    // Toggle fill on selected rect/circle
    if (!typing && (e.key === "f" || e.key === "F")) {
      const idx = state.selectionIndex;
      const obj = idx >= 0 ? state.objects[idx] : null;

      if (obj && (obj.kind === "rect" || obj.kind === "circle")) {
        e.preventDefault();
        pushUndo();
        clearRedo();

        if (e.altKey) {
          obj.filled = false;
        } else if (e.shiftKey) {
          obj.filled = true;
          obj.fillColor = state.color;
        } else {
          obj.filled = !obj.filled;
          if (obj.filled && !obj.fillColor) obj.fillColor = obj.color;
        }

        redrawAll();
        showToast(obj.filled ? "Filled" : "Unfilled");
      }
      return;
    }

    // While dragging ARC: type-to-set radius
    if (!typing && gesture.active && gesture.mode === "drawArc" && gesture.activeObj?.kind === "arc") {
      const isDigit = /^[0-9]$/.test(e.key);
      const isDot = e.key === "." || e.key === ",";
      const isBack = e.key === "Backspace";
      const isEnter = e.key === "Enter";
      const isEsc = e.key === "Escape";
      const isMinus = e.key === "-";

      if (isDigit || isDot || isBack || isEnter || isEsc || isMinus) {
        e.preventDefault();

        if (!lenEntry.open && (isDigit || isDot || isBack || isMinus)) {
          const sx = gesture.lastScreen?.sx ?? gesture.startScreen?.sx ?? 0;
          const sy = gesture.lastScreen?.sy ?? gesture.startScreen?.sy ?? 0;
          const curMm = Math.max(1, Math.round((gesture.activeObj.r || gesture.arcR || 0) / pxPerMm()) || 1);
          openLenBoxAt(sx, sy, String(curMm));
        }

        if (isEsc) {
          closeLenBox();
          return;
        }

        if (isEnter) {
          const raw = (lenInput.value || "").trim() || lenInput.placeholder || "";
          let mm = parseMmInput(raw);
          if (mm == null && lenEntry.seedMm != null) mm = lenEntry.seedMm;
          if (mm == null) {
            showToast("Invalid mm");
            return;
          }
          setActiveArcRadiusMm(mm);
          closeLenBox();
          return;
        }

        if (!lenEntry.open) return;
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

    // While dragging LINE/ARROW: type-to-set length (finishes on enter)
    if (!typing && gesture.active && gesture.mode === "drawShape" && (gesture.activeObj?.kind === "line" || gesture.activeObj?.kind === "arrow")) {
      const isDigit = /^[0-9]$/.test(e.key);
      const isDot = e.key === "." || e.key === ",";
      const isBack = e.key === "Backspace";
      const isEnter = e.key === "Enter";
      const isEsc = e.key === "Escape";
      const isMinus = e.key === "-";

      if (isDigit || isDot || isBack || isEnter || isEsc || isMinus) {
        e.preventDefault();

        if (!lenEntry.open && (isDigit || isDot || isBack || isMinus)) {
          const sx = gesture.lastScreen?.sx ?? gesture.startScreen?.sx ?? 0;
          const sy = gesture.lastScreen?.sy ?? gesture.startScreen?.sy ?? 0;
          const obj = gesture.activeObj;
          const curMm = Math.max(1, Math.round(Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) / pxPerMm()) || 1);
          openLenBoxAt(sx, sy, String(curMm));
        }

        if (isEsc) {
          closeLenBox();
          return;
        }

        if (isEnter) {
          const raw = (lenInput.value || "").trim() || lenInput.placeholder || "";
          let mm = parseMmInput(raw);
          if (mm == null && lenEntry.seedMm != null) mm = lenEntry.seedMm;
          if (mm == null) {
            showToast("Invalid mm");
            return;
          }

          setActiveLineLengthMm(mm);
          closeLenBox();

          try {
            inkCanvas.releasePointerCapture(gesture.pointerId);
          } catch {}
          hardResetGesture();
          updateCursorFromTool();
          redrawAll();
          return;
        }

        if (!lenEntry.open) return;
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

    // SVG reveal controls
    const isRevealKey = e.key === "." || e.key === "," || e.code === "Period" || e.code === "Comma" || e.code === "NumpadDecimal";
    if (!typing && svgReveal.active && isRevealKey) {
      e.preventDefault();
      const total = svgReveal.partIds.length;
      if (!total) return;

      if (e.key === "." || e.code === "Period" || e.code === "NumpadDecimal") {
        while (svgReveal.revealed < total) {
          const id = svgReveal.partIds[svgReveal.revealed++];
          const obj = findObjById(id);
          if (obj) {
            obj.hidden = false;
            break;
          }
        }
        redrawAll();
        showToast(`SVG: ${Math.min(svgReveal.revealed, total)}/${total}`);
        return;
      }

      if (e.key === "," || e.code === "Comma") {
        while (svgReveal.revealed > 0) {
          const id = svgReveal.partIds[--svgReveal.revealed];
          const obj = findObjById(id);
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

    // Delete selection
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
    
      if (k === "k") setActiveTool("polyFill"); // NEW: Polygon Fill hotkey
    }

    // Undo/redo
    if (mod) {
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        hardResetGesture();
        cancelPolyDraft();
        undo();
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        hardResetGesture();
        cancelPolyDraft();
        redo();
        return;
      }
    }

    // Brush size + pan nudges (only when not dragging)
    if (!typing && !gesture.active) {
      const digit = /^[0-9]$/.test(e.key) ? Number(e.key) : null;
      if (digit !== null) {
        e.preventDefault();
        const size = digit === 0 ? 13 : digit;
        const v = clamp(Number(size), 1, 60);
        setBrushSize(v);
        showToast(`Stroke ${v}px`);
        return;
      }
      if (e.key === "=" || e.key === "+") {
        e.preventDefault();
        setBrushSize(clamp(state.size + (e.shiftKey ? 8 : 16), 1, 60));
        return;
      }
      if (e.key === "-" || e.key === "_") {
        e.preventDefault();
        setBrushSize(clamp(state.size - (e.shiftKey ? 8 : 16), 1, 60));
        return;
      }

      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(e.key)) {
        e.preventDefault();
        const step = e.shiftKey ? 160 : 60;
        if (e.key === "ArrowUp") {
          state.panY += step;
          redrawAll();
        }
        if (e.key === "ArrowDown") {
          state.panY -= step;
          redrawAll();
        }
        if (e.key === "ArrowLeft") {
          state.panX += step;
          redrawAll();
        }
        if (e.key === "ArrowRight") {
          state.panX -= step;
          redrawAll();
        }
        return;
      }
    }
  });

  document.addEventListener("keyup", e => {
    if (e.code === "Space") {
      spacePanning = false;
      if (!gesture.active) updateCursorFromTool();
    }
  });

  /* =========================
     Boards (save/load/new/delete)
  ========================= */
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
    if (!boardSelect) return;
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
  async function applyBoard(data) {
    hardResetGesture();
    cancelPolyDraft();
    state.undo = [];
    state.redo = [];
    applySnapshot(data);
  }




  function freshBoardSnapshot() {
    return {
      v: 8,
      savedAt: new Date().toISOString(),
      tool: "pen",
      color: state.color || "#111111",
      size: state.size || 5,
      zoom: 0.25,
      panX: state.viewW / 2,
      panY: state.viewH / 2,
      title: "",
      pxPerMm: state.pxPerMm || DEFAULT_PX_PER_MM,
      bg: { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 },
      objects: []
    };
  }

  newBoardBtn?.addEventListener("click", async () => {
    const doSave = confirm("Save the current canvas before starting a new one?");
    if (doSave) {
      const name = prompt("Save board as name:", boardSelect?.value || "");
      if (name) {
        const index = loadBoardsIndex();
        index[name] = snapshotBoard();
        saveBoardsIndex(index);
        refreshBoardSelect();
        if (boardSelect) boardSelect.value = name;
        showToast("Board saved");
      }
    }
    await applyBoard(freshBoardSnapshot());
    if (boardSelect) boardSelect.value = "";
    showToast("New board");
  });

  saveBoardBtn?.addEventListener("click", () => {
    const name = prompt("Save board as name:", boardSelect?.value || "");
    if (!name) return;
    const index = loadBoardsIndex();
    index[name] = snapshotBoard();
    saveBoardsIndex(index);
    refreshBoardSelect();
    if (boardSelect) boardSelect.value = name;
    showToast("Board saved");
  });

  loadBoardBtn?.addEventListener("click", async () => {
    const name = boardSelect?.value;
    if (!name) return;
    const index = loadBoardsIndex();
    if (!index[name]) return;
    await applyBoard(index[name]);
    showToast("Board loaded");
  });

  deleteBoardBtn?.addEventListener("click", () => {
    const name = boardSelect?.value;
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
    if (boardSelect) boardSelect.value = "";
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
    if (boardSelect) boardSelect.value = "";
    showToast("All boards deleted");
  });

  refreshBoardSelect();

  /* =========================
     Scale calibration
  ========================= */
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
    state.pxPerMm = DEFAULT_PX_PER_MM;
    updateScaleOut();
    redrawAll();
    showToast("Scale reset");
  });

  /* =========================
     SVG import/export
  ========================= */
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
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
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
      if (!obj || obj.hidden) continue;
      const op = obj.opacity ?? 1;

      if (obj.kind === "erase") {
        const d = pathFromPoints(obj.points || []);
        if (d) wrapWithEraseMask(d, obj.size);
        continue;
      }

      if (obj.kind === "stroke") {
        const d = pathFromPoints(obj.points || []);
        if (!d) continue;
        currentLayer += `<path d="${d}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${obj.size}"/>`;
        continue;
      }

      if (obj.kind === "text") {
        const m = textMetrics(obj);
        const cx = obj.x + m.w / 2;
        const cy = obj.y + m.h / 2;
        const ang = ((obj.rot || 0) * 180) / Math.PI;
        const t = `translate(${cx.toFixed(3)} ${cy.toFixed(3)}) rotate(${ang.toFixed(6)}) translate(${(-m.w / 2).toFixed(3)} ${(-m.h / 2).toFixed(3)})`;
        currentLayer += `<text x="0" y="0" transform="${t}" fill="${obj.color}"  font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-weight="700" font-size="${m.fontSize}">${svgEscape(obj.text || "")}</text>`;
        continue;
      }

      if (obj.kind === "polyFill") {
        const pts = (obj.pts || []).map(p => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
        currentLayer += `<polygon points="${pts}" fill="${obj.fill || obj.color}" fill-opacity="${op}" stroke="none" />`;
        continue;
      }

      if (obj.kind === "fillBitmap" && obj.src) {
        const ppw = obj.ppw || 1;
        const wWorld = (obj.w || 1) / ppw;
        const hWorld = (obj.h || 1) / ppw;

        currentLayer += `<image
    href="${obj.src}" xlink:href="${obj.src}"
    x="${obj.x}" y="${obj.y}" width="${wWorld}" height="${hWorld}"
    opacity="${op}"
    data-kind="fillBitmap"
    data-ppw="${ppw}"
    data-wpx="${obj.w || 0}"
    data-hpx="${obj.h || 0}"
  />`;
        continue;
      }

      const x1 = obj.x1,
        y1 = obj.y1,
        x2 = obj.x2,
        y2 = obj.y2;
      const w = x2 - x1,
        h = y2 - y1;

      if (obj.kind === "line") {
        currentLayer += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" stroke-linecap="round" />`;
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
        currentLayer += `<path d="M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${hx1} ${hy1} M ${x2} ${y2} L ${hx2} ${hy2}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" stroke-linecap="round" stroke-linejoin="round" />`;
        continue;
      }

      if (obj.kind === "rect") {
        const cx = (x1 + x2) / 2,
          cy = (y1 + y2) / 2;
        const rw = Math.abs(w),
          rh = Math.abs(h);
        const ang = ((obj.rot || 0) * 180) / Math.PI;
        const t = `translate(${cx} ${cy}) rotate(${ang})`;
        const fillAttr = obj.filled ? obj.fillColor || obj.color || "none" : "none";
        const fillOp = obj.filled ? ` fill-opacity="${op}"` : "";
        currentLayer += `<rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" transform="${t}" fill="${fillAttr}"${fillOp} stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" />`;
        continue;
      }

      if (obj.kind === "circle") {
        const cx = (x1 + x2) / 2,
          cy = (y1 + y2) / 2;
        const rx = Math.abs(w) / 2,
          ry = Math.abs(h) / 2;
        const ang = ((obj.rot || 0) * 180) / Math.PI;
        const t = `translate(${cx} ${cy}) rotate(${ang})`;
        const fillAttr = obj.filled ? obj.fillColor || obj.color || "none" : "none";
        const fillOp = obj.filled ? ` fill-opacity="${op}"` : "";
        currentLayer += `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" transform="${t}" fill="${fillAttr}"${fillOp} stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" />`;
        continue;
      }

      if (obj.kind === "arc") {
        const a1 = obj.a1 || 0;
        const a2 = obj.a2 || 0;
        const ccw = !!obj.ccw;
        const TWO_PI = Math.PI * 2;
        const rawSpanAbs = Math.abs(a2 - a1);

        if (rawSpanAbs >= TWO_PI - 1e-6) {
          currentLayer += `<circle cx="${obj.cx}" cy="${obj.cy}" r="${obj.r}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" />`;
          continue;
        }

        const span = ccw ? arcDelta(a2, a1) : arcDelta(a1, a2);
        const largeArc = span > Math.PI ? 1 : 0;
        const sweep = ccw ? 0 : 1;

        const sxp = obj.cx + Math.cos(a1) * obj.r;
        const syp = obj.cy + Math.sin(a1) * obj.r;
        const exp = obj.cx + Math.cos(a2) * obj.r;
        const eyp = obj.cy + Math.sin(a2) * obj.r;

        currentLayer += `<path d="M ${sxp} ${syp} A ${obj.r} ${obj.r} 0 ${largeArc} ${sweep} ${exp} ${eyp}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" stroke-linecap="round" />`;
        continue;
      }
    }

    const inkMarkup = pastLayer + currentLayer;

    const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>${defs}</defs>
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

  exportSvgBtn?.addEventListener("click", exportSVG);

  exportBtn?.addEventListener("click", async () => {
    const scale = dpr();
    const out = document.createElement("canvas");
    out.width = Math.floor(state.viewW * scale);
    out.height = Math.floor(state.viewH * scale);
    const octx = out.getContext("2d");
    octx.setTransform(scale, 0, 0, scale, 0, 0);

    if (state.bg.src && state.bg.natW && state.bg.natH) {
      const img = new Image();
      img.src = state.bg.src;
      await new Promise(res => {
        img.onload = () => res();
        img.onerror = () => res();
      });

      octx.save();
      octx.translate(state.panX, state.panY);
      octx.scale(state.zoom, state.zoom);

      const natW = state.bg.natW;
      const natH = state.bg.natH;
      const cx = natW / 2,
        cy = natH / 2;

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

  /* =========================
     SVG ink import
  ========================= */
  function parseNumberAttr(v) {
    const n = parseFloat(String(v || "").replace(/px$/, ""));
    return isFinite(n) ? n : null;
  }

  function ensureHiddenSvgHost() {
    let host = document.getElementById("svgInkHost");
    if (host) return host;
    host = document.createElement("div");
    host.id = "svgInkHost";
    Object.assign(host.style, {
      position: "fixed",
      left: "-99999px",
      top: "0",
      width: "1px",
      height: "1px",
      overflow: "hidden",
      pointerEvents: "none"
    });
    document.body.appendChild(host);
    return host;
  }

  function parseCamTransform(transformStr) {
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

    const camGroup = svg.querySelector(":scope > g[transform]");
    const cam = camGroup ? parseCamTransform(camGroup.getAttribute("transform")) : null;
    const isRoundTrip = !!cam;

    // background <image>
    let pendingBg = null;

    const imgEls = Array.from(svg.querySelectorAll("image"));
    const bgImgEl = imgEls.find(im => (im.getAttribute("data-kind") || "") !== "fillBitmap");
    if (bgImgEl) {
      const href = bgImgEl.getAttribute("href") || bgImgEl.getAttribute("xlink:href") || "";
      const wAttr = parseNumberAttr(bgImgEl.getAttribute("width"));
      const hAttr = parseNumberAttr(bgImgEl.getAttribute("height"));
      if (href) {
        const tf = (bgImgEl.getAttribute("transform") || "").trim();
        let x = 0,
          y = 0,
          rot = 0,
          scale = 1;
        const m = tf.match(
          /translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)\s*translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)\s*rotate\(\s*([-\d.]+)\s*\)\s*scale\(\s*([-\d.]+)\s*\)\s*translate\(\s*([-\d.]+)[,\s]+([-\d.]+)\s*\)\s*$/i
        );
        if (m) {
          x = parseFloat(m[1]) || 0;
          y = parseFloat(m[2]) || 0;
          rot = ((parseFloat(m[5]) || 0) * Math.PI) / 180;
          scale = parseFloat(m[6]) || 1;
        }
        pendingBg = { src: String(href), natW: wAttr ?? 0, natH: hAttr ?? 0, x, y, rot, scale };
      }
    }

    const els = Array.from(svg.querySelectorAll("image,path,line,polyline,polygon,rect,circle,ellipse,text"));
    if (!els.length && !pendingBg) {
      showToast("No SVG paths");
      return;
    }

    const rootPt = svg.createSVGPoint ? svg.createSVGPoint() : null;

    const parts = [];
    function isNone(v) {
      const s = String(v || "").trim().toLowerCase();
      return !s || s === "none" || s === "transparent";
    }

    function mapCTM(el, x, y) {
      if (rootPt && el.getCTM) {
        const m = el.getCTM();
        rootPt.x = x;
        rootPt.y = y;
        const p = rootPt.matrixTransform(m);
        if (isRoundTrip) return invCamPoint({ x: p.x, y: p.y }, cam);
        return { x: p.x, y: p.y };
      }
      const p = { x, y };
      return isRoundTrip ? invCamPoint(p, cam) : p;
    }

    function opacityOf(el) {
      const o1 = parseNumberAttr(el.getAttribute("stroke-opacity"));
      const o2 = parseNumberAttr(el.getAttribute("opacity"));
      const o3 = parseNumberAttr(el.getAttribute("fill-opacity"));
      const o = o1 ?? o3 ?? o2;
      return o == null ? 1 : Math.max(0, Math.min(1, o));
    }

    function strokeWidthOf(el) {
      const sw = parseNumberAttr(el.getAttribute("stroke-width"));
      return Math.max(1, sw ?? 3);
    }

    for (const el of els) {
      if (el.closest("defs") || el.closest("mask")) continue;

      const tag = el.tagName.toLowerCase();
      const stroke = el.getAttribute("stroke");
      const fill = el.getAttribute("fill");

      // ignore white fill-only background rects
      if (tag === "rect" && isNone(stroke) && (String(fill || "").toLowerCase() === "white" || !fill)) continue;

      const color = !isNone(stroke) ? stroke : "#111111";
      const size = strokeWidthOf(el);
      const opacity = opacityOf(el);

      if (tag === "image") {
        const kind = el.getAttribute("data-kind") || "";
        if (kind !== "fillBitmap") continue;

        const href = el.getAttribute("href") || el.getAttribute("xlink:href") || "";
        if (!href) continue;

        const x = parseNumberAttr(el.getAttribute("x")) ?? 0;
        const y = parseNumberAttr(el.getAttribute("y")) ?? 0;
        const wWorld = parseNumberAttr(el.getAttribute("width")) ?? 0;
        const hWorld = parseNumberAttr(el.getAttribute("height")) ?? 0;

        const ppw = parseNumberAttr(el.getAttribute("data-ppw")) ?? 1;
        const wpx = parseNumberAttr(el.getAttribute("data-wpx")) ?? Math.round(wWorld * ppw);
        const hpx = parseNumberAttr(el.getAttribute("data-hpx")) ?? Math.round(hWorld * ppw);

        const p = mapCTM(el, x, y);

        parts.push({
          kind: "fillBitmap",
          x: p.x,
          y: p.y,
          w: Math.max(1, Math.round(wpx)),
          h: Math.max(1, Math.round(hpx)),
          ppw: Math.max(0.0001, ppw),
          opacity,
          src: String(href)
        });
        continue;
      }

      if (tag === "line") {
        if (isNone(stroke)) continue;
        const x1 = parseNumberAttr(el.getAttribute("x1")) ?? 0;
        const y1 = parseNumberAttr(el.getAttribute("y1")) ?? 0;
        const x2 = parseNumberAttr(el.getAttribute("x2")) ?? 0;
        const y2 = parseNumberAttr(el.getAttribute("y2")) ?? 0;
        const p1 = mapCTM(el, x1, y1);
        const p2 = mapCTM(el, x2, y2);
        parts.push({ kind: "line", color, opacity, size, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 });
        continue;
      }

      if (tag === "rect") {
        if (isNone(stroke)) continue;
        const x = parseNumberAttr(el.getAttribute("x")) ?? 0;
        const y = parseNumberAttr(el.getAttribute("y")) ?? 0;
        const w = parseNumberAttr(el.getAttribute("width")) ?? 0;
        const h = parseNumberAttr(el.getAttribute("height")) ?? 0;
        const p1 = mapCTM(el, x, y);
        const p2 = mapCTM(el, x + w, y + h);
        parts.push({ kind: "rect", color, opacity, size, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 });
        continue;
      }

      if (tag === "circle") {
        if (isNone(stroke)) continue;
        const cx = parseNumberAttr(el.getAttribute("cx")) ?? 0;
        const cy = parseNumberAttr(el.getAttribute("cy")) ?? 0;
        const r = parseNumberAttr(el.getAttribute("r")) ?? 0;
        const p1 = mapCTM(el, cx - r, cy - r);
        const p2 = mapCTM(el, cx + r, cy + r);
        parts.push({ kind: "circle", color, opacity, size, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 });
        continue;
      }

      if (tag === "ellipse") {
        if (isNone(stroke)) continue;
        const cx = parseNumberAttr(el.getAttribute("cx")) ?? 0;
        const cy = parseNumberAttr(el.getAttribute("cy")) ?? 0;
        const rx = parseNumberAttr(el.getAttribute("rx")) ?? 0;
        const ry = parseNumberAttr(el.getAttribute("ry")) ?? 0;
        const p1 = mapCTM(el, cx - rx, cy - ry);
        const p2 = mapCTM(el, cx + rx, cy + ry);
        parts.push({ kind: "circle", color, opacity, size, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 });
        continue;
      }

      if (tag === "polyline" || tag === "polygon") {
        const ptsAttr = (el.getAttribute("points") || "").trim();
        if (!ptsAttr) continue;
        const nums = ptsAttr.split(/[\s,]+/).map(Number).filter(n => isFinite(n));
        if (nums.length < 6) continue;

        const pts = [];
        for (let i = 0; i < nums.length - 1; i += 2) pts.push(mapCTM(el, nums[i], nums[i + 1]));

        // NEW: polygon with fill -> polyFill
        const fillAttr = el.getAttribute("fill");
        const hasFill = !isNone(fillAttr);
        const hasStroke = !isNone(stroke);

        if (tag === "polygon" && hasFill && !hasStroke) {
          parts.push({
            kind: "polyFill",
            pts: pts,
            fill: fillAttr || "#111111",
            opacity
          });
          continue;
        }

        // fallback -> stroke
        if (tag === "polygon" && pts.length) pts.push({ ...pts[0] });
        if (isNone(stroke)) continue;
        parts.push({ kind: "stroke", color, opacity, size, points: pts });
        continue;
      }

      if (tag === "path") {
        if (isNone(stroke)) continue;
        if (!el.getTotalLength) continue;
        let total = 0;
        try {
          total = el.getTotalLength();
        } catch {
          total = 0;
        }
        if (!isFinite(total) || total <= 0) continue;

        const steps = Math.max(60, Math.min(420, Math.ceil(total / 3)));
        const pts = [];
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * total;
          let p = null;
          try {
            p = el.getPointAtLength(t);
          } catch {
            p = null;
          }
          if (!p) continue;
          pts.push(mapCTM(el, p.x, p.y));
        }
        if (pts.length < 2) continue;
        parts.push({ kind: "stroke", color, opacity, size, points: pts });
        continue;
      }

      if (tag === "text") continue;
    }

    if (!parts.length && !pendingBg) {
      showToast("No supported SVG shapes");
      return;
    }

    pushUndo();
    clearRedo();
    hardResetGesture();
    cancelPolyDraft();

    if (pendingBg) {
      state.bg.src = pendingBg.src;
      state.bg.natW = pendingBg.natW;
      state.bg.natH = pendingBg.natH;
      state.bg.x = pendingBg.x;
      state.bg.y = pendingBg.y;
      state.bg.rot = pendingBg.rot;
      state.bg.scale = pendingBg.scale;
      bgImg.src = state.bg.src;
    }

    const groupId = "svg_" + Date.now();
    const startIndex = state.objects.length;

    for (const o of parts) {
      const obj = deepClone(o);
      ensureObjId(obj);
      obj.svgGroupId = groupId;
      obj.hidden = true;
      state.objects.push(obj);
    }

    svgReveal.active = true;
    svgReveal.groupId = groupId;
    svgReveal.partIds = [];
    svgReveal.revealed = 0;
    for (let i = startIndex; i < state.objects.length; i++) svgReveal.partIds.push(state.objects[i]._id);

    state.selectionIndex = -1;
    setActiveTool("select");

    if (isRoundTrip && cam) {
      state.zoom = cam.zoom;
      state.panX = cam.panX;
      state.panY = cam.panY;
    }

    redrawAll();
    showToast(`SVG imported: 0/${svgReveal.partIds.length} (→ reveal)`);
  }

  function clearImportedSvgInk() {
    if (!svgReveal.active || !svgReveal.groupId) {
      showToast("No SVG ink");
      return;
    }
    pushUndo();
    clearRedo();
    const gid = svgReveal.groupId;
    state.objects = state.objects.filter(o => !(o && o.svgGroupId === gid));
    svgReveal.active = false;
    svgReveal.groupId = null;
    svgReveal.partIds = [];
    svgReveal.revealed = 0;
    state.selectionIndex = -1;
    redrawAll();
    showToast("SVG cleared");
  }

  svgInkFile?.addEventListener("change", () => {
    const file = svgInkFile.files && svgInkFile.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importSvgInkFromText(String(reader.result || ""));
    reader.readAsText(file);
    svgInkFile.value = "";
  });
  clearSvgInkBtn?.addEventListener("click", clearImportedSvgInk);

  /* =========================
     Init
  ========================= */
  function init() {
    setColor(colorInput?.value || "#111111");
    setBrushSize(brushSize?.value || 5);
    setActiveTool("pen");
    updateSwatch();
    updateScaleOut();
    resizeAll();

    requestAnimationFrame(() => {
      resizeAll();
      state.zoom = 0.25;
      state.panX = state.viewW / 2;
      state.panY = state.viewH / 2;
      redrawAll();
    });
  }

  const ro = new ResizeObserver(() => resizeAll());
  ro.observe(stage);
  init();
})();
