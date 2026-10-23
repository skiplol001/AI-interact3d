// ═══════════════════════════════════════════════════════════════
// paint-mode.js — v17.9 (Quota fix + Preview=Final) [Part 1/2]
// ═══════════════════════════════════════════════════════════════
import {
    PAPER_PRESETS, DRAFT_KEY, createOverlayHtml, feedbackMixin,
} from './paint-ui.js?v=3';
import {
    galleryMixin, serializeStrokes, deserializeStrokes,
} from './paint-gallery.js?v=3';
import { toolsMixin } from './paint-tools.js?v=7';
import { brushMixin } from './paint-brush.js?v=2';
import { bindMixin } from './paint-bind.js?v=3';
import { inputMixin } from './paint-input.js?v=3';
import { keyboardMixin } from './paint-keyboard.js?v=2';

// ═══ CONSTANTS ═══
const DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const HUD_IDS = [
    'ai-command-bar', 'tool-active-badge', 'mood-hud',
    'grab-height-hud', 'slingshot-hint', 'slingshot-controls-ui',
];
const MIN_ZOOM = 0.2;
const MAX_ZOOM = 8.0;
const AUTOSAVE_TICK_MS = 1000;
const AUTOSAVE_DEBOUNCE_TICKS = 3;

// ═══════════════════════════════════════════════════════════════
// CONTROLLER
// ═══════════════════════════════════════════════════════════════
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

        this.drawMode = 'normal';
        this.pressureStrength = 3;
        this.taperLength = 3;

        this.paperKey = '4:3';
        this.CANVAS_W = PAPER_PRESETS['4:3'].w;
        this.CANVAS_H = PAPER_PRESETS['4:3'].h;

        this._strokes = [];
        this._redoStack = [];
        this._currentStroke = null;
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

        this._pendingPointerQueue = [];
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._stabilizedPoint = null;
        this._lastPointTime = 0;

        this._selection = null;
        this._selectDrag = null;
        this._movingPixels = null;
        this._moveStart = null;
        this._isMovingSelection = false;
        this._selectionAnimFrame = 0;
        this._floatingShape = false;

        this._floatRotation = 0;
        this._isRotating = false;
        this._rotateStart = null;
        this._rotateHandlePos = null;
        this._rotateHandleRadius = 12;

        this._pixelCache = null;
        this._pixelCanvas = null;
        this._curveState = null;

        this._autoSaveTick = null;
        this._autoSaveCountdown = 0;
        this._draftBannerEl = null;
        this._draftSaveFailed = false; // Chặn spam QuotaExceededError

        this._onPointerDown = this._onPointerDown.bind(this);
        this._onPointerMove = this._onPointerMove.bind(this);
        this._onPointerUp = this._onPointerUp.bind(this);
        this._onKeyDown = this._onKeyDown.bind(this);
        this._onWheel = this._onWheel.bind(this);
        this._onResize = this._onResize.bind(this);
        this._renderLoop = this._renderLoop.bind(this);

        console.log('[Paint] Ready (v17.9 — Quota fix + Preview=Final)');
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
        window.addEventListener('keydown', this._onKeyDown);
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
        window.removeEventListener('keydown', this._onKeyDown);
        if (this.canvasWrap) this.canvasWrap.removeEventListener('wheel', this._onWheel);
        window.removeEventListener('resize', this._onResize);

        this._stopAutoSaveLoop();
        if (this._draftBannerEl) {
            this._draftBannerEl.remove();
            this._draftBannerEl = null;
        }

        const panel = document.getElementById('paint-feedback-panel');
        if (panel) panel.remove();
        const gallery = document.getElementById('paint-gallery-modal');
        if (gallery) gallery.remove();

        this._destroyOverlay();
        this._restoreHUD();

        this._strokes = [];
        this._redoStack = [];
        this._currentStroke = null;
        this._shapeStart = null;
        this._isDrawing = false;
        this._isPanning = false;
        this._dirty = false;
        this._pendingPointerQueue = [];
        this._lastPointerPos = null;
        this._lastRawPoint = null;
        this._stabilizedPoint = null;

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

        this._panStart = null;
        this._curveState = null;
        this._pixelCache = null;
        this._pixelCanvas = null;
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
        for (const { el, orig } of this._hiddenHUD) el.style.display = orig || '';
    }

    // ═══════════════════════════════════════════════════════════
    // AUTO-SAVE LOOP
    // ═══════════════════════════════════════════════════════════
    _startAutoSaveLoop() {
        this._stopAutoSaveLoop();
        this._autoSaveCountdown = 0;
        this._autoSaveTick = setInterval(() => {
            if (!this.isOpen || this._draftSaveFailed) return;
            const busy = this._isDrawing || this._isMovingSelection || this._isRotating || this._isPanning;
            if (this._dirty && !this.isProcessing && !busy) {
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

    // ═══════════════════════════════════════════════════════════
    // DRAFT (localStorage — strokes JSON)
    // ═══════════════════════════════════════════════════════════
    _saveDraftStrokes(silent = true) {
        if (this._draftSaveFailed) return false;
        try {
            const data = {
                version: 2,
                strokes: serializeStrokes(this._strokes),
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
            };
            localStorage.setItem(DRAFT_KEY, JSON.stringify(data));
            this._dirty = false;
            if (!silent) this._setStatus('💾 Đã lưu nháp');
            return true;
        } catch (e) {
            if (e.name === 'QuotaExceededError' || e.code === 22) {
                this._draftSaveFailed = true;
                console.warn('[Paint] LocalStorage full. Auto-save disabled.');
                this._setStatus('⚠️ Bộ nhớ đầy! Tự động lưu nháp đã tắt.');
            } else {
                console.warn('[Paint] Save draft error:', e);
                if (!silent) this._setStatus('⚠️ Lỗi lưu nháp');
            }
            return false;
        }
    }

    async _loadDraftStrokes() {
        try {
            const raw = localStorage.getItem(DRAFT_KEY);
            if (!raw) return;
            const d = JSON.parse(raw);
            if (!d || !d.ts || Date.now() - d.ts > DRAFT_MAX_AGE_MS) {
                localStorage.removeItem(DRAFT_KEY);
                return;
            }

            if (d.strokes && Array.isArray(d.strokes)) {
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
                this.stabilizer = d.stabilizer ?? 2;
                this.symmetry = d.symmetry || 'none';

                this._initCanvas();
                const deser = await deserializeStrokes(d.strokes);
                this._strokes = deser;
                this._redoStack = [];
                this._replayAll();
                this._fitCanvas();
                this._updateBrushCursorSize();
                this._setDrawMode(this.drawMode);
                this._dirty = false;
                this._showDraftBanner('📂 Đã khôi phục bản nháp');
                return;
            }

            if (d.dataUrl) {
                const img = new Image();
                img.onload = () => {
                    this.ctx.drawImage(img, 0, 0, this.CANVAS_W, this.CANVAS_H);
                    this._strokes = [];
                    this._dirty = false;
                    this._showDraftBanner('📂 Đã khôi phục ảnh nháp (không undo được)');
                };
                img.src = d.dataUrl;
            }
        } catch (e) {
            console.warn('[Paint] Load draft error:', e);
        }
    }

    _clearDraft() {
        try { localStorage.removeItem(DRAFT_KEY); } catch { }
        this._dirty = false;
        this._draftSaveFailed = false;
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
            this._strokes = [];
            this._redoStack = [];
            this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
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

    _saveDraft(silent = false) {
        return this._saveDraftStrokes(silent);
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

        this.gridCanvas.width = this.CANVAS_W;
        this.gridCanvas.height = this.CANVAS_H;
        this.gridCanvas.style.width = `${this.CANVAS_W}px`;
        this.gridCanvas.style.height = `${this.CANVAS_H}px`;

        this.ctx = this.canvas.getContext('2d');
        this.overlayCtx = this.overlayCanvas.getContext('2d');
        this.gridCtx = this.gridCanvas.getContext('2d', { willReadFrequently: true });

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

    // ═══════════════════════════════════════════════════════════
    // VIEW HELPERS
    // ═══════════════════════════════════════════════════════════
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

    _getCanvasPoint(e) {
        const rect = this.canvas.getBoundingClientRect();
        if (this.rotation === 0) {
            const sx = this.canvas.width / rect.width;
            const sy = this.canvas.height / rect.height;
            return {
                x: (e.clientX - rect.left) * sx,
                y: (e.clientY - rect.top) * sy,
            };
        }
        const wrapRect = this.canvasWrap.getBoundingClientRect();
        const cx = wrapRect.width / 2 + wrapRect.left;
        const cy = wrapRect.height / 2 + wrapRect.top;
        const dx = e.clientX - cx, dy = e.clientY - cy;
        const rad = -this.rotation * Math.PI / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);
        return {
            x: (rx - this.panX) / this.zoom + this.CANVAS_W / 2,
            y: (ry - this.panY) / this.zoom + this.CANVAS_H / 2,
        };
    }

    _onResize() {
        if (this.isOpen) this._fitCanvas();
    }

    // ═══════════════════════════════════════════════════════════
    // UNDO / REDO — Priority + Guard
    // ═══════════════════════════════════════════════════════════
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
            this.overlayCtx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
            this._setStatus('↶ Đã huỷ đường cong');
            return;
        }

        if (this._strokes.length === 1 && this._strokes[0]?.[0]?.isBaseLayer) {
            this._setStatus('↶ Đây là ảnh đã crop — không thể undo thêm');
            return;
        }
        if (this._strokes.length === 0) {
            this._setStatus('↶ Không có gì để undo');
            return;
        }
        const topGroup = this._strokes[this._strokes.length - 1];
        if (topGroup?.[0]?.isBaseLayer) {
            this._setStatus('↶ Đây là ảnh đã crop — không thể undo thêm');
            return;
        }

        this._redoStack.push(this._strokes.pop());
        this._replayAll();
        this._dirty = true;
        this._setStatus(`↶ Undo · ${this._strokes.length} thao tác`);
    }

    redo() {
        if (this._isDrawing && this._currentStroke) {
            this._setStatus('⚠️ Đang vẽ dở — thả chuột trước khi redo');
            return;
        }
        if (this._floatingShape) {
            this._setStatus('⚠️ Đang có hình chưa đặt — Space/Enter để đặt trước');
            return;
        }
        if (this._selection) {
            this._setStatus('⚠️ Đang có vùng chọn — Space/Enter để bỏ chọn trước');
            return;
        }
        if (this._curveState) {
            this._setStatus('⚠️ Đang vẽ đường cong — Click để hoàn thành trước');
            return;
        }
        if (this._redoStack.length === 0) {
            this._setStatus('↷ Không có gì để redo');
            return;
        }
        this._strokes.push(this._redoStack.pop());
        this._replayAll();
        this._dirty = true;
        this._setStatus(`↷ Redo · ${this._strokes.length} thao tác`);
    }

    clearAll() {
        this._strokes = [];
        this._redoStack = [];
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
        this._curveState = null;
        this._pixelCache = null;
        this._pixelCanvas = null;
        this.ctx.clearRect(0, 0, this.CANVAS_W, this.CANVAS_H);
        this._dirty = true;
        this._setStatus('Đã xoá hết');
    }

    // ═══════════════════════════════════════════════════════════
    // DONE / EXPORT
    // ═══════════════════════════════════════════════════════════
    async _handleDone() {
        if (this.isProcessing) return;
        if (this._strokes.length === 0 && !this._hasContent()) {
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
            btn.disabled = false;
            btn.textContent = '✨ Hoàn thiện';
            btn.style.opacity = '1';
        }
    }

    _hasContent() {
        try {
            const data = this.ctx.getImageData(0, 0, this.CANVAS_W, this.CANVAS_H).data;
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
        tc.drawImage(this.canvas, 0, 0, w, h);
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
);