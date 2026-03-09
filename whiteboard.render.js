/* ==========================================================
   whiteboard.render.js
   Rendering for PHS Whiteboard
   Safe split: drawing + canvas sizing only.
   ========================================================== */

window.WBRender = (() => {
  function createRenderApi(ctx) {
    const {
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
      getLineDash
    } = ctx;

    function clearCtx(canvasCtx, canvas) {
      canvasCtx.setTransform(1, 0, 0, 1, 0, 0);
      canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
    }

    function applyWorldTransform(canvasCtx) {
      const pr = state.pixelRatio || 1;
      canvasCtx.setTransform(pr, 0, 0, pr, 0, 0);
      canvasCtx.translate(state.panX, state.panY);
      canvasCtx.scale(state.zoom, state.zoom);
    }

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

    function sizeCanvas(canvas, canvasCtx) {
      const r = stage.getBoundingClientRect();
      state.viewW = Math.floor(r.width);
      state.viewH = Math.floor(r.height);

      const scale = dpr();
      state.pixelRatio = scale;

      canvas.width = Math.max(1, Math.floor(state.viewW * scale));
      canvas.height = Math.max(1, Math.floor(state.viewH * scale));

      canvasCtx.setTransform(scale, 0, 0, scale, 0, 0);
    }

    function resizeAll() {
      sizeCanvas(inkCanvas, inkCtx);
      sizeCanvas(uiCanvas, uiCtx);
      applyBgTransform();
      redrawAll();
    }

    function updateSwatch() {
      if (swatchLive) swatchLive.style.background = state.color;
    }

    function drawInkObject(obj) {
      inkCtx.save();
      inkCtx.globalAlpha = obj.opacity ?? 1;
      applyWorldTransform(inkCtx);
      inkCtx.lineCap = "round";
      inkCtx.lineJoin = "round";

      if (obj.kind === "polyFill") {
        inkCtx.globalCompositeOperation = "source-over";

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
          const ppw = obj.ppw || 1;
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
      inkCtx.setLineDash([].concat(getLineDash(obj.lineStyle, obj.size)));

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

        if (obj.filled) {
          inkCtx.fillStyle = obj.fillColor || obj.color;
          inkCtx.fillRect(-rw / 2, -rh / 2, rw, rh);
        }

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

      inkCtx.setLineDash([]);
      inkCtx.restore();
    }

    function drawInk() {
      clearCtx(inkCtx, inkCanvas);
      for (const obj of state.objects) {
        if (obj && !obj.hidden) drawInkObject(obj);
      }
    }

    function drawUI() {
      clearCtx(uiCtx, uiCanvas);
      const pr = state.pixelRatio || 1;

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

       if (state.tool === "select" && state.selection && state.selection.length) {
  uiCtx.save();
  uiCtx.setLineDash([8, 6]);
  uiCtx.lineWidth = 2;
  uiCtx.strokeStyle = "rgba(0, 120, 255, 0.9)";

  for (const idx of state.selection) {
    if (idx === state.selectionIndex) continue; // main one already has handles
    const obj = state.objects[idx];
    if (!obj) continue;

    const b = objectBounds(obj);
    const p1 = worldToScreen(b.minX, b.minY);
    const p2 = worldToScreen(b.maxX, b.maxY);

    const x = Math.min(p1.x, p2.x);
    const y = Math.min(p1.y, p2.y);
    const w = Math.abs(p2.x - p1.x);
    const h = Math.abs(p2.y - p1.y);

    uiCtx.strokeRect(x, y, w, h);
  }

  uiCtx.restore();
}

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
      const uiHandles = ctx.uiHandles;
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

      uiCtx.fillStyle = "rgba(255,255,255,0.95)";
      uiCtx.beginPath();
      uiCtx.arc(uiHandles.rotate.x, uiHandles.rotate.y, uiHandles.rotate.r, 0, Math.PI * 2);
      uiCtx.fill();
      uiCtx.stroke();

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

    return {
      clearCtx,
      applyWorldTransform,
      applyBgTransform,
      sizeCanvas,
      resizeAll,
      updateSwatch,
      drawInkObject,
      drawInk,
      drawUI,
      redrawAll
    };
  }

  return { createRenderApi };
})();
