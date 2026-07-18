/* ==========================================================
   whiteboard.render.js
   Rendering for PHS Whiteboard
   Safe split: drawing + canvas sizing only.
   ========================================================== */

window.WBRender = (() => {
  function createRenderApi(ctx) {
    const {
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
      getLineDash,
      findObjById,
      perspectiveTargetPoints
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


    function drawSmoothCurvePath(ctx2, pts) {
      if (!pts || !pts.length) return;
      ctx2.moveTo(pts[0].x, pts[0].y);
      if (pts.length === 1) return;
      if (pts.length === 2) {
        ctx2.lineTo(pts[1].x, pts[1].y);
        return;
      }
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)];
        const p1 = pts[i];
        const p2 = pts[i + 1];
        const p3 = pts[Math.min(pts.length - 1, i + 2)];
        ctx2.bezierCurveTo(
          p1.x + (p2.x - p0.x) / 6,
          p1.y + (p2.y - p0.y) / 6,
          p2.x - (p3.x - p1.x) / 6,
          p2.y - (p3.y - p1.y) / 6,
          p2.x,
          p2.y
        );
      }
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


      if (obj.kind === "perspectiveGuide") {
        inkCtx.globalCompositeOperation = "source-over";
        const target = findObjById ? findObjById(obj.targetId) : null;
        const vps = [];
        if (obj.vp1) vps.push(obj.vp1);
        if ((obj.mode || 1) >= 2 && obj.vp2) vps.push(obj.vp2);

        const perspectiveColor = "#d32f2f";
        const perspectiveWidth = Math.max(3.5, Number(obj.size || 0));
        inkCtx.strokeStyle = perspectiveColor;
        inkCtx.fillStyle = perspectiveColor;
        inkCtx.lineWidth = perspectiveWidth;
        inkCtx.setLineDash([].concat(getLineDash(obj.lineStyle || "reference", perspectiveWidth)));

        for (const vp of vps) {
          const srcPts = perspectiveTargetPoints ? perspectiveTargetPoints(target, vp, obj) : [];
          inkCtx.beginPath();
          for (const p of srcPts) {
            inkCtx.moveTo(p.x, p.y);
            inkCtx.lineTo(vp.x, vp.y);
          }
          inkCtx.stroke();
        }

        inkCtx.setLineDash([]);
        for (let i = 0; i < vps.length; i++) {
          const vp = vps[i];
          inkCtx.beginPath();
          inkCtx.arc(vp.x, vp.y, 7 / (state.zoom || 1), 0, Math.PI * 2);
          inkCtx.fill();
          inkCtx.strokeStyle = "rgba(255,255,255,0.95)";
          inkCtx.lineWidth = 2 / (state.zoom || 1);
          inkCtx.stroke();
          inkCtx.strokeStyle = perspectiveColor;
          inkCtx.lineWidth = perspectiveWidth;
        }

        inkCtx.restore();
        return;
      }

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

      if (obj.kind === "stroke" || obj.kind === "erase" || obj.kind === "curve") {
        inkCtx.globalCompositeOperation = obj.kind === "erase" ? "destination-out" : "source-over";
        inkCtx.strokeStyle = obj.kind === "erase" ? "rgba(0,0,0,1)" : obj.color;
        inkCtx.lineWidth = obj.size;
        inkCtx.setLineDash([].concat(getLineDash(obj.lineStyle || "solid", obj.size || 2)));

        inkCtx.beginPath();
        const pts = obj.points || obj.pts || [];
        if ((obj.kind === "stroke" || obj.kind === "erase") && pts.length === 1) {
          inkCtx.fillStyle = obj.kind === "erase" ? "rgba(0,0,0,1)" : obj.color;
          inkCtx.arc(pts[0].x, pts[0].y, Math.max(0.5, Number(obj.size || 1) / 2), 0, Math.PI * 2);
          inkCtx.fill();
        } else {
          if (obj.kind === "curve") drawSmoothCurvePath(inkCtx, pts);
          else if (pts.length) {
            inkCtx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) inkCtx.lineTo(pts[i].x, pts[i].y);
          }
          inkCtx.stroke();
        }
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

    function selectedMainObject() {
      return state.selectionIndex >= 0 ? state.objects[state.selectionIndex] : null;
    }

    function shouldDrawPolyHandlesUnderLinework() {
      const obj = selectedMainObject();
      return state.tool === "select" && obj && obj.kind === "polyFill";
    }

    function isLineworkObject(obj) {
      return obj && (obj.kind === "line" || obj.kind === "arrow" || obj.kind === "perspectiveGuide");
    }

    function drawPolyFillSelectionHandlesOnInk() {
      computeHandles();
      const uiHandles = ctx.uiHandles;
      if (!uiHandles.visible) return;

      const pr = state.pixelRatio || 1;
      inkCtx.save();
      inkCtx.setTransform(pr, 0, 0, pr, 0, 0);
      inkCtx.strokeStyle = "rgba(46, 204, 113, 0.95)";
      inkCtx.lineWidth = 2;
      inkCtx.setLineDash([6, 4]);

      if (!uiHandles.poly) {
        const b = uiHandles.box;
        if (b) inkCtx.strokeRect(b.x, b.y, b.w, b.h);
      } else {
        const p = uiHandles.poly;
        inkCtx.beginPath();
        inkCtx.moveTo(p[0].x, p[0].y);
        for (let i = 1; i < p.length; i++) inkCtx.lineTo(p[i].x, p[i].y);
        inkCtx.closePath();
        inkCtx.stroke();
      }

      inkCtx.setLineDash([]);

      if (uiHandles.rotate) {
        inkCtx.beginPath();
        if (!uiHandles.poly && uiHandles.box) {
          const b = uiHandles.box;
          inkCtx.moveTo(b.x + b.w / 2, b.y);
        } else if (uiHandles.poly) {
          const p = uiHandles.poly;
          inkCtx.moveTo((p[0].x + p[1].x) / 2, (p[0].y + p[1].y) / 2);
        }
        inkCtx.lineTo(uiHandles.rotate.x, uiHandles.rotate.y);
        inkCtx.stroke();

        inkCtx.fillStyle = "rgba(255,255,255,0.95)";
        inkCtx.beginPath();
        inkCtx.arc(uiHandles.rotate.x, uiHandles.rotate.y, uiHandles.rotate.r, 0, Math.PI * 2);
        inkCtx.fill();
        inkCtx.stroke();
      }

      if (uiHandles.corners) {
        for (const c of uiHandles.corners) {
          inkCtx.fillStyle = "rgba(255,255,255,0.95)";
          inkCtx.strokeStyle = "rgba(46, 204, 113, 0.95)";
          inkCtx.lineWidth = 2;
          inkCtx.beginPath();
          inkCtx.rect(c.x - c.s, c.y - c.s, c.s * 2, c.s * 2);
          inkCtx.fill();
          inkCtx.stroke();
        }
      }

      inkCtx.restore();
    }

    function drawInk() {
      clearCtx(inkCtx, inkCanvas);

      if (!shouldDrawPolyHandlesUnderLinework()) {
        for (const obj of state.objects) {
          if (obj && !obj.hidden) drawInkObject(obj);
        }
        return;
      }

      // When editing a PolyFill face, draw its handles before construction linework.
      // This keeps the face editable while preventing handles from covering the
      // perspective/edge lines that define the form.
      for (const obj of state.objects) {
        if (obj && !obj.hidden && !isLineworkObject(obj)) drawInkObject(obj);
      }
      drawPolyFillSelectionHandlesOnInk();
      for (const obj of state.objects) {
        if (obj && !obj.hidden && isLineworkObject(obj)) drawInkObject(obj);
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

      if (state.tool === "select" && gesture?.mode === "marqueeSelect" && gesture.marqueeStart && gesture.marqueeCurrent) {
        const a = worldToScreen(gesture.marqueeStart.x, gesture.marqueeStart.y);
        const b = worldToScreen(gesture.marqueeCurrent.x, gesture.marqueeCurrent.y);
        const x = Math.min(a.x, b.x);
        const y = Math.min(a.y, b.y);
        const w = Math.abs(b.x - a.x);
        const h = Math.abs(b.y - a.y);
        uiCtx.save();
        uiCtx.setTransform(pr, 0, 0, pr, 0, 0);
        uiCtx.setLineDash([7, 5]);
        uiCtx.lineWidth = 2;
        uiCtx.strokeStyle = "rgba(0, 120, 255, 0.9)";
        uiCtx.fillStyle = "rgba(0, 120, 255, 0.08)";
        uiCtx.fillRect(x, y, w, h);
        uiCtx.strokeRect(x, y, w, h);
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

      if (state.tool === "curve" && polyDraft.active && polyDraft.pts.length) {
        uiCtx.save();
        uiCtx.setTransform(pr, 0, 0, pr, 0, 0);
        const pts = polyDraft.pts.map(p => worldToScreen(p.x, p.y));
        const hover = polyDraft.hover ? worldToScreen(polyDraft.hover.x, polyDraft.hover.y) : null;
        const previewPts = hover ? pts.concat([hover]) : pts;
        uiCtx.lineWidth = 2;
        uiCtx.setLineDash([6, 4]);
        uiCtx.strokeStyle = "rgba(0,0,0,0.65)";
        uiCtx.beginPath();
        drawSmoothCurvePath(uiCtx, previewPts);
        uiCtx.stroke();
        uiCtx.setLineDash([]);
        for (const p of pts) {
          uiCtx.fillStyle = "rgba(255,255,255,0.95)";
          uiCtx.strokeStyle = "rgba(0,0,0,0.6)";
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

      if (uiHandles.perspective && uiHandles.perspective.length) {
        const src = uiHandles.perspectiveSource;
        if (src) {
          uiCtx.save();
          uiCtx.strokeStyle = "rgba(255, 145, 0, 0.98)";
          uiCtx.fillStyle = "rgba(255, 145, 0, 0.12)";
          uiCtx.lineWidth = 3;
          uiCtx.setLineDash([8, 5]);
          uiCtx.strokeRect(src.x, src.y, src.w, src.h);
          uiCtx.fillRect(src.x, src.y, src.w, src.h);
          uiCtx.setLineDash([]);

          uiCtx.beginPath();
          uiCtx.fillStyle = "rgba(255,255,255,0.98)";
          uiCtx.strokeStyle = "rgba(255, 145, 0, 0.98)";
          uiCtx.lineWidth = 2;
          uiCtx.arc(src.cx, src.cy, src.r, 0, Math.PI * 2);
          uiCtx.fill();
          uiCtx.stroke();

          const label = "SOURCE";
          uiCtx.font = "700 11px system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif";
          const tw = uiCtx.measureText(label).width;
          const lx = src.x;
          const ly = Math.max(4, src.y - 22);
          uiCtx.fillStyle = "rgba(255, 145, 0, 0.95)";
          uiCtx.fillRect(lx, ly, tw + 14, 18);
          uiCtx.fillStyle = "white";
          uiCtx.fillText(label, lx + 7, ly + 13);
          uiCtx.restore();
        }

        if (uiHandles.box) {
          const b = uiHandles.box;
          uiCtx.strokeStyle = "rgba(0, 120, 255, 0.65)";
          uiCtx.setLineDash([6, 4]);
          uiCtx.strokeRect(b.x, b.y, b.w, b.h);
          uiCtx.setLineDash([]);
        }

        for (const p of uiHandles.perspective) {
          uiCtx.fillStyle = "rgba(255,255,255,0.98)";
          uiCtx.strokeStyle = "rgba(0, 120, 255, 0.95)";
          uiCtx.lineWidth = 2;
          uiCtx.beginPath();
          uiCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          uiCtx.fill();
          uiCtx.stroke();

          uiCtx.fillStyle = "rgba(0, 120, 255, 0.95)";
          uiCtx.beginPath();
          uiCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          uiCtx.fill();
        }

        uiCtx.restore();
        return;
      }

      if (shouldDrawPolyHandlesUnderLinework()) {
        uiCtx.restore();
        return;
      }

      if (uiHandles.lineEndpoints && uiHandles.lineEndpoints.length) {
        const b = uiHandles.box;
        if (b) uiCtx.strokeRect(b.x, b.y, b.w, b.h);
        uiCtx.setLineDash([]);
        for (const p of uiHandles.lineEndpoints) {
          uiCtx.fillStyle = "rgba(255,255,255,0.98)";
          uiCtx.strokeStyle = "rgba(46, 204, 113, 0.98)";
          uiCtx.lineWidth = 2;
          uiCtx.beginPath();
          uiCtx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
          uiCtx.fill();
          uiCtx.stroke();
          uiCtx.fillStyle = "rgba(46, 204, 113, 0.95)";
          uiCtx.beginPath();
          uiCtx.arc(p.x, p.y, 3, 0, Math.PI * 2);
          uiCtx.fill();
        }
        uiCtx.restore();
        return;
      }

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
