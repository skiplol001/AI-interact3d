// ═══════════════════════════════════════════════════════════════
// paint-gallery.js — v5 (IndexedDB: tranh + bảng màu + bản nháp · Blob PNG bất đồng bộ)
// ═══════════════════════════════════════════════════════════════
import { escapeHtml } from './paint-ui.js?v=6';

const DB_NAME = 'paint_studio_db';
const DB_VERSION = 3; // ⭐ v3: thêm store "drafts"
const STORE_DRAWINGS = 'drawings';
const STORE_PALETTES = 'palettes';
const STORE_DRAFTS = 'drafts';
const DRAFT_ID = 'current';

let _dbPromise = null;

export function openGalleryDB() {
    if (_dbPromise) return _dbPromise;
    _dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = (e) => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_DRAWINGS)) {
                const store = db.createObjectStore(STORE_DRAWINGS, { keyPath: 'id' });
                store.createIndex('ts', 'ts');
            }
            if (!db.objectStoreNames.contains(STORE_PALETTES)) {
                db.createObjectStore(STORE_PALETTES, { keyPath: 'id' });
            }
            if (!db.objectStoreNames.contains(STORE_DRAFTS)) {
                db.createObjectStore(STORE_DRAFTS, { keyPath: 'id' });
            }
        };
        req.onsuccess = () => {
            const db = req.result;
            db.onversionchange = () => { db.close(); _dbPromise = null; };
            resolve(db);
        };
        req.onerror = () => { _dbPromise = null; reject(req.error); };
    });
    return _dbPromise;
}

function _tx(store, mode, fn) {
    return openGalleryDB().then(db => new Promise((res, rej) => {
        const tx = db.transaction(store, mode);
        let out;
        try { out = fn(tx.objectStore(store)); } catch (e) { rej(e); return; }
        tx.oncomplete = () => res(out && 'result' in out ? out.result : true);
        tx.onerror = () => rej(tx.error);
        tx.onabort = () => rej(tx.error);
    }));
}

export function galleryPut(item) { return _tx(STORE_DRAWINGS, 'readwrite', s => s.put(item)); }

export async function galleryGetAll() {
    const r = await _tx(STORE_DRAWINGS, 'readonly', s => s.getAll());
    return (r || []).sort((a, b) => b.ts - a.ts);
}

export async function galleryGet(id) {
    const r = await _tx(STORE_DRAWINGS, 'readonly', s => s.get(id));
    return r || null;
}

export function galleryDelete(id) { return _tx(STORE_DRAWINGS, 'readwrite', s => s.delete(id)); }
export function galleryClear() { return _tx(STORE_DRAWINGS, 'readwrite', s => s.clear()); }

// ═══════════════════════════════════════════════════════════════
// PALETTE
// ═══════════════════════════════════════════════════════════════
export function savePaletteToDB(palette) { return _tx(STORE_PALETTES, 'readwrite', s => s.put(palette)); }
export async function getPalettesFromDB() {
    const r = await _tx(STORE_PALETTES, 'readonly', s => s.getAll());
    return r || [];
}

// ═══════════════════════════════════════════════════════════════
// ⭐ DRAFT (tự động lưu) — nằm trong IndexedDB, không còn dính giới hạn 5MB của localStorage
// ═══════════════════════════════════════════════════════════════
export function draftPut(data) { return _tx(STORE_DRAFTS, 'readwrite', s => s.put({ ...data, id: DRAFT_ID })); }
export async function draftGet() {
    const r = await _tx(STORE_DRAFTS, 'readonly', s => s.get(DRAFT_ID));
    return r || null;
}
export function draftDelete() { return _tx(STORE_DRAFTS, 'readwrite', s => s.delete(DRAFT_ID)); }

// ═══════════════════════════════════════════════════════════════
// ⭐ SERIALIZATION (Layer → Blob PNG, bất đồng bộ + cache theo _rev)
// ═══════════════════════════════════════════════════════════════
function canvasToBlob(canvas) {
    return new Promise((res, rej) => {
        canvas.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png');
    });
}

export async function serializeLayers(layers) {
    const out = [];
    for (const l of layers) {
        const rev = l._rev || 0;
        let blob = l._blob;
        if (!blob || l._blobRev !== rev) {
            blob = await canvasToBlob(l.canvas);
            l._blob = blob;
            l._blobRev = rev;
        }
        out.push({
            id: l.id, name: l.name, visible: l.visible,
            opacity: l.opacity, blendMode: l.blendMode, locked: l.locked,
            blob,
        });
    }
    return out;
}

function _loadImage(src) {
    return new Promise((res, rej) => {
        const img = new Image();
        img.onload = () => res(img);
        img.onerror = rej;
        img.src = src;
    });
}

