// ═══════════════════════════════════════════════════════════════
// paint-engine.js — v10 (Single-path redraw · Hairline · Stamp 2x · Fill viền mềm)
// ═══════════════════════════════════════════════════════════════

export const BRUSH_TYPES = [
    { id: 'round', label: 'Tròn', icon: '●' },
    { id: 'pencil', label: 'Chì', icon: '✏️' },
    { id: 'marker', label: 'Marker', icon: '🖊️' },
    { id: 'soft', label: 'Mềm', icon: '☁️' },
];
export const SHAPE_TYPES = [
    { id: 'line', label: 'Đường', icon: '╱' },
    { id: 'rect', label: 'Chữ nhật', icon: '▭' },
    { id: 'ellipse', label: 'Elip', icon: '⬭' },
];
export const SYMMETRY_TYPES = ['none', 'h', 'v', 'both'];
export const GRID_TYPES = ['none', 'grid', 'thirds'];

// ═══════════════════════════════════════════════════════════════
// CHẤT LƯỢNG (globalThis → không lệch khi import ?v= khác nhau)
// ═══════════════════════════════════════════════════════════════
const MIN_W = 1.25;               // độ dày tối thiểu; mảnh hơn thì giảm alpha (hairline)
const MAX_REDRAW_PIECES = 4000;   // nét quá dài → thôi vẽ lại cả nét mỗi frame

export function setBrushQuality(on) { globalThis.__paintBrushHQ = !!on; }
export function isBrushHQ() { return globalThis.__paintBrushHQ !== false; }

// ═══════════════════════════════════════════════════════════════
// LAYER COMPOSITING
// ═══════════════════════════════════════════════════════════════
export function renderLayers(mainCtx, layers, w, h) {
    mainCtx.clearRect(0, 0, w, h);
    for (const layer of layers) {
        if (!layer.visible) continue;
        mainCtx.save();
        mainCtx.globalAlpha = layer.opacity;
        mainCtx.globalCompositeOperation = layer.blendMode;
        mainCtx.drawImage(layer.canvas, 0, 0);
        mainCtx.restore();
    }
}

const clamp = (v, a, b) => (v < a ? a : (v > b ? b : v));

