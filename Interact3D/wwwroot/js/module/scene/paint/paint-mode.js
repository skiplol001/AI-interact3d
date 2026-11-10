// ═══════════════════════════════════════════════════════════════
// paint-mode.js — v19.0 (Patch-Undo · Stamp Brush · Ảnh→Sketch · Autosave IndexedDB)
// ═══════════════════════════════════════════════════════════════
import { PAPER_PRESETS, DRAFT_KEY, createOverlayHtml, feedbackMixin, escapeHtml, } from './paint-ui.js?v=6';
import {
    galleryMixin, serializeLayers, deserializeLayers,
    savePaletteToDB, draftPut, draftGet, draftDelete,
} from './paint-gallery.js?v=5';
import { toolsMixin } from './paint-tools.js?v=11';
import { brushMixin } from './paint-brush.js?v=5';
import { bindMixin } from './paint-bind.js?v=6';
import { inputMixin } from './paint-input.js?v=6';
import { keyboardMixin } from './paint-keyboard.js?v=4';
import { sketchMixin } from './paint-sketch.js?v=1';
import { renderLayers } from './paint-engine.js?v=10';

const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const HUD_IDS = [
    'ai-command-bar', 'tool-active-badge', 'mood-hud',
    'grab-height-hud', 'slingshot-hint', 'slingshot-controls-ui',
];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8.0;
const AUTOSAVE_TICK_MS = 1000;
const AUTOSAVE_DEBOUNCE_TICKS = 3;
const MAX_HISTORY = 100;

export class PaintController {
    constructor(options = {}) {
        this.onDone = options.onDone || (async () => ({ text: '', subject: 'khác' }));
        this.onExit = options.onExit || (() => { });
        this.getMode = options.getMode || (() => 'normal');
        this.getMood = options.getMood || (() => 50);

        this.isOpen = false;
        this.isProcessing = false;

        this.overlay = null;
        this.canvasWrap = null;
        this.container = null;
        this.canvas = null;
        this.ctx = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;
        this.gridCanvas = null;
        this.gridCtx = null;
        this.brushCursor = null;

        this.tool = 'brush';
        this.brush = 'round';
        this.shape = 'line';
        this.color = '#ef4444';
        this.size = 8;
        this._brushSize = 8;
        this._eraserSize = 80;
        this.opacity = 1.0;
        this.symmetry = 'none';
        this.grid = 'none';
        this.stabilizer = 2;
        this.penPressure = true;
        this.fillAll = true;
        this.fillTol = 36;

        this.drawMode = 'normal';
        this.pressureStrength = 3;
        this.taperLength = 3;

        this.paperKey = '4:3';
        this.CANVAS_W = PAPER_PRESETS['4:3'].w;
        this.CANVAS_H = PAPER_PRESETS['4:3'].h;

        // LAYER STATE
        this.layers = [];
        this.activeLayerId = null;
        this._nextLayerId = 1;

        this._history = [];
        this._redoStack = [];

        this._currentStroke = null;
        this._stampers = [];
        this._eraseSnap = null;
        this._shapeStart = null;
        this._isDrawing = false;
        this._isPanning = false;
        this._dirty = false;

        this._currentBase64 = null;
        this._currentSubject = 'khác';
        this._currentDrawingId = null;
        this._currentDrawingName = null;

        this.zoom = 1.0;
        this.panX = 0;
        this.panY = 0;
        this.rotation = 0;
        this._panStart = null;
        this._rectCache = null;

        this._pendingPointerQueue = [];
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._lastRawCanvasPt = null;
        this._stabilizedPoint = null;
        this._lastPointTime = 0;

        this._selection = null;
        this._selectDrag = null;
        this._movingPixels = null;
        this._selSrcRect = null;
        this._selSrcBefore = null;
        this._moveStart = null;
        this._isMovingSelection = false;
        this._selectionAnimFrame = 0;
        this._floatingShape = false;

        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;
        this._curveState = null;

        this._autoSaveTick = null;
        this._autoSaveCountdown = 0;
        this._savingDraft = false;
        this._draftBannerEl = null;
        this._draftSaveFailed = false;
        this._thumbTimer = null;

        this._sketchOpts = null;
        this._sketchLoad = null;

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onResize = this._onResize.bind(this);
        this._onPaste = this._onPaste.bind(this);
        this._renderLoop = this._renderLoop.bind(this);

        console.log('[Paint] Ready (v19.0 — Patch-Undo + Stamp Brush + Ảnh→Sketch)');
    }