export async function deserializeLayers(ser, w, h) {
    const out = [];
    for (const s of ser) {
        let source = null;
        let revoke = null;
        try {
            if (s.blob) {
                if (typeof createImageBitmap === 'function') {
                    source = await createImageBitmap(s.blob);
                } else {
                    revoke = URL.createObjectURL(s.blob);
                    source = await _loadImage(revoke);
                }
            } else if (s.dataUrl) {
                source = await _loadImage(s.dataUrl);
            }
        } catch (e) {
            console.warn('[Gallery] layer decode error:', e);
        }
        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (source) ctx.drawImage(source, 0, 0);
        if (source && source.close) source.close();
        if (revoke) URL.revokeObjectURL(revoke);
        out.push({
            id: s.id, name: s.name, visible: s.visible,
            opacity: s.opacity, blendMode: s.blendMode, locked: s.locked,
            canvas, ctx, _rev: 1,
        });
    }
    return out;
}

export function makeThumbnail(canvas, w, h, TW = 200, TH = 150) {
    const t = document.createElement('canvas');
    t.width = TW;
    t.height = TH;
    const tc = t.getContext('2d');
    tc.fillStyle = '#ffffff';
    tc.fillRect(0, 0, TW, TH);
    const sc = Math.min(TW / w, TH / h);
    const dw = w * sc, dh = h * sc;
    tc.drawImage(canvas, (TW - dw) / 2, (TH - dh) / 2, dw, dh);
    return t.toDataURL('image/jpeg', 0.7);
}

