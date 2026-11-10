// ═══════════════════════════════════════════════════════════════
// paint-keyboard.js — v4
// ═══════════════════════════════════════════════════════════════

export const keyboardMixin = {
    _onKeyDown(e) {
        if (!this.isOpen) return;

        // Đang mở hộp thoại Sketch → chỉ xử lý Esc
        if (document.getElementById('paint-sketch-modal')) {
            if (e.key === 'Escape') this._closeSketchDialog();
            return;
        }

        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const key = e.key.toLowerCase();

        // ─── Escape ───
        if (e.key === 'Escape') {
            if (this._curveState) {
                this._curveState = null;
                this._isDrawing = false;
                this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
                return;
            }
            if (this._floatingShape && this._movingPixels) {
                this._cancelFloating();
                return;
            }
            if (this._selection) {
                this._commitSelection();
                return;
            }
            this.close();
            return;
        }

        // Ctrl+Z (undo)
        if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
            return;
        }

        // Ctrl+Y / Ctrl+Shift+Z (redo)
        if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
            e.preventDefault();
            this.redo();
            return;
        }

        // Ctrl+Shift+N (Thêm Layer mới)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'n') {
            e.preventDefault();
            this._createLayer();
            return;
        }

        if (e.ctrlKey || e.metaKey) return;

        // ─── Commit / cancel ───
        if ((e.key === ' ' || e.key === 'Enter') && (this._selection || this._floatingShape)) {
            e.preventDefault();
            this._commitSelection();
            return;
        }
        if ((e.key === 'Delete' || e.key === 'Backspace') && this._selection) {
            e.preventDefault();
            this._clearSelectionPixels();
            return;
        }

        // ─── Tool shortcuts ───
        if (key === 'b') return this._switchTool('brush');
        if (key === 'e') return this._switchTool('eraser');
        if (key === 'g') return this._switchTool('fill');
        if (key === 'i') return this._switchTool('eyedropper');
        if (key === 's') return this._switchTool('select');
        if (key === 'r') {
            this.rotation = (this.rotation + 90) % 360;
            this._applyTransform();
            return;
        }
        if (e.shiftKey && key === 'v') {
            this._setDrawMode(this.drawMode === 'taper' ? 'normal' : 'taper');
            e.preventDefault();
            return;
        }

        // ─── Size ───
        if (e.key === '[') {
            this._setSize(this.size - Math.max(1, Math.round(this.size * 0.1)));
            return;
        }
        if (e.key === ']') {
            this._setSize(this.size + Math.max(1, Math.round(this.size * 0.1)));
            return;
        }

        // ─── Zoom ───
        if (e.key === '+' || e.key === '=') { this._setZoom(this.zoom * 1.2); return; }
        if (e.key === '-') { this._setZoom(this.zoom / 1.2); return; }
        if (key === '0') { this.rotation = 0; this._fitCanvas(); return; }
    },
};