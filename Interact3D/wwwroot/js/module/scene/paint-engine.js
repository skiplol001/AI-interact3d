// ═══════════════════════════════════════════════════════════════
// paint-engine.js — v6 (True AA + Polygon Variable-Width Stroke)
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
// STYLE HELPERS
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

// ═══════════════════════════════════════════════════════════════
// ⭐ BBOX helper
// ═══════════════════════════════════════════════════════════════
function _getStrokeBBox(points, baseSize, sizeMul = 1) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
        const w = (((p.width ?? baseSize) * sizeMul) / 2) + 2;
        if (p.x - w < minX) minX = p.x - w;
        if (p.y - w < minY) minY = p.y - w;
        if (p.x + w > maxX) maxX = p.x + w;
        if (p.y + w > maxY) maxY = p.y + w;
    }
    return {
        x: Math.floor(minX), y: Math.floor(minY),
        w: Math.ceil(maxX - minX), h: Math.ceil(maxY - minY),
    };
}

// ═══════════════════════════════════════════════════════════════
// ⭐ POLYGON FILL (anti-aliased variable-width stroke)
// ═══════════════════════════════════════════════════════════════
function _drawPolygonStroke(ctx, points, baseSize, sizeMul) {
    const n = points.length;
    if (n < 2) {
        const p = points[0];
        const w = ((p.width ?? baseSize) * sizeMul);
        ctx.beginPath();
        ctx.arc(p.x, p.y, w / 2, 0, Math.PI * 2);
        ctx.fill();
        return;
    }

    const left = new Array(n);
    const right = new Array(n);

    for (let i = 0; i < n; i++) {
        const p = points[i];
        const w = ((p.width ?? baseSize) * sizeMul) / 2;

        let dx, dy;
        if (i === 0) {
            dx = points[1].x - p.x; dy = points[1].y - p.y;
        } else if (i === n - 1) {
            dx = p.x - points[i - 1].x; dy = p.y - points[i - 1].y;
        } else {
            dx = points[i + 1].x - points[i - 1].x; dy = points[i + 1].y - points[i - 1].y;
        }
        const len = Math.hypot(dx, dy);
        if (len < 0.001) {
            left[i] = { x: p.x, y: p.y - w };
            right[i] = { x: p.x, y: p.y + w };
            continue;
        }
        const nx = -dy / len;
        const ny = dx / len;
        left[i] = { x: p.x + nx * w, y: p.y + ny * w };
        right[i] = { x: p.x - nx * w, y: p.y - ny * w };
    }

    // Main body polygon
    ctx.beginPath();
    ctx.moveTo(left[0].x, left[0].y);
    for (let i = 1; i < n; i++) ctx.lineTo(left[i].x, left[i].y);
    for (let i = n - 1; i >= 0; i--) ctx.lineTo(right[i].x, right[i].y);
    ctx.closePath();
    ctx.fill();

    // Round caps
    const first = points[0], last = points[n - 1];
    const fw = ((first.width ?? baseSize) * sizeMul) / 2;
    const lw = ((last.width ?? baseSize) * sizeMul) / 2;
    ctx.beginPath();
    ctx.arc(first.x, first.y, fw, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(last.x, last.y, lw, 0, Math.PI * 2);
    ctx.fill();
}

// ═══════════════════════════════════════════════════════════════
// BRUSH SEGMENT (dùng cho LIVE drawing — giữ nhanh)
// ═══════════════════════════════════════════════════════════════
export function drawBrushSegment(ctx, p1, p2, stroke) {
    const w1 = (p1.width !== undefined && p1.width > 0) ? p1.width : stroke.size;
    const w2 = (p2.width !== undefined && p2.width > 0) ? p2.width : stroke.size;

    if (stroke.brush === 'soft') {
        _drawSegVW(ctx, p1, p2, w1 * 1.8, w2 * 1.8, { ...stroke, opacity: (stroke.opacity ?? 1) * 0.22 });
        _drawSegVW(ctx, p1, p2, w1 * 0.9, w2 * 0.9, { ...stroke, opacity: (stroke.opacity ?? 1) * 0.78 });
        return;
    }
    _drawSegVW(ctx, p1, p2, w1, w2, stroke);
}

function _drawSegVW(ctx, p1, p2, w1, w2, stroke) {
    _setupCtx(ctx, stroke);
    ctx.lineWidth = (w1 + w2) / 2;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    if (Math.abs(w1 - w2) > 0.4) {
        ctx.beginPath(); ctx.arc(p1.x, p1.y, w1 / 2, 0, Math.PI * 2); ctx.fill();
        ctx.beginPath(); ctx.arc(p2.x, p2.y, w2 / 2, 0, Math.PI * 2); ctx.fill();
    }
    _resetCtx(ctx);
}

// ═══════════════════════════════════════════════════════════════
// DOT
// ═══════════════════════════════════════════════════════════════
export function drawBrushDot(ctx, pt, stroke) {
    const w = (pt.width !== undefined && pt.width > 0) ? pt.width : stroke.size;
    if (stroke.brush === 'soft') {
        _drawDotW(ctx, pt, w * 1.8, { ...stroke, opacity: (stroke.opacity ?? 1) * 0.22 });
        _drawDotW(ctx, pt, w * 0.9, { ...stroke, opacity: (stroke.opacity ?? 1) * 0.78 });
        return;
    }
    _drawDotW(ctx, pt, w, stroke);
}
function _drawDotW(ctx, pt, w, stroke) {
    _setupCtx(ctx, stroke);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, w / 2, 0, Math.PI * 2);
    ctx.fill();
    _resetCtx(ctx);
}

