// ═══════════════════════════════════════════════════════════════
// paint-ui.js — v11 (Multi-Agent Level 4 - SVG Render & UX Fix)
// ═══════════════════════════════════════════════════════════════
import { BRUSH_TYPES, SHAPE_TYPES } from './paint-engine.js?v=10';
import { generateMoreTips, askAboutPainting } from './paint-reactions.js?v=5';

export const PALETTE = [
    '#0f172a', '#64748b', '#f8fafc', '#ef4444', '#f97316', '#f59e0b',
    '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#fde2ca', '#e8b48a', '#a87555', '#78350f',
];
export const SIZE_PRESETS = [4, 8, 16, 32];
export const SHAPES_UI = [...SHAPE_TYPES, { id: 'curve', label: 'Cong', icon: '⌒' }];
export const PAPER_PRESETS = {
    '4:3': { w: 1400, h: 1050, label: '4:3 (Mặc định)' },
    '1:1': { w: 1000, h: 1000, label: 'Vuông 1:1' },
    'a4-portrait': { w: 800, h: 1131, label: 'A4 Dọc' },
    'a4-landscape': { w: 1131, h: 800, label: 'A4 Ngang' },
    '16:9': { w: 1600, h: 900, label: '16:9' },
};
export const DRAFT_KEY = 'paint_draft_v10';