export function hexToRgb(hex) {
    let h = String(hex || '#000000').replace('#', '');
    if (h.length === 3) h = h.split('').map(c => c + c).join('');
    const n = parseInt(h, 16);
    if (Number.isNaN(n)) return [0, 0, 0];
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// ═══════════════════════════════════════════════════════════════
// BRUSH ENGINE
//  round / marker : PATH (độ phủ pixel chuẩn)
//     - brush, độ dày không đổi → "redraw": cả nét là 1 Path2D, vẽ lại 1 lần/frame
//       (không có mối nối → nét mảnh không bị đốm)
//     - tẩy hoặc độ dày thay đổi (áp lực / taper) → vẽ từng đoạn
//  pencil / soft  : STAMP (nhiễu + chồng lớp), stamp 2x ở chất lượng cao
// ═══════════════════════════════════════════════════════════════
export const BRUSH_DEFS = {
    round: { hardness: 0.85, spacing: 0.04, flow: 1.0, sizeMul: 1.15 },
    marker: { hardness: 1.0, spacing: 0.03, flow: 1.0, sizeMul: 1.1 },
    pencil: { hardness: 0.5, spacing: 0.06, flow: 0.28, sizeMul: 1.0, jitter: 0.18, grain: 0.6 },
    soft: { hardness: 0.0, spacing: 0.05, flow: 0.20, sizeMul: 1.4 },
};

const _stampCache = new Map();

function getStamp(color, hardness, dia, hq) {
    const ss = hq ? 2 : 1;
    const key = `${color}|${hardness}|${dia}|${ss}`;
    const hit = _stampCache.get(key);
    if (hit) return hit;
    if (_stampCache.size > 60) _stampCache.clear();

    const S = Math.ceil(dia * ss);
    const c = document.createElement('canvas');
    c.width = c.height = S;
    const g = c.getContext('2d');
    const r = S / 2;
    const [cr, cg, cb] = hexToRgb(color);
    const col = (a) => `rgba(${cr},${cg},${cb},${a})`;

    const inner = Math.max(0, Math.min(hardness, 1 - (1.5 * ss) / r));
    const grad = g.createRadialGradient(r, r, 0, r, r, r);
    grad.addColorStop(0, col(1));
    grad.addColorStop(inner, col(1));
    if (inner < 0.97) {
        const k = 1 - inner;
        grad.addColorStop(inner + k * 0.25, col(0.85));
        grad.addColorStop(inner + k * 0.50, col(0.50));
        grad.addColorStop(inner + k * 0.75, col(0.15));
    }
    grad.addColorStop(1, col(0));
    g.fillStyle = grad;
    g.fillRect(0, 0, S, S);

    _stampCache.set(key, c);
    return c;
}

export class StrokeStamper {
    constructor(ctx, o) {
        this.ctx = ctx;
        this.def = BRUSH_DEFS[o.brush] || BRUSH_DEFS.round;
        this.erase = !!o.erase;
        this.mul = this.def.sizeMul || 1;
        this.color = this.erase ? '#000000' : o.color;

        this.hq = isBrushHQ();
        this.pathMode = this.hq && this.def.hardness >= 0.8;
        // Brush (không phải tẩy): gom cả nét vào 1 Path2D, tools gọi drawAll() mỗi frame
        this.redraw = this.pathMode && !this.erase;
        this.path = null;
        this.p0 = null;
        this.w0 = 0;
        this.nPieces = 0;
        this.pending = [];
        this.dirty = false;
        this.flushed = false;

        if (!this.pathMode) {
            const maxD = Math.max(1, o.size) * this.mul * 1.3;
            this.dia = clamp(Math.ceil(maxD), 4, 220);
            this.stamp = getStamp(this.color, this.def.hardness, this.dia, this.hq);
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
        }

        this.prev = null;
        this.lastMid = null;
        this.toNext = 0;
        this.x0 = Infinity; this.y0 = Infinity; this.x1 = -Infinity; this.y1 = -Infinity;
    }

    _grow(x0, y0, x1, y1) {
        if (x0 < this.x0) this.x0 = x0;
        if (y0 < this.y0) this.y0 = y0;
        if (x1 > this.x1) this.x1 = x1;
        if (y1 > this.y1) this.y1 = y1;
    }

    // ───────────── PATH: helpers ─────────────
    _setWidth(d) {
        const ctx = this.ctx;
        if (d < MIN_W) {
            ctx.lineWidth = MIN_W;
            ctx.globalAlpha = Math.max(0.08, d / MIN_W);
        } else {
            ctx.lineWidth = d;
            ctx.globalAlpha = 1;
        }
    }

    _dot(x, y, w) {
        const d = w * this.mul;
        if (d < 0.3) return;
        const ctx = this.ctx;
        const lw = Math.max(d, MIN_W);
        ctx.globalCompositeOperation = this.erase ? 'destination-out' : 'source-over';
        ctx.fillStyle = this.color;
        ctx.globalAlpha = d < MIN_W ? Math.max(0.08, d / MIN_W) : 1;
        ctx.beginPath();
        ctx.arc(x, y, lw / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
        const r = lw / 2 + 2;
        this._grow(x - r, y - r, x + r, y + r);
    }

    // Vẽ 1 đoạn ngay (tẩy, hoặc brush có độ dày thay đổi)
    _curvePath(a, c, b) {
        const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
        if (len < 0.01) return;
        const wa = a.w * this.mul, wb = b.w * this.mul;
        if (Math.max(wa, wb) < 0.3) return;

        const ctx = this.ctx;
        ctx.globalCompositeOperation = this.erase ? 'destination-out' : 'source-over';
        ctx.strokeStyle = this.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const dw = Math.abs(wb - wa);
        const n = dw > 0.8 ? Math.min(8, Math.ceil(dw / 0.8)) : 1;

        if (n === 1) {
            this._setWidth((wa + wb) / 2);
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.quadraticCurveTo(c.x, c.y, b.x, b.y);
            ctx.stroke();
        } else {
            let px = a.x, py = a.y;
            for (let i = 1; i <= n; i++) {
                const t = i / n, u = 1 - t;
                const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
                const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
                this._setWidth(wa + (wb - wa) * ((i - 0.5) / n));
                ctx.beginPath();
                ctx.moveTo(px, py);
                ctx.lineTo(x, y);
                ctx.stroke();
                px = x; py = y;
            }
        }
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        const pad = Math.max(wa, wb, MIN_W) / 2 + 2;
        this._grow(
            Math.min(a.x, c.x, b.x) - pad, Math.min(a.y, c.y, b.y) - pad,
            Math.max(a.x, c.x, b.x) + pad, Math.max(a.y, c.y, b.y) + pad
        );
    }

    // ───────────── REDRAW MODE ─────────────
    _pushPiece(a, c, b) {
        const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
        if (len < 0.01) return;
        this.path.quadraticCurveTo(c.x, c.y, b.x, b.y);
        this.nPieces++;
        this.pending.push([a, c, b]);
        this.dirty = true;
        const pad = Math.max(this.w0 * this.mul, MIN_W) / 2 + 2;
        this._grow(
            Math.min(a.x, c.x, b.x) - pad, Math.min(a.y, c.y, b.y) - pad,
            Math.max(a.x, c.x, b.x) + pad, Math.max(a.y, c.y, b.y) + pad
        );
    }

    // Độ dày bắt đầu thay đổi → vẽ nốt phần chưa vẽ rồi chuyển sang vẽ từng đoạn
    _leaveRedraw() {
        this.redraw = false;
        this.dirty = false;
        if (!this.flushed && this.p0) this._dot(this.p0.x, this.p0.y, this.w0);
        for (const [a, c, b] of this.pending) this._curvePath(a, c, b);
        this.pending.length = 0;
        this.path = null;
    }

    // Tools xóa vùng bbox trên overlay rồi gọi hàm này cho từng stamper
    drawAll() {
        this.dirty = false;
        this.flushed = true;
        this.pending.length = 0;
        if (!this.path) return;
        const d = this.w0 * this.mul;
        if (d < 0.3) return;

        const ctx = this.ctx;
        ctx.globalCompositeOperation = 'source-over';
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        this._setWidth(d);
        if (this.nPieces === 0) {
            ctx.beginPath();
            ctx.arc(this.p0.x, this.p0.y, ctx.lineWidth / 2, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.stroke(this.path);
        }
        ctx.globalAlpha = 1;

        if (this.nPieces > MAX_REDRAW_PIECES) {
            this.redraw = false;
            this.path = null;
        }
    }

    // ───────────── STAMP MODE ─────────────
    _step(w) {
        return Math.max(0.5, w * this.def.spacing);
    }

    _stampAt(x, y, w, st) {
        const def = this.def;
        const d = w * this.mul;
        if (d < 0.4) return;

        let px = x, py = y;
        if (def.jitter) {
            px += (Math.random() - 0.5) * d * def.jitter;
            py += (Math.random() - 0.5) * d * def.jitter;
        }
        let a = Math.min(1, def.flow * st / Math.max(0.01, w * def.spacing));
        if (def.grain) a *= (1 - def.grain) + Math.random() * def.grain;

        const r = d / 2;
        const ctx = this.ctx;
        ctx.globalCompositeOperation = this.erase ? 'destination-out' : 'source-over';
        ctx.globalAlpha = a;
        ctx.drawImage(this.stamp, px - r, py - r, d, d);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';

        this._grow(px - r - 1, py - r - 1, px + r + 1, py + r + 1);
    }

    // ───────────── API chung ─────────────
    begin(p) {
        this.prev = { x: p.x, y: p.y, w: p.w };
        this.lastMid = { x: p.x, y: p.y, w: p.w };
        if (this.pathMode) {
            if (this.redraw) {
                this.p0 = { x: p.x, y: p.y };
                this.w0 = p.w;
                this.path = new Path2D();
                this.path.moveTo(p.x, p.y);
                this.nPieces = 0;
                this.pending.length = 0;
                this.dirty = true;
                this.flushed = false;
                const r = Math.max(p.w * this.mul, MIN_W) / 2 + 2;
                this._grow(p.x - r, p.y - r, p.x + r, p.y + r);
            } else {
                this._dot(p.x, p.y, p.w);
            }
            return;
        }
        const st = this._step(p.w);
        this._stampAt(p.x, p.y, p.w, st);
        this.toNext = st;
    }

    add(p) {
        const prev = this.prev;
        if (!prev) { this.begin(p); return; }
        if (this.redraw && Math.abs(p.w - this.w0) > 0.05) this._leaveRedraw();
        const mid = { x: (prev.x + p.x) / 2, y: (prev.y + p.y) / 2, w: (prev.w + p.w) / 2 };
        this._curve(this.lastMid, prev, mid);
        this.lastMid = mid;
        this.prev = { x: p.x, y: p.y, w: p.w };
    }

    end() {
        if (!this.prev || !this.lastMid) return;
        this._curve(this.lastMid, this.prev, this.prev);
    }

    getBBox() {
        if (this.x0 === Infinity) return null;
        return { x0: this.x0, y0: this.y0, x1: this.x1, y1: this.y1 };
    }

    _curve(a, c, b) {
        if (this.pathMode) {
            if (this.redraw) this._pushPiece(a, c, b);
            else this._curvePath(a, c, b);
            return;
        }
        const len = Math.hypot(c.x - a.x, c.y - a.y) + Math.hypot(b.x - c.x, b.y - c.y);
        if (len < 0.01) return;
        const n = Math.max(1, Math.min(150, Math.ceil(len / 1.5)));
        let px = a.x, py = a.y, pw = a.w;
        for (let i = 1; i <= n; i++) {
            const t = i / n, u = 1 - t;
            const x = u * u * a.x + 2 * u * t * c.x + t * t * b.x;
            const y = u * u * a.y + 2 * u * t * c.y + t * t * b.y;
            const w = a.w + (b.w - a.w) * t;
            this._seg(px, py, pw, x, y, w);
            px = x; py = y; pw = w;
        }
    }

    _seg(x0, y0, w0, x1, y1, w1) {
        const dist = Math.hypot(x1 - x0, y1 - y0);
        if (dist < 1e-4) return;
        let t = this.toNext;
        while (t <= dist) {
            const f = t / dist;
            const w = w0 + (w1 - w0) * f;
            const st = this._step(w);
            this._stampAt(x0 + (x1 - x0) * f, y0 + (y1 - y0) * f, w, st);
            t += st;
        }
        this.toNext = t - dist;
    }
}

// ═══════════════════════════════════════════════════════════════
// SHAPES (hairline + căn nửa pixel cho chữ nhật)
// ═══════════════════════════════════════════════════════════════
function _setupCtx(ctx, stroke) {
    const isEraser = stroke.type === 'eraser';
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.globalAlpha = stroke.opacity ?? 1;
    ctx.fillStyle = ctx.strokeStyle = isEraser ? '#000' : stroke.color;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}
function _resetCtx(ctx) {
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
}

export function drawShape(ctx, shape) {
    const isEraser = shape.type === 'eraser';
    const op = shape.opacity ?? 1;
    const k = shape.size < MIN_W ? Math.max(0.08, shape.size / MIN_W) : 1;
    const strokeA = op * k;
    const lw = Math.max(shape.size, MIN_W);

    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.globalAlpha = strokeA;
    ctx.fillStyle = ctx.strokeStyle = isEraser ? '#000' : shape.color;
    ctx.lineWidth = lw;

    ctx.lineCap = shape.shape === 'line' ? 'round' : 'butt';
    ctx.lineJoin = 'miter';
    ctx.miterLimit = 4;

    const { x1, y1, x2, y2 } = shape;
    ctx.beginPath();
    if (shape.shape === 'line') {
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
    } else if (shape.shape === 'rect') {
        const x = Math.min(x1, x2), y = Math.min(y1, y2);
        const w = Math.abs(x2 - x1), h = Math.abs(y2 - y1);
        if (shape.fill) {
            ctx.globalAlpha = op * 0.6;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = strokeA;
        }
        // độ dày lẻ + tọa độ nguyên → lệch nửa pixel để cạnh sắc, không bị nhòe 2px
        const off = (Number.isInteger(x) && Number.isInteger(y) && (Math.round(lw) & 1)) ? 0.5 : 0;
        ctx.strokeRect(x + off, y + off, w, h);
    } else if (shape.shape === 'ellipse') {
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (shape.fill) {
            ctx.globalAlpha = op * 0.6;
            ctx.fill();
            ctx.globalAlpha = strokeA;
        }
        ctx.stroke();
    }

    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

export function drawQuadBezier(ctx, x1, y1, cx, cy, x2, y2, stroke) {
    _setupCtx(ctx, stroke);
    const op = stroke.opacity ?? 1;
    ctx.lineWidth = Math.max(stroke.size, MIN_W);
    if (stroke.size < MIN_W) ctx.globalAlpha = op * Math.max(0.08, stroke.size / MIN_W);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    _resetCtx(ctx);
}

// ═══════════════════════════════════════════════════════════════
// FLOOD FILL
// ═══════════════════════════════════════════════════════════════
export function computeFillMask(srcCtx, x, y, w, h, tol = 32, grow = 0) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= w || y < 0 || y >= h) return null;

    const d = srcCtx.getImageData(0, 0, w, h).data;
    const i0 = (y * w + x) * 4;
    const tr = d[i0], tg = d[i0 + 1], tb = d[i0 + 2], ta = d[i0 + 3];

    const match = (p) =>
        Math.abs(d[p] - tr) <= tol && Math.abs(d[p + 1] - tg) <= tol &&
        Math.abs(d[p + 2] - tb) <= tol && Math.abs(d[p + 3] - ta) <= tol;

    const mask = new Uint8Array(w * h);
    const stack = [x, y];
    let minX = x, maxX = x, minY = y, maxY = y;

    while (stack.length) {
        const cy = stack.pop();
        const cx0 = stack.pop();
        let xl = cx0;
        while (xl >= 0 && !mask[cy * w + xl] && match((cy * w + xl) * 4)) xl--;
        xl++;
        let spanUp = false, spanDown = false;
        for (let xx = xl; xx < w; xx++) {
            const idx = cy * w + xx;
            if (mask[idx] || !match(idx * 4)) break;
            mask[idx] = 1;
            if (xx < minX) minX = xx;
            if (xx > maxX) maxX = xx;
            if (cy > 0) {
                const up = idx - w;
                const m = !mask[up] && match(up * 4);
                if (m && !spanUp) { stack.push(xx, cy - 1); spanUp = true; }
                else if (!m) spanUp = false;
            }
            if (cy < h - 1) {
                const dn = idx + w;
                const m = !mask[dn] && match(dn * 4);
                if (m && !spanDown) { stack.push(xx, cy + 1); spanDown = true; }
                else if (!m) spanDown = false;
            }
        }
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
    }

    let box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };

    for (let g = 0; g < grow; g++) {
        const x0 = Math.max(0, box.x - 1), y0 = Math.max(0, box.y - 1);
        const x1 = Math.min(w - 1, box.x + box.w), y1 = Math.min(h - 1, box.y + box.h);
        const add = [];
        for (let yy = y0; yy <= y1; yy++) {
            for (let xx = x0; xx <= x1; xx++) {
                const i = yy * w + xx;
                if (mask[i]) continue;
                if ((xx > 0 && mask[i - 1]) || (xx < w - 1 && mask[i + 1]) ||
                    (yy > 0 && mask[i - w]) || (yy < h - 1 && mask[i + w])) add.push(i);
            }
        }
        for (const i of add) mask[i] = 1;
        box = { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
    }

    // ⭐ Nới bbox 1px để chứa viền mềm → patch undo bao trọn vùng bị đổi
    const px0 = Math.max(0, box.x - 1), py0 = Math.max(0, box.y - 1);
    const px1 = Math.min(w, box.x + box.w + 1), py1 = Math.min(h, box.y + box.h + 1);
    return { mask, stride: w, x: px0, y: py0, w: px1 - px0, h: py1 - py0 };
}

// ⭐ Viền mềm: bộ lọc [1 2 1] tách 2 chiều + gain 1.4 (viền nở ~0.35px, lấp khe hở với nét vẽ)
export function applyFillMask(ctx, res, color, feather = true) {
    const { mask, stride, x, y, w: bw, h: bh } = res;
    const [r, g, b] = hexToRgb(color);

    const m = new Uint8Array(bw * bh);
    for (let yy = 0; yy < bh; yy++) {
        const row = (y + yy) * stride + x;
        m.set(mask.subarray(row, row + bw), yy * bw);
    }

    const img = new ImageData(bw, bh);
    const d = img.data;

    if (!feather) {
        for (let i = 0; i < m.length; i++) {
            if (!m[i]) continue;
            const p = i * 4;
            d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = 255;
        }
    } else {
        const hb = new Uint8Array(bw * bh);
        for (let yy = 0; yy < bh; yy++) {
            const row = yy * bw;
            for (let xx = 0; xx < bw; xx++) {
                const i = row + xx;
                const l = xx > 0 ? m[i - 1] : m[i];
                const rr = xx < bw - 1 ? m[i + 1] : m[i];
                hb[i] = l + 2 * m[i] + rr;
            }
        }
        const GAIN = (255 / 16) * 1.4;
        for (let yy = 0; yy < bh; yy++) {
            for (let xx = 0; xx < bw; xx++) {
                const i = yy * bw + xx;
                const up = yy > 0 ? hb[i - bw] : hb[i];
                const dn = yy < bh - 1 ? hb[i + bw] : hb[i];
                const v = up + 2 * hb[i] + dn;
                if (!v) continue;
                const a = v * GAIN;
                const p = i * 4;
                d[p] = r; d[p + 1] = g; d[p + 2] = b; d[p + 3] = a > 255 ? 255 : a;
            }
        }
    }

    const t = document.createElement('canvas');
    t.width = bw; t.height = bh;
    t.getContext('2d').putImageData(img, 0, 0);
    ctx.drawImage(t, x, y);
}

export function pickColor(ctx, x, y) {
    const px = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    if (px[3] < 10) return '#ffffff';
    return `#${px[0].toString(16).padStart(2, '0')}${px[1].toString(16).padStart(2, '0')}${px[2].toString(16).padStart(2, '0')}`;
}

export function applySymmetryToStroke(stroke, symmetry, w, h) {
    if (symmetry === 'none') return [stroke];
    const cx = w / 2, cy = h / 2;
    const results = [stroke];
    if (symmetry === 'h' || symmetry === 'both') results.push(_mirror(stroke, 'x', cx));
    if (symmetry === 'v' || symmetry === 'both') results.push(_mirror(stroke, 'y', cy));
    if (symmetry === 'both') results.push(_mirror(_mirror(stroke, 'x', cx), 'y', cy));
    return results;
}

function _mirror(stroke, axis, value) {
    if (stroke.type === 'shape') {
        const s = { ...stroke };
        if (axis === 'x') { s.x1 = 2 * value - stroke.x1; s.x2 = 2 * value - stroke.x2; }
        if (axis === 'y') { s.y1 = 2 * value - stroke.y1; s.y2 = 2 * value - stroke.y2; }
        return s;
    }
    if (stroke.type === 'curve') {
        const s = { ...stroke };
        if (axis === 'x') { s.x1 = 2 * value - stroke.x1; s.cx = 2 * value - stroke.cx; s.x2 = 2 * value - stroke.x2; }
        if (axis === 'y') { s.y1 = 2 * value - stroke.y1; s.cy = 2 * value - stroke.cy; s.y2 = 2 * value - stroke.y2; }
        return s;
    }
    return {
        ...stroke,
        points: (stroke.points || []).map(p => {
            const np = { ...p };
            if (axis === 'x') np.x = 2 * value - p.x;
            if (axis === 'y') np.y = 2 * value - p.y;
            return np;
        }),
    };
}