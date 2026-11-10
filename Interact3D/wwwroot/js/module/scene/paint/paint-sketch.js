// ═══════════════════════════════════════════════════════════════
// paint-sketch.js — v1 (Ảnh chụp / ảnh tải về → Sketch → 1 layer)
// ═══════════════════════════════════════════════════════════════

const _clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

function hexToRgb(hex) {
    let h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    return Number.isNaN(n) ? [0, 0, 0] : [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ─── Gaussian blur (xấp xỉ bằng 3 lần box blur) ───
function boxesForGauss(sigma, n) {
    const wIdeal = Math.sqrt((12 * sigma * sigma) / n + 1);
    let wl = Math.floor(wIdeal);
    if (wl % 2 === 0) wl--;
    const wu = wl + 2;
    const mIdeal = (12 * sigma * sigma - n * wl * wl - 4 * n * wl - 3 * n) / (-4 * wl - 4);
    const m = Math.round(mIdeal);
    const sizes = [];
    for (let i = 0; i < n; i++) sizes.push(i < m ? wl : wu);
    return sizes;
}

function boxBlurH(src, dst, w, h, r) {
    const iarr = 1 / (r + r + 1);
    for (let i = 0; i < h; i++) {
        let ti = i * w, li = ti, ri = ti + r;
        const fv = src[ti], lv = src[ti + w - 1];
        let val = (r + 1) * fv;
        for (let j = 0; j < r; j++) val += src[ti + j];
        for (let j = 0; j <= r; j++) { val += src[ri++] - fv; dst[ti++] = Math.round(val * iarr); }
        for (let j = r + 1; j < w - r; j++) { val += src[ri++] - src[li++]; dst[ti++] = Math.round(val * iarr); }
        for (let j = w - r; j < w; j++) { val += lv - src[li++]; dst[ti++] = Math.round(val * iarr); }
    }
}

function boxBlurV(src, dst, w, h, r) {
    const iarr = 1 / (r + r + 1);
    for (let i = 0; i < w; i++) {
        let ti = i, li = ti, ri = ti + r * w;
        const fv = src[ti], lv = src[ti + w * (h - 1)];
        let val = (r + 1) * fv;
        for (let j = 0; j < r; j++) val += src[ti + j * w];
        for (let j = 0; j <= r; j++) { val += src[ri] - fv; dst[ti] = Math.round(val * iarr); ri += w; ti += w; }
        for (let j = r + 1; j < h - r; j++) { val += src[ri] - src[li]; dst[ti] = Math.round(val * iarr); li += w; ri += w; ti += w; }
        for (let j = h - r; j < h; j++) { val += lv - src[li]; dst[ti] = Math.round(val * iarr); li += w; ti += w; }
    }
}

function gaussBlurU8(arr, w, h, sigma) {
    if (sigma < 0.6) return arr;
    const boxes = boxesForGauss(sigma, 3);
    const a = arr.slice();
    const b = new Uint8ClampedArray(a.length);
    const maxR = ((Math.min(w, h) - 1) >> 1) - 1;
    for (const size of boxes) {
        const r = Math.min((size - 1) >> 1, maxR);
        if (r < 1) continue;
        boxBlurH(a, b, w, h, r);
        boxBlurV(b, a, w, h, r);
    }
    return a;
}

function autoLevels(gray) {
    const hist = new Uint32Array(256);
    for (let i = 0; i < gray.length; i++) hist[gray[i]]++;
    const total = gray.length;
    let acc = 0, lo = 0, hi = 255;
    for (let i = 0; i < 256; i++) { acc += hist[i]; if (acc >= total * 0.01) { lo = i; break; } }
    acc = 0;
    for (let i = 255; i >= 0; i--) { acc += hist[i]; if (acc >= total * 0.01) { hi = i; break; } }
    if (hi - lo < 30) return;
    const lut = new Uint8ClampedArray(256);
    for (let i = 0; i < 256; i++) lut[i] = ((i - lo) * 255) / (hi - lo);
    for (let i = 0; i < gray.length; i++) gray[i] = lut[gray[i]];
}

const smooth = (a, b, x) => {
    const t = _clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
};

/**
 * Biến ImageData ảnh thường → ImageData sketch (nền trong suốt, nét = màu chọn).
 * Thuật toán "color dodge": gray / (1 - blur(invert(gray))).
 */
export function generateSketchData(src, o, scale = 1) {
    const w = src.width, h = src.height, d = src.data, n = w * h;

    let gray = new Uint8ClampedArray(n);
    for (let i = 0, p = 0; i < n; i++, p += 4) {
        const a = d[p + 3] / 255;
        const g = 0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2];
        gray[i] = g * a + 255 * (1 - a);
    }
    if (o.denoise > 0) gray = gaussBlurU8(gray, w, h, o.denoise * scale);
    if (o.autoLevels) autoLevels(gray);

    const inv = new Uint8ClampedArray(n);
    for (let i = 0; i < n; i++) inv[i] = 255 - gray[i];
    const blur = gaussBlurU8(inv, w, h, Math.max(0.8, o.sigma * scale));

    const out = new ImageData(w, h);
    const od = out.data;
    const [cr, cg, cb] = hexToRgb(o.color);
    const gain = 0.6 + (o.gain / 100) * 3.4;
    const clean = (o.clean / 100) * 0.3;
    const thr = (o.thr / 100) * 0.5;

    for (let i = 0, p = 0; i < n; i++, p += 4) {
        const g = gray[i];
        let r = (g * 256) / (256 - blur[i]);
        if (r > 255) r = 255;
        let dk = (255 - r) / 255;
        let a;
        if (o.mode === 'line') {
            a = smooth(thr - 0.05, thr + 0.05, dk);
        } else {
            dk = Math.max(0, (dk - clean) / (1 - clean));
            a = Math.pow(Math.min(1, dk * gain), 0.85);
            if (o.mode === 'shade') {
                const sh = Math.pow(1 - g / 255, 1.6) * 0.5;
                a = 1 - (1 - a) * (1 - sh);
            }
        }
        od[p] = cr; od[p + 1] = cg; od[p + 2] = cb;
        od[p + 3] = Math.round(a * 255);
    }
    return out;
}

// ═══════════════════════════════════════════════════════════════
// MIXIN: dialog + tạo layer
// ═══════════════════════════════════════════════════════════════
export const sketchMixin = {

    _closeSketchDialog() {
        const m = document.getElementById('paint-sketch-modal');
        if (m) m.remove();
        this._sketchLoad = null;
    },

    _openSketchDialog(file = null) {
        if (document.getElementById('paint-sketch-modal')) {
            if (file && this._sketchLoad) this._sketchLoad(file);
            return;
        }
        const self = this;
        const o = this._sketchOpts || (this._sketchOpts = {
            mode: 'pencil', sigma: 10, gain: 55, clean: 8, thr: 35,
            denoise: 1, color: '#000000', fit: 'contain', autoLevels: true, keepRef: false,
        });

        const slider = (id, label, min, max, val, extra = '') => `
            <div id="row-${id}" style="margin-bottom:8px; ${extra}">
                <div style="display:flex; justify-content:space-between; font-size:11px; color:#94a3b8;">
                    <span>${label}</span><span id="${id}-v" style="color:#38bdf8; font-weight:700;">${val}</span>
                </div>
                <input type="range" id="${id}" min="${min}" max="${max}" value="${val}" style="width:100%; accent-color:#ec4899;">
            </div>`;
        const btnCss = 'padding:7px 10px; background:rgba(56,189,248,0.12); border:1px solid #38bdf8; color:#38bdf8; border-radius:6px; font-size:12px; font-weight:700; cursor:pointer;';
        const selCss = 'width:100%; background:#0f172a; color:#e2e8f0; border:1px solid #475569; border-radius:6px; padding:6px; font-size:12px; margin-bottom:8px;';

        const modal = document.createElement('div');
        modal.id = 'paint-sketch-modal';
        modal.className = 'paint-modal';
        modal.innerHTML = `
        <div style="background:#1e293b; border:1px solid #ec4899; border-radius:10px; width:min(980px,96vw); max-height:92vh; display:flex; flex-direction:column; color:#e2e8f0; font-family:'Segoe UI',sans-serif;">
            <div style="display:flex; justify-content:space-between; align-items:center; padding:10px 16px; border-bottom:1px solid #334155;">
                <span style="font-weight:700; color:#f472b6;">📷 Ảnh → Sketch (thành 1 layer)</span>
                <button id="sk-close" style="background:transparent; border:none; color:#94a3b8; font-size:18px; cursor:pointer;">✕</button>
            </div>
            <div style="display:flex; gap:14px; padding:14px; overflow:auto; flex-wrap:wrap;">
                <div id="sk-drop" style="flex:1; min-width:280px; min-height:320px; background:#0f172a; border:2px dashed #475569; border-radius:8px; display:flex; align-items:center; justify-content:center; position:relative; overflow:hidden;">
                    <canvas id="sk-preview" style="display:none; max-width:100%; max-height:62vh; background:#fff;"></canvas>
                    <div id="sk-hint" style="text-align:center; color:#64748b; font-size:13px; line-height:1.7; padding:20px;">
                        📥 Kéo thả ảnh vào đây<br>hoặc <b>Ctrl+V</b> để dán<br>hoặc bấm nút bên phải để chọn / chụp ảnh
                    </div>
                </div>
                <div style="width:270px; flex-shrink:0;">
                    <div style="display:flex; gap:6px; margin-bottom:10px;">
                        <button id="sk-pick" style="${btnCss} flex:1;">📁 Chọn ảnh</button>
                        <button id="sk-cam" style="${btnCss} flex:1;">📷 Chụp ảnh</button>
                    </div>
                    <input type="file" id="sk-file" accept="image/*" style="display:none;">
                    <input type="file" id="sk-file-cam" accept="image/*" capture="environment" style="display:none;">

                    <div style="font-size:11px; color:#94a3b8; margin-bottom:3px;">Kiểu sketch</div>
                    <select id="sk-mode" style="${selCss}">
                        <option value="pencil">✏️ Chì (nét + đậm nhạt)</option>
                        <option value="shade">🌗 Chì có bóng</option>
                        <option value="line">🖊 Line art sạch</option>
                    </select>
                    ${slider('sk-sigma', 'Độ dày nét / độ mịn', 2, 40, o.sigma)}
                    ${slider('sk-gain', 'Độ đậm', 0, 100, o.gain)}
                    ${slider('sk-clean', 'Làm sạch nền', 0, 100, o.clean)}
                    ${slider('sk-thr', 'Ngưỡng nét', 0, 100, o.thr)}
                    ${slider('sk-denoise', 'Khử nhiễu', 0, 4, o.denoise)}

                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                        <span style="font-size:11px; color:#94a3b8;">Màu nét</span>
                        <input type="color" id="sk-color" value="${o.color}" style="width:34px; height:26px; border:1px solid #475569; border-radius:4px; background:transparent; padding:0;">
                        <select id="sk-fit" style="flex:1; background:#0f172a; color:#e2e8f0; border:1px solid #475569; border-radius:6px; padding:4px; font-size:12px;">
                            <option value="contain">Vừa khung</option>
                            <option value="cover">Phủ kín</option>
                        </select>
                    </div>
                    <label style="display:flex; gap:6px; align-items:center; font-size:12px; color:#cbd5e1; margin-bottom:6px; cursor:pointer;">
                        <input type="checkbox" id="sk-auto" style="accent-color:#ec4899;"> Tự cân bằng sáng
                    </label>
                    <label style="display:flex; gap:6px; align-items:center; font-size:12px; color:#cbd5e1; margin-bottom:10px; cursor:pointer;">
                        <input type="checkbox" id="sk-ref" style="accent-color:#ec4899;"> Thêm ảnh gốc mờ (khoá) bên dưới để đồ theo
                    </label>
                    <button id="sk-orig" style="${btnCss} width:100%; margin-bottom:6px; color:#cbd5e1; border-color:#475569; background:transparent;">👁 Giữ để xem ảnh gốc</button>
                </div>
            </div>
            <div style="display:flex; justify-content:flex-end; gap:8px; padding:10px 16px; border-top:1px solid #334155;">
                <span id="sk-status" style="flex:1; font-size:12px; color:#64748b; align-self:center;"></span>
                <button id="sk-cancel" style="padding:8px 16px; background:transparent; border:1px solid #64748b; color:#cbd5e1; border-radius:6px; cursor:pointer; font-weight:600; font-size:12px;">Huỷ</button>
                <button id="sk-ok" style="padding:8px 18px; background:linear-gradient(135deg,#8b5cf6,#ec4899); border:none; color:#fff; border-radius:6px; cursor:pointer; font-weight:700; font-size:12px;">✅ Tạo layer Sketch</button>
            </div>
        </div>`;
        document.body.appendChild(modal);

        const $ = (s) => modal.querySelector(s);
        $('#sk-mode').value = o.mode;
        $('#sk-fit').value = o.fit;
        $('#sk-auto').checked = o.autoLevels;
        $('#sk-ref').checked = o.keepRef;

        let srcImg = null;
        let prevBase = null;      // ImageData ảnh gốc ở độ phân giải preview
        let prevScale = 1;
        let timer = null;

        const W = () => self.CANVAS_W;
        const H = () => self.CANVAS_H;

        const syncRows = () => {
            $('#row-sk-clean').style.display = o.mode === 'line' ? 'none' : 'block';
            $('#row-sk-thr').style.display = o.mode === 'line' ? 'block' : 'none';
        };
        syncRows();

        const renderWorking = (img, scale, bg) => {
            const cw = Math.max(1, Math.round(W() * scale));
            const ch = Math.max(1, Math.round(H() * scale));
            const c = document.createElement('canvas');
            c.width = cw; c.height = ch;
            const g = c.getContext('2d');
            g.imageSmoothingQuality = 'high';
            if (bg) { g.fillStyle = bg; g.fillRect(0, 0, cw, ch); }
            const sw = img.naturalWidth || img.width;
            const sh = img.naturalHeight || img.height;
            const s = (o.fit === 'cover' ? Math.max(W() / sw, H() / sh) : Math.min(W() / sw, H() / sh)) * scale;
            const dw = sw * s, dh = sh * s;
            g.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);
            return c;
        };

        const rebuildBase = () => {
            if (!srcImg) return;
            prevScale = Math.min(1, 560 / Math.max(W(), H()));
            const c = renderWorking(srcImg, prevScale, '#ffffff');
            prevBase = c.getContext('2d').getImageData(0, 0, c.width, c.height);
            const pv = $('#sk-preview');
            pv.width = c.width; pv.height = c.height;
        };

        const renderPreview = () => {
            if (!srcImg || !prevBase) return;
            const out = generateSketchData(prevBase, o, prevScale);
            $('#sk-preview').getContext('2d').putImageData(out, 0, 0);
        };

        const schedule = () => {
            clearTimeout(timer);
            timer = setTimeout(renderPreview, 50);
        };

        const loadFile = (file) => {
            if (!file || !file.type.startsWith('image/')) return;
            const url = URL.createObjectURL(file);
            const im = new Image();
            im.onload = () => {
                URL.revokeObjectURL(url);
                srcImg = im;
                $('#sk-hint').style.display = 'none';
                $('#sk-preview').style.display = 'block';
                rebuildBase();
                renderPreview();
                $('#sk-status').textContent = `${im.naturalWidth}×${im.naturalHeight}px`;
            };
            im.onerror = () => { URL.revokeObjectURL(url); $('#sk-status').textContent = '⚠️ Không đọc được ảnh'; };
            im.src = url;
        };
        this._sketchLoad = loadFile;

        // ─── Bindings ───
        $('#sk-pick').onclick = () => $('#sk-file').click();
        $('#sk-cam').onclick = () => $('#sk-file-cam').click();
        $('#sk-file').onchange = (e) => loadFile(e.target.files[0]);
        $('#sk-file-cam').onchange = (e) => loadFile(e.target.files[0]);

        const drop = $('#sk-drop');
        drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = '#ec4899'; };
        drop.ondragleave = () => { drop.style.borderColor = '#475569'; };
        drop.ondrop = (e) => {
            e.preventDefault();
            drop.style.borderColor = '#475569';
            const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
            if (f) loadFile(f);
        };

        const bindSlider = (id, key) => {
            $('#' + id).oninput = (e) => {
                o[key] = parseFloat(e.target.value);
                $('#' + id + '-v').textContent = e.target.value;
                schedule();
            };
        };
        bindSlider('sk-sigma', 'sigma');
        bindSlider('sk-gain', 'gain');
        bindSlider('sk-clean', 'clean');
        bindSlider('sk-thr', 'thr');
        bindSlider('sk-denoise', 'denoise');

        $('#sk-mode').onchange = (e) => { o.mode = e.target.value; syncRows(); schedule(); };
        $('#sk-color').oninput = (e) => { o.color = e.target.value; schedule(); };
        $('#sk-fit').onchange = (e) => { o.fit = e.target.value; rebuildBase(); schedule(); };
        $('#sk-auto').onchange = (e) => { o.autoLevels = e.target.checked; schedule(); };
        $('#sk-ref').onchange = (e) => { o.keepRef = e.target.checked; };

        const showOrig = () => {
            if (!srcImg || !prevBase) return;
            $('#sk-preview').getContext('2d').putImageData(prevBase, 0, 0);
        };
        const orig = $('#sk-orig');
        orig.onpointerdown = showOrig;
        orig.onpointerup = renderPreview;
        orig.onpointerleave = renderPreview;

        $('#sk-close').onclick = () => this._closeSketchDialog();
        $('#sk-cancel').onclick = () => this._closeSketchDialog();

        $('#sk-ok').onclick = async () => {
            if (!srcImg) { $('#sk-status').textContent = '⚠️ Chưa chọn ảnh'; return; }
            const okBtn = $('#sk-ok');
            okBtn.disabled = true;
            okBtn.textContent = '⏳ Đang xử lý...';
            await new Promise(r => setTimeout(r, 40));
            try {
                const full = renderWorking(srcImg, 1, '#ffffff');
                const id = full.getContext('2d').getImageData(0, 0, W(), H());
                const out = generateSketchData(id, o, 1);
                const sk = document.createElement('canvas');
                sk.width = W(); sk.height = H();
                sk.getContext('2d').putImageData(out, 0, 0);

                const ref = o.keepRef ? renderWorking(srcImg, 1, null) : null;
                this._addSketchLayers(sk, ref);
                this._closeSketchDialog();
            } catch (err) {
                console.warn('[Sketch] error:', err);
                okBtn.disabled = false;
                okBtn.textContent = '✅ Tạo layer Sketch';
                $('#sk-status').textContent = '⚠️ Lỗi khi xử lý ảnh';
            }
        };

        if (file) loadFile(file);
    },

    _addSketchLayers(sketchCanvas, refCanvas) {
        if (this._selection) this._commitSelection();

        if (refCanvas) {
            const r = this._createLayer('Ảnh gốc (đồ theo)');
            r.ctx.drawImage(refCanvas, 0, 0);
            r.opacity = 0.35;
            r.locked = true;
            this._touch(r);
        }
        const l = this._createLayer('Sketch');
        l.ctx.drawImage(sketchCanvas, 0, 0);
        this._touch(l);

        this._renderLayerUI();
        this._renderComposite();
        this._dirty = true;
        this._setStatus('✅ Đã tạo layer Sketch');
    },
};