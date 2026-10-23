// ═══════════════════════════════════════════════════════════════
// paint-input.js — v3 (Pointer events + robust rotate handle)
// ═══════════════════════════════════════════════════════════════
import {
    drawBrushDot, drawShape, drawQuadBezier, drawSmoothPath,
    floodFill, pickColor, applySymmetryToStroke,
} from './paint-engine.js?v=6';

export const inputMixin = {

    // ⭐ Hit test rotate handle — dùng canvas-space radius
    _isPointOnRotateHandle(pt) {
        if (!this._rotateHandlePos) return false;
        const dx = pt.x - this._rotateHandlePos.x;
        const dy = pt.y - this._rotateHandlePos.y;
        const r = this._rotateHandleRadius || 12;
        return (dx * dx + dy * dy) <= (r * r);
    },

    _onPointerDown(e) {
        if (!this.isOpen) return;
        if (e.button !== 0) return;
        this._pendingPointerQueue = [];

        // ─── Pan ───
        if (this.tool === 'pan') {
            this._isPanning = true;
            this._panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
            this.canvasWrap.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        const pt = this._getCanvasPoint(e);
        if (pt.x < 0 || pt.x > this.CANVAS_W || pt.y < 0 || pt.y > this.CANVAS_H) return;

        // ⭐ Float shape priority: rotate handle > Alt-rotate > move > commit
        if (this._floatingShape && this._movingPixels && this._selection) {
            const cx = this._selection.x + this._selection.w / 2;
            const cy = this._selection.y + this._selection.h / 2;

            // Ưu tiên 1: click trực tiếp vào rotate handle
            if (this._isPointOnRotateHandle(pt)) {
                const startAngle = Math.atan2(pt.y - cy, pt.x - cx);
                this._rotateStart = {
                    startAngle,
                    startRot: this._floatRotation || 0,
                    cx, cy,
                };
                this._isRotating = true;
                this.canvasWrap.style.cursor = 'grabbing';
                this._setStatus('🔄 Đang xoay — thả chuột để dừng');
                return;
            }

            const inSel = this._isPointInSelection(pt);

            // Ưu tiên 2: Alt+kéo trong vùng = xoay (fallback nhanh)
            if (e.altKey && inSel) {
                const startAngle = Math.atan2(pt.y - cy, pt.x - cx);
                this._rotateStart = {
                    startAngle,
                    startRot: this._floatRotation || 0,
                    cx, cy,
                };
                this._isRotating = true;
                this.canvasWrap.style.cursor = 'grabbing';
                this._setStatus('🔄 Đang xoay — thả chuột để dừng');
                return;
            }

            // Ưu tiên 3: kéo trong vùng = move
            if (inSel) {
                this._moveStart = {
                    mx: pt.x, my: pt.y,
                    selX: this._selection.x,
                    selY: this._selection.y,
                };
                this.canvasWrap.style.cursor = 'move';
                this._setStatus('Kéo để di chuyển — Kéo ⚪ để xoay — Space/Enter để đặt');
                return;
            }

            // Ưu tiên 4: click ngoài vùng = commit
            this._commitSelection();
            this.canvasWrap.style.cursor = 'crosshair';
            return;
        }

        // ─── Select tool ───
        if (this.tool === 'select') {
            if (this._selection && this._isPointInSelection(pt)) {
                if (!this._isMovingSelection) {
                    this._movingPixels = this._extractSelectionPixels();
                    this._isMovingSelection = true;
                    this._pixelCache = null;
                    this._pixelCanvas = null;
                }
                this._moveStart = {
                    mx: pt.x, my: pt.y,
                    selX: this._selection.x,
                    selY: this._selection.y,
                };
                this.canvasWrap.style.cursor = 'move';
                this._setStatus('Đang di chuyển — Space/Enter để đặt');
            } else {
                if (this._selection) this._commitSelection();
                this._selectDrag = { startX: pt.x, startY: pt.y };
                this._setStatus('Kéo để tạo vùng chọn');
            }
            return;
        }

        // ─── Fill ───
        if (this.tool === 'fill') {
            if (floodFill(this.ctx, pt.x, pt.y, this.color, this.CANVAS_W, this.CANVAS_H)) {
                this._strokes.push([{ type: 'fill', x: pt.x, y: pt.y, color: this.color }]);
                this._redoStack = [];
                this._dirty = true;
                this._setStatus(`${this._strokes.length} thao tác`);
            }
            return;
        }

        // ─── Eyedropper ───
        if (this.tool === 'eyedropper') {
            this.color = pickColor(this.ctx, pt.x, pt.y);
            this.overlay.querySelector('#paint-color-input').value = this.color;
            this._updateBrushCursorSize();
            this._setStatus(`Màu: ${this.color}`);
            return;
        }

        // ─── Shape ───
        if (this.tool === 'shape') {
            if (this.shape === 'curve') {
                if (!this._curveState) {
                    this._curveState = { phase: 1, x1: pt.x, y1: pt.y, x2: pt.x, y2: pt.y };
                    this._isDrawing = true;
                } else if (this._curveState.phase === 2) {
                    const c = this._curveState;
                    const ok = this._createFloatingFromCurve(c);
                    this._curveState = null;
                    if (ok) this._setStatus('Kéo để di chuyển — Kéo ⚪ để xoay — Space/Enter để đặt');
                }
                return;
            }
            this._shapeStart = { x: Math.round(pt.x), y: Math.round(pt.y) };
            this._isDrawing = true;
            return;
        }

        // ─── Brush / Eraser ───
        this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        const isEraser = this.tool === 'eraser';
        const baseSize = this._getEffectiveSize();

        this._lastRawPoint = { x: pt.x, y: pt.y };
        this._stabilizedPoint = { x: pt.x, y: pt.y };
        this._lastPointTime = performance.now();
        this._lastPointerPos = { x: pt.x, y: pt.y, width: baseSize };

        this._currentStroke = {
            type: isEraser ? 'eraser' : 'brush',
            brush: isEraser ? 'round' : this.brush,
            color: isEraser ? '#000000' : this.color,
            size: baseSize,
            opacity: isEraser ? 1 : this.opacity,
            points: [{ x: pt.x, y: pt.y, width: baseSize }],
        };
        this._isDrawing = true;

        const targetCtx = isEraser ? this.ctx : this.overlayCtx;
        const mir = applySymmetryToStroke(this._currentStroke, this.symmetry, this.CANVAS_W, this.CANVAS_H);
        for (const m of mir) drawBrushDot(targetCtx, m.points[0], m);
    },

    _onPointerMove(e) {
        if (!this.isOpen) return;

        const rect = this.canvasWrap.getBoundingClientRect();
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
            && e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (!inside) {
            if (this.brushCursor) this.brushCursor.style.display = 'none';

            // Vẫn cập nhật rotate khi kéo ra ngoài
            if (this._isRotating && this._rotateStart) {
                const pt = this._getCanvasPoint(e);
                const { cx, cy, startAngle, startRot } = this._rotateStart;
                const angle = Math.atan2(pt.y - cy, pt.x - cx);
                this._floatRotation = startRot + (angle - startAngle);
                return;
            }
            // Vẫn cập nhật move khi kéo ra ngoài
            if (this._isMovingSelection && this._moveStart && this._movingPixels) {
                const pt = this._getCanvasPoint(e);
                const nX = this._moveStart.selX + (pt.x - this._moveStart.mx);
                const nY = this._moveStart.selY + (pt.y - this._moveStart.my);
                const minVis = 10;
                this._selection.x = Math.max(-this._selection.w + minVis, Math.min(this.CANVAS_W - minVis, nX));
                this._selection.y = Math.max(-this._selection.h + minVis, Math.min(this.CANVAS_H - minVis, nY));
                return;
            }
            // Pan
            if (this._isPanning) {
                this.panX = e.clientX - this._panStart.x;
                this.panY = e.clientY - this._panStart.y;
                this._applyTransform();
            }
            return;
        }

        this._pendingPointerQueue.push(e);

        // ─── Pan ───
        if (this._isPanning) {
            this.panX = e.clientX - this._panStart.x;
            this.panY = e.clientY - this._panStart.y;
            this._applyTransform();
            return;
        }

        // Rotate (ưu tiên cao nhất khi đang active)
        if (this._isRotating && this._rotateStart) {
            const pt = this._getCanvasPoint(e);
            const { cx, cy, startAngle, startRot } = this._rotateStart;
            const angle = Math.atan2(pt.y - cy, pt.x - cx);
            this._floatRotation = startRot + (angle - startAngle);
            return;
        }

        // Float move
        if (this._isMovingSelection && this._moveStart && this._movingPixels) {
            const pt = this._getCanvasPoint(e);
            const nX = this._moveStart.selX + (pt.x - this._moveStart.mx);
            const nY = this._moveStart.selY + (pt.y - this._moveStart.my);
            const minVis = 10;
            this._selection.x = Math.max(-this._selection.w + minVis, Math.min(this.CANVAS_W - minVis, nX));
            this._selection.y = Math.max(-this._selection.h + minVis, Math.min(this.CANVAS_H - minVis, nY));
            return;
        }

        // Select marquee
        if (this.tool === 'select') {
            if (this._selectDrag) {
                const pt = this._getCanvasPoint(e);
                this._selection = this._normalizeRect(
                    this._selectDrag.startX, this._selectDrag.startY,
                    pt.x, pt.y
                );
            }
            return;
        }

        // Smart cursor hover cho float state
        if (this._floatingShape && this._selection && !this._isMovingSelection && !this._isRotating) {
            const pt = this._getCanvasPoint(e);
            if (this._isPointOnRotateHandle(pt)) {
                this.canvasWrap.style.cursor = 'grab';
            } else if (this._isPointInSelection(pt)) {
                this.canvasWrap.style.cursor = 'move';
            } else {
                this.canvasWrap.style.cursor = 'crosshair';
            }
        }

        // Shape preview
        if (this.tool === 'shape') {
            if (this.shape === 'curve' && this._curveState) {
                const pt = this._getCanvasPoint(e);
                if (this._curveState.phase === 1) {
                    this._curveState.x2 = pt.x;
                    this._curveState.y2 = pt.y;
                    this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                    this.overlayCtx.save();
                    this.overlayCtx.strokeStyle = this.color;
                    this.overlayCtx.lineWidth = this.size;
                    this.overlayCtx.globalAlpha = this.opacity * 0.7;
                    this.overlayCtx.setLineDash([4, 4]);
                    this.overlayCtx.beginPath();
                    this.overlayCtx.moveTo(this._curveState.x1, this._curveState.y1);
                    this.overlayCtx.lineTo(this._curveState.x2, this._curveState.y2);
                    this.overlayCtx.stroke();
                    this.overlayCtx.restore();
                } else if (this._curveState.phase === 2) {
                    this._curveState.cx = pt.x;
                    this._curveState.cy = pt.y;
                    const c = this._curveState;
                    this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                    drawQuadBezier(this.overlayCtx, c.x1, c.y1, c.cx, c.cy, c.x2, c.y2, {
                        type: 'brush', color: this.color, size: this.size, opacity: this.opacity * 0.7,
                    });
                    this.overlayCtx.save();
                    this.overlayCtx.strokeStyle = '#f59e0b';
                    this.overlayCtx.lineWidth = 1;
                    this.overlayCtx.globalAlpha = 0.5;
                    this.overlayCtx.setLineDash([3, 3]);
                    this.overlayCtx.beginPath();
                    this.overlayCtx.moveTo(c.x1, c.y1);
                    this.overlayCtx.lineTo(c.cx, c.cy);
                    this.overlayCtx.lineTo(c.x2, c.y2);
                    this.overlayCtx.stroke();
                    this.overlayCtx.restore();
                }
                return;
            }
            if (this._isDrawing && this._shapeStart) {
                const pt = this._getCanvasPoint(e);
                this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                const preview = {
                    type: 'shape', shape: this.shape,
                    x1: this._shapeStart.x, y1: this._shapeStart.y,
                    x2: Math.round(pt.x), y2: Math.round(pt.y),
                    color: this.color, size: this.size,
                    opacity: this.opacity, fill: false,
                };
                const mir = applySymmetryToStroke(preview, this.symmetry, this.CANVAS_W, this.CANVAS_H);
                for (const m of mir) drawShape(this.overlayCtx, m);
            }
        }
    },

    _onPointerUp(e) {
        // Rotate end
        if (this._isRotating) {
            this._isRotating = false;
            this._rotateStart = null;
            this.canvasWrap.style.cursor = 'crosshair';
            this._setStatus('🔄 Đã xoay — Space/Enter/click ngoài để đặt');
            return;
        }

        // Float move end
        if (this._isMovingSelection && this._moveStart && this._movingPixels) {
            this._moveStart = null;
            this.canvasWrap.style.cursor = 'move';
            this._setStatus('Đã di chuyển — Space/Enter/click ngoài để đặt');
            return;
        }

        // Select marquee finalize
        if (this.tool === 'select' && this._selectDrag) {
            const pt = this._getCanvasPoint(e);
            const r = this._normalizeRect(
                this._selectDrag.startX, this._selectDrag.startY,
                pt.x, pt.y
            );
            if (r.w < 3 || r.h < 3) {
                this._selection = null;
                this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            } else {
                this._selection = r;
                this._setStatus(`Vùng: ${Math.round(r.w)}×${Math.round(r.h)} — Space/Enter để bỏ`);
            }
            this._selectDrag = null;
            return;
        }

        // Curve phase 1 → 2
        if (this.tool === 'shape' && this.shape === 'curve' && this._curveState && this._curveState.phase === 1) {
            const c = this._curveState;
            const dist = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
            if (dist < 3) {
                this._curveState = null;
                this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                return;
            }
            c.phase = 2;
            c.cx = (c.x1 + c.x2) / 2;
            c.cy = (c.y1 + c.y2) / 2;
            this._isDrawing = false;
            this._setStatus('Di chuột để uốn cong — Click để đặt');
            return;
        }

        // Shape finalize
        if (this.tool === 'shape' && this._shapeStart) {
            const pt = this._getCanvasPoint(e);
            const shape = {
                type: 'shape', shape: this.shape,
                x1: this._shapeStart.x, y1: this._shapeStart.y,
                x2: Math.round(pt.x), y2: Math.round(pt.y),
                color: this.color, size: this.size,
                opacity: this.opacity, fill: false,
            };
            this._shapeStart = null;
            this._isDrawing = false;
            this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);

            // Line: direct commit
            if (this.shape === 'line') {
                const mir = applySymmetryToStroke(shape, this.symmetry, this.CANVAS_W, this.CANVAS_H);
                for (const m of mir) drawShape(this.ctx, m);
                this._strokes.push(mir);
                this._redoStack = [];
                this._dirty = true;
                this._setStatus(`${this._strokes.length} thao tác`);
                return;
            }

            // Rect/Ellipse: float
            if (Math.abs(shape.x2 - shape.x1) < 2 && Math.abs(shape.y2 - shape.y1) < 2) return;
            const ok = this._createFloatingFromShape(shape);
            if (ok) this._setStatus('Kéo để di chuyển — Kéo ⚪ để xoay — Space/Enter để đặt');
            return;
        }

        // Pan end
        if (this._isPanning) {
            this._isPanning = false;
            this._panStart = null;
            this._updateCursor();
            return;
        }

        // Brush / Eraser finalize
        if (!this._isDrawing) return;
        this._isDrawing = false;
        this._pendingPointerQueue = [];

        if (this._currentStroke && this._currentStroke.points.length > 0) {
            if (this.tool !== 'eraser') this._applyTaper(this._currentStroke);
            const mir = applySymmetryToStroke(this._currentStroke, this.symmetry, this.CANVAS_W, this.CANVAS_H);

            if (this.tool !== 'eraser') {
                this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                for (const m of mir) {
                    if (m.points.length === 1) drawBrushDot(this.ctx, m.points[0], m);
                    else drawSmoothPath(this.ctx, m.points, m);
                }
            }
            this._strokes.push(mir);
            this._redoStack = [];
            this._dirty = true;
            this._setStatus(`${this._strokes.length} thao tác`);
        }
        this._currentStroke = null;
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._stabilizedPoint = null;
    },
};