    open() {
        if (this.isOpen) return;
        this.isOpen = true;
        this._dirty = false;
        this._draftSaveFailed = false;
        window.__pause3D = true;
        this._hideHUD();
        this._createOverlay();
        this._loadDraftStrokes();
        this._startAutoSaveLoop();

        this.container.addEventListener('pointerdown', this._onPointerDown);
        window.addEventListener('pointermove', this._onPointerMove);
        window.addEventListener('pointerup', this._onPointerUp);
        window.addEventListener('pointercancel', this._onPointerUp);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('paste', this._onPaste);
        this.canvasWrap.addEventListener('wheel', this._onWheel, { passive: false });
        window.addEventListener('resize', this._onResize);
    }

    close() {
        if (!this.isOpen) return;
        this.isOpen = false;
        window.__pause3D = false;

        if (this.container) this.container.removeEventListener('pointerdown', this._onPointerDown);
        window.removeEventListener('pointermove', this._onPointerMove);
        window.removeEventListener('pointerup', this._onPointerUp);
        window.removeEventListener('pointercancel', this._onPointerUp);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('paste', this._onPaste);
        if (this.canvasWrap) this.canvasWrap.removeEventListener('wheel', this._onWheel);
        window.removeEventListener('resize', this._onResize);

        this._stopAutoSaveLoop();
        clearTimeout(this._thumbTimer);
        if (this._draftBannerEl) {
            this._draftBannerEl.remove();
            this._draftBannerEl = null;
        }

        const panel = document.getElementById('paint-feedback-panel');
        if (panel) panel.remove();
        const gallery = document.getElementById('paint-gallery-modal');
        if (gallery) gallery.remove();
        this._closeSketchDialog();

        this._destroyOverlay();
        this._restoreHUD();

        this._history = [];
        this._redoStack = [];
        this.layers = [];
        this.activeLayerId = null;
        this._currentStroke = null;
        this._stampers = [];
        this._eraseSnap = null;
        this._shapeStart = null;
        this._isDrawing = false;
        this._isPanning = false;
        this._dirty = false;

        this._resetSelectionState();
        this._draftSaveFailed = false;

        this.onExit();
    }

    _hideHUD() {
        this._hiddenHUD = [];
        for (const id of HUD_IDS) {
            const el = document.getElementById(id);
            if (el && el.style.display !== 'none') {
                this._hiddenHUD.push({ el, orig: el.style.display });
                el.style.display = 'none';
            }
        }
    }

    _restoreHUD() {
        for (const { el, orig } of (this._hiddenHUD || [])) el.style.display = orig || '';
    }

