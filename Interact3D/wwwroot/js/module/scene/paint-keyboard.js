// ═══════════════════════════════════════════════════════════════
// paint-keyboard.js — v2 (preventDefault for Ctrl+Z/Y)
// ═══════════════════════════════════════════════════════════════

export const keyboardMixin = {
    _onKeyDown(e) {
        if (!this.isOpen) return;
        const tag = e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        const key = e.key.toLowerCase();

        // ─── Escape ───
        if (e.key === 'Escape') {
            if (this._curveState) {
                this._curveState = null;
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

        // ⭐ Ctrl+Z (undo) — preventDefault để browser không bắt
        if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
            e.preventDefault();
            this.undo();
            return;
        }

        // ⭐ Ctrl+Y (redo) / Ctrl+Shift+Z — preventDefault
        if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
            e.preventDefault();
            this.redo();
            return;
        }

        // ⭐ Ctrl+Shift+X (crop)
        if ((e.ctrlKey || e.metaKey) && e.shiftKey && key === 'x') {
            e.preventDefault();
            if (this._selection) this._cropToSelection();
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
            this.size = Math.max(1, this.size - 2);
            this.overlay.querySelector('#paint-size-slider').value = this.size;
            this.overlay.querySelector('#paint-size-val').textContent = this.size;
            this._updateBrushCursorSize();
            return;
        }
        if (e.key === ']') {
            this.size = Math.min(300, this.size + 2);
            this.overlay.querySelector('#paint-size-slider').value = this.size;
            this.overlay.querySelector('#paint-size-val').textContent = this.size;
            this._updateBrushCursorSize();
            return;
        }

        // ─── Zoom ───
        if (e.key === '+' || e.key === '=') { this._setZoom(this.zoom * 1.2); return; }
        if (e.key === '-') { this._setZoom(this.zoom / 1.2); return; }
        if (key === '0') { this.rotation = 0; this._fitCanvas(); return; }
    },
};