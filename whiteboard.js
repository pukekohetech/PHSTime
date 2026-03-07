/* ==========================================================
   whiteboard.js — main bootstrap after modular split

   Requires:
   - whiteboard.shared.js
   - whiteboard.geometry.js
   - whiteboard.render.js
   - whiteboard.io.js
   - whiteboard.ui.js

   Keeps:
   - pen / eraser / line / rect / circle / arc / arrow / text / polyFill
   - selection move / scale / rotate
   - background move / scale / rotate
   - SVG reveal + playback
   - boards / export / print / background import
   - type-to-set line length / arc radius
   ========================================================== */

(() => {
  /* =========================
     DOM
  ========================= */
  const stage = document.getElementById("stage");

  const bgLayer = document.getElementById("bgLayer");
  const bgImg = document.getElementById("bgImg");

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
  const printBtn = document.getElementById("printBtn");

  const scaleOut = document.getElementById("scaleOut");
  const setScaleBtn = document.getElementById("setScaleBtn");
  const resetScaleBtn = document.getElementById("resetScaleBtn");

  const deleteBoardBtn = document.getElementById("deleteBoardBtn");
  const deleteAllBoardsBtn = document.getElementById("deleteAllBoardsBtn");

  const presetConstruction = document.getElementById("presetConstruction");
  const presetOutline = document.getElementById("presetOutline");
  const presetColour = document.getElementById("presetColour");
  const lineStyleSolid = document.getElementById("lineStyleSolid");
  const lineStyleHidden = document.getElementById("lineStyleHidden");
  const lineStyleCenter = document.getElementById("lineStyleCenter");

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
    lineStyle: "solid",

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

  // cache raster fill canvases by object id
  const fillBitmapCache = new Map();

  // SVG reveal state
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

  const svgPlayback = {
    running: false,
    timer: 0,
    token: 0,
    stepMs: 1000,
    endPauseMs: 5000
  };

  // Arc draft
  const arcDraft = { hasCenter: false, cx: 0, cy: 0 };

  // PolyFill draft
  const polyDraft = { active: false, pts: [], hover: null };

  // Selection handles cache
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

    snapCache: null
  };

  let spacePanning = false;

  /* =========================
     Small utilities
  ========================= */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const dpr = () => Math.max(1, Math.min(3, window.devicePixelRatio || 1));
  const isMac = navigator.platform.toUpperCase().includes("MAC");

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

  function parseNumberAttr(v) {
    const n = parseFloat(String(v || "").replace(/px$/, ""));
    return isFinite(n) ? n : null;
  }

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

  function parseSimpleMLPath(d) {
    const tokens = String(d || "").match(/[MLml]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
    if (!tokens) return null;

    const pts = [];
    let i = 0;
    let cmd = null;
    let x = 0, y = 0;

    while (i < tokens.length) {
      const t = tokens[i++];

      if (/^[MLml]$/.test(t)) {
        cmd = t;
        continue;
      }

      const nx = parseFloat(t);
      const ny = parseFloat(tokens[i++]);
      if (!isFinite(nx) || !isFinite(ny) || !cmd) return null;

      if (cmd === "M") {
        x = nx; y = ny; cmd = "L";
      } else if (cmd === "m") {
        x += nx; y += ny; cmd = "l";
      } else if (cmd === "L") {
        x = nx; y = ny;
      } else if (cmd === "l") {
        x += nx; y += ny;
      } else {
        return null;
      }

      pts.push({ x, y });
    }

    return pts.length >= 2 ? pts : null;
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

  function rotateAround(x, y, cx, cy, ang) {
    const dx = x - cx, dy = y - cy;
    const c = Math.cos(ang), s = Math.sin(ang);
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  function rotatePoint(px, py, cx, cy, angle) {
    const dx = px - cx, dy = py - cy;
    const cos = Math.cos(angle), sin = Math.sin(angle);
    return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
  }

  function arcDelta(a1, a2) {
    const TWO_PI = Math.PI * 2;
    let d = (a2 - a1) % TWO_PI;
    if (d < 0) d += TWO_PI;
    return d;
  }

  function polyBounds(pts) {
    if (!pts || !pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
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
      const xi = pts[i].x, yi = pts[i].y;
      const xj = pts[j].x, yj = pts[j].y;
      const intersect = yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;
      if (intersect) inside = !inside;
    }
    return inside;
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1, dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const tt = clamp(t, 0, 1);
    const cx = x1 + tt * dx, cy = y1 + tt * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function isAngleOnArc(a, a1, a2) {
    const TWO_PI = Math.PI * 2;
    const norm = v => ((v % TWO_PI) + TWO_PI) % TWO_PI;
    const aa = norm(a), s = norm(a1), e = norm(a2);
    if (s <= e) return aa >= s && aa <= e;
    return aa >= s || aa <= e;
  }

  function segIntersection(a, b) {
    const x1 = a.x1, y1 = a.y1, x2 = a.x2, y2 = a.y2;
    const x3 = b.x1, y3 = b.y1, x4 = b.x2, y4 = b.y2;
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-12) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;
    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;
    return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
  }

  const {
    getLineDash,
    svgDashArray,
    detectLineStyleFromDashArray
  } = window.WBShared || {};

  if (!getLineDash || !svgDashArray || !detectLineStyleFromDashArray) {
    console.error("WBShared helpers missing. Make sure whiteboard.shared.js loads before whiteboard.js.");
  }

  const measureCtx = document.createElement("canvas").getContext("2d");
  function textMetrics(obj) {
    const fontSize = obj.fontSize || 20;
    measureCtx.font = `700 ${fontSize}px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif`;
    const text = obj.text || "";
    const w = measureCtx.measureText(text).width;
    const h = fontSize * 1.25;
    return { w, h, fontSize };
  }

  /* =========================
     Selection handles
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
        { x:  w / 2, y: -h / 2 },
        { x:  w / 2, y:  h / 2 },
        { x: -w / 2, y:  h / 2 }
      ].map(p => ({
        x: cx + p.x * Math.cos(ang) - p.y * Math.sin(ang),
        y: cy + p.x * Math.sin(ang) + p.y * Math.cos(ang)
      }));
      const cornersS = cornersW.map(p => worldToScreen(p.x, p.y));

      const topMid = { x: (cornersS[0].x + cornersS[1].x) / 2, y: (cornersS[0].y + cornersS[1].y) / 2 };
      const edge = { x: cornersS[1].x - cornersS[0].x, y: cornersS[1].y - cornersS[0].y };
      const elen = Math.hypot(edge.x, edge.y) || 1;
      const nx = -(edge.y / elen), ny = edge.x / elen;
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
      { name: "nw", x, y, s },
      { name: "ne", x: x + w, y, s },
      { name: "se", x: x + w, y: y + h, s },
      { name: "sw", x, y: y + h, s }
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
        const xi = poly[i].x, yi = poly[i].y;
        const xj = poly[j].x, yj = poly[j].y;
        const intersect = yi > sy !== yj > sy && sx < ((xj - xi) * (sy - yi)) / (yj - yi + 1e-12) + xi;
        if (intersect) inside = !inside;
      }
      if (inside) return { kind: "move" };
    }

    return null;
  }

  /* =========================
     Modules
  ========================= */
  const geometry = window.WBGeometry.createGeometryApi({
    state,
    gesture,
    textMetrics,
    pxPerMm,
    mmStepWorld,
    SNAP_RADIUS_PX,
    clamp,
    rotateAround,
    rotatePoint,
    arcDelta,
    distToSeg,
    pointInPoly,
    polyBounds,
    isAngleOnArc,
    segIntersection,
    getLineDash,
    svgDashArray,
    detectLineStyleFromDashArray
  });

  const {
    pointOnArc,
    rectEdges,
    objectBounds,
    findHit,
    moveObject,
    rotateObject,
    scaleObjectXY,
    snapToMmGridWorld,
    snapToWholeMmLength,
    buildSnapCache,
    snapPointPreferEndsIntersections,
    snapShapePoint,
    snapLinePoint,
    snapPolyPoint,
    exportWorldBounds
  } = geometry;

  const render = window.WBRender.createRenderApi({
    state,
    stage,
    bgLayer,
    bgImg,
    inkCanvas,
    uiCanvas,
    inkCtx,
    uiCtx,
    swatchLive,
    fillBitmapCache,
    ensureObjId,
    textMetrics,
    objectBounds,
    worldToScreen,
    computeHandles,
    polyDraft,
    dpr,
    uiHandles,
    getLineDash
  });

  const {
    applyBgTransform,
    resizeAll,
    redrawAll
  } = render;

  const ui = window.WBUI.createUIApi({
    state,
    stage,
    inkCanvas,
    dockBtns,
    toast,
    colorBtn,
    colorPop,
    colorInput,
    brushSize,
    brushOut,
    swatchLive,
    opacityRange,
    opacityOut,
    settingsBtn,
    settingsPanel,
    settingsCloseBtn,
    presetConstruction,
    presetOutline,
    presetColour,
    lineStyleSolid,
    lineStyleHidden,
    lineStyleCenter,
    showToastFallback: msg => console.log(msg),
    redrawAll,
    cancelPolyDraft
  });

  const {
    lenInput,
    showToast,
    updateBrushUI,
    setColor,
    setBrushSize,
    toggleColorPop,
    openSettings,
    updateCursorFromTool,
    setActiveTool,
    showMeasureTip,
    hideMeasureTip,
    openLenBoxAt,
    moveLenBoxTo,
    closeLenBox,
    bindUI
  } = ui;

  const io = window.WBIO.createIOApi({
    state,
    gesture,
    svgReveal,
    svgPlayback,
    bgImg,
    inkCanvas,
    uiCanvas,
    fillBitmapCache,
    boardSelect,
    titleInput,
    showToast,
    setActiveTool,
    hardResetGesture,
    cancelPolyDraft,
    redrawAll,
    dpr,
    pxPerMm,
    deepClone,
    parseNumberAttr,
    svgEscape,
    pathFromPoints,
    parseSimpleMLPath,
    textMetrics,
    svgDashArray,
    detectLineStyleFromDashArray,
    objectBounds,
    worldToScreen,
    screenToWorld,
    pointOnArc,
    rectEdges,
    exportWorldBounds,
    ensureObjId,
    findObjById,
    stopSvgPlayback,
    resetSvgRevealState
  });

  const {
    snapshot,
    applySnapshot,
    refreshBoardSelect,
    applyBoard,
    freshBoardSnapshot,
    bindBackgroundInput,
    bindBoards,
    bindSvgInput,
    bindExport
  } = io;

  /* =========================
     State helpers
  ========================= */
  const lenEntry = { open: false, seedMm: null };

  function updateScaleOut() {
    if (!scaleOut) return;
    scaleOut.textContent = `1 mm = ${pxPerMm().toFixed(3)} px`;
  }

  function cancelPolyDraft() {
    polyDraft.active = false;
    polyDraft.pts = [];
    polyDraft.hover = null;
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
    gesture.lastScreenPrev = null;

    lenEntry.open = false;
    lenEntry.seedMm = null;

    hideMeasureTip();
    closeLenBox();
  }

  /* =========================
     SVG playback
  ========================= */
  function clearSvgPlaybackTimer() {
    if (svgPlayback.timer) {
      clearTimeout(svgPlayback.timer);
      svgPlayback.timer = 0;
    }
  }

  function revealNextSvgPart() {
    const total = svgReveal.partIds.length;
    while (svgReveal.revealed < total) {
      const id = svgReveal.partIds[svgReveal.revealed++];
      const obj = findObjById(id);
      if (obj) {
        obj.hidden = false;
        redrawAll();
        return true;
      }
    }
    redrawAll();
    return false;
  }

  function hidePrevSvgPart() {
    while (svgReveal.revealed > 0) {
      const id = svgReveal.partIds[--svgReveal.revealed];
      const obj = findObjById(id);
      if (obj) {
        obj.hidden = true;
        redrawAll();
        return true;
      }
    }
    redrawAll();
    return false;
  }

  function setSvgRevealCount(nextCount) {
    const total = svgReveal.partIds.length;
    const target = clamp(Math.round(nextCount), 0, total);

    while (svgReveal.revealed < target) {
      const id = svgReveal.partIds[svgReveal.revealed++];
      const obj = findObjById(id);
      if (obj) obj.hidden = false;
    }
    while (svgReveal.revealed > target) {
      const id = svgReveal.partIds[--svgReveal.revealed];
      const obj = findObjById(id);
      if (obj) obj.hidden = true;
    }

    redrawAll();
  }

  function stopSvgPlayback(silent = false) {
    const wasRunning = svgPlayback.running || !!svgPlayback.timer;
    svgPlayback.running = false;
    svgPlayback.token += 1;
    clearSvgPlaybackTimer();
    if (wasRunning && !silent) showToast("Presentation stopped");
  }

  function resetSvgRevealState() {
    stopSvgPlayback(true);
    svgReveal.active = false;
    svgReveal.groupId = null;
    svgReveal.partIds = [];
    svgReveal.revealed = 0;
  }

  function scheduleSvgPlayback(ms, token, fn) {
    clearSvgPlaybackTimer();
    svgPlayback.timer = setTimeout(() => {
      svgPlayback.timer = 0;
      if (!svgPlayback.running) return;
      if (token !== svgPlayback.token) return;
      fn();
    }, Math.max(0, ms));
  }

  function svgPlaybackTick(token) {
    if (!svgPlayback.running || token !== svgPlayback.token) return;

    if (!svgReveal.active || !svgReveal.partIds.length) {
      stopSvgPlayback(true);
      showToast("No SVG reveal loaded");
      return;
    }

    if (revealNextSvgPart()) {
      scheduleSvgPlayback(svgPlayback.stepMs, token, () => svgPlaybackTick(token));
      return;
    }

    scheduleSvgPlayback(svgPlayback.endPauseMs, token, () => {
      if (!svgPlayback.running || token !== svgPlayback.token) return;
      setSvgRevealCount(0);
      scheduleSvgPlayback(svgPlayback.stepMs, token, () => svgPlaybackTick(token));
    });
  }

  function startSvgPlayback() {
    if (!svgReveal.active || !svgReveal.partIds.length) {
      showToast("Import SVG reveal first");
      return;
    }

    stopSvgPlayback(true);

    const total = svgReveal.partIds.length;
    svgPlayback.running = true;
    svgPlayback.token += 1;
    const token = svgPlayback.token;

    let firstDelay = 0;
    if (svgReveal.revealed > 0 && svgReveal.revealed < total) {
      firstDelay = svgPlayback.stepMs;
    }

    showToast(`Presentation ▶ ${svgReveal.revealed}/${total}`);
    scheduleSvgPlayback(firstDelay, token, () => svgPlaybackTick(token));
  }

  function toggleSvgPlayback() {
    if (svgPlayback.running) stopSvgPlayback();
    else startSvgPlayback();
  }

  function configureSvgPlayback() {
    const stepStr = prompt("Seconds between reveal steps:", String(svgPlayback.stepMs / 1000));
    if (stepStr == null) return;

    const stepSec = parseFloat(String(stepStr).replace(/[^0-9.+-]/g, ""));
    if (!isFinite(stepSec) || stepSec <= 0) {
      showToast("Invalid step time");
      return;
    }

    const endStr = prompt("Seconds to pause at the end:", String(svgPlayback.endPauseMs / 1000));
    if (endStr == null) return;

    const endSec = parseFloat(String(endStr).replace(/[^0-9.+-]/g, ""));
    if (!isFinite(endSec) || endSec < 0) {
      showToast("Invalid end pause");
      return;
    }

    svgPlayback.stepMs = Math.max(50, Math.round(stepSec * 1000));
    svgPlayback.endPauseMs = Math.max(0, Math.round(endSec * 1000));

    showToast(`Step ${stepSec}s • End ${endSec}s`);
  }

  /* =========================
     Selection transforms
  ========================= */
  function beginSelectionTransform(kind, w) {
    const idx = state.selectionIndex;
    if (idx < 0) return false;

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;

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
    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    gesture.bgStart = { ...state.bg };
    gesture.startWorld = w;
    gesture.mode = mode;
    return true;
  }

  function beginToolTransformForSelectionOrBg(tool, w) {
    if (state.selectionIndex >= 0) {
      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
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

  state.undo.push(JSON.stringify(snapshot()));
  state.redo.length = 0;

  const obj = {
    kind: "polyFill",
    pts: pts.slice(),
    fill: state.color,
    opacity: clamp(state.opacity ?? 1, 0, 1),
    hidden: false
  };
  ensureObjId(obj);

  if (svgReveal.active && svgReveal.groupId) {
    obj.svgGroupId = svgReveal.groupId;

    // put it AFTER the next reveal step, not at the current one
    const insertAt = clamp(svgReveal.revealed + 1, 0, svgReveal.partIds.length);
    svgReveal.partIds.splice(insertAt, 0, obj._id);

    // do NOT advance revealed count
    // do NOT force it immediately into the already-revealed set
    obj.hidden = true;
  }

  // keep fills visually underneath outlines
  state.objects.unshift(obj);

  cancelPolyDraft();
  redrawAll();
  showToast("Poly filled");
  return true;
}  /* =========================
     Numeric setters
  ========================= */
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
      dx = 1; dy = 0; d = 1;
    }

    const ux = dx / d, uy = dy / d;
    obj.x2 = x1 + ux * lenPx;
    obj.y2 = y1 + uy * lenPx;

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

  /* =========================
     Pointer handlers
  ========================= */
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

function onCanvasContextMenu(e) {
  if (!inkCanvas.contains(e.target)) return;

  if (state.tool === "polyFill" && polyDraft.active) {
    e.preventDefault();

    if (polyDraft.pts.length >= 3) {
      commitPolyFill();                   // same result as Enter
    } else {
      cancelPolyDraft();
      redrawAll();
      showToast("PolyFill cancelled");
    }
    return;
  }

  if (state.tool === "arc") {
    const wasDrawingArc =
      gesture.active &&
      gesture.mode === "drawArc" &&
      gesture.activeObj?.kind === "arc";

    const hadArcCenter = arcDraft.hasCenter;

    if (wasDrawingArc) {
      const idx = state.objects.lastIndexOf(gesture.activeObj);
      if (idx >= 0) state.objects.splice(idx, 1);
    }

    if (wasDrawingArc || hadArcCenter) {
      e.preventDefault();
      arcDraft.hasCenter = false;         // same result as Esc/reset
      try { inkCanvas.releasePointerCapture(gesture.pointerId); } catch {}
      hardResetGesture();
      updateCursorFromTool();
      redrawAll();
      showToast("Arc reset");
    }
  }
}

function onPointerDown(e) {
  if (!inkCanvas.contains(e.target)) return;
  if (e.button === 2) return;             // let right-click be handled separately
  if (e.pointerType !== "touch" && e.button !== 0) return;


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

    gesture.snapCache = buildSnapCache();

    if (spacePanning) {
      gesture.mode = "pan";
      inkCanvas.style.cursor = "grabbing";
      return;
    }

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

      try { inkCanvas.releasePointerCapture(e.pointerId); } catch {}
      gesture.active = false;
      gesture.mode = "none";
      redrawAll();
      return;
    }

    if (state.tool === "text") {
      gesture.active = false;
      gesture.mode = "none";
      const text = prompt("Enter text:");
      if (!text) return;

      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;

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

    if (state.tool === "bgMove" || state.tool === "bgScale" || state.tool === "bgRotate") {
      beginToolTransformForSelectionOrBg(state.tool, w);
      return;
    }

    if (state.tool === "arc") {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;

      if (!arcDraft.hasCenter) {
        const c = snapShapePoint(w, w, bypassSnap);
        arcDraft.hasCenter = true;
        arcDraft.cx = c.x;
        arcDraft.cy = c.y;

        try { inkCanvas.releasePointerCapture(e.pointerId); } catch {}
        gesture.active = false;
        gesture.mode = "none";
        showToast("Arc center set");
        showMeasureTip(sx, sy, "Center");
        redrawAll();
        return;
      }

      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
      state.selectionIndex = -1;

      const start = { x: arcDraft.cx, y: arcDraft.cy };
      const p1 = snapShapePoint(start, w, bypassSnap);

      const cx = arcDraft.cx, cy = arcDraft.cy;
      const a1 = Math.atan2(p1.y - cy, p1.x - cx);
      let r = Math.hypot(p1.x - cx, p1.y - cy);
      r = Math.max(1, Math.round(r / pxPerMm()) * pxPerMm());

      const obj = { kind: "arc", color: state.color, size: state.size, opacity: state.opacity, lineStyle: state.lineStyle || "solid", cx, cy, r, a1, a2: a1, ccw: false };
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

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
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
        lineStyle: state.lineStyle || "solid",
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

  function onPointerMove(e) {
    const { sx, sy } = clientToScreen(e);
    updateHoverCursor(sx, sy);
    if (lenEntry.open) moveLenBoxTo(sx, sy);

    const w = screenToWorld(sx, sy);
    gesture.lastScreen = { sx, sy };
    gesture.lastWorld = w;

    if (state.tool === "polyFill" && polyDraft.active) {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;
      polyDraft.hover = snapPolyPoint(w, bypassSnap);
      redrawAll();
    }

    if (state.tool === "arc" && arcDraft.hasCenter && !gesture.active) {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;
      const start = { x: arcDraft.cx, y: arcDraft.cy };
      const p = snapShapePoint(start, w, bypassSnap);
      const rMm = Math.hypot(p.x - arcDraft.cx, p.y - arcDraft.cy) / pxPerMm();
      showMeasureTip(sx, sy, `R ${Math.round(rMm)} mm`);
    }

    if (!gesture.active) return;

    if (gesture.mode === "pan" && gesture.lastScreen) {
      const ddx = sx - (gesture.lastScreenPrev?.sx ?? gesture.startScreen.sx);
      const ddy = sy - (gesture.lastScreenPrev?.sy ?? gesture.startScreen.sy);
      state.panX += ddx;
      state.panY += ddy;
      gesture.lastScreenPrev = { sx, sy };
      redrawAll();
      return;
    }

    if (gesture.mode === "selMove" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.startWorld) {
      const dx = w.x - gesture.startWorld.x;
      const dy = w.y - gesture.startWorld.y;
      state.objects[gesture.selIndex] = deepClone(gesture.selStartObj);
      moveObject(state.objects[gesture.selIndex], dx, dy);
      redrawAll();
      return;
    }

    if (gesture.mode === "selScale" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.selAnchor && gesture.startWorld) {
      const ax = gesture.selAnchor.x, ay = gesture.selAnchor.y;
      const start = gesture.startWorld;
      const obj0 = gesture.selStartObj;

      const v0 = { x: start.x - ax, y: start.y - ay };
      const v1 = { x: w.x - ax, y: w.y - ay };

      const fxRaw = Math.abs(v0.x) < 0.001 ? 1 : v1.x / v0.x;
      const fyRaw = Math.abs(v0.y) < 0.001 ? 1 : v1.y / v0.y;

      let fx = fxRaw, fy = fyRaw;
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
      const ax = gesture.selAnchor.x, ay = gesture.selAnchor.y;
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

    if (gesture.mode === "drawArc" && gesture.activeObj && gesture.arcCenter) {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;
      const cx = gesture.arcCenter.cx, cy = gesture.arcCenter.cy;
      const p = snapShapePoint({ x: cx, y: cy }, w, bypassSnap);

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

    if ((gesture.mode === "drawStroke" || gesture.mode === "drawErase") && gesture.activeObj) {
      gesture.activeObj.points.push(w);
      redrawAll();
      return;
    }

    if (gesture.mode === "drawShape" && gesture.activeObj) {
      const k = gesture.activeObj.kind;
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;

      const startPt = { x: gesture.activeObj.x1, y: gesture.activeObj.y1 };
      let p2 = { x: w.x, y: w.y };

      if (k === "line" || k === "arrow") p2 = snapLinePoint(startPt, p2, bypassSnap);
      else if (k === "rect" || k === "circle") p2 = snapShapePoint(startPt, p2, bypassSnap);

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
    try { inkCanvas.releasePointerCapture(gesture.pointerId); } catch {}
    hardResetGesture();
    updateCursorFromTool();
    redrawAll();
  }

  /* =========================
     Keyboard
  ========================= */
  document.addEventListener("keydown", e => {
    const activeEl = document.activeElement;
    const tag = (activeEl && activeEl.tagName) || "";
    const typing = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && activeEl !== lenInput;
    const mod = isMac ? e.metaKey : e.ctrlKey;

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

    if (e.key === "Escape") {
      const wasPlaying = svgPlayback.running;
      stopSvgPlayback(true);

      openSettings(false);
      toggleColorPop(false);
      arcDraft.hasCenter = false;
      hideMeasureTip();
      closeLenBox();

      if (wasPlaying) showToast("Presentation stopped");
      return;
    }

    if (e.code === "Space") {
      spacePanning = true;
      e.preventDefault();
      return;
    }

    if (!typing && (e.key === "f" || e.key === "F")) {
      const idx = state.selectionIndex;
      const obj = idx >= 0 ? state.objects[idx] : null;

      if (obj && (obj.kind === "rect" || obj.kind === "circle")) {
        e.preventDefault();
        state.undo.push(JSON.stringify(snapshot()));
        state.redo.length = 0;

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
          lenEntry.open = true;
          lenEntry.seedMm = parseMmInput(String(curMm)) ?? null;
          openLenBoxAt(sx, sy, String(curMm));
        }

        if (isEsc) {
          lenEntry.open = false;
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
          lenEntry.open = false;
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
          lenEntry.open = true;
          lenEntry.seedMm = parseMmInput(String(curMm)) ?? null;
          openLenBoxAt(sx, sy, String(curMm));
        }

        if (isEsc) {
          lenEntry.open = false;
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
          lenEntry.open = false;
          closeLenBox();

          try { inkCanvas.releasePointerCapture(gesture.pointerId); } catch {}
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

    if (!typing && svgReveal.active && e.shiftKey && (e.key === ">" || e.code === "Period")) {
      e.preventDefault();
      toggleSvgPlayback();
      return;
    }

    if (!typing && svgReveal.active && e.shiftKey && (e.key === "<" || e.code === "Comma")) {
      e.preventDefault();
      configureSvgPlayback();
      return;
    }

    const isRevealKey =
      !e.shiftKey &&
      (e.key === "." || e.key === "," || e.code === "Period" || e.code === "Comma" || e.code === "NumpadDecimal");

    if (!typing && svgReveal.active && isRevealKey) {
      e.preventDefault();

      if (svgPlayback.running) stopSvgPlayback(true);

      const total = svgReveal.partIds.length;
      if (!total) return;

      if (e.key === "." || e.code === "Period" || e.code === "NumpadDecimal") {
        revealNextSvgPart();
        showToast(`SVG: ${Math.min(svgReveal.revealed, total)}/${total}`);
        return;
      }

      if (e.key === "," || e.code === "Comma") {
        hidePrevSvgPart();
        showToast(`SVG: ${Math.max(svgReveal.revealed, 0)}/${total}`);
        return;
      }
    }

    if (!typing && (e.key === "Delete" || e.key === "Backspace")) {
      if (state.selectionIndex >= 0) {
        state.undo.push(JSON.stringify(snapshot()));
        state.redo.length = 0;
        state.objects.splice(state.selectionIndex, 1);
        state.selectionIndex = -1;
        redrawAll();
        showToast("Deleted");
        return;
      }
    }

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
      if (k === "k") setActiveTool("polyFill");
    }

    if (mod) {
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        hardResetGesture();
        cancelPolyDraft();
        if (state.undo.length) {
          state.redo.push(JSON.stringify(snapshot()));
          applySnapshot(JSON.parse(state.undo.pop()));
        }
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        hardResetGesture();
        cancelPolyDraft();
        if (state.redo.length) {
          state.undo.push(JSON.stringify(snapshot()));
          applySnapshot(JSON.parse(state.redo.pop()));
        }
        return;
      }
    }

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
        if (e.key === "ArrowUp") state.panY += step;
        if (e.key === "ArrowDown") state.panY -= step;
        if (e.key === "ArrowLeft") state.panX += step;
        if (e.key === "ArrowRight") state.panX -= step;
        redrawAll();
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
     Canvas events
  ========================= */
  inkCanvas.addEventListener("pointerdown", onPointerDown);
  inkCanvas.addEventListener("pointermove", onPointerMove);
  inkCanvas.addEventListener("pointerup", onPointerUp);
  inkCanvas.addEventListener("pointercancel", onPointerUp);
  inkCanvas.addEventListener("contextmenu", onCanvasContextMenu);

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

      const z = clamp(state.zoom * step, 0.05, 6);
      const old = state.zoom;
      const worldX = (sx - state.panX) / old;
      const worldY = (sy - state.panY) / old;
      state.zoom = z;
      state.panX = sx - worldX * z;
      state.panY = sy - worldY * z;

      redrawAll();
    },
    { passive: false }
  );

  /* =========================
     Buttons and IO bindings
  ========================= */
  bindUI();
  bindBackgroundInput(bgFile, clearBgBtn);
  bindBoards(newBoardBtn, saveBoardBtn, loadBoardBtn, deleteBoardBtn, deleteAllBoardsBtn);
  bindSvgInput(svgInkFile, clearSvgInkBtn);
  bindExport(exportBtn, exportSvgBtn, printBtn);

  clearBtn?.addEventListener("click", () => {
    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    hardResetGesture();
    cancelPolyDraft();
    resetSvgRevealState();
    state.objects = [];
    state.selectionIndex = -1;
    setActiveTool("pen");
    redrawAll();
  });

  applyTitleBtn?.addEventListener("click", () => {
    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    state.title = (titleInput?.value || "").trim();
    redrawAll();
  });

  setScaleBtn?.addEventListener("click", () => {
    let o = state.selectionIndex >= 0 ? state.objects[state.selectionIndex] : null;
    if (!(o && (o.kind === "line" || o.kind === "arrow"))) {
      for (let i = state.objects.length - 1; i >= 0; i--) {
        const cand = state.objects[i];
        if (cand && (cand.kind === "line" || cand.kind === "arrow")) {
          o = cand;
          break;
        }
      }
    }

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

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    state.pxPerMm = lenPx / mm;
    updateScaleOut();
    redrawAll();
    showToast("Scale set");
  });

  resetScaleBtn?.addEventListener("click", () => {
    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    state.pxPerMm = DEFAULT_PX_PER_MM;
    updateScaleOut();
    redrawAll();
    showToast("Scale reset");
  });

  /* =========================
     Init
  ========================= */
  function init() {
    setColor(colorInput?.value || "#111111");
    setBrushSize(brushSize?.value || 5);
    state.opacity = parseFloat(opacityRange?.value || "1");
    updateBrushUI();
    setActiveTool("pen");
    updateScaleOut();
    refreshBoardSelect();
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