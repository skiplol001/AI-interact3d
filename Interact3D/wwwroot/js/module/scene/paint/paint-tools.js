// ═══════════════════════════════════════════════════════════════
// paint-tools.js — v14 (Multi-Agent Level 4 - Render SVG Artist)
// ═══════════════════════════════════════════════════════════════
import {
    drawShape, drawQuadBezier, applySymmetryToStroke, renderLayers, StrokeStamper,
} from './paint-engine.js?v=10';

const MIN_SEG_DIST = 0.5;
const HISTORY_BUDGET_PX = 20_000_000;

export const toolsMixin = {
    _getActiveLayer() {
        return this.layers.find(l => l.id === this.activeLayerId) || null;
    },

    _snapshotLayer(layer) {
        const c = document.createElement('canvas');
        c.width = this.CANVAS_W;
        c.height = this.CANVAS_H;
        c.getContext('2d').drawImage(layer.canvas, 0, 0);
        return c;
    },

    _snapshotForErase(layer) {
        let c = this._eraseSnapCache;
        if (!c || c.width !== this.CANVAS_W || c.height !== this.CANVAS_H) {
            c = this._eraseSnapCache = document.createElement('canvas');
            c.width = this.CANVAS_W;
            c.height = this.CANVAS_H;
        }
        const g = c.getContext('2d');
        g.clearRect(0, 0, c.width, c.height);
        g.drawImage(layer.canvas, 0, 0);
        return c;
    },

    _cropCanvas(src, x, y, w, h) {
        const c = document.createElement('canvas');
        c.width = Math.max(1, w);
        c.height = Math.max(1, h);
        c.getContext('2d').drawImage(src, x, y, w, h, 0, 0, w, h);
        return c;
    },

    _clampRect(r) {
        if (!r) return null;
        const x0 = Math.max(0, Math.floor(r.x));
        const y0 = Math.max(0, Math.floor(r.y));
        const x1 = Math.min(this.CANVAS_W, Math.ceil(r.x + r.w));
        const y1 = Math.min(this.CANVAS_H, Math.ceil(r.y + r.h));
        if (x1 <= x0 || y1 <= y0) return null;
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },

    _unionRect(a, b) {
        if (!a) return b || null;
        if (!b) return a;
        const x0 = Math.min(a.x, b.x), y0 = Math.min(a.y, b.y);
        const x1 = Math.max(a.x + a.w, b.x + b.w), y1 = Math.max(a.y + a.h, b.y + b.h);
        return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
    },

    _pushPatch(layer, rect, before, after) {
        this._pushHistory({
            type: 'patch', layerId: layer.id,
            x: rect.x, y: rect.y, w: rect.w, h: rect.h,
            before, after,
        });
        this._trimHistory();
        this._touch(layer);
        this._dirty = true;
        this._setStatus(`${this._history.length} thao tác`);
    },

    _trimHistory() {
        let total = 0;
        for (const a of this._history) if (a.type === 'patch') total += a.w * a.h;
        while (total > HISTORY_BUDGET_PX && this._history.length > 1) {
            const a = this._history.shift();
            if (a.type === 'patch') total -= a.w * a.h;
        }
    },

    _symTransforms() {
        const W = this.CANVAS_W, H = this.CANVAS_H;
        const id = (p) => p;
        const mx = (p) => ({ ...p, x: W - p.x });
        const my = (p) => ({ ...p, y: H - p.y });
        const mxy = (p) => ({ ...p, x: W - p.x, y: H - p.y });
        switch (this.symmetry) {
            case 'h': return [id, mx];
            case 'v': return [id, my];
            case 'both': return [id, mx, my, mxy];
            default: return [id];
        }
    },

    _renderCompositeRegion(x, y, w, h) {
        x = Math.max(0, Math.floor(x));
        y = Math.max(0, Math.floor(y));
        w = Math.min(this.CANVAS_W - x, Math.ceil(w));
        h = Math.min(this.CANVAS_H - y, Math.ceil(h));
        if (w <= 0 || h <= 0) return;
        this.ctx.clearRect(x, y, w, h);
        for (const layer of this.layers) {
            if (!layer.visible) continue;
            this.ctx.save();
            this.ctx.globalAlpha = layer.opacity;
            this.ctx.globalCompositeOperation = layer.blendMode;
            this.ctx.drawImage(layer.canvas, x, y, w, h, x, y, w, h);
            this.ctx.restore();
        }
    },

    _makeStampers(stroke, ctx) {
        return this._symTransforms().map(tf => ({
            tf,
            stamper: new StrokeStamper(ctx, {
                color: stroke.color, size: stroke.size, brush: stroke.brush,
                erase: stroke.type === 'eraser',
            }),
        }));
    },

    _stampersBBox() {
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const s of this._stampers) {
            const b = s.stamper.getBBox();
            if (!b) continue;
            if (b.x0 < x0) x0 = b.x0;
            if (b.y0 < y0) y0 = b.y0;
            if (b.x1 > x1) x1 = b.x1;
            if (b.y1 > y1) y1 = b.y1;
        }
        return x0 === Infinity ? null : { x0, y0, x1, y1 };
    },

    _flushStampers() {
        const list = this._stampers;
        if (!list || !list.length) return;
        let any = false;
        for (const s of list) { if (s.stamper.dirty) { any = true; break; } }
        if (!any) return;

        const bb = this._stampersBBox();
        const ctx = this.overlayCtx;
        if (bb) {
            const x = Math.max(0, Math.floor(bb.x0));
            const y = Math.max(0, Math.floor(bb.y0));
            ctx.clearRect(x, y, Math.ceil(bb.x1) - x + 1, Math.ceil(bb.y1) - y + 1);
        }
        for (const s of list) s.stamper.drawAll();
    },

    _beginStroke(pt, e) {
        const layer = this._getActiveLayer();
        if (!layer) return;
        const isEraser = this.tool === 'eraser';
        const baseSize = this._getEffectiveSize();
        const pen = e && e.pointerType === 'pen' && this.penPressure && e.pressure > 0;
        const w0 = pen ? this._pressureWidth(e.pressure, baseSize) : baseSize;

        this._lastRawPoint = { x: pt.x, y: pt.y };
        this._lastRawCanvasPt = { x: pt.x, y: pt.y };
        this._stabilizedPoint = { x: pt.x, y: pt.y };
        this._lastPointTime = performance.now();
        this._lastPointerPos = { x: pt.x, y: pt.y, width: w0 };
        this._dirtyBBox = null;

        this._currentStroke = {
            type: isEraser ? 'eraser' : 'brush',
            brush: isEraser ? 'round' : this.brush,
            color: isEraser ? '#000000' : this.color,
            size: baseSize,
            opacity: isEraser ? 1 : this.opacity,
            points: [{ x: pt.x, y: pt.y, width: w0 }],
        };
        this._isDrawing = true;

        if (isEraser) {
            this._eraseSnap = this._snapshotForErase(layer);
        } else {
            this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            this.overlayCanvas.style.opacity = String(this.opacity);
        }

        const ctx = isEraser ? layer.ctx : this.overlayCtx;
        this._stampers = this._makeStampers(this._currentStroke, ctx);
        for (const s of this._stampers) s.stamper.begin(s.tf({ x: pt.x, y: pt.y, w: w0 }));
        this._flushStampers();

        if (isEraser) {
            const r = w0 / 2 + 4;
            this._dirtyBBox = { x0: pt.x - r, y0: pt.y - r, x1: pt.x + r, y1: pt.y + r };
        }
    },

    _appendStrokePoint(raw, ev) {
        if (!this._currentStroke) return false;
        const baseSize = this._getEffectiveSize();
        const stab = this._stabilize(raw);
        const prev = this._lastPointerPos;
        if (!prev) return false;

        const useVel = this.drawMode === 'taper' && this.tool === 'brush';
        let velocity = 0;
        if (useVel && ev) {
            const now = performance.now();
            const dt = Math.max(1, now - this._lastPointTime);
            const rd = Math.hypot(raw.x - this._lastRawPoint.x, raw.y - this._lastRawPoint.y);
            velocity = (rd / dt) * 16;
            this._lastPointTime = now;
            this._lastRawPoint = { x: raw.x, y: raw.y };
        }

        if (Math.hypot(stab.x - prev.x, stab.y - prev.y) < MIN_SEG_DIST) return false;

        const pen = ev && ev.pointerType === 'pen' && this.penPressure && ev.pressure > 0;
        let w = baseSize;
        if (pen || useVel) {
            const target = pen ? this._pressureWidth(ev.pressure, baseSize) : this._computeWidth(velocity, baseSize);
            w = prev.width + (target - prev.width) * 0.45;
        }

        const pt = { x: stab.x, y: stab.y, width: w };
        this._currentStroke.points.push(pt);
        this._lastPointerPos = pt;
        for (const s of this._stampers) s.stamper.add(s.tf({ x: pt.x, y: pt.y, w }));

        if (this._currentStroke.type === 'eraser') {
            const r = w / 2 + 4;
            const b = this._dirtyBBox;
            if (!b) {
                this._dirtyBBox = { x0: pt.x - r, y0: pt.y - r, x1: pt.x + r, y1: pt.y + r };
            } else {
                if (pt.x - r < b.x0) b.x0 = pt.x - r;
                if (pt.y - r < b.y0) b.y0 = pt.y - r;
                if (pt.x + r > b.x1) b.x1 = pt.x + r;
                if (pt.y + r > b.y1) b.y1 = pt.y + r;
            }
        }
        return true;
    },

    _finishStroke() {
        if (!this._isDrawing) return;
        this._isDrawing = false;
        this._pendingPointerQueue = [];

        const layer = this._getActiveLayer();
        const stroke = this._currentStroke;
        if (!stroke || !layer || !this._stampers.length) {
            this._cancelCurrentStroke();
            return;
        }
        const isEraser = stroke.type === 'eraser';

        if (this._lastRawCanvasPt && this.stabilizer > 0) {
            for (let i = 0; i < 24; i++) {
                const sp = this._stabilizedPoint;
                if (!sp) break;
                if (Math.hypot(this._lastRawCanvasPt.x - sp.x, this._lastRawCanvasPt.y - sp.y) < 0.6) break;
                this._appendStrokePoint(this._lastRawCanvasPt, null);
            }
        }

        if (!isEraser && this.drawMode === 'taper' && stroke.points.length >= 4) {
            this._applyTaper(stroke);
            this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            this._stampers = this._makeStampers(stroke, this.overlayCtx);
            const pts = stroke.points;
            for (const s of this._stampers) {
                s.stamper.begin(s.tf({ x: pts[0].x, y: pts[0].y, w: pts[0].width }));
                for (let i = 1; i < pts.length; i++) {
                    s.stamper.add(s.tf({ x: pts[i].x, y: pts[i].y, w: pts[i].width }));
                }
            }
        }

        for (const s of this._stampers) s.stamper.end();
        this._flushStampers();

        const bb = this._stampersBBox();
        const rect = bb ? this._clampRect({
            x: bb.x0 - 2, y: bb.y0 - 2, w: bb.x1 - bb.x0 + 4, h: bb.y1 - bb.y0 + 4,
        }) : null;

        if (rect) {
            if (isEraser) {
                const before = this._cropCanvas(this._eraseSnap, rect.x, rect.y, rect.w, rect.h);
                const after = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
                this._pushPatch(layer, rect, before, after);
            } else {
                const before = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
                const lc = layer.ctx;
                lc.save();
                lc.globalAlpha = stroke.opacity;
                lc.globalCompositeOperation = 'source-over';
                lc.drawImage(this.overlayCanvas, rect.x, rect.y, rect.w, rect.h, rect.x, rect.y, rect.w, rect.h);
                lc.restore();
                const after = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
                this._pushPatch(layer, rect, before, after);
            }
            this._renderCompositeRegion(rect.x, rect.y, rect.w, rect.h);
        }

        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        this.overlayCanvas.style.opacity = '1';
        this._eraseSnap = null;
        this._stampers = [];
        this._currentStroke = null;
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._lastRawCanvasPt = null;
        this._stabilizedPoint = null;
        this._dirtyBBox = null;
    },

    _cancelCurrentStroke() {
        this._isDrawing = false;
        const layer = this._getActiveLayer();
        if (this._currentStroke && this._currentStroke.type === 'eraser' && this._eraseSnap && layer) {
            layer.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            layer.ctx.drawImage(this._eraseSnap, 0, 0);
            this._renderComposite();
        }
        this._eraseSnap = null;
        this._stampers = [];
        this._currentStroke = null;
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._lastRawCanvasPt = null;
        this._stabilizedPoint = null;
        this._pendingPointerQueue = [];
        this._shapeStart = null;
        this._dirtyBBox = null;
        if (this.overlayCanvas) this.overlayCanvas.style.opacity = '1';
        if (this.overlayCtx) this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
    },
    _isPointInSelection(pt) {
        const s = this._selection;
        if (!s) return false;
        const rot = this._floatRotation || 0;
        if (Math.abs(rot) < 0.001) {
            return pt.x >= s.x && pt.x <= s.x + s.w && pt.y >= s.y && pt.y <= s.y + s.h;
        }
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const dx = pt.x - cx;
        const dy = pt.y - cy;
        const cos = Math.cos(-rot), sin = Math.sin(-rot);
        const rx = cx + dx * cos - dy * sin;
        const ry = cy + dx * sin + dy * cos;
        return rx >= s.x && rx <= s.x + s.w && ry >= s.y && ry <= s.y + s.h;
    },

    _normalizeRect(x1, y1, x2, y2) {
        const x = Math.round(Math.min(x1, x2));
        const y = Math.round(Math.min(y1, y2));
        return {
            x, y,
            w: Math.round(Math.max(x1, x2)) - x,
            h: Math.round(Math.max(y1, y2)) - y,
        };
    },

    _rotatedBounds(s, rot, pad = 2) {
        const cx = s.x + s.w / 2, cy = s.y + s.h / 2;
        const cos = Math.cos(rot), sin = Math.sin(rot);
        const pts = [
            [s.x, s.y], [s.x + s.w, s.y], [s.x + s.w, s.y + s.h], [s.x, s.y + s.h],
        ].map(([px, py]) => {
            const dx = px - cx, dy = py - cy;
            return [cx + dx * cos - dy * sin, cy + dx * sin + dy * cos];
        });
        const xs = pts.map(p => p[0]), ys = pts.map(p => p[1]);
        const x0 = Math.min(...xs) - pad, y0 = Math.min(...ys) - pad;
        return { x: x0, y: y0, w: Math.max(...xs) + pad - x0, h: Math.max(...ys) + pad - y0 };
    },

    _extractSelectionPixels() {
        const s = this._selection;
        if (!s || s.w < 1 || s.h < 1) return null;
        const layer = this._getActiveLayer();
        if (!layer) return null;
        const rect = this._clampRect(s);
        if (!rect) return null;

        const px = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
        this._selSrcRect = rect;
        this._selSrcBefore = px;
        layer.ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
        this._selection = { x: rect.x, y: rect.y, w: rect.w, h: rect.h };
        this._renderComposite();
        return px;
    },

    _pixelsToCanvas(src) { return src || null; },

    _drawPixelsRotated(cv, x, y, rotation, ctx) {
        if (!cv) return;
        const rot = rotation || 0;
        if (Math.abs(rot) < 0.001) {
            ctx.drawImage(cv, Math.round(x), Math.round(y));
            return;
        }
        ctx.save();
        ctx.translate(x + cv.width / 2, y + cv.height / 2);
        ctx.rotate(rot);
        ctx.drawImage(cv, -cv.width / 2, -cv.height / 2);
        ctx.restore();
    },

    _drawSelectionMarquee(ctx) {
        const s = this._selection;
        if (!s) {
            this._rotateHandlePos = null;
            return;
        }
        const rot = this._floatRotation || 0;
        const cx = s.x + s.w / 2;
        const cy = s.y + s.h / 2;
        const cos = Math.cos(rot), sin = Math.sin(rot);

        const corners = [
            { x: s.x, y: s.y },
            { x: s.x + s.w, y: s.y },
            { x: s.x + s.w, y: s.y + s.h },
            { x: s.x, y: s.y + s.h },
        ].map(p => {
            const dx = p.x - cx;
            const dy = p.y - cy;
            return { x: cx + dx * cos - dy * sin, y: cy + dx * sin + dy * cos };
        });

        ctx.save();
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = Math.max(1, 1.5 / this.zoom);
        ctx.setLineDash([6 / this.zoom, 4 / this.zoom]);
        ctx.lineDashOffset = -(this._selectionAnimFrame % 10) / this.zoom;
        ctx.beginPath();
        ctx.moveTo(corners[0].x, corners[0].y);
        for (let i = 1; i < 4; i++) ctx.lineTo(corners[i].x, corners[i].y);
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = '#38bdf8';
        const cs = Math.max(3, 6 / this.zoom);
        corners.forEach(p => { ctx.fillRect(p.x - cs / 2, p.y - cs / 2, cs, cs); });
        ctx.restore();

        if (this._isMovingSelection && this._movingPixels) {
            const trX = corners[1].x;
            const trY = corners[1].y;
            const distFromCenter = Math.hypot(trX - cx, trY - cy) || 1;
            const outX = (trX - cx) / distFromCenter;
            const outY = (trY - cy) / distFromCenter;

            const isRotating = this._isRotating === true;
            const visualR = isRotating ? 11 : 9;
            const canvasR = Math.min(40, Math.max(6, visualR / this.zoom));
            const outerDist = canvasR * 2.2;

            const hx = trX + outX * outerDist;
            const hy = trY + outY * outerDist;

            this._rotateHandlePos = { x: hx, y: hy };
            this._rotateHandleRadius = Math.max(canvasR * 1.6, 8 / this.zoom);

            const accentColor = isRotating ? '#f59e0b' : '#38bdf8';

            ctx.save();
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = Math.max(1, 1.5 / this.zoom);
            ctx.beginPath();
            ctx.moveTo(trX, trY);
            ctx.lineTo(hx, hy);
            ctx.stroke();

            ctx.fillStyle = '#0f172a';
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = Math.max(1.5, 2 / this.zoom);
            ctx.beginPath();
            ctx.arc(hx, hy, canvasR, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();
            ctx.restore();
        } else {
            this._rotateHandlePos = null;
        }
    },

    _setupFloating(temp, minX, minY, bw, bh) {
        this._selection = { x: minX, y: minY, w: bw, h: bh };
        this._movingPixels = temp;
        this._selSrcRect = null;
        this._selSrcBefore = null;
        this._isMovingSelection = true;
        this._floatingShape = true;
        this._moveStart = null;
        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;
        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
    },

    _createFloatingFromShape(shape) {
        const mirrored = applySymmetryToStroke(shape, this.symmetry, this.CANVAS_W, this.CANVAS_H);
        const pad = Math.max(this.size * 2, 16);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of mirrored) {
            const sx = Math.min(s.x1, s.x2) - pad, sy = Math.min(s.y1, s.y2) - pad;
            const ex = Math.max(s.x1, s.x2) + pad, ey = Math.max(s.y1, s.y2) + pad;
            if (sx < minX) minX = sx;
            if (sy < minY) minY = sy;
            if (ex > maxX) maxX = ex;
            if (ey > maxY) maxY = ey;
        }
        minX = Math.max(0, Math.floor(minX));
        minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(this.CANVAS_W, Math.ceil(maxX));
        maxY = Math.min(this.CANVAS_H, Math.ceil(maxY));
        const bw = maxX - minX, bh = maxY - minY;
        if (bw < 2 || bh < 2) return false;

        const temp = document.createElement('canvas');
        temp.width = bw;
        temp.height = bh;
        const tctx = temp.getContext('2d');
        tctx.translate(-minX, -minY);
        for (const m of mirrored) drawShape(tctx, m);

        this._setupFloating(temp, minX, minY, bw, bh);
        return true;
    },

    _createFloatingFromCurve(c) {
        const base = {
            type: 'curve',
            x1: c.x1, y1: c.y1, cx: c.cx, cy: c.cy, x2: c.x2, y2: c.y2,
            color: this.color, size: this.size, opacity: this.opacity,
        };
        const mirrored = applySymmetryToStroke(base, this.symmetry, this.CANVAS_W, this.CANVAS_H);
        const pad = Math.max(this.size * 2, 16);
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        for (const s of mirrored) {
            const sx = Math.min(s.x1, s.x2, s.cx) - pad, sy = Math.min(s.y1, s.y2, s.cy) - pad;
            const ex = Math.max(s.x1, s.x2, s.cx) + pad, ey = Math.max(s.y1, s.y2, s.cy) + pad;
            if (sx < minX) minX = sx;
            if (sy < minY) minY = sy;
            if (ex > maxX) maxX = ex;
            if (ey > maxY) maxY = ey;
        }
        minX = Math.max(0, Math.floor(minX));
        minY = Math.max(0, Math.floor(minY));
        maxX = Math.min(this.CANVAS_W, Math.ceil(maxX));
        maxY = Math.min(this.CANVAS_H, Math.ceil(maxY));
        const bw = maxX - minX, bh = maxY - minY;
        if (bw < 2 || bh < 2) return false;

        const temp = document.createElement('canvas');
        temp.width = bw;
        temp.height = bh;
        const tctx = temp.getContext('2d');
        tctx.translate(-minX, -minY);
        for (const m of mirrored) {
            drawQuadBezier(tctx, m.x1, m.y1, m.cx, m.cy, m.x2, m.y2, {
                type: 'brush', color: m.color, size: m.size, opacity: m.opacity,
            });
        }

        this._setupFloating(temp, minX, minY, bw, bh);
        return true;
    },

    _resetSelectionState() {
        this._selection = null;
        this._movingPixels = null;
        this._selSrcRect = null;
        this._selSrcBefore = null;
        this._isMovingSelection = false;
        this._floatingShape = false;
        this._selectDrag = null;
        this._moveStart = null;
        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;
        if (this.overlayCtx) this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
    },

    _commitSelection() {
        if (this._isMovingSelection && this._movingPixels) {
            const s = this._selection;
            const rot = this._floatRotation || 0;
            const layer = this._getActiveLayer();
            if (layer && s) {
                const dest = this._clampRect(this._rotatedBounds(s, rot, 2));
                const rect = this._unionRect(dest, this._selSrcRect);
                if (rect) {
                    const before = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
                    if (this._selSrcRect && this._selSrcBefore) {
                        const sr = this._selSrcRect;
                        const bc = before.getContext('2d');
                        bc.clearRect(sr.x - rect.x, sr.y - rect.y, sr.w, sr.h);
                        bc.drawImage(this._selSrcBefore, sr.x - rect.x, sr.y - rect.y);
                    }
                    this._drawPixelsRotated(this._movingPixels, s.x, s.y, rot, layer.ctx);
                    const after = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
                    this._pushPatch(layer, rect, before, after);
                }
            }
            this._renderComposite();
        }
        this._resetSelectionState();
        this._setStatus('Đã đặt');
    },

    _cancelFloating() {
        const layer = this._getActiveLayer();
        if (layer && this._selSrcRect && this._selSrcBefore) {
            layer.ctx.drawImage(this._selSrcBefore, this._selSrcRect.x, this._selSrcRect.y);
            this._renderComposite();
        }
        this._resetSelectionState();
        this._setStatus('Đã huỷ hình vẽ');
    },

    _clearSelectionPixels() {
        if (!this._selection) return;
        if (this._floatingShape) {
            this._cancelFloating();
            return;
        }
        const layer = this._getActiveLayer();
        if (!layer) return;

        if (this._isMovingSelection && this._selSrcRect && this._selSrcBefore) {
            const sr = this._selSrcRect;
            const after = this._cropCanvas(layer.canvas, sr.x, sr.y, sr.w, sr.h);
            this._pushPatch(layer, sr, this._selSrcBefore, after);
            this._resetSelectionState();
            this._renderComposite();
            this._setStatus('Đã xóa vùng chọn');
            return;
        }

        const rect = this._clampRect(this._selection);
        if (rect) {
            const before = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
            layer.ctx.clearRect(rect.x, rect.y, rect.w, rect.h);
            const after = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
            this._pushPatch(layer, rect, before, after);
        }
        this._resetSelectionState();
        this._renderComposite();
        this._setStatus('Đã xóa vùng chọn');
    },

    _resetForCrop() {
        this._resetSelectionState();
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._stabilizedPoint = null;
        this._lastPointTime = 0;
        this._pendingPointerQueue = [];
        this._currentStroke = null;
        this._stampers = [];
        this._shapeStart = null;
        this._isDrawing = false;
        this._curveState = null;
        this._dirtyBBox = null;
        this._eraseSnapCache = null;
    },

    _cropToSelection() {
        if (!this._selection) {
            this._setStatus('Chưa có vùng chọn');
            return;
        }
        if (this._isMovingSelection && !this._floatingShape) {
            const keep = { ...this._selection };
            this._commitSelection();
            this._selection = keep;
        }
        const s = this._selection;

        let srcCanvas;
        let outW, outH;

        if (this._floatingShape && this._movingPixels) {
            const rot = this._floatRotation || 0;
            const pw = this._movingPixels.width;
            const ph = this._movingPixels.height;

            if (Math.abs(rot) < 0.001) {
                outW = pw;
                outH = ph;
                srcCanvas = this._movingPixels;
            } else {
                const cosAbs = Math.abs(Math.cos(rot));
                const sinAbs = Math.abs(Math.sin(rot));
                outW = Math.ceil(pw * cosAbs + ph * sinAbs);
                outH = Math.ceil(pw * sinAbs + ph * cosAbs);

                srcCanvas = document.createElement('canvas');
                srcCanvas.width = outW;
                srcCanvas.height = outH;
                const rc = srcCanvas.getContext('2d');
                rc.translate(outW / 2, outH / 2);
                rc.rotate(rot);
                rc.drawImage(this._movingPixels, -pw / 2, -ph / 2);
            }
        } else {
            outW = Math.max(1, Math.round(s.w));
            outH = Math.max(1, Math.round(s.h));
            srcCanvas = document.createElement('canvas');
            srcCanvas.width = outW;
            srcCanvas.height = outH;
            const tc = srcCanvas.getContext('2d');

            const tempMain = document.createElement('canvas');
            tempMain.width = this.CANVAS_W;
            tempMain.height = this.CANVAS_H;
            renderLayers(tempMain.getContext('2d'), this.layers, this.CANVAS_W, this.CANVAS_H);

            tc.drawImage(tempMain, Math.round(s.x), Math.round(s.y), outW, outH, 0, 0, outW, outH);
        }

        this._resetForCrop();

        this.CANVAS_W = outW;
        this.CANVAS_H = outH;
        this.paperKey = 'custom';

        this._initCanvas();
        this._fitCanvas();

        this.layers = [];
        this.activeLayerId = null;
        this._history = [];
        this._redoStack = [];
        const bg = this._createLayer('Background', { skipHistory: true });
        bg.ctx.drawImage(srcCanvas, 0, 0);
        this._touch(bg);

        this._renderComposite();
        this._renderLayerUI();
        this._updateBrushCursorSize();
        this._dirty = true;
        this._setStatus(`✂️ Đã crop về ${outW}×${outH}`);
    },

    _autoSelectContent() {
        if (this._floatingShape && this._movingPixels) {
            this._commitSelection();
        }

        const tempMain = document.createElement('canvas');
        tempMain.width = this.CANVAS_W;
        tempMain.height = this.CANVAS_H;
        renderLayers(tempMain.getContext('2d'), this.layers, this.CANVAS_W, this.CANVAS_H);

        try {
            const data = tempMain.getContext('2d').getImageData(0, 0, this.CANVAS_W, this.CANVAS_H).data;
            let minX = this.CANVAS_W, minY = this.CANVAS_H, maxX = 0, maxY = 0, has = false;
            for (let y = 0; y < this.CANVAS_H; y += 2) {
                for (let x = 0; x < this.CANVAS_W; x += 2) {
                    if (data[(y * this.CANVAS_W + x) * 4 + 3] > 15) {
                        has = true;
                        if (x < minX) minX = x;
                        if (x > maxX) maxX = x;
                        if (y < minY) minY = y;
                        if (y > maxY) maxY = y;
                    }
                }
            }
            if (!has) {
                this._setStatus('Không có nội dung');
                return;
            }
            const pad = 4;
            const x0 = Math.max(0, minX - pad), y0 = Math.max(0, minY - pad);
            const x1 = Math.min(this.CANVAS_W, maxX + pad), y1 = Math.min(this.CANVAS_H, maxY + pad);
            this._selection = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
            this._setStatus('🎯 Đã chọn nội dung');
        } catch (e) {
            this._setStatus('Lỗi auto-select');
        }
    },

    // ⭐ THÊM HÀM VẼ SVG TỪ GEMINI (Level 4 Multi-Agent - Fix Blob)
    async drawSvgGuideline(svgString) {
        if (!svgString) return;

        const prevActiveLayerId = this.activeLayerId;
        let layer = this.layers.find(l => l.id === 'tutorial_layer');
        if (!layer) {
            layer = this._createLayer('📝 Hướng dẫn', { skipHistory: true });
            layer.id = 'tutorial_layer';
            layer.opacity = 0.7;
            layer.locked = true;
            this._renderLayerUI();
        } else {
            layer.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        }

        this._setStatus('⏳ Đang nạp nét vẽ...');

        return new Promise((resolve) => {
            // ⭐ Dùng Blob thay vì Base64 để tránh lỗi unescape và tối ưu RAM
            const blob = new Blob([svgString], { type: 'image/svg+xml' });
            const url = URL.createObjectURL(blob);
            const img = new Image();
            img.src = url;

            img.onload = () => {
                // Vẽ ảnh SVG lên canvas
                layer.ctx.drawImage(img, 0, 0, this.CANVAS_W, this.CANVAS_H);

                // Giải phóng bộ nhớ
                URL.revokeObjectURL(url);

                this._touch(layer);
                this._renderComposite();
                this._renderLayerUI();

                // Phục hồi layer active để user vẽ tiếp
                if (prevActiveLayerId && this.layers.find(l => l.id === prevActiveLayerId)) {
                    this.activeLayerId = prevActiveLayerId;
                    this._renderLayerUI();
                }

                this._setStatus('✨ Đã vẽ khung hướng dẫn!');
                resolve(true);
            };

            img.onerror = (e) => {
                URL.revokeObjectURL(url);
                console.error('[Paint] Lỗi render SVG:', e);
                this._setStatus('❌ Lỗi vẽ SVG');
                resolve(false);
            };
        });
    },

    _renderLoop() {
        if (!this.isOpen) return;

        const queue = this._pendingPointerQueue;
        if (queue.length > 0) {
            this._pendingPointerQueue = [];
            const last = queue[queue.length - 1];

            const usesCustomCursor = ['brush', 'eraser'].includes(this.tool);
            if (this.brushCursor) {
                if (usesCustomCursor) {
                    this.brushCursor.style.display = 'block';
                    this.brushCursor.style.transform =
                        `translate3d(${last.clientX}px, ${last.clientY}px, 0) translate(-50%, -50%)`;
                } else {
                    this.brushCursor.style.display = 'none';
                }
            }

            const layer = this._getActiveLayer();
            if (this._isDrawing && this._currentStroke && layer && this._stampers.length &&
                (this.tool === 'brush' || this.tool === 'eraser')) {
                this._rectCache = this._computeRects();
                for (const ev of queue) {
                    if (!this._isDrawing || !this._currentStroke) break;
                    const raw = this._getCanvasPoint(ev);
                    this._lastRawCanvasPt = raw;
                    this._appendStrokePoint(raw, ev);
                }
                this._rectCache = null;

                if (this._isDrawing && this._currentStroke) this._flushStampers();

                if (this._isDrawing && this._currentStroke && this._currentStroke.type === 'eraser' && this._dirtyBBox) {
                    const b = this._dirtyBBox;
                    this._renderCompositeRegion(b.x0 - 2, b.y0 - 2, b.x1 - b.x0 + 4, b.y1 - b.y0 + 4);
                    this._dirtyBBox = null;
                }
            }
        }

        if (this._selection) {
            this._selectionAnimFrame++;
            const active = this._moveStart || this._isRotating || this._selectDrag;
            if (active || (this._selectionAnimFrame & 1) === 0) {
                this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                if (this._isMovingSelection && this._movingPixels) {
                    this._drawPixelsRotated(
                        this._movingPixels,
                        this._selection.x, this._selection.y,
                        this._floatRotation || 0,
                        this.overlayCtx
                    );
                }
                this._drawSelectionMarquee(this.overlayCtx);
            }
        }

        requestAnimationFrame(this._renderLoop);
    },

    _renderComposite() {
        if (!this.ctx) return;
        renderLayers(this.ctx, this.layers, this.CANVAS_W, this.CANVAS_H);
    },
};