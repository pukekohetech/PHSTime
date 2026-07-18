/* ==========================================================
   whiteboard.ui.js
   UI controls, popovers, presets, cursor, overlays
   Safe split for PHS Whiteboard
   ========================================================== */

window.WBUI = (() => {
  function createUIApi(ctx) {
    const {
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
      showToastFallback,
      redrawAll,
      cancelPolyDraft
    } = ctx;

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

    function showToast(msg = "Saved") {
      if (!toast) {
        if (showToastFallback) showToastFallback(msg);
        return;
      }
      toast.textContent = msg;
      toast.classList.add("show");
      clearTimeout(showToast._t);
      showToast._t = setTimeout(() => toast.classList.remove("show"), Math.min(2800, Math.max(1400, String(msg || "").length * 32)));
    }

    function updateSwatch() {
      if (swatchLive) swatchLive.style.background = state.color;
    }

    function updateBrushUI() {
      if (colorInput) colorInput.value = state.color;
      if (brushSize) brushSize.value = String(state.size);
      if (brushOut) brushOut.textContent = String(state.size);
      if (opacityRange) opacityRange.value = String(state.opacity);
      if (opacityOut) opacityOut.textContent = Math.round(state.opacity * 100) + "%";
      updateSwatch();
    }

    function setColor(hex) {
      state.color = hex;
      updateBrushUI();
    }

    function setBrushSize(n) {
      state.size = Number(n);
      updateBrushUI();
    }

    function setOpacity(v) {
      state.opacity = Math.max(0.05, Math.min(1, Number(v)));
      updateBrushUI();
    }

    function setLineStyle(style) {
      state.lineStyle = style || "solid";
    }

    function applyBrushPreset(size, opacity) {
      state.size = size;
      state.opacity = opacity;
      updateBrushUI();
    }

    function positionColorPop() {
      if (!colorPop || !colorBtn) return;
      const r = colorBtn.getBoundingClientRect();
      const gap = 10;
      const width = Math.min(300, Math.max(240, window.innerWidth - 86));
      colorPop.style.width = width + "px";

      let left = r.right + gap;
      if (left + width > window.innerWidth - 8) {
        left = Math.max(8, r.left - width - gap);
      }

      const popHeight = Math.min(colorPop.scrollHeight || 520, window.innerHeight - 28);
      const maxTop = Math.max(8, window.innerHeight - popHeight - 8);
      const top = Math.max(8, Math.min(r.top - 2, maxTop));

      colorPop.style.left = left + "px";
      colorPop.style.top = top + "px";
    }

    function toggleColorPop(open) {
      if (!colorPop) return;
      const shouldOpen = open ?? colorPop.classList.contains("is-hidden");
      colorPop.classList.toggle("is-hidden", !shouldOpen);
      colorBtn?.setAttribute("aria-expanded", String(shouldOpen));
      if (shouldOpen) requestAnimationFrame(positionColorPop);
    }

    function openSettings(open) {
      const isOpen = open ?? settingsPanel.classList.contains("is-hidden");
      settingsPanel.classList.toggle("is-hidden", !isOpen);
      settingsBtn?.setAttribute("aria-expanded", String(isOpen));
    }

    function updateCursorFromTool() {
      const t = state.tool;
      if (["pen", "line", "rect", "circle", "arc", "arrow", "polyFill", "curve"].includes(t)) {
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

    const TOOL_HINTS = {
      select: "Select: drag around several items to make one group. Drag inside the green box to move the group; use its corner handles to resize it.",
      rect: "Rectangle: drag to size. Hold Shift for a square; select it and drag any corner to change width and height.",
      circle: "Circle or ellipse: drag to size. Hold Shift for a perfect circle; select it and drag any corner to change width and height.",
      regularShape: "Polygon or star: choose sides or points in the mm panel, then drag to size. Hold Shift for equal width and height; Alt draws it filled.",
      line: "Line: snap to endpoints/intersections. Start from a corner and draw toward or directly away from a red VP to link perspective. Select a finished line to drag its endpoint handles.",
      arrow: "Arrow: same snapping/linking as Line, with an arrow head.",
      polyFill: "PolyFill: click 3+ corners, then Enter, double-click, right-click, or click near the first point to fill.",
      curve: "Smooth curve: click points along the path, then Enter, double-click, or right-click to draw a smooth curve through them.",
      perspective1: "1P: click 1P, then click the shape/line to use as the source. Select the guide later and drag the orange SOURCE box to grab the starting object.",
      perspective2: "2P: click 2P, then click the shape/line to use as the source. Drag either VP to adjust perspective.",
      arc: "Arc: click centre, drag radius/angle. Right-click or Esc resets while drawing."
    };

    function setActiveTool(tool) {
      hideMeasureTip();
      const previousTool = state.tool;
      const changed = previousTool !== tool;
      if (changed && (previousTool === "polyFill" || previousTool === "curve")) cancelPolyDraft?.();
      state.tool = tool;
      dockBtns.forEach(b => b.classList.toggle("is-active", b.dataset.tool === tool));
      updateCursorFromTool();
      if (tool !== "polyFill" && tool !== "curve") cancelPolyDraft?.();
      if (changed && TOOL_HINTS[tool]) showToast(TOOL_HINTS[tool]);
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
      lenBox.style.left = Math.round(sx + 12) + "px";
      lenBox.style.top = Math.round(sy + 12) + "px";
      lenBox.style.display = "block";
      lenInput.value = "";
      lenInput.placeholder = String(currentMmText || "");
      lenInput.focus({ preventScroll: true });
    }

    function moveLenBoxTo(sx, sy) {
      lenBox.style.left = Math.round(sx + 12) + "px";
      lenBox.style.top = Math.round(sy + 12) + "px";
    }

    function closeLenBox() {
      lenBox.style.display = "none";
      lenInput.value = "";
      lenInput.placeholder = "mm";
    }

    const BUILT_IN_PRESETS = {
      construction: { color: "#111111", size: 5, opacity: 0.85, lineStyle: "solid" },
      outline: { color: "#111111", size: 15, opacity: 1, lineStyle: "solid" },
      fill: { color: null, size: 40, opacity: 0.25, lineStyle: "solid" }
    };

    function getNamedPreset(name) {
      if (name === "reference" || name === "hidden" || name === "center") {
        const p = state.linePresetMap?.[name] || {};
        return {
          color: p.color || (name === "reference" ? "#1b5e20" : name === "hidden" ? "#1976d2" : "#d32f2f"),
          size: Number(p.size || 10),
          opacity: 1,
          lineStyle: name
        };
      }
      return BUILT_IN_PRESETS[name] || null;
    }

    function applyPreset(name) {
      const preset = getNamedPreset(name);
      if (!preset) return;
      if (preset.color) setColor(preset.color);
      setLineStyle(preset.lineStyle);
      applyBrushPreset(preset.size, preset.opacity);
      toggleColorPop(false);
      redrawAll?.();
    }

    function bindUI() {
      document.querySelectorAll("button[title]").forEach(btn => {
        if (!btn.hasAttribute("aria-label")) btn.setAttribute("aria-label", btn.getAttribute("title") || "Button");
      });

      colorBtn?.addEventListener("click", e => {
        e.stopPropagation();
        toggleColorPop();
      });

      document.addEventListener("pointerdown", e => {
        if (colorPop && !colorPop.classList.contains("is-hidden")) {
          const inside = colorPop.contains(e.target) || colorBtn?.contains(e.target);
          if (!inside) toggleColorPop(false);
        }

        if (settingsPanel && !settingsPanel.classList.contains("is-hidden")) {
          const inside = settingsPanel.contains(e.target);
          const onGear = settingsBtn?.contains(e.target);
          if (!inside && !onGear) openSettings(false);
        }
      });

      window.addEventListener("resize", () => {
        if (colorPop && !colorPop.classList.contains("is-hidden")) positionColorPop();
      });
      document.addEventListener("scroll", () => {
        if (colorPop && !colorPop.classList.contains("is-hidden")) positionColorPop();
      }, true);

      colorInput?.addEventListener("input", () => {
        setColor(colorInput.value);
      });

      brushSize?.addEventListener("input", () => {
        setBrushSize(brushSize.value);
      });

      opacityRange?.addEventListener("input", () => {
        setOpacity(opacityRange.value);
      });

      settingsBtn?.addEventListener("click", () => openSettings());
      settingsCloseBtn?.addEventListener("click", () => openSettings(false));

      dockBtns.forEach(b => {
        b.addEventListener("click", () => {
          setActiveTool(b.dataset.tool);
        });
      });

      presetConstruction?.addEventListener("click", () => applyPreset("construction"));
      presetOutline?.addEventListener("click", () => applyPreset("outline"));
      presetColour?.addEventListener("click", () => applyPreset("fill"));
      presetReference?.addEventListener("click", () => applyPreset("reference"));
      presetHidden?.addEventListener("click", () => applyPreset("hidden"));
      presetCenter?.addEventListener("click", () => applyPreset("center"));

      lineStyleSolid?.addEventListener("click", () => {
        setLineStyle("solid");
        redrawAll?.();
      });

      lineStyleReference?.addEventListener("click", () => {
        setLineStyle("reference");
        redrawAll?.();
      });

      lineStyleHidden?.addEventListener("click", () => {
        setLineStyle("hidden");
        redrawAll?.();
      });

      lineStyleCenter?.addEventListener("click", () => {
        setLineStyle("center");
        redrawAll?.();
      });

      document.querySelectorAll(".colorPalette button").forEach(btn => {
        btn.addEventListener("click", () => {
          const col = btn.dataset.col;
          if (!col) return;
          setColor(col);
          redrawAll?.();
        });
      });
    }

    return {
      measureTip,
      lenBox,
      lenInput,
      showToast,
      updateSwatch,
      updateBrushUI,
      setColor,
      setBrushSize,
      setOpacity,
      setLineStyle,
      applyBrushPreset,
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
    };
  }

  return { createUIApi };
})();