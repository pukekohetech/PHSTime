/* ==========================================================
   whiteboard.js — main bootstrap after modular split

   Requires:
   - whiteboard.shared.js
   - whiteboard.geometry.js
   - whiteboard.render.js
   - whiteboard.io.js
   - whiteboard.ui.js

   Keeps:
   - pen / eraser / line / rect / circle / regular polygon / star / arc / arrow / text / polyFill / curve
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
  const hideSelectedBtn = document.getElementById("hideSelectedBtn");
  const unhideAllBtn = document.getElementById("unhideAllBtn");
  const hideSelectedPanelBtn = document.getElementById("hideSelectedPanelBtn");
  const unhideAllPanelBtn = document.getElementById("unhideAllPanelBtn");
  const visibilityPrevBtn = document.getElementById("visibilityPrevBtn");
  const visibilityNextBtn = document.getElementById("visibilityNextBtn");
  const visibilityPlayBtn = document.getElementById("visibilityPlayBtn");
  const visibilityTimingBtn = document.getElementById("visibilityTimingBtn");
  const visibilityPrevPanelBtn = document.getElementById("visibilityPrevPanelBtn");
  const visibilityNextPanelBtn = document.getElementById("visibilityNextPanelBtn");
  const visibilityPlayPanelBtn = document.getElementById("visibilityPlayPanelBtn");
  const visibilityTimingPanelBtn = document.getElementById("visibilityTimingPanelBtn");
  const presentationBtn = document.getElementById("presentationBtn");
  const presentationPanelBtn = document.getElementById("presentationPanelBtn");
  const presentationControls = document.getElementById("presentationControls");
  const presentationPrevBtn = document.getElementById("presentationPrevBtn");
  const presentationNextBtn = document.getElementById("presentationNextBtn");
  const presentationPlayBtn = document.getElementById("presentationPlayBtn");
  const presentationBlankBtn = document.getElementById("presentationBlankBtn");
  const presentationExitBtn = document.getElementById("presentationExitBtn");
  const presentationBlank = document.getElementById("presentationBlank");
  const presentationProgressText = document.getElementById("presentationProgressText");
  const presentationProgressBar = document.getElementById("presentationProgressBar");
  const snipJoinBtn = document.getElementById("snipJoinBtn");
  const linkInspector = document.getElementById("linkInspector");
  const linkInspectorBody = document.getElementById("linkInspectorBody");
  const linkInspectorCheckBtn = document.getElementById("linkInspectorCheckBtn");
  const linkInspectorRepairBtn = document.getElementById("linkInspectorRepairBtn");
   const undoBtn = document.getElementById("undoBtn");
const redoBtn = document.getElementById("redoBtn");

  const colorBtn = document.getElementById("colorBtn");
  const colorPop = document.getElementById("colorPop");
  const colorInput = document.getElementById("colorInput");
  const brushSize = document.getElementById("brushSize");
  const brushOut = document.getElementById("brushOut");
  const swatchLive = document.getElementById("swatchLive");

  const opacityRange = document.getElementById("opacityRange");
  const opacityOut = document.getElementById("opacityOut");

  const shapeSizePanel = document.getElementById("shapeSizePanel");
  const shapeSizeCloseBtn = document.getElementById("shapeSizeCloseBtn");
  const shapeTypeSelect = document.getElementById("shapeTypeSelect");
  const shapeWidthInput = document.getElementById("shapeWidthInput");
  const shapeHeightInput = document.getElementById("shapeHeightInput");
  const shapeWidthLabel = document.getElementById("shapeWidthLabel");
  const shapeHeightLabel = document.getElementById("shapeHeightLabel");
  const shapeHeightRow = document.getElementById("shapeHeightRow");
  const shapeSizeSelectionNote = document.getElementById("shapeSizeSelectionNote");
  const shapeSizeApplyBtn = document.getElementById("shapeSizeApplyBtn");
  const shapeSizeCreateBtn = document.getElementById("shapeSizeCreateBtn");
  const regularShapeToolBtn = document.getElementById("regularShapeToolBtn");
  const shapeRegularOptions = document.getElementById("shapeRegularOptions");
  const shapeSidesInput = document.getElementById("shapeSidesInput");
  const shapeSidesLabel = document.getElementById("shapeSidesLabel");
  const shapeFilledInput = document.getElementById("shapeFilledInput");

  const settingsBtn = document.getElementById("settingsBtn");
  const settingsPanel = document.getElementById("settingsPanel");
  const settingsCloseBtn = document.getElementById("settingsCloseBtn");

  const titleInput = document.getElementById("titleInput");
  const applyTitleBtn = document.getElementById("applyTitleBtn");

  const bgFile = document.getElementById("bgFile");
  const clearBgBtn = document.getElementById("clearBgBtn");

  const svgInkFile = document.getElementById("svgInkFile");
  const quickSvgInkFile = document.getElementById("quickSvgInkFile");
  const clearSvgInkBtn = document.getElementById("clearSvgInkBtn");

  const boardSelect = document.getElementById("boardSelect");
  const newBoardBtn = document.getElementById("newBoardBtn");
  const saveBoardBtn = document.getElementById("saveBoardBtn");
  const loadBoardBtn = document.getElementById("loadBoardBtn");

  const exportBtn = document.getElementById("exportBtn");
  const exportSvgBtn = document.getElementById("exportSvgBtn");
  const printBtn = document.getElementById("printBtn");
  const printFitBtn = document.getElementById("printFitBtn");

  const scaleOut = document.getElementById("scaleOut");
  const setScaleBtn = document.getElementById("setScaleBtn");
  const resetScaleBtn = document.getElementById("resetScaleBtn");

  const deleteBoardBtn = document.getElementById("deleteBoardBtn");
  const deleteAllBoardsBtn = document.getElementById("deleteAllBoardsBtn");

  const presetConstruction = document.getElementById("presetConstruction");
  const presetOutline = document.getElementById("presetOutline");
  const presetColour = document.getElementById("presetColour");
  const presetReference = document.getElementById("presetReference");
  const presetHidden = document.getElementById("presetHidden");
  const presetCenter = document.getElementById("presetCenter");
  const lineStyleSolid = document.getElementById("lineStyleSolid");
  const lineStyleReference = document.getElementById("lineStyleReference");
  const lineStyleHidden = document.getElementById("lineStyleHidden");
  const lineStyleCenter = document.getElementById("lineStyleCenter");

  const refColorInput = document.getElementById("refColorInput");
  const refSizeInput = document.getElementById("refSizeInput");
  const hiddenColorInput = document.getElementById("hiddenColorInput");
  const hiddenSizeInput = document.getElementById("hiddenSizeInput");
  const centerColorInput = document.getElementById("centerColorInput");
  const centerSizeInput = document.getElementById("centerSizeInput");

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
    linePresetMap: {
      reference: { color: "#1b5e20", size: 10 },
      hidden: { color: "#1976d2", size: 10 },
      center: { color: "#d32f2f", size: 10 }
    },
    regularShapeSettings: { shapeType: "polygon", sides: 6, innerRatio: 0.45, filled: false },

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
selection: [],
clipboard: null,
     
    viewW: 0,
    viewH: 0
  };

  // cache raster fill canvases by object id
  const fillBitmapCache = new Map();

  // SVG reveal state
  let _nextObjId = 1;
  let _nextRevealId = 1;
  const svgReveal = { active: false, groupId: null, partIds: [], revealed: 0 };
  const MANUAL_HIDDEN_REVEAL_GROUP = "__manual_hidden_objects__";

  function syncNextObjIdCounter(objects = state.objects) {
    let maxId = 0;
    for (const obj of objects || []) {
      const m = String(obj?._id || "").match(/^o(\d+)$/);
      if (m) maxId = Math.max(maxId, Number(m[1]) || 0);
    }
    _nextObjId = Math.max(_nextObjId, maxId + 1);
    return _nextObjId;
  }

  function ensureObjId(o) {
    if (!o) return null;
    if (!o._id) {
      let id = "";
      do {
        id = `o${_nextObjId++}`;
      } while (state.objects.some(obj => obj && obj !== o && obj._id === id));
      o._id = id;
    } else {
      const m = String(o._id).match(/^o(\d+)$/);
      if (m) _nextObjId = Math.max(_nextObjId, (Number(m[1]) || 0) + 1);
    }
    return o._id;
  }

  function nextUniqueRevealId(used = null) {
    const taken = used || new Set(state.objects.map(obj => obj?._revealId).filter(Boolean));
    let id = "";
    do {
      id = `r${_nextRevealId++}`;
    } while (taken.has(id));
    return id;
  }

  function ensureRevealId(o) {
    if (!o) return null;
    if (!o._revealId) o._revealId = nextUniqueRevealId();
    const m = String(o._revealId).match(/^r(\d+)$/);
    if (m) _nextRevealId = Math.max(_nextRevealId, (Number(m[1]) || 0) + 1);
    return o._revealId;
  }

  function repairRevealIds(objects = state.objects) {
    const used = new Set();
    let repaired = 0;

    for (const obj of objects || []) {
      if (!obj || !obj.kind) continue;
      const oldId = String(obj._revealId || "").trim();
      if (!oldId || used.has(oldId)) {
        obj._revealId = nextUniqueRevealId(used);
        repaired += 1;
      } else {
        obj._revealId = oldId;
      }
      used.add(obj._revealId);
      const m = String(obj._revealId).match(/^r(\d+)$/);
      if (m) _nextRevealId = Math.max(_nextRevealId, (Number(m[1]) || 0) + 1);
    }

    return repaired;
  }

  function findObjById(id) {
    if (!id) return null;
    return state.objects.find(o => o && o._id === id) || null;
  }

  function findObjByRevealId(id) {
    if (!id) return null;
    return state.objects.find(o => o && o._revealId === id) || null;
  }

  function migrateRevealPartIds(partIds = [], groupId = null) {
    const repairedRevealIds = repairRevealIds(state.objects);
    const incoming = Array.isArray(partIds) ? partIds.filter(Boolean).map(String) : [];
    const byRevealId = new Map();
    for (const obj of state.objects) {
      if (obj && obj._revealId) byRevealId.set(obj._revealId, obj);
    }

    let candidates = [];
    if (groupId === MANUAL_HIDDEN_REVEAL_GROUP) {
      candidates = state.objects.filter(obj => obj && obj.kind);
    } else if (groupId) {
      candidates = state.objects.filter(obj => obj && obj.kind && obj.svgGroupId === groupId);
    }

    if (!candidates.length && incoming.length) {
      const legacyIds = new Set(incoming);
      candidates = state.objects.filter(obj =>
        obj && obj.kind && (
          legacyIds.has(String(obj._revealId || "")) ||
          legacyIds.has(String(obj._id || ""))
        )
      );
    }

    if (!candidates.length) {
      candidates = state.objects.filter(obj => obj && obj.kind && obj.hidden);
    }

    const candidateIds = new Set(candidates.map(obj => ensureRevealId(obj)));
    const incomingAreRevealIds = incoming.length > 0 && incoming.every(id => byRevealId.has(id));
    const migrated = [];
    const seen = new Set();

    if (incomingAreRevealIds) {
      for (const id of incoming) {
        if (!candidateIds.has(id) || seen.has(id)) continue;
        migrated.push(id);
        seen.add(id);
      }
    }

    // Legacy snapshots stored geometry IDs. Rebuild those lists in actual
    // object order so duplicate geometry IDs cannot merge reveal steps.
    for (const obj of candidates) {
      const id = ensureRevealId(obj);
      if (seen.has(id)) continue;
      migrated.push(id);
      seen.add(id);
    }

    return { partIds: migrated, repairedRevealIds };
  }

  function findObjIndexById(id) {
    if (!id) return -1;
    return state.objects.findIndex(o => o && o._id === id);
  }

  const svgPlayback = {
    running: false,
    timer: 0,
    token: 0,
    stepMs: 1000,
    endPauseMs: 5000
  };

  const presentationState = {
    active: false,
    blank: false,
    savedView: null
  };

  // Arc draft
  const arcDraft = { hasCenter: false, cx: 0, cy: 0 };

  // PolyFill draft
  const polyDraft = { active: false, pts: [], links: [], hover: null };

  // Last drawn line/arrow is used as the default Snip + Join primary line.
  let lastDrawnLineId = null;

  // Link inspector / repair overlay. Items are screen/world markers drawn over the UI canvas.
  const linkDebugOverlay = { visible: false, items: [], lastCheckAt: 0, targetId: null };

  // Selection handles cache
  const uiHandles = { visible: false, box: null, rotate: null, corners: null, poly: null, center: null, perspective: null, perspectiveSource: null, lineEndpoints: null };

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
    selStartItems: null,
    selAnchor: null,
    selStartAngle: 0,

    bgStart: null,

    arcCenter: null,
    arcR: 0,
    arcA1: 0,
    arcLastA: 0,
    arcAccum: 0,

    snapCache: null,
    perspectivePointName: null,
    perspectivePointCluster: null,
    lineAnchorRef: null,
    lineEndAnchorRef: null,
    lineResizeEnd: null,
    forceLinkActive: false,
    marqueeStart: null,
    marqueeCurrent: null,
    marqueeBaseSelection: null
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

function copySelection() {
  if (!state.selection || !state.selection.length) return;

  state.clipboard = state.selection
    .map(i => state.objects[i])
    .filter(o => !!o)
    .map(o => deepClone(o));

  showToast(`Copied ${state.clipboard.length}`);
}

function remapCopiedObjectRefs(value, idMap) {
  if (Array.isArray(value)) {
    value.forEach(item => remapCopiedObjectRefs(item, idMap));
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, child] of Object.entries(value)) {
    if ((key === "objId" || key === "targetId" || key === "guideId") && typeof child === "string" && idMap.has(child)) {
      value[key] = idMap.get(child);
    } else {
      remapCopiedObjectRefs(child, idMap);
    }
  }
}

function pasteClipboard() {
  if (!state.clipboard || !state.clipboard.length) return;

  state.undo.push(JSON.stringify(snapshot()));
  state.redo.length = 0;

  const idMap = new Map();
  const clones = state.clipboard.map(src => {
    const obj = deepClone(src);
    const oldId = obj._id || null;
    delete obj._id;
    delete obj._revealId;
    delete obj.svgGroupId;
    obj.hidden = false;
    ensureObjId(obj);
    ensureRevealId(obj);
    if (oldId) idMap.set(oldId, obj._id);
    return obj;
  });

  const newSelection = [];
  for (const obj of clones) {
    remapCopiedObjectRefs(obj, idMap);
    moveObject(obj, 20, 20);
    state.objects.push(obj);
    addObjectToActiveReveal(obj);
    newSelection.push(state.objects.length - 1);
  }

  state.selection = newSelection;
  state.selectionIndex = newSelection[newSelection.length - 1] ?? -1;

  redrawAll();
  showToast(`Pasted ${newSelection.length}`);
}

function cutSelection() {
  const indices = [...new Set((state.selection?.length ? state.selection : [state.selectionIndex])
    .filter(i => Number.isInteger(i) && i >= 0 && state.objects[i]))];
  if (!indices.length) return;

  state.selection = indices;
  state.selectionIndex = indices[indices.length - 1];
  copySelection();

  state.undo.push(JSON.stringify(snapshot()));
  state.redo.length = 0;

  indices.sort((a, b) => b - a).forEach(i => state.objects.splice(i, 1));
  state.selectionIndex = -1;
  state.selection = [];

  redrawAll();
  showToast(`Cut ${indices.length}`);
}


  function syncLinePresetInputs() {
    if (refColorInput) refColorInput.value = state.linePresetMap.reference.color;
    if (refSizeInput) refSizeInput.value = String(state.linePresetMap.reference.size);
    if (hiddenColorInput) hiddenColorInput.value = state.linePresetMap.hidden.color;
    if (hiddenSizeInput) hiddenSizeInput.value = String(state.linePresetMap.hidden.size);
    if (centerColorInput) centerColorInput.value = state.linePresetMap.center.color;
    if (centerSizeInput) centerSizeInput.value = String(state.linePresetMap.center.size);
  }

  function updateLinePreset(kind, patch = {}) {
    const preset = state.linePresetMap?.[kind];
    if (!preset) return;
    if (patch.color != null) preset.color = String(patch.color);
    if (patch.size != null) preset.size = clamp(Number(patch.size || preset.size), 1, 60);
    syncLinePresetInputs();
  }

  function applyLineStylePreset(style, show = true) {
    const picked = style || "solid";
    const patch = { lineStyle: picked };
    if (picked === "reference" || picked === "hidden" || picked === "center") {
      const preset = state.linePresetMap?.[picked] || {};
      patch.color = preset.color || (picked === "reference" ? "#1b5e20" : picked === "hidden" ? "#1976d2" : "#d32f2f");
      patch.size = clamp(Number(preset.size || 10), 1, 60);
      patch.opacity = 1;
      state.color = patch.color;
      state.size = patch.size;
      state.opacity = patch.opacity;
    }
    state.lineStyle = picked;
    updateBrushUI();
    if (state.selectionIndex >= 0) applyStyleToSelection(patch);
    if (show) showToast(picked === "solid" ? "Line style: solid" : `Line style: ${picked} (${patch.color}, ${patch.size}px)`);
  }

  function applyDrawingPreset(name, show = true) {
    const picked = name || "construction";
    const patch = {};
    if (picked === "construction") {
      patch.color = "#111111";
      patch.size = 5;
      patch.opacity = 0.85;
      patch.lineStyle = "solid";
    } else if (picked === "outline") {
      patch.color = "#111111";
      patch.size = 15;
      patch.opacity = 1;
      patch.lineStyle = "solid";
    } else if (picked === "fill") {
      patch.size = 40;
      patch.opacity = 0.25;
      patch.lineStyle = "solid";
    } else if (picked === "reference" || picked === "hidden" || picked === "center") {
      const preset = state.linePresetMap?.[picked] || {};
      patch.color = preset.color || (picked === "reference" ? "#1b5e20" : picked === "hidden" ? "#1976d2" : "#d32f2f");
      patch.size = clamp(Number(preset.size || 10), 1, 60);
      patch.opacity = 1;
      patch.lineStyle = picked;
    } else {
      return false;
    }

    if (patch.color != null) state.color = patch.color;
    if (patch.size != null) state.size = patch.size;
    if (patch.opacity != null) state.opacity = patch.opacity;
    state.lineStyle = patch.lineStyle || "solid";
    updateBrushUI();
    if (state.selectionIndex >= 0) applyStyleToSelection(patch);
    if (show) {
      const label = picked === "fill" ? "Fill" : picked[0].toUpperCase() + picked.slice(1);
      showToast(`Preset: ${label}`);
    }
    return true;
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
    detectLineStyleFromDashArray,
    regularShapePoints
  } = window.WBShared || {};

  if (!getLineDash || !svgDashArray || !detectLineStyleFromDashArray || !regularShapePoints) {
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

  function selectedObjectIndices() {
    const raw = state.selection?.length ? state.selection : [state.selectionIndex];
    return [...new Set(raw)]
      .filter(i => Number.isInteger(i) && i >= 0 && state.objects[i] && !state.objects[i].hidden);
  }

  function selectedSingleShape() {
    const indices = selectedObjectIndices();
    if (indices.length !== 1) return null;
    const index = indices[0];
    const obj = state.objects[index];
    if (!obj || !["rect", "circle", "regularShape"].includes(obj.kind)) return null;
    return { index, obj };
  }

  function shapeDimensionsMm(obj) {
    if (!obj) return { width: 0, height: 0 };
    const scale = Math.max(0.000001, pxPerMm());
    return {
      width: Math.abs(Number(obj.x2 || 0) - Number(obj.x1 || 0)) / scale,
      height: Math.abs(Number(obj.y2 || 0) - Number(obj.y1 || 0)) / scale
    };
  }

  function shapeFormKind() {
    const type = shapeTypeSelect?.value || "rect";
    if (type === "polygon" || type === "star") return "regularShape";
    return type === "oval" ? "circle" : "rect";
  }

  function shapeFormDimensions() {
    const type = shapeTypeSelect?.value || "rect";
    const width = Number.parseFloat(shapeWidthInput?.value || "");
    const rawHeight = Number.parseFloat(shapeHeightInput?.value || "");
    const height = type === "polygon" || type === "star" ? width : rawHeight;
    if (!Number.isFinite(width) || width <= 0 || width > 10000) return null;
    if (!Number.isFinite(height) || height <= 0 || height > 10000) return null;
    const regular = type === "polygon" || type === "star";
    const minimum = type === "star" ? 4 : 3;
    const sides = regular ? Math.max(minimum, Math.min(20, Math.round(Number(shapeSidesInput?.value) || (type === "star" ? 5 : 6)))) : null;
    return { width, height, type, kind: shapeFormKind(), sides, filled: regular ? !!shapeFilledInput?.checked : false };
  }

  function describeShapeType(type) {
    return ({ rect: "rectangle", oval: "oval", polygon: "polygon", star: "star" })[type] || "shape";
  }

  function updateShapeSizeForm({ prefillSelected = false, syncFromTool = false } = {}) {
    if (!shapeTypeSelect || !shapeWidthInput || !shapeHeightInput) return;
    const selected = selectedSingleShape();

    if (prefillSelected && selected) {
      const dims = shapeDimensionsMm(selected.obj);
      if (selected.obj.kind === "rect") shapeTypeSelect.value = "rect";
      else if (selected.obj.kind === "circle") shapeTypeSelect.value = "oval";
      else shapeTypeSelect.value = selected.obj.shapeType === "star" ? "star" : "polygon";
      const regularSize = selected.obj.kind === "regularShape" ? Math.max(dims.width, dims.height) : null;
      shapeWidthInput.value = String(Math.max(1, Math.round((regularSize ?? dims.width) * 10) / 10));
      shapeHeightInput.value = String(Math.max(1, Math.round((regularSize ?? dims.height) * 10) / 10));
      if (selected.obj.kind === "regularShape") {
        if (shapeSidesInput) shapeSidesInput.value = String(Math.round(Number(selected.obj.sides) || (selected.obj.shapeType === "star" ? 5 : 6)));
        if (shapeFilledInput) shapeFilledInput.checked = !!selected.obj.filled;
      }
    } else if (!selected && syncFromTool) {
      if (state.tool === "circle") shapeTypeSelect.value = "oval";
      else if (state.tool === "rect") shapeTypeSelect.value = "rect";
      else if (state.tool === "regularShape") {
        shapeTypeSelect.value = state.regularShapeSettings?.shapeType === "star" ? "star" : "polygon";
        if (shapeSidesInput) shapeSidesInput.value = String(state.regularShapeSettings?.sides || 6);
        if (shapeFilledInput) shapeFilledInput.checked = !!state.regularShapeSettings?.filled;
      }
    }

    const type = shapeTypeSelect.value;
    const oneDimension = type === "polygon" || type === "star";
    const regular = type === "polygon" || type === "star";
    shapeHeightRow?.classList.toggle("is-hidden", oneDimension);
    shapeRegularOptions?.classList.toggle("is-hidden", !regular);
    if (shapeSidesLabel) shapeSidesLabel.textContent = type === "star" ? "Points" : "Sides";
    if (shapeSidesInput) {
      shapeSidesInput.min = type === "star" ? "4" : "3";
      const min = Number(shapeSidesInput.min);
      const fallback = type === "star" ? 5 : 6;
      const current = Math.round(Number(shapeSidesInput.value) || fallback);
      shapeSidesInput.value = String(Math.max(min, Math.min(20, current)));
    }
    if (shapeWidthLabel) shapeWidthLabel.textContent = (type === "polygon" || type === "star") ? "Across corners" : "Width";
    if (shapeHeightLabel) shapeHeightLabel.textContent = "Height";
    if (oneDimension && shapeHeightInput) shapeHeightInput.value = shapeWidthInput.value;

    const desiredKind = shapeFormKind();
    const canApply = !!selected && selected.obj.kind === desiredKind;
    if (shapeSizeApplyBtn) shapeSizeApplyBtn.disabled = !canApply;
    if (shapeSizeCreateBtn) shapeSizeCreateBtn.textContent = `Create ${describeShapeType(type)}`;

    if (!shapeSizeSelectionNote) return;
    if (!selected) {
      shapeSizeSelectionNote.textContent = "No single shape is selected. Create places the new shape in the centre of the board.";
    } else {
      const dims = shapeDimensionsMm(selected.obj);
      const name = selected.obj.kind === "rect" ? "rectangle" : selected.obj.kind === "circle" ? "oval" : (selected.obj.shapeType === "star" ? "star" : "polygon");
      const sizeText = `${Math.round(dims.width * 10) / 10} × ${Math.round(dims.height * 10) / 10} mm`;
      shapeSizeSelectionNote.textContent = canApply
        ? `Selected ${name}: ${sizeText}. Apply keeps its centre and rotation.`
        : `Selected ${name}: ${sizeText}. Choose a matching shape option to apply; otherwise create a new shape.`;
    }
  }

  function syncRegularShapeSettingsFromForm() {
    const type = shapeTypeSelect?.value;
    if (type !== "polygon" && type !== "star") return;
    const minimum = type === "star" ? 4 : 3;
    state.regularShapeSettings = {
      shapeType: type,
      sides: Math.max(minimum, Math.min(20, Math.round(Number(shapeSidesInput?.value) || (type === "star" ? 5 : 6)))),
      innerRatio: 0.45,
      filled: !!shapeFilledInput?.checked
    };
  }

  function positionShapeSizePanel() {
    if (!shapeSizePanel || !regularShapeToolBtn || shapeSizePanel.classList.contains("is-hidden")) return;
    const r = regularShapeToolBtn.getBoundingClientRect();
    const gap = 10;
    const panelW = shapeSizePanel.offsetWidth || 330;
    const panelH = shapeSizePanel.offsetHeight || 300;
    let left = r.right + gap;
    if (left + panelW > window.innerWidth - 8) left = Math.max(8, r.left - panelW - gap);
    const top = Math.max(8, Math.min(r.top - 24, window.innerHeight - panelH - 8));
    shapeSizePanel.style.left = `${Math.round(left)}px`;
    shapeSizePanel.style.top = `${Math.round(top)}px`;
  }

  function openShapeSizePanel(open = true) {
    if (!shapeSizePanel) return;
    shapeSizePanel.classList.toggle("is-hidden", !open);
    regularShapeToolBtn?.setAttribute("aria-expanded", String(open));
    if (!open) return;
    updateShapeSizeForm({ prefillSelected: true, syncFromTool: true });
    requestAnimationFrame(() => {
      positionShapeSizePanel();
      shapeWidthInput?.focus({ preventScroll: true });
      shapeWidthInput?.select();
    });
  }

  function applyExactShapeSize() {
    const selected = selectedSingleShape();
    const dims = shapeFormDimensions();
    if (!selected || !dims) {
      showToast(dims ? "Select one matching rectangle, oval, polygon, or star first" : "Enter valid dimensions from 1 to 10,000 mm");
      return false;
    }
    if (selected.obj.kind !== dims.kind) {
      showToast("Choose a matching shape type, or create a new shape");
      updateShapeSizeForm();
      return false;
    }

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    const obj = selected.obj;
    const cx = (obj.x1 + obj.x2) / 2;
    const cy = (obj.y1 + obj.y2) / 2;
    const w = dims.width * pxPerMm();
    const h = dims.height * pxPerMm();
    obj.x1 = cx - w / 2;
    obj.y1 = cy - h / 2;
    obj.x2 = cx + w / 2;
    obj.y2 = cy + h / 2;
    if (obj.kind === "regularShape") {
      obj.shapeType = dims.type === "star" ? "star" : "polygon";
      obj.sides = dims.sides;
      obj.innerRatio = 0.45;
      obj.filled = !!dims.filled;
      obj.fillColor = obj.fillColor || obj.color || state.color;
      syncRegularShapeSettingsFromForm();
    }
    updatePerspectiveLinks();
    redrawAll();
    openShapeSizePanel(false);
    showToast(dims.kind === "regularShape"
      ? `${describeShapeType(dims.type)} set to ${dims.width} mm across corners`
      : `${describeShapeType(dims.type)} set to ${dims.width} × ${dims.height} mm`);
    return true;
  }

  function createExactShape() {
    const dims = shapeFormDimensions();
    if (!dims) {
      showToast("Enter valid dimensions from 1 to 10,000 mm");
      return false;
    }

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    const centre = screenToWorld(state.viewW / 2, state.viewH / 2);
    const w = dims.width * pxPerMm();
    const h = dims.height * pxPerMm();
    const obj = {
      kind: dims.kind,
      color: state.color,
      size: state.size,
      opacity: state.opacity,
      lineStyle: state.lineStyle || "solid",
      filled: false,
      fillColor: state.color,
      x1: centre.x - w / 2,
      y1: centre.y - h / 2,
      x2: centre.x + w / 2,
      y2: centre.y + h / 2,
      rot: 0,
      ...(dims.kind === "regularShape" ? {
        shapeType: dims.type === "star" ? "star" : "polygon",
        sides: dims.sides,
        innerRatio: 0.45,
        filled: !!dims.filled,
        fillColor: state.color,
        strokeVisible: true
      } : {})
    };
    if (dims.kind === "regularShape") syncRegularShapeSettingsFromForm();
    ensureObjId(obj);
    state.objects.push(obj);
    const index = state.objects.length - 1;
    state.selectionIndex = index;
    state.selection = [index];
    setActiveTool("select");
    redrawAll();
    openShapeSizePanel(false);
    showToast(dims.kind === "regularShape"
      ? `${describeShapeType(dims.type)} created at ${dims.width} mm across corners`
      : `${describeShapeType(dims.type)} created at ${dims.width} × ${dims.height} mm`);
    return true;
  }

  function selectionWorldBounds(indices = selectedObjectIndices()) {
    let out = null;
    for (const i of indices) {
      const b = objectBounds(state.objects[i]);
      if (!b) continue;
      out = out ? {
        minX: Math.min(out.minX, b.minX),
        minY: Math.min(out.minY, b.minY),
        maxX: Math.max(out.maxX, b.maxX),
        maxY: Math.max(out.maxY, b.maxY)
      } : { ...b };
    }
    return out;
  }

  function tightObjectBounds(obj) {
    if (obj && (obj.kind === "rect" || obj.kind === "circle" || obj.kind === "regularShape") && Math.abs(obj.rot || 0) < 1e-9) {
      return {
        minX: Math.min(obj.x1, obj.x2),
        minY: Math.min(obj.y1, obj.y2),
        maxX: Math.max(obj.x1, obj.x2),
        maxY: Math.max(obj.y1, obj.y2)
      };
    }
    return objectBounds(obj);
  }

  function oppositeCornerAnchor(bounds, corner) {
    if (!bounds) return null;
    const map = {
      nw: { x: bounds.maxX, y: bounds.maxY },
      ne: { x: bounds.minX, y: bounds.maxY },
      se: { x: bounds.minX, y: bounds.minY },
      sw: { x: bounds.maxX, y: bounds.minY }
    };
    return map[corner] || null;
  }

  function rotateObjectAroundAnchor(obj, angle, ax, ay) {
    if (!obj || !Number.isFinite(angle)) return;
    const rotatePt = p => rotatePoint(p.x, p.y, ax, ay, angle);

    if (obj.kind === "perspectiveGuide") {
      for (const key of ["vp1", "vp2"]) {
        if (!obj[key]) continue;
        const p = rotatePt(obj[key]);
        obj[key].x = p.x;
        obj[key].y = p.y;
      }
      return;
    }

    if (obj.kind === "polyFill" || obj.kind === "stroke" || obj.kind === "erase" || obj.kind === "curve") {
      for (const p0 of (obj.pts || obj.points || [])) {
        const p = rotatePt(p0);
        p0.x = p.x;
        p0.y = p.y;
      }
      return;
    }

    if (obj.kind === "text") {
      const m = textMetrics(obj);
      const centre = rotatePt({ x: obj.x + m.w / 2, y: obj.y + m.h / 2 });
      obj.x = centre.x - m.w / 2;
      obj.y = centre.y - m.h / 2;
      obj.rot = (obj.rot || 0) + angle;
      return;
    }

    if (obj.kind === "rect" || obj.kind === "circle" || obj.kind === "regularShape") {
      const cx = (obj.x1 + obj.x2) / 2;
      const cy = (obj.y1 + obj.y2) / 2;
      const centre = rotatePt({ x: cx, y: cy });
      const dx = centre.x - cx;
      const dy = centre.y - cy;
      obj.x1 += dx;
      obj.y1 += dy;
      obj.x2 += dx;
      obj.y2 += dy;
      obj.rot = (obj.rot || 0) + angle;
      return;
    }

    if (obj.kind === "arc") {
      const centre = rotatePt({ x: obj.cx, y: obj.cy });
      obj.cx = centre.x;
      obj.cy = centre.y;
      obj.a1 = (obj.a1 || 0) + angle;
      obj.a2 = (obj.a2 || 0) + angle;
      return;
    }

    if (obj.kind === "fillBitmap") {
      const ppw = obj.ppw || 1;
      const w = (obj.w || 1) / ppw;
      const h = (obj.h || 1) / ppw;
      const centre = rotatePt({ x: obj.x + w / 2, y: obj.y + h / 2 });
      obj.x = centre.x - w / 2;
      obj.y = centre.y - h / 2;
      obj.rot = (obj.rot || 0) + angle;
      return;
    }

    if (Number.isFinite(obj.x1) && Number.isFinite(obj.y1)) {
      const p1 = rotatePt({ x: obj.x1, y: obj.y1 });
      const p2 = rotatePt({ x: obj.x2, y: obj.y2 });
      obj.x1 = p1.x;
      obj.y1 = p1.y;
      obj.x2 = p2.x;
      obj.y2 = p2.y;
    }
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
    uiHandles.perspective = null;
    uiHandles.perspectiveSource = null;
    uiHandles.lineEndpoints = null;

    if (state.tool !== "select") return;
    if (state.selectionIndex < 0) return;
    const obj = state.objects[state.selectionIndex];
    if (!obj) return;

    const multi = selectedObjectIndices();
    if (multi.length > 1) {
      const b = selectionWorldBounds(multi);
      if (!b) return;
      const p1 = worldToScreen(b.minX, b.minY);
      const p2 = worldToScreen(b.maxX, b.maxY);
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.max(1, Math.abs(p2.x - p1.x));
      const h = Math.max(1, Math.abs(p2.y - p1.y));
      const size = 10;
      uiHandles.visible = true;
      uiHandles.box = { x, y, w, h };
      uiHandles.corners = [
        { name: "nw", x, y, s: size },
        { name: "ne", x: x + w, y, s: size },
        { name: "se", x: x + w, y: y + h, s: size },
        { name: "sw", x, y: y + h, s: size }
      ];
      uiHandles.rotate = { x: x + w / 2, y: y - 28, r: 8 };
      uiHandles.center = { x: x + w / 2, y: y + h / 2 };
      return;
    }

    if (obj.kind === "perspectiveGuide") {
      const vps = [];
      if (obj.vp1) vps.push({ name: "vp1", ...worldToScreen(obj.vp1.x, obj.vp1.y) });
      if ((obj.mode || 1) >= 2 && obj.vp2) vps.push({ name: "vp2", ...worldToScreen(obj.vp2.x, obj.vp2.y) });
      if (!vps.length) return;

      const b = objectBounds(obj);
      const p1 = worldToScreen(b.minX, b.minY);
      const p2 = worldToScreen(b.maxX, b.maxY);
      const x = Math.min(p1.x, p2.x);
      const y = Math.min(p1.y, p2.y);
      const w = Math.abs(p2.x - p1.x);
      const h = Math.abs(p2.y - p1.y);

      uiHandles.visible = true;
      uiHandles.box = { x, y, w, h };
      uiHandles.perspective = vps.map(vp => ({ ...vp, r: 9 }));

      const target = findObjById(obj.targetId);
      if (target && !target.hidden) {
        const tb = objectBounds(target);
        const tp1 = worldToScreen(tb.minX, tb.minY);
        const tp2 = worldToScreen(tb.maxX, tb.maxY);
        let sx = Math.min(tp1.x, tp2.x);
        let sy = Math.min(tp1.y, tp2.y);
        let sw = Math.abs(tp2.x - tp1.x);
        let sh = Math.abs(tp2.y - tp1.y);
        const pad = 10;
        sx -= pad;
        sy -= pad;
        sw += pad * 2;
        sh += pad * 2;
        if (sw < 34) {
          sx -= (34 - sw) / 2;
          sw = 34;
        }
        if (sh < 34) {
          sy -= (34 - sh) / 2;
          sh = 34;
        }
        uiHandles.perspectiveSource = {
          targetId: obj.targetId,
          x: sx,
          y: sy,
          w: sw,
          h: sh,
          cx: sx + sw / 2,
          cy: sy + sh / 2,
          r: 12
        };
      }

      uiHandles.corners = [];
      uiHandles.rotate = null;
      return;
    }

    const b = tightObjectBounds(obj);
    const hasOwnRot = (obj.kind === "rect" || obj.kind === "circle" || obj.kind === "regularShape" || obj.kind === "text") && (obj.rot || 0);
    if (obj.kind === "line" || obj.kind === "arrow") {
      const a = worldToScreen(obj.x1, obj.y1);
      const bpt = worldToScreen(obj.x2, obj.y2);
      const pad = 8;
      uiHandles.visible = true;
      uiHandles.box = {
        x: Math.min(a.x, bpt.x) - pad,
        y: Math.min(a.y, bpt.y) - pad,
        w: Math.abs(bpt.x - a.x) + pad * 2,
        h: Math.abs(bpt.y - a.y) + pad * 2
      };
      uiHandles.lineEndpoints = [
        { name: "start", x: a.x, y: a.y, r: 8 },
        { name: "end", x: bpt.x, y: bpt.y, r: 8 }
      ];
      uiHandles.corners = [];
      uiHandles.rotate = null;
      return;
    }


    if (hasOwnRot) {
      let w = b.maxX - b.minX;
      let h = b.maxY - b.minY;

      if (obj.kind === "rect" || obj.kind === "circle" || obj.kind === "regularShape") {
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

    if (uiHandles.perspective) {
      for (const p of uiHandles.perspective) {
        const dx = sx - p.x;
        const dy = sy - p.y;
        if (Math.hypot(dx, dy) <= p.r + 7) return { kind: "perspectivePoint", point: p.name };
      }

      const src = uiHandles.perspectiveSource;
      if (src) {
        const nearCenter = Math.hypot(sx - src.cx, sy - src.cy) <= src.r + 12;
        const inBox = sx >= src.x && sx <= src.x + src.w && sy >= src.y && sy <= src.y + src.h;
        if (nearCenter || inBox) return { kind: "perspectiveSource", targetId: src.targetId };
      }
    }

    if (uiHandles.lineEndpoints) {
      for (const p of uiHandles.lineEndpoints) {
        if (Math.hypot(sx - p.x, sy - p.y) <= p.r + 8) return { kind: "lineEnd", endName: p.name };
      }
    }

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

  function hitPerspectivePointAnywhere(sx, sy) {
    const tol = 18;
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const obj = state.objects[i];
      if (!obj || obj.hidden || obj.kind !== "perspectiveGuide") continue;
      const points = [];
      if (obj.vp1) points.push({ name: "vp1", p: obj.vp1 });
      if ((obj.mode || 1) >= 2 && obj.vp2) points.push({ name: "vp2", p: obj.vp2 });
      for (const item of points) {
        const sp = worldToScreen(item.p.x, item.p.y);
        if (Math.hypot(sx - sp.x, sy - sp.y) <= tol) {
          return { index: i, name: item.name };
        }
      }
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
    regularShapePoints,
    isAngleOnArc,
    segIntersection,
    getLineDash,
    svgDashArray,
    detectLineStyleFromDashArray,
    findObjById
  });

  const {
    pointOnArc,
    rectEdges,
    perspectiveTargetPoints,
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

  function cloneRef(ref) {
    return ref ? JSON.parse(JSON.stringify(ref)) : null;
  }

  function isLinkRef(ref) {
    return !!ref && (ref.type === "anchor" || ref.type === "intersection" || ref.type === "segmentPoint");
  }

  function preferredAnchorAt(pt) {
    const cache = gesture.snapCache || { endpoints: [] };
    const radiusWorld = SNAP_RADIUS_PX / (state.zoom || 1);
    let best = null;
    let bestD = radiusWorld;

    for (const candidate of cache.endpoints || []) {
      if (!candidate.ref || candidate.ref.type !== "anchor") continue;
      const d = Math.hypot(pt.x - candidate.x, pt.y - candidate.y);
      if (d <= bestD) {
        bestD = d;
        best = candidate;
      }
    }

    return best ? { x: best.x, y: best.y, ref: cloneRef(best.ref) } : null;
  }

  function textCornerPoint(obj, index) {
    const m = textMetrics(obj);
    const cx = obj.x + m.w / 2;
    const cy = obj.y + m.h / 2;
    const ang = obj.rot || 0;
    const pts = [
      { x: obj.x,       y: obj.y },
      { x: obj.x + m.w, y: obj.y },
      { x: obj.x + m.w, y: obj.y + m.h },
      { x: obj.x,       y: obj.y + m.h }
    ].map(point => (ang ? rotateAround(point.x, point.y, cx, cy, ang) : point));
    return pts[Math.max(0, Math.min(3, index || 0))] || null;
  }

  function circleQuarterPoint(obj, index) {
    const cx = (obj.x1 + obj.x2) / 2;
    const cy = (obj.y1 + obj.y2) / 2;
    const rx = Math.abs(obj.x2 - obj.x1) / 2;
    const ry = Math.abs(obj.y2 - obj.y1) / 2;
    const ang = obj.rot || 0;
    const t = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2][Math.max(0, Math.min(3, index || 0))] || 0;
    const ex = Math.cos(t) * rx;
    const ey = Math.sin(t) * ry;
    return {
      x: cx + ex * Math.cos(ang) - ey * Math.sin(ang),
      y: cy + ex * Math.sin(ang) + ey * Math.cos(ang)
    };
  }

  function resolveSegmentRef(ref) {
    if (!ref) return null;

    if (ref.type === "perspectiveRay") {
      const guide = findObjById(ref.guideId);
      if (!guide || guide.kind !== "perspectiveGuide") return null;
      const target = findObjById(guide.targetId);
      const vp = guide[ref.vpName];
      if (!target || !vp) return null;
      const pts = perspectiveTargetPoints ? perspectiveTargetPoints(target, vp, guide) : [];
      const src = pts[Math.max(0, Math.min(pts.length - 1, Number(ref.sourceIndex) || 0))];
      return src ? { x1: src.x, y1: src.y, x2: vp.x, y2: vp.y } : null;
    }

    if (ref.type !== "segment" || !ref.objId) return null;
    const obj = findObjById(ref.objId);
    if (!obj) return null;

    if ((obj.kind === "line" || obj.kind === "arrow") && ref.kind === "line") {
      return { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
    }

    if (obj.kind === "rect" && ref.kind === "rectEdge") {
      const edges = rectEdges(obj);
      return edges[Number(ref.index) || 0] || null;
    }

    if (obj.kind === "polyFill" && ref.kind === "polyEdge") {
      const pts = obj.pts || [];
      const i = Number(ref.index) || 0;
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : null;
    }

    if (obj.kind === "regularShape" && ref.kind === "regularShapeEdge") {
      const pts = regularShapePoints(obj);
      const i = Number(ref.index) || 0;
      const a = pts[i];
      const b = pts[(i + 1) % pts.length];
      return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : null;
    }

    if (obj.kind === "text" && ref.kind === "textEdge") {
      const i = Number(ref.index) || 0;
      const a = textCornerPoint(obj, i);
      const b = textCornerPoint(obj, (i + 1) % 4);
      return a && b ? { x1: a.x, y1: a.y, x2: b.x, y2: b.y } : null;
    }

    return null;
  }

  function resolveIntersectionPoint(ref) {
    if (!ref || ref.type !== "intersection") return null;
    const a = resolveSegmentRef(ref.a);
    const b = resolveSegmentRef(ref.b);
    if (!a || !b) return null;
    return segIntersection(a, b);
  }

  function resolveSegmentPoint(ref) {
    if (!ref || ref.type !== "segmentPoint") return null;
    const seg = resolveSegmentRef(ref.segment);
    if (!seg) return null;
    const t = Math.max(0, Math.min(1, Number(ref.t) || 0));
    return {
      x: seg.x1 + (seg.x2 - seg.x1) * t,
      y: seg.y1 + (seg.y2 - seg.y1) * t
    };
  }

  function resolveAnchorPoint(ref) {
    if (!ref) return null;
    if (ref.type === "intersection") return resolveIntersectionPoint(ref);
    if (ref.type === "segmentPoint") return resolveSegmentPoint(ref);
    if (ref.type !== "anchor") return null;
    const obj = findObjById(ref.objId);
    if (!obj) return null;
    const index = ref.index || 0;

    if ((obj.kind === "line" || obj.kind === "arrow") && ref.kind === "lineEnd") {
      return index === 1 ? { x: obj.x2, y: obj.y2 } : { x: obj.x1, y: obj.y1 };
    }

    if (obj.kind === "rect" && ref.kind === "rectCorner") {
      const corners = rectEdges(obj).map(edge => ({ x: edge.x1, y: edge.y1 }));
      return corners[Math.max(0, Math.min(3, index))] || null;
    }

    if (obj.kind === "circle" && ref.kind === "circleQuarter") {
      return circleQuarterPoint(obj, index);
    }

    if (obj.kind === "circle" && ref.kind === "circleTangent") {
      const guide = findObjById(ref.guideId);
      const vp = guide && guide.kind === "perspectiveGuide" ? guide[ref.vpName] : null;
      const pts = perspectiveTargetPoints ? perspectiveTargetPoints(obj, vp, guide) : [];
      const side = Number.isFinite(Number(ref.side)) ? Number(ref.side) : index;
      const pt = pts[Math.max(0, Math.min(pts.length - 1, side || 0))];
      return pt ? { x: pt.x, y: pt.y } : null;
    }

    if (obj.kind === "arc" && ref.kind === "arcEnd") {
      return pointOnArc(obj, index === 1 ? "end" : "start");
    }

    if (obj.kind === "arc" && ref.kind === "arcTangent") {
      const guide = findObjById(ref.guideId);
      const vp = guide && guide.kind === "perspectiveGuide" ? guide[ref.vpName] : null;
      const pts = perspectiveTargetPoints ? perspectiveTargetPoints(obj, vp, guide) : [];
      const side = Number.isFinite(Number(ref.side)) ? Number(ref.side) : index;
      const pt = pts[Math.max(0, Math.min(pts.length - 1, side || 0))];
      return pt ? { x: pt.x, y: pt.y } : null;
    }

    if (obj.kind === "polyFill" && ref.kind === "polyVertex") {
      const pt = (obj.pts || [])[index];
      return pt ? { x: pt.x, y: pt.y } : null;
    }

    if (obj.kind === "regularShape" && ref.kind === "regularShapeVertex") {
      const pt = regularShapePoints(obj)[index];
      return pt ? { x: pt.x, y: pt.y } : null;
    }

    if ((obj.kind === "stroke" || obj.kind === "erase") && ref.kind === "strokeEnd") {
      const pts = obj.points || [];
      const pt = index === 1 ? pts[pts.length - 1] : pts[0];
      return pt ? { x: pt.x, y: pt.y } : null;
    }

    if (obj.kind === "text" && ref.kind === "textCorner") {
      return textCornerPoint(obj, index);
    }

    return null;
  }

  function resolveVanishingPoint(ref) {
    if (!ref || !ref.guideId || !ref.vpName) return null;
    const guide = findObjById(ref.guideId);
    if (!guide || guide.kind !== "perspectiveGuide") return null;
    const vp = guide[ref.vpName];
    return vp ? { x: vp.x, y: vp.y } : null;
  }

  function normalizePerspectiveAnchorForVP(anchorRef, perspectiveRef, startPt) {
    if (!anchorRef || anchorRef.type !== "anchor" || !perspectiveRef) return anchorRef;
    const obj = findObjById(anchorRef.objId);
    if (!obj || (obj.kind !== "circle" && obj.kind !== "arc")) return anchorRef;

    const guide = findObjById(perspectiveRef.guideId);
    const vp = guide && guide.kind === "perspectiveGuide" ? guide[perspectiveRef.vpName] : null;
    if (!vp || !perspectiveTargetPoints) return anchorRef;

    const tangents = perspectiveTargetPoints(obj, vp, guide).filter(p => p && p.ref);
    if (!tangents.length) return anchorRef;
    if (anchorRef.kind === "circleTangent" || anchorRef.kind === "arcTangent") return anchorRef;

    let best = tangents[0];
    let bestD = Infinity;
    const probe = startPt || resolveAnchorPoint(anchorRef) || (obj.kind === "arc" ? { x: obj.cx + obj.r, y: obj.cy } : { x: obj.x1, y: obj.y1 });
    for (const t of tangents) {
      const d = Math.hypot(t.x - probe.x, t.y - probe.y);
      if (d < bestD) {
        bestD = d;
        best = t;
      }
    }
    return best.ref ? cloneRef(best.ref) : anchorRef;
  }

  function findBestLinkRefAtPoint(pt, skipObjId) {
    const saved = gesture.snapCache;
    gesture.snapCache = buildSnapCache(skipObjId);
    const hit = snapPointPreferEndsIntersections(pt);
    gesture.snapCache = saved;
    return hit && hit.ref && isLinkRef(hit.ref) ? cloneRef(hit.ref) : null;
  }

  function stableEndpointSnapForPerspectivePoint(rawPt, opts = {}) {
    const bypassSnap = !!opts.bypassSnap;
    if (bypassSnap) return { x: rawPt.x, y: rawPt.y };

    const radiusWorld = SNAP_RADIUS_PX / Math.max(0.001, state.zoom || 1);
    const cache = gesture.snapCache || buildSnapCache(opts.skipObjId);
    let best = null;
    let bestD = radiusWorld;

    // Perspective handles used to snap to every line intersection, including the
    // temporary intersections created by their own projection rays. With lots of
    // construction lines that made a moving vanishing point suddenly jump to a
    // far, stale-looking point. Keep handles snappable, but only to stable real
    // endpoints/corners by default.
    for (const c of cache.endpoints || []) {
      if (!c || !Number.isFinite(c.x) || !Number.isFinite(c.y)) continue;
      if (!c.ref) continue;
      if (c.ref.type === "perspectivePoint") continue;
      if (isPerspectiveConstructionRef(c.ref)) continue;
      const d = Math.hypot(rawPt.x - c.x, rawPt.y - c.y);
      if (d <= bestD) {
        bestD = d;
        best = c;
      }
    }

    if (best) return { x: best.x, y: best.y, ref: cloneRef(best.ref) };
    if (opts.gridSnap) return snapToMmGridWorld(rawPt);
    return { x: rawPt.x, y: rawPt.y };
  }

  function lineSegmentFromObject(obj) {
    if (!obj || (obj.kind !== "line" && obj.kind !== "arrow")) return null;
    if (![obj.x1, obj.y1, obj.x2, obj.y2].every(Number.isFinite)) return null;
    if (Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) <= 0.001) return null;
    return { x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2 };
  }

  function pointProjectionOnSegment(pt, seg) {
    const vx = seg.x2 - seg.x1;
    const vy = seg.y2 - seg.y1;
    const len2 = vx * vx + vy * vy;
    if (len2 <= 1e-9) return null;
    const t = clamp((((pt.x - seg.x1) * vx) + ((pt.y - seg.y1) * vy)) / len2, 0, 1);
    return {
      x: seg.x1 + vx * t,
      y: seg.y1 + vy * t,
      t
    };
  }

  function segmentPointRefForLine(obj, t) {
    if (!obj || !obj._id) return null;
    return {
      type: "segmentPoint",
      segment: { type: "segment", objId: obj._id, kind: "line" },
      t: clamp(t || 0, 0, 1)
    };
  }

  function lineEndPoint(obj, endName) {
    if (!obj) return null;
    return endName === "end" ? { x: obj.x2, y: obj.y2 } : { x: obj.x1, y: obj.y1 };
  }

  function lineEndRef(obj, endName) {
    if (!obj) return null;
    ensureObjId(obj);
    return { type: "anchor", objId: obj._id, kind: "lineEnd", index: endName === "end" ? 1 : 0 };
  }

  function nearestLineEndName(obj, p) {
    const ds = Math.hypot(obj.x1 - p.x, obj.y1 - p.y);
    const de = Math.hypot(obj.x2 - p.x, obj.y2 - p.y);
    return de < ds ? "end" : "start";
  }

  function setLineEndPoint(obj, endName, p) {
    if (!obj || !p) return false;
    if (endName === "end") {
      obj.x2 = p.x;
      obj.y2 = p.y;
    } else {
      obj.x1 = p.x;
      obj.y1 = p.y;
    }
    return true;
  }

  function lineTForPoint(obj, p) {
    const seg = lineSegmentFromObject(obj);
    if (!seg || !p) return 0;
    const hit = pointProjectionOnSegment(p, seg);
    return hit ? clamp(hit.t, 0, 1) : 0;
  }

  function cutPerspectiveLineEndToPoint(obj, p) {
    if (!obj || !obj.perspectiveLink || !p) return false;
    const anchor = resolveAnchorPoint(obj.perspectiveLink.anchor);
    const vp = resolveVanishingPoint(obj.perspectiveLink.vp);
    if (!anchor || !vp) return false;
    const full = Math.hypot(vp.x - anchor.x, vp.y - anchor.y);
    const partial = Math.hypot(p.x - anchor.x, p.y - anchor.y);
    if (!Number.isFinite(full) || full <= 0.001 || !Number.isFinite(partial)) return false;

    obj.perspectiveLink.endMode = "length";
    obj.perspectiveLink.rayT = Math.max(0.001, partial / full);
    obj.perspectiveLink.lengthWorld = partial;
    obj.x1 = anchor.x;
    obj.y1 = anchor.y;
    obj.x2 = p.x;
    obj.y2 = p.y;
    return true;
  }

  function snapRefForPolyPoint(p) {
    if (!p || !p.ref || !isLinkRef(p.ref)) return null;
    return cloneRef(p.ref);
  }

  function lineLikeObjById(id) {
    const obj = findObjById(id);
    return obj && !obj.hidden && (obj.kind === "line" || obj.kind === "arrow") ? obj : null;
  }

  function lastDrawnSnipLine() {
    return lineLikeObjById(lastDrawnLineId);
  }

  function linkPolyFillVerticesNearPoint(point, ref, skipObjIds = []) {
    if (!point || !ref) return 0;
    const skip = new Set((skipObjIds || []).filter(Boolean));
    const tol = (SNAP_RADIUS_PX * 1.1) / Math.max(0.001, state.zoom || 1);
    let count = 0;

    for (const obj of state.objects) {
      if (!obj || obj.hidden || obj.kind !== "polyFill" || !Array.isArray(obj.pts)) continue;
      if (obj._id && skip.has(obj._id)) continue;
      if (!obj.vertexLinks) obj.vertexLinks = [];

      for (let i = 0; i < obj.pts.length; i++) {
        const pt = obj.pts[i];
        if (!pt) continue;
        if (Math.hypot(pt.x - point.x, pt.y - point.y) > tol) continue;
        if (obj._id && refDependsOnObject(ref, obj._id, new Set())) continue;
        obj.vertexLinks[i] = cloneRef(ref);
        count++;
      }
    }
    return count;
  }

  function selectedSnipLines() {
    return (state.selection || [])
      .map(i => state.objects[i])
      .filter(o => o && !o.hidden && (o.kind === "line" || o.kind === "arrow"));
  }

  function allSnippableLinesExcept(obj) {
    return state.objects.filter(o =>
      o &&
      o !== obj &&
      !o.hidden &&
      (o.kind === "line" || o.kind === "arrow") &&
      (!obj || o._id !== obj._id)
    );
  }

  function findSnipPartnerForSingleLine(primary) {
    const sa = lineSegmentFromObject(primary);
    if (!sa) return null;

    const pointer = gesture.lastWorld || gesture.startWorld || null;
    const nearTol = 24 / (state.zoom || 1);
    const candidates = [];

    for (const other of allSnippableLinesExcept(primary)) {
      const sb = lineSegmentFromObject(other);
      if (!sb) continue;
      const p = segIntersection(sa, sb);
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;

      let score = 0;
      let nearPointer = true;
      if (pointer) {
        const dLine = distToSeg(pointer.x, pointer.y, sb.x1, sb.y1, sb.x2, sb.y2);
        const dHit = Math.hypot(pointer.x - p.x, pointer.y - p.y);
        score = Math.min(dLine, dHit);
        nearPointer = score <= nearTol;
      } else {
        const aMidX = (sa.x1 + sa.x2) / 2;
        const aMidY = (sa.y1 + sa.y2) / 2;
        score = Math.hypot(aMidX - p.x, aMidY - p.y);
      }

      candidates.push({ line: other, point: p, score, nearPointer });
    }

    if (!candidates.length) return null;
    candidates.sort((a, b) => a.score - b.score);

    const nearby = candidates.filter(c => c.nearPointer);
    if (nearby.length === 1) return nearby[0];
    if (nearby.length > 1) return nearby[0];

    // If there is only one possible crossing, allow it even without hover help.
    // If there are several, refuse rather than guessing the wrong one.
    if (candidates.length === 1) return candidates[0];
    return { ambiguous: true, count: candidates.length };
  }

  function snipJoinCandidateLines() {
    // Safe behaviour:
    // 1) exactly two selected lines: use those;
    // 2) one selected line: use the crossing line nearest the pointer/hover;
    // 3) no selected lines: use the last drawn line as the primary;
    // 4) otherwise refuse rather than guessing.
    const selected = selectedSnipLines();
    if (selected.length >= 2) return selected;

    const primary = selected.length === 1 ? selected[0] : lastDrawnSnipLine();
    if (!primary) return selected;

    const partner = findSnipPartnerForSingleLine(primary);
    if (partner && partner.line) return [primary, partner.line];
    return [primary];
  }

  function snipAndJoinLineIntersections() {
    const selected = selectedSnipLines();
    const lines = snipJoinCandidateLines();
    if (lines.length < 2) {
      const primary = selected.length === 1 ? selected[0] : lastDrawnSnipLine();
      if (primary) {
        const partner = findSnipPartnerForSingleLine(primary);
        if (partner && partner.ambiguous) {
          return { changed: false, count: 0, reason: "Several crossings found — hover near the line/intersection you want, or Shift-click the second line" };
        }
        return { changed: false, count: 0, reason: "Hover near the crossing line/intersection, then press J or ✂" };
      }
      return { changed: false, count: 0, reason: "Draw/select a line, hover near the crossing line, then press J or ✂" };
    }
    if (lines.length > 2) {
      return { changed: false, count: 0, reason: "Too many lines selected — select the two lines you want to snip" };
    }

    const a = lines[0];
    const b = lines[1];
    if (!a || !b || a === b || a._id === b._id) {
      return { changed: false, count: 0, reason: "Select two different lines" };
    }

    const sa = lineSegmentFromObject(a);
    const sb = lineSegmentFromObject(b);
    if (!sa || !sb) {
      return { changed: false, count: 0, reason: "One selected line is too short to snip" };
    }

    const p = segIntersection(sa, sb);
    if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) {
      return { changed: false, count: 0, reason: "Selected lines do not cross each other" };
    }

    const aEnd = nearestLineEndName(a, p);
    const bEnd = nearestLineEndName(b, p);
    const aEndPt = lineEndPoint(a, aEnd);
    const bEndPt = lineEndPoint(b, bEnd);
    const aMove = aEndPt ? Math.hypot(aEndPt.x - p.x, aEndPt.y - p.y) : 0;
    const bMove = bEndPt ? Math.hypot(bEndPt.x - p.x, bEndPt.y - p.y) : 0;

    const aCanCut = !a.perspectiveLink || aEnd === "end";
    const bCanCut = !b.perspectiveLink || bEnd === "end";
    if (!aCanCut && !bCanCut) {
      return { changed: false, count: 0, reason: "Those perspective lines can only be snipped at their free ends" };
    }

    // Prefer a perspective construction line as the master, so ordinary connector
    // lines follow the perspective construction rather than driving it.
    let master = a;
    let masterEnd = aEnd;
    let slave = b;
    let slaveEnd = bEnd;

    const aIsPerspective = isPerspectiveConstructionObject(a);
    const bIsPerspective = isPerspectiveConstructionObject(b);
    if (!aIsPerspective && bIsPerspective) {
      master = b;
      masterEnd = bEnd;
      slave = a;
      slaveEnd = aEnd;
    } else if (aIsPerspective === bIsPerspective && bMove > aMove) {
      master = a;
      masterEnd = aEnd;
      slave = b;
      slaveEnd = bEnd;
    }

    if (master.perspectiveLink) {
      if (masterEnd !== "end") {
        return { changed: false, count: 0, reason: "Perspective lines can only be snipped at their free ends" };
      }
      cutPerspectiveLineEndToPoint(master, p);
    } else {
      setLineEndPoint(master, masterEnd, p);
      if (master.endpointLinks?.floatFree) delete master.endpointLinks.floatFree;
    }

    const masterRef = lineEndRef(master, masterEnd);
    if (!masterRef) return { changed: false, count: 0, reason: "Could not create a join point" };

    if (slave.perspectiveLink) {
      if (slaveEnd !== "end") {
        return { changed: false, count: 0, reason: "Perspective lines can only be snipped at their free ends" };
      }
      cutPerspectiveLineEndToPoint(slave, p);
      // Do not endpoint-link a perspective line back to the other line; its own
      // proportional perspective link should remain the driver.
    } else {
      setLineEndPoint(slave, slaveEnd, p);
      if (!refDependsOnObject(masterRef, slave._id, new Set())) {
        setEndpointLink(slave, slaveEnd, masterRef);
      }
    }

    const polyLinked = linkPolyFillVerticesNearPoint(p, masterRef, [master._id, slave._id]);
    updatePerspectiveLinks();
    return { changed: true, count: 1 + polyLinked, reason: "" };
  }

  function setEndpointLink(obj, endName, ref) {
    if (!obj || !ref) return false;
    if (!obj.endpointLinks) obj.endpointLinks = {};
    const before = JSON.stringify(obj.endpointLinks[endName] || null);
    obj.endpointLinks[endName] = cloneRef(ref);
    if (obj.endpointLinks.floatFree) delete obj.endpointLinks.floatFree;
    return before !== JSON.stringify(obj.endpointLinks[endName]);
  }

  function refDirectObjIds(ref, out = []) {
    if (!ref) return out;
    if ((ref.type === "anchor" || ref.type === "segment") && ref.objId) out.push(ref.objId);
    if (ref.type === "segmentPoint") refDirectObjIds(ref.segment, out);
    if (ref.type === "intersection") {
      refDirectObjIds(ref.a, out);
      refDirectObjIds(ref.b, out);
    }
    if (ref.type === "perspectiveRay" && ref.guideId) out.push(ref.guideId);
    if (ref.type === "perspectivePoint" && ref.guideId) out.push(ref.guideId);
    return out;
  }

  function refDependsOnObject(ref, targetObjId, seen = new Set()) {
    if (!ref || !targetObjId) return false;
    for (const id of refDirectObjIds(ref, [])) {
      if (id === targetObjId) return true;
      if (seen.has(id)) continue;
      seen.add(id);
      const obj = findObjById(id);
      if (objectDependsOnObject(obj, targetObjId, seen)) return true;
    }
    return false;
  }

  function objectDependsOnObject(obj, targetObjId, seen = new Set()) {
    if (!obj || !targetObjId) return false;
    if (obj._id === targetObjId) return true;
    if (obj.perspectiveLink) {
      if (refDependsOnObject(obj.perspectiveLink.anchor, targetObjId, seen)) return true;
      if (refDependsOnObject(obj.perspectiveLink.vp, targetObjId, seen)) return true;
    }
    if (obj.endpointLinks) {
      if (refDependsOnObject(obj.endpointLinks.start, targetObjId, seen)) return true;
      if (refDependsOnObject(obj.endpointLinks.end, targetObjId, seen)) return true;
    }
    return false;
  }

  function sanitizeEndpointLinkCycles(obj) {
    if (!obj || !obj._id || !obj.endpointLinks) return false;
    let changed = false;
    if (refDependsOnObject(obj.endpointLinks.start, obj._id, new Set())) {
      delete obj.endpointLinks.start;
      changed = true;
    }
    if (refDependsOnObject(obj.endpointLinks.end, obj._id, new Set())) {
      delete obj.endpointLinks.end;
      changed = true;
    }
    if (!obj.endpointLinks.start && !obj.endpointLinks.end) {
      delete obj.endpointLinks;
      changed = true;
    }
    return changed;
  }

  function autoLinkLineObject(obj) {
    if (!obj || (obj.kind !== "line" && obj.kind !== "arrow") || obj.perspectiveLink || !obj._id) return false;

    const rawStartRef = findBestLinkRefAtPoint({ x: obj.x1, y: obj.y1 }, obj._id);
    const rawEndRef = findBestLinkRefAtPoint({ x: obj.x2, y: obj.y2 }, obj._id);
    const startRef = rawStartRef && !refDependsOnObject(rawStartRef, obj._id, new Set()) ? rawStartRef : null;
    const endRef = rawEndRef && !refDependsOnObject(rawEndRef, obj._id, new Set()) ? rawEndRef : null;

    if (startRef || endRef) {
      obj.endpointLinks = {
        ...(startRef ? { start: startRef } : {}),
        ...(endRef ? { end: endRef } : {})
      };
      updateEndpointLinkedObject(obj);
      return true;
    }

    if (obj.endpointLinks) {
      delete obj.endpointLinks;
      return true;
    }
    return false;
  }

  function autoLinkLinesTouchingDrawnLine(activeLine) {
    if (!activeLine || (activeLine.kind !== "line" && activeLine.kind !== "arrow") || !activeLine._id) return false;
    const activeSeg = lineSegmentFromObject(activeLine);
    if (!activeSeg) return false;

    const radiusWorld = (SNAP_RADIUS_PX * 1.35) / (state.zoom || 1);
    let changed = false;

    // First repair the line being drawn: its two ends can link to any line body,
    // endpoint, intersection, projection ray, or perspective guide ray already under them.
    changed = autoLinkLineObject(activeLine) || changed;

    for (const obj of state.objects) {
      if (!obj || obj === activeLine || obj._id === activeLine._id || obj.hidden) continue;
      if (obj.kind !== "line" && obj.kind !== "arrow") continue;
      if (obj.perspectiveLink) continue;

      const candidates = [
        { endName: "start", pt: { x: obj.x1, y: obj.y1 } },
        { endName: "end", pt: { x: obj.x2, y: obj.y2 } }
      ];

      for (const c of candidates) {
        const hit = pointProjectionOnSegment(c.pt, activeSeg);
        if (!hit) continue;
        const d = Math.hypot(c.pt.x - hit.x, c.pt.y - hit.y);
        if (d > radiusWorld) continue;
        const ref = segmentPointRefForLine(activeLine, hit.t);
        if (!ref || refDependsOnObject(ref, obj._id, new Set())) continue;
        changed = setEndpointLink(obj, c.endName, ref) || changed;
      }
    }

    updatePerspectiveLinks();
    return changed;
  }

  function autoLinkOverlappingLines(lineObjs) {
    const items = (lineObjs || []).filter(o => o && (o.kind === "line" || o.kind === "arrow"));
    let changed = false;
    for (let pass = 0; pass < 3; pass++) {
      let passChanged = false;
      for (const obj of items) {
        passChanged = autoLinkLineObject(obj) || passChanged;
        passChanged = autoLinkLinesTouchingDrawnLine(obj) || passChanged;
      }
      updatePerspectiveLinks();
      changed = changed || passChanged;
      if (!passChanged) break;
    }
    return changed;
  }

  function updatePerspectiveLinkedObject(obj) {
    if (!obj || (obj.kind !== "line" && obj.kind !== "arrow") || !obj.perspectiveLink) return false;
    const anchor = resolveAnchorPoint(obj.perspectiveLink.anchor);
    const vp = resolveVanishingPoint(obj.perspectiveLink.vp);
    if (!anchor || !vp) return false;

    obj.x1 = anchor.x;
    obj.y1 = anchor.y;

    const sign = obj.perspectiveLink.direction === -1 ? -1 : 1;
    const dx = (vp.x - anchor.x) * sign;
    const dy = (vp.y - anchor.y) * sign;
    const lenToVp = Math.hypot(vp.x - anchor.x, vp.y - anchor.y);
    if (!Number.isFinite(lenToVp) || lenToVp < 0.001) return false;

    if (obj.perspectiveLink.endMode === "point") {
      obj.x2 = vp.x;
      obj.y2 = vp.y;
      obj.perspectiveLink.rayT = 1;
      obj.perspectiveLink.lengthWorld = lenToVp;
      return true;
    }

    let rayT = Number(obj.perspectiveLink.rayT);
    if (!Number.isFinite(rayT) || rayT <= 0) {
      let lengthWorld = Number(obj.perspectiveLink.lengthWorld);
      if (!Number.isFinite(lengthWorld) || lengthWorld <= 0.001) {
        lengthWorld = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) || pxPerMm();
      }
      rayT = Math.max(0.001, lengthWorld / lenToVp);
      obj.perspectiveLink.rayT = rayT;
    }

    const lengthWorld = lenToVp * rayT;
    obj.perspectiveLink.lengthWorld = lengthWorld;
    obj.x2 = anchor.x + (dx / lenToVp) * lengthWorld;
    obj.y2 = anchor.y + (dy / lenToVp) * lengthWorld;
    return true;
  }

  function ensurePerspectiveExtensionHelper(sourceLine) {
    if (!sourceLine || (sourceLine.kind !== "line" && sourceLine.kind !== "arrow") || !sourceLine.perspectiveLink || sourceLine.autoPerspectiveHelper) return false;
    const sourceId = ensureObjId(sourceLine);
    const vpRef = cloneRef(sourceLine.perspectiveLink.vp);
    const vp = resolveVanishingPoint(vpRef);
    if (!vp) return false;

    const existing = state.objects.find(o => o && o.autoPerspectiveHelper && o.helperFor === sourceId);
    if (existing) {
      existing.color = "#d32f2f";
      existing.size = Math.max(3.5, Number(existing.size) || 0);
      existing.opacity = 0.78;
      existing.lineStyle = "reference";
      existing.perspectiveLink = {
        anchor: { type: "anchor", objId: sourceId, kind: "lineEnd", index: 1 },
        vp: vpRef,
        endMode: "point",
        rayT: 1,
        direction: 1
      };
      updatePerspectiveLinkedObject(existing);
      return true;
    }

    const helper = {
      kind: "line",
      color: "#d32f2f",
      size: 3.5,
      opacity: 0.78,
      lineStyle: "reference",
      x1: sourceLine.x2,
      y1: sourceLine.y2,
      x2: vp.x,
      y2: vp.y,
      rot: 0,
      autoPerspectiveHelper: true,
      helperFor: sourceId,
      perspectiveLink: {
        anchor: { type: "anchor", objId: sourceId, kind: "lineEnd", index: 1 },
        vp: vpRef,
        endMode: "point",
        rayT: 1,
        direction: 1
      }
    };
    ensureObjId(helper);
    state.objects.push(helper);
    addObjectToActiveReveal(helper, { hide: false });
    updatePerspectiveLinkedObject(helper);
    return true;
  }

  function isPerspectiveConstructionObject(obj, seen = new Set()) {
    if (!obj) return false;
    if (obj.kind === "perspectiveGuide") return true;
    if (obj.perspectiveLink) return true;
    if (!obj._id || seen.has(obj._id)) return false;
    seen.add(obj._id);

    if (obj.endpointLinks) {
      if (obj.endpointLinks.floatFree) return true;
      if (isPerspectiveConstructionRef(obj.endpointLinks.start, seen)) return true;
      if (isPerspectiveConstructionRef(obj.endpointLinks.end, seen)) return true;
    }
    return false;
  }

  function isPerspectiveConstructionRef(ref, seen = new Set()) {
    if (!ref) return false;
    if (ref.type === "perspectiveRay" || ref.type === "perspectivePoint") return true;
    if (ref.type === "intersection") {
      return isPerspectiveConstructionRef(ref.a, seen) || isPerspectiveConstructionRef(ref.b, seen);
    }
    if (ref.type === "segmentPoint") {
      return isPerspectiveConstructionRef(ref.segment, seen);
    }
    if ((ref.type === "segment" || ref.type === "anchor") && ref.objId) {
      const target = findObjById(ref.objId);
      return isPerspectiveConstructionObject(target, seen);
    }
    return false;
  }

  function ensureFloatingFreeEnd(obj, linkedEnd, linkedPt) {
    if (!obj || !obj.endpointLinks || !linkedPt) return null;
    let f = obj.endpointLinks.floatFree;
    if (!f || f.linkedEnd !== linkedEnd || !Number.isFinite(f.dx) || !Number.isFinite(f.dy)) {
      if (linkedEnd === "start") {
        f = { linkedEnd, dx: obj.x2 - linkedPt.x, dy: obj.y2 - linkedPt.y };
      } else {
        f = { linkedEnd, dx: obj.x1 - linkedPt.x, dy: obj.y1 - linkedPt.y };
      }
      obj.endpointLinks.floatFree = f;
    }
    return f;
  }

  function updateEndpointLinkedObject(obj) {
    if (!obj || (obj.kind !== "line" && obj.kind !== "arrow") || !obj.endpointLinks) return false;
    if (obj.perspectiveLink && obj.endpointLinks.start && obj.endpointLinks.end) {
      delete obj.perspectiveLink;
    }
    if (obj.perspectiveLink) return false;

    let changed = false;
    let start = resolveAnchorPoint(obj.endpointLinks.start);
    let end = resolveAnchorPoint(obj.endpointLinks.end);

    if (start) {
      obj.endpointLinks.lastStart = { x: start.x, y: start.y };
    } else if (obj.endpointLinks.lastStart && isPerspectiveConstructionRef(obj.endpointLinks.start)) {
      start = { x: obj.endpointLinks.lastStart.x, y: obj.endpointLinks.lastStart.y };
    }

    if (end) {
      obj.endpointLinks.lastEnd = { x: end.x, y: end.y };
    } else if (obj.endpointLinks.lastEnd && isPerspectiveConstructionRef(obj.endpointLinks.end)) {
      end = { x: obj.endpointLinks.lastEnd.x, y: obj.endpointLinks.lastEnd.y };
    }

    if (start && end) {
      obj.x1 = start.x;
      obj.y1 = start.y;
      obj.x2 = end.x;
      obj.y2 = end.y;
      if (obj.endpointLinks.floatFree) delete obj.endpointLinks.floatFree;
      return true;
    }

    if (start) {
      const shouldFloatFreeEnd = isPerspectiveConstructionRef(obj.endpointLinks.start) || !!obj.endpointLinks.floatFree;
      if (shouldFloatFreeEnd) {
        const f = ensureFloatingFreeEnd(obj, "start", start);
        obj.x1 = start.x;
        obj.y1 = start.y;
        if (f) {
          obj.x2 = start.x + f.dx;
          obj.y2 = start.y + f.dy;
        }
      } else {
        obj.x1 = start.x;
        obj.y1 = start.y;
      }
      changed = true;
    }

    if (end) {
      const shouldFloatFreeEnd = isPerspectiveConstructionRef(obj.endpointLinks.end) || !!obj.endpointLinks.floatFree;
      if (shouldFloatFreeEnd) {
        const f = ensureFloatingFreeEnd(obj, "end", end);
        obj.x2 = end.x;
        obj.y2 = end.y;
        if (f) {
          obj.x1 = end.x + f.dx;
          obj.y1 = end.y + f.dy;
        }
      } else {
        obj.x2 = end.x;
        obj.y2 = end.y;
      }
      changed = true;
    }

    if (!start && !end) {
      // Keep construction references around briefly instead of dropping them at
      // the first invalid intersection. This avoids the visible "jump then dead"
      // failure when a moving VP passes through a near-parallel/near-tangent state.
      if (!obj.endpointLinks.lastStart && !obj.endpointLinks.lastEnd) delete obj.endpointLinks;
      return false;
    }
    return changed;
  }

  function updatePolyFillLinkedObject(obj) {
    if (!obj || obj.kind !== "polyFill" || !Array.isArray(obj.pts) || !Array.isArray(obj.vertexLinks)) return false;
    let changed = false;
    if (!Array.isArray(obj.vertexLinkLast)) obj.vertexLinkLast = [];

    for (let i = 0; i < obj.pts.length; i++) {
      const ref = obj.vertexLinks[i];
      if (!ref) continue;

      if (obj._id && refDependsOnObject(ref, obj._id, new Set())) {
        obj.vertexLinks[i] = null;
        continue;
      }

      const p = resolveAnchorPoint(ref);
      if (p && Number.isFinite(p.x) && Number.isFinite(p.y)) {
        const cur = obj.pts[i] || { x: p.x, y: p.y };
        if (Math.hypot(cur.x - p.x, cur.y - p.y) > 0.001) {
          obj.pts[i] = { x: p.x, y: p.y };
          changed = true;
        }
        obj.vertexLinkLast[i] = { x: p.x, y: p.y };
      } else if (obj.vertexLinkLast[i]) {
        const last = obj.vertexLinkLast[i];
        const cur = obj.pts[i] || last;
        if (Math.hypot(cur.x - last.x, cur.y - last.y) > 0.001) {
          obj.pts[i] = { x: last.x, y: last.y };
          changed = true;
        }
      }
    }

    if (!obj.vertexLinks.some(Boolean)) {
      delete obj.vertexLinks;
      delete obj.vertexLinkLast;
    }
    return changed;
  }


  function htmlEscape(str) {
    return String(str ?? "").replace(/[&<>"']/g, ch => {
      if (ch === "&") return "&amp;";
      if (ch === "<") return "&lt;";
      if (ch === ">") return "&gt;";
      if (ch === "\"") return "&quot;";
      return "&#39;";
    });
  }

  function objectLabel(obj) {
    if (!obj) return "missing";
    const kind = obj.kind || "object";
    const id = obj._id ? ` ${obj._id}` : "";
    return `${kind}${id}`;
  }

  function shortRefLabel(ref) {
    if (!ref) return "free";
    if (ref.type === "anchor") {
      const obj = findObjById(ref.objId);
      const suffix = ref.kind === "lineEnd" ? (Number(ref.index) === 1 ? "end" : "start") : (ref.kind || "anchor");
      return `${objectLabel(obj)} ${suffix}`;
    }
    if (ref.type === "intersection") return "intersection";
    if (ref.type === "segmentPoint") return "line body";
    if (ref.type === "perspectiveRay") return "perspective ray";
    if (ref.type === "perspectivePoint") return `VP ${ref.name || ref.vpName || ""}`.trim();
    if (ref.guideId && ref.vpName) return `${ref.vpName}`;
    return ref.type || "link";
  }

  function pointForLinkRef(ref) {
    if (!ref) return null;
    if (ref.guideId && ref.vpName && !ref.type) return resolveVanishingPoint(ref);
    if (ref.type === "perspectivePoint") return resolveVanishingPoint({ guideId: ref.guideId, vpName: ref.name || ref.vpName });
    return resolveAnchorPoint(ref);
  }

  function linkStatus(ref, ownerObj) {
    if (!ref) return { status: "free", cls: "linkInspector__free", label: "free", point: null };
    const circular = ownerObj && ownerObj._id && refDependsOnObject(ref, ownerObj._id, new Set());
    const point = pointForLinkRef(ref);
    if (circular) return { status: "bad", cls: "linkInspector__bad", label: "circular link", point };
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return { status: "bad", cls: "linkInspector__bad", label: "broken", point: null };
    return { status: "ok", cls: "linkInspector__ok", label: "linked", point };
  }

  function pushDebugPoint(items, point, status, label, ref) {
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return;
    items.push({ kind: "point", x: point.x, y: point.y, status, label, ref: ref ? cloneRef(ref) : null });
  }

  function pushDebugBox(items, obj, status, label) {
    if (!obj) return;
    const b = objectBounds(obj);
    if (!b || ![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) return;
    items.push({ kind: "box", minX: b.minX, minY: b.minY, maxX: b.maxX, maxY: b.maxY, status, label });
  }

  function lineEndpointRows(obj, rows, debugItems) {
    const startRef = obj.endpointLinks?.start || null;
    const endRef = obj.endpointLinks?.end || null;
    const start = linkStatus(startRef, obj);
    const end = linkStatus(endRef, obj);
    const startPt = start.point || { x: obj.x1, y: obj.y1 };
    const endPt = end.point || { x: obj.x2, y: obj.y2 };
    rows.push(["Start", `<span class="${start.cls}">${start.label}</span> <span class="linkInspector__muted">${htmlEscape(shortRefLabel(startRef))}</span>`]);
    rows.push(["End", `<span class="${end.cls}">${end.label}</span> <span class="linkInspector__muted">${htmlEscape(shortRefLabel(endRef))}</span>`]);
    pushDebugPoint(debugItems, startPt, start.status, "start", startRef);
    pushDebugPoint(debugItems, endPt, end.status, "end", endRef);
    if (obj.endpointLinks?.floatFree) rows.push(["Float", `<span class="linkInspector__ok">free end travels with linked end</span>`]);
  }

  function perspectiveLineRows(obj, rows, debugItems) {
    const a = linkStatus(obj.perspectiveLink?.anchor, obj);
    const vp = linkStatus(obj.perspectiveLink?.vp, obj);
    rows.push(["Source", `<span class="${a.cls}">${a.label}</span> <span class="linkInspector__muted">${htmlEscape(shortRefLabel(obj.perspectiveLink?.anchor))}</span>`]);
    rows.push(["VP", `<span class="${vp.cls}">${vp.label}</span> <span class="linkInspector__muted">${htmlEscape(shortRefLabel(obj.perspectiveLink?.vp))}</span>`]);
    rows.push(["Mode", htmlEscape(obj.perspectiveLink?.endMode || "length")]);
    pushDebugPoint(debugItems, a.point || { x: obj.x1, y: obj.y1 }, a.status, "source", obj.perspectiveLink?.anchor);
    pushDebugPoint(debugItems, vp.point || { x: obj.x2, y: obj.y2 }, vp.status, "VP", obj.perspectiveLink?.vp);
    pushDebugPoint(debugItems, { x: obj.x2, y: obj.y2 }, "ok", "line end", null);
  }

  function polyFillRows(obj, rows, debugItems) {
    const pts = obj.pts || [];
    const links = obj.vertexLinks || [];
    let linked = 0, free = 0, bad = 0;
    for (let i = 0; i < pts.length; i++) {
      const ref = links[i] || null;
      const st = linkStatus(ref, obj);
      if (st.status === "ok") linked++;
      else if (st.status === "bad") bad++;
      else free++;
      pushDebugPoint(debugItems, st.point || pts[i], st.status, `P${i + 1}`, ref);
    }
    rows.push(["Corners", `${pts.length}`]);
    rows.push(["Linked", `<span class="linkInspector__ok">${linked}</span> <span class="linkInspector__free">${free} free</span> ${bad ? `<span class="linkInspector__bad">${bad} broken</span>` : ""}`]);
  }

  function guideRows(obj, rows, debugItems) {
    const target = findObjById(obj.targetId);
    rows.push(["Source", target ? `<span class="linkInspector__ok">found</span> <span class="linkInspector__muted">${htmlEscape(objectLabel(target))}</span>` : `<span class="linkInspector__bad">missing</span>`]);
    if (target) pushDebugBox(debugItems, target, "source", "SOURCE");
    if (obj.vp1) pushDebugPoint(debugItems, obj.vp1, "ok", "VP1", { type: "perspectivePoint", guideId: obj._id, name: "vp1" });
    if ((obj.mode || 1) >= 2 && obj.vp2) pushDebugPoint(debugItems, obj.vp2, "ok", "VP2", { type: "perspectivePoint", guideId: obj._id, name: "vp2" });
    const dependentLines = state.objects.filter(o => o && (o.kind === "line" || o.kind === "arrow") && (o.perspectiveLink?.vp?.guideId === obj._id || isPerspectiveConstructionRef(o.endpointLinks?.start) || isPerspectiveConstructionRef(o.endpointLinks?.end))).length;
    const dependentFaces = state.objects.filter(o => o && o.kind === "polyFill" && Array.isArray(o.vertexLinks) && o.vertexLinks.some(Boolean)).length;
    rows.push(["Group", `${dependentLines} lines, ${dependentFaces} faces`]);
  }

  function selectedSourceGuideRows(obj, rows, debugItems) {
    if (!obj?._id) return;
    const guides = state.objects.filter(o => o && o.kind === "perspectiveGuide" && o.targetId === obj._id);
    if (!guides.length) return;
    rows.push(["Guides", guides.map(g => htmlEscape(`${g.mode >= 2 ? "2P" : "1P"} ${g._id || ""}`)).join(", ")]);
    for (const g of guides) pushDebugBox(debugItems, g, "ok", g.mode >= 2 ? "2P" : "1P");
  }

  function buildLinkInspectorData() {
    const obj = state.selectionIndex >= 0 ? state.objects[state.selectionIndex] : null;
    const rows = [];
    const debugItems = [];
    if (!obj) return { obj: null, rows, debugItems };
    ensureObjId(obj);
    rows.push(["Object", htmlEscape(objectLabel(obj))]);

    if ((obj.kind === "line" || obj.kind === "arrow") && obj.perspectiveLink) {
      perspectiveLineRows(obj, rows, debugItems);
    } else if (obj.kind === "line" || obj.kind === "arrow") {
      lineEndpointRows(obj, rows, debugItems);
    } else if (obj.kind === "polyFill") {
      polyFillRows(obj, rows, debugItems);
    } else if (obj.kind === "perspectiveGuide") {
      guideRows(obj, rows, debugItems);
    } else {
      selectedSourceGuideRows(obj, rows, debugItems);
      if (rows.length === 1) rows.push(["Links", `<span class="linkInspector__muted">No direct links on this object</span>`]);
    }
    return { obj, rows, debugItems };
  }

  function renderLinkInspector() {
    if (!linkInspector || !linkInspectorBody) return;
    const { obj, rows } = buildLinkInspectorData();
    if (!obj || state.tool !== "select") {
      linkInspector.classList.add("is-hidden");
      linkDebugOverlay.visible = false;
      linkDebugOverlay.items = [];
      linkDebugOverlay.targetId = null;
      return;
    }
    if (linkDebugOverlay.visible && linkDebugOverlay.targetId && linkDebugOverlay.targetId !== obj._id) {
      linkDebugOverlay.visible = false;
      linkDebugOverlay.items = [];
      linkDebugOverlay.targetId = null;
    }
    linkInspector.classList.remove("is-hidden");
    linkInspectorBody.innerHTML = rows.map(([label, value]) => `<div class="linkInspector__row"><div class="linkInspector__label">${htmlEscape(label)}</div><div>${value}</div></div>`).join("");
  }

  function checkSelectedLinks(showToastMessage = true) {
    const data = buildLinkInspectorData();
    linkDebugOverlay.items = data.debugItems;
    linkDebugOverlay.visible = !!data.obj && data.debugItems.length > 0;
    linkDebugOverlay.targetId = data.obj?._id || null;
    linkDebugOverlay.lastCheckAt = Date.now();
    renderLinkInspector();
    redrawAllRaw();
    drawLinkDebugOverlay();
    if (showToastMessage) showToast(data.obj ? "Checked links: green linked, orange free, red broken, blue source/VP" : "Select an object to inspect");
  }

  function repairSelectedLinks() {
    const obj = state.selectionIndex >= 0 ? state.objects[state.selectionIndex] : null;
    if (!obj) {
      showToast("Select a linked object to repair");
      return;
    }
    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    let changed = 0;
    ensureObjId(obj);

    if ((obj.kind === "line" || obj.kind === "arrow") && !obj.perspectiveLink) {
      const rawStart = findBestLinkRefAtPoint({ x: obj.x1, y: obj.y1 }, obj._id);
      const rawEnd = findBestLinkRefAtPoint({ x: obj.x2, y: obj.y2 }, obj._id);
      const start = rawStart && !refDependsOnObject(rawStart, obj._id, new Set()) ? rawStart : null;
      const end = rawEnd && !refDependsOnObject(rawEnd, obj._id, new Set()) ? rawEnd : null;
      if (start) { setEndpointLink(obj, "start", start); changed++; }
      else if (obj.endpointLinks?.start && !pointForLinkRef(obj.endpointLinks.start)) { delete obj.endpointLinks.start; changed++; }
      if (end) { setEndpointLink(obj, "end", end); changed++; }
      else if (obj.endpointLinks?.end && !pointForLinkRef(obj.endpointLinks.end)) { delete obj.endpointLinks.end; changed++; }
      if (obj.endpointLinks && !obj.endpointLinks.start && !obj.endpointLinks.end) delete obj.endpointLinks;
      updateEndpointLinkedObject(obj);
    }

    if ((obj.kind === "line" || obj.kind === "arrow") && obj.perspectiveLink) {
      const a = linkStatus(obj.perspectiveLink.anchor, obj);
      const v = linkStatus(obj.perspectiveLink.vp, obj);
      if (a.status === "bad") {
        const near = findBestLinkRefAtPoint({ x: obj.x1, y: obj.y1 }, obj._id);
        if (near && !refDependsOnObject(near, obj._id, new Set())) { obj.perspectiveLink.anchor = near; changed++; }
      }
      if (v.status === "bad") changed += 0;
      updatePerspectiveLinkedObject(obj);
    }

    if (obj.kind === "polyFill" && Array.isArray(obj.pts)) {
      if (!obj.vertexLinks) obj.vertexLinks = [];
      for (let i = 0; i < obj.pts.length; i++) {
        const p = obj.pts[i];
        const current = obj.vertexLinks[i];
        const st = linkStatus(current, obj);
        const near = findBestLinkRefAtPoint(p, obj._id);
        if (near && !refDependsOnObject(near, obj._id, new Set())) {
          const before = JSON.stringify(current || null);
          if (before !== JSON.stringify(near)) { obj.vertexLinks[i] = near; changed++; }
        } else if (current && st.status === "bad") {
          obj.vertexLinks[i] = null;
          changed++;
        }
      }
      if (!obj.vertexLinks.some(Boolean)) delete obj.vertexLinks;
      updatePolyFillLinkedObject(obj);
    }

    if (obj.kind === "perspectiveGuide") {
      const target = findObjById(obj.targetId);
      if (!target) showToast("Perspective guide source is missing — select a shape and make a new guide");
    }

    updatePerspectiveLinks();
    renderLinkInspector();
    checkSelectedLinks(false);
    showToast(changed ? `Repaired ${changed} link${changed === 1 ? "" : "s"}` : "No nearby repairs found");
  }

  function drawLinkDebugOverlay() {
    if (!linkDebugOverlay.visible || !linkDebugOverlay.items.length) return;
    const pr = state.pixelRatio || 1;
    uiCtx.save();
    uiCtx.setTransform(pr, 0, 0, pr, 0, 0);
    uiCtx.font = "700 11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    uiCtx.textBaseline = "middle";
    for (const item of linkDebugOverlay.items) {
      const status = item.status || "ok";
      const color = status === "bad" ? "#c62828" : status === "free" ? "#f57c00" : status === "source" ? "#1976d2" : "#1b8f3a";
      if (item.kind === "box") {
        const a = worldToScreen(item.minX, item.minY);
        const b = worldToScreen(item.maxX, item.maxY);
        const x = Math.min(a.x, b.x), y = Math.min(a.y, b.y), w = Math.abs(b.x - a.x), h = Math.abs(b.y - a.y);
        uiCtx.save();
        uiCtx.setLineDash([8, 5]);
        uiCtx.strokeStyle = color;
        uiCtx.fillStyle = color + "22";
        uiCtx.lineWidth = 3;
        uiCtx.strokeRect(x - 5, y - 5, w + 10, h + 10);
        uiCtx.fillRect(x - 5, y - 5, w + 10, h + 10);
        uiCtx.setLineDash([]);
        uiCtx.restore();
        continue;
      }
      const p = worldToScreen(item.x, item.y);
      uiCtx.fillStyle = "rgba(255,255,255,0.96)";
      uiCtx.strokeStyle = color;
      uiCtx.lineWidth = 3;
      uiCtx.beginPath();
      uiCtx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      uiCtx.fill();
      uiCtx.stroke();
      if (item.label) {
        const text = item.label;
        const tw = uiCtx.measureText(text).width;
        uiCtx.fillStyle = color;
        uiCtx.fillRect(p.x + 10, p.y - 10, tw + 10, 18);
        uiCtx.fillStyle = "white";
        uiCtx.fillText(text, p.x + 15, p.y - 1);
      }
    }
    uiCtx.restore();
  }

  function updatePerspectiveLinks() {
    // A few light passes let normal snapped connectors follow perspective-linked lines.
    // Remove accidental circular endpoint links first; these were the main cause of
    // construction lines suddenly jumping to unrelated page positions after several moves.
    for (const obj of state.objects) sanitizeEndpointLinkCycles(obj);
    for (let pass = 0; pass < 4; pass++) {
      for (const obj of state.objects) updatePerspectiveLinkedObject(obj);
      for (const obj of state.objects) updateEndpointLinkedObject(obj);
      for (const obj of state.objects) updatePolyFillLinkedObject(obj);
    }
  }

  const render = window.WBRender.createRenderApi({
    state,
    gesture,
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
    getLineDash,
    findObjById,
    perspectiveTargetPoints,
    regularShapePoints
  });

  const {
    applyBgTransform,
    resizeAll: resizeAllRaw,
    redrawAll: redrawAllRaw
  } = render;

  function redrawAll() {
    updatePerspectiveLinks();
    redrawAllRaw();
    renderLinkInspector();
    if (linkDebugOverlay.visible) drawLinkDebugOverlay();
    updatePresentationUI();
  }

  function resizeAll() {
    updatePerspectiveLinks();
    resizeAllRaw();
    renderLinkInspector();
    if (linkDebugOverlay.visible) drawLinkDebugOverlay();
  }

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
    presetReference,
    presetHidden,
    presetCenter,
    lineStyleSolid,
    lineStyleReference,
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
    undoBtn,
    redoBtn,
    showToast,
    updateBrushUI,
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
    regularShapePoints,
    perspectiveTargetPoints,
    exportWorldBounds,
    ensureObjId,
    ensureRevealId,
    findObjById,
    findObjByRevealId,
    repairRevealIds,
    migrateRevealPartIds,
    syncNextObjIdCounter,
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
    bindExport,
    bindProjectFiles,
    bindBoardManager,
    bindAutosave,
    startAutosave
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
    polyDraft.links = [];
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
    gesture.selStartItems = null;
    gesture.selAnchor = null;
    gesture.selStartAngle = 0;

    gesture.bgStart = null;

    gesture.arcCenter = null;
    gesture.arcR = 0;
    gesture.arcA1 = 0;
    gesture.arcLastA = 0;
    gesture.arcAccum = 0;

    gesture.snapCache = null;
    gesture.perspectivePointName = null;
    gesture.lineAnchorRef = null;
    gesture.lineEndAnchorRef = null;
    gesture.lineResizeEnd = null;
    gesture.forceLinkActive = false;
    gesture.lastScreenPrev = null;
    gesture.marqueeStart = null;
    gesture.marqueeCurrent = null;
    gesture.marqueeBaseSelection = null;

    lenEntry.open = false;
    lenEntry.seedMm = null;

    hideMeasureTip();
    closeLenBox();
  }

 function syncStyleControlsFromSelection() {
  const idx = state.selectionIndex;
  if (idx < 0) {
    updateBrushUI();
    return;
  }

  const obj = state.objects[idx];
  if (!obj) {
    updateBrushUI();
    return;
  }

  let color = state.color;
  let opacity = state.opacity ?? 1;
  let size = state.size ?? 5;
  let lineStyle = state.lineStyle || "solid";

  if (obj.kind === "polyFill") {
    color = obj.fill || state.color;
    opacity = obj.opacity ?? 1;
  } else {
    color = obj.color || state.color;
    opacity = obj.opacity ?? 1;

    if ((obj.kind === "rect" || obj.kind === "circle" || obj.kind === "regularShape") && obj.filled && obj.fillColor) {
      color = obj.fillColor;
    }

    if ("size" in obj) {
      size = obj.size ?? size;
    }

    if (obj.kind === "text") {
      size = Math.max(1, Math.round((obj.fontSize || 20) / 4));
    }

    if ("lineStyle" in obj && obj.lineStyle) {
      lineStyle = obj.lineStyle;
    }
  }

  state.color = color;
  state.opacity = opacity;
  state.size = size;
  state.lineStyle = lineStyle;

  if (colorInput) colorInput.value = color;
  if (opacityRange) opacityRange.value = String(opacity);
  if (brushSize) brushSize.value = String(size);
  if (brushOut) brushOut.textContent = String(size);

  updateBrushUI();
}
   
function applyStylePatchToObject(obj, patch = {}) {
  if (!obj) return false;

  if (patch.color != null) {
    switch (obj.kind) {
      case "polyFill":
        obj.fill = patch.color;
        break;
      case "rect":
      case "circle":
      case "regularShape":
        obj.color = patch.color;
        if (obj.filled) obj.fillColor = patch.color;
        break;
      default:
        if ("color" in obj || obj.kind !== "erase") obj.color = patch.color;
        break;
    }
  }

  if (patch.opacity != null && obj.kind !== "erase") {
    obj.opacity = clamp(patch.opacity, 0.05, 1);
  }

  if (patch.size != null) {
    if ("size" in obj) obj.size = clamp(Number(patch.size), 1, 60);
    else if (obj.kind === "text") obj.fontSize = Math.max(14, Math.round(Number(patch.size) * 4));
  }

  if (patch.lineStyle != null && ["line", "arrow", "arc", "rect", "circle", "regularShape", "curve"].includes(obj.kind)) {
    obj.lineStyle = patch.lineStyle;
  }
  return true;
}

function applyStyleToSelection(patch = {}) {
  const indices = selectedObjectIndices();
  if (!indices.length) return false;
  state.undo.push(JSON.stringify(snapshot()));
  state.redo.length = 0;
  return applyStyleToSelectionLive(patch);
}

function applyStyleToSelectionLive(patch = {}) {
  const indices = selectedObjectIndices();
  if (!indices.length) return false;
  let changed = false;
  for (const idx of indices) changed = applyStylePatchToObject(state.objects[idx], patch) || changed;
  redrawAll();
  return changed;
}

  /* =========================
     Hide / unhide visibility
  ========================= */
  function isRevealableDrawnObject(obj) {
    return !!(obj && obj.kind);
  }

  function addObjectToActiveReveal(obj, opts = {}) {
    if (!isRevealableDrawnObject(obj)) return false;
    ensureObjId(obj);
    const revealId = ensureRevealId(obj);

    // If there are already hidden objects but the reveal list was not active,
    // rebuild the manual list first so newly drawn objects join the sequence.
    if ((!svgReveal.active || !Array.isArray(svgReveal.partIds)) && hiddenObjectIds().length) {
      rebuildManualHiddenRevealList();
    }

    if (!svgReveal.active || !svgReveal.groupId || !Array.isArray(svgReveal.partIds)) return false;

    obj.svgGroupId = svgReveal.groupId;

    if (!svgReveal.partIds.includes(revealId)) {
      const defaultInsertAt = svgReveal.groupId === MANUAL_HIDDEN_REVEAL_GROUP
        ? svgReveal.partIds.length
        : svgReveal.revealed + 1;
      const insertAt = clamp(
        Number.isFinite(opts.insertAt) ? opts.insertAt : defaultInsertAt,
        0,
        svgReveal.partIds.length
      );
      svgReveal.partIds.splice(insertAt, 0, revealId);
    }

    if (opts.hide === true) obj.hidden = true;
    syncSvgRevealCountFromVisibility();
    return true;
  }

  function addRecentlyDrawnObjectsToActiveReveal(objects, opts = {}) {
    if (!Array.isArray(objects)) objects = [objects];
    let changed = false;
    for (const obj of objects) {
      if (addObjectToActiveReveal(obj, opts)) changed = true;
    }
    return changed;
  }

  function revealLabel() {
    return svgReveal.groupId === MANUAL_HIDDEN_REVEAL_GROUP ? "Hidden" : "SVG";
  }

  function hiddenObjectIds() {
    return state.objects
      .filter(o => o && o.hidden && o.kind)
      .map(o => ensureRevealId(o));
  }

  function visibleObjectIds() {
    return state.objects
      .filter(o => o && !o.hidden && o.kind)
      .map(o => ensureRevealId(o));
  }

  function rebuildManualHiddenRevealList(extraIds = []) {
    repairRevealIds(state.objects);
    const ids = [];
    const seen = new Set();

    // Manual reveal order follows the actual drawing/object order. Every
    // drawable item is included, even when it is currently visible.
    for (const obj of state.objects) {
      if (!isRevealableDrawnObject(obj)) continue;
      ensureObjId(obj);
      const revealId = ensureRevealId(obj);
      if (seen.has(revealId)) continue;
      ids.push(revealId);
      seen.add(revealId);
    }

    // Accept either a new reveal ID or an old geometry ID while migrating.
    for (const id of extraIds || []) {
      const obj = findObjByRevealId(id) || findObjById(id);
      if (!isRevealableDrawnObject(obj)) continue;
      const revealId = ensureRevealId(obj);
      if (seen.has(revealId)) continue;
      ids.push(revealId);
      seen.add(revealId);
    }

    svgReveal.active = ids.length > 0;
    svgReveal.groupId = ids.length ? MANUAL_HIDDEN_REVEAL_GROUP : null;
    svgReveal.partIds = ids;
    for (const id of ids) {
      const obj = findObjByRevealId(id);
      if (obj) obj.svgGroupId = MANUAL_HIDDEN_REVEAL_GROUP;
    }
    syncSvgRevealCountFromVisibility();
    return ids.length > 0;
  }

  function ensureVisibilityRevealFromHidden(showMessage = false) {
    if (svgReveal.active && Array.isArray(svgReveal.partIds) && svgReveal.partIds.length) {
      normalizeRevealList();
      return true;
    }

    const hiddenIds = hiddenObjectIds();
    if (!hiddenIds.length) {
      if (showMessage) showToast("No hidden objects to cycle");
      return false;
    }

    svgReveal.active = true;
    svgReveal.groupId = MANUAL_HIDDEN_REVEAL_GROUP;
    svgReveal.partIds = hiddenIds;
    svgReveal.revealed = 0;
    syncSvgRevealCountFromVisibility();
    if (showMessage) showToast(`Hidden: ${svgReveal.revealed}/${hiddenIds.length}`);
    return true;
  }

  function normalizeRevealList() {
    if (!svgReveal.active || !Array.isArray(svgReveal.partIds)) return false;

    repairRevealIds(state.objects);
    const ids = [];
    const seen = new Set();

    for (const id of svgReveal.partIds) {
      const obj = findObjByRevealId(id) || findObjById(id);
      if (!obj) continue;
      const revealId = ensureRevealId(obj);
      if (seen.has(revealId)) continue;
      ids.push(revealId);
      seen.add(revealId);
    }

    if (svgReveal.groupId === MANUAL_HIDDEN_REVEAL_GROUP) {
      for (const obj of state.objects) {
        if (!isRevealableDrawnObject(obj)) continue;
        ensureObjId(obj);
        const revealId = ensureRevealId(obj);
        if (seen.has(revealId)) continue;
        ids.push(revealId);
        seen.add(revealId);
        obj.svgGroupId = MANUAL_HIDDEN_REVEAL_GROUP;
      }
    }

    svgReveal.partIds = ids;
    svgReveal.active = ids.length > 0;
    if (!ids.length) svgReveal.groupId = null;
    syncSvgRevealCountFromVisibility();
    return ids.length > 0;
  }

  function syncSvgRevealCountFromVisibility() {
    if (!svgReveal.active || !Array.isArray(svgReveal.partIds) || !svgReveal.partIds.length) {
      svgReveal.revealed = 0;
      return;
    }

    if (svgReveal.groupId === MANUAL_HIDDEN_REVEAL_GROUP) {
      const visibleIds = [];
      const hiddenIds = [];
      const seen = new Set();

      for (const id of svgReveal.partIds) {
        const obj = findObjByRevealId(id) || findObjById(id);
        if (!isRevealableDrawnObject(obj)) continue;
        const revealId = ensureRevealId(obj);
        if (seen.has(revealId)) continue;
        seen.add(revealId);
        (obj.hidden ? hiddenIds : visibleIds).push(revealId);
      }

      for (const obj of state.objects) {
        if (!isRevealableDrawnObject(obj)) continue;
        const revealId = ensureRevealId(obj);
        if (seen.has(revealId)) continue;
        seen.add(revealId);
        obj.svgGroupId = MANUAL_HIDDEN_REVEAL_GROUP;
        (obj.hidden ? hiddenIds : visibleIds).push(revealId);
      }

      svgReveal.partIds = [...visibleIds, ...hiddenIds];
      svgReveal.revealed = visibleIds.length;
      return;
    }

    let index = 0;
    while (index < svgReveal.partIds.length) {
      const obj = findObjByRevealId(svgReveal.partIds[index]);
      if (obj && obj.hidden) break;
      index += 1;
    }
    svgReveal.revealed = clamp(index, 0, svgReveal.partIds.length);
  }

  function hideSelectedObjects() {
    const indices = (state.selection && state.selection.length
      ? state.selection
      : (state.selectionIndex >= 0 ? [state.selectionIndex] : []))
      .filter(i => state.objects[i] && !state.objects[i].hidden);

    if (!indices.length) {
      for (let i = 0; i < state.objects.length; i += 1) {
        if (state.objects[i] && !state.objects[i].hidden) indices.push(i);
      }
      if (!indices.length) {
        showToast("Nothing visible to hide");
        return false;
      }
    }

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;

    const hiddenIds = [];
    for (const i of indices) {
      state.objects[i].hidden = true;
      hiddenIds.push(ensureRevealId(state.objects[i]));
    }

    rebuildManualHiddenRevealList(hiddenIds);

    state.selection = [];
    state.selectionIndex = -1;
    hardResetGesture();
    redrawAll();
    showToast(indices.length === 1
      ? "Hidden — use ▶ / . to reveal"
      : `${indices.length} objects hidden — use ▶ / . to reveal`);
    return true;
  }

  function unhideAllObjects() {
    const hidden = state.objects.filter(o => o && o.hidden);
    if (!hidden.length) {
      showToast("Nothing hidden");
      return false;
    }

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;

    hidden.forEach(o => { o.hidden = false; });
    syncSvgRevealCountFromVisibility();
    redrawAll();
    showToast(hidden.length === 1 ? "Unhidden" : `${hidden.length} objects unhidden`);
    return true;
  }

  function revealNextStep() {
    if (!ensureVisibilityRevealFromHidden(true)) return false;
    normalizeRevealList();
    if (svgPlayback.running) stopSvgPlayback(true);
    const total = svgReveal.partIds.length;
    if (!total) return false;
    const moved = revealNextSvgPart();
    showToast(`${revealLabel()}: ${Math.min(svgReveal.revealed, total)}/${total}`);
    return moved;
  }

  function revealPrevStep() {
    if (!ensureVisibilityRevealFromHidden(true)) return false;
    normalizeRevealList();
    if (svgPlayback.running) stopSvgPlayback(true);
    const total = svgReveal.partIds.length;
    if (!total) return false;
    const moved = hidePrevSvgPart();
    showToast(`${revealLabel()}: ${Math.max(svgReveal.revealed, 0)}/${total}`);
    return moved;
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
    normalizeRevealList();
    const total = svgReveal.partIds.length;
    while (svgReveal.revealed < total) {
      const id = svgReveal.partIds[svgReveal.revealed++];
      const obj = findObjByRevealId(id);
      if (!obj || !obj.hidden) continue;
      obj.hidden = false;
      syncSvgRevealCountFromVisibility();
      redrawAll();
      return true;
    }
    syncSvgRevealCountFromVisibility();
    redrawAll();
    return false;
  }

  function hidePrevSvgPart() {
    normalizeRevealList();
    while (svgReveal.revealed > 0) {
      const id = svgReveal.partIds[--svgReveal.revealed];
      const obj = findObjByRevealId(id);
      if (!obj || obj.hidden) continue;
      obj.hidden = true;
      syncSvgRevealCountFromVisibility();
      redrawAll();
      return true;
    }
    syncSvgRevealCountFromVisibility();
    redrawAll();
    return false;
  }

  function setSvgRevealCount(nextCount) {
    const total = svgReveal.partIds.length;
    const target = clamp(Math.round(nextCount), 0, total);

    while (svgReveal.revealed < target) {
      const id = svgReveal.partIds[svgReveal.revealed++];
      const obj = findObjByRevealId(id);
      if (obj) obj.hidden = false;
    }
    while (svgReveal.revealed > target) {
      const id = svgReveal.partIds[--svgReveal.revealed];
      const obj = findObjByRevealId(id);
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
      showToast("No reveal list loaded");
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
      if (!ensureVisibilityRevealFromHidden(false)) {
        showToast("Import SVG or hide objects first");
        return;
      }
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

    showToast(`${revealLabel()} ▶ ${svgReveal.revealed}/${total}`);
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

  function updatePresentationUI() {
    if (!presentationState.active) return;
    const total = svgReveal.active && Array.isArray(svgReveal.partIds) ? svgReveal.partIds.length : 0;
    const current = total ? clamp(Number(svgReveal.revealed || 0), 0, total) : 0;
    if (presentationProgressText) {
      presentationProgressText.textContent = total ? `Reveal ${current} of ${total}` : "No reveal sequence — hide objects to create one";
    }
    if (presentationProgressBar) {
      presentationProgressBar.style.width = total ? `${(current / total) * 100}%` : "0%";
    }
    if (presentationPlayBtn) presentationPlayBtn.textContent = svgPlayback.running ? "⏸ Pause" : "▶ Timed";
    if (presentationBlankBtn) presentationBlankBtn.textContent = presentationState.blank ? "Restore" : "Blank";
  }

  function fitPresentationToContent() {
    const bounds = exportWorldBounds();
    if (!bounds || !Number.isFinite(bounds.w) || !Number.isFinite(bounds.h)) return;
    const padX = Math.min(120, Math.max(36, state.viewW * 0.06));
    const padTop = 36;
    const padBottom = 110;
    const availableW = Math.max(100, state.viewW - padX * 2);
    const availableH = Math.max(100, state.viewH - padTop - padBottom);
    const zoom = clamp(Math.min(availableW / Math.max(1, bounds.w), availableH / Math.max(1, bounds.h)), 0.005, 12);
    const cx = bounds.minX + bounds.w / 2;
    const cy = bounds.minY + bounds.h / 2;
    state.zoom = zoom;
    state.panX = state.viewW / 2 - cx * zoom;
    state.panY = padTop + availableH / 2 - cy * zoom;
  }

  async function enterPresentationMode() {
    if (presentationState.active) return;
    presentationState.active = true;
    presentationState.blank = false;
    presentationState.savedView = {
      zoom: state.zoom,
      panX: state.panX,
      panY: state.panY,
      tool: state.tool,
      selection: [...(state.selection || [])],
      selectionIndex: state.selectionIndex
    };
    hardResetGesture();
    cancelPolyDraft();
    state.selection = [];
    state.selectionIndex = -1;
    openSettings(false);
    toggleColorPop(false);
    document.body.classList.add("is-presenting");
    presentationControls?.classList.remove("is-hidden");
    presentationBlank?.classList.add("is-hidden");
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        await document.documentElement.requestFullscreen();
      }
    } catch {}
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resizeAll();
      fitPresentationToContent();
      redrawAll();
    }));
  }

  function togglePresentationBlank() {
    if (!presentationState.active) return;
    presentationState.blank = !presentationState.blank;
    presentationBlank?.classList.toggle("is-hidden", !presentationState.blank);
    presentationBlank?.setAttribute("aria-hidden", presentationState.blank ? "false" : "true");
    updatePresentationUI();
  }

  function exitPresentationMode() {
    if (!presentationState.active) return;
    presentationState.active = false;
    presentationState.blank = false;
    stopSvgPlayback(true);
    document.body.classList.remove("is-presenting");
    presentationControls?.classList.add("is-hidden");
    presentationBlank?.classList.add("is-hidden");
    const saved = presentationState.savedView;
    presentationState.savedView = null;
    if (document.fullscreenElement && document.exitFullscreen) {
      document.exitFullscreen().catch(() => {});
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      resizeAll();
      if (saved) {
        state.zoom = saved.zoom;
        state.panX = saved.panX;
        state.panY = saved.panY;
        state.selection = saved.selection || [];
        state.selectionIndex = Number.isInteger(saved.selectionIndex) ? saved.selectionIndex : -1;
        setActiveTool(saved.tool || "select");
      }
      redrawAll();
    }));
  }

  function handlePresentationKey(e) {
    if (!presentationState.active) {
      if (e.key === "F5") {
        e.preventDefault();
        e.stopImmediatePropagation();
        enterPresentationMode();
      }
      return;
    }
    const key = e.key;
    const next = key === "ArrowRight" || key === "PageDown" || key === "Enter" || key === " " || key === ".";
    const prev = key === "ArrowLeft" || key === "PageUp" || key === ",";
    const blank = key.toLowerCase() === "b";
    const play = key.toLowerCase() === "t";
    const exit = key === "Escape" || key === "F5";
    if (!(next || prev || blank || play || exit)) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (next) revealNextStep();
    else if (prev) revealPrevStep();
    else if (blank) togglePresentationBlank();
    else if (play) toggleSvgPlayback();
    else if (exit) exitPresentationMode();
  }

  /* =========================
     Selection transforms
  ========================= */

   
  function beginSelectionTransform(kind, w, detail) {
    const idx = state.selectionIndex;
    if (idx < 0) return false;

    if (kind === "perspectiveSource") {
      const guide = state.objects[idx];
      const targetIndex = findObjIndexById((detail && detail.targetId) || guide?.targetId);
      if (targetIndex < 0) {
        showToast("Perspective source not found");
        return false;
      }

      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;

      state.selectionIndex = targetIndex;
      state.selection = [targetIndex];
      syncStyleControlsFromSelection();

      gesture.selIndex = targetIndex;
      gesture.selStartObj = deepClone(state.objects[targetIndex]);
      const sourceBounds = objectBounds(state.objects[targetIndex]);
      gesture.selAnchor = {
        x: (sourceBounds.minX + sourceBounds.maxX) / 2,
        y: (sourceBounds.minY + sourceBounds.maxY) / 2
      };
      gesture.mode = "selMove";
      gesture.startWorld = w;
      showToast("Source object selected — drag to move it with the perspective lines");
      return true;
    }

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;

    const groupIndices = selectedObjectIndices();
    if (groupIndices.length > 1 && (kind === "move" || kind === "scale" || kind === "rotate")) {
      const bounds = selectionWorldBounds(groupIndices);
      if (!bounds) return false;
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      gesture.selIndex = idx;
      gesture.selStartObj = null;
      gesture.selStartItems = groupIndices.map(index => ({ index, obj: deepClone(state.objects[index]) }));
      gesture.selAnchor = kind === "scale"
        ? (oppositeCornerAnchor(bounds, detail?.corner) || { x: cx, y: cy })
        : { x: cx, y: cy };
      gesture.startWorld = w;
      gesture.mode = kind === "move" ? "selMove" : kind === "scale" ? "selScale" : "selRotate";
      if (kind === "rotate") gesture.selStartAngle = Math.atan2(w.y - cy, w.x - cx);
      showToast(`${groupIndices.length} objects selected as one group`);
      return true;
    }

    gesture.selIndex = idx;
    gesture.selStartObj = deepClone(state.objects[idx]);
    gesture.selStartItems = null;

    const b = tightObjectBounds(state.objects[idx]);
    const cx = (b.minX + b.maxX) / 2;
    const cy = (b.minY + b.maxY) / 2;
    const shapeUsesOppositeCorner = kind === "scale"
      && (state.objects[idx]?.kind === "rect" || state.objects[idx]?.kind === "circle" || state.objects[idx]?.kind === "regularShape")
      && Math.abs(state.objects[idx]?.rot || 0) < 1e-9;
    gesture.selAnchor = shapeUsesOppositeCorner
      ? (oppositeCornerAnchor(b, detail?.corner) || { x: cx, y: cy })
      : { x: cx, y: cy };

    if (kind === "perspectivePoint") {
      gesture.mode = "perspectivePoint";
      gesture.perspectivePointName = detail?.point || detail || null;
      gesture.perspectivePointCluster = collectSharedPerspectivePointStarts(idx, detail || null);
      gesture.startWorld = w;
      gesture.snapCache = buildSnapCache(state.objects[idx]?._id);
      return true;
    }

    if (kind === "lineEnd") {
      const obj = state.objects[idx];
      if (!obj || (obj.kind !== "line" && obj.kind !== "arrow")) return false;
      gesture.mode = "lineEndResize";
      gesture.lineResizeEnd = detail?.endName || "end";
      gesture.startWorld = w;
      gesture.snapCache = buildSnapCache(obj._id);
      showToast(gesture.lineResizeEnd === "start" ? "Drag line start" : "Drag line end");
      return true;
    }

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
      const kind = tool === "bgMove" ? "move" : tool === "bgScale" ? "scale" : "rotate";
      return beginSelectionTransform(kind, w);
    }
    return beginBgTransform(tool, w);
  }

  /* =========================
     PolyFill commit
  ========================= */