export const galleryMixin = {
    async _saveToGalleryWithPrompt() {
        if (!this._currentDrawingId) {
            const suggested = `Tranh ${new Date().toLocaleString('vi-VN', {
                hour: '2-digit', minute: '2-digit',
                day: '2-digit', month: '2-digit',
            })}`;
            const input = prompt('📝 Đặt tên cho tranh:', suggested);

            if (input === null) {
                this._setStatus('Đã huỷ lưu');
                return false;
            }
            const trimmed = String(input).trim();
            if (!trimmed) {
                this._setStatus('⚠️ Tên không hợp lệ');
                return false;
            }
            this._currentDrawingName = trimmed;
            this._currentDrawingId = 'drw_' + Date.now() + '_' +
                Math.random().toString(36).slice(2, 8);
        }

        const saved = await this._saveToGallery();
        if (saved) {
            this._setStatus(`💾 Đã lưu "${this._currentDrawingName}"`);
            this._showSaveToast(`💾 Đã lưu "${this._currentDrawingName}"`);
        } else {
            this._setStatus('⚠️ Lỗi khi lưu');
        }
        return saved;
    },

    _showSaveToast(text) {
        if (!this.canvasWrap) return;
        const existing = document.getElementById('paint-save-toast');
        if (existing) existing.remove();

        const el = document.createElement('div');
        el.id = 'paint-save-toast';
        el.style.cssText = `
            position: absolute; top: 12px; left: 50%; transform: translateX(-50%);
            background: linear-gradient(135deg, #10b981, #38bdf8);
            color: #fff; padding: 8px 18px; border-radius: 20px;
            font-family: 'Segoe UI', sans-serif; font-size: 13px; font-weight: 700;
            z-index: 1000020; box-shadow: 0 4px 16px rgba(16,185,129,0.4);
            animation: slideUp 0.25s ease; pointer-events: none;
            max-width: 80%; white-space: nowrap; overflow: hidden;
            text-overflow: ellipsis;
        `;
        el.textContent = text;
        this.canvasWrap.appendChild(el);

        setTimeout(() => {
            el.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
            el.style.opacity = '0';
            el.style.transform = 'translateX(-50%) translateY(-20px)';
            setTimeout(() => el.remove(), 300);
        }, 2200);
    },

    async _saveToGallery() {
        try {
            if (!this._currentDrawingId) {
                this._currentDrawingId = 'drw_' + Date.now() + '_' +
                    Math.random().toString(36).slice(2, 8);
            }
            if (!this._currentDrawingName) {
                const existing = await galleryGetAll();
                this._currentDrawingName = `Tranh ${existing.length + 1}`;
            }

            await galleryPut({
                id: this._currentDrawingId,
                name: this._currentDrawingName,
                ts: Date.now(),
                thumb: makeThumbnail(this.canvas, this.CANVAS_W, this.CANVAS_H),
                canvasW: this.CANVAS_W,
                canvasH: this.CANVAS_H,
                paperKey: this.paperKey,
                layers: await serializeLayers(this.layers),
            });
            return true;
        } catch (e) {
            console.warn('[Gallery] Save error:', e);
            return false;
        }
    },

    async _openGallery() {
        let items = [];
        try { items = await galleryGetAll(); } catch (e) { console.warn(e); }

        const old = document.getElementById('paint-gallery-modal');
        if (old) old.remove();

        const modal = document.createElement('div');
        modal.id = 'paint-gallery-modal';
        modal.style.cssText = `position: fixed; inset: 0; z-index: 1000020; background: rgba(10,15,26,0.95); display: flex; flex-direction: column; font-family: 'Segoe UI', sans-serif; backdrop-filter: blur(6px); animation: paintFadeIn 0.2s ease;`;

        const cardsHtml = items.length === 0
            ? `<div style="grid-column: 1/-1; text-align: center; color: #64748b; padding: 60px 20px; font-size: 14px;">📭 Thư viện trống<br><span style="font-size: 12px; color: #475569;">Vẽ xong → "💾 Lưu vào thư viện" để lưu</span></div>`
            : items.map(it => {
                const date = new Date(it.ts).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
                const active = it.id === this._currentDrawingId ? 'active' : '';
                return `<div class="gallery-card ${active}" data-id="${it.id}">
                    <div style="width: 100%; height: 140px; background: #0f172a; display: flex; align-items: center; justify-content: center; overflow: hidden;">
                        <img src="${it.thumb}" style="max-width: 100%; max-height: 100%; object-fit: contain;" />
                    </div>
                    <div style="padding: 8px 10px; background: #0f172a;">
                        <div style="color: #cbd5e1; font-size: 12px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(it.name)}</div>
                        <div style="color: #64748b; font-size: 10px; margin-top: 2px;">${date} · ${it.canvasW}×${it.canvasH}</div>
                        <div style="display: flex; gap: 4px; margin-top: 6px;">
                            <button class="gallery-load-btn" data-id="${it.id}" style="flex: 1; padding: 4px 8px; background: rgba(56,189,248,0.15); border: 1px solid #38bdf8; color: #38bdf8; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">Mở</button>
                            <button class="gallery-del-btn" data-id="${it.id}" style="padding: 4px 8px; background: rgba(239,68,68,0.15); border: 1px solid #ef4444; color: #f87171; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer;">🗑</button>
                        </div>
                    </div>
                </div>`;
            }).join('');

        modal.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 20px; background: rgba(15,23,42,0.98); border-bottom: 1px solid #334155; flex-shrink: 0;">
                <span style="color: #f59e0b; font-size: 18px; font-weight: 700;">🖼️ Thư viện (${items.length})</span>
                <div style="display: flex; gap: 8px;">
                    <button id="gallery-clear-all" style="padding: 6px 12px; background: transparent; border: 1px solid #ef4444; color: #ef4444; border-radius: 6px; font-size: 12px; font-weight: 600; cursor: pointer;">🗑 Xóa tất cả</button>
                    <button id="gallery-close" style="padding: 6px 16px; background: #38bdf8; border: none; color: #0f172a; border-radius: 6px; font-size: 12px; font-weight: 700; cursor: pointer;">Đóng</button>
                </div>
            </div>
            <div style="flex: 1; overflow-y: auto; padding: 20px;">
                <div style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 14px; max-width: 1400px; margin: 0 auto;">${cardsHtml}</div>
            </div>
        `;
        document.body.appendChild(modal);

        modal.querySelector('#gallery-close').onclick = () => modal.remove();

        modal.querySelector('#gallery-clear-all').onclick = async () => {
            if (!confirm('Xoá TẤT CẢ tranh?')) return;
            try {
                await galleryClear();
                this._currentDrawingId = null;
                this._currentDrawingName = null;
                modal.remove();
                this._openGallery();
            } catch (e) { alert('Lỗi: ' + e.message); }
        };

        modal.querySelectorAll('.gallery-load-btn').forEach(btn => {
            btn.onclick = async () => {
                const id = btn.dataset.id;
                modal.remove();
                await this._loadDrawing(id);
            };
        });

        modal.querySelectorAll('.gallery-del-btn').forEach(btn => {
            btn.onclick = async () => {
                if (!confirm('Xoá tranh này?')) return;
                try {
                    await galleryDelete(btn.dataset.id);
                    if (this._currentDrawingId === btn.dataset.id) {
                        this._currentDrawingId = null;
                        this._currentDrawingName = null;
                    }
                    modal.remove();
                    this._openGallery();
                } catch (e) { alert('Lỗi: ' + e.message); }
            };
        });
    },

    async _loadDrawing(id) {
        try {
            const item = await galleryGet(id);
            if (!item) { this._setStatus('Không tìm thấy'); return; }
            if (this.layers.length > 0 && this._dirty && !confirm('Tranh chưa lưu. Tải tranh khác?')) return;

            this._resetSelectionState();
            this._currentDrawingId = item.id;
            this._currentDrawingName = item.name;
            this.CANVAS_W = item.canvasW;
            this.CANVAS_H = item.canvasH;
            this.paperKey = item.paperKey || '4:3';

            this._initCanvas();

            const layers = await deserializeLayers(item.layers || [], this.CANVAS_W, this.CANVAS_H);
            if (!this.isOpen) return;
            this.layers = layers;
            if (this.layers.length === 0) this._createLayer('Background', { skipHistory: true });
            this.activeLayerId = this.layers[this.layers.length - 1].id;
            this._history = [];
            this._redoStack = [];

            this._renderComposite();
            this._renderLayerUI();
            this._dirty = false;
            this._fitCanvas();
            this._updateBrushCursorSize();
            this._setStatus(`Đã mở "${item.name}"`);
        } catch (e) {
            console.warn('[Gallery] Load error:', e);
            this._setStatus('Lỗi mở');
        }
    },
};