// ═══════════════════════════════════════════════════════════════
// ⭐ SMOOTH PATH — dùng POLYGON FILL (AA thật sự)
// ═══════════════════════════════════════════════════════════════
export function drawSmoothPath(ctx, points, stroke) {
    if (!points || points.length === 0) return;
    if (points.length === 1) { drawBrushDot(ctx, points[0], stroke); return; }

    const opacity = stroke.opacity ?? 1;
    const isEraser = stroke.type === 'eraser';

    // ⭐ Soft brush: 2 lớp polygon (giữ hiệu ứng mềm)
    if (stroke.brush === 'soft') {
        const bbox = _getStrokeBBox(points, stroke.size, 2);
        const temp = document.createElement('canvas');
        temp.width = Math.max(1, bbox.w);
        temp.height = Math.max(1, bbox.h);
        const tctx = temp.getContext('2d');
        tctx.translate(-bbox.x, -bbox.y);

        // Lớp ngoài
        tctx.save();
        tctx.globalAlpha = 0.22;
        tctx.fillStyle = isEraser ? '#000' : stroke.color;
        _drawPolygonStroke(tctx, points, stroke.size, 1.8);
        tctx.restore();

        // Lớp trong
        tctx.save();
        tctx.globalAlpha = 0.78;
        tctx.fillStyle = isEraser ? '#000' : stroke.color;
        _drawPolygonStroke(tctx, points, stroke.size, 0.9);
        tctx.restore();

        ctx.save();
        ctx.globalAlpha = opacity;
        if (isEraser) ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(temp, bbox.x, bbox.y);
        ctx.restore();
        return;
    }

    // ⭐ Brush thường — dùng polygon + temp canvas để hỗ trợ opacity < 1
    if (opacity < 0.99 || isEraser) {
        const bbox = _getStrokeBBox(points, stroke.size, 1);
        const temp = document.createElement('canvas');
        temp.width = Math.max(1, bbox.w);
        temp.height = Math.max(1, bbox.h);
        const tctx = temp.getContext('2d');
        tctx.translate(-bbox.x, -bbox.y);

        tctx.save();
        tctx.globalAlpha = 1;
        tctx.fillStyle = isEraser ? '#000' : stroke.color;
        _drawPolygonStroke(tctx, points, stroke.size, 1.0);
        tctx.restore();

        ctx.save();
        ctx.globalAlpha = opacity;
        if (isEraser) ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(temp, bbox.x, bbox.y);
        ctx.restore();
    } else {
        ctx.save();
        ctx.globalAlpha = 1;
        ctx.fillStyle = stroke.color;
        ctx.globalCompositeOperation = 'source-over';
        _drawPolygonStroke(ctx, points, stroke.size, 1.0);
        ctx.restore();
    }
}

// ═══════════════════════════════════════════════════════════════
// SHAPE (native stroke, đã có AA)
// ═══════════════════════════════════════════════════════════════
export function drawShape(ctx, shape) {
    // ⭐ Setup cục bộ, KHÔNG dùng _setupCtx (vốn set lineJoin/lineCap round)
    const isEraser = shape.type === 'eraser';
    ctx.globalCompositeOperation = isEraser ? 'destination-out' : 'source-over';
    ctx.globalAlpha = shape.opacity ?? 1;
    ctx.fillStyle = ctx.strokeStyle = isEraser ? '#000' : shape.color;
    ctx.lineWidth = shape.size;

    // ⭐ Dùng 'butt' + 'miter' cho rect (cạnh sắc nét), 'round' cho line (đầu mềm)
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
            ctx.globalAlpha = (shape.opacity ?? 1) * 0.6;
            ctx.fillRect(x, y, w, h);
            ctx.globalAlpha = shape.opacity ?? 1;
        }
        ctx.strokeRect(x, y, w, h);
    } else if (shape.shape === 'ellipse') {
        const cx = (x1 + x2) / 2, cy = (y1 + y2) / 2;
        const rx = Math.abs(x2 - x1) / 2, ry = Math.abs(y2 - y1) / 2;
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        if (shape.fill) {
            ctx.globalAlpha = (shape.opacity ?? 1) * 0.6;
            ctx.fill();
            ctx.globalAlpha = shape.opacity ?? 1;
        }
        ctx.stroke();
    }

    // Reset
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
}

