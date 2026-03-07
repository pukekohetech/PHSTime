/* ==========================================================
   whiteboard.shared.js
   Shared helpers for PHS Whiteboard
   Safe first split: utilities only, no tool logic.
   ========================================================== */

window.WBShared = (() => {
  const DEFAULT_PX_PER_MM = 96 / 25.4;
  const SNAP_RADIUS_PX = 12;

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
  }

  function parseMmInput(v) {
    const s = String(v || "").trim();
    if (!s) return null;
    const n = parseFloat(s.replace(/[^0-9.+-]/g, ""));
    if (!isFinite(n) || n <= 0) return null;
    return Math.max(0.1, n);
  }

  function formatMm(mm) {
    if (!isFinite(mm)) return "0 mm";
    const nearInt = Math.abs(mm - Math.round(mm)) < 0.05;
    return (nearInt ? Math.round(mm).toString() : mm.toFixed(1)) + " mm";
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
    for (let i = 1; i < pts.length; i++) {
      d += ` L ${pts[i].x.toFixed(2)} ${pts[i].y.toFixed(2)}`;
    }
    return d;
  }

  function parseSimpleMLPath(d) {
    const tokens = String(d || "").match(/[MLml]|-?\d*\.?\d+(?:e[-+]?\d+)?/g);
    if (!tokens) return null;

    const pts = [];
    let i = 0;
    let cmd = null;
    let x = 0;
    let y = 0;

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
        x = nx;
        y = ny;
        cmd = "L";
      } else if (cmd === "m") {
        x += nx;
        y += ny;
        cmd = "l";
      } else if (cmd === "L") {
        x = nx;
        y = ny;
      } else if (cmd === "l") {
        x += nx;
        y += ny;
      } else {
        return null;
      }

      pts.push({ x, y });
    }

    return pts.length >= 2 ? pts : null;
  }

  function rotateAround(x, y, cx, cy, ang) {
    const dx = x - cx;
    const dy = y - cy;
    const c = Math.cos(ang);
    const s = Math.sin(ang);
    return { x: cx + dx * c - dy * s, y: cy + dx * s + dy * c };
  }

  function rotatePoint(px, py, cx, cy, angle) {
    const dx = px - cx;
    const dy = py - cy;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos
    };
  }

  function arcDelta(a1, a2) {
    const TWO_PI = Math.PI * 2;
    let d = (a2 - a1) % TWO_PI;
    if (d < 0) d += TWO_PI;
    return d;
  }

  function distToSeg(px, py, x1, y1, x2, y2) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);

    const t = ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy);
    const tt = clamp(t, 0, 1);
    const cx = x1 + tt * dx;
    const cy = y1 + tt * dy;
    return Math.hypot(px - cx, py - cy);
  }

  function pointInPoly(px, py, pts) {
    if (!pts || pts.length < 3) return false;
    let inside = false;

    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
      const xi = pts[i].x;
      const yi = pts[i].y;
      const xj = pts[j].x;
      const yj = pts[j].y;

      const intersect =
        yi > py !== yj > py &&
        px < ((xj - xi) * (py - yi)) / (yj - yi + 1e-12) + xi;

      if (intersect) inside = !inside;
    }

    return inside;
  }

  function polyBounds(pts) {
    if (!pts || !pts.length) {
      return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
    }

    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const p of pts) {
      minX = Math.min(minX, p.x);
      minY = Math.min(minY, p.y);
      maxX = Math.max(maxX, p.x);
      maxY = Math.max(maxY, p.y);
    }

    return { minX, minY, maxX, maxY };
  }

  function isAngleOnArc(a, a1, a2) {
    const TWO_PI = Math.PI * 2;
    const norm = v => ((v % TWO_PI) + TWO_PI) % TWO_PI;
    const aa = norm(a);
    const s = norm(a1);
    const e = norm(a2);

    if (s <= e) return aa >= s && aa <= e;
    return aa >= s || aa <= e;
  }



  function getLineDash(style, size = 1) {
    const s = Math.max(1, Number(size) || 1);
    if (style === "hidden") return [s * 4, s * 3];
    if (style === "center") return [s * 8, s * 3, s * 1.2, s * 3];
    return [];
  }

  function svgDashArray(style, size = 1) {
    return getLineDash(style, size).map(n => Number(n.toFixed(3))).join(" ");
  }

  function detectLineStyleFromDashArray(raw, size = 1) {
    const nums = String(raw || "")
      .split(/[ ,]+/)
      .map(v => parseFloat(v))
      .filter(v => isFinite(v) && v > 0);
    if (!nums.length) return "solid";
    if (nums.length >= 4) return "center";
    return "hidden";
  }

  function segIntersection(a, b) {
    const x1 = a.x1, y1 = a.y1, x2 = a.x2, y2 = a.y2;
    const x3 = b.x1, y3 = b.y1, x4 = b.x2, y4 = b.y2;

    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(den) < 1e-12) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = ((x1 - x3) * (y1 - y2) - (y1 - y3) * (x1 - x2)) / den;

    if (t < -1e-6 || t > 1 + 1e-6 || u < -1e-6 || u > 1 + 1e-6) return null;

    return {
      x: x1 + t * (x2 - x1),
      y: y1 + t * (y2 - y1)
    };
  }

  function unionBounds(a, b) {
    if (!a) return b ? { ...b } : null;
    if (!b) return { ...a };
    return {
      minX: Math.min(a.minX, b.minX),
      minY: Math.min(a.minY, b.minY),
      maxX: Math.max(a.maxX, b.maxX),
      maxY: Math.max(a.maxY, b.maxY)
    };
  }

  return {
    DEFAULT_PX_PER_MM,
    SNAP_RADIUS_PX,
    clamp,
    deepClone,
    parseMmInput,
    formatMm,
    parseNumberAttr,
    svgEscape,
    pathFromPoints,
    parseSimpleMLPath,
    rotateAround,
    rotatePoint,
    arcDelta,
    distToSeg,
    pointInPoly,
    polyBounds,
    isAngleOnArc,
    getLineDash,
    svgDashArray,
    detectLineStyleFromDashArray,
    segIntersection,
    unionBounds
  };
})();