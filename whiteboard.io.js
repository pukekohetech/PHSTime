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
      objectBounds,
      svgDashArray,
      detectLineStyleFromDashArray,
      worldToScreen,
      screenToWorld,
      pointOnArc,
      rectEdges,
      exportWorldBounds,
      ensureObjId,
      findObjById,
      stopSvgPlayback,
      resetSvgRevealState
    } = ctx;

    const LS_KEY = "PHS_WHITEBOARD_BOARDS_v8";

    function snapshot() {
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
        objects: deepClone(state.objects)
      };
    }

    function applySnapshot(snap) {
      state.tool = snap.tool || "pen";
      setActiveTool(state.tool);

      state.color = snap.color || "#111111";
      state.size = snap.size || 5;
      state.opacity = Number(snap.opacity ?? 1);
      state.lineStyle = snap.lineStyle || "solid";
      state.linePresetMap = {
        reference: { color: "#1b5e20", size: 10 },
        hidden: { color: "#1976d2", size: 5 },
        center: { color: "#d32f2f", size: 5 },
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

      if (state.bg && state.bg.src) bgImg.src = state.bg.src;
      else bgImg.removeAttribute("src");

      redrawAll();
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
      return {
        v: 8,
        savedAt: new Date().toISOString(),
        ...snapshot()
      };
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
        pxPerMm: state.pxPerMm,
        bg: { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 },
        objects: []
      };
    }

    function setBackgroundFromDataURL(dataURL) {
      const img = new Image();
      img.onload = () => {
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
      hardResetGesture();
      state.bg = { src: "", natW: 0, natH: 0, x: 0, y: 0, scale: 1, rot: 0 };
      bgImg.removeAttribute("src");
      redrawAll();
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

const exportObjects = [
  ...state.objects.filter(obj => obj && obj.kind !== "polyFill"),
  ...state.objects.filter(obj => obj && obj.kind === "polyFill")
];



      for (const obj of exportObjects) {
        if (!obj || obj.hidden) continue;
        const op = obj.opacity ?? 1;

        if (obj.kind === "erase") {
          const shifted = (obj.points || []).map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
          const d = pathFromPoints(shifted);
          if (d) wrapWithEraseMask(d, obj.size);
          continue;
        }

        if (obj.kind === "stroke") {
          const shifted = (obj.points || []).map(p => ({ x: p.x + offsetX, y: p.y + offsetY }));
          const d = pathFromPoints(shifted);
          if (!d) continue;
          currentLayer += `<path d="${d}" fill="none" stroke="${obj.color}" stroke-opacity="${op}" stroke-linecap="round" stroke-linejoin="round" stroke-width="${obj.size}"/>`;
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

      const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"
     width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
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

    async function exportPNG() {
      const doc = buildExportSvgDocument();
      if (!doc) {
        showToast("Nothing to export");
        return;
      }

      const scale = dpr();
      const out = document.createElement("canvas");
      out.width = Math.max(1, Math.ceil(doc.W * scale));
      out.height = Math.max(1, Math.ceil(doc.H * scale));

      const octx = out.getContext("2d");
      octx.setTransform(scale, 0, 0, scale, 0, 0);

      const blob = new Blob([doc.svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      const ok = await new Promise(resolve => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });

      if (!ok) {
        URL.revokeObjectURL(url);
        showToast("PNG export failed");
        return;
      }

      octx.drawImage(img, 0, 0, doc.W, doc.H);
      URL.revokeObjectURL(url);

      const a = document.createElement("a");
      a.download = `whiteboard-${new Date().toISOString().slice(0, 10)}.png`;
      a.href = out.toDataURL("image/png");
      a.click();
    }

    async function printCurrentBoard() {
      const doc = buildExportSvgDocument();
      if (!doc) {
        showToast("Nothing to print");
        return;
      }

      const scale = dpr();
      const out = document.createElement("canvas");
      out.width = Math.ceil(doc.W * scale);
      out.height = Math.ceil(doc.H * scale);

      const canvasCtx = out.getContext("2d");
      canvasCtx.setTransform(scale, 0, 0, scale, 0, 0);

      const blob = new Blob([doc.svg], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);

      const img = new Image();
      const ok = await new Promise(resolve => {
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });

      if (!ok) {
        URL.revokeObjectURL(url);
        showToast("Print failed");
        return;
      }

      canvasCtx.drawImage(img, 0, 0, doc.W, doc.H);
      URL.revokeObjectURL(url);

      const dataUrl = out.toDataURL("image/png");
      const win = window.open("", "_blank");
      if (!win) {
        showToast("Popup blocked");
        return;
      }

      win.document.write(`
    <html>
    <head>
      <title>Print</title>
      <style>
        html,body{
          margin:0;
          background:white;
          display:flex;
          align-items:center;
          justify-content:center;
          height:100%;
        }
        img{
          max-width:100%;
          max-height:100%;
        }
        @page{ margin:0; }
      </style>
    </head>
    <body>
      <img src="${dataUrl}">
      <script>
        window.onload = () => setTimeout(()=>window.print(),150);
      <\/script>
    </body>
    </html>
  `);
      win.document.close();
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

    function importSvgInkFromText(svgText) {
      stopSvgPlayback(true);

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
        return;
      }

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
      for (let i = startIndex; i < state.objects.length; i++) {
        svgReveal.partIds.push(state.objects[i]._id);
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
    }

    function clearImportedSvgInk() {
      if (!svgReveal.active || !svgReveal.groupId) {
        showToast("No SVG ink");
        return;
      }

      const gid = svgReveal.groupId;
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

    function bindBoards(newBoardBtn, saveBoardBtn, loadBoardBtn, deleteBoardBtn, deleteAllBoardsBtn) {
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
    }

    function bindSvgInput(svgInkFile, clearSvgInkBtn) {
      svgInkFile?.addEventListener("change", () => {
        const file = svgInkFile.files && svgInkFile.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => importSvgInkFromText(String(reader.result || ""));
        reader.readAsText(file);
        svgInkFile.value = "";
      });

      clearSvgInkBtn?.addEventListener("click", clearImportedSvgInk);
    }

    function bindExport(exportBtn, exportSvgBtn, printBtn) {
      exportBtn?.addEventListener("click", exportPNG);
      exportSvgBtn?.addEventListener("click", exportSVG);
      printBtn?.addEventListener("click", printCurrentBoard);
    }

    return {
      LS_KEY,
      snapshot,
      applySnapshot,
      loadBoardsIndex,
      saveBoardsIndex,
      refreshBoardSelect,
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