// ═══════════════════════════════════════════════════════════════
// QUADRATIC BEZIER (cho curve tool)
// ═══════════════════════════════════════════════════════════════
export function drawQuadBezier(ctx, x1, y1, cx, cy, x2, y2, stroke) {
    _setupCtx(ctx, stroke);
    ctx.lineWidth = stroke.size;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.quadraticCurveTo(cx, cy, x2, y2);
    ctx.stroke();
    _resetCtx(ctx);
}

// ═══════════════════════════════════════════════════════════════
// REPLAY (undo/redo)
// ═══════════════════════════════════════════════════════════════
export function replayStrokes(ctx, strokes, w, h) {
    ctx.clearRect(0, 0, w, h);
    for (const s of strokes) {
        if (s.type === 'brush' || s.type === 'eraser') {
            if (s.points.length === 1) drawBrushDot(ctx, s.points[0], s);
            else drawSmoothPath(ctx, s.points, s);
        } else if (s.type === 'shape') {
            drawShape(ctx, s);
        } else if (s.type === 'curve') {
            drawQuadBezier(ctx, s.x1, s.y1, s.cx, s.cy, s.x2, s.y2, {
                type: 'brush', color: s.color, size: s.size, opacity: s.opacity ?? 1,
            });
        }
    }
}

// ═══════════════════════════════════════════════════════════════
// GRID
// ═══════════════════════════════════════════════════════════════
export function drawGrid(ctx, w, h, type) {
    if (type === 'none') return;
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    if (type === 'thirds') {
        for (let i = 1; i < 3; i++) {
            ctx.beginPath(); ctx.moveTo(w * i / 3, 0); ctx.lineTo(w * i / 3, h); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(0, h * i / 3); ctx.lineTo(w, h * i / 3); ctx.stroke();
        }
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
        ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(w, h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(0, h); ctx.stroke();
    } else if (type === 'grid') {
        const step = 50;
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.15)';
        for (let x = step; x < w; x += step) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, h); ctx.stroke(); }
        for (let y = step; y < h; y += step) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke(); }
    }
    ctx.restore();
}

// ═══════════════════════════════════════════════════════════════
// FLOOD FILL
// ═══════════════════════════════════════════════════════════════
export function floodFill(ctx, x, y, color, w, h) {
    x = Math.floor(x); y = Math.floor(y);
    if (x < 0 || x >= w || y < 0 || y >= h) return false;
    const imgData = ctx.getImageData(0, 0, w, h);
    const data = imgData.data;
    const pi0 = (y * w + x) * 4;
    const targetColor = [data[pi0], data[pi0 + 1], data[pi0 + 2], data[pi0 + 3]];
    const fillColor = parseColor(color);
    if (colorsMatch(targetColor, fillColor, 5)) return false;
    const stack = [[x, y]];
    const visited = new Uint8Array(w * h);
    let minX = w, maxX = 0, minY = h, maxY = 0;
    while (stack.length > 0) {
        const [cx, cy] = stack.pop();
        if (cx < 0 || cx >= w || cy < 0 || cy >= h) continue;
        const idx = cy * w + cx;
        if (visited[idx]) continue;
        visited[idx] = 1;
        const pi = idx * 4;
        const cur = [data[pi], data[pi + 1], data[pi + 2], data[pi + 3]];
        if (!colorsMatch(cur, targetColor, 15)) continue;
        data[pi] = fillColor[0]; data[pi + 1] = fillColor[1]; data[pi + 2] = fillColor[2]; data[pi + 3] = 255;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
        stack.push([cx + 1, cy]); stack.push([cx - 1, cy]); stack.push([cx, cy + 1]); stack.push([cx, cy - 1]);
    }
    ctx.putImageData(imgData, 0, 0);
    // ⭐ Trả về vùng vừa fill để caller có thể AA nếu muốn
    if (maxX > minX && maxY > minY) {
        return { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
    }
    return true;
}

// ═══════════════════════════════════════════════════════════════
// EYEDROPPER
// ═══════════════════════════════════════════════════════════════
export function pickColor(ctx, x, y) {
    const px = ctx.getImageData(Math.floor(x), Math.floor(y), 1, 1).data;
    return `#${px[0].toString(16).padStart(2, '0')}${px[1].toString(16).padStart(2, '0')}${px[2].toString(16).padStart(2, '0')}`;
}

// ═══════════════════════════════════════════════════════════════
// SYMMETRY
// ═══════════════════════════════════════════════════════════════
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
        points: stroke.points.map(p => {
            const np = { ...p };
            if (axis === 'x') np.x = 2 * value - p.x;
            if (axis === 'y') np.y = 2 * value - p.y;
            return np;
        }),
    };
}

function parseColor(hex) {
    const h = hex.replace('#', '');
    return [parseInt(h.substring(0, 2), 16), parseInt(h.substring(2, 4), 16), parseInt(h.substring(4, 6), 16)];
}
function colorsMatch(a, b, tol = 10) {
    return Math.abs(a[0] - b[0]) < tol && Math.abs(a[1] - b[1]) < tol
        && Math.abs(a[2] - b[2]) < tol && Math.abs(a[3] - b[3]) < tol;
}