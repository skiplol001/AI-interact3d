// ═══════════════════════════════════════════════════════════════
// paint-brush.js — v2 (No eraser multiplier — uses raw size)
// ═══════════════════════════════════════════════════════════════

const VELOCITY_MAX = 40;
const VELOCITY_MIN = 0.5;
const STABILIZER_ALPHA_BASE = 1.5;
const TAPER_MIN_FACTOR = 0.15;

const _clamp = (v, a, b) => v < a ? a : (v > b ? b : v);

export const brushMixin = {
    // ⭐ Bỏ hoàn toàn mult/min — eraser dùng thẳng size
    _getEffectiveSize() {
        return this.size;
    },

    _stabilize(rawPt) {
        const strength = this.stabilizer;
        if (strength <= 0 || !this._stabilizedPoint) {
            this._stabilizedPoint = { x: rawPt.x, y: rawPt.y };
            return { x: rawPt.x, y: rawPt.y };
        }
        const alpha = 1 / (1 + strength * STABILIZER_ALPHA_BASE);
        this._stabilizedPoint.x += (rawPt.x - this._stabilizedPoint.x) * alpha;
        this._stabilizedPoint.y += (rawPt.y - this._stabilizedPoint.y) * alpha;
        return { x: this._stabilizedPoint.x, y: this._stabilizedPoint.y };
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
        if (this.tool === 'eraser') return;
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