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
      showToast._t = setTimeout(() => toast.classList.remove("show"), 1200);
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

    function toggleColorPop(open) {
      const shouldOpen = open ?? colorPop.classList.contains("is-hidden");
      colorPop.classList.toggle("is-hidden", !shouldOpen);
    }

    function openSettings(open) {
      const isOpen = open ?? settingsPanel.classList.contains("is-hidden");
      settingsPanel.classList.toggle("is-hidden", !isOpen);
      settingsBtn?.setAttribute("aria-expanded", String(isOpen));
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
      if (tool !== "polyFill") cancelPolyDraft?.();
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

    function bindUI() {
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

      presetConstruction?.addEventListener("click", () => {
        setColor("#111111");
        setLineStyle("solid");
        applyBrushPreset(5, 0.85);
        toggleColorPop(false);
        redrawAll?.();
      });

      presetOutline?.addEventListener("click", () => {
        setColor("#111111");
        setLineStyle("solid");
        applyBrushPreset(15, 1);
        toggleColorPop(false);
        redrawAll?.();
      });

      presetColour?.addEventListener("click", () => {
        setLineStyle("solid");
        applyBrushPreset(40, 0.25);
        toggleColorPop(false);
        redrawAll?.();
      });

      presetReference?.addEventListener("click", () => {
        setColor(state.linePresetMap?.reference?.color || "#1b5e20");
        setLineStyle("reference");
        applyBrushPreset(state.linePresetMap?.reference?.size || 10, 1);
        toggleColorPop(false);
        redrawAll?.();
      });

      presetHidden?.addEventListener("click", () => {
        setColor(state.linePresetMap?.hidden?.color || "#1976d2");
        setLineStyle("hidden");
        applyBrushPreset(state.linePresetMap?.hidden?.size || 5, 1);
        toggleColorPop(false);
        redrawAll?.();
      });

      presetCenter?.addEventListener("click", () => {
        setColor(state.linePresetMap?.center?.color || "#d32f2f");
        setLineStyle("center");
        applyBrushPreset(state.linePresetMap?.center?.size || 5, 1);
        toggleColorPop(false);
        redrawAll?.();
      });

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