function polygonAreaAbs(pts) {
  if (!pts || pts.length < 3) return 0;
  let sum = 0;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    sum += (pts[j].x * pts[i].y) - (pts[i].x * pts[j].y);
  }
  return Math.abs(sum / 2);
}

function commitPolyFill() {
  const pts = polyDraft.pts || [];
  if (pts.length < 3) {
    showToast(`PolyFill needs 3+ corners. You have ${pts.length}; click more points, then Enter/double-click/right-click.`);
    return false;
  }

  const area = polygonAreaAbs(pts);
  if (area < 4) {
    showToast("PolyFill needs a real area — these points are too close together or nearly flat.");
    return false;
  }

  state.undo.push(JSON.stringify(snapshot()));
  state.redo.length = 0;

  const links = (polyDraft.links || []).map(link => link ? cloneRef(link) : null);
  const obj = {
    kind: "polyFill",
    pts: pts.map(pt => ({ x: pt.x, y: pt.y })),
    ...(links.some(Boolean) ? { vertexLinks: links } : {}),
    fill: state.color,
    opacity: clamp(state.opacity ?? 1, 0, 1),
    hidden: false
  };
  ensureObjId(obj);

  // keep fills visually underneath outlines
  //state.objects.unshift(obj);
  state.objects.push(obj);
  const addedToReveal = addObjectToActiveReveal(obj, { hide: false });

   
  cancelPolyDraft();
  redrawAll();
  const colourNote = (String(obj.fill || "").toLowerCase() === "#ffffff" || String(obj.fill || "").toLowerCase() === "white") ? " It is white, so it may be hard to see." : "";
  const opacityNote = (obj.opacity ?? 1) < 0.12 ? " Opacity is very low." : "";
  showToast(addedToReveal ? `Poly filled and added to reveal steps.${colourNote}${opacityNote}` : `Poly filled.${colourNote}${opacityNote}`);
  return true;
}