    // Dán ảnh (Ctrl+V) → mở hộp thoại Ảnh → Sketch
    _onPaste(e) {
        if (!this.isOpen) return;
        const tag = e.target && e.target.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        const items = (e.clipboardData && e.clipboardData.items) || [];
        for (const it of items) {
            if (it.type && it.type.startsWith('image/')) {
                const f = it.getAsFile();
                if (f) {
                    e.preventDefault();
                    this._openSketchDialog(f);
                    return;
                }
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // HISTORY
    // ═══════════════════════════════════════════════════════════
    _pushHistory(action) {
        this._history.push(action);
        if (this._history.length > MAX_HISTORY) this._history.shift();
        this._redoStack = [];
    }

    _touch(layer) {
        if (!layer) return;
        layer._rev = (layer._rev || 0) + 1;
        this._scheduleThumb();
    }

    // ═══════════════════════════════════════════════════════════
    // LAYER LOGIC
    // ═══════════════════════════════════════════════════════════
    _createLayer(name = null, opts = {}) {
        const { skipHistory = false, insertAbove = true } = opts;
        if (!name) name = `Layer ${this._nextLayerId++}`;

        const canvas = document.createElement('canvas');
        canvas.width = this.CANVAS_W;
        canvas.height = this.CANVAS_H;
        const ctx = canvas.getContext('2d');

        const layer = {
            id: 'layer_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name, canvas, ctx,
            visible: true, opacity: 1, blendMode: 'source-over', locked: false,
            _rev: 1,
        };

        let idx = this.layers.length;
        if (insertAbove && this.activeLayerId) {
            const ai = this.layers.findIndex(l => l.id === this.activeLayerId);
            if (ai !== -1) idx = ai + 1;
        }
        this.layers.splice(idx, 0, layer);
        this.activeLayerId = layer.id;

        if (!skipHistory) {
            this._pushHistory({ type: 'layer_add', layer, index: idx });
            this._dirty = true;
        }
        this._renderComposite();
        this._renderLayerUI();
        return layer;
    }

    _deleteLayer() {
        if (this.layers.length <= 1) {
            this._setStatus('⚠️ Không thể xoá layer duy nhất');
            return;
        }
        if (this._selection) this._commitSelection();
        const idx = this.layers.findIndex(l => l.id === this.activeLayerId);
        if (idx === -1) return;

        const deleted = this.layers.splice(idx, 1)[0];
        this.activeLayerId = this.layers[Math.max(0, idx - 1)].id;

        this._pushHistory({ type: 'layer_del', layer: deleted, index: idx });
        this._renderComposite();
        this._renderLayerUI();
        this._dirty = true;
    }

    _duplicateLayer() {
        const layer = this._getActiveLayer();
        if (!layer) return;
        if (this._selection) this._commitSelection();
        const nl = this._createLayer(layer.name + ' copy', { skipHistory: true });
        nl.ctx.drawImage(layer.canvas, 0, 0);
        nl.opacity = layer.opacity;
        nl.blendMode = layer.blendMode;
        this._touch(nl);

        this._pushHistory({ type: 'layer_add', layer: nl, index: this.layers.indexOf(nl) });
        this._renderComposite();
        this._renderLayerUI();
        this._dirty = true;
    }

    _moveLayer(dir) {
        const idx = this.layers.findIndex(l => l.id === this.activeLayerId);
        if (idx === -1) return;
        const to = idx + dir;
        if (to < 0 || to >= this.layers.length) return;
        const [l] = this.layers.splice(idx, 1);
        this.layers.splice(to, 0, l);
        this._renderComposite();
        this._renderLayerUI();
        this._dirty = true;
    }

    _setActiveLayer(id) {
        if (this.activeLayerId === id) return;
        if (this._selection) this._commitSelection();
        this.activeLayerId = id;
        this._renderLayerUI();
    }

    _removeLayerById(id) {
        const idx = this.layers.findIndex(l => l.id === id);
        if (idx === -1) return;
        this.layers.splice(idx, 1);
        if (this.activeLayerId === id) {
            this.activeLayerId = this.layers[Math.max(0, idx - 1)]?.id || null;
        }
    }

    _insertLayer(layer, index) {
        const i = Math.min(Math.max(0, index), this.layers.length);
        this.layers.splice(i, 0, layer);
        this.activeLayerId = layer.id;
    }

    _scheduleThumb() {
        clearTimeout(this._thumbTimer);
        this._thumbTimer = setTimeout(() => this._refreshThumbs(), 250);
    }

    _refreshThumbs() {
        if (!this.overlay) return;
        const list = this.overlay.querySelector('#paint-layer-list');
        if (!list) return;
        const W = this.CANVAS_W, H = this.CANVAS_H;
        const sc = Math.min(40 / W, 40 / H);
        const dw = W * sc, dh = H * sc;
        list.querySelectorAll('canvas[data-thumb]').forEach(c => {
            const l = this.layers.find(x => x.id === c.dataset.thumb);
            if (!l) return;
            const g = c.getContext('2d');
            g.clearRect(0, 0, 40, 40);
            g.fillStyle = '#fff';
            g.fillRect(0, 0, 40, 40);
            g.drawImage(l.canvas, (40 - dw) / 2, (40 - dh) / 2, dw, dh);
        });
    }

    _renderLayerUI() {
        if (!this.overlay) return;
        const list = this.overlay.querySelector('#paint-layer-list');
        if (!list) return;

        list.innerHTML = this.layers.slice().reverse().map(l => {
            const active = l.id === this.activeLayerId ? 'active' : '';
            const visIcon = l.visible ? '👁' : '🚫';
            const lockIcon = l.locked ? '🔒' : '🔓';
            return `
                <div class="layer-item ${active}" data-id="${l.id}">
                    <canvas class="layer-thumb" width="40" height="40" data-thumb="${l.id}"></canvas>
                    <div class="layer-info">
                        <div class="layer-name" title="Nhấp đúp để đổi tên">${escapeHtml(l.name)}</div>
                        <div class="layer-controls">
                            <button class="layer-btn lb-vis" data-id="${l.id}">${visIcon}</button>
                            <button class="layer-btn lb-lock" data-id="${l.id}">${lockIcon}</button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this._refreshThumbs();

        list.querySelectorAll('.layer-item').forEach(item => {
            item.onclick = (e) => {
                if (e.target.closest('.layer-btn')) return;
                this._setActiveLayer(item.dataset.id);
            };
            item.ondblclick = (e) => {
                if (e.target.closest('.layer-btn')) return;
                const l = this.layers.find(x => x.id === item.dataset.id);
                if (!l) return;
                const n = prompt('Tên layer:', l.name);
                if (n && n.trim()) {
                    l.name = n.trim();
                    this._renderLayerUI();
                    this._dirty = true;
                }
            };
        });

        list.querySelectorAll('.lb-vis').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const l = this.layers.find(x => x.id === btn.dataset.id);
                if (l) {
                    l.visible = !l.visible;
                    this._renderLayerUI();
                    this._renderComposite();
                    this._dirty = true;
                }
            };
        });
        list.querySelectorAll('.lb-lock').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                const l = this.layers.find(x => x.id === btn.dataset.id);
                if (l) {
                    l.locked = !l.locked;
                    this._renderLayerUI();
                    this._dirty = true;
                }
            };
        });

        // Đồng bộ ô độ mờ / blend của layer đang chọn
        const act = this._getActiveLayer();
        const op = this.overlay.querySelector('#paint-layer-opacity');
        const opv = this.overlay.querySelector('#paint-layer-opacity-val');
        const bl = this.overlay.querySelector('#paint-layer-blend');
        if (act && op && opv && bl) {
            op.value = Math.round(act.opacity * 100);
            opv.textContent = op.value;
            bl.value = act.blendMode;
        }
    }

    // ═══════════════════════════════════════════════════════════
    // EXPORT
    // ═══════════════════════════════════════════════════════════
    _exportImage() {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.CANVAS_W;
        tempCanvas.height = this.CANVAS_H;
        const tctx = tempCanvas.getContext('2d');
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, this.CANVAS_W, this.CANVAS_H);

        renderLayers(tctx, this.layers, this.CANVAS_W, this.CANVAS_H);

        tempCanvas.toBlob((blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `Tranh_${Date.now()}.jpg`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 2000);
            this._setStatus('📤 Đã xuất ảnh!');
        }, 'image/jpeg', 1.0);
    }

    // ═══════════════════════════════════════════════════════════
    // PALETTE CUSTOM
    // ═══════════════════════════════════════════════════════════
    async _savePalettePrompt() {
        const name = prompt('Đặt tên cho bảng màu này:');
        if (!name) return;

        const colorBtns = Array.from(this.overlay.querySelectorAll('[data-color]'));
        const colors = colorBtns.map(b => b.dataset.color);

        try {
            await savePaletteToDB({ id: 'pal_' + Date.now(), name, colors });
            this._setStatus(`🎨 Đã lưu bảng màu "${name}"`);
        } catch (e) {
            this._setStatus('⚠️ Lỗi lưu bảng màu');
        }
    }

    // ═══════════════════════════════════════════════════════════
    // AUTO-SAVE (IndexedDB, bất đồng bộ — không đóng băng UI)
    // ═══════════════════════════════════════════════════════════
    _startAutoSaveLoop() {
        this._stopAutoSaveLoop();
        this._autoSaveCountdown = 0;
        this._autoSaveTick = setInterval(() => {
            if (!this.isOpen || this._draftSaveFailed) return;
            const busy = this._isDrawing || this._isMovingSelection || this._isRotating || this._isPanning;
            if (this._dirty && !this.isProcessing && !busy && !this._savingDraft) {
                this._autoSaveCountdown++;
                if (this._autoSaveCountdown >= AUTOSAVE_DEBOUNCE_TICKS) {
                    this._autoSaveCountdown = 0;
                    this._saveDraftStrokes(true);
                }
            } else {
                this._autoSaveCountdown = 0;
            }
        }, AUTOSAVE_TICK_MS);
    }

    _stopAutoSaveLoop() {
        if (this._autoSaveTick) {
            clearInterval(this._autoSaveTick);
            this._autoSaveTick = null;
        }
        this._autoSaveCountdown = 0;
    }

    async _saveDraftStrokes(silent = true) {
        if (this._draftSaveFailed || this._savingDraft) return false;
        this._savingDraft = true;
        this._dirty = false; // thay đổi mới trong lúc lưu sẽ bật lại cờ này
        try {
            const layers = await serializeLayers(this.layers);
            await draftPut({
                version: 4,
                layers,
                paperKey: this.paperKey,
                canvasW: this.CANVAS_W,
                canvasH: this.CANVAS_H,
                drawMode: this.drawMode,
                color: this.color,
                size: this.size,
                brush: this.brush,
                shape: this.shape,
                tool: this.tool,
                opacity: this.opacity,
                stabilizer: this.stabilizer,
                symmetry: this.symmetry,
                ts: Date.now(),
            });
            if (!silent) this._setStatus('💾 Đã lưu nháp');
            return true;
        } catch (e) {
            this._dirty = true;
            if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
                this._draftSaveFailed = true;
                this._setStatus('⚠️ Bộ nhớ đầy! Tự động lưu đã tắt.');
            }
            return false;
        } finally {
            this._savingDraft = false;
        }
    }

    _syncControls() {
        if (!this.overlay) return;
        const $ = (s) => this.overlay.querySelector(s);
        const set = (sel, v) => { const el = $(sel); if (el) el.value = v; };
        const txt = (sel, v) => { const el = $(sel); if (el) el.textContent = v; };
        set('#paint-opacity-slider', Math.round(this.opacity * 100));
        txt('#paint-opacity-val', Math.round(this.opacity * 100));
        set('#paint-stab-slider', this.stabilizer);
        txt('#paint-stab-val', this.stabilizer);
        set('#paint-color-input', this.color);
        set('#paint-paper-select', this.paperKey);
    }

    async _loadDraftStrokes() {
        try {
            let d = null;
            let legacy = false;
            try { d = await draftGet(); } catch { }
            if (!d) {
                try {
                    const raw = localStorage.getItem(DRAFT_KEY);
                    if (raw) { d = JSON.parse(raw); legacy = true; }
                } catch { }
            }
            if (!d) return;
            if (!d.ts || Date.now() - d.ts > DRAFT_MAX_AGE_MS) {
                this._clearDraft();
                return;
            }
            if (!this.isOpen || this._dirty || this._history.length > 0) return;
            if (!Array.isArray(d.layers) || d.layers.length === 0) return;

            this.paperKey = d.paperKey || '4:3';
            this.CANVAS_W = d.canvasW || PAPER_PRESETS['4:3'].w;
            this.CANVAS_H = d.canvasH || PAPER_PRESETS['4:3'].h;
            this.drawMode = d.drawMode || 'normal';
            this.color = d.color || '#ef4444';
            this.size = d.size || 8;
            this.brush = d.brush || 'round';
            this.shape = d.shape || 'line';
            this.tool = d.tool || 'brush';
            this.opacity = d.opacity ?? 1;
            this.stabilizer = d.stabilizer ?? 1;
            this.symmetry = d.symmetry || 'none';

            const layers = await deserializeLayers(d.layers, this.CANVAS_W, this.CANVAS_H);
            if (!this.isOpen) return;

            this._initCanvas();
            this.layers = layers;
            this.activeLayerId = this.layers[this.layers.length - 1].id;
            this._history = [];
            this._redoStack = [];

            this._renderComposite();
            this._renderLayerUI();
            this._fitCanvas();
            if (this.tool === 'eraser') this._eraserSize = this.size; else this._brushSize = this.size;
            this._switchTool(this.tool);
            this._setDrawMode(this.drawMode);
            this._syncControls();
            this._dirty = false;
            if (legacy) { try { localStorage.removeItem(DRAFT_KEY); } catch { } }
            this._showDraftBanner('📂 Đã khôi phục bản nháp');
        } catch (e) {
            console.warn('[Paint] Load draft error:', e);
        }
    }

    async _clearDraft() {
        this._dirty = false;
        this._draftSaveFailed = false;
        try { localStorage.removeItem(DRAFT_KEY); } catch { }
        try { await draftDelete(); } catch { }
    }

    _showDraftBanner(text) {
        if (this._draftBannerEl) this._draftBannerEl.remove();
        if (!this.canvasWrap) return;

        const el = document.createElement('div');
        el.id = 'paint-draft-banner';
        el.style.cssText = `
            position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
            background: rgba(15,23,42,0.96); border: 1px solid #38bdf8;
            color: #38bdf8; padding: 6px 14px; border-radius: 20px;
            font-family: 'Segoe UI', sans-serif; font-size: 12px; font-weight: 600;
            z-index: 1000010; display: flex; align-items: center; gap: 10px;
            box-shadow: 0 4px 12px rgba(0,0,0,0.4);
            animation: slideUp 0.25s ease; pointer-events: auto;
        `;
        el.innerHTML = `
            <span>${text}</span>
            <button id="paint-draft-clear" style="background: transparent; border: 1px solid #ef4444; color: #ef4444; padding: 2px 10px; border-radius: 10px; font-size: 10px; font-weight: 700; cursor: pointer;">Xoá nháp</button>
            <button id="paint-draft-close" style="background: transparent; border: none; color: #94a3b8; font-size: 14px; cursor: pointer; padding: 0 4px;">✕</button>
        `;
        this.canvasWrap.appendChild(el);
        this._draftBannerEl = el;

        el.querySelector('#paint-draft-clear').onclick = () => {
            this._clearDraft();
            this._resetSelectionState();
            this.layers = [];
            this.activeLayerId = null;
            this._history = [];
            this._redoStack = [];
            this._createLayer('Background', { skipHistory: true });
            this._setStatus('🗑️ Đã xoá bản nháp');
            el.remove();
            this._draftBannerEl = null;
        };
        el.querySelector('#paint-draft-close').onclick = () => {
            el.remove();
            this._draftBannerEl = null;
        };

        setTimeout(() => {
            if (el.parentNode) {
                el.style.transition = 'opacity 0.3s ease';
                el.style.opacity = '0';
                setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
                if (this._draftBannerEl === el) this._draftBannerEl = null;
            }
        }, 6000);
    }

    // ═══════════════════════════════════════════════════════════
    // OVERLAY / CANVAS
    // ═══════════════════════════════════════════════════════════
    _createOverlay() {
        const overlay = document.createElement('div');
        overlay.id = 'paint-overlay';
        overlay.style.cssText = `position: fixed; inset: 0; z-index: 999999; background: #0a0f1a; display: flex; flex-direction: column; font-family: 'Segoe UI', sans-serif; animation: paintFadeIn 0.2s ease;`;
        overlay.innerHTML = createOverlayHtml(this);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.canvasWrap = overlay.querySelector('#paint-canvas-wrap');
        this.container = overlay.querySelector('#paint-container');
        this.canvas = overlay.querySelector('#paint-canvas');
        this.overlayCanvas = overlay.querySelector('#paint-overlay-canvas');
        this.gridCanvas = overlay.querySelector('#paint-grid');
        this.brushCursor = overlay.querySelector('#paint-brush-cursor');

        this._initCanvas();
        this._bindUI();
        this._createLayer('Background', { skipHistory: true });
        this._fitCanvas();
        this._updateBrushCursorSize();
        requestAnimationFrame(this._renderLoop);
    }

    _initCanvas() {
        this.canvas.width = this.CANVAS_W;
        this.canvas.height = this.CANVAS_H;
        this.canvas.style.width = `${this.CANVAS_W}px`;
        this.canvas.style.height = `${this.CANVAS_H}px`;

        this.overlayCanvas.width = this.CANVAS_W;
        this.overlayCanvas.height = this.CANVAS_H;
        this.overlayCanvas.style.width = `${this.CANVAS_W}px`;
        this.overlayCanvas.style.height = `${this.CANVAS_H}px`;
        this.overlayCanvas.style.opacity = '1';

        this.gridCanvas.width = this.CANVAS_W;
        this.gridCanvas.height = this.CANVAS_H;
        this.gridCanvas.style.width = `${this.CANVAS_W}px`;
        this.gridCanvas.style.height = `${this.CANVAS_H}px`;

        this.ctx = this.canvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.gridCtx = this.gridCanvas.getContext('2d');

        [this.ctx, this.overlayCtx, this.gridCtx].forEach(c => {
            c.imageSmoothingEnabled = true;
            c.imageSmoothingQuality = 'high';
        });
    }

    _fitCanvas() {
        const rect = this.canvasWrap.getBoundingClientRect();
        const pad = 40;
        const fitZoom = Math.min(
            (rect.width - pad) / this.CANVAS_W,
            (rect.height - pad) / this.CANVAS_H
        );
        this.zoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, fitZoom));
        this.panX = 0;
        this.panY = 0;
        this._applyTransform();
        this._updateZoomLabel();
    }

    _applyTransform() {
        this.container.style.transform = `translate(calc(-50% + ${this.panX}px), calc(-50% + ${this.panY}px)) scale(${this.zoom}) rotate(${this.rotation}deg)`;
    }

    _updateZoomLabel() {
        const el = this.overlay?.querySelector('#paint-zoom-val');
        if (el) el.textContent = `${Math.round(this.zoom * 100)}%`;
    }

    _destroyOverlay() {
        if (this.overlay?.parentNode) this.overlay.parentNode.removeChild(this.overlay);
        this.overlay = null;
        this.canvas = null;
        this.ctx = null;
        this.overlayCanvas = null;
        this.overlayCtx = null;
        this.gridCanvas = null;
        this.gridCtx = null;
        this.container = null;
        this.canvasWrap = null;
        this.brushCursor = null;
    }

    _setStatus(text) {
        const el = this.overlay?.querySelector('#paint-status');
        if (el) el.textContent = text;
    }

    _setZoom(nz, ax = null, ay = null) {
        nz = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, nz));
        if (Math.abs(nz - this.zoom) < 0.001) return;
        if (ax !== null && ay !== null) {
            const r = this.canvasWrap.getBoundingClientRect();
            const cx = r.width / 2, cy = r.height / 2;
            const mx = ax - cx, my = ay - cy;
            const cpx = (mx - this.panX) / this.zoom;
            const cpy = (my - this.panY) / this.zoom;
            this.panX = mx - cpx * nz;
            this.panY = my - cpy * nz;
        }
        this.zoom = nz;
        this._applyTransform();
        this._updateZoomLabel();
        this._updateBrushCursorSize();
    }

    _onWheel(e) {
        if (!this.isOpen) return;
        e.preventDefault();
        const r = this.canvasWrap.getBoundingClientRect();
        const delta = -Math.sign(e.deltaY) * 0.15;
        this._setZoom(
            this.zoom * (1 + delta),
            e.clientX - r.left,
            e.clientY - r.top
        );
    }

    _computeRects() {
        return {
            canvas: this.canvas.getBoundingClientRect(),
            wrap: this.canvasWrap.getBoundingClientRect(),
        };
    }

    _getCanvasPoint(e) {
        const rc = this._rectCache;
        const rect = rc ? rc.canvas : this.canvas.getBoundingClientRect();
        if (this.rotation === 0) {
            const sx = this.canvas.width / (rect.width || 1);
            const sy = this.canvas.height / (rect.height || 1);
            return {
                x: (e.clientX - rect.left) * sx,
                y: (e.clientY - rect.top) * sy,
            };
        }
        const wr = rc ? rc.wrap : this.canvasWrap.getBoundingClientRect();
        const cx = wr.left + wr.width / 2;
        const cy = wr.top + wr.height / 2;
        const dx = (e.clientX - cx - this.panX) / this.zoom;
        const dy = (e.clientY - cy - this.panY) / this.zoom;
        const rad = -this.rotation * Math.PI / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
        return {
            x: rx + this.CANVAS_W / 2,
            y: ry + this.CANVAS_H / 2,
        };
    }

    _onResize() {
        if (this.isOpen) this._fitCanvas();
    }

    // ═══════════════════════════════════════════════════════════
    // UNDO / REDO — patch-based (khôi phục đúng vùng đã đổi, không replay)
    // ═══════════════════════════════════════════════════════════
    _applyAction(a, dir) {
        if (a.type === 'patch') {
            const l = this.layers.find(x => x.id === a.layerId);
            if (!l) return;
            l.ctx.clearRect(a.x, a.y, a.w, a.h);
            l.ctx.drawImage(dir === 'undo' ? a.before : a.after, a.x, a.y);
            this._touch(l);
        } else if (a.type === 'layer_add') {
            if (dir === 'undo') this._removeLayerById(a.layer.id);
            else this._insertLayer(a.layer, a.index);
        } else if (a.type === 'layer_del') {
            if (dir === 'undo') this._insertLayer(a.layer, a.index);
            else this._removeLayerById(a.layer.id);
        }
        this._renderLayerUI();
    }

    undo() {
        if (this._isDrawing && this._currentStroke) {
            this._cancelCurrentStroke();
            this._setStatus('↶ Đã huỷ nét đang vẽ');
            return;
        }
        if (this._floatingShape && this._movingPixels) {
            this._cancelFloating();
            this._setStatus('↶ Đã huỷ hình đang tạo');
            return;
        }
        if (this._selection) {
            this._commitSelection();
            this._setStatus('↶ Đã bỏ chọn');
            return;
        }
        if (this._curveState) {
            this._curveState = null;
            this._isDrawing = false;
            this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            this._setStatus('↶ Đã huỷ đường cong');
            return;
        }

        if (this._history.length === 0) {
            this._setStatus('↶ Không có gì để undo');
            return;
        }

        const action = this._history.pop();
        this._redoStack.push(action);
        this._applyAction(action, 'undo');

        this._renderComposite();
        this._dirty = true;
        this._setStatus(`↶ Undo · ${this._history.length} thao tác`);
    }

    redo() {
        if (this._isDrawing || this._floatingShape || this._selection || this._curveState) return;
        if (this._redoStack.length === 0) {
            this._setStatus('↷ Không có gì để redo');
            return;
        }

        const action = this._redoStack.pop();
        this._history.push(action);
        this._applyAction(action, 'redo');

        this._renderComposite();
        this._dirty = true;
        this._setStatus(`↷ Redo · ${this._history.length} thao tác`);
    }

    clearAll() {
        this._resetSelectionState();
        this.layers.forEach(l => {
            l.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            this._touch(l);
        });
        this._history = [];
        this._redoStack = [];
        this._renderComposite();
        this._renderLayerUI();
        this._dirty = true;
        this._setStatus('Đã xoá hết');
    }

    // ═══════════════════════════════════════════════════════════
    // DONE / EXPORT
    // ═══════════════════════════════════════════════════════════
    async _handleDone() {
        if (this.isProcessing) return;
        if (this._history.length === 0 && !this._hasContent()) {
            alert('Bạn chưa vẽ gì!');
            return;
        }
        this.isProcessing = true;
        const btn = this.overlay.querySelector('#paint-done');
        btn.disabled = true;
        btn.textContent = '⏳ Đang xem...';
        btn.style.opacity = '0.6';

        this._commitSelection();

        const saved = await this._saveToGallery();
        if (saved) this._setStatus('💾 Đã lưu vào thư viện');

        this._currentBase64 = this._exportForAI();

        try {
            const result = await this.onDone(this._currentBase64);
            this._currentSubject = result.subject || 'khác';
            this._showFeedbackPanel(result);
        } catch (e) {
            console.error('[Paint] onDone error:', e);
            this._showFeedbackPanel({ text: '(Bạn vẽ đẹp đấy, mình thích!)', subject: 'khác' });
        } finally {
            this.isProcessing = false;
            if (this.overlay) {
                btn.disabled = false;
                btn.textContent = '✨ Hoàn thiện';
                btn.style.opacity = '1';
            }
        }
    }

    _hasContent() {
        const temp = document.createElement('canvas');
        temp.width = this.CANVAS_W;
        temp.height = this.CANVAS_H;
        renderLayers(temp.getContext('2d'), this.layers, this.CANVAS_W, this.CANVAS_H);
        try {
            const data = temp.getContext('2d').getImageData(0, 0, this.CANVAS_W, this.CANVAS_H).data;
            for (let i = 3; i < data.length; i += 400) {
                if (data[i] > 0) return true;
            }
            return false;
        } catch { return false; }
    }

    _exportForAI() {
        const max = 1024;
        let w = this.CANVAS_W, h = this.CANVAS_H;
        if (Math.max(w, h) > max) {
            const s = max / Math.max(w, h);
            w = Math.round(w * s);
            h = Math.round(h * s);
        }
        const t = document.createElement('canvas');
        t.width = w;
        t.height = h;
        const tc = t.getContext('2d');
        tc.fillStyle = '#ffffff';
        tc.fillRect(0, 0, w, h);

        for (const layer of this.layers) {
            if (!layer.visible) continue;
            tc.save();
            tc.globalAlpha = layer.opacity;
            tc.globalCompositeOperation = layer.blendMode;
            tc.drawImage(layer.canvas, 0, 0, w, h);
            tc.restore();
        }

        return t.toDataURL('image/jpeg', 0.85);
    }

    dispose() {
        this.close();
    }
}

// ═══════════════════════════════════════════════════════════════
// APPLY MIXINS
// ═══════════════════════════════════════════════════════════════
Object.assign(PaintController.prototype,
    feedbackMixin,
    galleryMixin,
    toolsMixin,
    brushMixin,
    bindMixin,
    inputMixin,
    keyboardMixin,
    sketchMixin,
);