/* ==========================================================
   whiteboard.geometry.js
   Geometry, hit-testing, snapping, transforms, bounds
   Safe split for PHS Whiteboard
   ========================================================== */

window.WBGeometry = (() => {
  function createGeometryApi(ctx) {
    const {
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
      segIntersection
    } = ctx;

    function pointOnArc(obj, which) {
      const a = which === "start" ? obj.a1 : obj.a2;
      return { x: obj.cx + Math.cos(a) * obj.r, y: obj.cy + Math.sin(a) * obj.r };
    }

    function arcSpanSigned(obj) {
      const a1 = obj.a1 || 0;
      const a2 = obj.a2 || 0;
      const ccw = !!obj.ccw;
      const TWO_PI = Math.PI * 2;
      const rawAbs = Math.abs(a2 - a1);
      if (rawAbs >= TWO_PI - 1e-6) return ccw ? -TWO_PI : TWO_PI;
      return ccw
        ? -((((a1 - a2) % TWO_PI) + TWO_PI) % TWO_PI)
        :  ((((a2 - a1) % TWO_PI) + TWO_PI) % TWO_PI);
    }

    function isAngleOnDirectedArc(a, obj) {
      const TWO_PI = Math.PI * 2;
      const norm = v => ((v % TWO_PI) + TWO_PI) % TWO_PI;
      const a1 = norm(obj.a1 || 0);
      const a2 = norm(obj.a2 || 0);
      const aa = norm(a);
      const ccw = !!obj.ccw;
      const rawAbs = Math.abs((obj.a2 || 0) - (obj.a1 || 0));

      if (rawAbs >= TWO_PI - 1e-6) return true;

      if (ccw) {
        const total = (((a1 - a2) % TWO_PI) + TWO_PI) % TWO_PI;
        const part = (((a1 - aa) % TWO_PI) + TWO_PI) % TWO_PI;
        return part <= total + 1e-9;
      }

      const total = (((a2 - a1) % TWO_PI) + TWO_PI) % TWO_PI;
      const part = (((aa - a1) % TWO_PI) + TWO_PI) % TWO_PI;
      return part <= total + 1e-9;
    }

    function rectEdges(obj) {
      const x1 = obj.x1, y1 = obj.y1, x2 = obj.x2, y2 = obj.y2;
      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2;
      const w = Math.abs(x2 - x1);
      const h = Math.abs(y2 - y1);
      const ang = obj.rot || 0;

      const pts = [
        { x: cx - w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy - h / 2 },
        { x: cx + w / 2, y: cy + h / 2 },
        { x: cx - w / 2, y: cy + h / 2 }
      ].map(p => (ang ? rotateAround(p.x, p.y, cx, cy, ang) : p));

      return [
        { x1: pts[0].x, y1: pts[0].y, x2: pts[1].x, y2: pts[1].y },
        { x1: pts[1].x, y1: pts[1].y, x2: pts[2].x, y2: pts[2].y },
        { x1: pts[2].x, y1: pts[2].y, x2: pts[3].x, y2: pts[3].y },
        { x1: pts[3].x, y1: pts[3].y, x2: pts[0].x, y2: pts[0].y }
      ];
    }


    function circlePointAtLocalAngle(obj, t) {
      const cx = (obj.x1 + obj.x2) / 2;
      const cy = (obj.y1 + obj.y2) / 2;
      const rx = Math.abs(obj.x2 - obj.x1) / 2;
      const ry = Math.abs(obj.y2 - obj.y1) / 2;
      const ang = obj.rot || 0;
      const ex = Math.cos(t) * rx;
      const ey = Math.sin(t) * ry;
      return {
        x: cx + ex * Math.cos(ang) - ey * Math.sin(ang),
        y: cy + ex * Math.sin(ang) + ey * Math.cos(ang)
      };
    }

    function circleCardinalPoints(obj) {
      return [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map(t => circlePointAtLocalAngle(obj, t));
    }

    function circleTangentPointsFromPoint(obj, vp) {
      if (!obj || !vp) return circleCardinalPoints(obj);

      const cx = (obj.x1 + obj.x2) / 2;
      const cy = (obj.y1 + obj.y2) / 2;
      const rx = Math.abs(obj.x2 - obj.x1) / 2;
      const ry = Math.abs(obj.y2 - obj.y1) / 2;
      if (rx <= 0.001 || ry <= 0.001) return [];

      const ang = obj.rot || 0;
      const cos = Math.cos(-ang);
      const sin = Math.sin(-ang);
      const dx = vp.x - cx;
      const dy = vp.y - cy;
      const lx = dx * cos - dy * sin;
      const ly = dx * sin + dy * cos;

      const qx = lx / rx;
      const qy = ly / ry;
      const d2 = qx * qx + qy * qy;

      let unitPts;
      if (d2 > 1.000001) {
        const root = Math.sqrt(Math.max(0, d2 - 1));
        unitPts = [
          { x: (qx - qy * root) / d2, y: (qy + qx * root) / d2 },
          { x: (qx + qy * root) / d2, y: (qy - qx * root) / d2 }
        ];
      } else {
        const a = Math.atan2(qy, qx || 1e-9) + Math.PI / 2;
        unitPts = [
          { x: Math.cos(a), y: Math.sin(a) },
          { x: -Math.cos(a), y: -Math.sin(a) }
        ];
      }

      return unitPts.map(u => {
        const ex = u.x * rx;
        const ey = u.y * ry;
        return {
          x: cx + ex * Math.cos(ang) - ey * Math.sin(ang),
          y: cy + ex * Math.sin(ang) + ey * Math.cos(ang)
        };
      });
    }

    function arcTangentPointsFromPoint(obj, vp) {
      if (!obj) return [];
      if (!vp) return [pointOnArc(obj, "start"), pointOnArc(obj, "end")];

      const cx = obj.cx, cy = obj.cy, r = Math.abs(obj.r || 0);
      if (r <= 0.001) return [];

      const dx = vp.x - cx;
      const dy = vp.y - cy;
      const d = Math.hypot(dx, dy);
      const base = Math.atan2(dy, dx);

      let angles;
      if (d > r + 1e-6) {
        const off = Math.acos(clamp(r / d, -1, 1));
        angles = [base - off, base + off];
      } else {
        angles = [base + Math.PI / 2, base - Math.PI / 2];
      }

      const pts = [];
      const seen = new Set();
      for (const a of angles) {
        if (!isAngleOnDirectedArc(a, obj)) continue;
        const key = Math.round(Math.cos(a) * 10000) + ':' + Math.round(Math.sin(a) * 10000);
        if (seen.has(key)) continue;
        seen.add(key);
        pts.push({ x: cx + Math.cos(a) * r, y: cy + Math.sin(a) * r, angle: a });
      }
      return pts;
    }

    function perspectiveTargetPoints(target, vp, guide) {
      if (!target) return [];
      if (target.kind === "line" || target.kind === "arrow") {
        return [{ x: target.x1, y: target.y1 }, { x: target.x2, y: target.y2 }];
      }
      if (target.kind === "rect") {
        return rectEdges(target).map(e => ({ x: e.x1, y: e.y1 }));
      }
      if (target.kind === "circle") {
        const pts = vp ? circleTangentPointsFromPoint(target, vp) : circleCardinalPoints(target);
        if (!vp || !guide || !target._id) return pts;
        const vpName = vp === guide.vp2 ? "vp2" : "vp1";
        return pts.map((p, side) => ({
          ...p,
          ref: { type: "anchor", objId: target._id, kind: "circleTangent", guideId: guide._id, vpName, side }
        }));
      }
      if (target.kind === "arc") {
        let pts = vp ? arcTangentPointsFromPoint(target, vp) : [pointOnArc(target, "start"), pointOnArc(target, "end")];
        if (vp && !pts.length) {
          pts = [pointOnArc(target, "start"), pointOnArc(target, "end")];
        }
        if (!vp || !guide || !target._id) return pts;
        const vpName = vp === guide.vp2 ? "vp2" : "vp1";
        return pts.map((p, side) => ({
          ...p,
          ref: { type: "anchor", objId: target._id, kind: "arcTangent", guideId: guide._id, vpName, side }
        }));
      }
      if (target.kind === "polyFill") return (target.pts || []).map(p => ({ x: p.x, y: p.y }));
      if (target.kind === "stroke" || target.kind === "erase") return (target.points || []).filter((_, i, a) => i === 0 || i === a.length - 1).map(p => ({ x: p.x, y: p.y }));
      const b = objectBounds(target);
      return [
        { x: b.minX, y: b.minY },
        { x: b.maxX, y: b.minY },
        { x: b.maxX, y: b.maxY },
        { x: b.minX, y: b.maxY }
      ];
    }

    function perspectivePoints(obj) {
      const pts = [];
      if (obj.vp1) pts.push(obj.vp1);
      if ((obj.mode || 1) >= 2 && obj.vp2) pts.push(obj.vp2);
      return pts;
    }

    function objectBounds(obj) {
      if (obj.kind === "perspectiveGuide") {
        const target = ctx.findObjById ? ctx.findObjById(obj.targetId) : null;
        const pts = perspectiveTargetPoints(target).concat(perspectivePoints(obj));
        if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) { minX = Math.min(minX, p.x); minY = Math.min(minY, p.y); maxX = Math.max(maxX, p.x); maxY = Math.max(maxY, p.y); }
        const pad = Math.max(10, (obj.size || 2) * 3);
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
      }

      if (obj.kind === "fillBitmap") {
        const ppw = obj.ppw || 1;
        const wWorld = (obj.w || 1) / ppw;
        const hWorld = (obj.h || 1) / ppw;
        return {
          minX: obj.x,
          minY: obj.y,
          maxX: obj.x + wWorld,
          maxY: obj.y + hWorld
        };
      }

      if (obj.kind === "polyFill") {
        const b = polyBounds(obj.pts || []);
        const pad = 4;
        return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
      }

      if (obj.kind === "curve") {
        const b = polyBounds(obj.points || obj.pts || []);
        const pad = Math.max(8, (obj.size || 4) * 1.5);
        return { minX: b.minX - pad, minY: b.minY - pad, maxX: b.maxX + pad, maxY: b.maxY + pad };
      }

      if (obj.kind === "text") {
        const m = textMetrics(obj);
        const w = m.w, h = m.h;
        const cx = obj.x + w / 2;
        const cy = obj.y + h / 2;
        const ang = obj.rot || 0;

        const corners = [
          { x: -w / 2, y: -h / 2 },
          { x:  w / 2, y: -h / 2 },
          { x:  w / 2, y:  h / 2 },
          { x: -w / 2, y:  h / 2 }
        ].map(p => ({
          x: cx + p.x * Math.cos(ang) - p.y * Math.sin(ang),
          y: cy + p.x * Math.sin(ang) + p.y * Math.cos(ang)
        }));

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of corners) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        return { minX, minY, maxX, maxY };
      }

      if (obj.kind === "stroke" || obj.kind === "erase") {
        const pts = obj.points || [];
        if (!pts.length) return { minX: 0, minY: 0, maxX: 0, maxY: 0 };

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const pad = (obj.size || 6) * 0.8;
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
      }

      if (obj.kind === "rect") {
        const x1 = obj.x1, y1 = obj.y1, x2 = obj.x2, y2 = obj.y2;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rw = Math.abs(x2 - x1);
        const rh = Math.abs(y2 - y1);
        const ang = obj.rot || 0;

        const corners = [
          { x: -rw / 2, y: -rh / 2 },
          { x:  rw / 2, y: -rh / 2 },
          { x:  rw / 2, y:  rh / 2 },
          { x: -rw / 2, y:  rh / 2 }
        ].map(p => ({
          x: cx + p.x * Math.cos(ang) - p.y * Math.sin(ang),
          y: cy + p.x * Math.sin(ang) + p.y * Math.cos(ang)
        }));

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of corners) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }
        const pad = (obj.size || 4) * 1.0;
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
      }

      if (obj.kind === "circle") {
        const x1 = obj.x1, y1 = obj.y1, x2 = obj.x2, y2 = obj.y2;
        const cx = (x1 + x2) / 2;
        const cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2;
        const ry = Math.abs(y2 - y1) / 2;
        const ang = obj.rot || 0;

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        const cosA = Math.cos(ang), sinA = Math.sin(ang);

        for (let i = 0; i < 16; i++) {
          const t = (i / 16) * Math.PI * 2;
          const ex = Math.cos(t) * rx;
          const ey = Math.sin(t) * ry;
          const px = cx + ex * cosA - ey * sinA;
          const py = cy + ex * sinA + ey * cosA;
          minX = Math.min(minX, px);
          minY = Math.min(minY, py);
          maxX = Math.max(maxX, px);
          maxY = Math.max(maxY, py);
        }

        const pad = (obj.size || 4) * 1.0;
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
      }

      if (obj.kind === "arc") {
        const pts = [];
        const d = arcSpanSigned(obj);
        const steps = Math.max(6, Math.min(48, Math.ceil(48 * (Math.abs(d) / (Math.PI * 2)))));
        for (let i = 0; i <= steps; i++) {
          const t = obj.a1 + d * (i / steps);
          pts.push({ x: obj.cx + Math.cos(t) * obj.r, y: obj.cy + Math.sin(t) * obj.r });
        }

        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const p of pts) {
          minX = Math.min(minX, p.x);
          minY = Math.min(minY, p.y);
          maxX = Math.max(maxX, p.x);
          maxY = Math.max(maxY, p.y);
        }

        const pad = (obj.size || 4) * 1.0;
        return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
      }

      const minX = Math.min(obj.x1, obj.x2);
      const minY = Math.min(obj.y1, obj.y2);
      const maxX = Math.max(obj.x1, obj.x2);
      const maxY = Math.max(obj.y1, obj.y2);
      const pad = (obj.size || 4) * 1.0;
      return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
    }

    function hitObject(obj, wx, wy) {
      const tol = Math.max(8, (obj.size || 4) * 1.5);

      if (obj.kind === "perspectiveGuide") {
        const target = ctx.findObjById ? ctx.findObjById(obj.targetId) : null;
        const srcPts = perspectiveTargetPoints(target);
        const vps = perspectivePoints(obj);
        const tol2 = Math.max(tol, 12);
        for (const vp of vps) {
          if (Math.hypot(wx - vp.x, wy - vp.y) <= tol2 * 1.4) return true;
          for (const p of srcPts) if (distToSeg(wx, wy, p.x, p.y, vp.x, vp.y) <= tol2) return true;
        }
        return false;
      }

      if (obj.kind === "polyFill") {
        return pointInPoly(wx, wy, obj.pts || []);
      }

      if (obj.kind === "text") {
        const b = objectBounds(obj);
        return wx >= b.minX && wx <= b.maxX && wy >= b.minY && wy <= b.maxY;
      }

      if (obj.kind === "stroke" || obj.kind === "erase" || obj.kind === "curve") {
        const pts = obj.points || obj.pts || [];
        for (let i = 1; i < pts.length; i++) {
          if (distToSeg(wx, wy, pts[i - 1].x, pts[i - 1].y, pts[i].x, pts[i].y) <= tol) return true;
        }
        return false;
      }

      if (obj.kind === "line" || obj.kind === "arrow") {
        return distToSeg(wx, wy, obj.x1, obj.y1, obj.x2, obj.y2) <= tol;
      }

      if (obj.kind === "rect") {
        const cx = (obj.x1 + obj.x2) / 2;
        const cy = (obj.y1 + obj.y2) / 2;
        const rw = Math.abs(obj.x2 - obj.x1);
        const rh = Math.abs(obj.y2 - obj.y1);
        const ang = obj.rot || 0;
        const cos = Math.cos(-ang), sin = Math.sin(-ang);
        const lx = (wx - cx) * cos - (wy - cy) * sin;
        const ly = (wx - cx) * sin + (wy - cy) * cos;
        return Math.abs(lx) <= rw / 2 && Math.abs(ly) <= rh / 2;
      }

      if (obj.kind === "circle") {
        const cx = (obj.x1 + obj.x2) / 2;
        const cy = (obj.y1 + obj.y2) / 2;
        const rx = Math.abs(obj.x2 - obj.x1) / 2;
        const ry = Math.abs(obj.y2 - obj.y1) / 2;
        if (rx < 1 || ry < 1) return false;

        const ang = obj.rot || 0;
        const cos = Math.cos(-ang), sin = Math.sin(-ang);
        const lx = (wx - cx) * cos - (wy - cy) * sin;
        const ly = (wx - cx) * sin + (wy - cy) * cos;
        const nx = lx / rx, ny = ly / ry;
        return nx * nx + ny * ny <= 1.2;
      }

      if (obj.kind === "arc") {
        const dx = wx - obj.cx;
        const dy = wy - obj.cy;
        const dist = Math.hypot(dx, dy);
        if (Math.abs(dist - obj.r) > tol) return false;
        const a = Math.atan2(dy, dx);
        return isAngleOnDirectedArc(a, obj);
      }

      return false;
    }

    function findHit(wx, wy) {
      for (let i = state.objects.length - 1; i >= 0; i--) {
        const o = state.objects[i];
        if (o && !o.hidden && hitObject(o, wx, wy)) return i;
      }
      return -1;
    }

    function moveObject(obj, dx, dy) {
      if (obj.kind === "perspectiveGuide") {
        if (obj.vp1) { obj.vp1.x += dx; obj.vp1.y += dy; }
        if (obj.vp2) { obj.vp2.x += dx; obj.vp2.y += dy; }
        return;
      }

      if (obj.kind === "polyFill") {
        (obj.pts || []).forEach(p => {
          p.x += dx;
          p.y += dy;
        });
        return;
      }

      if (obj.kind === "text") {
        obj.x += dx;
        obj.y += dy;
        return;
      }

      if (obj.kind === "arc") {
        obj.cx += dx;
        obj.cy += dy;
        return;
      }

      if (obj.kind === "stroke" || obj.kind === "erase" || obj.kind === "curve") {
        (obj.points || obj.pts || []).forEach(p => {
          p.x += dx;
          p.y += dy;
        });
        return;
      }

      obj.x1 += dx;
      obj.y1 += dy;
      obj.x2 += dx;
      obj.y2 += dy;
    }

    function rotateObject(obj, angle) {
      const b = objectBounds(obj);
      const cx = (b.minX + b.maxX) / 2;
      const cy = (b.minY + b.maxY) / 2;

      if (obj.kind === "perspectiveGuide") {
        for (const p of perspectivePoints(obj)) {
          const r = rotatePoint(p.x, p.y, cx, cy, angle);
          p.x = r.x; p.y = r.y;
        }
        return;
      }

      if (obj.kind === "polyFill") {
        (obj.pts || []).forEach(p => {
          const r = rotatePoint(p.x, p.y, cx, cy, angle);
          p.x = r.x;
          p.y = r.y;
        });
        return;
      }

      if (obj.kind === "text" || obj.kind === "rect" || obj.kind === "circle") {
        obj.rot = (obj.rot || 0) + angle;
        return;
      }

      if (obj.kind === "arc") {
        obj.a1 = (obj.a1 || 0) + angle;
        obj.a2 = (obj.a2 || 0) + angle;
        return;
      }

      if (obj.kind === "stroke" || obj.kind === "erase" || obj.kind === "curve") {
        (obj.points || obj.pts || []).forEach(p => {
          const r = rotatePoint(p.x, p.y, cx, cy, angle);
          p.x = r.x;
          p.y = r.y;
        });
        return;
      }

      const p1 = rotatePoint(obj.x1, obj.y1, cx, cy, angle);
      const p2 = rotatePoint(obj.x2, obj.y2, cx, cy, angle);
      obj.x1 = p1.x;
      obj.y1 = p1.y;
      obj.x2 = p2.x;
      obj.y2 = p2.y;
    }

    function scaleObjectXY(obj, fx, fy, ax, ay) {
      fx = clamp(isFinite(fx) ? fx : 1, -20, 20);
      fy = clamp(isFinite(fy) ? fy : 1, -20, 20);

      if (obj.kind === "perspectiveGuide") {
        for (const p of perspectivePoints(obj)) {
          p.x = ax + (p.x - ax) * fx;
          p.y = ay + (p.y - ay) * fy;
        }
        return;
      }

      if (obj.kind === "polyFill") {
        (obj.pts || []).forEach(p => {
          p.x = ax + (p.x - ax) * fx;
          p.y = ay + (p.y - ay) * fy;
        });
        return;
      }

      if (obj.kind === "text") {
        obj.x = ax + (obj.x - ax) * fx;
        obj.y = ay + (obj.y - ay) * fy;
        const uni = Math.max(0.2, (Math.abs(fx) + Math.abs(fy)) / 2);
        obj.fontSize = Math.max(6, obj.fontSize * uni);
        return;
      }

      if (obj.kind === "stroke" || obj.kind === "erase" || obj.kind === "curve") {
        (obj.points || obj.pts || []).forEach(p => {
          p.x = ax + (p.x - ax) * fx;
          p.y = ay + (p.y - ay) * fy;
        });
        return;
      }

      if (obj.kind === "arc") {
        const uni = (Math.abs(fx) + Math.abs(fy)) / 2;
        obj.cx = ax + (obj.cx - ax) * fx;
        obj.cy = ay + (obj.cy - ay) * fy;
        obj.r = Math.max(0.5, (obj.r || 0) * uni);
        return;
      }

      obj.x1 = ax + (obj.x1 - ax) * fx;
      obj.y1 = ay + (obj.y1 - ay) * fy;
      obj.x2 = ax + (obj.x2 - ax) * fx;
      obj.y2 = ay + (obj.y2 - ay) * fy;
    }

    function snapToMmGridWorld(pt) {
      const step = mmStepWorld();
      return {
        x: Math.round(pt.x / step) * step,
        y: Math.round(pt.y / step) * step
      };
    }

    function snapToWholeMmLength(start, rawPt) {
      const dx = rawPt.x - start.x;
      const dy = rawPt.y - start.y;
      const lenPx = Math.hypot(dx, dy);
      if (!isFinite(lenPx) || lenPx < 1e-6) return { x: rawPt.x, y: rawPt.y };

      const mm = lenPx / pxPerMm();
      const mmInt = Math.max(1, Math.round(mm));
      const newLenPx = mmInt * pxPerMm();

      const ux = dx / lenPx;
      const uy = dy / lenPx;
      return {
        x: start.x + ux * newLenPx,
        y: start.y + uy * newLenPx
      };
    }

    function snapAngleRad(angleRad) {
      const snapsDeg = [0, 30, 45, 60, 90, 120, 135, 150, -30, -45, -60, -90, -120, -135, -150, 180];
      const snaps = snapsDeg.map(d => (d * Math.PI) / 180);
      const a = Math.atan2(Math.sin(angleRad), Math.cos(angleRad));

      let best = snaps[0];
      let bestDiff = Infinity;

      for (const s of snaps) {
        const diff = Math.abs(Math.atan2(Math.sin(a - s), Math.cos(a - s)));
        if (diff < bestDiff) {
          bestDiff = diff;
          best = s;
        }
      }

      return best;
    }

    function snapEndpointToAngles(x1, y1, x2, y2) {
      const dx = x2 - x1;
      const dy = y2 - y1;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) return { x2, y2 };

      const ang = Math.atan2(dy, dx);
      const snapped = snapAngleRad(ang);

      return {
        x2: x1 + Math.cos(snapped) * len,
        y2: y1 + Math.sin(snapped) * len
      };
    }

    function quantKey(p) {
      return `${Math.round(p.x * 10)}:${Math.round(p.y * 10)}`;
    }

    function projectPointToSegment(pt, seg) {
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

    function clonePlainRef(ref) {
      return ref ? JSON.parse(JSON.stringify(ref)) : null;
    }

    function linkableSegmentPointRef(segRef, t) {
      if (!segRef) return null;
      return { type: "segmentPoint", segment: clonePlainRef(segRef), t: clamp(t || 0, 0, 1) };
    }

    function linkableIntersectionRef(aRef, bRef) {
      if (!aRef || !bRef) return null;
      return { type: "intersection", a: clonePlainRef(aRef), b: clonePlainRef(bRef) };
    }

    function snapToNearestOnSegments(pt, segments, radiusWorld) {
      let best = null;
      let bestD = radiusWorld;

      for (const seg of segments) {
        const hit = projectPointToSegment(pt, seg);
        if (!hit) continue;
        const d = Math.hypot(pt.x - hit.x, pt.y - hit.y);
        if (d <= bestD) {
          bestD = d;
          best = { ...hit, ref: linkableSegmentPointRef(seg.ref, hit.t) };
        }
      }

      return best ? { x: best.x, y: best.y, ref: best.ref || null } : null;
    }

    function buildSnapCache(skipObjId) {
      const endpoints = [];
      const segments = [];
      const endpointSeen = new Set();
      const intersectionSeen = new Set();
      const maxSegments = 420;

      function pushEndpoint(p) {
        if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) return;
        const key = quantKey(p);
        if (endpointSeen.has(key)) return;
        endpointSeen.add(key);
        endpoints.push({ x: p.x, y: p.y, ref: p.ref || null });
      }

      function pushSegment(seg) {
        if (!seg) return;
        if (![seg.x1, seg.y1, seg.x2, seg.y2].every(Number.isFinite)) return;
        if (Math.hypot(seg.x2 - seg.x1, seg.y2 - seg.y1) <= 0.001) return;
        if (segments.length >= maxSegments) return;
        segments.push({ x1: seg.x1, y1: seg.y1, x2: seg.x2, y2: seg.y2, ref: seg.ref || null });
      }

      function addPolyline(pts, closed = false, maxLocalSegments = 72) {
        if (!pts || pts.length < 2) return;

        if (pts.length <= maxLocalSegments + 1) {
          for (const p of pts) pushEndpoint(p);
          for (let i = 1; i < pts.length; i++) {
            pushSegment({ x1: pts[i - 1].x, y1: pts[i - 1].y, x2: pts[i].x, y2: pts[i].y, ref: pts[i - 1].segRef || null });
          }
          if (closed) {
            pushSegment({ x1: pts[pts.length - 1].x, y1: pts[pts.length - 1].y, x2: pts[0].x, y2: pts[0].y, ref: pts[pts.length - 1].segRef || null });
          }
          return;
        }

        const stride = Math.max(1, Math.ceil((pts.length - 1) / maxLocalSegments));
        const sampled = [pts[0]];
        for (let i = stride; i < pts.length - 1; i += stride) sampled.push(pts[i]);
        sampled.push(pts[pts.length - 1]);
        addPolyline(sampled, closed, maxLocalSegments);
      }

      function addCircleLike(obj) {
        const cx = (obj.x1 + obj.x2) / 2;
        const cy = (obj.y1 + obj.y2) / 2;
        const rx = Math.abs(obj.x2 - obj.x1) / 2;
        const ry = Math.abs(obj.y2 - obj.y1) / 2;
        if (rx <= 0.001 || ry <= 0.001) return;

        const ang = obj.rot || 0;
        const quarterPts = [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].map(t => {
          const ex = Math.cos(t) * rx;
          const ey = Math.sin(t) * ry;
          return {
            x: cx + ex * Math.cos(ang) - ey * Math.sin(ang),
            y: cy + ex * Math.sin(ang) + ey * Math.cos(ang)
          };
        });
        quarterPts.forEach((p, index) => pushEndpoint({ ...p, ref: obj._id ? { type: "anchor", objId: obj._id, kind: "circleQuarter", index } : null }));

        const approxPerimeter = Math.PI * (3 * (rx + ry) - Math.sqrt(Math.max(0, (3 * rx + ry) * (rx + 3 * ry))));
        const steps = Math.max(16, Math.min(72, Math.ceil(approxPerimeter / Math.max(10, pxPerMm() * 2))));
        const pts = [];
        for (let i = 0; i < steps; i++) {
          const t = (i / steps) * Math.PI * 2;
          const ex = Math.cos(t) * rx;
          const ey = Math.sin(t) * ry;
          pts.push({
            x: cx + ex * Math.cos(ang) - ey * Math.sin(ang),
            y: cy + ex * Math.sin(ang) + ey * Math.cos(ang)
          });
        }
        addPolyline(pts, true, 72);
      }

      for (const obj of state.objects) {
        if (!obj || obj.hidden) continue;
        if (skipObjId && obj._id === skipObjId) continue;

        if (obj.kind === "perspectiveGuide") {
          const vps = perspectivePoints(obj);
          const target = ctx.findObjById ? ctx.findObjById(obj.targetId) : null;

          if (obj.vp1) pushEndpoint({ ...obj.vp1, ref: { type: "perspectivePoint", guideId: obj._id, name: "vp1" } });
          if ((obj.mode || 1) >= 2 && obj.vp2) pushEndpoint({ ...obj.vp2, ref: { type: "perspectivePoint", guideId: obj._id, name: "vp2" } });
          for (const vp of vps) {
            const vpName = vp === obj.vp2 ? "vp2" : "vp1";
            const srcPts = perspectiveTargetPoints(target, vp, obj);
            srcPts.forEach((p, sourceIndex) => {
              pushSegment({
                x1: p.x,
                y1: p.y,
                x2: vp.x,
                y2: vp.y,
                ref: { type: "perspectiveRay", guideId: obj._id, vpName, sourceIndex }
              });
            });
          }
          continue;
        }

        if (obj.kind === "polyFill") {
          addPolyline((obj.pts || []).map((pt, index) => ({
            ...pt,
            ref: obj._id ? { type: "anchor", objId: obj._id, kind: "polyVertex", index } : null,
            segRef: obj._id ? { type: "segment", objId: obj._id, kind: "polyEdge", index } : null
          })), true, 96);
          continue;
        }

        if (obj.kind === "line" || obj.kind === "arrow") {
          pushEndpoint({ x: obj.x1, y: obj.y1, ref: obj._id ? { type: "anchor", objId: obj._id, kind: "lineEnd", index: 0 } : null });
          pushEndpoint({ x: obj.x2, y: obj.y2, ref: obj._id ? { type: "anchor", objId: obj._id, kind: "lineEnd", index: 1 } : null });
          pushSegment({ x1: obj.x1, y1: obj.y1, x2: obj.x2, y2: obj.y2, ref: obj._id ? { type: "segment", objId: obj._id, kind: "line" } : null });
          continue;
        }

        if (obj.kind === "arc") {
          const s = pointOnArc(obj, "start");
          const e = pointOnArc(obj, "end");
          pushEndpoint({ ...s, ref: obj._id ? { type: "anchor", objId: obj._id, kind: "arcEnd", index: 0 } : null });
          pushEndpoint({ ...e, ref: obj._id ? { type: "anchor", objId: obj._id, kind: "arcEnd", index: 1 } : null });

          const d = arcSpanSigned(obj);
          const steps = Math.max(8, Math.min(72, Math.ceil(72 * (Math.abs(d) / (Math.PI * 2)))));
          const pts = [];
          for (let i = 0; i <= steps; i++) {
            const t = obj.a1 + d * (i / steps);
            pts.push({ x: obj.cx + Math.cos(t) * obj.r, y: obj.cy + Math.sin(t) * obj.r });
          }
          addPolyline(pts, false, 72);
          continue;
        }

        if (obj.kind === "rect") {
          const edges = rectEdges(obj);
          const corners = edges.map(e => ({ x: e.x1, y: e.y1 }));
          corners.forEach((p, index) => pushEndpoint({ ...p, ref: obj._id ? { type: "anchor", objId: obj._id, kind: "rectCorner", index } : null }));
          edges.forEach((e, index) => pushSegment({ ...e, ref: obj._id ? { type: "segment", objId: obj._id, kind: "rectEdge", index } : null }));
          continue;
        }

        if (obj.kind === "circle") {
          addCircleLike(obj);
          continue;
        }

        if (obj.kind === "stroke" || obj.kind === "erase") {
          const pts = obj.points || [];
          if (pts.length) {
            pushEndpoint({ ...pts[0], ref: obj._id ? { type: "anchor", objId: obj._id, kind: "strokeEnd", index: 0 } : null });
            pushEndpoint({ ...pts[pts.length - 1], ref: obj._id ? { type: "anchor", objId: obj._id, kind: "strokeEnd", index: 1 } : null });
          }
          addPolyline(pts, false, 80);
          continue;
        }

        if (obj.kind === "text") {
          const m = textMetrics(obj);
          const cx = obj.x + m.w / 2;
          const cy = obj.y + m.h / 2;
          const ang = obj.rot || 0;

          const corners = [
            { x: obj.x,       y: obj.y },
            { x: obj.x + m.w, y: obj.y },
            { x: obj.x + m.w, y: obj.y + m.h },
            { x: obj.x,       y: obj.y + m.h }
          ].map(p => (ang ? rotateAround(p.x, p.y, cx, cy, ang) : p));

          corners.forEach((p, index) => pushEndpoint({ ...p, ref: obj._id ? { type: "anchor", objId: obj._id, kind: "textCorner", index } : null }));
          addPolyline(corners.map((pt, index) => ({ ...pt, segRef: obj._id ? { type: "segment", objId: obj._id, kind: "textEdge", index } : null })), true, 8);
          continue;
        }
      }

      const intersections = [];
      let pairs = 0;
      const maxPairs = 18000;

      for (let i = 0; i < segments.length; i++) {
        for (let j = i + 1; j < segments.length; j++) {
          if (++pairs > maxPairs) break;
          const a = segments[i];
          const b = segments[j];
          if (a.ref && b.ref && a.ref.objId && b.ref.objId && a.ref.objId === b.ref.objId) continue;
          const p = segIntersection(a, b);
          if (!p) continue;
          const key = quantKey(p);
          if (intersectionSeen.has(key)) continue;
          intersectionSeen.add(key);
          intersections.push({ ...p, ref: linkableIntersectionRef(a.ref, b.ref) });
        }
        if (pairs > maxPairs) break;
      }

      return { endpoints, intersections, segments };
    }

    function snapToNearest(pt, candidates, radiusWorld) {
      let best = null;
      let bestD = radiusWorld;

      for (const c of candidates) {
        const d = Math.hypot(pt.x - c.x, pt.y - c.y);
        if (d <= bestD) {
          bestD = d;
          best = c;
        }
      }

      return best ? { x: best.x, y: best.y, ref: best.ref || null } : null;
    }

    function snapPointPreferEndsIntersections(pt) {
      const radiusWorld = SNAP_RADIUS_PX / (state.zoom || 1);
      const cache = gesture.snapCache || { endpoints: [], intersections: [], segments: [] };

      const hitIntersection = snapToNearest(pt, cache.intersections, radiusWorld);
      if (hitIntersection) return hitIntersection;

      const hitEndpoint = snapToNearest(pt, cache.endpoints, radiusWorld);
      if (hitEndpoint) return hitEndpoint;

      return snapToNearestOnSegments(pt, cache.segments || [], radiusWorld);
    }

    function snapShapePoint(start, rawPt, bypassSnap) {
      if (bypassSnap) return { x: rawPt.x, y: rawPt.y };

      const hit = snapPointPreferEndsIntersections(rawPt);
      if (hit) return hit;

      const s = snapEndpointToAngles(start.x, start.y, rawPt.x, rawPt.y);
      return snapToMmGridWorld({ x: s.x2, y: s.y2 });
    }

    function perspectiveDirectionSnap(start, rawPt) {
      const radiusWorld = SNAP_RADIUS_PX / (state.zoom || 1);
      const rvx = rawPt.x - start.x;
      const rvy = rawPt.y - start.y;
      const rawLen = Math.hypot(rvx, rvy);
      if (!Number.isFinite(rawLen) || rawLen < 0.001) return null;

      const maxAngle = (9 * Math.PI) / 180;
      let best = null;
      let bestScore = Infinity;

      for (const obj of state.objects) {
        if (!obj || obj.hidden || obj.kind !== "perspectiveGuide") continue;

        for (const vp of perspectivePoints(obj)) {
          if (!vp) continue;
          const vx = vp.x - start.x;
          const vy = vp.y - start.y;
          const vLen = Math.hypot(vx, vy);
          if (!Number.isFinite(vLen) || vLen < 0.001) continue;

          const dot = rvx * vx + rvy * vy;
          const direction = dot < 0 ? -1 : 1;
          const absDot = Math.abs(dot);
          if (absDot <= 0) continue;

          const cross = rvx * vy - rvy * vx;
          const distToLine = Math.abs(cross) / vLen;
          const cosA = clamp(absDot / (rawLen * vLen), -1, 1);
          const angleDiff = Math.acos(cosA);

          if (distToLine > radiusWorld * 1.5 && angleDiff > maxAngle) continue;

          const t = absDot / (vLen * vLen);
          const projected = { x: start.x + vx * t * direction, y: start.y + vy * t * direction };
          const rounded = snapToWholeMmLength(start, projected);
          const score = distToLine + angleDiff * radiusWorld * 2;
          if (score < bestScore) {
            bestScore = score;
            best = { x: rounded.x, y: rounded.y, vp, direction, perspectiveRef: { guideId: obj._id, vpName: vp === obj.vp2 ? "vp2" : "vp1" } };
          }
        }
      }

      return best;
    }

    function snapLinePoint(start, rawPt, bypassSnap) {
      if (bypassSnap) return { x: rawPt.x, y: rawPt.y };

      const radiusWorld = SNAP_RADIUS_PX / (state.zoom || 1);
      const cache = gesture.snapCache || { endpoints: [], intersections: [], segments: [] };

      const hitPerspectiveEndpoint = snapToNearest(
        rawPt,
        (cache.endpoints || []).filter(c => c.ref && c.ref.type === "perspectivePoint"),
        radiusWorld
      );
      if (hitPerspectiveEndpoint) {
        return {
          x: hitPerspectiveEndpoint.x,
          y: hitPerspectiveEndpoint.y,
          ref: hitPerspectiveEndpoint.ref,
          perspectiveRef: { guideId: hitPerspectiveEndpoint.ref.guideId, vpName: hitPerspectiveEndpoint.ref.name },
          perspectiveEndMode: "point"
        };
      }

      const hitIntersection = snapToNearest(rawPt, cache.intersections, radiusWorld);
      if (hitIntersection) return hitIntersection;

      const hitEndpoint = snapToNearest(rawPt, cache.endpoints, radiusWorld);
      if (hitEndpoint) return hitEndpoint;

      const perspectiveHit = perspectiveDirectionSnap(start, rawPt);
      if (perspectiveHit) {
        return { x: perspectiveHit.x, y: perspectiveHit.y, perspectiveRef: perspectiveHit.perspectiveRef, perspectiveEndMode: "length", perspectiveDirection: perspectiveHit.direction || 1 };
      }

      const hitSegment = snapToNearestOnSegments(rawPt, cache.segments || [], radiusWorld);
      if (hitSegment) return hitSegment;

      const s = snapEndpointToAngles(start.x, start.y, rawPt.x, rawPt.y);
      return snapToWholeMmLength(start, { x: s.x2, y: s.y2 });
    }

     function snapPolyPointDetailed(rawPt, bypassSnap) {
  if (bypassSnap) {
    return { x: rawPt.x, y: rawPt.y, snapKind: "free", ref: null };
  }

  const hit = snapPointPreferEndsIntersections(rawPt);
  if (hit) {
    return { x: hit.x, y: hit.y, snapKind: "node", ref: hit.ref || null };
  }

  const radiusWorld = SNAP_RADIUS_PX / (state.zoom || 1);
  const cache = gesture.snapCache || { segments: [] };

  let best = null;
  let bestD = radiusWorld;

  for (const seg of cache.segments || []) {
    const p = nearestPointOnSegment(rawPt, seg);
    const d = Math.hypot(rawPt.x - p.x, rawPt.y - p.y);
    if (d <= bestD) {
      bestD = d;
      best = {
        x: p.x,
        y: p.y,
        snapKind: "segment",
        ref: seg.ref || null
      };
    }
  }

  if (best) return best;

  const g = snapToMmGridWorld(rawPt);
  return { x: g.x, y: g.y, snapKind: "grid", ref: null };
}
     function nearestPointOnSegment(pt, seg) {
  const dx = seg.x2 - seg.x1;
  const dy = seg.y2 - seg.y1;
  const len2 = dx * dx + dy * dy;

  if (!len2) return { x: seg.x1, y: seg.y1 };

  let t = ((pt.x - seg.x1) * dx + (pt.y - seg.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));

  return {
    x: seg.x1 + dx * t,
    y: seg.y1 + dy * t,
    t
  };
}
     
