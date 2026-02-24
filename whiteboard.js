/* =========================================================
   whiteboard.js — background as DOM image (no zoom artefacts)

   RELEVANT FIXES (alignment/mouse/touch):
     ✅ Use inkCanvas.getBoundingClientRect() for pointer mapping (not stage)
     ✅ Remove duplicate clientToScreen() definition (you had TWO)
     ✅ Preserve DPR (devicePixelRatio) in ALL drawing transforms
        - applyWorldTransform() now sets DPR first, then pan/zoom
        - drawUI() uses DPR transform for screen-space UI
     ✅ Clear uses backing-store pixels; drawing restores DPR correctly
   ========================================================= */

(() => {
  // ---------- DOM ----------
  const stage = document.getElementById("stage");

  // Background DOM layer
  const bgLayer = document.getElementById("bgLayer");
  const bgImg = document.getElementById("bgImg");

  // Canvases
  const inkCanvas = document.getElementById("inkCanvas");
  const uiCanvas  = document.getElementById("uiCanvas");
  const inkCtx = inkCanvas.getContext("2d");
  const uiCtx  = uiCanvas.getContext("2d");

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
  const swatchDot = document.getElementById("swatchDot");

  // Settings panel
  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");

  // Panel controls (no zoom/colour)
  const titleInput = document.getElementById("titleInput");
  const applyTitleBtn = document.getElementById("applyTitleBtn");

  const bgFile = document.getElementById("bgFile");
  const clearBgBtn = document.getElementById("clearBgBtn");

  const boardSelect = document.getElementById("boardSelect");
  const newBoardBtn = document.getElementById("newBoardBtn");
  const saveBoardBtn = document.getElementById("saveBoardBtn");
  const loadBoardBtn = document.getElementById("loadBoardBtn");

  const exportBtn = document.getElementById("exportBtn");

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

    // Undo/redo (shortcuts only)
    undo: [],
    redo: [],

    selectionIndex: -1,

    viewW: 0,
    viewH: 0
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
  function stageRect() { return stage.getBoundingClientRect(); }

  // Pointer mapping MUST use the canvas rect
  function canvasRect() { return inkCanvas.getBoundingClientRect(); }

  // ✅ SINGLE correct clientToScreen (you had two; this removes the bug)
  function clientToScreen(evt) {
    const r = canvasRect();
    return { sx: evt.clientX - r.left, sy: evt.clientY - r.top };
  }

  function updateSwatch() {
    swatchDot.style.background = state.color;
  }

  function setColor(hex) {
    state.color = hex;
    colorInput.value = hex;
    updateSwatch();
  }

  function setBrushSize(n) {
    state.size = Number(n);
    brushSize.value = String(state.size);
    brushOut.textContent = String(state.size);
  }

  function setActiveTool(tool) {
    state.tool = tool;
    dockBtns.forEach(b => b.classList.toggle("is-active", b.dataset.tool === tool));
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

  // ---------- Undo/Redo (keyboard only) ----------
  function snapshot() {
    return {
      tool: state.tool,
      color: state.color,
      size: state.size,
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      title: state.title,
      bg: { ...state.bg },
      objects: JSON.parse(JSON.stringify(state.objects))
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

    const bg = snap.bg || { src:"", natW:0, natH:0, x:0, y:0, scale:1, rot:0 };
    state.bg = { ...bg };

    state.objects = Array.isArray(snap.objects)
      ? JSON.parse(JSON.stringify(snap.objects))
      : [];

    state.selectionIndex = -1;
    applyBgTransform();
    redrawAll();
  }

  function pushUndo() {
    state.undo.push(JSON.stringify(snapshot()));
    if (state.undo.length > 120) state.undo.shift();
  }
  function clearRedo() { state.redo.length = 0; }

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
    state.pixelRatio = scale; // ✅ track DPR

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

  // ---------- Background CSS transform (NO artefacts) ----------
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
      `translate(${cx}px, ${cy}px) rotate(${state.bg.rot}rad) translate(${-cx}px, ${-cy}px) ` +
      `scale(${state.bg.scale})`;
  }

  // ---------- Rendering ----------
  function clearCtx(ctx, canvas) {
    // clear in backing-store pixels
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  // ✅ CRITICAL: Apply DPR first, then camera pan/zoom
  function applyWorldTransform(ctx) {
    const pr = state.pixelRatio || 1;
    ctx.setTransform(pr, 0, 0, pr, 0, 0); // DPR => drawing coords = CSS px
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
      inkCtx.font = `700 ${obj.fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      inkCtx.fillText(obj.text, obj.x, obj.y);
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
      inkCtx.beginPath(); inkCtx.moveTo(x1, y1); inkCtx.lineTo(x2, y2); inkCtx.stroke();
    } else if (obj.kind === "rect") {
      inkCtx.strokeRect(x1, y1, w, h);
    } else if (obj.kind === "circle") {
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const rx = Math.abs(w) / 2;
      const ry = Math.abs(h) / 2;
      inkCtx.beginPath();
      inkCtx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      inkCtx.stroke();
    } else if (obj.kind === "arrow") {
      inkCtx.beginPath(); inkCtx.moveTo(x1, y1); inkCtx.lineTo(x2, y2); inkCtx.stroke();
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

  function objectBounds(obj) {
    if (obj.kind === "text") {
      measureCtx.font = `700 ${obj.fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
      const w = measureCtx.measureText(obj.text || "").width;
      const h = obj.fontSize * 1.25;
      return { minX: obj.x, minY: obj.y, maxX: obj.x + w, maxY: obj.y + h };
    }
    if (obj.kind === "stroke" || obj.kind === "erase") {
      const pts = obj.points || [];
      if (!pts.length) return { minX:0, minY:0, maxX:0, maxY:0 };
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x); minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y);
      }
      const pad = (obj.size || 6) * 0.8;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }
    const minX = Math.min(obj.x1, obj.x2);
    const minY = Math.min(obj.y1, obj.y2);
    const maxX = Math.max(obj.x1, obj.x2);
    const maxY = Math.max(obj.y1, obj.y2);
    const pad = (obj.size || 4) * 1.0;
    return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx*dx + dy*dy);
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
        if (distToSeg(wx, wy, pts[i-1].x, pts[i-1].y, pts[i].x, pts[i].y) <= tol) return true;
      }
      return false;
    }

    if (obj.kind === "line" || obj.kind === "arrow") {
      return distToSeg(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2) <= tol;
    }

    if (obj.kind === "rect") {
      const b = objectBounds(obj);
      return wx >= b.minX && wx <= b.maxX && wy >= b.minY && wy <= b.maxY;
    }

    if (obj.kind === "circle") {
      const cx = (obj.x1 + obj.x2) / 2;
      const cy = (obj.y1 + obj.y2) / 2;
      const rx = Math.abs(obj.x2 - obj.x1) / 2;
      const ry = Math.abs(obj.y2 - obj.y1) / 2;
      if (rx < 1 || ry < 1) return false;
      const nx = (wx - cx) / rx;
      const ny = (wy - cy) / ry;
      return (nx*nx + ny*ny) <= 1.2;
    }

    return false;
  }

  function findHit(wx, wy) {
    for (let i = state.objects.length - 1; i >= 0; i--) {
      if (hitObject(state.objects[i], wx, wy)) return i;
    }
    return -1;
  }

  function moveObject(obj, dx, dy) {
    if (obj.kind === "text") { obj.x += dx; obj.y += dy; return; }
    if (obj.kind === "stroke" || obj.kind === "erase") {
      (obj.points || []).forEach(p => { p.x += dx; p.y += dy; });
      return;
    }
    obj.x1 += dx; obj.y1 += dy; obj.x2 += dx; obj.y2 += dy;
  }

  function drawInk() {
    clearCtx(inkCtx, inkCanvas);
    for (const obj of state.objects) drawInkObject(obj);
  }

  function drawUI() {
    clearCtx(uiCtx, uiCanvas);

    // Screen-space UI must still use DPR so it matches pointer coords
    const pr = state.pixelRatio || 1;

    // Title (not zoomed)
    if (state.title) {
      uiCtx.save();
      uiCtx.setTransform(pr, 0, 0, pr, 0, 0);
      uiCtx.font = "700 20px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      uiCtx.textBaseline = "top";
      const pad = 14;
      const w = uiCtx.measureText(state.title).width;
      uiCtx.fillStyle = "rgba(255,255,255,0.72)";
      uiCtx.fillRect(pad, pad, Math.min(w + 16, state.viewW - pad*2), 30);
      uiCtx.fillStyle = "rgba(0,0,0,0.88)";
      uiCtx.fillText(state.title, pad + 8, pad + 5);
      uiCtx.restore();
    }

    // Selection box
    if (state.selectionIndex >= 0 && state.objects[state.selectionIndex]) {
      const b = objectBounds(state.objects[state.selectionIndex]);
      const p1 = worldToScreen(b.minX, b.minY);
      const p2 = worldToScreen(b.maxX, b.maxY);

      uiCtx.save();
      uiCtx.setTransform(pr, 0, 0, pr, 0, 0);
      uiCtx.strokeStyle = "rgba(46, 204, 113, 0.95)";
      uiCtx.lineWidth = 2;
      uiCtx.setLineDash([6, 4]);
      uiCtx.strokeRect(p1.x, p1.y, p2.x - p1.x, p2.y - p1.y);
      uiCtx.restore();
    }
  }

  function redrawAll() {
    applyBgTransform();
    drawInk();
    drawUI();
  }

  // ---------- Gesture state ----------
  const gesture = {
    active: false,
    pointerId: null,
    mode: "none",
    lastWorld: null,
    lastScreen: null,
    activeObj: null
  };

  let spacePanning = false;

  function hardResetGesture() {
    gesture.active = false;
    gesture.pointerId = null;
    gesture.mode = "none";
    gesture.lastWorld = null;
    gesture.lastScreen = null;
    gesture.activeObj = null;
  }

  // ---------- Pointer interactions ----------
  
