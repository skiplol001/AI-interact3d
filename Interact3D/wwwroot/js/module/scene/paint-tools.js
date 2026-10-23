// ═══════════════════════════════════════════════════════════════
// paint-tools.js — v7 (Preview = Final render — no more ghost)
// ═══════════════════════════════════════════════════════════════
import {
    drawBrushSegment, drawBrushDot, drawSmoothPath, drawShape,
    drawQuadBezier, floodFill, applySymmetryToStroke,
} from './paint-engine.js?v=6';

const MIN_SEG_DIST = 0.5;

export const toolsMixin = {

    // ─── SELECTION HELPERS ───
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
        return {
            x: Math.min(x1, x2),
            y: Math.min(y1, y2),
            w: Math.abs(x2 - x1),
            h: Math.abs(y2 - y1),
        };
    },

    _extractSelectionPixels() {
        const s = this._selection;
        if (!s || s.w < 1 || s.h < 1) return null;
        const img = this.ctx.getImageData(
            Math.floor(s.x), Math.floor(s.y),
            Math.ceil(s.w), Math.ceil(s.h)
        );
        this.ctx.clearRect(s.x, s.y, s.w, s.h);
        return img;
    },

    _pixelsToCanvas(imgData) {
        if (!imgData) return null;
        if (this._pixelCache === imgData && this._pixelCanvas) return this._pixelCanvas;
        const temp = document.createElement('canvas');
        temp.width = imgData.width;
        temp.height = imgData.height;
        const tc = temp.getContext('2d');
        tc.imageSmoothingEnabled = true;
        tc.imageSmoothingQuality = 'high';
        tc.putImageData(imgData, 0, 0);
        this._pixelCanvas = temp;
        this._pixelCache = imgData;
        return temp;
    },

    _drawPixelsRotated(imgData, x, y, rotation, ctx) {
        if (!imgData) return;
        const cv = this._pixelsToCanvas(imgData);
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

    _drawPixelsOnCtx(imgData, dx, dy, ctx) {
        this._drawPixelsRotated(imgData, dx, dy, 0, ctx);
    },

    _cancelCurrentStroke() {
        this._isDrawing = false;
        this._currentStroke = null;
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._stabilizedPoint = null;
        this._pendingPointerQueue = [];
        this._shapeStart = null;
        if (this.overlayCtx) {
            this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        }
    },

    // ─── MARQUEE ───
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
            return {
                x: cx + dx * cos - dy * sin,
                y: cy + dx * sin + dy * cos,
            };
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
        corners.forEach(p => {
            ctx.fillRect(p.x - cs / 2, p.y - cs / 2, cs, cs);
        });
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

            const iconR = canvasR * 0.55;
            ctx.strokeStyle = accentColor;
            ctx.lineWidth = Math.max(1, 1.8 / this.zoom);
            ctx.beginPath();
            ctx.arc(hx, hy, iconR, -Math.PI * 0.75, Math.PI * 0.5);
            ctx.stroke();

            const arrowSize = canvasR * 0.4;
            ctx.fillStyle = accentColor;
            ctx.beginPath();
            ctx.moveTo(hx + arrowSize * 0.4, hy + arrowSize * 0.5);
            ctx.lineTo(hx + arrowSize * 0.75, hy + arrowSize * 0.05);
            ctx.lineTo(hx + arrowSize * 0.15, hy + arrowSize * 0.15);
            ctx.closePath();
            ctx.fill();

            ctx.restore();
        } else {
            this._rotateHandlePos = null;
        }
    },

    // ─── FLOAT CREATION ───
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
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        tctx.translate(-minX, -minY);
        for (const m of mirrored) drawShape(tctx, m);

        this._selection = { x: minX, y: minY, w: bw, h: bh };
        this._movingPixels = tctx.getImageData(0, 0, bw, bh);
        this._isMovingSelection = true;
        this._floatingShape = true;
        this._moveStart = null;
        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;
        this._pixelCache = null;
        this._pixelCanvas = null;
        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
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
        tctx.imageSmoothingEnabled = true;
        tctx.imageSmoothingQuality = 'high';
        tctx.translate(-minX, -minY);
        for (const m of mirrored) {
            drawQuadBezier(tctx, m.x1, m.y1, m.cx, m.cy, m.x2, m.y2, {
                type: 'brush', color: m.color, size: m.size, opacity: m.opacity,
            });
        }

        this._selection = { x: minX, y: minY, w: bw, h: bh };
        this._movingPixels = tctx.getImageData(0, 0, bw, bh);
        this._isMovingSelection = true;
        this._floatingShape = true;
        this._moveStart = null;
        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;
        this._pixelCache = null;
        this._pixelCanvas = null;
        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        return true;
    },

    // ─── COMMIT / CANCEL ───
    _commitSelection() {
        if (this._isMovingSelection && this._movingPixels) {
            const s = this._selection;
            const rot = this._floatRotation || 0;
            this._drawPixelsRotated(this._movingPixels, s.x, s.y, rot, this.ctx);
            this._strokes.push([{
                type: 'custom_paste',
                imgData: this._movingPixels,
                x: s.x, y: s.y,
                rotation: rot,
            }]);
            this._redoStack = [];
            this._dirty = true;
        }
        this._selection = null;
        this._movingPixels = null;
        this._isMovingSelection = false;
        this._floatingShape = false;
        this._selectDrag = null;
        this._moveStart = null;
        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;
        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        this._setStatus('Đã đặt');
    },

    _cancelFloating() {
        this._movingPixels = null;
        this._isMovingSelection = false;
        this._floatingShape = false;
        this._selection = null;
        this._moveStart = null;
        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;
        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        this._setStatus('Đã huỷ hình vẽ');
    },

    // ─── DELETE / CROP ───
    _clearSelectionPixels() {
        if (!this._selection) return;
        const s = this._selection;
        if (this._floatingShape) {
            this._cancelFloating();
            return;
        }
        this.ctx.clearRect(s.x, s.y, s.w, s.h);
        this._strokes.push([{ type: 'clearRect', x: s.x, y: s.y, w: s.w, h: s.h }]);
        this._redoStack = [];
        this._dirty = true;
        this._selection = null;
        this._rotateHandlePos = null;
        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        this._setStatus('Đã xóa vùng chọn');
    },

    _resetForCrop() {
        this._selection = null;
        this._selectDrag = null;
        this._movingPixels = null;
        this._moveStart = null;
        this._isMovingSelection = false;
        this._floatingShape = false;
        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._stabilizedPoint = null;
        this._lastPointTime = 0;
        this._pendingPointerQueue = [];
        this._currentStroke = null;
        this._shapeStart = null;
        this._isDrawing = false;
        this._curveState = null;
        this._pixelCache = null;
        this._pixelCanvas = null;
    },

    _snapshotAsBaseLayer() {
        try {
            const imgData = this.ctx.getImageData(0, 0, this.CANVAS_W, this.CANVAS_H);
            this._strokes = [[{
                type: 'custom_paste',
                imgData: imgData,
                x: 0, y: 0,
                rotation: 0,
                isBaseLayer: true,
            }]];
            this._redoStack = [];
            this._dirty = true;
            this._pixelCache = null;
            this._pixelCanvas = null;
        } catch (e) {
            console.warn('[Crop] Snapshot error:', e);
            this._strokes = [];
            this._redoStack = [];
        }
    },

    _cropToSelection() {
        if (!this._selection) {
            this._setStatus('Chưa có vùng chọn');
            return;
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
                srcCanvas = this._pixelsToCanvas(this._movingPixels);
            } else {
                const cosAbs = Math.abs(Math.cos(rot));
                const sinAbs = Math.abs(Math.sin(rot));
                outW = Math.ceil(pw * cosAbs + ph * sinAbs);
                outH = Math.ceil(pw * sinAbs + ph * cosAbs);

                srcCanvas = document.createElement('canvas');
                srcCanvas.width = outW;
                srcCanvas.height = outH;
                const rc = srcCanvas.getContext('2d');
                rc.imageSmoothingEnabled = true;
                rc.imageSmoothingQuality = 'high';
                rc.translate(outW / 2, outH / 2);
                rc.rotate(rot);
                rc.drawImage(this._pixelsToCanvas(this._movingPixels), -pw / 2, -ph / 2);
            }
        } else {
            outW = Math.max(1, Math.round(s.w));
            outH = Math.max(1, Math.round(s.h));
            srcCanvas = document.createElement('canvas');
            srcCanvas.width = outW;
            srcCanvas.height = outH;
            const tc = srcCanvas.getContext('2d');
            tc.imageSmoothingEnabled = true;
            tc.imageSmoothingQuality = 'high';
            tc.drawImage(
                this.canvas,
                Math.round(s.x), Math.round(s.y),
                outW, outH,
                0, 0, outW, outH
            );
        }

        this._resetForCrop();

        this.CANVAS_W = outW;
        this.CANVAS_H = outH;
        this.paperKey = 'custom';

        this._initCanvas();
        this._fitCanvas();

        this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);

        this.ctx.drawImage(srcCanvas, 0, 0);
        this._snapshotAsBaseLayer();

        this._updateBrushCursorSize();
        this._setStatus(`✂️ Đã crop về ${outW}×${outH}`);
    },

    _autoSelectContent() {
        if (this._floatingShape && this._movingPixels) {
            this._commitSelection();
        }
        try {
            const data = this.ctx.getImageData(0, 0, this.CANVAS_W, this.CANVAS_H).data;
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
            this._selection = {
                x: Math.max(0, minX - pad),
                y: Math.max(0, minY - pad),
                w: Math.min(this.CANVAS_W - (minX - pad), (maxX - minX) + pad * 2),
                h: Math.min(this.CANVAS_H - (minY - pad), (maxY - minY) + pad * 2),
            };
            this._setStatus('🎯 Đã chọn nội dung');
        } catch (e) {
            this._setStatus('Lỗi auto-select');
        }
    },

    // ─── RENDER LOOP (Preview = Final) ───
    _renderLoop() {
        if (!this.isOpen) return;

        const queue = this._pendingPointerQueue;
        if (queue.length > 0) {
            this._pendingPointerQueue = [];
            const last = queue[queue.length - 1];

            const usesCustomCursor = ['brush', 'eraser'].includes(this.tool);
            if (usesCustomCursor) {
                this.brushCursor.style.display = 'block';
                this.brushCursor.style.transform =
                    `translate3d(${last.clientX}px, ${last.clientY}px, 0) translate(-50%, -50%)`;
            } else {
                this.brushCursor.style.display = 'none';
            }

            // ⭐ Brush: add points, then REDRAW FULL STROKE (match final)
            if (this._isDrawing && this._currentStroke && this.tool === 'brush') {
                const baseSize = this._getEffectiveSize();
                const useVel = this.drawMode === 'taper';

                for (const e of queue) {
                    const rawPt = this._getCanvasPoint(e);
                    const stablePt = this._stabilize(rawPt);

                    let velocity = 0;
                    if (useVel) {
                        const now = performance.now();
                        const dt = Math.max(1, now - this._lastPointTime);
                        const rawDist = Math.hypot(
                            rawPt.x - this._lastRawPoint.x,
                            rawPt.y - this._lastRawPoint.y
                        );
                        velocity = (rawDist / dt) * 16;
                        this._lastPointTime = now;
                        this._lastRawPoint = { x: rawPt.x, y: rawPt.y };
                    }

                    const prev = this._lastPointerPos;
                    if (!prev) continue;
                    if (Math.hypot(stablePt.x - prev.x, stablePt.y - prev.y) < MIN_SEG_DIST) continue;

                    const w = useVel ? this._computeWidth(velocity, baseSize) : baseSize;
                    const pt = { x: stablePt.x, y: stablePt.y, width: w };
                    this._currentStroke.points.push(pt);
                    this._lastPointerPos = pt;
                }

                // Redraw toàn bộ stroke hiện tại — GIỐNG HỆT final
                this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                const mir = applySymmetryToStroke(this._currentStroke, this.symmetry, this.CANVAS_W, this.CANVAS_H);
                for (const m of mir) {
                    if (m.points.length === 1) drawBrushDot(this.overlayCtx, m.points[0], m);
                    else drawSmoothPath(this.overlayCtx, m.points, m);
                }
            }
            // ⭐ Eraser: draw live to this.ctx (immediate)
            else if (this._isDrawing && this._currentStroke && this.tool === 'eraser') {
                const baseSize = this._getEffectiveSize();

                for (const e of queue) {
                    const rawPt = this._getCanvasPoint(e);
                    const stablePt = this._stabilize(rawPt);

                    const prev = this._lastPointerPos;
                    if (!prev) continue;
                    if (Math.hypot(stablePt.x - prev.x, stablePt.y - prev.y) < MIN_SEG_DIST) continue;

                    const pt = { x: stablePt.x, y: stablePt.y, width: baseSize };
                    this._currentStroke.points.push(pt);

                    const seg = { ...this._currentStroke, points: [prev, pt] };
                    const mir = applySymmetryToStroke(seg, this.symmetry, this.CANVAS_W, this.CANVAS_H);
                    for (const m of mir) {
                        drawBrushSegment(this.ctx, m.points[0], m.points[1], m);
                    }
                    this._lastPointerPos = pt;
                }
            }
        }

        if (this._selection) {
            this._selectionAnimFrame++;
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

        requestAnimationFrame(this._renderLoop);
    },

    // ─── REPLAY ───
    _replayAll() {
        this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        if (this.overlayCtx) {
            this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        }
        for (const group of this._strokes) {
            for (const s of group) {
                if (s.type === 'fill') {
                    floodFill(this.ctx, s.x, s.y, s.color, this.CANVAS_W, this.CANVAS_H);
                } else if (s.type === 'shape') {
                    drawShape(this.ctx, s);
                } else if (s.type === 'curve') {
                    drawQuadBezier(this.ctx, s.x1, s.y1, s.cx, s.cy, s.x2, s.y2, {
                        type: 'brush', color: s.color, size: s.size, opacity: s.opacity ?? 1,
                    });
                } else if (s.type === 'custom_paste') {
                    this._drawPixelsRotated(s.imgData, s.x, s.y, s.rotation || 0, this.ctx);
                } else if (s.type === 'clearRect') {
                    this.ctx.clearRect(s.x, s.y, s.w, s.h);
                } else {
                    if (s.points.length === 1) drawBrushDot(this.ctx, s.points[0], s);
                    else drawSmoothPath(this.ctx, s.points, s);
                }
            }
        }
        this._pixelCache = null;
        this._pixelCanvas = null;
    },
};