function commitSmoothCurve() {
  const pts = polyDraft.pts || [];
  if (pts.length < 2) {
    showToast(`Smooth curve needs 2+ points. You have ${pts.length}; click more points, then Enter/double-click/right-click.`);
    return false;
  }

  state.undo.push(JSON.stringify(snapshot()));
  state.redo.length = 0;

  const obj = {
    kind: "curve",
    color: state.color,
    size: state.size,
    opacity: state.opacity,
    lineStyle: state.lineStyle || "solid",
    points: pts.map(pt => ({ x: pt.x, y: pt.y }))
  };
  ensureObjId(obj);
  state.objects.push(obj);
  const addedToReveal = addObjectToActiveReveal(obj, { hide: false });
  cancelPolyDraft();
  redrawAll();
  showToast(addedToReveal ? "Smooth curve added to reveal steps" : "Smooth curve added");
  return true;
}

  /* =========================
     Numeric setters
  ========================= */
  function linkedBaseEndForLength(obj) {
    if (!obj || (obj.kind !== "line" && obj.kind !== "arrow")) return null;
    // Perspective lines are always measured outward from their source/anchor joint.
    if (obj.perspectiveLink) return "start";
    // A snapped joint is the base. Preserve it even if the cursor or resize handle is elsewhere.
    if (obj.endpointLinks?.start) return "start";
    if (obj.endpointLinks?.end) return "end";
    // While drawing from a snapped joint the link may still only live on the gesture.
    if (gesture.lineAnchorRef) return "start";
    return null;
  }

  function setLineLengthMmForObject(obj, mm, fixedEnd = "start") {
    if (!(obj && (obj.kind === "line" || obj.kind === "arrow"))) return false;

    const ppm = pxPerMm();
    const lenPx = Math.max(0.001, mm * ppm);

    // For perspective-linked lines, do not use the current cursor direction.
    // The line must stay on its VP ray and simply change its distance from the source joint.
    if (obj.perspectiveLink && fixedEnd === "start") {
      const anchor = resolveAnchorPoint(obj.perspectiveLink.anchor) || { x: obj.x1, y: obj.y1 };
      const vp = resolveVanishingPoint(obj.perspectiveLink.vp);
      if (anchor && vp) {
        obj.x1 = anchor.x;
        obj.y1 = anchor.y;
        const lenToVp = Math.hypot(vp.x - anchor.x, vp.y - anchor.y) || 1;
        obj.perspectiveLink.endMode = "length";
        obj.perspectiveLink.lengthWorld = lenPx;
        obj.perspectiveLink.rayT = Math.max(0.001, lenPx / lenToVp);
        updatePerspectiveLinkedObject(obj);
        redrawAll();
        return true;
      }
    }

    const anchorX = fixedEnd === "end" ? obj.x2 : obj.x1;
    const anchorY = fixedEnd === "end" ? obj.y2 : obj.y1;
    let dx = fixedEnd === "end" ? (obj.x1 ?? anchorX) - anchorX : (obj.x2 ?? anchorX) - anchorX;
    let dy = fixedEnd === "end" ? (obj.y1 ?? anchorY) - anchorY : (obj.y2 ?? anchorY) - anchorY;

    let d = Math.hypot(dx, dy);
    if (!isFinite(d) || d < 1e-6) {
      dx = fixedEnd === "end" ? -1 : 1;
      dy = 0;
      d = 1;
    }

    const ux = dx / d, uy = dy / d;
    let next = { x: anchorX + ux * lenPx, y: anchorY + uy * lenPx };
    next = snapToWholeMmLength({ x: anchorX, y: anchorY }, next);

    if (fixedEnd === "end") {
      obj.x1 = next.x;
      obj.y1 = next.y;
      if (obj.perspectiveLink) delete obj.perspectiveLink;
    } else {
      obj.x2 = next.x;
      obj.y2 = next.y;
    }

    redrawAll();
    return true;
  }

  function setActiveLineLengthMm(mm, fixedEnd = null) {
    const selectedObj = state.selectionIndex >= 0 ? state.objects[state.selectionIndex] : null;
    const selectedFromMulti = (state.selection && state.selection.length)
      ? state.objects[state.selection[state.selection.length - 1]]
      : null;
    const obj = gesture.activeObj || selectedObj || selectedFromMulti;
    if (!obj || (obj.kind !== "line" && obj.kind !== "arrow")) return false;

    // fixedEnd means the end that stays put while the other endpoint moves.
    // Linked joints win over cursor position and handle direction.
    if (!fixedEnd) fixedEnd = linkedBaseEndForLength(obj);
    if (!fixedEnd) {
      if (gesture.mode === "lineEndResize") {
        fixedEnd = (gesture.lineResizeEnd === "start") ? "end" : "start";
      } else {
        fixedEnd = "start";
      }
    }
    return setLineLengthMmForObject(obj, mm, fixedEnd) ? true : false;
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
    if (h.kind === "move" || h.kind === "perspectiveSource") {
      inkCanvas.style.cursor = "move";
      return;
    }
    if (h.kind === "lineEnd") {
      inkCanvas.style.cursor = "crosshair";
      return;
    }
    inkCanvas.style.cursor = h.corner === "nw" || h.corner === "se" ? "nwse-resize" : "nesw-resize";
  }

