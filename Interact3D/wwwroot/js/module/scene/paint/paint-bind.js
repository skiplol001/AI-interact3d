// ═══════════════════════════════════════════════════════════════
// paint-bind.js — v6 (Anti-aliasing toggle · Gộp thanh trượt Mượt)
// ═══════════════════════════════════════════════════════════════
import { PAPER_PRESETS } from './paint-ui.js?v=6';

export const bindMixin = {
    _bindUI() {
        const $ = (sel) => this.overlay.querySelector(sel);
        const $$ = (sel) => this.overlay.querySelectorAll(sel);

        // ─── Header ───
        $('#paint-exit').onclick = () => {
            if (this._dirty && !confirm('Thay đổi chưa lưu. Thoát?')) return;
            this.close();
        };
        $('#paint-gallery-open').onclick = () => this._openGallery();
        $('#paint-sketch-open').onclick = () => this._openSketchDialog();
        $('#paint-save-draft').onclick = () => this._saveToGalleryWithPrompt();
        $('#paint-done').onclick = () => this._handleDone();
        $('#paint-export').onclick = () => this._exportImage();
        $('#paint-save-palette').onclick = () => this._savePalettePrompt();

        // ─── Draw mode ───
        $('#paint-mode-normal').onclick = () => this._setDrawMode('normal');
        $('#paint-mode-taper').onclick = () => this._setDrawMode('taper');
        $('#paint-pen-pressure').onclick = () => this._setPenPressure(!this.penPressure);
        $('#paint-pressure-slider').oninput = (e) => {
            this.pressureStrength = parseInt(e.target.value, 10);
            $('#paint-pressure-val').textContent = this.pressureStrength;
        };
        $('#paint-taperlen-slider').oninput = (e) => {
            this.taperLength = parseInt(e.target.value, 10);
            $('#paint-taperlen-val').textContent = this.taperLength;
        };

        // ─── Selection actions ───
        $('#paint-sel-crop').onclick = () => this._cropToSelection();
        $('#paint-sel-auto').onclick = () => this._autoSelectContent();
        $('#paint-sel-delete').onclick = () => this._clearSelectionPixels();

        // ─── Fill options ───
        $('#paint-fill-all').onchange = (e) => { this.fillAll = e.target.checked; };
        $('#paint-fill-tol').oninput = (e) => {
            this.fillTol = parseInt(e.target.value, 10);
            $('#paint-fill-tol-val').textContent = this.fillTol;
        };

        // ─── Tools ───
        $$('[data-tool]').forEach(btn => {
            btn.onclick = () => {
                this._switchTool(btn.dataset.tool);
                this._curveState = null;
                this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            };
        });

        // ─── Colors ───
        $$('[data-color]').forEach(btn => {
            btn.onclick = () => {
                this.color = btn.dataset.color;
                $('#paint-color-input').value = this.color;
                $$('[data-color]').forEach(b => b.style.borderColor = b === btn ? '#38bdf8' : 'transparent');
                this._updateBrushCursorSize();
            };
        });
        $('#paint-color-input').oninput = (e) => {
            this.color = e.target.value;
            $$('[data-color]').forEach(b => b.style.borderColor = 'transparent');
            this._updateBrushCursorSize();
        };

        // ─── Sizes ───
        $$('[data-size]').forEach(btn => {
            btn.onclick = () => this._setSize(parseInt(btn.dataset.size, 10));
        });
        $('#paint-size-slider').oninput = (e) => {
            this._setSize(parseInt(e.target.value, 10));
        };

        // ─── Opacity / Stabilizer ───
        $('#paint-opacity-slider').oninput = (e) => {
            this.opacity = parseInt(e.target.value, 10) / 100;
            $('#paint-opacity-val').textContent = e.target.value;
        };
        $('#paint-stab-slider').oninput = (e) => {
            this.stabilizer = parseInt(e.target.value, 10);
            $('#paint-stab-val').textContent = this.stabilizer;
        };

        // ⭐ Khử răng cưa = chế độ chất lượng cao (path + stamp 2x)
        const aaEl = $('#paint-antialias');
        if (aaEl) {
            aaEl.checked = this.antialias !== false;
            globalThis.__paintBrushHQ = aaEl.checked;
            aaEl.onchange = (e) => {
                this.antialias = e.target.checked;
                globalThis.__paintBrushHQ = this.antialias;
                [this.ctx, this.overlayCtx].forEach(c => {
                    if (c) { c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high'; }
                });
                this._setStatus(this.antialias ? '✨ Chất lượng cao (nét mềm mượt)' : '⚡ Chế độ nhanh');
            };
        }

        // ─── Paper ───
        $('#paint-paper-select').onchange = (e) => {
            const key = e.target.value;
            if (!PAPER_PRESETS[key]) return;
            if (this._hasContent() && !confirm('Đổi khổ giấy sẽ xoá toàn bộ tranh. Tiếp tục?')) {
                e.target.value = this.paperKey;
                return;
            }
            const p = PAPER_PRESETS[key];
            this._resetSelectionState();
            this.paperKey = key;
            this.CANVAS_W = p.w;
            this.CANVAS_H = p.h;
            this._initCanvas();

            this.layers = [];
            this.activeLayerId = null;
            this._history = [];
            this._redoStack = [];
            this._createLayer('Background', { skipHistory: true });

            this._fitCanvas();
            this._updateBrushCursorSize();
            this._setStatus(`Đã đổi khổ giấy: ${p.label}`);
            this._dirty = true;
        };

        // ─── Brushes ───
        $$('[data-brush]').forEach(btn => {
            btn.onclick = () => {
                this.brush = btn.dataset.brush;
                $$('[data-brush]').forEach(b => {
                    const a = b === btn;
                    b.style.background = a ? 'rgba(56,189,248,0.2)' : 'transparent';
                    b.style.borderColor = a ? '#38bdf8' : '#475569';
                    b.style.color = a ? '#38bdf8' : '#94a3b8';
                });
            };
        });

        // ─── Shapes ───
        $$('[data-shape]').forEach(btn => {
            btn.onclick = () => {
                this.shape = btn.dataset.shape;
                $$('[data-shape]').forEach(b => {
                    const a = b === btn;
                    b.style.background = a ? 'rgba(56,189,248,0.2)' : 'transparent';
                    b.style.borderColor = a ? '#38bdf8' : '#475569';
                    b.style.color = a ? '#38bdf8' : '#94a3b8';
                });
                this._curveState = null;
            };
        });

        // ─── Undo / Redo / Clear ───
        $('#paint-undo').onclick = () => this.undo();
        $('#paint-redo').onclick = () => this.redo();
        $('#paint-clear').onclick = () => {
            if (this._history.length === 0) return;
            if (confirm('Xoá toàn bộ?')) this.clearAll();
        };

        // ─── Zoom / Rotate ───
        $('#paint-rotate').onclick = () => {
            this.rotation = (this.rotation + 90) % 360;
            this._applyTransform();
        };
        $('#paint-zoom-in').onclick = () => this._setZoom(this.zoom * 1.2);
        $('#paint-zoom-out').onclick = () => this._setZoom(this.zoom / 1.2);
        $('#paint-zoom-reset').onclick = () => {
            this.rotation = 0;
            this._fitCanvas();
        };

        // ─── Layer panel ───
        $('#paint-layer-add').onclick = () => this._createLayer();
        $('#paint-layer-dup').onclick = () => this._duplicateLayer();
        $('#paint-layer-del').onclick = () => this._deleteLayer();
        $('#paint-layer-up').onclick = () => this._moveLayer(1);
        $('#paint-layer-down').onclick = () => this._moveLayer(-1);
        $('#paint-layer-opacity').oninput = (e) => {
            const l = this._getActiveLayer();
            if (!l) return;
            l.opacity = parseInt(e.target.value, 10) / 100;
            $('#paint-layer-opacity-val').textContent = e.target.value;
            this._renderComposite();
            this._dirty = true;
        };
        $('#paint-layer-blend').onchange = (e) => {
            const l = this._getActiveLayer();
            if (!l) return;
            l.blendMode = e.target.value;
            this._renderComposite();
            this._dirty = true;
        };

        this._bindCustomModal && this._bindCustomModal();

        // Init state
        this._setDrawMode('normal');
        this._setPenPressure(this.penPressure);
    },

    _setPenPressure(on) {
        this.penPressure = !!on;
        const b = this.overlay && this.overlay.querySelector('#paint-pen-pressure');
        if (!b) return;
        if (this.penPressure) {
            b.textContent = '🖊 Áp lực: Bật';
            b.style.background = 'rgba(245,158,11,0.2)';
            b.style.borderColor = '#f59e0b';
            b.style.color = '#fbbf24';
        } else {
            b.textContent = '🖊 Áp lực: Tắt';
            b.style.background = 'transparent';
            b.style.borderColor = '#475569';
            b.style.color = '#94a3b8';
        }
    },

    _setSize(sz) {
        sz = Math.max(1, Math.min(300, sz));
        this.size = sz;

        if (this.tool === 'eraser') {
            this._eraserSize = sz;
        } else {
            this._brushSize = sz;
        }

        const slider = this.overlay.querySelector('#paint-size-slider');
        const val = this.overlay.querySelector('#paint-size-val');
        if (slider) slider.value = sz;
        if (val) val.textContent = sz;

        this._updateBrushCursorSize();
    },

    _setDrawMode(mode) {
        this.drawMode = mode;
        const $ = (sel) => this.overlay.querySelector(sel);
        const bN = $('#paint-mode-normal');
        const bT = $('#paint-mode-taper');
        const ctl = $('#paint-taper-controls');
        if (!bN || !bT) return;

        if (mode === 'taper') {
            bT.style.background = 'rgba(167,139,250,0.2)';
            bT.style.borderColor = '#a78bfa';
            bT.style.color = '#a78bfa';
            bN.style.background = 'transparent';
            bN.style.borderColor = '#475569';
            bN.style.color = '#94a3b8';
            if (ctl) ctl.style.display = 'flex';
            this._setStatus('🖋️ Chế độ Tì ngòi');
        } else {
            bN.style.background = 'rgba(56,189,248,0.2)';
            bN.style.borderColor = '#38bdf8';
            bN.style.color = '#38bdf8';
            bT.style.background = 'transparent';
            bT.style.borderColor = '#475569';
            bT.style.color = '#94a3b8';
            if (ctl) ctl.style.display = 'none';
            this._setStatus('📏 Chế độ Vẽ thường');
        }
    },

    _updateToolPanels() {
        const $ = (sel) => this.overlay.querySelector(sel);
        $('#paint-brush-group').style.display = this.tool === 'brush' ? 'flex' : 'none';
        $('#paint-shape-group').style.display = this.tool === 'shape' ? 'flex' : 'none';
        $('#paint-select-group').style.display = this.tool === 'select' ? 'flex' : 'none';
        $('#paint-fill-group').style.display = this.tool === 'fill' ? 'flex' : 'none';
    },

    _updateCursor() {
        const usesCustomCursor = ['brush', 'eraser'].includes(this.tool);
        this.canvasWrap.style.cursor = usesCustomCursor
            ? 'none'
            : (this.tool === 'pan' ? 'grab' : 'crosshair');
        if (!usesCustomCursor) {
            this.brushCursor.style.display = 'none';
        } else {
            this._updateBrushCursorSize();
        }
    },

    _updateBrushCursorSize() {
        if (!this.brushCursor) return;
        const sz = Math.max(6, this._getEffectiveSize() * this.zoom + 4);
        this.brushCursor.style.width = `${sz}px`;
        this.brushCursor.style.height = `${sz}px`;
        const isEraser = this.tool === 'eraser';
        const c = isEraser ? '#ff6b6b' : (this.color || '#38bdf8');
        this.brushCursor.style.border = `2px solid ${c}`;
        this.brushCursor.style.background = isEraser
            ? 'rgba(255,107,107,0.15)'
            : 'rgba(255,255,255,0.15)';
        this.brushCursor.style.boxShadow = `0 0 0 1px rgba(0,0,0,0.7), inset 0 0 0 1px rgba(255,255,255,0.6), 0 0 8px ${c}88`;
    },

    _switchTool(toolId) {
        const oldTool = this.tool;

        if (oldTool === 'eraser') {
            this._eraserSize = this.size;
        } else if (['brush', 'shape'].includes(oldTool)) {
            this._brushSize = this.size;
        }

        this.tool = toolId;

        if (toolId === 'eraser') {
            this.size = this._eraserSize ?? 80;
        } else if (['brush', 'shape'].includes(toolId)) {
            this.size = this._brushSize ?? 8;
        }

        const slider = this.overlay.querySelector('#paint-size-slider');
        const val = this.overlay.querySelector('#paint-size-val');
        if (slider) slider.value = this.size;
        if (val) val.textContent = this.size;

        this.overlay.querySelectorAll('[data-tool]').forEach(b =>
            b.classList.toggle('paint-tool-active', b.dataset.tool === toolId)
        );

        this._updateToolPanels();
        this._updateCursor();
        this._updateBrushCursorSize();
        if (toolId !== 'select' && this._selection && !this._floatingShape) {
            this._commitSelection();
        }
    },
};