export function escapeHtml(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
export function clamp(v, a, b) { return v < a ? a : (v > b ? b : v); }

const BLEND_OPTIONS = [
    ['source-over', 'Thường'], ['multiply', 'Nhân (Multiply)'], ['screen', 'Màn hình (Screen)'],
    ['overlay', 'Overlay'], ['darken', 'Tối hơn'], ['lighten', 'Sáng hơn'],
    ['color-dodge', 'Color Dodge'], ['color-burn', 'Color Burn'], ['soft-light', 'Soft Light'], ['hard-light', 'Hard Light'],
];

export function createOverlayHtml(self) {
    const colorBtns = PALETTE.map((hex, i) => `<button data-color="${hex}" title="${hex}" style="width: 22px; height: 22px; border-radius: 4px; border: 2px solid ${i === 3 ? '#38bdf8' : 'transparent'}; background: ${hex}; cursor: pointer; transition: all 0.15s;"></button>`).join('');
    const sizeBtns = SIZE_PRESETS.map(s => `<button data-size="${s}" title="${s}px" style="width: 26px; height: 24px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 10px; font-weight: 700; cursor: pointer;">${s}</button>`).join('');
    const brushBtns = BRUSH_TYPES.map((b, i) => `<button data-brush="${b.id}" title="${b.label}" style="width: 30px; height: 26px; background: ${i === 0 ? 'rgba(56,189,248,0.2)' : 'transparent'}; border: 1px solid ${i === 0 ? '#38bdf8' : '#475569'}; border-radius: 4px; color: ${i === 0 ? '#38bdf8' : '#94a3b8'}; font-size: 13px; cursor: pointer;">${b.icon}</button>`).join('');
    const shapeBtns = SHAPES_UI.map((s, i) => `<button data-shape="${s.id}" title="${s.label}" style="width: 30px; height: 26px; background: ${i === 0 ? 'rgba(56,189,248,0.2)' : 'transparent'}; border: 1px solid ${i === 0 ? '#38bdf8' : '#475569'}; border-radius: 4px; color: ${i === 0 ? '#38bdf8' : '#94a3b8'}; font-size: 13px; cursor: pointer;">${s.icon}</button>`).join('');
    const paperOptions = Object.entries(PAPER_PRESETS).map(([k, v]) =>
        `<option value="${k}" ${k === self.paperKey ? 'selected' : ''}>${v.label}</option>`
    ).join('');
    const blendOptions = BLEND_OPTIONS.map(([v, l]) => `<option value="${v}">${l}</option>`).join('');

    return `
        <style>
            @keyframes paintFadeIn { from { opacity: 0; } to { opacity: 1; } }
            @keyframes slideUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
            #paint-overlay button { font-family: 'Segoe UI', sans-serif; }
            #paint-overlay button:hover { filter: brightness(1.2); }
            .paint-tool-active { background: rgba(56,189,248,0.2) !important; border-color: #38bdf8 !important; color: #38bdf8 !important; }
            #paint-canvas-wrap { cursor: none; touch-action: none; }
            #paint-container { touch-action: none; }
            .chat-bubble { max-width: 85%; padding: 8px 12px; border-radius: 12px; font-size: 13px; line-height: 1.5; word-break: break-word; margin-bottom: 8px; }
            .chat-ai { background: rgba(139, 92, 246, 0.15); border: 1px solid #8b5cf6; color: #e9d5ff; align-self: flex-start; border-bottom-left-radius: 2px; }
            .chat-user { background: rgba(56, 189, 248, 0.15); border: 1px solid #38bdf8; color: #e0f2fe; align-self: flex-end; border-bottom-right-radius: 2px; }
            .gallery-card { background: #1e293b; border: 1px solid #475569; border-radius: 8px; overflow: hidden; cursor: pointer; transition: all 0.2s; }
            .gallery-card:hover { border-color: #38bdf8; transform: translateY(-2px); box-shadow: 0 8px 20px rgba(56,189,248,0.2); }
            .gallery-card.active { border-color: #f59e0b; box-shadow: 0 0 0 2px rgba(245,158,11,0.3); }

            /* LAYER PANEL */
            #paint-layer-panel { width: 220px; background: #0f172a; border-left: 1px solid #334155; display: flex; flex-direction: column; flex-shrink: 0; }
            .layer-item { display: flex; align-items: center; gap: 6px; padding: 6px 8px; border-bottom: 1px solid #1e293b; cursor: pointer; transition: background 0.15s; }
            .layer-item:hover { background: #1e293b; }
            .layer-item.active { background: #1e3a8a; border-left: 3px solid #38bdf8; }
            .layer-thumb { width: 40px; height: 40px; background: #fff; border: 1px solid #475569; border-radius: 2px; flex-shrink: 0; }
            .layer-info { flex: 1; min-width: 0; }
            .layer-name { color: #cbd5e1; font-size: 11px; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
            .layer-controls { display: flex; gap: 4px; margin-top: 2px; }
            .layer-btn { background: transparent; border: none; color: #64748b; cursor: pointer; font-size: 11px; padding: 0 2px; }
            .layer-btn:hover { color: #38bdf8; }
        </style>

        <!-- HEADER -->
        <div style="display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 6px; padding: 8px 16px; background: rgba(15,23,42,0.98); border-bottom: 1px solid #334155; flex-shrink: 0;">
            <div style="display: flex; align-items: center; gap: 10px; flex-wrap: wrap;">
                <button id="paint-exit" style="background: transparent; border: 1px solid #475569; color: #cbd5e1; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">← Thoát</button>
                <button id="paint-gallery-open" style="background: rgba(245,158,11,0.15); border: 1px solid #f59e0b; color: #fbbf24; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">🖼️ Thư viện</button>
                <button id="paint-sketch-open" title="Ảnh chụp / ảnh tải về → sketch → thành 1 layer (hoặc Ctrl+V dán ảnh)" style="background: rgba(236,72,153,0.15); border: 1px solid #ec4899; color: #f472b6; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 700;">📷 Ảnh → Sketch</button>
                <button id="paint-export" style="background: rgba(16,185,129,0.15); border: 1px solid #10b981; color: #34d399; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">📤 Xuất ảnh</button>
                <span style="color: #38bdf8; font-size: 15px; font-weight: 700;">🎨 Vẽ tranh</span>
                <span id="paint-status" style="color: #64748b; font-size: 11px;">—</span>
            </div>
            <div style="display: flex; align-items: center; gap: 8px;">
                <button id="paint-save-palette" style="background: rgba(56,189,248,0.1); border: 1px solid #38bdf8; color: #38bdf8; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">🎨 Lưu bảng màu</button>
                <button id="paint-save-draft" style="background: rgba(16,185,129,0.15); border: 1px solid #10b981; color: #34d399; padding: 5px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;">💾 Lưu vào thư viện</button>
                <button id="paint-done" style="background: linear-gradient(135deg, #8b5cf6, #ec4899); border: none; color: #fff; padding: 5px 16px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 700;">✨ Hoàn thiện</button>
            </div>
        </div>

        <!-- TOOLBAR TOP -->
        <div style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(30,41,59,0.7); border-bottom: 1px solid #334155; flex-wrap: wrap; flex-shrink: 0;">
            <div style="display: flex; gap: 3px; background: #1e293b; padding: 3px; border-radius: 6px;">
                <button data-tool="brush" class="paint-tool-active" title="Bút (B)" style="width: 32px; height: 28px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: #94a3b8; font-size: 15px; cursor: pointer;">🖌</button>
                <button data-tool="eraser" title="Tẩy (E)" style="width: 32px; height: 28px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: #94a3b8; font-size: 15px; cursor: pointer;">🧽</button>
                <button data-tool="fill" title="Tô màu (G)" style="width: 32px; height: 28px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: #94a3b8; font-size: 15px; cursor: pointer;">🪣</button>
                <button data-tool="eyedropper" title="Hút màu (I)" style="width: 32px; height: 28px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: #94a3b8; font-size: 15px; cursor: pointer;">💧</button>
                <button data-tool="shape" title="Hình khối" style="width: 32px; height: 28px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: #94a3b8; font-size: 15px; cursor: pointer;">▭</button>
                <button data-tool="select" title="Chọn / Crop (S)" style="width: 32px; height: 28px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: #94a3b8; font-size: 15px; cursor: pointer;">▢</button>
                <button data-tool="pan" title="Di chuyển canvas" style="width: 32px; height: 28px; background: transparent; border: 1px solid transparent; border-radius: 4px; color: #94a3b8; font-size: 15px; cursor: pointer;">✋</button>
            </div>
            <div style="width: 1px; height: 22px; background: #334155;"></div>
            <div style="display: flex; gap: 3px; align-items: center;">
                <input type="color" id="paint-color-input" value="#ef4444" style="width: 26px; height: 26px; border: 1px solid #475569; border-radius: 4px; background: transparent; cursor: pointer; padding: 0;" />
                ${colorBtns}
            </div>
            <div style="width: 1px; height: 22px; background: #334155;"></div>
            <div style="display: flex; gap: 3px; align-items: center;">
                <span style="color: #64748b; font-size: 10px;">📏</span>
                ${sizeBtns}
                <input type="range" id="paint-size-slider" min="1" max="300" value="8" style="width: 80px; accent-color: #38bdf8;" />
                <span id="paint-size-val" style="color: #38bdf8; font-size: 11px; font-weight: 700; min-width: 32px; text-align: right;">8</span>
            </div>
        </div>

        <!-- TOOLBAR BOTTOM -->
        <div style="display: flex; align-items: center; gap: 8px; padding: 6px 12px; background: rgba(30,41,59,0.5); border-bottom: 1px solid #334155; flex-wrap: wrap; flex-shrink: 0;">
            <div id="paint-brush-group" style="display: flex; gap: 3px; align-items: center;">
                <span style="color: #64748b; font-size: 10px;">🖌</span>${brushBtns}
            </div>
            <div id="paint-shape-group" style="display: none; gap: 3px; align-items: center;">
                <span style="color: #64748b; font-size: 10px;">▭</span>${shapeBtns}
            </div>
            <div id="paint-select-group" style="display: none; gap: 6px; align-items: center;">
                <button id="paint-sel-crop" style="padding: 4px 10px; background: rgba(16,185,129,0.15); border: 1px solid #10b981; color: #34d399; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">✂️ Crop</button>
                <button id="paint-sel-auto" style="padding: 4px 10px; background: rgba(56,189,248,0.15); border: 1px solid #38bdf8; color: #38bdf8; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">🎯 Auto</button>
                <button id="paint-sel-delete" style="padding: 4px 10px; background: rgba(239,68,68,0.15); border: 1px solid #ef4444; color: #f87171; border-radius: 4px; font-size: 11px; font-weight: 700; cursor: pointer;">🗑 Xóa</button>
                <span style="color: #64748b; font-size: 10px;">Space/Enter: bỏ chọn</span>
            </div>
            <div id="paint-fill-group" style="display: none; gap: 8px; align-items: center;">
                <label style="color: #94a3b8; font-size: 11px; display: flex; gap: 4px; align-items: center; cursor: pointer;">
                    <input type="checkbox" id="paint-fill-all" checked style="accent-color: #38bdf8;"> Tham chiếu mọi layer
                </label>
                <span style="color: #64748b; font-size: 10px;">Dung sai</span>
                <input type="range" id="paint-fill-tol" min="0" max="120" value="36" style="width: 70px; accent-color: #38bdf8;" />
                <span id="paint-fill-tol-val" style="color: #38bdf8; font-size: 11px; font-weight: 700; min-width: 22px;">36</span>
            </div>
            <div style="width: 1px; height: 22px; background: #334155;"></div>
            <div style="display: flex; gap: 3px; align-items: center;">
                <span style="color: #64748b; font-size: 10px;">🖋️ Vẽ</span>
                <button id="paint-mode-normal" style="padding: 4px 10px; background: rgba(56,189,248,0.2); border: 1px solid #38bdf8; border-radius: 4px; color: #38bdf8; font-size: 11px; font-weight: 700; cursor: pointer;">Thường</button>
                <button id="paint-mode-taper" style="padding: 4px 10px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 11px; font-weight: 700; cursor: pointer;">Tì ngòi</button>
                <button id="paint-pen-pressure" title="Nét to/nhỏ theo lực nhấn bút (tablet, iPad, Surface...)" style="padding: 4px 10px; background: rgba(245,158,11,0.2); border: 1px solid #f59e0b; border-radius: 4px; color: #fbbf24; font-size: 11px; font-weight: 700; cursor: pointer;">🖊 Áp lực: Bật</button>
            </div>
            <div id="paint-taper-controls" style="display: none; gap: 8px; align-items: center; padding-left: 8px; border-left: 1px solid #334155;">
                <div style="display: flex; gap: 3px; align-items: center;">
                    <span style="color: #64748b; font-size: 10px;">💪 Tì</span>
                    <input type="range" id="paint-pressure-slider" min="1" max="5" step="1" value="3" style="width: 50px; accent-color: #a78bfa;" />
                    <span id="paint-pressure-val" style="color: #a78bfa; font-size: 11px; font-weight: 700; min-width: 10px;">3</span>
                </div>
                <div style="display: flex; gap: 3px; align-items: center;">
                    <span style="color: #64748b; font-size: 10px;">📐 Đuôi</span>
                    <input type="range" id="paint-taperlen-slider" min="1" max="5" step="1" value="3" style="width: 50px; accent-color: #a78bfa;" />
                    <span id="paint-taperlen-val" style="color: #a78bfa; font-size: 11px; font-weight: 700; min-width: 10px;">3</span>
                </div>
            </div>
            <div style="width: 1px; height: 22px; background: #334155;"></div>
            <div style="display: flex; gap: 3px; align-items: center;">
                <span style="color: #64748b; font-size: 10px;">✨ Mượt</span>
                <input type="range" id="paint-stab-slider" min="0" max="5" step="1" value="2" style="width: 60px; accent-color: #38bdf8;" />
                <span id="paint-stab-val" style="color: #38bdf8; font-size: 11px; font-weight: 700;">2</span>
            </div>
            <label style="display: flex; gap: 4px; align-items: center; color: #94a3b8; font-size: 11px; cursor: pointer; margin-left: 4px;">
                <input type="checkbox" id="paint-antialias" checked style="accent-color: #38bdf8;"> Khử răng cưa
            </label>
            <div style="width: 1px; height: 22px; background: #334155;"></div>
            <div style="display: flex; gap: 3px; align-items: center;">
                <span style="color: #64748b; font-size: 10px;">◐</span>
                <input type="range" id="paint-opacity-slider" min="10" max="100" value="100" style="width: 70px; accent-color: #38bdf8;" />
                <span id="paint-opacity-val" style="color: #38bdf8; font-size: 11px; font-weight: 700; min-width: 32px; text-align: right;">100</span>
            </div>
            <div style="width: 1px; height: 22px; background: #334155;"></div>
            <div style="display: flex; gap: 3px; align-items: center;">
                <span style="color: #64748b; font-size: 10px;">📄</span>
                <select id="paint-paper-select" style="background: #1e293b; color: #cbd5e1; border: 1px solid #475569; border-radius: 4px; padding: 4px 6px; font-size: 11px; cursor: pointer; outline: none;">
                    ${paperOptions}
                </select>
            </div>
            <div style="width: 1px; height: 22px; background: #334155;"></div>
            <div style="display: flex; gap: 3px;">
                <button id="paint-undo" title="Undo (Ctrl+Z)" style="width: 28px; height: 24px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 13px; cursor: pointer;">↶</button>
                <button id="paint-redo" title="Redo (Ctrl+Y)" style="width: 28px; height: 24px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 13px; cursor: pointer;">↷</button>
                <button id="paint-clear" title="Xoá hết" style="width: 28px; height: 24px; background: transparent; border: 1px solid #ef4444; border-radius: 4px; color: #ef4444; font-size: 13px; cursor: pointer;">🗑</button>
            </div>
            <div style="flex: 1;"></div>
            <div style="display: flex; gap: 3px; align-items: center;">
                <button id="paint-rotate" title="Xoay 90 độ (R)" style="width: 30px; height: 24px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 13px; cursor: pointer;">↻</button>
                <button id="paint-zoom-out" title="Thu nhỏ (-)" style="width: 26px; height: 24px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 13px; cursor: pointer;">−</button>
                <span id="paint-zoom-val" style="color: #38bdf8; font-size: 11px; font-weight: 700; min-width: 42px; text-align: center;">100%</span>
                <button id="paint-zoom-in" title="Phóng to (+)" style="width: 26px; height: 24px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 13px; cursor: pointer;">+</button>
                <button id="paint-zoom-reset" title="Fit (0)" style="width: 32px; height: 24px; background: transparent; border: 1px solid #475569; border-radius: 4px; color: #94a3b8; font-size: 10px; cursor: pointer;">Fit</button>
            </div>
        </div>

        <!-- MAIN AREA (Canvas + Layer Panel) -->
        <div style="flex: 1; display: flex; overflow: hidden;">
            <div id="paint-canvas-wrap" style="flex: 1; position: relative; overflow: hidden; background: #1e293b;">
                <div id="paint-container" style="position: absolute; top: 50%; left: 50%; transform-origin: center center; will-change: transform;">
                    <canvas id="paint-canvas" style="background: #ffffff; display: block; box-shadow: 0 8px 32px rgba(0,0,0,0.5);"></canvas>
                    <canvas id="paint-overlay-canvas" style="position: absolute; top: 0; left: 0; pointer-events: none;"></canvas>
                    <canvas id="paint-grid" style="position: absolute; top: 0; left: 0; pointer-events: none;"></canvas>
                </div>
                <div id="paint-brush-cursor" style="
                    position: fixed; top: 0; left: 0; pointer-events: none; border-radius: 50%;
                    z-index: 1000000; display: none; box-sizing: border-box; will-change: transform;
                    border: 2px solid #38bdf8; background: rgba(255, 255, 255, 0.15);
                    box-shadow: 0 0 0 1px rgba(0, 0, 0, 0.6), inset 0 0 0 1px rgba(255, 255, 255, 0.4), 0 0 8px rgba(56, 189, 248, 0.5);
                "></div>
            </div>

            <!-- LAYER PANEL -->
            <div id="paint-layer-panel">
                <div style="padding: 8px; border-bottom: 1px solid #334155; display: flex; justify-content: space-between; align-items: center;">
                    <span style="color: #cbd5e1; font-size: 12px; font-weight: 700;">Layers</span>
                    <button id="paint-layer-add" title="Thêm layer (Ctrl+Shift+N)" style="background: transparent; border: 1px solid #38bdf8; color: #38bdf8; border-radius: 4px; width: 20px; height: 20px; cursor: pointer; font-size: 14px; line-height: 1;">+</button>
                </div>
                <div style="padding: 8px; border-bottom: 1px solid #334155;">
                    <div style="display: flex; justify-content: space-between; font-size: 10px; color: #94a3b8;">
                        <span>Độ mờ layer</span><span id="paint-layer-opacity-val" style="color: #38bdf8; font-weight: 700;">100</span>
                    </div>
                    <input type="range" id="paint-layer-opacity" min="0" max="100" value="100" style="width: 100%; accent-color: #38bdf8;" />
                    <select id="paint-layer-blend" style="width: 100%; margin-top: 4px; background: #1e293b; color: #cbd5e1; border: 1px solid #475569; border-radius: 4px; padding: 3px; font-size: 11px;">${blendOptions}</select>
                </div>
                <div id="paint-layer-list" style="flex: 1; overflow-y: auto;">
                    <!-- Render động -->
                </div>
                <div style="padding: 8px; border-top: 1px solid #334155; display: flex; gap: 4px;">
                    <button id="paint-layer-up" title="Đưa layer lên" style="flex: 1; background: transparent; border: 1px solid #475569; color: #94a3b8; border-radius: 4px; padding: 4px; cursor: pointer; font-size: 11px;">⬆</button>
                    <button id="paint-layer-down" title="Đưa layer xuống" style="flex: 1; background: transparent; border: 1px solid #475569; color: #94a3b8; border-radius: 4px; padding: 4px; cursor: pointer; font-size: 11px;">⬇</button>
                    <button id="paint-layer-dup" title="Nhân bản" style="flex: 1; background: transparent; border: 1px solid #475569; color: #94a3b8; border-radius: 4px; padding: 4px; cursor: pointer; font-size: 11px;">📋</button>
                    <button id="paint-layer-del" title="Xóa" style="flex: 1; background: transparent; border: 1px solid #ef4444; color: #ef4444; border-radius: 4px; padding: 4px; cursor: pointer; font-size: 11px;">🗑</button>
                </div>
            </div>
        </div>

        <!-- FOOTER -->
        <div style="padding: 6px 16px; background: rgba(15,23,42,0.9); border-top: 1px solid #334155; text-align: center; flex-shrink: 0;">
            <span style="color: #64748b; font-size: 10px;">
                <b style="color:#cbd5e1;">B</b> bút · <b style="color:#cbd5e1;">E</b> tẩy · <b style="color:#cbd5e1;">G</b> tô · <b style="color:#cbd5e1;">I</b> hút màu · <b style="color:#cbd5e1;">S</b> chọn · <b style="color:#cbd5e1;">Ctrl+Shift+N</b> thêm Layer · <b style="color:#cbd5e1;">Ctrl+V</b> dán ảnh → Sketch
            </span>
        </div>
    `;
}

export const feedbackMixin = {
    _showFeedbackPanel(result) {
        const old = document.getElementById('paint-feedback-panel');
        if (old) old.remove();
        const mode = this.getMode();
        const borderColor = mode === 'gentle' ? '#f472b6' : (mode === 'savage' ? '#ef4444' : '#8b5cf6');
        const iconEmoji = mode === 'gentle' ? '🌸' : (mode === 'savage' ? '🤬' : '💬');
        const panel = document.createElement('div');
        panel.id = 'paint-feedback-panel';
        panel.style.cssText = `position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%); background: rgba(15, 23, 42, 0.98); border: 2px solid ${borderColor}; border-radius: 12px; max-width: 600px; width: 92%; box-shadow: 0 12px 40px rgba(0,0,0,0.8); z-index: 1000010; font-family: 'Segoe UI', sans-serif; color: #e2e8f0; display: flex; flex-direction: column; max-height: 70vh; animation: slideUp 0.25s ease;`;
        panel.innerHTML = `
            <div style="display: flex; align-items: center; justify-content: space-between; padding: 10px 16px; border-bottom: 1px solid #334155;">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <span style="font-size: 18px;">${iconEmoji}</span>
                    <span style="font-size: 13px; font-weight: 700; color: ${borderColor};">REIKA ĐANG XEM TRANH</span>
                </div>
                <button id="paint-panel-close" style="background: transparent; border: none; color: #94a3b8; font-size: 16px; cursor: pointer;">✕</button>
            </div>
            <div id="paint-chat-log" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 4px;">
                <div class="chat-bubble chat-ai">${escapeHtml(result.text || '').replace(/\n/g, '<br>')}</div>
            </div>
            <div id="paint-feedback-tips" style="display: none; padding: 0 16px 12px; border-bottom: 1px solid #334155;"></div>
            <div style="padding: 10px 16px; border-bottom: 1px solid #334155; display: flex; gap: 8px;">
                <input type="text" id="paint-chat-input" placeholder="Hỏi thêm về bức tranh..." style="flex: 1; background: #0f172a; border: 1px solid #475569; border-radius: 6px; padding: 8px 12px; color: #fff; outline: none; font-size: 13px;">
                <button id="paint-chat-send" style="background: ${borderColor}; border: none; color: #fff; padding: 8px 16px; border-radius: 6px; cursor: pointer; font-weight: 700; font-size: 13px;">Gửi</button>
            </div>
            <div style="padding: 10px 16px; display: flex; gap: 8px; flex-wrap: wrap; background: rgba(30,41,59,0.5); border-bottom-left-radius: 10px; border-bottom-right-radius: 10px;">
                <button id="paint-tips-btn" style="flex: 1; background: rgba(139,92,246,0.15); border: 1px solid #8b5cf6; color: #a78bfa; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">📚 Tips thêm</button>
                <button id="paint-redraw-btn" style="flex: 1; background: rgba(16,185,129,0.15); border: 1px solid #10b981; color: #34d399; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">🔄 Vẽ tiếp</button>
                <button id="paint-close-btn" style="flex: 1; background: rgba(100,116,139,0.15); border: 1px solid #64748b; color: #cbd5e1; padding: 8px 12px; border-radius: 6px; cursor: pointer; font-weight: 600; font-size: 12px;">✅ Xong</button>
            </div>
        `;
        document.body.appendChild(panel);
        const chatLog = panel.querySelector('#paint-chat-log');
        const chatInput = panel.querySelector('#paint-chat-input');
        const chatSend = panel.querySelector('#paint-chat-send');
        const tipsBtn = panel.querySelector('#paint-tips-btn');
        const redrawBtn = panel.querySelector('#paint-redraw-btn');
        const closeBtn = panel.querySelector('#paint-close-btn');
        const tipsContainer = panel.querySelector('#paint-feedback-tips');
        const panelClose = panel.querySelector('#paint-panel-close');
        const scrollToBottom = () => { chatLog.scrollTop = chatLog.scrollHeight; };

        const sendChat = async () => {
            const text = chatInput.value.trim();
            if (!text) return;

            // ⭐ Check xem user có đang yêu cầu vẽ không
            const isDrawingRequest = /\b(vẽ|vé|draw|mẫu|thử|hướng dẫn|sửa)\b/i.test(text);

            const uDiv = document.createElement('div');
            uDiv.className = 'chat-bubble chat-user';
            uDiv.textContent = text;
            chatLog.appendChild(uDiv);
            chatInput.value = '';
            scrollToBottom();

            const lDiv = document.createElement('div');
            lDiv.className = 'chat-bubble chat-ai';
            lDiv.innerHTML = '<i>Đang suy nghĩ (DeepSeek đánh giá + Gemini vẽ)...</i>';
            chatLog.appendChild(lDiv);
            scrollToBottom();

            try {
                const snapshotBase64 = this._exportForAI();
                const canvasEmpty = !this._hasContent();
                const res = await askAboutPainting(snapshotBase64, text, mode, { canvasEmpty });

                let displayText = res.text;
                if (!displayText || displayText.trim() === '') {
                    displayText = 'Mình chưa hiểu ý bạn, bạn nói rõ hơn được không?';
                }

                lDiv.innerHTML = escapeHtml(displayText).replace(/\n/g, '<br>');

                if (res.svg) {
                    await this.drawSvgGuideline(res.svg);
                    lDiv.innerHTML += '<br><span style="font-size:11px; color:#38bdf8;">✨ Đã vẽ khung hướng dẫn trên layer mới.</span>';
                } else if (isDrawingRequest) {
                    lDiv.innerHTML += '<br><span style="font-size:11px; color:#f59e0b;">⚠️ AI không sinh được nét vẽ SVG (có thể do model quá tải hoặc prompt).</span>';
                }
            } catch (err) {
                console.error('[Paint Chat] error:', err);
                lDiv.innerHTML = '<span style="color:#ef4444;">Lỗi khi xử lý. Xem Console (F12).</span>';
            }
            scrollToBottom();
        };

        chatSend.onclick = sendChat;
        chatInput.onkeydown = (e) => { if (e.key === 'Enter') sendChat(); };

        tipsBtn.onclick = async () => {
            tipsBtn.disabled = true; tipsBtn.textContent = '⏳...';
            try {
                const tips = await generateMoreTips(result.subject || 'khác', mode);
                if (tips && tips.trim()) {
                    tipsContainer.style.display = 'block';
                    tipsContainer.innerHTML = `<div style="color: ${borderColor}; font-size: 11px; font-weight: 700; margin-bottom: 8px;">📚 HƯỚNG DẪN THÊM</div><div style="line-height: 1.6; font-size: 13px; color: #cbd5e1;">${escapeHtml(tips).replace(/\n/g, '<br>')}</div>`;
                    tipsBtn.style.display = 'none';
                } else {
                    tipsContainer.style.display = 'block';
                    tipsContainer.innerHTML = `<div style="color: #94a3b8; font-size: 12px;">Không lấy được tips.</div>`;
                }
            } catch (e) { }
            finally { tipsBtn.disabled = false; tipsBtn.textContent = '📚 Tips thêm'; }
        };

        redrawBtn.onclick = () => { panel.remove(); this._setStatus('Vẽ tiếp đi nha! 💪'); this._dirty = true; };

        const doClose = () => {
            panel.remove();
            // Bỏ this._clearDraft() và this.close() để không tắt Paint
        };
        closeBtn.onclick = doClose;
        panelClose.onclick = doClose;

        setTimeout(scrollToBottom, 50);
    },
};