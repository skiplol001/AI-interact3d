// ═══════════════════════════════════════════════════════════════
// paint-brush.js — v5 (Adaptive Smoothing · Anti-aliasing)
// ═══════════════════════════════════════════════════════════════

const VELOCITY_MAX = 40;
const VELOCITY_MIN = 0.5;
const STABILIZER_BASE = 1.2;
const TAPER_MIN_FACTOR = 0.15;

const _clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

export const brushMixin = {
    _getEffectiveSize() {
        return this.size;
    },

    // ⭐ Làm mượt nét thích ứng: nhẹ khi vẽ chậm (mượt), bám sát khi vẽ nhanh (không trễ)
    _stabilize(rawPt) {
        const strength = this.stabilizer;
        if (strength <= 0 || !this._stabilizedPoint) {
            this._stabilizedPoint = { x: rawPt.x, y: rawPt.y };
            return { x: rawPt.x, y: rawPt.y };
        }
        const sp = this._stabilizedPoint;
        const dx = rawPt.x - sp.x;
        const dy = rawPt.y - sp.y;
        const d = Math.hypot(dx, dy);

        // Hệ số alpha: khi vẽ chậm (d nhỏ) thì alpha nhỏ -> mượt hơn
        // khi vẽ nhanh (d lớn) thì alpha lớn -> bám sát
        const base = 1 / (1 + strength * STABILIZER_BASE);
        const alpha = Math.min(1, base + d * 0.012);

        sp.x += dx * alpha;
        sp.y += dy * alpha;
        return { x: sp.x, y: sp.y };
    },

    // Áp lực bút (tablet / Apple Pencil / Surface Pen)
    _pressureWidth(pressure, baseSize) {
        const k = Math.pow(_clamp(pressure, 0, 1), 0.85);
        return Math.max(0.5, baseSize * (0.12 + 0.88 * k));
    },

    _computeWidth(velocity, baseSize) {
        if (this.drawMode !== 'taper') return baseSize;
        const strength = this.pressureStrength / 5;
        const v = _clamp((velocity - VELOCITY_MIN) / (VELOCITY_MAX - VELOCITY_MIN), 0, 1);
        const slowF = 1 + 0.20 * strength;
        const fastF = 1 - 0.70 * strength;
        const factor = slowF - v * (slowF - fastF);
        return Math.max(0.5, baseSize * factor);
    },

    _applyTaper(stroke) {
        if (this.drawMode !== 'taper') return;
        if (stroke.type === 'eraser') return;
        const pts = stroke.points;
        if (!pts || pts.length < 4) return;

        const baseSize = stroke.size;
        const taperDist = baseSize * (1.5 + this.taperLength * 1.7);

        let accum = 0, headCount = 0;
        for (let i = 1; i < pts.length; i++) {
            const d = Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
            accum += d;
            if (accum > taperDist) break;
            headCount = i;
        }

        accum = 0;
        let tailCount = 0;
        for (let i = pts.length - 2; i >= 0; i--) {
            const d = Math.hypot(pts[i].x - pts[i + 1].x, pts[i].y - pts[i + 1].y);
            accum += d;
            if (accum > taperDist) break;
            tailCount++;
        }

        if (headCount + tailCount >= pts.length - 2) tailCount = 0;

        for (let i = 0; i <= headCount && i < pts.length; i++) {
            const t = i / Math.max(1, headCount);
            const factor = TAPER_MIN_FACTOR + (1 - TAPER_MIN_FACTOR) * t;
            pts[i].width = (pts[i].width ?? baseSize) * factor;
        }
        for (let i = 0; i < tailCount && i < pts.length; i++) {
            const idx = pts.length - 1 - i;
            const t = i / Math.max(1, tailCount);
            const factor = TAPER_MIN_FACTOR + (1 - TAPER_MIN_FACTOR) * t;
            pts[idx].width = (pts[idx].width ?? baseSize) * factor;
        }
    },
};