function onCanvasContextMenu(e) {
  if (!inkCanvas.contains(e.target)) return;

  if ((state.tool === "polyFill" || state.tool === "curve") && polyDraft.active) {
    e.preventDefault();

    if (state.tool === "curve") {
      if (polyDraft.pts.length >= 2) commitSmoothCurve();
      else {
        const count = polyDraft.pts.length;
        cancelPolyDraft();
        redrawAll();
        showToast(count ? `Smooth curve cancelled — needs 2+ points, had ${count}.` : "Smooth curve cancelled");
      }
      return;
    }

    if (polyDraft.pts.length >= 3) {
      commitPolyFill();                   // same result as Enter
    } else {
      const count = polyDraft.pts.length;
      cancelPolyDraft();
      redrawAll();
      showToast(count ? `PolyFill cancelled — needs 3+ corners, had ${count}.` : "PolyFill cancelled");
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



  function perspectivePointWorldTolerance() {
    try {
      const a = screenToWorld(0, 0);
      const b = screenToWorld(14, 0);
      const d = Math.abs((b && b.x || 0) - (a && a.x || 0));
      return Math.max(6, d || 6);
    } catch {
      return 10;
    }
  }

  function collectSharedPerspectivePointStarts(mainIndex, pointName) {
    const guide = state.objects[mainIndex];
    if (!guide || guide.kind !== "perspectiveGuide" || !pointName || !guide[pointName]) return [];
    const base = guide[pointName];
    const tol = perspectivePointWorldTolerance();
    const out = [];
    for (let i = 0; i < state.objects.length; i++) {
      const g = state.objects[i];
      if (!g || g.kind !== "perspectiveGuide") continue;
      for (const name of ["vp1", "vp2"]) {
        if (!g[name]) continue;
        if (Math.hypot(g[name].x - base.x, g[name].y - base.y) <= tol) {
          out.push({ index: i, name, startObj: deepClone(g) });
        }
      }
    }
    return out;
  }

  function findExistingPerspectiveGuideForTarget(targetId, mode) {
    if (!targetId) return -1;
    let fallback = -1;
    for (let i = state.objects.length - 1; i >= 0; i--) {
      const g = state.objects[i];
      if (!g || g.kind !== "perspectiveGuide" || g.targetId !== targetId) continue;
      if ((g.mode || 1) >= mode) return i;
      if (fallback < 0) fallback = i;
    }
    return fallback;
  }

  function createPerspectiveGuide(mode) {
    const idx = state.selectionIndex;
    const target = idx >= 0 ? state.objects[idx] : null;

    if (!target || target.kind === "perspectiveGuide" || target.kind === "erase") {
      showToast("Click the shape/line you want to use as the perspective source.");
      return false;
    }

    const targetId = ensureObjId(target);

    const existingIndex = findExistingPerspectiveGuideForTarget(targetId, mode);
    if (existingIndex >= 0) {
      const existing = state.objects[existingIndex];
      if (existing && existing.kind === "perspectiveGuide") {
        state.undo.push(JSON.stringify(snapshot()));
        state.redo.length = 0;
        if ((existing.mode || 1) < mode) existing.mode = mode;
        if (mode >= 2 && !existing.vp2) {
          const b0 = objectBounds(target);
          const cy0 = (b0.minY + b0.maxY) / 2;
          const viewA0 = screenToWorld ? screenToWorld(0, 0) : { x: b0.minX - 400, y: cy0 };
          existing.vp2 = { x: Math.min(b0.minX - 400, Math.min(viewA0.x, b0.minX - 400)), y: existing.vp1 ? existing.vp1.y : cy0 };
        }
        state.selectionIndex = existingIndex;
        state.selection = [existingIndex];
        redrawAll();
        showToast("Existing perspective guide selected — drag either red VP; shared stacked VPs move together.");
        return true;
      }
    }

    const pts = perspectiveTargetPoints(target);
    if (!pts.length) {
      showToast("No usable shape ends");
      return false;
    }

    const b = objectBounds(target);
    const w = Math.max(80, b.maxX - b.minX);
    const h = Math.max(60, b.maxY - b.minY);
    const cy = (b.minY + b.maxY) / 2;
    const viewA = screenToWorld ? screenToWorld(0, 0) : { x: b.minX - w * 4, y: cy };
    const viewB = screenToWorld ? screenToWorld(state.viewW || 1200, state.viewH || 800) : { x: b.maxX + w * 4, y: cy };
    const leftEdge = Math.min(viewA.x, viewB.x);
    const rightEdge = Math.max(viewA.x, viewB.x);
    const xPad = Math.max(w * 1.2, (rightEdge - leftEdge) * 0.08, 120);
    const vpY = cy - Math.max(h * 0.35, 40);

    const guide = {
      kind: "perspectiveGuide",
      targetId,
      mode,
      color: "#d32f2f",
      size: 3.5,
      opacity: 0.78,
      lineStyle: "reference",
      vp1: { x: Math.max(b.maxX + w * 2.2, rightEdge + xPad), y: vpY },
      vp2: { x: Math.min(b.minX - w * 2.2, leftEdge - xPad), y: vpY }
    };

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    ensureObjId(guide);
    state.objects.push(guide);
    addObjectToActiveReveal(guide);
    state.selectionIndex = state.objects.length - 1;
    state.selection = [state.selectionIndex];
    redrawAll();
    showToast((mode >= 2 ? "2-point" : "1-point") + " perspective guide added — drag the red VP points, or click the orange SOURCE box to grab the starting object.");
    return true;
  }

function onPointerDown(e) {
  if (!inkCanvas.contains(e.target)) return;
  if (e.button === 2) return;             // let right-click be handled separately
 if (e.pointerType !== "touch" && e.button !== 0 && e.button !== 1) return;


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

   if (spacePanning || e.button === 1) {
  gesture.mode = "pan";
  inkCanvas.style.cursor = "grabbing";
  return;
}

    const vpHit = hitPerspectivePointAnywhere(sx, sy);
    if (vpHit && !e.shiftKey) {
      state.selectionIndex = vpHit.index;
      state.selection = [vpHit.index];
      setActiveTool("select");
      syncStyleControlsFromSelection();
      if (beginSelectionTransform("perspectivePoint", w, vpHit.name)) {
        showToast("Drag vanishing point");
        redrawAll();
        return;
      }
    }

    if (state.tool === "polyFill" || state.tool === "curve") {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;

      if (!polyDraft.active) {
        polyDraft.active = true;
        polyDraft.pts = [];
        polyDraft.links = [];
        polyDraft.hover = null;
        showToast(state.tool === "curve" ? "Smooth curve: click points, Enter/dblclick/right-click to finish" : "PolyFill: click points, Enter/dblclick to finish");
      }

      const p = snapPolyPoint(w, bypassSnap);
      const first = polyDraft.pts[0];
      const closeTol = 14 / (state.zoom || 1);
      if (state.tool === "polyFill" && first && polyDraft.pts.length >= 3 && Math.hypot(first.x - p.x, first.y - p.y) <= closeTol) {
        try { inkCanvas.releasePointerCapture(e.pointerId); } catch {}
        gesture.active = false;
        gesture.mode = "none";
        commitPolyFill();
        return;
      }

      const last = polyDraft.pts[polyDraft.pts.length - 1];
      if (!last || Math.hypot(last.x - p.x, last.y - p.y) > 0.01) {
        polyDraft.pts.push({ x: p.x, y: p.y });
        polyDraft.links.push(snapRefForPolyPoint(p));
        const linkedNote = polyDraft.links[polyDraft.links.length - 1] ? " Linked corner." : "";
        if (state.tool === "curve") showToast(polyDraft.pts.length < 2 ? "Smooth curve: add one more point." : "Smooth curve: Enter, double-click, or right-click to finish.");
        else showToast((polyDraft.pts.length < 3 ? `PolyFill: ${polyDraft.pts.length}/3 corners. Add ${3 - polyDraft.pts.length} more.` : "PolyFill: Enter, double-click, right-click, or click near the first point to fill.") + linkedNote);
      } else {
        showToast("PolyFill point already there — click a new corner or press Enter to finish.");
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
      addObjectToActiveReveal(obj);
      state.selectionIndex = state.objects.length - 1;
      setActiveTool("select");
      redrawAll();
      return;
    }

if (state.tool === "select") {
  const handle = hitHandle(sx, sy);
  if (handle && !e.shiftKey) {
    if (beginSelectionTransform(handle.kind, w, handle)) {
      redrawAll();
      return;
    }
  }

  const hit = findHit(w.x, w.y);

  if (e.shiftKey && hit >= 0) {
    const i = state.selection.indexOf(hit);
    if (i >= 0) state.selection.splice(i, 1);
    else state.selection.push(hit);
    state.selectionIndex = state.selection.length ? state.selection[state.selection.length - 1] : -1;
    syncStyleControlsFromSelection();
    redrawAll();
    gesture.mode = "select";
    return;
  }

  if (hit >= 0) {
    const keepExistingGroup = state.selection.length > 1 && state.selection.includes(hit);
    if (!keepExistingGroup) state.selection = [hit];
    state.selectionIndex = keepExistingGroup ? hit : state.selection[state.selection.length - 1];
    syncStyleControlsFromSelection();
    redrawAll();
    beginSelectionTransform("move", w);
    return;
  }

  gesture.mode = "marqueeSelect";
  gesture.marqueeStart = { ...w };
  gesture.marqueeCurrent = { ...w };
  gesture.marqueeBaseSelection = e.shiftKey ? [...state.selection] : [];
  if (!e.shiftKey) {
    state.selection = [];
    state.selectionIndex = -1;
  }
  syncStyleControlsFromSelection();
  redrawAll();
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

    if (state.tool === "perspective1" || state.tool === "perspective2") {
      const hit = findHit(w.x, w.y);
      if (hit >= 0) {
        state.selectionIndex = hit;
        state.selection = [hit];
        syncStyleControlsFromSelection();
      }
      const made = createPerspectiveGuide(state.tool === "perspective2" ? 2 : 1);
      if (!made) showToast("Click the line/shape you want to use as the perspective source.");
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

    if (["line", "rect", "circle", "regularShape", "arrow"].includes(state.tool)) {
      const bypassSnap = isMac ? e.metaKey : e.ctrlKey;

      let p0;
      gesture.lineAnchorRef = null;
      gesture.lineEndAnchorRef = null;
      if (bypassSnap) {
        p0 = { x: w.x, y: w.y };
      } else {
        const anchorHit = (state.tool === "line" || state.tool === "arrow") ? preferredAnchorAt(w) : null;
        p0 = anchorHit || snapPointPreferEndsIntersections(w);
        if (!p0) p0 = snapToMmGridWorld(w);
        if ((state.tool === "line" || state.tool === "arrow") && p0.ref && isLinkRef(p0.ref)) {
          gesture.lineAnchorRef = cloneRef(p0.ref);
          gesture.lineEndAnchorRef = cloneRef(p0.ref);
        }
      }

      const fillHeld = e.altKey;

      const obj = {
        kind: state.tool,
        color: state.color,
        size: state.size,
        opacity: state.opacity,
        lineStyle: state.lineStyle || "solid",
        filled: state.tool === "regularShape"
          ? (fillHeld || !!state.regularShapeSettings?.filled)
          : (state.tool === "rect" || state.tool === "circle") && fillHeld,
        fillColor: state.color,
        ...(state.tool === "regularShape" ? {
          shapeType: state.regularShapeSettings?.shapeType === "star" ? "star" : "polygon",
          sides: Math.max(state.regularShapeSettings?.shapeType === "star" ? 4 : 3, Math.min(20, Math.round(Number(state.regularShapeSettings?.sides) || 6))),
          innerRatio: Number(state.regularShapeSettings?.innerRatio) || 0.45,
          strokeVisible: true
        } : {}),
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
      if (obj.kind === "regularShape") showMeasureTip(sx, sy, `${obj.shapeType === "star" ? obj.sides + "-point star" : obj.sides + "-sided polygon"} • 0 mm across corners`);

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

    if ((state.tool === "polyFill" || state.tool === "curve") && polyDraft.active) {
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

    if (gesture.mode === "marqueeSelect") {
      gesture.marqueeCurrent = { ...w };
      redrawAll();
      return;
    }

    if (gesture.mode === "pan" && gesture.lastScreen) {
      const ddx = sx - (gesture.lastScreenPrev?.sx ?? gesture.startScreen.sx);
      const ddy = sy - (gesture.lastScreenPrev?.sy ?? gesture.startScreen.sy);
      state.panX += ddx;
      state.panY += ddy;
      gesture.lastScreenPrev = { sx, sy };
      redrawAll();
      return;
    }

    if (gesture.mode === "perspectivePoint" && gesture.selIndex >= 0 && gesture.selStartObj) {
      const name = gesture.perspectivePointName;
      const startGuide = gesture.selStartObj;
      if (startGuide && name && startGuide[name]) {
        const bypassSnap = isMac ? e.metaKey : e.ctrlKey;
        const p = stableEndpointSnapForPerspectivePoint(w, {
          bypassSnap,
          gridSnap: e.shiftKey,
          skipObjId: startGuide._id
        });
        const dx = p.x - startGuide[name].x;
        const dy = p.y - startGuide[name].y;
        const cluster = Array.isArray(gesture.perspectivePointCluster) && gesture.perspectivePointCluster.length
          ? gesture.perspectivePointCluster
          : [{ index: gesture.selIndex, name, startObj: startGuide }];
        for (const item of cluster) {
          const base = item.startObj;
          if (!base || !base[item.name] || !state.objects[item.index]) continue;
          const obj = deepClone(base);
          obj[item.name].x = base[item.name].x + dx;
          obj[item.name].y = base[item.name].y + dy;
          state.objects[item.index] = obj;
        }
      }
      redrawAll();
      return;
    }

    if (gesture.mode === "lineEndResize" && gesture.selIndex >= 0 && gesture.selStartObj) {
      const obj = deepClone(gesture.selStartObj);
      if (obj && (obj.kind === "line" || obj.kind === "arrow")) {
        const bypassSnap = isMac ? e.metaKey : e.ctrlKey;
        const endName = gesture.lineResizeEnd || "end";
        const fixed = endName === "end" ? { x: obj.x1, y: obj.y1 } : { x: obj.x2, y: obj.y2 };
        let p = snapLinePoint(fixed, w, bypassSnap);

        if (obj.perspectiveLink && endName === "end") {
          state.objects[gesture.selIndex] = obj;
          const anchor = resolveAnchorPoint(obj.perspectiveLink.anchor);
          const vp = resolveVanishingPoint(obj.perspectiveLink.vp);
          if (anchor && vp) {
            const vx = vp.x - anchor.x;
            const vy = vp.y - anchor.y;
            const vLen = Math.hypot(vx, vy) || 1;
            const sign = obj.perspectiveLink.direction === -1 ? -1 : 1;
            const t = ((w.x - anchor.x) * vx + (w.y - anchor.y) * vy) / (vLen * vLen);
            const amount = Math.max(0.001, Math.abs(t));
            obj.perspectiveLink.direction = t < 0 ? -1 : sign;
            obj.perspectiveLink.rayT = amount;
            obj.perspectiveLink.lengthWorld = amount * vLen;
            updatePerspectiveLinkedObject(obj);
          }
        } else {
          if (obj.perspectiveLink) delete obj.perspectiveLink;
          if (endName === "end") {
            obj.x2 = p.x;
            obj.y2 = p.y;
            if (p.ref && isLinkRef(p.ref)) obj.endpointLinks = { ...(obj.endpointLinks || {}), end: cloneRef(p.ref) };
            else if (obj.endpointLinks) delete obj.endpointLinks.end;
          } else {
            obj.x1 = p.x;
            obj.y1 = p.y;
            if (p.ref && isLinkRef(p.ref)) obj.endpointLinks = { ...(obj.endpointLinks || {}), start: cloneRef(p.ref) };
            else if (obj.endpointLinks) delete obj.endpointLinks.start;
          }
          state.objects[gesture.selIndex] = obj;
        }
        updatePerspectiveLinks();
        const lenMm = Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) / pxPerMm();
        showMeasureTip(sx, sy, formatMm(lenMm));
        redrawAll();
        return;
      }
    }

    if (gesture.mode === "selMove" && Array.isArray(gesture.selStartItems) && gesture.selStartItems.length && gesture.startWorld) {
      const dx = w.x - gesture.startWorld.x;
      const dy = w.y - gesture.startWorld.y;
      for (const item of gesture.selStartItems) {
        if (!state.objects[item.index]) continue;
        const obj = deepClone(item.obj);
        moveObject(obj, dx, dy);
        state.objects[item.index] = obj;
      }
      updatePerspectiveLinks();
      redrawAll();
      return;
    }

    if (gesture.mode === "selScale" && Array.isArray(gesture.selStartItems) && gesture.selStartItems.length && gesture.selAnchor && gesture.startWorld) {
      const ax = gesture.selAnchor.x, ay = gesture.selAnchor.y;
      const v0 = { x: gesture.startWorld.x - ax, y: gesture.startWorld.y - ay };
      const v1 = { x: w.x - ax, y: w.y - ay };
      let fx = Math.abs(v0.x) < 0.001 ? 1 : v1.x / v0.x;
      let fy = Math.abs(v0.y) < 0.001 ? 1 : v1.y / v0.y;
      const regularSingle = gesture.selStartItems.length === 1 && gesture.selStartItems[0]?.obj?.kind === "regularShape";
      if (e.shiftKey || regularSingle) {
        const f = (Math.hypot(v1.x, v1.y) || 1) / (Math.hypot(v0.x, v0.y) || 1);
        fx = f;
        fy = f;
      }
      for (const item of gesture.selStartItems) {
        if (!state.objects[item.index]) continue;
        const obj = deepClone(item.obj);
        scaleObjectXY(obj, fx, fy, ax, ay);
        state.objects[item.index] = obj;
      }
      updatePerspectiveLinks();
      redrawAll();
      return;
    }

    if (gesture.mode === "selRotate" && Array.isArray(gesture.selStartItems) && gesture.selStartItems.length && gesture.selAnchor) {
      const ax = gesture.selAnchor.x, ay = gesture.selAnchor.y;
      let delta = Math.atan2(w.y - ay, w.x - ax) - gesture.selStartAngle;
      if (e.shiftKey) {
        const step = (15 * Math.PI) / 180;
        delta = Math.round(delta / step) * step;
      }
      for (const item of gesture.selStartItems) {
        if (!state.objects[item.index]) continue;
        const obj = deepClone(item.obj);
        rotateObjectAroundAnchor(obj, delta, ax, ay);
        state.objects[item.index] = obj;
      }
      updatePerspectiveLinks();
      redrawAll();
      return;
    }

    if (gesture.mode === "selMove" && gesture.selIndex >= 0 && gesture.selStartObj && gesture.startWorld) {
      const dx = w.x - gesture.startWorld.x;
      const dy = w.y - gesture.startWorld.y;
      state.objects[gesture.selIndex] = deepClone(gesture.selStartObj);
      moveObject(state.objects[gesture.selIndex], dx, dy);
      updatePerspectiveLinks();
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
      if (e.shiftKey || obj0.kind === "regularShape") {
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

      let startPt = { x: gesture.activeObj.x1, y: gesture.activeObj.y1 };
      let p2 = { x: w.x, y: w.y };

      if (k === "line" || k === "arrow") {
        p2 = snapLinePoint(startPt, p2, bypassSnap);
        gesture.lineEndAnchorRef = (!bypassSnap && p2.ref && isLinkRef(p2.ref)) ? cloneRef(p2.ref) : null;

        if (!bypassSnap && gesture.lineAnchorRef && p2.perspectiveRef) {
          const perspectiveAnchorRef = normalizePerspectiveAnchorForVP(gesture.lineAnchorRef, p2.perspectiveRef, startPt);
          const perspectiveAnchorPt = resolveAnchorPoint(perspectiveAnchorRef);
          if (perspectiveAnchorPt) {
            gesture.activeObj.x1 = perspectiveAnchorPt.x;
            gesture.activeObj.y1 = perspectiveAnchorPt.y;
            startPt = { x: perspectiveAnchorPt.x, y: perspectiveAnchorPt.y };
            p2 = snapLinePoint(startPt, { x: w.x, y: w.y }, bypassSnap);
          }

          const lengthWorld = Math.max(0.001, Math.hypot(p2.x - startPt.x, p2.y - startPt.y));
          const vp = resolveVanishingPoint(p2.perspectiveRef);
          const lenToVp = vp ? Math.hypot(vp.x - startPt.x, vp.y - startPt.y) : 0;
          const rayT = Number.isFinite(lenToVp) && lenToVp > 0.001 ? Math.max(0.001, lengthWorld / lenToVp) : undefined;
          gesture.activeObj.perspectiveLink = {
            anchor: cloneRef(perspectiveAnchorRef || gesture.lineAnchorRef),
            vp: cloneRef(p2.perspectiveRef),
            endMode: p2.perspectiveEndMode || "length",
            direction: p2.perspectiveDirection === -1 ? -1 : 1,
            lengthWorld,
            ...(rayT ? { rayT } : {})
          };
          delete gesture.activeObj.endpointLinks;
        } else {
          if (gesture.activeObj.perspectiveLink) delete gesture.activeObj.perspectiveLink;

          const startRef = gesture.lineAnchorRef || null;
          const endRef = gesture.lineEndAnchorRef || null;
          if (startRef || endRef) {
            gesture.activeObj.endpointLinks = {
              ...(startRef ? { start: cloneRef(startRef) } : {}),
              ...(endRef ? { end: cloneRef(endRef) } : {})
            };
          } else if (gesture.activeObj.endpointLinks) {
            delete gesture.activeObj.endpointLinks;
          }

          if (gesture.forceLinkActive) autoLinkLinesTouchingDrawnLine(gesture.activeObj);
        }
      }
      else if (k === "rect" || k === "circle" || k === "regularShape") p2 = snapShapePoint(startPt, p2, bypassSnap);

      if (k === "regularShape" || ((k === "rect" || k === "circle") && e.shiftKey)) {
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
      if (k === "regularShape") {
        const wMm = Math.abs(p2.x - startPt.x) / pxPerMm();
        const hMm = Math.abs(p2.y - startPt.y) / pxPerMm();
        const label = gesture.activeObj.shapeType === "star" ? `${gesture.activeObj.sides}-point star` : `${gesture.activeObj.sides}-sided polygon`;
        showMeasureTip(sx, sy, `${label} • ${Math.round(Math.min(wMm, hMm))} mm across corners`);
      }

      redrawAll();
      return;
    }
  }

  function isDegenerateFinishedObject(obj) {
    if (!obj) return false;
    const zoom = Math.max(0.0001, Number(state.zoom) || 1);
    const minPx = 3;

    if (obj.kind === "line" || obj.kind === "arrow") {
      return Math.hypot(obj.x2 - obj.x1, obj.y2 - obj.y1) * zoom < minPx;
    }
    if (obj.kind === "rect" || obj.kind === "circle" || obj.kind === "regularShape") {
      return Math.abs(obj.x2 - obj.x1) * zoom < minPx || Math.abs(obj.y2 - obj.y1) * zoom < minPx;
    }
    if (obj.kind === "arc") {
      const span = Math.abs((obj.a2 || 0) - (obj.a1 || 0));
      return span * Math.max(0, Number(obj.r) || 0) * zoom < minPx;
    }
    return false;
  }

  function onPointerUp() {
    if (!gesture.active) return;

    if (gesture.mode === "marqueeSelect" && gesture.marqueeStart && gesture.marqueeCurrent) {
      const a = gesture.marqueeStart;
      const b = gesture.marqueeCurrent;
      const box = { minX: Math.min(a.x, b.x), minY: Math.min(a.y, b.y), maxX: Math.max(a.x, b.x), maxY: Math.max(a.y, b.y) };
      const picked = [];
      for (let i = 0; i < state.objects.length; i++) {
        const obj = state.objects[i];
        if (!obj || obj.hidden) continue;
        const ob = objectBounds(obj);
        if (ob && ob.maxX >= box.minX && ob.minX <= box.maxX && ob.maxY >= box.minY && ob.minY <= box.maxY) picked.push(i);
      }
      const base = Array.isArray(gesture.marqueeBaseSelection) ? gesture.marqueeBaseSelection : [];
      state.selection = [...new Set([...base, ...picked])];
      state.selectionIndex = state.selection.length ? state.selection[state.selection.length - 1] : -1;
      try { inkCanvas.releasePointerCapture(gesture.pointerId); } catch {}
      const count = state.selection.length;
      hardResetGesture();
      syncStyleControlsFromSelection();
      redrawAll();
      if (count > 1) showToast(`${count} objects selected as one group`);
      else if (count === 1) showToast("1 object selected");
      return;
    }

    const finishedObj = gesture.activeObj;

    if (isDegenerateFinishedObject(finishedObj)) {
      const idx = state.objects.indexOf(finishedObj);
      if (idx >= 0) state.objects.splice(idx, 1);
      if (state.undo.length) state.undo.pop();
      try { inkCanvas.releasePointerCapture(gesture.pointerId); } catch {}
      hardResetGesture();
      updateCursorFromTool();
      redrawAll();
      showToast("Drag to draw a visible shape");
      return;
    }

    const beforeIds = new Set(state.objects.map(o => o && o._id).filter(Boolean));
    let addedPerspectiveHelper = false;
    if (finishedObj && (finishedObj.kind === "line" || finishedObj.kind === "arrow")) {
      const seg = lineSegmentFromObject(finishedObj);
      if (seg) lastDrawnLineId = ensureObjId(finishedObj);
      addedPerspectiveHelper = ensurePerspectiveExtensionHelper(finishedObj);
    }

    const revealTargets = [];
    if (finishedObj) revealTargets.push(finishedObj);
    for (const obj of state.objects) {
      if (obj && obj._id && !beforeIds.has(obj._id)) revealTargets.push(obj);
    }
    const addedToReveal = addRecentlyDrawnObjectsToActiveReveal(revealTargets, { hide: false });

    try { inkCanvas.releasePointerCapture(gesture.pointerId); } catch {}
    hardResetGesture();
    updateCursorFromTool();
    updatePerspectiveLinks();
    redrawAll();
    if (addedToReveal) showToast("Added to reveal steps");
    else if (addedPerspectiveHelper) showToast("Perspective helper ray added");
  }

  /* =========================
     Keyboard
  ========================= */
  document.addEventListener("keydown", e => {
    const activeEl = document.activeElement;
    const tag = (activeEl && activeEl.tagName) || "";
    const typing = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && activeEl !== lenInput;
    const mod = isMac ? e.metaKey : e.ctrlKey;

    // Highest-priority keyboard handling: undo/redo must never be intercepted
    // by hide/reveal, tool shortcuts, selected-line typing, or presentation controls.
    if (mod) {
      const key = e.key.toLowerCase();
      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        hardResetGesture();
        cancelPolyDraft();
        closeLenBox();
        if (state.undo.length) {
          state.redo.push(JSON.stringify(snapshot()));
          applySnapshot(JSON.parse(state.undo.pop()));
          syncStyleControlsFromSelection();
          redrawAll();
          showToast("Undone");
        } else {
          showToast("Nothing to undo");
        }
        return;
      }
      if (key === "y" || (key === "z" && e.shiftKey)) {
        e.preventDefault();
        hardResetGesture();
        cancelPolyDraft();
        closeLenBox();
        if (state.redo.length) {
          state.undo.push(JSON.stringify(snapshot()));
          applySnapshot(JSON.parse(state.redo.pop()));
          syncStyleControlsFromSelection();
          redrawAll();
          showToast("Redone");
        } else {
          showToast("Nothing to redo");
        }
        return;
      }
    }

    if (!typing && (state.tool === "polyFill" || state.tool === "curve") && polyDraft.active) {
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
        if (polyDraft.links) polyDraft.links.pop();
        if (!polyDraft.pts.length) cancelPolyDraft();
        redrawAll();
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (state.tool === "curve") commitSmoothCurve();
        else commitPolyFill();
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
     
if (!typing && e.code === "Space") {
  spacePanning = true;
  e.preventDefault();
  return;
}


    if (!typing && !mod && !gesture.active && state.selectionIndex >= 0) {
      const selectedObj = state.objects[state.selectionIndex];
      if (selectedObj && (selectedObj.kind === "line" || selectedObj.kind === "arrow") && (e.key === "m" || e.key === "M")) {
        e.preventDefault();
        const b = objectBounds(selectedObj);
        const centerS = worldToScreen((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
        const curMm = Math.max(1, Math.round(Math.hypot(selectedObj.x2 - selectedObj.x1, selectedObj.y2 - selectedObj.y1) / pxPerMm()) || 1);
        lenEntry.open = true;
        lenEntry.seedMm = parseMmInput(String(curMm)) ?? null;
        openLenBoxAt(centerS.sx, centerS.sy, String(curMm));
        showToast("Type length in mm, then Enter");
        return;
      }
    }

    if (!typing && !mod && !gesture.active && state.selectionIndex >= 0) {
      const selectedObj = state.objects[state.selectionIndex];
      if (selectedObj && (selectedObj.kind === "line" || selectedObj.kind === "arrow")) {
        const isDigit = /^[0-9]$/.test(e.key);
        const isDot = e.key === "." || e.key === ",";
        const isBack = e.key === "Backspace";
        const isEnter = e.key === "Enter";
        const isEsc = e.key === "Escape";
        const isMinus = e.key === "-";
        const wantsLengthInput = isDigit || isBack || isEnter || isEsc || isMinus || (lenEntry.open && isDot);
        if (wantsLengthInput) {
          e.preventDefault();
          const b = objectBounds(selectedObj);
          const centerS = worldToScreen((b.minX + b.maxX) / 2, (b.minY + b.maxY) / 2);
          if (!lenEntry.open && (isDigit || isBack || isMinus || isEnter)) {
            const curMm = Math.max(1, Math.round(Math.hypot(selectedObj.x2 - selectedObj.x1, selectedObj.y2 - selectedObj.y1) / pxPerMm()) || 1);
            lenEntry.open = true;
            lenEntry.seedMm = parseMmInput(String(curMm)) ?? null;
            openLenBoxAt(centerS.sx, centerS.sy, String(curMm));
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
            state.undo.push(JSON.stringify(snapshot()));
            state.redo.length = 0;
            setActiveLineLengthMm(mm);
            updatePerspectiveLinks();
            lenEntry.open = false;
            closeLenBox();
            redrawAll();
            showToast(`Line length set to ${Math.round(mm)} mm`);
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
    }

    if (!typing && !mod && !gesture.active) {
      const presetByKey = { "1": "construction", "2": "outline", "3": "fill", "4": "reference", "5": "hidden", "6": "center" };
      const pickedPreset = presetByKey[e.key];
      if (pickedPreset) {
        e.preventDefault();
        applyDrawingPreset(pickedPreset);
        return;
      }
    }

    if (!typing && (e.key === "i" || e.key === "I") && !mod) {
      e.preventDefault();
      if (e.shiftKey) repairSelectedLinks();
      else checkSelectedLinks(true);
      return;
    }

    if (!typing && (e.key === "j" || e.key === "J") && !mod) {
      e.preventDefault();
      const lineCandidates = snipJoinCandidateLines();
      if (lineCandidates.length !== 2) {
        showToast(lineCandidates.length > 2 ? "Select only the two lines to snip" : "Hover near the second crossing line. Snip uses the selected line, or the last drawn line if none is selected.");
        return;
      }
      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
      const result = snipAndJoinLineIntersections();
      redrawAll();
      showToast(result.changed ? "Snipped/joined lines" : result.reason);
      return;
    }

    if (!typing && (e.key === "l" || e.key === "L") && !mod) {
      const isDrawingLine = gesture.active && gesture.mode === "drawShape" && gesture.activeObj && (gesture.activeObj.kind === "line" || gesture.activeObj.kind === "arrow");
      const selectedLineObjs = (state.selection || [])
        .map(i => state.objects[i])
        .filter(o => o && (o.kind === "line" || o.kind === "arrow"));
      const allLineObjs = state.objects.filter(o => o && (o.kind === "line" || o.kind === "arrow"));

      if (isDrawingLine || selectedLineObjs.length || state.tool === "line" || state.tool === "arrow") {
        e.preventDefault();
        gesture.forceLinkActive = isDrawingLine;
        state.undo.push(JSON.stringify(snapshot()));
        state.redo.length = 0;
        const changed = autoLinkOverlappingLines(isDrawingLine ? [gesture.activeObj] : (selectedLineObjs.length ? selectedLineObjs : allLineObjs));
        redrawAll();
        showToast(changed ? "Overlaps linked" : "No overlaps to link");
        return;
      }
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

    if (!typing && gesture.active && gesture.mode === "lineEndResize" && state.selectionIndex >= 0) {
      const selectedObj = state.objects[state.selectionIndex];
      if (selectedObj && (selectedObj.kind === "line" || selectedObj.kind === "arrow")) {
        const isDigit = /^[0-9]$/.test(e.key);
        const isDot = e.key === "." || e.key === ",";
        const isBack = e.key === "Backspace";
        const isEnter = e.key === "Enter";
        const isEsc = e.key === "Escape";
        const isMinus = e.key === "-";
        if (isDigit || isDot || isBack || isEnter || isEsc || isMinus) {
          e.preventDefault();
          const sx = gesture.lastScreen?.sx ?? gesture.startScreen?.sx ?? 0;
          const sy = gesture.lastScreen?.sy ?? gesture.startScreen?.sy ?? 0;
          if (!lenEntry.open && (isDigit || isDot || isBack || isMinus || isEnter)) {
            const curMm = Math.max(1, Math.round(Math.hypot(selectedObj.x2 - selectedObj.x1, selectedObj.y2 - selectedObj.y1) / pxPerMm()) || 1);
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
            updatePerspectiveLinks();
            lenEntry.open = false;
            closeLenBox();
            redrawAll();
            showToast(`Line length set to ${Math.round(mm)} mm`);
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

    if (!typing && !mod && (e.key === "h" || e.key === "H")) {
      e.preventDefault();
      if (e.shiftKey) unhideAllObjects();
      else hideSelectedObjects();
      return;
    }

    if (!typing && e.shiftKey && (e.key === ">" || e.code === "Period")) {
      e.preventDefault();
      toggleSvgPlayback();
      return;
    }

    if (!typing && e.shiftKey && (e.key === "<" || e.code === "Comma")) {
      e.preventDefault();
      configureSvgPlayback();
      return;
    }

    const isRevealKey =
      !e.shiftKey &&
      (e.key === "." || e.key === "," || e.code === "Period" || e.code === "Comma" || e.code === "NumpadDecimal");

    if (!typing && isRevealKey) {
      e.preventDefault();

      if (e.key === "." || e.code === "Period" || e.code === "NumpadDecimal") {
        revealNextStep();
        return;
      }

      if (e.key === "," || e.code === "Comma") {
        revealPrevStep();
        return;
      }
    }

if (!typing && (e.key === "Delete" || e.key === "Backspace")) {

  if (state.selection && state.selection.length) {

    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;

    state.selection
      .sort((a,b)=>b-a)
      .forEach(i => state.objects.splice(i,1));

 
state.selectionIndex = -1;
state.selection = [];

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
      if (k === "u") setActiveTool("curve");
      if (k === "q") {
        setActiveTool("regularShape");
        if (shapeTypeSelect && !["polygon", "star"].includes(shapeTypeSelect.value)) shapeTypeSelect.value = state.regularShapeSettings?.shapeType === "star" ? "star" : "polygon";
        openShapeSizePanel(true);
      }
    }

    if (mod) {
      const key = e.key.toLowerCase();

      if (key === "c") {
        e.preventDefault();
        copySelection();
        return;
      }

      if (key === "v") {
        const hasObjectClipboard =
          Array.isArray(state.clipboard) && state.clipboard.length > 0;

        if (hasObjectClipboard) {
          e.preventDefault();
          pasteClipboard();
          return;
        }
      }

      if (key === "x") {
        e.preventDefault();
        cutSelection();
        return;
      }

      if (key === "z" && !e.shiftKey) {
        e.preventDefault();
        hardResetGesture();
        cancelPolyDraft();

        if (state.undo.length) {
          state.redo.push(JSON.stringify(snapshot()));
          applySnapshot(JSON.parse(state.undo.pop()));
          syncStyleControlsFromSelection();
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
          syncStyleControlsFromSelection();
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
    const activeEl = document.activeElement;
    const tag = (activeEl && activeEl.tagName) || "";
    const typing = (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") && activeEl !== lenInput;

    if (!typing && e.code === "Space") {
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

   inkCanvas.addEventListener("mousedown", e => {
  if (e.button === 1) e.preventDefault();
});

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

      const z = clamp(state.zoom * step, 0.005, 12);
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
  bindSvgInput(quickSvgInkFile, null, () => {
    setTimeout(() => enterPresentationMode(), 0);
  });
  bindExport(exportBtn, exportSvgBtn, printBtn, printFitBtn);
  bindProjectFiles();
  bindBoardManager();
  bindAutosave();

  regularShapeToolBtn?.setAttribute("aria-expanded", "false");
  shapeSizeCloseBtn?.addEventListener("click", () => openShapeSizePanel(false));
  shapeTypeSelect?.addEventListener("change", () => {
    syncRegularShapeSettingsFromForm();
    updateShapeSizeForm();
  });
  shapeWidthInput?.addEventListener("input", () => {
    if (["polygon", "star"].includes(shapeTypeSelect?.value)) {
      if (shapeHeightInput) shapeHeightInput.value = shapeWidthInput.value;
    }
  });
  shapeSidesInput?.addEventListener("input", () => {
    syncRegularShapeSettingsFromForm();
    updateShapeSizeForm();
  });
  shapeFilledInput?.addEventListener("change", syncRegularShapeSettingsFromForm);
  regularShapeToolBtn?.addEventListener("click", e => {
    e.stopPropagation();
    openShapeSizePanel(true);
    if (shapeTypeSelect) shapeTypeSelect.value = state.regularShapeSettings?.shapeType === "star" ? "star" : "polygon";
    if (shapeSidesInput) shapeSidesInput.value = String(state.regularShapeSettings?.sides || 6);
    if (shapeFilledInput) shapeFilledInput.checked = !!state.regularShapeSettings?.filled;
    updateShapeSizeForm();
  });
  shapeSizeApplyBtn?.addEventListener("click", applyExactShapeSize);
  shapeSizeCreateBtn?.addEventListener("click", createExactShape);
  shapeSizePanel?.addEventListener("pointerdown", e => e.stopPropagation());
  document.addEventListener("pointerdown", e => {
    if (!shapeSizePanel || shapeSizePanel.classList.contains("is-hidden")) return;
    if (!shapeSizePanel.contains(e.target) && !regularShapeToolBtn?.contains(e.target)) openShapeSizePanel(false);
  });
  window.addEventListener("resize", positionShapeSizePanel);
  document.addEventListener("keydown", e => {
    const active = document.activeElement;
    const typing = active && ["INPUT", "TEXTAREA", "SELECT"].includes(active.tagName);
    if (e.key === "Escape" && !shapeSizePanel?.classList.contains("is-hidden")) {
      e.preventDefault();
      openShapeSizePanel(false);
      return;
    }
    if (!typing && !e.ctrlKey && !e.metaKey && !e.altKey && (e.key === "d" || e.key === "D")) {
      e.preventDefault();
      openShapeSizePanel(true);
    }
  });

  document.querySelectorAll("#advancedTools .dockBtn").forEach(btn => {
    btn.addEventListener("click", () => openSettings(false));
  });

  hideSelectedBtn?.addEventListener("click", hideSelectedObjects);
  unhideAllBtn?.addEventListener("click", unhideAllObjects);
  hideSelectedPanelBtn?.addEventListener("click", hideSelectedObjects);
  unhideAllPanelBtn?.addEventListener("click", unhideAllObjects);
  visibilityPrevBtn?.addEventListener("click", revealPrevStep);
  visibilityNextBtn?.addEventListener("click", revealNextStep);
  visibilityPlayBtn?.addEventListener("click", toggleSvgPlayback);
  visibilityTimingBtn?.addEventListener("click", configureSvgPlayback);
  visibilityPrevPanelBtn?.addEventListener("click", revealPrevStep);
  visibilityNextPanelBtn?.addEventListener("click", revealNextStep);
  visibilityPlayPanelBtn?.addEventListener("click", toggleSvgPlayback);
  visibilityTimingPanelBtn?.addEventListener("click", configureSvgPlayback);
  presentationBtn?.addEventListener("click", enterPresentationMode);
  presentationPanelBtn?.addEventListener("click", enterPresentationMode);
  presentationPrevBtn?.addEventListener("click", revealPrevStep);
  presentationNextBtn?.addEventListener("click", revealNextStep);
  presentationPlayBtn?.addEventListener("click", toggleSvgPlayback);
  presentationBlankBtn?.addEventListener("click", togglePresentationBlank);
  presentationExitBtn?.addEventListener("click", exitPresentationMode);
  document.addEventListener("keydown", handlePresentationKey, true);
  document.addEventListener("fullscreenchange", () => {
    if (presentationState.active && !document.fullscreenElement) exitPresentationMode();
  });

  clearBtn?.addEventListener("click", () => {
    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    hardResetGesture();
    cancelPolyDraft();
    resetSvgRevealState();
    state.objects = [];
   state.selectionIndex = -1;
    state.selection = [];
    setActiveTool("pen");
    redrawAll();
  });
linkInspectorCheckBtn?.addEventListener("click", () => checkSelectedLinks(true));
linkInspectorRepairBtn?.addEventListener("click", () => repairSelectedLinks());

snipJoinBtn?.addEventListener("click", () => {
    const lineCandidates = snipJoinCandidateLines();
    if (lineCandidates.length !== 2) {
      showToast(lineCandidates.length > 2 ? "Select only the two lines to snip" : "Hover near the second crossing line. Snip uses the selected line, or the last drawn line if none is selected.");
      return;
    }
    state.undo.push(JSON.stringify(snapshot()));
    state.redo.length = 0;
    const result = snipAndJoinLineIntersections();
    redrawAll();
    showToast(result.changed ? "Snipped/joined lines" : result.reason);
  });

   let styleEditSnapshotTaken = false;
   
colorInput?.addEventListener("input", e => {
  const value = e.target.value;
  setColor(value);

  if (state.selectionIndex >= 0) {
    if (!styleEditSnapshotTaken) {
      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
      styleEditSnapshotTaken = true;
    }
    applyStyleToSelectionLive({ color: value });
  }
});

colorInput?.addEventListener("change", () => {
  styleEditSnapshotTaken = false;
});

opacityRange?.addEventListener("input", e => {
  const value = parseFloat(e.target.value || "1");
  state.opacity = clamp(value, 0.05, 1);
  updateBrushUI();

  if (state.selectionIndex >= 0) {
    if (!styleEditSnapshotTaken) {
      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
      styleEditSnapshotTaken = true;
    }
    applyStyleToSelectionLive({ opacity: value });
  }
});

opacityRange?.addEventListener("change", () => {
  styleEditSnapshotTaken = false;
});

   brushSize?.addEventListener("input", e => {
  const value = clamp(Number(e.target.value || 5), 1, 60);
  setBrushSize(value);

  if (state.selectionIndex >= 0) {
    if (!styleEditSnapshotTaken) {
      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
      styleEditSnapshotTaken = true;
    }
    applyStyleToSelectionLive({ size: value });
  }
});

brushSize?.addEventListener("change", () => {
  styleEditSnapshotTaken = false;
});

lineStyleSolid?.addEventListener("click", () => applyLineStylePreset("solid"));
lineStyleReference?.addEventListener("click", () => applyLineStylePreset("reference"));
lineStyleHidden?.addEventListener("click", () => applyLineStylePreset("hidden"));
lineStyleCenter?.addEventListener("click", () => applyLineStylePreset("center"));


   
  function bindPresetField(input, kind, prop) {
    input?.addEventListener("input", e => {
      let value = e.target.value;
      if (prop === "size") value = clamp(Number(value || 1), 1, 60);
      updateLinePreset(kind, { [prop]: value });
    });
  }

  bindPresetField(refColorInput, "reference", "color");
  bindPresetField(refSizeInput, "reference", "size");
  bindPresetField(hiddenColorInput, "hidden", "color");
  bindPresetField(hiddenSizeInput, "hidden", "size");
  bindPresetField(centerColorInput, "center", "color");
  bindPresetField(centerSizeInput, "center", "size");

  syncLinePresetInputs();

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

  window.PHSWhiteboard = Object.freeze({
    version: "11.6-simplified-shapes-final-qa",
    getSnapshot: () => deepClone(snapshot()),
    getSelection: () => [...(state.selection || [])],
    getPresentationState: () => ({ active: presentationState.active, blank: presentationState.blank }),
    loadSnapshot: data => applySnapshot(deepClone(data || {}), { startRevealAtZero: false })
  });

  /* =========================
     Init
  ========================= */
  function init() {
    setColor(colorInput?.value || "#111111");
    setBrushSize(brushSize?.value || 5);
    state.opacity = parseFloat(opacityRange?.value || "1");
    updateBrushUI();
    syncLinePresetInputs();
    setActiveTool("pen");
    updateScaleOut();
    void refreshBoardSelect();
    resizeAll();

    requestAnimationFrame(() => {
      resizeAll();
      state.zoom = 0.25;
      state.panX = state.viewW / 2;
      state.panY = state.viewH / 2;
      redrawAll();
      startAutosave();
    });
  }

  const ro = new ResizeObserver(() => resizeAll());
  ro.observe(stage);
  init();
})();