function onPointerDown(e) {
  // If click is NOT directly on the drawing canvas, do nothing
  if (!inkCanvas.contains(e.target)) return;

    gesture.active = true;
    gesture.pointerId = e.pointerId;
    inkCanvas.setPointerCapture(e.pointerId);

    const { sx, sy } = clientToScreen(e);
    const w = screenToWorld(sx, sy);

    gesture.lastScreen = { sx, sy };
    gesture.lastWorld = w;
    gesture.activeObj = null;

    if (spacePanning) {
      gesture.mode = "pan";
      return;
    }

    if (state.tool === "text") {
      gesture.active = false;
      gesture.mode = "none";
      const text = prompt("Enter text:");
      if (!text) return;

      pushUndo(); clearRedo();
      state.objects.push({
        kind: "text",
        x: w.x,
        y: w.y,
        text: String(text),
        color: state.color,
        fontSize: Math.max(14, Math.round(state.size * 4))
      });
      redrawAll();
      return;
    }

    if (state.tool === "bgMove" || state.tool === "bgScale" || state.tool === "bgRotate") {
      if (!state.bg.src) return;
      pushUndo(); clearRedo();
      gesture.mode = state.tool;
      return;
    }

    if (state.tool === "select") {
      const hit = findHit(w.x, w.y);
      state.selectionIndex = hit;
      redrawAll();
      if (hit >= 0) {
        pushUndo(); clearRedo();
        gesture.mode = "selectMove";
      } else {
        gesture.mode = "select";
      }
      return;
    }

    pushUndo(); clearRedo();
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

    if (["line","rect","circle","arrow"].includes(state.tool)) {
      const obj = { kind: state.tool, color: state.color, size: state.size, x1: w.x, y1: w.y, x2: w.x, y2: w.y };
      state.objects.push(obj);
      gesture.activeObj = obj;
      gesture.mode = "drawShape";
      redrawAll();
      return;
    }

    gesture.mode = "none";
  }

  function onPointerMove(e) {
    if (!gesture.active) return;

    const { sx, sy } = clientToScreen(e);
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

    if (gesture.mode === "bgMove" && gesture.lastWorld) {
      state.bg.x += (w.x - gesture.lastWorld.x);
      state.bg.y += (w.y - gesture.lastWorld.y);
      gesture.lastWorld = w;
      redrawAll();
      return;
    }
    if (gesture.mode === "bgScale" && gesture.lastWorld) {
      const dy = (w.y - gesture.lastWorld.y);
      const factor = 1 - dy * 0.02;
      state.bg.scale = clamp(state.bg.scale * factor, 0.05, 10);
      gesture.lastWorld = w;
      redrawAll();
      return;
    }
    if (gesture.mode === "bgRotate" && gesture.lastWorld) {
      const dx = (w.x - gesture.lastWorld.x);
      state.bg.rot += dx * 0.02;
      gesture.lastWorld = w;
      redrawAll();
      return;
    }

    if (gesture.mode === "selectMove" && gesture.lastWorld && state.selectionIndex >= 0) {
      const dx = w.x - gesture.lastWorld.x;
      const dy = w.y - gesture.lastWorld.y;
      moveObject(state.objects[state.selectionIndex], dx, dy);
      gesture.lastWorld = w;
      redrawAll();
      return;
    }

    if ((gesture.mode === "drawStroke" || gesture.mode === "drawErase") && gesture.activeObj) {
      gesture.activeObj.points.push(w);
      redrawAll();
      return;
    }

    if (gesture.mode === "drawShape" && gesture.activeObj) {
      gesture.activeObj.x2 = w.x;
      gesture.activeObj.y2 = w.y;
      redrawAll();
      return;
    }
  }

  function onPointerUp() {
    if (!gesture.active) return;
    try { inkCanvas.releasePointerCapture(gesture.pointerId); } catch {}
    hardResetGesture();
  }

  inkCanvas.addEventListener("pointerdown", onPointerDown);
  inkCanvas.addEventListener("pointermove", onPointerMove);
  inkCanvas.addEventListener("pointerup", onPointerUp);
  inkCanvas.addEventListener("pointercancel", onPointerUp);

  inkCanvas.addEventListener("wheel", (e) => {
    e.preventDefault();
    const { sx, sy } = clientToScreen(e);
    const dir = Math.sign(e.deltaY);
    const step = dir > 0 ? 0.90 : 1.10;
    setZoomTo(state.zoom * step, sx, sy);
  }, { passive: false });

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
  dockBtns.forEach(b => b.addEventListener("click", () => setActiveTool(b.dataset.tool)));

  clearBtn.addEventListener("click", () => {
    pushUndo(); clearRedo();
    hardResetGesture();
    state.objects = [];
    state.selectionIndex = -1;
    setActiveTool("pen");
    redrawAll();
  });

  applyTitleBtn.addEventListener("click", () => {
    pushUndo(); clearRedo();
    state.title = (titleInput.value || "").trim();
    redrawAll();
  });

  // Background import
  bgFile.addEventListener("change", () => {
    const file = bgFile.files && bgFile.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        pushUndo(); clearRedo();
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

        const w = img.naturalWidth * state.bg.scale;
        const h = img.naturalHeight * state.bg.scale;

        state.bg.x = viewCenter.x - w / 2;
        state.bg.y = viewCenter.y - h / 2;
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
    pushUndo(); clearRedo();
    hardResetGesture();
    state.bg = { src:"", natW:0, natH:0, x:0, y:0, scale:1, rot:0 };
    bgImg.removeAttribute("src");
    applyBgTransform();
    redrawAll();
  });

  // ---------- Keyboard ----------
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      openSettings(false);
      toggleColorPop(false);
    }

    if (e.code === "Space") {
      spacePanning = true;
      e.preventDefault();
    }

    const tag = (document.activeElement && document.activeElement.tagName) || "";
    const typing = tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT";
    if (!typing) {
      const k = e.key.toLowerCase();
      if (k === "v") setActiveTool("select");
      if (k === "p") setActiveTool("pen");
      if (k === "l") setActiveTool("line");
      if (k === "r") setActiveTool("rect");
      if (k === "c") setActiveTool("circle");
      if (k === "a") setActiveTool("arrow");
      if (k === "t") setActiveTool("text");
      if (k === "e") setActiveTool("eraser");
    }

    const isMac = navigator.platform.toUpperCase().includes("MAC");
    const mod = isMac ? e.metaKey : e.ctrlKey;
    if (!mod) return;

    const key = e.key.toLowerCase();
    if (key === "z" && !e.shiftKey) {
      e.preventDefault();
      hardResetGesture();
      undo();
    } else if (key === "y" || (key === "z" && e.shiftKey)) {
      e.preventDefault();
      hardResetGesture();
      redo();
    }
  });

  document.addEventListener("keyup", (e) => {
    if (e.code === "Space") spacePanning = false;
  });

  // ---------- Boards ----------
  const LS_KEY = "PHS_WHITEBOARD_BOARDS_v6";

  function loadBoardsIndex() {
    try { return JSON.parse(localStorage.getItem(LS_KEY) || "{}"); }
    catch { return {}; }
  }
  function saveBoardsIndex(index) {
    localStorage.setItem(LS_KEY, JSON.stringify(index));
  }
  function refreshBoardSelect() {
    const index = loadBoardsIndex();
    const names = Object.keys(index).sort((a,b) => a.localeCompare(b));
    boardSelect.innerHTML = "";
    const opt0 = document.createElement("option");
    opt0.value = ""; opt0.textContent = "— select —";
    boardSelect.appendChild(opt0);
    for (const name of names) {
      const opt = document.createElement("option");
      opt.value = name; opt.textContent = name;
      boardSelect.appendChild(opt);
    }
  }

  function snapshotBoard() {
    return { v: 6, savedAt: new Date().toISOString(), ...snapshot() };
  }

  async function applyBoard(data) {
    hardResetGesture();
    state.undo = [];
    state.redo = [];

    applySnapshot(data);

    if (state.bg && state.bg.src) {
      bgImg.src = state.bg.src;
    } else {
      bgImg.removeAttribute("src");
    }

    applyBgTransform();
    redrawAll();
  }

  newBoardBtn.addEventListener("click", () => {
    pushUndo(); clearRedo();
    hardResetGesture();
    state.objects = [];
    state.selectionIndex = -1;
    state.title = "";
    titleInput.value = "";
    state.zoom = 1; state.panX = 0; state.panY = 0;
    state.bg = { src:"", natW:0, natH:0, x:0, y:0, scale:1, rot:0 };
    bgImg.removeAttribute("src");
    setActiveTool("pen");
    applyBgTransform();
    redrawAll();
    showToast("New board");
  });

  saveBoardBtn.addEventListener("click", () => {
    const name = prompt("Save board as name:", boardSelect.value || "");
    if (!name) return;
    const index = loadBoardsIndex();
    index[name] = snapshotBoard();
    saveBoardsIndex(index);
    refreshBoardSelect();
    boardSelect.value = name;
    showToast("Board saved");
  });

  loadBoardBtn.addEventListener("click", async () => {
    const name = boardSelect.value;
    if (!name) return;
    const index = loadBoardsIndex();
    if (!index[name]) return;
    await applyBoard(index[name]);
    showToast("Board loaded");
  });

  refreshBoardSelect();

  // ---------- Export PNG (composite) ----------
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
      await new Promise((res) => { img.onload = () => res(); img.onerror = () => res(); });

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
      octx.translate(-cx, -cy);
      octx.scale(state.bg.scale, state.bg.scale);

      octx.drawImage(img, 0, 0);
      octx.restore();
    }

    octx.drawImage(inkCanvas, 0, 0, state.viewW, state.viewH);
    octx.drawImage(uiCanvas, 0, 0, state.viewW, state.viewH);

    const a = document.createElement("a");
    a.download = `whiteboard-${new Date().toISOString().slice(0,10)}.png`;
    a.href = out.toDataURL("image/png");
    a.click();
  });

  // ---------- Init + resize ----------
  function init() {
    setColor(colorInput.value);
    setBrushSize(brushSize.value);
    setActiveTool("pen");

    applyBgTransform();

    resizeAll();
    requestAnimationFrame(resizeAll);
  }

  const ro = new ResizeObserver(() => resizeAll());
  ro.observe(stage);

  init();
})();
