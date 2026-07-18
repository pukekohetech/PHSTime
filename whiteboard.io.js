/* ==========================================================
   whiteboard.io.js
   Import / Export / Boards / Print / Background
   Safe split for PHS Whiteboard
   ========================================================== */

window.WBIO = (() => {
  function createIOApi(ctx) {
    const {
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
      objectBounds,
      svgDashArray,
      detectLineStyleFromDashArray,
      worldToScreen,
      screenToWorld,
      pointOnArc,
      rectEdges,
      exportWorldBounds,
      ensureObjId,
      ensureRevealId,
      findObjById,
      findObjByRevealId,
      repairRevealIds,
      migrateRevealPartIds,
      syncNextObjIdCounter,
      perspectiveTargetPoints,
      stopSvgPlayback,
      resetSvgRevealState
    } = ctx;

    const LS_KEY = "PHS_WHITEBOARD_BOARDS_v8";
    const AUTOSAVE_KEY = "PHS_WHITEBOARD_AUTOSAVE_v1";
    const PROJECT_FORMAT = "phs-whiteboard-project";
    const DB_NAME = "PHS_WHITEBOARD_STORAGE";
    const DB_VERSION = 1;
    const DB_STORE = "records";
    const BOARDS_RECORD_KEY = "saved-boards-v11";
    const AUTOSAVE_RECORD_KEY = "autosave-v2";
    let autosaveTimer = 0;
    let autosaveLastFingerprint = "";
    let storageDbPromise = null;
    let storageBackend = "checking";
    let storageWarningShown = false;
    const memoryStorage = new Map();

    function snapshot() {
      repairRevealIds(state.objects);
      const migrated = migrateRevealPartIds(svgReveal.partIds, svgReveal.groupId);
      if (svgReveal.active) svgReveal.partIds = migrated.partIds;

      return {
        tool: state.tool,
        color: state.color,
        size: state.size,
        opacity: state.opacity,
        lineStyle: state.lineStyle || "solid",
        linePresetMap: JSON.parse(JSON.stringify(state.linePresetMap || {})),
        zoom: state.zoom,
        panX: state.panX,
        panY: state.panY,
        title: state.title,
        pxPerMm: pxPerMm(),
        bg: { ...state.bg },
        objects: deepClone(state.objects),
        svgReveal: {
          active: !!svgReveal.active,
          groupId: svgReveal.groupId || null,
          partIds: Array.isArray(svgReveal.partIds) ? [...svgReveal.partIds] : [],
          revealed: Number(svgReveal.revealed || 0)
        }
      };
    }

    function applySnapshot(snap, opts = {}) {
      state.tool = snap.tool || "pen";
      setActiveTool(state.tool);

      state.color = snap.color || "#111111";
      state.size = snap.size || 5;
      state.opacity = Number(snap.opacity ?? 1);
      state.lineStyle = snap.lineStyle || "solid";
      state.linePresetMap = {
        reference: { color: "#1b5e20", size: 10 },
        hidden: { color: "#1976d2", size: 10 },
        center: { color: "#d32f2f", size: 10 },
        ...(snap.linePresetMap || {})
      };

      state.zoom = Number(snap.zoom || 1);
      state.panX = Number(snap.panX || 0);
      state.panY = Number(snap.panY || 0);

      state.title = snap.title || "";
      if (titleInput) titleInput.value = state.title;

      state.pxPerMm = Number(snap.pxPerMm || state.pxPerMm);
      state.bg = {
        ...(snap.bg || { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 })
      };

      state.objects = Array.isArray(snap.objects) ? deepClone(snap.objects) : [];
      state.selectionIndex = -1;
      state.selection = [];
      syncNextObjIdCounter(state.objects);

      // Older files stored geometry IDs in partIds. Those IDs may be duplicated,
      // so migrate to separate unique reveal IDs without changing geometry links.
      const rev = snap.svgReveal || null;
      const hasHidden = state.objects.some(o => o && o.hidden);
      const groupId = rev?.groupId || (hasHidden ? "__manual_hidden_objects__" : null);
      const migrated = migrateRevealPartIds(rev?.partIds || [], groupId);

      if (migrated.partIds.length) {
        svgReveal.active = true;
        svgReveal.groupId = groupId || "__manual_hidden_objects__";
        svgReveal.partIds = migrated.partIds;
        const maxReveal = svgReveal.partIds.length;
        const savedReveal = Number.isFinite(Number(rev?.revealed)) ? Number(rev.revealed) : 0;
        svgReveal.revealed = Math.max(0, Math.min(maxReveal, opts.startRevealAtZero ? 0 : savedReveal));

        if (opts.startRevealAtZero) {
          const revealIds = new Set(svgReveal.partIds);
          for (const obj of state.objects) {
            if (obj && revealIds.has(ensureRevealId(obj))) obj.hidden = true;
          }
        }
      } else {
        svgReveal.active = false;
        svgReveal.groupId = null;
        svgReveal.partIds = [];
        svgReveal.revealed = 0;
      }

      if (state.bg && state.bg.src) bgImg.src = state.bg.src;
      else bgImg.removeAttribute("src");

      redrawAll();
      return { repairedRevealIds: migrated.repairedRevealIds || 0 };
    }

     function performUndo() {
  if (!state.undo.length) {
    showToast("Nothing to undo");
    return;
  }

  state.redo.push(JSON.stringify(snapshot()));
  const snap = JSON.parse(state.undo.pop());

  hardResetGesture();
  cancelPolyDraft();
  applySnapshot(snap);
  updateBrushUI();
  showToast("Undone");
}

function performRedo() {
  if (!state.redo.length) {
    showToast("Nothing to redo");
    return;
  }

  state.undo.push(JSON.stringify(snapshot()));
  const snap = JSON.parse(state.redo.pop());

  hardResetGesture();
  cancelPolyDraft();
  applySnapshot(snap);
  updateBrushUI();
  showToast("Redone");
}

    function openStorageDb() {
      if (storageDbPromise) return storageDbPromise;
      storageDbPromise = new Promise((resolve, reject) => {
        if (!("indexedDB" in window)) {
          reject(new Error("IndexedDB is unavailable"));
          return;
        }
        let request;
        try { request = indexedDB.open(DB_NAME, DB_VERSION); }
        catch (err) { reject(err); return; }
        request.onupgradeneeded = () => {
          const db = request.result;
          if (!db.objectStoreNames.contains(DB_STORE)) db.createObjectStore(DB_STORE);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || new Error("Could not open board storage"));
        request.onblocked = () => reject(new Error("Board storage is blocked by another tab"));
      }).catch(err => { storageDbPromise = null; throw err; });
      return storageDbPromise;
    }

    async function idbGet(key) {
      const db = await openStorageDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readonly");
        const request = tx.objectStore(DB_STORE).get(key);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error || tx.error || new Error("Could not read board storage"));
      });
    }

    async function idbSet(key, value) {
      const db = await openStorageDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).put(value, key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("Could not write board storage"));
        tx.onabort = () => reject(tx.error || new Error("Board storage write was cancelled"));
      });
    }

    async function idbDelete(key) {
      const db = await openStorageDb();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(DB_STORE, "readwrite");
        tx.objectStore(DB_STORE).delete(key);
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => reject(tx.error || new Error("Could not clear board storage"));
        tx.onabort = () => reject(tx.error || new Error("Board storage clear was cancelled"));
      });
    }

    function readLegacyStorage(key, fallback = null) {
      try {
        const raw = localStorage.getItem(key);
        return raw == null ? fallback : JSON.parse(raw);
      } catch { return fallback; }
    }

    function writeLegacyStorage(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); return true; }
      catch { return false; }
    }

    function removeLegacyStorage(key) {
      try { localStorage.removeItem(key); } catch {}
    }

    async function readStorageRecord(recordKey, legacyKey, fallback) {
      try {
        const value = await idbGet(recordKey);
        if (value !== undefined && value !== null) {
          storageBackend = "IndexedDB";
          memoryStorage.set(recordKey, value);
          return value;
        }
        const legacy = readLegacyStorage(legacyKey, null);
        if (legacy !== null) {
          await idbSet(recordKey, legacy);
          storageBackend = "IndexedDB";
          memoryStorage.set(recordKey, legacy);
          removeLegacyStorage(legacyKey);
          return legacy;
        }
      } catch (err) { console.warn("IndexedDB storage unavailable; trying legacy storage", err); }

      const legacy = readLegacyStorage(legacyKey, null);
      if (legacy !== null) {
        storageBackend = "localStorage";
        memoryStorage.set(recordKey, legacy);
        return legacy;
      }
      if (memoryStorage.has(recordKey)) {
        storageBackend = "memory";
        return memoryStorage.get(recordKey);
      }
      return fallback;
    }

    async function writeStorageRecord(recordKey, legacyKey, value) {
      memoryStorage.set(recordKey, value);
      try {
        await idbSet(recordKey, value);
        storageBackend = "IndexedDB";
        removeLegacyStorage(legacyKey);
        return true;
      } catch (err) { console.warn("IndexedDB save failed; trying legacy storage", err); }
      if (writeLegacyStorage(legacyKey, value)) {
        storageBackend = "localStorage";
        return true;
      }
      storageBackend = "memory";
      if (!storageWarningShown) {
        storageWarningShown = true;
        showToast("Browser storage is unavailable — use Download editable project to keep this board");
      }
      return false;
    }

    async function deleteStorageRecord(recordKey, legacyKey) {
      memoryStorage.delete(recordKey);
      let persistent = false;
      try { await idbDelete(recordKey); persistent = true; storageBackend = "IndexedDB"; }
      catch (err) { console.warn("IndexedDB clear failed", err); }
      try { localStorage.removeItem(legacyKey); persistent = true; if (storageBackend !== "IndexedDB") storageBackend = "localStorage"; } catch {}
      return persistent;
    }

    function normaliseBoardIndex(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }

    async function loadBoardsIndex() {
      return normaliseBoardIndex(await readStorageRecord(BOARDS_RECORD_KEY, LS_KEY, {}));
    }

    async function saveBoardsIndex(index) {
      const ok = await writeStorageRecord(BOARDS_RECORD_KEY, LS_KEY, normaliseBoardIndex(index));
      if (!ok) console.error("Could not persist saved boards");
      return ok;
    }

    async function refreshBoardSelect(preferredName = null) {
      if (!boardSelect) return;
      const previous = preferredName == null ? boardSelect.value : preferredName;
      const index = await loadBoardsIndex();
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
      boardSelect.value = names.includes(previous) ? previous : "";
    }

    function createThumbnailDataURL() {
      try {
        const thumb = document.createElement("canvas");
        thumb.width = 480;
        thumb.height = 270;
        const tctx = thumb.getContext("2d");
        tctx.fillStyle = "#ffffff";
        tctx.fillRect(0, 0, thumb.width, thumb.height);
        if (inkCanvas && inkCanvas.width && inkCanvas.height) {
          tctx.drawImage(inkCanvas, 0, 0, inkCanvas.width, inkCanvas.height, 0, 0, thumb.width, thumb.height);
        }
        return thumb.toDataURL("image/jpeg", 0.72);
      } catch {
        return "";
      }
    }

    function snapshotBoard(existing = null) {
      const now = new Date().toISOString();
      return {
        v: 11,
        createdAt: existing?.createdAt || existing?.savedAt || now,
        updatedAt: now,
        savedAt: now,
        thumbnail: createThumbnailDataURL(),
        ...snapshot()
      };
    }

    async function applyBoard(data) {
      hardResetGesture();
      cancelPolyDraft();
      state.undo = [];
      state.redo = [];
      return applySnapshot(data, { startRevealAtZero: true });
    }

    function freshBoardSnapshot() {
      return {
        v: 11,
        savedAt: new Date().toISOString(),
        tool: "pen",
        color: state.color || "#111111",
        size: state.size || 5,
        zoom: 0.25,
        panX: state.viewW / 2,
        panY: state.viewH / 2,
        title: "",
        pxPerMm: state.pxPerMm,
        bg: { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 },
        objects: [],
        svgReveal: { active: false, groupId: null, partIds: [], revealed: 0 }
      };
    }

    function setBackgroundFromDataURL(dataURL) {
      const img = new Image();
      img.onload = () => {
        state.undo.push(JSON.stringify(snapshot()));
        state.redo.length = 0;
        hardResetGesture();

        state.bg.src = String(dataURL || "");
        state.bg.natW = img.naturalWidth;
        state.bg.natH = img.naturalHeight;
        bgImg.src = state.bg.src;

        const viewCenter = screenToWorld(state.viewW / 2, state.viewH / 2);
        const viewW = state.viewW / state.zoom;
        const viewH = state.viewH / state.zoom;

        const fit = Math.min(viewW / img.naturalWidth, viewH / img.naturalHeight);
        state.bg.scale = Math.max(0.05, Math.min(10, fit));
        state.bg.x = viewCenter.x - img.naturalWidth / 2;
        state.bg.y = viewCenter.y - img.naturalHeight / 2;
        state.bg.rot = 0;

        redrawAll();
        showToast("Background loaded");
      };
      img.onerror = () => showToast("Paste failed");
      img.src = String(dataURL || "");
    }

    function clearBackground() {
      if (!state.bg?.src) {
        showToast("No background");
        return false;
      }
      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
      hardResetGesture();
      state.bg = { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 };
      bgImg.removeAttribute("src");
      redrawAll();
      showToast("Background cleared");
      return true;
    }

    function buildExportSvgDocument() {
      const bounds = exportWorldBounds();
      if (!bounds) return null;

      const W = bounds.w;
      const H = bounds.h;
      const offsetX = -bounds.minX;
      const offsetY = -bounds.minY;

      let bgMarkup = "";
      if (state.bg.src) {
        const natW = state.bg.natW || 0;
        const natH = state.bg.natH || 0;
        const cx = natW / 2;
        const cy = natH / 2;

        const t = [
          `translate(${(state.bg.x + offsetX).toFixed(3)} ${(state.bg.y + offsetY).toFixed(3)})`,
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

      function applyEraseMask(maskMarkup) {
        maskCount += 1;
        const id = `m${maskCount}`;
        defs += `
      <mask id="${id}" maskUnits="userSpaceOnUse">
        <rect x="-100000" y="-100000" width="200000" height="200000" fill="white"/>
        ${maskMarkup}
      </mask>`;

        const combined = pastLayer + currentLayer;
        pastLayer = `<g mask="url(#${id})">${combined}</g>`;
        currentLayer = "";
      }

      function wrapWithEraseMask(erasePathD, eraseSize) {
        const strokeW = Math.max(1, eraseSize || 20);
        applyEraseMask(`<path d="${erasePathD}" fill="none" stroke="black" stroke-linecap="round" stroke-linejoin="round" stroke-width="${strokeW}"/>`);
      }

      function wrapWithEraseDot(point, eraseSize) {
        const radius = Math.max(0.5, Number(eraseSize || 20) / 2);
        applyEraseMask(`<circle cx="${point.x}" cy="${point.y}" r="${radius}" fill="black"/>`);
      }

const exportObjects = [
  ...state.objects.filter(obj => obj && obj.kind !== "polyFill"),
  ...state.objects.filter(obj => obj && obj.kind === "polyFill")
];



      for (const obj of exportObjects) {
        if (!obj || obj.hidden) continue;
        const op = obj.opacity ?? 1;

        if (obj.kind === "erase") {
          const shifted = (obj.points || []).map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
          if (shifted.length === 1) wrapWithEraseDot(shifted[0], obj.size);
          else {
            const d = pathFromPoints(shifted);
            if (d) wrapWithEraseMask(d, obj.size);
          }
          continue;
        }

        if (obj.kind === "stroke") {
          const shifted = (obj.points || []).map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
          if (shifted.length === 1) {
            const radius = Math.max(0.5, Number(obj.size || 1) / 2);
            currentLayer += `<circle cx="${shifted[0].x}" cy="${shifted[0].y}" r="${radius}" fill="${obj.color}" fill-opacity="${op}"/>`;
            continue;
          }
          const d = pathFromPoints(shifted);
          if (!d) continue;
          currentLayer += `<path d="${d}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${obj.size}"/>`;
          continue;
        }

        if (obj.kind === "curve") {
          const shifted = (obj.points || obj.pts || []).map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
          const d = smoothCurvePathFromPoints(shifted);
          if (!d) continue;
          const dashAttr = svgDashArray(obj.lineStyle || "solid", obj.size || 2);
          currentLayer += `<path d="${d}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${obj.size}"${dashAttr ? ` stroke-dasharray="${dashAttr}"` : ""}/>`;
          continue;
        }

        if (obj.kind === "text") {
          const m = textMetrics(obj);
          const cx = obj.x + offsetX + m.w / 2;
          const cy = obj.y + offsetY + m.h / 2;
          const ang = ((obj.rot || 0) * 180) / Math.PI;
          const t = `translate(${cx.toFixed(3)} ${cy.toFixed(3)}) rotate(${ang.toFixed(6)}) translate(${(-m.w / 2).toFixed(3)} ${(-m.h / 2).toFixed(3)})`;
          currentLayer += `<text x="0" y="0" transform="${t}" fill="${obj.color}" font-family="system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif" font-weight="700" font-size="${m.fontSize}">${svgEscape(obj.text || "")}</text>`;
          continue;
        }

        if (obj.kind === "polyFill") {
          const pts = (obj.pts || [])
            .map(p => `${(p.x + offsetX).toFixed(2)},${(p.y + offsetY).toFixed(2)}`)
            .join(" ");
          currentLayer += `<polygon points="${pts}" fill="${obj.fill || obj.color}" fill-opacity="${op}" stroke="none" />`;
          continue;
        }


        if (obj.kind === "perspectiveGuide") {
          const target = findObjById ? findObjById(obj.targetId) : null;
          const vps = [];
          if (obj.vp1) vps.push(obj.vp1);
          if ((obj.mode || 1) >= 2 && obj.vp2) vps.push(obj.vp2);
          const perspectiveColor = "#d32f2f";
          const perspectiveWidth = Math.max(3.5, Number(obj.size || 0));
          const dashAttr = svgDashArray(obj.lineStyle || "reference", perspectiveWidth);
          for (const vp of vps) {
            const srcPts = perspectiveTargetPoints ? perspectiveTargetPoints(target, vp, obj) : [];
            for (const p of srcPts) {
              currentLayer += `<line x1="${p.x + offsetX}" y1="${p.y + offsetY}" x2="${vp.x + offsetX}" y2="${vp.y + offsetY}" stroke="${perspectiveColor}" stroke-opacity="${op}" stroke-width="${perspectiveWidth}" stroke-linecap="round"${dashAttr ? ` stroke-dasharray="${dashAttr}"` : ""} />`;
            }
            currentLayer += `<circle cx="${vp.x + offsetX}" cy="${vp.y + offsetY}" r="7" fill="${perspectiveColor}" fill-opacity="${op}" stroke="white" stroke-width="2" />`;
          }
          continue;
        }

        if (obj.kind === "fillBitmap" && obj.src) {
          const ppw = obj.ppw || 1;
          const wWorld = (obj.w || 1) / ppw;
          const hWorld = (obj.h || 1) / ppw;
          currentLayer += `<image
    href="${obj.src}" xlink:href="${obj.src}"
    x="${obj.x + offsetX}" y="${obj.y + offsetY}" width="${wWorld}" height="${hWorld}"
    opacity="${op}"
    data-kind="fillBitmap"
    data-ppw="${ppw}"
    data-wpx="${obj.w || 0}"
    data-hpx="${obj.h || 0}"
  />`;
          continue;
        }

        const x1 = (obj.x1 ?? 0) + offsetX;
        const y1 = (obj.y1 ?? 0) + offsetY;
        const x2 = (obj.x2 ?? 0) + offsetX;
        const y2 = (obj.y2 ?? 0) + offsetY;
        const w = x2 - x1;
        const h = y2 - y1;

        if (obj.kind === "line") {
          const dashAttr = svgDashArray(obj.lineStyle, obj.size);
          currentLayer += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" stroke-linecap="round"${dashAttr ? ` stroke-dasharray="${dashAttr}"` : ""} />`;
          continue;
        }

        if (obj.kind === "arrow") {
          const ang = Math.atan2(y2 - y1, x2 - x1);
          const dashAttr = svgDashArray(obj.lineStyle, obj.size);
          const headLen = Math.max(10, obj.size * 3);
          const a1 = ang + Math.PI * 0.85;
          const a2 = ang - Math.PI * 0.85;
          const hx1 = x2 + Math.cos(a1) * headLen;
          const hy1 = y2 + Math.sin(a1) * headLen;
          const hx2 = x2 + Math.cos(a2) * headLen;
          const hy2 = y2 + Math.sin(a2) * headLen;
          currentLayer += `<path d="M ${x1} ${y1} L ${x2} ${y2} M ${x2} ${y2} L ${hx1} ${hy1} M ${x2} ${y2} L ${hx2} ${hy2}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" stroke-linecap="round" stroke-linejoin="round"${dashAttr ? ` stroke-dasharray="${dashAttr}"` : ""} />`;
          continue;
        }

        if (obj.kind === "rect") {
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          const rw = Math.abs(w);
          const rh = Math.abs(h);
          const ang = ((obj.rot || 0) * 180) / Math.PI;
          const t = `translate(${cx} ${cy}) rotate(${ang})`;
          const fillAttr = obj.filled ? obj.fillColor || obj.color || "none" : "none";
          const fillOp = obj.filled ? ` fill-opacity="${op}"` : "";
          const strokeVisible = obj.strokeVisible !== false && (obj.size || 0) > 0;
          const dashAttr = strokeVisible ? svgDashArray(obj.lineStyle, obj.size) : "";
          const strokeAttr = strokeVisible ? obj.color : "none";
          const strokeOp = strokeVisible ? ` stroke-opacity="${op}"` : "";
          const strokeWidthAttr = strokeVisible ? ` stroke-width="${obj.size}"` : "";
          currentLayer += `<rect x="${-rw / 2}" y="${-rh / 2}" width="${rw}" height="${rh}" transform="${t}" fill="${fillAttr}"${fillOp} stroke="${strokeAttr}"${strokeOp}${strokeWidthAttr}${dashAttr ? ` stroke-dasharray="${dashAttr}"` : ""} />`;
          continue;
        }

        if (obj.kind === "circle") {
          const cx = (x1 + x2) / 2;
          const cy = (y1 + y2) / 2;
          const rx = Math.abs(w) / 2;
          const ry = Math.abs(h) / 2;
          const ang = ((obj.rot || 0) * 180) / Math.PI;
          const t = `translate(${cx} ${cy}) rotate(${ang})`;
          const fillAttr = obj.filled ? obj.fillColor || obj.color || "none" : "none";
          const fillOp = obj.filled ? ` fill-opacity="${op}"` : "";
          const strokeVisible = obj.strokeVisible !== false && (obj.size || 0) > 0;
          const dashAttr = strokeVisible ? svgDashArray(obj.lineStyle, obj.size) : "";
          const strokeAttr = strokeVisible ? obj.color : "none";
          const strokeOp = strokeVisible ? ` stroke-opacity="${op}"` : "";
          const strokeWidthAttr = strokeVisible ? ` stroke-width="${obj.size}"` : "";
          currentLayer += `<ellipse cx="0" cy="0" rx="${rx}" ry="${ry}" transform="${t}" fill="${fillAttr}"${fillOp} stroke="${strokeAttr}"${strokeOp}${strokeWidthAttr}${dashAttr ? ` stroke-dasharray="${dashAttr}"` : ""} />`;
          continue;
        }

        if (obj.kind === "arc") {
          const cx = obj.cx + offsetX;
          const cy = obj.cy + offsetY;
          const a1 = obj.a1 || 0;
          const a2 = obj.a2 || 0;
          const ccw = !!obj.ccw;
          const TWO_PI = Math.PI * 2;
          const rawSpanAbs = Math.abs(a2 - a1);

          if (rawSpanAbs >= TWO_PI - 1e-6) {
            const dashAttr = svgDashArray(obj.lineStyle, obj.size);
            currentLayer += `<circle cx="${cx}" cy="${cy}" r="${obj.r}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}"${dashAttr ? ` stroke-dasharray="${dashAttr}"` : ""} />`;
            continue;
          }

          const span = ccw
            ? ((((a1 - a2) % TWO_PI) + TWO_PI) % TWO_PI)
            : ((((a2 - a1) % TWO_PI) + TWO_PI) % TWO_PI);
          const largeArc = span > Math.PI ? 1 : 0;
          const sweep = ccw ? 0 : 1;

          const sxp = cx + Math.cos(a1) * obj.r;
          const syp = cy + Math.sin(a1) * obj.r;
          const exp = cx + Math.cos(a2) * obj.r;
          const eyp = cy + Math.sin(a2) * obj.r;

          const dashAttr = svgDashArray(obj.lineStyle, obj.size);
          currentLayer += `<path d="M ${sxp} ${syp} A ${obj.r} ${obj.r} 0 ${largeArc} ${sweep} ${exp} ${eyp}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-width="${obj.size}" stroke-linecap="round"${dashAttr ? ` stroke-dasharray="${dashAttr}"` : ""} />`;
          continue;
        }
      }

      const inkMarkup = pastLayer + currentLayer;
      const editableSnapshot = svgEscape(JSON.stringify(snapshotBoard()));

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <metadata id="phs-whiteboard-snapshot" data-app="PHS_WHITEBOARD" data-version="9">${editableSnapshot}</metadata>
  <defs>${defs}</defs>
  <rect x="0" y="0" width="${W}" height="${H}" fill="white"/>
  ${bgMarkup}
  ${inkMarkup}
</svg>`;

      return { svg, W, H, bounds };
    }

    function exportSVG() {
      const doc = buildExportSvgDocument();
      if (!doc) {
        showToast("Nothing to export");
        return;
      }

      const blob = new Blob([doc.svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.svg`;
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    const EXPORT_MAX_RASTER_DIM = 8192;
    const EXPORT_MAX_RASTER_PIXELS = 32000000;

    function safeExportScale(doc, requestedScale) {
      const w = Math.max(1, Number(doc?.W) || 1);
      const h = Math.max(1, Number(doc?.H) || 1);
      let scale = Math.max(0.05, Number(requestedScale) || 1);

      scale = Math.min(scale, EXPORT_MAX_RASTER_DIM / w, EXPORT_MAX_RASTER_DIM / h);
      scale = Math.min(scale, Math.sqrt(EXPORT_MAX_RASTER_PIXELS / Math.max(1, w * h)));

      return Math.max(0.05, scale);
    }

    function canvasToPngBlob(canvas) {
      return new Promise(resolve => {
        if (!canvas || typeof canvas.toBlob !== "function") {
          resolve(null);
          return;
        }
        canvas.toBlob(blob => resolve(blob), "image/png");
      });
    }

    async function rasterizeExportSvg(doc) {
      const scale = safeExportScale(doc, dpr());
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.ceil(doc.W * scale));
      out.height = Math.max(1, Math.ceil(doc.H * scale));

      const octx = out.getContext("2d");
      if (!octx) return null;

      octx.setTransform(scale, 0, 0, scale, 0, 0);
      octx.fillStyle = "#ffffff";
      octx.fillRect(0, 0, doc.W, doc.H);

      const blob = new Blob([doc.svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      try {
        const img = new Image();
        const ok = await new Promise(resolve => {
          img.onload = () => resolve(true);
          img.onerror = () => resolve(false);
          img.src = url;
        });

        if (!ok) return null;

        octx.drawImage(img, 0, 0, doc.W, doc.H);
        return { canvas: out, scale };
      } finally {
        URL.revokeObjectURL(url);
      }
    }

    async function exportPNG() {
      const doc = buildExportSvgDocument();
      if (!doc) {
        showToast("Nothing to export");
        return;
      }

      const raster = await rasterizeExportSvg(doc);
      if (!raster || !raster.canvas) {
        showToast("PNG export failed");
        return;
      }

      const blob = await canvasToPngBlob(raster.canvas);
      if (!blob) {
        showToast("PNG export failed");
        return;
      }

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = url;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1500);

      if (raster.scale < dpr() * 0.95) {
        showToast("PNG exported safely at reduced size");
      }
    }

    async function printCurrentBoard(options = {}) {
      const doc = buildExportSvgDocument();
      if (!doc) {
        showToast("Nothing to print");
        return;
      }

      const trueScale = !!(options && options.trueScale);
      const win = window.open("", "_blank");
      if (!win) {
        showToast("Popup blocked — allow popups for printing");
        return;
      }

      win.document.write(`
        <html><head><title>Preparing print…</title></head>
        <body style="font:16px system-ui;padding:24px">Preparing whiteboard print…</body></html>
      `);
      win.document.close();

      try {
        const raster = await rasterizeExportSvg(doc);
        if (!raster || !raster.canvas) throw new Error("Rasterisation failed");

        const blob = await canvasToPngBlob(raster.canvas);
        if (!blob) throw new Error("PNG conversion failed");

        const ppm = Math.max(0.001, Number(pxPerMm()) || 3.7795275591);
        const imgWidthMm = Math.max(1, doc.W / ppm);
        const imgHeightMm = Math.max(1, doc.H / ppm);
        const fitCss = `
          body{ display:flex; align-items:center; justify-content:center; }
          img{ display:block; max-width:100vw; max-height:100vh; object-fit:contain; }
          @page{ margin:8mm; }
          @media print{
            html,body{ width:100%; height:100%; }
            img{ max-width:100%; max-height:100%; page-break-inside:avoid; }
          }
        `;
        const scaleCss = `
          body{ display:block; }
          .printNote{
            font:12px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;
            color:#222; margin:6mm 6mm 3mm; padding:3mm 4mm;
            border:1px solid #ddd; border-radius:3mm; background:#fffbe6; max-width:180mm;
          }
          img{
            display:block; width:${imgWidthMm.toFixed(3)}mm; height:${imgHeightMm.toFixed(3)}mm;
            max-width:none; max-height:none; object-fit:fill; image-rendering:auto;
          }
          @page{ margin:0; }
          @media print{
            .printNote{ display:none; }
            html,body{ width:auto; height:auto; }
            img{
              width:${imgWidthMm.toFixed(3)}mm; height:${imgHeightMm.toFixed(3)}mm;
              max-width:none; max-height:none; page-break-inside:avoid;
            }
          }
        `;

        const printUrl = URL.createObjectURL(blob);
        win.document.open();
        win.document.write(`
          <html>
          <head>
            <title>${trueScale ? "Print 1:1 scale" : "Print"}</title>
            <style>
              html,body{ margin:0; padding:0; background:white; min-height:100%; }
              ${trueScale ? scaleCss : fitCss}
            </style>
          </head>
          <body>
            ${trueScale ? `<div class="printNote"><strong>1:1 scale print:</strong> this image is ${imgWidthMm.toFixed(1)} mm × ${imgHeightMm.toFixed(1)} mm based on the board scale (${ppm.toFixed(3)} px/mm). In the browser print dialog choose <strong>Actual size / 100%</strong> and turn off <strong>Fit to page</strong>.</div>` : ""}
            <img id="printImg" src="${printUrl}" alt="Whiteboard print">
            <script>
              const img = document.getElementById("printImg");
              img.onload = () => setTimeout(() => window.print(), 250);
            <\/script>
          </body>
          </html>
        `);
        win.document.close();

        setTimeout(() => URL.revokeObjectURL(printUrl), 60000);
        if (trueScale) showToast("Print 1:1: use Actual size / 100% in the print dialog");
      } catch (err) {
        try { win.close(); } catch {}
        console.error("Print failed", err);
        showToast("Print failed");
      }
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
      return {
        x: (p.x - cam.panX) / cam.zoom,
        y: (p.y - cam.panY) / cam.zoom
      };
    }

    async function importSvgInkFromText(svgText) {
      stopSvgPlayback(true);

      const doc = new DOMParser().parseFromString(String(svgText || ""), "image/svg+xml");
      const parsedSvg = doc.querySelector("svg");
      if (!parsedSvg) {
        showToast("SVG not valid");
        return false;
      }

      const editableMeta = parsedSvg.querySelector('metadata#phs-whiteboard-snapshot[data-app="PHS_WHITEBOARD"]');
      if (editableMeta && editableMeta.textContent) {
        try {
          const editableData = JSON.parse(editableMeta.textContent);
          const result = await applyBoard(editableData);
          const repaired = Number(result?.repairedRevealIds || 0);
          showToast(repaired
            ? `Editable whiteboard loaded — prepared ${repaired} reveal step${repaired === 1 ? "" : "s"}`
            : "Editable whiteboard loaded — perspective links preserved");
          return true;
        } catch (err) {
          console.warn("Editable whiteboard metadata could not be loaded", err);
        }
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

      let pendingBg = null;
      const imgEls = Array.from(svg.querySelectorAll("image"));
      const bgImgEl = imgEls.find(im => (im.getAttribute("data-kind") || "") !== "fillBitmap");

      if (bgImgEl) {
        const href = bgImgEl.getAttribute("href") || bgImgEl.getAttribute("xlink:href") || "";
        const wAttr = parseNumberAttr(bgImgEl.getAttribute("width"));
        const hAttr = parseNumberAttr(bgImgEl.getAttribute("height"));

        if (href) {
          const tf = (bgImgEl.getAttribute("transform") || "").trim();
          let x = 0, y = 0, rot = 0, scale = 1;

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
        return false;
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
        const attr = parseNumberAttr(el.getAttribute("stroke-width"));
        const css = parseNumberAttr(getComputedStyle(el).strokeWidth);
        return Math.max(1, css ?? attr ?? 3);
      }

      function lineStyleOf(el, size) {
        const raw = el.getAttribute("stroke-dasharray") || getComputedStyle(el).strokeDasharray || "";
        return detectLineStyleFromDashArray(raw, size);
      }

      for (const el of els) {
        if (el.closest("defs") || el.closest("mask")) continue;

        const tag = el.tagName.toLowerCase();
        const stroke = el.getAttribute("stroke");
        const fill = el.getAttribute("fill");

        if (tag === "rect" && isNone(stroke) && (String(fill || "").toLowerCase() === "white" || !fill)) continue;

        const color = !isNone(stroke) ? stroke : "#111111";
        const size = strokeWidthOf(el);
        const opacity = opacityOf(el);
        const lineStyle = lineStyleOf(el, size);

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
          parts.push({ kind: "line", color, opacity, size, lineStyle, x1: p1.x, y1: p1.y, x2: p2.x, y2: p2.y, rot: 0 });
          continue;
        }

        if (tag === "rect") {
          const hasStroke = !isNone(stroke);
          const hasFill = !isNone(fill);
          if (!hasStroke && !hasFill) continue;
          const x = parseNumberAttr(el.getAttribute("x")) ?? 0;
          const y = parseNumberAttr(el.getAttribute("y")) ?? 0;
          const w = parseNumberAttr(el.getAttribute("width")) ?? 0;
          const h = parseNumberAttr(el.getAttribute("height")) ?? 0;
          const p1 = mapCTM(el, x, y);
          const p2 = mapCTM(el, x + w, y + h);
          parts.push({
            kind: "rect",
            color: hasStroke ? stroke : (fill || color),
            opacity,
            size: hasStroke ? size : 1,
            lineStyle: hasStroke ? lineStyle : "solid",
            filled: hasFill,
            fillColor: hasFill ? fill : undefined,
            strokeVisible: hasStroke,
            x1: p1.x,
            y1: p1.y,
            x2: p2.x,
            y2: p2.y,
            rot: 0
          });
          continue;
        }

        if (tag === "circle") {
          const hasStroke = !isNone(stroke);
          const hasFill = !isNone(fill);
          if (!hasStroke && !hasFill) continue;
          const cx = parseNumberAttr(el.getAttribute("cx")) ?? 0;
          const cy = parseNumberAttr(el.getAttribute("cy")) ?? 0;
          const r = parseNumberAttr(el.getAttribute("r")) ?? 0;

          const c = mapCTM(el, cx, cy);
          const px = mapCTM(el, cx + r, cy);
          const py = mapCTM(el, cx, cy + r);
          const rx = Math.hypot(px.x - c.x, px.y - c.y);
          const ry = Math.hypot(py.x - c.x, py.y - c.y);

          parts.push({
            kind: "circle",
            color: hasStroke ? stroke : (fill || color),
            opacity,
            size: hasStroke ? size : 1,
            lineStyle: hasStroke ? lineStyle : "solid",
            filled: hasFill,
            fillColor: hasFill ? fill : undefined,
            strokeVisible: hasStroke,
            x1: c.x - rx,
            y1: c.y - ry,
            x2: c.x + rx,
            y2: c.y + ry,
            rot: 0
          });
          continue;
        }

        if (tag === "ellipse") {
          const hasStroke = !isNone(stroke);
          const hasFill = !isNone(fill);
          if (!hasStroke && !hasFill) continue;
          const cx = parseNumberAttr(el.getAttribute("cx")) ?? 0;
          const cy = parseNumberAttr(el.getAttribute("cy")) ?? 0;
          const rx0 = parseNumberAttr(el.getAttribute("rx")) ?? 0;
          const ry0 = parseNumberAttr(el.getAttribute("ry")) ?? 0;

          const c = mapCTM(el, cx, cy);
          const px = mapCTM(el, cx + rx0, cy);
          const py = mapCTM(el, cx, cy + ry0);
          const rx = Math.hypot(px.x - c.x, px.y - c.y);
          const ry = Math.hypot(py.x - c.x, py.y - c.y);

          parts.push({
            kind: "circle",
            color: hasStroke ? stroke : (fill || color),
            opacity,
            size: hasStroke ? size : 1,
            lineStyle: hasStroke ? lineStyle : "solid",
            filled: hasFill,
            fillColor: hasFill ? fill : undefined,
            strokeVisible: hasStroke,
            x1: c.x - rx,
            y1: c.y - ry,
            x2: c.x + rx,
            y2: c.y + ry,
            rot: 0
          });
          continue;
        }

        if (tag === "polyline" || tag === "polygon") {
          const ptsAttr = (el.getAttribute("points") || "").trim();
          if (!ptsAttr) continue;

          const nums = ptsAttr.split(/[\s,]+/).map(Number).filter(n => isFinite(n));
          if (nums.length < 6) continue;

          const pts = [];
          for (let i = 0; i < nums.length - 1; i += 2) {
            pts.push(mapCTM(el, nums[i], nums[i + 1]));
          }

          const fillAttr = el.getAttribute("fill");
          const hasFill = !isNone(fillAttr);
          const hasStroke = !isNone(stroke);

          if (tag === "polygon" && hasFill && !hasStroke) {
            parts.push({
              kind: "polyFill",
              pts,
              fill: fillAttr || "#111111",
              opacity
            });
            continue;
          }

          if (tag === "polygon" && pts.length) pts.push({ ...pts[0] });
          if (isNone(stroke)) continue;

          parts.push({ kind: "stroke", color, opacity, size, lineStyle, points: pts });
          continue;
        }

        if (tag === "path") {
          if (isNone(stroke)) continue;

          const dAttr = el.getAttribute("d") || "";
          const exactPts = parseSimpleMLPath(dAttr);

          if (exactPts) {
            parts.push({
              kind: "stroke",
              color,
              opacity,
              size,
              lineStyle,
              points: exactPts.map(p => mapCTM(el, p.x, p.y))
            });
            continue;
          }

          if (!el.getTotalLength) continue;
          let total = 0;
          try {
            total = el.getTotalLength();
          } catch {
            total = 0;
          }
          if (!isFinite(total) || total <= 0) continue;

          const steps = Math.max(60, Math.min(2000, Math.ceil(total / 1.5)));
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

          parts.push({ kind: "stroke", color, opacity, size, lineStyle, points: pts });
          continue;
        }

        if (tag === "text") continue;
      }

      if (!parts.length && !pendingBg) {
        showToast("No supported SVG shapes");
        return false;
      }

      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
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
        ensureRevealId(obj);
        obj.svgGroupId = groupId;
        obj.hidden = true;
        state.objects.push(obj);
      }

      svgReveal.active = true;
      svgReveal.groupId = groupId;
      svgReveal.partIds = [];
      svgReveal.revealed = 0;
      for (let i = startIndex; i < state.objects.length; i++) {
        svgReveal.partIds.push(ensureRevealId(state.objects[i]));
      }

      state.selectionIndex = -1;
      setActiveTool("select");

      if (isRoundTrip && cam) {
        state.zoom = cam.zoom;
        state.panX = cam.panX;
        state.panY = cam.panY;
      }

      redrawAll();
      showToast(`SVG imported: 0/${svgReveal.partIds.length} (→ reveal)`);
      return true;
    }

    function clearImportedSvgInk() {
      if (!svgReveal.active || !svgReveal.groupId) {
        showToast("No SVG ink");
        return;
      }

      const gid = svgReveal.groupId;
      state.undo.push(JSON.stringify(snapshot()));
      state.redo.length = 0;
      state.objects = state.objects.filter(o => !(o && o.svgGroupId === gid));

      resetSvgRevealState();
      state.selectionIndex = -1;
      redrawAll();
      showToast("SVG cleared");
    }

    function bindBackgroundInput(bgFile, clearBgBtn) {
      bgFile?.addEventListener("change", () => {
        const file = bgFile.files && bgFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => setBackgroundFromDataURL(String(reader.result || ""));
        reader.readAsDataURL(file);
        bgFile.value = "";
      });

      clearBgBtn?.addEventListener("click", clearBackground);
      undoBtn?.addEventListener("click", performUndo);
redoBtn?.addEventListener("click", performRedo); 

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
    }

    function safeBoardName(value) {
      return String(value || "").trim().replace(/[\/:*?"<>|]+/g, "-").slice(0, 100);
    }

    function downloadBlob(filename, contents, type = "application/json") {
      const blob = new Blob([contents], { type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    }

    function projectPayload(boardData, name = "") {
      return {
        format: PROJECT_FORMAT,
        version: 1,
        exportedAt: new Date().toISOString(),
        name: String(name || ""),
        board: deepClone(boardData)
      };
    }

    function downloadProject(boardData = null, name = "") {
      const board = boardData || snapshotBoard();
      const base = safeBoardName(name || board.title || state.title || "PHS Whiteboard") || "PHS Whiteboard";
      downloadBlob(`${base}.phswb.json`, JSON.stringify(projectPayload(board, name), null, 2));
      showToast("Project file downloaded");
    }

    async function openProjectFile(file) {
      if (!file) return false;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const board = parsed?.format === PROJECT_FORMAT ? parsed.board : (parsed?.board || parsed);
        if (!board || !Array.isArray(board.objects)) throw new Error("This is not a PHS Whiteboard project file");
        await applyBoard(board);
        if (boardSelect) boardSelect.value = "";
        showToast("Project opened");
        return true;
      } catch (err) {
        console.error("Project open failed", err);
        showToast(err?.message || "Project file could not be opened");
        return false;
      }
    }

    async function saveNamedBoard(rawName, opts = {}) {
      const name = safeBoardName(rawName);
      if (!name) return false;
      const index = await loadBoardsIndex();
      const existing = index[name] || null;
      if (existing && !opts.skipOverwriteConfirm) {
        if (!confirm(`Replace the saved board “${name}”?`)) return false;
      }
      index[name] = snapshotBoard(existing);
      if (!(await saveBoardsIndex(index))) return false;
      await refreshBoardSelect(name);
      await renderBoardManager();
      showToast(`${existing ? "Board updated" : "Board saved"} • ${storageBackend}`);
      return true;
    }

    async function autosaveRecord() {
      return await readStorageRecord(AUTOSAVE_RECORD_KEY, AUTOSAVE_KEY, null);
    }

    async function updateAutosaveUI(message = "") {
      const restoreBtn = document.getElementById("restoreAutosaveBtn");
      const clearBtn = document.getElementById("clearAutosaveBtn");
      const status = document.getElementById("autosaveStatus");
      const record = await autosaveRecord();
      if (restoreBtn) restoreBtn.disabled = !record?.board;
      if (clearBtn) clearBtn.disabled = !record?.board;
      if (!status) return;
      if (message) status.textContent = message;
      else if (record?.savedAt) {
        const when = new Date(record.savedAt);
        status.textContent = `Autosaved ${when.toLocaleString()} • stored with ${storageBackend}.`;
      } else status.textContent = `Autosave is on • storage: ${storageBackend}.`;
    }

    async function saveAutosaveNow(force = false) {
      try {
        const board = snapshot();
        const fingerprint = JSON.stringify(board);
        if (!force && fingerprint === autosaveLastFingerprint) return false;
        const record = { v: 2, savedAt: new Date().toISOString(), board };
        const ok = await writeStorageRecord(AUTOSAVE_RECORD_KEY, AUTOSAVE_KEY, record);
        if (!ok) {
          await updateAutosaveUI("Autosave could not use persistent browser storage. Download an editable project for safety.");
          return false;
        }
        autosaveLastFingerprint = fingerprint;
        await updateAutosaveUI();
        return true;
      } catch (err) {
        console.error("Autosave failed", err);
        await updateAutosaveUI("Autosave failed. Download an editable project for safety.");
        return false;
      }
    }

    function startAutosave() {
      if (autosaveTimer) clearInterval(autosaveTimer);
      try { autosaveLastFingerprint = JSON.stringify(snapshot()); } catch { autosaveLastFingerprint = ""; }
      autosaveTimer = setInterval(() => { void saveAutosaveNow(false); }, 1800);
      void updateAutosaveUI();
      document.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") void saveAutosaveNow(false);
      });
    }

    function bindAutosave() {
      const restoreBtn = document.getElementById("restoreAutosaveBtn");
      const clearBtn = document.getElementById("clearAutosaveBtn");
      restoreBtn?.addEventListener("click", async () => {
        const record = await autosaveRecord();
        if (!record?.board) return;
        if (!confirm("Restore the most recent autosaved session? The current unsaved canvas will be replaced.")) return;
        hardResetGesture();
        cancelPolyDraft();
        state.undo = [];
        state.redo = [];
        applySnapshot(record.board, { startRevealAtZero: false });
        autosaveLastFingerprint = JSON.stringify(snapshot());
        showToast("Autosaved session restored");
      });
      clearBtn?.addEventListener("click", async () => {
        const record = await autosaveRecord();
        if (!record?.board) return;
        if (!confirm("Clear the stored autosave?")) return;
        await deleteStorageRecord(AUTOSAVE_RECORD_KEY, AUTOSAVE_KEY);
        await updateAutosaveUI("Autosave copy cleared. New changes will create a fresh copy.");
        showToast("Autosave cleared");
      });
      void updateAutosaveUI();
    }

    function formatBoardDate(value) {
      const d = new Date(value || 0);
      return Number.isNaN(d.getTime()) ? "Date unavailable" : d.toLocaleString();
    }

    function makeManagerButton(label, action, name, danger = false) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      btn.dataset.action = action;
      btn.dataset.name = name;
      if (danger) btn.classList.add("is-danger");
      return btn;
    }

    async function renderBoardManager() {
      const list = document.getElementById("boardManagerList");
      if (!list) return;
      const loading = document.createElement("div");
      loading.className = "boardManager__empty";
      loading.textContent = "Loading saved boards…";
      list.replaceChildren(loading);

      const index = await loadBoardsIndex();
      const entries = Object.entries(index).sort((a, b) => {
        const ad = Date.parse(a[1]?.updatedAt || a[1]?.savedAt || 0) || 0;
        const bd = Date.parse(b[1]?.updatedAt || b[1]?.savedAt || 0) || 0;
        return bd - ad || a[0].localeCompare(b[0]);
      });
      list.replaceChildren();
      if (!entries.length) {
        const empty = document.createElement("div");
        empty.className = "boardManager__empty";
        empty.textContent = "No saved boards yet. Save the current board to create your first thumbnail.";
        list.appendChild(empty);
        return;
      }
      for (const [name, board] of entries) {
        const card = document.createElement("article");
        card.className = "boardCard";
        const thumb = document.createElement("div");
        thumb.className = "boardCard__thumb";
        if (board?.thumbnail && /^data:image\//.test(board.thumbnail)) {
          const img = document.createElement("img");
          img.src = board.thumbnail;
          img.alt = "";
          thumb.appendChild(img);
        } else {
          const ph = document.createElement("div");
          ph.className = "boardCard__placeholder";
          ph.textContent = board?.title || "Legacy board — save again to add a thumbnail";
          thumb.appendChild(ph);
        }
        const body = document.createElement("div");
        body.className = "boardCard__body";
        const title = document.createElement("div");
        title.className = "boardCard__name";
        title.textContent = name;
        const meta = document.createElement("div");
        meta.className = "boardCard__meta";
        meta.textContent = `${Array.isArray(board?.objects) ? board.objects.length : 0} objects • ${formatBoardDate(board?.updatedAt || board?.savedAt)}`;
        const buttons = document.createElement("div");
        buttons.className = "boardCard__buttons";
        buttons.append(
          makeManagerButton("Load", "load", name),
          makeManagerButton("Rename", "rename", name),
          makeManagerButton("Duplicate", "duplicate", name),
          makeManagerButton("Download", "download", name),
          makeManagerButton("Delete", "delete", name, true)
        );
        body.append(title, meta, buttons);
        card.append(thumb, body);
        list.appendChild(card);
      }
    }

    async function openBoardManager() {
      document.getElementById("boardManagerModal")?.classList.remove("is-hidden");
      await renderBoardManager();
      document.getElementById("boardManagerCloseBtn")?.focus();
    }

    function closeBoardManager() {
      document.getElementById("boardManagerModal")?.classList.add("is-hidden");
    }

    function bindBoardManager() {
      const modal = document.getElementById("boardManagerModal");
      const list = document.getElementById("boardManagerList");
      document.getElementById("boardManagerBtn")?.addEventListener("click", () => { void openBoardManager(); });
      document.getElementById("boardManagerCloseBtn")?.addEventListener("click", closeBoardManager);
      document.querySelector("[data-close-board-manager]")?.addEventListener("click", closeBoardManager);
      document.getElementById("boardManagerSaveCurrentBtn")?.addEventListener("click", async () => {
        const name = prompt("Save current board as:", boardSelect?.value || state.title || "");
        if (name) await saveNamedBoard(name);
      });
      list?.addEventListener("click", async e => {
        const btn = e.target.closest("button[data-action]");
        if (!btn) return;
        const action = btn.dataset.action;
        const name = btn.dataset.name;
        const index = await loadBoardsIndex();
        const board = index[name];
        if (!board) {
          await renderBoardManager();
          showToast("Saved board not found");
          return;
        }
        if (action === "load") {
          await applyBoard(board);
          if (boardSelect) boardSelect.value = name;
          closeBoardManager();
          showToast("Board loaded");
        } else if (action === "rename") {
          const next = safeBoardName(prompt("Rename board:", name));
          if (!next || next === name) return;
          if (index[next] && !confirm(`Replace the saved board “${next}”?`)) return;
          index[next] = { ...board, updatedAt: new Date().toISOString(), savedAt: new Date().toISOString() };
          delete index[name];
          if (await saveBoardsIndex(index)) {
            await refreshBoardSelect(next);
            await renderBoardManager();
            showToast("Board renamed");
          }
        } else if (action === "duplicate") {
          const next = safeBoardName(prompt("Name the duplicate:", `${name} copy`));
          if (!next) return;
          if (index[next] && !confirm(`Replace the saved board “${next}”?`)) return;
          const now = new Date().toISOString();
          index[next] = { ...deepClone(board), createdAt: now, updatedAt: now, savedAt: now };
          if (await saveBoardsIndex(index)) {
            await refreshBoardSelect(next);
            await renderBoardManager();
            showToast("Board duplicated");
          }
        } else if (action === "download") {
          downloadProject(board, name);
        } else if (action === "delete") {
          if (!confirm(`Delete saved board “${name}”?`)) return;
          delete index[name];
          if (await saveBoardsIndex(index)) {
            await refreshBoardSelect("");
            await renderBoardManager();
            showToast("Board deleted");
          }
        }
      });
      document.addEventListener("keydown", e => {
        if (e.key === "Escape" && !modal?.classList.contains("is-hidden")) closeBoardManager();
      });
    }

    function bindProjectFiles() {
      const downloadBtn = document.getElementById("downloadProjectBtn");
      const fileInput = document.getElementById("openProjectFile");
      downloadBtn?.addEventListener("click", () => downloadProject(null, boardSelect?.value || state.title || ""));
      fileInput?.addEventListener("change", async () => {
        const file = fileInput.files?.[0];
        if (file) await openProjectFile(file);
        fileInput.value = "";
      });
    }

    function bindBoards(newBoardBtn, saveBoardBtn, loadBoardBtn, deleteBoardBtn, deleteAllBoardsBtn) {
      newBoardBtn?.addEventListener("click", async () => {
        const hasContent = state.objects.length || state.bg?.src || state.title;
        if (hasContent) {
          const choice = confirm("Save the current canvas before starting a new one?");
          if (choice) {
            const name = prompt("Save board as name:", boardSelect?.value || state.title || "");
            if (name && !(await saveNamedBoard(name))) return;
          }
        }
        await applyBoard(freshBoardSnapshot());
        if (boardSelect) boardSelect.value = "";
        showToast("New board");
      });

      saveBoardBtn?.addEventListener("click", async () => {
        const selectedName = boardSelect?.value || "";
        if (selectedName) {
          await saveNamedBoard(selectedName, { skipOverwriteConfirm: true });
          return;
        }
        const name = prompt("Save board as name:", state.title || "");
        if (name) await saveNamedBoard(name);
      });

      loadBoardBtn?.addEventListener("click", async () => {
        const name = boardSelect?.value;
        if (!name) return showToast("Select a board");
        const index = await loadBoardsIndex();
        if (!index[name]) {
          await refreshBoardSelect("");
          return showToast("Saved board not found");
        }
        const result = await applyBoard(index[name]);
        if (boardSelect) boardSelect.value = name;
        const repaired = Number(result?.repairedRevealIds || 0);
        showToast(repaired
          ? `Board loaded — prepared ${repaired} reveal step${repaired === 1 ? "" : "s"}`
          : "Board loaded");
      });

      deleteBoardBtn?.addEventListener("click", async () => {
        const name = boardSelect?.value;
        if (!name) return showToast("Select a board");
        if (!confirm(`Delete saved board “${name}”?`)) return;
        const index = await loadBoardsIndex();
        if (!index[name]) return showToast("Not found");
        delete index[name];
        if (!(await saveBoardsIndex(index))) return;
        await refreshBoardSelect("");
        await renderBoardManager();
        showToast("Board deleted");
      });

      deleteAllBoardsBtn?.addEventListener("click", async () => {
        const index = await loadBoardsIndex();
        const names = Object.keys(index);
        if (!names.length) return showToast("No saved boards");
        if (!confirm(`Delete ALL saved boards (${names.length})?`)) return;
        if (!(await saveBoardsIndex({}))) return;
        await refreshBoardSelect("");
        await renderBoardManager();
        showToast("All boards deleted");
      });
    }

    function bindSvgInput(svgInkFile, clearSvgInkBtn, onImported) {
      svgInkFile?.addEventListener("change", () => {
        const file = svgInkFile.files && svgInkFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          Promise.resolve(importSvgInkFromText(String(reader.result || "")))
            .then(success => {
              if (success && typeof onImported === "function") onImported();
            })
            .catch(err => {
              console.error("SVG import failed", err);
              showToast("SVG import failed");
            });
        };
        reader.readAsText(file);
        svgInkFile.value = "";
      });

      clearSvgInkBtn?.addEventListener("click", clearImportedSvgInk);
    }

    function bindExport(exportBtn, exportSvgBtn, printBtn, printFitBtn) {
      exportBtn?.addEventListener("click", exportPNG);
      exportSvgBtn?.addEventListener("click", exportSVG);
      printBtn?.addEventListener("click", () => printCurrentBoard({ trueScale: true }));
      const fitBtn = printFitBtn || document.getElementById("printFitBtn");
      fitBtn?.addEventListener("click", () => printCurrentBoard({ trueScale: false }));
    }

    return {
      LS_KEY,
      snapshot,
      applySnapshot,
      loadBoardsIndex,
      saveBoardsIndex,
      refreshBoardSelect,
      saveNamedBoard,
      downloadProject,
      openProjectFile,
      bindProjectFiles,
      bindBoardManager,
      bindAutosave,
      startAutosave,
      snapshotBoard,
      applyBoard,
      freshBoardSnapshot,
      setBackgroundFromDataURL,
      clearBackground,
      buildExportSvgDocument,
      exportSVG,
      exportPNG,
      printCurrentBoard,
      importSvgInkFromText,
      clearImportedSvgInk,
      bindBackgroundInput,
      bindBoards,
      bindSvgInput,
      bindExport
    };
  }

  return { createIOApi };
})();