function snapPolyPoint(rawPt, bypassSnap) {
  if (bypassSnap) {
    return { x: rawPt.x, y: rawPt.y, snapKind: "free", ref: null };
  }

  const hit = snapPointPreferEndsIntersections(rawPt);
  if (hit) {
    return {
      x: hit.x,
      y: hit.y,
      snapKind: "node",
      ref: hit.ref || null
    };
  }

  return {
    x: snapToMmGridWorld(rawPt).x,
    y: snapToMmGridWorld(rawPt).y,
    snapKind: "grid",
    ref: null
  };
}

    function backgroundBounds() {
      if (!state.bg.src || !state.bg.natW || !state.bg.natH) return null;

      const natW = state.bg.natW;
      const natH = state.bg.natH;
      const cx = natW / 2;
      const cy = natH / 2;
      const sc = state.bg.scale || 1;
      const ang = state.bg.rot || 0;

      const cos = Math.cos(ang);
      const sin = Math.sin(ang);

      const pts = [
        { x: 0,    y: 0 },
        { x: natW, y: 0 },
        { x: natW, y: natH },
        { x: 0,    y: natH }
      ].map(p => {
        const dx = (p.x - cx) * sc;
        const dy = (p.y - cy) * sc;
        return {
          x: state.bg.x + cx + dx * cos - dy * sin,
          y: state.bg.y + cy + dx * sin + dy * cos
        };
      });

      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of pts) {
        minX = Math.min(minX, p.x);
        minY = Math.min(minY, p.y);
        maxX = Math.max(maxX, p.x);
        maxY = Math.max(maxY, p.y);
      }

      return { minX, minY, maxX, maxY };
    }

    function exportWorldBounds() {
      let bounds = null;

      const bgB = backgroundBounds();
      if (bgB) {
        bounds = {
          minX: bgB.minX,
          minY: bgB.minY,
          maxX: bgB.maxX,
          maxY: bgB.maxY
        };
      }

      for (const obj of state.objects) {
        if (!obj || obj.hidden) continue;
        const b = objectBounds(obj);
        if (!b) continue;
        if (![b.minX, b.minY, b.maxX, b.maxY].every(Number.isFinite)) continue;

        if (!bounds) {
          bounds = { ...b };
        } else {
          bounds.minX = Math.min(bounds.minX, b.minX);
          bounds.minY = Math.min(bounds.minY, b.minY);
          bounds.maxX = Math.max(bounds.maxX, b.maxX);
          bounds.maxY = Math.max(bounds.maxY, b.maxY);
        }
      }

      if (!bounds) return null;

      // Give export/print a small safe margin so thick strokes, dashed
      // construction lines, and round line caps are not clipped at the edge.
      const pad = 80;
      const minX = Math.floor(bounds.minX - pad);
      const minY = Math.floor(bounds.minY - pad);
      const maxX = Math.ceil(bounds.maxX + pad);
      const maxY = Math.ceil(bounds.maxY + pad);

      return {
        minX,
        minY,
        maxX,
        maxY,
        w: Math.max(1, maxX - minX),
        h: Math.max(1, maxY - minY)
      };
    }

    return {
      pointOnArc,
      rectEdges,
      perspectiveTargetPoints,
      objectBounds,
      hitObject,
      findHit,
      moveObject,
      rotateObject,
      scaleObjectXY,
      snapToMmGridWorld,
      snapToWholeMmLength,
      snapAngleRad,
      snapEndpointToAngles,
      perspectiveDirectionSnap,
      buildSnapCache,
      snapToNearest,
      snapPointPreferEndsIntersections,
      snapShapePoint,
      snapLinePoint,
      snapPolyPoint,
      backgroundBounds,
      exportWorldBounds
    };
  }

  return { createGeometryApi };
})();
