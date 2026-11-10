// ═══════════════════════════════════════════════════════════════
// paint-input.js — v6 (Pointer events · coalesced · fill mọi layer · Line tọa độ lẻ · 1 pointer/nét)
// ═══════════════════════════════════════════════════════════════
import {
    drawShape, drawQuadBezier,
    computeFillMask, applyFillMask, pickColor, applySymmetryToStroke,
} from './paint-engine.js?v=10';

// Đường thẳng giữ tọa độ lẻ (nét mảnh mềm, không nhòe 2px); hình khối làm tròn để cạnh sắc
const snapCoord = (v, shape) => (shape === 'line' ? v : Math.round(v));

export const inputMixin = {

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

        // ⭐ Đang có nét: con trỏ khác (ngón tay thứ 2, lòng bàn tay...) bị bỏ qua.
        // Cùng con trỏ mà nét còn dang dở (mất pointerup) → chốt nét cũ rồi vẽ tiếp.
        if (this._isDrawing && this._currentStroke) {
            if (e.pointerId === this._strokePointerId) this._finishStroke();
            else return;
        }

        this._pendingPointerQueue = [];

        if (this.tool === 'pan') {
            this._isPanning = true;
            this._panStart = { x: e.clientX - this.panX, y: e.clientY - this.panY };
            this.canvasWrap.style.cursor = 'grabbing';
            e.preventDefault();
            return;
        }

        const activeLayer = this._getActiveLayer();
        if (!activeLayer) return;

        const pt = this._getCanvasPoint(e);
        if (pt.x < 0 || pt.x > this.CANVAS_W || pt.y < 0 || pt.y > this.CANVAS_H) return;

        if (this.tool !== 'eyedropper' && !this._floatingShape) {
            if (activeLayer.locked) {
                this._setStatus('⚠️ Layer đang bị khóa!');
                return;
            }
            if (!activeLayer.visible) {
                this._setStatus('⚠️ Layer đang ẩn!');
                return;
            }
        }

        // ─── Đang có hình nổi (floating) ───
        if (this._floatingShape && this._movingPixels && this._selection) {
            const cx = this._selection.x + this._selection.w / 2;
            const cy = this._selection.y + this._selection.h / 2;

            if (this._isPointOnRotateHandle(pt)) {
                const startAngle = Math.atan2(pt.y - cy, pt.x - cx);
                this._rotateStart = { startAngle, startRot: this._floatRotation || 0, cx, cy };
                this._isRotating = true;
                this.canvasWrap.style.cursor = 'grabbing';
                this._setStatus('🔄 Đang xoay — thả chuột để dừng');
                return;
            }

            const inSel = this._isPointInSelection(pt);

            if (e.altKey && inSel) {
                const startAngle = Math.atan2(pt.y - cy, pt.x - cx);
                this._rotateStart = { startAngle, startRot: this._floatRotation || 0, cx, cy };
                this._isRotating = true;
                this.canvasWrap.style.cursor = 'grabbing';
                this._setStatus('🔄 Đang xoay — thả chuột để dừng');
                return;
            }

            if (inSel) {
                this._moveStart = {
                    mx: pt.x, my: pt.y,
                    selX: this._selection.x, selY: this._selection.y,
                };
                this.canvasWrap.style.cursor = 'move';
                this._setStatus('Kéo để di chuyển — Kéo ⚪ để xoay — Space/Enter để đặt');
                return;
            }

            this._commitSelection();
            this.canvasWrap.style.cursor = 'crosshair';
            return;
        }

        // ─── Select ───
        if (this.tool === 'select') {
            if (this._selection && this._isPointInSelection(pt)) {
                if (!this._isMovingSelection) {
                    const px = this._extractSelectionPixels();
                    if (!px) return;
                    this._movingPixels = px;
                    this._isMovingSelection = true;
                }
                this._moveStart = {
                    mx: pt.x, my: pt.y,
                    selX: this._selection.x, selY: this._selection.y,
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

        // ─── Fill (tham chiếu mọi layer → tô được dưới nét line art) ───
        if (this.tool === 'fill') {
            const src = this.fillAll ? this.ctx : activeLayer.ctx;
            const res = computeFillMask(src, pt.x, pt.y, this.CANVAS_W, this.CANVAS_H, this.fillTol, this.fillAll ? 1 : 0);
            if (!res) return;
            // res đã gồm viền mềm 1px → patch undo bao trọn vùng bị đổi
            const rect = this._clampRect({ x: res.x, y: res.y, w: res.w, h: res.h });
            if (!rect) return;
            const before = this._cropCanvas(activeLayer.canvas, rect.x, rect.y, rect.w, rect.h);
            applyFillMask(activeLayer.ctx, res, this.color);
            const after = this._cropCanvas(activeLayer.canvas, rect.x, rect.y, rect.w, rect.h);
            this._pushPatch(activeLayer, rect, before, after);
            this._renderComposite();
            return;
        }

        // ─── Eyedropper (lấy màu từ ảnh ghép) ───
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
            this._shapeStart = { x: snapCoord(pt.x, this.shape), y: snapCoord(pt.y, this.shape) };
            this._isDrawing = true;
            return;
        }

        // ─── Brush / Eraser ───
        this._strokePointerId = e.pointerId;
        this._beginStroke(pt, e);
    },

    _onPointerMove(e) {
        if (!this.isOpen) return;

        // ⭐ Đang vẽ nét: bỏ qua con trỏ khác
        if (this._currentStroke && this._strokePointerId != null
            && e.pointerId !== this._strokePointerId) return;

        // ⭐ Cache rect (getBoundingClientRect đắt khi gọi ở mỗi sự kiện)
        const now = performance.now();
        if (!this._wrapRect || now - (this._wrapRectT || 0) > 300) {
            this._wrapRect = this.canvasWrap.getBoundingClientRect();
            this._wrapRectT = now;
        }
        const rect = this._wrapRect;
        const inside = e.clientX >= rect.left && e.clientX <= rect.right
            && e.clientY >= rect.top && e.clientY <= rect.bottom;

        if (!inside) {
            if (this.brushCursor) this.brushCursor.style.display = 'none';

            if (this._isRotating && this._rotateStart) {
                const pt = this._getCanvasPoint(e);
                const { cx, cy, startAngle, startRot } = this._rotateStart;
                const angle = Math.atan2(pt.y - cy, pt.x - cx);
                this._floatRotation = startRot + (angle - startAngle);
                return;
            }
            if (this._isMovingSelection && this._moveStart && this._movingPixels) {
                this._moveSelectionTo(e);
                return;
            }
            if (this._isPanning) {
                this.panX = e.clientX - this._panStart.x;
                this.panY = e.clientY - this._panStart.y;
                this._applyTransform();
            }
            return;
        }

        // Gom các điểm "coalesced" → nét mượt hơn khi di chuột/bút nhanh
        if (this._isDrawing && this._currentStroke && (this.tool === 'brush' || this.tool === 'eraser')
            && typeof e.getCoalescedEvents === 'function') {
            const evs = e.getCoalescedEvents();
            if (evs && evs.length > 1) {
                for (const ce of evs) this._pendingPointerQueue.push(ce);
            } else {
                this._pendingPointerQueue.push(e);
            }
        } else {
            this._pendingPointerQueue.push(e);
        }

        if (this._isPanning) {
            this.panX = e.clientX - this._panStart.x;
            this.panY = e.clientY - this._panStart.y;
            this._applyTransform();
            return;
        }

        if (this._isRotating && this._rotateStart) {
            const pt = this._getCanvasPoint(e);
            const { cx, cy, startAngle, startRot } = this._rotateStart;
            const angle = Math.atan2(pt.y - cy, pt.x - cx);
            this._floatRotation = startRot + (angle - startAngle);
            return;
        }

        if (this._isMovingSelection && this._moveStart && this._movingPixels) {
            this._moveSelectionTo(e);
            return;
        }

        if (this.tool === 'select') {
            if (this._selectDrag) {
                const pt = this._getCanvasPoint(e);
                this._selection = this._normalizeRect(
                    this._selectDrag.startX, this._selectDrag.startY, pt.x, pt.y
                );
            }
            return;
        }

        if (this._floatingShape && this._selection && !this._isMovingSelection && !this._isRotating) {
            const pt = this._getCanvasPoint(e);
            if (this._isPointOnRotateHandle(pt)) this.canvasWrap.style.cursor = 'grab';
            else if (this._isPointInSelection(pt)) this.canvasWrap.style.cursor = 'move';
            else this.canvasWrap.style.cursor = 'crosshair';
        }

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
                    x2: snapCoord(pt.x, this.shape), y2: snapCoord(pt.y, this.shape),
                    color: this.color, size: this.size,
                    opacity: this.opacity, fill: false,
                };
                const mir = applySymmetryToStroke(preview, this.symmetry, this.CANVAS_W, this.CANVAS_H);
                for (const m of mir) drawShape(this.overlayCtx, m);
            }
        }
    },

    _moveSelectionTo(e) {
        const pt = this._getCanvasPoint(e);
        const nX = this._moveStart.selX + (pt.x - this._moveStart.mx);
        const nY = this._moveStart.selY + (pt.y - this._moveStart.my);
        const minVis = 10;
        this._selection.x = Math.max(-this._selection.w + minVis, Math.min(this.CANVAS_W - minVis, nX));
        this._selection.y = Math.max(-this._selection.h + minVis, Math.min(this.CANVAS_H - minVis, nY));
    },

    _onPointerUp(e) {
        // ⭐ Con trỏ khác nhả ra khi đang vẽ nét → không được kết thúc nét
        if (this._currentStroke && this._strokePointerId != null
            && e.pointerId !== this._strokePointerId) return;

        if (this._isRotating) {
            this._isRotating = false;
            this._rotateStart = null;
            this.canvasWrap.style.cursor = 'crosshair';
            this._setStatus('🔄 Đã xoay — Space/Enter/click ngoài để đặt');
            return;
        }

        if (this._isMovingSelection && this._moveStart && this._movingPixels) {
            this._moveStart = null;
            this.canvasWrap.style.cursor = 'move';
            this._setStatus('Đã di chuyển — Space/Enter/click ngoài để đặt');
            return;
        }

        if (this.tool === 'select' && this._selectDrag) {
            const pt = this._getCanvasPoint(e);
            const r = this._normalizeRect(
                this._selectDrag.startX, this._selectDrag.startY, pt.x, pt.y
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

        if (this.tool === 'shape' && this.shape === 'curve' && this._curveState && this._curveState.phase === 1) {
            const c = this._curveState;
            const dist = Math.hypot(c.x2 - c.x1, c.y2 - c.y1);
            if (dist < 3) {
                this._curveState = null;
                this._isDrawing = false;
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

        if (this.tool === 'shape' && this._shapeStart) {
            const pt = this._getCanvasPoint(e);
            const shape = {
                type: 'shape', shape: this.shape,
                x1: this._shapeStart.x, y1: this._shapeStart.y,
                x2: snapCoord(pt.x, this.shape), y2: snapCoord(pt.y, this.shape),
                color: this.color, size: this.size,
                opacity: this.opacity, fill: false,
            };
            this._shapeStart = null;
            this._isDrawing = false;
            this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);

            if (this.shape === 'line') {
                const layer = this._getActiveLayer();
                if (layer) {
                    const mir = applySymmetryToStroke(shape, this.symmetry, this.CANVAS_W, this.CANVAS_H);
                    const pad = shape.size / 2 + 3;
                    let box = null;
                    for (const m of mir) {
                        box = this._unionRect(box, {
                            x: Math.min(m.x1, m.x2) - pad, y: Math.min(m.y1, m.y2) - pad,
                            w: Math.abs(m.x2 - m.x1) + pad * 2, h: Math.abs(m.y2 - m.y1) + pad * 2,
                        });
                    }
                    const rect = this._clampRect(box);
                    if (rect) {
                        const before = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
                        for (const m of mir) drawShape(layer.ctx, m);
                        const after = this._cropCanvas(layer.canvas, rect.x, rect.y, rect.w, rect.h);
                        this._pushPatch(layer, rect, before, after);
                        this._renderComposite();
                    }
                }
                return;
            }

            if (Math.abs(shape.x2 - shape.x1) < 2 && Math.abs(shape.y2 - shape.y1) < 2) return;
            const ok = this._createFloatingFromShape(shape);
            if (ok) this._setStatus('Kéo để di chuyển — Kéo ⚪ để xoay — Space/Enter để đặt');
            return;
        }

        if (this._isPanning) {
            this._isPanning = false;
            this._panStart = null;
            this._updateCursor();
            return;
        }

        if (!this._isDrawing) return;
        this._finishStroke();
        this._strokePointerId = null;
    },
};